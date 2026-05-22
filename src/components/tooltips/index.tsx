import { Warning, Info } from '@phosphor-icons/react';
import type { ModelInfo } from '../../types';
import { formatTps, formatCurrency, formatDuration, formatEnergy, formatNumber } from '../../lib/format/format';

export function TpsTooltip({ activeTps, wallTps, lossPct, mode }: { activeTps: number; wallTps: number; lossPct: number; mode: 'avg' | 'weighted' }) {
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

export function RequestsTooltip({
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
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Requests</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">calls</p>
      </div>
      <div className="flex items-baseline gap-2 mb-2.5">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatNumber(total, 0)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">total LLM calls</span>
      </div>

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

export function TotalTimeTooltip({ wallClockMs, totalTimeMs, generationMs }: { wallClockMs: number; totalTimeMs: number; generationMs: number }) {
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

      <div className="flex items-baseline gap-2 mb-2.5">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatDuration(wallClockMs)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">wall-clock span</span>
      </div>

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

export function TtftTooltip({ avgTtft, p50, p75, p90, p99, min, max }: { avgTtft: number; p50: number; p75: number; p90: number; p99: number; min: number; max: number }) {
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

export function StallsTooltip({ count, ms, totalTimeMs }: { count: number; ms: number; totalTimeMs: number }) {
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

export function CostTooltip({ totalCost, energyCost, costSource, models, totalTokens }: {
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
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Total Cost</p>
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500">USD</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatCurrency(totalCost)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{costSource ? `source: ${costSource}` : 'unknown source'}</span>
      </div>

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

export function EnergyTooltip({ joules, energyCost, models, totalCalls }: { joules: number | null; energyCost: number | null; models: ModelInfo[]; totalCalls: number }) {
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

  const smartphoneCharges = joules / 18_000;
  const ledHours = joules / (9 * 3600);

  return (
    <div className="glass-panel rounded-2xl px-4 py-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Energy</p>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <p className="metric-mono text-xl font-bold text-zinc-800 dark:text-zinc-200">{formatEnergy(joules)}</p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{kwh.toFixed(4)} kWh</span>
      </div>

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

      <div className="space-y-1 mb-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 dark:text-zinc-400">9W LED bulb</span>
          <span className="metric-mono font-medium text-zinc-800 dark:text-zinc-200">{ledHours.toFixed(1)}h</span>
        </div>
      </div>

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

export function TokensTooltip({ input, output, cacheRead, cacheWrite, total, totalCost }: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; totalCost: number | null }) {
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
