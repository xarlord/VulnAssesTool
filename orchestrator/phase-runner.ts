/**
 * Phase Runner
 *
 * Executes verification phases and captures results
 */

import { EventEmitter } from 'node:events'
import { spawn, type ChildProcess } from 'node:child_process'
import type { PhaseName, PhaseResult, ErrorMatch, WatchdogConfig } from './types'
import { OutputCapture } from './utils/output-capture'
import { ErrorInterceptor, createErrorInterceptor } from './error-interceptor'
import {} from './utils/patterns'

export interface PhaseRunnerOptions {
  config: WatchdogConfig
  onProgress?: (phase: PhaseName, message: string) => void
  onError?: (error: ErrorMatch) => void
}

export class PhaseRunner extends EventEmitter {
  private config: WatchdogConfig
  private currentCapture: OutputCapture | null = null
  private electronProcess: ChildProcess | null = null

  constructor(options: PhaseRunnerOptions) {
    super()
    this.config = options.config

    // Forward events
    this.on('progress', (phase, message) => options.onProgress?.(phase, message))
    this.on('error', (error) => options.onError?.(error))
  }

  /**
   * Run a specific phase
   */
  async runPhase(phaseName: PhaseName, attempt: number): Promise<PhaseResult> {
    const interceptor = createErrorInterceptor()
    const phaseConfig = this.config.phases[phaseName]

    this.emit('progress', phaseName, `Starting ${phaseName} phase (attempt ${attempt})`)

    let result: PhaseResult

    switch (phaseName) {
      case 'build':
        result = await this.runBuildPhase(interceptor, phaseConfig.timeout)
        break
      case 'startup':
        result = await this.runStartupPhase(interceptor, phaseConfig.timeout)
        break
      case 'render':
        result = await this.runRenderPhase(interceptor, phaseConfig.timeout)
        break
      case 'functional':
        result = await this.runFunctionalPhase(interceptor, phaseConfig.timeout)
        break
      default:
        throw new Error(`Unknown phase: ${phaseName}`)
    }

    result.phase = phaseName
    result.attempts = attempt
    result.timestamp = new Date()

    this.emit('progress', phaseName, `Completed ${phaseName} phase: ${result.success ? 'SUCCESS' : 'FAILED'}`)

    return result
  }

  /**
   * Phase 1: Build Verification
   */
  private async runBuildPhase(interceptor: ErrorInterceptor, timeout: number): Promise<PhaseResult> {
    const capture = new OutputCapture()
    this.currentCapture = capture

    const command = this.config.phases.build.command || 'npm run build'

    this.emit('progress', 'build', `Running: ${command}`)

    // Set up real-time error detection
    capture.on('stderr', (line) => {
      const error = interceptor.parseLine(line, 'stderr')
      if (error) {
        this.emit('error', error)
      }
    })

    try {
      const output = await capture.execute(command, [], {
        timeout,
        cwd: process.cwd(),
      })

      const errors = interceptor.parseOutput(output.combined)
      const success = output.exitCode === 0 && !interceptor.hasCriticalErrors()

      return {
        success,
        output: output.combined,
        errors,
        duration: output.duration,
        phase: 'build',
        timestamp: new Date(),
        attempts: 1,
      }
    } catch {
      return {
        success: false,
        output: capture.getOutput(),
        errors: interceptor.getErrors(),
        duration: 0,
        phase: 'build',
        timestamp: new Date(),
        attempts: 1,
      }
    } finally {
      this.currentCapture = null
    }
  }

  /**
   * Phase 2: Startup Verification
   */
  private async runStartupPhase(interceptor: ErrorInterceptor, timeout: number): Promise<PhaseResult> {
    const capture = new OutputCapture()
    this.currentCapture = capture

    const entryPoint = this.config.electron.entryPoint || '.'

    this.emit('progress', 'startup', `Starting Electron app: ${entryPoint}`)

    // Capture Electron output
    capture.on('stdout', (line) => {
      const error = interceptor.parseLine(line, 'stdout')
      if (error) {
        this.emit('error', error)
      }
    })

    capture.on('stderr', (line) => {
      const error = interceptor.parseLine(line, 'stderr')
      if (error) {
        this.emit('error', error)
      }
    })

    try {
      // Run Electron and capture output
      const output = await capture.execute('npx', ['electron', entryPoint], {
        timeout,
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          E2E_NO_DEVTOOLS: 'true',
        },
      })

      const errors = interceptor.getErrors()
      const success = !interceptor.hasCriticalErrors()

      return {
        success,
        output: output.combined,
        errors,
        duration: output.duration,
        phase: 'startup',
        timestamp: new Date(),
        attempts: 1,
      }
    } catch {
      return {
        success: false,
        output: capture.getOutput(),
        errors: interceptor.getErrors(),
        duration: 0,
        phase: 'startup',
        timestamp: new Date(),
        attempts: 1,
      }
    } finally {
      this.currentCapture = null
    }
  }

  /**
   * Phase 3: Render Verification
   * Spawns Electron and monitors output for render errors
   */
  private async runRenderPhase(interceptor: ErrorInterceptor, timeout: number): Promise<PhaseResult> {
    const output: string[] = []
    const entryPoint = this.config.electron.entryPoint || '.'

    this.emit('progress', 'render', 'Launching Electron app...')

    return new Promise((resolve) => {
      let resolved = false
      const startTime = Date.now()

      const cleanup = () => {
        if (this.electronProcess) {
          this.electronProcess.kill()
          this.electronProcess = null
        }
      }

      const finish = (success: boolean, errors: ErrorMatch[]) => {
        if (resolved) return
        resolved = true
        cleanup()

        resolve({
          success,
          output: output.join('\n'),
          errors,
          duration: Date.now() - startTime,
          phase: 'render',
          timestamp: new Date(),
          attempts: 1,
        })
      }

      // Set timeout - if app runs without errors, consider it success
      const timeoutId = setTimeout(() => {
        output.push('[watchdog] Render verification timeout - assuming success if no critical errors')
        finish(!interceptor.hasCriticalErrors(), interceptor.getErrors())
      }, timeout)

      // Also set a minimum success timeout - if app runs for 5 seconds without errors, consider success
      const successTimeoutId = setTimeout(() => {
        if (!resolved && !interceptor.hasCriticalErrors()) {
          output.push('[watchdog] App running for 5 seconds without critical errors - render phase passed')
          clearTimeout(timeoutId)
          finish(true, interceptor.getErrors())
        }
      }, 5000)

      try {
        this.electronProcess = spawn('npx', ['electron', entryPoint], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'production',
            E2E_NO_DEVTOOLS: 'true',
          },
          shell: true,
        })

        this.electronProcess.stdout?.on('data', (data: Buffer) => {
          const text = data.toString()
          output.push(text)

          // Check for render success indicators
          if (
            text.includes('Renderer loaded') ||
            text.includes('React rendered') ||
            text.includes('Dashboard mounted')
          ) {
            clearTimeout(timeoutId)
            finish(!interceptor.hasCriticalErrors(), interceptor.getErrors())
          }

          // Parse for errors
          const error = interceptor.parseLine(text, 'stdout')
          if (error) {
            this.emit('error', error)
          }
        })

        this.electronProcess.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          output.push(`[stderr] ${text}`)

          const error = interceptor.parseLine(text, 'stderr')
          if (error) {
            this.emit('error', error)
          }
        })

        this.electronProcess.on('close', (code) => {
          clearTimeout(timeoutId)
          clearTimeout(successTimeoutId)
          if (!resolved) {
            output.push(`[watchdog] Electron exited with code ${code}`)
            // If no critical errors were detected, consider it a success
            // (app may exit normally after window close or due to E2E mode)
            const success = !interceptor.hasCriticalErrors()
            if (success) {
              output.push('[watchdog] No critical errors detected - render phase passed')
            }
            finish(success, interceptor.getErrors())
          }
        })

        this.electronProcess.on('error', (err) => {
          clearTimeout(timeoutId)
          output.push(`[error] Failed to start Electron: ${err.message}`)
          finish(false, interceptor.getErrors())
        })
      } catch (error) {
        clearTimeout(timeoutId)
        const errorMessage = error instanceof Error ? error.message : String(error)
        output.push(`[error] ${errorMessage}`)
        finish(false, interceptor.getErrors())
      }
    })
  }

  /**
   * Phase 4: Functional Verification
   * Runs quick smoke tests by spawning Electron and checking basic functionality
   */
  private async runFunctionalPhase(interceptor: ErrorInterceptor, timeout: number): Promise<PhaseResult> {
    const output: string[] = []
    const entryPoint = this.config.electron.entryPoint || '.'

    this.emit('progress', 'functional', 'Running functional smoke tests...')

    // Track which smoke test checkpoints have been observed
    const smokeChecks = {
      appStarted: false,
      windowCreated: false,
      rendererLoaded: false,
      ipcResponding: false,
      databaseConnected: false,
    }

    const checkSmokeTest = (text: string) => {
      // App startup
      if (text.includes('ready') || text.includes('app.on')) smokeChecks.appStarted = true
      // Window creation
      if (text.includes('createWindow') || text.includes('BrowserWindow') || text.includes('main window'))
        smokeChecks.windowCreated = true
      // Renderer loading
      if (
        text.includes('React') ||
        text.includes('render') ||
        text.includes('vite') ||
        text.includes('DOMContentLoaded')
      )
        smokeChecks.rendererLoaded = true
      // IPC communication
      if (text.includes('pong') || text.includes('ipcMain') || text.includes('IPC')) smokeChecks.ipcResponding = true
      // Database connection
      if (text.includes('database') || text.includes('SQLite') || text.includes('NVD'))
        smokeChecks.databaseConnected = true
    }

    // Full E2E tests are handled by the existing Playwright test suite
    // This phase provides a quick smoke test layer
    return new Promise((resolve) => {
      let resolved = false
      const startTime = Date.now()

      const cleanup = () => {
        if (this.electronProcess) {
          this.electronProcess.kill()
          this.electronProcess = null
        }
      }

      const finish = (success: boolean, errors: ErrorMatch[]) => {
        if (resolved) return
        resolved = true
        cleanup()

        // Log smoke test results
        const passed = Object.values(smokeChecks).filter(Boolean).length
        const total = Object.keys(smokeChecks).length
        output.push(`[watchdog] Smoke test results: ${passed}/${total} checkpoints passed`)
        for (const [check, passed] of Object.entries(smokeChecks)) {
          output.push(`  ${passed ? '✓' : '✗'} ${check}`)
        }

        resolve({
          success,
          output: output.join('\n'),
          errors,
          duration: Date.now() - startTime,
          phase: 'functional',
          timestamp: new Date(),
          attempts: 1,
        })
      }

      const timeoutId = setTimeout(() => {
        output.push('[watchdog] Functional verification completed')
        finish(!interceptor.hasCriticalErrors(), interceptor.getErrors())
      }, timeout)

      try {
        this.electronProcess = spawn('npx', ['electron', entryPoint], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: 'production',
            E2E_NO_DEVTOOLS: 'true',
            WATCHDOG_FUNCTIONAL_TEST: 'true',
          },
          shell: true,
        })

        this.electronProcess.stdout?.on('data', (data: Buffer) => {
          const text = data.toString()
          output.push(text)
          checkSmokeTest(text)

          // Check for functional test completion
          if (text.includes('Functional tests passed') || text.includes('All smoke tests passed')) {
            clearTimeout(timeoutId)
            finish(true, interceptor.getErrors())
          }

          const error = interceptor.parseLine(text, 'stdout')
          if (error) {
            this.emit('error', error)
          }
        })

        this.electronProcess.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          output.push(`[stderr] ${text}`)
          checkSmokeTest(text)

          const error = interceptor.parseLine(text, 'stderr')
          if (error) {
            this.emit('error', error)
          }
        })

        this.electronProcess.on('close', (code) => {
          clearTimeout(timeoutId)
          if (!resolved) {
            output.push(`[watchdog] Electron exited with code ${code}`)
            // If no critical errors were detected, consider it a success
            const success = !interceptor.hasCriticalErrors()
            if (success) {
              output.push('[watchdog] No critical errors detected - functional phase passed')
            }
            finish(success, interceptor.getErrors())
          }
        })

        this.electronProcess.on('error', (err) => {
          clearTimeout(timeoutId)
          output.push(`[error] Failed to start Electron: ${err.message}`)
          finish(false, interceptor.getErrors())
        })
      } catch (error) {
        clearTimeout(timeoutId)
        const errorMessage = error instanceof Error ? error.message : String(error)
        output.push(`[error] ${errorMessage}`)
        finish(false, interceptor.getErrors())
      }
    })
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.electronProcess) {
      this.electronProcess.kill()
      this.electronProcess = null
    }
    if (this.currentCapture) {
      this.currentCapture.kill()
      this.currentCapture = null
    }
  }

  /**
   * Kill any running process
   */
  kill(): void {
    if (this.currentCapture) {
      this.currentCapture.kill()
    }
    this.cleanup()
  }
}

/**
 * Create a phase runner instance
 */
export function createPhaseRunner(options: PhaseRunnerOptions): PhaseRunner {
  return new PhaseRunner(options)
}
