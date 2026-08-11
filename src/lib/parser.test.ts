import { describe, it, expect } from 'vitest';
import {
  ingestJsonl,
  deriveEvents,
  parseJsonl,
  getTpsEvents,
  getEnergyEvents,
  pairEnergyWithTps,
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
});

describe('pairEnergyWithTps', () => {
  it('pairs energy with TPS by session_id + parent_id', () => {
    const raw = [VALID_TELEMETRY, ENERGY_EVENT].join('\n');
    const parsed = parseJsonl(raw);
    const tps = getTpsEvents(parsed);
    const energy = getEnergyEvents(parsed);
    const paired = pairEnergyWithTps(tps, energy);
    expect(paired[0].energy).toBeDefined();
    expect(paired[0].energy?.cost_usd).toBe(0.00045);
  });

  it('skips energy events with null parentId', () => {
    const tps = getTpsEvents(parseJsonl(VALID_TELEMETRY));
    const orphanEnergy = getEnergyEvents(parseJsonl(JSON.stringify({
      id: 'nw-orphan',
      parentId: null,
      timestamp: '2025-01-01T00:00:02.000Z',
      type: 'custom',
      customType: 'neuralwatt-energy',
      data: { energy_joules: 1, cost_usd: 0.00001 },
    })));
    const paired = pairEnergyWithTps(tps, orphanEnergy);
    expect(paired[0].energy).toBeUndefined();
  });

  it('pairs energy appended BEFORE the tps entry (provider-first load order)', () => {
    // Real-chain order observed when the neuralwatt provider's turn_end runs
    // before pi-tps': assistant → energy → tps (energy.parentId = assistant,
    // tps.parentId = energy). Common with queued flex models.
    const energy = JSON.stringify({
      id: 'nw-1', parentId: 'msg-1', timestamp: '2025-01-01T00:00:01.000Z',
      type: 'custom', customType: 'neuralwatt-energy',
      data: { energy_joules: 55.5, cost_usd: 0.000077 },
    });
    const tps = VALID_TELEMETRY.replace('"parentId":null', '"parentId":"nw-1"');
    const parsed = parseJsonl([energy, tps].join('\n'));
    const paired = pairEnergyWithTps(getTpsEvents(parsed), getEnergyEvents(parsed));
    expect(paired[0].energy).toBeDefined();
    expect(paired[0].energy?.cost_usd).toBe(0.000077);
  });

  it('pairs each energy event at most once across corrected-duplicate tps entries', () => {
    // Chain A → T1 → N → T2 (T2 is pi-tps' billed-rate correction duplicate):
    // energy must pair with T1 via T1.id = N.parentId and NOT again with T2
    // via T2.parentId = N.id.
    const mkTps = (id: string, parentId: string | null, ts: string) => JSON.stringify({
      id, parentId, timestamp: ts, type: 'custom', customType: 'tps',
      data: {
        model: { provider: 'neuralwatt', modelId: 'glm-5.2-flex' },
        tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 },
        timing: { ttftMs: 1, totalMs: 2, generationMs: 1, streamMs: null, stallMs: 0, stallCount: 0, messageCount: 1 },
        tps: 5, cost: null, timestamp: 1735689600000,
      },
    });
    const t1 = mkTps('t1', 'msg-1', '2025-01-01T00:00:01.000Z');
    const energy = JSON.stringify({
      id: 'nw-cor', parentId: 't1', timestamp: '2025-01-01T00:00:01.500Z',
      type: 'custom', customType: 'neuralwatt-energy',
      data: { energy_joules: 1, cost_usd: 0.00001 },
    });
    const t2 = mkTps('t2', 'nw-cor', '2025-01-01T00:00:02.000Z');
    const parsed = parseJsonl([t1, energy, t2].join('\n'));
    const paired = pairEnergyWithTps(getTpsEvents(parsed), getEnergyEvents(parsed));
    expect(paired.filter(p => p.energy)).toHaveLength(1);
    expect(paired.find(p => p.id === 't1')?.energy?.cost_usd).toBe(0.00001);
    expect(paired.find(p => p.id === 't2')?.energy).toBeUndefined();
  });

  it('skips pairing when TPS id is empty', () => {
    const emptyIdTps = getTpsEvents(parseJsonl(VALID_TELEMETRY.replace('"id":"turn-1"', '"id":""')));
    const energy = getEnergyEvents(parseJsonl(ENERGY_EVENT));
    const paired = pairEnergyWithTps(emptyIdTps, energy);
    expect(paired[0].energy).toBeUndefined();
  });
});

describe('rateUsdPerMTokens normalization', () => {
  it('preserves the stored rateUsdPerMTokens field through ingest + derive', () => {
    const raw = JSON.stringify({
      id: 'turn-rate',
      parentId: null,
      timestamp: '2025-01-01T00:00:00.000Z',
      type: 'custom',
      customType: 'tps',
      data: {
        model: { provider: 'openai', modelId: 'gpt-4o' },
        tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 5, total: 165 },
        timing: { ttftMs: 2000, totalMs: 5000, generationMs: 3000, streamMs: null, stallMs: 0, stallCount: 0, messageCount: 1 },
        tps: 12.5,
        cost: { input: 0.001, output: 0.0015, cacheRead: 0.0001, cacheWrite: 0.00025, total: 0.00285 },
        rateUsdPerMTokens: 4.2,
        timestamp: 1735689600000,
      },
    });
    const derived = deriveEvents(ingestJsonl(raw));
    const tps = getTpsEvents(derived)[0];
    expect(tps.data.rateUsdPerMTokens).toBe(4.2);
  });

  it('coerces absent rateUsdPerMTokens to null (older sessions)', () => {
    // VALID_TELEMETRY has no rateUsdPerMTokens field — older-session shape
    const derived = deriveEvents(ingestJsonl(VALID_TELEMETRY));
    const tps = getTpsEvents(derived)[0];
    expect(tps.data.rateUsdPerMTokens).toBeNull();
  });

  it('preserves an explicit null rateUsdPerMTokens', () => {
    const raw = VALID_TELEMETRY.replace(
      'timestamp: 1735689600000,',
      'rateUsdPerMTokens: null,\n    timestamp: 1735689600000,',
    );
    const derived = deriveEvents(ingestJsonl(raw));
    const tps = getTpsEvents(derived)[0];
    expect(tps.data.rateUsdPerMTokens).toBeNull();
  });
});
