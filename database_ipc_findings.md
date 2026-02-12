# Database IPC Implementation Findings

## Current State Analysis

### Database Module Location
- **Location:** `src/renderer/lib/database/`
- **Issue:** Uses Node.js-only modules (`better-sqlite3`, `fs`, `path`)
- **Problem:** These modules don't work in Electron's renderer process

### Files in Database Module
```
src/renderer/lib/database/
├── index.ts          - Exports all database functionality
├── nvdDb.ts          - Main NvdDatabase class (uses better-sqlite3)
├── nvdQueryBuilder.ts - Query builder for CVE searches
├── hybridScanner.ts   - Hybrid online/offline scanner
├── nvdSyncService.ts  - NVD data synchronization
├── updateScheduler.ts - Scheduled update management
├── chunkDownloader.ts - Chunked file downloading
├── hashVerifier.ts    - File hash verification
└── types.ts           - TypeScript type definitions
```

### Dependencies Used
```json
{
  "better-sqlite3": "^12.6.2",  // Node.js only - requires native bindings
  "@types/better-sqlite3": "^7.6.13"
}
```

### Electron Architecture Current State

#### Main Process (`electron/main.ts`)
- Has basic IPC setup
- Has simple handlers: `ping`, `app-version`, `app-platform`, `open-external`
- **No database handlers**

#### Preload Script
- Need to verify location and contents
- **No database API exposed**

#### Renderer Process
- Search page (`src/renderer/pages/Search.tsx`) has NVD search UI
- Shows "coming soon" message for NVD database search
- Has placeholder code that was disabled due to Node.js API issues

### Current NVD Search Implementation (Search.tsx)

```typescript
// Currently disabled - causes "promises is not exported" error
// because database module uses Node.js APIs
```

## Key Technical Constraints

### Electron Context Isolation
- Renderer runs in browser-like context
- No direct Node.js API access
- All Node.js operations must go through IPC

### better-sqlite3 Requirements
- Requires Node.js environment
- Uses native bindings
- Cannot run in renderer process

### IPC Communication Pattern
```
Renderer (UI) -> Preload -> IPC -> Main Process -> Database
```

## Research Findings

### NVD Database Schema
Based on code analysis, the database stores:
- CVE records with full details
- CPE match strings
- CVSS scores
- References
- Metadata (last update, version, etc.)

### Search Capabilities Needed
1. Search by CVE ID (exact match)
2. Search by CPE string (partial match)
3. Full-text search (descriptions)
4. Filter by severity
5. Filter by date range

### Performance Considerations
- Database file can be large (100MB+ for full NVD)
- Queries should be indexed
- Need to handle database locked scenarios
- Should support concurrent reads

## Architecture Decisions Needed

### 1. IPC Channel Naming Convention
**Options:**
- `db:nvd-search` - Prefix-based
- `database.nvd.search` - Dot notation
- `NVD_DATABASE_SEARCH` - Upper case

**Recommendation:** Prefix-based (`db:*`) for consistency

### 2. Request/Response Pattern
**Options:**
- Individual handlers per operation
- Generic handler with operation type
- RPC-style with method name

**Recommendation:** Individual handlers for type safety

### 3. Database Location
**Options:**
- App data directory (recommended)
- Alongside executable
- User documents

**Recommendation:** `app.getPath('userData')` for cross-platform

### 4. Error Handling Strategy
**Options:**
- Return error objects in response
- Throw IPC errors
- Custom error channel

**Recommendation:** Error objects in response for consistency

## Security Considerations

### Input Validation
- Validate CVE ID format (CVE-YYYY-NNNN*)
- Sanitize CPE strings
- Limit query result sizes

### Database Access
- Use prepared statements
- No SQL injection risks
- File permissions on database

## Open Questions

1. **Initial Database Population**
   - How does user get initial NVD data?
   - Download on first launch?
   - Bundle with app?

2. **Update Strategy**
   - Auto-update on schedule?
   - Manual update only?
   - Background sync?

3. **Database Size**
   - Full NVD vs. subset?
   - User's choice?

4. **Offline vs Online**
   - Should search work offline only?
   - Hybrid approach?

## Potential Issues Identified

### 1. Native Module Compilation
- `better-sqlite3` requires native compilation
- Electron rebuild may be needed
- Different binaries per platform

### 2. Database Migration
- Schema may change over time
- Need migration strategy
- Handle user data preservation

### 3. Concurrent Access
- Multiple renderer windows
- Database locking
- WAL mode configuration

## Next Steps

1. ✅ Create planning documents (this file)
2. ⏳ Design IPC specification
3. ⏳ Implement main process database module
4. ⏳ Create IPC handlers
5. ⏳ Update preload script
6. ⏳ Integrate with Search page
7. ⏳ Test thoroughly
