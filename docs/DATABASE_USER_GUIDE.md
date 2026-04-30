# CVE Database User Guide

## Quick Reference

This guide provides step-by-step instructions for managing the CVE database in VulnAssessTool.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Syncing the Database](#syncing-the-database)
3. [Configuring Auto-Sync](#configuring-auto-sync)
4. [Managing Storage](#managing-storage)
5. [Performance Tuning](#performance-tuning)
6. [Database Maintenance](#database-maintenance)
7. [Best Practices](#best-practices)

---

## Getting Started

### Prerequisites

Before using the CVE database features:

- [ ] VulnAssessTool installed
- [ ] Internet connection (for initial sync)
- [ ] At least 2 GB free disk space
- [ ] NVD API key (optional but recommended)

### Getting an NVD API Key

An API key significantly improves sync performance:

1. Visit: https://nvd.nist.gov/developers/request-an-api-key
2. Fill out the form:
   - Organization name
   - Contact email
   - Intended use
3. Submit the request
4. Check email for API key (1-2 business days)
5. Save the key securely

### Adding Your API Key

1. Open VulnAssessTool
2. Go to **Settings** (gear icon)
3. Find **API Configuration** section
4. Enter your API key in the **NVD API Key** field
5. Click **Save**

---

## Syncing the Database

### First-Time Sync

To download the complete CVE database:

1. Navigate to **Settings** > **Database Management**
2. Verify sync schedule is set (recommend: **Weekly**)
3. Click **Sync Now**
4. Wait for sync dialog to appear
5. Monitor progress:
   - Current phase (downloading/importing)
   - Percentage complete
   - CVE count
   - Estimated time remaining

**Expected Duration:**

- With API key: 1-2 hours
- Without API key: 6-8 hours

### Monitoring Sync Progress

During sync, the progress dialog shows:

| Field          | Description                                          |
| -------------- | ---------------------------------------------------- |
| Phase          | Current operation (downloading, importing, indexing) |
| Year           | Current year being processed                         |
| CVEs Synced    | Total CVEs imported so far                           |
| Percentage     | Overall completion percentage                        |
| Time Remaining | Estimated time to complete                           |

### Pausing or Cancelling Sync

**To pause:**

- Click **Pause** button in sync dialog
- Sync state is saved automatically

**To cancel:**

- Click **Cancel** button
- Partial progress is saved
- Resume later from same position

**To resume:**

- Click **Sync Now** again
- Sync continues from where it stopped

### Delta Sync (Updates)

After initial sync, subsequent syncs are much faster:

1. Navigate to **Settings** > **Database Management**
2. Click **Sync Now**
3. Delta sync runs automatically if:
   - Last sync was < 120 days ago
   - Database is not corrupted

**Delta Sync Duration:** 2-10 minutes

### Full Sync (Complete Refresh)

To force a complete re-download:

1. Navigate to **Settings** > **Database Management**
2. Hold **Shift** key
3. Click **Sync Now**
4. Confirm full sync

**Use full sync when:**

- Database may be corrupted
- Many CVEs are missing
- After database reset

---

## Configuring Auto-Sync

### Setting Sync Schedule

1. Navigate to **Settings** > **Database Management**
2. Find **Sync Schedule** dropdown
3. Select option:
   - **Daily**: Sync every 24 hours
   - **Weekly**: Sync every 7 days (recommended)
   - **Monthly**: Sync every 30 days
   - **Manual**: Only sync when requested

### How Auto-Sync Works

| Setting | Behavior                          |
| ------- | --------------------------------- |
| Daily   | Checks for updates every 24 hours |
| Weekly  | Checks for updates every 7 days   |
| Monthly | Checks for updates every 30 days  |
| Manual  | Never syncs automatically         |

### Priority-Based Sync

The system automatically prioritizes:

| Priority   | Years                | Default Schedule |
| ---------- | -------------------- | ---------------- |
| Recent     | Current + last year  | Daily            |
| Medium     | Last 5 years         | Weekly           |
| Historical | 1999 to 5+ years ago | Monthly          |

This ensures current vulnerabilities are always up-to-date.

### Idle Time Sync

Auto-sync can wait for system idle:

1. Navigate to **Settings** > **Database Management**
2. Enable **Sync during idle time**
3. Set idle threshold (default: 5 minutes)

Sync will only run when:

- System has been idle for threshold time
- No active scans are running
- Network is available

### Metered Connection Handling

To prevent sync on metered connections:

1. Navigate to **Settings** > **Database Management**
2. Enable **Pause on metered connections**

Sync will pause when:

- Mobile hotspot detected
- Metered Wi-Fi detected
- Limited bandwidth detected

---

## Managing Storage

### Checking Database Size

1. Navigate to **Settings** > **Database Management**
2. View **Current Database Size**

Size indicates:

- < 100 MB: Minimal data, needs sync
- 500 MB - 1 GB: Partial data
- 1-2 GB: Full database

### Setting Storage Limits

1. Navigate to **Settings** > **Database Management**
2. Find **Maximum Database Size**
3. Select limit:
   - 512 MB: Recent CVEs only
   - 1 GB: Last ~5 years
   - 2 GB: Full database (default)
   - 4 GB: Full database with headroom
   - Unlimited: No limit

When limit is reached:

- Oldest CVEs are removed first
- New CVEs continue to sync
- Warning notification appears

### Pruning Old CVEs

To remove historical CVEs and save space:

1. Navigate to **Settings** > **Database Management**
2. Enable **Prune old CVEs**
3. Select **Prune CVEs older than**:
   - 2020: Keep last 6 years (~150K CVEs)
   - 2015: Keep last 11 years (~200K CVEs)
   - 2010: Keep last 16 years (~220K CVEs)
   - 2005: Keep last 21 years (~240K CVEs)
   - 1999: Keep all (no pruning)

**Warning:** Pruned CVEs are permanently deleted.

### Re-syncing After Pruning

To restore pruned CVEs:

1. Navigate to **Settings** > **Database Management**
2. Disable **Prune old CVEs**
3. Click **Sync Now**
4. Wait for full sync to complete

---

## Performance Tuning

### Search Result Limit

Control how many results appear in searches:

1. Navigate to **Settings** > **Performance**
2. Find **Search Result Limit**
3. Select value:
   - 50: Fast, minimal results
   - 100: Balanced (default)
   - 200: More comprehensive
   - 500: Detailed analysis
   - 1000: Maximum (slower)

### Search Cache

Enable caching for faster repeated searches:

1. Navigate to **Settings** > **Performance**
2. Enable **Enable Search Cache**
3. Set **Cache Size**:
   - 32 MB: Minimal caching
   - 64 MB: Default
   - 128 MB: Good for frequent searches
   - 256 MB: Maximum caching

4. Set **Cache TTL**:
   - Default: 60 minutes
   - Increase for less frequent updates
   - Decrease for more current data

### Clearing Cache

To clear cached search results:

1. Navigate to **Settings** > **Performance**
2. Click **Clear Cache**
3. Confirm action

This helps when:

- Searches return stale results
- After major database updates
- Troubleshooting search issues

---

## Database Maintenance

### Checking Database Status

1. Navigate to **Settings** > **Database Management**
2. View status indicators:
   - Total CVEs
   - Last sync time
   - Database size
   - Sync schedule

### Status Indicators

| Indicator | Meaning                                 |
| --------- | --------------------------------------- |
| Green     | Database fresh (synced within 7 days)   |
| Yellow    | Database stale (7-30 days since sync)   |
| Red       | Database very old (30+ days since sync) |
| Gray      | No database or error                    |

### Rebuilding Indexes

If searches are slow, rebuild indexes:

1. Navigate to **Settings** > **Database Management**
2. Click **Rebuild Indexes**
3. Confirm action
4. Wait for completion (5-10 minutes)

**When to rebuild:**

- After major sync operations
- When searches are slow
- After database corruption recovery

### Resetting the Database

To start fresh with a clean database:

1. Navigate to **Settings** > **Database Management**
2. Click **Reset Database**
3. Type "RESET" to confirm
4. Wait for reset to complete
5. Perform full sync

**Warning:** This deletes all CVE data.

**When to reset:**

- Database corruption
- Major version upgrades
- Troubleshooting persistent issues

### Backing Up the Database

**To backup:**

1. Close VulnAssessTool
2. Navigate to database directory:
   - Windows: `%APPDATA%\vuln-assess-tool\nvd-database\`
   - macOS: `~/Library/Application Support/vuln-assess-tool/nvd-database/`
   - Linux: `~/.config/vuln-assess-tool/nvd-database/`
3. Copy all files to backup location

**To restore:**

1. Close VulnAssessTool
2. Copy backup files to database directory
3. Restart VulnAssessTool

---

## Best Practices

### For Security Teams

1. **Use API Key**
   - 10x faster sync
   - More reliable updates

2. **Daily Sync Schedule**
   - Most current vulnerability data
   - Faster delta syncs

3. **Keep Full Database**
   - Don't prune old CVEs
   - Historical analysis capability

4. **Enable All Caches**
   - 256 MB search cache
   - Faster repeated searches

### For Development Teams

1. **Weekly Sync Schedule**
   - Balance freshness with resources
   - Typically sufficient for dev needs

2. **1000 Search Results**
   - Comprehensive vulnerability lists
   - Better for analysis

3. **Keep Last 5 Years**
   - Sufficient for most dependencies
   - Reduces storage requirements

### For Periodic Reviews

1. **Monthly Sync Schedule**
   - Update before reviews
   - Manual sync when needed

2. **Manual Sync Before Audits**
   - Ensure current data
   - Full sync recommended

3. **Export Reports After Sync**
   - Document current state
   - Include sync timestamp

### General Recommendations

1. **Always use API key** - Free and significantly improves performance

2. **Let initial sync complete** - Don't cancel; resume if interrupted

3. **Rebuild indexes monthly** - Maintains search performance

4. **Backup before upgrades** - Quick restore if issues

5. **Monitor database size** - Ensure adequate storage

---

## Quick Commands

| Action            | Location               | Steps                        |
| ----------------- | ---------------------- | ---------------------------- |
| Sync Now          | Settings > Database    | Click "Sync Now"             |
| Change Schedule   | Settings > Database    | Select from dropdown         |
| Set Storage Limit | Settings > Database    | Select from dropdown         |
| Rebuild Indexes   | Settings > Database    | Click "Rebuild Indexes"      |
| Reset Database    | Settings > Database    | Click "Reset Database"       |
| Set Search Limit  | Settings > Performance | Select from dropdown         |
| Enable Cache      | Settings > Performance | Toggle "Enable Search Cache" |
| Clear Cache       | Settings > Performance | Click "Clear Cache"          |
| Add API Key       | Settings > API Config  | Enter key, click Save        |

---

**Last Updated:** 2026-02-25
**Version:** 0.2.0
