'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { HardDrives } from '@phosphor-icons/react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';
import type { TpsEvent, EnergyPayload } from '../types';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
}

export default function CacheEfficiency({ events }: Props) {
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [events]);

  const overall = useMemo(() => {
    const totalCache = sorted.reduce((s, e) => s + e.data.tokens.cacheRead, 0);
    const totalNew = sorted.reduce((s, e) => s + e.data.tokens.input, 0);
    const totalOut = sorted.reduce((s, e) => s + e.data.tokens.output, 0);
    return [
      { name: 'Cache Read', value: totalCache, color: '#0891b2' },
      { name: 'New Input', value: totalNew, color: '#3f3f46' },
      { name: 'Output', value: totalOut, color: '#059669' },
    ];
  }, [sorted]);

  const cacheOverTime = useMemo(() => {
    const intervals = 6;
    const chunkSize = Math.ceil(sorted.length / intervals);
    const chunks: { label: string; hitRate: number }[] = [];
    for (let i = 0; i < sorted.length; i += chunkSize) {
      const slice = sorted.slice(i, Math.min(i + chunkSize, sorted.length));
      const cache = slice.reduce((s, e) => s + e.data.tokens.cacheRead, 0);
      const total = slice.reduce((s, e) => s + e.data.tokens.total, 0);
      const hitRate = total > 0 ? (cache / total) * 100 : 0;
      chunks.push({ label: `${i + 1}-${Math.min(i + chunkSize, sorted.length)}`, hitRate: Math.round(hitRate) });
    }
    return chunks;
  }, [sorted]);

  const cacheHitRate = overall[0].value / overall.reduce((s, v) => s + v.value, 0) * 100;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="glass-panel rounded-xl px-3 py-2 text-xs shadow-diffuse">
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{d.name}:</span> <span className="metric-mono">{d.value.toLocaleString()}</span>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.45, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="p-1.5 bg-accent/10 dark:bg-accent/15 rounded-lg">
          <HardDrives size={16} className="text-accent" weight="bold" />
        </div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Cache Efficiency</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Donut */}
        <div className="relative">
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={overall}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {overall.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
            <span className="metric-mono text-2xl font-bold text-zinc-800 dark:text-zinc-300">{cacheHitRate.toFixed(0)}%</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-400 font-medium uppercase tracking-wider">cache hit</span>
          </div>
        </div>

        {/* Bars */}
        <div className="flex flex-col justify-center gap-2.5">
          {overall.map(item => (
            <div key={item.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">{item.name}</span>
                <span className="metric-mono text-zinc-700 dark:text-zinc-300 font-semibold">{((item.value / overall.reduce((s, v) => s + v.value, 0)) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: item.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(item.value / overall.reduce((s, v) => s + v.value, 0)) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Over-time cache hit rate */}
      <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-3">Cache hit rate over time (by request range)</p>
        <div className="space-y-1.5">
          {cacheOverTime.map((c, i) => {
            const color = c.hitRate >= 80 ? 'bg-moss' : c.hitRate >= 50 ? 'bg-accent' : c.hitRate >= 20 ? 'bg-amber' : 'bg-ember';
            const textColor = c.hitRate >= 80 ? 'text-moss' : c.hitRate >= 50 ? 'text-accent' : c.hitRate >= 20 ? 'text-amber' : 'text-ember';
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-400 w-10 shrink-0 text-right">{c.label}</span>
                <div className="flex-1 h-4 bg-zinc-50 dark:bg-white/[0.04] rounded-sm overflow-hidden relative">
                  <motion.div
                    className={`h-full ${color} rounded-sm`}
                    initial={{ width: 0 }}
                    animate={{ width: `${c.hitRate}%` }}
                    transition={{ delay: 0.55 + i * 0.06, duration: 0.5, type: 'spring', stiffness: 80 }}
                  />
                  <span className={`absolute inset-y-0 right-1.5 flex items-center text-[9px] metric-mono font-semibold ${textColor} mix-blend-difference`}>
                    {c.hitRate}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
