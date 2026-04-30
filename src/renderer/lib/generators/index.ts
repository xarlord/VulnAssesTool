/**
 * CycloneDX SBOM Generator
 *
 * Exports generator functions for creating valid CycloneDX SBOMs
 */

export {
  generateCycloneDX,
  createMetadata,
  componentToCycloneDX,
  generateBomRef,
  generateSerialNumber,
  validateOutput,
  validatePurl,
  validateLicense,
  generateJsonOutput,
  generateFilename,
  createSbom,
  type GeneratorOptions,
  type MetadataOptions,
  type SbomOutput,
  type CycloneDXMetadata,
  type CycloneDXComponent,
  type ValidationResult,
} from './cyclonedxGenerator'

export {
  parseExcel,
  validateRow,
  mapRowToComponent,
  detectColumnMapping,
  getDefaultType,
  type ExcelRow,
  type ColumnMapping,
  type ComponentType,
} from './excelParser'
