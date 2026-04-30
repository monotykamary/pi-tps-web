'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Timer } from '@phosphor-icons/react';
import type { TpsEvent, EnergyPayload, DataThresholds } from '../types';
import { formatDuration } from '../lib/parser';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
  thresholds: DataThresholds;
}

/** Format a TTFT percentile from a sorted array */
function formatTtft(sorted: number[], p: number): string {
  if (sorted.length === 0) return '-';
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return formatDuration(sorted[idx]);
}

export default function TimingDistribution({ events, thresholds }: Props) {
  const { slowTtft, fastTtft, cacheThreshold } = thresholds;

  const sorted = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [events]);

  const bins = useMemo(() => {
    const ranges = [
      { label: '<1s', max: 1000, color: 'bg-moss' },
      { label: '1-3s', max: 3000, color: 'bg-moss/70' },
      { label: '3-5s', max: 5000, color: 'bg-accent' },
      { label: '5-10s', max: 10000, color: 'bg-accent/70' },
      { label: '10-15s', max: 15000, color: 'bg-amber' },
      { label: '15-30s', max: 30000, color: 'bg-ember/70' },
      { label: '>30s', max: Infinity, color: 'bg-ember' },
    ];

    const counts = ranges.map(r => ({
      ...r,
      count: sorted.filter(e => {
        const prevMax = ranges[ranges.indexOf(r) - 1]?.max ?? 0;
        return e.data.timing.ttftMs > prevMax && e.data.timing.ttftMs <= r.max;
      }).length,
    }));

    const maxCount = Math.max(...counts.map(c => c.count), 1);
    return counts.map(c => ({ ...c, pct: (c.count / sorted.length) * 100, barPct: (c.count / maxCount) * 100 }));
  }, [sorted]);

  const sortedTtfts = useMemo(() => sorted.map(e => e.data.timing.ttftMs).sort((a, b) => a - b), [sorted]);

  const slowCount = sorted.filter(e => e.data.timing.ttftMs > slowTtft && e.data.tokens.total < cacheThreshold).length;
  const fastCount = sorted.filter(e => e.data.tokens.total > cacheThreshold && e.data.timing.ttftMs < fastTtft).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent/10 dark:bg-accent/15 rounded-lg">
            <Timer size={16} className="text-accent" weight="bold" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">TTFT Distribution</h2>
            <p className="text-sm text-zinc-400 dark:text-zinc-400">Where time is spent across all calls</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="metric-mono font-semibold text-moss">{fastCount} fast</span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="metric-mono font-semibold text-ember">{slowCount} slow</span>
        </div>
      </div>

      <div className="space-y-3">
        {bins.map((bin, i) => (
          <div key={bin.label} className="flex items-center gap-3">
            <span className="text-[11px] metric-mono text-zinc-500 dark:text-zinc-400 w-14 shrink-0 text-right">{bin.label}</span>
            <div className="flex-1 h-7 bg-zinc-50 dark:bg-white/[0.04] rounded-lg overflow-hidden relative">
              <motion.div
                className={`h-full ${bin.color} rounded-lg`}
                initial={{ width: 0 }}
                animate={{ width: `${bin.barPct}%` }}
                transition={{ delay: 0.5 + i * 0.06, duration: 0.6, type: 'spring', stiffness: 60 }}
              />
              {bin.count > 0 && (
                <span
                  className={`absolute inset-y-0 flex items-center text-[11px] metric-mono font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${
                    bin.barPct > 15 ? 'left-2 text-white' : 'left-1 text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {bin.count}
                </span>
              )}
            </div>
            <span className="text-[11px] metric-mono text-zinc-400 dark:text-zinc-400 w-10 shrink-0">{bin.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
        <div className="grid grid-cols-4 gap-0 divide-x divide-zinc-100 dark:divide-white/[0.06]">
          {[
            { label: 'P50', p: 0.50, color: 'text-zinc-700 dark:text-zinc-300' },
            { label: 'P75', p: 0.75, color: 'text-amber' },
            { label: 'P90', p: 0.90, color: 'text-accent' },
            { label: 'P99', p: 0.99, color: 'text-ember' },
          ].map(({ label, p, color }) => (
            <div key={label} className="text-center px-3 py-2 first:pl-0 last:pr-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400">{label}</p>
              <p className={`metric-mono text-sm font-semibold ${color} mt-0.5`}>
                {formatTtft(sortedTtfts, p)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
