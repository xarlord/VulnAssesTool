/**
 * Bundle the CLI entry (cli/index.ts) into a single runnable dist/cli/index.js.
 *
 * esbuild is used rather than tsc because the CLI transitively imports the
 * renderer SBOM parsers, which reference the `@@/*` path alias that tsc does not
 * rewrite. esbuild resolves the alias, maps `.js` specifiers to their `.ts`
 * sources, tree-shakes the graph, and keeps the native `better-sqlite3` addon
 * external so it is required from node_modules at runtime.
 */

import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'))

await build({
  entryPoints: [path.join(root, 'cli/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: path.join(root, 'dist/cli/index.js'),
  // Native addon (and its optional runtime dep) cannot be bundled.
  external: ['better-sqlite3', 'bindings'],
  define: { VULNSHIELD_CLI_VERSION: JSON.stringify(pkg.version) },
  alias: {
    '@@': path.join(root, 'src/shared'),
    '@': path.join(root, 'src/renderer'),
  },
  // The entry (cli/index.ts) already carries a hashbang, which esbuild preserves.
  logLevel: 'info',
})

console.log('Built dist/cli/index.js')
