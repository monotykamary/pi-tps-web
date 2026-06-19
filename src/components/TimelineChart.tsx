import { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

import type { TimingBucket } from '../types';
import { formatUsdPerM } from '../lib/format/format';

interface Props {
  buckets: TimingBucket[];
  onBucketClick: (bucket: TimingBucket) => void;
}

type MetricKey = 'ttft' | 'total' | 'tps' | 'cost';

const metricConfig: Record<MetricKey, { label: string; color: string; fill: string; unit: string }> = {
  ttft: { label: 'TTFT', color: '#0891b2', fill: 'rgba(8,145,178,0.08)', unit: 'ms' },
  total: { label: 'Total Time', color: '#dc2626', fill: 'rgba(220,38,38,0.06)', unit: 'ms' },
  tps: { label: 'Speed', color: '#059669', fill: 'rgba(5,150,105,0.08)', unit: 't/s' },
  cost: { label: '$/M', color: '#7c3aed', fill: 'rgba(124,58,237,0.08)', unit: '$/M' },
};

function CustomTooltip({ active, payload, metric, sessionRate }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }>; metric: MetricKey; sessionRate: number | null }) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload as Record<string, unknown>;
  const config = metricConfig[metric];
  const isTpsMode = metric === 'tps';
  const isCostMode = metric === 'cost';
  const wallShare = (data.avgTps as number) > 0 ? ((data.avgWallTps as number) / (data.avgTps as number)) * 100 : 0;
  const rate = data.blendedRateUsdPerM as number | null;
  // Cost bar mirrors the speed (wall-vs-loss) bar: bucket rate plays
  // 'active', session-blend rate plays 'wall'. retained = session/bucket
  // (how close this bucket is to the session average); loss = the deficit
  // when the bucket is pricier than the session. Buckets cheaper than the
  // session aren't 'loss', so loss is floored at 0.
  const bucketRate = rate;
  const costRetained = (bucketRate != null && sessionRate != null && bucketRate > 0)
    ? Math.min(100, (sessionRate / bucketRate) * 100)
    : 0;
  const costLoss = (bucketRate != null && sessionRate != null && bucketRate > sessionRate)
    ? ((bucketRate - sessionRate) / bucketRate) * 100
    : 0;
  // Cost multiplier: how many times the bucket's $/M rises vs the session
  // blend due to loss. Baseline 1.00× at the session average; a bucket at
  // 20% loss shows 1.25×. Buckets cheaper than the session show < 1.0×
  // (the honest inverse signal — not floored, since 'how many times the
  // cost rises' genuinely inverts for sub-average buckets).
  const costMultiplier = (bucketRate != null && sessionRate != null && sessionRate > 0)
    ? bucketRate / sessionRate
    : 0;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 240 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-1">{String(data.label)}</p>
      <div className="flex items-baseline gap-2">
        <span className="metric-mono text-lg font-bold text-zinc-800 dark:text-zinc-300" style={{ color: isCostMode ? config.color : undefined }}>
          {isCostMode ? formatUsdPerM(rate) : String(data[metric])}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-400">{config.unit} {isTpsMode ? '· Active TPS' : ''}{isCostMode ? '· Blended' : ''}</span>
      </div>
      {isTpsMode && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Active</span>
            <span className="metric-mono font-semibold text-moss">{String(data.avgTps)} tok/s</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Wall</span>
            <span className="metric-mono font-semibold text-zinc-500 dark:text-zinc-400">{String(data.tpsWall)} tok/s</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Loss</span>
            <span className={`metric-mono font-semibold ${(data.tpsLoss as number) > 50 ? 'text-ember' : (data.tpsLoss as number) > 20 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{(data.tpsLoss as number).toFixed(1)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full bg-moss" style={{ width: `${Math.max(0, Math.min(100, wallShare))}%` }} />
            <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - wallShare))}%` }} />
          </div>
        </div>
      )}
      {isCostMode && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Bucket</span>
            <span className="metric-mono font-semibold" style={{ color: config.color }}>{formatUsdPerM(bucketRate)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Session</span>
            <span className="metric-mono font-semibold text-zinc-500 dark:text-zinc-400">{formatUsdPerM(sessionRate)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Loss</span>
            <span className={`metric-mono font-semibold ${costLoss > 50 ? 'text-ember' : costLoss > 20 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{costLoss.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Cost ×</span>
            <span className={`metric-mono font-semibold ${costMultiplier > 1.5 ? 'text-ember' : costMultiplier > 1.2 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{costMultiplier.toFixed(2)}×</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, costRetained))}%`, backgroundColor: config.color }} />
            <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - costRetained))}%` }} />
          </div>
          {bucketRate == null && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">No cost data in this bucket.</p>
          )}
        </div>
      )}
      <div className={`pt-1.5 border-t border-zinc-200/50 dark:border-white/[0.06] grid grid-cols-3 gap-3 text-[11px] mt-1.5`}>
        <div>
          <span className="text-zinc-400 dark:text-zinc-400">Calls</span>
          <p className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{String(data.count)}</p>
        </div>
        <div>
          <span className="text-zinc-400 dark:text-zinc-400">Tokens</span>
          <p className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{((data.totalTokens as number) / 1000).toFixed(1)}k</p>
        </div>
        <div>
          <span className="text-zinc-400 dark:text-zinc-400">{isCostMode ? 'Avg TPS' : '$/M'}</span>
          <p className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">
            {isCostMode ? String(data.avgTps) : formatUsdPerM(rate)}
          </p>
        </div>
      </div>
    </div>
  );
}

function TimelineChartInner({ buckets }: Props) {
  const [metric, setMetric] = useState<MetricKey>('ttft');

  const chartData = useMemo(() => buckets.map(b => ({
    ...b,
    ttft: b.avgTtft,
    total: b.avgTotal,
    tps: b.avgTps,
    tpsWall: b.avgWallTps,
    tpsLoss: b.avgTpsLoss,
    // The 'cost' data key carries the bucket's blended $/M. CustomTooltip
    // also reads blendedRateUsdPerM directly for the headline + footer.
    cost: b.blendedRateUsdPerM,
  })), [buckets]);

  // Session-wide blended $/M: sum of per-bucket effective cost ÷ sum of
  // tokens (scaled to millions). Same definition as the per-bucket blend,
  // just summed across all buckets so the chart can show each bucket's
  // deviation from the session average in the loss bar. null when no cost.
  const sessionRate = useMemo(() => {
    const totalCost = buckets.reduce((s, b) => s + (b.effectiveCostTotal ?? 0), 0);
    const totalTokens = buckets.reduce((s, b) => s + (b.totalTokens ?? 0), 0);
    if (totalTokens <= 0 || totalCost <= 0) return null;
    return Math.round((totalCost / (totalTokens / 1_000_000)) * 100) / 100;
  }, [buckets]);

  const config = metricConfig[metric];
  const isCostMode = metric === 'cost';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Conversation Timeline</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-400 mt-0.5">Performance patterns across the session</p>
        </div>
        <div className="flex items-center gap-1.5 bg-zinc-100/80 dark:bg-white/[0.06] rounded-xl p-1">
          {(['ttft', 'total', 'tps', 'cost'] as const).map(m => (
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
              tickFormatter={(v: number) => isCostMode ? (v == null || !Number.isFinite(v) ? '-' : `$${v}`) : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
            />
            <Tooltip content={<CustomTooltip metric={metric} sessionRate={sessionRate} />} />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              fill={`url(#fill-${metric})`}
              animationDuration={400}
              connectNulls={!isCostMode}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

export default memo(TimelineChartInner);
