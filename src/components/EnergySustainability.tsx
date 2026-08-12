import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { Leaf, Lightning, MapPin, ChartLineUp } from '@phosphor-icons/react';
import { MetricPill } from './metrics/MetricPill';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine,
  ComposedChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import FadingTooltip from './FadingTooltip';

import { useDuckQuery } from '../hooks/useDuckQuery';
import { queryEnergyDetails } from '../lib/queries';
import type { EnergyDetailRow, EnergyAggregateRow } from '../lib/queries';
import { formatEnergy, formatNumber } from '../lib/format/format';

interface Props {
  dbVersion: number;
  activeSessionId: string | null;
  selectedModel: string | null;
  ready?: boolean;
}

function Co2Tooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 200 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Request #{String(d.index)}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">CO₂</span>
          <span className="metric-mono font-semibold text-moss">{formatCarbon(Number(d.carbonGCo2eq))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Cumulative</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatCarbon(Number(d.cumulativeCarbonG))}</span>
        </div>
        {!!d.gridId && (
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Grid</span>
            <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{String(d.gridId)}</span>
          </div>
        )}
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Energy</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatEnergy(Number(d.joules))}</span>
        </div>
      </div>
    </div>
  );
}

function ApcTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  const hitRate = Number(d.apcHitRate);
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 200 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">APC Stats · Request #{String(d.index)}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Hit rate</span>
          <span className={`metric-mono font-semibold ${hitRate >= 0.8 ? 'text-moss' : hitRate >= 0.5 ? 'text-accent' : 'text-amber'}`}>
            {(hitRate * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Hit tokens</span>
          <span className="metric-mono font-semibold text-moss">{formatNumber(Number(d.apcHitTokens))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Miss tokens</span>
          <span className="metric-mono font-semibold text-amber">{formatNumber(Number(d.apcMissTokens))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Context</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatNumber(Number(d.contextTokens))} tok</span>
        </div>
      </div>
    </div>
  );
}

function PowerTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 200 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Request #{String(d.index)}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Avg power</span>
          <span className="metric-mono font-semibold text-accent">{formatWatts(Number(d.avgPowerWatts))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Energy</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatEnergy(Number(d.joules))}</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Duration</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{(Number(d.totalMs) / 1000).toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}

function ContextTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, unknown> }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as Record<string, unknown>;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-sm" style={{ minWidth: 220 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">MCR · Request #{String(d.index)}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Context</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatNumber(Number(d.contextTokens))} tok</span>
        </div>
        <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
          <span className="text-zinc-400 dark:text-zinc-400">Output</span>
          <span className="metric-mono font-semibold text-zinc-700 dark:text-zinc-300">{formatNumber(Number(d.outputTokens))} tok</span>
        </div>
        {!!d.mcrMode && (
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Mode</span>
            <span className="metric-mono font-semibold text-accent">{String(d.mcrMode)}</span>
          </div>
        )}
        {Number(d.compactionEnergyJoules) > 0 && (
          <div className="flex justify-between gap-3 text-xs whitespace-nowrap">
            <span className="text-zinc-400 dark:text-zinc-400">Compaction</span>
            <span className="metric-mono font-semibold text-amber">{formatEnergy(Number(d.compactionEnergyJoules))}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCarbon(g: number | null): string {
  if (g === null) return '-';
  if (g < 0.001) return `${(g * 1000).toFixed(2)} μg`;
  if (g < 1) return `${(g * 1000).toFixed(1)} mg`;
  if (g < 1000) return `${g.toFixed(3)} g`;
  return `${(g / 1000).toFixed(3)} kg`;
}

function formatCarbonShort(g: number | null): string {
  if (g === null) return '-';
  if (g < 0.01) return '<0.01g';
  if (g < 1) return `${g.toFixed(2)}g`;
  if (g < 1000) return `${g.toFixed(1)}g`;
  return `${(g / 1000).toFixed(2)}kg`;
}

function formatWatts(w: number | null): string {
  if (w === null) return '-';
  if (w < 1) return `${(w * 1000).toFixed(0)} mW`;
  if (w < 1000) return `${w.toFixed(1)} W`;
  return `${(w / 1000).toFixed(2)} kW`;
}

function EnergySustainabilityInner({ dbVersion, activeSessionId, selectedModel, ready = true }: Props) {
  const { data: queryData } = useDuckQuery<{
    details: EnergyDetailRow[];
    aggregates: EnergyAggregateRow;
  } | null>(
    () => queryEnergyDetails(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel],
    { skip: !ready },
  );

  // Stabilize the details array identity (the `?? []` fallback would
  // otherwise create a new array each render and bust enrichedDetails'
  // useMemo dep, per the react-hooks/exhaustive-deps warning).
  const details = useMemo(() => queryData?.details ?? [], [queryData]);
  const aggregates = queryData?.aggregates ?? null;

  const { hasCarbonData, hasApcData, hasPowerData, hasMcrData, hasAnySseData } = aggregates ?? { hasCarbonData: false, hasApcData: false, hasPowerData: false, hasMcrData: false, hasAnySseData: false };

  // Compute cumulative carbon and timeLabel for chart usage.
  // Built from a single reduce pass so no outer variable is mutated
  // during the map (which would trip the react-hooks/immutability rule).
  const enrichedDetails = useMemo(() => {
    // Functional forward pass: each step produces { running, item } so no
    // outer variable is reassigned during iteration (react-hooks/immutability
    // forbids mutation during render, even inside useMemo).
    return details.reduce<Array<EnergyDetailRow & { cumulativeCarbonG: number; timeLabel: string }>>(
      (acc, d) => {
        const prevRunning = acc.length > 0 ? acc[acc.length - 1].cumulativeCarbonG : 0;
        const running = prevRunning + (d.carbonGCo2eq ?? 0);
        acc.push({
          ...d,
          timeLabel: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cumulativeCarbonG: running,
        });
        return acc;
      },
      [],
    );
  }, [details]);

  if (!aggregates || !hasAnySseData || details.length === 0) return null;

  // After this guard, aggregates is non-null
  const agg = aggregates;

  const co2ChartData = enrichedDetails.filter(d => d.carbonGCo2eq !== null);
  const apcChartData = enrichedDetails.filter(d => d.apcHitRate !== null);
  const powerChartData = enrichedDetails.filter(d => d.avgPowerWatts !== null);
  const contextChartData = enrichedDetails.filter(d => d.contextTokens !== null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-moss/10 dark:bg-moss/15 rounded-xl">
          <Leaf size={20} className="text-moss" weight="bold" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Energy & Sustainability</h2>
          <p className="text-sm text-zinc-400 dark:text-zinc-400">Carbon footprint, power profile, and prompt caching efficiency</p>
        </div>
      </div>

      {/* Metric Pills Row — hoverable with SmartTooltip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2">
        {hasCarbonData && (
          <MetricPill
            icon={Leaf}
            label="CO₂ Emissions"
            color="moss"
            value={formatCarbonShort(agg.totalCarbon)}
            subLabel="/req"
            subValue={formatCarbonShort(agg.totalCarbon / (co2ChartData.length || 1))}
            tooltip={
              <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Carbon Footprint</p>
                  <Leaf size={12} weight="bold" className="text-moss" />
                </div>
                <div className="flex items-baseline gap-2 mb-2.5">
                  <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatCarbonShort(agg.totalCarbon)}</p>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">CO₂ equivalent</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 min-w-0 rounded-lg bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-moss">Per request</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCarbonShort(agg.totalCarbon / (co2ChartData.length || 1))}</p>
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Requests</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{co2ChartData.length}</p>
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Total energy</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatEnergy(agg.totalJoules)}</p>
                  </div>
                </div>
                {(() => {
                  const totalKm = agg.totalCarbon / 170;
                  const phoneCharges = agg.totalCarbon / 8.22;
                  const ledHours = agg.totalCarbon / ((agg.avgGridIntensity ?? 475) * 9 / 3_600_000);
                  return (
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-ember" />
                          Car distance
                        </span>
                        <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{totalKm >= 1 ? `${totalKm.toFixed(1)} km` : `${(totalKm * 1000).toFixed(0)} m`}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                          Phone charges
                        </span>
                        <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{phoneCharges.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-moss" />
                          9W LED hours
                        </span>
                        <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{ledHours.toFixed(1)}h</span>
                      </div>
                    </div>
                  );
                })()}
                {agg.avgGridIntensity !== null && (
                  <div className="flex items-center justify-between text-[10px] mb-2">
                    <span className="text-zinc-500 dark:text-zinc-400">Grid carbon intensity</span>
                    <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{Math.round(agg.avgGridIntensity)} gCO₂/kWh</span>
                  </div>
                )}
                <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
                  Carbon emissions calculated from measured inference energy × grid carbon intensity. Equivalencies use EPA standards: ~170g CO₂/km (avg car), ~8.22g per smartphone charge.
                </p>
              </div>
            }
          />
        )}

        {hasApcData && agg.avgApcHitRate !== null && (
          <MetricPill
            icon={ChartLineUp}
            label="APC Hit Rate"
            color="accent"
            value={`${(agg.avgApcHitRate * 100).toFixed(1)}%`}
            tooltip={
              <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Automatic Prompt Caching</p>
                  <ChartLineUp size={12} weight="bold" className="text-accent" />
                </div>
                <div className="flex items-baseline gap-2 mb-2.5">
                  <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{(agg.avgApcHitRate * 100).toFixed(1)}%</p>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">avg hit rate</span>
                </div>
                {(() => {
                  const totalHit = apcChartData.reduce((s, d) => s + (d.apcHitTokens ?? 0), 0);
                  const totalMiss = apcChartData.reduce((s, d) => s + (d.apcMissTokens ?? 0), 0);
                  const total = totalHit + totalMiss;
                  const bestRate = Math.max(...apcChartData.map(d => d.apcHitRate ?? 0));
                  const worstRate = Math.min(...apcChartData.map(d => d.apcHitRate ?? 1));
                  return (
                    <>
                      <div className="flex gap-2 mb-3">
                        <div className="flex-1 min-w-0 rounded-lg bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
                          <p className="text-[8px] font-semibold uppercase tracking-wider text-moss">Hits</p>
                          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatNumber(totalHit)}</p>
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
                          <p className="text-[8px] font-semibold uppercase tracking-wider text-amber">Misses</p>
                          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatNumber(totalMiss)}</p>
                        </div>
                        <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Requests</p>
                          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{apcChartData.length}</p>
                        </div>
                      </div>
                      {total > 0 && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-[9px] text-zinc-400 mb-1">
                            <span>Cache retention</span>
                            <span className="metric-mono font-medium text-moss">{((totalHit / total) * 100).toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
                            <div className="h-full bg-moss" style={{ width: `${(totalHit / total) * 100}%` }} />
                            <div className="h-full bg-amber" style={{ width: `${(totalMiss / total) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 dark:text-zinc-400">Best</span>
                          <span className="metric-mono font-medium text-moss">{(bestRate * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 dark:text-zinc-400">Worst</span>
                          <span className="metric-mono font-medium text-ember">{(worstRate * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
                <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
                  APC (Automatic Prompt Caching) reuses previously processed prompt tokens, avoiding redundant computation. A higher hit rate means fewer tokens need reprocessing, reducing both latency and energy.
                </p>
              </div>
            }
          />
        )}

        {hasPowerData && agg.avgPowerWatts !== null && (
          <MetricPill
            icon={Lightning}
            label="Avg Power Draw"
            color="amber"
            value={formatWatts(agg.avgPowerWatts)}
            subLabel="/req"
            subValue={formatEnergy(agg.totalJoules / (powerChartData.length || 1))}
            tooltip={
              <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Power Profile</p>
                  <Lightning size={12} weight="bold" className="text-amber" />
                </div>
                <div className="flex items-baseline gap-2 mb-2.5">
                  <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatWatts(agg.avgPowerWatts)}</p>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">avg across requests</span>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="flex-1 min-w-0 rounded-lg bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-amber">Total energy</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatEnergy(agg.totalJoules)}</p>
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Energy/req</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatEnergy(agg.totalJoules / (powerChartData.length || 1))}</p>
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Peak</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatWatts(Math.max(...powerChartData.map(d => d.avgPowerWatts ?? 0)))}</p>
                  </div>
                </div>
                {(() => {
                  const pows = powerChartData.map(d => d.avgPowerWatts ?? 0);
                  const min = Math.min(...pows);
                  const max = Math.max(...pows);
                  const kWh = agg.totalJoules / 3_600_000;
                  const phoneCharges = agg.totalJoules / 18_000;
                  const ledHours = agg.totalJoules / (9 * 3600);
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 dark:text-zinc-400">Min power</span>
                          <span className="metric-mono font-medium text-moss">{formatWatts(min)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 dark:text-zinc-400">Max power</span>
                          <span className="metric-mono font-medium text-ember">{formatWatts(max)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 dark:text-zinc-400">kWh</span>
                          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{kWh.toFixed(4)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500 dark:text-zinc-400">Phone charges</span>
                          <span className="metric-mono font-medium text-accent">{phoneCharges.toFixed(1)}</span>
                        </div>
                      </div>
                      {ledHours > 0 && (
                        <div className="flex items-center justify-between text-[10px] mb-2">
                          <span className="text-zinc-500 dark:text-zinc-400">9W LED bulb</span>
                          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{ledHours.toFixed(1)}h</span>
                        </div>
                      )}
                    </>
                  );
                })()}
                {(() => {
                  const capped = details.filter(d => d.ratioWasCapped === true).length;
                  if (capped === 0) return null;
                  return (
                    <div className="flex items-center justify-between text-[10px] mb-2">
                      <span className="text-zinc-500 dark:text-zinc-400">Ratio-capped requests</span>
                      <span className="metric-mono font-medium text-amber">{capped}/{details.length}</span>
                    </div>
                  );
                })()}
                <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
                  Average power draw during inference. Energy per request includes all GPU, memory, and overhead costs attributed by NeuralWatt profiling.
                </p>
              </div>
            }
          />
        )}

        {agg.primaryGridId && (
          <MetricPill
            icon={MapPin}
            label="Grid Region"
            value={agg.primaryGridId}
            subValue={agg.avgGridIntensity !== null ? `${Math.round(agg.avgGridIntensity)} gCO₂/kWh` : undefined}
            tooltip={
              <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Grid Region</p>
                  <MapPin size={12} weight="bold" className="text-accent" />
                </div>
                <div className="flex items-baseline gap-2 mb-2.5">
                  <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{agg.primaryGridId}</p>
                </div>
                <div className="flex gap-2 mb-3">
                  {agg.avgGridIntensity !== null && (
                    <div className="flex-1 min-w-0 rounded-lg bg-accent/5 dark:bg-accent/10 p-1.5 text-center">
                      <p className="text-[8px] font-semibold uppercase tracking-wider text-accent">Carbon intensity</p>
                      <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{Math.round(agg.avgGridIntensity)} g/kWh</p>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Total CO₂</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCarbonShort(agg.totalCarbon)}</p>
                  </div>
                  <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Total energy</p>
                    <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatEnergy(agg.totalJoules)}</p>
                  </div>
                </div>
                {(() => {
                  const gridGroups = new Map<string, { count: number; carbon: number; intensity: number }>();
                  for (const d of co2ChartData) {
                    if (!d.gridId || d.carbonGCo2eq === null) continue;
                    const g = d.gridCarbonIntensity ?? 0;
                    const existing = gridGroups.get(d.gridId);
                    if (existing) {
                      existing.count++;
                      existing.carbon += d.carbonGCo2eq;
                    } else {
                      gridGroups.set(d.gridId, { count: 1, carbon: d.carbonGCo2eq, intensity: g });
                    }
                  }
                  if (gridGroups.size <= 1) return null;
                  const totalGridCarbon = Array.from(gridGroups.values()).reduce((s, g) => s + g.carbon, 0);
                  return (
                    <div className="space-y-1.5 mb-3 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-1">Emissions by Grid</p>
                      {Array.from(gridGroups.entries())
                        .sort((a, b) => b[1].carbon - a[1].carbon)
                        .map(([gridId, info]) => {
                          const pct = totalGridCarbon > 0 ? (info.carbon / totalGridCarbon) * 100 : 0;
                          return (
                            <div key={gridId}>
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-zinc-500 dark:text-zinc-400">{gridId} <span className="text-zinc-400">({info.intensity}g/kWh)</span></span>
                                <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatCarbonShort(info.carbon)}</span>
                              </div>
                              <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06] mt-0.5">
                                <div className="h-full bg-moss/70" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  );
                })()}
                <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
                  The electrical grid region determines the carbon intensity used to convert energy measurements into CO₂ emissions. Lower carbon intensity = greener energy. Data from NeuralWatt grid mapping.
                </p>
              </div>
            }
          />
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CO₂ Emissions Over Time */}
        {hasCarbonData && co2ChartData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="card-surface p-6"
          >
            <div className="mb-4">
              <h3 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Carbon Emissions</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-0.5">Cumulative CO₂ per request and individual contribution</p>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={co2ChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="co2Fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
                  <XAxis
                    dataKey="index"
                    tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="cumulative"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dx={-4}
                    tickFormatter={(v: number) => v < 1 ? `${(v * 1000).toFixed(0)}mg` : `${v.toFixed(2)}g`}
                  />
                  <YAxis
                    yAxisId="perRequest"
                    orientation="right"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dx={4}
                    tickFormatter={(v: number) => v < 0.01 ? `${(v * 1000).toFixed(0)}mg` : `${v.toFixed(2)}g`}
                  />
                  <FadingTooltip content={<Co2Tooltip />} />
                  <Area
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulativeCarbonG"
                    stroke="#059669"
                    strokeWidth={2}
                    fill="url(#co2Fill)"
                    animationDuration={400}
                    name="Cumulative"
                  />
                  <Bar
                    yAxisId="perRequest"
                    dataKey="carbonGCo2eq"
                    fill="#059669"
                    fillOpacity={0.35}
                    radius={[2, 2, 0, 0]}
                    animationDuration={400}
                    name="Per-request"
                    barSize={Math.max(2, Math.min(12, 200 / co2ChartData.length))}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-2 rounded-sm bg-moss/30" />
                <span className="text-zinc-400 dark:text-zinc-400">Per-request</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-moss rounded-full" />
                <span className="text-zinc-400 dark:text-zinc-400">Cumulative</span>
              </div>
            </div>

            {/* CO₂ equivalencies */}
            {agg.totalCarbon > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Equivalencies</p>
                <div className="grid grid-cols-3 gap-3">
                  {(() => {
                    const totalKm = agg.totalCarbon / 170; // ~170g CO₂/km avg car
                    const phoneCharges = agg.totalCarbon / 8.22; // ~8.22g per charge
                    const ledHours = agg.totalCarbon / (agg.avgGridIntensity ?? 475) * 1000 / 9;
                    const items: { label: string; value: string; color: string }[] = [];
                    if (totalKm >= 0.01) items.push({ label: 'Car driven', value: totalKm >= 1 ? `${totalKm.toFixed(1)} km` : `${(totalKm * 1000).toFixed(0)} m`, color: 'text-ember' });
                    if (phoneCharges >= 0.1) items.push({ label: 'Phone charges', value: phoneCharges.toFixed(1), color: 'text-accent' });
                    if (ledHours >= 0.01) items.push({ label: '9W LED hours', value: ledHours.toFixed(1) + 'h', color: 'text-moss' });
                    return items.map(item => (
                      <div key={item.label} className="text-center">
                        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">{item.label}</p>
                        <p className={`metric-mono text-sm font-semibold ${item.color} mt-0.5`}>{item.value}</p>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Per-grid breakdown */}
            {(() => {
              const gridGroups = new Map<string, { count: number; carbon: number; intensity: number }>();
              for (const d of co2ChartData) {
                if (!d.gridId || d.carbonGCo2eq === null) continue;
                const g = d.gridCarbonIntensity ?? 0;
                const existing = gridGroups.get(d.gridId);
                if (existing) {
                  existing.count++;
                  existing.carbon += d.carbonGCo2eq;
                } else {
                  gridGroups.set(d.gridId, { count: 1, carbon: d.carbonGCo2eq, intensity: g });
                }
              }
              if (gridGroups.size <= 1) return null;
              const totalGridCarbon = Array.from(gridGroups.values()).reduce((s, g) => s + g.carbon, 0);
              return (
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Emissions by Grid Region</p>
                  <div className="space-y-1.5">
                    {Array.from(gridGroups.entries())
                      .sort((a, b) => b[1].carbon - a[1].carbon)
                      .map(([gridId, info]) => {
                        const pct = totalGridCarbon > 0 ? (info.carbon / totalGridCarbon) * 100 : 0;
                        const intensityColor = info.intensity > 300 ? 'text-ember' : info.intensity > 150 ? 'text-amber' : 'text-moss';
                        return (
                          <div key={gridId} className="flex items-center gap-2">
                            <span className="text-[9px] metric-mono text-zinc-500 dark:text-zinc-400 w-16 shrink-0">{gridId}</span>
                            <div className="flex-1 h-3 bg-zinc-50 dark:bg-white/[0.04] rounded-sm overflow-hidden">
                              <motion.div
                                className="h-full bg-moss/70 rounded-sm"
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                              />
                            </div>
                            <span className="text-[9px] metric-mono font-medium w-14 shrink-0 text-right text-zinc-500 dark:text-zinc-400">{formatCarbonShort(info.carbon)}</span>
                            <span className={`text-[8px] metric-mono ${intensityColor} w-20 shrink-0 text-right`}>{info.intensity}g/kWh</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* APC Hit Rate Over Time */}
        {hasApcData && apcChartData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="card-surface p-6"
          >
            <div className="mb-4">
              <h3 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">APC Efficiency</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-0.5">Automatic Prompt Caching hit rate across requests</p>
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={apcChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="apcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0891b2" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
                  <XAxis
                    dataKey="index"
                    tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dx={-4}
                    domain={[0, 1.05]}
                    tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  />
                  <FadingTooltip content={<ApcTooltip />} />
                  <ReferenceLine y={1} stroke="#059669" strokeDasharray="4 4" strokeOpacity={0.4} />
                  <Area
                    type="monotone"
                    dataKey="apcHitRate"
                    stroke="#0891b2"
                    strokeWidth={2}
                    fill="url(#apcFill)"
                    animationDuration={400}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-accent rounded-full" />
                <span className="text-zinc-400 dark:text-zinc-400">APC hit rate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-moss rounded-full opacity-40" style={{ borderStyle: 'dashed' }} />
                <span className="text-zinc-400 dark:text-zinc-400">100% reference</span>
              </div>
            </div>

            {/* APC hit/miss breakdown */}
            {/* APC caching breakdown */}
            {apcChartData.length > 0 && (() => {
              const totalHit = apcChartData.reduce((s, d) => s + (d.apcHitTokens ?? 0), 0);
              const totalMiss = apcChartData.reduce((s, d) => s + (d.apcMissTokens ?? 0), 0);
              const total = totalHit + totalMiss;
              const recent = apcChartData.slice(-8);
              return (
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                  <div className="flex gap-6 items-start">
                    {/* Donut chart */}
                    <div className="shrink-0 w-24">
                      <div className="h-24 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Hit', value: totalHit || 0 },
                                { name: 'Miss', value: totalMiss || 0 },
                              ]}
                              dataKey="value"
                              innerRadius={28}
                              outerRadius={40}
                              strokeWidth={0}
                              animationBegin={0}
                              animationDuration={600}
                            >
                              <Cell fill="#059669" />
                              <Cell fill="#d97706" />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <p className="metric-mono text-sm font-bold text-zinc-800 dark:text-zinc-300 leading-none">
                              {total > 0 ? ((totalHit / total) * 100).toFixed(0) : '0'}%
                            </p>
                            <p className="text-[7px] text-zinc-400 dark:text-zinc-500 mt-0.5">hit rate</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex justify-center gap-3 text-[8px]">
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-moss" />{formatNumber(totalHit)}</span>
                        <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber" />{formatNumber(totalMiss)}</span>
                      </div>
                    </div>

                    {/* Per-request radial gauges */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Per-Request</p>
                      <div className="grid grid-cols-4 gap-2">
                        {recent.map((d) => {
                          const rate = d.apcHitRate ?? 0;
                          const pct = rate * 100;
                          const circumference = Math.PI * 2 * 14;
                          const strokeDash = `${rate * circumference} ${circumference}`;
                          const hitTok = d.apcHitTokens ?? 0;
                          const missTok = d.apcMissTokens ?? 0;
                          const tokTotal = hitTok + missTok;
                          const isExcellent = pct >= 90;
                          const isPoor = pct < 50;
                          const arcColor = isExcellent ? '#059669' : isPoor ? '#ef4444' : '#0891b2';
                          return (
                            <div key={d.index} className="flex flex-col items-center">
                              <svg width="40" height="40" viewBox="0 0 36 36">
                                <circle
                                  cx="18" cy="18" r="14"
                                  fill="none"
                                  stroke="var(--border)"
                                  strokeWidth="3"
                                  opacity="0.5"
                                />
                                <motion.circle
                                  cx="18" cy="18" r="14"
                                  fill="none"
                                  stroke={arcColor}
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeDasharray={strokeDash}
                                  transform="rotate(-90 18 18)"
                                  initial={{ strokeDasharray: `0 ${circumference}` }}
                                  animate={{ strokeDasharray: strokeDash }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                />
                              </svg>
                              <p className={`metric-mono text-[10px] font-semibold leading-none mt-0.5 ${
                                isExcellent ? 'text-moss' : isPoor ? 'text-ember' : 'text-accent'
                              }`}>{pct.toFixed(0)}%</p>
                              <p className="text-[7px] metric-mono text-zinc-300 dark:text-zinc-600">#{d.index}</p>
                              {tokTotal > 0 && (
                                <p className="text-[6px] metric-mono text-zinc-300 dark:text-zinc-600 leading-tight mt-0.5 text-center">
                                  {formatNumber(hitTok)}/{formatNumber(tokTotal)} tok
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* Power Profile Over Time */}
        {hasPowerData && powerChartData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="card-surface p-6"
          >
            <div className="mb-4">
              <h3 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Power Profile</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-0.5">Average power draw per inference request</p>
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={powerChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="powerFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d97706" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
                  <XAxis
                    dataKey="index"
                    tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dx={-4}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}kW` : `${v.toFixed(0)}W`}
                  />
                  <FadingTooltip content={<PowerTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="avgPowerWatts"
                    stroke="#d97706"
                    strokeWidth={2}
                    fill="url(#powerFill)"
                    animationDuration={400}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-amber rounded-full" />
                <span className="text-zinc-400 dark:text-zinc-400">Avg power (W)</span>
              </div>
            </div>

            {/* Power distribution histogram */}
            {powerChartData.length > 1 && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Power Distribution</p>
                <div className="space-y-1.5">
                  {(() => {
                    const pows = powerChartData.map(d => d.avgPowerWatts ?? 0);
                    const bins = [
                      { label: '<1kW', max: 1000, color: 'bg-moss' },
                      { label: '1-2kW', max: 2000, color: 'bg-accent' },
                      { label: '2-3kW', max: 3000, color: 'bg-amber' },
                      { label: '3-5kW', max: 5000, color: 'bg-ember/70' },
                      { label: '>5kW', max: Infinity, color: 'bg-ember' },
                    ];
                    return bins.map(bin => {
                      const prevMax = bins[bins.indexOf(bin) - 1]?.max ?? 0;
                      const count = pows.filter(p => p > prevMax && p <= bin.max).length;
                      const pct = pows.length > 0 ? (count / pows.length) * 100 : 0;
                      const maxBinCount = Math.max(...bins.map(b => pows.filter(p => p > (bins[bins.indexOf(b) - 1]?.max ?? 0) && p <= b.max).length), 1);
                      return (
                        <div key={bin.label} className="flex items-center gap-2">
                          <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-400 w-10 shrink-0 text-right">{bin.label}</span>
                          <div className="flex-1 h-3 bg-zinc-50 dark:bg-white/[0.04] rounded-sm overflow-hidden">
                            <motion.div
                              className={`h-full ${bin.color} rounded-sm`}
                              initial={{ width: 0 }}
                              animate={{ width: `${(count / maxBinCount) * 100}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                            />
                          </div>
                          <span className="text-[9px] metric-mono font-medium w-12 shrink-0 text-right text-zinc-500 dark:text-zinc-400">
                            {count} {count > 0 ? `(${pct.toFixed(0)}%)` : ''}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Energy attribution summary */}
            {(() => {
              const capped = details.filter(d => d.ratioWasCapped === true).length;
              const totalUncapped = details.reduce((s, d) => s + (d.uncappedEnergyJoules ?? 0), 0);
              const methods = new Map<string, number>();
              for (const d of details) {
                if (d.attributionMethod) {
                  methods.set(d.attributionMethod, (methods.get(d.attributionMethod) ?? 0) + 1);
                }
              }
              if (capped === 0 && totalUncapped === 0 && methods.size === 0) return null;
              return (
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                  {capped > 0 && (
                    <span>
                      Ratio-capped: <span className="metric-mono font-semibold text-amber">{capped}/{details.length}</span> reqs
                    </span>
                  )}
                  {totalUncapped > 0 && agg.totalJoules > 0 && (
                    <span>
                      Uncapped: <span className="metric-mono font-semibold text-amber">{formatEnergy(totalUncapped)}</span>
                      <span className="text-zinc-300 dark:text-zinc-600 ml-1">({(totalUncapped / agg.totalJoules).toFixed(1)}×)</span>
                    </span>
                  )}
                  {methods.size > 0 && (
                    <span>
                      Method: {Array.from(methods.entries()).map(([m, c]) => (
                        <span key={m} className="metric-mono font-semibold text-zinc-500 dark:text-zinc-400">{m}({c})</span>
                      )).reduce((acc, el) => <>{acc} {el}</>)}
                    </span>
                  )}
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* MCR Context Growth */}
        {hasMcrData && contextChartData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className="card-surface p-6"
          >
            <div className="mb-4">
              <h3 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Context Growth (MCR)</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-400 mt-0.5">How the context window expands across the conversation</p>
            </div>

            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={contextChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ctxFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0891b2" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0891b2" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outputFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" className="dark:opacity-40" vertical={false} />
                  <XAxis
                    dataKey="index"
                    tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dy={8}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    axisLine={false}
                    tickLine={false}
                    dx={-4}
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
                  />
                  <FadingTooltip content={<ContextTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="outputTokens"
                    stroke="#059669"
                    strokeWidth={1.5}
                    fill="url(#outputFill)"
                    animationDuration={400}
                  />
                  <Area
                    type="monotone"
                    dataKey="contextTokens"
                    stroke="#0891b2"
                    strokeWidth={2}
                    fill="url(#ctxFill)"
                    animationDuration={400}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-accent rounded-full" />
                <span className="text-zinc-400 dark:text-zinc-400">Context tokens (MCR)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-moss rounded-full" />
                <span className="text-zinc-400 dark:text-zinc-400">Output tokens</span>
              </div>
            </div>

            {/* Compaction events */}
            {(agg.compactionCount > 0 || agg.compactionEnergy > 0) && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06] flex items-center gap-4 text-[10px]">
                <span className="text-zinc-400 dark:text-zinc-500">
                  Compactions: <span className="metric-mono font-semibold text-amber">{agg.compactionCount}</span>
                </span>
                {agg.compactionEnergy > 0 && (
                  <span className="text-zinc-400 dark:text-zinc-500">
                    Compaction energy: <span className="metric-mono font-semibold text-amber">{formatEnergy(agg.compactionEnergy)}</span>
                  </span>
                )}
              </div>
            )}

            {/* MCR mode indicator */}
            {(() => {
              const modes = new Set(contextChartData.map(d => d.mcrMode).filter(Boolean));
              if (modes.size > 0) {
                return (
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-1.5">Context Mode</p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(modes).map(mode => {
                        const count = contextChartData.filter(d => d.mcrMode === mode).length;
                        return (
                          <span key={mode} className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-accent/10 text-accent dark:bg-accent/15">
                            {mode} <span className="text-accent/60">({count})</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Token flow detail — last 8 requests */}
            {contextChartData.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06]">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400 mb-2">Token Flow</p>
                <div className="space-y-1">
                  {contextChartData.slice(-8).map(d => {
                    const origTok = d.mcrOriginalTokens ?? d.contextTokens ?? 0;
                    const compactTok = d.mcrCompactedTokens ?? 0;
                    const newTok = d.currentTurnNewTokens ?? 0;
                    const maxTok = Math.max(origTok, newTok, 1);
                    return (
                      <div key={d.index} className="flex items-center gap-2">
                        <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-400 w-6 shrink-0 text-right">#{d.index}</span>
                        <div className="flex-1 h-3 bg-zinc-50 dark:bg-white/[0.04] rounded-sm overflow-hidden flex">
                          <motion.div
                            className="h-full bg-accent/60 rounded-l-sm"
                            initial={{ width: 0 }}
                            animate={{ width: `${(origTok / maxTok) * 100}%` }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                          />
                          {compactTok > 0 && (
                            <motion.div
                              className="h-full bg-amber/60"
                              initial={{ width: 0 }}
                              animate={{ width: `${(compactTok / maxTok) * 100}%` }}
                              transition={{ duration: 0.4, ease: 'easeOut' }}
                            />
                          )}
                          <motion.div
                            className="h-full bg-moss/60 rounded-r-sm"
                            initial={{ width: 0 }}
                            animate={{ width: `${(newTok / maxTok) * 100}%` }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                          />
                        </div>
                        <span className="text-[9px] metric-mono font-medium w-10 shrink-0 text-right text-zinc-500 dark:text-zinc-400">{formatNumber(d.contextTokens)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px]">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm bg-accent/60" />
                    <span className="text-zinc-400 dark:text-zinc-500">Original</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm bg-amber/60" />
                    <span className="text-zinc-400 dark:text-zinc-500">Compacted</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm bg-moss/60" />
                    <span className="text-zinc-400 dark:text-zinc-500">New tokens</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Energy Cost Attribution Footer */}
      {hasCarbonData && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.2 }}
          className="card-surface p-4"
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[10px] text-zinc-400 dark:text-zinc-500">
            <span>
              Total energy: <span className="metric-mono font-semibold text-zinc-600 dark:text-zinc-300">{formatEnergy(agg.totalJoules)}</span>
            </span>
            {agg.avgGridIntensity !== null && (
              <span>
                Grid intensity: <span className="metric-mono font-semibold text-zinc-600 dark:text-zinc-300">{Math.round(agg.avgGridIntensity)} gCO₂/kWh</span>
              </span>
            )}
            {agg.primaryGridId && (
              <span>
                Region: <span className="metric-mono font-semibold text-accent">{agg.primaryGridId}</span>
              </span>
            )}
            <span className="ml-auto text-zinc-300 dark:text-zinc-600">
              Powered by NeuralWatt inference profiling
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default memo(EnergySustainabilityInner);
