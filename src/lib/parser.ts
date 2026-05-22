import type { ParsedEvent, TpsEvent, TpsPayload, EnergyEvent, ModelChangeEvent, BranchSummaryEvent, RewindEvent, ConversationSummary, SessionSummary, MultiSessionSummary, TimingBucket, EnergyPayload, DataThresholds, TimelineEvent } from '../types';

// ─── Shared TPS computation ───────────────────────────────────────────────────

/** Minimum effective span for a reliable generation speed estimate */
const MIN_GENERATION_MS = 50;

/**
 * Divide stallMs by this factor when stalls dominate the generation window.
 * Prevents a single undetected stall from inflating the denominator and
 * creating absurd TPS values.
 */
const STALL_REDUCTION_DENOM = 2;

/** If effective time is below this, the denominator looks suspicious */
const ACTIVE_TIME_THRESHOLD_MS = 200;

/** Stall-to-generation ratio above which partial reduction kicks in */
const STALL_DOMINANCE_RATIO = 0.85;

/**
 * Compute generation TPS for a single TPS event, mirroring the
 * extension's buildTelemetry three-branch logic.
 *
 * Generation TPS = output / (active generation time), excluding both
 * TTFT and known stalls. This measures the raw inference speed —
 * how fast the model was actually producing tokens.
 *
 * Three guard conditions on the primary branch prevent inflation:
 *  1. stallMs < streamMs: prevents stall-before-stream
 *  2. effectiveStreamMs >= 50ms: active span must be measurable
 *  3. stallMs < effectiveStreamMs: stalls must not exceed active time
 *     (prevents buffer-flush bursts from being counted as generation)
 *
 * Primary:   all 3 guards pass → output / ((streamMs - stallMs) / 1000)
 * Fallback:  generationMs >= 50ms → output / (effectiveGenMs / 1000)
 *            where effectiveGenMs = max(generationMs - stallMs, 50ms).
 *            Includes TTFT, underestimates, but never overshoots.
 * Else:      0 — structurally unidentifiable.
 */
/**
 * Compute a trustworthy per-event effective generation denominator (ms).
 *
 * Primary branch (stream-based): returns streamMs - stallMs when guards pass.
 * Fallback branch (generationMs-based): applies partial stall reduction when
 * stalls dominate the effective window, preventing a tiny denominator.
 */
function computeSafeEffectiveMs(data: TpsPayload): number {
  const streamMs = data.timing.streamMs ?? 0;
  const stallMs = data.timing.stallMs;

  // ── Primary branch (stream-based, no TTFT) ──
  const effectiveStreamMs = streamMs - stallMs;
  if (streamMs > 0 && stallMs < streamMs && effectiveStreamMs >= MIN_GENERATION_MS && stallMs < effectiveStreamMs) {
    return effectiveStreamMs;
  }

  // ── Fallback branch (generationMs–based, includes TTFT) ──
  if (data.timing.generationMs >= MIN_GENERATION_MS) {
    const effectiveGenMs = data.timing.generationMs - stallMs;
    const stallsDominate = effectiveGenMs < ACTIVE_TIME_THRESHOLD_MS || stallMs > data.timing.generationMs * STALL_DOMINANCE_RATIO;
    if (stallsDominate) {
      const partialStall = stallMs / STALL_REDUCTION_DENOM;
      return Math.max(data.timing.generationMs - partialStall, MIN_GENERATION_MS);
    }
    return Math.max(effectiveGenMs, MIN_GENERATION_MS);
  }

  return 0;
}

/** Compute per-event generation TPS using the safe effective denominator. */
export function computeEffectiveTps(data: TpsPayload): number {
  const denom = computeSafeEffectiveMs(data);
  return denom > 0 ? data.tokens.output / (denom / 1000) : 0;
}

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
// have NOT been enriched or synthesized yet — that happens in deriveEvents.
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

/**
 * Ingest JSONL lines into typed events and bookkeeping structures.
 *
 * This is the first stage of the pipeline: it handles line-by-line parsing,
 * event discrimination, and legacy message parsing. It does NOT perform
 * graph operations — no parentId chain walking, no enrichment, no synthesis.
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
        // Legacy format: { message: string, timestamp: number } — parse the message string
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
        // Normalize: cost may be absent (undefined) — coerce to null
        // Normalize: tps may be null (e.g. generation timing unavailable) — coerce to 0
        const tpsData = rawEvent.data;
        if (tpsData.cost === undefined) tpsData.cost = null;
        if (tpsData.tps === null || tpsData.tps === undefined) tpsData.tps = 0;
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
  const { events, assistantMessages, hasTpsEntries, hasLegacyTpsEntries, timestampById, synthCounter: baseSynthCounter, sessionId } = result;
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
          // Clone with enriched model + cost — no mutation of original
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
 * It preserves the original parseJsonl API — all existing callers continue
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
  const energyByNsParentId = new Map<string, EnergyPayload>();
  for (const e of energyEvents) {
    energyByNsParentId.set(`${e.sessionId}:${e.parentId ?? ''}`, e.data);
  }
  return tpsEvents.map(t => ({
    ...t,
    energy: energyByNsParentId.get(`${t.sessionId}:${t.id}`),
  }));
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
    // energy events are already paired into TPS events — skip
  }

  return timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function computeSummary(tpsEvents: TpsEvent[], energyEvents: EnergyEvent[], modelChanges: ModelChangeEvent[] = [], rewindEvents: RewindEvent[] = []): ConversationSummary {
  const sorted = [...tpsEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const last = sorted[sorted.length - 1];

  const totalInput = sorted.reduce((s, e) => s + e.data.tokens.input, 0);
  const totalOutput = sorted.reduce((s, e) => s + e.data.tokens.output, 0);
  const totalCacheRead = sorted.reduce((s, e) => s + e.data.tokens.cacheRead, 0);
  const totalCacheWrite = sorted.reduce((s, e) => s + e.data.tokens.cacheWrite, 0);
  const wallClockMs = sorted.length
    ? new Date(last.timestamp).getTime() - new Date(sorted[0].timestamp).getTime()
    : 0;
  const totalTimeMs = sorted.reduce((s, e) => s + e.data.timing.totalMs, 0);
  const totalGenerationMs = sorted.reduce((s, e) => s + e.data.timing.generationMs, 0);
  const totalStallMs = sorted.reduce((s, e) => s + e.data.timing.stallMs, 0);
  const totalStallCount = sorted.reduce((s, e) => s + e.data.timing.stallCount, 0);
  // Weighted TPS: total output / total safe effective generation time.
  // Uses computeSafeEffectiveMs so outliers with dominating stalls cannot
  // inflate the aggregate rate via a tiny per-event denominator.
  const totalEffectiveMs = sorted.reduce((s, e) => s + computeSafeEffectiveMs(e.data), 0);
  // Simple average TPS: arithmetic mean of per-request effective TPS values
  const effectiveTps = (e: typeof sorted[number]) => computeEffectiveTps(e.data);
  const avgTps = sorted.length > 0 ? sorted.reduce((s, e) => s + effectiveTps(e), 0) / sorted.length : 0;
  // Weighted TPS
  const weightedTps = totalEffectiveMs > 0 ? totalOutput / (totalEffectiveMs / 1000) : 0;
  // Wall TPS for each event: output / totalMs (includes TTFT and stalls)
  const computeWallTps = (e: typeof sorted[number]) =>
    e.data.timing.totalMs > 0 ? e.data.tokens.output / (e.data.timing.totalMs / 1000) : 0;
  // Simple average wall TPS
  const avgWallTps = sorted.length > 0 ? sorted.reduce((s, e) => s + computeWallTps(e), 0) / sorted.length : 0;
  // Weighted wall TPS: total output / total wall time
  const weightedWallTps = totalTimeMs > 0 ? totalOutput / (totalTimeMs / 1000) : 0;
  // TPS loss metrics
  const tpsLoss = avgTps > 0 ? ((avgTps - avgWallTps) / avgTps) * 100 : 0;
  const weightedTpsLoss = weightedTps > 0 ? ((weightedTps - weightedWallTps) / weightedTps) * 100 : 0;

  const ttfts = sorted.map(e => e.data.timing.ttftMs).sort((a, b) => a - b);
  const avgTtft = ttfts.length > 0 ? ttfts.reduce((a, b) => a + b, 0) / ttfts.length : 0;

  // TTFT percentiles
  const percentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const idx = Math.min(Math.floor(arr.length * p), arr.length - 1);
    return arr[idx];
  };
  const ttftP50 = percentile(ttfts, 0.50);
  const ttftP75 = percentile(ttfts, 0.75);
  const ttftP90 = percentile(ttfts, 0.90);
  const ttftP99 = percentile(ttfts, 0.99);

  // Total cost sums ALL sources, but dedupes per-event: when a TPS event has both
  // a token cost AND a paired neuralwatt energy cost, only the energy cost is used
  // (they measure the same spend — neuralwatt is the authoritative source when present).
  const energyByNsParentId = new Map<string, EnergyPayload>();
  for (const e of energyEvents) {
    energyByNsParentId.set(`${e.sessionId}:${e.parentId ?? ''}`, e.data);
  }
  const tpsNsIds = new Set(sorted.map(e => `${e.sessionId}:${e.id}`));
  let totalCostUsd = 0;
  let energyCostUsd = 0;
  let hasAnyCost = false;
  let hasEnergyCost = false;
  let usedNeuralwatt = false;
  let usedTpsCost = false;

  // Per-TPS-event: prefer paired energy cost, fall back to token cost
  for (const tps of sorted) {
    const pairedEnergy = energyByNsParentId.get(`${tps.sessionId}:${tps.id}`);
    if (pairedEnergy) {
      totalCostUsd += pairedEnergy.cost_usd;
      energyCostUsd += pairedEnergy.cost_usd;
      usedNeuralwatt = true;
      hasAnyCost = true;
      hasEnergyCost = true;
    } else if (tps.data.cost) {
      totalCostUsd += tps.data.cost.total;
      usedTpsCost = true;
      hasAnyCost = true;
    }
  }

  // Orphan energy events (not paired with any TPS event)
  for (const e of energyEvents) {
    if (!tpsNsIds.has(`${e.sessionId}:${e.parentId ?? ''}`)) {
      totalCostUsd += e.data.cost_usd;
      energyCostUsd += e.data.cost_usd;
      usedNeuralwatt = true;
      hasAnyCost = true;
      hasEnergyCost = true;
    }
  }

  const totalCostUsdResult = hasAnyCost ? totalCostUsd : null;
  const energyCostUsdResult = hasEnergyCost ? energyCostUsd : null;
  const costSource: 'neuralwatt' | 'tps' | 'both' | null =
    usedNeuralwatt && usedTpsCost ? 'both' :
    usedNeuralwatt ? 'neuralwatt' :
    usedTpsCost ? 'tps' :
    null;
  const totalEnergyJoules = energyEvents.length > 0
    ? energyEvents.reduce((s, e) => s + e.data.energy_joules, 0)
    : null;

  // Build a map from TPS id → joules so we can attribute energy per model
  const joulesByNsParentId = new Map<string, number>();
  for (const e of energyEvents) {
    joulesByNsParentId.set(`${e.sessionId}:${e.parentId ?? ''}`, e.data.energy_joules);
  }

  // Collect per-model aggregates (calls, tokens, energy cost, blended cost, joules)
  const modelMap = new Map<string, {
    provider: string;
    count: number;
    totalTokens: number;
    energyCost: number;
    energyJoules: number;
    blendedCost: number;
    hasEnergyCost: boolean;
    hasBlendedCost: boolean;
  }>();

  for (const e of sorted) {
    const key = e.data.model.modelId;
    const existing = modelMap.get(key);
    const tokens = e.data.tokens.total;
    const pairedEnergy = energyByNsParentId.get(`${e.sessionId}:${e.id}`);
    const pairedJoules = joulesByNsParentId.get(`${e.sessionId}:${e.id}`) ?? 0;

    if (existing) {
      existing.count++;
      existing.totalTokens += tokens;
      if (pairedEnergy) {
        existing.energyCost += pairedEnergy.cost_usd;
        existing.energyJoules += pairedJoules;
        existing.blendedCost += pairedEnergy.cost_usd;
        existing.hasEnergyCost = true;
        existing.hasBlendedCost = true;
      } else if (e.data.cost) {
        existing.blendedCost += e.data.cost.total;
        existing.hasBlendedCost = true;
      }
    } else {
      const energyCost = pairedEnergy ? pairedEnergy.cost_usd : 0;
      const blendedCost = pairedEnergy ? pairedEnergy.cost_usd : (e.data.cost ? e.data.cost.total : 0);
      modelMap.set(key, {
        provider: e.data.model.provider,
        count: 1,
        totalTokens: tokens,
        energyCost,
        energyJoules: pairedJoules,
        blendedCost,
        hasEnergyCost: !!pairedEnergy,
        hasBlendedCost: !!(pairedEnergy || e.data.cost),
      });
    }
  }

  const models = [...modelMap.entries()]
    .map(([modelId, m]) => ({
      modelId,
      provider: m.provider,
      callCount: m.count,
      totalTokens: m.totalTokens,
      energyCostUsd: m.hasEnergyCost ? m.energyCost : null,
      energyJoules: m.hasEnergyCost ? m.energyJoules : null,
      blendedCostUsd: m.hasBlendedCost ? m.blendedCost : null,
      costSource: m.hasEnergyCost ? 'neuralwatt' as const :
        m.hasBlendedCost ? 'tps' as const : null,
    }))
    .sort((a, b) => (b.blendedCostUsd ?? 0) - (a.blendedCostUsd ?? 0));

  // Also collect orphan energy events as a synthetic model row when their
  // parent model is not in the TPS set (e.g. energy-only measurements).
  for (const e of energyEvents) {
    if (tpsNsIds.has(`${e.sessionId}:${e.parentId ?? ''}`)) continue; // already paired above
    // Orphan energy — we have cost but no model context. Skip for now
    // since we cannot attribute it to a specific model.
  }

  return {
    totalCalls: sorted.length,
    totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    wallClockMs,
    totalTimeMs,
    totalGenerationMs,
    totalStallMs,
    totalStallCount,
    avgTps,
    weightedTps,
    avgWallTps,
    weightedWallTps,
    tpsLoss,
    weightedTpsLoss,
    avgTtft,
    ttftP50,
    ttftP75,
    ttftP90,
    ttftP99,
    totalCostUsd: totalCostUsdResult,
    costSource,
    energyCostUsd: energyCostUsdResult,
    totalEnergyJoules,
    avgTokensPerCall: sorted.length > 0 ? (totalInput + totalOutput + totalCacheRead + totalCacheWrite) / sorted.length : 0,
    stalledCalls: sorted.filter(e => e.data.timing.stallCount > 0 || e.data.timing.stallMs > 0).length,
    cachedCalls: sorted.filter(e => e.data.tokens.cacheRead > 0 || e.data.tokens.cacheWrite > 0).length,
    fastCalls: sorted.filter(e => e.data.timing.ttftMs < 3000).length,
    minTtft: Math.min(...ttfts),
    maxTtft: Math.max(...ttfts),
    model: last?.data.model.modelId ?? 'unknown',
    provider: last?.data.model.provider ?? 'unknown',
    models,
    timeRange: {
      start: sorted[0]?.timestamp ?? '',
      end: last?.timestamp ?? '',
    },
    rewindCount: rewindEvents.length,
    modelChangeCount: modelChanges.length,
  };
}

export function computeSessionSummary(
  tpsEvents: TpsEvent[],
  energyEvents: EnergyEvent[],
  sessionId: string,
  fileName: string | null,
): SessionSummary {
  const summary = computeSummary(tpsEvents, energyEvents);
  return {
    sessionId,
    fileName,
    totalCalls: summary.totalCalls,
    totalTokens: summary.totalTokens,
    totalOutput: summary.totalOutput,
    wallClockMs: summary.wallClockMs,
    avgTps: summary.avgTps,
    weightedTps: summary.weightedTps,
    avgTtft: summary.avgTtft,
    totalCostUsd: summary.totalCostUsd,
    totalEnergyJoules: summary.totalEnergyJoules,
    model: summary.model,
    provider: summary.provider,
    models: summary.models,
    timeRange: summary.timeRange,
    stalledCalls: summary.stalledCalls,
  };
}

/**
 * Compute a cross-session aggregate from per-session event arrays.
 *
 * Takes a "sessions" map of sessionId → { tpsEvents, energyEvents, fileName },
 * computes lightweight per-session summaries, then rolls up across sessions.
 *
 * The per-model breakdown is recomputed across all sessions combined so that
 * models used in multiple sessions are properly aggregated.
 */
export function computeMultiSessionSummary(
  sessionData: Array<{ sessionId: string; tpsEvents: TpsEvent[]; energyEvents: EnergyEvent[]; fileName: string | null }>,
): MultiSessionSummary {
  if (sessionData.length === 0) {
    return {
      sessionCount: 0,
      totalCalls: 0,
      totalTokens: 0,
      totalOutput: 0,
      totalCostUsd: null,
      totalEnergyJoules: null,
      sessions: [],
      models: [],
      avgTps: 0,
      weightedTps: 0,
      avgTtft: 0,
      timeRange: { start: '', end: '' },
    };
  }

  // Per-session summaries
  const perSession = sessionData.map(s =>
    computeSessionSummary(s.tpsEvents, s.energyEvents, s.sessionId, s.fileName)
  );

  // Sort by timeRange.start
  perSession.sort((a, b) =>
    a.timeRange.start.localeCompare(b.timeRange.start)
  );

  // Aggregate across sessions
  let totalCalls = 0;
  let totalTokens = 0;
  let totalOutput = 0;
  let totalWeightedTpsNum = 0;
  let totalWeightedTpsDen = 0;
  let totalAvgTpsSum = 0;
  let totalTtftSum = 0;
  let totalTtftCount = 0;
  let totalCostUsd: number | null = null;
  let totalEnergyJoules: number | null = null;
  let hasCost = false;
  let hasEnergy = false;
  let costAccum = 0;
  let energyAccum = 0;
  let globalStart = '';
  let globalEnd = '';

  // Per-model aggregation across sessions
  const modelMap = new Map<string, {
    provider: string;
    count: number;
    totalTokens: number;
    energyCost: number;
    energyJoules: number;
    blendedCost: number;
    hasEnergyCost: boolean;
    hasBlendedCost: boolean;
  }>();

  // We need all TPS + energy events combined for the model rollup
  const allTps: TpsEvent[] = [];
  const allEnergy: EnergyEvent[] = [];
  for (const s of sessionData) {
    allTps.push(...s.tpsEvents);
    allEnergy.push(...s.energyEvents);
  }

  // Reuse computeSummary's model-aggregation logic by running it on the
  // combined set, then extract just the models array.
  const combinedSummary = computeSummary(allTps, allEnergy);

  for (const s of perSession) {
    totalCalls += s.totalCalls;
    totalTokens += s.totalTokens;
    totalOutput += s.totalOutput;
    totalAvgTpsSum += s.avgTps * s.totalCalls;
    totalWeightedTpsNum += s.weightedTps * s.totalOutput;
    totalWeightedTpsDen += s.totalOutput;
    totalTtftSum += s.avgTtft * s.totalCalls;
    totalTtftCount += s.totalCalls;

    if (s.totalCostUsd !== null) {
      costAccum += s.totalCostUsd;
      hasCost = true;
    }
    if (s.totalEnergyJoules !== null) {
      energyAccum += s.totalEnergyJoules;
      hasEnergy = true;
    }

    if (s.timeRange.start && (!globalStart || s.timeRange.start < globalStart)) {
      globalStart = s.timeRange.start;
    }
    if (s.timeRange.end && (!globalEnd || s.timeRange.end > globalEnd)) {
      globalEnd = s.timeRange.end;
    }
  }

  totalCostUsd = hasCost ? costAccum : null;
  totalEnergyJoules = hasEnergy ? energyAccum : null;

  const avgTps = totalCalls > 0 ? totalAvgTpsSum / totalCalls : 0;
  const weightedTps = totalWeightedTpsDen > 0 ? totalWeightedTpsNum / totalWeightedTpsDen : 0;
  const avgTtft = totalTtftCount > 0 ? totalTtftSum / totalTtftCount : 0;

  return {
    sessionCount: perSession.length,
    totalCalls,
    totalTokens,
    totalOutput,
    totalCostUsd,
    totalEnergyJoules,
    sessions: perSession,
    models: combinedSummary.models,
    avgTps,
    weightedTps,
    avgTtft,
    timeRange: { start: globalStart, end: globalEnd },
  };
}

export function computeTimingBuckets(tpsEvents: TpsEvent[]): TimingBucket[] {
  const sorted = [...tpsEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const bucketSize = Math.max(1, Math.floor(sorted.length / 20));
  const buckets: TimingBucket[] = [];

  for (let i = 0; i < sorted.length; i += bucketSize) {
    const slice = sorted.slice(i, Math.min(i + bucketSize, sorted.length));
    if (slice.length === 0) continue;
    const first = slice[0];
    const last = slice[slice.length - 1];
    const time = new Date(first.timestamp);
    const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;

    const avgTtft = slice.reduce((s, e) => s + e.data.timing.ttftMs, 0) / slice.length;
    const avgTotal = slice.reduce((s, e) => s + e.data.timing.totalMs, 0) / slice.length;
    // Bucket TPS: use capped per-event effective TPS, then average.
    // This keeps the chart consistent with the summary avgTps metric.
    const avgTps = slice.reduce((s, e) => s + computeEffectiveTps(e.data), 0) / slice.length;
    const avgWallTps = slice.reduce((s, e) => s + (e.data.timing.totalMs > 0 ? e.data.tokens.output / (e.data.timing.totalMs / 1000) : 0), 0) / slice.length;
    const avgTpsLoss = avgTps > 0 ? ((avgTps - avgWallTps) / avgTps) * 100 : 0;
    const totalTokens = slice.reduce((s, e) => s + e.data.tokens.total, 0);

    buckets.push({
      range: `${first.timestamp.substring(11, 19)}-${last.timestamp.substring(11, 19)}`,
      label,
      count: slice.length,
      avgTtft: Math.round(avgTtft),
      avgTotal: Math.round(avgTotal),
      avgTps: Math.round(avgTps * 10) / 10,
      avgWallTps: Math.round(avgWallTps * 10) / 10,
      avgTpsLoss: Math.round(avgTpsLoss * 10) / 10,
      totalTokens,
    });
  }

  return buckets;
}

export function deriveDataThresholds(tpsEvents: TpsEvent[]): DataThresholds {
  if (tpsEvents.length === 0) {
    return {
      cacheThreshold: 65000, lowContext: 32000, slowTtft: 15000, fastTtft: 3000, highNewInputRatio: 0.15,
      anomalyInputThreshold: 10000, cacheDropMinTotal: 10000, cacheDropMinInput: 5000,
      highInputRatio: 0.5, highInputSeverityToken: 20000, stallCountThreshold: 3, stallMsSeverity: 5000,
    };
  }

  const totals = tpsEvents.map(e => e.data.tokens.total);
  const ttfts = tpsEvents.map(e => e.data.timing.ttftMs);
  const inputs = tpsEvents.map(e => e.data.tokens.input);
  const minTokens = Math.min(...totals);
  const maxTokens = Math.max(...totals);
  const sortedTtft = [...ttfts].sort((a, b) => a - b);
  const sortedInputs = [...inputs].sort((a, b) => a - b);

  // Percentile-based TTFT boundaries
  const p25 = sortedTtft[Math.floor(sortedTtft.length * 0.25)];
  const p75 = sortedTtft[Math.floor(sortedTtft.length * 0.75)];
  const fastTtft = p25;
  const slowTtft = p75;

  // Token thresholds: evenly divide the observed range
  const range = maxTokens - minTokens;
  const lowContext = Math.round((minTokens + range * 0.33) / 1000) * 1000;
  const cacheThreshold = Math.round((minTokens + range * 0.66) / 1000) * 1000;

  // New-input ratio: use the median cache-read ratio to find outliers
  const cacheRatios = tpsEvents.map(e => e.data.tokens.cacheRead / Math.max(1, e.data.tokens.total)).sort((a, b) => a - b);
  const medianCacheRatio = cacheRatios[Math.floor(cacheRatios.length * 0.5)];
  const highNewInputRatio = Math.max(0.1, 1 - medianCacheRatio + 0.1);

  // Anomaly thresholds derived from input distribution
  const p90Input = sortedInputs[Math.floor(sortedInputs.length * 0.9)];
  const anomalyInputThreshold = Math.max(5000, p90Input);
  const cacheDropMinTotal = Math.round(minTokens + range * 0.1);
  const cacheDropMinInput = Math.round(p90Input * 0.5);
  const highInputRatio = Math.max(0.3, highNewInputRatio);
  const p95Input = sortedInputs[Math.floor(sortedInputs.length * 0.95)];
  const highInputSeverityToken = Math.max(p90Input, p95Input);

  // Stall thresholds from distribution
  const stallCounts = tpsEvents.map(e => e.data.timing.stallCount).filter(c => c > 0);
  const stallCountThreshold = stallCounts.length
    ? Math.max(2, Math.round(stallCounts.reduce((s, c) => s + c, 0) / stallCounts.length))
    : 3;
  const stallMs = tpsEvents.map(e => e.data.timing.stallMs).filter(m => m > 0);
  const stallMsSeverity = stallMs.length
    ? Math.round(stallMs.reduce((s, m) => s + m, 0) / stallMs.length)
    : 5000;

  return {
    cacheThreshold, lowContext, slowTtft, fastTtft, highNewInputRatio,
    anomalyInputThreshold, cacheDropMinTotal, cacheDropMinInput,
    highInputRatio, highInputSeverityToken, stallCountThreshold, stallMsSeverity,
  };
}

export function computeThresholdCrossings(tpsEvents: TpsEvent[]): { threshold: number; events: TpsEvent[] }[] {
  const dt = deriveDataThresholds(tpsEvents);
  const maxTokens = tpsEvents.length ? Math.max(...tpsEvents.map(e => e.data.tokens.total)) : 80000;
  const thresholds = [
    Math.round(dt.lowContext * 0.5 / 1000) * 1000,
    dt.lowContext,
    dt.cacheThreshold,
    Math.round((dt.cacheThreshold + (maxTokens - dt.cacheThreshold) * 0.5) / 1000) * 1000,
  ];
  return thresholds.map(threshold => ({
    threshold,
    events: tpsEvents.filter(e => e.data.tokens.total >= threshold),
  }));
}

export function formatThreshold(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    const rounded = Math.round(ms * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}ms`;
  }
  if (ms < 60000) {
    const s = ms / 1000;
    return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
  }

  const totalSeconds = Math.round(ms / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600) % 24;
  const d = Math.floor(totalSeconds / 86400) % 30;
  const mo = Math.floor(totalSeconds / 2592000) % 12;
  const y = Math.floor(totalSeconds / 31536000);

  if (y > 0) return `${y}y ${mo}mo`;
  if (mo > 0) return `${mo}mo ${d}d`;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function formatNumber(n: number | null, decimals = 1): string {
  if (n === null) return '-';
  if (n < 1_000) return String(Math.round(n));

  let value: number;
  let suffix: string;

  if (n >= 1_000_000_000) {
    value = n / 1_000_000_000;
    suffix = 'B';
  } else if (n >= 1_000_000) {
    value = n / 1_000_000;
    suffix = 'M';
  } else {
    value = n / 1_000;
    suffix = 'K';
  }

  const formatted = value.toFixed(decimals);
  // Drop trailing ".0" for clean display
  if (formatted.endsWith('.0')) {
    return `${value.toFixed(0)}${suffix}`;
  }
  return `${formatted}${suffix}`;
}

export function formatCurrency(n: number | null): string {
  if (n === null) return '-';
  return `$${n.toFixed(4)}`;
}

/** Format TPS: keep 1 decimal for small values, drop it for large ones where it's noise */
export function formatTps(n: number): string {
  if (n >= 1000) return Math.round(n).toString();
  return n.toFixed(1);
}

/**
 * Auto-scale energy from joules up through mWh, Wh, kWh — matching NeuralWatt's
 * footer display: small values stay in J, then scale naturally to the most
 * readable unit at each threshold.
 */
export function formatEnergy(joules: number): string {
  if (joules === 0) return '0 J';
  if (joules < 3.6) {
    return `${joules.toFixed(2)} J`;
  }
  const mWh = joules / 3_600;
  if (mWh < 1000) {
    return `${mWh.toFixed(2)} mWh`;
  }
  const wh = mWh / 1_000;
  if (wh < 1000) {
    return `${wh.toFixed(2)} Wh`;
  }
  const kWh = wh / 1_000;
  return `${kWh.toFixed(2)} kWh`;
}

export function formatEnergyParts(joules: number): { value: string; unit: string } {
  if (joules === 0) return { value: '0', unit: 'J' };
  if (joules < 3.6) {
    return { value: joules.toFixed(2), unit: 'J' };
  }
  const mWh = joules / 3_600;
  if (mWh < 1000) {
    return { value: mWh.toFixed(2), unit: 'mWh' };
  }
  const wh = mWh / 1_000;
  if (wh < 1000) {
    return { value: wh.toFixed(2), unit: 'Wh' };
  }
  const kWh = wh / 1_000;
  return { value: kWh.toFixed(2), unit: 'kWh' };
}
