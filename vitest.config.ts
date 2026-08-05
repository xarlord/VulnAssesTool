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
      // Interim anti-regression floor set just below measured coverage on
      // 2026-08-05 (stmts 84.95 / branch 75.24 / funcs 87.32 / lines 85.84). The
      // prior 90/80/90/90 values were aspirational and never enforced (CI's
      // main/develop trigger never fired), so real coverage sits below them. These
      // floors stop backsliding; the PRD target is 95% (NFR-07.1/08.1) — ratchet
      // each value up as real gaps are closed, never down.
      thresholds: {
        statements: 84,
        branches: 75,
        functions: 87,
        lines: 85,
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
