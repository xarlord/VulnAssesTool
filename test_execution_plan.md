# VulnAssessTool - Test Execution Plan

**Plan Date:** 2026-02-09
**Version:** 1.0
**Status:** Ready for Execution

---

## Executive Summary

This test execution plan provides a structured approach to testing the VulnAssessTool application. Based on the gap analysis, we have **23 untested scenarios** that require test implementation. This plan prioritizes critical functionality while ensuring comprehensive coverage.

### Current Status
- **Existing Tests:** 1,126 passing (96.88% statement coverage)
- **Scenarios Defined:** 60
- **Scenarios Tested:** 37 (61.7%)
- **Scenarios Untested:** 23 (38.3%)

### Test Execution Goals
1. Implement tests for all **P0 (Critical)** untested scenarios
2. Implement tests for high-priority **P1** scenarios
3. Achieve **90%+ scenario coverage**
4. Maintain **95%+ code coverage**
5. Document all test results

---

## Test Execution Schedule

### Phase 1: Critical Scenarios (Week 1-2)
**Target:** P0 untested scenarios (9 scenarios)

| Scenario ID | Scenario Name | Est. Time | Priority |
|-------------|---------------|-----------|----------|
| TC-SCAN-001 | Scan with API Key | 2 hours | P0 |
| TC-SCAN-002 | Scan without API Key | 1 hour | P0 |
| TC-SCAN-003 | Scan - No Components | 1 hour | P0 |
| TC-SCAN-004 | Scan - Error Handling | 2 hours | P0 |
| TC-SCAN-005 | Refresh Vulnerability Data | 2 hours | P0 |
| TC-SCAN-006 | Refresh without API Key | 1 hour | P0 |
| TC-PM-005 | Delete Project - Single | 1 hour | P0 |
| TC-PM-006 | Delete Project - Cancel | 1 hour | P0 |
| TC-VM-002 | Filter by Severity (Exact Match) | 2 hours | P0 |

**Total:** 13 hours

### Phase 2: Component Management (Week 2-3)
**Target:** All component scenarios (8 scenarios)

| Scenario ID | Scenario Name | Est. Time | Priority |
|-------------|---------------|-----------|----------|
| TC-CM-001 | View All Components | 2 hours | P0 |
| TC-CM-002 | Search Components | 2 hours | P0 |
| TC-CM-003 | Filter by Type | 2 hours | P0 |
| TC-CM-004 | Filter by Vulnerability Status | 2 hours | P0 |
| TC-CM-005 | Sort Components | 1 hour | P1 |
| TC-CM-006 | View Component Vulnerabilities | 2 hours | P0 |
| TC-CM-007 | Empty Component List | 1 hour | P1 |
| TC-CM-008 | Component with No Vulnerabilities | 1 hour | P1 |

**Total:** 13 hours

### Phase 3: Vulnerability Filtering (Week 3-4)
**Target:** Remaining vulnerability scenarios (8 scenarios)

| Scenario ID | Scenario Name | Est. Time | Priority |
|-------------|---------------|-----------|----------|
| TC-VM-003 | Filter by CVSS Range | 2 hours | P0 |
| TC-VM-004 | Filter by Source (NVD/OSV) | 2 hours | P0 |
| TC-VM-005 | Filter by Patch Availability | 2 hours | P0 |
| TC-VM-006 | Filter - Multiple Filters | 2 hours | P0 |
| TC-VM-007 | Sort Vulnerabilities | 1 hour | P1 |
| TC-VM-009 | Clear All Filters | 1 hour | P1 |
| TC-VM-010 | External Links | 1 hour | P1 |

**Total:** 11 hours

### Phase 4: High Priority Scenarios (Week 4-5)
**Target:** P1 untested scenarios (18 scenarios)

| Scenario ID | Scenario Name | Est. Time | Priority |
|-------------|---------------|-----------|----------|
| TC-SBOM-003 | Upload SBOM - Parsing Error | 2 hours | P1 |
| TC-SBOM-004 | Remove SBOM File | 1 hour | P1 |
| TC-SBOM-005 | Upload Multiple SBOMs | 2 hours | P1 |
| TC-SBOM-006 | View SBOM File Details | 1 hour | P1 |
| TC-SET-006 | Set Data Retention | 1 hour | P1 |
| TC-SET-007 | Toggle Auto-Refresh | 1 hour | P1 |
| TC-SET-008 | Reset to Defaults | 2 hours | P1 |
| TC-SET-009 | Create Settings Profile | 2 hours | P1 |
| TC-SET-010 | Switch Settings Profile | 2 hours | P1 |
| TC-SET-011 | Delete Settings Profile | 1 hour | P1 |
| TC-SET-012 | Export/Import Settings | 3 hours | P1 |
| TC-NOT-002 | Mark Notification as Read | 1 hour | P1 |
| TC-NOT-003 | Mark All as Read | 1 hour | P1 |
| TC-NOT-004 | Configure Notification Preferences | 2 hours | P1 |
| TC-SEARCH-002 | Global Search - Components | 2 hours | P1 |
| TC-SEARCH-003 | Global Search - Vulnerabilities | 2 hours | P1 |
| TC-SEARCH-004 | Keyboard Navigation | 3 hours | P1 |
| TC-SEARCH-005 | Clear Search | 1 hour | P1 |

**Total:** 30 hours

### Phase 5: Medium Priority & Polish (Week 5-6)
**Target:** P2 scenarios and edge cases (14 scenarios)

| Scenario ID | Scenario Name | Est. Time | Priority |
|-------------|---------------|-----------|----------|
| TC-HD-004 | All Components Excellent (Info Banner) | 2 hours | P1 |
| TC-HD-005 | Unknown Trend (Info Banner) | 2 hours | P1 |
| TC-HD-006 | Empty Health Data | 1 hour | P1 |
| TC-HD-007 | View Health Factors Breakdown | 2 hours | P2 |
| TC-HD-008 | Navigate from Remediation Queue | 1 hour | P1 |
| TC-BULK-001 | Select All Projects | 2 hours | P1 |
| TC-BULK-002 | Select Individual Projects | 2 hours | P1 |
| TC-BULK-003 | Bulk Delete Projects | 2 hours | P1 |
| TC-BULK-004 | Bulk Export Projects | 2 hours | P2 |
| TC-BULK-005 | Cancel Bulk Selection | 1 hour | P1 |
| TC-PRESET-001 | Save Filter Preset | 2 hours | P1 |
| TC-PRESET-002 | Load Filter Preset | 2 hours | P1 |
| TC-PRESET-003 | Delete Filter Preset | 1 hour | P1 |
| TC-PRESET-004 | Duplicate Preset Name | 1 hour | P1 |

**Total:** 22 hours

**Total Estimated Time:** 89 hours (~11-12 weeks)

---

## Test Environment Setup

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|----------|-------------|
| OS | Windows 10+, macOS 12+, Ubuntu 20.04+ | Windows 11, macOS 13, Ubuntu 22.04 |
| RAM | 4 GB | 8 GB+ |
| Disk Space | 1 GB free | 2 GB+ free |
| Processor | Dual-core | Quad-core+ |

### Software Requirements

1. **Node.js** - v18.0.0 or higher
2. **npm** - Latest version compatible with Node.js
3. **Git** - For version control

### Development Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd VulnAssesTool/vuln-assess-tool

# Install dependencies
npm install

# Set up environment variables (if needed)
cp .env.example .env
# Edit .env with required values

# Start Vite dev server (terminal 1)
npm run dev

# Start Electron app (terminal 2)
npm run dev:electron
```

### Test Environment Variables

```bash
# .env.test
VITE_API_BASE_URL=http://localhost:3000
VITE_NVD_API_KEY=test-key-12345678
VITE_OSV_API_URL=https://api.osv.dev/v1
```

### Required NPM Packages

```json
{
  "devDependencies": {
    "@testing-library/react": "^13.0.0",
    "@testing-library/jest-dom": "^5.16.0",
    "@testing-library/user-event": "^14.0.0",
    "jsdom": "^23.0.0",
    "vitest": "^1.0.0",
    "@vitest/ui": "^1.0.0",
    "msw": "^2.0.0"
  }
}
```

---

## Test Data Preparation

### Test SBOM Files

Location: `test-data/sboms/`

| File | Purpose | Scenarios |
|------|---------|-----------|
| `test-project-comprehensive.json` | Large SBOM with 30 components, 104 vulns | TC-SBOM-001, TC-SBOM-005 |
| `test-project-minimal.json` | Small SBOM with 5 components | TC-SBOM-001 |
| `test-project-invalid.json` | Malformed SBOM | TC-SBOM-002 |
| `test-project-empty.json` | Valid SBOM with no components | TC-SCAN-003 |
| `test-project-duplicate-components.json` | Duplicate PURLs | TC-SBOM-005 |

### Test Data Matrix

| Scenario | Data Required | Source |
|----------|---------------|--------|
| Scan with API Key | NVD API key (valid UUID) | Environment variable |
| Scan without API Key | No API key set | Clear env variable |
| Invalid API Key | Non-UUID format | Test input |
| Empty Project | Project with no components | Create during test |
| Large Dataset | 100+ components | Use comprehensive SBOM |
| No Vulnerabilities | Project with 0 vulns | Create during test |

### Mock API Responses

#### NVD API Mock Responses

```typescript
// Success response
{
  "totalResults": 1,
  "vulnerabilities": [
    {
      "id": "CVE-2023-1234",
      "descriptions": [
        {"lang": "en", "value": "Test vulnerability"}
      ],
      "metrics": {
        "cvssMetricV31": [
          {
            "cvssData": {
              "baseScore": 7.5,
              "baseSeverity": "HIGH"
            }
          }
        ]
      }
    }
  ]
}

// Error response
{
  "error": "Unauthorized",
  "message": "Invalid API Key"
}
```

#### OSV API Mock Responses

```typescript
// Success response
{
  "vulns": [
    {
      "id": "OSV-2023-1234",
      "summary": "Test vulnerability",
      "details": "Test details",
      "affected": [
        {"package": {"name": "lodash", "ecosystem": "npm"}}
      ],
      "severity": [
        {"type": "CVSS_V3", "score": "7.5"}
      ]
    }
  ]
}
```

---

## Manual Test Scripts

### Test Script Template

Each manual test script follows this format:

```markdown
## Manual Test Case: [TC-XXX]

### Objective
[Brief description of what is being tested]

### Pre-Conditions
- Application is running
- [Any specific setup required]

### Test Data
- [List of test data needed]

### Test Steps
1. [Action]
   - Expected: [Result]
2. [Action]
   - Expected: [Result]

### Post-Conditions
- [State after test]

### Pass/Fail Criteria
- Pass: [Criteria]
- Fail: [Criteria]

### Notes
- [Any observations or issues]
```

### Example: Manual Test Script for TC-SCAN-001

```markdown
## Manual Test Case: TC-SCAN-001 - Scan with API Key

### Objective
Verify that scanning works correctly with a valid NVD API key configured

### Pre-Conditions
- Application is running
- Project exists with components
- Valid NVD API key is configured in Settings

### Test Data
- NVD API Key: 12345678-1234-1234-1234-123456789012
- Project: "Test Project" with 5 components

### Test Steps
1. Navigate to ProjectDetail page for "Test Project"
   - Expected: Page loads with project details visible

2. Click "Scan" button
   - Expected: Info toast shown if API key missing
   - Expected: Progress bar appears at 0%

3. Observe progress bar
   - Expected: Progress increases from 0% to 100%
   - Expected: "Scanning..." text shown

4. Wait for scan completion
   - Expected: Success toast: "Scan Complete: Found X vulnerabilities from NVD/OSV APIs. Total: Y"

5. Verify vulnerabilities added
   - Expected: Vulnerabilities tab shows new vulnerabilities
   - Expected: Statistics cards updated

6. Verify SBOM vulnerabilities preserved
   - Expected: Vulnerabilities from SBOM still present
   - Expected: Success toast mentions "Z from SBOM preserved"

7. Check lastScanAt timestamp
   - Expected: Timestamp is current date/time

### Pass/Fail Criteria
- Pass: All steps complete successfully
- Fail: Any step produces unexpected result

### Notes
- Test with valid API key that has rate limit available
- Monitor for rate limit errors if using public API
```

---

## Success Criteria

### Overall Success Criteria

1. **Scenario Coverage**
   - ✅ 90%+ of scenarios have automated tests (54 of 60)
   - ✅ 100% of P0 scenarios have tests (30 of 30)
   - ✅ 80%+ of P1 scenarios have tests (18 of 22)

2. **Code Coverage**
   - ✅ 95%+ statement coverage maintained
   - ✅ 90%+ branch coverage achieved
   - ✅ 100% function coverage maintained

3. **Test Quality**
   - ✅ All tests use proper mocks (MSW for APIs)
   - ✅ All tests include assertions for expected behavior
   - ✅ All tests include error case testing
   - ✅ No flaky tests (consistent results)

4. **Documentation**
   - ✅ All new tests documented
   - ✅ Test execution report generated
   - ✅ Known issues tracked
   - ✅ Recommendations documented

### Phase-Specific Success Criteria

#### Phase 1: Critical Scenarios
- [ ] All 9 P0 scenarios tested
- [ ] Scan workflow fully covered
- [ ] Error handling tested
- [ ] API key handling tested
- [ ] 100% pass rate on new tests

#### Phase 2: Component Management
- [ ] All 8 component scenarios tested
- [ ] Component list rendering tested
- [ ] Search, filter, sort tested
- [ ] Empty states tested
- [ ] 95%+ pass rate

#### Phase 3: Vulnerability Filtering
- [ ] All 7 filter scenarios tested
- [ ] Exact severity matching verified
- [ ] CVSS range slider tested
- [ ] Multi-filter combinations tested
- [ ] 95%+ pass rate

#### Phase 4: High Priority
- [ ] 18 P1 scenarios tested
- [ ] Settings profiles tested
- [] Notification interactions tested
- [ ] Search keyboard nav tested
- [ ] 90%+ pass rate

#### Phase 5: Polish
- [ ] 14 P2 scenarios tested
- [ ] Edge cases covered
- [ ] Bulk operations tested
- [ ] All scenarios documented
- [ ] Final test report generated

---

## Test Execution Process

### Daily Test Execution Workflow

1. **Morning Setup** (15 min)
   - Pull latest code
   - Install dependencies if needed
   - Start dev servers
   - Verify test environment

2. **Test Execution** (4-6 hours)
   - Run existing test suite: `npm run test`
   - Verify all existing tests pass
   - Implement new tests for target scenarios
   - Run new tests and verify results
   - Fix any failing tests

3. **Documentation** (30 min)
   - Update test results
   - Document any issues found
   - Update progress tracking

4. **End of Day** (15 min)
   - Commit test code
   - Push changes
   - Update progress report

### Test Implementation Workflow

For each untested scenario:

1. **Create Test File**
   ```bash
   # Example: Create scanning tests
   touch src/renderer/components/__tests__/Scanning.test.tsx
   ```

2. **Write Test Code**
   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest'
   import { render, screen, fireEvent, waitFor } from '@testing-library/react'
   import userEvent from '@testing-library/user-event'
   import ProjectDetail from '../ProjectDetail'

   describe('TC-SCAN-001: Scan with API Key', () => {
     // Test implementation
   })
   ```

3. **Add Mocks**
   - Mock NVD API responses
   - Mock OSV API responses
   - Mock toast notifications
   - Mock timer for progress simulation

4. **Run Tests**
   ```bash
   npm run test -- Scanning.test.tsx
   ```

5. **Debug & Fix**
   - Fix any failures
   - Ensure assertions are correct
   - Verify edge cases covered

6. **Commit**
   ```bash
   git add src/renderer/components/__tests__/Scanning.test.tsx
   git commit -m "test: Add scanning workflow tests (TC-SCAN-001 through TC-SCAN-006)"
   ```

### Test Reporting Template

```markdown
## Test Execution Report - [Date]

### Summary
- **Date:** [Date]
- **Tester:** [Name]
- **Build:** [Commit hash]
- **Tests Run:** [Count]
- **Tests Passed:** [Count]
- **Tests Failed:** [Count]
- **Pass Rate:** [Percentage]

### Scenarios Tested Today
| Scenario ID | Scenario Name | Result | Notes |
|-------------|---------------|--------|-------|
| TC-XXX-001 | Scenario Name | PASS/FAIL | Notes |

### Issues Found
| Issue ID | Description | Severity | Status |
|----------|-------------|----------|--------|
| BUG-001 | Description | High | Open |

### Next Steps
- [ ] Next scenario to test
- [ ] Bugs to fix
```

---

## Risk Mitigation

### Known Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| NVD API rate limits | High | Medium | Use API key, add delays, mock in tests |
| OSV API changes | Medium | Low | Version pin APIs, mock responses |
| Test flakiness | Medium | Medium | Proper cleanup, avoid timers, use waitFor |
| Browser compatibility | Low | Low | Test in Electron only (target platform) |

### Contingency Plans

1. **If API Rate Limit Reached:**
   - Use cached responses
   - Add longer delays between requests
   - Mock API responses entirely

2. **If Tests Fail Unexpectedly:**
   - Review test environment setup
   - Check for dependency changes
   - Verify mock configurations

3. **If Timeline Slips:**
   - Prioritize P0 scenarios
   - Defer P2 scenarios to next sprint
   - Focus on critical path only

---

## Deliverables

### Phase 1 Deliverables
- [ ] Scanning.test.tsx (6 scenarios)
- [ ] ProjectDetail.test.tsx updates (2 deletion scenarios)
- [ ] VulnerabilityFilters.test.tsx (2 severity filter scenarios)

### Phase 2 Deliverables
- [ ] ComponentList.test.tsx (8 scenarios)
- [ ] ComponentFilters.test.tsx (filter and sort scenarios)

### Phase 3 Deliverables
- [ ] VulnerabilityFilters.test.tsx (remaining 5 filter scenarios)
- [ ] VulnerabilityList.test.tsx updates (sort, clear, external links)

### Phase 4 Deliverables
- [ ] SbomUploadDialog.test.tsx updates (3 scenarios)
- [ ] Settings.test.tsx updates (7 scenarios)
- [ ] NotificationCenter.test.tsx updates (3 scenarios)
- [ ] Search.test.tsx updates (4 scenarios)

### Phase 5 Deliverables
- [ ] HealthDashboard.test.tsx updates (4 scenarios)
- [ ] BulkActionsBar.test.tsx updates (5 scenarios)
- [ ] FilterPresets.test.tsx updates (4 scenarios)
- [ ] Test execution report

---

## Appendices

### Appendix A: Test File Naming Convention

```
src/renderer/
├── components/
│   └── __tests__/
│       ├── Scanning.test.tsx          # TC-SCAN-001 to TC-SCAN-006
│       ├── ComponentList.test.tsx     # TC-CM-001 to TC-CM-008
│       ├── VulnerabilityFilters.test.tsx # TC-VM-002 to TC-VM-010
│       ├── BulkOperations.test.tsx     # TC-BULK-001 to TC-BULK-005
│       └── ...
├── pages/
│   └── __tests__/
│       ├── Dashboard.test.tsx          # Updates for TC-PM-005, TC-PM-006
│       ├── ProjectDetail.test.tsx      # Updates for scanning scenarios
│       └── ...
```

### Appendix B: Test Checklist Template

```markdown
## Test Execution Checklist - [Scenario ID]

### Setup
- [ ] Test file created
- [ ] Mocks configured
- [ ] Test data prepared
- [ ] Dependencies installed

### Test Cases
- [ ] Happy path test
- [ ] Error handling test
- [ ] Edge case test
- [ ] Integration test

### Verification
- [ ] All tests pass
- [ ] Code coverage meets threshold
- [ ] No console errors
- [ ] Accessibility verified (if applicable)

### Documentation
- [ ] Test documented
- [ ] Results logged
- [ ] Issues tracked
```

### Appendix C: Mock Setup Guide

#### MSW (Mock Service Worker) Setup

```typescript
// src/test/setup/msw.ts
import { setupServer } from 'msw/node'
import { HttpResponse, http } from 'msw'

export const nvdApiMock = [
  http.get('https://services.nvd.nist.gov/rest/json/cves/2.0', () => {
    return HttpResponse.json({
      totalResults: 1,
      vulnerabilities: [/* mock data */]
    })
  }),
]

export const osvApiMock = [
  http.post('https://api.osv.dev/v1/query', () => {
    return HttpResponse.json({
      vulns: [/* mock data */]
    })
  }),
]

export const server = setupServer(...nvdApiMock, ...osvApiMock)
```

---

## Contact & Support

### Questions or Issues
- **Test Lead:** [Name/Email]
- **Developer:** [Name/Email]
- **Documentation:** [Link]

### Bug Reporting
- Create issue in GitHub repository
- Use template: `TEST-XXX`
- Include: Scenario ID, Steps, Expected vs Actual, Environment

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-09 | Initial plan creation | AI Assistant |

---

## Approval

| Role | Name | Signature | Date |
|------|------|----------|------|
| Test Lead | | | |
| QA Manager | | | |
| Developer | | | |
