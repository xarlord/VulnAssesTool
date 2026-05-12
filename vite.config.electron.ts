import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { Plugin } from 'vite'

// Custom plugin to inline the entire JavaScript bundle into the HTML file
// This avoids CORS issues with file:// protocol
function inlineScript(): Plugin {
  return {
    name: 'inline-script',
    enforce: 'post',
    generateBundle(options, bundle) {
      // Find the JS bundle
      const jsFileName = Object.keys(bundle).find((name) => name.endsWith('.js'))

      if (!jsFileName) {
        console.log('[inline-script] No JS file found in bundle')
        return
      }

      console.log('[inline-script] Found JS file:', jsFileName)

      const jsFile = bundle[jsFileName]
      let jsCode = ''

      if (jsFile.type === 'chunk') {
        jsCode = jsFile.code
      } else if (jsFile.type === 'asset') {
        if (typeof jsFile.source === 'string') {
          jsCode = jsFile.source
        } else {
          jsCode = jsFile.source.toString()
        }
      }

      if (!jsCode) {
        console.log('[inline-script] Could not extract JS code')
        return
      }

      // Find the HTML file
      const htmlFileName = Object.keys(bundle).find((name) => name.endsWith('.html') || name.endsWith('.htm'))

      if (!htmlFileName) {
        console.log('[inline-script] No HTML file found in bundle')
        return
      }

      console.log('[inline-script] Found HTML file:', htmlFileName)

      const htmlFile = bundle[htmlFileName]
      if (htmlFile.type === 'asset') {
        let html = typeof htmlFile.source === 'string' ? htmlFile.source : htmlFile.source.toString()

        // Replace ANY script tag with an inline script containing the JS code
        // This regex matches: <script ...anything...> ... </script>
        html = html.replace(
          /<script[^>]*>[\s\S]*?<\/script>/g,
          `<script>console.log('[E2E] Script executed!');window.__E2E_SCRIPT_LOADED__=true;${jsCode}</script>`,
        )

        // Update the HTML
        htmlFile.source = html

        // Remove the JS file from the bundle since it's now inlined
        delete bundle[jsFileName]

        console.log('[inline-script] Script inlined successfully, JS file removed from bundle')
      }
    },
  }
}

// Vite config for building Electron app with inlined script for file:// protocol compatibility
// This is used for E2E testing where external scripts don't work with file:// protocol
export default defineConfig({
  plugins: [react(), inlineScript()],
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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Target older browsers for Electron compatibility
    target: 'es2015',
    rollupOptions: {
      output: {
        // Use IIFE format instead of ES modules for file:// protocol support
        format: 'iife',
        // Bundle everything into a single file
        inlineDynamicImports: true,
        // Name the IIFE bundle
        entryFileNames: 'renderer-bundle.js',
      },
    },
    // Ensure all dependencies are bundled
    assetsInlineLimit: 100000000,
  },
})
