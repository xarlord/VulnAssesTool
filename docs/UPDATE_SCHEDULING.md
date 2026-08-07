# Update Scheduling Guide

## Overview

VulnAssessTool supports automatic sync scheduling for the NVD vulnerability database. This
guide covers configuring and managing that schedule.

> **Note:** VulnAssessTool was migrated from an Electron desktop app to an Express server +
> browser web app. The Electron-era application auto-updater (installer downloads, release
> channels, in-app "Check for Updates") described in earlier revisions of this guide no longer
> exists — the server is deployed/updated like any other Node service (e.g. `git pull` +
> `npm run build:all` + restart, or a container image rebuild). This guide now covers only the
> live feature: NVD database refresh scheduling.

---

## Table of Contents

1. [NVD Database Updates](#nvd-database-updates)
2. [Scheduling Configuration](#scheduling-configuration)
3. [Update Behavior](#update-behavior)
4. [Troubleshooting](#troubleshooting)

---

## Update Types

### NVD Database Updates

- **What:** Vulnerability data from NIST
- **Frequency:** Daily (NIST publishes daily)
- **Size:** Incremental (2-5 MB per day)
- **Impact:** Enables vulnerability scanning
- **Requirement:** Essential for application functionality

---

## NVD Database Updates

### Understanding NVD Updates

The National Vulnerability Database (NVD) is updated daily by NIST. Each update includes:

- **New CVEs:** Newly discovered vulnerabilities
- **Updated CVEs:** Modified vulnerability records
- **CVSS Scores:** Updated severity scores
- **References:** New links and documentation

### Why Update Regularly?

1. **New Vulnerabilities:** Stay informed of latest threats
2. **Severity Changes:** CVSS scores can change over time
3. **False Positives:** NIST corrects errors periodically
4. **Compliance:** Many standards require up-to-date data

### Update Frequency Options

| Frequency   | Best For                                   | Update Size | Freshness       |
| ----------- | ------------------------------------------ | ----------- | --------------- |
| **Daily**   | Active security teams, production systems  | 2-5 MB      | ≤24 hours       |
| **Weekly**  | Most organizations, regular scanning       | 15-35 MB    | ≤7 days         |
| **Monthly** | Low-risk environments, occasional scanning | 60-120 MB   | ≤30 days        |
| **Manual**  | Complete control, air-gapped systems       | Variable    | User-controlled |

### Configuring NVD Updates

#### Automatic Updates

1. Go to **Settings** → **Database Management**
2. Select the **Sync Schedule**:
   - **Daily:** Syncs roughly every 24 hours since the last successful sync
   - **Weekly:** Syncs roughly every 7 days since the last successful sync
   - **Monthly:** Syncs roughly every 30 days since the last successful sync
   - **Manual:** Never syncs automatically — trigger sync yourself
3. The schedule is saved immediately

The scheduler runs a rolling interval from the last completed sync (not a fixed clock time),
so exact sync times will drift slightly rather than always firing at the same time of day.

#### Manual Updates

1. Check the database status indicator on the dashboard, or the stats on the **Settings** >
   **Database Management** page
2. If stale, click **"Sync Now"**
3. Update runs immediately; progress is shown inline

### Update Process

#### What Happens During an Update

1. **Check for Updates:**
   - Query NVD API for latest modifications
   - Compare with local database timestamp

2. **Download New Data:**
   - Fetch only modified/new CVEs
   - Verify data integrity with checksums
   - Handle rate limits (with or without API key)

3. **Import to Database:**
   - Begin database transaction
   - Insert new CVEs
   - Update existing CVEs
   - Rebuild search indexes

4. **Completion:**
   - Commit transaction
   - Update metadata timestamp
   - Show notification

#### Update Duration

| Update Type              | Duration      |
| ------------------------ | ------------- |
| **Incremental (daily)**  | 2-5 minutes   |
| **Incremental (weekly)** | 5-15 minutes  |
| **Full download**        | 20-40 minutes |
| **Initial setup**        | 30-60 minutes |

Duration depends on:

- Internet connection speed
- NVD API rate limits
- Number of new/updated CVEs
- System performance

### Update Notifications

#### Success Notification

When updates complete successfully:

- Green checkmark icon
- Message: "NVD database updated successfully"
- Shows: CVE count, duration
- Action: None required

#### Failure Notification

When updates fail:

- Red X icon
- Message: "NVD database update failed"
- Shows: Error reason
- Action: Click to retry

#### Stale Database Warning

When database is outdated:

- Orange warning icon
- Message: "Database is X days old"
- Action: Click to refresh

---

## Application Updates (removed)

> The Electron-era application auto-updater — release channels, in-app "Check for Updates",
> per-OS installer downloads, and rollback — was removed when VulnAssessTool migrated to an
> Express server + browser web app (see the note in [Overview](#overview)). Deploying a new
> server version is an ops task (pull the release, `npm run build:all`, restart the process or
> redeploy the container), not an in-app flow.

---

## Scheduling Configuration

### Sync Schedule Settings

Access schedule settings:

1. Go to **Settings** → **Database Management**
2. Configure the **Sync Schedule**:

- **Frequency:** Daily / Weekly / Monthly / Manual
- **Rate limiting:** Respects the NVD API rate limit automatically (5 req/30s without an API
  key, 50 req/30s with one)

### Advanced Schedule Options

#### Bandwidth Throttling

To limit sync bandwidth:

1. Go to **Settings** → **Database Management**
2. Set **Bandwidth Limit (KB/s, 0 = unlimited)**

Sync downloads respect this limit.

---

## Update Behavior

### Update Conflicts

If a manual sync and a scheduled sync conflict:

- Only one sync runs at a time; a second request is rejected with "Sync already in progress"
- The scheduled sync resumes normally on its next cycle

### Background Updates

NVD database updates run in the background:

- Application remains usable
- Scan results may use stale data during update
- Progress shown inline
- Completion notification appears

### Offline Updates

For air-gapped or offline systems, use **Settings** → **Backup & Recovery** to create a
backup on an online instance, move the backup file to the offline system via portable media,
and restore it there. See [Database Setup Guide](DATABASE_SETUP.md#database-backup).

---

## Troubleshooting

### Updates Not Running

**Problem:** Scheduled updates aren't executing.

**Solutions:**

1. **Check Schedule:**
   - Verify the schedule isn't set to "Manual"
   - Check the server host's system clock is accurate

2. **Check the Server Process:**
   - The sync scheduler only runs while the server process is running
   - Confirm the server hasn't crashed or been restarted (a restart resets the rolling
     interval, starting the countdown from the restart time)

3. **Check Logs:**
   - Review the server console output for sync errors

### Updates Failing

**Problem:** Updates consistently fail.

**Solutions:**

1. **Check Internet Connection:**
   - Verify network connectivity
   - Check firewall settings
   - Ensure NVD API is accessible

2. **Check API Key:**
   - Verify API key is valid (if using)
   - Request new key if expired
   - Try without API key

3. **Check Disk Space:**
   - Ensure at least 15 GB free
   - Clear temporary files if needed
   - Free up disk space

4. **Check Database Lock:**
   - Close other processes/connections accessing the same data directory
   - Restart the server
   - Check for other background processes

### Slow Updates

**Problem:** Updates take too long.

**Solutions:**

1. **Use API Key:**
   - Reduces rate limiting delays
   - 100x higher rate limits

2. **Adjust Schedule:**
   - Update during off-peak hours
   - Reduce update frequency
   - Use manual updates when convenient

3. **Rebuild Indexes:**
   - Go to **Settings** → **Database Management**
   - Click **"Rebuild Indexes"**

### Update Data Corruption

**Problem:** Update completed but data is wrong.

**Solutions:**

1. **Verify Update:**
   - Check CVE count increased
   - Test scan with known vulnerability

2. **Force Full Re-import:**
   - Go to **Settings** → **Database Management**
   - Click **"Bulk Download"** to re-download and re-import recent years (requires an NVD API
     key)

3. **Reset Database:**
   - Last resort: delete and re-create database
   - Follow [Database Setup Guide](DATABASE_SETUP.md)

---

## Best Practices

### Recommended Schedule

For most organizations:

- **NVD Database:** Weekly

For security teams:

- **NVD Database:** Daily

For low-risk environments:

- **NVD Database:** Monthly

### Update Monitoring

Regularly monitor update health:

1. **Check Status:** Review database status weekly (Settings > Database Management)
2. **Review Logs:** Check the server console output for failed syncs
3. **Verify Freshness:** Ensure CVE count is increasing
4. **Test Scans:** Run test scans after updates

### Maintenance Tasks

Perform regular maintenance:

1. **Weekly:**
   - Check update status
   - Review notifications
   - Verify scan results

2. **Monthly:**
   - Optimize database
   - Rebuild indexes
   - Review update logs

3. **Quarterly:**
   - Full database review
   - Update schedule evaluation
   - Performance assessment

---

## FAQ

### Q: Do I need an NVD API key?

**A:** Not required, but highly recommended. Without a key, you're limited to 50 requests per 30 seconds, which makes updates much slower.

### Q: Can I update offline?

**A:** Yes. Create a backup on an online system and restore it on the offline system. See [Offline Updates](#offline-updates).

### Q: What happens if an update is interrupted?

**A:** The update resumes from where it left off next time. Partial updates are preserved and completed.

### Q: How often does NIST update the NVD?

**A:** NIST updates the NVD daily, typically around 9:00 AM EST. New CVEs are published continuously.

### Q: Can I share a database across multiple installations?

**A:** Yes, but only one installation should write to the database at a time. Use read-only mode for additional instances.

### Q: How much bandwidth do updates use?

**A:** Daily updates use ~2-5 MB. Weekly updates use ~15-35 MB. Initial download uses ~2-3 GB (compressed).

---

## API Reference

### Sync Schedule Configuration

`GET`/`PUT` `/api/database/config/sync` — the actual request/response shape used by the
Settings page:

```json
{
  "success": true,
  "config": {
    "syncInterval": "weekly",
    "bandwidthLimitKBps": 0
  }
}
```

`syncInterval` is one of `manual` | `daily` | `weekly` | `monthly`.

---

**Last Updated:** 2026-08-07
**Version:** 2.0.0
