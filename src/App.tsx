import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileArrowUp, Pulse, Timer, Flame, Coins, Lightning, Gauge, Clock, Hash, ArrowBendUpLeft, ArrowsLeftRight, Barbell, Warning, Info } from '@phosphor-icons/react';
import type { ParsedEvent, ConversationSummary } from './types';
import { parseJsonl, getTpsEvents, getEnergyEvents, getModelChangeEvents, getRewindEvents, computeSummary, computeTimingBuckets, pairEnergyWithTps, deriveDataThresholds, buildTimeline, formatNumber, formatCurrency, formatDuration, formatTps } from './lib/parser';
import { useTheme } from './hooks/useTheme';
import { SmartTooltip } from './components/SmartTooltip';
import TimelineChart from './components/TimelineChart';
import TimingScatter from './components/TimingScatter';
import TokenBreakdown from './components/TokenBreakdown';
import ThresholdAnalysis from './components/ThresholdAnalysis';
import AnomalyDetector from './components/AnomalyDetector';
import RequestInspector from './components/RequestInspector';
import CacheEfficiency from './components/CacheEfficiency';
import TimingDistribution from './components/TimingDistribution';
import ThemeToggle from './components/ThemeToggle';

function PillBody({ icon: Icon, label, value, unit, subLabel, subValue, accent = false }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
}) {
  return (
    <motion.div
      layout
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-colors ${
        accent
          ? 'bg-accent/5 border-accent/15 dark:bg-accent/10 dark:border-accent/20'
          : 'bg-white/60 border-zinc-200/50 dark:bg-zinc-800/40 dark:border-white/[0.06]'
      }`}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className={`shrink-0 p-1.5 rounded-lg ${
        accent
          ? 'bg-accent/10 text-accent dark:bg-accent/15'
          : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400'
      }`}>
        <Icon weight="bold" size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400 leading-none">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <p className="metric-mono text-base font-semibold text-zinc-800 dark:text-zinc-300 leading-tight">
            {value}{unit && <span className="text-xs text-zinc-400 dark:text-zinc-400 ml-0.5">{unit}</span>}
          </p>
          {subValue && (
            <span className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-tight">
              {subLabel && <span className="text-zinc-400 dark:text-zinc-500 mr-0.5">{subLabel}</span>}
              <span className="metric-mono font-medium">{subValue}</span>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MetricPill({ icon, label, value, unit, subLabel, subValue, accent = false, tooltip }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  subLabel?: string;
  subValue?: string;
  accent?: boolean;
  tooltip?: React.ReactNode;
}) {
  if (!tooltip) {
    return (
      <PillBody
        icon={icon}
        label={label}
        value={value}
        unit={unit}
        subLabel={subLabel}
        subValue={subValue}
        accent={accent}
      />
    );
  }
  return (
    <SmartTooltip content={tooltip}>
      <PillBody
        icon={icon}
        label={label}
        value={value}
        unit={unit}
        subLabel={subLabel}
        subValue={subValue}
        accent={accent}
      />
    </SmartTooltip>
  );
}

/* ── Rich Tooltip Contents ── */

function TpsTooltip({ activeTps, wallTps, lossPct, mode }: { activeTps: number; wallTps: number; lossPct: number; mode: 'avg' | 'weighted' }) {
  const wallShare = activeTps > 0 ? (wallTps / activeTps) * 100 : 0;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">{mode === 'avg' ? 'Average' : 'Weighted'} Speed</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">tok/s</p>
      </div>
      <div className="flex gap-2 mb-2 min-w-0">
        <div className="flex-1 min-w-0 rounded-lg bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-moss">Active</p>
          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{formatTps(activeTps)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-lg bg-accent/5 dark:bg-accent/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-accent">Wall</p>
          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{formatTps(wallTps)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-lg bg-ember/5 dark:bg-ember/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-ember">Loss</p>
          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 truncate">{lossPct.toFixed(1)}%</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-1">
          <span>Retention</span>
          <span className="metric-mono font-medium text-moss">{wallShare.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
          <div className="h-full bg-moss" style={{ width: `${wallShare}%` }} />
          <div className="h-full bg-ember" style={{ width: `${Math.max(0, 100 - wallShare)}%` }} />
        </div>
      </div>
      <div className="space-y-1 mt-2 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-moss mt-1.5 shrink-0" />
          <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <span className="font-semibold text-moss">Active</span> — generation-only throughput, excluding stalls and TTFT
          </p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-accent mt-1.5 shrink-0" />
          <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <span className="font-semibold text-accent">Wall</span> — pooled wall-clock throughput, including stalls and TTFT
          </p>
        </div>
        <div className="flex items-start gap-2">
          <div className="w-1 h-1 rounded-full bg-ember mt-1.5 shrink-0" />
          <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <span className="font-semibold text-ember">Loss</span> — percentage of active throughput lost to stalls, TTFT, and gaps
          </p>
        </div>
      </div>
      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 mt-2">
        {mode === 'avg' ? 'Simple mean of per-request generation throughput.' : 'Token-weighted average throughput. Longer responses count more heavily.'}
      </p>
    </div>
  );
}

function RequestsTooltip({ total }: { total: number }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Requests</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">calls</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatNumber(total, 0)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">total LLM calls</span>
      </div>
      <div className="space-y-1 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Each call represents one turn in the conversation. Multiple calls may span model switches or branching.
        </p>
      </div>
    </div>
  );
}

function TotalTimeTooltip({ wallClockMs, totalTimeMs, generationMs }: { wallClockMs: number; totalTimeMs: number; generationMs: number }) {
  const overhead = Math.max(0, totalTimeMs - generationMs);
  const overheadPct = totalTimeMs > 0 ? (overhead / totalTimeMs) * 100 : 0;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Time Breakdown</p>
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Wall-clock span</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(wallClockMs)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Sum of call durations</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(totalTimeMs)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Total generation time</span>
          <span className="metric-mono font-medium text-moss">{formatDuration(generationMs)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Overhead (TTFT + stalls)</span>
          <span className="metric-mono font-medium text-ember">{formatDuration(overhead)}</span>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-1">
          <span>Overhead ratio</span>
          <span className="metric-mono font-medium">{overheadPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
          <div className="h-full bg-moss" style={{ width: `${100 - overheadPct}%` }} />
          <div className="h-full bg-ember" style={{ width: `${overheadPct}%` }} />
        </div>
      </div>
      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 mt-2">
        Wall-clock is the real-world span from first to last event. Sum of durations can exceed wall-clock when calls overlap in parallel.
      </p>
    </div>
  );
}

function TtftTooltip({ avgTtft, p50, p75, p90, p99, min, max }: { avgTtft: number; p50: number; p75: number; p90: number; p99: number; min: number; max: number }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Time to First Token</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">latency</p>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatDuration(Math.round(avgTtft))}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">mean</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Min</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(min)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">P50</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(p50)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">P75</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(p75)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">P90</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(p90)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">P99</span>
          <span className="metric-mono font-medium text-ember">{formatDuration(p99)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Max</span>
          <span className="metric-mono font-medium text-ember">{formatDuration(max)}</span>
        </div>
      </div>
      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        TTFT measures the delay from sending the prompt to receiving the first token. High P99 values often indicate cold starts or queueing.
      </p>
    </div>
  );
}

function StallsTooltip({ count, ms, totalTimeMs }: { count: number; ms: number; totalTimeMs: number }) {
  const stallPct = totalTimeMs > 0 ? (ms / totalTimeMs) * 100 : 0;
  const avgStall = count > 0 ? ms / count : 0;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Stall Analysis</p>
        <Warning weight="bold" size={12} className="text-ember" />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 rounded-lg bg-ember/5 dark:bg-ember/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-ember">Events</p>
          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatNumber(count, 0)}</p>
        </div>
        <div className="flex-1 rounded-lg bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-amber">Total</p>
          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatDuration(ms)}</p>
        </div>
        <div className="flex-1 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Avg</p>
          <p className="metric-mono text-[13px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatDuration(Math.round(avgStall))}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-1">
          <span>Stall overhead</span>
          <span className="metric-mono font-medium text-ember">{stallPct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
          <div className="h-full bg-ember" style={{ width: `${stallPct}%` }} />
          <div className="h-full bg-moss" style={{ width: `${Math.max(0, 100 - stallPct)}%` }} />
        </div>
      </div>
      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 mt-2">
        Stalls are pauses where the model is idle — waiting for tokens to arrive, network hiccups, or queueing delays.
      </p>
    </div>
  );
}

function CostTooltip({ totalCost, costSource }: { totalCost: number | null; costSource: 'neuralwatt' | 'tps' | 'both' | null }) {
  if (totalCost === null) {
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Cost</p>
          <Info weight="bold" size={12} className="text-zinc-400" />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">No cost data available for this session.</p>
      </div>
    );
  }
  const sourceLabel = {
    neuralwatt: 'Measured via NeuralWatt energy monitoring.',
    tps: 'Estimated from provider token pricing.',
    both: 'Hybrid — NeuralWatt where available, provider pricing as fallback.',
  }[costSource ?? 'tps'];
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Total Cost</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">USD</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatCurrency(totalCost)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{costSource ? `source: ${costSource}` : 'unknown source'}</span>
      </div>
      <div className="space-y-1 mt-2 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          <span className="font-semibold">{sourceLabel}</span>
        </p>
      </div>
    </div>
  );
}

function EnergyTooltip({ joules, energyCost }: { joules: number | null; energyCost: number | null }) {
  if (joules === null) {
    return (
      <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Energy</p>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">No energy data available for this session.</p>
      </div>
    );
  }
  const kwh = joules / 3_600_000;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Energy Consumption</p>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatNumber(joules)}J</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{kwh.toFixed(4)} kWh</span>
      </div>
      <div className="space-y-1.5 mt-2 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        <p className="text-[9px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
          Total energy drawn across all tracked LLM requests, measured via NeuralWatt inference profiling.
        </p>
        {energyCost !== null && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-500 dark:text-zinc-400">Est. energy cost</span>
            <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatCurrency(energyCost)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TokensTooltip({ input, output, cacheRead, cacheWrite, total, totalCost }: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; totalCost: number | null }) {
  const inputPct = total > 0 ? (input / total) * 100 : 0;
  const outputPct = total > 0 ? (output / total) * 100 : 0;
  const cacheReadPct = total > 0 ? (cacheRead / total) * 100 : 0;
  const cacheWritePct = total > 0 ? (cacheWrite / total) * 100 : 0;
  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Token Breakdown</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">tokens</p>
      </div>
      <div className="space-y-1 mb-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            New input
          </span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatNumber(input)} <span className="text-zinc-400">({inputPct.toFixed(0)}%)</span></span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Output
          </span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatNumber(output)} <span className="text-zinc-400">({outputPct.toFixed(0)}%)</span></span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber" />
            Cache read
          </span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatNumber(cacheRead)} <span className="text-zinc-400">({cacheReadPct.toFixed(0)}%)</span></span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-moss" />
            Cache write
          </span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatNumber(cacheWrite)} <span className="text-zinc-400">({cacheWritePct.toFixed(0)}%)</span></span>
        </div>
      </div>
      <div>
        <div className="h-1.5 rounded-full overflow-hidden flex">
          <div className="h-full bg-zinc-400" style={{ width: `${inputPct}%` }} />
          <div className="h-full bg-accent" style={{ width: `${outputPct}%` }} />
          <div className="h-full bg-amber" style={{ width: `${cacheReadPct}%` }} />
          <div className="h-full bg-moss" style={{ width: `${cacheWritePct}%` }} />
        </div>
      </div>
      <div className="space-y-1 mt-2 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">Total</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatNumber(total)}</span>
        </div>
        {totalCost !== null && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-500 dark:text-zinc-400">Cost per 1M tokens</span>
            <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">
              {total > 0 ? `$${((totalCost / (total / 1_000_000))).toFixed(4)}` : '-'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TpsPill({ icon, label, activeTps, wallTps, lossPct, accent = false, mode }: {
  icon: React.ElementType;
  label: string;
  activeTps: number;
  wallTps: number;
  lossPct: number;
  accent?: boolean;
  mode: 'avg' | 'weighted';
}) {
  return (
    <SmartTooltip content={
      <TpsTooltip activeTps={activeTps} wallTps={wallTps} lossPct={lossPct} mode={mode} />
    } preferredPlacement="bottom" gap={10}>
      <PillBody
        icon={icon}
        label={label}
        value={formatTps(activeTps)}
        unit="tok/s"
        accent={accent}
      />
    </SmartTooltip>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [events, setEvents] = useState<ParsedEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedTpsId, setSelectedTpsId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const allTpsEvents = useMemo(() => events ? getTpsEvents(events) : [], [events]);
  const tpsEvents = useMemo(
    () => selectedModel ? allTpsEvents.filter(e => e.data.model.modelId === selectedModel) : allTpsEvents,
    [allTpsEvents, selectedModel]
  );
  const allEnergyEvents = useMemo(() => events ? getEnergyEvents(events) : [], [events]);
  const energyEvents = useMemo(
    () => {
      if (!selectedModel) return allEnergyEvents;
      // Only include energy events whose parentId matches a TPS event in the
      // filtered set — otherwise computeSummary treats unmatched energy events
      // as "orphans" and double-counts their cost.
      const tpsIds = new Set(tpsEvents.map(e => e.id));
      return allEnergyEvents.filter(e => tpsIds.has(e.parentId ?? ''));
    },
    [allEnergyEvents, selectedModel, tpsEvents]
  );
  const modelChanges = useMemo(() => events ? getModelChangeEvents(events) : [], [events]);
  const rewindEvents = useMemo(() => events ? getRewindEvents(events) : [], [events]);
  const paired = useMemo(() => pairEnergyWithTps(tpsEvents, energyEvents), [tpsEvents, energyEvents]);
  // Full-session summary for header model list (always unfiltered)
  const sessionSummary: ConversationSummary | null = useMemo(
    () => allTpsEvents.length > 0 ? computeSummary(allTpsEvents, allEnergyEvents, modelChanges, rewindEvents) : null,
    [allTpsEvents, allEnergyEvents, modelChanges, rewindEvents]
  );
  // Filtered summary for metrics strip and dashboard
  const summary: ConversationSummary | null = useMemo(
    () => tpsEvents.length > 0 ? computeSummary(tpsEvents, energyEvents, modelChanges, rewindEvents) : null,
    [tpsEvents, energyEvents, modelChanges, rewindEvents]
  );
  const buckets = useMemo(() => computeTimingBuckets(tpsEvents), [tpsEvents]);
  const dataThresholds = useMemo(() => deriveDataThresholds(tpsEvents), [tpsEvents]);
  const timeline = useMemo(() => events ? buildTimeline(events, paired) : [], [events, paired]);

  const loadSample = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/sample.jsonl');
      const text = await res.text();
      setEvents(parseJsonl(text));
      setSelectedModel(null);
    } catch (e) {
      console.error('Failed to load sample', e);
    }
    setLoading(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setEvents(parseJsonl(text));
      setSelectedModel(null);
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setEvents(parseJsonl(text));
      setSelectedModel(null);
    };
    reader.readAsText(file);
  }, []);

  return (
    <div
      className="min-h-[100dvh] bg-[#fafafa] dark:bg-[#18181b]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#fafafa]/95 dark:bg-[#18181b]/95 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.08]">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 dark:bg-accent/15 rounded-xl">
              <Gauge weight="bold" size={22} className="text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-300 leading-none">pi-tps</h1>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-400 font-medium tracking-wide mt-0.5">TELEMETRY INSPECTOR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <label className="relative cursor-pointer group">
              <input
                type="file"
                accept=".jsonl,.json"
                className="sr-only"
                onChange={handleFileInput}
              />
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:border-accent/30 hover:text-accent dark:hover:border-accent/40 dark:hover:text-accent-light transition-all group-active:scale-[0.98]">
                <FileArrowUp size={14} weight="bold" />
                <span>Import JSONL</span>
              </div>
            </label>
            {sessionSummary && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white/80 dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-white/[0.06] rounded-xl">
                <Pulse size={12} className={selectedModel === null ? 'text-moss' : 'text-zinc-400 dark:text-zinc-500'} weight="fill" />
                {/* All models button */}
                <button
                  onClick={() => setSelectedModel(null)}
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                    selectedModel === null
                      ? 'bg-accent/10 text-accent dark:bg-accent/15'
                      : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  All
                </button>
                {sessionSummary.models.map(m => (
                  <button
                    key={m.modelId}
                    onClick={() => setSelectedModel(m.modelId === selectedModel ? null : m.modelId)}
                    className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                      selectedModel === m.modelId
                        ? 'bg-accent/10 text-accent dark:bg-accent/15'
                        : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                    }`}
                    title={`${m.modelId} · ${m.provider} · ${m.callCount} calls`}
                  >
                    {m.modelId.split('/').pop()}
                    <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-400">{m.callCount}</span>
                  </button>
                ))}
                {(sessionSummary.modelChangeCount > 0 || sessionSummary.rewindCount > 0) && (
                  <>
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-700">·</span>
                    <div className="flex items-center gap-1">
                      {sessionSummary.modelChangeCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-accent" title={`${sessionSummary.modelChangeCount} model switches`}>
                          <ArrowsLeftRight size={10} weight="bold" />
                          {sessionSummary.modelChangeCount}
                        </span>
                      )}
                      {sessionSummary.rewindCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-ember" title={`${sessionSummary.rewindCount} rewinds`}>
                          <ArrowBendUpLeft size={10} weight="bold" />
                          {sessionSummary.rewindCount}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {loading && !events ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center min-h-[60dvh]"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-zinc-200 dark:border-white/[0.06] border-t-accent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400 dark:text-zinc-400 font-medium">Loading telemetry...</p>
            </div>
          </motion.div>
        ) : !events || tpsEvents.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center min-h-[70dvh] px-6"
          >
            <div className={`max-w-md w-full text-center p-12 rounded-[2.5rem] border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-accent bg-accent/5 dark:border-accent dark:bg-accent/10'
                : 'border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-zinc-800/40'
            }`}>
              <div className="w-16 h-16 mx-auto mb-6 bg-zinc-50 dark:bg-white/[0.06] rounded-3xl flex items-center justify-center">
                <FileArrowUp size={28} className="text-zinc-300 dark:text-zinc-400" weight="duotone" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Drop a telemetry or session file</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-400 mb-8 leading-relaxed">
                Drag and drop a <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">.jsonl</code> file from pi — telemetry exports, or raw session files from <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">~/.pi/agent/sessions</code> — to inspect tokens-per-second, timing, and cache behavior.
              </p>
              <button
                onClick={loadSample}
                className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-dark transition-colors active:scale-[0.98] active:translate-y-[1px]"
              >
                Load Sample Data
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className={`max-w-[1600px] mx-auto px-6 py-8 space-y-8 rounded-[2rem] border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-accent bg-accent/5 dark:border-accent dark:bg-accent/10'
                : 'border-transparent'
            }`}
          >
            {/* Metrics Strip */}
            {summary && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-2"
              >
                <MetricPill icon={Pulse} label="Requests" value={formatNumber(summary.totalCalls)} tooltip={<RequestsTooltip total={summary.totalCalls} />} />
                <MetricPill icon={Timer} label="Total Time" value={formatDuration(summary.wallClockMs)} tooltip={<TotalTimeTooltip wallClockMs={summary.wallClockMs} totalTimeMs={summary.totalTimeMs} generationMs={summary.totalGenerationMs} />} />
                <TpsPill icon={Gauge} label="Avg TPS" activeTps={summary.avgTps} wallTps={summary.avgWallTps} lossPct={summary.tpsLoss} mode="avg" />
                <TpsPill icon={Barbell} label="Wtd TPS" activeTps={summary.weightedTps} wallTps={summary.weightedWallTps} lossPct={summary.weightedTpsLoss} accent mode="weighted" />
                <MetricPill icon={Clock} label="Avg TTFT" value={formatDuration(Math.round(summary.avgTtft))} tooltip={<TtftTooltip avgTtft={summary.avgTtft} p50={summary.ttftP50} p75={summary.ttftP75} p90={summary.ttftP90} p99={summary.ttftP99} min={summary.minTtft} max={summary.maxTtft} />} />
                <MetricPill icon={Flame} label="Stalls" value={formatNumber(summary.totalStallCount)} subLabel="total" subValue={formatDuration(summary.totalStallMs)} accent tooltip={<StallsTooltip count={summary.totalStallCount} ms={summary.totalStallMs} totalTimeMs={summary.totalTimeMs} />} />
                <MetricPill icon={Coins} label="Cost" value={formatCurrency(summary.totalCostUsd)} tooltip={<CostTooltip totalCost={summary.totalCostUsd} costSource={summary.costSource} />} />
                <MetricPill icon={Lightning} label="Energy" value={summary.totalEnergyJoules !== null ? `${formatNumber(summary.totalEnergyJoules)}J` : '-'} tooltip={<EnergyTooltip joules={summary.totalEnergyJoules} energyCost={summary.energyCostUsd} />} />
                <MetricPill icon={Hash} label="Tokens" value={formatNumber(summary.totalTokens)} tooltip={<TokensTooltip input={summary.totalInput} output={summary.totalOutput} cacheRead={summary.totalCacheRead} cacheWrite={summary.totalCacheWrite} total={summary.totalTokens} totalCost={summary.totalCostUsd} />} />
              </motion.div>
            )}

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Charts */}
              <div className="lg:col-span-8 space-y-6">
                <TimelineChart buckets={buckets} onBucketClick={() => { }} />
                <TimingScatter events={paired} onPointClick={(id) => setSelectedTpsId(id)} thresholds={dataThresholds} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TimingDistribution events={paired} thresholds={dataThresholds} />
                  <CacheEfficiency events={paired} />
                </div>
                <TokenBreakdown events={paired} />
              </div>

              {/* Right: Analysis Panel */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                <ThresholdAnalysis events={tpsEvents} thresholds={dataThresholds} />
                <AnomalyDetector events={paired} thresholds={dataThresholds} />
                <RequestInspector
                  timeline={timeline}
                  selectedId={selectedTpsId}
                  onSelect={(id) => setSelectedTpsId(id)}
                  thresholds={dataThresholds}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
