import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  test: {
    // Enable globals for Vitest
    globals: true,

    // Test environment
    environment: 'jsdom',

    // Setup files
    setupFiles: ['./tests/setup.ts'],

    // Include patterns for test files
    include: [
      'tests/**/*.{test,spec}.{js,ts,jsx,tsx}',
      'src/**/__tests__/**/*.{js,ts,jsx,tsx}',
      'src/renderer/lib/**/*.test.ts',
      'src/renderer/store/**/*.test.ts',
      'src/renderer/components/**/*.test.tsx',
      'src/renderer/tests/**/*.test.ts',
      'src/renderer/pages/**/*.test.tsx',
      'src/renderer/lib/platform/**/*.test.ts',
      'server/**/*.test.ts',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'build',
      'release',
      'e2e',
      'tests/bdd/features/**',
      'tests/bdd/step-definitions/**',
      'tests/bdd/support/**',
      'tests/integration/**/*.{test,spec}.{js,ts}', // Integration tests run separately
      'tests/perf/**', // NFR-01 perf suite runs separately (npm run test:perf) — see tests/perf/vitest.perf.config.ts
    ],

    // Slow test patterns for integration tests
    slowTestThreshold: 1000,

    // CI-only retry as a safety net for documented load-timing flakes (heavy
    // render + tight async waits under 2-core runners: Dashboard, dbSeeding,
    // nvdDb.perf). Not a mask: these pass without retry locally, and a genuine
    // failure still fails all attempts. Local runs keep retry at 0 to surface flakes.
    retry: process.env.CI ? 2 : 0,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'build/',
        'release/',
        'e2e/',
        'tests/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'coverage/**',
        'src/renderer/lib/api/index.ts',
        'src/renderer/lib/notifications/index.ts',
        'src/renderer/lib/refresh/index.ts',
        'src/renderer/lib/search/index.ts',
        'src/renderer/lib/settings/index.ts',
        'src/renderer/lib/tour/index.ts',
        'src/renderer/lib/export/index.ts',
        'src/renderer/lib/health/index.ts',
        'src/renderer/lib/generators/index.ts',
        'src/renderer/lib/database/performance/index.ts',
        'src/renderer/components/executive/index.ts',
        'src/shared/types/index.ts',
        'src/renderer/lib/storage/migration.ts',
        'src/renderer/lib/audit/index.ts',
        'src/renderer/lib/audit/types.ts',
        'src/renderer/lib/cache/index.ts',
      ],
      // Anti-regression floors. Ratchet up as real gaps close, never down.
      //
      // Ratcheted 2026-08-22. Measured clean (211 files, 0 fail):
      // stmts 95.58 / branch 89.91 / funcs 95.23 / lines 96.41.
      //
      // Statements, lines AND functions now clear the PRD's 95% (NFR-07.1/08.1). The functions
      // floor is therefore set AT the requirement, not below it: if a change drops it under 95,
      // the fix is a test for the new code, not a lower number here.
      //
      // Branches are the one metric still short, and closing that gap is ~550 more branches.
      // What is left is dominated by defensive guards that cannot be reached from a legitimate
      // caller (SSR/null checks, closed-union default arms), so the honest ceiling is well under
      // 95 unless the guards themselves are removed. Do not manufacture tests for them.
      //
      // Margins are tighter than the previous 1-1.7 because measurement is now reproducible. The
      // threads pool used to crash or flake often enough that a run's numbers were partly luck,
      // and a failed run emits no report at all — so a generous margin was covering for the
      // harness, not for real variance. Across every full run on 2026-08-21/22 the measured
      // minimums were stmts 95.24 · branch 89.68 · funcs 94.13 (pre-work) · lines 96.06, and
      // each floor sits at or below what has been measured since.
      thresholds: {
        statements: 95,
        branches: 89,
        functions: 95,
        lines: 96,
      },
    },

    // Reporter configuration
    reporters: ['verbose', 'json', 'html'],

    // Output directory for test results
    outputFile: {
      json: './test-results/vitest-results.json',
      html: './test-results/vitest-report/index.html',
    },

    // Transform options
    transformMode: {
      ssr: [
        {
          test: /\.tsx?$/,
          use: 'ts-inline',
        },
      ],
    },

    // Test timeout
    testTimeout: 10000,

    // Hook timeout
    hookTimeout: 10000,

    // Isolate tests
    isolate: true,

    // Pool - forks (child processes), not threads.
    //
    // The intermittent SIGSEGV (exit 139) that ci.yml blames on the macOS runner is not a runner
    // problem: it is better-sqlite3, a native N-API addon, being finalized during *worker-thread*
    // teardown. That is why it also shows up on ubuntu CI and on Windows locally. Child processes
    // tear down as processes, where the addon's handles are safe.
    //
    // Measured on Windows, 209 files / 6,163 tests, this branch:
    //   threads - 4 runs: 1 SIGSEGV, 2 runs with a failing file, 1 clean (172-238s)
    //   forks   - 3 runs: 3 clean, coverage report produced every time  (181-227s)
    // Forks is not the slower pool here, so there is no speed argument for keeping threads.
    //
    // If CI disagrees, this is a one-line revert. If it holds, macOS can go back in the ci.yml
    // matrix (dropped there for this same crash) - worth a follow-up run to confirm.
    //
    // NOTE: the previous `singleThread: false` / `minThreads: 1` / `maxThreads: 4` keys were
    // removed, not translated. They are not Vitest 4 options (it uses `maxWorkers`), so they were
    // silently ignored and the 4-worker cap they read as never actually applied.
    pool: 'forks',

    // Watch mode
    watch: false,

    // Bail option - stop after first failure
    bail: process.env.CI === 'true' ? 1 : 0,

    // Allow failing tests
    allowOnly: process.env.CI !== 'true',
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@@': path.resolve(__dirname, './src/shared'),
      '@tests': path.resolve(__dirname, './tests'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },

  // Define global constants
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'test'),
  },
})
