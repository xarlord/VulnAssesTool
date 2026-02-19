# NVD Local Database Extension Plan

**Project:** VulnAssesTool - NVD Local Database Extension
**Created:** 2026-02-18
**Status:** PLANNING

---

## Executive Summary

This extension adds comprehensive local NVD (National Vulnerability Database) support to VulnAssesTool, enabling offline vulnerability scanning without depending on external API calls. The extension will download and store CVE data from 2021-2026 (~250,000+ vulnerabilities) in a high-performance local database.

---

## 1. Current State Analysis

### Existing Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| SQLite Database | ✅ Exists | `nvd-data.db` using sql.js (WebAssembly) |
| Database Schema | ✅ Exists | CVEs, CPE matches, references tables |
| NVD Downloader | ⚠️ Partial | Uses deprecated NVD 1.1 JSON format |
| Bulk Import | ✅ Exists | Multi-threaded downloader, stream parser |
| FTS5 Search | ✅ Exists | Full-text search on CVE descriptions |
| API Integration | ✅ Exists | NVD API 2.0 provider |

### Current Database Schema

```sql
-- Existing tables
CREATE TABLE cves (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  cvss_score REAL,
  cvss_vector TEXT,
  severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  published_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  source TEXT CHECK(source IN ('NVD', 'OSV'))
);

CREATE TABLE cpe_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,
  cpe_text TEXT NOT NULL,
  vulnerable INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
);

CREATE TABLE "references" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT,
  tags TEXT,
  FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
);
```

### Current Limitations

1. **Outdated Feed Format**: Using deprecated NVD 1.1 JSON format
2. **Rate Limiting Issues**: No proper API key handling for bulk downloads
3. **No Delta Updates**: Full year downloads even for small updates
4. **Memory Constraints**: Large files loaded entirely into memory
5. **No Compression**: Database not optimized for size

---

## 2. NVD Data Source Analysis

### NVD API 2.0 (Recommended)

**Endpoint:** `https://services.nvd.nist.gov/rest/json/cves/2.0`

**Features:**
- RESTful API with JSON responses
- Rate limiting: 5 requests/30 seconds (no key), 50 requests/30 seconds (with key)
- Pagination support (max 2000 results per page)
- Date range filtering
- Full CVE details including CVSS v3.1

**Example Request:**
```
GET https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=2021-01-01T00:00:00.000&pubEndDate=2021-12-31T23:59:59.999
```

### NVD JSON Feed 2.0 (Alternative)

**URL Pattern:** `https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-{year}.json.gz`

**Status:** Being phased out in favor of API

**Note:** May not be available for recent years (2024-2026)

---

## 3. Extension Architecture

### 3.1 Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  NVD API 2.0    │────▶│  Rate-Limited    │────▶│  Stream Parser  │
│  (Primary)      │     │  Downloader      │     │  (JSON Stream)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                        ┌──────────────────┐              │
                        │  Bulk Import     │◀─────────────┘
                        │  Manager         │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  SQLite Database │
                        │  (nvd-data.db)   │
                        └──────────────────┘
```

### 3.2 New Components

| Component | Description | Priority |
|-----------|-------------|----------|
| `NvdApiV2Client` | NVD API 2.0 client with rate limiting | HIGH |
| `NvdDeltaSync` | Incremental updates (only new/modified CVEs) | MEDIUM |
| `DatabaseOptimizer` | Vacuum, index optimization, compression | MEDIUM |
| `NvdCacheManager` | Local cache for API responses | LOW |
| `DatabaseValidator` | Integrity checks and repair | LOW |

---

## 4. Database Schema Extensions

### 4.1 Enhanced CVE Table

```sql
-- Extended CVE table with additional NVD 2.0 fields
CREATE TABLE cves_v2 (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  -- CVSS v3.1
  cvss_v31_score REAL,
  cvss_v31_vector TEXT,
  cvss_v31_severity TEXT,
  -- CVSS v3.0
  cvss_v30_score REAL,
  cvss_v30_vector TEXT,
  cvss_v30_severity TEXT,
  -- CVSS v2.0
  cvss_v2_score REAL,
  cvss_v2_vector TEXT,
  cvss_v2_severity TEXT,
  -- Dates
  published_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- Source tracking
  source TEXT NOT NULL DEFAULT 'NVD',
  -- Additional metadata
  vuln_status TEXT,  -- 'ANALYZED', 'WAITING', etc.
  assigner TEXT,     -- CNA that assigned the CVE
  -- Sync tracking
  last_synced_at TEXT NOT NULL,
  CONSTRAINT valid_severity CHECK (
    cvss_v31_severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') OR cvss_v31_severity IS NULL
  )
);
```

### 4.2 New Tables

```sql
-- CWE (Common Weakness Enumeration) references
CREATE TABLE cwe_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,
  cwe_id TEXT NOT NULL,  -- e.g., 'CWE-79'
  description TEXT,
  FOREIGN KEY (cve_id) REFERENCES cves_v2(id) ON DELETE CASCADE
);

-- CPE (Common Platform Enumeration) with version ranges
CREATE TABLE cpe_matches_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,
  cpe23_uri TEXT NOT NULL,
  vulnerable INTEGER NOT NULL DEFAULT 1,
  -- Version range
  version_start_including TEXT,
  version_start_excluding TEXT,
  version_end_including TEXT,
  version_end_excluding TEXT,
  FOREIGN KEY (cve_id) REFERENCES cves_v2(id) ON DELETE CASCADE
);

-- References with enhanced metadata
CREATE TABLE references_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cve_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT,
  tags TEXT,           -- Comma-separated tags
  reference_type TEXT, -- 'vendor', 'third-party', etc.
  FOREIGN KEY (cve_id) REFERENCES cves_v2(id) ON DELETE CASCADE
);

-- Sync metadata
CREATE TABLE sync_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  last_sync_at TEXT NOT NULL,
  total_cves INTEGER DEFAULT 0,
  last_error TEXT,
  sync_duration_ms INTEGER
);

-- Download queue for resumable downloads
CREATE TABLE download_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'downloading', 'complete', 'failed'
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);
```

### 4.3 Indexes for Performance

```sql
-- Performance indexes
CREATE INDEX idx_cves_v2_published ON cves_v2(published_at);
CREATE INDEX idx_cves_v2_modified ON cves_v2(modified_at);
CREATE INDEX idx_cves_v2_severity ON cves_v2(cvss_v31_severity);
CREATE INDEX idx_cves_v2_score ON cves_v2(cvss_v31_score);
CREATE INDEX idx_cpes_v2_cve ON cpe_matches_v2(cve_id);
CREATE INDEX idx_cpes_v2_uri ON cpe_matches_v2(cpe23_uri);
CREATE INDEX idx_cwes_cve ON cwe_references(cve_id);
CREATE INDEX idx_refs_cve ON references_v2(cve_id);

-- FTS5 for full-text search
CREATE VIRTUAL TABLE cves_fts USING fts5(
  id,
  description,
  content='cves_v2',
  content_rowid='rowid'
);
```

---

## 5. Implementation Plan

### Phase 1: API Client & Infrastructure (Week 1)

| Task | Description | Effort |
|------|-------------|--------|
| 1.1 | Create `NvdApiV2Client` class with rate limiting | 4h |
| 1.2 | Implement pagination handling for large result sets | 2h |
| 1.3 | Add API key management from settings | 2h |
| 1.4 | Create response caching layer | 3h |
| 1.5 | Unit tests for API client | 3h |

### Phase 2: Database Schema Migration (Week 1-2)

| Task | Description | Effort |
|------|-------------|--------|
| 2.1 | Design migration script (v1 to v2 schema) | 2h |
| 2.2 | Implement data migration with zero downtime | 4h |
| 2.3 | Create FTS5 indexes | 2h |
| 2.4 | Write migration tests | 2h |
| 2.5 | Add rollback capability | 2h |

### Phase 3: Bulk Download System (Week 2)

| Task | Description | Effort |
|------|-------------|--------|
| 3.1 | Create year-by-year download orchestrator | 4h |
| 3.2 | Implement resumable downloads (queue table) | 4h |
| 3.3 | Add progress tracking and UI integration | 3h |
| 3.4 | Implement error recovery and retry logic | 3h |
| 3.5 | Create download scheduling (background) | 3h |

### Phase 4: Data Import Pipeline (Week 2-3)

| Task | Description | Effort |
|------|-------------|--------|
| 4.1 | Update stream parser for NVD 2.0 format | 4h |
| 4.2 | Optimize bulk insert (transactions, batching) | 4h |
| 4.3 | Add CPE version range parsing | 3h |
| 4.4 | Implement CWE reference extraction | 2h |
| 4.5 | Create import validation and verification | 3h |

### Phase 5: Delta Sync System (Week 3)

| Task | Description | Effort |
|------|-------------|--------|
| 5.1 | Implement incremental update detection | 4h |
| 5.2 | Create delta sync scheduler | 3h |
| 5.3 | Add conflict resolution for updated CVEs | 3h |
| 5.4 | Implement automatic daily sync | 2h |
| 5.5 | Create sync status UI | 3h |

### Phase 6: UI Integration (Week 3-4)

| Task | Description | Effort |
|------|-------------|--------|
| 6.1 | Create NVD Database Settings page | 4h |
| 6.2 | Add download progress indicator | 3h |
| 6.3 | Create database status dashboard | 4h |
| 6.4 | Add manual sync controls | 2h |
| 6.5 | Implement database backup/restore UI | 3h |

### Phase 7: Testing & Documentation (Week 4)

| Task | Description | Effort |
|------|-------------|--------|
| 7.1 | Integration tests for full download flow | 4h |
| 7.2 | Performance benchmarks (import speed) | 3h |
| 7.3 | Update API documentation | 2h |
| 7.4 | Create user guide for NVD sync | 2h |
| 7.5 | Final QA and bug fixes | 4h |

---

## 6. Estimated Data Volume

### NVD CVE Counts (2021-2025)

| Year | Approximate CVEs | JSON Size (compressed) |
|------|------------------|------------------------|
| 2021 | ~20,000 | ~150 MB |
| 2022 | ~25,000 | ~180 MB |
| 2023 | ~28,000 | ~200 MB |
| 2024 | ~40,000 | ~280 MB |
| 2025 | ~15,000 (partial) | ~100 MB |
| **Total** | **~128,000** | **~910 MB** |

### Database Size Estimates

| Metric | Estimate |
|--------|----------|
| SQLite database size | 500 MB - 1 GB |
| With indexes | 750 MB - 1.5 GB |
| With FTS5 | 1 GB - 2 GB |
| Cache directory | 1 GB temporary |

---

## 7. Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Initial download time | < 2 hours | With API key, parallel downloads |
| Full import time | < 30 minutes | Bulk insert with transactions |
| Delta sync time | < 5 minutes | Daily updates only |
| Search response time | < 100ms | FTS5 indexed search |
| Memory usage | < 500 MB | Streaming parser |

---

## 8. Security Considerations

1. **API Key Storage**: Use Electron's safeStorage for NVD API key
2. **HTTPS Only**: All NVD API calls over HTTPS
3. **Input Validation**: Sanitize all CVE data before import
4. **Rate Limiting**: Respect NVD API limits to avoid blocking
5. **Data Integrity**: Validate JSON signatures where available

---

## 9. Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `sql.js` | SQLite in WebAssembly | ^1.10.3 |
| `node-fetch` | HTTP client | ^3.3.2 |
| `better-sqlite3` | Native SQLite (optional optimization) | ^11.0.0 |

---

## 10. Success Criteria

- [ ] Download and import all CVEs from 2021-2026
- [ ] Database size under 2 GB with full data
- [ ] Search queries return in under 100ms
- [ ] Daily delta sync completes in under 5 minutes
- [ ] Zero data loss during schema migration
- [ ] 95%+ test coverage for new code
- [ ] All existing functionality preserved

---

## 11. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| NVD API changes | Medium | High | Abstract API layer, version detection |
| Rate limit exceeded | High | Medium | Queue-based downloads, API key support |
| Database corruption | Low | High | Regular backups, WAL mode |
| Memory exhaustion | Medium | Medium | Streaming parser, batch inserts |
| Schema incompatibility | Low | High | Migration scripts with rollback |

---

## 12. Next Steps

1. **Immediate**: Set up NVD API key for testing
2. **Week 1**: Implement API v2 client and test against NVD
3. **Week 2**: Create database migration and test with sample data
4. **Week 3**: Build download pipeline with progress tracking
5. **Week 4**: UI integration and final testing

---

**Plan Version:** 1.0
**Last Updated:** 2026-02-18
**Author:** DevFlow Enforcer
