'use client';

import { useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Hash } from '@phosphor-icons/react';
import type { TpsEvent, EnergyPayload, DataThresholds } from '../types';

interface Props {
  events: (TpsEvent & { energy?: EnergyPayload })[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  thresholds: DataThresholds;
}

export default function RequestInspector({ events, selectedId, onSelect, thresholds }: Props) {
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [events]);

  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId && selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId]);

  const selectedEvent = selectedId ? sorted.find(e => e.id === selectedId) : null;

  const getCategory = (e: typeof sorted[0]) => {
    const total = e.data.tokens.total;
    const ttft = e.data.timing.ttftMs;
    const newRatio = e.data.tokens.input / total;
    if (e.data.tokens.input > thresholds.anomalyInputThreshold) return { label: 'anomaly', color: 'text-amber bg-amber/5 border-amber/20' };
    if (ttft > thresholds.slowTtft && total < thresholds.cacheThreshold) return { label: 'slow', color: 'text-ember bg-ember/5 border-ember/20' };
    if (total > thresholds.cacheThreshold && ttft < thresholds.fastTtft && newRatio < thresholds.highNewInputRatio) return { label: 'fast', color: 'text-moss bg-moss/5 border-moss/20' };
    return { label: 'normal', color: 'text-slate-400 bg-slate-50/50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-600' };
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-0 overflow-hidden flex flex-col"
      style={{ maxHeight: '700px' }}
    >
      <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-100 dark:border-slate-700/50">
        <h2 className="text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100">Request Inspector</h2>
        <span className="text-[11px] metric-mono font-semibold text-slate-400 dark:text-slate-500">{sorted.length} calls</span>
      </div>

      <div className="flex-1 flex overflow-hidden" style={{ minHeight: '400px' }}>
        <div ref={listRef} className="w-full overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {selectedEvent ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-5 space-y-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Request Detail</p>
                    <p className="metric-mono text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">#{sorted.findIndex(e => e.id === selectedId) + 1} of {sorted.length}</p>
                  </div>
                  <button
                    onClick={() => onSelect(null)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors active:scale-[0.95]"
                  >
                    <X size={16} className="text-slate-500 dark:text-slate-400" />
                  </button>
                </div>

                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${getCategory(selectedEvent).color}`}>
                  {getCategory(selectedEvent).label}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricBox icon={Clock} label="Timestamp" value={selectedEvent.timestamp.substring(11, 19)} />
                  <MetricBox icon={Hash} label="ID" value={selectedEvent.id.substring(0, 8)} />
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Token Breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenPill label="Total" value={selectedEvent.data.tokens.total} color="bg-slate-800 dark:bg-slate-300" />
                    <TokenPill label="New Input" value={selectedEvent.data.tokens.input} color="bg-slate-600 dark:bg-slate-400" />
                    <TokenPill label="Cache Read" value={selectedEvent.data.tokens.cacheRead} color="bg-accent" />
                    <TokenPill label="Output" value={selectedEvent.data.tokens.output} color="bg-moss" />
                  </div>

                  <div className="h-2 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden flex">
                    {selectedEvent.data.tokens.total > 0 && (
                      <>
                        <div className="h-full bg-accent" style={{ width: `${(selectedEvent.data.tokens.cacheRead / selectedEvent.data.tokens.total) * 100}%` }} />
                        <div className="h-full bg-slate-600 dark:bg-slate-400" style={{ width: `${(selectedEvent.data.tokens.input / selectedEvent.data.tokens.total) * 100}%` }} />
                        <div className="h-full bg-moss" style={{ width: `${(selectedEvent.data.tokens.output / selectedEvent.data.tokens.total) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-slate-400 dark:text-slate-500">Cache: {((selectedEvent.data.tokens.cacheRead / selectedEvent.data.tokens.total) * 100).toFixed(0)}%</span>
                    <span className="text-slate-400 dark:text-slate-500">New: {((selectedEvent.data.tokens.input / selectedEvent.data.tokens.total) * 100).toFixed(0)}%</span>
                    <span className="text-slate-400 dark:text-slate-500">Out: {((selectedEvent.data.tokens.output / selectedEvent.data.tokens.total) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Timing</p>
                  <div className="grid grid-cols-2 gap-2">
                    <TimingPill label="TTFT" value={`${selectedEvent.data.timing.ttftMs.toLocaleString()}ms`} highlight />
                    <TimingPill label="Total" value={`${selectedEvent.data.timing.totalMs.toLocaleString()}ms`} />
                    <TimingPill label="Generation" value={`${selectedEvent.data.timing.generationMs.toLocaleString()}ms`} />
                    <TimingPill label="Stall" value={`${selectedEvent.data.timing.stallMs.toLocaleString()}ms`} warn={selectedEvent.data.timing.stallMs > 0} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedEvent.data.tps > 40 ? 'bg-moss' : selectedEvent.data.tps > 20 ? 'bg-accent' : 'bg-ember'}`} />
                    <span className="metric-mono text-sm font-bold text-slate-800 dark:text-slate-100">{selectedEvent.data.tps.toFixed(1)}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">tokens/second</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Energy & Cost</p>
                  <div className="grid grid-cols-2 gap-2">
                    <TimingPill label="Energy" value={selectedEvent.energy ? `${selectedEvent.energy.energy_joules.toFixed(1)}J` : '-'} />
                    <TimingPill label="Cost" value={selectedEvent.energy ? `$${(selectedEvent.energy.cost_usd * 1000).toFixed(2)}m` : '-'} />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="divide-y divide-slate-100 dark:divide-slate-700/50"
              >
                {sorted.map((e, i) => {
                  const cat = getCategory(e);
                  return (
                    <motion.div
                      key={e.id}
                      ref={selectedId === e.id ? selectedRef : null}
                      onClick={() => onSelect(e.id)}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 cursor-pointer transition-colors active:bg-slate-100 dark:active:bg-slate-700/50"
                      whileTap={{ scale: 0.995 }}
                    >
                      <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700/60 metric-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="metric-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{e.data.tokens.total.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">tokens</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-medium ${e.data.timing.ttftMs > thresholds.slowTtft ? 'text-ember' : e.data.timing.ttftMs < thresholds.fastTtft ? 'text-moss' : 'text-slate-400 dark:text-slate-500'}`}>
                            ttft {e.data.timing.ttftMs.toLocaleString()}ms
                          </span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                            {((e.data.tokens.cacheRead / e.data.tokens.total) * 100).toFixed(0)}% cache
                          </span>
                        </div>
                      </div>
                      <div className={`w-1.5 h-1.5 rounded-full ${cat.color.split(' ')[0].replace('text-', 'bg-')}`} />
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function MetricBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-slate-50/80 dark:bg-slate-700/30 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-slate-400 dark:text-slate-500" weight="bold" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</span>
      </div>
      <p className="metric-mono text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function TokenPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-slate-50/80 dark:bg-slate-700/30 rounded-xl">
      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
        <span className="metric-mono text-xs font-bold text-slate-700 dark:text-slate-200">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function TimingPill({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${
      highlight ? 'bg-accent/5' : warn ? 'bg-ember/5' : 'bg-slate-50/80 dark:bg-slate-700/30'
    }`}>
      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`metric-mono text-xs font-bold ${
        highlight ? 'text-accent' : warn ? 'text-ember' : 'text-slate-700 dark:text-slate-200'
      }`}>{value}</span>
    </div>
  );
}
