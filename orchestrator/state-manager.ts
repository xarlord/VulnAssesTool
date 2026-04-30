/**
 * State Manager
 *
 * Manages session state persistence and recovery
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SessionState, SessionStatus, PhaseName, PhaseResult, FixResult, ErrorMatch } from './types'

export interface StateManagerOptions {
  stateDir: string
  maxAttempts: number
}

const STATE_FILE = 'watchdog-state.json'

export class StateManager {
  private stateDir: string
  private maxAttempts: number
  private state: SessionState | null = null

  constructor(options: StateManagerOptions) {
    this.stateDir = options.stateDir
    this.maxAttempts = options.maxAttempts

    // Ensure state directory exists
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true })
    }
  }

  /**
   * Start a new session
   */
  startSession(): SessionState {
    const sessionId = this.generateSessionId()

    this.state = {
      sessionId,
      startedAt: new Date(),
      lastUpdatedAt: new Date(),
      currentPhase: 'build',
      attemptNumber: 1,
      maxAttempts: this.maxAttempts,
      fixedIssues: [],
      currentErrors: [],
      status: 'running',
      phaseResults: [],
    }

    this.saveState()
    return this.state
  }

  /**
   * Resume a previous session
   */
  resumeSession(): SessionState | null {
    const statePath = this.getStatePath()

    if (!fs.existsSync(statePath)) {
      return null
    }

    try {
      const data = fs.readFileSync(statePath, 'utf-8')
      this.state = JSON.parse(data)

      // Convert date strings back to Date objects
      this.state.startedAt = new Date(this.state.startedAt)
      this.state.lastUpdatedAt = new Date(this.state.lastUpdatedAt)
      this.state.phaseResults = this.state.phaseResults.map((r) => ({
        ...r,
        timestamp: new Date(r.timestamp),
      }))

      // Reset status to running
      this.state.status = 'running'
      this.saveState()

      return this.state
    } catch (error) {
      console.error('Failed to resume session:', error)
      return null
    }
  }

  /**
   * Get current state
   */
  getState(): SessionState | null {
    return this.state
  }

  /**
   * Update current phase
   */
  setPhase(phase: PhaseName): void {
    if (this.state) {
      this.state.currentPhase = phase
      this.state.lastUpdatedAt = new Date()
      this.saveState()
    }
  }

  /**
   * Add a phase result
   */
  addPhaseResult(result: PhaseResult): void {
    if (this.state) {
      this.state.phaseResults.push(result)
      this.state.lastUpdatedAt = new Date()
      this.saveState()
    }
  }

  /**
   * Add errors
   */
  addErrors(errors: ErrorMatch[]): void {
    if (this.state) {
      this.state.currentErrors = [...this.state.currentErrors, ...errors]
      this.state.lastUpdatedAt = new Date()
      this.saveState()
    }
  }

  /**
   * Clear current errors
   */
  clearErrors(): void {
    if (this.state) {
      this.state.currentErrors = []
      this.saveState()
    }
  }

  /**
   * Add a fixed issue
   */
  addFixedIssue(fix: FixResult): void {
    if (this.state) {
      this.state.fixedIssues.push(fix)
      this.state.lastUpdatedAt = new Date()
      this.saveState()
    }
  }

  /**
   * Increment attempt counter
   */
  incrementAttempt(): number {
    if (this.state) {
      this.state.attemptNumber++
      this.state.lastUpdatedAt = new Date()
      this.saveState()
      return this.state.attemptNumber
    }
    return 0
  }

  /**
   * Check if max attempts reached
   */
  isMaxAttemptsReached(): boolean {
    return this.state !== null && this.state.attemptNumber >= this.state.maxAttempts
  }

  /**
   * Set session status
   */
  setStatus(status: SessionStatus): void {
    if (this.state) {
      this.state.status = status
      this.state.lastUpdatedAt = new Date()
      this.saveState()
    }
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    if (!this.state) return

    const statePath = this.getStatePath()
    fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2), 'utf-8')
  }

  /**
   * Get state file path
   */
  private getStatePath(): string {
    return path.join(this.stateDir, STATE_FILE)
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `wd-${timestamp}-${random}`
  }

  /**
   * Archive the current session (move to history)
   */
  archiveSession(): void {
    if (!this.state) return

    const archiveDir = path.join(this.stateDir, 'archive')
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true })
    }

    const archivePath = path.join(archiveDir, `${this.state.sessionId}.json`)
    const statePath = this.getStatePath()

    if (fs.existsSync(statePath)) {
      fs.renameSync(statePath, archivePath)
    }

    this.state = null
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    const statePath = this.getStatePath()
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath)
    }
    this.state = null
  }

  /**
   * Get session duration in milliseconds
   */
  getDuration(): number {
    if (!this.state) return 0
    return Date.now() - this.state.startedAt.getTime()
  }

  /**
   * Get summary for reporting
   */
  getSummary(): {
    sessionId: string
    status: SessionStatus
    duration: number
    attempts: number
    errorsFound: number
    fixesApplied: number
    phasesCompleted: number
  } {
    if (!this.state) {
      return {
        sessionId: 'none',
        status: 'failed',
        duration: 0,
        attempts: 0,
        errorsFound: 0,
        fixesApplied: 0,
        phasesCompleted: 0,
      }
    }

    return {
      sessionId: this.state.sessionId,
      status: this.state.status,
      duration: this.getDuration(),
      attempts: this.state.attemptNumber,
      errorsFound: this.state.currentErrors.length + this.state.fixedIssues.length,
      fixesApplied: this.state.fixedIssues.filter((f) => f.fixed).length,
      phasesCompleted: this.state.phaseResults.filter((r) => r.success).length,
    }
  }
}

/**
 * Create a state manager instance
 */
export function createStateManager(options: StateManagerOptions): StateManager {
  return new StateManager(options)
}
