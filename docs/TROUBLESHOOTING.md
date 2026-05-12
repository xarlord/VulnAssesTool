# VulnAssessTool Troubleshooting Guide

## Overview

This guide covers common issues, error messages, and solutions for VulnAssessTool, with a focus on CVE database integration and sync operations.

---

## Table of Contents

1. [Sync Issues](#sync-issues)
2. [Database Problems](#database-problems)
3. [Performance Issues](#performance-issues)
4. [API and Network Errors](#api-and-network-errors)
5. [Import/Export Problems](#importexport-problems)
6. [UI and Application Errors](#ui-and-application-errors)
7. [Error Messages Reference](#error-messages-reference)

---

## Sync Issues

### Sync Fails to Start

**Symptoms:**

- "Sync Now" button does nothing
- No progress dialog appears
- Settings show "Sync in progress" but nothing happens

**Possible Causes and Solutions:**

| Cause                    | Solution                                     |
| ------------------------ | -------------------------------------------- |
| No internet connection   | Check network connectivity                   |
| Sync already in progress | Wait for current sync or restart application |
| Database locked          | Close other applications using the database  |
| Invalid API key          | Verify or remove API key in Settings         |

**Steps to resolve:**

1. Check internet connection
2. Restart VulnAssessTool
3. Go to Settings > Database Management
4. If "Sync in progress" shows incorrectly:
   - Click "Cancel Sync" if available
   - Or restart the application

### Sync Stuck at 0%

**Symptoms:**

- Progress bar shows 0%
- No CVE count updates
- Dialog remains open indefinitely

**Solutions:**

1. **Check API Rate Limits**
   - Without API key: 5 requests per 30 seconds
   - With API key: 50 requests per 30 seconds
   - Wait if you've made many recent requests

2. **Verify Network Connectivity**

   ```
   Test: Open https://services.nvd.nist.gov/rest/json/cves/2.0 in browser
   Expected: JSON response with CVE data
   ```

3. **Cancel and Resume**
   - Click "Cancel" in sync dialog
   - Wait 30 seconds
   - Click "Sync Now" again

### Sync Fails Partway Through

**Symptoms:**

- Progress stops at some percentage
- Error message appears
- CVE count is incomplete

**Common Error Codes:**

| Code | Meaning             | Solution                     |
| ---- | ------------------- | ---------------------------- |
| 403  | Rate limit exceeded | Wait 30 seconds, use API key |
| 429  | Too many requests   | Wait 60 seconds, retry       |
| 500  | NVD server error    | Wait 5 minutes, retry        |
| 503  | Service unavailable | Wait 10 minutes, retry       |

**Recovery Steps:**

1. Note the year/percentage where failure occurred
2. Wait appropriate time based on error code
3. Click "Sync Now" - sync will resume from last position
4. If repeated failures:
   - Restart application
   - Check API key validity
   - Try during off-peak hours (early morning US Eastern)

### Delta Sync Not Working

**Symptoms:**

- Full sync runs instead of delta
- "Delta sync not available" message

**Requirements for Delta Sync:**

- Last sync must be within 120 days
- Must have valid last sync timestamp
- Database must not be corrupted

**Solutions:**

1. If last sync > 120 days ago:
   - Full sync is required
   - This is expected behavior

2. If recently synced but still full sync:
   - Check database integrity (Settings > Database Management > Rebuild Indexes)
   - Restart application

---

## Database Problems

### Database Corruption

**Symptoms:**

- "Database error" when scanning
- Application crashes on vulnerability lookup
- "Database not available" status

**Diagnosis:**

1. Check database file exists:
   - Windows: `%APPDATA%\vuln-assess-tool\nvd-database\nvd.db`
   - macOS: `~/Library/Application Support/vuln-assess-tool/nvd-database/nvd.db`
   - Linux: `~/.config/vuln-assess-tool/nvd-database/nvd.db`

2. Check file size:
   - Should be > 10MB if synced
   - If 0 bytes or very small, database is corrupted

**Recovery:**

1. **Try Rebuild First:**
   - Settings > Database Management > Rebuild Indexes
   - This may fix minor corruption

2. **Full Reset:**
   - Settings > Database Management > Reset Database
   - Confirm the action
   - Perform full sync

3. **Manual Reset:**
   - Close VulnAssessTool
   - Delete all files in database directory:
     - `nvd.db`
     - `nvd.db-shm`
     - `nvd.db-wal`
     - `.metadata.json`
   - Restart application
   - Perform full sync

### Database Locked Errors

**Symptoms:**

- "Database is locked" error
- "Unable to acquire lock" message

**Causes:**

- Another VulnAssessTool instance running
- Another application accessing the database
- Improper shutdown left lock file

**Solutions:**

1. Close all VulnAssessTool instances
2. Delete `.lock` file in database directory (if exists)
3. Restart application

### Schema Migration Errors

**Symptoms:**

- "Migration failed" error on startup
- "Incompatible database version" message

**Solutions:**

1. **Reset Database:**
   - Backup database if needed
   - Settings > Database Management > Reset Database
   - Perform full sync

2. **Manual Migration:**
   - Not recommended for most users
   - Check release notes for migration instructions

---

## Performance Issues

### Slow Searches

**Symptoms:**

- Search takes > 2 seconds
- UI freezes during search
- High CPU usage

**Diagnosis:**

1. Check database size:
   - Full database: ~250,000 CVEs
   - If significantly less, may need sync

2. Check search result limit:
   - Settings > Performance > Search Result Limit
   - Lower values = faster searches

**Solutions:**

1. **Rebuild Indexes:**
   - Settings > Database Management > Rebuild Indexes
   - Wait for completion (may take 5-10 minutes)

2. **Reduce Result Limit:**
   - Settings > Performance > Search Result Limit
   - Set to 100 or 50

3. **Enable Search Cache:**
   - Settings > Performance > Enable Search Cache
   - Set cache size to 64MB or higher

4. **Prune Old CVEs:**
   - Settings > Database Management > Enable Prune Old CVEs
   - Set year threshold (e.g., 2015)

### High Memory Usage

**Symptoms:**

- Application uses > 1GB RAM
- System becomes slow
- Out of memory errors

**Solutions:**

1. **Reduce Cache Size:**
   - Settings > Performance > Cache Size
   - Set to 32MB

2. **Reduce Search Results:**
   - Settings > Performance > Search Result Limit
   - Set to 50 or 100

3. **Disable Search Cache:**
   - Settings > Performance > Disable Search Cache

4. **Close Other Applications:**
   - Free up system memory
   - Ensure 4GB+ RAM available

### Slow Sync Performance

**Symptoms:**

- Sync takes much longer than expected
- Progress bar moves very slowly

**Expected Durations:**

| Operation   | With API Key | Without Key |
| ----------- | ------------ | ----------- |
| Full Sync   | 1-2 hours    | 6-8 hours   |
| Delta Sync  | 2-5 min      | 10-15 min   |
| Single Year | 5-10 min     | 30-60 min   |

**If slower than expected:**

1. **Check Network Speed:**
   - Run speed test
   - NVD API requires stable connection

2. **Check API Key:**
   - Verify key is valid and saved
   - Without key, sync is 10x slower

3. **Check System Resources:**
   - Close other applications
   - Ensure adequate RAM and CPU

4. **Reduce Concurrency:**
   - If network is unstable, lower concurrency
   - Default is 3 concurrent requests

---

## API and Network Errors

### Rate Limit Exceeded (403)

**Symptoms:**

- "Rate limit exceeded" error
- HTTP 403 response
- Sync pauses

**Solutions:**

1. **Wait and Retry:**
   - Wait 30 seconds
   - Sync will automatically resume

2. **Get API Key:**
   - Request from https://nvd.nist.gov/developers/request-an-api-key
   - Increases limit from 5 to 50 requests/30s

3. **Reduce Sync Frequency:**
   - Settings > Database Management > Sync Schedule
   - Set to Weekly or Monthly

### Connection Timeout

**Symptoms:**

- "Connection timed out" error
- "Unable to connect to NVD" message

**Solutions:**

1. **Check Firewall:**
   - Allow connections to `services.nvd.nist.gov`
   - Port 443 (HTTPS)

2. **Check Proxy Settings:**
   - Configure proxy in system settings
   - VulnAssessTool uses system proxy

3. **Check VPN:**
   - Some VPNs may block NVD API
   - Try without VPN

### Invalid API Key

**Symptoms:**

- "Invalid API key" error
- Rate limits not improved

**Solutions:**

1. **Verify Key Format:**
   - Should be alphanumeric string
   - No spaces or special characters

2. **Request New Key:**
   - Keys may expire or be revoked
   - Request new key from NVD

3. **Clear and Re-enter:**
   - Settings > API Configuration
   - Clear key, save
   - Re-enter key, save

---

## Import/Export Problems

### SBOM Import Fails

**Symptoms:**

- "Failed to parse SBOM" error
- No components imported
- Validation errors

**Supported Formats:**

- CycloneDX JSON (1.2, 1.3, 1.4, 1.5)
- CycloneDX XML (1.2, 1.3, 1.4, 1.5)
- SPDX JSON (2.2, 2.3)
- SPDX Tag-Value (2.2, 2.3)

**Solutions:**

1. **Validate SBOM Format:**
   - Use online validators (CycloneDX, SPDX)
   - Ensure correct version

2. **Check File Size:**
   - Maximum: 50MB
   - For larger files, split into smaller SBOMs

3. **Check Encoding:**
   - Must be UTF-8
   - No BOM marker

### Export Generates Empty File

**Symptoms:**

- Export completes but file is empty
- No data in exported CSV/JSON

**Solutions:**

1. **Check Selection:**
   - Ensure items are selected for export
   - For "Export All", ensure data exists

2. **Check Filters:**
   - Clear all filters
   - Ensure data is visible before export

---

## UI and Application Errors

### Application Won't Start

**Symptoms:**

- No window appears
- Crash on startup
- Blank screen

**Solutions:**

1. **Check Logs:**
   - Windows: `%APPDATA%\vuln-assess-tool\logs\`
   - macOS: `~/Library/Logs/vuln-assess-tool/`
   - Linux: `~/.local/share/vuln-assess-tool/logs/`

2. **Clear Cache:**
   - Delete `cache` folder in app data directory
   - Restart application

3. **Reset Settings:**
   - Delete `config.json` in app data directory
   - Restart application

4. **Reinstall:**
   - Uninstall completely
   - Download latest version
   - Fresh install

### Settings Not Saving

**Symptoms:**

- Changes revert after restart
- "Failed to save settings" error

**Solutions:**

1. **Check Permissions:**
   - Ensure write access to app data directory
   - Run as administrator (Windows) if needed

2. **Check Disk Space:**
   - Ensure adequate free space
   - At least 100MB for settings and cache

### Notifications Not Working

**Symptoms:**

- No desktop notifications
- Toast notifications don't appear

**Solutions:**

1. **Check Notification Settings:**
   - Settings > Notifications > Enable Desktop Notifications

2. **Check System Permissions:**
   - Windows: Settings > System > Notifications
   - macOS: System Preferences > Notifications
   - Linux: Check notification daemon

---

## Error Messages Reference

### Database Errors

| Error             | Meaning            | Solution               |
| ----------------- | ------------------ | ---------------------- |
| `SQLITE_BUSY`     | Database locked    | Close other instances  |
| `SQLITE_CORRUPT`  | Database corrupted | Reset database         |
| `SQLITE_FULL`     | Disk full          | Free disk space        |
| `SQLITE_READONLY` | Read-only database | Check file permissions |

### Sync Errors

| Error                 | Meaning           | Solution            |
| --------------------- | ----------------- | ------------------- |
| `NVD_API_ERROR`       | NVD API error     | Check API status    |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait or get API key |
| `SYNC_CANCELLED`      | User cancelled    | Resume sync         |
| `NETWORK_ERROR`       | Connection failed | Check network       |

### Import Errors

| Error                 | Meaning                  | Solution                 |
| --------------------- | ------------------------ | ------------------------ |
| `INVALID_SBOM`        | Invalid SBOM format      | Validate SBOM file       |
| `FILE_TOO_LARGE`      | File exceeds 50MB        | Split into smaller files |
| `PARSE_ERROR`         | Parsing failed           | Check file format        |
| `UNSUPPORTED_VERSION` | Unsupported SBOM version | Use supported version    |

---

## Getting Help

If this guide doesn't resolve your issue:

1. **Check GitHub Issues:**
   - Search for similar issues
   - https://github.com/xarlord/d-fence-vulnerability-assesment-tool/issues

2. **Create New Issue:**
   - Include error messages
   - Include steps to reproduce
   - Include system information

3. **Provide Logs:**
   - Attach relevant log files
   - Located in app data directory

---

**Last Updated:** 2026-02-25
**Version:** 0.2.0
