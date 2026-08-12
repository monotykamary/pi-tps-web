import { describe, it, expect } from 'vitest';
// Raw source import — vite/client declares `*?raw` modules (string).
// Lets us static-check the SQL strings loadEvents builds without spinning up
// the wasm-backed DuckDB (which needs browser workers + static assets that
// vitest/jsdom doesn't serve). This is a contract test, not a runtime test.
import duckdbSrc from './duckdb.ts?raw';

/**
 * Count the value tokens a single ingest `row = [...]` array writes.
 * Producers are num(...), esc(...), bool(...) calls plus the bare 'NULL' /
 * TRUE / FALSE literals used as placeholders. The array literal is fully
 * covered by these forms (no nested calls, no string literals other than
 * 'NULL'), so the count is exact.
 */
function countRowValues(block: string): number {
  const afterRow = block.slice(block.indexOf('row = ['));
  const calls = (afterRow.match(/\bnum\(/g) ?? []).length
    + (afterRow.match(/\besc\(/g) ?? []).length
    + (afterRow.match(/\bbool\(/g) ?? []).length;
  const literals = afterRow.split("'NULL'").length - 1
    + (afterRow.match(/\bTRUE\b/g) ?? []).length
    + (afterRow.match(/\bFALSE\b/g) ?? []).length;
  return calls + literals;
}

/** Column names declared in the `CREATE TABLE events (...)` schema, in order. */
function eventsColumns(): string[] {
  const m = duckdbSrc.match(/CREATE TABLE events \(([\s\S]*?)\n {4}\)/);
  expect(m, 'events table DDL not found').not.toBeNull();
  const cols: string[] = [];
  for (let line of m![1].split('\n')) {
    // Drop inline/full-line comments so SQL `-- ...` notes don't confuse the parse
    line = line.replace(/--.*$/, '').trim();
    // Column def: `<name>  <TYPE> [NOT NULL],` — name is the first token.
    const cm = line.match(/^(\w+)\s+(?:DOUBLE|BIGINT|VARCHAR|BOOLEAN)/);
    if (cm) cols.push(cm[1]);
  }
  return cols;
}

/** Column names projected by the `tps_flat` view, in order. */
function tpsFlatColumns(): string[] {
  const m = duckdbSrc.match(/CREATE VIEW tps_flat AS\s*SELECT\s*([\s\S]*?)\s*FROM events\s*WHERE type = 'tps'/);
  expect(m, 'tps_flat view not found').not.toBeNull();
  return m![1].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
}

/** Column names projected by the `energy_detailed` view, in order. */
function energyDetailedColumns(): string[] {
  const m = duckdbSrc.match(/CREATE VIEW energy_detailed AS\s*SELECT\s*([\s\S]*?)\s*FROM events\s*WHERE type = 'energy'/);
  expect(m, 'energy_detailed view not found').not.toBeNull();
  return m![1].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
}

/** Energy/TPS columns the first `paired` SELECT projects into `base`.
 *  Excludes the trailing CASE...AS effective_ms, which is computed later. */
function baseCteRefs(): string[] {
  const viewSrc = duckdbSrc.slice(duckdbSrc.indexOf('CREATE VIEW tps_paired'));
  const m = viewSrc.match(/WITH paired AS \(\s*SELECT\s*([\s\S]*?)\s*FROM tps_flat t\s*INNER JOIN energy_detailed/);
  expect(m, 'tps_paired paired CTE not found').not.toBeNull();
  return [...m![1].matchAll(/[te]\.(\w+)/g)].map((x) => x[1]);
}

/** The outer SELECT body of tps_paired (after `SELECT *,`) — where computed
 *  columns like rate_usd_per_m_tokens_effective are defined. */
function tpsPairedOuterSelect(): string {
  const viewSrc = duckdbSrc.slice(duckdbSrc.indexOf('CREATE VIEW tps_paired'));
  const m = viewSrc.match(/ {4}SELECT\s*\*,\s*([\s\S]*?)\n {4}FROM base/);
  expect(m, 'tps_paired outer SELECT not found').not.toBeNull();
  return m![1];
}

/** The COLS(...) list used by the batch INSERT. */
function colsList(): string[] {
  const m = duckdbSrc.match(/const COLS = `\(([\s\S]*?)\)`;/);
  expect(m, 'COLS list not found').not.toBeNull();
  return m![1].replace(/\n/g, '').split(',').map((c) => c.trim()).filter(Boolean);
}

describe('duckdb SQL contracts', () => {
  describe('ingest row arity — every branch writes one value per COLS column', () => {
    // Regression guard for "VALUES lists must all be the same length": a
    // branch whose placeholder padding drifts from COLS crashes the whole
    // INSERT at load time. Catches the model_change breakage that took down
    // session loads when rate_usd_per_m_tokens was added.
    const cols = colsList();
    const body = duckdbSrc.slice(
      duckdbSrc.indexOf('for (const e of events)'),
      duckdbSrc.indexOf('// Batch inserts'),
    );
    const cases = ['tps', 'energy', 'rewind', 'model_change', 'branch_summary', 'message'];

    for (const c of cases) {
      it(`${c} branch writes exactly ${cols.length} values`, () => {
        const start = body.indexOf(`case '${c}': {`);
        expect(start, `${c} case block not found`).toBeGreaterThan(-1);
        const end = body.indexOf('break;', start);
        const block = body.slice(start, end);
        expect(countRowValues(block)).toBe(cols.length);
      });
    }
  });

  describe('energy↔tps pairing direction', () => {
    it('tps_paired joins energy appended after OR before the tps entry', () => {
      const pairingSrc = duckdbSrc.slice(duckdbSrc.indexOf('CREATE TABLE claimed AS'));
      expect(pairingSrc).toContain('t.id = e.parent_id');
      expect(pairingSrc).toContain('t.parent_id = e.id');
      // DuckDB WASM cannot LEFT JOIN a subquery, so leftover energy is
      // materialised and the reverse match ANTI JOINs claimed TPS rows.
      expect(pairingSrc).toContain('CREATE TABLE leftover_energy');
      expect(pairingSrc).toContain('ANTI JOIN claimed');
      expect(pairingSrc).not.toContain('NOT EXISTS');
      expect(pairingSrc).not.toContain('LEFT JOIN');
    });
  });

  describe('rate_usd_per_m_tokens threaded through every SQL layer', () => {
    // Regression guard for "Referenced column ... not found in FROM clause":
    // the tps_paired base CTE names columns explicitly (no t.*), so adding a
    // column to events/tps_flat without also adding it to base breaks the
    // outer SELECT that computes rate_usd_per_m_tokens_effective. Catches the
    // binder error that crashed view creation during loadEvents.
    const col = 'rate_usd_per_m_tokens';

    it('is declared in the events table', () => {
      expect(eventsColumns()).toContain(col);
    });

    it('is projected by tps_flat', () => {
      expect(tpsFlatColumns()).toContain(col);
    });

    it('is exposed by the tps_paired base CTE (t.<col>)', () => {
      expect(baseCteRefs()).toContain(col);
    });

    it('is referenced by the tps_paired outer SELECT (A-else-B blend)', () => {
      expect(tpsPairedOuterSelect()).toContain(`COALESCE(\n        ${col},`);
    });
  });

  describe('flex telemetry threaded through every SQL layer', () => {
    // Regression guard mirroring the rate_usd_per_m_tokens guard: flex fields
    // flow events -> energy_detailed -> tps_paired. Forgetting a hop breaks
    // view creation at load time or silently nulls the RequestInspector row.
    const flexCols = ['service_tier', 'queue_seconds', 'flex_discount_pct', 'list_cost_usd', 'consumed_cost_usd'];

    for (const col of flexCols) {
      it(`"${col}" is declared in the events table`, () => {
        expect(eventsColumns()).toContain(col);
      });

      it(`"${col}" is projected by energy_detailed`, () => {
        expect(energyDetailedColumns()).toContain(col);
      });

      it(`"${col}" is exposed by the tps_paired base CTE (e.${col})`, () => {
        expect(baseCteRefs()).toContain(col);
      });
    }
  });

  describe('tps_paired outer-SELECT bindings resolve against the base CTE', () => {
    // Broad guard: every bare column name the outer SELECT uses must be
    // producible by base (either a t./e. ref or the computed effective_ms).
    // If a future column addition forgets the base projection, this fires
    // instead of a runtime binder error.
    const baseAvail = new Set([...baseCteRefs(), 'effective_ms']);
    // Strip SQL line comments so English words in `-- ...` notes don't get
    // parsed as column refs (they caused a flood of false positives).
    const outer = tpsPairedOuterSelect().replace(/--.*$/gm, '');

    const KEYWORDS = new Set([
      'coalesce', 'nullif', 'case', 'when', 'then', 'else', 'end', 'as',
      'and', 'or', 'not', 'is', 'null', 'true', 'false', 'greatest',
    ]);
    const refs = new Set<string>();
    for (const m of outer.matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) {
      const id = m[1];
      if (KEYWORDS.has(id)) continue;
      refs.add(id);
    }

    for (const id of refs) {
      it(`outer SELECT references "${id}" — available from base`, () => {
        // Skip refs that are themselves aliases defined earlier in the same
        // outer SELECT (e.g. effective_cost_usd). DuckDB resolves those
        // fine; asserting them against base would be a false failure.
        const definedHere = new Set(
          [...outer.matchAll(/\bAS\s+([a-z_][a-z0-9_]*)/g)].map((m) => m[1]),
        );
        if (definedHere.has(id)) return;
        expect(baseAvail.has(id), `base CTE does not expose "${id}"`).toBe(true);
      });
    }
  });
});
