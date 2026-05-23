import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FileArrowUp, Pulse, Timer, Flame, Coins, Lightning, Gauge, Clock, Hash, Barbell, Info, ClipboardText, X, FolderOpen, Rows, DownloadSimple, Database } from '@phosphor-icons/react';
import { DEFAULT_THRESHOLDS } from './types';
import type { ParsedEvent, ModelInfo, MultiSessionSummary, DataThresholds, SessionState } from './types';
import { ingestJsonl, deriveEvents, parseJsonl, getTpsEvents, getEnergyEvents, pairEnergyWithTps, buildTimeline, exportMultiSessionCsv } from './lib/parser';
import { formatNumber, formatCurrency, formatDuration, formatTps, formatEnergy, formatEnergyParts } from './lib/format/format';
import { useTheme } from './hooks/useTheme';
import { useDuckQuery } from './hooks/useDuckQuery';
import { MetricPill, TpsPill } from './components/metrics/MetricPill';
import { RequestsTooltip, TotalTimeTooltip, TtftTooltip, StallsTooltip, CostTooltip, EnergyTooltip, TokensTooltip } from './components/tooltips';
import TimelineChart from './components/TimelineChart';
import TimingScatter from './components/TimingScatter';
import TokenBreakdown from './components/TokenBreakdown';
import ThresholdAnalysis from './components/ThresholdAnalysis';
import AnomalyDetector from './components/AnomalyDetector';
import RequestInspector from './components/RequestInspector';
import CacheEfficiency from './components/CacheEfficiency';
import TimingDistribution from './components/TimingDistribution';
import SessionScatter from './components/SessionScatter';
import ModelPerformance from './components/ModelPerformance';
import ThemeToggle from './components/ThemeToggle';
import SqlPlayground from './components/SqlPlayground';
import { loadEvents, resetDB } from './lib/duckdb';
import {
  querySummary, queryModels, queryDataThresholds, queryTimingBuckets,
  queryMultiSessionSummary,
} from './lib/queries';
import type {
  ConversationSummaryRow, DataThresholdsRow, TimingBucketRow, ModelInfoRow, SessionSummaryRow,
} from './lib/queries';

export default function App() {
  const { theme, setTheme } = useTheme();
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedTpsId, setSelectedTpsId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'dashboard' | 'sql'>('dashboard');
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Track DB version — increments when sessions change, triggers re-queries
  const [dbVersion, setDbVersion] = useState(0);

  // Derived: the events to display — either one session or all merged
  // Used for per-event detail in components not yet migrated to SQL
  const events = useMemo<ParsedEvent[] | null>(() => {
    if (sessions.size === 0) return null;
    if (activeSessionId) {
      return sessions.get(activeSessionId)?.events ?? null;
    }
    const all: ParsedEvent[] = [];
    for (const s of sessions.values()) {
      all.push(...s.events);
    }
    return all;
  }, [sessions, activeSessionId]);

  const allTpsEvents = useMemo(() => events ? getTpsEvents(events) : [], [events]);
  const allEnergyEvents = useMemo(() => events ? getEnergyEvents(events) : [], [events]);

  // JS-derived paired data for components not yet migrated to SQL
  const paired = useMemo(() => pairEnergyWithTps(allTpsEvents, allEnergyEvents), [allTpsEvents, allEnergyEvents]);

  // Filtered TPS events for components still using JS-based data
  const tpsEvents = useMemo(
    () => selectedModel ? allTpsEvents.filter(e => e.data.model.modelId === selectedModel) : allTpsEvents,
    [allTpsEvents, selectedModel]
  );

  const timeline = useMemo(() => events ? buildTimeline(events, paired) : [], [events, paired]);

  // Load events into DuckDB whenever sessions change
  // Debounced: when multiple files are dropped in quick succession, each addSession
  // triggers this effect. We batch them by delaying 100ms so loadEvents runs once
  // with the full set of events instead of once per file.
  useEffect(() => {
    if (sessions.size === 0) {
      queueMicrotask(() => {
        setDbLoading(false);
        setHasLoaded(false);
      });
      return;
    }
    queueMicrotask(() => {
      setDbLoading(true);
      setLoading(false); // FileReader phase done, dbLoading takes over
    });
    let stale = false;
    const timer = setTimeout(() => {
      const allEvts: ParsedEvent[] = [];
      for (const s of sessions.values()) {
        allEvts.push(...s.events);
      }
      loadEvents(allEvts).then(() => {
        if (!stale) {
          setDbVersion(v => v + 1);
          setDbLoading(false);
          setHasLoaded(true);
        }
      }).catch((err) => {
        console.error('DuckDB load failed:', err);
        if (!stale) setDbLoading(false);
      });
    }, 100);
    return () => { stale = true; clearTimeout(timer); };
  }, [sessions]);

  // ---- DuckDB-powered queries ----

  // Summary metrics — replaces computeSummary()
  const { data: summary } = useDuckQuery<ConversationSummaryRow | null>(
    () => querySummary(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel], { skip: viewTab === 'sql' }
  );

  // Models for header dropdown + tooltip breakdown
  const { data: queryModelsResult } = useDuckQuery<ModelInfoRow[]>(
    () => queryModels(activeSessionId),
    [dbVersion, activeSessionId], { skip: viewTab === 'sql' }
  );

  // Per-model list for header dropdown
  const modelList = queryModelsResult ?? [];

  // Adapt ModelInfoRow → ModelInfo for tooltip compatibility
  const summaryModels: ModelInfo[] = queryModelsResult?.map(m => ({
    modelId: m.modelId,
    provider: m.provider,
    callCount: m.callCount,
    totalTokens: m.totalTokens,
    energyCostUsd: m.energyCostUsd,
    energyJoules: m.energyJoules,
    blendedCostUsd: m.blendedCostUsd,
    costSource: m.costSource,
  })) ?? [];

  // Thresholds — replaces deriveDataThresholds()
  const { data: dataThresholds } = useDuckQuery<DataThresholdsRow>(
    () => queryDataThresholds(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel], { skip: viewTab === 'sql' }
  );

  // Adapt DataThresholdsRow → DataThresholds for components still using JS types
  const dataThresholdsJs = useMemo(() => dataThresholds ? {
    cacheThreshold: dataThresholds.cacheThreshold,
    lowContext: dataThresholds.lowContext,
    slowTtft: dataThresholds.slowTtft,
    fastTtft: dataThresholds.fastTtft,
    highNewInputRatio: dataThresholds.highNewInputRatio,
    anomalyInputThreshold: dataThresholds.anomalyInputThreshold,
    cacheDropMinTotal: dataThresholds.cacheDropMinTotal,
    cacheDropMinInput: dataThresholds.cacheDropMinInput,
    highInputRatio: dataThresholds.highInputRatio,
    highInputSeverityToken: dataThresholds.highInputSeverityToken,
    stallCountThreshold: dataThresholds.stallCountThreshold,
    stallMsSeverity: dataThresholds.stallMsSeverity,
  } as DataThresholds : undefined, [dataThresholds]);

  // Timing buckets — replaces computeTimingBuckets()
  const { data: buckets } = useDuckQuery<TimingBucketRow[]>(
    () => queryTimingBuckets(activeSessionId, selectedModel),
    [dbVersion, activeSessionId, selectedModel], { skip: viewTab === 'sql' }
  );

  // TODO: wire DuckDB-powered queries into components when ready
  //  - queryScatter() → TimingScatter
  //  - queryThresholdCrossings() → ThresholdAnalysis
  //  - queryAnomalies() → AnomalyDetector
  //  - queryTimeline() → RequestInspector / TimelineChart

  // Multi-session summary — replaces computeMultiSessionSummary()
  const { data: multiSummary } = useDuckQuery<{
    sessionCount: number;
    totalCalls: number;
    totalTokens: number;
    totalOutput: number;
    totalCostUsd: number | null;
    totalEnergyJoules: number | null;
    sessions: SessionSummaryRow[];
    models: ModelInfoRow[];
    avgTps: number;
    weightedTps: number;
    avgTtft: number;
    timeRangeStart: string;
    timeRangeEnd: string;
  } | null>(
    () => {
      if (sessions.size <= 1 || activeSessionId) return Promise.resolve(null);
      const fileNames = new Map<string, string | null>();
      for (const [sid, s] of sessions.entries()) {
        fileNames.set(sid, s.fileName ?? null);
      }
      return queryMultiSessionSummary(fileNames);
    },
    [dbVersion, sessions.size, activeSessionId], { skip: viewTab === 'sql' }
  );

  const addSession = useCallback((raw: string, fileName?: string) => {
    const ingest = ingestJsonl(raw);
    const evts = deriveEvents(ingest);
    const sid = ingest.sessionId;
    setSessions(prev => {
      const next = new Map(prev);
      next.set(sid, { raw, ingest, events: evts, fileName });
      return next;
    });
    setActiveSessionId(null); // show "all sessions" view after adding
    setSelectedModel(null);
    setSelectedTpsId(null);
  }, []);

  const removeSession = useCallback((sid: string) => {
    setSessions(prev => {
      const next = new Map(prev);
      next.delete(sid);
      return next;
    });
    if (activeSessionId === sid) setActiveSessionId(null);
  }, [activeSessionId]);

  const clearSessions = useCallback(() => {
    setSessions(new Map());
    setActiveSessionId(null);
    setSelectedModel(null);
    setSelectedTpsId(null);
    setDbLoading(false);
    setHasLoaded(false);
    resetDB().catch(() => {});
  }, []);

  const handleExportCsv = useCallback(() => {
    if (!multiSummary) return;
    // Transform DuckDB result shape (timeRangeStart/timeRangeEnd) to expected shape (timeRange.start/timeRange.end)
    const adapted: MultiSessionSummary = {
      ...multiSummary,
      sessions: multiSummary.sessions.map(s => ({
        ...s,
        models: [],
        timeRange: { start: s.timeRangeStart, end: s.timeRangeEnd },
      })),
      timeRange: { start: multiSummary.timeRangeStart, end: multiSummary.timeRangeEnd },
    };
    const csv = exportMultiSessionCsv(adapted);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pi-tps-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [multiSummary]);

  const handlePointClick = useCallback((id: string | null) => setSelectedTpsId(id), []);
  const handleSessionClick = useCallback((sid: string) => setActiveSessionId(sid), []);
  const handleBucketClick = useCallback(() => {}, []);

  const loadSample = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/sample.jsonl');
      const text = await res.text();
      addSession(text, 'sample.jsonl');
    } catch (e) {
      console.error('Failed to load sample', e);
      setLoading(false);
    }
    // Don't set setLoading(false) here — dbLoading takes over from the sessions useEffect
  }, [addSession]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.jsonl') || f.name.endsWith('.json') || f.type === 'text/plain'
    );
    if (files.length === 0) return;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        addSession(reader.result as string, file.name);
        // Don't clear loading here — dbLoading takes over from the sessions useEffect
      };
      reader.readAsText(file);
    }
    if (files.length > 0) setLoading(true);
  }, [addSession]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const [pasteFlash, setPasteFlash] = useState(false);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (!text || text.trim()[0] !== '{') return;
      // Looks like JSONL — try to parse
      const parsed = parseJsonl(text);
      if (parsed.length === 0) return;
      e.preventDefault();
      addSession(text);
      setPasteFlash(true);
      setTimeout(() => setPasteFlash(false), 600);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addSession]);

  // Measure header height for sticky session strip offset
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setHeaderHeight(Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden bg-[#fafafa] dark:bg-[#18181b]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header ref={headerRef} className="sticky top-0 z-40 bg-[#fafafa] dark:bg-[#18181b] border-b border-zinc-200/60 dark:border-white/[0.08]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-2 bg-accent/10 dark:bg-accent/15 rounded-xl">
              <Gauge weight="bold" size={22} className="text-accent" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-300 leading-none">pi-tps</h1>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-400 font-medium tracking-wide mt-0.5">TELEMETRY INSPECTOR</p>
            </div>
          </div>
          <div className="flex flex-row items-center gap-1.5 min-w-0">
            {sessions.size > 0 && (
              <div className="flex items-center gap-1 bg-white/60 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-lg p-0.5">
                <button
                  onClick={() => setViewTab('dashboard')}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
                    viewTab === 'dashboard'
                      ? 'bg-accent/10 text-accent dark:bg-accent/15'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setViewTab('sql')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 ${
                    viewTab === 'sql'
                      ? 'bg-accent/10 text-accent dark:bg-accent/15'
                      : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'
                  }`}
                >
                  <Database size={11} weight="bold" />
                  SQL
                </button>
              </div>
            )}
            <ThemeToggle theme={theme} setTheme={setTheme} />

            {modelList.length > 0 && (
              <div className="relative min-w-0">
                <select
                  value={selectedModel ?? ''}
                  onChange={(e) => setSelectedModel(e.target.value || null)}
                  className="appearance-none bg-white dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-white/[0.06] rounded-lg pl-2 pr-5 py-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-accent/30 max-w-[10rem] truncate"
                >
                  <option value="">All models</option>
                  {modelList.map(m => (
                    <option key={m.modelId} value={m.modelId}>
                      ({m.provider}) {m.modelId.split('/')?.pop()}
                    </option>
                  ))}
                </select>
                <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-zinc-400 dark:text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Session strip — shows when multiple sessions loaded */}
      {sessions.size > 0 && (
        <div style={{ top: headerHeight ? `${headerHeight}px` : 0 }} className="sticky z-30 bg-[#fafafa] dark:bg-[#18181b] border-b border-zinc-200/40 dark:border-white/[0.06]">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2 flex-1 min-w-0">
            <FolderOpen size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" weight="bold" />
            <button
              onClick={() => setActiveSessionId(null)}
              className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-medium ${
                activeSessionId === null
                  ? 'bg-accent/10 text-accent dark:bg-accent/15'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
              }`}
            >
              All ({sessions.size})
            </button>
            {Array.from(sessions.entries()).map(([sid, s]) => {
              const tpsCount = getTpsEvents(s.events).length;
              const label = s.fileName
                ? s.fileName.replace(/\.(jsonl|json)$/, '')
                : sid.length > 16 ? sid.slice(0, 16) + '…' : sid;
              return (
                <div
                  key={sid}
                  className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                    activeSessionId === sid
                      ? 'bg-accent/10 text-accent dark:bg-accent/15'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                  onClick={() => setActiveSessionId(activeSessionId === sid ? null : sid)}
                >
                  <span className="truncate max-w-[12rem]">{label}</span>
                  <span className="text-[9px] metric-mono text-zinc-400 dark:text-zinc-500">{tpsCount} req</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSession(sid); }}
                    className="ml-0.5 p-0.5 rounded hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    title="Remove session"
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              );
            })}
            </div>
            <div className="shrink-0 flex items-center gap-1.5 py-2 border-l border-zinc-200/40 dark:border-white/[0.06] pl-3 ml-1">
            <button
              onClick={clearSessions}
              className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-ember hover:bg-ember/5 dark:hover:bg-ember/10 transition-colors"
            >
              Clear all
            </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Playground — hidden when on dashboard tab, kept in DOM to preserve state */}
      <div
        className={`flex-1 min-h-0 flex flex-col px-4 sm:px-6 py-6 ${viewTab === 'sql' && sessions.size > 0 ? '' : 'hidden'}`}
      >
          <SqlPlayground dbVersion={dbVersion} activeSessionId={activeSessionId} />
      </div>

      {/* Dashboard — hidden when on SQL tab, kept in DOM to preserve state */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${viewTab === 'sql' && sessions.size > 0 ? 'hidden' : ''}`}
      >
      {(hasLoaded || dbLoading || loading) && !summary ? (
          <div className="flex items-center justify-center min-h-[60dvh]">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-zinc-200 dark:border-white/[0.06] border-t-accent rounded-full animate-spin" />
              <p className="text-sm text-zinc-400 dark:text-zinc-400 font-medium">Loading telemetry…</p>
            </div>
          </div>
        ) : !hasLoaded && !summary ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center min-h-[70dvh] px-4 sm:px-6"
          >
            <div className={`max-w-lg w-full text-center p-12 rounded-[2.5rem] border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-accent bg-accent/5 dark:border-accent dark:bg-accent/10'
                : 'border-zinc-200 bg-white dark:border-white/[0.06] dark:bg-zinc-800/40'
            }`}>
              <div className="w-16 h-16 mx-auto mb-6 bg-zinc-50 dark:bg-white/[0.06] rounded-3xl flex items-center justify-center">
                <FileArrowUp size={28} className="text-zinc-300 dark:text-zinc-400" weight="duotone" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Drop, paste, or import telemetry files</h2>
              <p className="text-sm text-zinc-400 dark:text-zinc-400 mb-6 leading-relaxed">
                Drag and drop <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">.jsonl</code> files (one or many), or paste JSONL contents directly (<kbd className="metric-mono text-[11px] bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded border border-zinc-200/60 dark:border-white/[0.06]">⌘V</kbd>). Supports telemetry exports from <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">/tps-export</code> and raw session files from <code className="metric-mono text-xs bg-zinc-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">~/.pi/agent/sessions</code>.
              </p>
              <a
                href="https://github.com/monotykamary/pi-tps"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 text-left px-4 py-3 rounded-xl border border-accent/15 dark:border-accent/20 bg-accent/[0.04] dark:bg-accent/10 hover:bg-accent/[0.07] dark:hover:bg-accent/[0.14] transition-colors mb-8"
              >
                <Info size={16} className="text-accent shrink-0 mt-0.5" weight="bold" />
                <div>
                  <p className="text-xs font-semibold text-accent leading-snug">Get the most out of your analytics</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-0.5">
                    Use <span className="font-medium text-zinc-700 dark:text-zinc-300">pi-tps</span> to hook into pi and stream rich telemetry — TPS, TTFT, energy, cache hits, and more — straight to this inspector.
                  </p>
                </div>
              </a>
              <button
                onClick={loadSample}
                className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-dark transition-colors active:scale-[0.98] active:translate-y-[1px]"
              >
                Load Sample Data
              </button>
              {pasteFlash && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 justify-center text-sm text-moss font-medium"
                >
                  <ClipboardText size={16} weight="bold" />
                  Pasted — loading telemetry…
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <div
            className={`max-w-[1600px] mx-auto px-4 sm:px-6 py-8 space-y-8 rounded-[2rem] ${dragOver ? 'border-2 border-dashed border-accent bg-accent/5 dark:border-accent dark:bg-accent/10' : ''}`}
          >
            {/* Metrics Strip */}
            {summary && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-9 gap-2"
              >
                <MetricPill icon={Pulse} label="Requests" value={formatNumber(summary.totalCalls)} tooltip={
  <RequestsTooltip
    total={summary.totalCalls}
    models={summaryModels}
    avgTokensPerCall={summary.avgTokensPerCall}
    stalledCalls={summary.stalledCalls}
    cachedCalls={summary.cachedCalls}
    fastCalls={summary.fastCalls}
  />
} />
                <MetricPill icon={Timer} label="Total Time" value={formatDuration(summary.wallClockMs)} tooltip={<TotalTimeTooltip wallClockMs={summary.wallClockMs} totalTimeMs={summary.totalTimeMs} generationMs={summary.totalGenerationMs} />} />
                <TpsPill icon={Gauge} label="Avg TPS" activeTps={summary.avgTps} wallTps={summary.avgWallTps} lossPct={summary.tpsLoss} mode="avg" />
                <TpsPill icon={Barbell} label="Wtd TPS" activeTps={summary.weightedTps} wallTps={summary.weightedWallTps} lossPct={summary.weightedTpsLoss} accent mode="weighted" />
                <MetricPill icon={Clock} label="Avg TTFT" value={formatDuration(Math.round(summary.avgTtft))} tooltip={<TtftTooltip avgTtft={summary.avgTtft} p50={summary.ttftP50} p75={summary.ttftP75} p90={summary.ttftP90} p99={summary.ttftP99} min={summary.minTtft} max={summary.maxTtft} />} />
                <MetricPill icon={Flame} label="Stalls (ITL)" value={formatNumber(summary.totalStallCount)} accent tooltip={<StallsTooltip count={summary.totalStallCount} ms={summary.totalStallMs} totalTimeMs={summary.totalTimeMs} />} />
                <MetricPill icon={Coins} label="Cost" value={formatCurrency(summary.totalCostUsd)} tooltip={<CostTooltip totalCost={summary.totalCostUsd} energyCost={summary.energyCostUsd} costSource={summary.costSource} models={summaryModels} totalTokens={summary.totalTokens} />} />
                {(() => {
                  const energy = summary.totalEnergyJoules !== null ? formatEnergyParts(summary.totalEnergyJoules) : null;
                  return (
                    <MetricPill
                      icon={Lightning}
                      label="Energy"
                      value={energy ? energy.value : '-'}
                      unit={energy ? energy.unit : undefined}
                      tooltip={<EnergyTooltip joules={summary.totalEnergyJoules} energyCost={summary.energyCostUsd} models={summaryModels} totalCalls={summary.totalCalls} />}
                    />
                  );
                })()}
                <MetricPill icon={Hash} label="Tokens" value={formatNumber(summary.totalTokens)} tooltip={<TokensTooltip input={summary.totalInput} output={summary.totalOutput} cacheRead={summary.totalCacheRead} cacheWrite={summary.totalCacheWrite} total={summary.totalTokens} totalCost={summary.totalCostUsd} />} />
              </motion.div>
            )}

            {/* Per-Session Breakdown — only in "All sessions" merged view */}
            {multiSummary && multiSummary.sessionCount > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white/80 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-2xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-zinc-200/40 dark:border-white/[0.06] flex items-center gap-2">
                  <Rows size={14} className="text-accent" weight="bold" />
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300">Sessions Overview</h2>
                  <span className="ml-auto text-[10px] metric-mono text-zinc-400 dark:text-zinc-500">{multiSummary.sessionCount} sessions · {formatNumber(multiSummary.totalCalls)} requests</span>
                  <button
                    onClick={handleExportCsv}
                    className="shrink-0 ml-2 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-accent hover:bg-accent/5 dark:hover:bg-accent/10 transition-colors flex items-center gap-1"
                    title="Export per-session stats as CSV"
                  >
                    <DownloadSimple size={10} weight="bold" />
                    CSV
                  </button>
                </div>
                <div className="overflow-x-auto" style={{ contain: 'content' }}>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/30 dark:border-white/[0.04]">
                        <th className="text-left px-4 py-2 font-medium">Session</th>
                        <th className="text-right px-3 py-2 font-medium">Requests</th>
                        <th className="text-right px-3 py-2 font-medium">Avg TPS</th>
                        <th className="text-right px-3 py-2 font-medium">Wtd TPS</th>
                        <th className="text-right px-3 py-2 font-medium">Avg TTFT</th>
                        <th className="text-right px-3 py-2 font-medium">Cost</th>
                        <th className="text-right px-3 py-2 font-medium">Energy</th>
                        <th className="text-right px-3 py-2 font-medium">Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {multiSummary.sessions.map((s, i) => (
                        <tr
                          key={s.sessionId}
                          className={`border-b border-zinc-200/20 dark:border-white/[0.03] hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer ${
                            i % 2 === 0 ? 'bg-zinc-50/30 dark:bg-white/[0.01]' : ''
                          }`}
                          onClick={() => setActiveSessionId(s.sessionId)}
                        >
                          <td className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300 max-w-[16rem] truncate">
                            {s.fileName || s.sessionId.length > 20 ? (s.fileName || s.sessionId.slice(0, 20) + '…') : s.sessionId}
                          </td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatNumber(s.totalCalls, 0)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatTps(s.avgTps)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-accent font-medium">{formatTps(s.weightedTps)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatDuration(Math.round(s.avgTtft))}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatCurrency(s.totalCostUsd)}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{s.totalEnergyJoules !== null ? formatEnergy(s.totalEnergyJoules) : '-'}</td>
                          <td className="px-3 py-2 text-right metric-mono text-zinc-600 dark:text-zinc-300">{formatNumber(s.totalTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-200/50 dark:border-white/[0.06] font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-100/40 dark:bg-white/[0.03]">
                        <td className="px-4 py-2.5">Total ({multiSummary.sessionCount})</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatNumber(multiSummary.totalCalls, 0)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatTps(multiSummary.avgTps)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono text-accent">{formatTps(multiSummary.weightedTps)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatDuration(Math.round(multiSummary.avgTtft))}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatCurrency(multiSummary.totalCostUsd)}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{multiSummary.totalEnergyJoules !== null ? formatEnergy(multiSummary.totalEnergyJoules) : '-'}</td>
                        <td className="px-3 py-2.5 text-right metric-mono">{formatNumber(multiSummary.totalTokens)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Main Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Charts */}
              <div className="lg:col-span-8 space-y-6">
                <TimelineChart buckets={buckets ?? []} onBucketClick={handleBucketClick} />
                <TimingScatter events={paired} onPointClick={handlePointClick} thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS} />
                {multiSummary && multiSummary.sessionCount > 1 && (
                  <SessionScatter multiSummary={multiSummary as unknown as MultiSessionSummary} onSessionClick={handleSessionClick} />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TimingDistribution events={paired} thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS} />
                  <CacheEfficiency events={paired} />
                </div>
                <TokenBreakdown events={paired} />
              </div>

              {/* Right: Analysis Panel */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                {summaryModels.length > 1 && (
                  <ModelPerformance
                    models={summaryModels}
                    avgTps={summary?.avgTps ?? 0}
                    weightedTps={summary?.weightedTps ?? 0}
                    totalCalls={summary?.totalCalls ?? 0}
                  />
                )}
                <ThresholdAnalysis events={tpsEvents} thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS} />
                <AnomalyDetector events={paired} thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS} />
                <RequestInspector
                  timeline={timeline}
                  selectedId={selectedTpsId}
                  onSelect={handlePointClick}
                  thresholds={dataThresholdsJs ?? DEFAULT_THRESHOLDS}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
