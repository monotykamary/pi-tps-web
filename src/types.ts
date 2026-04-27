export interface TelemetryEvent {
  id: string;
  parentId: string;
  timestamp: string;
  type: 'tps' | 'energy' | 'rewind';
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
    stallMs: number;
    stallCount: number;
    messageCount: number;
  };
  tps: number;
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

export type ParsedEvent = TpsEvent | EnergyEvent | RewindEvent;

export interface ConversationSummary {
  totalCalls: number;
  totalTokens: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  totalTimeMs: number;
  totalGenerationMs: number;
  totalStallMs: number;
  totalStallCount: number;
  avgTps: number;
  avgTtft: number;
  totalCostUsd: number | null;
  totalEnergyJoules: number | null;
  minTtft: number;
  maxTtft: number;
  model: string;
  provider: string;
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
  totalTokens: number;
}
