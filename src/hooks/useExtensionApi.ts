import { useEffect, useRef } from 'react';
import { parseJsonl } from '../lib/parser';

/**
 * When the web app is served from the pi-tps-web extension's local server,
 * the URL contains `?auto=1`. This hook detects that and auto-loads
 * telemetry data from the extension's /api/telemetry endpoint.
 *
 * It also polls /api/version to detect when the user re-runs /tps-web
 * with updated data, and auto-refreshes the dashboard.
 */
export function useExtensionApi(
  addSession: (raw: string, fileName?: string) => void,
  setLoading: (v: boolean) => void,
) {
  const addSessionRef = useRef(addSession);
  const setLoadingRef = useRef(setLoading);
  addSessionRef.current = addSession;
  setLoadingRef.current = setLoading;

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

    // Poll for version changes (detects when user re-runs /tps-web).
    // Retries on error instead of stopping — a transient network blip or
    // browser tab backgrounding (Safari throttles fetch in background tabs)
    // should not kill polling permanently.
    let lastVersion: number | null = null;
    function pollVersion() {
      if (cancelled) return;
      fetch('/api/version', { cache: 'no-cache' })
        .then((res) => res.json())
        .then((data: { version: number }) => {
          if (cancelled) return;
          if (lastVersion !== null && data.version !== lastVersion) {
            // Version changed — reload telemetry
            loadFromApi();
          }
          lastVersion = data.version;
          pollTimer = setTimeout(pollVersion, POLL_INTERVAL_MS);
        })
        .catch(() => {
          // API not available — retry after a longer interval instead of
          // stopping permanently
          pollTimer = setTimeout(pollVersion, POLL_RETRY_MS);
        });
    }

    // Start polling after a short delay
    pollTimer = setTimeout(pollVersion, 3000);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, []);
}
