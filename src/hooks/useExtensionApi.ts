import { useEffect, useRef } from 'react';
import { parseJsonl } from '../lib/parser';

/**
 * When the web app is served from the pi-tps-web extension's local server,
 * the URL contains `?auto=1`. This hook detects that and auto-loads
 * telemetry data from the extension's /api/telemetry endpoint.
 *
 * Update detection uses two mechanisms:
 * 1. Server-Sent Events (primary): /api/events pushes version changes
 *    to the browser immediately, eliminating polling latency.
 * 2. Polling fallback (secondary): If SSE is unavailable or drops,
 *    polls /api/version every 2s. Retries on error instead of dying.
 */
export function useExtensionApi(
  addSession: (raw: string, fileName?: string) => void,
  setLoading: (v: boolean) => void,
) {
  const addSessionRef = useRef(addSession);
  const setLoadingRef = useRef(setLoading);
  // Keep the refs in sync with the latest props without writing to them
  // during render (which the react-hooks/refs rule forbids). The effect
  // runs after render; the long-lived SSE/poll effect below reads via
  // .current so it always sees the freshest callbacks.
  useEffect(() => {
    addSessionRef.current = addSession;
    setLoadingRef.current = setLoading;
  }, [addSession, setLoading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAutoLoad = params.has('auto');
    if (!isAutoLoad) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    const POLL_INTERVAL_MS = 2000;
    const POLL_RETRY_MS = 5000;

    async function loadFromApi() {
      if (cancelled) return;
      setLoadingRef.current(true);
      try {
        const res = await fetch('/api/telemetry', { cache: 'no-cache' });
        if (!res.ok) {
          setLoadingRef.current(false);
          return;
        }
        const text = await res.text();
        if (!text.trim()) {
          setLoadingRef.current(false);
          return;
        }
        // Validate: at least one parseable JSON line
        const events = parseJsonl(text);
        if (events.length === 0) {
          setLoadingRef.current(false);
          return;
        }
        addSessionRef.current(text, 'pi-session');
      } catch {
        setLoadingRef.current(false);
      }
    }

    // Initial load
    loadFromApi();

    let lastVersion: number | null = null;

    function onVersionChanged() {
      if (cancelled) return;
      loadFromApi();
    }

    // Primary: Server-Sent Events for real-time push notifications.
    // When /tps-web updates the telemetry, the server pushes the new
    // version to all connected clients immediately.
    let sse: EventSource | null = null;
    try {
      sse = new EventSource('/api/events');
      sse.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (typeof data.version === 'number') {
            if (lastVersion !== null && data.version !== lastVersion) {
              onVersionChanged();
            }
            lastVersion = data.version;
          }
        } catch { /* ignore malformed SSE data */ }
      };
      sse.onerror = () => {
        // SSE dropped — polling (started below) continues as fallback
      };
    } catch {
      // EventSource not available — polling alone
    }

    // Secondary: Poll for version changes as fallback.
    // Retries on error — a transient network blip or browser tab
    // backgrounding should not kill the poller permanently.
    function pollVersion() {
      if (cancelled) return;
      fetch('/api/version', { cache: 'no-cache' })
        .then((res) => res.json())
        .then((data: { version: number }) => {
          if (cancelled) return;
          if (lastVersion !== null && data.version !== lastVersion) {
            onVersionChanged();
          }
          lastVersion = data.version;
          pollTimer = setTimeout(pollVersion, POLL_INTERVAL_MS);
        })
        .catch(() => {
          pollTimer = setTimeout(pollVersion, POLL_RETRY_MS);
        });
    }

    // Start polling after a short delay (SSE is the primary channel)
    pollTimer = setTimeout(pollVersion, 3000);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      sse?.close();
    };
  }, []);
}
