import { describe, it, expect } from 'vitest'
import {
  generateCPE,
  parseCPE,
  isValidCPE,
  suggestCPEs,
  normalizeCPE,
  convertCPE22To23,
  getKnownComponentNames,
} from './cpeUtils'

describe('cpeUtils', () => {
  describe('generateCPE', () => {
    it('should generate a valid CPE 2.3 string', () => {
      const cpe = generateCPE('a', 'apache', 'log4j', '2.14.1')
      expect(cpe).toBe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
    })

    it('should escape special characters in CPE fields', () => {
      const cpe = generateCPE('a', 'some-vendor', 'product:name', '1.0')
      expect(cpe).toBe('cpe:2.3:a:some-vendor:product\\:name:1.0:*:*:*:*:*:*:*')
    })

    it('should handle empty version', () => {
      const cpe = generateCPE('a', 'vendor', 'product', '')
      expect(cpe).toBe('cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*')
    })
  })

  describe('parseCPE', () => {
    it('should parse a valid CPE 2.3 string', () => {
      const parsed = parseCPE('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
      expect(parsed).not.toBeNull()
      expect(parsed?.part).toBe('a')
      expect(parsed?.vendor).toBe('apache')
      expect(parsed?.product).toBe('log4j')
      expect(parsed?.version).toBe('2.14.1')
    })

    it('should return null for invalid CPE', () => {
      expect(parseCPE('invalid')).toBeNull()
      expect(parseCPE('')).toBeNull()
    })
  })

  describe('isValidCPE', () => {
    it('should return true for valid CPE 2.3 strings', () => {
      expect(isValidCPE('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')).toBe(true)
      expect(isValidCPE('cpe:2.3:o:linux:linux_kernel:5.10:*:*:*:*:*:*:*')).toBe(true)
    })

    it('should return false for invalid CPE strings', () => {
      expect(isValidCPE('invalid')).toBe(false)
      expect(isValidCPE('')).toBe(false)
      expect(isValidCPE('cpe:invalid')).toBe(false)
    })
  })

  describe('suggestCPEs', () => {
    it('should suggest CPEs for known components', () => {
      const suggestions = suggestCPEs('react', '18.0.0')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0].confidence).toBe('high')
      expect(suggestions[0].vendor).toBe('facebook')
      expect(suggestions[0].product).toBe('react')
    })

    it('should suggest CPEs for log4j', () => {
      const suggestions = suggestCPEs('log4j', '2.14.1')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0].confidence).toBe('high')
      expect(suggestions[0].vendor).toBe('apache')
      expect(suggestions[0].product).toBe('log4j')
    })

    it('should generate inferred CPEs for unknown components', () => {
      const suggestions = suggestCPEs('unknown-component', '1.0.0')
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0].confidence).toBe('medium')
    })

    it('should return empty array for empty inputs', () => {
      expect(suggestCPEs('', '1.0.0')).toHaveLength(0)
      expect(suggestCPEs('component', '')).toHaveLength(0)
    })

    it('should handle component aliases', () => {
      const suggestions1 = suggestCPEs('node.js', '18.0.0')
      const suggestions2 = suggestCPEs('nodejs', '18.0.0')
      const suggestions3 = suggestCPEs('node', '18.0.0')

      // All should return suggestions (aliases are handled)
      expect(suggestions1.length).toBeGreaterThan(0)
      expect(suggestions2.length).toBeGreaterThan(0)
      expect(suggestions3.length).toBeGreaterThan(0)
    })
  })

  describe('normalizeCPE', () => {
    it('should return CPE 2.3 as-is', () => {
      const cpe = 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'
      expect(normalizeCPE(cpe)).toBe(cpe)
    })

    it('should convert CPE 2.2 to 2.3', () => {
      const cpe22 = 'cpe:/a:apache:log4j:2.14.1'
      const result = normalizeCPE(cpe22)
      expect(result).toBe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
    })

    it('should return null for invalid CPE', () => {
      expect(normalizeCPE('invalid')).toBeNull()
      expect(normalizeCPE('')).toBeNull()
    })
  })

  describe('convertCPE22To23', () => {
    it('should convert CPE 2.2 to CPE 2.3', () => {
      const result = convertCPE22To23('cpe:/a:apache:log4j:2.14.1')
      expect(result).toBe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
    })

    it('should return null for invalid CPE 2.2', () => {
      expect(convertCPE22To23('invalid')).toBeNull()
      expect(convertCPE22To23('cpe:2.3:a:apache:log4j:1.0')).toBeNull()
    })
  })

  describe('getKnownComponentNames', () => {
    it('should return a list of known component names', () => {
      const names = getKnownComponentNames()
      expect(names.length).toBeGreaterThan(0)
      expect(names).toContain('react')
      expect(names).toContain('log4j')
      expect(names).toContain('spring')
    })
  })
})
