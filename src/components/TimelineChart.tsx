import { useState, useMemo, memo, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import FadingTooltip from './FadingTooltip';

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

interface ChartPoint extends TimingBucket {
  ttft: number;
  total: number;
  tps: number;
  tpsWall: number;
  tpsLoss: number;
  cost: number | null;
  peak: number | null;
  trough: number | null;
  envelope: [number, number] | null;
}

interface ChartMouseState {
  activeLabel?: string | number;
  // recharts types this as number | TooltipIndex(null | string) | undefined;
  // we only consume it via Number(idx) with a typeof-number guard, so unknown is safest.
  activeTooltipIndex?: unknown;
  isTooltipActive?: boolean;
  activeCoordinate?: { x?: number };
}

function CustomTooltip({ active, payload, metric, sessionRate }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }>; metric: MetricKey; sessionRate: number | null }) {
  const data = (payload?.[0]?.payload ?? null) as Record<string, unknown> | null;
  const config = metricConfig[metric];
  const isTpsMode = metric === 'tps';
  const isCostMode = metric === 'cost';

  if (!active || !payload?.length || !data) return null;

  const peak = (data.peak as number | null) ?? null;
  const trough = (data.trough as number | null) ?? null;
  const hasRange = peak != null && trough != null && peak > trough;
  const fmtRange = (v: number) => isCostMode ? formatUsdPerM(v) : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;

  const wallShare = (data.avgTps as number) > 0 ? ((data.avgWallTps as number) / (data.avgTps as number)) * 100 : 0;
  const rate = data.blendedRateUsdPerM as number | null;
  const bucketRate = rate;
  const costRetained = (bucketRate != null && sessionRate != null && bucketRate > 0)
    ? Math.min(100, (sessionRate / bucketRate) * 100)
    : 0;
  const costLoss = (bucketRate != null && sessionRate != null && bucketRate > sessionRate)
    ? ((bucketRate - sessionRate) / bucketRate) * 100
    : 0;
  const costMultiplier = (bucketRate != null && sessionRate != null && sessionRate > 0)
    ? bucketRate / sessionRate
    : 0;
  // Loss% / Cost× per-turn ranges — same shape as the blended point, but
  // evaluated at the trough/peak rates so the spread within the bucket shows
  // (e.g. one $2.37/M call sitting next to a $0.06/M neighbor). Only render the
  // range when the per-turn spread is wide enough to be worth the extra digits;
  // otherwise the bucket is uniform-tight and the blended point alone suffices.
  const lossFrom = (r: number | null) => (r != null && sessionRate != null && r > sessionRate)
    ? ((r - sessionRate) / r) * 100 : 0;
  const multFrom = (r: number | null) => (r != null && sessionRate != null && sessionRate > 0)
    ? r / sessionRate : 0;
  const lossLo = hasRange ? lossFrom(trough) : costLoss;
  const lossHi = hasRange ? lossFrom(peak) : costLoss;
  const multLo = hasRange ? multFrom(trough) : costMultiplier;
  const multHi = hasRange ? multFrom(peak) : costMultiplier;
  const showLossRange = hasRange && (lossHi - lossLo) > 0.1;
  const showMultRange = hasRange && (multHi - multLo) > 0.01;
  const lossStr = showLossRange ? `${lossLo.toFixed(1)}% – ${lossHi.toFixed(1)}%` : `${costLoss.toFixed(1)}%`;
  const multStr = showMultRange ? `${multLo.toFixed(2)}× – ${multHi.toFixed(2)}×` : `${costMultiplier.toFixed(2)}×`;

  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 240 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-1">{String(data.label)}</p>
      <div className="flex items-baseline gap-2">
        <span className="metric-mono text-lg font-bold text-zinc-800 dark:text-zinc-300" style={{ color: isCostMode ? config.color : undefined }}>
          {isCostMode ? formatUsdPerM(rate) : String(data[metric])}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-400">{config.unit} {isTpsMode ? '· Active TPS' : ''}{isCostMode ? '· Blended' : ''}</span>
      </div>
      {hasRange && (
        <div className="flex items-center justify-between text-[11px] mt-1">
          <span className="text-zinc-400 dark:text-zinc-400">Range</span>
          <span className="metric-mono text-zinc-500 dark:text-zinc-400">
            {fmtRange(trough!)} – {fmtRange(peak!)}
          </span>
        </div>
      )}
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
            <span className={`metric-mono font-semibold ${costLoss > 50 ? 'text-ember' : costLoss > 20 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{lossStr}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 dark:text-zinc-400">Cost ×</span>
            <span className={`metric-mono font-semibold ${costMultiplier > 1.5 ? 'text-ember' : costMultiplier > 1.2 ? 'text-amber' : 'text-zinc-500 dark:text-zinc-400'}`}>{multStr}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, costRetained))}%`, backgroundColor: config.color }} />
            <div className="h-full bg-ember" style={{ width: `${Math.max(0, Math.min(100, 100 - costRetained))}%` }} />
          </div>
          {bucketRate == null && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">No cost data in this bucket.</p>
          )}
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 pt-1">Hold on a bucket to decompose cost ×</p>
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

/** A thin bar visualizing a cost multiplier on a 0–2× scale, with a
 *  center tick at 1.0× (the session baseline).
 *
 *  When `range` is given (per-turn min–max within the bucket), draws a
 *  translucent trough→peak span behind the blended point so individual spike
 *  turns stay visible instead of being averaged away. Without `range`, falls
 *  back to the solid 0→value fill (single-blend lookup). */
function MultiplierBar({ value, color, range }: { value: number; color: string; range?: [number, number] }) {
  const clamp = (v: number) => Math.max(0, Math.min(2, v));
  const pct = (v: number) => (clamp(v) / 2) * 100;
  const pointPct = pct(value);
  return (
    <div className="relative h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
      {/* trough→peak span: only relevant in range mode */}
      {range && (() => {
        const lo = pct(range[0]);
        const hi = pct(range[1]);
        return (
          <div
            className="absolute inset-y-0 rounded-full"
            style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%`, backgroundColor: color, opacity: 0.32 }}
          />
        );
      })()}
      {/* blended point (or solid fill when no range) */}
      <div
        className="absolute inset-y-0 rounded-full"
        style={range
          ? { left: `calc(${pointPct}% - 1px)`, width: 2, backgroundColor: color, opacity: 0.95 }
          : { width: `${pointPct}%`, backgroundColor: color, opacity: 0.85 }}
      />
      {/* 1.0× center tick */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-400/50 dark:bg-zinc-500/60" />
    </div>
  );
}

/** Decomposition overlay: a fancy minicard that fades in after the mouse
 *  holds on one bucket for ~1.5s. Sits beside the recharts tooltip card.
 *  Splits $/M cost multiplier into two live factors — Power (intensity:
 *  instantaneous GPU draw) × Joules (efficiency: energy per token) — for
 *  NeuralWatt energy buckets. Energy = power × duration; since price is
 *  flat within a session, Power × captures the cost spikes $/J can't.
 *  Also surfaces the dominant grid and billing attribution (cap ratio). */
function CostDecompositionPanel({
  bucket,
  sessionElecRefs,
  sessionRate,
}: {
  bucket: ChartPoint;
  sessionElecRefs: { elecRate: number | null; joulesPerM: number | null; avgPower: number | null; anyCapped: boolean };
  sessionRate: number | null;
}) {
  const ACCENT = metricConfig.cost.color; // violet
  const bucketEnergyJoules = bucket.totalEnergyJoules;
  const bucketEnergyCost = bucket.totalEnergyCost;
  const bucketTokens = bucket.totalTokens;
  const bucketRate = bucket.blendedRateUsdPerM;
  const costMultiplier = (bucketRate != null && sessionRate != null && sessionRate > 0)
    ? bucketRate / sessionRate : 0;
  const gridId = bucket.dominantGridId || null;
  const attributionRatio = bucket.attributionRatio;
  const capped = bucket.ratioWasCapped === true;

  const canDecompose = (
    sessionElecRefs.joulesPerM != null && sessionElecRefs.joulesPerM > 0 &&
    sessionElecRefs.avgPower != null && sessionElecRefs.avgPower > 0 &&
    bucketEnergyJoules != null && bucketEnergyJoules > 0 &&
    bucketEnergyCost != null && bucketEnergyCost > 0 &&
    bucket.avgPowerWatts != null && bucket.avgPowerWatts > 0 &&
    bucketTokens > 0
  );

  return (
    <div
      className="glass-panel rounded-2xl text-sm overflow-hidden"
      style={{ minWidth: 224, maxWidth: 248 }}
    >
      <div className="px-3 py-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">
          {bucket.label} · Cost Breakdown
        </p>

        {gridId && canDecompose && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
              {gridId}
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">dominant grid</span>
          </div>
        )}

        {!canDecompose ? (
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-snug">
            No NeuralWatt energy data in this bucket — power ⬌ throughput decomposition needs paired energy events.
          </p>
        ) : (() => {
          const bucketPower = bucket.avgPowerWatts!;
          const bucketJoulesPerM = bucketEnergyJoules! / (bucketTokens / 1_000_000);
          const powerMultiplier = bucketPower / sessionElecRefs.avgPower!;
          const jouleMultiplier = bucketJoulesPerM / sessionElecRefs.joulesPerM!;
          // Per-turn power/joules multiplier ranges. Same spirit as the
          // envelope behind the main chart: blended point + trough→peak span
          // so a single heavy turn doesn't get hidden inside the bucket blend.
          // Suppress when the spread is negligible (sub-watt / sub-J) — tight
          // buckets render as a single blended point instead of a fake range.
          const powerRange = (bucket.peakPowerWatts != null && bucket.troughPowerWatts != null
            && bucket.peakPowerWatts - bucket.troughPowerWatts > 1)
            ? [bucket.troughPowerWatts / sessionElecRefs.avgPower!, bucket.peakPowerWatts / sessionElecRefs.avgPower!] as [number, number]
            : null;
          const jouleRange = (bucket.peakJoulesPerM != null && bucket.troughJoulesPerM != null
            && bucket.peakJoulesPerM - bucket.troughJoulesPerM > 1)
            ? [bucket.troughJoulesPerM / sessionElecRefs.joulesPerM!, bucket.peakJoulesPerM / sessionElecRefs.joulesPerM!] as [number, number]
            : null;
          const powerStr = powerRange
            ? `${powerRange[0].toFixed(2)}× – ${powerRange[1].toFixed(2)}×`
            : `${powerMultiplier.toFixed(2)}×${powerMultiplier > 1 ? ' more' : powerMultiplier < 1 ? ' less' : ''}`;
          const jouleStr = jouleRange
            ? `${jouleRange[0].toFixed(2)}× – ${jouleRange[1].toFixed(2)}×`
            : `${jouleMultiplier.toFixed(2)}×${jouleMultiplier > 1 ? ' more' : jouleMultiplier < 1 ? ' less' : ''}`;
          const amber = '#f59e0b';
          const ember = '#ef4444';
          const moss = '#10b981';
          const powerColor = powerMultiplier > 1.2 ? amber : powerMultiplier < 0.9 ? moss : '#a1a1aa';
          const jouleColor = jouleMultiplier > 1.5 ? ember : jouleMultiplier > 1.2 ? amber : '#a1a1aa';
          return (
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: powerColor, opacity: (powerMultiplier > 1.2 || powerMultiplier < 0.9) ? 1 : 0.4 }} />
                    Power
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500" title={`Bucket ${bucketPower.toFixed(0)} W · session ${sessionElecRefs.avgPower!.toFixed(0)} W`}>W</span>
                  </span>
                  <span className={`metric-mono font-semibold ${powerMultiplier > 1.2 ? 'text-amber' : powerMultiplier < 0.9 ? 'text-moss' : 'text-zinc-400 dark:text-zinc-400'}`}>
                    {powerStr}
                  </span>
                </div>
                <MultiplierBar value={powerMultiplier} color={powerColor} range={powerRange ?? undefined} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-zinc-400 dark:text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: jouleColor, opacity: jouleMultiplier > 1.2 ? 1 : 0.4 }} />
                    Joules
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500" title={`Bucket ${bucketJoulesPerM.toFixed(0)} J/M · session ${sessionElecRefs.joulesPerM!.toFixed(0)} J/M`}>J/M</span>
                  </span>
                  <span className={`metric-mono font-semibold ${jouleMultiplier > 1.5 ? 'text-ember' : jouleMultiplier > 1.2 ? 'text-amber' : 'text-zinc-400 dark:text-zinc-400'}`}>
                    {jouleStr}
                  </span>
                </div>
                <MultiplierBar value={jouleMultiplier} color={jouleColor} range={jouleRange ?? undefined} />
              </div>
              <div className="h-px bg-zinc-200/50 dark:bg-white/[0.06]" />
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] leading-snug">
                <span className="metric-mono font-semibold" style={{ color: ACCENT }}>{costMultiplier.toFixed(2)}×</span>
                <span className="text-zinc-400 dark:text-zinc-500">= Power {powerMultiplier.toFixed(2)}×</span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="text-zinc-400 dark:text-zinc-500">Joules {jouleMultiplier.toFixed(2)}×</span>
              </div>
              {attributionRatio != null && (
                <p className="text-[10px] leading-snug text-zinc-400 dark:text-zinc-500">
                  Billed for {(attributionRatio * 100).toFixed(0)}% of node draw{capped ? ' · ratio capped' : ''}.
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TimelineChartInner({ buckets }: Props) {
  const [metric, setMetric] = useState<MetricKey>('ttft');
  const [heldBucket, setHeldBucket] = useState<ChartPoint | null>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; side: 'left' | 'right' } | null>(null);
  const activeLabelRef = useRef<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const revealedRef = useRef(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  // Locked side ('left'|'right') for the decomposition panel — persists across
  // moves so a sweep doesn't flip it left↔right each time the cursor crosses
  // the chart's midpoint. Cleared on reveal-reset so each hold can pick fresh.
  const panelSideRef = useRef<'left' | 'right' | null>(null);
  // Pending placePanel rAF id — cancelled on the next mousemove so high-frequency
  // mice queue at most one measure per frame (a backlog here is what made the
  // tracking stutter in lockstep with the cursor).
  const placeRafRef = useRef<number | null>(null);

  const chartData = useMemo(() => buckets.map(b => {
    // Resolve this metric's per-turn max/min for the bucket so the chart can
    // draw a faint envelope band behind the blended-avg trend line. Without
    // it, a single spike turn (e.g. one $2.37/M call) is averaged into its
    // 3-turn bucket and never shows up on the graph.
    let peak: number | null;
    let trough: number | null;
    switch (metric) {
      case 'ttft':  peak = b.peakTtft;        trough = b.troughTtft;        break;
      case 'total': peak = b.peakTotal;       trough = b.troughTotal;       break;
      case 'tps':   peak = b.peakTps;          trough = b.troughTps;          break;
      case 'cost':  peak = b.peakRateUsdPerM;  trough = b.troughRateUsdPerM;  break;
    }
    return {
      ...b,
      ttft: b.avgTtft,
      total: b.avgTotal,
      tps: b.avgTps,
      tpsWall: b.avgWallTps,
      tpsLoss: b.avgTpsLoss,
      cost: b.blendedRateUsdPerM,
      peak,
      trough,
      envelope: (peak != null && trough != null) ? [trough, peak] as [number, number] : null,
    };
  }), [buckets, metric]);

  const sessionRate = useMemo(() => {
    const totalCost = buckets.reduce((s, b) => s + (b.effectiveCostTotal ?? 0), 0);
    const totalTokens = buckets.reduce((s, b) => s + (b.totalTokens ?? 0), 0);
    if (totalTokens <= 0 || totalCost <= 0) return null;
    return Math.round((totalCost / (totalTokens / 1_000_000)) * 100) / 100;
  }, [buckets]);

  const sessionElecRefs = useMemo(() => {
    let totalJoules = 0;
    let totalEnergyCost = 0;
    let totalEnergyTokens = 0;
    let sumPowerJoules = 0; // joule-weighted power total (for session avg power)
    let anyCapped = false;
    for (const b of buckets) {
      if (b.totalEnergyJoules != null && b.totalEnergyJoules > 0 && b.totalEnergyCost != null && b.totalEnergyCost > 0) {
        totalJoules += b.totalEnergyJoules;
        totalEnergyCost += b.totalEnergyCost;
        totalEnergyTokens += b.totalTokens ?? 0;
        if (b.avgPowerWatts != null && b.avgPowerWatts > 0) {
          sumPowerJoules += b.avgPowerWatts * b.totalEnergyJoules;
        }
        if (b.ratioWasCapped === true) anyCapped = true;
      }
    }
    if (totalJoules <= 0 || totalEnergyCost <= 0 || totalEnergyTokens <= 0) {
      return { elecRate: null, joulesPerM: null, avgPower: null, anyCapped };
    }
    return {
      elecRate: totalEnergyCost / totalJoules,
      joulesPerM: totalJoules / (totalEnergyTokens / 1_000_000),
      avgPower: sumPowerJoules / totalJoules,
      anyCapped,
    };
  }, [buckets]);

  const isCostMode = metric === 'cost';

  // Hold-to-reveal: when the mouse lingers on the same bucket for 1.5s,
  // pop the cost decomposition panel. Reset the timer whenever the active
  // bucket changes; clear on leave. Lives in the parent (not the recharts
  // tooltip content) so it survives recharts' tooltip re-renders.
  //
  // recharts' onMouseMove callback arg carries activeLabel +
  // activeTooltipIndex but NOT activePayload (per recharts'
  // MouseHandlerDataParam type), so we resolve the data point ourselves
  // from chartData by index.
  // Measure the recharts tooltip card and place the decomposition panel
  // immediately beside it (whichever side has room), reading as a paired
  // companion rather than anchored to the chart edges. Re-runs on every
  // mousemove while revealed so the panel keeps an exactly constant `gap`
  // from the tooltip card as it follows the cursor.
  //
  // Two things make the gap actually constant (earlier iterations "overlapped
  // then corrected in ~a second"):
  //  • The tooltip has isAnimationActive={false} (set by <FadingTooltip>) —
  //    without it, recharts glides the wrapper to its new position over 400ms
  //    (the `transform 400ms ease` in TooltipBoundingBox), and measuring the
  //    wrapper mid-glide made the panel chase a moving target → oscillating gap.
  //  • The committed position lands in the same paint as the tooltip via
  //    flushSync around the rAF call in handleChartMouseMove; otherwise the
  //    panel would paint one frame late and the gap would vary by a frame.
  // No CSS transition on the panel — a transition would re-introduce a
  // varying gap, lagging the (now instant) tooltip.
  //
  // Flip jitter is handled by locking the side via panelSideRef: the panel
  // only flips when its chosen side literally no longer fits, so a sweep
  // across the chart never bounces it left↔right.
  const placePanel = useCallback(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const wrapper = container.querySelector('.recharts-tooltip-wrapper') as HTMLElement | null;
    if (!wrapper) { setPanelPos(null); return; }
    const cR = container.getBoundingClientRect();
    const wR = wrapper.getBoundingClientRect();
    if (wR.width === 0 || wR.height === 0) { setPanelPos(null); return; }
    const gap = 8;
    const panelW = 236; // between min 224 / max 248
    const spaceLeft = wR.left - cR.left;
    const spaceRight = cR.right - wR.right;
    const rightFits = spaceRight >= panelW + gap;
    const leftFits = spaceLeft >= panelW + gap;
    // Lock the side: keep the one already in use if it still fits, so the
    // panel never flips mid-sweep. Only (re)decide on the first reveal or
    // when the current side no longer fits.
    let side = panelSideRef.current;
    if (!side || (side === 'right' && !rightFits) || (side === 'left' && !leftFits)) {
      if (rightFits) side = 'right';
      else if (leftFits) side = 'left';
      else side = spaceRight >= spaceLeft ? 'right' : 'left';
    }
    panelSideRef.current = side;
    let left: number;
    if (side === 'right') {
      left = wR.right - cR.left + gap;
      // Clamp into the container when the tight side can't fully fit — the
      // gap compresses only at the extreme edge, never inverts to a flip.
      left = Math.max(gap, Math.min(left, cR.width - panelW - gap));
    } else {
      left = wR.left - cR.left - panelW - gap;
      left = Math.min(cR.width - panelW - gap, Math.max(gap, left));
    }
    const top = Math.max(4, Math.min(wR.top - cR.top, cR.height - 48));
    setPanelPos({ left, top, side });
  }, []);

  const handleChartMouseMove = useCallback((state: ChartMouseState) => {
    const label = state?.activeLabel;
    const idx = state?.activeTooltipIndex;
    // Resolve the bucket both by index and by label — recharts reliably
    // emits activeLabel but can omit activeTooltipIndex; pick whichever hits.
    const byIdx = (typeof idx === 'number' && idx >= 0 && idx < chartData.length) ? chartData[idx] : null;
    const byLabel = (label != null) ? chartData.find(b => String(b.label) === String(label)) ?? null : null;
    const point = byIdx ?? byLabel;
    if (label == null) return;
    const labelKey = String(label);
    const sameBucket = labelKey === activeLabelRef.current;
    activeLabelRef.current = labelKey;
    if (revealedRef.current) {
      // Faithfully follow the tooltip: re-measure on every mousemove so the
      // panel keeps an exactly constant `gap` from the tooltip card's edge as
      // it tracks the cursor. The side is locked in placePanel (no mid-sweep
      // flip), and rAFs are coalesced below so high-frequency mice never queue
      // a backlog (which is what stuttered the tracking in lockstep with the
      // cursor). No CSS transition on the panel — a transition would lag the
      // tooltip and re-introduce a varying gap.
      if (point) setHeldBucket(point);
      if (placeRafRef.current != null) cancelAnimationFrame(placeRafRef.current);
      placeRafRef.current = requestAnimationFrame(() => {
        placeRafRef.current = null;
        // flushSync forces the setPanelPos commit to land before this frame's
        // paint, so the panel paints in lockstep with the tooltip (recharts
        // commits the tooltip's snapped position during the same event flush).
        // Without it the panel position would update one paint late — a small
        // but visible gap variance as the cursor moves.
        flushSync(placePanel);
      });
      return;
    }
    if (sameBucket) return;
    setHeldBucket(null);
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      revealedRef.current = true;
      // Fresh side pick for each reveal — let placePanel decide based on the
      // tooltip's position at reveal time, then lock it for the hold.
      panelSideRef.current = null;
      setHeldBucket(point);
      requestAnimationFrame(() => flushSync(placePanel));
    }, 1500);
  }, [chartData, placePanel]);

  const handleChartMouseLeave = useCallback(() => {
    activeLabelRef.current = null;
    revealedRef.current = false;
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (placeRafRef.current != null) {
      cancelAnimationFrame(placeRafRef.current);
      placeRafRef.current = null;
    }
    panelSideRef.current = null;
    setHeldBucket(null);
    setPanelPos(null);
  }, []);

  // Cleanup hold timer + pending rAF on unmount.
  useEffect(() => () => {
    if (holdTimerRef.current != null) window.clearTimeout(holdTimerRef.current);
    if (placeRafRef.current != null) cancelAnimationFrame(placeRafRef.current);
  }, []);

  // Switching metrics or underlying data invalidates any held panel.
  useEffect(() => {
    activeLabelRef.current = null;
    revealedRef.current = false;
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (placeRafRef.current != null) {
      cancelAnimationFrame(placeRafRef.current);
      placeRafRef.current = null;
    }
    panelSideRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- inputs changed; the held snapshot is stale and must clear.
    setHeldBucket(null);
    setPanelPos(null);
  }, [metric, buckets]);

  const config = metricConfig[metric];

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

      <div ref={chartContainerRef} className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            onMouseMove={handleChartMouseMove}
            onMouseLeave={handleChartMouseLeave}
          >
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
            <FadingTooltip content={<CustomTooltip metric={metric} sessionRate={sessionRate} />} />
            <Area
              type="monotone"
              dataKey="envelope"
              stroke={config.color}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="transparent"
              animationDuration={400}
              connectNulls={!isCostMode}
            />
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

        <AnimatePresence>
          {isCostMode && heldBucket && panelPos && (
            <motion.div
              initial={{ opacity: 0, x: panelPos.side === 'left' ? -8 : 8, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: panelPos.side === 'left' ? -8 : 8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              // pointer-events-none so the overlay never steals the hover from
              // the chart underneath — otherwise recharts sees "mouse left
              // the chart", closes its tooltip, and the panel (which is
              // measured from that tooltip) disappears in a loop.
              className="absolute z-30 pointer-events-none"
              style={{ left: panelPos.left, top: panelPos.top, width: 236 }}
            >
              <CostDecompositionPanel
                bucket={heldBucket}
                sessionElecRefs={sessionElecRefs}
                sessionRate={sessionRate}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-zinc-400 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded-full" style={{ backgroundColor: config.color }} />
          {isCostMode ? 'Blended $/M' : 'Bucket average'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0 border-t border-dashed" style={{ borderColor: config.color, opacity: 0.5 }} />
          Per-turn min–max
        </span>
      </div>
    </motion.div>
  );
}

export default memo(TimelineChartInner);
