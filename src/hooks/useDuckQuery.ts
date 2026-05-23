import { useState, useEffect, useRef } from 'react';

/**
 * Hook to run an async DuckDB query and return the result.
 * Automatically re-runs when the query key changes.
 * Returns { data, loading, error }.
 *
 * Usage:
 *   const { data: summary, loading } = useDuckQuery(
 *     () => querySummary(modelFilter),
 *     [modelFilter]
 *   );
 *
 * Pass { skip: true } to avoid running the query (keeps previous data).
 */
export function useDuckQuery<T>(
  queryFn: () => Promise<T>,
  deps: unknown[] = [],
  options: { skip?: boolean } = {},
): { data: T | null; loading: boolean; error: Error | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    if (options.skip) {
      queueMicrotask(() => {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      });
      return () => { cancelled = true; };
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await queryFn();
        if (!cancelled && mountedRef.current) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && mountedRef.current) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, options.skip]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  return { data, loading, error };
}
