#!/usr/bin/env node
/**
 * Development runner with rebuild support
 *
 * This script builds the app and runs it using the built executable.
 * This works around the npm electron package issue in development mode.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('[Dev Runner] Starting development workflow...');

// Build the app first
console.log('[Dev Runner] Building app...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: __dirname + '/..' });
  console.log('[Dev Runner] Build complete');
} catch (e) {
  console.error('[Dev Runner] Build failed:', e.message);
  process.exit(1);
}

// Path to the built executable
const executablePath = path.resolve(__dirname, '..', 'release', 'win-unpacked', 'VulnAssessTool.exe');

// Verify the executable exists
if (!fs.existsSync(executablePath)) {
  console.error('[Dev Runner] Executable not found at:', executablePath);
  console.error('[Dev Runner] Run "npm run pack" first to create the executable');
  process.exit(1);
}

console.log('[Dev Runner] Starting app:', executablePath);

// Run the executable
const appProcess = spawn(executablePath, [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development'
  },
  detached: true
});

appProcess.on('error', (err) => {
  console.error('[Dev Runner] Failed to start app:', err);
  process.exit(1);
});

console.log('[Dev Runner] App started in development mode');
console.log('[Dev Runner] Press Ctrl+C to stop the app');

// Handle termination signals
process.on('SIGINT', () => {
  console.log('[Dev Runner] Stopping app...');
  appProcess.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Dev Runner] Stopping app...');
  appProcess.kill('SIGTERM');
  process.exit(0);
});
