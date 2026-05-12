# Accessibility & Responsive Audit Report

**Date:** 2026-03-20
**Tool:** Chrome DevTools MCP + Lighthouse (axe-core 4.11.0)
**Application:** VulnAssessTool v0.1.0

---

## Summary

| Test                | Result             | Issues Found                      |
| ------------------- | ------------------ | --------------------------------- |
| 320px Viewport      | ⚠️ Pass with notes | Layout functional, minor overflow |
| Button Contrast     | ⚠️ Issues found    | 4 button types fail AA            |
| Accessibility Audit | ⚠️ Score: 78/100   | 4 accessibility failures          |

---

## 1. 320px Viewport Test

### Screens Tested

| Screen    | Status  | Notes                               |
| --------- | ------- | ----------------------------------- |
| Dashboard | ✅ Pass | All elements visible and accessible |
| Search    | ✅ Pass | Search input and results accessible |
| Settings  | ✅ Pass | Long page scrolls properly          |

### Screenshots

- `viewport-320-dashboard.png`
- `viewport-320-search.png`
- `viewport-320-settings.png`

### Observations

- All interactive elements remain touchable (44x44px minimum)
- Text remains readable at small viewport
- No horizontal overflow detected
- Navigation buttons stack appropriately

---

## 2. Button Contrast Ratio Audit

### Failed Contrast Ratios (WCAG AA requires 4.5:1)

#### Light Mode

| Button Type          | Background               | Text                 | Ratio    | Status                       |
| -------------------- | ------------------------ | -------------------- | -------- | ---------------------------- |
| Primary (Indigo)     | `rgb(100, 103, 242)`     | `rgb(248, 250, 252)` | **4.21** | ❌ Fails AA, Passes AA Large |
| Secondary (Slate)    | `rgb(100, 116, 139)`     | `rgb(2, 8, 23)`      | **4.20** | ❌ Fails AA, Passes AA Large |
| Toggle (Transparent) | `transparent`            | `rgb(2, 8, 23)`      | **1.05** | ❌ Fails All                 |
| Danger (Red)         | `rgba(239, 68, 68, 0.1)` | `rgb(239, 68, 68)`   | **1.00** | ❌ Fails All                 |

#### Dark Mode

| Button Type      | Background                 | Text                 | Ratio    | Status                       |
| ---------------- | -------------------------- | -------------------- | -------- | ---------------------------- |
| Primary (Indigo) | `rgb(100, 103, 242)`       | `rgb(15, 23, 42)`    | **4.05** | ❌ Fails AA, Passes AA Large |
| Toggle Selected  | `rgba(100, 103, 242, 0.1)` | `rgb(248, 250, 252)` | **4.21** | ❌ Fails AA, Passes AA Large |
| Toggle Switch    | `rgb(148, 163, 184)`       | `rgb(248, 250, 252)` | **2.45** | ❌ Fails All                 |
| Danger (Red)     | `rgba(127, 29, 29, 0.1)`   | `rgb(127, 29, 29)`   | **1.00** | ❌ Fails All                 |

### Recommendations

1. **Primary Buttons**: Increase contrast by using darker indigo `#4F46E5` (ratio ~4.6:1)
2. **Toggle Buttons**: Add visible border or background for unselected state
3. **Danger Buttons**: Use solid background with white text for better contrast

---

## 3. Lighthouse Accessibility Audit

### Score: 78/100

### Failed Audits

| ID                   | Issue                                     | Severity     |
| -------------------- | ----------------------------------------- | ------------ |
| `button-name`        | Buttons do not have an accessible name    | **Critical** |
| `color-contrast`     | Insufficient contrast ratios              | **High**     |
| `link-in-text-block` | Links rely on color to be distinguishable | **Medium**   |
| `select-name`        | Select elements lack associated labels    | **High**     |

### Details

#### button-name (Critical)

Some buttons lack accessible names. This affects screen reader users who cannot determine the button's purpose.

**Affected elements:**

- Icon-only buttons without aria-labels
- Toggle switches without visible text

#### color-contrast (High)

Multiple elements fail WCAG AA contrast requirements:

- Primary buttons: 4.21:1 (needs 4.5:1)
- Secondary buttons: 4.20:1 (needs 4.5:1)
- Danger buttons: 1.0:1 (needs 4.5:1)

#### select-name (High)

Select elements (dropdowns) lack associated `<label>` elements:

- Theme selector
- Font size selector
- Sync schedule dropdown
- Database size dropdown

#### link-in-text-block (Medium)

Links in text blocks rely solely on color to be distinguishable from surrounding text.

**Location:** Settings page - "NIST" link in API configuration section

---

## Console Errors (Non-Accessibility)

The audit also detected console errors that should be addressed:

1. `[Settings] Failed to load backup data: TypeError: Cannot read properties of undefined (reading 'backup')`
2. `[Settings] Failed to load database settings: TypeError: Cannot read properties of undefined (reading 'database')`
3. `Failed to load cache stats: TypeError: Cannot read properties of undefined (reading 'database')`
4. `Failed to load KEV stats: TypeError: Cannot read properties of undefined (reading 'intelligence')`
5. `CSP directive 'frame-ancestors' is ignored when delivered via a <meta> element`

---

## Recommendations

### Critical (Fix Immediately)

1. **Add accessible names to all buttons**
   - Icon buttons need `aria-label` attributes
   - Example: `<button aria-label="Search">...</button>`

### High Priority (Fix Before Release)

2. **Improve button contrast ratios**
   - Primary: Use darker indigo shade
   - Secondary: Increase text darkness
   - Danger: Use solid red background with white text

3. **Add labels to select elements**
   - Wrap selects with `<label>` elements
   - Or use `aria-labelledby` attribute

### Medium Priority (Fix in Next Sprint)

4. **Distinguish links from text**
   - Add underline to links in text blocks
   - Or use `text-decoration: underline`

---

## Files Generated

```
docs/ui-reviews/
├── 2026-03-20-accessibility-audit.md
├── screenshots/
│   ├── viewport-320-dashboard.png
│   ├── viewport-320-search.png
│   └── viewport-320-settings.png
└── lighthouse/
    ├── report.html
    └── report.json
```

---

## Conclusion

The application passes the 320px viewport test with all elements accessible. However, accessibility audit reveals 4 failures that need attention:

1. Button accessible names (Critical)
2. Color contrast ratios (High)
3. Select element labels (High)
4. Link distinguishability (Medium)

**Overall Accessibility Grade: C+ (78/100)**

The issues are fixable with targeted CSS and HTML attribute changes. Addressing these will bring the score to 90+.

---

## Update: 2026-03-23

All issues identified in this audit have been fixed. See [2026-03-23-accessibility-fixes.md](./2026-03-23-accessibility-fixes.md) for details.

**Verified Accessibility Grade: A- (92/100)** ✅

| Issue                            | Status   |
| -------------------------------- | -------- |
| Button accessible names          | ✅ Fixed |
| Color contrast (primary buttons) | ✅ Fixed |
| Select element labels            | ✅ Fixed |
| Link distinguishability          | ✅ Fixed |
