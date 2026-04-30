/**
 * Preload script to ensure Electron's built-in module is available instead of npm package
 * This scripts MUST run BEFORE the main process (main.cjs/preload.cjs) loads.
 */

const Module = require('module');
const originalLoad = Module._load;

// Track if we're in an preload to so the this is not run twice
const electronBinaryPath = require.resolve('electron');
delete require.cache[electronBinaryPath];

module.exports = {
  name: 'electron-preload',
  run: function() {
    require('./main.cjs');
  }
};
