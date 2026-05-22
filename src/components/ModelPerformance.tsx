'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from '@phosphor-icons/react';
import type { ModelInfo } from '../types';
import { formatTps, formatCurrency, formatEnergy, formatNumber } from '../lib/parser';

interface Props {
  models: ModelInfo[];
  avgTps: number;
  weightedTps: number;
  totalCalls: number;
}

// Compute per-model stats from the model info
interface ModelRow {
  modelId: string;
  provider: string;
  callCount: number;
  totalTokens: number;
  tpsPerToken: number | null;
  blendedCostPer1kTokens: number | null;
  energyPerCall: number | null;
  blendedCostTotal: number | null;
  costSource: 'neuralwatt' | 'tps' | null;
  rank: 'fastest' | 'cheapest' | null;
}

function ModelPerformanceInner({ models, avgTps, weightedTps, totalCalls }: Props) {
  const rows = useMemo(() => {
    if (models.length === 0) return [];

    const modelRows: ModelRow[] = models.map(m => {
      const tpsPerToken = m.callCount > 0 ? null : null; // We don't have per-model TPS from ModelInfo alone
      const blendedCostPer1kTokens = m.blendedCostUsd !== null && m.totalTokens > 0
        ? (m.blendedCostUsd / (m.totalTokens / 1000))
        : null;
      const energyPerCall = m.energyJoules !== null && m.callCount > 0
        ? m.energyJoules / m.callCount
        : null;

      return {
        modelId: m.modelId,
        provider: m.provider,
        callCount: m.callCount,
        totalTokens: m.totalTokens,
        tpsPerToken,
        blendedCostPer1kTokens,
        energyPerCall,
        blendedCostTotal: m.blendedCostUsd,
        costSource: m.costSource,
        rank: null,
      };
    });

    // Rank: most calls = most used; lowest cost/1k tokens = cheapest
    // We highlight the most-used and cheapest models
    if (modelRows.length > 1) {
      const withCost = modelRows.filter(r => r.blendedCostPer1kTokens !== null);
      if (withCost.length > 0) {
        const cheapest = withCost.reduce((a, b) =>
          (a.blendedCostPer1kTokens ?? Infinity) < (b.blendedCostPer1kTokens ?? Infinity) ? a : b
        );
        cheapest.rank = 'cheapest';
      }
      const mostCalls = modelRows.reduce((a, b) => a.callCount > b.callCount ? a : b);
      if (mostCalls.rank === null) {
        mostCalls.rank = 'fastest'; // most-used as proxy for preferred
      }
    }

    return modelRows;
  }, [models]);

  if (rows.length === 0) return null;
  if (rows.length === 1) return null; // single model — no comparison needed

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="card-surface p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={16} className="text-accent" weight="bold" />
        <h2 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Model Performance</h2>
        <span className="ml-auto text-[10px] metric-mono text-zinc-400 dark:text-zinc-500">{rows.length} models · {formatNumber(totalCalls, 0)} calls</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/40 dark:border-white/[0.06]">
              <th className="text-left px-3 py-2 font-medium">Model</th>
              <th className="text-right px-3 py-2 font-medium">Provider</th>
              <th className="text-right px-3 py-2 font-medium">Calls</th>
              <th className="text-right px-3 py-2 font-medium">Tokens</th>
              <th className="text-right px-3 py-2 font-medium">Cost/1k tok</th>
              <th className="text-right px-3 py-2 font-medium">Total Cost</th>
              <th className="text-right px-3 py-2 font-medium">Energy/call</th>
              <th className="text-right px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.modelId}
                className={`border-b border-zinc-200/20 dark:border-white/[0.03] ${
                  i % 2 === 0 ? 'bg-zinc-50/30 dark:bg-white/[0.01]' : ''
                } ${r.rank ? 'bg-accent/[0.03] dark:bg-accent/[0.05]' : ''}`}
              >
                <td className="px-3 py-2.5 font-medium text-zinc-700 dark:text-zinc-300">
                  <div className="flex items-center gap-1.5">
                    {r.rank && (
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        r.rank === 'fastest'
                          ? 'bg-moss/10 text-moss'
                          : 'bg-accent/10 text-accent'
                      }`}>
                        {r.rank === 'fastest' ? 'Most used' : 'Cheapest'}
                      </span>
                    )}
                    <span className="truncate max-w-[12rem]">{r.modelId.split('/').pop()}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-500 dark:text-zinc-400">{r.provider}</td>
                <td className="px-3 py-2.5 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatNumber(r.callCount, 0)}</td>
                <td className="px-3 py-2.5 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatNumber(r.totalTokens)}</td>
                <td className="px-3 py-2.5 text-right metric-mono text-zinc-600 dark:text-zinc-300">
                  {r.blendedCostPer1kTokens !== null ? `$${r.blendedCostPer1kTokens.toFixed(4)}` : '-'}
                </td>
                <td className="px-3 py-2.5 text-right metric-mono text-zinc-600 dark:text-zinc-300">
                  {r.blendedCostTotal !== null ? formatCurrency(r.blendedCostTotal) : '-'}
                </td>
                <td className="px-3 py-2.5 text-right metric-mono text-zinc-600 dark:text-zinc-300">
                  {r.energyPerCall !== null ? formatEnergy(r.energyPerCall) : '-'}
                </td>
                <td className="px-3 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
                  {r.costSource === 'neuralwatt' ? (
                    <span className="text-accent">energy</span>
                  ) : r.costSource === 'tps' ? (
                    <span className="text-amber">token</span>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Aggregate context */}
      <div className="mt-3 pt-3 border-t border-zinc-200/40 dark:border-white/[0.06] flex items-center gap-4 text-[10px] text-zinc-400 dark:text-zinc-500">
        <span>Avg TPS: <span className="metric-mono font-medium text-zinc-600 dark:text-zinc-300">{formatTps(avgTps)}</span></span>
        <span>Wtd TPS: <span className="metric-mono font-medium text-accent">{formatTps(weightedTps)}</span></span>
      </div>
    </motion.div>
  );
}

export default React.memo(ModelPerformanceInner);
