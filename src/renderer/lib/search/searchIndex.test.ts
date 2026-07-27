import { describe, it, expect } from 'vitest'
import {
  buildSearchIndex,
  searchIndex,
  parseSearchQuery,
  matchesParsedQuery,
  groupSearchResults,
  getSearchResultCounts,
  isValidSearchQuery,
  getSearchSuggestions,
  type SearchResult,
} from './searchIndex'
import type { Project } from '@@/types'

describe('searchIndex', () => {
  const mockProjects: Project[] = [
    {
      id: 'project-1',
      name: 'Web Application',
      description: 'Main web application project',
      createdAt: new Date(),
      updatedAt: new Date(),
      sbomFiles: [],
      components: [
        {
          id: 'component-1',
          name: 'react',
          version: '18.2.0',
          type: 'library',
          licenses: ['MIT'],
          vulnerabilities: [],
        },
        {
          id: 'component-2',
          name: 'express',
          version: '4.18.0',
          type: 'framework',
          licenses: ['MIT'],
          vulnerabilities: [],
        },
      ],
      vulnerabilities: [
        {
          id: 'CVE-2023-1234',
          source: 'nvd',
          severity: 'critical',
          description: 'Critical vulnerability in react',
          affectedComponents: ['component-1'],
          references: [],
        },
      ],
      statistics: {
        totalVulnerabilities: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalComponents: 2,
        vulnerableComponents: 1,
      },
    },
    {
      id: 'project-2',
      name: 'Mobile App',
      description: 'Mobile application project',
      createdAt: new Date(),
      updatedAt: new Date(),
      sbomFiles: [],
      components: [
        {
          id: 'component-3',
          name: 'react-native',
          version: '0.72.0',
          type: 'framework',
          licenses: ['MIT'],
          vulnerabilities: [],
        },
      ],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalComponents: 1,
        vulnerableComponents: 0,
      },
    },
  ]

  describe('buildSearchIndex', () => {
    it('should build an index from projects', () => {
      const index = buildSearchIndex(mockProjects)

      expect(index.projects.size).toBe(2)
      expect(index.components.size).toBe(3)
      expect(index.vulnerabilities.size).toBe(1)
    })

    it('should index projects with correct data', () => {
      const index = buildSearchIndex(mockProjects)
      const project = index.projects.get('project-1')

      expect(project).toBeDefined()
      expect(project?.type).toBe('project')
      expect(project?.title).toBe('Web Application')
      expect(project?.description).toBe('Main web application project')
    })

    it('should index components with project info', () => {
      const index = buildSearchIndex(mockProjects)
      const component = index.components.get('component-1')

      expect(component).toBeDefined()
      expect(component?.type).toBe('component')
      expect(component?.title).toBe('react')
      expect(component?.projectId).toBe('project-1')
      expect(component?.projectName).toBe('Web Application')
    })

    it('should index vulnerabilities with project info', () => {
      const index = buildSearchIndex(mockProjects)
      const vulnerability = index.vulnerabilities.get('CVE-2023-1234')

      expect(vulnerability).toBeDefined()
      expect(vulnerability?.type).toBe('vulnerability')
      expect(vulnerability?.title).toBe('CVE-2023-1234')
      expect(vulnerability?.projectId).toBe('project-1')
    })
  })

  describe('searchIndex', () => {
    it('should return empty array for empty query', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, '')

      expect(results).toEqual([])
    })

    it('should return empty array for whitespace query', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, '   ')

      expect(results).toEqual([])
    })

    it('should find projects by name', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'Web Application')

      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('project')
      expect(results[0].title).toBe('Web Application')
    })

    it('should find components by name', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'react')

      expect(results.length).toBeGreaterThan(0)
      const reactResults = results.filter((r) => r.title === 'react')
      expect(reactResults.length).toBeGreaterThan(0)
    })

    it('should find vulnerabilities by ID', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'CVE-2023-1234')

      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('vulnerability')
    })

    it('should search in descriptions', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'vulnerability')

      expect(results.length).toBeGreaterThan(0)
    })

    it('should be case insensitive', () => {
      const index = buildSearchIndex(mockProjects)
      const results1 = searchIndex(index, 'WEB APPLICATION')
      const results2 = searchIndex(index, 'web application')

      expect(results1).toHaveLength(results2.length)
    })

    it('should sort results by relevance', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'react')

      // Results should be sorted by relevance
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].relevance).toBeGreaterThanOrEqual(results[i + 1].relevance)
      }
    })

    it('should boost exact matches', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'react')

      const exactMatch = results.find((r) => r.title === 'react')
      expect(exactMatch).toBeDefined()
      if (exactMatch) {
        expect(exactMatch.relevance).toBeGreaterThan(0.8)
      }
    })
  })

  // FR-08.1 requires "advanced search syntax (AND, OR, NOT)". These tests pin the operator
  // semantics against the mock index: they must FAIL if a future change silently drops an
  // operator, flips AND/OR, ignores NOT, or stops treating a "quoted phrase" as literal —
  // each assertion contrasts a boolean query with the plain query it refines.
  describe('boolean search syntax (FR-08.1)', () => {
    it('ANDs adjacent terms by default, narrowing a plain-term match', () => {
      const index = buildSearchIndex(mockProjects)
      // Plain "react" matches the react component, react-native, and the vuln description (3).
      expect(searchIndex(index, 'react').length).toBe(3)
      // "react framework" requires BOTH words; only react-native's "framework" description qualifies.
      const results = searchIndex(index, 'react framework')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('react-native')
    })

    it('treats an explicit AND the same as the default conjunction', () => {
      const index = buildSearchIndex(mockProjects)
      expect(searchIndex(index, 'react AND framework')).toEqual(searchIndex(index, 'react framework'))
    })

    it('OR widens the match to either term', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'express OR mobile')
      const titles = results.map((r) => r.title)
      expect(titles).toContain('express') // matched by "express"
      expect(titles).toContain('Mobile App') // matched by "mobile"
    })

    it('NOT excludes results containing the negated term', () => {
      const index = buildSearchIndex(mockProjects)
      const withNative = searchIndex(index, 'react').map((r) => r.title)
      expect(withNative).toContain('react-native')

      const withoutNative = searchIndex(index, 'react NOT native').map((r) => r.title)
      expect(withoutNative).toContain('react') // the plain react component survives
      expect(withoutNative).not.toContain('react-native') // the negated term removes it
    })

    it('only treats UPPERCASE operators as operators (lowercase is a literal term)', () => {
      const index = buildSearchIndex(mockProjects)
      // Uppercase: react AND native -> react-native (both words in its title).
      expect(searchIndex(index, 'react AND native')).toHaveLength(1)
      // Lowercase "and" is a literal search term; no indexed text contains the word "and",
      // so the whole conjunction fails and nothing matches.
      expect(searchIndex(index, 'react and native')).toHaveLength(0)
    })

    it('treats a quoted phrase as a literal, order-sensitive substring', () => {
      const index = buildSearchIndex(mockProjects)
      // project-2's description is "Mobile application project": the phrase appears in order.
      expect(searchIndex(index, '"mobile application"').map((r) => r.title)).toContain('Mobile App')
      // Reversed order is not a substring, so the quoted phrase matches nothing...
      expect(searchIndex(index, '"application mobile"')).toHaveLength(0)
      // ...but the same two words unquoted are ANDed and still match (order-independent).
      expect(searchIndex(index, 'application mobile').map((r) => r.title)).toContain('Mobile App')
    })

    it('parseSearchQuery builds OR-of-AND groups with NOT flags', () => {
      expect(parseSearchQuery('a AND b OR c')).toEqual([
        [
          { text: 'a', negated: false },
          { text: 'b', negated: false },
        ],
        [{ text: 'c', negated: false }],
      ])
      expect(parseSearchQuery('NOT x')).toEqual([[{ text: 'x', negated: true }]])
      // A query of only operators parses to nothing (and must not throw).
      expect(parseSearchQuery('AND OR NOT')).toEqual([])
    })

    it('matchesParsedQuery evaluates OR of AND groups against a haystack', () => {
      const parsed = parseSearchQuery('foo AND bar OR baz')
      expect(matchesParsedQuery('the foo and bar here', parsed)).toBe(true) // first group
      expect(matchesParsedQuery('only baz', parsed)).toBe(true) // second group
      expect(matchesParsedQuery('foo without the other', parsed)).toBe(false) // neither group
      expect(matchesParsedQuery('anything', [])).toBe(false) // empty query never matches
    })
  })

  describe('groupSearchResults', () => {
    it('should group results by type', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'react')
      const grouped = groupSearchResults(results)

      expect(grouped.projects).toBeDefined()
      expect(grouped.components).toBeDefined()
      expect(grouped.vulnerabilities).toBeDefined()
    })

    it('should correctly categorize results', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'react')
      const grouped = groupSearchResults(results)

      expect(grouped.projects.every((r) => r.type === 'project')).toBe(true)
      expect(grouped.components.every((r) => r.type === 'component')).toBe(true)
      expect(grouped.vulnerabilities.every((r) => r.type === 'vulnerability')).toBe(true)
    })
  })

  describe('getSearchResultCounts', () => {
    it('should return correct counts', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'react')
      const counts = getSearchResultCounts(results)
      const grouped = groupSearchResults(results)

      expect(counts.total).toBe(results.length)
      expect(counts.projects).toBe(grouped.projects.length)
      expect(counts.components).toBe(grouped.components.length)
      expect(counts.vulnerabilities).toBe(grouped.vulnerabilities.length)
    })

    it('should return zero counts for no results', () => {
      const index = buildSearchIndex(mockProjects)
      const results = searchIndex(index, 'nonexistent')
      const counts = getSearchResultCounts(results)

      expect(counts.total).toBe(0)
      expect(counts.projects).toBe(0)
      expect(counts.components).toBe(0)
      expect(counts.vulnerabilities).toBe(0)
    })
  })

  describe('isValidSearchQuery', () => {
    it('should return true for valid queries', () => {
      expect(isValidSearchQuery('test')).toBe(true)
      expect(isValidSearchQuery('ab')).toBe(true)
      expect(isValidSearchQuery('  test  ')).toBe(true)
    })

    it('should return false for invalid queries', () => {
      expect(isValidSearchQuery('')).toBe(false)
      expect(isValidSearchQuery('a')).toBe(false)
      expect(isValidSearchQuery('   ')).toBe(false)
    })
  })

  describe('getSearchSuggestions', () => {
    it('should return empty array for empty query', () => {
      const index = buildSearchIndex(mockProjects)
      const suggestions = getSearchSuggestions(index, '')

      expect(suggestions).toEqual([])
    })

    it('should return suggestions starting with query', () => {
      const index = buildSearchIndex(mockProjects)
      const suggestions = getSearchSuggestions(index, 're')

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.every((s) => s.toLowerCase().startsWith('re'))).toBe(true)
    })

    it('should limit suggestions to specified limit', () => {
      const index = buildSearchIndex(mockProjects)
      const suggestions = getSearchSuggestions(index, 'e', 2)

      expect(suggestions.length).toBeLessThanOrEqual(2)
    })

    it('should return unique suggestions', () => {
      const index = buildSearchIndex(mockProjects)
      const suggestions = getSearchSuggestions(index, 'react')

      const uniqueSuggestions = new Set(suggestions)
      expect(uniqueSuggestions.size).toBe(suggestions.length)
    })
  })
})

// Helper function
function groupedResults(type: string, results: SearchResult[]): number {
  return results.filter((r) => r.type === type).length
}
