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
      'electron/**/*.test.ts',
    ],

    // Exclude patterns - exclude electron tests from coverage
    coverageExclude: ['electron/**/*.test.ts'],

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
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
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
