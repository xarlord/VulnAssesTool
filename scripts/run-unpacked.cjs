#!/usr/bin/env node
/**
 * Run the unpacked Electron app
 * Simple script to run the already-built unpacked app
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release', 'win-unpacked');
const exePath = path.join(releaseDir, 'VulnAssessTool.exe');

if (!fs.existsSync(exePath)) {
  console.error('[Run] Executable not found:', exePath);
  console.error('[Run] Run "npm run build && npx electron-builder --win --dir" first');
  process.exit(1);
}

console.log('[Run] Starting VulnAssessTool...');
console.log('[Run] Executable:', exePath);

const appProcess = spawn(exePath, [], {
  stdio: 'inherit',
  cwd: releaseDir
});

appProcess.on('error', (err) => {
  console.error('[Run] Failed to start:', err);
  process.exit(1);
});

appProcess.on('close', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  appProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  appProcess.kill('SIGTERM');
});
