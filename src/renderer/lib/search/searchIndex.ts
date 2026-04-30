import type { Project } from '@@/types'

/**
 * Search index for global search functionality
 * Simple text-based search (no fuzzy search for MVP)
 */

export interface SearchResult {
  type: 'project' | 'component' | 'vulnerability'
  id: string
  title: string
  description: string
  projectId?: string
  projectName?: string
  relevance: number
}

export interface SearchIndex {
  projects: Map<string, SearchResult>
  components: Map<string, SearchResult>
  vulnerabilities: Map<string, SearchResult>
}

/**
 * Build a search index from projects, components, and vulnerabilities
 */
export function buildSearchIndex(projects: Project[]): SearchIndex {
  const index: SearchIndex = {
    projects: new Map(),
    components: new Map(),
    vulnerabilities: new Map(),
  }

  for (const project of projects) {
    // Index project
    const projectResult: SearchResult = {
      type: 'project',
      id: project.id,
      title: project.name,
      description: project.description || '',
      projectId: project.id,
      projectName: project.name,
      relevance: 1,
    }
    index.projects.set(project.id, projectResult)

    // Index components
    for (const component of project.components) {
      const componentResult: SearchResult = {
        type: 'component',
        id: component.id,
        title: component.name,
        description: `${component.version} • ${component.type}`,
        projectId: project.id,
        projectName: project.name,
        relevance: 0.8,
      }
      index.components.set(component.id, componentResult)
    }

    // Index vulnerabilities
    for (const vulnerability of project.vulnerabilities) {
      const vulnResult: SearchResult = {
        type: 'vulnerability',
        id: vulnerability.id,
        title: vulnerability.id,
        description: vulnerability.description,
        projectId: project.id,
        projectName: project.name,
        relevance: 0.9,
      }
      index.vulnerabilities.set(vulnerability.id, vulnResult)
    }
  }

  return index
}

/**
 * Simple text matching search
 */
export function searchIndex(index: SearchIndex, query: string): SearchResult[] {
  if (!query.trim()) {
    return []
  }

  const lowerQuery = query.toLowerCase()
  const results: SearchResult[] = []

  // Search in all collections
  const collections = [index.projects, index.components, index.vulnerabilities]

  for (const collection of collections) {
    for (const [_id, result] of collection.entries()) {
      const titleMatch = result.title.toLowerCase().includes(lowerQuery)
      const descriptionMatch = result.description.toLowerCase().includes(lowerQuery)

      if (titleMatch || descriptionMatch) {
        // Calculate relevance score
        let relevance = result.relevance

        if (titleMatch) {
          relevance += 0.3
        }

        if (descriptionMatch) {
          relevance += 0.1
        }

        // Boost exact matches
        if (result.title.toLowerCase() === lowerQuery) {
          relevance += 0.5
        }

        results.push({
          ...result,
          relevance,
        })
      }
    }
  }

  // Sort by relevance
  return results.sort((a, b) => b.relevance - a.relevance)
}

/**
 * Group search results by type
 */
export function groupSearchResults(results: SearchResult[]): {
  projects: SearchResult[]
  components: SearchResult[]
  vulnerabilities: SearchResult[]
} {
  return {
    projects: results.filter((r) => r.type === 'project'),
    components: results.filter((r) => r.type === 'component'),
    vulnerabilities: results.filter((r) => r.type === 'vulnerability'),
  }
}

/**
 * Get search result count by type
 */
export function getSearchResultCounts(results: SearchResult[]): {
  total: number
  projects: number
  components: number
  vulnerabilities: number
} {
  return {
    total: results.length,
    projects: results.filter((r) => r.type === 'project').length,
    components: results.filter((r) => r.type === 'component').length,
    vulnerabilities: results.filter((r) => r.type === 'vulnerability').length,
  }
}

/**
 * Check if search query is valid
 */
export function isValidSearchQuery(query: string): boolean {
  return query.trim().length >= 2
}

/**
 * Get search suggestions based on query
 */
export function getSearchSuggestions(index: SearchIndex, query: string, limit = 5): string[] {
  if (!query.trim()) {
    return []
  }

  const lowerQuery = query.toLowerCase()
  const suggestions = new Set<string>()

  // Collect suggestions from titles
  for (const collection of [index.projects, index.components, index.vulnerabilities]) {
    for (const result of collection.values()) {
      const title = result.title.toLowerCase()

      // Add titles that start with the query
      if (title.startsWith(lowerQuery)) {
        suggestions.add(result.title)
      }

      // Add titles that contain the query as a word
      const words = title.split(/\s+/)
      for (const word of words) {
        if (word.startsWith(lowerQuery) && word !== lowerQuery) {
          suggestions.add(result.title)
        }
      }

      if (suggestions.size >= limit) {
        break
      }
    }

    if (suggestions.size >= limit) {
      break
    }
  }

  return Array.from(suggestions).slice(0, limit)
}
