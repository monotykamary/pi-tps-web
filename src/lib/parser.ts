import type { ParsedEvent, TpsEvent, TpsPayload, EnergyEvent, ModelChangeEvent, BranchSummaryEvent, RewindEvent, EnergyPayload, TimelineEvent } from '../types';

export { computeSafeEffectiveMs, computeEffectiveTps } from './compute/tps';

/**
 * Parse a legacy TPS message string into a TpsPayload.
 *
 * Legacy format A (pre-TTFT):  "TPS 25.3 tok/s. out 1,234, in 56,789, cache r/w 12,345/6,789, total 70,000, 12.3s"
 * Legacy format B (with TTFT): "TPS 25.3 tok/s · TTFT 3.2s · 12.0s · out 1,234 · in 56,789"
 * Also handles duration variants: whole seconds ("3s"), decimal ("3.2s"), multi-unit ("1m 30s").
 *
 * Returns null if the message cannot be parsed.
 */
function parseLegacyMessage(message: string): TpsPayload | null {
  // Extract TPS
  const tpsMatch = message.match(/TPS\s+([\d.]+)\s+tok\/s/);
  if (!tpsMatch) return null;
  const tps = parseFloat(tpsMatch[1]);

  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let total = 0;
  let ttftMs = 0;
  let totalMs = 0;

  // Parse duration string like "3.2s", "3s", "1m 30s", "2h 15m"
  const parseDurationMs = (s: string): number => {
    let ms = 0;
    const hourMatch = s.match(/(\d+)h/);
    const minMatch = s.match(/(\d+)m(?![s])/); // m not followed by s
    const secMatch = s.match(/([\d.]+)s/);
    if (hourMatch) ms += parseFloat(hourMatch[1]) * 3600000;
    if (minMatch) ms += parseFloat(minMatch[1]) * 60000;
    if (secMatch) ms += parseFloat(secMatch[1]) * 1000;
    return ms;
  };

  // Parse a locale-formatted number like "1,234" or "1.234" or "1234"
  const parseLocaleNumber = (s: string): number => {
    // Remove digit-grouping separators (commas or dots between digits)
    // but preserve decimal point (last dot/comma if surrounded by digits on right)
    const stripped = s.replace(/[.,](?=\d{3})/g, '');
    return parseFloat(stripped) || 0;
  };

  // Detect format by separator style
  if (message.includes('·')) {
    // Format B: "TPS 25.3 tok/s · TTFT 3.2s · 12.0s · out 1,234 · in 56,789"
    const parts = message.split('·').map((p) => p.trim());
    for (const part of parts) {
      const ttftMatch = part.match(/^TTFT\s+(.+)$/);
      if (ttftMatch) {
        ttftMs = parseDurationMs(ttftMatch[1]);
        continue;
      }
      const outMatch = part.match(/^out\s+([\d,.]+)$/);
      if (outMatch) {
        output = parseLocaleNumber(outMatch[1]);
        continue;
      }
      const inMatch = part.match(/^in\s+([\d,.]+)$/);
      if (inMatch) {
        input = parseLocaleNumber(inMatch[1]);
        continue;
      }
      // Duration-only part (not TTFT, not tokens): total wall-clock time
      const durMatch = part.match(/^[\d.]+[hms]/);
      if (durMatch && !part.startsWith('TPS') && !part.startsWith('TTFT')) {
        totalMs = parseDurationMs(part);
      }
    }
  } else if (message.includes('.')) {
    // Format A: "TPS 25.3 tok/s. out 1,234, in 56,789, cache r/w 12,345/6,789, total 70,000, 12.3s"
    const outMatch = message.match(/out\s+([\d,.]+)/);
    if (outMatch) output = parseLocaleNumber(outMatch[1]);
    const inMatch = message.match(/in\s+([\d,.]+)/);
    if (inMatch) input = parseLocaleNumber(inMatch[1]);
    const cacheMatch = message.match(/cache\s+r\/w\s+([\d,.]+)\/([\d,.]+)/);
    if (cacheMatch) {
      cacheRead = parseLocaleNumber(cacheMatch[1]);
      cacheWrite = parseLocaleNumber(cacheMatch[2]);
    }
    const totalMatch = message.match(/total\s+([\d,.]+)/);
    if (totalMatch) total = parseLocaleNumber(totalMatch[1]);
    // Duration is the last number before the end (e.g. "12.3s")
    const durMatch = message.match(/([\d.]+s)\s*$/);
    if (durMatch) totalMs = parseDurationMs(durMatch[1]);
  }

  if (total === 0) total = input + output + cacheRead + cacheWrite;
  // In legacy format, generationMs equals totalMs minus TTFT (stall detection didn't exist)
  const generationMs = totalMs - ttftMs > 0 ? totalMs - ttftMs : totalMs;

  return {
    model: { provider: 'unknown', modelId: 'unknown' },
    tokens: { input, output, cacheRead, cacheWrite, total },
    timing: {
      ttftMs,
      totalMs,
      generationMs,
      stallMs: 0,
      stallCount: 0,
      messageCount: 1,
    },
    tps,
    cost: null,
    timestamp: 0,
  };
}

interface AssistantMsg {
  sessionId: string;
  id: string | null;
  parentId: string | null;
  entryTimestamp: string;
  provider: string;
  modelId: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number } | null;
  messageTimestamp: number;
  prevEntryTimestamp: string | null;
}

// ─── Ingest types ─────────────────────────────────────────────────────────────
// ingestJsonl produces these structures. The raw events are fully typed but
// have NOT been enriched or synthesized yet - that happens in deriveEvents.
// This separation means the ingest output can be loaded directly into DuckDB
// while the graph-based derivation (parentId chain walking, synthesis) stays
// in JS until DuckDB can handle those patterns.

export interface IngestResult {
  /** All parsed events from the JSONL, discriminated by type */
  events: ParsedEvent[];
  /** Assistant messages collected during ingestion, used by deriveEvents for
   *  legacy enrichment and synthesis */
  assistantMessages: AssistantMsg[];
  /** Whether any custom/tps events were found (controls synthesis) */
  hasTpsEntries: boolean;
  /** Whether any legacy-format TPS events were found (controls enrichment) */
  hasLegacyTpsEntries: boolean;
  /** Map of namespaced entry ID (sessionId:rawId) → timestamp, for deriving timing */
  timestampById: Map<string, string>;
  /** Counter for generating unique synthetic IDs */
  synthCounter: number;
  /** Session ID assigned to this ingestion */
  sessionId: string;
}

/**
 * Generate a session ID from JSONL content. Uses the first non-empty JSON
 * line's id field if available, otherwise hashes the first 1KB of content.
 */
function deriveSessionId(raw: string): string {
  const lines = raw.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.id) return String(obj.id).split(':')[0];
    } catch { /* skip */ }
    break;
  }
  // Fallback: hash of first 1KB
  const slice = raw.trim().substring(0, 1024);
  let hash = 0;
  for (let i = 0; i < slice.length; i++) {
    hash = ((hash << 5) - hash + slice.charCodeAt(i)) | 0;
  }
  return `session-${Math.abs(hash).toString(36)}`;
}

const MAX_MESSAGE_LEN = 10000;

/**
 * Extract human-readable text from a pi message object.
 * Handles string content, array of content parts, and nested thinking blocks.
 * Truncates at 10KB to avoid INSERT bloat.
 */
function extractMessageText(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';
  const m = msg as Record<string, unknown>;

  const raw = m.content;
  if (typeof raw === 'string') return raw.substring(0, MAX_MESSAGE_LEN);
  if (!Array.isArray(raw)) return '';

  const parts: string[] = [];
  for (const part of raw) {
    if (!part || typeof part !== 'object') continue;
    const p = part as Record<string, unknown>;
    if (p.type === 'text' && typeof p.text === 'string') {
      parts.push(p.text);
    } else if (p.type === 'thinking' && typeof p.thinking === 'string') {
      parts.push(p.thinking);
    } else if (p.type === 'toolCall') {
      const name = typeof p.name === 'string' ? p.name : 'unknown';
      const args = JSON.stringify(p.arguments ?? {});
      parts.push(`\n[tool:${name} ${args}]\n`);
    } else if (p.type === 'toolResult') {
      parts.push('\n[toolResult]\n');
    }
  }

  const joined = parts.join('\n');
  return joined.substring(0, MAX_MESSAGE_LEN);
}

/**
 * Ingest JSONL lines into typed events and bookkeeping structures.
 *
 * This is the first stage of the pipeline: it handles line-by-line parsing,
 * event discrimination, and legacy message parsing. It does NOT perform
 * graph operations - no parentId chain walking, no enrichment, no synthesis.
 * Those happen in deriveEvents().
 *
 * The returned IngestResult is self-contained: it carries everything needed
 * for the derivation stage, and the events array is suitable for loading
 * directly into DuckDB as-is.
 *
 * @param raw JSONL string to parse
 * @param sessionId Optional session identifier. Auto-derived from content if not provided.
 */
export function ingestJsonl(raw: string, sessionId?: string): IngestResult {
  const sid = sessionId ?? deriveSessionId(raw);
  const lines = raw.trim().split('\n');
  const events: ParsedEvent[] = [];
  const assistantMessages: AssistantMsg[] = [];
  let hasTpsEntries = false;
  let hasLegacyTpsEntries = false;
  let synthCounter = 0;
  let prevEntryTimestamp: string | null = null;
  const timestampById = new Map<string, string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rawEvent = JSON.parse(line);

      // Track timestamps for timing derivation (namespaced keys)
      if (rawEvent.id && rawEvent.timestamp) {
        timestampById.set(`${sid}:${rawEvent.id}`, rawEvent.timestamp);
      }

      if (rawEvent.type === 'custom' && rawEvent.customType === 'tps') {
        hasTpsEntries = true;
        const data = rawEvent.data;
        // Legacy format: { message: string, timestamp: number } - parse the message string
        if (data && typeof data.message === 'string' && !data.model) {
          hasLegacyTpsEntries = true;
          const parsed = parseLegacyMessage(data.message);
          if (parsed) {
            parsed.timestamp = data.timestamp ?? 0;
            events.push({
              sessionId: sid,
              id: rawEvent.id,
              parentId: rawEvent.parentId,
              timestamp: rawEvent.timestamp,
              type: 'tps',
              data: parsed,
            });
          }
          prevEntryTimestamp = rawEvent.timestamp ?? prevEntryTimestamp;
          continue;
        }
        // Structured format: TurnTelemetry
        // Normalize: cost may be absent (undefined) - coerce to null
        // Normalize: tps may be null (e.g. generation timing unavailable) - coerce to 0
        // Normalize: rateUsdPerMTokens may be absent on older sessions - coerce to null
        const tpsData = rawEvent.data;
        if (tpsData.cost === undefined) tpsData.cost = null;
        if (tpsData.tps === null || tpsData.tps === undefined) tpsData.tps = 0;
        if (tpsData.rateUsdPerMTokens === undefined) tpsData.rateUsdPerMTokens = null;
        events.push({
          sessionId: sid,
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'tps',
          data: tpsData,
        });
      } else if (rawEvent.type === 'custom' && rawEvent.customType === 'neuralwatt-energy') {
        events.push({
          sessionId: sid,
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'energy',
          data: rawEvent.data,
        });
      } else if (rawEvent.type === 'custom' && rawEvent.customType === 'rewind-turn') {
        events.push({
          sessionId: sid,
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'rewind',
          data: rawEvent.data,
        });
      } else if (rawEvent.type === 'model_change') {
        events.push({
          sessionId: sid,
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'model_change',
          provider: rawEvent.provider,
          modelId: rawEvent.modelId,
        });
      } else if (rawEvent.type === 'branch_summary') {
        events.push({
          sessionId: sid,
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'branch_summary',
          fromId: rawEvent.fromId,
          summary: rawEvent.summary,
        });
      } else if (rawEvent.type === 'session') {
        // Older session entries embed the initial model; extract as model_change
        if (rawEvent.provider && rawEvent.modelId) {
          events.push({
            sessionId: sid,
            id: rawEvent.id ? `session-model-${rawEvent.id}` : `session-model-${synthCounter++}`,
            parentId: null,
            timestamp: rawEvent.timestamp,
            type: 'model_change',
            provider: rawEvent.provider,
            modelId: rawEvent.modelId,
          });
        }
      } else if (rawEvent.type === 'message') {
        // Collect assistant messages for synthesis and/or enrichment
        const msg = rawEvent.message;
        if (
          msg && msg.role === 'assistant' && msg.usage &&
          typeof msg.usage.output === 'number' && msg.usage.output > 0
        ) {
          const u = msg.usage;
          const total = u.totalTokens || (u.input || 0) + u.output + (u.cacheRead || 0) + (u.cacheWrite || 0);
          assistantMessages.push({
            sessionId: sid,
            id: rawEvent.id ?? null,
            parentId: rawEvent.parentId ?? null,
            entryTimestamp: rawEvent.timestamp,
            provider: msg.provider || 'unknown',
            modelId: msg.model || 'unknown',
            usage: {
              input: u.input || 0,
              output: u.output,
              cacheRead: u.cacheRead || 0,
              cacheWrite: u.cacheWrite || 0,
              total,
            },
            cost: u.cost || null,
            messageTimestamp: msg.timestamp || 0,
            prevEntryTimestamp,
          });
        }
        // Also capture message content for SQL querying
        if (msg && typeof msg === 'object') {
          events.push({
            sessionId: sid,
            id: rawEvent.id,
            parentId: rawEvent.parentId,
            timestamp: rawEvent.timestamp,
            type: 'message',
            data: {
              role: msg.role || 'unknown',
              content: extractMessageText(msg),
              model: msg.model || null,
            },
          });
        }
      }

      if (rawEvent.timestamp) {
        prevEntryTimestamp = rawEvent.timestamp;
      }
    } catch {
      // skip malformed lines
    }
  }

  return { events, assistantMessages, hasTpsEntries, hasLegacyTpsEntries, timestampById, synthCounter, sessionId: sid };
}

/**
 * Derive enriched/synthetic events from the ingest output.
 *
 * This is the second stage of the pipeline. It performs the two graph
 * operations that cannot be expressed as simple SQL filters:
 *
 *  1. Legacy enrichment: walk the parentId chain to fill in model + cost
 *     on legacy TPS entries parsed from display strings.
 *  2. Synthesis: when no custom/tps entries exist, synthesize TpsEvents
 *     from assistant messages using timestamp-gap-derived timing.
 *
 * This function does NOT mutate the input IngestResult. Enrichment creates
 * new TpsPayload objects with filled-in fields; synthesis appends to a new
 * array. The original result.events is safe to reuse (e.g. for DuckDB loading).
 */
export function deriveEvents(result: IngestResult): ParsedEvent[] {
  const { events, assistantMessages, hasTpsEntries, hasLegacyTpsEntries, timestampById, synthCounter: baseSynthCounter } = result;
  let synthCounter = baseSynthCounter;
  const derived: ParsedEvent[] = [];

  // Build namespaced lookup maps from assistant messages
  const assistantByNsId = new Map<string, AssistantMsg>();
  const assistantByOutput = new Map<number, AssistantMsg[]>();
  for (const m of assistantMessages) {
    if (m.id) assistantByNsId.set(`${m.sessionId}:${m.id}`, m);
    const list = assistantByOutput.get(m.usage.output) ?? [];
    list.push(m);
    assistantByOutput.set(m.usage.output, list);
  }

  // Namespaced ID lookup for walking parentId chains across events
  const eventByNsId = new Map<string, ParsedEvent>();
  for (const e of events) {
    eventByNsId.set(`${e.sessionId}:${e.id}`, e);
  }

  // Walk up to 5 hops along the namespaced parentId chain looking for an assistant message
  const findAssistant = (sId: string, parentId: string | null, output: number): AssistantMsg | null => {
    let current: string | null = parentId;
    for (let hop = 0; hop < 5 && current; hop++) {
      const ns = `${sId}:${current}`;
      const m = assistantByNsId.get(ns);
      if (m) return m;
      const parentEntry = eventByNsId.get(ns);
      current = parentEntry?.parentId ?? null;
    }
    // Fallback: match by output token count + chronological proximity
    const candidates = assistantByOutput.get(output);
    if (candidates && candidates.length > 0) return candidates[0];
    return null;
  };

  // ── Process events: enrich legacy, pass through others ────────────────────
  for (const event of events) {
    if (event.type === 'tps' && hasLegacyTpsEntries) {
      const data = event.data as TpsPayload;
      if (data.model.modelId === 'unknown') {
        const assistant = findAssistant(event.sessionId, event.parentId, data.tokens.output);
        if (assistant) {
          // Clone with enriched model + cost - no mutation of original
          derived.push({
            ...event,
            data: {
              ...data,
              model: { provider: assistant.provider, modelId: assistant.modelId },
              cost: data.cost === null && assistant.cost ? assistant.cost : data.cost,
            },
          });
          continue;
        }
      }
    }
    derived.push(event);
  }

  // ── Synthesize TpsEvent entries when no custom/tps entries exist ─────────
  if (!hasTpsEntries) {
    for (const msg of assistantMessages) {
      let totalMs = 0;
      if (msg.parentId) {
        const parentTs = timestampById.get(`${msg.sessionId}:${msg.parentId}`);
        if (parentTs && msg.entryTimestamp) {
          totalMs = Math.max(0, new Date(msg.entryTimestamp).getTime() - new Date(parentTs).getTime());
        }
      }
      if (totalMs === 0 && msg.prevEntryTimestamp && msg.entryTimestamp) {
        totalMs = Math.max(0, new Date(msg.entryTimestamp).getTime() - new Date(msg.prevEntryTimestamp).getTime());
      }

      const tps = totalMs > 0
        ? Math.round((msg.usage.output / (totalMs / 1000)) * 10) / 10
        : 0;

      derived.push({
        sessionId: msg.sessionId,
        id: msg.id ? `synth-${msg.id}` : `synth-${synthCounter++}`,
        parentId: msg.parentId,
        timestamp: msg.entryTimestamp,
        type: 'tps',
        data: {
          model: { provider: msg.provider, modelId: msg.modelId },
          tokens: msg.usage,
          timing: {
            ttftMs: 0,
            totalMs,
            generationMs: totalMs,
            stallMs: 0,
            stallCount: 0,
            messageCount: 1,
          },
          tps,
          cost: msg.cost,
          timestamp: msg.messageTimestamp,
        },
      });
    }
  }

  return derived;
}

/**
 * Parse JSONL into fully enriched ParsedEvents.
 *
 * This is the convenience wrapper that combines ingest + derive in one call.
 * It preserves the original parseJsonl API - all existing callers continue
 * to work unchanged.
 *
 * For the two-stage pipeline (e.g. loading into DuckDB between stages),
 * use ingestJsonl() and deriveEvents() directly.
 */
export function parseJsonl(raw: string): ParsedEvent[] {
  return deriveEvents(ingestJsonl(raw));
}

export function getTpsEvents(events: ParsedEvent[]): TpsEvent[] {
  return events.filter((e): e is TpsEvent => e.type === 'tps');
}

export function getEnergyEvents(events: ParsedEvent[]): EnergyEvent[] {
  return events.filter((e): e is EnergyEvent => e.type === 'energy');
}

export function getModelChangeEvents(events: ParsedEvent[]): ModelChangeEvent[] {
  return events.filter((e): e is ModelChangeEvent => e.type === 'model_change');
}

export function getBranchSummaryEvents(events: ParsedEvent[]): BranchSummaryEvent[] {
  return events.filter((e): e is BranchSummaryEvent => e.type === 'branch_summary');
}

export function getRewindEvents(events: ParsedEvent[]): RewindEvent[] {
  return events.filter((e): e is RewindEvent => e.type === 'rewind');
}

export function pairEnergyWithTps(tpsEvents: TpsEvent[], energyEvents: EnergyEvent[]): (TpsEvent & { energy?: EnergyPayload })[] {
  // Entry order depends on extension load order: when pi-tps' turn_end runs
  // first the chain is tps → energy (energy.parentId === tps.id); when the
  // provider runs first it's energy → tps (tps.parentId === energy.id) —
  // observed on real sessions, e.g. with queued flex models. Match both
  // directions; each energy event pairs with at most one tps entry so a
  // corrected-duplicate tps entry can't double-count it.
  const byParentId = new Map<string, EnergyEvent[]>();
  const byId = new Map<string, EnergyEvent>();
  for (const e of energyEvents) {
    if (e.id) byId.set(`${e.sessionId}:${e.id}`, e);
    if (e.parentId != null) {
      const key = `${e.sessionId}:${e.parentId}`;
      byParentId.set(key, [...(byParentId.get(key) ?? []), e]);
    }
  }
  const consumed = new Set<string>();
  return tpsEvents.map(t => {
    let match: EnergyEvent | undefined;
    if (t.id) {
      const list = byParentId.get(`${t.sessionId}:${t.id}`);
      while (list?.length) {
        const cand = list.shift()!;
        if (!consumed.has(cand.id)) { match = cand; break; }
      }
    }
    if (!match && t.parentId) {
      const cand = byId.get(`${t.sessionId}:${t.parentId}`);
      if (cand && !consumed.has(cand.id)) match = cand;
    }
    if (match?.id) consumed.add(match.id);
    return { ...t, energy: match?.data };
  });
}

/**
 * Build a merged timeline of all events sorted by timestamp.
 * TPS events carry their paired energy data; structural events
 * (model_change, rewind, branch_summary) appear as markers.
 */
export function buildTimeline(
  events: ParsedEvent[],
  tpsEnergyPairs: (TpsEvent & { energy?: EnergyPayload })[]
): TimelineEvent[] {
  const pairedByNsId = new Map(tpsEnergyPairs.map(e => [`${e.sessionId}:${e.id}`, e]));
  const timeline: TimelineEvent[] = [];

  for (const event of events) {
    if (event.type === 'tps') {
      const paired = pairedByNsId.get(`${event.sessionId}:${event.id}`);
      if (paired) timeline.push(paired);
    } else if (event.type === 'model_change' || event.type === 'rewind' || event.type === 'branch_summary') {
      timeline.push(event);
    }
    // energy events are already paired into TPS events - skip
  }

  return timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// Re-export format utilities from extracted module
export { formatDuration, formatNumber, formatCurrency, formatTps, formatEnergy, formatEnergyParts, formatUsdPerM } from './format/format';
export { formatThreshold } from './format/format';
export { exportMultiSessionCsv } from './format/csv';
