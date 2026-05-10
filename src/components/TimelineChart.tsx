'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import type { TimingBucket } from '../types';

interface Props {
  buckets: TimingBucket[];
  onBucketClick: (bucket: TimingBucket) => void;
}

export default function TimelineChart({ buckets }: Props) {
  const [metric, setMetric] = useState<'ttft' | 'total' | 'tps'>('ttft');

  const chartData = buckets.map(b => ({
    ...b,
    ttft: b.avgTtft,
    total: b.avgTotal,
    tps: b.avgTps,
    tpsWall: b.avgWallTps,
    tpsLoss: b.avgTpsLoss,
  }));

  const metricConfig = {
    ttft: { label: 'TTFT', color: '#0891b2', fill: 'rgba(8,145,178,0.08)', unit: 'ms' },
    total: { label: 'Total Time', color: '#dc2626', fill: 'rgba(220,38,38,0.06)', unit: 'ms' },
    tps: { label: 'Speed', color: '#059669', fill: 'rgba(5,150,105,0.08)', unit: 't/s' },
  };

  const config = metricConfig[metric];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    const isTpsMode = metric === 'tps';
    const wallShare = data.avgTps > 0 ? (data.avgWallTps / data.avgTps) * 100 : 0;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 240 }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-1">{data.label}</p>
        <div className="flex items-baseline gap-2">
          <span className="metric-mono text-lg font-bold text-zinc-800 dark:text-zinc-300">{data[metric]}</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-400">{config.unit} {isTpsMode ? '· Active TPS' : ''}</span>
        </div>
        {isTpsMode && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 dark:text-zinc-400">Active</span>
              <span className="metric-mono font-semibold text-moss">{data.avgTps} tok/s</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 dark:text-zinc-400">Wall</span>
              <span className="metric-mono font-semibold text-zinc-500 dark:text-zinc-400">{data.tpsWall} tok/s</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400 dark:text-zinc-400">Loss</span>
              <span className={`metric-mono font-semibold ${data.tpsLoss > 50 ? 'text-ember' : data.tpsLoss > 20 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{data.tpsLoss.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
              <div className="h-full bg-moss" style={{ width: `${Math.max(0, Math.min(100, wallShare))}%` }} />
              <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - wallShare))}%` }} />
            </div>
          </div>
        )}
        <div className={`pt-1.5 border-t border-zinc-200/50 dark:border-white/[0.06] grid grid-cols-3 gap-3 text-[11px] mt-1.5`}>
          <div>
            <span className="text-zinc-400 dark:text-zinc-400">Calls</span>
            <p className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{data.count}</p>
          </div>
          <div>
            <span className="text-zinc-400 dark:text-zinc-400">Tokens</span>
            <p className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{(data.totalTokens / 1000).toFixed(1)}k</p>
          </div>
          <div>
            <span className="text-zinc-400 dark:text-zinc-400">Avg TPS</span>
            <p className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{data.avgTps}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Conversation Timeline</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 mt-0.5">Performance patterns across the session</p>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-100/80 dark:bg-white/[0.06] rounded-xl p-1">
          {(['ttft', 'total', 'tps'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                metric === m
                  ? 'bg-white dark:bg-zinc-600 text-zinc-800 dark:text-zinc-300 shadow-sm'
                  : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              {metricConfig[m].label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={config.color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={config.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              fill={`url(#fill-${metric})`}
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
