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
  }));

  const metricConfig = {
    ttft: { label: 'TTFT', color: '#0891b2', fill: 'rgba(8,145,178,0.08)', unit: 'ms' },
    total: { label: 'Total Time', color: '#dc2626', fill: 'rgba(220,38,38,0.06)', unit: 'ms' },
    tps: { label: 'Generation Speed', color: '#059669', fill: 'rgba(5,150,105,0.08)', unit: 't/s' },
  };

  const config = metricConfig[metric];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const data = payload[0]?.payload;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm shadow-diffuse">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{data.label}</p>
        <div className="flex items-baseline gap-2">
          <span className="metric-mono text-lg font-bold text-slate-800 dark:text-slate-100">{data[metric]}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{config.unit}</span>
        </div>
        <div className="mt-1.5 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 grid grid-cols-3 gap-3 text-[11px]">
          <div>
            <span className="text-slate-400 dark:text-slate-500">Calls</span>
            <p className="metric-mono font-semibold text-slate-700 dark:text-slate-200">{data.count}</p>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500">Tokens</span>
            <p className="metric-mono font-semibold text-slate-700 dark:text-slate-200">{(data.totalTokens / 1000).toFixed(1)}k</p>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500">Avg TPS</span>
            <p className="metric-mono font-semibold text-slate-700 dark:text-slate-200">{data.avgTps}</p>
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
          <h2 className="text-lg font-semibold tracking-tight text-slate-800 dark:text-slate-100">Conversation Timeline</h2>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Performance patterns across the session</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-700/60 rounded-xl p-1">
          {(['ttft', 'total', 'tps'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                metric === m
                  ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-20" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
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
