import { describe, it, expect, beforeEach } from 'vitest'
import { CPEMatcher, cpeMatcher, type ComponentInput, type ParsedCPE } from './cpeMatcher'

describe('CPEMatcher', () => {
  let matcher: CPEMatcher

  beforeEach(() => {
    matcher = new CPEMatcher()
  })

  describe('normalizeInput', () => {
    it('should extract version from component name', () => {
      const result = matcher.normalizeInput('lodash-4.17.21')
      expect(result.product).toBe('lodash')
      expect(result.version).toBe('4.17.21')
    })

    it('should extract semantic version with patch', () => {
      const result = matcher.normalizeInput('react-18.2.0')
      expect(result.product).toBe('react')
      expect(result.version).toBe('18.2.0')
    })

    it('should extract version with major.minor', () => {
      const result = matcher.normalizeInput('express-4.18')
      expect(result.product).toBe('express')
      expect(result.version).toBe('4.18')
    })

    it('should extract single digit version', () => {
      const result = matcher.normalizeInput('webpack-5')
      expect(result.product).toBe('webpack')
      expect(result.version).toBe('5')
    })

    it('should remove common suffix "library"', () => {
      const result = matcher.normalizeInput('lodash-library')
      expect(result.product).toBe('lodash')
    })

    it('should remove common suffix "lib"', () => {
      const result = matcher.normalizeInput('crypto-lib')
      expect(result.product).toBe('crypto')
    })

    it('should remove common suffix "component"', () => {
      const result = matcher.normalizeInput('ui-component')
      expect(result.product).toBe('ui')
    })

    it('should remove common suffix "module"', () => {
      const result = matcher.normalizeInput('auth-module')
      expect(result.product).toBe('auth')
    })

    it('should remove common suffix "package"', () => {
      const result = matcher.normalizeInput('core-package')
      expect(result.product).toBe('core')
    })

    it('should handle names with underscores', () => {
      const result = matcher.normalizeInput('my_awesome_lib')
      expect(result.product).toBe('my awesome')
    })

    it('should handle names with spaces', () => {
      const result = matcher.normalizeInput('my awesome library')
      expect(result.product).toBe('my awesome')
    })

    it('should handle empty input', () => {
      const result = matcher.normalizeInput('')
      expect(result.product).toBe('')
      expect(result.version).toBe('')
    })

    it('should handle version at the beginning', () => {
      const result = matcher.normalizeInput('1.0.0-mylib')
      expect(result.version).toBe('1.0.0')
      expect(result.product).toBe('mylib')
    })
  })

  describe('tokenize', () => {
    it('should split hyphenated names', () => {
      const tokens = matcher.tokenize('my-awesome-library')
      expect(tokens).toContain('my')
      expect(tokens).toContain('awesome')
    })

    it('should split underscored names', () => {
      const tokens = matcher.tokenize('my_awesome_library')
      expect(tokens).toContain('my')
      expect(tokens).toContain('awesome')
    })

    it('should split dotted names', () => {
      const tokens = matcher.tokenize('my.awesome.library')
      expect(tokens).toContain('my')
      expect(tokens).toContain('awesome')
    })

    it('should filter out single character tokens', () => {
      const tokens = matcher.tokenize('a-b-c-library')
      expect(tokens).not.toContain('a')
      expect(tokens).not.toContain('b')
      expect(tokens).not.toContain('c')
    })

    it('should filter out common suffixes', () => {
      const tokens = matcher.tokenize('my-library')
      expect(tokens).not.toContain('library')
      expect(tokens).toContain('my')
    })

    it('should handle empty string', () => {
      const tokens = matcher.tokenize('')
      expect(tokens).toEqual([])
    })

    it('should handle multiple spaces', () => {
      const tokens = matcher.tokenize('my   awesome   library')
      expect(tokens).toEqual(['my', 'awesome'])
    })
  })

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(matcher.levenshteinDistance('hello', 'hello')).toBe(0)
    })

    it('should calculate single character insertion', () => {
      expect(matcher.levenshteinDistance('hello', 'helloo')).toBe(1)
    })

    it('should calculate single character deletion', () => {
      expect(matcher.levenshteinDistance('hello', 'helo')).toBe(1)
    })

    it('should calculate single character substitution', () => {
      expect(matcher.levenshteinDistance('hello', 'hallo')).toBe(1)
    })

    it('should handle empty strings', () => {
      expect(matcher.levenshteinDistance('', 'hello')).toBe(5)
      expect(matcher.levenshteinDistance('hello', '')).toBe(5)
      expect(matcher.levenshteinDistance('', '')).toBe(0)
    })

    it('should calculate multiple edits', () => {
      expect(matcher.levenshteinDistance('kitten', 'sitting')).toBe(3)
    })

    it('should handle completely different strings', () => {
      expect(matcher.levenshteinDistance('abc', 'xyz')).toBe(3)
    })

    it('should be case-sensitive', () => {
      expect(matcher.levenshteinDistance('Hello', 'hello')).toBe(1)
    })
  })

  describe('calculateConfidence', () => {
    it('should give high score for exact match', () => {
      const input: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '4.17.21',
      }
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: 'lodash',
        product: 'lodash',
        version: '4.17.21',
        uri: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
      }

      const confidence = matcher.calculateConfidence(input, cpe)
      expect(confidence).toBeGreaterThanOrEqual(80)
    })

    it('should give version exact match +40 points', () => {
      const input: ComponentInput = {
        id: '1',
        name: 'test-lib',
        version: '1.0.0',
      }
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: 'test',
        product: 'lib',
        version: '1.0.0',
        uri: 'cpe:2.3:a:test:lib:1.0.0:*:*:*:*:*:*:*',
      }

      const confidence = matcher.calculateConfidence(input, cpe)
      expect(confidence).toBeGreaterThanOrEqual(40)
    })

    it('should give version partial match +20 points', () => {
      const input: ComponentInput = {
        id: '1',
        name: 'test-lib',
        version: '1.0',
      }
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: 'test',
        product: 'lib',
        version: '1.0.0',
        uri: 'cpe:2.3:a:test:lib:1.0.0:*:*:*:*:*:*:*',
      }

      const confidence = matcher.calculateConfidence(input, cpe)
      expect(confidence).toBeGreaterThanOrEqual(20)
    })

    it('should give exact product match +10 points', () => {
      const input: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '',
      }
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: 'lodash',
        product: 'lodash',
        version: '*',
        uri: 'cpe:2.3:a:lodash:lodash:*:*:*:*:*:*:*',
      }

      const confidence = matcher.calculateConfidence(input, cpe)
      expect(confidence).toBeGreaterThanOrEqual(10)
    })

    it('should return maximum 100', () => {
      const input: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '4.17.21',
      }
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: 'lodash',
        product: 'lodash',
        version: '4.17.21',
        uri: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
      }

      const confidence = matcher.calculateConfidence(input, cpe)
      expect(confidence).toBeLessThanOrEqual(100)
    })

    it('should handle missing version', () => {
      const input: ComponentInput = {
        id: '1',
        name: 'test',
        version: '',
      }
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: 'test',
        product: 'test',
        version: '1.0.0',
        uri: 'cpe:2.3:a:test:test:1.0.0:*:*:*:*:*:*:*',
      }

      const confidence = matcher.calculateConfidence(input, cpe)
      expect(confidence).toBeGreaterThanOrEqual(0)
    })
  })

  describe('parseCPE', () => {
    it('should parse valid CPE 2.3 URI', () => {
      const result = matcher.parseCPE('cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*')
      expect(result).not.toBeNull()
      expect(result?.part).toBe('a')
      expect(result?.vendor).toBe('lodash')
      expect(result?.product).toBe('lodash')
      expect(result?.version).toBe('4.17.21')
    })

    it('should parse CPE with escaped characters', () => {
      const result = matcher.parseCPE('cpe:2.3:a:test\\:vendor:test\\*product:1.0:*:*:*:*:*:*:*')
      expect(result).not.toBeNull()
      expect(result?.vendor).toBe('test:vendor')
      expect(result?.product).toBe('test*product')
    })

    it('should parse operating system CPE', () => {
      const result = matcher.parseCPE('cpe:2.3:o:microsoft:windows_10:1809:*:*:*:*:*:*:*')
      expect(result).not.toBeNull()
      expect(result?.part).toBe('o')
      expect(result?.vendor).toBe('microsoft')
      expect(result?.product).toBe('windows-10')
    })

    it('should parse hardware CPE', () => {
      const result = matcher.parseCPE('cpe:2.3:h:cisco:router:*:*:*:*:*:*:*:*')
      expect(result).not.toBeNull()
      expect(result?.part).toBe('h')
    })

    it('should return null for invalid CPE format', () => {
      expect(matcher.parseCPE('invalid-cpe')).toBeNull()
      expect(matcher.parseCPE('')).toBeNull()
      expect(matcher.parseCPE('cpe:2.3:')).toBeNull()
    })

    it('should handle CPE with all wildcards', () => {
      const result = matcher.parseCPE('cpe:2.3:a:*:*:*:*:*:*:*:*:*:*')
      expect(result).not.toBeNull()
      expect(result?.vendor).toBe('*')
      expect(result?.product).toBe('*')
    })
  })

  describe('findCPEs', () => {
    it('should find exact match for known library', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '4.17.21',
      }

      const results = await matcher.findCPEs(component)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchType).toBe('exact')
      expect(results[0].confidence).toBeGreaterThanOrEqual(90)
      expect(results[0].vendor).toBe('lodash')
      expect(results[0].product).toBe('lodash')
    })

    it('should find match for express', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'express',
        version: '4.18.0',
      }

      const results = await matcher.findCPEs(component)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].vendor).toBe('expressjs')
      expect(results[0].product).toBe('express')
    })

    it('should find match for react', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'react',
        version: '18.2.0',
      }

      const results = await matcher.findCPEs(component)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].vendor).toBe('facebook')
      expect(results[0].product).toBe('react')
    })

    it('should generate fallback CPE for unknown library', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'unknown-random-library-xyz',
        version: '1.0.0',
      }

      const results = await matcher.findCPEs(component)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchType).toBe('fuzzy')
      expect(results[0].confidence).toBeLessThan(50)
      expect(results[0].cpe).toContain('cpe:2.3:a:')
    })

    it('should sort results by confidence', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'express',
        version: '4.18.0',
      }

      const results = await matcher.findCPEs(component)

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence)
      }
    })

    it('should include version in CPE', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '4.17.21',
      }

      const results = await matcher.findCPEs(component)

      expect(results[0].version).toBe('4.17.21')
      expect(results[0].cpe).toContain('4.17.21')
    })

    it('should handle component without version', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '',
      }

      const results = await matcher.findCPEs(component)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].cpe).toContain('cpe:2.3:a:')
    })

    it('should deduplicate results', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'react',
        version: '18.0.0',
      }

      const results = await matcher.findCPEs(component)
      const cpeSet = new Set(results.map((r) => r.cpe))

      expect(results.length).toBe(cpeSet.size)
    })
  })

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(cpeMatcher).toBeInstanceOf(CPEMatcher)
    })

    it('should work with singleton instance', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '4.17.21',
      }

      const results = await cpeMatcher.findCPEs(component)
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('should handle very long component names', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'a'.repeat(200),
        version: '1.0.0',
      }

      const results = await matcher.findCPEs(component)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle special characters in version', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'lodash',
        version: '4.17.21-beta.1',
      }

      const results = await matcher.findCPEs(component)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].version).toBe('4.17.21-beta.1')
    })

    it('should handle alphanumeric names', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'crypto123',
        version: '1.0.0',
      }

      const results = await matcher.findCPEs(component)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should handle unicode characters', async () => {
      const component: ComponentInput = {
        id: '1',
        name: 'cafe-library',
        version: '1.0.0',
      }

      const results = await matcher.findCPEs(component)
      expect(results.length).toBeGreaterThan(0)
    })
  })
})
