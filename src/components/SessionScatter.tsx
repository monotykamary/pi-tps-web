'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell
} from 'recharts';
import type { MultiSessionSummary } from '../types';
import { formatCurrency, formatDuration, formatTps, formatEnergy } from '../lib/parser';

interface Props {
  multiSummary: MultiSessionSummary;
  onSessionClick: (sessionId: string) => void;
}

function SessionScatterInner({ multiSummary, onSessionClick }: Props) {
  const hasCost = multiSummary.sessions.some(s => s.totalCostUsd !== null);

  const data = useMemo(() => {
    return multiSummary.sessions.map(s => ({
      x: s.weightedTps,
      y: hasCost ? (s.totalCostUsd ?? 0) : s.wallClockMs,
      z: s.totalCalls,
      sessionId: s.sessionId,
      fileName: s.fileName,
      totalTokens: s.totalTokens,
      totalOutput: s.totalOutput,
      totalCalls: s.totalCalls,
      avgTtft: s.avgTtft,
      avgTps: s.avgTps,
      weightedTps: s.weightedTps,
      model: s.model,
      energy: s.totalEnergyJoules,
      wallClockMs: s.wallClockMs,
    }));
  }, [multiSummary, hasCost]);

  const yLabel = hasCost ? 'Cost (USD)' : 'Wall-clock Duration';
  const yFormatter = hasCost
    ? (v: number) => formatCurrency(v)
    : (v: number) => formatDuration(v);

  const xDomain = useMemo(() => {
    if (data.length === 0) return [0, 100];
    const vals = data.map(d => d.x);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.1, 1);
    return [Math.max(0, min - pad), max + pad];
  }, [data]);

  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 1];
    const vals = data.map(d => d.y);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.1, hasCost ? 0.001 : 1000);
    return [Math.max(0, min - pad), max + pad];
  }, [data, hasCost]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 240 }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">
          {d.fileName || d.sessionId.slice(0, 24)}
        </p>
        <div className="space-y-1.5">
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Requests</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{d.totalCalls}</span>
          </div>
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Tokens</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{d.totalTokens.toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Wtd TPS</span>
            <span className="metric-mono font-semibold text-accent">{formatTps(d.weightedTps)}</span>
          </div>
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Avg TPS</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatTps(d.avgTps)}</span>
          </div>
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Avg TTFT</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatDuration(Math.round(d.avgTtft))}</span>
          </div>
          {hasCost && (
            <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
              <span className="text-zinc-400 dark:text-zinc-400">Cost</span>
              <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatCurrency(d.y)}</span>
            </div>
          )}
          {d.energy !== null && (
            <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
              <span className="text-zinc-400 dark:text-zinc-400">Energy</span>
              <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatEnergy(d.energy)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Model</span>
            <span className="text-zinc-600 dark:text-zinc-300 truncate max-w-[10rem]">{d.model.split('/').pop()}</span>
          </div>
        </div>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-2 pt-1.5 border-t border-zinc-200/50 dark:border-white/[0.06]">Click to focus on this session</p>
      </div>
    );
  };

  if (data.length < 2) return null;

  // Color by model — hash model name to one of a set of colors
  const modelColors = [
    '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed',
    '#db2777', '#0284c7', '#65a30d', '#ea580c', '#6d28d9',
  ];
  const modelToColor = new Map<string, string>();
  let colorIdx = 0;
  for (const s of multiSummary.sessions) {
    if (!modelToColor.has(s.model)) {
      modelToColor.set(s.model, modelColors[colorIdx % modelColors.length]);
      colorIdx++;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Session Comparison</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 mt-0.5">Each dot is one session. Bubble size = request count. Color = model.</p>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" />
            <XAxis
              type="number"
              dataKey="x"
              name="Weighted TPS"
              domain={xDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dy={8}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={yDomain as [number, number]}
              tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
              axisLine={false}
              tickLine={false}
              dx={-4}
              tickFormatter={yFormatter}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={data} onClick={(d: any) => onSessionClick(d.sessionId)}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={modelToColor.get(entry.model) ?? '#0891b2'}
                  fillOpacity={0.65}
                  stroke={modelToColor.get(entry.model) ?? '#0891b2'}
                  strokeWidth={1.5}
                  cursor="pointer"
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Model color legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
        {Array.from(modelToColor.entries()).map(([model, color]) => (
          <div key={model} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-zinc-400 dark:text-zinc-400">{model.split('/').pop()}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default React.memo(SessionScatterInner);
