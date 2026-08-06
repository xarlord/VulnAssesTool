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

/** A single term in a parsed query: literal text to find, optionally negated (NOT). */
export interface SearchTerm {
  text: string
  negated: boolean
}

/**
 * A parsed boolean query in disjunctive form: an outer OR of groups, each group an AND
 * of terms. A haystack matches if ANY group matches; a group matches if ALL its terms are
 * satisfied (a negated term is satisfied when the text does NOT contain it).
 */
export type ParsedQuery = SearchTerm[][]

/**
 * Split a raw query into tokens, honoring "quoted phrases" (always literal terms, even if
 * they spell an operator) and the bare uppercase operators AND/OR/NOT. Lowercase and/or/not
 * are ordinary search terms — only the uppercase forms act as operators.
 */
function tokenizeQuery(query: string): Array<{ kind: 'and' | 'or' | 'not' | 'term'; text: string }> {
  const tokens: Array<{ kind: 'and' | 'or' | 'not' | 'term'; text: string }> = []
  const pattern = /"([^"]*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(query)) !== null) {
    if (match[1] !== undefined) {
      const phrase = match[1].trim().toLowerCase()
      if (phrase) tokens.push({ kind: 'term', text: phrase })
    } else {
      const word = match[2]
      if (word === 'AND') tokens.push({ kind: 'and', text: word })
      else if (word === 'OR') tokens.push({ kind: 'or', text: word })
      else if (word === 'NOT') tokens.push({ kind: 'not', text: word })
      else tokens.push({ kind: 'term', text: word.toLowerCase() })
    }
  }
  return tokens
}

/**
 * Parse a query string into an OR-of-AND boolean structure. Adjacent terms are implicitly
 * ANDed; OR starts a new group; NOT negates the term that follows it. Dangling or duplicate
 * operators are ignored so malformed input never throws.
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const groups: ParsedQuery = []
  let current: SearchTerm[] = []
  let negateNext = false

  for (const token of tokenizeQuery(query)) {
    if (token.kind === 'or') {
      if (current.length > 0) groups.push(current)
      current = []
      negateNext = false
    } else if (token.kind === 'not') {
      negateNext = true
    } else if (token.kind === 'term') {
      current.push({ text: token.text, negated: negateNext })
      negateNext = false
    }
    // An explicit AND is just a joiner between terms; nothing to record.
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/** True if the (already lowercased) haystack satisfies the parsed boolean query. */
export function matchesParsedQuery(haystack: string, query: ParsedQuery): boolean {
  if (query.length === 0) return false
  return query.some((group) =>
    group.every((term) => (term.negated ? !haystack.includes(term.text) : haystack.includes(term.text))),
  )
}

/**
 * Search the index with advanced boolean syntax (AND, OR, NOT) and "quoted phrases".
 * Adjacent terms are ANDed by default. Results are ranked by relevance, with title matches
 * and an exact single-term title match boosted (preserving the pre-boolean ranking).
 */
export function searchIndex(index: SearchIndex, query: string): SearchResult[] {
  if (!query.trim()) {
    return []
  }

  const parsed = parseSearchQuery(query)
  if (parsed.length === 0) {
    // The query was only operators/punctuation — there is nothing to match.
    return []
  }

  const positiveTerms = parsed
    .flat()
    .filter((term) => !term.negated)
    .map((term) => term.text)
  // A lone positive term (no OR/AND/NOT) enables the exact-title-match boost.
  const singleTerm = parsed.length === 1 && parsed[0].length === 1 && !parsed[0][0].negated ? parsed[0][0].text : null

  const results: SearchResult[] = []
  const collections = [index.projects, index.components, index.vulnerabilities]

  for (const collection of collections) {
    for (const result of collection.values()) {
      const titleLower = result.title.toLowerCase()
      const descLower = result.description.toLowerCase()

      // Join with a newline (never present in a single-line query) so a quoted phrase cannot
      // falsely match across the title/description boundary, while single terms still match
      // either field (AND-across-fields is intentional).
      if (!matchesParsedQuery(`${titleLower}\n${descLower}`, parsed)) {
        continue
      }

      let relevance = result.relevance
      if (positiveTerms.some((term) => titleLower.includes(term))) {
        relevance += 0.3
      }
      if (positiveTerms.some((term) => descLower.includes(term))) {
        relevance += 0.1
      }
      if (singleTerm !== null && titleLower === singleTerm) {
        relevance += 0.5
      }

      results.push({ ...result, relevance })
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
