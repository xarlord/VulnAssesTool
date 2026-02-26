# Plan: Full CVE Database Integration (1999-Present)

## Context

The user wants to integrate the complete CVE database starting from 1999 to provide comprehensive vulnerability coverage in the Vulnerability Assessment Tool.

**Current State:**
- Local NVD database exists but may have limited historical data
- Database sync service fetches from NVD API v2.0
- Rate limiting applies (60 requests/30 seconds without API key)
- CVEs from 1999-2026 total approximately 250,000+ records

**Challenges:**
1. **Data Volume**: ~250,000+ CVEs since 1999
2. **API Rate Limits**: NVD API limits without key (5 req/30s rolling, 30s timeout)
3. **Storage**: Each CVE record ~2-5KB, total database ~500MB-1GB
4. **Sync Time**: Full historical sync could take hours
5. **Memory**: Loading large datasets requires pagination

---

## Implementation Plan

### Phase 1: Database Schema Enhancement

**Goal:** Ensure database schema can handle full historical data efficiently.

**Files to Modify:**
- `electron/database/nvdDatabase.ts`

**Tasks:**
1. Review current indexes for query performance
2. Add composite indexes for common search patterns
3. Verify `cpeSearch` table structure for CPE lookups
4. Add migration path for existing databases

**Schema Optimization:**
```sql
-- Ensure efficient CPE lookups
CREATE INDEX IF NOT EXISTS idx_cves_cpe_part_vendor_product
ON cpe_search(part, vendor, product);

-- Optimize severity filtering
CREATE INDEX IF NOT EXISTS idx_cves_severity_published
ON cves(severity, published_at DESC);

-- Speed up text searches
CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
  cve_id, description,
  content=cves, content_rowid=rowid
);
```

---

### Phase 2: Bulk Data Import System

**Goal:** Create efficient bulk import for initial database seeding.

**New Files:**
- `electron/database/nvdBulkImporter.ts`

**Features:**
1. **Chunked Import**: Process data in batches of 1000 CVEs
2. **Progress Tracking**: Report progress percentage
3. **Resume Capability**: Track last imported year/CVE
4. **Error Recovery**: Log and skip problematic records

**Implementation:**
```typescript
interface BulkImportConfig {
  startYear: number      // 1999
  endYear: number        // Current year
  batchSize: number      // 1000 CVEs per batch
  onProgress: (progress: ImportProgress) => void
}

interface ImportProgress {
  currentYear: number
  totalYears: number
  cvesImported: number
  cvesSkipped: number
  percentComplete: number
  estimatedTimeRemaining: number  // seconds
}
```

---

### Phase 3: NVD API v2.0 Bulk Download

**Goal:** Implement efficient data fetching from NVD API.

**Files to Modify:**
- `electron/database/nvd/nvdApiV2Client.ts`

**Enhancements:**
1. **Year-Based Pagination**: Fetch by year (1999-2026)
2. **Rate Limit Handling**: Respect API limits (with API key: 50 req/30s)
3. **Parallel Requests**: Fetch multiple years concurrently (within limits)
4. **Caching**: Cache API responses to avoid re-fetching

**API Strategy:**
```
Without API Key:
- 5 requests per 30-second rolling window
- ~6 seconds between requests
- Full sync: ~8-12 hours

With API Key:
- 50 requests per 30-second rolling window
- ~0.6 seconds between requests
- Full sync: ~1-2 hours
```

---

### Phase 4: Initial Data Seeding

**Goal:** Provide pre-seeded database or seed-on-first-run.

**Options:**

**Option A: Pre-built Database Distribution**
- Build complete database during release process
- Include in application bundle or as separate download
- Pros: Instant availability, no user wait
- Cons: Large download size (~500MB+)

**Option B: Background Initial Sync**
- Detect empty database on first run
- Start background sync from 1999
- Show progress in UI
- Pros: Fresh data, smaller initial download
- Cons: User must wait for data

**Option C: Hybrid Approach (Recommended)**
- Include recent 2 years of CVEs pre-seeded
- Background sync for historical data (1999-2 years ago)
- User gets immediate value with recent CVEs
- Historical data fills in over time

---

### Phase 5: Incremental Sync Strategy

**Goal:** Efficient ongoing updates after initial seeding.

**Files to Modify:**
- `electron/database/nvdSyncService.ts`

**Enhancements:**
1. **Delta Sync**: Only fetch CVEs modified since last sync
2. **Priority Queue**: Recent CVEs first, historical later
3. **Smart Scheduling**: Auto-sync during idle time
4. **Bandwidth Awareness**: Pause on metered connections

**Sync Priority:**
1. **Critical**: Current year + previous year (always fresh)
2. **High**: Last 5 years (weekly updates)
3. **Low**: 1999-5 years ago (monthly updates)

---

### Phase 6: UI Integration

**Goal:** Provide visibility into database status and sync progress.

**Files to Modify:**
- `src/renderer/pages/Settings.tsx`
- `src/renderer/components/DatabaseStatus.tsx` (new)

**Features:**
1. **Database Stats Panel**:
   - Total CVEs in database
   - Coverage by year
   - Last sync timestamp
   - Database size on disk

2. **Sync Progress Modal**:
   - Current year being synced
   - Progress bar with percentage
   - Estimated time remaining
   - Cancel/Pause buttons

3. **Manual Sync Controls**:
   - "Sync Recent" (last 2 years)
   - "Sync Full History" (1999-present)
   - Schedule automatic sync

---

### Phase 7: Performance Optimization

**Goal:** Ensure fast searches even with 250K+ CVEs.

**Optimizations:**
1. **Full-Text Search (FTS)**:
   - Implement SQLite FTS5 for description searches
   - Sub-second text searches across all CVEs

2. **Query Caching**:
   - Cache frequent search patterns
   - Pre-compute common CPE lookups

3. **Lazy Loading**:
   - Paginate results (50 per page)
   - Load details on-demand

4. **Connection Pooling**:
   - Maintain read connection during searches
   - Separate write connection for syncs

---

## Critical Files

| File | Purpose |
|------|---------|
| `electron/database/nvdDatabase.ts` | Database schema & queries |
| `electron/database/nvdBulkImporter.ts` | NEW - Bulk data import |
| `electron/database/nvd/nvdApiV2Client.ts` | NVD API client |
| `electron/database/nvdSyncService.ts` | Sync orchestration |
| `src/renderer/components/DatabaseStatus.tsx` | NEW - UI status panel |
| `src/renderer/pages/Settings.tsx` | Settings UI |

---

## Timeline Estimate

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Schema Enhancement | Small |
| 2 | Bulk Import System | Medium |
| 3 | API Client Enhancement | Medium |
| 4 | Initial Data Seeding | Medium |
| 5 | Incremental Sync | Medium |
| 6 | UI Integration | Medium |
| 7 | Performance Optimization | Medium |

---

## Verification

1. **Unit Tests**:
   - Bulk importer handles all years
   - Rate limiter respects API limits
   - Database queries perform under 100ms

2. **Integration Tests**:
   - Full sync completes without errors
   - Resume continues from interruption
   - Database integrity after import

3. **Performance Tests**:
   - Search returns results in <500ms
   - Memory usage stays under 500MB
   - Database size matches expected range

---

## Configuration Options

```typescript
interface DatabaseConfig {
  // Sync settings
  autoSync: boolean
  syncInterval: number  // hours
  syncPriority: 'recent' | 'full'

  // API settings
  nvdApiKey?: string
  respectRateLimits: boolean

  // Storage settings
  maxDatabaseSize: number  // MB
  pruneOldCves: boolean
  pruneAfterYears: number

  // Performance settings
  searchResultLimit: number
  enableSearchCache: boolean
  cacheSize: number  // MB
}
```

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Schema Enhancement)
3. Implement Phase 2-3 in parallel
4. Test with subset of years (2024-2025) first
5. Scale to full historical data
