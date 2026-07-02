export * from './types'
export {
  categorizeSpdxId,
  assessLicenseExpression,
  scanComponentLicenses,
  createDefaultLicensePolicy,
} from './licenseScanner'
export { lookupSpdxCategory } from './licenseCatalog'
