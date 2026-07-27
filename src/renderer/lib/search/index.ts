/**
 * Search Module
 *
 * Exports all search-related functionality
 */

export {
  buildSearchIndex,
  searchIndex,
  parseSearchQuery,
  matchesParsedQuery,
  groupSearchResults,
  getSearchResultCounts,
  isValidSearchQuery,
  getSearchSuggestions,
  type SearchResult,
  type SearchIndex,
  type ParsedQuery,
  type SearchTerm,
} from './searchIndex'

export { getSavedSearches, saveSearch, deleteSavedSearch, type SavedSearch } from './savedSearches'
