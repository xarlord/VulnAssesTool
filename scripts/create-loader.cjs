/**
 * Bootstrap loader for Electron main process
 *
 * This loader ensures that require('electron') returns Electron's built-in module
 * instead of the npm package (which exports a string path).
 */

const Module = require('module');
const path = require('path');

// Save original methods
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

// Get npm electron package path
let npmElectronPath;
try {
  npmElectronPath = require.resolve('electron');
} catch (e) {
  // npm electron not found, which is fine
}

// Override _resolveFilename to skip npm electron package
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'electron') {
    // Check if this would resolve to the npm package
    try {
      const resolved = originalResolveFilename.call(this, request, parent, isMain, options);
      if (resolved && resolved.includes('node_modules')) {
        // Would resolve to npm package - return special marker
        return 'electron:builtin';
      }
      return resolved;
    } catch (e) {
      // Resolution failed - return marker for built-in
      return 'electron:builtin';
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Override _load to handle the built-in electron module
Module._load = function(request, parent, isMain) {
  if (request === 'electron:builtin') {
    // Use Electron's internal require to get the built-in module
    // The key is to use the Module that's already loaded in Electron's context
    const electronModule = process.mainModule
      ? process.mainModule.require('electron')
      : originalLoad.call(this, 'electron', parent, isMain);

    if (electronModule && typeof electronModule === 'object' && electronModule.app) {
      return electronModule;
    }

    throw new Error('Failed to load Electron built-in module. Make sure this is running inside Electron.');
  }
  return originalLoad.apply(this, arguments);
};

// Clean up npm electron from cache
if (npmElectronPath) {
  delete require.cache[npmElectronPath];
}

// Now load the actual main process
require('./main.cjs');
