/**
 * Electron module preload script
 *
 * This script is loaded via --require before the main app to fix
 * the require('electron') issue.
 */

const Module = require('module');

console.log('[Preload] Fixing electron module resolution...');

// Store the original _load
const originalLoad = Module._load;

// Intercept module loading
Module._load = function(request, parent, isMain) {
  if (request === 'electron') {
    console.log('[Preload] Intercepting require("electron")');

    // Try to delete the npm package from cache
    const npmPath = require.resolve('electron');
    if (Module._cache[npmPath]) {
      console.log('[Preload] Deleting npm electron from cache...');
      delete Module._cache[npmPath];
    }

    // Try loading again - should find built-in now
    try {
      const result = originalLoad.call(Module, 'electron', parent, isMain);
      console.log('[Preload] Result type:', typeof result);
      if (result && typeof result === 'object' && result.app) {
        console.log('[Preload] Successfully loaded built-in electron module!');
        return result;
      }
      console.log('[Preload] Got string path instead of object:', result);
    } catch (e) {
      console.log('[Preload] Error after cache delete:', e.message);
    }
  }

  return originalLoad.call(Module, request, parent, isMain);
};

console.log('[Preload] Electron module interceptor installed');
