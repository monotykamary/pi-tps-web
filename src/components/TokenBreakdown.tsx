'use client';

import React from 'react';
import { motion } from 'framer-motion';

import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TpsEvent, EnergyPayload } from '../types';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
}

function TokenBreakdownInner({ events }: Props) {
  const sorted = React.useMemo(() => [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-30), [events]);

  const data = React.useMemo(() => sorted.map((e, i) => ({
    index: i + 1,
    input: e.data.tokens.input,
    output: e.data.tokens.output,
    cacheRead: e.data.tokens.cacheRead,
    cacheWrite: e.data.tokens.cacheWrite,
    total: e.data.tokens.total,
    ttft: e.data.timing.ttftMs,
  })), [sorted]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Request #{d.index}</p>
        <div className="space-y-1">
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
              <span className="text-zinc-400 dark:text-zinc-400 w-20">{p.name}</span>
              <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{p.value?.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Token Composition — Last 30 Requests</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 mt-0.5">How cache, new input, and output compose each request</p>
        </div>
      </div>

      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dy={8}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="cacheRead" name="Cache Read" stackId="a" fill="#0891b2" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="input" name="New Input" stackId="a" fill="#3f3f46" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="output" name="Output" stackId="a" fill="#059669" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </RBarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span className="text-zinc-400 dark:text-zinc-400">Cache Read</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-zinc-700 dark:bg-zinc-400" />
          <span className="text-zinc-400 dark:text-zinc-400">New Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-moss" />
          <span className="text-zinc-400 dark:text-zinc-400">Output</span>
        </div>
      </div>
    </motion.div>
  );
}

export default React.memo(TokenBreakdownInner);
