import type { MultiSessionSummary } from '../types';

/** Minimal CSV escaping — quote if contains comma, quote, or newline */
function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export a MultiSessionSummary as a CSV string.
 * One row per session, with aggregate summary as a final row.
 */
export function exportMultiSessionCsv(summary: MultiSessionSummary): string {
  const header = [
    'Session',
    'Requests',
    'Tokens',
    'Output',
    'Avg TPS',
    'Weighted TPS',
    'Avg TTFT (ms)',
    'Cost (USD)',
    'Energy (J)',
    'Model',
    'Provider',
    'Start',
    'End',
  ].join(',');

  const rows = summary.sessions.map(s => [
    csvEscape(s.fileName ?? s.sessionId),
    s.totalCalls,
    s.totalTokens,
    s.totalOutput,
    s.avgTps.toFixed(1),
    s.weightedTps.toFixed(1),
    Math.round(s.avgTtft),
    s.totalCostUsd !== null ? s.totalCostUsd.toFixed(4) : '',
    s.totalEnergyJoules !== null ? s.totalEnergyJoules.toFixed(0) : '',
    csvEscape(s.model),
    csvEscape(s.provider),
    csvEscape(s.timeRange.start),
    csvEscape(s.timeRange.end),
  ].join(','));

  const totalRow = [
    csvEscape(`TOTAL (${summary.sessionCount})`),
    summary.totalCalls,
    summary.totalTokens,
    summary.totalOutput,
    summary.avgTps.toFixed(1),
    summary.weightedTps.toFixed(1),
    Math.round(summary.avgTtft),
    summary.totalCostUsd !== null ? summary.totalCostUsd.toFixed(4) : '',
    summary.totalEnergyJoules !== null ? summary.totalEnergyJoules.toFixed(0) : '',
    '',
    '',
    csvEscape(summary.timeRange.start),
    csvEscape(summary.timeRange.end),
  ].join(',');

  return [header, ...rows, totalRow].join('\n');
}
