import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    process.env.ANALYZE === 'true' &&
      visualizer({
        filename: 'docs/reports/bundle-analysis.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    react(),
  ],
  base: '/',
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
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      output: {
        // Only libraries that are reached through a *static* import graph are
        // pinned to a named vendor chunk (better long-term caching). jspdf and
        // xlsx are now loaded exclusively via dynamic import() at their export /
        // SBOM-generation call sites, so they are left for Vite to auto-split —
        // pinning them here would force the chunk into the eager graph.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-cytoscape': ['cytoscape'],
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
        'server/',
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
