import type { TpsPayload } from '../../types';

const MIN_GENERATION_MS = 50;
const STALL_REDUCTION_DENOM = 2;
const ACTIVE_TIME_THRESHOLD_MS = 200;
const STALL_DOMINANCE_RATIO = 0.85;

/**
 * Compute a trustworthy per-event effective generation denominator (ms).
 *
 * Primary branch (stream-based): returns streamMs - stallMs when guards pass.
 * Fallback branch (generationMs-based, includes TTFT): applies partial stall
 * reduction when stalls dominate the effective window, preventing a tiny denominator.
 */
export function computeSafeEffectiveMs(data: TpsPayload): number {
  const streamMs = data.timing.streamMs ?? 0;
  const stallMs = data.timing.stallMs;

  const effectiveStreamMs = streamMs - stallMs;
  if (streamMs > 0 && stallMs < streamMs && effectiveStreamMs >= MIN_GENERATION_MS && stallMs < effectiveStreamMs) {
    return effectiveStreamMs;
  }

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
