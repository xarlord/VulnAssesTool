#!/usr/bin/env node
/**
 * Standalone script to run Electron app with NVD sync
 * This bypasses Vite's CLI argument parsing issues
 */

const { spawn } = require('child_process');

const electronPath = './dist/electron/main.js';

console.log('Starting Electron with NVD sync...');

const child = spawn('node', [electronPath, '--sync'], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('error', (error) => {
  console.error('Failed to start Electron:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`Electron exited with code ${code}`);
  process.exit(code || 0);
});
