# UI Review Report

**Date:** 2026-03-19
**Scope:** Complete Application (Dashboard, ProjectDetail, Search, Settings, Components)

---

## Summary

| Screen                   | Visual | Usability | Design System | Responsive | Accessibility | Overall |
| ------------------------ | ------ | --------- | ------------- | ---------- | ------------- | ------- |
| Dashboard                | 8/10   | 8/10      | 7/10          | 8/10       | 6/10          | 7.4/10  |
| ProjectDetail            | 8/10   | 9/10      | 7/10          | 8/10       | 6/10          | 7.6/10  |
| Search                   | 8/10   | 9/10      | 8/10          | 9/10       | 7/10          | 8.2/10  |
| Settings                 | 9/10   | 9/10      | 8/10          | 9/10       | 7/10          | 8.4/10  |
| VulnerabilityDetailModal | 7/10   | 8/10      | 5/10          | 7/10       | 6/10          | 6.6/10  |
| Components (General)     | 8/10   | 8/10      | 7/10          | 8/10       | 6/10          | 7.4/10  |

**Overall Score: 7.6/10**

---

## Critical Issues (Must Fix)

### 1. VulnerabilityDetailModal: Hardcoded Colors Break Dark Mode

- **Category:** Design System
- **Location:** [VulnerabilityDetailModal.tsx](vuln-assess-tool/src/renderer/components/VulnerabilityDetailModal.tsx)
- **Problem:** Uses hardcoded gray values (gray-200, gray-500, gray-700, etc.) instead of semantic design tokens (border, muted-foreground, foreground)
- **Impact:** Modal does not adapt to dark mode, creating jarring visual inconsistency
- **Lines Affected:** 120, 122, 128, 144, 154, 165, 173-174, 179, 242, 252, 270, 293, 318-323, 345, 356, 393, 415, 420
- **Recommendation:** Replace all `gray-*` classes with semantic tokens:

  ```css
  /* Current (problematic) */
  border-gray-200 bg-white text-gray-900

  /* Fixed */
  border-border bg-card text-foreground
  ```

### 2. Missing Form Labels (Accessibility)

- **Category:** Accessibility
- **Location:** [ProjectDetail.tsx:700-705](vuln-assess-tool/src/renderer/pages/ProjectDetail.tsx#L700-L705), [Settings.tsx:929-943](vuln-assess-tool/src/renderer/pages/Settings.tsx#L929-L943)
- **Problem:** Search inputs use placeholder text as labels without explicit `<label>` elements
- **Impact:** Screen readers may not announce input purpose correctly
- **Recommendation:** Add visible or sr-only labels:
  ```jsx
  <label htmlFor="search" className="sr-only">Search components</label>
  <input id="search" placeholder="Search components..." />
  ```

### 3. ChartCard: Hardcoded Colors Break Dark Mode

- **Category:** Design System
- **Location:** [ChartCard.tsx:17](vuln-assess-tool/src/renderer/components/charts/ChartCard.tsx#L17)
- **Problem:** Uses hardcoded `border-gray-200 bg-white text-gray-900` instead of design tokens
- **Impact:** Charts don't adapt to theme changes
- **Recommendation:** Replace with semantic tokens: `border-border bg-card text-foreground`

---

## High Priority Issues

### 4. Missing Focus Indicators on Interactive Elements

- **Category:** Accessibility
- **Location:** Multiple components
- **Problem:** Some clickable divs lack visible focus indicators for keyboard navigation
- **Examples:**
  - ProjectCard.tsx:40-42 (card is clickable but focus state unclear)
  - Component list items in ProjectDetail.tsx
- **Recommendation:** Add focus-visible styles:
  ```css
  className="... focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
  ```

### 5. Button Contrast Issues

- **Category:** Accessibility
- **Location:** [Dashboard.tsx:229-244](vuln-assess-tool/src/renderer/pages/Dashboard.tsx#L229-L244)
- **Problem:** Secondary buttons with `bg-secondary` may have insufficient contrast ratio
- **Current:** Using default secondary colors
- **Required:** 4.5:1 contrast ratio for text
- **Recommendation:** Audit button text colors against backgrounds

### 6. Missing Aria Labels on Icon-Only Buttons

- **Category:** Accessibility
- **Location:** Multiple files
- **Problem:** Icon-only buttons without visible text need aria-labels
- **Examples:**
  - ProjectCard.tsx:156-162 (Delete button has aria-label but others may not)
  - Various modal close buttons
- **Recommendation:** Ensure all icon buttons have descriptive aria-labels

### 7. Vulnerability List: Information Density on Mobile

- **Category:** Responsive
- **Location:** [ProjectDetail.tsx:1100-1160](vuln-assess-tool/src/renderer/pages/ProjectDetail.tsx#L1100-L1160)
- **Problem:** Vulnerability list items display too much information on narrow viewports
- **Impact:** Text truncation and horizontal scroll on mobile devices
- **Recommendation:** Stack metadata vertically on mobile:
  ```css
  <div className="flex-col md:flex-row">
  ```

### 8. Modal Z-Index Conflicts

- **Category:** Visual Design
- **Location:** VulnerabilityDetailModal, CreateProjectDialog, etc.
- **Problem:** Modals use z-50 but may conflict with other elevated elements
- **Recommendation:** Use a consistent z-index scale (z-modal-overlay, z-modal)

---

## Medium Priority Issues

### 9. Inconsistent Severity Color Definitions

- **Category:** Design System
- **Location:** [VulnerabilityDetailModal.tsx:15-29](vuln-assess-tool/src/renderer/components/VulnerabilityDetailModal.tsx#L15-L29), [ProjectDetail.tsx:1048-1052](vuln-assess-tool/src/renderer/pages/ProjectDetail.tsx#L1048-L1052)
- **Problem:** Severity colors are defined inline in multiple places rather than as design tokens
- **Recommendation:** Create CSS custom properties for severity colors:
  ```css
  --severity-critical: theme('colors.red.600');
  --severity-high: theme('colors.orange.500');
  --severity-medium: theme('colors.yellow.600');
  --severity-low: theme('colors.blue.500');
  ```

### 10. EmptyState: Hardcoded Icon Color

- **Category:** Design System
- **Location:** [EmptyState.tsx:54](vuln-assess-tool/src/renderer/components/EmptyState.tsx#L54)
- **Problem:** Uses `text-muted-foreground` but the icon container uses `bg-muted` which may not have enough contrast
- **Recommendation:** Ensure icon-to-background contrast meets WCAG AA

### 11. VirtualList Missing Accessibility Attributes

- **Category:** Accessibility
- **Location:** [VirtualList.tsx](vuln-assess-tool/src/renderer/components/VirtualList.tsx)
- **Problem:** Virtual list container doesn't have ARIA role attributes
- **Recommendation:** Add `role="list"` and ensure items have `role="listitem"`

### 12. Settings Page: Long Form Without Progress Indicator

- **Category:** Usability
- **Location:** [Settings.tsx](vuln-assess-tool/src/renderer/pages/Settings.tsx)
- **Problem:** Settings page is very long with no table of contents or progress indicator
- **Impact:** Users may not discover all settings sections
- **Recommendation:** Add sticky sidebar navigation or section links

### 13. Loading State Inconsistency

- **Category:** Usability
- **Location:** Various components
- **Problem:** Some loading states show spinners, others show skeleton screens, some show nothing
- **Recommendation:** Standardize on skeleton screens for initial loads, spinners for actions

---

## Low Priority Issues

### 14. Button Hover States Subtle

- **Category:** Visual Design
- **Location:** Multiple buttons
- **Problem:** Hover state changes are subtle (`hover:bg-muted`)
- **Recommendation:** Consider more prominent hover feedback

### 15. Typography Hierarchy Could Be Stronger

- **Category:** Visual Design
- **Location:** Application-wide
- **Problem:** Heading sizes (text-xl, text-lg) are close together
- **Recommendation:** Increase contrast between heading levels

### 16. OfflineIndicator Badge Size

- **Category:** Visual Design
- **Location:** [OfflineIndicator.tsx:148](vuln-assess-tool/src/renderer/components/OfflineIndicator.tsx#L148)
- **Problem:** Queue count badge uses `text-[10px]` which is very small
- **Recommendation:** Use minimum 11px font size for better readability

### 17. ChartCard Border Radius Inconsistency

- **Category:** Visual Design
- **Location:** [ChartCard.tsx:17](vuln-assess-tool/src/renderer/components/charts/ChartCard.tsx#L17)
- **Problem:** Uses `rounded-lg` while other cards may use different border radius
- **Recommendation:** Standardize border radius across all card components

---

## Recommendations

1. **Create Design Token Documentation** - Document all semantic color tokens and their usage
2. **Implement Dark Mode Audit** - Test all components in dark mode
3. **Add Accessibility Testing** - Use axe-core or similar for automated accessibility testing
4. **Standardize Component Patterns** - Create reusable patterns for cards, modals, forms
5. **Add Keyboard Navigation Tests** - Ensure all interactive elements are keyboard accessible

---

## Files Reviewed

- Dashboard.tsx (495 lines)
- ProjectDetail.tsx (1493 lines)
- Settings.tsx (1720 lines)
- Search.tsx (822 lines)
- EmptyState.tsx (69 lines)
- ProjectCard.tsx (167 lines)
- VirtualList.tsx (336 lines)
- OfflineIndicator.tsx (314 lines)
- VulnerabilityDetailModal.tsx (436 lines)
- ChartCard.tsx (35 lines)

---

## Next Steps

1. Fix Critical Issue #1 (VulnerabilityDetailModal dark mode)
2. Fix Critical Issue #2 (Form labels)
3. Fix Critical Issue #3 (ChartCard dark mode)
4. Run accessibility audit using axe-devtools
5. Test all screens at 320px viewport width
6. Verify all color contrast ratios
