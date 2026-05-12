/**
 * Watchdog Orchestrator Configuration
 *
 * Customize the autonomous testing system behavior
 */

import type { WatchdogConfig } from './orchestrator/types'

const config: WatchdogConfig = {
  // Phase-specific settings
  phases: {
    build: {
      command: 'npm run build',
      timeout: 120000, // 2 minutes
    },
    startup: {
      command: 'electron .',
      timeout: 30000, // 30 seconds
    },
    render: {
      timeout: 60000, // 1 minute
    },
    functional: {
      timeout: 120000, // 2 minutes
    },
  },

  // Maximum number of fix attempts before giving up
  maxAttempts: 5,

  // AI-powered auto-fix settings (using GLM API)
  aiFix: {
    enabled: true,
    model: 'glm-5',
    maxTokens: 4096,
    // API key is read from GLM_API_KEY environment variable
  },

  // Reporting settings
  reporting: {
    outputDir: './watchdog-reports',
    screenshots: true,
    verbose: true,
  },

  // Electron-specific settings
  electron: {
    entryPoint: '.',
    devTools: false,
  },
}

export default config
