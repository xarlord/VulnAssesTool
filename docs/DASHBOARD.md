# Dashboard Configuration Guide

## Overview

The VulnAssessTool dashboard provides a comprehensive view of your security posture, project status, and vulnerability metrics. This guide covers dashboard customization, widget configuration, and data interpretation.

---

## Table of Contents

1. [Dashboard Overview](#dashboard-overview)
2. [Navigation](#navigation)
3. [Statistics Cards](#statistics-cards)
4. [Project Cards](#project-cards)
5. [Health Dashboard](#health-dashboard)
6. [Bulk Operations](#bulk-operations)
7. [Customization](#customization)

---

## Dashboard Overview

### Main Dashboard Layout

The main dashboard consists of:

- **Header:** Application title, search, settings, notifications
- **Statistics Bar:** High-level metrics (projects, vulnerabilities)
- **Project Grid:** Cards for each project
- **Bulk Actions Bar:** Operations on selected projects
- **Status Indicators:** Database and system status

### Accessing the Dashboard

The dashboard is the default view when you launch VulnAssessTool. To return to the dashboard from another page:

- Click the **VulnAssessTool** logo in the top-left
- Or use the breadcrumbs navigation

---

## Navigation

### Header Controls

| Element           | Function                    |
| ----------------- | --------------------------- |
| **Logo**          | Return to dashboard         |
| **Search**        | Open global search (Ctrl+K) |
| **Notifications** | View notification center    |
| **Settings**      | Open settings page          |
| **Theme Toggle**  | Switch light/dark mode      |

### Keyboard Shortcuts

| Shortcut | Action               |
| -------- | -------------------- |
| `Ctrl+K` | Open global search   |
| `Ctrl+,` | Open settings        |
| `Ctrl+N` | Create new project   |
| `Escape` | Close dialogs/modals |

---

## Statistics Cards

### Overview

The statistics bar displays high-level metrics across all projects:

- **Total Projects:** Number of projects in the workspace
- **Critical Vulnerabilities:** Count of CRITICAL severity across all projects
- **High Vulnerabilities:** Count of HIGH severity across all projects
- **Total Vulnerabilities:** Total count of all vulnerabilities

### Interpreting Statistics

#### Total Projects

- **What it shows:** Number of active projects
- **What it means:** Scope of your security assessment
- **Click behavior:** Filters project list to show all

#### Critical Vulnerabilities

- **What it shows:** Count of CRITICAL severity vulnerabilities
- **What it means:** Immediate attention required
- **Color:** Red badge
- **Click behavior:** Filters project list to show only projects with CRITICAL vulnerabilities

#### High Vulnerabilities

- **What it shows:** Count of HIGH severity vulnerabilities
- **What it means:** Plan remediation soon
- **Color:** Orange badge
- **Click behavior:** Filters project list to show only projects with HIGH vulnerabilities

#### Total Vulnerabilities

- **What it shows:** Aggregate count of all vulnerabilities
- **What it means:** Overall security workload
- **Click behavior:** Shows all projects (resets filters)

### Statistics Filtering

Clicking on a statistic card filters the project list:

1. Click **Critical Vulnerabilities** card
2. Project list shows only projects with CRITICAL vulnerabilities
3. Filter badge appears: "Critical: Yes"
4. Click the badge or **"Clear Filters"** to reset

---

## Project Cards

### Card Layout

Each project card displays:

- **Project Name:** Clickable to open project details
- **Description:** Brief project description (if provided)
- **Statistics:** Components, vulnerabilities, critical, high
- **Last Scan:** When the project was last scanned
- **Health Score:** Overall project health (0-100)
- **Actions:** Delete, export, scan buttons

### Project Card Information

| Field               | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| **Components**      | Number of components (libraries, frameworks) in the project |
| **Vulnerabilities** | Total vulnerability count                                   |
| **Critical**        | Count of CRITICAL severity vulnerabilities                  |
| **High**            | Count of HIGH severity vulnerabilities                      |
| **Last Scan**       | Date/time of last vulnerability scan                        |
| **Health Score**    | Overall health (0-100, higher is better)                    |

### Health Score Interpretation

| Score  | Color     | Status    | Meaning                     |
| ------ | --------- | --------- | --------------------------- |
| 90-100 | 🟢 Green  | Excellent | No critical vulnerabilities |
| 75-89  | 🟢 Green  | Good      | Minor issues only           |
| 60-74  | 🟡 Yellow | Fair      | Moderate vulnerabilities    |
| 40-59  | 🟠 Orange | Poor      | Many high-severity issues   |
| 0-39   | 🔴 Red    | Critical  | Immediate attention needed  |

### Project Card Actions

#### View Details

Click anywhere on the project card to open the project detail page.

#### Quick Scan

Click the **Scan** button to start a vulnerability scan for this project.

#### Delete Project

Click the **Delete** button to remove the project (requires confirmation).

#### Export Project

Click the **Export** button to export project data.

### Project Selection

#### Select Individual Projects

1. Click the checkbox in the top-right of a project card
2. Card becomes highlighted
3. Bulk actions bar appears

#### Select All Projects

1. Click the **"Select All"** checkbox in the header
2. All projects are selected
3. Bulk actions bar appears

#### Cancel Selection

- Click **"Cancel"** in the bulk actions bar
- Or click the checkbox again to deselect

---

## Health Dashboard

### Overview

The health dashboard provides an in-depth view of component health and remediation priorities. Access it by:

1. Click on a project card to open project details
2. Click the **"Health"** tab

### Health Score Components

The health score is calculated based on:

| Factor                  | Weight | Description                                 |
| ----------------------- | ------ | ------------------------------------------- |
| **Vulnerability Score** | 0-40   | Severity and count of vulnerabilities       |
| **Age Score**           | 0-20   | How recently vulnerabilities were published |
| **Patch Score**         | 0-20   | Availability of patches                     |
| **Version Score**       | 0-20   | Component version currency                  |

### Health Distribution Chart

The pie chart shows the distribution of component health:

- **Excellent (90-100):** No critical issues
- **Good (75-89):** Minor issues only
- **Fair (60-74):** Moderate vulnerabilities
- **Poor (40-59):** Many high-severity issues
- **Critical (0-39):** Immediate attention needed

### Remediation Queue

The remediation queue prioritizes components by health score:

1. **Critical Priority:** Components with health < 40
2. **High Priority:** Components with health 40-59
3. **Medium Priority:** Components with health 60-74
4. **Low Priority:** Components with health ≥ 75

Each queue entry shows:

- Component name and version
- Health score
- Vulnerability count
- Patch availability
- **"View Vulnerabilities"** button

### Health Dashboard Actions

#### View Component Vulnerabilities

1. Click **"View Vulnerabilities"** on a component
2. Vulnerabilities tab opens
3. Filtered to show only that component's vulnerabilities

#### Analyze Health Factors

1. Click on a health score card
2. Health factors breakdown is shown
3. See which factors are lowering the score

---

## Bulk Operations

### Bulk Actions Bar

When projects are selected, the bulk actions bar appears with:

- **Selected Count:** Number of projects selected
- **Delete:** Remove all selected projects
- **Export:** Export all selected projects
- **Cancel:** Clear selection

### Bulk Delete

1. Select projects using checkboxes
2. Click **"Delete"** in the bulk actions bar
3. Confirm deletion in the dialog
4. All selected projects are removed

**Warning:** Bulk delete cannot be undone.

### Bulk Export

1. Select projects using checkboxes
2. Click **"Export"** in the bulk actions bar
3. Choose export format:
   - **JSON:** Individual project files
   - **CSV:** Combined data sheet
   - **PDF:** Combined report
4. Files download to your default location

---

## Customization

### View Options

#### Grid View vs List View

Toggle between project grid and list view:

1. Click the **View Options** button (top-right of project area)
2. Select **Grid** or **List**
3. Preference is saved

#### Sort Order

Change project sort order:

1. Click the **Sort** dropdown
2. Select sort criteria:
   - **Name (A-Z):** Alphabetical
   - **Name (Z-A):** Reverse alphabetical
   - **Last Scan:** Most recent first
   - **Health Score:** Lowest (worst) first
   - **Vulnerability Count:** Highest first
3. Projects re-sort automatically

### Filter Projects

#### By Search

1. Type in the **Search** box
2. Projects matching the search term are shown
3. Search matches: name, description, component names

#### By Vulnerability Severity

1. Click a severity badge in the statistics bar
2. Projects with that severity are shown
3. Filter badge appears
4. Click **"Clear Filters"** to reset

#### By Health Score

1. Click the **Health** dropdown
2. Select health range:
   - **All (0-100):** Show all projects
   - **Critical (0-39):** Poor health only
   - **Warning (40-74):** Fair to poor health
   - **Good (75-100):** Good to excellent health
3. Projects filter automatically

### Dashboard Layout

#### Customize Card Size

Adjust project card size:

1. Click **View Options**
2. Select card size:
   - **Compact:** Small cards, more per row
   - **Default:** Balanced size
   - **Large:** Large cards, more information
3. Layout updates immediately

#### Hide/Show Statistics

Toggle statistics cards:

1. Click **View Options**
2. Toggle **Show Statistics**
3. Statistics bar shows/hides
4. Preference is saved

---

## Widgets and Integrations

### Status Widgets

#### Database Status

Shows NVD database status:

- **Fresh:** Updated within 7 days (green)
- **Stale:** 7-30 days old (orange)
- **Very Old:** 30+ days old (red)

Click to refresh the database.

#### System Status

Shows application health:

- **Notifications:** Unread notification count
- **Scans:** Active scan count
- **Updates:** Available application updates

### Notification Center

Access notifications:

1. Click the **bell icon** in the header
2. Notification panel opens showing:
   - Unread notifications
   - Notification type (scan, system, update)
   - Timestamp
3. Click a notification to view details
4. Click **"Mark All as Read"** to clear

---

## Performance Tips

### Large Project Lists

If you have many projects:

1. **Use Filters:** Reduce visible projects
2. **Sort Strategically:** Prioritize by health or vulnerability count
3. **Use Search:** Find specific projects quickly
4. **Compact View:** Show more projects per screen

### Dashboard Loading

If the dashboard is slow to load:

1. **Reduce History:** Delete old projects
2. **Limit Display:** Use filters to show fewer projects
3. **Compact View:** Reduce card size
4. **Disable Animations:** Turn off transitions in settings

---

## Troubleshooting

### Projects Not Showing

**Problem:** Recently created projects aren't visible.

**Solutions:**

1. Refresh the page (F5)
2. Clear filters
3. Check if projects are in a different workspace
4. Verify database connection

### Incorrect Statistics

**Problem:** Statistics don't match actual vulnerability counts.

**Solutions:**

1. Run a full scan on all projects
2. Refresh the database
3. Clear browser cache (if using web version)
4. Check for dismissed vulnerabilities

### Health Scores Wrong

**Problem:** Health scores don't match vulnerability counts.

**Solutions:**

1. Health scores consider multiple factors (not just count)
2. Check health factors breakdown for details
3. Ensure recent scans have been run
4. Verify patch data is up to date

---

## FAQ

### Q: How many projects can I have?

**A:** There's no hard limit. Performance depends on your system, but hundreds of projects are supported.

### Q: Can I share dashboard views?

**A:** Not directly. However, you can export filtered views and share the exported data.

### Q: How often are statistics updated?

**A:** Statistics update in real-time as you make changes. Scans update statistics immediately upon completion.

### Q: Can I customize which statistics are shown?

**A:** The four default statistics (projects, critical, high, total) are currently fixed. Custom statistics may be added in future versions.

### Q: What's the difference between grid and list view?

**A:** Grid view shows project cards in a grid layout. List view shows projects in a tabular format with more details per row.

---

## Best Practices

### Dashboard Organization

1. **Use Descriptive Names:** Name projects clearly and consistently
2. **Add Descriptions:** Include project context in descriptions
3. **Regular Scans:** Scan projects regularly to keep data current
4. **Review Health:** Check health dashboard weekly
5. **Prioritize Remediation:** Focus on critical and high-severity items

### Workflow Recommendations

1. **Daily:** Review critical vulnerabilities
2. **Weekly:** Review health dashboard, scan projects
3. **Monthly:** Review all vulnerabilities, plan remediation
4. **Quarterly:** Full security assessment, update baselines

---

**Last Updated:** 2026-02-10
**Version:** 0.1.0
