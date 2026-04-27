'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Timer } from '@phosphor-icons/react';
import type { TpsEvent, EnergyPayload, DataThresholds } from '../types';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
  thresholds: DataThresholds;
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
          <div className="p-1.5 bg-accent/10 rounded-lg">
            <Timer size={16} className="text-accent" weight="bold" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-800">TTFT Distribution</h2>
            <p className="text-sm text-slate-400">Where time is spent across all calls</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="metric-mono font-semibold text-moss">{fastCount} fast</span>
          <span className="text-slate-300">·</span>
          <span className="metric-mono font-semibold text-ember">{slowCount} slow</span>
        </div>
      </div>

      <div className="space-y-3">
        {bins.map((bin, i) => (
          <div key={bin.label} className="flex items-center gap-3">
            <span className="text-[11px] metric-mono text-slate-500 w-14 shrink-0 text-right">{bin.label}</span>
            <div className="flex-1 h-7 bg-slate-50 rounded-lg overflow-hidden relative">
              <motion.div
                className={`h-full ${bin.color} rounded-lg`}
                initial={{ width: 0 }}
                animate={{ width: `${bin.barPct}%` }}
                transition={{ delay: 0.5 + i * 0.06, duration: 0.6, type: 'spring', stiffness: 60 }}
              />
              {bin.count > 0 && (
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] metric-mono font-semibold text-white mix-blend-difference">
                  {bin.count}
                </span>
              )}
            </div>
            <span className="text-[11px] metric-mono text-slate-400 w-10 shrink-0">{bin.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">Median TTFT</span>
        <span className="metric-mono font-semibold text-slate-700">
          {(() => {
            const ttfts = sorted.map(e => e.data.timing.ttftMs).sort((a, b) => a - b);
            const mid = Math.floor(ttfts.length / 2);
            return `${(ttfts[mid] >= 1000 ? (ttfts[mid] / 1000).toFixed(1) + 's' : ttfts[mid] + 'ms')}`;
          })()}
        </span>
      </div>
    </motion.div>
  );
}
