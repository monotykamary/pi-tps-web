export interface TelemetryEvent {
  id: string;
  parentId: string | null;
  timestamp: string;
  type: 'tps' | 'energy' | 'rewind' | 'model_change' | 'branch_summary';
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
  timestamp: number;
}

export interface EnergyPayload {
  energy_joules: number;
  cost_usd: number;
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

export type ParsedEvent = TpsEvent | EnergyEvent | RewindEvent | ModelChangeEvent | BranchSummaryEvent;

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
}
