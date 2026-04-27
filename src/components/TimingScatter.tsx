'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell
} from 'recharts';
import type { TpsEvent, EnergyPayload, DataThresholds } from '../types';
import { formatThreshold } from '../lib/parser';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
  onPointClick: (id: string) => void;
  thresholds: DataThresholds;
}

export default function TimingScatter({ events, onPointClick, thresholds }: Props) {
  const [scale, setScale] = useState<'linear' | 'log'>('log');
  const { cacheThreshold, lowContext, slowTtft, fastTtft, highNewInputRatio } = thresholds;

  const data = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return sorted.map((e, i) => {
      const cacheRatio = e.data.tokens.cacheRead / e.data.tokens.total;
      const newRatio = e.data.tokens.input / e.data.tokens.total;
      let category: 'fast' | 'normal' | 'slow' | 'anomaly' = 'normal';
      if (e.data.tokens.input > 10000) category = 'anomaly';
      else if (e.data.timing.ttftMs > slowTtft && e.data.tokens.total < cacheThreshold) category = 'slow';
      else if (e.data.tokens.total > cacheThreshold && e.data.timing.ttftMs < fastTtft && newRatio < highNewInputRatio) category = 'fast';

      return {
        x: e.data.tokens.total,
        y: e.data.timing.ttftMs,
        z: e.data.timing.totalMs,
        cacheRatio,
        newRatio,
        category,
        index: i,
        id: e.id,
        input: e.data.tokens.input,
        output: e.data.tokens.output,
        cacheRead: e.data.tokens.cacheRead,
        tps: e.data.tps,
        stallCount: e.data.timing.stallCount,
        timestamp: e.timestamp,
      };
    });
  }, [events, cacheThreshold, slowTtft, fastTtft, highNewInputRatio]);

  const colorMap = {
    fast: '#059669',
    normal: '#0891b2',
    slow: '#dc2626',
    anomaly: '#d97706',
  };

  const xDomain = useMemo(() => {
    const vals = data.map(d => d.x);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (scale === 'log') return [Math.max(1, min * 0.8), max * 1.1];
    return [0, max * 1.05];
  }, [data, scale]);

  const yDomain = useMemo(() => {
    const vals = data.map(d => d.y);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (scale === 'log') return [Math.max(100, min * 0.8), max * 1.1];
    return [0, max * 1.05];
  }, [data, scale]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm shadow-diffuse max-w-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Request #{d.index + 1}
        </p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Total tokens</span>
            <span className="metric-mono font-semibold text-slate-700">{d.x.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">TTFT</span>
            <span className="metric-mono font-semibold text-slate-700">{d.y.toLocaleString()}ms</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Cache hit</span>
            <span className="metric-mono font-semibold text-slate-700">{(d.cacheRatio * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">New input</span>
            <span className="metric-mono font-semibold text-slate-700">{d.input.toLocaleString()}</span>
          </div>
          {d.stallCount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-ember">Stalls</span>
              <span className="metric-mono font-semibold text-ember">{d.stallCount}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">TTFT vs Context Size</h2>
          <p className="text-sm text-slate-400 mt-0.5">Color indicates cache efficiency category derived from data.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100/80 rounded-xl p-1">
          {(['log', 'linear'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                scale === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {s === 'log' ? 'Log Scale' : 'Linear'}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              dataKey="x"
              name="Total Tokens"
              scale={scale}
              domain={xDomain as [number, number]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              dy={8}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="TTFT (ms)"
              scale={scale}
              domain={yDomain as [number, number]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
            />
            <ZAxis type="number" dataKey="z" range={[40, 200]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} onClick={(d: any) => onPointClick(d.id)}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colorMap[entry.category]}
                  fillOpacity={0.7}
                  stroke={colorMap[entry.category]}
                  strokeWidth={1.5}
                  cursor="pointer"
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center gap-5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-moss" />
          <span className="text-slate-400">Fast (cached, &gt;{formatThreshold(cacheThreshold)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-slate-400">Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-ember" />
          <span className="text-slate-400">Slow zone ({formatThreshold(lowContext)}–{formatThreshold(cacheThreshold)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber" />
          <span className="text-slate-400">Anomaly (massive new input)</span>
        </div>
      </div>
    </motion.div>
  );
}
