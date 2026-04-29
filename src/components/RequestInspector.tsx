'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Hash, ArrowBendUpLeft, ArrowsLeftRight, TreeStructure, Binoculars } from '@phosphor-icons/react';
import type { TpsEvent, EnergyPayload, DataThresholds, TimelineEvent, ModelChangeEvent, RewindEvent, BranchSummaryEvent } from '../types';

interface Props {
  timeline: TimelineEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  thresholds: DataThresholds;
}

function isTpsEvent(e: TimelineEvent): e is TpsEvent & { energy?: EnergyPayload } {
  return e.type === 'tps';
}

export default function RequestInspector({ timeline, selectedId, onSelect, thresholds }: Props) {
  const tpsEvents = useMemo(() => timeline.filter(isTpsEvent), [timeline]);

  const cacheHitRates = useMemo(() => {
    return tpsEvents.map(e => {
      const total = e.data.tokens.total || 1;
      return (e.data.tokens.cacheRead / total) * 100;
    });
  }, [tpsEvents]);

  const avgCacheHitRate = useMemo(() => {
    if (cacheHitRates.length === 0) return 0;
    return cacheHitRates.reduce((a, b) => a + b, 0) / cacheHitRates.length;
  }, [cacheHitRates]);

  const sorted = useMemo(() => {
    return [...timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [timeline]);

  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedId && selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedId]);

  const selectedEvent = selectedId ? sorted.find(e => e.id === selectedId) : null;

  const getCategory = (e: TpsEvent & { energy?: EnergyPayload }) => {
    const total = e.data.tokens.total;
    const ttft = e.data.timing.ttftMs;
    const newRatio = e.data.tokens.input / total;
    if (e.data.tokens.input > thresholds.anomalyInputThreshold) return { label: 'anomaly', color: 'text-amber bg-amber/5 border-amber/20' };
    if (ttft > thresholds.slowTtft && total < thresholds.cacheThreshold) return { label: 'slow', color: 'text-ember bg-ember/5 border-ember/20' };
    if (total > thresholds.cacheThreshold && ttft < thresholds.fastTtft && newRatio < thresholds.highNewInputRatio) return { label: 'fast', color: 'text-moss bg-moss/5 border-moss/20' };
    return { label: 'normal', color: 'text-zinc-400 bg-zinc-50/50 dark:bg-white/[0.04] border-zinc-100 dark:border-white/[0.08]' };
  };

  /** Short model name: last segment of a slash-separated ID */
  const shortModel = (modelId: string) => modelId.split('/').pop() ?? modelId;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4, type: 'spring', stiffness: 100, damping: 20 }}
      className="card-surface p-0 overflow-hidden flex flex-col"
      style={{ maxHeight: '750px' }}
    >
      <div className="flex items-center justify-between p-5 pb-4 border-b border-zinc-100 dark:border-white/[0.06]">
        <h2 className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-300">Request Inspector</h2>
        <span className="text-[11px] metric-mono font-semibold text-zinc-400 dark:text-zinc-400">{tpsEvents.length} calls</span>
      </div>

      {/* Cache hit rate sparkline */}
      <div className="px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Binoculars size={12} className="text-accent" weight="bold" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Cache Hit Rate</span>
          </div>
          <span className="metric-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{avgCacheHitRate.toFixed(0)}% avg</span>
        </div>
        <div className="flex items-end gap-px h-8" title={`Cache hit rate per request · avg ${avgCacheHitRate.toFixed(0)}%`}>
          {cacheHitRates.map((rate, i) => {
            const h = Math.max(4, (rate / 100) * 100);
            const color = rate >= 80 ? 'bg-moss' : rate >= 50 ? 'bg-accent' : rate >= 20 ? 'bg-amber' : 'bg-ember';
            return (
              <div
                key={i}
                className={`flex-1 min-w-[3px] rounded-sm ${color} transition-all`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1.5 text-[9px] metric-mono text-zinc-400 dark:text-zinc-400">
          <span>#{1}</span>
          <span>#{cacheHitRates.length}</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden" style={{ minHeight: '400px' }}>
        <div ref={listRef} className="w-full overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {selectedEvent && isTpsEvent(selectedEvent) ? (
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
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Request Detail</p>
                    <p className="metric-mono text-lg font-bold text-zinc-800 dark:text-zinc-300 mt-0.5">#{tpsEvents.findIndex(e => e.id === selectedId) + 1} of {tpsEvents.length}</p>
                  </div>
                  <button
                    onClick={() => onSelect(null)}
                    className="p-2 rounded-xl bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-colors active:scale-[0.95]"
                  >
                    <X size={16} className="text-zinc-500 dark:text-zinc-400" />
                  </button>
                </div>

                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${getCategory(selectedEvent).color}`}>
                  {getCategory(selectedEvent).label}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricBox icon={Clock} label="Timestamp" value={selectedEvent.timestamp.substring(11, 19)} />
                  <MetricBox icon={Hash} label="ID" value={selectedEvent.id.substring(0, 8)} />
                </div>

                {/* Model */}
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Model</p>
                  <div className="grid grid-cols-2 gap-2">
                    <ModelPill label="Provider" value={selectedEvent.data.model.provider} />
                    <ModelPill label="Model" value={shortModel(selectedEvent.data.model.modelId)} fullValue={selectedEvent.data.model.modelId} />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Token Breakdown</p>
                  <div className="grid grid-cols-2 gap-2">
                    <TokenPill label="Total" value={selectedEvent.data.tokens.total} color="bg-zinc-800 dark:bg-zinc-300" />
                    <TokenPill label="New Input" value={selectedEvent.data.tokens.input} color="bg-zinc-600 dark:bg-zinc-400" />
                    <TokenPill label="Cache Read" value={selectedEvent.data.tokens.cacheRead} color="bg-accent" />
                    <TokenPill label="Output" value={selectedEvent.data.tokens.output} color="bg-moss" />
                  </div>

                  <div className="h-2 bg-zinc-100 dark:bg-white/[0.06] rounded-full overflow-hidden flex">
                    {selectedEvent.data.tokens.total > 0 && (
                      <>
                        <div className="h-full bg-accent" style={{ width: `${(selectedEvent.data.tokens.cacheRead / selectedEvent.data.tokens.total) * 100}%` }} />
                        <div className="h-full bg-zinc-600 dark:bg-zinc-400" style={{ width: `${(selectedEvent.data.tokens.input / selectedEvent.data.tokens.total) * 100}%` }} />
                        <div className="h-full bg-moss" style={{ width: `${(selectedEvent.data.tokens.output / selectedEvent.data.tokens.total) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-zinc-400 dark:text-zinc-400">Cache: {((selectedEvent.data.tokens.cacheRead / selectedEvent.data.tokens.total) * 100).toFixed(0)}%</span>
                    <span className="text-zinc-400 dark:text-zinc-400">New: {((selectedEvent.data.tokens.input / selectedEvent.data.tokens.total) * 100).toFixed(0)}%</span>
                    <span className="text-zinc-400 dark:text-zinc-400">Out: {((selectedEvent.data.tokens.output / selectedEvent.data.tokens.total) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Timing</p>
                  <div className="grid grid-cols-2 gap-2">
                    <TimingPill label="TTFT" value={`${selectedEvent.data.timing.ttftMs.toLocaleString()}ms`} highlight />
                    <TimingPill label="Total" value={`${selectedEvent.data.timing.totalMs.toLocaleString()}ms`} />
                    <TimingPill label="Generation" value={`${selectedEvent.data.timing.generationMs.toLocaleString()}ms`} />
                    <TimingPill label="Stall" value={`${selectedEvent.data.timing.stallMs.toLocaleString()}ms`} warn={selectedEvent.data.timing.stallMs > 0} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${selectedEvent.data.tps > 40 ? 'bg-moss' : selectedEvent.data.tps > 20 ? 'bg-accent' : 'bg-ember'}`} />
                    <span className="metric-mono text-sm font-bold text-zinc-800 dark:text-zinc-300">{selectedEvent.data.tps.toFixed(1)}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-400">tokens/second</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-400">Energy & Cost</p>
                  <div className="grid grid-cols-2 gap-2">
                    <TimingPill label="Energy" value={selectedEvent.energy ? `${selectedEvent.energy.energy_joules.toFixed(1)}J` : '-'} />
                    <TimingPill label={selectedEvent.data.cost ? 'Cost (est.)' : 'Cost'} value={selectedEvent.energy ? `$${selectedEvent.energy.cost_usd.toFixed(4)}` : selectedEvent.data.cost ? `$${selectedEvent.data.cost.total.toFixed(4)}` : '-'} />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="divide-y divide-zinc-100 dark:divide-white/[0.06]"
              >
                {sorted.map((e) => {
                  if (isTpsEvent(e)) {
                    const tpsIdx = tpsEvents.findIndex(t => t.id === e.id);
                    return <TpsRow key={e.id} event={e} tpsIndex={tpsIdx} thresholds={thresholds} selectedRef={selectedId === e.id ? selectedRef : undefined} onSelect={onSelect} shortModel={shortModel} />;
                  }
                  return <StructuralRow key={e.id} event={e} />;
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── TPS request row ────────────────────────────────────────────────────────

const TpsRow = React.forwardRef<HTMLDivElement, {
  event: TpsEvent & { energy?: EnergyPayload };
  tpsIndex: number;
  thresholds: DataThresholds;
  selectedRef?: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  shortModel: (modelId: string) => string;
}>(function TpsRow({ event, tpsIndex, thresholds, selectedRef, onSelect, shortModel }, ref) {
  const cat = useMemo(() => {
    const total = event.data.tokens.total;
    const ttft = event.data.timing.ttftMs;
    const newRatio = event.data.tokens.input / total;
    if (event.data.tokens.input > thresholds.anomalyInputThreshold) return { label: 'anomaly', color: 'text-amber bg-amber/5 border-amber/20' };
    if (ttft > thresholds.slowTtft && total < thresholds.cacheThreshold) return { label: 'slow', color: 'text-ember bg-ember/5 border-ember/20' };
    if (total > thresholds.cacheThreshold && ttft < thresholds.fastTtft && newRatio < thresholds.highNewInputRatio) return { label: 'fast', color: 'text-moss bg-moss/5 border-moss/20' };
    return { label: 'normal', color: 'text-zinc-400 bg-zinc-50/50 dark:bg-white/[0.04] border-zinc-100 dark:border-white/[0.08]' };
  }, [event, thresholds]);

  return (
    <motion.div
      ref={selectedRef ? ref : undefined}
      onClick={() => onSelect(event.id)}
      className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50/80 dark:hover:bg-white/[0.04] cursor-pointer transition-colors active:bg-zinc-100 dark:active:bg-white/[0.08]"
      whileTap={{ scale: 0.995 }}
    >
      <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-100 dark:bg-white/[0.06] metric-mono text-[10px] font-bold text-zinc-500 dark:text-zinc-400 shrink-0">
        {tpsIndex + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="metric-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">{event.data.tokens.total.toLocaleString()}</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-400">tokens</span>
          <span className="text-[10px] text-zinc-300 dark:text-zinc-700">·</span>
          <span className="text-[10px] font-medium text-accent" title={`${event.data.model.provider}/${event.data.model.modelId}`}>
            {shortModel(event.data.model.modelId)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-medium ${event.data.timing.ttftMs > thresholds.slowTtft ? 'text-ember' : event.data.timing.ttftMs < thresholds.fastTtft ? 'text-moss' : 'text-zinc-400 dark:text-zinc-400'}`}>
            ttft {event.data.timing.ttftMs.toLocaleString()}ms
          </span>
          <span className="text-[10px] text-zinc-300 dark:text-zinc-700">·</span>
          <span className={`text-[10px] font-medium ${event.data.tps > 40 ? 'text-moss' : event.data.tps > 20 ? 'text-accent' : 'text-ember'}`}>
            {event.data.tps.toFixed(1)} tps
          </span>
          <span className="text-[10px] text-zinc-300 dark:text-zinc-700">·</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-400">
            {((event.data.tokens.cacheRead / event.data.tokens.total) * 100).toFixed(0)}% cache
          </span>
        </div>
      </div>
      <div className={`w-1.5 h-1.5 rounded-full ${cat.color.split(' ')[0].replace('text-', 'bg-')}`} />
    </motion.div>
  );
});

// ─── Structural event marker rows ───────────────────────────────────────────

function StructuralRow({ event }: { event: ModelChangeEvent | RewindEvent | BranchSummaryEvent }) {
  if (event.type === 'model_change') {
    return (
      <div className="flex items-center gap-2.5 px-5 py-2 bg-accent/[0.03] dark:bg-accent/[0.06]">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <ArrowsLeftRight size={14} className="text-accent" weight="bold" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">model →</span>
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate" title={`${event.provider}/${event.modelId}`}>
            {event.modelId.split('/').pop()}
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-400">{event.provider}</span>
        </div>
      </div>
    );
  }

  if (event.type === 'rewind') {
    const bindingCount = event.data.bindings?.length ?? 0;
    return (
      <div className="flex items-center gap-2.5 px-5 py-2 bg-ember/[0.03] dark:bg-ember/[0.06]">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <ArrowBendUpLeft size={14} className="text-ember" weight="bold" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ember">rewind</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-400">
            {bindingCount > 0 ? `${bindingCount} entries` : 'navigated'}
          </span>
        </div>
      </div>
    );
  }

  if (event.type === 'branch_summary') {
    return (
      <div className="flex items-center gap-2.5 px-5 py-2 bg-moss/[0.03] dark:bg-moss/[0.06]">
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <TreeStructure size={14} className="text-moss" weight="bold" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-moss">branch</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-400 truncate max-w-[200px]">
            {event.summary.length > 60 ? event.summary.substring(0, 60) + '…' : event.summary}
          </span>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricBox({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-zinc-50/80 dark:bg-white/[0.04] rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-zinc-400 dark:text-zinc-400" weight="bold" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400">{label}</span>
      </div>
      <p className="metric-mono text-sm font-bold text-zinc-800 dark:text-zinc-300">{value}</p>
    </div>
  );
}

function ModelPill({ label, value, fullValue }: { label: string; value: string; fullValue?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-accent/[0.04] dark:bg-accent/[0.08] rounded-xl">
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-400">{label}</span>
      <span className="metric-mono text-xs font-bold text-accent truncate ml-2" title={fullValue ?? value}>{value}</span>
    </div>
  );
}

function TokenPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-zinc-50/80 dark:bg-white/[0.04] rounded-xl">
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
        <span className="metric-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">{value.toLocaleString()}</span>
      </div>
    </div>
  );
}

function TimingPill({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${
      highlight ? 'bg-accent/5' : warn ? 'bg-ember/5' : 'bg-zinc-50/80 dark:bg-white/[0.04]'
    }`}>
      <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-400">{label}</span>
      <span className={`metric-mono text-xs font-bold ${
        highlight ? 'text-accent' : warn ? 'text-ember' : 'text-zinc-700 dark:text-zinc-300'
      }`}>{value}</span>
    </div>
  );
}
