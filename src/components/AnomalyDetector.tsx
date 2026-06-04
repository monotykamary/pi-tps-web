import React from 'react';
import { motion } from 'framer-motion';
import { Warning, Lightning } from '@phosphor-icons/react';
import type { AnomalyRow } from '../lib/queries';

interface Props {
  anomalies: AnomalyRow[];
}

function AnomalyDetectorInner({ anomalies }: Props) {
  if (anomalies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
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
        {anomalies.map((a) => (
          <div
            key={`${a.eventId}-${a.type}`}
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
                  #{a.index + 1} · total={a.tokensTotal.toLocaleString()}
                  {a.energyCostUsd !== null && ` · ${(a.energyCostUsd * 100).toFixed(2)}c`}
                  {a.energyCostUsd === null && a.tokenCostUsd !== null && ` · ~${(a.tokenCostUsd * 100).toFixed(2)}c`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default React.memo(AnomalyDetectorInner);
