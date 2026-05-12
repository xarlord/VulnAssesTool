# CVE Database Management Guide

## Overview

VulnAssessTool uses a local NVD (National Vulnerability Database) SQLite database for fast, offline-capable vulnerability scanning. This guide covers database setup, configuration, maintenance, and troubleshooting for the full CVE database integration (1999-present, 250,000+ CVEs).

---

## Table of Contents

1. [Features](#features)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [Sync Options](#sync-options)
5. [Performance Tuning](#performance-tuning)
6. [Storage Management](#storage-management)
7. [API Rate Limits](#api-rate-limits)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Configuration](#advanced-configuration)
10. [FAQ](#faq)

---

## Features

### Full CVE Database

- **Complete Historical Data**: All CVEs from 1999 to present (~250,000+ records)
- **Offline Operation**: Works fully offline after initial sync
- **Fast Searches**: Sub-second queries using SQLite FTS5 full-text search
- **Smart Sync**: Priority-based incremental sync

### Performance Optimizations

- **Composite Indexes**: Optimized for CPE lookups, severity filtering, year-based queries
- **Chunked Imports**: 1000 CVEs per batch for memory efficiency
- **Resume Capability**: Continue interrupted imports from last position
- **Concurrent Downloads**: Parallel requests with configurable concurrency

### Sync Capabilities

- **Delta Sync**: Only fetch CVEs modified since last sync
- **Priority Scheduling**: Recent CVEs (2 years) > Medium (5 years) > Historical (1999+)
- **Bandwidth Awareness**: Pause on metered connections
- **Idle Detection**: Sync during system idle time

---

## Initial Setup

### First Launch

When you first launch VulnAssessTool, the application will:

1. Create the database directory if it doesn't exist
2. Initialize an empty SQLite database with optimized schema
3. Apply necessary schema migrations (including Migration 10 for 250K+ CVEs)
4. Prompt you to configure sync settings

### Configuring NVD API Key (Recommended)

An NVD API key significantly improves sync performance:

| Metric               | Without API Key | With API Key |
| -------------------- | --------------- | ------------ |
| Rate Limit           | 5 req/30s       | 50 req/30s   |
| Full Sync (27 years) | ~6-8 hours      | ~1-2 hours   |
| Delta Sync           | ~10 minutes     | ~2 minutes   |

**To Get an API Key:**

1. Visit [NVD API Key Request Page](https://nvd.nist.gov/developers/request-an-api-key)
2. Fill out the request form with your organization details
3. Receive your API key via email (usually within 1-2 business days)
4. In VulnAssessTool, go to **Settings** > **API Configuration**
5. Paste your API key and click **Save**

### Starting Initial Sync

1. Open VulnAssessTool
2. Navigate to **Settings** > **Database Management**
3. Configure your sync schedule (recommend: Weekly for most users)
4. Click **"Sync Now"** to start the initial download
5. Monitor progress in the sync dialog

**Initial Sync Duration Estimates:**

| Configuration           | Estimated Time |
| ----------------------- | -------------- |
| With API Key            | 1-2 hours      |
| Without API Key         | 6-8 hours      |
| Delta Sync (subsequent) | 2-10 minutes   |

---

## Database Configuration

### Sync Schedule Options

Configure in **Settings** > **Database Management**:

| Schedule    | Description              | Recommended For                         |
| ----------- | ------------------------ | --------------------------------------- |
| **Daily**   | Sync every 24 hours      | Active security teams, critical systems |
| **Weekly**  | Sync every 7 days        | Regular development workflows           |
| **Monthly** | Sync every 30 days       | Periodic security reviews               |
| **Manual**  | Sync only when requested | Air-gapped systems, limited bandwidth   |

### Priority-Based Sync

The sync system uses a priority queue to ensure recent CVEs are always up-to-date:

| Priority       | Year Range                   | Default Sync Interval |
| -------------- | ---------------------------- | --------------------- |
| **Recent**     | Current year + previous year | Daily                 |
| **Medium**     | Last 5 years                 | Weekly                |
| **Historical** | 1999 to 5+ years ago         | Monthly               |

---

## Sync Options

### Delta Sync

Delta sync only fetches CVEs that have been modified since the last sync:

- **Triggered**: Automatically when last sync was < 120 days ago
- **Duration**: 2-10 minutes (vs. hours for full sync)
- **Bandwidth**: Minimal (~100-1000 CVEs typically)

### Full Sync

Full sync downloads all CVEs for the configured year range:

- **Triggered**: First sync or when delta sync not possible
- **Duration**: 1-8 hours depending on API key
- **Resume**: Can be resumed if interrupted

### Manual Sync

To trigger a manual sync:

1. Go to **Settings** > **Database Management**
2. Click **"Sync Now"**
3. Choose **"Full Sync"** or use default (delta if available)

---

## Performance Tuning

### Search Result Limit

Configure maximum search results in **Settings** > **Performance**:

| Option | Use Case                       |
| ------ | ------------------------------ |
| 50     | Quick lookups, limited UI      |
| 100    | Default, balanced performance  |
| 200    | Detailed analysis              |
| 500    | Comprehensive searches         |
| 1000   | Maximum detail (may be slower) |

### Search Cache

Enable search caching for frequently-used queries:

| Setting      | Options          | Description                |
| ------------ | ---------------- | -------------------------- |
| Enable Cache | On/Off           | Cache search results       |
| Cache Size   | 32/64/128/256 MB | Memory allocated for cache |
| Cache TTL    | 60 minutes       | Time before cache refresh  |

### Database Indexes

The database uses optimized indexes for fast queries:

- `idx_cpe_vendor_product`: Fast CPE lookups by vendor/product
- `idx_cves_severity_date`: Severity + date filtering
- `idx_cves_published_year`: Year-based queries
- `idx_cves_dashboard`: Dashboard statistics

**Rebuild Indexes** if searches are slow:

1. Go to **Settings** > **Database Management**
2. Click **"Rebuild Indexes"**
3. Wait for operation to complete (may take several minutes)

---

## Storage Management

### Database Size Estimates

| CVE Count         | Approximate Size |
| ----------------- | ---------------- |
| 50,000            | ~200 MB          |
| 100,000           | ~400 MB          |
| 250,000 (full)    | ~1 GB            |
| With FTS5 indexes | +20% overhead    |

### Storage Limits

Configure in **Settings** > **Database Management**:

| Option    | Description                 |
| --------- | --------------------------- |
| 512 MB    | Minimal, recent CVEs only   |
| 1 GB      | Last ~5 years               |
| 2 GB      | Default, full database      |
| 4 GB      | Full database with headroom |
| Unlimited | No storage limit            |

### Pruning Old CVEs

To reduce database size by removing older CVEs:

1. Enable **"Prune Old CVEs"** in Settings
2. Select **"Prune CVEs older than"** year:
   - 2020: Keep last 6 years
   - 2015: Keep last 11 years
   - 2010: Keep last 16 years
   - 2005: Keep last 21 years
   - 1999: Keep all (no pruning)

**Warning**: Pruned CVEs are permanently removed. Re-sync to restore them.

---

## API Rate Limits

### NVD API v2.0 Limits

| Mode         | Requests | Time Window |
| ------------ | -------- | ----------- |
| Anonymous    | 5        | 30 seconds  |
| With API Key | 50       | 30 seconds  |

### Rate Limit Handling

VulnAssessTool handles rate limits automatically:

- **Automatic Throttling**: Requests are queued and released at appropriate intervals
- **Exponential Backoff**: Retries with increasing delays on 429 errors
- **Resume on Timeout**: Continues from last position after rate limit reset

### Sync Duration Estimates

| Scenario                         | With API Key  | Without API Key |
| -------------------------------- | ------------- | --------------- |
| Initial Full Sync (1999-present) | 1-2 hours     | 6-8 hours       |
| Delta Sync (typical)             | 2-5 minutes   | 10-15 minutes   |
| Single Year (2024)               | 5-10 minutes  | 30-60 minutes   |
| Recent 2 Years                   | 15-20 minutes | 1-2 hours       |

---

## Troubleshooting

### Sync Failures

**Symptoms:**

- "Sync failed" error message
- Incomplete CVE count
- Database shows old last-sync date

**Solutions:**

1. **Check Internet Connection**
   - Ensure stable internet connection
   - Try again during off-peak hours

2. **Verify API Key**
   - Go to Settings > API Configuration
   - Ensure API key is valid and saved
   - Request new key if expired

3. **Resume Interrupted Sync**
   - Sync automatically resumes from last position
   - Click "Sync Now" to continue

4. **Check Rate Limits**
   - Wait 30 seconds if rate limited
   - Use API key for higher limits

### Database Corruption

**Symptoms:**

- Scans fail with database errors
- Status shows "Database not available"
- Application crashes when accessing database

**Solution:**

1. Close VulnAssessTool
2. Navigate to database directory:
   - **Windows**: `%APPDATA%\vuln-assess-tool\nvd-database\`
   - **macOS**: `~/Library/Application Support/vuln-assess-tool/nvd-database/`
   - **Linux**: `~/.config/vuln-assess-tool/nvd-database/`
3. Delete all database files:
   - `nvd.db`
   - `nvd.db-shm`
   - `nvd.db-wal`
4. Restart VulnAssessTool
5. Perform full sync to rebuild database

### Slow Performance

**Symptoms:**

- Searches take > 2 seconds
- UI freezes during queries
- High memory usage

**Solutions:**

1. **Rebuild Indexes**
   - Settings > Database Management > Rebuild Indexes
   - Wait for completion

2. **Clear Search Cache**
   - Settings > Performance > Clear Cache

3. **Reduce Search Result Limit**
   - Settings > Performance > Search Result Limit
   - Lower to 100 or 50

4. **Prune Old CVEs**
   - Settings > Database Management > Enable Pruning
   - Set year threshold (e.g., 2015)

### Out of Memory Errors

**Symptoms:**

- Application crashes during sync
- "Out of memory" error messages

**Solutions:**

1. **Close Other Applications**
   - Free up system memory
   - Ensure at least 4GB RAM available

2. **Use 64-bit Version**
   - 32-bit builds limited to 2GB address space

3. **Manual Sync in Batches**
   - Sync recent years first
   - Add historical data later

---

## Advanced Configuration

### Custom Database Location

To store the database in a custom location:

1. Close VulnAssessTool
2. Create configuration file:
   - **Windows**: `%APPDATA%\vuln-assess-tool\config.json`
   - **macOS**: `~/Library/Application Support/vuln-assess-tool/config.json`
   - **Linux**: `~/.config/vuln-assess-tool/config.json`
3. Add:
   ```json
   {
     "databasePath": "/path/to/custom/location"
   }
   ```
4. Restart VulnAssessTool

### Database Backup

**To backup:**

1. Close VulnAssessTool
2. Navigate to database directory
3. Copy all files:
   - `nvd.db`
   - `nvd.db-shm`
   - `nvd.db-wal`
   - `.metadata.json`

**To restore:**

1. Close VulnAssessTool
2. Copy backup files to database directory
3. Restart VulnAssessTool

### Configuration File Options

```json
{
  "databasePath": "/custom/path",
  "syncConfig": {
    "autoSync": true,
    "syncInterval": "weekly",
    "idleTimeBeforeSync": 5,
    "pauseOnMeteredConnection": true,
    "prioritySchedule": {
      "recent": { "years": 2, "interval": "daily" },
      "medium": { "years": 5, "interval": "weekly" },
      "historical": { "interval": "monthly" }
    }
  }
}
```

---

## FAQ

### Q: How often should I sync the database?

**A:**

- **Daily**: For active security teams monitoring emerging threats
- **Weekly**: Recommended for most users - balances freshness with resource usage
- **Monthly**: For periodic security reviews
- **Manual**: For air-gapped or bandwidth-limited environments

### Q: Can I use VulnAssessTool offline?

**A:** Yes. Once the database is synced, VulnAssessTool works fully offline. You only need internet for database updates.

### Q: How much disk space does the database use?

**A:**

- Full database (250K CVEs): ~1 GB
- With indexes and cache: ~1.2 GB
- Recommend: 2 GB free space minimum

### Q: What happens if I stop a sync mid-download?

**A:** The sync state is saved automatically. When you restart, the sync continues from where it left off. No data is lost.

### Q: Can I share the database across multiple installations?

**A:** Yes. Copy the database files to another machine. However, only one instance should write to the database at a time.

### Q: Why is the first sync so slow?

**A:** The initial sync downloads 250,000+ CVEs spanning 27+ years. With an API key, this takes 1-2 hours. Subsequent delta syncs are much faster (2-10 minutes).

### Q: What is delta sync?

**A:** Delta sync only fetches CVEs that have been added or modified since your last sync. This is much faster than a full sync and is used automatically when possible (within 120 days of last sync).

### Q: Is my data sent to external servers?

**A:** No. All vulnerability data is stored locally. The only external communication is with NVD servers (nvd.nist.gov) to download CVE data.

### Q: How do I reset the database completely?

**A:**

1. Settings > Database Management
2. Click "Reset Database"
3. Confirm the action
4. Perform a fresh sync

---

## Support

For additional help:

- **Documentation**: [GitHub Repository](https://github.com/xarlord/d-fence-vulnerability-assesment-tool)
- **Issues**: [GitHub Issues](https://github.com/xarlord/d-fence-vulnerability-assesment-tool/issues)

---

**Last Updated:** 2026-02-25
**Version:** 0.2.0
