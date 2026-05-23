import { describe, it, expect } from 'vitest';
import {
  ingestJsonl,
  deriveEvents,
  parseJsonl,
  getTpsEvents,
  getEnergyEvents,
  pairEnergyWithTps,
  computeSummary,
  computeMultiSessionSummary,
  computeTimingBuckets,
} from './parser';

const VALID_TELEMETRY = JSON.stringify({
  id: 'turn-1',
  parentId: null,
  timestamp: '2025-01-01T00:00:00.000Z',
  type: 'custom',
  customType: 'tps',
  data: {
    model: { provider: 'openai', modelId: 'gpt-4o' },
    tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 },
    timing: {
      ttftMs: 2000,
      totalMs: 5000,
      generationMs: 3000,
      streamMs: null,
      stallMs: 0,
      stallCount: 0,
      messageCount: 1,
    },
    tps: 12.5,
    cost: { input: 0.001, output: 0.0015, cacheRead: 0.0001, cacheWrite: 0.00025, total: 0.00285 },
    timestamp: 1735689600000,
  },
});

const ENERGY_EVENT = JSON.stringify({
  id: 'nw-1',
  parentId: 'turn-1',
  timestamp: '2025-01-01T00:00:01.000Z',
  type: 'custom',
  customType: 'neuralwatt-energy',
  data: { energy_joules: 1234.56, cost_usd: 0.00045 },
});

describe('ingestJsonl', () => {
  it('parses structured TPS events', () => {
    const result = ingestJsonl(VALID_TELEMETRY);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('tps');
    expect(result.hasTpsEntries).toBe(true);
  });

  it('derives a session id from content', () => {
    const result = ingestJsonl(VALID_TELEMETRY);
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId.length).toBeGreaterThan(0);
  });

  it('skips malformed lines gracefully', () => {
    const raw = VALID_TELEMETRY + '\nnot-json\n' + ENERGY_EVENT;
    const result = ingestJsonl(raw);
    expect(result.events).toHaveLength(2);
  });
});

describe('deriveEvents', () => {
  it('passes through valid TPS events unchanged', () => {
    const ingest = ingestJsonl(VALID_TELEMETRY);
    const derived = deriveEvents(ingest);
    expect(derived).toHaveLength(1);
    expect(derived[0].type).toBe('tps');
    expect(getTpsEvents(derived)[0].data.model.modelId).toBe('gpt-4o');
  });

  it('pairs energy with TPS by session_id + parent_id', () => {
    const raw = [VALID_TELEMETRY, ENERGY_EVENT].join('\n');
    const parsed = parseJsonl(raw);
    const tps = getTpsEvents(parsed);
    const energy = getEnergyEvents(parsed);
    const paired = pairEnergyWithTps(tps, energy);
    expect(paired[0].energy).toBeDefined();
    expect(paired[0].energy?.cost_usd).toBe(0.00045);
  });
});

describe('computeSummary', () => {
  it('handles empty arrays without NaN/Infinity', () => {
    const summary = computeSummary([], []);
    expect(summary.totalCalls).toBe(0);
    expect(summary.avgTps).toBe(0);
    expect(summary.minTtft).toBe(0);
    expect(summary.maxTtft).toBe(0);
    expect(summary.totalCostUsd).toBeNull();
    expect(summary.totalEnergyJoules).toBeNull();
    expect(summary.costSource).toBeNull();
  });

  it('computes stats for a single TPS event', () => {
    const raw = [VALID_TELEMETRY, ENERGY_EVENT].join('\n');
    const parsed = parseJsonl(raw);
    const tps = getTpsEvents(parsed);
    const energy = getEnergyEvents(parsed);
    const summary = computeSummary(tps, energy);

    expect(summary.totalCalls).toBe(1);
    expect(summary.totalTokens).toBe(165);
    expect(summary.minTtft).toBe(2000);
    expect(summary.maxTtft).toBe(2000);
    expect(summary.avgTtft).toBe(2000);
    expect(summary.fastCalls).toBe(1); // ttft < 3000
    expect(summary.cachedCalls).toBe(1); // cacheRead > 0
    expect(summary.stalledCalls).toBe(0);
  });

  it('prefers energy cost over token cost when both present', () => {
    const raw = [VALID_TELEMETRY, ENERGY_EVENT].join('\n');
    const parsed = parseJsonl(raw);
    const tps = getTpsEvents(parsed);
    const energy = getEnergyEvents(parsed);
    const summary = computeSummary(tps, energy);
    expect(summary.costSource).toBe('neuralwatt');
    expect(summary.totalCostUsd).toBe(0.00045);
  });

  it('falls back to token cost when no energy', () => {
    const parsed = parseJsonl(VALID_TELEMETRY);
    const tps = getTpsEvents(parsed);
    const summary = computeSummary(tps, []);
    expect(summary.costSource).toBe('tps');
    expect(summary.totalCostUsd).toBe(0.00285);
  });
});

describe('computeMultiSessionSummary', () => {
  it('returns safe defaults for empty input', () => {
    const result = computeMultiSessionSummary([]);
    expect(result.sessionCount).toBe(0);
    expect(result.totalCalls).toBe(0);
    expect(result.totalCostUsd).toBeNull();
    expect(result.totalEnergyJoules).toBeNull();
  });
});

describe('computeTimingBuckets', () => {
  it('returns empty array for no events', () => {
    expect(computeTimingBuckets([])).toEqual([]);
  });
});
