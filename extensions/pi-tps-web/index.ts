/**
 * pi-tps-web — Web Telemetry Inspector for pi
 *
 * Registers /tps-web command that exports telemetry JSONL
 * (keeping the folder-opening logic from pi-tps's /tps-export),
 * starts a local HTTP server serving the built web inspector,
 * and opens it in the browser.
 *
 * Designed to work alongside pi-tps — both extensions can be loaded
 * simultaneously. pi-tps provides TPS tracking and notifications;
 * pi-tps-web provides the visual web dashboard.
 */

import { execFile } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, extname, resolve, sep } from 'path';
import { createServer } from 'http';

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const DEFAULT_PORT = 3141;

// Resolve the dist/ directory relative to this extension file.
// jiti always provides __dirname — works for npm install, git install,
// pi -e, .pi/extensions, and global extensions.
const PKG_ROOT = join(__dirname, '..', '..');
const DIST_PATH = join(PKG_ROOT, 'dist');

/**
 * Ensure the built web app exists. For npm installs, dist/ is shipped
 * in the tarball. For git installs (where dist/ is .gitignored and
 * pi runs npm install --omit=dev), we attempt a full install + build.
 * The build persists in the git clone directory so this only runs once.
 *
 * Returns true if dist/ is available (pre-built or after auto-build).
 */
async function ensureDist(): Promise<boolean> {
  if (existsSync(join(DIST_PATH, 'index.html'))) return true;

  // Auto-build: need dev deps (vite, typescript, etc.) which
  // --omit=dev skips. Full install + build in the package root.
  const run = (cmd: string, args: string[]): Promise<void> =>
    new Promise((res, rej) => {
      execFile(cmd, args, { cwd: PKG_ROOT, timeout: 180_000 }, (err) =>
        err ? rej(err) : res(),
      );
    });

  try {
    await run('npm', ['install']);
    await run('npx', ['vite', 'build']);
  } catch {
    return false;
  }

  return existsSync(join(DIST_PATH, 'index.html'));
}

function isPathSafe(requestPath: string, root: string): boolean {
  const resolved = resolve(root, requestPath);
  return resolved.startsWith(root + sep) || resolved === root;
}

function serveStatic(
  root: string,
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
): void {
  const urlPath = req.url?.split('?')[0] || '/';
  // Strip leading slash so resolve() treats this as relative to root,
  // not as an absolute path that replaces the base.
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');

  if (!isPathSafe(relativePath, root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const filePath = join(root, relativePath);

  // SPA fallback: if file doesn't exist or is a directory, serve index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const fallback = join(root, 'index.html');
    if (existsSync(fallback)) {
      const content = readFileSync(fallback);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES['.html'],
        'Cache-Control': 'no-cache',
      });
      res.end(content);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end('Internal server error');
  }
}

export default function tpsWebExtension(pi: ExtensionAPI) {
  let server: ReturnType<typeof createServer> | null = null;
  let serverPort = DEFAULT_PORT;

  // In-memory telemetry data served via the API endpoint.
  // Updated on each /tps-web invocation.
  let telemetryJsonl: string | null = null;
  let telemetryVersion = 0;

  // Connected SSE clients for real-time push notifications.
  const sseClients = new Set<import('http').ServerResponse>();

  function startServer(): Promise<number> {
    if (server) return Promise.resolve(serverPort);

    return new Promise((resolve, reject) => {
      const s = createServer((req, res) => {
        const urlPath = req.url?.split('?')[0] || '/';

        // API: return the current telemetry data as JSONL
        if (urlPath === '/api/telemetry') {
          const data = telemetryJsonl || '';
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(data);
          return;
        }

        // API: version counter for polling (web app checks this to detect data changes)
        if (urlPath === '/api/version') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ version: telemetryVersion }));
          return;
        }

        // API: Server-Sent Events stream for real-time push.
        // When /tps-web updates the telemetry, the server pushes
        // the new version to all connected clients immediately,
        // eliminating the 2s polling latency.
        if (urlPath === '/api/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive',
          });
          res.write('');
          sseClients.add(res);
          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        // Static files from dist/
        serveStatic(DIST_PATH, req, res);
      });

      s.listen(serverPort, () => {
        server = s;
        resolve(serverPort);
      });

      s.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port taken — try next one
          serverPort++;
          startServer().then(resolve, reject);
        } else {
          reject(err);
        }
      });
    });
  }

  // Clean up server on session shutdown
  pi.on('session_shutdown', () => {
    // Close all SSE connections before shutting down the server
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
    if (server) {
      server.close();
      server = null;
    }
  });

  /**
   * Open a URL or path with the system's default handler.
   * Non-blocking — uses execFile instead of execSync.
   */
  function openInSystem(target: string): void {
    const [cmd, args] =
      process.platform === 'darwin'
        ? ['open', [target]]
        : ['xdg-open', [target]];
    execFile(cmd, args, (err) => {
      if (err) {
        // opener not available — ignore silently
      }
    });
  }

  pi.registerCommand('tps-web', {
    description:
      'Export telemetry and view in the pi-tps web inspector (--full for all branches)',
    getArgumentCompletions: (argumentPrefix: string) => {
      if ('--full'.startsWith(argumentPrefix)) {
        return [{ value: '--full', label: '--full (all branches, not just current)' }];
      }
      return [];
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      const full = tokens.includes('--full');

      // Snapshot the session data synchronously — this is fast (returns
      // references to in-memory objects). All heavy processing (filtering,
      // re-chaining, serializing, file I/O) is deferred to the background
      // so the handler returns immediately and the TUI stays responsive.
      const entries = full ? ctx.sessionManager.getEntries() : ctx.sessionManager.getBranch();
      const notify = ctx.ui.notify.bind(ctx.ui);

      if (entries.length === 0) {
        const scope = full ? 'all-entries' : 'current-branch';
        ctx.ui.notify(`No entries found in ${scope}`, 'warning');
        return;
      }

      // Everything below is fire-and-forget — the handler returns now.
      (async () => {
        const isStructural = (e: { type: string }) =>
          e.type === 'model_change' || e.type === 'branch_summary';

        const exportedEntries = entries.filter(
          (e: { type: string }) => isStructural(e) || e.type === 'custom',
        );

        if (exportedEntries.length === 0) {
          const scope = full ? 'all-entries' : 'current-branch';
          notify(`No matching entries found in ${scope}`, 'warning');
          return;
        }

        // Re-chain parentIds so the exported entries form a valid tree
        const byId = new Map(entries.map((e: { id: string }) => [e.id, e]));
        const exportedIds = new Set(exportedEntries.map((e: { id: string }) => e.id));

        const rechainParentId = (entry: { parentId: string | null }): string | null => {
          let current: string | null = entry.parentId;
          while (current) {
            if (exportedIds.has(current)) return current;
            const parent = byId.get(current) as { parentId?: string | null } | undefined;
            current = parent?.parentId ?? null;
          }
          return null;
        };

        const rechained = exportedEntries.map((e: { parentId: string | null }) => ({
          ...e,
          parentId: rechainParentId(e),
        }));

        const content = rechained.map((e: object) => JSON.stringify(e)).join('\n') + '\n';

        // Write JSONL file — keeping the folder opening logic from pi-tps
        const cacheBase = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
        const dir = join(cacheBase, 'pi-telemetry');
        mkdirSync(dir, { recursive: true });

        const sessionId = ctx.sessionManager.getSessionId?.() ?? 'unknown';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const scope = full ? 'full' : 'branch';
        const filename = `pi-telemetry-${scope}-${sessionId.slice(0, 8)}-${timestamp}.jsonl`;
        const filepath = join(dir, filename);
        writeFileSync(filepath, content);

        // Open the folder containing the exported JSONL
        openInSystem(dir);

        // Update in-memory data for the API endpoint
        telemetryJsonl = content;
        telemetryVersion++;

        // Push update to all connected SSE clients
        for (const client of sseClients) {
          client.write(`data: ${JSON.stringify({ version: telemetryVersion })}\n\n`);
        }

        const structuralCount = exportedEntries.filter((e: { type: string }) => isStructural(e)).length;
        const customCount = exportedEntries.length - structuralCount;
        const parts: string[] = [];
        if (customCount > 0) parts.push(`${customCount} telemetry`);
        if (structuralCount > 0) parts.push(`${structuralCount} structural`);
        const summary = parts.length > 0 ? parts.join(' + ') : `${exportedEntries.length} entries`;

        notify(`Exporting ${summary} + starting web inspector…`, 'info');

        // Build (if needed), start server, open browser
        if (!(await ensureDist())) {
          notify(
            `Web inspector not available: dist/ not built.\n` +
            `Run in the pi-tps-web package directory:\n` +
            `  npm install && npm run build\n` +
            `Then /reload and try again.`,
            'warning',
          );
          return;
        }

        try {
          if (!server) {
            serverPort = DEFAULT_PORT;
          }
          const port = await startServer();
          const url = `http://localhost:${port}?auto=1&v=${telemetryVersion}`;
          openInSystem(url);
          notify(`Exported ${summary} → ${filepath}\nWeb inspector: http://localhost:${port}`, 'info');
        } catch (err) {
          notify(`Failed to start web server: ${err}`, 'error');
        }
      })();
    },
  });
}
