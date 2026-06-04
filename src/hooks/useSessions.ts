import { useState, useCallback, useMemo, useEffect } from 'react';
import type { ParsedEvent, SessionState } from '../types';
import {
  ingestJsonl,
  deriveEvents,
  getTpsEvents,
  getEnergyEvents,
  pairEnergyWithTps,
  buildTimeline,
} from '../lib/parser';
import { loadEvents, resetDB } from '../lib/duckdb';

export function useSessions(setLoading: (v: boolean) => void) {
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);

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

  const allTpsEvents = useMemo(() => (events ? getTpsEvents(events) : []), [events]);
  const allEnergyEvents = useMemo(() => (events ? getEnergyEvents(events) : []), [events]);
  const paired = useMemo(
    () => pairEnergyWithTps(allTpsEvents, allEnergyEvents),
    [allTpsEvents, allEnergyEvents],
  );
  const timeline = useMemo(
    () => (events ? buildTimeline(events, paired) : []),
    [events, paired],
  );

  useEffect(() => {
    if (sessions.size === 0) {
      queueMicrotask(() => {
        setDbLoading(false);
        setHasLoaded(false);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => {
      setDbLoading(true);
      setLoading(false);
    });
    let stale = false;
    const timer = setTimeout(() => {
      const allEvts: ParsedEvent[] = [];
      for (const s of sessions.values()) {
        allEvts.push(...s.events);
      }
      loadEvents(allEvts)
        .then(() => {
          if (!stale) {
            setDbVersion((v) => v + 1);
            setDbLoading(false);
            setHasLoaded(true);
          }
        })
        .catch((err) => {
          console.error('DuckDB load failed:', err);
          if (!stale) setDbLoading(false);
        });
    }, 100);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [sessions, setLoading]);

  const addSession = useCallback((raw: string, fileName?: string) => {
    const ingest = ingestJsonl(raw);
    const evts = deriveEvents(ingest);
    const sid = ingest.sessionId;
    setSessions((prev) => {
      const next = new Map(prev);
      next.set(sid, { raw, ingest, events: evts, fileName });
      return next;
    });
    setActiveSessionId(null);
  }, []);

  const removeSession = useCallback(
    (sid: string) => {
      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(sid);
        return next;
      });
      setActiveSessionId((prev) => (prev === sid ? null : prev));
    },
    [],
  );

  const clearSessions = useCallback(() => {
    setSessions(new Map());
    setActiveSessionId(null);
    setDbLoading(false);
    setHasLoaded(false);
    resetDB().catch(() => {});
  }, []);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    dbLoading,
    hasLoaded,
    dbVersion,
    events,
    allTpsEvents,
    allEnergyEvents,
    paired,
    timeline,
    addSession,
    removeSession,
    clearSessions,
  };
}
