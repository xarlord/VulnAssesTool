/**
 * Vitest Configuration for Integration Tests
 *
 * Integration tests use real NVD data from fixtures and are slower than unit tests.
 * Run with: npm run test:integration
 */

import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

export default defineConfig({
  test: {
    // Enable globals for Vitest
    globals: true,

    // Test environment
    environment: 'node',

    // Setup files - use integration-specific setup
    setupFiles: ['./tests/integration/setup.ts'],

    // Include ONLY integration tests
    include: ['tests/integration/**/*.{test,spec}.{js,ts,jsx,tsx}'],

    // Exclude everything else
    exclude: [
      'node_modules',
      'dist',
      'build',
      'release',
      'e2e',
      'tests/bdd/**/*.{feature,ts}',
      'tests/unit/**/*',
      'src/**/__tests__/**/*',
      'src/renderer/**/*.test.*',
    ],

    // Coverage configuration for integration tests
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
        'electron/main/**',
        'coverage/**',
      ],
      // Lower thresholds for integration tests (they only test integration paths)
      thresholds: {
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },

    // Reporter configuration
    reporters: ['verbose', 'json', 'html'],

    // Output directory for test results
    outputFile: {
      json: './test-results/integration-results.json',
      html: './test-results/integration-report/index.html',
    },

    // Longer timeout for integration tests (they use real data)
    testTimeout: 30000,
    hookTimeout: 30000,

    // Isolate tests
    isolate: true,

    // Use single thread for integration tests (slower but more predictable)
    pool: 'threads',
    singleThread: true,
    minThreads: 1,
    maxThreads: 1,

    // Watch mode - usually false for integration tests
    watch: false,

    // Allow failing tests
    allowOnly: true,

    // Mark as slow tests
    slowTestThreshold: 3000,

    // Include annotations for slow tests
    includeLocators: true,
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src/renderer'),
      '@@': path.resolve(__dirname, '../../src/shared'),
      '@tests': path.resolve(__dirname, '../'),
      '@shared': path.resolve(__dirname, '../../src/shared'),
    },
  },

  // Define global constants
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'test'),
    'process.env.INTEGRATION_TEST': JSON.stringify('true'),
  },
})
