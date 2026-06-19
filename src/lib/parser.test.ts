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
