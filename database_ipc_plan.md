# Task Plan: Internal Database Usage - Resolve Dependencies

## Goal
Enable internal NVD database search functionality in VulnAssessTool by implementing proper Electron IPC communication between the renderer process (UI) and main process (database operations).

## Problem Statement
The current implementation has:
1. **Database module exists** (`src/renderer/lib/database/`) but uses Node.js APIs (`better-sqlite3`, `fs`, `path`) that don't work in the renderer process (browser/Electron renderer)
2. **Search page** has NVD database search UI but shows "coming soon" message
3. **No IPC handlers** in Electron main process for database operations
4. **No preload scripts** expose database APIs to the renderer process

## Phases

### Phase 1: Architecture & Design
**Status:** `in_progress`

**Tasks:**
- [ ] Design IPC communication architecture
  - Define IPC channel names for database operations
  - Define request/response types
  - Design error handling strategy
- [ ] Map database module functions to IPC handlers
  - NvdDatabase operations
  - NvdQueryBuilder operations
  - HybridScanner operations
- [ ] Plan preload script API surface

**Deliverables:**
- IPC channel specification document
- TypeScript type definitions for IPC messages

**Dependencies:** None

---

### Phase 2: Main Process Database Module
**Status:** `pending`

**Tasks:**
- [ ] Move database module to main process
  - Create `src/main/database/` directory structure
  - Move database files from renderer to main
  - Update imports for Node.js environment
- [ ] Create database initialization in main process
  - Initialize NvdDatabase on app startup
  - Handle database migration on first run
  - Set up database lifecycle management
- [ ] Add database file location configuration
  - Store database in userData directory
  - Handle cross-platform paths

**Deliverables:**
- Working database module in main process
- Database initialization on app startup

**Dependencies:** Phase 1 complete

---

### Phase 3: IPC Handlers Implementation
**Status:** `pending`

**Tasks:**
- [ ] Create IPC handlers for database operations
  - `db:nvd-search` - Search NVD database
  - `db:nvd-get-by-cve` - Get specific CVE
  - `db:nvd-get-stats` - Get database statistics
  - `db:sync-status` - Check sync status
  - `db:sync-start` - Start NVD sync
- [ ] Implement request validation
  - Validate CVE ID format
  - Validate query parameters
  - Sanitize inputs
- [ ] Add error handling and logging
  - Catch and return proper error messages
  - Log database operations
  - Handle database locked scenarios

**Deliverables:**
- IPC handlers in main process
- Error handling middleware
- Logging for database operations

**Dependencies:** Phase 2 complete

---

### Phase 4: Preload Script & Type Definitions
**Status:** `pending`

**Tasks:**
- [ ] Create preload script database API
  - Expose database APIs via `window.electronAPI.database`
  - Add type-safe wrappers
  - Implement promise-based API
- [ ] Create TypeScript type definitions
  - Define `DatabaseAPI` interface
  - Define request/response types
  - Add JSDoc comments
- [ ] Update existing preload script
  - Integrate database API with existing preload
  - Ensure context isolation

**Deliverables:**
- Updated preload script with database API
- TypeScript type definitions

**Dependencies:** Phase 3 complete

---

### Phase 5: Renderer Integration
**Status:** `pending`

**Tasks:**
- [ ] Update Search page to use database API
  - Replace placeholder with actual IPC calls
  - Implement search by CVE ID
  - Implement search by CPE
  - Display results properly
- [ ] Add loading states
  - Show spinner during search
  - Handle long-running queries
- [ ] Add error handling in UI
  - Display error messages
  - Add retry functionality
- [ ] Remove direct database imports from renderer
  - Clean up unused imports
  - Remove Node.js-specific code from renderer

**Deliverables:**
- Working NVD database search in Search page
- Proper error handling

**Dependencies:** Phase 4 complete

---

### Phase 6: Testing & Polish
**Status:** `pending`

**Tasks:**
- [ ] Write unit tests for IPC handlers
- [ ] Write integration tests for database operations
- [ ] Add E2E tests for search functionality
- [ ] Performance testing
  - Test with large databases
  - Measure query response times
- [ ] User acceptance testing
- [ ] Documentation updates

**Deliverables:**
- Test suite with >80% coverage
- Performance benchmarks
- Updated documentation

**Dependencies:** Phase 5 complete

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-02-11 | Use IPC for database access | Renderer cannot access Node.js APIs directly |
| 2025-02-11 | Keep database in main process | better-sqlite3 requires Node.js environment |

---

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| N/A | N/A | N/A |

---

## Notes

- Current database module location: `src/renderer/lib/database/`
- Main process location: `electron/main.ts`
- Preload script location: `electron/preload.ts` (to be created/updated)
- Database module uses better-sqlite3 which is Node.js-only
