'use client';

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

export default function TokenBreakdown({ events }: Props) {
  const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).slice(-30);

  const data = sorted.map((e, i) => ({
    index: i + 1,
    input: e.data.tokens.input,
    output: e.data.tokens.output,
    cacheRead: e.data.tokens.cacheRead,
    cacheWrite: e.data.tokens.cacheWrite,
    total: e.data.tokens.total,
    ttft: e.data.timing.ttftMs,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm shadow-diffuse">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Request #{d.index}</p>
        <div className="space-y-1">
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
              <span className="text-slate-400 w-20">{p.name}</span>
              <span className="metric-mono font-semibold text-slate-700">{p.value?.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">Token Composition — Last 30 Requests</h2>
          <p className="text-sm text-slate-400 mt-0.5">How cache, new input, and output compose each request</p>
        </div>
      </div>

      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              dy={8}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="cacheRead" name="Cache Read" stackId="a" fill="#0891b2" fillOpacity={0.8} radius={[0, 0, 0, 0]} />
            <Bar dataKey="input" name="New Input" stackId="a" fill="#0f172a" fillOpacity={0.6} radius={[0, 0, 0, 0]} />
            <Bar dataKey="output" name="Output" stackId="a" fill="#059669" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
          </RBarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center gap-5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
          <span className="text-slate-400">Cache Read</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-slate-900/60" />
          <span className="text-slate-400">New Input</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-moss" />
          <span className="text-slate-400">Output</span>
        </div>
      </div>
    </motion.div>
  );
}
