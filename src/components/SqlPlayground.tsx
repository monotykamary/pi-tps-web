import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Play,
  CaretRight,
  DotsSixVertical,
  X,
  Table,
  CaretDown,
  Database,
  DownloadSimple,
} from '@phosphor-icons/react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { sql as sqlLang, SQLDialect } from '@codemirror/lang-sql';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { autocompletion, closeBrackets, closeBracketsKeymap, CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { useTheme } from '../hooks/useTheme';
import { getSqlConn } from '../lib/duckdb';
import type { QueryResult } from '../lib/duckdb';

const EXAMPLE_QUERIES = [
  {
    label: 'All TPS events',
    sql: `SELECT * FROM tps_flat ORDER BY timestamp`,
  },
  {
    label: 'Per-model aggregates',
    sql: `SELECT
  provider,
  model_id,
  COUNT(*) AS calls,
  SUM(tokens_output) AS total_output,
  ROUND(AVG(tps), 1) AS avg_tps,
  ROUND(AVG(ttft_ms)) AS avg_ttft_ms,
  ROUND(AVG(total_ms)) AS avg_total_ms,
  ROUND(SUM(cost_total), 4) AS total_cost
FROM tps_flat
GROUP BY provider, model_id
ORDER BY calls DESC`,
  },
  {
    label: 'TTFT distribution',
    sql: `SELECT
  CASE
    WHEN ttft_ms < 1000 THEN '<1s'
    WHEN ttft_ms < 3000 THEN '1-3s'
    WHEN ttft_ms < 10000 THEN '3-10s'
    ELSE '>10s'
  END AS ttft_bucket,
  COUNT(*) AS calls,
  ROUND(AVG(tps), 1) AS avg_tps,
  SUM(tokens_output) AS total_output
FROM tps_flat
GROUP BY ttft_bucket
ORDER BY MIN(ttft_ms)`,
  },
  {
    label: 'Cache efficiency',
    sql: `SELECT
  model_id,
  COUNT(*) AS calls,
  SUM(tokens_cache_read) AS cache_read,
  SUM(tokens_input) AS new_input,
  ROUND(
    SUM(tokens_cache_read)::DOUBLE / NULLIF(SUM(tokens_cache_read) + SUM(tokens_input), 0) * 100,
    1
  ) AS cache_hit_pct,
  ROUND(AVG(ttft_ms)) AS avg_ttft_ms
FROM tps_flat
WHERE tokens_cache_read > 0 OR tokens_input > 0
GROUP BY model_id
ORDER BY cache_hit_pct DESC`,
  },
  {
    label: 'Stall analysis',
    sql: `SELECT
  model_id,
  COUNT(*) AS total_calls,
  SUM(CASE WHEN stall_count > 0 THEN 1 ELSE 0 END) AS stalled_calls,
  ROUND(AVG(stall_ms)) AS avg_stall_ms,
  ROUND(AVG(stall_count), 1) AS avg_stall_count,
  ROUND(SUM(stall_ms)::DOUBLE / NULLIF(SUM(total_ms), 0) * 100, 1) AS stall_overhead_pct
FROM tps_flat
GROUP BY model_id
ORDER BY stalled_calls DESC`,
  },
  {
    label: 'Cost breakdown',
    sql: `SELECT
  provider,
  model_id,
  COUNT(*) AS calls,
  ROUND(SUM(cost_input), 4) AS input_cost,
  ROUND(SUM(cost_output), 4) AS output_cost,
  ROUND(SUM(cost_cache_read), 4) AS cache_read_cost,
  ROUND(SUM(cost_cache_write), 4) AS cache_write_cost,
  ROUND(SUM(cost_total), 4) AS total_cost
FROM tps_flat
WHERE cost_total IS NOT NULL
GROUP BY provider, model_id
ORDER BY total_cost DESC`,
  },
  {
    label: 'Session timeline',
    sql: `SELECT
  session_id,
  MIN(timestamp) AS session_start,
  MAX(timestamp) AS session_end,
  COUNT(*) AS calls,
  SUM(tokens_output) AS total_output,
  ROUND(AVG(tps), 1) AS avg_tps
FROM tps_flat
GROUP BY session_id
ORDER BY session_start`,
  },
  {
    label: 'Energy per model',
    sql: `SELECT
  t.model_id,
  COUNT(*) AS calls,
  ROUND(SUM(e.energy_joules), 2) AS total_joules,
  ROUND(SUM(e.energy_joules) / 3600000, 6) AS total_kwh,
  ROUND(SUM(e.energy_cost_usd), 4) AS energy_cost_usd
FROM tps_flat t
JOIN energy_flat e ON t.session_id = e.session_id AND t.id = e.parent_id
GROUP BY t.model_id
ORDER BY total_joules DESC`,
  },
  {
    label: 'Conversation messages',
    sql: `SELECT
  timestamp,
  message_role,
  message_model,
  message_content
FROM messages_flat
ORDER BY timestamp
LIMIT 100`,
  },
  {
    label: 'Energy & CO₂ overview',
    sql: `SELECT
  model_id,
  COUNT(*) AS calls,
  ROUND(SUM(energy_joules), 1) AS total_joules,
  ROUND(SUM(carbon_g_co2eq), 4) AS total_co2_g,
  ROUND(AVG(apc_hit_rate) * 100, 1) AS avg_apc_pct,
  ROUND(AVG(avg_power_watts)) AS avg_power_w,
  ROUND(AVG(context_tokens)) AS avg_ctx_tokens,
  ROUND(AVG(mcr_original_tokens)) AS avg_mcr_orig,
  SUM(CASE WHEN compaction_triggered THEN 1 ELSE 0 END) AS compactions
FROM tps_paired
WHERE energy_joules IS NOT NULL
GROUP BY model_id
ORDER BY total_joules DESC`,
  },
];

const PATH_SEP = '\x1F';
const GRP_COUNT_RE = /^_grp_count_(\d+)$/;

const ACRONYMS: Record<string, string> = {
  id: 'ID', usd: 'USD', ms: 'MS', cwd: 'CWD', url: 'URL', uri: 'URI',
  api: 'API', http: 'HTTP', https: 'HTTPS', ip: 'IP', db: 'DB',
  sql: 'SQL', jwt: 'JWT', csv: 'CSV', html: 'HTML', css: 'CSS',
  js: 'JS', ts: 'TS', json: 'JSON', xml: 'XML', os: 'OS',
  cpu: 'CPU', ram: 'RAM', gpu: 'GPU', ai: 'AI', llm: 'LLM',
  tps: 'TPS', ttft: 'TTFT', pct: 'PCT', avg: 'AVG',
};

function fmtHeader(name: string): string {
  const m = name.match(GRP_COUNT_RE);
  if (m) return `Count (L${m[1]})`;
  let s = name.replace(/_/g, ' ');
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const words = s.split(/\s+/).filter(Boolean);
  return words
    .map((w) => {
      const lower = w.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function isTimestampCol(name: string): boolean {
  const n = name.toLowerCase();
  return n === 'timestamp' || n === 'time' || n === 'createdat' || n === 'updatedat'
    || n === 'created_at' || n === 'updated_at' || n === 'session_start' || n === 'session_end';
}

function detectLongTextCols(columns: string[], allRows: unknown[][]): Set<string> {
  const LONG_TEXT_THRESHOLD = 60;
  const longCols = new Set<string>();
  for (let j = 0; j < columns.length; j++) {
    const col = columns[j];
    for (let i = 0; i < allRows.length; i++) {
      const val = allRows[i][j];
      if (typeof val === 'string' && val.length > LONG_TEXT_THRESHOLD) {
        longCols.add(col);
        break;
      }
    }
  }
  return longCols;
}

const MD_RE = /[*_`>[\]#~|]/;
const BLOCK_RE = /^[>|#*\-+] |^\d+\. |^```/m;

function markdownTier(text: string): 0 | 1 | 2 {
  if (!MD_RE.test(text)) return 0;
  if (BLOCK_RE.test(text)) return 2;
  if (/\|/.test(text) && /\n/.test(text)) return 2;
  return 1;
}

// Fast inline-only tokenizer. Each alternative uses a lazy quantifier bounded by
// a fixed closing delimiter — no nested quantifiers, so backtracking is linear.
const INLINE_RE = /(\*\*[^*]+?\*\*|__[^_]+?__|~~[^~]+?~~|\*[^*]+?\*|_[^_]+?_|`[^`]+?`|\[.+?\]\(.+?\))/g;

const InlineMarkdown = memo(function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(INLINE_RE).filter(Boolean);
  return (
    <span className="text-zinc-600 dark:text-zinc-300">
      {tokens.map((tok, i) => {
        if (tok.startsWith('**')) return <strong key={i} className="font-semibold text-zinc-800 dark:text-zinc-200">{tok.slice(2, -2)}</strong>;
        if (tok.startsWith('__')) return <strong key={i} className="font-semibold text-zinc-800 dark:text-zinc-200">{tok.slice(2, -2)}</strong>;
        if (tok.startsWith('~~')) return <del key={i}>{tok.slice(2, -2)}</del>;
        if (tok.startsWith('*')) return <em key={i} className="italic">{tok.slice(1, -1)}</em>;
        if (tok.startsWith('_')) return <em key={i} className="italic">{tok.slice(1, -1)}</em>;
        if (tok.startsWith('`')) return <code key={i} className="bg-zinc-100 dark:bg-zinc-900 rounded px-1 font-mono text-[11px]">{tok.slice(1, -1)}</code>;
        if (tok.startsWith('[')) {
          const m = tok.match(/\[(.+?)\]\((.+?)\)/);
          if (m) return <a key={i} href={m[2]} className="text-accent underline" target="_blank" rel="noopener noreferrer">{m[1]}</a>;
        }
        return <span key={i}>{tok}</span>;
      })}
    </span>
  );
});

const MarkdownSpan = memo(function MarkdownSpan({ text }: { text: string }) {
  const tier = markdownTier(text);
  if (tier === 0) {
    return <span className="text-zinc-600 dark:text-zinc-300">{text}</span>;
  }
  if (tier === 1) {
    return <InlineMarkdown text={text} />;
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img']}
      unwrapDisallowed
      components={{
        p: ({ children }) => <span>{children}</span>,
        a: ({ href, children }) => (
          <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">{children}</a>
        ),
        strong: ({ children }) => <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ className, children }) => {
          if (!className || !className.startsWith('language-')) {
            return <code className="bg-zinc-100 dark:bg-zinc-900 rounded px-1 font-mono text-[11px]">{children}</code>;
          }
          const lang = className.replace('language-', '');
          return (
            <pre className="bg-zinc-100 dark:bg-zinc-900 rounded px-1.5 py-0.5 my-0.5 overflow-x-auto">
              {lang && <div className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-0.5">{lang}</div>}
              <code className="font-mono text-[11px]">{children}</code>
            </pre>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-zinc-300 dark:border-zinc-600 pl-2 italic text-zinc-500 dark:text-zinc-400 my-0.5">{children}</blockquote>
        ),
        ul: ({ children }) => <ul className="list-disc pl-4 my-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        table: ({ children }) => <table className="border-collapse text-[11px] my-1 w-full">{children}</table>,
        thead: ({ children }) => <thead className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200/60 dark:border-white/[0.06]">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-zinc-200/40 dark:border-white/[0.04]">{children}</tr>,
        th: ({ children }) => <th className="px-2 py-1 text-left font-medium text-zinc-600 dark:text-zinc-300">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 text-zinc-600 dark:text-zinc-300">{children}</td>,
        br: () => <br />,
      } as Components}
    >
      {text}
    </ReactMarkdown>
  );
});

function fmtCell(val: unknown, col: string): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' && isTimestampCol(col) && Number.isFinite(val) && val > 1_000_000_000_000) {
    return new Date(val).toISOString().replace('T', ' ').slice(0, 19);
  }
  if (typeof val === 'number') {
    return val % 1 === 0 ? val.toLocaleString() : val.toFixed(4);
  }
  return String(val);
}

function measureColWidths(columns: string[], allRows: unknown[][], longTextCols: Set<string>): number[] {
  const charWidth = 7;
  const padding = 24;
  const maxCellW = 300;
  const maxLongTextW = 520;
  const sampleSize = 500;
  const step = allRows.length <= sampleSize ? 1 : Math.ceil(allRows.length / sampleSize);
  // Timestamp column names for inline width matching with fmtCell
  const tsCols = new Set(['timestamp', 'time', 'createdat', 'updatedat', 'created_at', 'updated_at', 'session_start', 'session_end']);
  return columns.map((col, j) => {
    const colLower = col.toLowerCase();
    // Inline fmtHeader: Split snake_case into words, expand acronyms, title-case
    const headerWords = col.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/).filter(Boolean);
    const headerLen = headerWords.reduce((sum, w) => {
      const l = w.toLowerCase();
      return sum + (ACRONYMS[l] || (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).length;
    }, headerWords.length - 1); // spaces between words
    let maxW = headerLen * charWidth + padding;
    const isTsCol = tsCols.has(colLower);
    for (let i = 0; i < allRows.length; i += step) {
      const v = allRows[i][j];
      let len: number;
      if (v === null || v === undefined) {
        len = 4; // "NULL"
      } else if (typeof v === 'number') {
        // Inline fmtCell number formatting to avoid cross-reference minification issues
        if (isTsCol && Number.isFinite(v) && v > 1e12) {
          len = 19; // ISO format "YYYY-MM-DD HH:MM:SS"
        } else if (v % 1 !== 0) {
          len = v.toFixed(4).length;
        } else {
          len = v.toLocaleString().length;
        }
      } else {
        len = String(v).length;
      }
      const cap = longTextCols.has(col) ? maxLongTextW : maxCellW;
      maxW = Math.max(maxW, Math.min(len * charWidth + padding, cap));
    }
    return maxW;
  });
}

function buildPivotSql(originalSql: string, groupByCols: string[]): string | null {
  if (groupByCols.length === 0) return null;
  const cleanSql = originalSql.replace(/;+\s*$/, '').trim();
  const windowCols = groupByCols
    .map((col, i) => `COUNT(*) OVER (PARTITION BY ${col}) AS _grp_count_${i + 1}`)
    .join(', ');
  return `SELECT _sub.*, ${windowCols} FROM (${cleanSql}) AS _sub`;
}

function detectPartitionByCols(sql: string, resultColumns: string[]): string[] {
  const cols: string[] = [];
  const re = /COUNT\(\*\)\s+OVER\s+\(\s*PARTITION\s+BY\s+([^)]+)\)\s+AS\s+_grp_count_(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const partitionCol = m[1].trim().split('.').pop()!;
    const index = parseInt(m[2], 10) - 1;
    while (cols.length <= index) cols.push('');
    cols[index] = partitionCol;
  }
  return cols.filter((c) => c && resultColumns.includes(c));
}

function detectGroupByCols(sql: string, resultColumns: string[]): string[] {
  const clean = sql
    .replace(/--[^\n]*\n?/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  const partitionCols = detectPartitionByCols(clean, resultColumns);
  if (partitionCols.length > 0) return partitionCols;

  const groupMatch = clean.match(
    /GROUP\s+BY\s+([^)]+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s+HAVING|\s+WINDOW|\s+QUALIFY|$)/i
  );
  if (!groupMatch) return [];

  const rawCols = groupMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
  const selectMatch = clean.match(/SELECT\s+(.*?)\s+FROM\s+/is);
  const selectAliases: string[] = [];
  if (selectMatch) {
    const items = selectMatch[1].split(',').map((s) => s.trim());
    for (const item of items) {
      const asMatch = item.match(/\s+AS\s+(\w+)$/i);
      if (asMatch) {
        selectAliases.push(asMatch[1]);
      } else {
        const parts = item.split(/\s+/);
        const last = parts[parts.length - 1].replace(/[^a-zA-Z0-9_]/g, '');
        if (last) selectAliases.push(last);
      }
    }
  }

  return rawCols.map((col) => {
    const ordinal = parseInt(col, 10);
    if (!isNaN(ordinal) && ordinal > 0 && ordinal <= selectAliases.length) {
      return selectAliases[ordinal - 1];
    }
    return col.split('.').pop()!;
  }).filter((c) => resultColumns.includes(c));
}

interface TreeNode {
  id: number;
  value: string | number | null;
  depth: number;
  groupCount: number;
  children: TreeNode[];
  path: string;
}

function buildTree(rows: unknown[][], columns: string[], groupByCols: string[]): TreeNode[] {
  if (groupByCols.length === 0 || rows.length === 0) return [];
  const groupColIndices = groupByCols.map((c) => columns.indexOf(c));
  if (groupColIndices.some((i) => i === -1)) return [];
  const grpCountIndices = groupByCols.map((_, i) => columns.indexOf(`_grp_count_${i + 1}`));

  const seen = new Map<string, number>();
  for (const row of rows) {
    const pathParts = groupColIndices.map((idx) => String(row[idx] ?? ''));
    for (let depth = 0; depth < groupByCols.length; depth++) {
      const prefix = pathParts.slice(0, depth + 1).join(PATH_SEP);
      const gci = grpCountIndices[depth];
      const count = gci !== -1 ? Number(row[gci]) : 0;
      if (!seen.has(prefix)) seen.set(prefix, count);
    }
  }

  let nextId = 0;
  function buildLevel(prefix: string, depth: number): TreeNode[] {
    const levelNodes: TreeNode[] = [];
    for (const [path, groupCount] of seen) {
      const vals = path.split(PATH_SEP);
      if (vals.length !== depth + 1) continue;
      if (depth > 0) {
        const expectedPrefix = vals.slice(0, depth).join(PATH_SEP);
        if (expectedPrefix !== prefix) continue;
      }
      const currentVal = vals[depth];
      const fullPath = vals.join(PATH_SEP);
      const isLeaf = depth === groupByCols.length - 1;

      if (isLeaf) {
        levelNodes.push({
          id: nextId++, value: currentVal || null, depth, groupCount, children: [], path: fullPath,
        });
      } else {
        const children = buildLevel(fullPath, depth + 1);
        const childTotal = children.reduce((s, c) => s + c.groupCount, 0);
        levelNodes.push({
          id: nextId++, value: currentVal || null, depth, groupCount: childTotal, children, path: fullPath,
        });
      }
    }
    levelNodes.sort((a, b) => b.groupCount - a.groupCount);
    return levelNodes;
  }
  return buildLevel('', 0);
}

function buildDetailIndex(groupByCols: string[], columns: string[], allRows: unknown[][]): Map<string, number[]> {
  const groupColIndices = groupByCols.map((c) => columns.indexOf(c));
  const index = new Map<string, number[]>();
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const pathParts = groupColIndices.map((idx) => String(row[idx] ?? ''));
    for (let depth = 0; depth < groupByCols.length; depth++) {
      const key = pathParts.slice(0, depth + 1).join(PATH_SEP);
      let arr = index.get(key);
      if (!arr) { arr = []; index.set(key, arr); }
      arr.push(i);
    }
  }
  return index;
}

type VirtualRow =
  | { type: 'group'; nodeId: number; depth: number }
  | { type: 'detail'; nodeId: number; depth: number; rowIndex: number }
  | { type: 'flat'; rowIndex: number };

const ROW_HEIGHTS = {
  group: 36,
  detail: 30,
  flat: 36,
} as const;

function flattenTree(
  nodes: TreeNode[],
  expandedPaths: Set<number>,
  detailExpandedPaths: Set<number>,
  detailIndex: Map<string, number[]>,
  depth: number,
): VirtualRow[] {
  const rows: VirtualRow[] = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    rows.push({ type: 'group', nodeId: node.id, depth });

    if (hasChildren && expandedPaths.has(node.id)) {
      rows.push(...flattenTree(node.children, expandedPaths, detailExpandedPaths, detailIndex, depth + 1));
    } else if (!hasChildren && detailExpandedPaths.has(node.id)) {
      const indices = detailIndex.get(node.path);
      const count = indices ? indices.length : 0;
      for (let i = 0; i < count; i++) {
        rows.push({ type: 'detail', nodeId: node.id, depth, rowIndex: i });
      }
    }
  }
  return rows;
}

function detailColumns(columns: string[]): string[] {
  return columns.filter((c) => !GRP_COUNT_RE.test(c));
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-200/40 dark:border-white/[0.04]">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-zinc-200/60 dark:bg-zinc-700/40 animate-pulse" style={{ width: `${60 + (i * 17 % 30)}px` }} />
      ))}
    </div>
  );
}

// DuckDB SQL dialect hints for autocomplete
const DUCKDB_TABLES = ['events', 'tps_flat', 'energy_flat', 'messages_flat'];
const DUCKDB_COLUMNS: Record<string, string[]> = {
  events: ['session_id', 'id', 'parent_id', 'timestamp', 'type', 'provider', 'model_id',
    'tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_write', 'tokens_total',
    'ttft_ms', 'total_ms', 'generation_ms', 'stream_ms', 'stall_ms', 'stall_count', 'tps',
    'cost_input', 'cost_output', 'cost_cache_read', 'cost_cache_write', 'cost_total',
    'energy_joules', 'energy_cost_usd', 'rewind_v', 'from_id', 'summary',
    'message_role', 'message_content', 'message_model'],
  tps_flat: ['session_id', 'id', 'parent_id', 'timestamp', 'provider', 'model_id',
    'tokens_input', 'tokens_output', 'tokens_cache_read', 'tokens_cache_write', 'tokens_total',
    'ttft_ms', 'total_ms', 'generation_ms', 'stream_ms', 'stall_ms', 'stall_count', 'tps',
    'cost_input', 'cost_output', 'cost_cache_read', 'cost_cache_write', 'cost_total'],
  energy_flat: ['session_id', 'id', 'parent_id', 'timestamp', 'energy_joules', 'energy_cost_usd'],
  messages_flat: ['session_id', 'id', 'parent_id', 'timestamp', 'message_role', 'message_content', 'message_model'],
};

const duckdbDialect = SQLDialect.define({
  keywords: 'select from where group by order having limit offset as and or not in is null like between exists case when then else end insert into values create table view drop if alter set join on left right inner outer cross union all distinct asc desc over partition window function cast coalesce nullif true false with recursive using natural full fetch next rows range unbounded preceding following current row exclude',
  types: 'varchar bigint double int boolean float date timestamp',
  builtin: 'count sum avg min max round abs ceil floor row_number rank dense_rank lag lead first_value last_value list unnest struct_extract array_agg string_agg concat coalesce nullif cast try_cast date_trunc now extract interval generate_series read_csv read_parquet count_if',
});

// CodeMirror themes — light and dark, matching the app
const cmLightTheme = EditorView.theme({
  '&': { fontSize: '12px', fontFamily: "'Geist Mono', 'JetBrains Mono', monospace" },
  '.cm-content': { padding: '12px 16px', caretColor: '#0891b2' },
  '.cm-focused': { outline: 'none' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#a1a1aa', paddingRight: '4px' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(8, 145, 178, 0.05)', color: '#71717a' },
  '.cm-activeLine': { backgroundColor: 'rgba(8, 145, 178, 0.04)' },
  '.cm-selectionBackground': { backgroundColor: 'rgba(8, 145, 178, 0.15) !important' },
  '.cm-cursor': { borderLeftColor: '#0891b2', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(8, 145, 178, 0.2)', outline: '1px solid rgba(8, 145, 178, 0.4)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(8, 145, 178, 0.2) !important' },
});

const cmDarkTheme = EditorView.theme({
  '&': { fontSize: '12px', fontFamily: "'Geist Mono', 'JetBrains Mono', monospace", color: '#d4d4d8', backgroundColor: 'transparent' },
  '.cm-content': { padding: '12px 16px', caretColor: '#06b6d4' },
  '.cm-focused': { outline: 'none' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#52525b', paddingRight: '4px' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(6, 182, 212, 0.05)', color: '#71717a' },
  '.cm-activeLine': { backgroundColor: 'rgba(6, 182, 212, 0.04)' },
  '.cm-selectionBackground': { backgroundColor: 'rgba(6, 182, 212, 0.15) !important' },
  '.cm-cursor': { borderLeftColor: '#06b6d4', borderLeftWidth: '2px' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(6, 182, 212, 0.2)', outline: '1px solid rgba(6, 182, 212, 0.4)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(6, 182, 212, 0.2) !important' },
}, { dark: true });

// Custom highlight styles that match the app's cyan/teal + zinc palette
const cmLightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#0e7490', fontWeight: '600' },
  { tag: tags.controlKeyword, color: '#0e7490', fontWeight: '600' },
  { tag: tags.definitionKeyword, color: '#0e7490', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#0e7490', fontWeight: '600' },
  { tag: tags.moduleKeyword, color: '#0e7490', fontWeight: '600' },
  { tag: tags.string, color: '#b45309' },
  { tag: tags.docString, color: '#b45309' },
  { tag: tags.character, color: '#b45309' },
  { tag: tags.number, color: '#9333ea' },
  { tag: tags.integer, color: '#9333ea' },
  { tag: tags.float, color: '#9333ea' },
  { tag: tags.bool, color: '#0e7490', fontStyle: 'italic' },
  { tag: tags.null, color: '#0e7490', fontStyle: 'italic' },
  { tag: tags.atom, color: '#0e7490', fontStyle: 'italic' },
  { tag: tags.typeName, color: '#15803d' },
  { tag: tags.variableName, color: '#09090b' },
  { tag: tags.propertyName, color: '#7c3aed' },
  { tag: tags.function(tags.variableName), color: '#0e7490' },
  { tag: tags.labelName, color: '#7c3aed' },
  { tag: tags.operator, color: '#52525b' },
  { tag: tags.arithmeticOperator, color: '#52525b' },
  { tag: tags.compareOperator, color: '#52525b' },
  { tag: tags.logicOperator, color: '#0e7490' },
  { tag: tags.punctuation, color: '#a1a1aa' },
  { tag: tags.bracket, color: '#a1a1aa' },
  { tag: tags.separator, color: '#a1a1aa' },
  { tag: tags.comment, color: '#a1a1aa', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#a1a1aa', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#a1a1aa', fontStyle: 'italic' },
  { tag: tags.special(tags.string), color: '#0e7490' },
  { tag: tags.escape, color: '#0e7490' },
  { tag: tags.meta, color: '#71717a' },
  { tag: tags.invalid, color: '#dc2626' },
], { themeType: 'light' });

const cmDarkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#22d3ee', fontWeight: '600' },
  { tag: tags.controlKeyword, color: '#22d3ee', fontWeight: '600' },
  { tag: tags.definitionKeyword, color: '#22d3ee', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#22d3ee', fontWeight: '600' },
  { tag: tags.moduleKeyword, color: '#22d3ee', fontWeight: '600' },
  { tag: tags.string, color: '#fbbf24' },
  { tag: tags.docString, color: '#fbbf24' },
  { tag: tags.character, color: '#fbbf24' },
  { tag: tags.number, color: '#c084fc' },
  { tag: tags.integer, color: '#c084fc' },
  { tag: tags.float, color: '#c084fc' },
  { tag: tags.bool, color: '#22d3ee', fontStyle: 'italic' },
  { tag: tags.null, color: '#22d3ee', fontStyle: 'italic' },
  { tag: tags.atom, color: '#22d3ee', fontStyle: 'italic' },
  { tag: tags.typeName, color: '#4ade80' },
  { tag: tags.variableName, color: '#d4d4d8' },
  { tag: tags.propertyName, color: '#c084fc' },
  { tag: tags.function(tags.variableName), color: '#22d3ee' },
  { tag: tags.labelName, color: '#c084fc' },
  { tag: tags.operator, color: '#a1a1aa' },
  { tag: tags.arithmeticOperator, color: '#a1a1aa' },
  { tag: tags.compareOperator, color: '#a1a1aa' },
  { tag: tags.logicOperator, color: '#22d3ee' },
  { tag: tags.punctuation, color: '#71717a' },
  { tag: tags.bracket, color: '#71717a' },
  { tag: tags.separator, color: '#71717a' },
  { tag: tags.comment, color: '#52525b', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#52525b', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#52525b', fontStyle: 'italic' },
  { tag: tags.special(tags.string), color: '#22d3ee' },
  { tag: tags.escape, color: '#22d3ee' },
  { tag: tags.meta, color: '#71717a' },
  { tag: tags.invalid, color: '#f87171' },
], { themeType: 'dark' });

// Custom completion source that always suggests tables, columns, and SQL keywords.
// Using override because sqlLang's built-in source only offers table names after FROM/JOIN.
const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET',
  'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INSERT', 'INTO', 'VALUES', 'CREATE',
  'TABLE', 'VIEW', 'DROP', 'IF', 'ALTER', 'SET', 'JOIN', 'ON', 'LEFT', 'RIGHT',
  'INNER', 'OUTER', 'CROSS', 'UNION', 'ALL', 'DISTINCT', 'ASC', 'DESC', 'OVER',
  'PARTITION', 'WINDOW', 'FUNCTION', 'CAST', 'COALESCE', 'NULLIF', 'TRUE', 'FALSE',
  'WITH', 'RECURSIVE', 'USING', 'NATURAL', 'FULL', 'FETCH', 'NEXT', 'ROWS',
  'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'EXCLUDE',
];

const SQL_BUILTINS = [
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'CEIL', 'FLOOR',
  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
  'LIST', 'UNNEST', 'STRUCT_EXTRACT', 'ARRAY_AGG', 'STRING_AGG', 'CONCAT',
  'COALESCE', 'NULLIF', 'CAST', 'TRY_CAST', 'DATE_TRUNC', 'NOW', 'EXTRACT',
  'INTERVAL', 'GENERATE_SERIES', 'READ_CSV', 'READ_PARQUET', 'COUNT_IF',
];

const SQL_TYPES = [
  'VARCHAR', 'BIGINT', 'DOUBLE', 'INTEGER', 'BOOLEAN', 'FLOAT', 'DATE', 'TIMESTAMP',
];

function duckdbCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.]+/);
  const from = word ? word.from : context.pos;

  if (!word && !context.explicit) return null;

  const options: { label: string; type: string; detail?: string }[] = [];

  for (const kw of SQL_KEYWORDS) {
    options.push({ label: kw, type: 'keyword', detail: 'keyword' });
  }
  for (const fn of SQL_BUILTINS) {
    options.push({ label: fn, type: 'function', detail: 'function' });
  }
  for (const tp of SQL_TYPES) {
    options.push({ label: tp, type: 'type', detail: 'type' });
  }
  for (const table of DUCKDB_TABLES) {
    options.push({ label: table, type: 'class', detail: 'table' });
  }
  for (const [table, cols] of Object.entries(DUCKDB_COLUMNS)) {
    for (const col of cols) {
      options.push({ label: col, type: 'property', detail: table });
    }
  }

  return {
    from,
    options,
    filter: true,
  };
}

interface SqlPlaygroundProps {
  dbVersion: number;
  activeSessionId: string | null;
}

export default function SqlPlayground({ dbVersion, activeSessionId }: SqlPlaygroundProps) {
  const { theme } = useTheme();
  const [sql, setSql] = useState('');
  const [originalSql, setOriginalSql] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupByCols, setGroupByCols] = useState<string[]>([]);
  // Pending groupBy cols: updated immediately for the drag zone UI feedback,
  // but the tree/table rendering still uses the committed groupByCols
  // (which match the current result) until the pivot query result arrives.
  const [pendingGroupByCols, setPendingGroupByCols] = useState<string[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<number>>(new Set());
  const [detailExpandedPaths, setDetailExpandedPaths] = useState<Set<number>>(new Set());
  // Zone display cols: show pending (user just dragged) when available, else committed
  const zoneGroupByCols = pendingGroupByCols.length > 0 ? pendingGroupByCols : groupByCols;
  const [dragOverZone, setDragOverZone] = useState(false);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [lineCount, setLineCount] = useState(1);
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [editorContentHeight, setEditorContentHeight] = useState(0);

  const editorRef = useRef<HTMLDivElement>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [theadHeight, setTheadHeight] = useState(33);
  const themeCompartment = useRef(new Compartment());
  const completionCompartment = useRef(new Compartment());
  const runCallbackRef = useRef<() => void>(() => {});

  const ensureDb = useCallback(async () => {
    if (dbReady) return;
    const { getDuckDB } = await import('../lib/duckdb');
    await getDuckDB();
    setDbReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runQueryInternal = useCallback(
    async (querySql?: string, sessionFilter?: string | null) => {
      const sqlToRun = querySql ?? sql;
      if (!sqlToRun.trim()) return;
      setRunning(true);
      setError(null);
      try {
        await ensureDb();
        const c = await getSqlConn();
        // Wrap user query with a limit to avoid pulling millions of rows into the UI.
        // If the user already has LIMIT, the inner LIMIT applies first,
        // and the outer LIMIT is a no-op.
        let wrapped = sqlToRun.replace(/;+\s*$/, '');
        if (sessionFilter) {
          wrapped = `SELECT * FROM (${wrapped}) AS _q WHERE session_id = '${sessionFilter.replace(/'/g, "''")}'`;
        }
        const limitedSql = `SELECT * FROM (${wrapped}) AS _q LIMIT 50000`;
        const raw = await c.query(limitedSql);
        const columns = raw.schema.fields.map((f: { name: string }) => f.name);
        const rows: unknown[][] = [];
        for (const batch of raw.batches) {
          const colArrays = columns.map((name: string) => batch.getChild(name));
          for (let i = 0; i < batch.numRows; i++) {
            rows.push(colArrays.map((arr) => {
              const v = arr?.get(i);
              if (typeof v === 'bigint') return Number(v);
              return v ?? null;
            }));
          }
        }
        const r: QueryResult = { columns, rows, rowCount: rows.length };
        if (r.rowCount > 0 || columns.length > 0) {
          setResult(r);
          const detected = detectGroupByCols(sqlToRun, r.columns);
          setGroupByCols(detected);
          setEditorCollapsed(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Query failed');
      } finally {
        setRunning(false);
      }
    },
    [sql, ensureDb],
  );

  const handleRun = useCallback(() => {
    if (groupByCols.length === 0) {
      setOriginalSql(sql);
    }
    runQueryInternal(sql, activeSessionId);
  }, [sql, runQueryInternal, groupByCols, activeSessionId]);

  // Sync the stable run callback into a ref for use inside CodeMirror keymap
  useEffect(() => {
    runCallbackRef.current = handleRun;
  }, [handleRun]);

  // Re-run the current query when the underlying DB data changes (session add/remove)
  useEffect(() => {
    if (dbVersion > 0 && result && sql.trim()) {
      runQueryInternal(sql, activeSessionId);
    }
  // Only trigger on dbVersion changes, not on sql/result changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbVersion]);

  // Re-run the current query when the session selection changes
  useEffect(() => {
    if (result && sql.trim()) {
      runQueryInternal(sql, activeSessionId);
    }
  // Only trigger on activeSessionId changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const runPivotQuery = useCallback(
    async (cols: string[]) => {
      if (!originalSql.trim()) return;
      if (cols.length === 0) {
        setPendingGroupByCols([]);
        setSql(originalSql);
        if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: originalSql } });
        runQueryInternal(originalSql, activeSessionId);
        return;
      }
      const pivotSql = buildPivotSql(originalSql, cols);
      if (!pivotSql) return;
      setSql(pivotSql);
      if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: pivotSql } });
      setPendingGroupByCols(cols);
      runQueryInternal(pivotSql, activeSessionId);
      setExpandedPaths(new Set());
      setDetailExpandedPaths(new Set());
    },
    [originalSql, runQueryInternal, activeSessionId],
  );

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const isDark = theme === 'dark';
    const state = EditorState.create({
      doc: sql,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        sqlLang({ dialect: duckdbDialect, tables: DUCKDB_TABLES.map(t => ({ label: t, type: 'table', columns: DUCKDB_COLUMNS[t]?.map(c => ({ label: c, type: 'column' })) ?? [] })) }),
        completionCompartment.current.of(
          autocompletion({
            override: [duckdbCompletions],
            activateOnTyping: true,
            tooltipClass: () => 'cm-tps-autocomplete',
          }),
        ),
        themeCompartment.current.of(isDark ? cmDarkTheme : cmLightTheme),
        syntaxHighlighting(cmLightHighlight),
        syntaxHighlighting(cmDarkHighlight),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => { runCallbackRef.current(); return true; },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const doc = update.state.doc.toString();
            setSql(doc);
            setLineCount(update.state.doc.lines);
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // Only recreate on mount — theme changes are handled by compartments
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update CodeMirror theme when app theme changes
  useEffect(() => {
    if (!viewRef.current) return;
    const isDark = theme === 'dark';
    viewRef.current.dispatch({
      effects: [
        completionCompartment.current.reconfigure(
          autocompletion({
            override: [duckdbCompletions],
            activateOnTyping: true,
            tooltipClass: () => 'cm-tps-autocomplete',
          }),
        ),
        themeCompartment.current.reconfigure(isDark ? cmDarkTheme : cmLightTheme),
      ],
    });
  }, [theme]);

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setTheadHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [result]);

  useEffect(() => {
    const el = editorContentRef.current;
    if (!el) return;
    const update = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setEditorContentHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sql, result, lineCount, error, groupByCols, dragOverZone]);

  const handleHeaderDragStart = useCallback(
    (e: React.DragEvent, col: string) => {
      setDraggedCol(col);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', col);
    },
    [],
  );

  const handleHeaderDragEnd = useCallback(() => { setDraggedCol(null); }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverZone(false);
      const col = e.dataTransfer.getData('text/plain');
      if (!col || groupByCols.includes(col)) return;
      const newGroupBy = [...groupByCols, col];
      runPivotQuery(newGroupBy);
      setDraggedCol(null);
    },
    [groupByCols, runPivotQuery],
  );

  const removeGroupBy = useCallback(
    (col: string) => {
      const newGroupBy = groupByCols.filter((c) => c !== col);
      runPivotQuery(newGroupBy);
    },
    [groupByCols, runPivotQuery],
  );

  const toggleExpanded = useCallback((id: number) => {
    setExpandedPaths((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleDetailExpanded = useCallback((id: number) => {
    setDetailExpandedPaths((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const tree = useMemo(
    () => result && groupByCols.length > 0 && result.rows.length > 0 ? buildTree(result.rows, result.columns, groupByCols) : null,
    [result, groupByCols],
  );

  const isTrivialTree = useMemo(() => {
    if (!tree) return false;
    function checkLeaves(nodes: TreeNode[]): boolean {
      for (const n of nodes) {
        if (n.children.length > 0) { if (!checkLeaves(n.children)) return false; }
        else if (n.groupCount > 1) return false;
      }
      return true;
    }
    return checkLeaves(tree);
  }, [tree]);

  const displayColumns = useMemo(
    () => (result ? result.columns.filter((c) => !GRP_COUNT_RE.test(c)) : []),
    [result],
  );

  const detailIndex = useMemo(
    () => result && groupByCols.length > 0 ? buildDetailIndex(groupByCols, result.columns, result.rows) : new Map<string, number[]>(),
    [result, groupByCols],
  );

  const nodeMap = useMemo(() => {
    if (!tree) return new Map<number, TreeNode>();
    const map = new Map<number, TreeNode>();
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        if (n.children.length > 0) walk(n.children);
      }
    }
    walk(tree);
    return map;
  }, [tree]);

  const virtualRows = useMemo(() => {
    if (tree && tree.length > 0 && groupByCols.length > 0 && !isTrivialTree) {
      return flattenTree(tree, expandedPaths, detailExpandedPaths, detailIndex, 0);
    }
    if (result) {
      return result.rows.map((_, i): VirtualRow => ({ type: 'flat', rowIndex: i }));
    }
    return [] as VirtualRow[];
  }, [tree, groupByCols, isTrivialTree, expandedPaths, detailExpandedPaths, detailIndex, result]);

  const detailColsMemo = useMemo(() => result ? detailColumns(result.columns) : [], [result]);
  const detailColIndicesMemo = useMemo(() => detailColsMemo.map((c) => result ? result.columns.indexOf(c) : -1), [detailColsMemo, result]);
  const flatColIndices = useMemo(() => displayColumns.map((c) => result ? result.columns.indexOf(c) : -1), [displayColumns, result]);

   const scrollContainerRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (i) => {
      const row = virtualRows[i];
      if (!row) return 36;
      if (row.type === 'group') return ROW_HEIGHTS.group;
      return ROW_HEIGHTS[row.type];
    },
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 20,
  });

  // Compute pinned group overlay: deepest group ancestor scrolled above viewport
  // Only show the group whose children are currently visible in the viewport
  const _vi = rowVirtualizer.getVirtualItems();
  const _scrollOff = rowVirtualizer.scrollOffset ?? 0;
  let pinnedGroup: { nodeId: number; depth: number } | null = null;
  if (tree && tree.length > 0 && groupByCols.length > 0 && !isTrivialTree && _vi.length > 0) {
    // Find the first visible row that isn't a group — its parent group is the one to pin
    let firstVisibleChildIdx = -1;
    for (const vi of _vi) {
      const vRow = virtualRows[vi.index];
      if (!vRow) continue;
      if (vRow.type !== 'group') {
        firstVisibleChildIdx = vi.index;
        break;
      }
      // Group row is visible — pin it only if it's scrolled above
      if (vi.start + vi.size <= _scrollOff) {
        pinnedGroup = { nodeId: vRow.nodeId, depth: vRow.depth };
      } else {
        // Group is in view — no pin needed
        pinnedGroup = null;
        break;
      }
    }
    // If we found a child row, find its nearest group ancestor
    if (firstVisibleChildIdx >= 0 && !pinnedGroup) {
      for (let i = firstVisibleChildIdx - 1; i >= 0; i--) {
        const vRow = virtualRows[i];
        if (vRow && vRow.type === 'group') {
          pinnedGroup = { nodeId: vRow.nodeId, depth: vRow.depth };
          break;
        }
      }
    }
  }

  const handleDownloadCsv = useCallback(() => {
    if (!result) return;
    const cols = detailColsMemo;
    const header = cols.map(fmtHeader).join(',');
    const csvRows = result.rows.map((row) =>
      cols.map((col) => {
        const idx = result.columns.indexOf(col);
        const val = idx !== -1 ? row[idx] : null;
        const s = val === null || val === undefined ? '' : String(val);
        // Escape CSV: quote if contains comma, quote, or newline
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    );
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-result-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, detailColsMemo]);

  const clearAll = useCallback(() => {
    setSql('');
    setOriginalSql('');
    setResult(null);
    setError(null);
    setGroupByCols([]);
    setExpandedPaths(new Set());
    setDetailExpandedPaths(new Set());
    setLineCount(1);
    setEditorCollapsed(false);
    if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' } });
  }, []);

  const setEditorSql = useCallback((newSql: string) => {
    setSql(newSql);
    if (viewRef.current) viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: newSql } });
  }, []);

  const sqlPreview = useMemo(() => {
    if (!sql.trim()) return '';
    const condensed = sql.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    return condensed.length > 80 ? condensed.slice(0, 77) + '...' : condensed;
  }, [sql]);

  const expandEditor = useCallback(() => setEditorCollapsed(false), []);
  const collapseEditor = useCallback(() => setEditorCollapsed(true), []);

  const { colWidths, longTextCols } = useMemo(() => {
    if (!result) return { colWidths: [] as number[], longTextCols: new Set<string>() };
    // Build sampled rows directly to avoid O(N*cols) full copy
    const sampleSize = 500;
    const step = result.rows.length <= sampleSize ? 1 : Math.ceil(result.rows.length / sampleSize);
    // Precompute column indices once instead of N×C indexOf calls
    const colIndices = displayColumns.map((c) => result.columns.indexOf(c));
    const sampled: unknown[][] = [];
    for (let i = 0; i < result.rows.length; i += step) {
      const row = result.rows[i];
      sampled.push(colIndices.map((idx) => (idx !== -1 ? row[idx] : null)));
    }
    const lt = detectLongTextCols(displayColumns, sampled);
    const widths = measureColWidths(displayColumns, sampled, lt);
    // Widen first column for tree node rows: indent + caret + text
    if (tree && tree.length > 0 && groupByCols.length > 0 && !isTrivialTree && widths.length > 0) {
      let maxNodeRowW = 0;
      function measureNodes(nodes: TreeNode[], depth: number) {
        for (const n of nodes) {
          const indent = depth * 16;
          const textLen = (n.value === null ? 4 : String(n.value).length); // 4 = "NULL"
          const textW = textLen * 7 + 4;
          // indent + px-3(12) + caret(16) + gap(8) + text + right-padding(12)
          maxNodeRowW = Math.max(maxNodeRowW, indent + 48 + textW);
          if (n.children.length > 0) measureNodes(n.children, depth + 1);
        }
      }
      measureNodes(tree, 0);
      widths[0] = Math.max(widths[0], maxNodeRowW);
    }
    return { colWidths: widths, longTextCols: lt };
  }, [result, displayColumns, tree, groupByCols, isTrivialTree]);

  return (
    <div className="bg-white/80 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-white/[0.06] rounded-2xl overflow-hidden flex flex-col min-h-0 h-full">
      {/* Header — title + collapsed query + collapse toggle */}
      <div
        onClick={() => editorCollapsed ? expandEditor() : (result ? collapseEditor() : undefined)}
        className={`flex items-center gap-2 px-4 py-3 border-b border-zinc-200/60 dark:border-white/[0.06] shrink-0 transition-colors duration-150 ${result ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.04]' : ''}`}
      >
        <Database size={16} className="text-accent shrink-0" weight="bold" />
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-300 shrink-0">SQL Playground</h2>
        <span className="text-[10px] metric-mono text-zinc-400 dark:text-zinc-500 shrink-0">DuckDB WASM · in-browser</span>
        {editorCollapsed && sqlPreview && (
          <>
            <span className="text-zinc-300 dark:text-zinc-600 shrink-0">·</span>
            <code className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate min-w-0">{sqlPreview}</code>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {editorCollapsed && (
            <button
              onClick={expandEditor}
              className="p-1 rounded-md transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Expand editor"
            >
              <CaretDown size={14} />
            </button>
          )}
          {!editorCollapsed && result && (
            <button
              onClick={collapseEditor}
              className="p-1 rounded-md transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              title="Collapse editor"
            >
              <CaretDown size={14} className="rotate-180" />
            </button>
          )}
        </div>
      </div>

      {/* Editor area — height-animated to preserve CodeMirror */}
      <motion.div
        initial={false}
        animate={editorCollapsed ? { height: 0, opacity: 0 } : { height: editorContentHeight, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden shrink-0"
      >
      <div ref={editorContentRef} className="px-4 pt-3 space-y-2">
        {/* SQL editor */}
        <div className="relative rounded-2xl border border-zinc-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-zinc-800/40 overflow-hidden transition-colors focus-within:border-accent/40 dark:focus-within:border-accent/40">
          <div ref={editorRef} className="min-h-[120px] max-h-[280px] overflow-auto" />
          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100 dark:border-white/[0.04]">
            <span className="text-[10px] metric-mono text-zinc-400 dark:text-zinc-500">
              {lineCount}L
            </span>
            <div className="flex items-center gap-1.5">
              {sql.trim() && !result && (
                <button
                  onClick={clearAll}
                  className="p-1.5 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.06] active:scale-[0.97] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  title="Clear"
                >
                  <X size={12} />
                </button>
              )}
              <button
                onClick={() => runCallbackRef.current()}
                disabled={running || !sql.trim()}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all duration-200 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed bg-accent text-white hover:bg-accent/90"
              >
                {running ? (
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                ) : (
                  <Play size={12} weight="fill" />
                )}
                Run
              </button>
              <span className="text-[10px] metric-mono text-zinc-400 dark:text-zinc-500 ml-1">⌘↵</span>
            </div>
          </div>
        </div>

        {/* Example pills */}
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_QUERIES.map((eq) => (
            <button
              key={eq.label}
              onClick={() => {
                setEditorSql(eq.sql);
                setOriginalSql(eq.sql);
                setGroupByCols([]);
                setExpandedPaths(new Set());
                setDetailExpandedPaths(new Set());
                setError(null);
                runQueryInternal(eq.sql, activeSessionId);
              }}
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg border border-zinc-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400 hover:border-accent/30 hover:text-accent dark:hover:border-accent/40 dark:hover:text-accent-light transition-all duration-200 active:scale-[0.97]"
            >
              {eq.label}
            </button>
          ))}
        </div>

        {/* Group-by drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!dragOverZone) setDragOverZone(true); }}
          onDragLeave={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
              setDragOverZone(false);
          }}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed h-[36px] overflow-hidden transition-all duration-200 ${dragOverZone ? 'scale-[1.005]' : ''} ${
            zoneGroupByCols.length > 0 || dragOverZone
              ? 'border-accent/40 bg-accent/5 dark:bg-accent/10'
              : 'border-zinc-200/60 dark:border-white/[0.06] bg-white/40 dark:bg-zinc-800/20'
          }`}
        >
          <div className="flex items-center gap-2 px-3 h-full">
            <DotsSixVertical size={12} className={zoneGroupByCols.length > 0 ? 'text-accent/60' : 'text-zinc-400 dark:text-zinc-500 opacity-40'} />
            {zoneGroupByCols.length > 0 ? (
              <>
                <span className="text-[10px] font-medium shrink-0 text-accent">Grouped by</span>
                <AnimatePresence>
                  {zoneGroupByCols.map((col) => (
                    <motion.span
                      key={col}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-accent/30 bg-accent/10 text-accent font-mono"
                    >
                      {fmtHeader(col)}
                      <button onClick={() => removeGroupBy(col)} className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity">
                        <X size={10} />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
              </>
            ) : (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                {result ? 'Drag column headers here to group and aggregate' : 'Run a query, then drag column headers into this zone to group'}
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-xl border border-red-200/40 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5"
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-red-500/10">
                <X size={12} weight="bold" className="text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium mb-0.5 text-red-600 dark:text-red-400">Query Error</p>
                <pre className="text-[11px] whitespace-pre-wrap break-all font-mono text-zinc-600 dark:text-zinc-300">{error}</pre>
              </div>
            </div>
          </motion.div>
        )}
      </div>
      </motion.div>

      {/* Group-by zone — always visible when editor is collapsed */}
      {editorCollapsed && result && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!dragOverZone) setDragOverZone(true); }}
          onDragLeave={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)
              setDragOverZone(false);
          }}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed mx-4 mt-2 mb-2 h-[36px] overflow-hidden transition-all duration-200 ${dragOverZone ? 'scale-[1.005]' : ''} ${
            zoneGroupByCols.length > 0 || dragOverZone
              ? 'border-accent/40 bg-accent/5 dark:bg-accent/10'
              : 'border-zinc-200/60 dark:border-white/[0.06] bg-white/40 dark:bg-zinc-800/20'
          }`}
        >
          <div className="flex items-center gap-2 px-3 h-full">
            <DotsSixVertical size={12} className={zoneGroupByCols.length > 0 ? 'text-accent/60' : 'text-zinc-400 dark:text-zinc-500 opacity-40'} />
            {zoneGroupByCols.length > 0 ? (
              <>
                <span className="text-[10px] font-medium shrink-0 text-accent">Grouped by</span>
                {zoneGroupByCols.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-accent/30 bg-accent/10 text-accent font-mono"
                  >
                    {fmtHeader(col)}
                    <button onClick={() => removeGroupBy(col)} className="rounded p-0.5 opacity-50 hover:opacity-100 transition-opacity">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </>
            ) : (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                Drag column headers here to group and aggregate
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {running && !result && (
        <div className="m-4 rounded-2xl overflow-hidden border border-zinc-200/60 dark:border-white/[0.06] flex-1 min-h-0">
          <div className="px-3 py-2 border-b border-zinc-200/40 dark:border-white/[0.04] bg-white dark:bg-zinc-800">
            <div className="h-3 w-32 rounded bg-zinc-200/60 dark:bg-zinc-700/40 animate-pulse" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={4} />)}
        </div>
      )}

      {/* Empty */}
      {!result && !running && !error && !editorCollapsed && (
        <div className="m-4 rounded-2xl border border-zinc-200/60 dark:border-white/[0.06] p-10 flex-1 min-h-0 flex flex-col items-center justify-center bg-white/40 dark:bg-zinc-800/20">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-zinc-100 dark:bg-white/[0.04]">
              <Table size={20} className="text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm font-medium mb-0.5 text-zinc-600 dark:text-zinc-300">No data yet</p>
            <p className="text-xs max-w-sm text-zinc-400 dark:text-zinc-500">
              Write a SQL query and hit run, or pick an example query to explore your telemetry data with DuckDB.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={'relative mx-4 mb-4 ' + (editorCollapsed ? 'mt-0 ' : 'mt-2 ') + 'rounded-2xl border border-zinc-200/60 dark:border-white/[0.06] flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-800 overflow-hidden'}
        >
          <div ref={scrollContainerRef} className="overflow-auto flex-1 min-h-0 max-h-full custom-scrollbar" style={{ overscrollBehavior: 'none' }}>
            <table className="text-left" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {displayColumns.map((col, j) => {
                  const w = colWidths[j];
                  return <col key={col} style={{ width: w + 'px', minWidth: w + 'px' }} />;
                })}
              </colgroup>
              <thead ref={theadRef} className="sticky top-0 z-30 bg-white dark:bg-zinc-800">
                <tr className="border-b border-zinc-200/60 dark:border-white/[0.06]">
                  {displayColumns.map((col) => (
                    <th
                      key={col}
                      draggable
                      onDragStart={(e) => handleHeaderDragStart(e, col)}
                      onDragEnd={handleHeaderDragEnd}
                      className={'px-3 py-2 text-[10px] font-medium tracking-wider cursor-grab active:cursor-grabbing select-none transition-colors hover:text-accent whitespace-nowrap' + (draggedCol === col ? ' text-accent' : ' text-zinc-400 dark:text-zinc-500')}
                    >
                      <span className="truncate">{fmtHeader(col)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const virtualItems = rowVirtualizer.getVirtualItems();
                  if (virtualItems.length === 0) return null;
                  const firstOffset = virtualItems[0].start;
                  const lastItem = virtualItems[virtualItems.length - 1];
                  const bottomPad = rowVirtualizer.getTotalSize() - (lastItem.start + lastItem.size);


                  return (
                    <>
                      {firstOffset > 0 && (
                        <tr><td colSpan={displayColumns.length} style={{ height: firstOffset, padding: 0, border: 'none' }} /></tr>
                      )}
                      {virtualItems.map((virtualItem) => {
                        const vRow = virtualRows[virtualItem.index];
                        if (!vRow) return null;

                        if (vRow.type === 'group') {
                          const node = nodeMap.get(vRow.nodeId);
                          if (!node) return null;
                          const hasChildren = node.children.length > 0;
                          const isExpanded = expandedPaths.has(node.id) || detailExpandedPaths.has(node.id);
                          return (
                            <tr
                              key={virtualItem.key}
                              data-index={virtualItem.index}
                              className="group/row cursor-pointer transition-colors duration-150 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-[#28282d] border-b border-zinc-200/40 dark:border-white/[0.04]"
                              onClick={() => {
                                if (hasChildren) toggleExpanded(node.id);
                                else toggleDetailExpanded(node.id);
                              }}
                            >
                              <td className="py-2 px-3 transition-colors duration-150 group-hover/row:bg-zinc-50 dark:group-hover/row:bg-[#28282d]">
                                <div className="flex items-center gap-2" style={{ paddingLeft: (vRow.depth * 16) + 'px' }}>
                                  <div className="shrink-0 flex items-center justify-center w-4">
                                    <div className={'transition-transform duration-200' + (isExpanded ? ' rotate-90' : '')}>
                                      <CaretRight size={12} className="text-zinc-400 dark:text-zinc-500" />
                                    </div>
                                  </div>
                                  <div className="text-xs font-medium truncate text-zinc-600 dark:text-zinc-300 min-w-0">
                                    {node.value === null ? (
                                      <span className="italic text-zinc-400 dark:text-zinc-500">NULL</span>
                                    ) : (
                                      String(node.value)
                                    )}
                                  </div>
                                </div>
                              </td>
                              {displayColumns.slice(1).map((_, i) => (
                                <td key={i} className="py-2 border-b border-zinc-200/40 dark:border-white/[0.04] transition-colors duration-150 group-hover/row:bg-zinc-50 dark:group-hover/row:bg-[#28282d]" />
                              ))}
                            </tr>
                          );
                        }

                        if (vRow.type === 'detail') {
                          const node = nodeMap.get(vRow.nodeId);
                          if (!node) return null;
                          const indices = detailIndex.get(node.path);
                          const globalIdx = indices?.[vRow.rowIndex];
                          if (globalIdx === undefined) return null;
                          const dataRow = result.rows[globalIdx];
                          if (!dataRow) return null;
                          return (
                            <tr
                              key={virtualItem.key}
                              data-index={virtualItem.index}
                              ref={rowVirtualizer.measureElement}
                              className="group/row border-b border-zinc-200/40 dark:border-white/[0.04] transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-[#28282d]"
                            >
                              {detailColIndicesMemo.map((colIdx, j) => {
                                const val = colIdx !== -1 ? dataRow[colIdx] : null;
                                const colName = detailColsMemo[j];
                                const isNum = typeof val === 'number';
                                const isFirst = j === 0;
                                const longText = longTextCols.has(colName);
                                return (
                                  <td
                                    key={j}
                                    className={'py-1.5 px-3 text-[11px] align-top' + (longText ? ' whitespace-pre-wrap break-words leading-relaxed' : ' whitespace-nowrap') + (isNum ? ' metric-mono tabular-nums' : '') + (isFirst ? ' transition-colors duration-150 group-hover/row:bg-zinc-50 dark:group-hover/row:bg-[#28282d]' : '')}
                                  >
                                    <div className={longText ? '' : 'flex items-center truncate'}>
                                      {isFirst && <span style={{ display: 'inline-block', width: ((vRow.depth + 1) * 16 + 28) + 'px', flexShrink: 0 }} />}
                                      {val === null || val === undefined ? (
                                        <span className="italic text-zinc-400 dark:text-zinc-500">NULL</span>
                                      ) : longText && typeof val === 'string' ? (
                                        <MarkdownSpan text={val} />
                                      ) : (
                                        <span className={isNum ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-300'}>
                                          {fmtCell(val, colName)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        }

                        if (vRow.type === 'flat') {
                          const dataRow = result.rows[vRow.rowIndex];
                          if (!dataRow) return null;
                          return (
                            <tr
                              key={virtualItem.key}
                              data-index={virtualItem.index}
                              ref={rowVirtualizer.measureElement}
                              className="group/row border-b border-zinc-200/40 dark:border-white/[0.04] transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-[#28282d]"
                            >
                              {flatColIndices.map((colIdx, j) => {
                                const val = colIdx !== -1 ? dataRow[colIdx] : null;
                                const col = displayColumns[j];
                                const isNum = typeof val === 'number';
                                const longText = longTextCols.has(col);
                                return (
                                  <td
                                    key={j}
                                    className={'py-2 px-3 text-xs align-top' + (longText ? ' whitespace-pre-wrap break-words leading-relaxed' : ' whitespace-nowrap') + (isNum ? ' metric-mono tabular-nums' : '') + (j === 0 ? ' transition-colors duration-150 group-hover/row:bg-zinc-50 dark:group-hover/row:bg-[#28282d]' : '')}
                                  >
                                    <div className={longText ? '' : 'truncate max-w-[240px]'}>
                                      {val === null || val === undefined ? (
                                        <span className="italic text-[10px] text-zinc-400 dark:text-zinc-500">NULL</span>
                                      ) : longText && typeof val === 'string' ? (
                                        <MarkdownSpan text={val} />
                                      ) : (
                                        <span className={isNum ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-300'}>
                                          {fmtCell(val, col)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        }

                        return null;
                      })}
                      {bottomPad > 0 && (
                        <tr><td colSpan={displayColumns.length} style={{ height: bottomPad, padding: 0, border: 'none' }} /></tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>

          {/* Pinned group overlay */}
          <AnimatePresence>
            {pinnedGroup && (() => {
              const node = nodeMap.get(pinnedGroup.nodeId);
              if (!node) return null;
              const hasChildren = node.children.length > 0;
              const isExpanded = expandedPaths.has(node.id) || detailExpandedPaths.has(node.id);
              // Build breadcrumb: path of ancestor group values from root to pinned node
              const pathParts = node.path.split(PATH_SEP);
              const breadcrumbs = pathParts.map((val: string, i: number) => ({
                value: val || null,
                depth: i,
              }));
              return (
                <motion.div
                  key={pinnedGroup.nodeId}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute left-0 right-0 z-20 cursor-pointer bg-white/95 dark:bg-zinc-800/95 backdrop-blur-sm border-t border-zinc-200/60 dark:border-white/[0.06] border-b border-zinc-200/60 dark:border-white/[0.06] shadow-sm shadow-zinc-200/40 dark:shadow-black/20"
                  style={{ top: theadHeight - 1 }}
                  onClick={() => {
                    if (hasChildren) toggleExpanded(node.id);
                    else toggleDetailExpanded(node.id);
                  }}
                >
                  <div className="flex items-center gap-2 px-3 py-2" style={{ paddingLeft: (pinnedGroup.depth * 16 + 13) + 'px' }}>
                    <div className="shrink-0 flex items-center justify-center w-4">
                      <div className={'transition-transform duration-200' + (isExpanded ? ' rotate-90' : '')}>
                        <CaretRight size={12} className="text-zinc-400 dark:text-zinc-500" />
                      </div>
                    </div>
                    {breadcrumbs.length > 1 ? (
                      <div className="flex items-center gap-1 min-w-0 text-xs font-medium truncate">
                        {breadcrumbs.map((crumb, i) => (
                          <span key={i} className="contents">
                            {i > 0 && <CaretRight size={8} className="text-zinc-300 dark:text-zinc-600 shrink-0" />}
                            <span
                              className={i === breadcrumbs.length - 1
                                ? 'text-zinc-600 dark:text-zinc-300'
                                : 'text-zinc-400 dark:text-zinc-500'
                              }
                            >
                              {crumb.value === null
                                ? <span className="italic text-zinc-400 dark:text-zinc-500">NULL</span>
                                : String(crumb.value)
                              }
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs font-medium truncate text-zinc-600 dark:text-zinc-300 min-w-0">
                        {node.value === null ? (
                          <span className="italic text-zinc-400 dark:text-zinc-500">NULL</span>
                        ) : (
                          String(node.value)
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Footer */}
          <div className="border-t border-zinc-200/60 dark:border-white/[0.06] px-4 py-2 bg-white dark:bg-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tabular-nums flex items-center gap-1.5 metric-mono text-zinc-400 dark:text-zinc-500">
                {running && <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                {result.rowCount.toLocaleString()} rows
                {tree && tree.length > 0 && groupByCols.length > 0 && !isTrivialTree ? (' \u00B7 ' + groupByCols.length + ' level' + (groupByCols.length > 1 ? 's' : '')) : ''}
              </span>
              <button
                onClick={handleDownloadCsv}
                className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-accent hover:bg-accent/5 dark:hover:bg-accent/10 transition-colors flex items-center gap-1"
                title="Download current result as CSV"
              >
                <DownloadSimple size={10} weight="bold" />
                CSV
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
