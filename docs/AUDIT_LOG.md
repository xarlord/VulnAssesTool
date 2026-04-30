# Audit Log Usage Guide

## Overview

VulnAssessTool includes a comprehensive audit logging system that tracks all user actions, system events, and changes. This guide covers how to use, filter, export, and manage audit logs.

---

## Table of Contents

1. [What is the Audit Log?](#what-is-the-audit-log)
2. [Accessing the Audit Log](#accessing-the-audit-log)
3. [Understanding Audit Events](#understanding-audit-events)
4. [Filtering and Searching](#filtering-and-searching)
5. [Exporting Audit Logs](#exporting-audit-logs)
6. [Audit Log Retention](#audit-log-retention)
7. [Security Considerations](#security-considerations)

---

## What is the Audit Log?

The audit log is a chronological record of all significant events in VulnAssessTool, including:

- **User Actions:** Project creation, deletion, edits
- **Scanning Activity:** Vulnerability scans, refresh operations
- **Data Changes:** SBOM uploads, vulnerability dismissals
- **System Events:** Database updates, settings changes
- **Access Events:** Login, logout (for multi-user setups)

### Benefits

- **Compliance:** Meet audit requirements for security standards
- **Accountability:** Track who did what and when
- **Troubleshooting:** Investigate issues and errors
- **Forensics:** Reconstruct events after an incident

---

## Accessing the Audit Log

### Opening the Audit Log

1. Launch VulnAssessTool
2. Click the **Settings** gear icon in the top-right
3. Navigate to the **Audit Log** tab
4. The audit log panel displays recent events

### Audit Log Interface

The audit log panel consists of:

- **Event List:** Chronological list of all events
- **Filter Bar:** Controls for filtering events
- **Detail View:** Expandable details for each event
- **Export Button:** Export log to various formats
- **Search Box:** Full-text search across events

---

## Understanding Audit Events

### Event Structure

Each audit event contains:

| Field           | Description                              | Example                                 |
| --------------- | ---------------------------------------- | --------------------------------------- |
| **Timestamp**   | When the event occurred                  | 2026-02-10 14:30:00                     |
| **Event Type**  | Category of event                        | project.created                         |
| **Actor**       | User or system that performed the action | user@company.com                        |
| **Resource**    | Target of the action                     | project-123                             |
| **Description** | Human-readable description               | Created new project "Web App"           |
| **Details**     | Additional context (JSON)                | `{name: "Web App", description: "..."}` |
| **IP Address**  | Network origin (if applicable)           | 192.168.1.100                           |

### Event Types

#### Project Events

- `project.created` - New project created
- `project.updated` - Project details modified
- `project.deleted` - Project removed
- `project.exported` - Project data exported

#### SBOM Events

- `sbom.uploaded` - SBOM file uploaded
- `sbom.removed` - SBOM file removed
- `sbom.parsed` - SBOM successfully parsed
- `sbom.parse_failed` - SBOM parsing error

#### Scanning Events

- `scan.started` - Vulnerability scan initiated
- `scan.completed` - Scan finished successfully
- `scan.failed` - Scan encountered an error
- `scan.cancelled` - Scan cancelled by user

#### Vulnerability Events

- `vulnerability.detected` - New vulnerability found
- `vulnerability.dismissed` - Vulnerability marked as dismissed
- `vulnerability.undismissed` - Dismissal revoked
- `vulnerability.updated` - Vulnerability data refreshed

#### System Events

- `database.updated` - NVD database updated
- `settings.changed` - Application settings modified
- `user.logged_in` - User session started
- `user.logged_out` - User session ended

### Event Severity

Events are color-coded by severity:

- 🔵 **Info:** Normal operations (create, update)
- 🟢 **Success:** Completed operations (scan finished)
- 🟡 **Warning:** Potential issues (scan rate limited)
- 🔴 **Error:** Failed operations (scan failed)
- ⚫ **Critical:** Security-relevant events (data deleted)

---

## Filtering and Searching

### Filter Controls

The audit log provides multiple filtering options:

#### By Date Range

1. Click the **Date Range** dropdown
2. Select preset: Last 24 hours, Last 7 days, Last 30 days, Custom
3. For custom range, select start and end dates
4. Events outside the range are hidden

#### By Event Type

1. Click the **Event Type** dropdown
2. Select one or more categories:
   - Projects
   - SBOMs
   - Scans
   - Vulnerabilities
   - System
3. Matching events are displayed

#### By Actor

1. Enter a username or email in the **Actor** field
2. Events performed by that actor are shown
3. Use `*` for wildcard matching

#### By Severity

1. Click severity level buttons:
   - Info
   - Success
   - Warning
   - Error
   - Critical
2. Multiple selections allowed

### Full-Text Search

The search box supports:

- **Keyword Search:** Search across descriptions
- **Field-Specific Search:** Use `field:value` syntax
- **Wildcards:** Use `*` for partial matches

#### Search Examples

```
# Find all scan events
type:scan*

# Find events by a specific user
actor:john@company.com

# Find events containing "project"
project

# Combine filters
type:scan* actor:admin*

# Find errors in the last 24 hours
severity:error date:last24h
```

### Saving Filter Presets

To save a filter configuration:

1. Apply your desired filters
2. Click **Save Filter Preset**
3. Enter a name for the preset
4. Click **Save**

To load a preset:

1. Click the **Filter Presets** dropdown
2. Select your saved preset
3. Filters are applied automatically

---

## Exporting Audit Logs

### Export Formats

VulnAssessTool supports exporting audit logs in multiple formats:

#### JSON Format

- **Use Case:** Data analysis, integrations
- **Structure:** Array of event objects with full details
- **Example:**
  ```json
  [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "timestamp": "2026-02-10T14:30:00Z",
      "type": "project.created",
      "actor": "user@company.com",
      "resource": "project-123",
      "description": "Created new project",
      "details": {...}
    }
  ]
  ```

#### CSV Format

- **Use Case:** Spreadsheet analysis, reporting
- **Structure:** Tabular format with columns
- **Columns:** Timestamp, Type, Actor, Resource, Description

#### PDF Format

- **Use Case:** Formal reports, compliance documentation
- **Structure:** Formatted report with headers and pagination
- **Options:** Include/exclude event details

### Exporting Logs

1. Apply desired filters (optional)
2. Click the **Export** button
3. Select export format:
   - **JSON** for data processing
   - **CSV** for spreadsheets
   - **PDF** for reports
4. Choose export options:
   - Include event details
   - Include system events
   - Date range to export
5. Click **Export**
6. File downloads to your default location

### Export Options

| Option              | Description                              |
| ------------------- | ---------------------------------------- |
| **Include Details** | Include full JSON details for each event |
| **Include System**  | Include low-level system events          |
| **Compress Output** | Create a .zip file for large exports     |
| **Split by Month**  | Create separate files for each month     |

### Large Exports

For large date ranges or high-volume logs:

1. Use **Split by Month** to create multiple files
2. Enable **Compress Output** to reduce file size
3. Consider exporting in smaller date ranges

---

## Audit Log Retention

### Retention Policy

By default, audit logs are retained for:

- **Default:** 90 days
- **Configurable:** 7 days to 1 year
- **Maximum:** Unlimited (disk space permitting)

### Configuring Retention

1. Go to **Settings** → **Audit Log** → **Retention**
2. Select retention period:
   - 7 days
   - 30 days
   - 90 days (default)
   - 180 days
   - 365 days
   - Unlimited
3. Click **Save**

Old events are automatically deleted based on the retention policy.

### Manual Cleanup

To immediately free up space:

1. Go to **Settings** → **Audit Log** → **Maintenance**
2. Click **"Clean Up Old Events"**
3. Confirm the action
4. Events older than the retention period are deleted

**Warning:** This action cannot be undone. Consider exporting logs before cleanup.

### Archive Old Logs

To preserve logs before cleanup:

1. Export the desired date range (see [Exporting](#exporting-audit-logs))
2. Save to a secure location
3. Run cleanup to remove from the application

---

## Security Considerations

### Protecting Audit Logs

Audit logs contain sensitive information:

- User activity patterns
- Project names and structures
- Vulnerability findings
- System configuration

**Best Practices:**

1. **Access Control:** Limit audit log access to authorized users
2. **Encryption:** Encrypt exported logs when storing or transmitting
3. **Retention:** Follow your organization's retention policy
4. **Backup:** Regularly backup audit logs to secure storage
5. **Integrity:** Use checksums to verify log integrity

### Audit Log Tampering

VulnAssessTool includes protections against log tampering:

- **Immutable Events:** Past events cannot be modified
- **Digital Signatures:** Events are cryptographically signed
- **Chain of Custody:** Maintain log export records

To verify log integrity:

1. Export logs to JSON format
2. Check the `signature` field on each event
3. Use the verification tool to confirm authenticity

### Compliance

Audit logs help meet compliance requirements:

- **SOC 2:** Track all access and changes
- **ISO 27001:** Evidence of security controls
- **PCI DSS:** Vulnerability management documentation
- **HIPAA:** PHI access tracking (if applicable)

---

## Troubleshooting

### Missing Events

**Problem:** Expected events are not showing in the log.

**Solutions:**

1. Check filter settings - ensure filters aren't hiding events
2. Verify date range - expand to include older events
3. Search by specific terms to locate events
4. Check if events were purged by retention policy

### Large Log Size

**Problem:** Audit log file is too large.

**Solutions:**

1. Reduce retention period in settings
2. Run manual cleanup to remove old events
3. Export and archive old logs externally
4. Consider using database cleanup tools

### Slow Performance

**Problem:** Audit log panel is slow to load.

**Solutions:**

1. Reduce date range for queries
2. Apply filters to reduce result set
3. Export and analyze externally for large datasets
4. Consider database indexing (advanced)

---

## FAQ

### Q: Can I delete individual audit events?

**A:** No. Audit logs are immutable for security and compliance reasons. You can only delete events in bulk based on retention policy.

### Q: Who can view the audit log?

**A:** By default, all users of the application can view the audit log. In multi-user environments, access may be restricted by role.

### Q: Are audit logs backed up?

**A:** Audit logs are stored in the application database. Regular database backups include audit logs. We recommend exporting logs periodically for long-term retention.

### Q: Can I search across multiple projects?

**A:** Yes. The audit log is global and includes events from all projects. Use the resource filter to focus on specific projects.

### Q: What happens if I delete a project?

**A:** All audit events related to that project are preserved. The project is marked as deleted in the audit log, but the event history remains.

---

## API Reference

### Audit Log Events Schema

```typescript
interface AuditEvent {
  id: string // ULID unique identifier
  timestamp: string // ISO 8601 timestamp
  type: string // Event type (e.g., "project.created")
  actor: string // User or system identifier
  resource: string // Target resource ID
  description: string // Human-readable description
  details: object // Additional context (JSON)
  severity: 'info' | 'success' | 'warning' | 'error' | 'critical'
  ipAddress?: string // Network origin (if applicable)
  userAgent?: string // Client user agent
}
```

### Event Types Reference

| Category      | Type                      | Description                 |
| ------------- | ------------------------- | --------------------------- |
| Project       | `project.created`         | New project created         |
| Project       | `project.updated`         | Project modified            |
| Project       | `project.deleted`         | Project removed             |
| SBOM          | `sbom.uploaded`           | SBOM uploaded               |
| SBOM          | `sbom.parsed`             | SBOM parsed successfully    |
| Scan          | `scan.started`            | Vulnerability scan started  |
| Scan          | `scan.completed`          | Vulnerability scan finished |
| Vulnerability | `vulnerability.detected`  | Vulnerability found         |
| Vulnerability | `vulnerability.dismissed` | Vulnerability dismissed     |
| System        | `database.updated`        | NVD database updated        |
| System        | `settings.changed`        | Settings modified           |

---

**Last Updated:** 2026-02-10
**Version:** 0.1.0
