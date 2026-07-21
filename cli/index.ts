#!/usr/bin/env node
/**
 * VulnAssesTool CLI entry point ("vulnshield").
 *
 * Wires the tested building blocks — parser -> scanCommand (with a real local
 * NVD scanner) -> SARIF/JUnit/JSON/console formatter -> exit code — into a
 * runnable command suitable for CI/CD.
 *
 * Exit codes (documented contract):
 *   0  no vulnerabilities at/above the fail threshold
 *   1  vulnerabilities found at/above the fail threshold
 *   2  error during execution (bad format, DB unavailable, unexpected error)
 *   3  invalid input / SBOM file not found
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseArgs } from './parser.js'
import { scanCommand, calculateExitCode, filterVulnerabilities, generateSummary } from './commands/scan.js'
import type { ScanResult } from './commands/scan.js'
import { createLocalScanner, DatabaseUnavailableError } from './scanner/localScanner.js'
import { exportToSarif } from './exporters/sarif.js'
import { exportToJunit, junitToXml } from './exporters/junit.js'
import { formatConsole } from './formatters/console.js'
import { formatJson } from './formatters/json.js'
import { loadSbomComponents } from './sbom.js'
import { diffSboms, hasChanges, formatDiffConsole } from './commands/diff.js'
import { parseVexDocument, applyVexSuppression } from '../src/renderer/lib/services/vex/vexParser.js'
import type { ParsedVexStatement } from '../src/renderer/lib/services/vex/vexParser.js'

// Injected at build time by scripts/build-cli.mjs; falls back for `tsx` dev runs.
declare const VULNSHIELD_CLI_VERSION: string | undefined
const VERSION = typeof VULNSHIELD_CLI_VERSION === 'string' ? VULNSHIELD_CLI_VERSION : '2.0.0'
const TOOL_NAME = 'D-Fence'

// Keep stdout reserved for the machine-readable result (SARIF/JUnit/JSON). The
// database layer logs progress via console.log; route all such chatter to
// stderr so piping `--format sarif` into a file yields valid output.
const logToStderr = (...args: unknown[]): void => {
  process.stderr.write(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n')
}
console.log = logToStderr
console.info = logToStderr
console.warn = logToStderr

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'none'] as const
type Severity = (typeof SEVERITIES)[number]
type OutputFormat = 'json' | 'sarif' | 'junit' | 'console'

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function normSeverity(value: unknown): Severity | undefined {
  const lowered = asString(value)?.toLowerCase()
  return lowered && (SEVERITIES as readonly string[]).includes(lowered) ? (lowered as Severity) : undefined
}

function normFormat(value: unknown, jsonFlag: boolean): OutputFormat {
  const lowered = asString(value)?.toLowerCase()
  if (lowered === 'table') return 'console'
  if (lowered === 'json' || lowered === 'sarif' || lowered === 'junit' || lowered === 'console') return lowered
  return jsonFlag ? 'json' : 'console'
}

const HELP = `vulnshield ${VERSION} — SBOM vulnerability scanner

Usage:
  vulnshield scan <sbom-file> [options]
  vulnshield diff <old-sbom> <new-sbom> [options]
  vulnshield version
  vulnshield help

Commands:
  scan <file>          Scan a CycloneDX or SPDX SBOM against the local NVD database
  diff <old> <new>     Compare two SBOMs (added/removed/version-changed components)
  version              Print the version
  help                 Show this help

Options:
  -f, --format <fmt>     Output format: console (default), json, sarif, junit
  -o, --output <file>    Write output to a file instead of stdout
  -s, --severity <sev>   Minimum severity to report: critical|high|medium|low|none
      --min-epss <n>      Only report vulnerabilities with EPSS >= n (0-1)
      --check-kev         Only report Known Exploited Vulnerabilities (CISA KEV)
      --vex <file>        Suppress findings triaged as not_affected/resolved in a
                          CycloneDX VEX document (JSON)
      --fail-on <sev>     Severity that triggers exit code 1 (default: high)
      --exit-code         (diff) Exit 1 if the SBOMs differ
      --db <path>         Path to an nvd-data.db (default: ~/.vulnassesstool/nvd-data.db)
      --version           Print the version
      --help              Show this help

Exit codes:
  scan: 0 clean · 1 findings at/above --fail-on · 2 error · 3 invalid input
  diff: 0 ok (1 if changed with --exit-code) · 2 error · 3 invalid input`

function render(result: ScanResult, format: OutputFormat, sbomPath: string, failThreshold: Severity): string {
  switch (format) {
    case 'sarif':
      return JSON.stringify(
        exportToSarif(result.vulnerabilities, { toolName: TOOL_NAME, toolVersion: VERSION }),
        null,
        2,
      )
    case 'junit':
      return junitToXml(
        exportToJunit(result.vulnerabilities, {
          projectName: path.basename(sbomPath),
          failureThreshold: failThreshold,
        }),
      )
    case 'json':
      return formatJson(result)
    case 'console':
    default:
      return formatConsole(result, sbomPath)
  }
}

/**
 * Load VEX statements from `--vex <file>`, or `undefined` if not requested.
 * Returns the sentinel `'error'` after writing a message when the file is
 * missing or unparseable, so the caller can exit 3 before the expensive scan.
 */
function loadVexStatements(flags: Record<string, unknown>): ParsedVexStatement[] | undefined | 'error' {
  const vexPath = asString(flags.vex)
  if (!vexPath) return undefined
  if (!fs.existsSync(vexPath)) {
    process.stderr.write(`Error: VEX file not found: ${vexPath}\n`)
    return 'error'
  }
  try {
    const parsed = parseVexDocument(fs.readFileSync(vexPath, 'utf-8'))
    for (const warning of parsed.warnings) process.stderr.write(`VEX warning: ${warning}\n`)
    return parsed.statements
  } catch (error) {
    process.stderr.write(`Error: failed to parse VEX file: ${error instanceof Error ? error.message : String(error)}\n`)
    return 'error'
  }
}

async function runScan(sbomPath: string, flags: Record<string, unknown>): Promise<number> {
  const failThreshold = normSeverity(flags.failOn) ?? 'high'
  const minSeverity = normSeverity(flags.severity ?? flags.s)
  // A non-numeric --min-epss (e.g. parseFloat('high') === NaN) must NOT become a
  // filter that silently drops every finding — treat only finite numbers as set.
  const minEpss = Number.isFinite(flags.minEpss) ? (flags.minEpss as number) : undefined
  const onlyKev = flags.checkKev === true || flags.onlyKev === true
  const outputFormat = normFormat(flags.format ?? flags.f, flags.json === true)

  // Parse the VEX file (if any) up front so bad input fails fast — exit 3
  // before opening the database or running the scan.
  const vexStatements = loadVexStatements(flags)
  if (vexStatements === 'error') return 3

  const scanner = createLocalScanner(asString(flags.db))
  try {
    await scanner.initialize()
    // Scan without reporting filters so the fail-gate evaluates the full result
    // set; --severity/--min-epss/--check-kev are applied to the OUTPUT only.
    const result = await scanCommand(sbomPath, { sbomPath }, scanner)

    if (!result.success) {
      process.stderr.write(`Error: ${result.error ?? 'scan failed'}\n`)
      return result.error?.startsWith('File not found') ? 3 : 2
    }

    // Apply VEX suppression before the gate so triaged not_affected/resolved
    // findings neither fail the build nor appear in the report.
    let gateSet = result.vulnerabilities
    if (vexStatements) {
      const { kept, suppressed } = applyVexSuppression(result.vulnerabilities, vexStatements)
      if (suppressed.length > 0) {
        process.stderr.write(`VEX: suppressed ${suppressed.length} finding(s) marked not_affected/resolved\n`)
      }
      gateSet = kept
    }

    const exitCode = calculateExitCode(gateSet, failThreshold)

    const reported = filterVulnerabilities(gateSet, { sbomPath, minSeverity, minEpss, onlyKev })
    const reportedResult: ScanResult = { ...result, vulnerabilities: reported, summary: generateSummary(reported) }

    const output = render(reportedResult, outputFormat, sbomPath, failThreshold)
    const outPath = asString(flags.output) ?? asString(flags.o)
    if (outPath) {
      fs.writeFileSync(outPath, output, 'utf-8')
      process.stderr.write(`Wrote ${outputFormat} output to ${outPath}\n`)
    } else {
      process.stdout.write(output + '\n')
    }

    return exitCode
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      process.stderr.write(`Error: ${error.message}\n`)
      return 2
    }
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  } finally {
    await scanner.close()
  }
}

async function runDiff(oldPath: string, newPath: string, flags: Record<string, unknown>): Promise<number> {
  try {
    const [oldSbom, newSbom] = await Promise.all([loadSbomComponents(oldPath), loadSbomComponents(newPath)])
    const diff = diffSboms(oldSbom.components, newSbom.components)

    const asJson = normFormat(flags.format ?? flags.f, flags.json === true) === 'json'
    const output = asJson ? JSON.stringify(diff, null, 2) : formatDiffConsole(diff, oldPath, newPath)

    const outPath = asString(flags.output) ?? asString(flags.o)
    if (outPath) {
      fs.writeFileSync(outPath, output, 'utf-8')
      process.stderr.write(`Wrote diff to ${outPath}\n`)
    } else {
      process.stdout.write(output + '\n')
    }

    // git-diff style: only signal a non-zero "changes present" code when asked.
    return flags.exitCode === true && hasChanges(diff) ? 1 : 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Error: ${message}\n`)
    return message.startsWith('File not found') ? 3 : 2
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2))

  if (parsed.flags.version === true || parsed.command === 'version') {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }

  if (parsed.flags.help === true || parsed.command === 'help' || !parsed.command) {
    process.stdout.write(HELP + '\n')
    return 0
  }

  if (parsed.command === 'diff') {
    const [oldPath, newPath] = parsed.positional
    if (!oldPath || !newPath) {
      process.stderr.write('Error: diff requires two SBOM file paths (old and new)\n')
      return 3
    }
    return runDiff(oldPath, newPath, parsed.flags)
  }

  if (parsed.command !== 'scan') {
    process.stderr.write(`Error: unknown command "${parsed.command}"\n\n${HELP}\n`)
    return 2
  }

  const sbomPath = parsed.positional[0]
  if (!sbomPath) {
    process.stderr.write('Error: scan requires an SBOM file path\n')
    return 3
  }

  return runScan(sbomPath, parsed.flags)
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  })
