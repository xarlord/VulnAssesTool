/**
 * Vitest configuration for the NFR-01 performance suite.
 *
 * These are timing-assertion tests (scan < 10s, search < 1s per PRD.md NFR-01). They run
 * single-threaded and isolated so a measurement is never perturbed by other workers sharing
 * the CPU — the same reason the integration suite pins one thread. Run with: npm run test:perf.
 * They are EXCLUDED from the main `npm run test` run (see vitest.config.ts) precisely so a loaded
 * parallel unit run can never make a perf assertion flaky.
 */

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  test: {
    globals: true,
    // jsdom (not node): the scan path guards on `typeof window` and reads the platform singleton
    // that tests/setup.ts installs, so the DOM env + shared setup must be present.
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],

    include: ['tests/perf/**/*.perf.test.ts'],

    transformMode: {
      ssr: [
        {
          test: /\.tsx?$/,
          use: 'ts-inline',
        },
      ],
    },

    // Generous ceiling well above the asserted budgets so the assertion — not the harness
    // timeout — is what fails when a run is genuinely slow.
    testTimeout: 30000,
    hookTimeout: 30000,

    isolate: true,
    // Pin one worker so a perf measurement is never perturbed by a sibling test sharing the CPU.
    pool: 'threads',
    singleThread: true,
    minThreads: 1,
    maxThreads: 1,
    watch: false,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src/renderer'),
      '@@': path.resolve(__dirname, '../../src/shared'),
      '@tests': path.resolve(__dirname, '../'),
      '@shared': path.resolve(__dirname, '../../src/shared'),
    },
  },

  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'test'),
  },
})
