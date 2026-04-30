/**
 * Watchdog Orchestrator - Type Definitions
 *
 * Core types for the autonomous testing and self-healing system
 */

// ============================================================================
// Phase Types
// ============================================================================

export type PhaseName = 'build' | 'startup' | 'render' | 'functional'

export interface Phase {
  name: PhaseName
  command: string
  timeout: number
  successPattern: RegExp
  errorPatterns: ErrorPatternDefinition[]
}

export interface ErrorPatternDefinition {
  type: ErrorType
  pattern: RegExp
  severity: 'critical' | 'error' | 'warning'
}

export type ErrorType =
  | 'build'
  | 'runtime'
  | 'console'
  | 'ipc'
  | 'typescript'
  | 'vite'
  | 'electron'
  | 'react'
  | 'unknown'

// ============================================================================
// Phase Results
// ============================================================================

export interface PhaseResult {
  success: boolean
  output: string
  errors: ErrorMatch[]
  duration: number
  phase: PhaseName
  timestamp: Date
  attempts: number
}

export interface ErrorMatch {
  type: ErrorType
  message: string
  stack?: string
  file?: string
  line?: number
  column?: number
  rawOutput: string
  severity: 'critical' | 'error' | 'warning'
  timestamp: Date
}

// ============================================================================
// AI Fix Agent Types
// ============================================================================

export interface FixResult {
  fixed: boolean
  changes: FileChange[]
  explanation: string
  confidence: number
  errorId: string
}

export interface FileChange {
  path: string
  before: string
  after: string
  changeType: 'create' | 'modify' | 'delete'
}

export interface AIFixContext {
  error: ErrorMatch
  relatedFiles: Map<string, string>
  previousFixes: FixResult[]
  projectContext: string
}

// ============================================================================
// State Management Types
// ============================================================================

export type SessionStatus = 'running' | 'paused' | 'success' | 'failed'

export interface SessionState {
  sessionId: string
  startedAt: Date
  lastUpdatedAt: Date
  currentPhase: PhaseName
  attemptNumber: number
  maxAttempts: number
  fixedIssues: FixResult[]
  currentErrors: ErrorMatch[]
  status: SessionStatus
  phaseResults: PhaseResult[]
}

export interface SessionReport {
  sessionId: string
  status: SessionStatus
  totalDuration: number
  totalAttempts: number
  errorsFound: ErrorMatch[]
  fixesApplied: FixResult[]
  phaseSummaries: PhaseSummary[]
}

export interface PhaseSummary {
  phase: PhaseName
  success: boolean
  duration: number
  errorsCount: number
  attempts: number
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface WatchdogConfig {
  phases: PhaseConfig
  maxAttempts: number
  aiFix: AIFixConfig
  reporting: ReportingConfig
  electron: ElectronConfig
}

export interface PhaseConfig {
  build: SinglePhaseConfig
  startup: SinglePhaseConfig
  render: SinglePhaseConfig
  functional: SinglePhaseConfig
}

export interface SinglePhaseConfig {
  command?: string
  timeout: number
  skip?: boolean
}

export interface AIFixConfig {
  enabled: boolean
  model: string
  apiKey?: string
  maxTokens: number
}

export interface ReportingConfig {
  outputDir: string
  screenshots: boolean
  verbose: boolean
}

export interface ElectronConfig {
  entryPoint: string
  devTools: boolean
}

// ============================================================================
// Event Types
// ============================================================================

export type WatchdogEvent =
  | { type: 'phase:start'; phase: PhaseName; attempt: number }
  | { type: 'phase:complete'; phase: PhaseName; result: PhaseResult }
  | { type: 'error:detected'; error: ErrorMatch }
  | { type: 'fix:start'; error: ErrorMatch }
  | { type: 'fix:complete'; result: FixResult }
  | { type: 'session:start'; sessionId: string }
  | { type: 'session:complete'; report: SessionReport }
  | { type: 'loop:restart'; attempt: number; maxAttempts: number }

export type WatchdogEventListener = (event: WatchdogEvent) => void

// ============================================================================
// CLI Types
// ============================================================================

export interface CLIOptions {
  phase?: PhaseName
  noFix?: boolean
  maxAttempts?: number
  resume?: boolean
  config?: string
  verbose?: boolean
  dryRun?: boolean
}
