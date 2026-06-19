export interface TelemetryEvent {
  /** Session this event belongs to. Set during ingestion. */
  sessionId: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  type: 'tps' | 'energy' | 'rewind' | 'model_change' | 'branch_summary' | 'message';
}

export interface TpsPayload {
  model: {
    provider: string;
    modelId: string;
  };
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  timing: {
    ttftMs: number;
    totalMs: number;
    generationMs: number;
    /** Inter-update span: first streaming update → last streaming update. Null when no streaming updates after TTFT. */
    streamMs?: number | null;
    stallMs: number;
    stallCount: number;
    messageCount: number;
  };
  tps: number;
  /** Token cost from provider billing (via pi-ai Usage.cost). null if not available. */
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  } | null;
  /**
   * Blended $/M-tokens rate precomputed by pi-tps at turn end
   * (rateUsdPerMTokens = effectiveCost / (tokens.total / 1_000_000)).
   * The effective cost is the Neuralwatt billed cost when available,
   * otherwise the list-price compute cost — exactly the value the
   * pi-tps notification banner shows as `$X.XX/M`. null when the
   * turn predates this field (older sessions) or when no usable
   * cost/tokens were available; callers fall back to deriving it
   * from cost/energy + tokens.
   */
  rateUsdPerMTokens?: number | null;
  timestamp: number;
}

export interface EnergyPayload {
  energy_joules: number;
  cost_usd: number;
  // Raw SSE payloads — present in newer entries. Source of truth for MCR
  // and any future upstream fields that the provider captures verbatim.
  sse_energy_raw?: Record<string, unknown>;
  sse_mcr_session_raw?: Record<string, unknown>;
  sse_cost_raw?: Record<string, unknown>;
}

export interface TpsEvent extends TelemetryEvent {
  type: 'tps';
  data: TpsPayload;
}

export interface EnergyEvent extends TelemetryEvent {
  type: 'energy';
  data: EnergyPayload;
}

export interface RewindEvent extends TelemetryEvent {
  type: 'rewind';
  data: {
    v: number;
    snapshots: string[];
    bindings: [string, number][];
  };
}

export interface ModelChangeEvent extends TelemetryEvent {
  type: 'model_change';
  provider: string;
  modelId: string;
}

export interface BranchSummaryEvent extends TelemetryEvent {
  type: 'branch_summary';
  fromId: string;
  summary: string;
}

export interface MessagePayload {
  role: string;
  content: string;
  model: string | null;
}

export interface MessageEvent extends TelemetryEvent {
  type: 'message';
  data: MessagePayload;
}

export type ParsedEvent = TpsEvent | EnergyEvent | RewindEvent | ModelChangeEvent | BranchSummaryEvent | MessageEvent;

/** Discriminated union for the merged timeline (TPS events carry paired energy data) */
export type TimelineEvent =
  | (TpsEvent & { energy?: EnergyPayload })
  | RewindEvent
  | ModelChangeEvent
  | BranchSummaryEvent;

export interface ModelInfo {
  modelId: string;
  provider: string;
  callCount: number;
  /** Tokens generated/consumed by this model */
  totalTokens: number;
  /** Energy-only cost for this model (neuralwatt). null when no energy data. */
  energyCostUsd: number | null;
  /** Energy consumed by this model in joules. null when no energy data. */
  energyJoules: number | null;
  /** Blended cost for this model (energy preferred, token-pricing fallback). null when no cost data at all. */
  blendedCostUsd: number | null;
  /** Cost attribution source for this model */
  costSource: 'neuralwatt' | 'tps' | null;
}

export interface ConversationSummary {
  totalCalls: number;
  totalTokens: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  /** Wall-clock span from first TPS event to last */
  wallClockMs: number;
  totalTimeMs: number;
  totalGenerationMs: number;
  totalStallMs: number;
  totalStallCount: number;
  /** Simple arithmetic mean of per-request TPS values (active/generation rate) */
  avgTps: number;
  /** Output-token-weighted TPS: sum(tps_i × output_i) / sum(output_i) — longer outputs contribute proportionally more */
  weightedTps: number;
  /** Simple arithmetic mean of per-request wall-clock TPS (includes TTFT and stalls) */
  avgWallTps: number;
  /** Output-token-weighted wall-clock TPS: total output / total wall time */
  weightedWallTps: number;
  /** Average TPS loss: percentage of active throughput lost to stalls/TTFT/gaps */
  tpsLoss: number;
  /** Weighted TPS loss: percentage of weighted active throughput lost */
  weightedTpsLoss: number;
  avgTtft: number;
  /** TTFT percentiles */
  ttftP50: number;
  ttftP75: number;
  ttftP90: number;
  ttftP99: number;
  totalCostUsd: number | null;
  /** 'neuralwatt' = only energy costs, 'tps' = only token costs, 'both' = mixed (energy preferred where paired), null = no cost data */
  costSource: 'neuralwatt' | 'tps' | 'both' | null;
  /** Cost derived strictly from energy events (neuralwatt), excluding provider token-pricing fallbacks. Null when no energy data. */
  energyCostUsd: number | null;
  totalEnergyJoules: number | null;
  /** Average tokens consumed per LLM call */
  avgTokensPerCall: number;
  /** Number of calls that experienced at least one stall */
  stalledCalls: number;
  /** Number of calls that read from cache */
  cachedCalls: number;
  /** Number of calls with TTFT < 3s */
  fastCalls: number;
  minTtft: number;
  maxTtft: number;
  model: string;
  provider: string;
  models: ModelInfo[];
  timeRange: {
    start: string;
    end: string;
  };
  /** Number of rewind (branch) events in the session */
  rewindCount: number;
  /** Number of model change events in the session */
  modelChangeCount: number;
}

export interface SessionSummary {
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
  models: ModelInfo[];
  timeRange: {
    start: string;
    end: string;
  };
  stalledCalls: number;
}

export interface MultiSessionSummary {
  sessionCount: number;
  totalCalls: number;
  totalTokens: number;
  totalOutput: number;
  totalCostUsd: number | null;
  totalEnergyJoules: number | null;
  /** Per-session breakdowns, sorted by timeRange.start */
  sessions: SessionSummary[];
  /** Per-model aggregates across all sessions */
  models: ModelInfo[];
  /** Cross-session TPS stats */
  avgTps: number;
  weightedTps: number;
  avgTtft: number;
  /** Time span across all sessions */
  timeRange: {
    start: string;
    end: string;
  };
}

export interface DataThresholds {
  /** Token count at which cache efficiency meaningfully improves */
  cacheThreshold: number;
  /** Token count below which requests are considered "small context" */
  lowContext: number;
  /** TTFT above which a request is considered slow */
  slowTtft: number;
  /** TTFT below which a request is considered fast */
  fastTtft: number;
  /** New-input ratio above which a request is considered cache-miss-heavy */
  highNewInputRatio: number;
  /** Absolute token input above which a request is flagged as anomaly */
  anomalyInputThreshold: number;
  /** Minimum total tokens for cache-drop detection */
  cacheDropMinTotal: number;
  /** Minimum new-input tokens for cache-drop detection */
  cacheDropMinInput: number;
  /** New-input ratio for high-new-input anomaly */
  highInputRatio: number;
  /** New-input token count for severity escalation */
  highInputSeverityToken: number;
  /** Stall count threshold */
  stallCountThreshold: number;
  /** Stall ms threshold for high severity */
  stallMsSeverity: number;
}

export interface TimingBucket {
  range: string;
  label: string;
  count: number;
  avgTtft: number;
  avgTotal: number;
  avgTps: number;
  avgWallTps: number;
  avgTpsLoss: number;
  totalTokens: number;
  /** Volume-weighted blended $/M-tokens for the bucket: sum(effective cost) / (sum(tokens)/1e6). null when no cost data. */
  blendedRateUsdPerM: number | null;
  /** Per-bucket envelope (per-turn max/min within the bucket). Plotted as a faint band behind the blended avg so individual spike turns stay visible instead of being averaged away. null when the bucket has no usable per-turn rate. */
  peakRateUsdPerM: number | null;
  troughRateUsdPerM: number | null;
  peakTtft: number;
  troughTtft: number;
  peakTotal: number;
  troughTotal: number;
  peakTps: number;
  troughTps: number;
  /** Per-turn max/min instantaneous GPU power across the bucket's NeuralWatt turns (W). null when no energy data in the bucket. */
  peakPowerWatts: number | null;
  troughPowerWatts: number | null;
  /** Per-turn max/min joules-per-million-tokens within the bucket (energy_joules / tokens_total/1e6). null when no energy data in the bucket. */
  peakJoulesPerM: number | null;
  troughJoulesPerM: number | null;
  /** Sum of the effective cost across the bucket ($). Lets the chart derive a session-wide blended rate by summing across buckets. */
  effectiveCostTotal: number | null;
  /** Sum of raw energy joules across the bucket (NeuralWatt turns only). null when no energy data. */
  totalEnergyJoules: number | null;
  /** Sum of energy-backed cost ($) across the bucket: SUM(energy_cost_usd) for NeuralWatt turns. null when no energy data. */
  totalEnergyCost: number | null;
  /** Sum of list-price token cost ($) across the bucket: SUM(cost_total). null when no list-price cost. */
  totalListCost: number | null;
  /** Mean instantaneous GPU power across the bucket's NeuralWatt turns (W). Live spike signal — surges when the model does more work per unit time. null when no energy data. */
  avgPowerWatts: number | null;
  /** Whether the attribution cap kicked in for any energy turn in the bucket (turn touched the full node but was only billed for `attributionRatio` of it). null when no energy data. */
  ratioWasCapped: boolean | null;
  /** Typical share of the node's draw the bucket's turns were billed for. Usually flat per session; surfaced as context, not as a multiplier. null when no energy data. */
  attributionRatio: number | null;
  /** Dominant electricity grid id for the bucket's NeuralWatt turns (e.g. "US-MIDA-PJM"). null when no energy data with a grid id. */
  dominantGridId: string | null;
}

/** Session state for the main app — tracks loaded files and their parsed events */
export interface SessionState {
  raw: string;
  ingest: { events: ParsedEvent[]; assistantMessages: unknown[]; hasTpsEntries: boolean; hasLegacyTpsEntries: boolean; timestampById: Map<string, string>; synthCounter: number; sessionId: string };
  events: ParsedEvent[];
  fileName?: string;
}

/** Default thresholds used before DuckDB query resolves */
export const DEFAULT_THRESHOLDS: DataThresholds = {
  cacheThreshold: 65000, lowContext: 32000, slowTtft: 15000, fastTtft: 3000,
  highNewInputRatio: 0.15, anomalyInputThreshold: 10000, cacheDropMinTotal: 10000,
  cacheDropMinInput: 5000, highInputRatio: 0.5, highInputSeverityToken: 20000,
  stallCountThreshold: 3, stallMsSeverity: 5000,
};
