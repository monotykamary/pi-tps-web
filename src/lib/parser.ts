import type { ParsedEvent, TpsEvent, EnergyEvent, ConversationSummary, TimingBucket, EnergyPayload } from '../types';

export function parseJsonl(raw: string): ParsedEvent[] {
  const lines = raw.trim().split('\n');
  const events: ParsedEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rawEvent = JSON.parse(line);
      if (rawEvent.type === 'custom' && rawEvent.customType === 'tps') {
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

export function pairEnergyWithTps(tpsEvents: TpsEvent[], energyEvents: EnergyEvent[]): (TpsEvent & { energy?: EnergyPayload })[] {
  const energyById = new Map<string, EnergyPayload>();
  for (const e of energyEvents) {
    energyById.set(e.parentId, e.data);
  }
  return tpsEvents.map(t => ({
    ...t,
    energy: energyById.get(t.id),
  }));
}

export function computeSummary(tpsEvents: TpsEvent[], energyEvents: EnergyEvent[]): ConversationSummary {
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
  const avgTps = sorted.reduce((s, e) => s + e.data.tps, 0) / sorted.length;
  const ttfts = sorted.map(e => e.data.timing.ttftMs);
  const avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;

  const totalCostUsd = energyEvents.length > 0
    ? energyEvents.reduce((s, e) => s + e.data.cost_usd, 0)
    : null;
  const totalEnergyJoules = energyEvents.length > 0
    ? energyEvents.reduce((s, e) => s + e.data.energy_joules, 0)
    : null;

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
    totalCostUsd,
    totalEnergyJoules,
    minTtft: Math.min(...ttfts),
    maxTtft: Math.max(...ttfts),
    model: last?.data.model.modelId ?? 'unknown',
    provider: last?.data.model.provider ?? 'unknown',
    timeRange: {
      start: sorted[0]?.timestamp ?? '',
      end: last?.timestamp ?? '',
    },
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
    const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

    const avgTtft = slice.reduce((s, e) => s + e.data.timing.ttftMs, 0) / slice.length;
    const avgTotal = slice.reduce((s, e) => s + e.data.timing.totalMs, 0) / slice.length;
    const avgTps = slice.reduce((s, e) => s + e.data.tps, 0) / slice.length;
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

export function computeThresholdCrossings(tpsEvents: TpsEvent[]): { threshold: number; events: TpsEvent[] }[] {
  const thresholds = [32000, 50000, 65000, 80000];
  return thresholds.map(threshold => ({
    threshold,
    events: tpsEvents.filter(e => e.data.tokens.total >= threshold),
  }));
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
  if (n < 0.001) return `$${(n * 1000).toFixed(2)}m`;
  return `$${n.toFixed(4)}`;
}
