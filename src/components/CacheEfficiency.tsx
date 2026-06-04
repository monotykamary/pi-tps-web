import { memo } from 'react';
import { motion } from 'framer-motion';
import { HardDrives } from '@phosphor-icons/react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from 'recharts';

import type { CacheOverallSlice, CacheOverTimeInterval } from '../lib/queries';

interface Props {
  overall: CacheOverallSlice[];
  overTime: CacheOverTimeInterval[];
  hitRate: number;
}

function CacheTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="glass-panel rounded-xl px-3 py-2 text-xs">
      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{d.name}:</span> <span className="metric-mono">{d.value?.toLocaleString()}</span>
    </div>
  );
}

function CacheEfficiencyInner({ overall, overTime, hitRate }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6 flex flex-col"
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="p-1.5 bg-accent/10 dark:bg-accent/15 rounded-lg">
          <HardDrives size={16} className="text-accent" weight="bold" />
        </div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Cache Efficiency</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <Tooltip content={<CacheTooltip />} wrapperStyle={{ zIndex: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
            <span className="metric-mono text-2xl font-bold text-zinc-800 dark:text-zinc-300">{hitRate.toFixed(0)}%</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-400 font-medium uppercase tracking-wider">cache hit</span>
          </div>
        </div>

        {/* Bars */}
        <div className="flex flex-col justify-center gap-2.5">
          {overall.map(item => {
            const total = overall.reduce((s, v) => s + v.value, 0);
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <div key={item.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">{item.name}</span>
                  <span className="metric-mono text-zinc-700 dark:text-zinc-300 font-semibold">{pct.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: item.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Over-time cache hit rate */}
      <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-white/[0.06]">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-3">Cache hit rate over time (by request range)</p>
        <div className="space-y-1.5">
          {overTime.map((c, i) => {
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
                    transition={{ duration: 0.4, ease: 'easeOut' }}
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

export default memo(CacheEfficiencyInner);
