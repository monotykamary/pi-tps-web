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

  if (!initPromise) {
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
  }

  await initPromise;
  if (db && conn) {
    // Create a second connection for the SQL playground so user queries
    // don't block dashboard auto-queries (DuckDB serializes per-connection).
    if (!sqlConn) {
      sqlConn = await db.connect();
    }
    return { db, conn };
  }
  throw new Error('DuckDB initialization failed');
}

/** Get a dedicated connection for the SQL playground. */
export async function getSqlConn(): Promise<duckdb.AsyncDuckDBConnection> {
  const { conn: c } = await getDuckDB();
  return sqlConn ?? c;
}

export async function loadEvents(events: ParsedEvent[]): Promise<void> {
  const { conn: c } = await getDuckDB();

  await c.query(`DROP VIEW IF EXISTS tps_paired`);
  await c.query(`DROP TABLE IF EXISTS leftover_energy`);
  await c.query(`DROP TABLE IF EXISTS claimed`);
  await c.query(`DROP VIEW IF EXISTS messages_flat`);
  await c.query(`DROP VIEW IF EXISTS tps_flat`);
  await c.query(`DROP VIEW IF EXISTS energy_flat`);
  await c.query(`DROP VIEW IF EXISTS energy_detailed`);
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
      rate_usd_per_m_tokens DOUBLE,

      -- Energy fields
      energy_joules DOUBLE,
      energy_cost_usd DOUBLE,

      -- SSE energy raw fields (populated from NeuralWatt profiling)
      carbon_g_co2eq           DOUBLE,
      grid_carbon_intensity    DOUBLE,
      grid_id                  VARCHAR,
      avg_power_watts          DOUBLE,
      energy_kwh               DOUBLE,
      attribution_method       VARCHAR,
      attribution_ratio        DOUBLE,
      ratio_was_capped         BOOLEAN,
      uncapped_energy_joules   DOUBLE,
      uncapped_energy_kwh      DOUBLE,

      -- SSE MCR raw fields (populated from NeuralWatt MCR data)
      apc_hit_rate             DOUBLE,
      apc_hit_tokens           BIGINT,
      apc_miss_tokens          BIGINT,
      context_tokens           BIGINT,
      compaction_triggered     BOOLEAN,
      compaction_energy_joules DOUBLE,
      mcr_original_tokens      BIGINT,
      mcr_compacted_tokens     BIGINT,
      current_turn_new_tokens  BIGINT,
      mcr_mode                 VARCHAR,
      mcr_summaries_used       BIGINT,
      mcr_session_turns        BIGINT,
      mcr_all_chunks_cached    BOOLEAN,

      -- Flex tier telemetry (derived client-side from SSE data chunks)
      service_tier          VARCHAR,
      queue_seconds         DOUBLE,
      flex_discount_pct     DOUBLE,
      list_cost_usd         DOUBLE,
      consumed_cost_usd     DOUBLE,

      -- Rewind fields
      rewind_v BIGINT,

      -- Branch summary fields
      from_id  VARCHAR,
      summary  VARCHAR,

      -- Message fields
      message_role    VARCHAR,
      message_content VARCHAR,
      message_model   VARCHAR
    )
  `);

  if (events.length === 0) return;

  // Build rows — one INSERT per event is fine for the typical dataset sizes
  // (hundreds to low thousands of events per session).
  const values: string[] = [];

  for (const e of events) {
    const esc = (s: string | null | undefined): string =>
      s == null ? 'NULL' : `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\0/g, '').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;

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
          num(d.rateUsdPerMTokens ?? null),
          // energy
          'NULL', 'NULL',
          // sse energy raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // sse mcr raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // flex
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
          // message
          'NULL', 'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'energy': {
        const d = e.data;
        const sse = d.sse_energy_raw;
        // sse_mcr_session_raw is a summarized view with some fields;
        // sse.mcr has the full detail. Merge both, preferring session_raw
        // for fields it defines, but falling back to sse.mcr for the rest.
        const sessionMcr = d.sse_mcr_session_raw as Record<string, unknown> | undefined;
        const sseMcr = sse?.mcr as Record<string, unknown> | undefined;
        const mcr: Record<string, unknown> = { ...(sseMcr ?? {}), ...(sessionMcr ?? {}) };
        const bool = (v: unknown): string => v === true ? 'TRUE' : v === false ? 'FALSE' : 'NULL';
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('energy'),
          // tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          num(d.energy_joules), num(d.cost_usd),
          // sse energy raw
          num(sse?.carbon_g_co2eq as number | null | undefined),
          num(sse?.grid_carbon_intensity_gco2perkwhr as number | null | undefined),
          esc(sse?.grid_id as string | null | undefined),
          num(sse?.avg_power_watts as number | null | undefined),
          num(sse?.energy_kwh as number | null | undefined),
          esc(sse?.attribution_method as string | null | undefined),
          num(sse?.attribution_ratio as number | null | undefined),
          bool(sse?.ratio_was_capped),
          num(sse?.uncapped_energy_joules as number | null | undefined),
          num(sse?.uncapped_energy_kwh as number | null | undefined),
          // sse mcr raw
          num(mcr?.apc_hit_rate as number | null | undefined),
          num(mcr?.apc_hit_tokens as number | null | undefined),
          num(mcr?.apc_miss_tokens as number | null | undefined),
          num(mcr?.context_tokens as number | null | undefined),
          bool(mcr?.compaction_triggered),
          num(mcr?.compaction_energy_joules as number | null | undefined),
          num(mcr.mcr_original_tokens as number | null | undefined ?? mcr.original_tokens as number | null | undefined),
          num(mcr?.mcr_compacted_tokens as number | null | undefined),
          num(mcr?.current_turn_new_tokens as number | null | undefined),
          esc(mcr?.mode as string | null | undefined),
          num(mcr?.summaries_used as number | null | undefined),
          num(mcr?.session_turns as number | null | undefined),
          bool(mcr?.all_chunks_cached),
          // flex
          esc(d.service_tier), num(d.queue_seconds),
          num(d.flex_discount_pct_est), num(d.list_cost_usd_est),
          num(d.consumed_cost_usd_est),
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
          // message
          'NULL', 'NULL', 'NULL',
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
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // sse energy raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // sse mcr raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // flex
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // rewind
          num(d.v),
          // branch summary
          'NULL', 'NULL',
          // message
          'NULL', 'NULL', 'NULL',
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
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // sse energy raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // sse mcr raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // flex
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
          // message
          'NULL', 'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'branch_summary': {
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('branch_summary'),
          // tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // sse energy raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // sse mcr raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // flex
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          esc(e.fromId), esc(e.summary),
          // message
          'NULL', 'NULL', 'NULL',
        ].join(', ');
        break;
      }
      case 'message': {
        const d = e.data;
        row = [
          esc(e.sessionId), esc(e.id), esc(e.parentId), esc(e.timestamp), esc('message'),
          // tps fields
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // energy
          'NULL', 'NULL',
          // sse energy raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // sse mcr raw
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // flex
          'NULL', 'NULL', 'NULL', 'NULL', 'NULL',
          // rewind
          'NULL',
          // branch summary
          'NULL', 'NULL',
          // message
          esc(d.role), esc(d.content), esc(d.model),
        ].join(', ');
        break;
      }
    }
    values.push(`(${row})`);
  }

  // Batch inserts in chunks of 500 to avoid SQL length limits
  const COLS = `(session_id, id, parent_id, timestamp, type,
    provider, model_id, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_total,
    ttft_ms, total_ms, generation_ms, stream_ms, stall_ms, stall_count, tps,
    cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total, rate_usd_per_m_tokens,
    energy_joules, energy_cost_usd,
    carbon_g_co2eq, grid_carbon_intensity, grid_id, avg_power_watts,
    energy_kwh, attribution_method, attribution_ratio, ratio_was_capped,
    uncapped_energy_joules, uncapped_energy_kwh,
    apc_hit_rate, apc_hit_tokens, apc_miss_tokens, context_tokens,
    compaction_triggered, compaction_energy_joules,
    mcr_original_tokens, mcr_compacted_tokens, current_turn_new_tokens,
    mcr_mode, mcr_summaries_used, mcr_session_turns, mcr_all_chunks_cached,
    service_tier, queue_seconds, flex_discount_pct, list_cost_usd, consumed_cost_usd,
    rewind_v, from_id, summary,
    message_role, message_content, message_model)`;
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    const chunk = values.slice(i, i + BATCH);
    await c.query(`INSERT INTO events ${COLS} VALUES ${chunk.join(',\n')}`);
  }

  // Flat views for the most common query patterns
  await c.query(`
    CREATE VIEW tps_flat AS
    SELECT
      session_id, id, parent_id, timestamp,
      provider, model_id,
      tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_total,
      ttft_ms, total_ms, generation_ms, stream_ms, stall_ms, stall_count, tps,
      cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
      rate_usd_per_m_tokens
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

  await c.query(`
    CREATE VIEW energy_detailed AS
    SELECT
      session_id, id, parent_id, timestamp,
      energy_joules, energy_cost_usd,
      carbon_g_co2eq, grid_carbon_intensity, grid_id, avg_power_watts,
      energy_kwh, attribution_method, attribution_ratio, ratio_was_capped,
      uncapped_energy_joules, uncapped_energy_kwh,
      apc_hit_rate, apc_hit_tokens, apc_miss_tokens,
      context_tokens, compaction_triggered, compaction_energy_joules,
      mcr_original_tokens, mcr_compacted_tokens, current_turn_new_tokens,
      mcr_mode, mcr_summaries_used, mcr_session_turns, mcr_all_chunks_cached,
      service_tier, queue_seconds, flex_discount_pct, list_cost_usd, consumed_cost_usd
    FROM events
    WHERE type = 'energy'
      AND (carbon_g_co2eq IS NOT NULL OR avg_power_watts IS NOT NULL OR apc_hit_rate IS NOT NULL OR context_tokens IS NOT NULL OR service_tier IS NOT NULL)
  `);

  await c.query(`
    CREATE VIEW messages_flat AS
    SELECT
      session_id, id, parent_id, timestamp,
      message_role, message_content, message_model
    FROM events
    WHERE type = 'message'
  `);

  // Enriched view: TPS rows with effective_tps, wall_tps, effective_ms,
  // and paired energy data. This is the primary view for all dashboard queries.
  //
  // DuckDB WASM cannot LEFT JOIN on a subquery/CTE ("Cannot perform non-inner
  // join on subquery"), so pairing uses two materialised tables. Forward
  // matches (energy appended after the TPS entry) claim first; leftover
  // energy is only offered to reverse matches (tps.parent_id = energy.id)
  // that no TPS already claimed. Mirrors pairEnergyWithTps().
  await c.query(`
    CREATE TABLE claimed AS
    SELECT t.session_id, t.id AS tps_id, e.id AS energy_id
    FROM tps_flat t
    INNER JOIN energy_detailed e
      ON t.session_id = e.session_id AND t.id = e.parent_id
  `);

  await c.query(`
    CREATE TABLE leftover_energy AS
    SELECT e.*
    FROM energy_detailed e
    ANTI JOIN claimed c
      ON e.session_id = c.session_id AND e.id = c.energy_id
  `);

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
    WITH paired AS (
      SELECT
        t.session_id, t.id, t.parent_id, t.timestamp,
        t.provider, t.model_id,
        t.tokens_input, t.tokens_output, t.tokens_cache_read, t.tokens_cache_write, t.tokens_total,
        t.ttft_ms, t.total_ms, t.generation_ms, t.stream_ms, t.stall_ms, t.stall_count, t.tps,
        t.cost_input, t.cost_output, t.cost_cache_read, t.cost_cache_write, t.cost_total,
        t.rate_usd_per_m_tokens,
        e.energy_joules,
        e.energy_cost_usd,
        e.carbon_g_co2eq,
        e.grid_carbon_intensity,
        e.grid_id,
        e.avg_power_watts,
        e.attribution_method,
        e.attribution_ratio,
        e.ratio_was_capped,
        e.uncapped_energy_joules,
        e.apc_hit_rate,
        e.apc_hit_tokens,
        e.apc_miss_tokens,
        e.context_tokens,
        e.compaction_triggered,
        e.compaction_energy_joules,
        e.mcr_original_tokens,
        e.mcr_compacted_tokens,
        e.current_turn_new_tokens,
        e.mcr_mode,
        e.service_tier,
        e.queue_seconds,
        e.flex_discount_pct,
        e.list_cost_usd,
        e.consumed_cost_usd
      FROM tps_flat t
      INNER JOIN energy_detailed e
        ON t.session_id = e.session_id AND t.id = e.parent_id

      UNION ALL

      SELECT
        t.session_id, t.id, t.parent_id, t.timestamp,
        t.provider, t.model_id,
        t.tokens_input, t.tokens_output, t.tokens_cache_read, t.tokens_cache_write, t.tokens_total,
        t.ttft_ms, t.total_ms, t.generation_ms, t.stream_ms, t.stall_ms, t.stall_count, t.tps,
        t.cost_input, t.cost_output, t.cost_cache_read, t.cost_cache_write, t.cost_total,
        t.rate_usd_per_m_tokens,
        e.energy_joules,
        e.energy_cost_usd,
        e.carbon_g_co2eq,
        e.grid_carbon_intensity,
        e.grid_id,
        e.avg_power_watts,
        e.attribution_method,
        e.attribution_ratio,
        e.ratio_was_capped,
        e.uncapped_energy_joules,
        e.apc_hit_rate,
        e.apc_hit_tokens,
        e.apc_miss_tokens,
        e.context_tokens,
        e.compaction_triggered,
        e.compaction_energy_joules,
        e.mcr_original_tokens,
        e.mcr_compacted_tokens,
        e.current_turn_new_tokens,
        e.mcr_mode,
        e.service_tier,
        e.queue_seconds,
        e.flex_discount_pct,
        e.list_cost_usd,
        e.consumed_cost_usd
      FROM tps_flat t
      INNER JOIN leftover_energy e
        ON t.session_id = e.session_id AND t.parent_id = e.id
      ANTI JOIN claimed c
        ON t.session_id = c.session_id AND t.id = c.tps_id

      UNION ALL

      SELECT
        t.session_id, t.id, t.parent_id, t.timestamp,
        t.provider, t.model_id,
        t.tokens_input, t.tokens_output, t.tokens_cache_read, t.tokens_cache_write, t.tokens_total,
        t.ttft_ms, t.total_ms, t.generation_ms, t.stream_ms, t.stall_ms, t.stall_count, t.tps,
        t.cost_input, t.cost_output, t.cost_cache_read, t.cost_cache_write, t.cost_total,
        t.rate_usd_per_m_tokens,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL
      FROM tps_flat t
      ANTI JOIN claimed c
        ON t.session_id = c.session_id AND t.id = c.tps_id
      ANTI JOIN leftover_energy e
        ON t.session_id = e.session_id AND t.parent_id = e.id
    ),
    base AS (
      SELECT
        session_id, id, parent_id, timestamp,
        provider, model_id,
        tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, tokens_total,
        ttft_ms, total_ms, generation_ms, stream_ms, stall_ms, stall_count, tps,
        cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
        rate_usd_per_m_tokens,
        energy_joules,
        energy_cost_usd,
        carbon_g_co2eq,
        grid_carbon_intensity,
        grid_id,
        avg_power_watts,
        attribution_method,
        attribution_ratio,
        ratio_was_capped,
        uncapped_energy_joules,
        apc_hit_rate,
        apc_hit_tokens,
        apc_miss_tokens,
        context_tokens,
        compaction_triggered,
        compaction_energy_joules,
        mcr_original_tokens,
        mcr_compacted_tokens,
        current_turn_new_tokens,
        mcr_mode,
        service_tier,
        queue_seconds,
        flex_discount_pct,
        list_cost_usd,
        consumed_cost_usd,
        CASE
          WHEN stream_ms > 0 AND stall_ms < stream_ms
               AND (stream_ms - stall_ms) >= 50
               AND stall_ms < (stream_ms - stall_ms)
            THEN stream_ms - stall_ms
          WHEN generation_ms >= 50 THEN
            CASE
              WHEN (generation_ms - stall_ms) < 200
                   OR stall_ms > generation_ms * 0.85
                THEN greatest(generation_ms - stall_ms / 2.0, 50)
              ELSE greatest(generation_ms - stall_ms, 50)
            END
          ELSE 0
        END AS effective_ms
      FROM paired
    )
    SELECT
      *,
      -- Effective blended cost: Neuralwatt billed cost (energy) when present,
      -- otherwise the list-price token cost. Mirrors pi-tps' effectiveCost
      -- selection so the rate below matches the banner's $/M exactly for
      -- turns where pi-tps populated rate_usd_per_m_tokens.
      COALESCE(energy_cost_usd, cost_total) AS effective_cost_usd,
      -- A-else-B blended $/M-tokens: prefer pi-tps' precomputed per-turn
      -- rate (A) when present; otherwise derive from effective cost + tokens
      -- (B) so older sessions (logged before the field shipped) still get a
      -- value. null only when no cost or zero tokens.
      COALESCE(
        rate_usd_per_m_tokens,
        COALESCE(energy_cost_usd, cost_total) / NULLIF(tokens_total / 1000000.0, 0)
      ) AS rate_usd_per_m_tokens_effective,
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
  await c.query(`DROP TABLE IF EXISTS leftover_energy`);
  await c.query(`DROP TABLE IF EXISTS claimed`);
  await c.query(`DROP VIEW IF EXISTS messages_flat`);
  await c.query(`DROP VIEW IF EXISTS tps_flat`);
  await c.query(`DROP VIEW IF EXISTS energy_flat`);
  await c.query(`DROP VIEW IF EXISTS energy_detailed`);
  await c.query(`DROP TABLE IF EXISTS events`);
}
