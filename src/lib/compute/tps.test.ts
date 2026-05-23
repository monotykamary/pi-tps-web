import { describe, it, expect } from 'vitest';
import { computeSafeEffectiveMs, computeEffectiveTps } from './tps';
import type { TpsPayload } from '../../types';

function makePayload(partial: Partial<TpsPayload['timing']> & { tokensOutput?: number }): TpsPayload {
  return {
    model: { provider: 'test', modelId: 'test-model' },
    tokens: {
      input: 100,
      output: partial.tokensOutput ?? 100,
      cacheRead: 0,
      cacheWrite: 0,
      total: 100 + (partial.tokensOutput ?? 100),
    },
    timing: {
      ttftMs: 1000,
      totalMs: 5000,
      generationMs: 4000,
      streamMs: null,
      stallMs: 0,
      stallCount: 0,
      messageCount: 1,
      ...partial,
    },
    tps: 25,
    cost: null,
    timestamp: 0,
  };
}

describe('computeSafeEffectiveMs', () => {
  it('uses streamMs - stallMs when stream dominates', () => {
    const data = makePayload({ streamMs: 3000, stallMs: 500, generationMs: 4000 });
    expect(computeSafeEffectiveMs(data)).toBe(2500);
  });

  it('falls back to generationMs - stallMs when no stream', () => {
    const data = makePayload({ streamMs: null, stallMs: 500, generationMs: 4000 });
    expect(computeSafeEffectiveMs(data)).toBe(3500);
  });

  it('applies partial stall reduction when stalls dominate', () => {
    // stallMs (3500) > generationMs * 0.85 (3400) → stalls dominate
    const data = makePayload({ streamMs: null, stallMs: 3500, generationMs: 4000 });
    const result = computeSafeEffectiveMs(data);
    // Should be max(generationMs - stallMs/2, 50) = max(4000 - 1750, 50) = 2250
    expect(result).toBe(2250);
  });

  it('returns 0 when generationMs is too short', () => {
    const data = makePayload({ streamMs: null, stallMs: 0, generationMs: 10 });
    expect(computeSafeEffectiveMs(data)).toBe(0);
  });

  it('caps at MIN_GENERATION_MS (50)', () => {
    const data = makePayload({ streamMs: null, stallMs: 3999, generationMs: 4000 });
    const result = computeSafeEffectiveMs(data);
    expect(result).toBeGreaterThanOrEqual(50);
  });
});

describe('computeEffectiveTps', () => {
  it('returns 0 when denominator is 0', () => {
    const data = makePayload({ streamMs: null, stallMs: 0, generationMs: 10, tokensOutput: 100 });
    expect(computeEffectiveTps(data)).toBe(0);
  });

  it('computes TPS correctly for nominal case', () => {
    // 100 tokens / (3.5s) = ~28.57 tps
    const data = makePayload({ streamMs: null, stallMs: 500, generationMs: 4000, tokensOutput: 100 });
    expect(computeEffectiveTps(data)).toBeCloseTo(28.57, 1);
  });
});
