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
      // Anti-regression floors, set below measured full-suite coverage with margin. Ratcheted
      // 2026-08-10 after the Tier-2 coverage batch (server/routes/database.ts + ContainerService.ts,
      // +136 tests). True full-suite measurement (5385 tests, 0 fail): stmts 87.61 / branch 78.31 /
      // funcs 88.14 / lines 88.6. functions is held at 87 (not 88) on purpose — its % swings ~0.25
      // run-to-run because which server modules a test loads changes the counted-function denominator,
      // so a floor hugging 88.14 would flake. PRD target is 95% (NFR-07.1/08.1); ratchet up as gaps
      // close, never down.
      thresholds: {
        statements: 87,
        branches: 78,
        functions: 87,
        lines: 88,
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

    // Pool - use threads (Vitest 4.x)
    pool: 'threads',
    singleThread: false,
    minThreads: 1,
    maxThreads: 4,

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
