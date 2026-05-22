'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Warning, Lightning } from '@phosphor-icons/react';
import type { TpsEvent, EnergyPayload, DataThresholds } from '../types';
import { formatThreshold, formatDuration } from '../lib/parser';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
  thresholds: DataThresholds;
}

function AnomalyDetectorInner({ events, thresholds }: Props) {
  const { slowTtft, lowContext, cacheThreshold, cacheDropMinTotal, cacheDropMinInput, highInputRatio, highInputSeverityToken, stallCountThreshold, stallMsSeverity } = thresholds;

  const anomalies = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const results: {
      type: 'cache-drop' | 'slow-zone' | 'high-new-input' | 'stall-spike';
      event: typeof events[0];
      index: number;
      description: string;
      severity: 'high' | 'medium' | 'low';
    }[] = [];

    let maxCache = 0;

    sorted.forEach((e, i) => {
      if (e.data.tokens.cacheRead < maxCache * 0.5 && e.data.tokens.total > cacheDropMinTotal && e.data.tokens.input > cacheDropMinInput) {
        results.push({
          type: 'cache-drop',
          event: e,
          index: i,
          description: `Cache dropped from ${maxCache.toLocaleString()} to ${e.data.tokens.cacheRead.toLocaleString()} tokens — likely a sub-agent or context reset`,
          severity: 'high',
        });
      }

      const total = e.data.tokens.total;
      const ttft = e.data.timing.ttftMs;
      if (total >= lowContext && total < cacheThreshold && ttft > slowTtft) {
        results.push({
          type: 'slow-zone',
          event: e,
          index: i,
          description: `TTFT ${Math.round(ttft / 1000)}s at ${formatThreshold(total)} tokens — requests in the ${formatThreshold(lowContext)}–${formatThreshold(cacheThreshold)} range are slower than expected`,
          severity: 'medium',
        });
      }

      const newRatio = e.data.tokens.input / e.data.tokens.total;
      if (newRatio > highInputRatio && e.data.tokens.input > cacheDropMinInput) {
        results.push({
          type: 'high-new-input',
          event: e,
          index: i,
          description: `${(newRatio * 100).toFixed(0)}% new input (${e.data.tokens.input.toLocaleString()} tokens) — minimal cache hit`,
          severity: e.data.tokens.input > highInputSeverityToken ? 'high' : 'low',
        });
      }

      if (e.data.timing.stallCount >= stallCountThreshold) {
        results.push({
          type: 'stall-spike',
          event: e,
          index: i,
          description: `${e.data.timing.stallCount} stalls adding ${formatDuration(e.data.timing.stallMs)} of stall time`,
          severity: e.data.timing.stallMs > stallMsSeverity ? 'high' : 'medium',
        });
      }

      if (e.data.tokens.cacheRead > maxCache) {
        maxCache = e.data.tokens.cacheRead;
      }
    });

    const byId = new Map<string, typeof results[0]>();
    for (const r of results) {
      const existing = byId.get(r.event.id);
      if (!existing || severityRank(r.severity) > severityRank(existing.severity)) {
        byId.set(r.event.id, r);
      }
    }

    return [...byId.values()].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  }, [events, slowTtft, lowContext, cacheThreshold, cacheDropMinTotal, cacheDropMinInput, highInputRatio, highInputSeverityToken, stallCountThreshold, stallMsSeverity]);

  if (anomalies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="card-surface p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 bg-moss/10 rounded-lg">
            <Lightning size={16} className="text-moss" weight="bold" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Anomaly Detector</h2>
        </div>
        <p className="text-sm text-zinc-400 dark:text-zinc-400">No anomalies detected in this session.</p>
      </motion.div>
    );
  }

  const colorForSeverity = (s: string) => {
    switch (s) {
      case 'high': return 'bg-ember/8 border-ember/20 text-ember';
      case 'medium': return 'bg-amber/8 border-amber/20 text-amber';
      default: return 'bg-zinc-100 border-zinc-200 dark:bg-white/[0.06] dark:border-white/[0.08] text-zinc-500 dark:text-zinc-400';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber/10 rounded-lg">
            <Warning size={16} className="text-amber" weight="bold" />
          </div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Anomaly Detector</h2>
        </div>
        <span className="text-[11px] metric-mono font-semibold text-zinc-400 dark:text-zinc-400">{anomalies.length} found</span>
      </div>

      <div className="space-y-2.5 max-h-80 overflow-y-auto scrollbar-thin">
        <AnimatePresence>
          {anomalies.map((a, i) => (
            <motion.div
              key={`${a.event.id}-${a.type}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.06 }}
              className={`p-3 rounded-xl border ${colorForSeverity(a.severity)}`}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5">
                  {a.type === 'cache-drop' && <Lightning size={14} weight="bold" />}
                  {a.type === 'slow-zone' && <Warning size={14} weight="bold" />}
                  {a.type === 'high-new-input' && <Warning size={14} weight="bold" />}
                  {a.type === 'stall-spike' && <Warning size={14} weight="bold" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{a.description}</p>
                  <p className="text-[10px] metric-mono text-zinc-400 dark:text-zinc-400 mt-1">
                    #{a.index + 1} · total={a.event.data.tokens.total.toLocaleString()}
                    {a.event.energy && ` · ${(a.event.energy.cost_usd * 100).toFixed(2)}c`}
                    {!a.event.energy && a.event.data.cost && ` · ~${(a.event.data.cost.total * 100).toFixed(2)}c`}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function severityRank(s: string): number {
  switch (s) {
    case 'high': return 3;
    case 'medium': return 2;
    case 'low': return 1;
    default: return 0;
  }
}

export default React.memo(AnomalyDetectorInner);
