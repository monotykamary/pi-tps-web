import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// es-toolkit's "exports" maps ./compat/* to CJS .js files without an "import"
// condition.  Rolldown's CJS→ESM interop + minifier can produce broken output on
// some platforms where namespace-qualified require calls are hoisted into
// self-shadowing var declarations (e.g. `var t = t()`).  Redirect compat
// subpath imports to the ESM .mjs sources instead, preserving the default-export
// shape that recharts expects (import X from 'es-toolkit/compat/X').
function esToolkitCompatEsmResolve(): Plugin {
  const compatRe = /^es-toolkit\/compat\/(.+)$/
  const root = resolve('node_modules/es-toolkit/dist/compat')
  const virtualPrefix = '\0es-toolkit-compat-esm:'

  function findMjs(dir: string, name: string): string | null {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        const hit = findMjs(full, name)
        if (hit) return hit
      } else if (entry.name === `${name}.mjs`) {
        return full
      }
    }
    return null
  }

  return {
    name: 'es-toolkit-compat-esm-resolve',
    enforce: 'pre',
    resolveId: {
      handler(source: string) {
        const m = compatRe.exec(source)
        if (!m) return null
        const hit = findMjs(root, m[1])
        if (hit && existsSync(hit)) return virtualPrefix + m[1]
        return null
      },
    },
    load: {
      handler(id: string) {
        if (!id.startsWith(virtualPrefix)) return null
        const name = id.slice(virtualPrefix.length)
        const mjsPath = findMjs(root, name)
        if (!mjsPath) return null
        // Recharts does `import get from 'es-toolkit/compat/get'` (default import).
        // The .mjs files only have named exports, so we re-export both named and
        // default to match the CJS shape.
        return `export { ${name}, ${name} as default } from '${mjsPath}';\n`
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), esToolkitCompatEsmResolve()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  worker: {
    format: 'es',
  },
})
