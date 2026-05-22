'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Gauge, TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import type { TpsEvent, DataThresholds } from '../types';
import { computeEffectiveTps, formatThreshold, formatDuration } from '../lib/parser';

interface Props {
  events: TpsEvent[];
  thresholds: DataThresholds;
}



function ThresholdAnalysisInner({ events, thresholds: dt }: Props) {
  // Derive 4 display thresholds from data-derived boundaries
  const displayThresholds = useMemo(() => {
    const maxTokens = events.length ? Math.max(...events.map(e => e.data.tokens.total)) : 80000;
    return [
      Math.round(dt.lowContext * 0.5 / 1000) * 1000,
      dt.lowContext,
      dt.cacheThreshold,
      Math.round((dt.cacheThreshold + (maxTokens - dt.cacheThreshold) * 0.5) / 1000) * 1000,
    ];
  }, [events, dt]);

  const stats = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return displayThresholds.map(threshold => {
      const above = sorted.filter(e => e.data.tokens.total >= threshold);
      const below = sorted.filter(e => e.data.tokens.total < threshold);

      const avgTtftAbove = above.length ? above.reduce((s, e) => s + e.data.timing.ttftMs, 0) / above.length : 0;
      const avgTtftBelow = below.length ? below.reduce((s, e) => s + e.data.timing.ttftMs, 0) / below.length : 0;

      const avgTpsAbove = above.length ? above.reduce((s, e) => s + computeEffectiveTps(e.data), 0) / above.length : 0;
      const avgTpsBelow = below.length ? below.reduce((s, e) => s + computeEffectiveTps(e.data), 0) / below.length : 0;

      const avgCacheRatioAbove = above.length ? above.reduce((s, e) => s + e.data.tokens.cacheRead / e.data.tokens.total, 0) / above.length : 0;
      const avgCacheRatioBelow = below.length ? below.reduce((s, e) => s + e.data.tokens.cacheRead / e.data.tokens.total, 0) / below.length : 0;

      const ttftDelta = avgTtftAbove - avgTtftBelow;

      return {
        threshold,
        above: { count: above.length, avgTtft: avgTtftAbove, avgTps: avgTpsAbove, avgCacheRatio: avgCacheRatioAbove },
        below: { count: below.length, avgTtft: avgTtftBelow, avgTps: avgTpsBelow, avgCacheRatio: avgCacheRatioBelow },
        firstAboveIndex: sorted.findIndex(e => e.data.tokens.total >= threshold),
        ttftDelta,
      };
    });
  }, [events, displayThresholds]);

  // Find the threshold with the strongest improvement (largest negative delta = above is faster)
  const strongest = useMemo(() => {
    const improving = stats.filter(s => s.ttftDelta < 0 && s.above.count > 0 && s.below.count > 0);
    if (!improving.length) return null;
    return improving.reduce((best, s) => s.ttftDelta < best.ttftDelta ? s : best, improving[0]);
  }, [stats]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <Gauge size={18} className="text-accent" weight="bold" />
        <h2 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Threshold Crossings</h2>
      </div>

      <div className="space-y-4">
        {stats.map((s, i) => {
          const progress = s.below.count / (s.below.count + s.above.count);

          return (
            <motion.div
              key={s.threshold}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">
                  At {formatThreshold(s.threshold)} tokens
                </span>
                <span className="text-[11px] metric-mono text-zinc-400 dark:text-zinc-400">
                  {s.above.count} above
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.6, type: 'spring', stiffness: 60 }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="metric-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">{formatDuration(Math.round(s.below.avgTtft))}</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-400 mt-0.5">Below</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    s.ttftDelta > 0
                      ? 'bg-ember/10 text-ember'
                      : s.ttftDelta < 0
                      ? 'bg-moss/10 text-moss'
                      : 'bg-zinc-100 dark:bg-white/[0.04] text-zinc-400 dark:text-zinc-400'
                  }`}>
                    {s.ttftDelta > 0 ? <TrendUp size={10} /> : s.ttftDelta < 0 ? <TrendDown size={10} /> : <Minus size={10} />}
                    {s.ttftDelta !== 0 && <span className="metric-mono">{formatDuration(Math.abs(Math.round(s.ttftDelta)))}</span>}
                  </div>
                </div>
                <div className="text-center">
                  <p className="metric-mono text-sm font-bold text-zinc-700 dark:text-zinc-300">{formatDuration(Math.round(s.above.avgTtft))}</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-400 mt-0.5">Above</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
        {strongest ? (
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            The <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatThreshold(strongest.threshold)} threshold</span> shows
            the strongest improvement signal — TTFT drops by{' '}
            <span className="metric-mono font-semibold text-moss">{formatDuration(Math.abs(Math.round(strongest.ttftDelta)))}</span>{' '}
            once requests cross it, indicating a meaningful TTFT shift at this boundary.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            No threshold shows a significant TTFT improvement above it. Requests remain consistently timed across token counts.
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default React.memo(ThresholdAnalysisInner);
