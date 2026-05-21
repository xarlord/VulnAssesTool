import { describe, it, expect } from 'vitest'
import { formatVulnerabilityId, formatAliases, getShortVulnDisplay } from './vulnIdFormat'
import type { Vulnerability } from '@@/types'

/** Helper to build a minimal Vulnerability with required fields */
function makeVuln(overrides: Partial<Vulnerability> & { id: string }): Vulnerability {
  return {
    source: 'nvd',
    severity: 'medium',
    description: 'Test vulnerability',
    references: [],
    affectedComponents: [],
    ...overrides,
  }
}

describe('vulnIdFormat', () => {
  describe('formatVulnerabilityId', () => {
    it('should use CVE as primary when ID starts with CVE-', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-1234',
        aliases: ['GHSA-5678', 'OSV-2024-56'],
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('CVE-2024-1234')
      expect(result.isCvePrimary).toBe(true)
      expect(result.aliases).toEqual(['GHSA-5678', 'OSV-2024-56'])
    })

    it('should filter primary ID from aliases when ID is CVE', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-1234',
        aliases: ['CVE-2024-1234', 'GHSA-5678'],
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('CVE-2024-1234')
      expect(result.aliases).not.toContain('CVE-2024-1234')
      expect(result.aliases).toEqual(['GHSA-5678'])
    })

    it('should promote CVE alias to primary when ID is OSV', () => {
      const vuln = makeVuln({
        id: 'OSV-2024-56',
        aliases: ['CVE-2024-9999', 'GHSA-abcd'],
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('CVE-2024-9999')
      expect(result.isCvePrimary).toBe(true)
      expect(result.aliases).toContain('OSV-2024-56')
      expect(result.aliases).toContain('GHSA-abcd')
      expect(result.aliases).not.toContain('CVE-2024-9999')
    })

    it('should promote CVE alias to primary when ID is GHSA', () => {
      const vuln = makeVuln({
        id: 'GHSA-xxxx-yyyy-zzzz',
        aliases: ['CVE-2024-1111'],
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('CVE-2024-1111')
      expect(result.isCvePrimary).toBe(true)
      expect(result.aliases).toEqual(['GHSA-xxxx-yyyy-zzzz'])
    })

    it('should use original ID as primary when no CVE alias exists', () => {
      const vuln = makeVuln({
        id: 'GHSA-xxxx-yyyy-zzzz',
        aliases: ['OSV-2024-1'],
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('GHSA-xxxx-yyyy-zzzz')
      expect(result.isCvePrimary).toBe(false)
      expect(result.aliases).toEqual(['OSV-2024-1'])
    })

    it('should handle undefined aliases gracefully', () => {
      const vuln = makeVuln({
        id: 'OSV-2024-99',
        aliases: undefined,
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('OSV-2024-99')
      expect(result.isCvePrimary).toBe(false)
      expect(result.aliases).toEqual([])
    })

    it('should handle CVE ID with undefined aliases', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-5555',
        aliases: undefined,
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('CVE-2024-5555')
      expect(result.isCvePrimary).toBe(true)
      expect(result.aliases).toEqual([])
    })

    it('should use original ID when aliases is empty array', () => {
      const vuln = makeVuln({
        id: 'OSV-2024-77',
        aliases: [],
      })

      const result = formatVulnerabilityId(vuln)

      expect(result.primaryId).toBe('OSV-2024-77')
      expect(result.isCvePrimary).toBe(false)
      expect(result.aliases).toEqual([])
    })
  })

  describe('formatAliases', () => {
    it('should return displayAliases limited to maxDisplay', () => {
      const aliases = ['CVE-2024-1', 'GHSA-abc', 'OSV-2024-1', 'GHSA-def']

      const result = formatAliases(aliases, 2)

      expect(result.displayAliases).toEqual(['CVE-2024-1', 'GHSA-abc'])
      expect(result.remainingCount).toBe(2)
    })

    it('should default maxDisplay to 3', () => {
      const aliases = ['CVE-2024-1', 'GHSA-abc', 'OSV-2024-1', 'GHSA-def']

      const result = formatAliases(aliases)

      expect(result.displayAliases).toHaveLength(3)
      expect(result.remainingCount).toBe(1)
    })

    it('should handle aliases shorter than maxDisplay (remainingCount can be negative)', () => {
      const aliases = ['GHSA-abc']

      const result = formatAliases(aliases, 3)

      expect(result.displayAliases).toEqual(['GHSA-abc'])
      // Source computes aliases.length - maxDisplay directly (no Math.max)
      expect(result.remainingCount).toBe(-2)
    })

    it('should handle empty aliases array (remainingCount can be negative)', () => {
      const result = formatAliases([], 3)

      expect(result.displayAliases).toEqual([])
      // Source computes aliases.length - maxDisplay directly (no Math.max)
      expect(result.remainingCount).toBe(-3)
    })

    it('should return "Also known as" label when aliases contain CVE', () => {
      const result = formatAliases(['CVE-2024-1', 'GHSA-abc'])

      expect(result.akaLabel).toBe('Also known as')
    })

    it('should return "Also known as" when both CVE and GHSA present', () => {
      const result = formatAliases(['CVE-2024-1', 'GHSA-abc', 'OSV-2024-1'])

      expect(result.akaLabel).toBe('Also known as')
    })

    it('should return "GitHub Advisory" label when only GHSA aliases', () => {
      const result = formatAliases(['GHSA-abc', 'GHSA-def'])

      expect(result.akaLabel).toBe('GitHub Advisory')
    })

    it('should return "OSV ID" label when only OSV aliases', () => {
      const result = formatAliases(['OSV-2024-1', 'OSV-2024-2'])

      expect(result.akaLabel).toBe('OSV ID')
    })

    it('should return "Also known as" for aliases with no recognized prefix', () => {
      const result = formatAliases(['SOME-OTHER-ID'])

      expect(result.akaLabel).toBe('Also known as')
    })

    it('should return "GitHub Advisory" when GHSA and OSV present (no CVE)', () => {
      const result = formatAliases(['GHSA-abc', 'OSV-2024-1'])

      expect(result.akaLabel).toBe('GitHub Advisory')
    })
  })

  describe('getShortVulnDisplay', () => {
    it('should return primary ID when showAlias is false', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-1234',
        aliases: ['GHSA-5678'],
      })

      expect(getShortVulnDisplay(vuln, false)).toBe('CVE-2024-1234')
    })

    it('should return primary ID alone when showAlias is true but no aliases', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-1234',
        aliases: [],
      })

      expect(getShortVulnDisplay(vuln, true)).toBe('CVE-2024-1234')
    })

    it('should show first non-CVE alias in parentheses when showAlias is true', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-1234',
        aliases: ['GHSA-5678', 'OSV-2024-1'],
      })

      expect(getShortVulnDisplay(vuln, true)).toBe('CVE-2024-1234 (GHSA-5678)')
    })

    it('should fall back to first alias when all aliases are CVEs', () => {
      const vuln = makeVuln({
        id: 'GHSA-xxxx',
        aliases: ['CVE-2024-1111'],
      })

      const result = getShortVulnDisplay(vuln, true)

      // Primary is CVE (promoted), alias left is GHSA
      expect(result).toBe('CVE-2024-1111 (GHSA-xxxx)')
    })

    it('should default showAlias to false', () => {
      const vuln = makeVuln({
        id: 'CVE-2024-1234',
        aliases: ['GHSA-5678'],
      })

      expect(getShortVulnDisplay(vuln)).toBe('CVE-2024-1234')
    })
  })
})
