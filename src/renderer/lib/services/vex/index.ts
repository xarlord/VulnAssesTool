/**
 * VEX Service Module
 *
 * CycloneDX VEX (Vulnerability Exploitability eXchange) document generation
 * from FPF (False Positive Filter) decisions.
 *
 * @module services/vex
 */

export {
  VexGenerator,
  createVexGenerator,
  generateVexDocument,
  type VexAnalysisStatus,
  type VexJustification,
  type VexStatement,
  type VexMetadata,
  type VexDocument,
  type VexGeneratorOptions,
  type VexGenerationResult,
} from './vexGenerator'
