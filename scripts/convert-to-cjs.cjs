/**
 * Post-build script to convert ESM output to CommonJS
 * Handles the mixed ESM/CJS output from vite-plugin-electron
 */

const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '..', 'dist', 'electron');

function convertFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  console.log(`\nProcessing: ${path.basename(filePath)}`);
  console.log(`  Content length: ${content.length}`);

  // Check for electron imports/requires - handle both ESM and CJS
  const hasElectronImport = /from\s*["']electron["']/.test(content);
  const hasElectronRequire = /require\(\s*["']electron["']\s*\)/.test(content);
  const hasElectron = hasElectronImport || hasElectronRequire;

  console.log(`  hasElectronImport: ${hasElectronImport}`);
  console.log(`  hasElectronRequire: ${hasElectronRequire}`);
  console.log(`  hasElectron: ${hasElectron}`);

  // Check for import statements
  const hasEsmImports = /\bimport\b/.test(content);
  console.log(`  hasEsmImports: ${hasEsmImports}`);

  // Skip if nothing to convert
  if (!hasEsmImports && !hasElectron) {
    console.log(`  Skipping (no changes needed)`);
    return false;
  }

  // Note: We NO LONGER add the shim to main.cjs
  // Instead, we use launcher.cjs as the entry point
  if (hasElectron && path.basename(filePath) === 'main.cjs') {
    console.log(`  Note: Using launcher.cjs for electron module handling`);
  }

  // Convert electron imports to use require
  if (hasElectron) {
    console.log(`  Converting electron imports...`);

    // import { X, Y } from 'electron' -> const { X, Y } = require('electron')
    content = content.replace(
      /import\s*\{([^}]+)\}\s*from\s*["']electron["'];?/g,
      (match, imports) => {
        const clean = imports.split(',').map(s => s.trim().replace(/\s+as\s+/, ': ')).join(', ');
        return `const { ${clean} } = require('electron')`;
      }
    );

    // import * as electron from 'electron' -> const electron = require('electron')
    content = content.replace(
      /import\s*\*\s*as\s+(\w+)\s*from\s*["']electron["'];?/g,
      "const $1 = require('electron')"
    );

    // import electron from 'electron' -> const electron = require('electron')
    content = content.replace(
      /import\s+(\w+)\s+from\s*["']electron["'];?/g,
      "const $1 = require('electron')"
    );

    console.log(`  Electron imports converted to require`);
  }

  // Convert other import statements (non-electron)
  // import { X, Y } from 'module' -> const { X, Y } = require('module')
  content = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g,
    (match, imports, mod) => {
      if (mod === 'electron') return match;
      const clean = imports.split(',').map(s => s.trim().replace(/\s+as\s+/, ': ')).join(', ');
      return `const { ${clean} } = require('${mod}')`;
    }
  );

  // import X, { Y, Z } from 'module' -> const X = require('module'); const { Y, Z } = require('module')
  content = content.replace(
    /import\s+([\w$]+)\s*,\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g,
    (match, def, named, mod) => {
      if (mod === 'electron') return match;
      const clean = named.split(',').map(s => s.trim().replace(/\s+as\s+/, ': ')).join(', ');
      return `const ${def} = require('${mod}'); const { ${clean} } = require('${mod}')`;
    }
  );

  // import X from 'module' -> const X = require('module').default || require('module')
  content = content.replace(
    /import\s+([\w$]+)\s+from\s*["']([^"']+)["'];?/g,
    (match, variable, mod) => {
      if (mod === 'electron') return match;
      return `const ${variable} = require('${mod}').default || require('${mod}')`;
    }
  );

  // import * as X from 'module' -> const X = require('module')
  content = content.replace(
    /import\s+\*\s*as\s+([\w$]+)\s*from\s*["']([^"']+)["'];?/g,
    (match, variable, mod) => {
      if (mod === 'electron') return match;
      return `const ${variable} = require('${mod}')`;
    }
  );

  // import 'module' -> require('module')
  content = content.replace(/import\s*["']([^"']+)["'];?/g, "require('$1')");

  // Convert export statements
  content = content.replace(/export\s+default\s+/g, 'module.exports = ');
  content = content.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`  File updated (new length: ${content.length})`);
    return true;
  }
  console.log(`  No changes made`);
  return false;
}

function processDirectory(dir) {
  let count = 0;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.cjs') || entry.name.endsWith('.js')) {
        if (convertFile(fullPath)) {
          count++;
        }
      }
    }
  }

  walk(dir);
  return count;
}

console.log('Converting ESM to CommonJS in dist/electron...');
const count = processDirectory(electronDir);

// Create launcher.cjs wrapper for Electron E2E testing
const launcherPath = path.join(electronDir, 'launcher.cjs');
const launcherContent = `/**
 * Electron Launcher for E2E Testing
 *
 * This is a proper Electron entry point that loads the main application.
 * This file should be passed to Electron as the entry point: electron.exe launcher.cjs
 */

// Load electron first - this makes ipcMain, app, etc. available
const { app, BrowserWindow, ipcMain } = require('electron');

// Set E2E test environment
process.env.E2E_TEST = process.env.E2E_TEST || 'true';
process.env.E2E_TEST_URL = process.env.E2E_TEST_URL || 'http://127.0.0.1:4173';
process.env.E2E_NO_DEVTOOLS = process.env.E2E_NO_DEVTOOLS || 'true';

// Now load the main application
// The main.cjs has been converted to CommonJS and expects electron to be available
require('./main.cjs');
`;
fs.writeFileSync(launcherPath, launcherContent);
console.log('Created launcher.cjs for Electron E2E testing');

console.log(`\nTotal converted: ${count} file(s)`);
