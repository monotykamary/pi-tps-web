import React from 'react';
import { motion } from 'framer-motion';
import { Timer } from '@phosphor-icons/react';
import type { TtftBinRow } from '../lib/queries';
import { formatDuration } from '../lib/parser';

interface Props {
  bins: TtftBinRow[];
  fastCount: number;
  slowCount: number;
  percentiles: { label: string; value: number }[];
}

function TimingDistributionInner({ bins, fastCount, slowCount, percentiles }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
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
        {bins.map((bin) => (
          <div key={bin.label} className="flex items-center gap-3">
            <span className="text-[11px] metric-mono text-zinc-500 dark:text-zinc-400 w-14 shrink-0 text-right">{bin.label}</span>
            <div className="flex-1 h-7 bg-zinc-50 dark:bg-white/[0.04] rounded-lg overflow-hidden relative">
              <motion.div
                className={`h-full ${bin.color} rounded-lg`}
                initial={{ width: 0 }}
                animate={{ width: `${bin.barPct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-zinc-100 dark:divide-white/[0.06]">
          {percentiles.map(({ label, value }) => {
            const color = label === 'P50' ? 'text-zinc-700 dark:text-zinc-300'
              : label === 'P75' ? 'text-amber'
              : label === 'P90' ? 'text-accent'
              : 'text-ember';
            return (
              <div key={label} className="text-center px-3 py-2 first:pl-0 last:pr-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400">{label}</p>
                <p className={`metric-mono text-sm font-semibold ${color} mt-0.5`}>
                  {formatDuration(value)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export default React.memo(TimingDistributionInner);
