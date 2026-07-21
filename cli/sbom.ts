/**
 * Shared SBOM file loading for CLI commands.
 *
 * Reads a CycloneDX or SPDX SBOM from disk, detects its format, and parses it
 * into components using the same parsers the app uses. Throws a descriptive
 * Error the caller can map to an exit code.
 */

import * as fs from 'fs'
import type { Component } from '../src/shared/types.js'
import { determineFormat } from './commands/scan.js'
import { parseCycloneDX } from '../src/renderer/lib/parsers/cyclonedx.js'
import { parseSpdx } from '../src/renderer/lib/parsers/spdx.js'

export interface LoadedSbom {
  components: Component[]
  format: 'cyclonedx' | 'spdx'
}

/**
 * Read + parse an SBOM file. Throws on a missing file or an unsupported format
 * (message prefixed so the entry point can pick exit code 3 for bad input).
 */
export async function loadSbomComponents(sbomPath: string): Promise<LoadedSbom> {
  if (!fs.existsSync(sbomPath)) {
    throw new Error(`File not found: ${sbomPath}`)
  }

  const content = fs.readFileSync(sbomPath, 'utf-8')
  const format = determineFormat(sbomPath, content)

  // The parsers infer json/xml from the filename extension.
  const parserFilename = format.includes('xml') ? 'sbom.xml' : 'sbom.json'

  if (format.includes('cyclonedx')) {
    const result = await parseCycloneDX(content, parserFilename)
    return { components: result.components, format: 'cyclonedx' }
  }
  if (format.includes('spdx')) {
    const result = await parseSpdx(content, parserFilename)
    return { components: result.components, format: 'spdx' }
  }

  throw new Error(`Unsupported SBOM format: ${sbomPath}`)
}
