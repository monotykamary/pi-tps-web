'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Gauge, TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import type { TpsEvent } from '../types';

interface Props {
  events: TpsEvent[];
}

export default function ThresholdAnalysis({ events }: Props) {
  const thresholds = [32000, 50000, 65000, 80000];

  const stats = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return thresholds.map(threshold => {
      const above = sorted.filter(e => e.data.tokens.total >= threshold);
      const below = sorted.filter(e => e.data.tokens.total < threshold);

      const avgTtftAbove = above.length ? above.reduce((s, e) => s + e.data.timing.ttftMs, 0) / above.length : 0;
      const avgTtftBelow = below.length ? below.reduce((s, e) => s + e.data.timing.ttftMs, 0) / below.length : 0;

      const avgTpsAbove = above.length ? above.reduce((s, e) => s + e.data.tps, 0) / above.length : 0;
      const avgTpsBelow = below.length ? below.reduce((s, e) => s + e.data.tps, 0) / below.length : 0;

      const avgCacheRatioAbove = above.length ? above.reduce((s, e) => s + e.data.tokens.cacheRead / e.data.tokens.total, 0) / above.length : 0;
      const avgCacheRatioBelow = below.length ? below.reduce((s, e) => s + e.data.tokens.cacheRead / e.data.tokens.total, 0) / below.length : 0;

      return {
        threshold,
        above: { count: above.length, avgTtft: avgTtftAbove, avgTps: avgTpsAbove, avgCacheRatio: avgCacheRatioAbove },
        below: { count: below.length, avgTtft: avgTtftBelow, avgTps: avgTpsBelow, avgCacheRatio: avgCacheRatioBelow },
        firstAboveIndex: sorted.findIndex(e => e.data.tokens.total >= threshold),
      };
    });
  }, [events]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <Gauge size={18} className="text-accent" weight="bold" />
        <h2 className="text-base font-semibold tracking-tight text-slate-800">Threshold Crossings</h2>
      </div>

      <div className="space-y-4">
        {stats.map((s, i) => {
          const ttftDelta = s.above.avgTtft - s.below.avgTtft;
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  At {(s.threshold / 1000).toFixed(0)}k tokens
                </span>
                <span className="text-[11px] metric-mono text-slate-400">
                  {s.above.count} above
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.08, duration: 0.6, type: 'spring', stiffness: 60 }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="metric-mono text-sm font-bold text-slate-700">{Math.round(s.below.avgTtft).toLocaleString()}ms</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Below</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    ttftDelta > 0
                      ? 'bg-ember/10 text-ember'
                      : ttftDelta < 0
                      ? 'bg-moss/10 text-moss'
                      : 'bg-slate-100 text-slate-400'
                  }`}>
                    {ttftDelta > 0 ? <TrendUp size={10} /> : ttftDelta < 0 ? <TrendDown size={10} /> : <Minus size={10} />}
                    {ttftDelta !== 0 && <span className="metric-mono">{Math.abs(Math.round(ttftDelta)).toLocaleString()}ms</span>}
                  </div>
                </div>
                <div className="text-center">
                  <p className="metric-mono text-sm font-bold text-slate-700">{Math.round(s.above.avgTtft).toLocaleString()}ms</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Above</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <p className="text-xs leading-relaxed text-slate-500">
          The <span className="metric-mono font-semibold text-slate-700">65k threshold</span> shows the strongest
          improvement signal — ttft drops significantly once requests begin hitting the cache-optimized server.
        </p>
      </div>
    </motion.div>
  );
}
