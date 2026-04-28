import type { ParsedEvent, TpsEvent, TpsPayload, EnergyEvent, ModelChangeEvent, BranchSummaryEvent, RewindEvent, ConversationSummary, TimingBucket, EnergyPayload, DataThresholds, TimelineEvent } from '../types';

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

export function parseJsonl(raw: string): ParsedEvent[] {
  const lines = raw.trim().split('\n');
  const events: ParsedEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rawEvent = JSON.parse(line);
      if (rawEvent.type === 'custom' && rawEvent.customType === 'tps') {
        const data = rawEvent.data;
        // Legacy format: { message: string, timestamp: number } — parse the message string
        if (data && typeof data.message === 'string' && !data.model) {
          const parsed = parseLegacyMessage(data.message);
          if (parsed) {
            parsed.timestamp = data.timestamp ?? 0;
            events.push({
              id: rawEvent.id,
              parentId: rawEvent.parentId,
              timestamp: rawEvent.timestamp,
              type: 'tps',
              data: parsed,
            });
          }
          continue;
        }
        // Structured format: TurnTelemetry
        events.push({
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'tps',
          data: rawEvent.data,
        });
      } else if (rawEvent.type === 'custom' && rawEvent.customType === 'neuralwatt-energy') {
        events.push({
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'energy',
          data: rawEvent.data,
        });
      } else if (rawEvent.type === 'custom' && rawEvent.customType === 'rewind-turn') {
        events.push({
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'rewind',
          data: rawEvent.data,
        });
      } else if (rawEvent.type === 'model_change') {
        events.push({
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'model_change',
          provider: rawEvent.provider,
          modelId: rawEvent.modelId,
        });
      } else if (rawEvent.type === 'branch_summary') {
        events.push({
          id: rawEvent.id,
          parentId: rawEvent.parentId,
          timestamp: rawEvent.timestamp,
          type: 'branch_summary',
          fromId: rawEvent.fromId,
          summary: rawEvent.summary,
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  return events;
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
  const energyById = new Map<string, EnergyPayload>();
  for (const e of energyEvents) {
    energyById.set(e.parentId ?? '', e.data);
  }
  return tpsEvents.map(t => ({
    ...t,
    energy: energyById.get(t.id),
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
  const pairedById = new Map(tpsEnergyPairs.map(e => [e.id, e]));
  const timeline: TimelineEvent[] = [];

  for (const event of events) {
    if (event.type === 'tps') {
      const paired = pairedById.get(event.id);
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
  const totalTimeMs = sorted.reduce((s, e) => s + e.data.timing.totalMs, 0);
  const totalGenerationMs = sorted.reduce((s, e) => s + e.data.timing.generationMs, 0);
  const totalStallMs = sorted.reduce((s, e) => s + e.data.timing.stallMs, 0);
  const totalStallCount = sorted.reduce((s, e) => s + e.data.timing.stallCount, 0);
  const avgTps = totalGenerationMs > 0 ? totalOutput / (totalGenerationMs / 1000) : 0;
  const ttfts = sorted.map(e => e.data.timing.ttftMs);
  const avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;

  // Total cost sums ALL sources, but dedupes per-event: when a TPS event has both
  // a token cost AND a paired neuralwatt energy cost, only the energy cost is used
  // (they measure the same spend — neuralwatt is the authoritative source when present).
  const energyByParentId = new Map<string, EnergyPayload>();
  for (const e of energyEvents) {
    energyByParentId.set(e.parentId ?? '', e.data);
  }
  const tpsIds = new Set(sorted.map(e => e.id));
  let totalCostUsd = 0;
  let hasAnyCost = false;
  let usedNeuralwatt = false;
  let usedTpsCost = false;

  // Per-TPS-event: prefer paired energy cost, fall back to token cost
  for (const tps of sorted) {
    const pairedEnergy = energyByParentId.get(tps.id);
    if (pairedEnergy) {
      totalCostUsd += pairedEnergy.cost_usd;
      usedNeuralwatt = true;
      hasAnyCost = true;
    } else if (tps.data.cost !== null) {
      totalCostUsd += tps.data.cost.total;
      usedTpsCost = true;
      hasAnyCost = true;
    }
  }

  // Orphan energy events (not paired with any TPS event)
  for (const e of energyEvents) {
    if (!tpsIds.has(e.parentId ?? '')) {
      totalCostUsd += e.data.cost_usd;
      usedNeuralwatt = true;
      hasAnyCost = true;
    }
  }

  const totalCostUsdResult = hasAnyCost ? totalCostUsd : null;
  const costSource: 'neuralwatt' | 'tps' | 'both' | null =
    usedNeuralwatt && usedTpsCost ? 'both' :
    usedNeuralwatt ? 'neuralwatt' :
    usedTpsCost ? 'tps' :
    null;
  const totalEnergyJoules = energyEvents.length > 0
    ? energyEvents.reduce((s, e) => s + e.data.energy_joules, 0)
    : null;

  // Collect unique models with their call counts
  const modelMap = new Map<string, { provider: string; count: number }>();
  for (const e of sorted) {
    const key = e.data.model.modelId;
    const existing = modelMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      modelMap.set(key, { provider: e.data.model.provider, count: 1 });
    }
  }
  const models = [...modelMap.entries()]
    .map(([modelId, { provider, count }]) => ({ modelId, provider, callCount: count }))
    .sort((a, b) => b.callCount - a.callCount);

  return {
    totalCalls: sorted.length,
    totalTokens: totalInput + totalOutput + totalCacheRead + totalCacheWrite,
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    totalTimeMs,
    totalGenerationMs,
    totalStallMs,
    totalStallCount,
    avgTps,
    avgTtft,
    totalCostUsd: totalCostUsdResult,
    costSource,
    totalEnergyJoules,
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
    const totalOutput = slice.reduce((s, e) => s + e.data.tokens.output, 0);
    const totalGenerationMs = slice.reduce((s, e) => s + e.data.timing.generationMs, 0);
    const avgTps = totalGenerationMs > 0 ? totalOutput / (totalGenerationMs / 1000) : 0;
    const totalTokens = slice.reduce((s, e) => s + e.data.tokens.total, 0);

    buckets.push({
      range: `${first.timestamp.substring(11, 19)}-${last.timestamp.substring(11, 19)}`,
      label,
      count: slice.length,
      avgTtft: Math.round(avgTtft),
      avgTotal: Math.round(avgTotal),
      avgTps: Math.round(avgTps * 10) / 10,
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
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

export function formatNumber(n: number | null, decimals = 0): string {
  if (n === null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(decimals)}k`;
  return n.toFixed(decimals);
}

export function formatCurrency(n: number | null): string {
  if (n === null) return '-';
  return `$${n.toFixed(4)}`;
}
