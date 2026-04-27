import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileArrowUp, Pulse, Timer, Flame, Coins, Lightning, Gauge, Clock, Hash, ArrowBendUpLeft, ArrowsLeftRight } from '@phosphor-icons/react';
import type { ParsedEvent, ConversationSummary } from './types';
import { parseJsonl, getTpsEvents, getEnergyEvents, getModelChangeEvents, getRewindEvents, computeSummary, computeTimingBuckets, pairEnergyWithTps, deriveDataThresholds, buildTimeline, formatNumber, formatCurrency, formatDuration } from './lib/parser';
import { useTheme } from './hooks/useTheme';
import TimelineChart from './components/TimelineChart';
import TimingScatter from './components/TimingScatter';
import TokenBreakdown from './components/TokenBreakdown';
import ThresholdAnalysis from './components/ThresholdAnalysis';
import AnomalyDetector from './components/AnomalyDetector';
import RequestInspector from './components/RequestInspector';
import CacheEfficiency from './components/CacheEfficiency';
import TimingDistribution from './components/TimingDistribution';
import ThemeToggle from './components/ThemeToggle';

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
          ? 'bg-accent/5 border-accent/15 dark:bg-accent/10 dark:border-accent/20'
          : 'bg-white/60 border-slate-200/50 dark:bg-slate-800/60 dark:border-slate-700/40'
      }`}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className={`p-2 rounded-xl ${
        accent
          ? 'bg-accent/10 text-accent dark:bg-accent/15'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
      }`}>
        <Icon weight="bold" size={18} />
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
        <p className="metric-mono text-lg font-semibold text-slate-800 dark:text-slate-100 leading-none">
          {value}{unit && <span className="text-sm text-slate-400 dark:text-slate-500 ml-0.5">{unit}</span>}
        </p>
      </div>
    </motion.div>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [events, setEvents] = useState<ParsedEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedTpsId, setSelectedTpsId] = useState<string | null>(null);

  const tpsEvents = useMemo(() => events ? getTpsEvents(events) : [], [events]);
  const energyEvents = useMemo(() => events ? getEnergyEvents(events) : [], [events]);
  const modelChanges = useMemo(() => events ? getModelChangeEvents(events) : [], [events]);
  const rewindEvents = useMemo(() => events ? getRewindEvents(events) : [], [events]);
  const paired = useMemo(() => events ? pairEnergyWithTps(tpsEvents, energyEvents) : [], [events, tpsEvents, energyEvents]);
  const summary: ConversationSummary | null = useMemo(
    () => events ? computeSummary(tpsEvents, energyEvents, modelChanges, rewindEvents) : null,
    [events, tpsEvents, energyEvents, modelChanges, rewindEvents]
  );
  const buckets = useMemo(() => events ? computeTimingBuckets(tpsEvents) : [], [events, tpsEvents]);
  const dataThresholds = useMemo(() => deriveDataThresholds(tpsEvents), [tpsEvents]);
  const timeline = useMemo(() => events ? buildTimeline(events, paired) : [], [events, paired]);

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
      className="min-h-[100dvh] bg-[#f9fafb] dark:bg-[#0a0a0f]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#f9fafb]/80 dark:bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/40">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 dark:bg-accent/15 rounded-xl">
              <Gauge weight="bold" size={22} className="text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 leading-none">pi-tps</h1>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium tracking-wide mt-0.5">TELEMETRY INSPECTOR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <label className="relative cursor-pointer group">
              <input
                type="file"
                accept=".jsonl,.json"
                className="sr-only"
                onChange={handleFileInput}
              />
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-accent/30 hover:text-accent dark:hover:border-accent/40 dark:hover:text-accent-light transition-all group-active:scale-[0.98]">
                <FileArrowUp size={16} weight="bold" />
                <span>Import JSONL</span>
              </div>
            </label>
            {summary && (
              <div className="flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-slate-800/80 border border-slate-200/40 dark:border-slate-700/40 rounded-xl">
                <Pulse size={14} className="text-moss" weight="fill" />
                {summary.models.length === 1 ? (
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{summary.models[0].modelId.split('/').pop()}</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {summary.models.map(m => (
                      <span
                        key={m.modelId}
                        className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1"
                        title={`${m.modelId} · ${m.provider} · ${m.callCount} calls`}
                      >
                        {m.modelId.split('/').pop()}
                        <span className="text-[10px] metric-mono text-slate-400 dark:text-slate-500">{m.callCount}</span>
                      </span>
                    )).reduce<React.ReactNode[]>((acc, el, i) => i > 0 ? [...acc, <span key={`sep-${i}`} className="text-[10px] text-slate-300 dark:text-slate-600">·</span>, el] : [el], [])}
                  </div>
                )}
                {(summary.modelChangeCount > 0 || summary.rewindCount > 0) && (
                  <>
                    <span className="text-[10px] text-slate-300 dark:text-slate-600">·</span>
                    <div className="flex items-center gap-1.5">
                      {summary.modelChangeCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-accent" title={`${summary.modelChangeCount} model switches`}>
                          <ArrowsLeftRight size={10} weight="bold" />
                          {summary.modelChangeCount}
                        </span>
                      )}
                      {summary.rewindCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-ember" title={`${summary.rewindCount} rewinds`}>
                          <ArrowBendUpLeft size={10} weight="bold" />
                          {summary.rewindCount}
                        </span>
                      )}
                    </div>
                  </>
                )}
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
              <div className="w-10 h-10 border-2 border-slate-200 dark:border-slate-700 border-t-accent rounded-full animate-spin" />
              <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">Loading telemetry...</p>
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
              dragOver
                ? 'border-accent bg-accent/5 dark:border-accent dark:bg-accent/10'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60'
            }`}>
              <div className="w-16 h-16 mx-auto mb-6 bg-slate-50 dark:bg-slate-700/50 rounded-3xl flex items-center justify-center">
                <FileArrowUp size={28} className="text-slate-300 dark:text-slate-500" weight="duotone" />
              </div>
              <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">Drop a telemetry file</h2>
              <p className="text-sm text-slate-400 dark:text-slate-500 mb-8 leading-relaxed">
                Drag and drop a <code className="metric-mono text-xs bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">.jsonl</code> file from pi to inspect tokens-per-second, timing, and cache behavior.
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
                  timeline={timeline}
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
