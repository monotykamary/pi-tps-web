import { useState, useCallback, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileArrowUp, Pulse, Timer, Flame, Coins, Lightning, Gauge, Clock, Hash, ArrowBendUpLeft, ArrowsLeftRight, Barbell, Warning, Info, ClipboardText, X, FolderOpen, Rows, DownloadSimple } from '@phosphor-icons/react';
import type { ParsedEvent, ConversationSummary, ModelInfo, MultiSessionSummary } from './types';
import { ingestJsonl, deriveEvents, parseJsonl, getTpsEvents, getEnergyEvents, getModelChangeEvents, getRewindEvents, computeSummary, computeMultiSessionSummary, computeTimingBuckets, pairEnergyWithTps, deriveDataThresholds, buildTimeline, formatNumber, formatCurrency, formatDuration, formatTps, formatEnergy, formatEnergyParts, exportMultiSessionCsv } from './lib/parser';
import type { IngestResult } from './lib/parser';
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
import SessionScatter from './components/SessionScatter';
import ModelPerformance from './components/ModelPerformance';
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
    <div
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-colors ${
        accent
          ? 'bg-accent/5 border-accent/15 dark:bg-accent/10 dark:border-accent/20'
          : 'bg-white/60 border-zinc-200/50 dark:bg-zinc-800/40 dark:border-white/[0.06]'
      }`}
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
          <p className="metric-mono text-base font-semibold text-zinc-800 dark:text-zinc-300 leading-tight whitespace-nowrap">
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
    </div>
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
      <p className="text-[9px] leading-relaxed text-zinc-300 dark:text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-200/30 dark:border-white/[0.04]">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400">Standard term:</span> Output speed (tokens/s) — measures the <strong>decode</strong> stage (token-by-token generation). Also called generation throughput or output token rate.
      </p>
    </div>
  );
}

function RequestsTooltip({
  total,
  models,
  avgTokensPerCall,
  stalledCalls,
  cachedCalls,
  fastCalls,
}: {
  total: number;
  models: ModelInfo[];
  avgTokensPerCall: number;
  stalledCalls: number;
  cachedCalls: number;
  fastCalls: number;
}) {
  const stallPct = total > 0 ? (stalledCalls / total) * 100 : 0;
  const cachePct = total > 0 ? (cachedCalls / total) * 100 : 0;
  const fastPct = total > 0 ? (fastCalls / total) * 100 : 0;

  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Requests</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">calls</p>
      </div>
      <div className="flex items-baseline gap-2 mb-2.5">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatNumber(total, 0)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">total LLM calls</span>
      </div>

      {/* Quick stats row */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Tok/call</p>
          <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatNumber(Math.round(avgTokensPerCall), 0)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-lg bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-moss">Fast TTFT</p>
          <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{fastCalls}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-lg bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-amber">Stalled</p>
          <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{stalledCalls}</p>
        </div>
      </div>

      {/* Quality bars */}
      <div className="space-y-1.5 mb-3">
        <div>
          <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-0.5">
            <span>Fast responses (&lt; 3s TTFT)</span>
            <span className="metric-mono font-medium text-moss">{fastPct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full bg-moss" style={{ width: `${fastPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-0.5">
            <span>Cache-aware calls</span>
            <span className="metric-mono font-medium text-accent">{cachePct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full bg-accent" style={{ width: `${cachePct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-0.5">
            <span>Stalled calls</span>
            <span className="metric-mono font-medium text-ember">{stallPct.toFixed(0)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full bg-ember" style={{ width: `${stallPct}%` }} />
          </div>
        </div>
      </div>

      {/* Per-model call breakdown */}
      {models.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Per Model</p>
            <p className="text-[8px] text-zinc-400 dark:text-zinc-500">calls</p>
          </div>
          {models.map(m => {
            const pct = total > 0 ? (m.callCount / total) * 100 : 0;
            return (
              <div key={m.modelId} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-zinc-600 dark:text-zinc-300 font-medium truncate">{m.modelId.split('/').pop()}</span>
                    <span className="text-[9px] text-zinc-400 dark:text-zinc-500">{m.provider}</span>
                  </div>
                  <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200 shrink-0">{m.callCount}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
                  <div className="h-full bg-accent/40" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 mt-2">
        Each LLM call is one assistant turn. Fast responses (&lt; 3s TTFT) felt snappy. Stalled calls experienced at least one idle pause. Cache-aware calls read or wrote prompt cache.
      </p>
      <p className="text-[9px] leading-relaxed text-zinc-300 dark:text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-200/30 dark:border-white/[0.04]">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400">Standard term:</span> Requests per second (RPS) — system throughput across all concurrent requests. Primarily emphasized for batch or high-throughput serving scenarios.
      </p>
    </div>
  );
}

function TotalTimeTooltip({ wallClockMs, totalTimeMs, generationMs }: { wallClockMs: number; totalTimeMs: number; generationMs: number }) {
  const overhead = Math.max(0, totalTimeMs - generationMs);
  const idle = Math.max(0, wallClockMs - totalTimeMs);
  const denominator = Math.max(wallClockMs, totalTimeMs, 1);

  const genPct = (generationMs / denominator) * 100;
  const overPct = (overhead / denominator) * 100;
  const idlePct = (idle / denominator) * 100;

  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Time Breakdown</p>
      </div>

      {/* Primary metric */}
      <div className="flex items-baseline gap-2 mb-2.5">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatDuration(wallClockMs)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">wall-clock span</span>
      </div>

      {/* Detail rows */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-moss" />
            Generation time
          </span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(generationMs)}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber" />
            Overhead (TTFT + stalls)
          </span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(overhead)}</span>
        </div>
        {idle > 0 && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
              Idle (between requests)
            </span>
            <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{formatDuration(idle)}</span>
          </div>
        )}
        {totalTimeMs > wallClockMs && (
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Parallel overlap
            </span>
            <span className="metric-mono font-medium text-accent">{formatDuration(totalTimeMs - wallClockMs)}</span>
          </div>
        )}
      </div>

      {/* Stacked bar */}
      <div className="mb-1">
        <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
          <div className="h-full bg-moss" style={{ width: `${genPct}%` }} />
          <div className="h-full bg-amber" style={{ width: `${overPct}%` }} />
          {idle > 0 && <div className="h-full bg-zinc-300 dark:bg-zinc-600" style={{ width: `${idlePct}%` }} />}
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-moss" />
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500">gen {genPct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber" />
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500">over {overPct.toFixed(0)}%</span>
        </div>
        {idle > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">idle {idlePct.toFixed(0)}%</span>
          </div>
        )}
      </div>

      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
        Wall-clock is the real-world time from first to last event. It includes idle gaps between user interactions. "Active" time (generation + overhead) is the sum of individual request durations — it can exceed wall-clock when multiple requests execute in parallel.
      </p>
      <p className="text-[9px] leading-relaxed text-zinc-300 dark:text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-200/30 dark:border-white/[0.04]">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400">Standard term:</span> End-to-end latency — total wall-clock time from request submission to final token. Breaks down as TTFT + (ITL × output tokens).
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
      <p className="text-[9px] leading-relaxed text-zinc-300 dark:text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-200/30 dark:border-white/[0.04]">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400">Standard term:</span> Time to First Token (TTFT) — measures the <strong>prefill</strong> stage (prompt processing before generation begins). For reasoning models, Time to First Answer Token (TTFAT) is the operationally relevant variant.
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
      <p className="text-[9px] leading-relaxed text-zinc-300 dark:text-zinc-600 mt-1.5 pt-1.5 border-t border-zinc-200/30 dark:border-white/[0.04]">
        <span className="font-semibold text-zinc-500 dark:text-zinc-400">Standard term:</span> Inter-token Latency (ITL) — the time between consecutive output tokens. Also called Time Per Output Token (TPOT) when referring to the mean. Variable ITL causes perceptible stuttering even when average output speed looks acceptable.
      </p>
    </div>
  );
}

function CostTooltip({ totalCost, energyCost, costSource, models, totalTokens }: {
  totalCost: number | null;
  energyCost: number | null;
  costSource: 'neuralwatt' | 'tps' | 'both' | null;
  models: ModelInfo[];
  totalTokens: number;
}) {
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

  const tpsShare = energyCost !== null && totalCost > 0
    ? ((totalCost - energyCost) / totalCost) * 100 : 0;
  const energyShare = energyCost !== null && totalCost > 0
    ? (energyCost / totalCost) * 100 : 0;
  const costPer1M = totalTokens > 0 ? (totalCost / (totalTokens / 1_000_000)) : 0;

  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Total Cost</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">USD</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatCurrency(totalCost)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{costSource ? `source: ${costSource}` : 'unknown source'}</span>
      </div>

      {/* Aggregate stats */}
      <div className="flex gap-2 mb-3 mt-2.5">
        <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Per 1M tok</p>
          <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">${costPer1M.toFixed(3)}</p>
        </div>
        {energyCost !== null && (
          <div className="flex-1 min-w-0 rounded-lg bg-accent/5 dark:bg-accent/10 p-1.5 text-center">
            <p className="text-[8px] font-semibold uppercase tracking-wider text-accent">Energy</p>
            <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCurrency(energyCost)}</p>
          </div>
        )}
        {costSource === 'both' && energyCost !== null && (
          <div className="flex-1 min-w-0 rounded-lg bg-amber/5 dark:bg-amber/10 p-1.5 text-center">
            <p className="text-[8px] font-semibold uppercase tracking-wider text-amber">Token est.</p>
            <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCurrency(Math.max(0, totalCost - energyCost))}</p>
          </div>
        )}
      </div>

      {/* Attribution bar */}
      {costSource === 'both' && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[9px] text-zinc-400 dark:text-zinc-400 mb-1">
            <span>Cost attribution</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden flex bg-zinc-100 dark:bg-white/[0.06]">
            <div className="h-full bg-accent" style={{ width: `${energyShare}%` }} />
            <div className="h-full bg-amber" style={{ width: `${tpsShare}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">neuralwatt {energyShare.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber" />
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">provider {tpsShare.toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Per-model breakdown */}
      {models.length > 0 && models.some(m => m.blendedCostUsd !== null) && (
        <div className="space-y-1.5 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Per Model</p>
            <p className="text-[8px] text-zinc-400 dark:text-zinc-500">cost</p>
          </div>
          {models
            .filter(m => m.blendedCostUsd !== null)
            .sort((a, b) => (b.blendedCostUsd ?? 0) - (a.blendedCostUsd ?? 0))
            .map(m => {
              const pct = totalCost > 0 ? ((m.blendedCostUsd ?? 0) / totalCost) * 100 : 0;
              const isEnergy = m.energyCostUsd !== null && m.energyCostUsd > 0;
              const cost = m.energyCostUsd ?? m.blendedCostUsd ?? 0;
              return (
                <div key={m.modelId} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-zinc-600 dark:text-zinc-300 font-medium truncate">{m.modelId.split('/').pop()}</span>
                      <span className="text-zinc-400 dark:text-zinc-500 text-[9px]">{m.callCount} calls</span>
                    </div>
                    <span className={`metric-mono font-medium shrink-0 ${isEnergy ? 'text-accent' : 'text-amber'}`}>
                      {formatCurrency(cost)}
                    </span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
                    <div className={`h-full ${isEnergy ? 'bg-accent/60' : 'bg-amber/60'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 mt-2">
        {costSource === 'neuralwatt' && 'All costs measured via NeuralWatt energy profiling.'}
        {costSource === 'tps' && 'All costs estimated from provider token pricing (input + output + cache).'}
        {costSource === 'both' && 'Costs are a hybrid — NeuralWatt where energy data was paired, provider token pricing as fallback for unpaired requests.'}
      </p>
    </div>
  );
}

function EnergyTooltip({ joules, energyCost, models, totalCalls }: { joules: number | null; energyCost: number | null; models: ModelInfo[]; totalCalls: number }) {
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
  const avgJoulesPerCall = totalCalls > 0 ? joules / totalCalls : 0;

  const energyModels = models.filter(m => m.energyJoules !== null && m.energyJoules > 0);
  const totalModelJoules = energyModels.reduce((s, m) => s + (m.energyJoules ?? 0), 0);

  // Everyday equivalencies (rough)
  const smartphoneCharges = joules / 18_000; // ~18kJ per typical phone charge (5Wh)
  const ledHours = joules / (9 * 3600); // 9W LED bulb

  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Energy</p>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatEnergy(joules)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{kwh.toFixed(4)} kWh</span>
      </div>

      {/* Quick stats row */}
      <div className="flex gap-2 mb-3 mt-2.5">
        {energyCost !== null && (
          <div className="flex-1 min-w-0 rounded-lg bg-accent/5 dark:bg-accent/10 p-1.5 text-center">
            <p className="text-[8px] font-semibold uppercase tracking-wider text-accent">Energy cost</p>
            <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatCurrency(energyCost)}</p>
          </div>
        )}
        <div className="flex-1 min-w-0 rounded-lg bg-zinc-100 dark:bg-white/[0.06] p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-zinc-400">Energy/call</p>
          <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{formatEnergy(avgJoulesPerCall)}</p>
        </div>
        <div className="flex-1 min-w-0 rounded-lg bg-moss/5 dark:bg-moss/10 p-1.5 text-center">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-moss">Phone charges</p>
          <p className="metric-mono text-[12px] font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">{smartphoneCharges.toFixed(1)}x</p>
        </div>
      </div>

      {/* Everyday equivalencies */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">9W LED bulb</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{ledHours.toFixed(1)}h</span>
        </div>
      </div>

      {/* Per-model energy breakdown */}
      {energyModels.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-zinc-200/50 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Per Model</p>
            <p className="text-[8px] text-zinc-400 dark:text-zinc-500">scaled</p>
          </div>
          {energyModels
            .sort((a, b) => (b.energyJoules ?? 0) - (a.energyJoules ?? 0))
            .map(m => {
              const pct = totalModelJoules > 0 ? ((m.energyJoules ?? 0) / totalModelJoules) * 100 : 0;
              return (
                <div key={m.modelId} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-zinc-600 dark:text-zinc-300 font-medium truncate">{m.modelId.split('/').pop()}</span>
                      <span className="text-zinc-400 dark:text-zinc-500 text-[9px]">{m.callCount} calls</span>
                    </div>
                    <span className="metric-mono font-medium text-accent shrink-0">{formatEnergy(m.energyJoules ?? 0)}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden bg-zinc-100 dark:bg-white/[0.06]">
                    <div className="h-full bg-accent/60" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      <p className="text-[9px] leading-relaxed text-zinc-400 dark:text-zinc-500 mt-2">
        Energy measured via NeuralWatt inference profiling. Per-model values only include paired energy events — unpaired measurements cannot be attributed to a specific model.
      </p>
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

interface SessionState {
  raw: string;
  ingest: IngestResult;
  events: ParsedEvent[];
  fileName?: string;
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedTpsId, setSelectedTpsId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Derived: the events to display — either one session or all merged
  const events = useMemo<ParsedEvent[] | null>(() => {
    if (sessions.size === 0) return null;
    if (activeSessionId) {
      return sessions.get(activeSessionId)?.events ?? null;
    }
    const all: ParsedEvent[] = [];
    for (const s of sessions.values()) {
      all.push(...s.events);
    }
    return all;
  }, [sessions, activeSessionId]);

  const allTpsEvents = useMemo(() => events ? getTpsEvents(events) : [], [events]);
  const allEnergyEvents = useMemo(() => events ? getEnergyEvents(events) : [], [events]);
  const modelChanges = useMemo(() => events ? getModelChangeEvents(events) : [], [events]);
  const rewindEvents = useMemo(() => events ? getRewindEvents(events) : [], [events]);

  // Unfiltered summary — used for header model list (always full set)
  const sessionSummary: ConversationSummary | null = useMemo(
    () => allTpsEvents.length > 0 ? computeSummary(allTpsEvents, allEnergyEvents, modelChanges, rewindEvents) : null,
    [allTpsEvents, allEnergyEvents, modelChanges, rewindEvents]
  );

  // Filtered events when a model is selected
  const tpsEvents = useMemo(
    () => selectedModel ? allTpsEvents.filter(e => e.data.model.modelId === selectedModel) : allTpsEvents,
    [allTpsEvents, selectedModel]
  );
  const energyEvents = useMemo(
    () => {
      if (!selectedModel) return allEnergyEvents;
      const tpsNsIds = new Set(tpsEvents.map(e => `${e.sessionId}:${e.id}`));
      return allEnergyEvents.filter(e => tpsNsIds.has(`${e.sessionId}:${e.parentId ?? ''}`));
    },
    [allEnergyEvents, selectedModel, tpsEvents]
  );

  // Filtered summary — reuse sessionSummary when unfiltered (avoid double compute)
  const summary: ConversationSummary | null = useMemo(
    () => selectedModel
      ? (tpsEvents.length > 0 ? computeSummary(tpsEvents, energyEvents, modelChanges, rewindEvents) : null)
      : sessionSummary,
    [selectedModel, tpsEvents, energyEvents, modelChanges, rewindEvents, sessionSummary]
  );

  const paired = useMemo(() => pairEnergyWithTps(tpsEvents, energyEvents), [tpsEvents, energyEvents]);

  // Multi-session summary — avoids re-filtering per-session events by caching
  // tps/energy counts on SessionState
  const multiSummary: MultiSessionSummary | null = useMemo(() => {
    if (sessions.size <= 1 || activeSessionId) return null;
    const sessionData = Array.from(sessions.entries()).map(([sessionId, s]) => {
      // Use cached arrays from session state instead of re-filtering
      const tps = getTpsEvents(s.events);
      const energy = getEnergyEvents(s.events);
      return { sessionId, tpsEvents: tps, energyEvents: energy, fileName: s.fileName ?? null };
    });
    return computeMultiSessionSummary(sessionData);
  }, [sessions, activeSessionId]);

  const buckets = useMemo(() => computeTimingBuckets(tpsEvents), [tpsEvents]);
  const dataThresholds = useMemo(() => deriveDataThresholds(tpsEvents), [tpsEvents]);
  const timeline = useMemo(() => events ? buildTimeline(events, paired) : [], [events, paired]);

  const addSession = useCallback((raw: string, fileName?: string) => {
    const ingest = ingestJsonl(raw);
    const events = deriveEvents(ingest);
    const sid = ingest.sessionId;
    setSessions(prev => {
      const next = new Map(prev);
      next.set(sid, { raw, ingest, events, fileName });
      return next;
    });
    setActiveSessionId(null); // show "all sessions" view after adding
    setSelectedModel(null);
    setSelectedTpsId(null);
  }, []);

  const removeSession = useCallback((sid: string) => {
    setSessions(prev => {
      const next = new Map(prev);
      next.delete(sid);
      return next;
    });
    if (activeSessionId === sid) setActiveSessionId(null);
  }, [activeSessionId]);

  const clearSessions = useCallback(() => {
    setSessions(new Map());
    setActiveSessionId(null);
    setSelectedModel(null);
    setSelectedTpsId(null);
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!multiSummary) return;
    const csv = exportMultiSessionCsv(multiSummary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pi-tps-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [multiSummary]);

  const handlePointClick = useCallback((id: string) => setSelectedTpsId(id), []);
  const handleSessionClick = useCallback((sid: string) => setActiveSessionId(sid), []);
  const handleBucketClick = useCallback(() => {}, []);

  const loadSample = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/sample.jsonl');
      const text = await res.text();
      addSession(text, 'sample.jsonl');
    } catch (e) {
      console.error('Failed to load sample', e);
    }
    setLoading(false);
  }, [addSession]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.jsonl') || f.name.endsWith('.json') || f.type === 'text/plain'
    );
    if (files.length === 0) return;
    let loaded = 0;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        addSession(reader.result as string, file.name);
        loaded++;
        if (loaded === files.length) setLoading(false);
      };
      reader.readAsText(file);
    }
    if (files.length > 0) setLoading(true);
  }, [addSession]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        addSession(reader.result as string, file.name);
      };
      reader.readAsText(file);
    }
    // Reset so re-selecting the same file triggers onChange
    e.target.value = '';
  }, [addSession]);

  const [pasteFlash, setPasteFlash] = useState(false);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (!text || text.trim()[0] !== '{') return;
      // Looks like JSONL — try to parse
      const parsed = parseJsonl(text);
      if (parsed.length === 0) return;
      e.preventDefault();
      addSession(text);
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 600);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addSession]);

  return (
    <div
      className="min-h-[100dvh] bg-[#fafafa] dark:bg-[#18181b]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#fafafa]/95 dark:bg-[#18181b]/95 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.08]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 bg-accent/10 dark:bg-accent/15 rounded-xl">
              <Gauge weight="bold" size={22} className="text-accent" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-300 leading-none">pi-tps</h1>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-400 font-medium tracking-wide mt-0.5">TELEMETRY INSPECTOR</p>
            </div>
          </div>
          <div className="flex flex-row items-center gap-1.5 min-w-0">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <label className="relative cursor-pointer group shrink-0">
              <input
                type="file"
                accept=".jsonl,.json"
                multiple
                className="sr-only"
                onChange={handleFileInput}
              />
              <div className="flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 bg-white dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:border-accent/30 hover:text-accent dark:hover:border-accent/40 dark:hover:text-accent-light transition-all group-active:scale-[0.98]">
                <FileArrowUp size={14} weight="bold" />
                <span className="hidden sm:inline ml-1.5">Import JSONL</span>
              </div>
            </label>
            {sessionSummary && (
              <>
                {/* Desktop: horizontal button strip */}
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 bg-white/80 dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-white/[0.06] rounded-xl overflow-x-auto scrollbar-hide max-w-full">
                  <Pulse size={12} className={selectedModel === null ? 'text-moss' : 'text-zinc-400 dark:text-zinc-500'} weight="fill" />
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
                {/* Mobile: tiny select + icon-only counters */}
                <div className="flex sm:hidden items-center gap-1.5 min-w-0">
                  <div className="relative min-w-0">
                    <select
                      value={selectedModel ?? ''}
                      onChange={(e) => setSelectedModel(e.target.value || null)}
                      className="appearance-none bg-white dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-white/[0.06] rounded-lg pl-2 pr-5 py-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-accent/30 max-w-[6.5rem] truncate"
                    >
                      <option value="">All</option>
                      {sessionSummary.models.map(m => (
                        <option key={m.modelId} value={m.modelId}>
                          {m.modelId.split('/').pop()}
                        </option>
                      ))}
                    </select>
                    <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-400 dark:text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                  {(sessionSummary.modelChangeCount > 0 || sessionSummary.rewindCount > 0) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {sessionSummary.modelChangeCount > 0 && (
                        <span className="flex items-center gap-px text-[10px] text-accent" title={`${sessionSummary.modelChangeCount} model switches`}>
                          <ArrowsLeftRight size={9} weight="bold" />
                          <span className="metric-mono">{sessionSummary.modelChangeCount}</span>
                        </span>
                      )}
                      {sessionSummary.rewindCount > 0 && (
                        <span className="flex items-center gap-px text-[10px] text-ember" title={`${sessionSummary.rewindCount} rewinds`}>
                          <ArrowBendUpLeft size={9} weight="bold" />
                          <span className="metric-mono">{sessionSummary.rewindCount}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Session strip — shows when multiple sessions loaded */}
      {sessions.size > 0 && (
        <div className="sticky top-[57px] sm:top-[65px] z-30 bg-[#fafafa] dark:bg-[#18181b] border-b border-zinc-200/40 dark:border-white/[0.06]">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2 flex-1 min-w-0">
            <FolderOpen size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" weight="bold" />
            <button
              onClick={() => setActiveSessionId(null)}
              className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium ${
                activeSessionId === null
                  ? 'bg-accent/10 text-accent dark:bg-accent/15'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
              }`}
            >
              All ({sessions.size})
            </button>
            {Array.from(sessions.entries()).map(([sid, s]) => {
              const tpsCount = getTpsEvents(s.events).length;
              const label = s.fileName
                ? s.fileName.replace(/\.(jsonl|json)$/, '')
                : sid.length > 16 ? sid.slice(0, 16) + '…' : sid;
              return (
                <div
                  key={sid}
                  className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                    activeSessionId === sid
                      ? 'bg-accent/10 text-accent dark:bg-accent/15'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                  onClick={() => setActiveSessionId(activeSessionId === sid ? null : sid)}
                >
                  <span className="truncate max-w-[12rem]">{label}</span>
                  <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-500">{tpsCount} req</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSession(sid); }}
                    className="ml-0.5 p-0.5 rounded hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    title="Remove session"
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              );
            })}
            </div>
            <div className="shrink-0 flex items-center gap-1.5 py-2 border-l border-zinc-200/40 dark:border-white/[0.06] pl-3 ml-1">
            <button
              onClick={handleExportCsv}
              className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-accent hover:bg-accent/5 dark:hover:bg-accent/10 transition-colors flex items-center gap-1"
              title="Export per-session stats as CSV"
            >
              <DownloadSimple size={10} weight="bold" />
              CSV
            </button>
            <button
              onClick={clearSessions}
              className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-ember hover:bg-ember/5 dark:hover:bg-ember/10 transition-colors"
            >
              Clear all
            </button>
            </div>
          </div>
        </div>
      )}

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
            className="flex items-center justify-center min-h-[70dvh] px-4 sm:px-6"
          >
            <div className={`max-w-lg w-full text-center p-12 rounded-[2.5rem] border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-accent bg-accent/5 dark:border-accent dark:bg-accent/10'
                : 'border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-zinc-800/40'
            }`}>
              <div className="w-16 h-16 mx-auto mb-6 bg-zinc-50 dark:bg-white/[0.06] rounded-3xl flex items-center justify-center">
                <FileArrowUp size={28} className="text-zinc-300 dark:text-zinc-400" weight="duotone" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Drop, paste, or import telemetry files</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-400 mb-6 leading-relaxed">
                Drag and drop <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">.jsonl</code> files (one or many), or paste JSONL contents directly (<kbd className="metric-mono text-[11px] bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded border border-zinc-200/60 dark:border-white/[0.06]">⌘V</kbd>). Supports telemetry exports from <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">/tps-export</code> and raw session files from <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">~/.pi/agent/sessions</code>.
              </p>
              <a
                href="https://github.com/monotykamary/pi-tps"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 text-left px-4 py-3 rounded-xl border border-accent/15 dark:border-accent/20 bg-accent/[0.04] dark:bg-accent/10 hover:bg-accent/[0.07] dark:hover:bg-accent/[0.14] transition-colors mb-8"
              >
                <Info size={16} className="text-accent shrink-0 mt-0.5" weight="bold" />
                <div>
                  <p className="text-xs font-semibold text-accent leading-snug">Get the most out of your analytics</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-0.5">
                    Use <span className="font-medium text-zinc-700 dark:text-zinc-300">pi-tps</span> to hook into pi and stream rich telemetry — TPS, TTFT, energy, cache hits, and more — straight to this inspector.
                  </p>
                </div>
              </a>
              <button
                onClick={loadSample}
                className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-dark transition-colors active:scale-[0.98] active:translate-y-[1px]"
              >
                Load Sample Data
              </button>
              {pasteFlash && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 justify-center text-sm text-moss font-medium"
                >
                  <ClipboardText size={16} weight="bold" />
                  Pasted — loading telemetry…
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className={`max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-8 rounded-[2rem] border-2 border-dashed transition-colors ${
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
                transition={{ duration: 0.2 }}
                className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-2"
              >
                <MetricPill icon={Pulse} label="Requests" value={formatNumber(summary.totalCalls)} tooltip={
  <RequestsTooltip
    total={summary.totalCalls}
    models={summary.models}
    avgTokensPerCall={summary.avgTokensPerCall}
    stalledCalls={summary.stalledCalls}
    cachedCalls={summary.cachedCalls}
    fastCalls={summary.fastCalls}
  />
} />
                <MetricPill icon={Timer} label="Total Time" value={formatDuration(summary.wallClockMs)} tooltip={<TotalTimeTooltip wallClockMs={summary.wallClockMs} totalTimeMs={summary.totalTimeMs} generationMs={summary.totalGenerationMs} />} />
                <TpsPill icon={Gauge} label="Avg TPS" activeTps={summary.avgTps} wallTps={summary.avgWallTps} lossPct={summary.tpsLoss} mode="avg" />
                <TpsPill icon={Barbell} label="Wtd TPS" activeTps={summary.weightedTps} wallTps={summary.weightedWallTps} lossPct={summary.weightedTpsLoss} accent mode="weighted" />
                <MetricPill icon={Clock} label="Avg TTFT" value={formatDuration(Math.round(summary.avgTtft))} tooltip={<TtftTooltip avgTtft={summary.avgTtft} p50={summary.ttftP50} p75={summary.ttftP75} p90={summary.ttftP90} p99={summary.ttftP99} min={summary.minTtft} max={summary.maxTtft} />} />
                <MetricPill icon={Flame} label="Stalls (ITL)" value={formatNumber(summary.totalStallCount)} accent tooltip={<StallsTooltip count={summary.totalStallCount} ms={summary.totalStallMs} totalTimeMs={summary.totalTimeMs} />} />
                <MetricPill icon={Coins} label="Cost" value={formatCurrency(summary.totalCostUsd)} tooltip={<CostTooltip totalCost={summary.totalCostUsd} energyCost={summary.energyCostUsd} costSource={summary.costSource} models={summary.models} totalTokens={summary.totalTokens} />} />
                {(() => {
                  const energy = summary.totalEnergyJoules !== null ? formatEnergyParts(summary.totalEnergyJoules) : null;
                  return (
                    <MetricPill
                      icon={Lightning}
                      label="Energy"
                      value={energy ? energy.value : '-'}
                      unit={energy ? energy.unit : undefined}
                      tooltip={<EnergyTooltip joules={summary.totalEnergyJoules} energyCost={summary.energyCostUsd} models={summary.models} totalCalls={summary.totalCalls} />}
                    />
                  );
                })()}
                <MetricPill icon={Hash} label="Tokens" value={formatNumber(summary.totalTokens)} tooltip={<TokensTooltip input={summary.totalInput} output={summary.totalOutput} cacheRead={summary.totalCacheRead} cacheWrite={summary.totalCacheWrite} total={summary.totalTokens} totalCost={summary.totalCostUsd} />} />
              </motion.div>
            )}

            {/* Per-Session Breakdown — only in "All sessions" merged view */}
            {multiSummary && multiSummary.sessionCount > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white/80 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-2xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-zinc-200/40 dark:border-white/[0.06] flex items-center gap-2">
                  <Rows size={14} className="text-accent" weight="bold" />
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">Sessions Overview</h2>
                  <span className="ml-auto text-[10px] metric-mono text-zinc-400 dark:text-zinc-500">{multiSummary.sessionCount} sessions · {formatNumber(multiSummary.totalCalls)} requests</span>
                </div>
                <div className="overflow-x-auto" style={{ contain: 'content' }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/30 dark:border-white/[0.04]">
                        <th className="text-left px-4 py-2 font-medium">Session</th>
                        <th className="text-right px-3 py-2 font-medium">Requests</th>
                        <th className="text-right px-3 py-2 font-medium">Tokens</th>
                        <th className="text-right px-3 py-2 font-medium">Avg TPS</th>
                        <th className="text-right px-3 py-2 font-medium">Wtd TPS</th>
                        <th className="text-right px-3 py-2 font-medium">Avg TTFT</th>
                        <th className="text-right px-3 py-2 font-medium">Cost</th>
                        <th className="text-right px-3 py-2 font-medium">Energy</th>
                        <th className="text-right px-3 py-2 font-medium">Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiSummary.sessions.map((s, i) => (
                        <tr
                          key={s.sessionId}
                          className={`border-b border-zinc-200/20 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer ${
                            i % 2 === 0 ? 'bg-zinc-50/30 dark:bg-white/[0.01]' : ''
                          }`}
                          onClick={() => setActiveSessionId(s.sessionId)}
                        >
                          <td className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 max-w-[16rem] truncate">
                            {s.fileName || s.sessionId.length > 20 ? (s.fileName || s.sessionId.slice(0, 20) + '…') : s.sessionId}
                          </td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatNumber(s.totalCalls, 0)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatNumber(s.totalTokens)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatTps(s.avgTps)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-accent font-medium">{formatTps(s.weightedTps)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatDuration(Math.round(s.avgTtft))}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatCurrency(s.totalCostUsd)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{s.totalEnergyJoules !== null ? formatEnergy(s.totalEnergyJoules) : '-'}</td>
                          <td className="px-3 py-2 text-right text-zinc-500 dark:text-zinc-400 max-w-[8rem] truncate">{s.model.split('/').pop()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-200/50 dark:border-white/[0.06] font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100/40 dark:bg-white/[0.03]">
                        <td className="px-4 py-2.5">Total ({multiSummary.sessionCount})</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatNumber(multiSummary.totalCalls, 0)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatNumber(multiSummary.totalTokens)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatTps(multiSummary.avgTps)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono text-accent">{formatTps(multiSummary.weightedTps)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatDuration(Math.round(multiSummary.avgTtft))}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatCurrency(multiSummary.totalCostUsd)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{multiSummary.totalEnergyJoules !== null ? formatEnergy(multiSummary.totalEnergyJoules) : '-'}</td>
                        <td className="px-3 py-2.5 text-right">—</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Charts */}
              <div className="lg:col-span-8 space-y-6">
                <TimelineChart buckets={buckets} onBucketClick={handleBucketClick} />
                <TimingScatter events={paired} onPointClick={handlePointClick} thresholds={dataThresholds} />
                {multiSummary && multiSummary.sessionCount > 1 && (
                  <SessionScatter multiSummary={multiSummary} onSessionClick={handleSessionClick} />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TimingDistribution events={paired} thresholds={dataThresholds} />
                  <CacheEfficiency events={paired} />
                </div>
                <TokenBreakdown events={paired} />
              </div>

              {/* Right: Analysis Panel */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                {multiSummary && multiSummary.models.length > 1 && (
                  <ModelPerformance
                    models={multiSummary.models}
                    avgTps={multiSummary.avgTps}
                    weightedTps={multiSummary.weightedTps}
                    totalCalls={multiSummary.totalCalls}
                  />
                )}
                <ThresholdAnalysis events={tpsEvents} thresholds={dataThresholds} />
                <AnomalyDetector events={paired} thresholds={dataThresholds} />
                <RequestInspector
                  timeline={timeline}
                  selectedId={selectedTpsId}
                  onSelect={handlePointClick}
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
