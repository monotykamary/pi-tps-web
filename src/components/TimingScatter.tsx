'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell
} from 'recharts';
import type { TpsEvent, EnergyPayload, DataThresholds } from '../types';
import { computeEffectiveTps, formatThreshold, formatDuration } from '../lib/parser';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
  onPointClick: (id: string) => void;
  thresholds: DataThresholds;
}

function TimingScatterInner({ events, onPointClick, thresholds }: Props) {
  const [scale, setScale] = useState<'linear' | 'log'>('log');
  const { cacheThreshold, lowContext, slowTtft, fastTtft, highNewInputRatio, anomalyInputThreshold } = thresholds;

  const data = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return sorted.map((e, i) => {
      const cacheRatio = e.data.tokens.cacheRead / e.data.tokens.total;
      const newRatio = e.data.tokens.input / e.data.tokens.total;
      let category: 'fast' | 'normal' | 'slow' | 'anomaly' = 'normal';
      if (e.data.tokens.input > anomalyInputThreshold) category = 'anomaly';
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
        tps: computeEffectiveTps(e.data),
        wallTps: e.data.timing.totalMs > 0 ? e.data.tokens.output / (e.data.timing.totalMs / 1000) : 0,
        stallCount: e.data.timing.stallCount,
        stallMs: e.data.timing.stallMs,
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
    const loss = d.tps > 0 ? ((d.tps - d.wallTps) / d.tps) * 100 : 0;
    const wallShare = d.tps > 0 ? (d.wallTps / d.tps) * 100 : 0;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 220 }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">
          Request #{d.index + 1}
        </p>
        <div className="space-y-1.5">
          <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Total tokens</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{d.x.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">TTFT</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatDuration(d.y)}</span>
          </div>
          <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Cache hit</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{(d.cacheRatio * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between gap-2 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">New input</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{d.input.toLocaleString()}</span>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-1.5">Speed</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs whitespace-nowrap">
              <span className="text-zinc-400 dark:text-zinc-400">Active</span>
              <span className="metric-mono font-semibold text-moss">{d.tps.toFixed(1)} tok/s</span>
            </div>
            <div className="flex justify-between text-xs whitespace-nowrap">
              <span className="text-zinc-400 dark:text-zinc-400">Wall</span>
              <span className="metric-mono font-semibold text-accent">{d.wallTps.toFixed(1)} tok/s</span>
            </div>
            <div className="flex justify-between text-xs whitespace-nowrap">
              <span className="text-zinc-400 dark:text-zinc-400">Loss</span>
              <span className={`metric-mono font-semibold ${loss > 50 ? 'text-ember' : loss > 20 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{loss.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
              <div className="h-full bg-moss" style={{ width: `${Math.max(0, Math.min(100, wallShare))}%` }} />
              <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - wallShare))}%` }} />
            </div>
          </div>
        </div>
        {d.stallCount > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-zinc-200/50 dark:border-white/[0.06]">
            <div className="flex justify-between text-xs whitespace-nowrap">
              <span className="text-ember">Stalls</span>
              <span className="metric-mono font-semibold text-ember">{d.stallCount} · {formatDuration(d.stallMs)}</span>
            </div>
          </div>
        )}
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
          <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">TTFT vs Context Size</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 mt-0.5">Color indicates cache efficiency category derived from data.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-100/80 dark:bg-white/[0.06] rounded-xl p-1">
          {(['log', 'linear'] as const).map(s => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                scale === s ? 'bg-white dark:bg-zinc-600 text-zinc-800 dark:text-zinc-300 shadow-sm' : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" />
            <XAxis
              type="number"
              dataKey="x"
              name="Total Tokens"
              scale={scale}
              domain={xDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
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
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
            />
            <ZAxis type="number" dataKey="z" range={[40, 200]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} allowEscapeViewBox={{ x: true, y: true }} />
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

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-moss" />
          <span className="text-zinc-400 dark:text-zinc-400">Fast (cached, &gt;{formatThreshold(cacheThreshold)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-zinc-400 dark:text-zinc-400">Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-ember" />
          <span className="text-zinc-400 dark:text-zinc-400">Slow zone ({formatThreshold(lowContext)}–{formatThreshold(cacheThreshold)})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber" />
          <span className="text-zinc-400 dark:text-zinc-400">Anomaly (massive new input)</span>
        </div>
      </div>
    </motion.div>
  );
}

export default React.memo(TimingScatterInner);
