# Update Scheduling Guide

## Overview

VulnAssessTool supports automatic updates for both the NVD vulnerability database and the application itself. This guide covers configuring and managing update schedules.

---

## Table of Contents

1. [Update Types](#update-types)
2. [NVD Database Updates](#nvd-database-updates)
3. [Application Updates](#application-updates)
4. [Scheduling Configuration](#scheduling-configuration)
5. [Update Behavior](#update-behavior)
6. [Troubleshooting](#troubleshooting)

---

## Update Types

VulnAssestTool has two types of updates:

### NVD Database Updates

- **What:** Vulnerability data from NIST
- **Frequency:** Daily (NIST publishes daily)
- **Size:** Incremental (2-5 MB per day)
- **Impact:** Enables vulnerability scanning
- **Requirement:** Essential for application functionality

### Application Updates

- **What:** VulnAssessTool software itself
- **Frequency:** As needed (releases)
- **Size:** Variable (50-200 MB)
- **Impact:** New features, bug fixes
- **Requirement:** Optional but recommended

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

1. Go to **Settings** → **Update Schedule**
2. Enable **"Auto-update NVD database"**
3. Select frequency:
   - **Daily:** Updates at 2:00 AM local time
   - **Weekly:** Updates every Sunday at 2:00 AM
   - **Monthly:** Updates on the 1st of each month at 2:00 AM
4. Click **Save**

#### Manual Updates

1. Check the database status indicator on the dashboard
2. If stale (orange/red icon), click **"Refresh"**
3. Update runs immediately
4. Progress is shown in the status bar

#### Update on Startup

To update every time the application starts:

1. Go to **Settings** → **Update Schedule**
2. Enable **"Update on startup"**
3. Updates run when VulnAssessTool launches
4. Can be combined with scheduled updates

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
   - Log event to audit log

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

## Application Updates

### Release Channels

VulnAssessTool uses the following release channels:

| Channel    | Stability | Updates              | Use Case            |
| ---------- | --------- | -------------------- | ------------------- |
| **Stable** | High      | Tested releases      | Production use      |
| **Beta**   | Medium    | Pre-release features | Early adopters      |
| **Dev**    | Low       | Latest code          | Development/testing |

### Checking for Updates

#### Manual Check

1. Go to **Settings** → **About**
2. Click **"Check for Updates"**
3. If update available:
   - Current version shown
   - New version shown
   - Release notes displayed
4. Click **"Download Update"** to proceed

#### Automatic Check

1. Go to **Settings** → **Update Schedule**
2. Enable **"Check for app updates"**
3. Select frequency:
   - **Daily**
   - **Weekly**
   - **Monthly**
4. When update found:
   - Notification appears
   - Click to view details
   - Choose to update now or later

### Update Process

#### Updating on Windows

1. Click **"Download Update"**
2. Update downloads in background
3. When ready, click **"Install Now"**
4. Application closes and installs
5. VulnAssessTool restarts automatically

#### Updating on macOS

1. Click **"Download Update"**
2. Update downloads to Downloads folder
3. Open the downloaded .dmg file
4. Drag VulnAssessTool to Applications folder
5. Replace existing version

#### Updating on Linux

1. Download the new AppImage or package
2. Make it executable: `chmod +x VulnAssessTool.AppImage`
3. Replace the existing file

### Rollback

If an update causes issues:

1. Go to **Settings** → **About**
2. Click **"Installation History"**
3. Select previous version
4. Click **"Rollback"**
5. Application restarts with previous version

**Note:** Rollback is only available for the previous version.

---

## Scheduling Configuration

### Update Schedule Settings

Access schedule settings:

1. Go to **Settings** → **Update Schedule**
2. Configure each update type:

#### NVD Database Settings

- **Auto-update:** Enable/disable automatic updates
- **Frequency:** Daily/Weekly/Monthly
- **Time:** Time of day to run (2:00 AM default)
- **On startup:** Update when application launches
- **Rate limiting:** Respect API rate limits

#### Application Settings

- **Check for updates:** Enable/disable automatic checks
- **Frequency:** Daily/Weekly/Monthly
- **Channel:** Stable/Beta/Dev
- **Auto-download:** Download updates automatically
- **Auto-install:** Install updates automatically

### Advanced Schedule Options

#### Custom Update Times

To set a custom update time:

1. Go to **Settings** → **Update Schedule** → **Advanced**
2. Enable **"Custom update time"**
3. Set hour and minute
4. Click **Save**

**Note:** Updates run at the configured time in your local timezone.

#### Update Windows

To limit updates to specific times:

1. Go to **Settings** → **Update Schedule** → **Advanced**
2. Enable **"Update window"**
3. Set start and end times
4. Updates only run within this window

**Example:** Only allow updates between 10 PM and 6 AM to avoid work hours.

#### Bandwidth Throttling

To limit update bandwidth:

1. Go to **Settings** → **Update Schedule** → **Advanced**
2. Enable **"Limit bandwidth"**
3. Set maximum download speed (KB/s)
4. Updates respect this limit

---

## Update Behavior

### Concurrent Updates

If multiple updates are scheduled:

1. Application updates take priority
2. NVD updates pause during app updates
3. NVD updates resume after app update completes
4. Failed updates are retried after 1 hour

### Update Conflicts

If manual and scheduled updates conflict:

- Manual update takes precedence
- Scheduled update is skipped for that cycle
- Next scheduled update runs normally

### Background Updates

NVD database updates run in the background:

- Application remains usable
- Scan results may use stale data during update
- Progress shown in status bar
- Completion notification appears

Application updates require:

- Application restart
- Save work before updating
- Active scans are cancelled
- Cannot run in background

### Offline Updates

For air-gapped or offline systems:

1. On an online system:
   - Go to **Settings** → **Update Schedule**
   - Click **"Export Database"**
   - Save to portable media (USB drive)

2. On the offline system:
   - Go to **Settings** → **Update Schedule**
   - Click **"Import Database"**
   - Select exported file from portable media
   - Database updates immediately

---

## Troubleshooting

### Updates Not Running

**Problem:** Scheduled updates aren't executing.

**Solutions:**

1. **Check Schedule:**
   - Verify schedule is enabled
   - Confirm correct time is set
   - Check system clock is accurate

2. **Check Application Running:**
   - Updates only run when app is open
   - Enable "Update on startup" if needed
   - Keep application running overnight

3. **Check Logs:**
   - Go to **Settings** → **Audit Log**
   - Filter for "database.update" events
   - Look for error messages

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
   - Close other database connections
   - Restart VulnAssessTool
   - Check for background processes

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

3. **Optimize Database:**
   - Go to **Settings** → **Database Maintenance**
   - Click **"Optimize Database"**
   - Run **"Rebuild Indexes"**

### Update Data Corruption

**Problem:** Update completed but data is wrong.

**Solutions:**

1. **Verify Update:**
   - Check CVE count increased
   - Review audit log for errors
   - Test scan with known vulnerability

2. **Force Full Update:**
   - Go to **Settings** → **Update Schedule** → **Advanced**
   - Click **"Force full sync"**
   - Full database re-download runs

3. **Reset Database:**
   - Last resort: delete and re-create database
   - Follow [Database Setup Guide](DATABASE_SETUP.md)

---

## Best Practices

### Recommended Schedule

For most organizations:

- **NVD Database:** Weekly (Sunday nights)
- **Application:** Weekly (check, manual install)
- **On Startup:** Disabled (use scheduled updates only)

For security teams:

- **NVD Database:** Daily (early morning)
- **Application:** Weekly (auto-download, manual install)
- **On Startup:** Enabled (always fresh)

For low-risk environments:

- **NVD Database:** Monthly (first Sunday)
- **Application:** Monthly (check and install)
- **On Startup:** Disabled

### Update Monitoring

Regularly monitor update health:

1. **Check Status:** Review database status weekly
2. **Review Logs:** Check audit log for failed updates
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

**A:** Yes. Export the database from an online system and import it to the offline system. See [Offline Updates](#offline-updates).

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

### Update Schedule Configuration

```json
{
  "nvdDatabase": {
    "autoUpdate": true,
    "frequency": "weekly",
    "time": "02:00",
    "onStartup": false,
    "apiKey": "your-api-key"
  },
  "application": {
    "checkForUpdates": true,
    "frequency": "weekly",
    "channel": "stable",
    "autoDownload": false,
    "autoInstall": false
  },
  "advanced": {
    "customTime": "02:00",
    "updateWindow": {
      "enabled": false,
      "start": "22:00",
      "end": "06:00"
    },
    "bandwidthLimit": {
      "enabled": false,
      "maxKbps": 500
    }
  }
}
```

---

**Last Updated:** 2026-02-10
**Version:** 0.1.0
