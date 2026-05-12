/**
 * Report Generator
 *
 * Generates human-readable and machine-readable reports from watchdog sessions
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SessionState, ErrorMatch, PhaseResult, SessionReport, PhaseSummary } from './types'

export interface ReporterOptions {
  outputDir: string
  includeScreenshots: boolean
}

export class Reporter {
  private outputDir: string
  private includeScreenshots: boolean

  constructor(options: ReporterOptions) {
    this.outputDir = options.outputDir
    this.includeScreenshots = options.includeScreenshots

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
  }

  /**
   * Generate a complete session report
   */
  generateReport(state: SessionState): SessionReport {
    const totalDuration = Date.now() - state.startedAt.getTime()

    const report: SessionReport = {
      sessionId: state.sessionId,
      status: state.status,
      totalDuration,
      totalAttempts: state.attemptNumber,
      errorsFound: state.currentErrors,
      fixesApplied: state.fixedIssues,
      phaseSummaries: this.createPhaseSummaries(state.phaseResults),
    }

    // Write all report files
    this.writeMarkdownReport(report, state)
    this.writeJsonReports(report, state)

    return report
  }

  /**
   * Create phase summaries from results
   */
  private createPhaseSummaries(results: PhaseResult[]): PhaseSummary[] {
    const phaseOrder: Record<string, number> = {
      build: 1,
      startup: 2,
      render: 3,
      functional: 4,
    }

    // Group by phase and get latest result
    const phaseMap = new Map<string, PhaseResult>()
    for (const result of results) {
      phaseMap.set(result.phase, result)
    }

    return Array.from(phaseMap.values())
      .sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase])
      .map((result) => ({
        phase: result.phase,
        success: result.success,
        duration: result.duration,
        errorsCount: result.errors.length,
        attempts: result.attempts,
      }))
  }

  /**
   * Write human-readable markdown report
   */
  private writeMarkdownReport(report: SessionReport, state: SessionState): void {
    const lines: string[] = [
      `# Watchdog Session Report`,
      ``,
      `**Session ID:** ${report.sessionId}`,
      `**Status:** ${this.formatStatus(report.status)}`,
      `**Duration:** ${this.formatDuration(report.totalDuration)}`,
      `**Total Attempts:** ${report.totalAttempts}`,
      `**Started:** ${state.startedAt.toISOString()}`,
      `**Completed:** ${state.lastUpdatedAt.toISOString()}`,
      ``,
      `---`,
      ``,
      `## Phase Summary`,
      ``,
    ]

    // Phase table
    lines.push(`| Phase | Status | Duration | Errors | Attempts |`)
    lines.push(`|-------|--------|----------|--------|----------|`)

    for (const phase of report.phaseSummaries) {
      const status = phase.success ? '✅ Pass' : '❌ Fail'
      lines.push(
        `| ${phase.phase} | ${status} | ${this.formatDuration(phase.duration)} | ${phase.errorsCount} | ${phase.attempts} |`,
      )
    }

    lines.push('')

    // Errors section
    if (report.errorsFound.length > 0) {
      lines.push(`## Errors Found (${report.errorsFound.length})`)
      lines.push('')

      const grouped = this.groupErrorsByType(report.errorsFound)
      for (const [type, errors] of Object.entries(grouped)) {
        lines.push(`### ${type.toUpperCase()} Errors (${errors.length})`)
        lines.push('')

        for (const error of errors.slice(0, 10)) {
          // Limit to 10 per type
          lines.push(`- **${error.severity}**: ${error.message}`)
          if (error.file) {
            lines.push(`  - File: ${error.file}${error.line ? `:${error.line}` : ''}`)
          }
        }

        if (errors.length > 10) {
          lines.push(`- ... and ${errors.length - 10} more`)
        }
        lines.push('')
      }
    }

    // Fixes section
    if (report.fixesApplied.length > 0) {
      lines.push(`## Fixes Applied (${report.fixesApplied.length})`)
      lines.push('')

      for (const fix of report.fixesApplied) {
        const icon = fix.fixed ? '✅' : '⚠️'
        lines.push(`### ${icon} ${fix.explanation}`)
        lines.push(`**Confidence:** ${(fix.confidence * 100).toFixed(0)}%`)
        lines.push('')

        if (fix.changes.length > 0) {
          lines.push(`**Files Changed:**`)
          for (const change of fix.changes) {
            const relativePath = path.relative(process.cwd(), change.path)
            lines.push(`- ${relativePath}`)
          }
          lines.push('')
        }
      }
    }

    // Summary
    lines.push(`## Summary`)
    lines.push('')
    if (report.status === 'success') {
      lines.push(`🎉 **All phases passed!** The application is running without errors.`)
    } else if (report.status === 'failed') {
      lines.push(`❌ **Session failed** after ${report.totalAttempts} attempts.`)
      lines.push(`- ${report.errorsFound.length} errors found`)
      lines.push(`- ${report.fixesApplied.filter((f) => f.fixed).length} fixes applied`)
    } else {
      lines.push(`⏳ Session status: ${report.status}`)
    }

    const reportPath = path.join(this.outputDir, `session-report.md`)
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8')
    console.log(`Report written to: ${reportPath}`)
  }

  /**
   * Write machine-readable JSON reports
   */
  private writeJsonReports(report: SessionReport, state: SessionState): void {
    // Errors JSON
    const errorsPath = path.join(this.outputDir, 'errors-found.json')
    fs.writeFileSync(errorsPath, JSON.stringify(report.errorsFound, null, 2), 'utf-8')

    // Fixes JSON
    const fixesPath = path.join(this.outputDir, 'fixes-applied.json')
    fs.writeFileSync(fixesPath, JSON.stringify(report.fixesApplied, null, 2), 'utf-8')

    // Full session JSON
    const sessionPath = path.join(this.outputDir, 'session-full.json')
    fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2), 'utf-8')
  }

  /**
   * Group errors by type
   */
  private groupErrorsByType(errors: ErrorMatch[]): Record<string, ErrorMatch[]> {
    const grouped: Record<string, ErrorMatch[]> = {}

    for (const error of errors) {
      if (!grouped[error.type]) {
        grouped[error.type] = []
      }
      grouped[error.type].push(error)
    }

    return grouped
  }

  /**
   * Format status for display
   */
  private formatStatus(status: string): string {
    const icons: Record<string, string> = {
      success: '✅ SUCCESS',
      failed: '❌ FAILED',
      running: '🔄 RUNNING',
      paused: '⏸️ PAUSED',
    }
    return icons[status] || status.toUpperCase()
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.round((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  /**
   * Save a screenshot
   */
  saveScreenshot(name: string, data: Buffer): string {
    const screenshotsDir = path.join(this.outputDir, 'screenshots')
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true })
    }

    const filename = `${name}-${Date.now()}.png`
    const filepath = path.join(screenshotsDir, filename)
    fs.writeFileSync(filepath, data)

    return filepath
  }

  /**
   * Print a live status update
   */
  printStatus(state: SessionState): void {
    const summary = {
      sessionId: state.sessionId.substring(0, 12),
      phase: state.currentPhase,
      attempt: `${state.attemptNumber}/${state.maxAttempts}`,
      errors: state.currentErrors.length,
      fixes: state.fixedIssues.filter((f) => f.fixed).length,
    }

    console.log(
      `[Watchdog] Phase: ${summary.phase} | Attempt: ${summary.attempt} | Errors: ${summary.errors} | Fixes: ${summary.fixes}`,
    )
  }
}

/**
 * Create a reporter instance
 */
export function createReporter(options: ReporterOptions): Reporter {
  return new Reporter(options)
}
