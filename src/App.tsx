import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileArrowUp, Pulse, Timer, Flame, Coins, Lightning, Gauge, Clock, Hash } from '@phosphor-icons/react';
import type { ParsedEvent, ConversationSummary } from './types';
import { parseJsonl, getTpsEvents, getEnergyEvents, computeSummary, computeTimingBuckets, pairEnergyWithTps, deriveDataThresholds, formatNumber, formatCurrency, formatDuration } from './lib/parser';
import TimelineChart from './components/TimelineChart';
import TimingScatter from './components/TimingScatter';
import TokenBreakdown from './components/TokenBreakdown';
import ThresholdAnalysis from './components/ThresholdAnalysis';
import AnomalyDetector from './components/AnomalyDetector';
import RequestInspector from './components/RequestInspector';
import CacheEfficiency from './components/CacheEfficiency';
import TimingDistribution from './components/TimingDistribution';

function MetricPill({ icon: Icon, label, value, unit, accent = false }: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <motion.div
      layout
      className={`flex items-center gap-3 px-5 py-3 rounded-2xl border transition-colors ${
        accent
          ? 'bg-accent/5 border-accent/15'
          : 'bg-white/60 border-slate-200/50'
      }`}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className={`p-2 rounded-xl ${accent ? 'bg-accent/10 text-accent' : 'bg-slate-100 text-slate-500'}`}>
        <Icon weight="bold" size={18} />
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="metric-mono text-lg font-semibold text-slate-800 leading-none">
          {value}{unit && <span className="text-sm text-slate-400 ml-0.5">{unit}</span>}
        </p>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [events, setEvents] = useState<ParsedEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedTpsId, setSelectedTpsId] = useState<string | null>(null);

  const tpsEvents = events ? getTpsEvents(events) : [];
  const energyEvents = events ? getEnergyEvents(events) : [];
  const summary: ConversationSummary | null = events ? computeSummary(tpsEvents, energyEvents) : null;
  const buckets = events ? computeTimingBuckets(tpsEvents) : [];
  const paired = events ? pairEnergyWithTps(tpsEvents, energyEvents) : [];
  const dataThresholds = useMemo(() => deriveDataThresholds(tpsEvents), [tpsEvents]);

  const loadSample = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/sample.jsonl');
      const text = await res.text();
      setEvents(parseJsonl(text));
    } catch (e) {
      console.error('Failed to load sample', e);
    }
    setLoading(false);
  }, []);

  // No auto-load — user must drop a file or click "Load Sample Data"

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setEvents(parseJsonl(text));
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setEvents(parseJsonl(text));
    };
    reader.readAsText(file);
  }, []);

  return (
    <div
      className="min-h-[100dvh] bg-[#f9fafb]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#f9fafb]/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-xl">
              <Gauge weight="bold" size={22} className="text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 leading-none">pi-tps</h1>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide mt-0.5">TELEMETRY INSPECTOR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer group">
              <input
                type="file"
                accept=".jsonl,.json"
                className="sr-only"
                onChange={handleFileInput}
              />
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200/60 rounded-xl text-sm font-medium text-slate-600 hover:border-accent/30 hover:text-accent transition-all group-active:scale-[0.98]">
                <FileArrowUp size={16} weight="bold" />
                <span>Import JSONL</span>
              </div>
            </label>
            {summary && (
              <div className="flex items-center gap-2 px-3 py-2 bg-white/80 border border-slate-200/40 rounded-xl">
                <Pulse size={14} className="text-moss" weight="fill" />
                <span className="text-xs font-medium text-slate-500">{summary.model.split('/').pop()}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {loading && !events ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center min-h-[60dvh]"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-slate-200 border-t-accent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Loading telemetry...</p>
            </div>
          </motion.div>
        ) : !events || tpsEvents.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center min-h-[70dvh] px-6"
          >
            <div className={`max-w-md w-full text-center p-12 rounded-[2.5rem] border-2 border-dashed transition-colors ${
              dragOver ? 'border-accent bg-accent/5' : 'border-slate-200 bg-white'
            }`}>
              <div className="w-16 h-16 mx-auto mb-6 bg-slate-50 rounded-3xl flex items-center justify-center">
                <FileArrowUp size={28} className="text-slate-300" weight="duotone" />
              </div>
              <h2 className="text-xl font-semibold text-slate-700 mb-2">Drop a telemetry file</h2>
              <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                Drag and drop a <code className="metric-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">.jsonl</code> file from pi to inspect tokens-per-second, timing, and cache behavior.
              </p>
              <button
                onClick={loadSample}
                className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-dark transition-colors active:scale-[0.98] active:translate-y-[1px]"
              >
                Load Sample Data
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="max-w-[1600px] mx-auto px-6 py-8 space-y-8"
          >
            {/* Metrics Strip */}
            {summary && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3"
              >
                <MetricPill icon={Pulse} label="Requests" value={formatNumber(summary.totalCalls)} />
                <MetricPill icon={Timer} label="Total Time" value={formatDuration(summary.totalTimeMs)} />
                <MetricPill icon={Gauge} label="Avg TPS" value={summary.avgTps.toFixed(1)} />
                <MetricPill icon={Clock} label="Avg TTFT" value={`${Math.round(summary.avgTtft)}ms`} />
                <MetricPill icon={Flame} label="Stalls" value={formatNumber(summary.totalStallCount)} accent />
                <MetricPill icon={Coins} label="Cost" value={formatCurrency(summary.totalCostUsd)} />
                <MetricPill icon={Lightning} label="Energy" value={summary.totalEnergyJoules !== null ? `${formatNumber(summary.totalEnergyJoules)}J` : '-'} />
                <MetricPill icon={Hash} label="Tokens" value={formatNumber(summary.totalTokens)} />
              </motion.div>
            )}

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Charts */}
              <div className="lg:col-span-8 space-y-6">
                <TimelineChart buckets={buckets} onBucketClick={() => { }} />
                <TimingScatter events={paired} onPointClick={(id) => setSelectedTpsId(id)} thresholds={dataThresholds} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TimingDistribution events={paired} thresholds={dataThresholds} />
                  <CacheEfficiency events={paired} />
                </div>
                <TokenBreakdown events={paired} />
              </div>

              {/* Right: Analysis Panel */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                <ThresholdAnalysis events={tpsEvents} thresholds={dataThresholds} />
                <AnomalyDetector events={paired} thresholds={dataThresholds} />
                <RequestInspector
                  events={paired}
                  selectedId={selectedTpsId}
                  onSelect={(id) => setSelectedTpsId(id)}
                  thresholds={dataThresholds}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
