# UI Overhaul Plan — D-Fence Vulnerability Assessment Tool

**Branch:** `UI-overhaul` (from `master` at `da7c8ae`)
**Style:** Clean corporate — light mode primary, blue accents, card-heavy (Atlassian/ServiceNow inspired)
**Strategy:** Single branch, page-by-page commits
**Design tool:** Google Stitch MCP (to be configured in opencode.json)

---

## Phase 0 — Foundation (Setup)

### 0.1 Configure Stitch MCP

- Add Stitch MCP server to `~/.config/opencode/opencode.json` under `"mcp"` key:
  ```json
  {
    "mcp": {
      "stitch": {
        "type": "remote",
        "url": "https://stitch.googleapis.com/mcp",
        "headers": {
          "X-Goog-Api-Key": "REDACTED"
        }
      }
    }
  }
  ```
- Verify connection by invoking a design generation tool

### 0.2 Create branch

- `git checkout -b UI-overhaul master`

### 0.3 Design token refresh

- Update `globals.css` — refine the light/dark CSS custom properties for "clean corporate" look:
  - Primary blue: keep `--primary: 239 84% 57%` (indigo-600) as base, add lighter tints for hover/active
  - Add new tokens: `--success`, `--warning`, `--info` for semantic colors
  - Refine card backgrounds: subtle gradient or elevation tokens
  - Add shadow tokens: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
  - Update `tailwind.config.js` to expose new tokens

### 0.4 Clean up duplicates

- Remove `src/renderer/components/Skeleton.tsx` (keep `ui/skeleton.tsx`)
- Remove `src/renderer/components/EmptyState.tsx` (keep `ui/EmptyState.tsx`)
- Remove legacy `src/renderer/index.css` and `src/renderer/App.css` (Vite boilerplate)

### 0.5 Missing shadcn/ui primitives to add

- `tooltip.tsx` — for help tooltips (already have Radix tooltip in deps)
- `dropdown-menu.tsx` — for action menus (currently hand-coded)
- `separator.tsx` — for dividers
- `progress.tsx` — for scan progress bars (currently hand-coded)
- `card.tsx` — Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter

**Commit:** `chore: ui foundation — design tokens, primitive cleanup, new shadcn components`

---

## Phase 1 — Layout Shell (Sidebar + Header)

This is the highest-impact change — it affects every page.

### 1.1 Create `Sidebar` component

- `src/renderer/components/layout/Sidebar.tsx`
- Collapsible (icon-only mode) using existing `sidebarOpen` store state
- Nav items:
  - **Home** (`/`) — House icon
  - **Dashboard** (`/dashboard`) — LayoutDashboard icon
  - **Search** (`/search`) — Search icon
  - **Settings** (`/settings`) — Settings icon
- Active item highlighted with `bg-primary/10 text-primary`
- Bottom section: Collapse toggle button
- Collapsed: 56px wide (icons only). Expanded: 240px
- Smooth width transition via `transition-all`
- **Not shown** on HomePage (standalone landing page)

### 1.2 Create `AppHeader` component

- `src/renderer/components/layout/AppHeader.tsx`
- Props: `title: string`, `breadcrumbs?: Crumb[]`, `actions?: ReactNode`
- Left: breadcrumb trail or back button
- Center: page title
- Right: action slot (scan button, filters, etc.)
- Consistent height (56px), bottom border, `bg-card`

### 1.3 Create `AppLayout` component

- `src/renderer/components/layout/AppLayout.tsx`
- Wraps: `[Sidebar] [Main Content Area]`
- Main area: `[AppHeader] [Page Content]`
- HomePage renders without AppLayout (standalone)
- All other pages render inside AppLayout

### 1.4 Update `App.tsx`

- Wrap routes in AppLayout (except HomePage)
- Remove per-page header duplication from Dashboard, ProjectDetail, Search, Settings, FPF, DependencyGraphPage

### 1.5 Create barrel export

- `src/renderer/components/layout/index.ts`

**Commit:** `feat: layout shell — sidebar, header, app layout`

---

## Phase 2 — HomePage (Landing)

### Files

- `src/renderer/pages/HomePage.tsx`

### Design direction

- Full-page hero (no sidebar, no header)
- Large headline: "Vulnerability Assessment Made Simple"
- 4-step workflow cards with icons and subtle hover animations
- CTA: "Get Started" → `/dashboard`, "View Demo" (if applicable)
- Bottom: tips section with subtle cards
- Footer with version + links

### Use Stitch MCP

- Generate hero section layout
- Generate workflow step cards

**Commit:** `feat: homepage redesign — clean corporate hero layout`

---

## Phase 3 — Dashboard

### Files

- `src/renderer/pages/Dashboard.tsx`
- `src/renderer/components/ProjectCard.tsx`

### Design direction

- Inside AppLayout (sidebar + header with "Dashboard" title)
- Quick-action bar: Button group (New Project, Import SBOM, Generate SBOM, Export All) — use `ui/button.tsx`
- 4 stat cards in a row: Projects, Critical Vulns, High Vulns, Total Vulns — use new `Card` primitive
- Project grid: `ProjectCard` components in responsive grid (2-3 cols)
- ProjectCard redesign: cleaner card with status indicator, last scan date, severity summary bar

### Use Stitch MCP

- Generate dashboard layout
- Generate stat card + project card designs

**Commit:** `feat: dashboard redesign — stat cards, project grid, action bar`

---

## Phase 4 — ProjectDetail

### Files

- `src/renderer/pages/ProjectDetail.tsx`
- (extract sub-components if possible within scope)

### Design direction

- Inside AppLayout (header shows project name + breadcrumbs)
- Tab bar: Overview | Components | Vulnerabilities | Health — use `ui/tabs.tsx`
- **Overview tab**: stat cards row, SBOM files table, metadata grid
- **Components tab**: search bar + filter pills + virtual list — use `ui/input.tsx`, `ui/badge.tsx`
- **Vulnerabilities tab**: severity filter bar, advanced filter panel (collapsible), grouped vulnerability rows
- **Health tab**: HealthDashboard (already exists, just style pass)
- Scan progress: inline progress bar in header (not modal)

### Use Stitch MCP

- Generate tabbed project detail layout
- Generate vulnerability list row design

**Commit:** `feat: project detail redesign — tabs, overview, vulnerability list`

---

## Phase 5 — FalsePositiveFilterPage

### Files

- `src/renderer/pages/FalsePositiveFilter.tsx`
- `src/renderer/components/FPF/FilterDashboard.tsx`
- `src/renderer/components/FPF/FilteredItemsReview.tsx`
- `src/renderer/components/FPF/ConfigWizard.tsx`
- `src/renderer/components/FPF/MissFilterPanel.tsx`

### Design direction

- Inside AppLayout (header: "False Positive Filter" + breadcrumb back to project)
- 4-tab interface (Dashboard, Review, Config, Miss-Filter) — use `ui/tabs.tsx`
- Dashboard tab: stat cards + filter action
- Review tab: table with expandable rows, undo/export actions
- Config tab: step wizard with Card sections
- Miss-Filter tab: threshold slider + flagged items list

**Commit:** `feat: fpf page redesign — tabs, dashboard, config wizard`

---

## Phase 6 — DependencyGraphPage

### Files

- `src/renderer/pages/DependencyGraphPage.tsx`

### Design direction

- Inside AppLayout (header: "Dependency Graph" + filters)
- Full-width Cytoscape canvas
- Floating filter panel (severity dropdown, vulnerable-only toggle) — use `ui/select.tsx`, `ui/checkbox.tsx`
- Stats footer bar with severity pill badges

**Commit:** `feat: dependency graph redesign — filters, stats bar`

---

## Phase 7 — Search

### Files

- `src/renderer/pages/Search.tsx`

### Design direction

- Inside AppLayout (header: "Search")
- Two-mode toggle: "Project Search" | "NVD Database" — use `ui/tabs.tsx` or segmented control
- Search input with debounce indicator — use `ui/input.tsx`
- NVD sync controls with progress
- Results list with severity badges, CVE detail modal on click

**Commit:** `feat: search page redesign — dual mode, results list`

---

## Phase 8 — Settings

### Files

- `src/renderer/pages/Settings.tsx`

### Design direction

- Inside AppLayout (header: "Settings")
- Left-side section nav (vertical tabs) or accordion sections
- Sections: Profiles, Appearance, API Config, Database, Backup, Intelligence
- Each section as a Card with proper form controls using `ui/` primitives
- Consistent spacing, proper label + input patterns

### Note

- Settings.tsx is ~1500 lines. This is the hardest page. May need to extract sub-components.

**Commit:** `feat: settings page redesign — section nav, form controls`

---

## Phase 9 — ExecutiveDashboard

### Files

- `src/renderer/components/executive/ExecutiveDashboard.tsx`
- `src/renderer/components/executive/widgets/*.tsx`

### Design direction

- Inside AppLayout (header: "Executive Dashboard" + date range picker)
- Widget grid: 2x3 responsive grid of cards
- Each widget in Card primitive
- RiskGauge as hero widget (full width or 2-col span)
- Consistent chart styling across all widgets

**Commit:** `feat: executive dashboard redesign — widget grid, chart styling`

---

## Phase 10 — Shared Components Polish

### Files

- `src/renderer/components/VulnerabilityDetailModal.tsx`
- `src/renderer/components/SbomUploadDialog.tsx`
- `src/renderer/components/CreateProjectDialog.tsx`
- `src/renderer/components/ExportDialog.tsx`
- `src/renderer/components/Toaster.tsx`
- All chart components in `charts/`
- All dialog/modal components

### Changes

- Convert all modals to use `ui/dialog.tsx` primitives
- Convert all buttons to use `ui/button.tsx`
- Convert all selects/inputs to use `ui/select.tsx` / `ui/input.tsx`
- Ensure consistent badge styling via `ui/badge.tsx`
- Chart theming: consistent colors from design tokens

**Commit:** `feat: shared component polish — dialogs, buttons, charts`

---

## Phase 11 — Verification & Cleanup

### 11.1 Run verification

1. `npx eslint .` — 0 errors
2. `npm run build` — all 4 tsconfigs compile
3. `npm run test` — unit tests pass
4. `npm run test:e2e` — E2E smoke tests pass (update selectors if layout changed)

### 11.2 Update E2E tests

- Update navigation tests for sidebar
- Update header selector tests for new AppHeader
- Update any hardcoded class selectors

### 11.3 Final cleanup

- Remove any unused CSS
- Verify dark mode still works
- Test responsive behavior

**Commit:** `chore: e2e test updates for new layout`

---

## Execution Order Summary

| Phase | Description                               | Depends on | Estimated Effort |
| ----- | ----------------------------------------- | ---------- | ---------------- |
| 0     | Foundation (tokens, cleanup, primitives)  | —          | Medium           |
| 1     | Layout Shell (sidebar, header, AppLayout) | 0          | High             |
| 2     | HomePage                                  | 0          | Low              |
| 3     | Dashboard + ProjectCard                   | 1          | Medium           |
| 4     | ProjectDetail                             | 1          | High             |
| 5     | FalsePositiveFilter                       | 1          | Medium           |
| 6     | DependencyGraph                           | 1          | Low              |
| 7     | Search                                    | 1          | Medium           |
| 8     | Settings                                  | 1          | High             |
| 9     | ExecutiveDashboard                        | 1          | Medium           |
| 10    | Shared Components                         | 1          | Medium           |
| 11    | Verification & Cleanup                    | All        | Medium           |

**Total: 12 commits on `UI-overhaul` branch**

---

## Risk Mitigation

1. **E2E test breakage** — Layout changes will break navigation tests. Update after Phase 1.
2. **Stitch MCP unavailability** — If MCP can't connect, fall back to direct implementation with reference to Atlassian/ServiceNow design patterns.
3. **Monolithic pages** — ProjectDetail (1300 lines) and Settings (1500 lines) may need decomposition. Keep extraction minimal — only extract what we modify.
4. **Dark mode regression** — Test dark mode after every phase. The token system should handle it, but custom Tailwind classes may not.
5. **Cytoscape.js compatibility** — Dependency graph must stay full-screen. Sidebar must not overlap the canvas.
