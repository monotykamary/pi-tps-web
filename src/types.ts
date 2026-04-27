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

export interface TimingBucket {
  range: string;
  label: string;
  count: number;
  avgTtft: number;
  avgTotal: number;
  avgTps: number;
  totalTokens: number;
}
