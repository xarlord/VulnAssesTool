import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'node:path'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

// Copy sql.js WASM file to dist
function copySqlJsWasm() {
  const wasmSource = path.join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')
  const wasmDest = path.join(__dirname, 'dist/electron/sql-wasm.wasm')
  try {
    if (!existsSync(wasmSource)) {
      console.warn('sql.js WASM source not found')
      return
    }
    mkdirSync(path.dirname(wasmDest), { recursive: true })
    copyFileSync(wasmSource, wasmDest)
    console.log('Copied sql.js WASM to dist/electron')
  } catch (err) {
    console.warn('Could not copy sql.js WASM:', err)
  }
}

// Run the ESM to CJS conversion script
function runConversion() {
  try {
    execSync('node scripts/convert-to-cjs.cjs', { stdio: 'inherit', cwd: __dirname })
  } catch (err) {
    console.warn('ESM to CJS conversion failed:', err)
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Bundle analyzer - only runs when ANALYZE=true
    process.env.ANALYZE === 'true' &&
      visualizer({
        filename: 'docs/reports/bundle-analysis.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    react(),
    electron([
      {
        // Main process entry - build as CommonJS for Electron
        entry: 'electron/main.ts',
        async onstart({ startup }) {
          // Unset ELECTRON_RUN_AS_NODE which is set by VSCode/Claude Code
          // and prevents Electron from initializing its main process APIs
          const env = { ...process.env }
          delete env.ELECTRON_RUN_AS_NODE
          await startup(['.', '--no-sandbox'], { env })
        },
        vite: {
          build: {
            outDir: 'dist/electron',
            ssr: true,
            minify: false,
            rollupOptions: {
              external: ['electron', 'sql.js', 'node-cron', 'better-sqlite3'],
              output: {
                format: 'cjs',
                entryFileNames: 'main.cjs',
                inlineDynamicImports: true,
                exports: 'auto',
                interop: 'auto',
              },
            },
          },
          plugins: [
            {
              name: 'post-build',
              closeBundle: () => {
                copySqlJsWasm()
                runConversion()
              },
            },
          ],
        },
      },
      {
        // Preload script entry - must be CommonJS for Electron
        entry: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist/electron',
            minify: false,
            ssr: true,
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
                exports: 'auto',
              },
            },
          },
        },
      },
    ]),
  ],
  // Use relative paths for Electron app (file:// protocol support)
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@@': path.resolve(__dirname, './src/shared'),
      '@/lib': path.resolve(__dirname, './src/renderer/lib'),
      '@/components': path.resolve(__dirname, './src/renderer/components'),
      '@/pages': path.resolve(__dirname, './src/renderer/pages'),
      '@/store': path.resolve(__dirname, './src/renderer/store'),
      '@/styles': path.resolve(__dirname, './src/renderer/styles'),
    },
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: {
      // Proxy NVD API requests to avoid CORS in development
      '/api/nvd': {
        target: 'https://services.nvd.nist.gov',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/api\/nvd/, '/rest/json/cves/2.0'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      },
      // Proxy OSV API requests
      '/api/osv': {
        target: 'https://api.osv.dev',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/api\/osv/, '/v1'),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-cytoscape': ['cytoscape'],
          'vendor-recharts': ['recharts'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/tests/setup.ts'],
    exclude: ['**/e2e/**', '**/dist/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/renderer/tests/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/types/',
        '**/*.d.ts',
        'electron/',
        'src/main/',
        'dist/',
        '**/e2e/**',
      ],
      all: true,
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
