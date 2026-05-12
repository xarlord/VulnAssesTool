import * as path from 'path'

/**
 * E2E Test Fixtures
 *
 * Provides sample SBOM files and test data for E2E testing
 */

export const FIXTURES_DIR = path.join(__dirname)

export const SBOM_FIXTURES = {
  cycloneDx: {
    sample: path.join(FIXTURES_DIR, 'sbom', 'sample-cyclonedx.json'),
    minimal: path.join(FIXTURES_DIR, 'sbom', 'minimal-cyclonedx.json'),
  },
  spdx: {
    sample: path.join(FIXTURES_DIR, 'sbom', 'sample-spdx.json'),
  },
}

/**
 * Get the path to a fixture file
 */
export function getFixturePath(fixtureType: 'sbom', filename: string): string {
  return path.join(FIXTURES_DIR, fixtureType, filename)
}

/**
 * Get the absolute path to a CycloneDX fixture
 */
export function getCycloneDxFixture(name: 'sample' | 'minimal' = 'sample'): string {
  return SBOM_FIXTURES.cycloneDx[name]
}

/**
 * Get the absolute path to an SPDX fixture
 */
export function getSpdxFixture(name: 'sample' = 'sample'): string {
  return SBOM_FIXTURES.spdx[name]
}
