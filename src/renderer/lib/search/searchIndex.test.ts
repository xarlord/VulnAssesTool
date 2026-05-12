import { describe, it, expect } from 'vitest'
import {
  buildSearchIndex,
  searchIndex,
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
