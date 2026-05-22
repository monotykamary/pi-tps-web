import * as duckdb from '@duckdb/duckdb-wasm';
import type { ParsedEvent } from '../types';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let sqlConn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<void> | null = null;

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

export async function getDuckDB(): Promise<{
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
}> {
  if (db && conn) return { db, conn };

  if (initPromise) {
    await initPromise;
    if (db && conn) return { db, conn };
  }

  initPromise = (async () => {
    // Static assets served from public/duckdb/ — same-origin, no CORS issues
    const BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: '/duckdb/duckdb-mvp.wasm',
        mainWorker: '/duckdb/duckdb-browser-mvp.worker.js',
      },
      eh: {
        mainModule: '/duckdb/duckdb-eh.wasm',
        mainWorker: '/duckdb/duckdb-browser-eh.worker.js',
      },
    };

    const bundle = await duckdb.selectBundle(BUNDLES);
    if (!bundle.mainWorker) throw new Error('No DuckDB worker bundle found');

    const worker = new Worker(bundle.mainWorker);
    const logger = new duckdb.ConsoleLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({});
    conn = await db.connect();
  })();

  await initPromise;
  if (!db || !conn) throw new Error('DuckDB initialization failed');
  // Create a second connection for the SQL playground so user queries
  // don't block dashboard auto-queries (DuckDB serializes per-connection).
  if (!sqlConn) {
    sqlConn = await db.connect();
  }
  return { db, conn };
}

/** Get a dedicated connection for the SQL playground. */
export async function getSqlConn(): Promise<duckdb.AsyncDuckDBConnection> {
  const { conn: c } = await getDuckDB();
  return sqlConn ?? c;
}

export async function loadEvents(events: ParsedEvent[]): Promise<void> {
  const { conn: c } = await getDuckDB();

  await c.query(`DROP VIEW IF EXISTS tps_paired`);
  await c.query(`DROP VIEW IF EXISTS tps_flat`);
  await c.query(`DROP VIEW IF EXISTS energy_flat`);
  await c.query(`DROP TABLE IF EXISTS events`);

  // All events go into a single table with a discriminator column.
  // Nullable columns cover the union of all event types.
  await c.query(`
    CREATE TABLE events (
      session_id  VARCHAR NOT NULL,
      id          VARCHAR,
      parent_id   VARCHAR,
      timestamp   VARCHAR NOT NULL,
      type        VARCHAR NOT NULL,

      -- TPS fields
      provider      VARCHAR,
      model_id      VARCHAR,
      tokens_input  BIGINT,
      tokens_output BIGINT,
      tokens_cache_read  BIGINT,
      tokens_cache_write BIGINT,
      tokens_total  BIGINT,
      ttft_ms       DOUBLE,
      total_ms      DOUBLE,
      generation_ms DOUBLE,
      stream_ms     DOUBLE,
      stall_ms      DOUBLE,
      stall_count   BIGINT,
      tps           DOUBLE,
      cost_input    DOUBLE,
      cost_output   DOUBLE,
      cost_cache_read  DOUBLE,
      cost_cache_write DOUBLE,
      cost_total    DOUBLE,

      -- Energy fields
      energy_joules DOUBLE,
      energy_cost_usd DOUBLE,

      -- Rewind fields
      rewind_v BIGINT,

      -- Branch summary fields
      from_id  VARCHAR,
      summary  VARCHAR
    )
  `);

  if (events.length === 0) return;

  // Build rows — one INSERT per event is fine for the typical dataset sizes
  // (hundreds to low thousands of events per session).
  const values: string[] = [];

  for (const e of events) {
    const esc = (s: string | null | undefined): string =>
      s == null ? 'NULL' : `'${s.replace(/'/g, "''")}'`;

    const num = (n: number | null | undefined): string =>
      n == null ? 'NULL' : String(n);

    let row: string;
    switch (e.type) {
      case 'tps': {
        const d = e.data;
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('tps'),
          esc(d.model.provider), esc(d.model.modelId),
          num(d.tokens.input), num(d.tokens.output),
          num(d.tokens.cacheRead), num(d.tokens.cacheWrite), num(d.tokens.total),
          num(d.timing.ttftMs), num(d.timing.totalMs), num(d.timing.generationMs),
          num(d.timing.streamMs ?? null), num(d.timing.stallMs), num(d.timing.stallCount),
          num(d.tps),
          num(d.cost?.input ?? null), num(d.cost?.output ?? null),
          num(d.cost?.cacheRead ?? null), num(d.cost?.cacheWrite ?? null),
          num(d.cost?.total ?? null),
          // energy
          'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'energy': {
        const d = e.data;
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('energy'),
          // tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          num(d.energy_joules), num(d.cost_usd),
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'rewind': {
        const d = e.data;
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('rewind'),
          // tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // rewind
          num(d.v),
          // branch summary
          'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'model_change': {
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('model_change'),
          esc(e.provider), esc(e.modelId),
          // remaining tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'branch_summary': {
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('branch_summary'),
          // tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          esc(e.fromId), esc(e.summary),
        ].join(', ');
        break;
      }
    }
    values.push(`(${row})`);
  }

  // Batch inserts in chunks of 500 to avoid SQL length limits
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    const chunk = values.slice(i, i + BATCH);
    await c.query(`INSERT INTO events VALUES ${chunk.join(',\n')}`);
  }

  // Flat views for the most common query patterns
  await c.query(`
    CREATE VIEW tps_flat AS
    SELECT
      session_id, id, parent_id, timestamp,
      provider, model_id,
      tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_total,
      ttft_ms, total_ms, generation_ms, stream_ms, stall_ms, stall_count, tps,
      cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total
    FROM events
    WHERE type = 'tps'
  `);

  await c.query(`
    CREATE VIEW energy_flat AS
    SELECT
      session_id, id, parent_id, timestamp,
      energy_joules, energy_cost_usd
    FROM events
    WHERE type = 'energy'
  `);

  // Enriched view: TPS rows with effective_tps, wall_tps, effective_ms,
  // and LEFT JOINed energy data. This is the primary view for all dashboard queries.
  //
  // effective_tps mirrors computeSafeEffectiveMs / computeEffectiveTps from parser.ts:
  //   Primary branch (stream-based, excludes TTFT):
  //     if streamMs > 0 AND stallMs < streamMs AND (streamMs - stallMs) >= 50 AND stallMs < (streamMs - stallMs)
  //       → effective_ms = streamMs - stallMs
  //   Fallback branch (generationMs-based, includes TTFT):
  //     if generationMs >= 50
  //       → effectiveGenMs = generationMs - stallMs
  //         if effectiveGenMs < 200 OR stallMs > generationMs * 0.85
  //           → partial stall reduction: effective_ms = max(generationMs - stallMs/2, 50)
  //         else → effective_ms = max(effectiveGenMs, 50)
  //   Else: effective_ms = 0, effective_tps = 0
  await c.query(`
    CREATE VIEW tps_paired AS
    WITH base AS (
      SELECT
        t.session_id, t.id, t.parent_id, t.timestamp,
        t.provider, t.model_id,
        t.tokens_input, t.tokens_output, t.tokens_cache_read, t.tokens_cache_write, t.tokens_total,
        t.ttft_ms, t.total_ms, t.generation_ms, t.stream_ms, t.stall_ms, t.stall_count, t.tps,
        t.cost_input, t.cost_output, t.cost_cache_read, t.cost_cache_write, t.cost_total,
        e.energy_joules,
        e.energy_cost_usd,
        CASE
          WHEN t.stream_ms > 0 AND t.stall_ms < t.stream_ms
               AND (t.stream_ms - t.stall_ms) >= 50
               AND t.stall_ms < (t.stream_ms - t.stall_ms)
            THEN t.stream_ms - t.stall_ms
          WHEN t.generation_ms >= 50 THEN
            CASE
              WHEN (t.generation_ms - t.stall_ms) < 200
                   OR t.stall_ms > t.generation_ms * 0.85
                THEN greatest(t.generation_ms - t.stall_ms / 2.0, 50)
              ELSE greatest(t.generation_ms - t.stall_ms, 50)
            END
          ELSE 0
        END AS effective_ms
      FROM tps_flat t
      LEFT JOIN energy_flat e
        ON t.session_id = e.session_id AND t.id = e.parent_id
    )
    SELECT
      *,
      CASE WHEN effective_ms > 0
        THEN tokens_output / (effective_ms / 1000.0)
        ELSE 0 END AS effective_tps,
      CASE WHEN total_ms > 0
        THEN tokens_output / (total_ms / 1000.0)
        ELSE 0 END AS wall_tps
    FROM base
  `);
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const { conn: c } = await getDuckDB();
  const result = await c.query(sql);

  const columns = result.schema.fields.map((f) => f.name);
  const rows: unknown[][] = [];

  for (const batch of result.batches) {
    const colArrays = columns.map((name) => batch.getChild(name));
    for (let i = 0; i < batch.numRows; i++) {
      const row = colArrays.map((arr) => {
        const v = arr?.get(i);
        if (typeof v === 'bigint') return Number(v);
        return v ?? null;
      });
      rows.push(row);
    }
  }

  return { columns, rows, rowCount: rows.length };
}

export async function resetDB(): Promise<void> {
  const { conn: c } = await getDuckDB();
  await c.query(`DROP VIEW IF EXISTS tps_paired`);
  await c.query(`DROP VIEW IF EXISTS tps_flat`);
  await c.query(`DROP VIEW IF EXISTS energy_flat`);
  await c.query(`DROP TABLE IF EXISTS events`);
}
