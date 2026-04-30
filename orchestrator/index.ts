#!/usr/bin/env node

/**
 * Watchdog Orchestrator - Main Entry Point
 *
 * Autonomous testing system that:
 * 1. Runs verification phases (build, startup, render, functional)
 * 2. Intercepts errors from all sources
 * 3. Uses AI to analyze and fix issues
 * 4. Loops until the application runs error-free
 *
 * Usage:
 *   npm run watchdog                    # Run full verification
 *   npm run watchdog -- --phase build   # Run specific phase
 *   npm run watchdog -- --no-fix        # Report only, no auto-fix
 *   npm run watchdog -- --resume        # Resume interrupted session
 */

import * as path from 'node:path'
import * as fs from 'node:fs'

// Load .env file into process.env (lightweight — no dependency needed)
{
  const envPath = path.resolve(process.cwd(), '.env')
  try {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        if (!(key in process.env)) {
          process.env[key] = value
        }
      }
    }
  } catch {
    // .env file not found — skip silently
  }
}
import type {
  PhaseName,
  WatchdogConfig,
  SessionState,
  PhaseResult,
  WatchdogEvent,
  WatchdogEventListener,
  CLIOptions,
} from './types'
import { createPhaseRunner } from './phase-runner'
import { createAIFixAgent } from './ai-fix-agent'
import { createStateManager } from './state-manager'
import { createReporter } from './reporter'

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: WatchdogConfig = {
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
  maxAttempts: 5,
  aiFix: {
    enabled: true,
    model: 'glm-5',
    maxTokens: 4096,
  },
  reporting: {
    outputDir: './watchdog-reports',
    screenshots: true,
    verbose: true,
  },
  electron: {
    entryPoint: '.',
    devTools: false,
  },
}

const PHASE_ORDER: PhaseName[] = ['build', 'startup', 'render', 'functional']

// ============================================================================
// Watchdog Orchestrator Class
// ============================================================================

export class WatchdogOrchestrator {
  private config: WatchdogConfig
  private phaseRunner: ReturnType<typeof createPhaseRunner>
  private aiFixAgent: ReturnType<typeof createAIFixAgent>
  private stateManager: ReturnType<typeof createStateManager>
  private reporter: ReturnType<typeof createReporter>
  private listeners: WatchdogEventListener[] = []
  private running = false

  constructor(options: Partial<WatchdogConfig> = {}) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      phases: { ...DEFAULT_CONFIG.phases, ...options.phases },
      aiFix: { ...DEFAULT_CONFIG.aiFix, ...options.aiFix },
      reporting: { ...DEFAULT_CONFIG.reporting, ...options.reporting },
      electron: { ...DEFAULT_CONFIG.electron, ...options.electron },
    }

    // Initialize components
    this.stateManager = createStateManager({
      stateDir: path.join(this.config.reporting.outputDir, 'state'),
      maxAttempts: this.config.maxAttempts,
    })

    this.reporter = createReporter({
      outputDir: this.config.reporting.outputDir,
      includeScreenshots: this.config.reporting.screenshots,
    })

    this.aiFixAgent = createAIFixAgent({
      config: this.config,
      onFix: (result) => this.emit({ type: 'fix:complete', result }),
    })

    this.phaseRunner = createPhaseRunner({
      config: this.config,
      onProgress: (phase, message) => {
        this.log(`[${phase}] ${message}`)
        this.emit({ type: 'phase:start', phase, attempt: this.stateManager.getState()?.attemptNumber || 1 })
      },
      onError: (error) => {
        this.emit({ type: 'error:detected', error })
      },
    })

    // Set up screenshot handling
    this.phaseRunner.on('screenshot', (phase: PhaseName, data: Buffer) => {
      this.reporter.saveScreenshot(phase, data)
    })
  }

  /**
   * Run the complete watchdog loop
   */
  async run(options: CLIOptions = {}): Promise<SessionState> {
    if (this.running) {
      throw new Error('Watchdog is already running')
    }

    this.running = true

    // Initialize or resume session
    let state: SessionState
    if (options.resume) {
      state = this.stateManager.resumeSession() || this.stateManager.startSession()
    } else {
      state = this.stateManager.startSession()
    }

    this.emit({ type: 'session:start', sessionId: state.sessionId })
    this.log(`Starting Watchdog session: ${state.sessionId}`)

    try {
      // Main loop
      while (this.running) {
        this.log(`\n${'='.repeat(60)}`)
        this.log(`Attempt ${state.attemptNumber}/${state.maxAttempts}`)
        this.log(`${'='.repeat(60)}\n`)

        // Run all phases
        let allPhasesPassed = true

        for (const phaseName of PHASE_ORDER) {
          if (options.phase && options.phase !== phaseName) {
            continue
          }

          this.stateManager.setPhase(phaseName)
          this.reporter.printStatus(this.stateManager.getState()!)

          const result = await this.runPhase(phaseName, state.attemptNumber)
          this.stateManager.addPhaseResult(result)

          if (!result.success) {
            allPhasesPassed = false

            // Collect errors
            this.stateManager.addErrors(result.errors)

            // Try to fix errors if AI is enabled
            if (!options.noFix && this.config.aiFix.enabled) {
              const fixResults = await this.attemptFixes(result.errors)
              for (const fix of fixResults) {
                this.stateManager.addFixedIssue(fix)
              }
            }

            break // Stop at first failed phase
          }
        }

        if (allPhasesPassed) {
          // Success!
          this.stateManager.setStatus('success')
          this.log('\n✅ All phases passed!')
          break
        }

        // Check if we've hit max attempts
        if (this.stateManager.isMaxAttemptsReached()) {
          this.stateManager.setStatus('failed')
          this.log('\n❌ Max attempts reached. Session failed.')
          break
        }

        // Increment attempt and loop
        this.stateManager.incrementAttempt()
        this.stateManager.clearErrors()

        this.emit({
          type: 'loop:restart',
          attempt: state.attemptNumber + 1,
          maxAttempts: state.maxAttempts,
        })

        // Brief pause before retry
        await this.sleep(2000)
      }
    } catch (error) {
      this.stateManager.setStatus('failed')
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(`\n❌ Session failed with error: ${errorMessage}`)
    } finally {
      this.running = false
      await this.phaseRunner.cleanup()
    }

    // Generate final report
    const finalState = this.stateManager.getState()!
    const report = this.reporter.generateReport(finalState)

    this.emit({ type: 'session:complete', report })

    // Archive session
    this.stateManager.archiveSession()

    return finalState
  }

  /**
   * Run a single phase
   */
  private async runPhase(phaseName: PhaseName, attempt: number): Promise<PhaseResult> {
    this.log(`\n▶ Running phase: ${phaseName}`)

    try {
      const result = await this.phaseRunner.runPhase(phaseName, attempt)

      if (result.success) {
        this.log(`✓ Phase ${phaseName} passed (${result.duration}ms)`)
      } else {
        this.log(`✗ Phase ${phaseName} failed`)
        this.log(`  Errors: ${result.errors.length}`)

        for (const error of result.errors.slice(0, 3)) {
          this.log(`  - [${error.type}] ${error.message.substring(0, 100)}`)
        }

        if (result.errors.length > 3) {
          this.log(`  ... and ${result.errors.length - 3} more`)
        }
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(`✗ Phase ${phaseName} threw error: ${errorMessage}`)

      return {
        success: false,
        output: errorMessage,
        errors: [
          {
            type: 'unknown',
            message: errorMessage,
            rawOutput: errorMessage,
            severity: 'critical',
            timestamp: new Date(),
          },
        ],
        duration: 0,
        phase: phaseName,
        timestamp: new Date(),
        attempts: attempt,
      }
    }
  }

  /**
   * Attempt to fix errors using AI
   */
  private async attemptFixes(errors: import('./types').ErrorMatch[]): Promise<import('./types').FixResult[]> {
    const results: import('./types').FixResult[] = []

    if (!this.aiFixAgent.isAvailable()) {
      this.log('AI fix agent not available (no API key)')
      return results
    }

    // Get unique errors to avoid duplicate fixes
    const uniqueErrors = this.getUniqueErrors(errors)

    for (const error of uniqueErrors.slice(0, 3)) {
      // Limit to 3 fixes per attempt
      this.log(`\n🔧 Attempting fix for: ${error.message.substring(0, 80)}...`)

      this.emit({ type: 'fix:start', error })

      const fixResult = await this.aiFixAgent.analyzeAndFix(error)
      results.push(fixResult)

      if (fixResult.fixed) {
        this.log(`✓ Fix applied: ${fixResult.explanation}`)
        this.log(`  Confidence: ${(fixResult.confidence * 100).toFixed(0)}%`)
      } else {
        this.log(`✗ Could not fix: ${fixResult.explanation}`)
      }
    }

    return results
  }

  /**
   * Get unique errors (deduplicated)
   */
  private getUniqueErrors(errors: import('./types').ErrorMatch[]): import('./types').ErrorMatch[] {
    const seen = new Set<string>()
    const unique: import('./types').ErrorMatch[] = []

    for (const error of errors) {
      const key = `${error.type}:${error.message.substring(0, 100)}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(error)
      }
    }

    return unique
  }

  /**
   * Stop the watchdog
   */
  stop(): void {
    this.running = false
    this.phaseRunner.kill()
    this.stateManager.setStatus('paused')
  }

  /**
   * Add an event listener
   */
  on(listener: WatchdogEventListener): void {
    this.listeners.push(listener)
  }

  /**
   * Remove an event listener
   */
  off(listener: WatchdogEventListener): void {
    const index = this.listeners.indexOf(listener)
    if (index > -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: WatchdogEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    }
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    if (this.config.reporting.verbose) {
      console.log(message)
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export async function runCLI(args: string[] = process.argv.slice(2)): Promise<void> {
  const options: CLIOptions = parseArgs(args)

  console.log(`
╔════════════════════════════════════════════════════════════╗
║                 WATCHDOG ORCHESTRATOR                       ║
║              Autonomous Testing System                      ║
╚════════════════════════════════════════════════════════════╝
`)

  if (options.dryRun) {
    console.log('DRY RUN - No actual changes will be made')
  }

  const orchestrator = new WatchdogOrchestrator({
    aiFix: {
      enabled: !options.noFix,
      model: 'glm-5',
      maxTokens: 4096,
    },
  })

  // Handle interruption
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, stopping...')
    orchestrator.stop()
    process.exit(0)
  })

  try {
    const state = await orchestrator.run(options)

    console.log('\n' + '='.repeat(60))
    console.log('SESSION COMPLETE')
    console.log('='.repeat(60))
    console.log(`Status: ${state.status}`)
    console.log(`Attempts: ${state.attemptNumber}`)
    console.log(`Errors found: ${state.currentErrors.length + state.fixedIssues.length}`)
    console.log(`Fixes applied: ${state.fixedIssues.filter((f) => f.fixed).length}`)

    process.exit(state.status === 'success' ? 0 : 1)
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

/**
 * Parse CLI arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    maxAttempts: 5,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    switch (arg) {
      case '--phase':
      case '-p':
        options.phase = args[++i] as PhaseName
        break
      case '--no-fix':
        options.noFix = true
        break
      case '--max-attempts':
      case '-m':
        options.maxAttempts = parseInt(args[++i], 10)
        break
      case '--resume':
      case '-r':
        options.resume = true
        break
      case '--config':
      case '-c':
        options.config = args[++i]
        break
      case '--verbose':
      case '-v':
        options.verbose = true
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }

  return options
}

/**
 * Print CLI help
 */
function printHelp(): void {
  console.log(`
Watchdog Orchestrator - Autonomous Testing System

USAGE:
  npm run watchdog [options]

OPTIONS:
  -p, --phase <name>     Run only the specified phase (build|startup|render|functional)
  -m, --max-attempts <n> Maximum fix attempts (default: 5)
  -r, --resume           Resume interrupted session
  -c, --config <path>    Path to config file
  -v, --verbose          Enable verbose output
  --no-fix               Report errors without auto-fixing
  --dry-run              Show what would be done without making changes
  -h, --help             Show this help message

EXAMPLES:
  npm run watchdog                      # Run full verification with auto-fix
  npm run watchdog -- --phase build     # Only verify build phase
  npm run watchdog -- --no-fix          # Report only, don't auto-fix
  npm run watchdog -- --resume          # Resume interrupted session

PHASES:
  1. build       - Verify TypeScript compilation and Vite build
  2. startup     - Verify Electron main process initialization
  3. render      - Verify React renderer loads without errors
  4. functional  - Run smoke tests for core features

ENVIRONMENT:
  GLM_API_KEY - Required for AI auto-fix functionality
`)
}

// Run CLI when executed directly via tsx
runCLI()

export default WatchdogOrchestrator
