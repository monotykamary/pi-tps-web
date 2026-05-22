import { runQuery } from './duckdb';
import type { QueryResult } from './duckdb';

// ─── Row mappers: convert QueryResult rows → typed objects ──────────────────

function col(results: QueryResult, row: number, colName: string): unknown {
  const idx = results.columns.indexOf(colName);
  if (idx === -1) return undefined;
  return results.rows[row]?.[idx];
}

function str(results: QueryResult, row: number, colName: string): string {
  return (col(results, row, colName) as string) ?? '';
}

function num(results: QueryResult, row: number, colName: string): number {
  const v = col(results, row, colName);
  if (v == null) return 0;
  return Number(v);
}

function maybeNum(results: QueryResult, row: number, colName: string): number | null {
  const v = col(results, row, colName);
  if (v == null) return null;
  return Number(v);
}

// ─── Scatter/Chart data types ────────────────────────────────────────────────

export interface ScatterPoint {
  id: string;
  sessionId: string;
  timestamp: string;
  tokensTotal: number;
  ttftMs: number;
  totalMs: number;
  cacheRatio: number;
  newRatio: number;
  input: number;
  output: number;
  cacheRead: number;
  effectiveTps: number;
  wallTps: number;
  stallCount: number;
  stallMs: number;
  category: 'fast' | 'normal' | 'slow' | 'anomaly';
  energyJoules: number | null;
  energyCostUsd: number | null;
}

export interface TimingBucketRow {
  range: string;
  label: string;
  count: number;
  avgTtft: number;
  avgTotal: number;
  avgTps: number;
  avgWallTps: number;
  avgTpsLoss: number;
  totalTokens: number;
}

export interface TokenCompositionRow {
  index: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  ttft: number;
}

export interface CacheOverTimeInterval {
  label: string;
  hitRate: number;
}

export interface CacheOverallSlice {
  name: string;
  value: number;
  color: string;
}

export interface TtftBinRow {
  label: string;
  count: number;
  pct: number;
  barPct: number;
  color: string;
}

export interface ThresholdStat {
  threshold: number;
  above: { count: number; avgTtft: number; avgTps: number; avgCacheRatio: number };
  below: { count: number; avgTtft: number; avgTps: number; avgCacheRatio: number };
  ttftDelta: number;
}

export interface AnomalyRow {
  eventId: string;
  sessionId: string;
  type: 'cache-drop' | 'slow-zone' | 'high-new-input' | 'stall-spike';
  index: number;
  description: string;
  severity: 'high' | 'medium' | 'low';
  tokensTotal: number;
  energyCostUsd: number | null;
  tokenCostUsd: number | null;
}

export interface TimelineEventRow {
  id: string;
  sessionId: string;
  timestamp: string;
  type: 'tps' | 'model_change' | 'rewind' | 'branch_summary';
  // TPS fields
  provider?: string;
  modelId?: string;
  tokensInput?: number;
  tokensOutput?: number;
  tokensCacheRead?: number;
  tokensCacheWrite?: number;
  tokensTotal?: number;
  ttftMs?: number;
  totalMs?: number;
  generationMs?: number;
  stallMs?: number;
  stallCount?: number;
  effectiveTps?: number;
  wallTps?: number;
  tps?: number;
  costTotal?: number | null;
  energyJoules?: number | null;
  energyCostUsd?: number | null;
  cacheRatio?: number;
  // Structural fields
  rewindV?: number;
  fromId?: string;
  summary?: string;
}

export interface SessionSummaryRow {
  sessionId: string;
  fileName: string | null;
  totalCalls: number;
  totalTokens: number;
  totalOutput: number;
  wallClockMs: number;
  avgTps: number;
  weightedTps: number;
  avgTtft: number;
  totalCostUsd: number | null;
  totalEnergyJoules: number | null;
  model: string;
  provider: string;
  stalledCalls: number;
  timeRangeStart: string;
  timeRangeEnd: string;
}

export interface ModelInfoRow {
  modelId: string;
  provider: string;
  callCount: number;
  totalTokens: number;
  energyCostUsd: number | null;
  energyJoules: number | null;
  blendedCostUsd: number | null;
  costSource: 'neuralwatt' | 'tps' | null;
}

export interface ConversationSummaryRow {
  totalCalls: number;
  totalTokens: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  wallClockMs: number;
  totalTimeMs: number;
  totalGenerationMs: number;
  totalStallMs: number;
  totalStallCount: number;
  avgTps: number;
  weightedTps: number;
  avgWallTps: number;
  weightedWallTps: number;
  tpsLoss: number;
  weightedTpsLoss: number;
  avgTtft: number;
  ttftP50: number;
  ttftP75: number;
  ttftP90: number;
  ttftP99: number;
  totalCostUsd: number | null;
  costSource: 'neuralwatt' | 'tps' | 'both' | null;
  energyCostUsd: number | null;
  totalEnergyJoules: number | null;
  avgTokensPerCall: number;
  stalledCalls: number;
  cachedCalls: number;
  fastCalls: number;
  minTtft: number;
  maxTtft: number;
  model: string;
  provider: string;
  timeRangeStart: string;
  timeRangeEnd: string;
  rewindCount: number;
  modelChangeCount: number;
}

export interface DataThresholdsRow {
  cacheThreshold: number;
  lowContext: number;
  slowTtft: number;
  fastTtft: number;
  highNewInputRatio: number;
  anomalyInputThreshold: number;
  cacheDropMinTotal: number;
  cacheDropMinInput: number;
  highInputRatio: number;
  highInputSeverityToken: number;
  stallCountThreshold: number;
  stallMsSeverity: number;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Main summary — replaces computeSummary() entirely with SQL.
 * Uses the enriched tps_paired view for cost attribution.
 */
export async function querySummary(modelFilter?: string | null): Promise<ConversationSummaryRow | null> {
  const where = modelFilter ? `WHERE model_id = '${modelFilter.replace(/'/g, "''")}'` : '';

  const sql = `
    WITH tps AS (
      SELECT * FROM tps_paired ${where}
    ),
    aggregated AS (
      SELECT
        count(*)                                    AS total_calls,
        COALESCE(sum(tokens_input), 0)              AS total_input,
        COALESCE(sum(tokens_output), 0)             AS total_output,
        COALESCE(sum(tokens_cache_read), 0)         AS total_cache_read,
        COALESCE(sum(tokens_cache_write), 0)        AS total_cache_write,
        COALESCE(sum(tokens_input + tokens_output + tokens_cache_read + tokens_cache_write), 0) AS total_tokens,
        COALESCE(sum(total_ms), 0)                  AS total_time_ms,
        COALESCE(sum(generation_ms), 0)             AS total_generation_ms,
        COALESCE(sum(stall_ms), 0)                  AS total_stall_ms,
        COALESCE(sum(stall_count), 0)              AS total_stall_count,
        -- Weighted TPS: total output / total effective time (seconds)
        CASE WHEN sum(effective_ms) > 0
          THEN sum(tokens_output) / (sum(effective_ms) / 1000.0)
          ELSE 0 END                                AS weighted_tps,
        -- Weighted wall TPS
        CASE WHEN sum(total_ms) > 0
          THEN sum(tokens_output) / (sum(total_ms) / 1000.0)
          ELSE 0 END                                AS weighted_wall_tps,
        -- Simple average TPS
        CASE WHEN count(*) > 0
          THEN avg(effective_tps)
          ELSE 0 END                                AS avg_tps,
        -- Simple average wall TPS
        CASE WHEN count(*) > 0
          THEN avg(wall_tps)
          ELSE 0 END                                AS avg_wall_tps,
        -- TTFT stats
        avg(ttft_ms)                                AS avg_ttft,
        min(ttft_ms)                                AS min_ttft,
        max(ttft_ms)                                AS max_ttft,
        -- Wall clock
        CASE WHEN count(*) > 0
          THEN EXTRACT(EPOCH FROM (max(timestamp::timestamp) - min(timestamp::timestamp))) * 1000
          ELSE 0 END                                AS wall_clock_ms,
        -- Percentiles
        percentile_cont(0.50) WITHIN GROUP (ORDER BY ttft_ms) AS ttft_p50,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY ttft_ms) AS ttft_p75,
        percentile_cont(0.90) WITHIN GROUP (ORDER BY ttft_ms) AS ttft_p90,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY ttft_ms) AS ttft_p99,
        -- Counts
        count(*) FILTER (WHERE stall_count > 0 OR stall_ms > 0) AS stalled_calls,
        count(*) FILTER (WHERE tokens_cache_read > 0 OR tokens_cache_write > 0) AS cached_calls,
        count(*) FILTER (WHERE ttft_ms < 3000)               AS fast_calls,
        -- Last model (using arg_max pattern)
        (array_agg(model_id ORDER BY timestamp DESC))[1] AS last_model,
        (array_agg(provider ORDER BY timestamp DESC))[1] AS last_provider,
        -- Time range
        min(timestamp)                              AS time_range_start,
        max(timestamp)                              AS time_range_end,
        -- Cost totals
        sum(CASE WHEN energy_cost_usd IS NOT NULL THEN energy_cost_usd ELSE 0 END) AS total_energy_cost,
        sum(CASE WHEN energy_cost_usd IS NULL AND cost_total IS NOT NULL THEN cost_total ELSE 0 END) AS total_token_cost,
        sum(CASE WHEN energy_cost_usd IS NOT NULL THEN energy_cost_usd
                 WHEN cost_total IS NOT NULL THEN cost_total ELSE 0 END)             AS total_cost_combined,
        max(CASE WHEN energy_cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS has_energy_cost,
        max(CASE WHEN cost_total IS NOT NULL AND energy_cost_usd IS NULL THEN 1 ELSE 0 END) AS has_token_cost,
        -- Energy totals
        sum(energy_joules)                          AS total_energy_joules
      FROM tps
    )
    SELECT
      total_calls,
      total_tokens,
      total_input,
      total_output,
      total_cache_read,
      total_cache_write,
      wall_clock_ms,
      total_time_ms,
      total_generation_ms,
      total_stall_ms,
      total_stall_count,
      avg_tps,
      weighted_tps,
      avg_wall_tps,
      weighted_wall_tps,
      CASE WHEN avg_tps > 0 THEN ((avg_tps - avg_wall_tps) / avg_tps) * 100 ELSE 0 END AS tps_loss,
      CASE WHEN weighted_tps > 0 THEN ((weighted_tps - weighted_wall_tps) / weighted_tps) * 100 ELSE 0 END AS weighted_tps_loss,
      avg_ttft,
      ttft_p50,
      ttft_p75,
      ttft_p90,
      ttft_p99,
      CASE WHEN has_energy_cost > 0 OR has_token_cost > 0 THEN total_cost_combined ELSE NULL END AS total_cost_usd,
      CASE
        WHEN has_energy_cost > 0 AND has_token_cost > 0 THEN 'both'
        WHEN has_energy_cost > 0 THEN 'neuralwatt'
        WHEN has_token_cost > 0 THEN 'tps'
        ELSE NULL
      END AS cost_source,
      CASE WHEN has_energy_cost > 0 THEN total_energy_cost ELSE NULL END AS energy_cost_usd,
      total_energy_joules,
      CASE WHEN total_calls > 0 THEN total_tokens::double / total_calls ELSE 0 END AS avg_tokens_per_call,
      stalled_calls,
      cached_calls,
      fast_calls,
      min_ttft,
      max_ttft,
      last_model         AS model,
      last_provider      AS provider,
      time_range_start,
      time_range_end,
      0 AS rewind_count,
      0 AS model_change_count
    FROM aggregated
  `;

  const result = await runQuery(sql);
  if (result.rowCount === 0) return null;

  const r = 0;
  return {
    totalCalls: num(result, r, 'total_calls'),
    totalTokens: num(result, r, 'total_tokens'),
    totalInput: num(result, r, 'total_input'),
    totalOutput: num(result, r, 'total_output'),
    totalCacheRead: num(result, r, 'total_cache_read'),
    totalCacheWrite: num(result, r, 'total_cache_write'),
    wallClockMs: num(result, r, 'wall_clock_ms'),
    totalTimeMs: num(result, r, 'total_time_ms'),
    totalGenerationMs: num(result, r, 'total_generation_ms'),
    totalStallMs: num(result, r, 'total_stall_ms'),
    totalStallCount: num(result, r, 'total_stall_count'),
    avgTps: num(result, r, 'avg_tps'),
    weightedTps: num(result, r, 'weighted_tps'),
    avgWallTps: num(result, r, 'avg_wall_tps'),
    weightedWallTps: num(result, r, 'weighted_wall_tps'),
    tpsLoss: num(result, r, 'tps_loss'),
    weightedTpsLoss: num(result, r, 'weighted_tps_loss'),
    avgTtft: num(result, r, 'avg_ttft'),
    ttftP50: num(result, r, 'ttft_p50'),
    ttftP75: num(result, r, 'ttft_p75'),
    ttftP90: num(result, r, 'ttft_p90'),
    ttftP99: num(result, r, 'ttft_p99'),
    totalCostUsd: maybeNum(result, r, 'total_cost_usd'),
    costSource: col(result, r, 'cost_source') as ConversationSummaryRow['costSource'],
    energyCostUsd: maybeNum(result, r, 'energy_cost_usd'),
    totalEnergyJoules: maybeNum(result, r, 'total_energy_joules'),
    avgTokensPerCall: num(result, r, 'avg_tokens_per_call'),
    stalledCalls: num(result, r, 'stalled_calls'),
    cachedCalls: num(result, r, 'cached_calls'),
    fastCalls: num(result, r, 'fast_calls'),
    minTtft: num(result, r, 'min_ttft'),
    maxTtft: num(result, r, 'max_ttft'),
    model: str(result, r, 'model'),
    provider: str(result, r, 'provider'),
    timeRangeStart: str(result, r, 'time_range_start'),
    timeRangeEnd: str(result, r, 'time_range_end'),
    rewindCount: num(result, r, 'rewind_count'),
    modelChangeCount: num(result, r, 'model_change_count'),
  };
}

/**
 * Per-model breakdown from the tps_paired view.
 */
export async function queryModels(modelFilter?: string | null): Promise<ModelInfoRow[]> {
  const where = modelFilter ? `WHERE model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const sql = `
    SELECT
      model_id,
      provider,
      count(*)                                      AS call_count,
      sum(tokens_total)                              AS total_tokens,
      sum(CASE WHEN energy_cost_usd IS NOT NULL THEN energy_cost_usd ELSE 0 END)
                                                      AS energy_cost_usd,
      sum(energy_joules)                              AS energy_joules,
      sum(CASE WHEN energy_cost_usd IS NOT NULL THEN energy_cost_usd
               WHEN cost_total IS NOT NULL THEN cost_total ELSE 0 END)
                                                      AS blended_cost_usd,
      max(CASE WHEN energy_cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS has_energy,
      max(CASE WHEN cost_total IS NOT NULL AND energy_cost_usd IS NULL THEN 1 ELSE 0 END) AS has_token_cost
    FROM tps_paired
    ${where}
    GROUP BY model_id, provider
    ORDER BY blended_cost_usd DESC
  `;

  const result = await runQuery(sql);
  const rows: ModelInfoRow[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    const hasEnergy = num(result, i, 'has_energy') > 0;
    const hasToken = num(result, i, 'has_token_cost') > 0;
    rows.push({
      modelId: str(result, i, 'model_id'),
      provider: str(result, i, 'provider'),
      callCount: num(result, i, 'call_count'),
      totalTokens: num(result, i, 'total_tokens'),
      energyCostUsd: hasEnergy ? num(result, i, 'energy_cost_usd') : null,
      energyJoules: hasEnergy ? maybeNum(result, i, 'energy_joules') : null,
      blendedCostUsd: (hasEnergy || hasToken) ? num(result, i, 'blended_cost_usd') : null,
      costSource: hasEnergy ? 'neuralwatt' : hasToken ? 'tps' : null,
    });
  }
  return rows;
}

/**
 * Scatter plot data — replaces the useMemo in TimingScatter.
 */
export async function queryScatter(
  thresholds: DataThresholdsRow,
  modelFilter?: string | null,
): Promise<ScatterPoint[]> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const sql = `
    SELECT
      id,
      session_id,
      timestamp,
      tokens_total,
      ttft_ms,
      total_ms,
      tokens_input,
      tokens_output,
      tokens_cache_read,
      effective_tps,
      wall_tps,
      stall_count,
      stall_ms,
      energy_joules,
      energy_cost_usd,
      CASE
        WHEN tokens_input > ${thresholds.anomalyInputThreshold} THEN 'anomaly'
        WHEN ttft_ms > ${thresholds.slowTtft} AND tokens_total < ${thresholds.cacheThreshold} THEN 'slow'
        WHEN tokens_total > ${thresholds.cacheThreshold} AND ttft_ms < ${thresholds.fastTtft}
             AND tokens_input::double / NULLIF(tokens_total, 0) < ${thresholds.highNewInputRatio} THEN 'fast'
        ELSE 'normal'
      END AS category
    FROM tps_paired
    WHERE 1=1 ${where}
    ORDER BY timestamp
  `;

  const result = await runQuery(sql);
  const points: ScatterPoint[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    const tokensTotal = num(result, i, 'tokens_total');
    points.push({
      id: str(result, i, 'id'),
      sessionId: str(result, i, 'session_id'),
      timestamp: str(result, i, 'timestamp'),
      tokensTotal,
      ttftMs: num(result, i, 'ttft_ms'),
      totalMs: num(result, i, 'total_ms'),
      cacheRatio: tokensTotal > 0 ? num(result, i, 'tokens_cache_read') / tokensTotal : 0,
      newRatio: tokensTotal > 0 ? num(result, i, 'tokens_input') / tokensTotal : 0,
      input: num(result, i, 'tokens_input'),
      output: num(result, i, 'tokens_output'),
      cacheRead: num(result, i, 'tokens_cache_read'),
      effectiveTps: num(result, i, 'effective_tps'),
      wallTps: num(result, i, 'wall_tps'),
      stallCount: num(result, i, 'stall_count'),
      stallMs: num(result, i, 'stall_ms'),
      category: col(result, i, 'category') as ScatterPoint['category'],
      energyJoules: maybeNum(result, i, 'energy_joules'),
      energyCostUsd: maybeNum(result, i, 'energy_cost_usd'),
    });
  }
  return points;
}

/**
 * Timing buckets for the timeline chart — replaces computeTimingBuckets().
 */
export async function queryTimingBuckets(modelFilter?: string | null): Promise<TimingBucketRow[]> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const sql = `
    WITH ranked AS (
      SELECT *,
        ntile(20) OVER (ORDER BY timestamp) AS bucket
      FROM tps_paired
      WHERE 1=1 ${where}
    )
    SELECT
      min(timestamp)::varchar || '-' || max(timestamp)::varchar AS range,
      strftime(min(timestamp)::timestamp, '%H:%M:%S')           AS label,
      count(*)                                                  AS count,
      round(avg(ttft_ms))                                       AS avg_ttft,
      round(avg(total_ms))                                      AS avg_total,
      round(avg(effective_tps) * 10) / 10.0                    AS avg_tps,
      round(avg(wall_tps) * 10) / 10.0                          AS avg_wall_tps,
      CASE WHEN avg(effective_tps) > 0
        THEN round(((avg(effective_tps) - avg(wall_tps)) / avg(effective_tps)) * 1000) / 10.0
        ELSE 0 END                                              AS avg_tps_loss,
      sum(tokens_total)                                         AS total_tokens
    FROM ranked
    GROUP BY bucket
    ORDER BY min(timestamp)
  `;

  const result = await runQuery(sql);
  const buckets: TimingBucketRow[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    buckets.push({
      range: str(result, i, 'range'),
      label: str(result, i, 'label'),
      count: num(result, i, 'count'),
      avgTtft: num(result, i, 'avg_ttft'),
      avgTotal: num(result, i, 'avg_total'),
      avgTps: num(result, i, 'avg_tps'),
      avgWallTps: num(result, i, 'avg_wall_tps'),
      avgTpsLoss: num(result, i, 'avg_tps_loss'),
      totalTokens: num(result, i, 'total_tokens'),
    });
  }
  return buckets;
}

/**
 * Token composition for the stacked bar chart — last 30 requests.
 */
export async function queryTokenComposition(modelFilter?: string | null): Promise<TokenCompositionRow[]> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const sql = `
    SELECT
      tokens_input  AS input,
      tokens_output AS output,
      tokens_cache_read AS cache_read,
      tokens_cache_write AS cache_write,
      tokens_total  AS total,
      ttft_ms       AS ttft
    FROM tps_paired
    WHERE 1=1 ${where}
    ORDER BY timestamp
    LIMIT 30
  `;

  const result = await runQuery(sql);
  const rows: TokenCompositionRow[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    rows.push({
      index: i + 1,
      input: num(result, i, 'input'),
      output: num(result, i, 'output'),
      cacheRead: num(result, i, 'cache_read'),
      cacheWrite: num(result, i, 'cache_write'),
      total: num(result, i, 'total'),
      ttft: num(result, i, 'ttft'),
    });
  }
  return rows;
}

/**
 * Cache efficiency data — overall pie + over-time bars.
 */
export async function queryCacheEfficiency(modelFilter?: string | null): Promise<{
  overall: CacheOverallSlice[];
  overTime: CacheOverTimeInterval[];
  hitRate: number;
}> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';

  // Overall totals
  const overallSql = `
    SELECT
      COALESCE(sum(tokens_cache_read), 0) AS cache_read,
      COALESCE(sum(tokens_input), 0)      AS new_input,
      COALESCE(sum(tokens_output), 0)      AS output
    FROM tps_paired
    WHERE 1=1 ${where}
  `;

  const overallResult = await runQuery(overallSql);
  const cacheRead = num(overallResult, 0, 'cache_read');
  const newInput = num(overallResult, 0, 'new_input');
  const output = num(overallResult, 0, 'output');
  const total = cacheRead + newInput + output;
  const hitRate = total > 0 ? (cacheRead / total) * 100 : 0;

  const overall: CacheOverallSlice[] = [
    { name: 'Cache Read', value: cacheRead, color: '#0891b2' },
    { name: 'New Input', value: newInput, color: '#3f3f46' },
    { name: 'Output', value: output, color: '#059669' },
  ];

  // Over-time intervals
  const timeSql = `
    WITH ranked AS (
      SELECT *,
        ntile(greatest(6, least(12, ceiling(count(*) over () / 60.0)))) OVER (ORDER BY timestamp) AS bucket
      FROM tps_paired
      WHERE 1=1 ${where}
    )
    SELECT
      (row_number() OVER (ORDER BY min(timestamp)))::varchar || '-' ||
        (sum(count(*)) OVER (ORDER BY min(timestamp)) - count(*) + 1 + count(*) - 1)::varchar AS chunk_label,
      round(CASE WHEN sum(tokens_total) > 0
        THEN (sum(tokens_cache_read)::double / sum(tokens_total)) * 100
        ELSE 0 END) AS hit_rate
    FROM (
      SELECT bucket, min(timestamp) AS min_ts,
        sum(tokens_cache_read) AS cache_read,
        sum(tokens_total) AS total_tokens,
        count(*) AS cnt
      FROM ranked
      GROUP BY bucket
    ) sub
    ORDER BY min_ts
  `;

  const timeResult = await runQuery(timeSql);
  const overTime: CacheOverTimeInterval[] = [];
  // Simpler approach: use row-based query
  const timeSql2 = `
    WITH ranked AS (
      SELECT *,
        ntile(greatest(6, least(12, ceiling(count(*) over () / 60.0)))) OVER (ORDER BY timestamp) AS bucket,
        row_number() OVER (ORDER BY timestamp) AS rn
      FROM tps_paired
      WHERE 1=1 ${where}
    )
    SELECT
      min(rn)::varchar || '-' || max(rn)::varchar AS label,
      round(CASE WHEN sum(tokens_total) > 0
        THEN (sum(tokens_cache_read)::double / sum(tokens_total)) * 100
        ELSE 0 END) AS hit_rate
    FROM ranked
    GROUP BY bucket
    ORDER BY min(rn)
  `;

  const timeResult2 = await runQuery(timeSql2);
  for (let i = 0; i < timeResult2.rowCount; i++) {
    overTime.push({
      label: str(timeResult2, i, 'label'),
      hitRate: num(timeResult2, i, 'hit_rate'),
    });
  }

  return { overall, overTime, hitRate };
}

/**
 * TTFT distribution bins — replaces TimingDistribution's useMemo.
 */
export async function queryTtftDistribution(modelFilter?: string | null): Promise<{
  bins: TtftBinRow[];
  fastCount: number;
  slowCount: number;
  percentiles: { label: string; value: number }[];
}> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';

  // Bin counts
  const binSql = `
    SELECT
      CASE
        WHEN ttft_ms <= 1000 THEN '<1s'
        WHEN ttft_ms <= 3000 THEN '1-3s'
        WHEN ttft_ms <= 5000 THEN '3-5s'
        WHEN ttft_ms <= 10000 THEN '5-10s'
        WHEN ttft_ms <= 15000 THEN '10-15s'
        WHEN ttft_ms <= 30000 THEN '15-30s'
        ELSE '>30s'
      END AS label,
      CASE
        WHEN ttft_ms <= 1000 THEN 0
        WHEN ttft_ms <= 3000 THEN 1
        WHEN ttft_ms <= 5000 THEN 2
        WHEN ttft_ms <= 10000 THEN 3
        WHEN ttft_ms <= 15000 THEN 4
        WHEN ttft_ms <= 30000 THEN 5
        ELSE 6
      END AS bin_order,
      count(*) AS cnt
    FROM tps_paired
    WHERE 1=1 ${where}
    GROUP BY label, bin_order
    ORDER BY bin_order
  `;

  const binResult = await runQuery(binSql);
  const colorMap = ['bg-moss', 'bg-moss/70', 'bg-accent', 'bg-accent/70', 'bg-amber', 'bg-ember/70', 'bg-ember'];
  const bins: TtftBinRow[] = [];
  let totalCount = 0;
  const binCounts: number[] = [];

  for (let i = 0; i < binResult.rowCount; i++) {
    const c = num(binResult, i, 'cnt');
    binCounts.push(c);
    totalCount += c;
  }

  const maxCount = Math.max(...binCounts, 1);
  for (let i = 0; i < binResult.rowCount; i++) {
    const order = num(binResult, i, 'bin_order');
    const c = binCounts[i];
    bins.push({
      label: str(binResult, i, 'label'),
      count: c,
      pct: totalCount > 0 ? (c / totalCount) * 100 : 0,
      barPct: (c / maxCount) * 100,
      color: colorMap[order] ?? 'bg-zinc-400',
    });
  }

  // Percentiles
  const pctSql = `
    SELECT
      percentile_cont(0.50) WITHIN GROUP (ORDER BY ttft_ms) AS p50,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY ttft_ms) AS p75,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY ttft_ms) AS p90,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY ttft_ms) AS p99
    FROM tps_paired
    WHERE 1=1 ${where}
  `;

  const pctResult = await runQuery(pctSql);
  const percentiles = [
    { label: 'P50', value: num(pctResult, 0, 'p50') },
    { label: 'P75', value: num(pctResult, 0, 'p75') },
    { label: 'P90', value: num(pctResult, 0, 'p90') },
    { label: 'P99', value: num(pctResult, 0, 'p99') },
  ];

  // Fast/slow counts require thresholds — caller must provide
  return { bins, fastCount: 0, slowCount: 0, percentiles };
}

/**
 * Threshold crossing analysis — replaces ThresholdAnalysis useMemo.
 */
export async function queryThresholdCrossings(
  thresholds: DataThresholdsRow,
  modelFilter?: string | null,
): Promise<ThresholdStat[]> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const maxTokensSql = `SELECT COALESCE(max(tokens_total), 80000) AS max_tokens FROM tps_paired WHERE 1=1 ${where}`;
  const maxResult = await runQuery(maxTokensSql);
  const maxTokens = num(maxResult, 0, 'max_tokens');

  const displayThresholds = [
    Math.round(thresholds.lowContext * 0.5 / 1000) * 1000,
    thresholds.lowContext,
    thresholds.cacheThreshold,
    Math.round((thresholds.cacheThreshold + (maxTokens - thresholds.cacheThreshold) * 0.5) / 1000) * 1000,
  ];

  const stats: ThresholdStat[] = [];

  for (const threshold of displayThresholds) {
    const sql = `
      SELECT
        count(*) FILTER (WHERE tokens_total >= ${threshold}) AS above_count,
        count(*) FILTER (WHERE tokens_total < ${threshold})  AS below_count,
        avg(ttft_ms) FILTER (WHERE tokens_total >= ${threshold}) AS above_avg_ttft,
        avg(ttft_ms) FILTER (WHERE tokens_total < ${threshold})  AS below_avg_ttft,
        avg(effective_tps) FILTER (WHERE tokens_total >= ${threshold}) AS above_avg_tps,
        avg(effective_tps) FILTER (WHERE tokens_total < ${threshold})  AS below_avg_tps,
        avg(tokens_cache_read::double / NULLIF(tokens_total, 0)) FILTER (WHERE tokens_total >= ${threshold}) AS above_avg_cache_ratio,
        avg(tokens_cache_read::double / NULLIF(tokens_total, 0)) FILTER (WHERE tokens_total < ${threshold})  AS below_avg_cache_ratio
      FROM tps_paired
      WHERE 1=1 ${where}
    `;

    const result = await runQuery(sql);
    const aboveTtft = num(result, 0, 'above_avg_ttft') || 0;
    const belowTtft = num(result, 0, 'below_avg_ttft') || 0;

    stats.push({
      threshold,
      above: {
        count: num(result, 0, 'above_count'),
        avgTtft: aboveTtft,
        avgTps: num(result, 0, 'above_avg_tps') || 0,
        avgCacheRatio: num(result, 0, 'above_avg_cache_ratio') || 0,
      },
      below: {
        count: num(result, 0, 'below_count'),
        avgTtft: belowTtft,
        avgTps: num(result, 0, 'below_avg_tps') || 0,
        avgCacheRatio: num(result, 0, 'below_avg_cache_ratio') || 0,
      },
      ttftDelta: aboveTtft - belowTtft,
    });
  }

  return stats;
}

/**
 * Adaptive data thresholds — replaces deriveDataThresholds().
 */
export async function queryDataThresholds(modelFilter?: string | null): Promise<DataThresholdsRow> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';

  const sql = `
    WITH stats AS (
      SELECT
        min(tokens_total)     AS min_tokens,
        max(tokens_total)     AS max_tokens,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY ttft_ms) AS p25_ttft,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY ttft_ms) AS p75_ttft,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY tokens_cache_read::double / NULLIF(tokens_total, 0)) AS median_cache_ratio,
        percentile_cont(0.90) WITHIN GROUP (ORDER BY tokens_input) AS p90_input,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY tokens_input) AS p95_input,
        avg(stall_count) FILTER (WHERE stall_count > 0) AS avg_stall_count,
        avg(stall_ms) FILTER (WHERE stall_ms > 0)        AS avg_stall_ms
      FROM tps_paired
      WHERE 1=1 ${where}
    )
    SELECT
      round(((min_tokens + (max_tokens - min_tokens) * 0.66)) / 1000) * 1000 AS cache_threshold,
      round(((min_tokens + (max_tokens - min_tokens) * 0.33)) / 1000) * 1000 AS low_context,
      p75_ttft            AS slow_ttft,
      p25_ttft            AS fast_ttft,
      greatest(0.1, 1 - median_cache_ratio + 0.1) AS high_new_input_ratio,
      greatest(5000, p90_input)   AS anomaly_input_threshold,
      round(min_tokens + (max_tokens - min_tokens) * 0.1) AS cache_drop_min_total,
      round(p90_input * 0.5)     AS cache_drop_min_input,
      greatest(0.3, greatest(0.1, 1 - median_cache_ratio + 0.1)) AS high_input_ratio,
      greatest(p90_input, p95_input) AS high_input_severity_token,
      greatest(2, round(avg_stall_count))   AS stall_count_threshold,
      round(avg_stall_ms)                   AS stall_ms_severity
    FROM stats
  `;

  const result = await runQuery(sql);
  if (result.rowCount === 0) {
    return {
      cacheThreshold: 65000, lowContext: 32000, slowTtft: 15000, fastTtft: 3000,
      highNewInputRatio: 0.15, anomalyInputThreshold: 10000, cacheDropMinTotal: 10000,
      cacheDropMinInput: 5000, highInputRatio: 0.5, highInputSeverityToken: 20000,
      stallCountThreshold: 3, stallMsSeverity: 5000,
    };
  }

  return {
    cacheThreshold: num(result, 0, 'cache_threshold'),
    lowContext: num(result, 0, 'low_context'),
    slowTtft: num(result, 0, 'slow_ttft'),
    fastTtft: num(result, 0, 'fast_ttft'),
    highNewInputRatio: num(result, 0, 'high_new_input_ratio'),
    anomalyInputThreshold: num(result, 0, 'anomaly_input_threshold'),
    cacheDropMinTotal: num(result, 0, 'cache_drop_min_total'),
    cacheDropMinInput: num(result, 0, 'cache_drop_min_input'),
    highInputRatio: num(result, 0, 'high_input_ratio'),
    highInputSeverityToken: num(result, 0, 'high_input_severity_token'),
    stallCountThreshold: num(result, 0, 'stall_count_threshold'),
    stallMsSeverity: num(result, 0, 'stall_ms_severity'),
  };
}

/**
 * Anomaly detection — replaces AnomalyDetector's useMemo.
 */
export async function queryAnomalies(
  thresholds: DataThresholdsRow,
  modelFilter?: string | null,
): Promise<AnomalyRow[]> {
  const where = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const {
    slowTtft, cacheThreshold, cacheDropMinTotal, cacheDropMinInput,
    highInputRatio, highInputSeverityToken, stallCountThreshold, stallMsSeverity,
    lowContext,
  } = thresholds;

  // We need running max cache_read for cache-drop detection — use a window function
  const sql = `
    WITH ordered AS (
      SELECT
        id, session_id, timestamp,
        tokens_total, tokens_input, tokens_cache_read,
        ttft_ms, stall_count, stall_ms,
        energy_cost_usd, cost_total,
        max(tokens_cache_read) OVER (ORDER BY timestamp ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_max_cache,
        row_number() OVER (ORDER BY timestamp) - 1 AS idx
      FROM tps_paired
      WHERE 1=1 ${where}
    ),
    detected AS (
      SELECT
        id, session_id, idx, tokens_total, energy_cost_usd, cost_total,
        'cache-drop' AS anomaly_type,
        'high' AS severity,
        'Cache dropped from ' || running_max_cache::varchar || ' to ' || tokens_cache_read::varchar || ' tokens — likely a sub-agent or context reset' AS description
      FROM ordered
      WHERE tokens_cache_read < running_max_cache * 0.5
        AND tokens_total > ${cacheDropMinTotal}
        AND tokens_input > ${cacheDropMinInput}

      UNION ALL

      SELECT
        id, session_id, idx, tokens_total, energy_cost_usd, cost_total,
        'slow-zone' AS anomaly_type,
        'medium' AS severity,
        'TTFT ' || round(ttft_ms / 1000)::varchar || 's at ' || tokens_total::varchar || ' tokens — requests in the ${lowContext}–${cacheThreshold} range are slower than expected' AS description
      FROM ordered
      WHERE tokens_total >= ${lowContext}
        AND tokens_total < ${cacheThreshold}
        AND ttft_ms > ${slowTtft}

      UNION ALL

      SELECT
        id, session_id, idx, tokens_total, energy_cost_usd, cost_total,
        'high-new-input' AS anomaly_type,
        CASE WHEN tokens_input > ${highInputSeverityToken} THEN 'high' ELSE 'low' END AS severity,
        round(tokens_input::double / NULLIF(tokens_total, 0) * 100)::varchar || '% new input (' || tokens_input::varchar || ' tokens) — minimal cache hit' AS description
      FROM ordered
      WHERE tokens_input::double / NULLIF(tokens_total, 0) > ${highInputRatio}
        AND tokens_input > ${cacheDropMinInput}

      UNION ALL

      SELECT
        id, session_id, idx, tokens_total, energy_cost_usd, cost_total,
        'stall-spike' AS anomaly_type,
        CASE WHEN stall_ms > ${stallMsSeverity} THEN 'high' ELSE 'medium' END AS severity,
        stall_count::varchar || ' stalls adding ' || round(stall_ms / 1000 * 10) / 10::varchar || 's of stall time' AS description
      FROM ordered
      WHERE stall_count >= ${stallCountThreshold}
    ),
    deduped AS (
      SELECT *
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY id, anomaly_type ORDER BY
            CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC) AS rn
        FROM detected
      ) sub
      WHERE rn = 1
    )
    SELECT *
    FROM deduped
    ORDER BY
      CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
      idx
  `;

  const result = await runQuery(sql);
  const rows: AnomalyRow[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    rows.push({
      eventId: str(result, i, 'id'),
      sessionId: str(result, i, 'session_id'),
      type: col(result, i, 'anomaly_type') as AnomalyRow['type'],
      index: num(result, i, 'idx'),
      description: str(result, i, 'description'),
      severity: col(result, i, 'severity') as AnomalyRow['severity'],
      tokensTotal: num(result, i, 'tokens_total'),
      energyCostUsd: maybeNum(result, i, 'energy_cost_usd'),
      tokenCostUsd: maybeNum(result, i, 'cost_total'),
    });
  }
  return rows;
}

/**
 * Full timeline — merged TPS + structural events for the Request Inspector.
 */
export async function queryTimeline(modelFilter?: string | null): Promise<TimelineEventRow[]> {
  const tpsWhere = modelFilter ? `AND model_id = '${modelFilter.replace(/'/g, "''")}'` : '';
  const sql = `
    SELECT
      id, session_id, timestamp, 'tps' AS type,
      provider, model_id,
      tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_total,
      ttft_ms, total_ms, generation_ms, stall_ms, stall_count,
      effective_tps, wall_tps, tps,
      cost_total, energy_joules, energy_cost_usd,
      CASE WHEN tokens_total > 0 THEN tokens_cache_read::double / tokens_total ELSE 0 END AS cache_ratio
    FROM tps_paired
    WHERE 1=1 ${tpsWhere}

    UNION ALL

    SELECT
      id, session_id, timestamp, type,
      provider, model_id,
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL,
      NULL
    FROM events
    WHERE type IN ('model_change', 'rewind', 'branch_summary')

    ORDER BY timestamp
  `;

  const result = await runQuery(sql);
  const rows: TimelineEventRow[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    const type = str(result, i, 'type') as TimelineEventRow['type'];
    rows.push({
      id: str(result, i, 'id'),
      sessionId: str(result, i, 'session_id'),
      timestamp: str(result, i, 'timestamp'),
      type,
      provider: type === 'tps' ? str(result, i, 'provider') || undefined : undefined,
      modelId: type === 'tps' ? str(result, i, 'model_id') || undefined : undefined,
      tokensInput: maybeNum(result, i, 'tokens_input') ?? undefined,
      tokensOutput: maybeNum(result, i, 'tokens_output') ?? undefined,
      tokensCacheRead: maybeNum(result, i, 'tokens_cache_read') ?? undefined,
      tokensCacheWrite: maybeNum(result, i, 'tokens_cache_write') ?? undefined,
      tokensTotal: maybeNum(result, i, 'tokens_total') ?? undefined,
      ttftMs: maybeNum(result, i, 'ttft_ms') ?? undefined,
      totalMs: maybeNum(result, i, 'total_ms') ?? undefined,
      generationMs: maybeNum(result, i, 'generation_ms') ?? undefined,
      stallMs: maybeNum(result, i, 'stall_ms') ?? undefined,
      stallCount: maybeNum(result, i, 'stall_count') ?? undefined,
      effectiveTps: maybeNum(result, i, 'effective_tps') ?? undefined,
      wallTps: maybeNum(result, i, 'wall_tps') ?? undefined,
      tps: maybeNum(result, i, 'tps') ?? undefined,
      costTotal: maybeNum(result, i, 'cost_total'),
      energyJoules: maybeNum(result, i, 'energy_joules'),
      energyCostUsd: maybeNum(result, i, 'energy_cost_usd'),
      cacheRatio: maybeNum(result, i, 'cache_ratio') ?? undefined,
    });
  }
  return rows;
}

/**
 * Model list for the header dropdown.
 */
export async function queryModelList(): Promise<{ modelId: string; callCount: number }[]> {
  const sql = `SELECT model_id, count(*) AS call_count FROM tps_paired GROUP BY model_id ORDER BY model_id`;
  const result = await runQuery(sql);
  const rows: { modelId: string; callCount: number }[] = [];
  for (let i = 0; i < result.rowCount; i++) {
    rows.push({
      modelId: str(result, i, 'model_id'),
      callCount: num(result, i, 'call_count'),
    });
  }
  return rows;
}

/**
 * Multi-session summary — replaces computeMultiSessionSummary().
 * Queries per-session from tps_paired grouped by session_id.
 */
export async function queryMultiSessionSummary(
  fileNames: Map<string, string | null>,
): Promise<{
  sessionCount: number;
  totalCalls: number;
  totalTokens: number;
  totalOutput: number;
  totalCostUsd: number | null;
  totalEnergyJoules: number | null;
  sessions: SessionSummaryRow[];
  models: ModelInfoRow[];
  avgTps: number;
  weightedTps: number;
  avgTtft: number;
  timeRangeStart: string;
  timeRangeEnd: string;
} | null> {
  const sql = `
    SELECT
      session_id,
      count(*)                                   AS total_calls,
      sum(tokens_total)                          AS total_tokens,
      sum(tokens_output)                         AS total_output,
      round(EXTRACT(EPOCH FROM (max(timestamp::timestamp) - min(timestamp::timestamp))) * 1000) AS wall_clock_ms,
      avg(effective_tps)                         AS avg_tps,
      CASE WHEN sum(effective_ms) > 0
        THEN sum(tokens_output) / (sum(effective_ms) / 1000.0)
        ELSE 0 END                               AS weighted_tps,
      avg(ttft_ms)                               AS avg_ttft,
      sum(CASE WHEN energy_cost_usd IS NOT NULL THEN energy_cost_usd
               WHEN cost_total IS NOT NULL THEN cost_total ELSE 0 END) AS total_cost,
      sum(energy_joules)                         AS total_energy_joules,
      (array_agg(model_id ORDER BY timestamp DESC))[1]  AS last_model,
      (array_agg(provider ORDER BY timestamp DESC))[1]    AS last_provider,
      count(*) FILTER (WHERE stall_count > 0 OR stall_ms > 0) AS stalled_calls,
      min(timestamp)                             AS time_range_start,
      max(timestamp)                             AS time_range_end
    FROM tps_paired
    GROUP BY session_id
    ORDER BY min(timestamp)
  `;

  const result = await runQuery(sql);
  if (result.rowCount === 0) return null;

  const sessions: SessionSummaryRow[] = [];
  let totalCalls = 0, totalTokens = 0, totalOutput = 0;
  let totalCostAccum = 0, totalEnergyAccum = 0;
  let hasCost = false, hasEnergy = false;
  let globalStart = '', globalEnd = '';

  for (let i = 0; i < result.rowCount; i++) {
    const sid = str(result, i, 'session_id');
    const cost = maybeNum(result, i, 'total_cost');
    const energy = maybeNum(result, i, 'total_energy_joules');

    sessions.push({
      sessionId: sid,
      fileName: fileNames.get(sid) ?? null,
      totalCalls: num(result, i, 'total_calls'),
      totalTokens: num(result, i, 'total_tokens'),
      totalOutput: num(result, i, 'total_output'),
      wallClockMs: num(result, i, 'wall_clock_ms'),
      avgTps: num(result, i, 'avg_tps'),
      weightedTps: num(result, i, 'weighted_tps'),
      avgTtft: num(result, i, 'avg_ttft'),
      totalCostUsd: cost,
      totalEnergyJoules: energy,
      model: str(result, i, 'last_model'),
      provider: str(result, i, 'last_provider'),
      stalledCalls: num(result, i, 'stalled_calls'),
      timeRangeStart: str(result, i, 'time_range_start'),
      timeRangeEnd: str(result, i, 'time_range_end'),
    });

    totalCalls += num(result, i, 'total_calls');
    totalTokens += num(result, i, 'total_tokens');
    totalOutput += num(result, i, 'total_output');
    if (cost !== null) { totalCostAccum += cost; hasCost = true; }
    if (energy !== null) { totalEnergyAccum += energy; hasEnergy = true; }

    const start = str(result, i, 'time_range_start');
    const end = str(result, i, 'time_range_end');
    if (start && (!globalStart || start < globalStart)) globalStart = start;
    if (end && (!globalEnd || end > globalEnd)) globalEnd = end;
  }

  // Global models across all sessions
  const models = await queryModels();

  // Cross-session weighted avg
  const totalWeightedTpsNum = sessions.reduce((s, ses) => s + ses.weightedTps * ses.totalOutput, 0);
  const totalWeightedTpsDen = sessions.reduce((s, ses) => s + ses.totalOutput, 0);
  const totalAvgTtftSum = sessions.reduce((s, ses) => s + ses.avgTtft * ses.totalCalls, 0);
  const totalAvgTpsSum = sessions.reduce((s, ses) => s + ses.avgTps * ses.totalCalls, 0);

  return {
    sessionCount: sessions.length,
    totalCalls,
    totalTokens,
    totalOutput,
    totalCostUsd: hasCost ? totalCostAccum : null,
    totalEnergyJoules: hasEnergy ? totalEnergyAccum : null,
    sessions,
    models,
    avgTps: totalCalls > 0 ? totalAvgTpsSum / totalCalls : 0,
    weightedTps: totalWeightedTpsDen > 0 ? totalWeightedTpsNum / totalWeightedTpsDen : 0,
    avgTtft: totalCalls > 0 ? totalAvgTtftSum / totalCalls : 0,
    timeRangeStart: globalStart,
    timeRangeEnd: globalEnd,
  };
}
