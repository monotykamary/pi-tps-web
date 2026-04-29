import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileArrowUp, Pulse, Timer, Flame, Coins, Lightning, Gauge, Clock, Hash, ArrowBendUpLeft, ArrowsLeftRight, Barbell } from '@phosphor-icons/react';
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
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-colors ${
        accent
          ? 'bg-accent/5 border-accent/15 dark:bg-accent/10 dark:border-accent/20'
          : 'bg-white/60 border-zinc-200/50 dark:bg-zinc-800/40 dark:border-white/[0.06]'
      }`}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className={`shrink-0 p-1.5 rounded-lg ${
        accent
          ? 'bg-accent/10 text-accent dark:bg-accent/15'
          : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.04] dark:text-zinc-400'
      }`}>
        <Icon weight="bold" size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-400 leading-none">{label}</p>
        <p className="metric-mono text-base font-semibold text-zinc-800 dark:text-zinc-300 leading-tight mt-0.5">
          {value}{unit && <span className="text-xs text-zinc-400 dark:text-zinc-400 ml-0.5">{unit}</span>}
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
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const allTpsEvents = useMemo(() => events ? getTpsEvents(events) : [], [events]);
  const tpsEvents = useMemo(
    () => selectedModel ? allTpsEvents.filter(e => e.data.model.modelId === selectedModel) : allTpsEvents,
    [allTpsEvents, selectedModel]
  );
  const energyEvents = useMemo(() => events ? getEnergyEvents(events) : [], [events]);
  const modelChanges = useMemo(() => events ? getModelChangeEvents(events) : [], [events]);
  const rewindEvents = useMemo(() => events ? getRewindEvents(events) : [], [events]);
  const paired = useMemo(() => pairEnergyWithTps(tpsEvents, energyEvents), [tpsEvents, energyEvents]);
  // Full-session summary for header model list (always unfiltered)
  const sessionSummary: ConversationSummary | null = useMemo(
    () => allTpsEvents.length > 0 ? computeSummary(allTpsEvents, energyEvents, modelChanges, rewindEvents) : null,
    [allTpsEvents, energyEvents, modelChanges, rewindEvents]
  );
  // Filtered summary for metrics strip and dashboard
  const summary: ConversationSummary | null = useMemo(
    () => tpsEvents.length > 0 ? computeSummary(tpsEvents, energyEvents, modelChanges, rewindEvents) : null,
    [tpsEvents, energyEvents, modelChanges, rewindEvents]
  );
  const buckets = useMemo(() => computeTimingBuckets(tpsEvents), [tpsEvents]);
  const dataThresholds = useMemo(() => deriveDataThresholds(tpsEvents), [tpsEvents]);
  const timeline = useMemo(() => events ? buildTimeline(events, paired) : [], [events, paired]);

  const loadSample = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/sample.jsonl');
      const text = await res.text();
      setEvents(parseJsonl(text));
      setSelectedModel(null);
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
      setSelectedModel(null);
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
      setSelectedModel(null);
    };
    reader.readAsText(file);
  }, []);

  return (
    <div
      className="min-h-[100dvh] bg-[#fafafa] dark:bg-[#18181b]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#fafafa]/80 dark:bg-[#18181b]/80 backdrop-blur-xl border-b border-zinc-200/50 dark:border-white/[0.06]">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 dark:bg-accent/15 rounded-xl">
              <Gauge weight="bold" size={22} className="text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-300 leading-none">pi-tps</h1>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-400 font-medium tracking-wide mt-0.5">TELEMETRY INSPECTOR</p>
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
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:border-accent/30 hover:text-accent dark:hover:border-accent/40 dark:hover:text-accent-light transition-all group-active:scale-[0.98]">
                <FileArrowUp size={14} weight="bold" />
                <span>Import JSONL</span>
              </div>
            </label>
            {sessionSummary && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white/80 dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-white/[0.06] rounded-xl">
                <Pulse size={12} className={selectedModel === null ? 'text-moss' : 'text-zinc-400 dark:text-zinc-500'} weight="fill" />
                {/* All models button */}
                <button
                  onClick={() => setSelectedModel(null)}
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                    selectedModel === null
                      ? 'bg-accent/10 text-accent dark:bg-accent/15'
                      : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  All
                </button>
                {sessionSummary.models.map(m => (
                  <button
                    key={m.modelId}
                    onClick={() => setSelectedModel(m.modelId === selectedModel ? null : m.modelId)}
                    className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                      selectedModel === m.modelId
                        ? 'bg-accent/10 text-accent dark:bg-accent/15'
                        : 'text-zinc-400 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                    }`}
                    title={`${m.modelId} · ${m.provider} · ${m.callCount} calls`}
                  >
                    {m.modelId.split('/').pop()}
                    <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-400">{m.callCount}</span>
                  </button>
                ))}
                {(sessionSummary.modelChangeCount > 0 || sessionSummary.rewindCount > 0) && (
                  <>
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-700">·</span>
                    <div className="flex items-center gap-1">
                      {sessionSummary.modelChangeCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-accent" title={`${sessionSummary.modelChangeCount} model switches`}>
                          <ArrowsLeftRight size={10} weight="bold" />
                          {sessionSummary.modelChangeCount}
                        </span>
                      )}
                      {sessionSummary.rewindCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-ember" title={`${sessionSummary.rewindCount} rewinds`}>
                          <ArrowBendUpLeft size={10} weight="bold" />
                          {sessionSummary.rewindCount}
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
              <div className="w-10 h-10 border-2 border-zinc-200 dark:border-white/[0.06] border-t-accent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400 dark:text-zinc-400 font-medium">Loading telemetry...</p>
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
                : 'border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-zinc-800/40'
            }`}>
              <div className="w-16 h-16 mx-auto mb-6 bg-zinc-50 dark:bg-white/[0.06] rounded-3xl flex items-center justify-center">
                <FileArrowUp size={28} className="text-zinc-300 dark:text-zinc-400" weight="duotone" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Drop a telemetry or session file</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-400 mb-8 leading-relaxed">
                Drag and drop a <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">.jsonl</code> file from pi — telemetry exports, or raw session files from <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">~/.pi/agent/sessions</code> — to inspect tokens-per-second, timing, and cache behavior.
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
                className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-2"
              >
                <MetricPill icon={Pulse} label="Requests" value={formatNumber(summary.totalCalls)} />
                <MetricPill icon={Timer} label="Total Time" value={formatDuration(summary.totalTimeMs)} />
                <MetricPill icon={Gauge} label="Avg TPS" value={summary.avgTps.toFixed(1)} unit="tok/s" />
                <MetricPill icon={Barbell} label="Wtd TPS" value={summary.weightedTps.toFixed(1)} unit="tok/s" accent />
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
