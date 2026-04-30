#!/usr/bin/env node
/**
 * Development Electron Launcher
 *
 * This script builds and runs the unpacked Electron app for development testing.
 *
 * Due to a module resolution conflict between the npm electron package and
 * Electron's built-in module, direct development mode (npx electron .) doesn't work.
 * The npm package exports a STRING (path to binary), not the Electron API.
 *
 * Usage:
 *   node scripts/run-electron.cjs          # Build and run
 *   node scripts/run-electron.cjs --skip   # Skip build, just run
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release', 'win-unpacked');
const exePath = path.join(releaseDir, 'VulnAssessTool.exe');

const skipBuild = process.argv.includes('--skip') || process.argv.includes('-s');

// Check if exe exists and we're skipping build
if (skipBuild && fs.existsSync(exePath)) {
  console.log('[Dev Launcher] Skipping build, running existing app...');
  runApp();
} else {
  buildAndRun();
}

function buildAndRun() {
  console.log('[Dev Launcher] Building application...');

  // Step 1: Build the renderer and main process
  try {
    execSync('npm run build', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });
  } catch (e) {
    console.error('[Dev Launcher] Build failed');
    process.exit(1);
  }

  // Step 2: Package the app (without creating installer)
  // The --dir flag creates unpacked app without signing/installer
  console.log('[Dev Launcher] Packaging application...');
  try {
    execSync('npx electron-builder --win --dir', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
  } catch (e) {
    // Check if exe was created despite the error (e.g., code signing failure)
    if (fs.existsSync(exePath)) {
      console.log('[Dev Launcher] Packaging completed (with warnings)');
    } else {
      console.error('[Dev Launcher] Packaging failed');
      process.exit(1);
    }
  }

  runApp();
}

function runApp() {
  // Check if exe exists
  if (!fs.existsSync(exePath)) {
    console.error('[Dev Launcher] Executable not found:', exePath);
    console.error('[Dev Launcher] Run without --skip to build first');
    process.exit(1);
  }

  console.log('[Dev Launcher] Starting application...');
  console.log('[Dev Launcher] Executable:', exePath);

  const appProcess = spawn(exePath, [], {
    stdio: 'inherit',
    cwd: releaseDir,
    env: { ...process.env, NODE_ENV: 'development' }
  });

  appProcess.on('error', (err) => {
    console.error('[Dev Launcher] Failed to start application:', err);
    process.exit(1);
  });

  appProcess.on('close', (code) => {
    console.log('[Dev Launcher] Application exited with code:', code);
    process.exit(code || 0);
  });

  // Handle termination signals
  process.on('SIGINT', () => {
    console.log('[Dev Launcher] Received SIGINT, terminating application...');
    appProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('[Dev Launcher] Received SIGTERM, terminating application...');
    appProcess.kill('SIGTERM');
  });
}
