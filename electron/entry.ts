/**
 * Electron Entry Point Bootstrap
 *
 * This file is compiled to CommonJS and loads the main application.
 * In CommonJS context, __dirname and __filename are available natively.
 */

// Set up global polyfills for any libraries that might need them
// eslint-disable-next-line no-underscore-dangle
;(globalThis as any).__dirname = __dirname
// eslint-disable-next-line no-underscore-dangle
;(globalThis as any).__filename = __filename

// Load the main application
require('./main.js')
