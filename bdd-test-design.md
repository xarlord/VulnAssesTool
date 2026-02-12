# BDD Test Design for VulnAssessTool

**Goal:** 105+ behavioral scenarios covering all backend functions

**Framework:** Vitest + Cucumber.js (Gherkin syntax)

**Test Structure:**
```
tests/bdd/
├── features/
│   ├── database/
│   │   ├── nvd-database.feature
│   │   ├── hybrid-scanner.feature
│   │   └── update-scheduler.feature
│   ├── audit/
│   │   ├── audit-logging.feature
│   │   └── audit-export.feature
│   ├── analytics/
│   │   └── metrics-calculator.feature
│   ├── parsers/
│   │   ├── spdx-parser.feature
│   │   └── cyclonedx-parser.feature
│   └── export/
│       └── export-formats.feature
└── step-definitions/
    ├── database.steps.ts
    ├── audit.steps.ts
    ├── analytics.steps.ts
    ├── parsers.steps.ts
    └── export.steps.ts
```

---

## FEATURE 1: NVD Database Operations (25 scenarios)

### File: `features/database/nvd-database.feature`

```gherkin
Feature: NVD Database Operations
  As a vulnerability assessor
  I want to store and query CVE data locally
  So that I can scan components offline and get fast results

  Scenario: Initialize database with default path
    Given no database exists at the default location
    When I initialize the NVD database
    Then a new database file should be created
    And the database schema should be applied
    And WAL mode should be enabled
    And foreign keys should be enabled

  Scenario: Initialize database with custom path
    Given a custom database path "/custom/path/nvd.db"
    When I initialize the NVD database with the custom path
    Then the database should be created at the custom path

  Scenario: Insert a new CVE record
    Given the database is initialized
    And I have a CVE record with ID "CVE-2024-1234"
    When I insert the CVE into the database
    Then the CVE should be stored successfully
    And I should be able to retrieve it by ID

  Scenario: Update an existing CVE record
    Given the database is initialized
    And CVE "CVE-2024-1234" exists with description "Old description"
    When I update the CVE with a new description "New description"
    Then the CVE should reflect the updated description
    And the modified date should be updated

  Scenario: Insert CPE matches for a CVE
    Given the database is initialized
    And CVE "CVE-2024-1234" exists in the database
    When I insert 3 CPE matches for the CVE
    Then all 3 CPE matches should be stored
    And each CPE match should be linked to the CVE

  Scenario: Insert references for a CVE
    Given the database is initialized
    And CVE "CVE-2024-1234" exists in the database
    When I insert 5 references for the CVE
    Then all 5 references should be stored
    And each reference should be linked to the CVE

  Scenario: Retrieve CVE by ID with all details
    Given the database is initialized
    And CVE "CVE-2024-1234" exists with CPE matches and references
    When I retrieve the CVE by ID
    Then I should receive the CVE with all CPE matches
    And I should receive all references
    And the vulnerable flag should be a boolean

  Scenario: Retrieve non-existent CVE returns null
    Given the database is initialized
    When I attempt to retrieve CVE "CVE-9999-9999"
    Then the result should be null

  Scenario: Search CVEs by CPE text
    Given the database is initialized
    And 10 CVEs exist with CPE matches for "nginx:1.18.0"
    When I search CVEs using CPE text "nginx"
    Then I should receive results containing CVEs with nginx CPE matches
    And results should be ordered by CVSS score descending

  Scenario: Search CVEs by CPE with limit
    Given the database is initialized
    And 50 CVEs exist with CPE matches for "apache"
    When I search CVEs using CPE text "apache" with limit 10
    Then I should receive exactly 10 results
    And results should be the highest CVSS scored CVEs

  Scenario: Get CVEs filtered by severity
    Given the database is initialized
    And CVEs exist with severities: CRITICAL, HIGH, MEDIUM, LOW
    When I query CVEs with severity filter "CRITICAL"
    Then only CRITICAL CVEs should be returned
    And results should be ordered by published date descending

  Scenario: Get CVEs by multiple severities
    Given the database is initialized
    And CVEs exist with all severity levels
    When I query CVEs with severity filter "CRITICAL,HIGH"
    Then only CRITICAL and HIGH CVEs should be returned

  Scenario: Get CVEs within CVSS score range
    Given the database is initialized
    And CVEs exist with CVSS scores from 0.0 to 10.0
    When I query CVEs with CVSS range 7.0 to 9.0
    Then only CVEs with scores between 7.0 and 9.0 should be returned
    And results should be ordered by CVSS score descending

  Scenario: Get CVEs published after a date
    Given the database is initialized
    And CVEs exist from 2020 to 2024
    When I query CVEs published after "2023-01-01"
    Then only CVEs published after 2023-01-01 should be returned
    And results should be ordered by published date descending

  Scenario: Get CVEs within date range
    Given the database is initialized
    And CVEs exist across multiple years
    When I query CVEs with start date "2023-01-01" and end date "2023-12-31"
    Then only CVEs from 2023 should be returned

  Scenario: Query with multiple filters combined
    Given the database is initialized
    And diverse CVEs exist in the database
    When I query with severity "HIGH" and CVSS range 7.0-8.0
    Then results should match all criteria
    And query time should be under 1 second

  Scenario: Get database metadata
    Given the database is initialized
    And the database contains 1000 CVEs
    And 800 CVEs were published after 2021
    When I retrieve the database metadata
    Then total CVEs should be 1000
    And CVEs after 2021 should be 800
    And schema version should be returned

  Scenario: Update metadata key-value
    Given the database is initialized
    When I update metadata with key "last_sync_at" and value "2024-01-15T10:00:00Z"
    Then the metadata should be stored
    And retrieving the key should return the value

  Scenario: Begin transaction
    Given the database is initialized
    When I begin a transaction
    Then subsequent operations should be transactional

  Scenario: Commit transaction
    Given the database is initialized
    And a transaction is in progress
    And I inserted CVEs within the transaction
    When I commit the transaction
    Then all CVEs should be persisted

  Scenario: Rollback transaction
    Given the database is initialized
    And a transaction is in progress
    And I inserted CVEs within the transaction
    When I rollback the transaction
    Then no CVEs should be persisted

  Scenario: Clear all data from database
    Given the database is initialized
    And the database contains data
    When I clear all data
    Then the CVEs table should be empty
    And the CPE matches table should be empty
    And the references table should be empty
    And the metadata table should be empty

  Scenario: Close database connection
    Given the database is initialized and open
    When I close the database connection
    Then the connection should be terminated
    And subsequent operations should throw an error

  Scenario: Reopen closed database
    Given the database was closed
    When I initialize the database again
    Then the connection should be established
    And existing data should be accessible

  Scenario: Handle database initialization failure
    Given an invalid database path "/invalid/path/that/does/not/exist"
    When I attempt to initialize the database
    Then an error should be thrown
    And the error message should indicate initialization failure
```

---

## FEATURE 2: Hybrid Vulnerability Scanner (15 scenarios)

### File: `features/database/hybrid-scanner.feature`

```gherkin
Feature: Hybrid Vulnerability Scanner
  As a vulnerability assessor
  I want to scan components using local database first with API fallback
  So that I get fast results when available and complete results otherwise

  Scenario: Scan component found in local database
    Given the local database contains vulnerabilities for "nginx:1.18.0"
    When I scan component "nginx:1.18.0" preferring local
    Then vulnerabilities should be returned from local cache
    And fromCache count should be greater than 0
    And fromApi count should be 0

  Scenario: Scan component not in local database
    Given the local database does not contain "unknown-lib:1.0.0"
    And the NVD API is accessible
    When I scan component "unknown-lib:1.0.0" preferring local
    Then vulnerabilities should be returned from API
    And fromCache count should be 0
    And fromApi count should be greater than 0
    And results should be cached locally

  Scenario: Scan with minimum severity filter
    Given the local database contains CRITICAL, HIGH, MEDIUM, LOW vulnerabilities
    When I scan with minimum severity "HIGH"
    Then only CRITICAL and HIGH vulnerabilities should be returned
    And MEDIUM and LOW should be filtered out

  Scenario: Scan with max results limit
    Given the local database contains 100 vulnerabilities for a component
    When I scan with max results of 10
    Then exactly 10 vulnerabilities should be returned
    And results should be the highest severity first

  Scenario: Scan multiple components
    Given I have 5 components to scan
    And the local database contains data for all
    When I scan all components
    Then a map of 5 results should be returned
    And each result should have fromCache greater than 0

  Scenario: Get CVE by ID from local database
    Given CVE "CVE-2024-1234" exists in local database
    When I get CVE by ID "CVE-2024-1234" preferring local
    Then the CVE should be returned from cache
    And all CVE details should be included

  Scenario: Get CVE by ID falls back to API
    Given CVE "CVE-2024-9999" does not exist in local database
    And the NVD API is accessible
    When I get CVE by ID "CVE-2024-9999" preferring local
    Then the CVE should be returned from API
    And the CVE should be cached locally

  Scenario: Get CVE by ID that doesn't exist anywhere
    Given CVE "CVE-0000-0000" does not exist locally or on API
    When I get CVE by ID "CVE-0000-0000"
    Then null should be returned

  Scenario: Query vulnerabilities with filters
    Given the local database contains diverse vulnerabilities
    When I query with severity "CRITICAL" and limit 5
    Then up to 5 CRITICAL vulnerabilities should be returned
    And results should be from cache

  Scenario: Get recent vulnerabilities
    Given the local database contains CVEs from the last 90 days
    When I get recent vulnerabilities from last 30 days
    Then only CVEs from the last 30 days should be returned
    And results should be ordered by recency

  Scenario: Get top vulnerabilities by severity
    Given the local database contains CVEs with various CVSS scores
    When I get top 10 vulnerabilities
    Then the 10 highest CVSS scored CVEs should be returned
    And they should be ordered by score descending

  Scenario: Get vulnerability statistics
    Given the local database contains vulnerability data
    When I get statistics
    Then total count should be returned
    And severity breakdown should be returned
    And average score should be calculated

  Scenario: Convert database CVE to vulnerability format
    Given a database CVE with severity "HIGH"
    When converting to vulnerability format
    Then severity should be "high" (lowercase)
    And source should be lowercase
    And all required fields should be mapped

  Scenario: Handle API error during scan
    Given the component is not in local database
    And the NVD API returns an error
    When I scan the component
    Then errors array should contain the error message
    And vulnerabilities array should be empty

  Scenario: Cache vulnerabilities from API results
    Given API returned vulnerabilities for a component
    And preferLocal is true
    When I scan the component
    Then vulnerabilities should be cached in local database
    And subsequent scans should use cache
```

---

## FEATURE 3: Audit Logging (20 scenarios)

### File: `features/audit/audit-logging.feature`

```gherkin
Feature: Audit Logging
  As a compliance officer
  I want all state changes to be logged with full context
  So that I can track who did what and when for compliance audits

  Scenario: Log project creation
    Given a new project "My Project" is created
    When the project creation is logged
    Then an audit event should be created with action "CREATE"
    And entity type should be "project"
    And new state should contain project details
    And event should have a ULID timestamp

  Scenario: Log project update
    Given project "P1" exists with name "Old Name"
    When the project name is updated to "New Name"
    Then an audit event should be created with action "UPDATE"
    And previous state should contain "Old Name"
    And new state should contain "New Name"

  Scenario: Log project deletion
    Given project "P1" exists with details
    When the project is deleted
    Then an audit event should be created with action "DELETE"
    And previous state should contain project details
    And new state should be null

  Scenario: Log vulnerability scan
    Given project "P1" has 0 vulnerabilities
    When a vulnerability scan finds 5 vulnerabilities
    Then an audit event should be created with action "SCAN"
    And previous state should show 0 vulnerabilities
    And new state should show 5 vulnerabilities
    And metadata should describe the scan

  Scenario: Log vulnerability refresh
    Given project "P1" has existing vulnerabilities
    When vulnerability data is refreshed with 3 new vulnerabilities
    Then an audit event should be created with action "UPDATE"
    And new state should indicate 3 new vulnerabilities

  Scenario: Log SBOM upload
    Given project "P1" exists
    When SBOM file "bom.json" is uploaded
    Then an audit event should be created with action "CREATE"
    And entity type should be "sbom"
    And new state should contain filename and format
    And component count should be recorded

  Scenario: Log SBOM removal
    Given project "P1" has SBOM "bom.json"
    When the SBOM is removed
    Then an audit event should be created with action "DELETE"
    And previous state should contain the filename

  Scenario: Log settings change
    Given application settings have "theme": "light"
    When settings are changed to "theme": "dark"
    Then an audit event should be created with action "SETTINGS_CHANGE"
    And previous state should indicate "theme" changed
    And new state should contain new theme value

  Scenario: Log profile creation
    Given a new settings profile "Security Profile" is created
    When the profile creation is logged
    Then an audit event should be created with action "CREATE"
    And entity type should be "profile"

  Scenario: Log profile update
    Given profile "P1" exists
    When the profile is updated
    Then an audit event should be created with action "UPDATE"
    And previous and new states should be captured

  Scenario: Log profile deletion
    Given profile "P1" exists
    When the profile is deleted
    Then an audit event should be created with action "DELETE"
    And previous state should be captured

  Scenario: Log export event
    Given 10 vulnerabilities are exported as PDF
    When the export is logged
    Then an audit event should be created with action "EXPORT"
    And new state should contain format "pdf"
    And item count should be 10

  Scenario: Log bulk delete operation
    Given 5 projects are selected for bulk deletion
    When bulk delete is executed
    Then an audit event should be created with action "DELETE"
    And metadata should indicate bulk operation
    And affected IDs should be recorded

  Scenario: Log bulk update operation
    Given 3 vulnerabilities are selected for bulk update
    When bulk update is executed
    Then an audit event should be created
    And metadata should mark it as bulk operation

  Scenario: Log bulk export operation
    Given 2 projects are exported
    When bulk export is executed
    Then an audit event should be created
    And affected entity IDs should be recorded

  Scenario: Sanitize project data for audit log
    Given a project with 1000 components and vulnerabilities
    When the project is logged
    Then component arrays should not be stored directly
    And counts should be stored instead
    And memory usage should be optimized

  Scenario: Generate ULID for audit event
    When a new audit event is created
    Then the event ID should be a ULID
    And the ULID should be time-sortable
    And the ULID should be unique

  Scenario: Store audit event in IndexedDB
    Given an audit event is created
    When the event is stored
    Then it should persist in IndexedDB
    And it should survive page refresh

  Scenario: Query audit events by date range
    Given audit events exist from January to March
    When I query events from February
    Then only February events should be returned
    And results should be ordered by timestamp

  Scenario: Query audit events by entity type
    Given audit events exist for projects, vulnerabilities, and settings
    When I query events with entity type filter "project"
    Then only project-related events should be returned
```

---

## FEATURE 4: Metrics Calculator (20 scenarios)

### File: `features/analytics/metrics-calculator.feature`

```gherkin
Feature: Executive Metrics Calculator
  As an executive
  I want aggregated metrics across all projects
  So that I can understand the security posture at a glance

  Scenario: Calculate overall metrics from multiple projects
    Given I have 5 projects with various vulnerability counts
    When I calculate overall metrics
    Then total projects should be 5
    And total components should be summed
    And total vulnerabilities should be summed
    And severity counts should be aggregated

  Scenario: Calculate average health score
    Given project A has health score 80
    And project B has health score 60
    And project C has health score 90
    When I calculate overall metrics
    Then average health score should be 77

  Scenario: Determine risk level as critical
    Given overall metrics show critical vulnerabilities
    And average health score is below 40
    When I calculate risk level
    Then risk level should be "critical"

  Scenario: Determine risk level as excellent
    Given overall metrics show no critical vulnerabilities
    And vulnerable component percentage is below 10%
    When I calculate risk level
    Then risk level should be "excellent"

  Scenario: Calculate vulnerable component percentage
    Given 100 total components exist
    And 25 components have vulnerabilities
    When I calculate overall metrics
    Then vulnerable component percentage should be 25%

  Scenario: Calculate metrics for each project
    Given I have 3 projects
    When I calculate project metrics
    Then I should receive metrics for all 3 projects
    And each should include project name and health score
    And results should be sorted by risk score

  Scenario: Calculate project health score
    Given a project with 10 components and 5 vulnerabilities
    And 2 critical and 1 high severity vulnerabilities
    When I calculate project health score
    Then score should be reduced by vulnerability ratio
    And extra penalty should apply for critical vulns
    And score should be between 0 and 100

  Scenario: Calculate project risk score
    Given a project with high vulnerability ratio
    And stale scan date
    When I calculate project risk score
    Then vulnerability ratio should contribute to risk
    And staleness should add penalty
    And risk score should be 0-100

  Scenario: Calculate trend metrics over weeks
    Given projects have activity over 12 weeks
    When I calculate trend metrics
    Then 12 weekly periods should be generated
    And each period should show vulnerability count
    And each period should show scans completed

  Scenario: Determine vulnerability trend is increasing
    Given recent 4 weeks average 100 vulnerabilities
    And previous 4 weeks average 80 vulnerabilities
    When I calculate trend metrics
    Then vulnerability trend should be "increasing"

  Scenario: Determine vulnerability trend is decreasing
    Given recent 4 weeks average 50 vulnerabilities
    And previous 4 weeks average 80 vulnerabilities
    When I calculate trend metrics
    Then vulnerability trend should be "decreasing"

  Scenario: Determine health trend is improving
    Given recent average health score is 75
    And previous average health score is 65
    When I calculate trend metrics
    Then health trend should be "improving"

  Scenario: Calculate scan frequency
    Given 3 projects were scanned in the last 7 days
    When I calculate productivity metrics
    Then scan frequency should be 3 per week

  Scenario: Calculate compliance metrics
    Given 100 critical vulnerabilities exist
    And 20 are older than 30 days (SLA exceeded)
    When I calculate compliance metrics
    Then SLA critical compliance should be 80%

  Scenario: Calculate scan coverage
    Given 10 projects exist
    And 8 were scanned in the last 30 days
    When I calculate compliance metrics
    Then scan coverage should be 80%

  Scenario: Calculate data freshness
    Given 10 projects exist
    And 7 had data refreshed in last 7 days
    When I calculate compliance metrics
    Then data freshness should be 70%

  Scenario: Calculate remediation rate
    Given 50 vulnerabilities have patch information
    And 40 have available patches
    When I calculate compliance metrics
    Then remediation rate should be 80%

  Scenario: Calculate productivity metrics
    Given 5 projects with various statistics
    When I calculate productivity metrics
    Then total scans should be counted
    And SBOMs processed should be counted
    And components analyzed should be summed

  Scenario: Handle empty project list
    Given no projects exist
    When I calculate overall metrics
    Then total projects should be 0
    And all counts should be 0
    And average health score should default to 100

  Scenario: Calculate all executive metrics together
    Given I have multiple projects
    When I calculate executive metrics
    Then overall metrics should be included
    And project metrics should be included
    And trend metrics should be included
    And compliance metrics should be included
    And productivity metrics should be included
```

---

## FEATURE 5: SBOM Parsers (15 scenarios)

### File: `features/parsers/spdx-parser.feature`

```gherkin
Feature: SPDX SBOM Parser
  As a vulnerability assessor
  I want to parse SPDX format SBOM files
  So that I can extract component information for scanning

  Scenario: Parse valid SPDX JSON file
    Given a valid SPDX JSON file "bom.spdx.json"
    When I parse the file
    Then components should be extracted
    And format should be "spdx"
    And format version should be detected

  Scenario: Parse SPDX with multiple packages
    Given an SPDX file with 10 packages
    When I parse the file
    Then 10 components should be extracted
    And component count should be 10

  Scenario: Parse SPDX with component versions
    Given an SPDX package with version "2.5.0"
    When I parse the file
    Then component version should be "2.5.0"

  Scenario: Parse SPDX with licenses
    Given an SPDX package with license "Apache-2.0"
    When I parse the file
    Then component licenses should include "Apache-2.0"

  Scenario: Parse SPDX with license expression
    Given an SPDX package with license "MIT OR Apache-2.0"
    When I parse the file
    Then both "MIT" and "Apache-2.0" should be extracted

  Scenario: Parse SPDX with purl reference
    Given an SPDX package with purl "pkg:npm/express@4.18.0"
    When I parse the file
    Then component purl should be "pkg:npm/express@4.18.0"

  Scenario: Parse SPDX with CPE reference
    Given an SPDX package with CPE "cpe:2.3:a:nginx:nginx:1.18.0:*:*:*:*:*:*:*"
    When I parse the file
    Then component CPE should be set

  Scenario: Parse SPDX with package description
    Given an SPDX package with description "A web server"
    When I parse the file
    Then component description should be "A web server"

  Scenario: Determine component type from download location
    Given an SPDX package with download location "https://registry.npmjs.org/express"
    When I parse the file
    Then component type should be "library"

  Scenario: Determine container type
    Given an SPDX package with download location containing "docker"
    When I parse the file
    Then component type should be "container"

  Scenario: Generate unique component ID
    Given package name "express" and version "4.18.0"
    When generating component ID
    Then ID should be "express-4.18.0"

  Scenario: Handle invalid JSON in SPDX file
    Given an SPDX file with invalid JSON
    When I attempt to parse
    Then an error should be thrown
    And error should indicate invalid JSON

  Scenario: Validate SPDX file format
    Given a valid SPDX JSON file
    When I validate the file
    Then validation should succeed

  Scenario: Detect SPDX file type
    Given a file with dataLicense "CC0-1.0"
    When I check if it's an SPDX file
    Then result should be true

  Scenario: Get SPDX version from file
    Given an SPDX file with spdxVersion "SPDX-2.3"
    When I get the version
    Then version should be "2.3"
```

### File: `features/parsers/cyclonedx-parser.feature`

```gherkin
Feature: CycloneDX SBOM Parser
  As a vulnerability assessor
  I want to parse CycloneDX format SBOM files
  So that I can extract component information for scanning

  Scenario: Parse valid CycloneDX JSON file
    Given a valid CycloneDX JSON file "bom.json"
    When I parse the file
    Then components should be extracted
    And format should be "cyclonedx"

  Scenario: Parse CycloneDX with nested components
    Given a CycloneDX file with component dependencies
    When I parse the file
    Then all components should be extracted
    And dependencies should be tracked

  Scenario: Parse CycloneDX with vulnerability data
    Given a CycloneDX file with vulnerability information
    When I parse the file
    Then vulnerabilities should be extracted
    And component-vulnerability links should be established

  Scenario: Extract component hashes from CycloneDX
    Given a CycloneDX component with SHA-256 hash
    When I parse the file
    Then component hash should be extracted
```

---

## FEATURE 6: Export Formats (15 scenarios)

### File: `features/export/export-formats.feature`

```gherkin
Feature: Export Formats
  As a vulnerability assessor
  I want to export data in various formats
  So that I can share findings with stakeholders

  Scenario: Export vulnerabilities to CSV
    Given 5 vulnerabilities exist
    When I export to CSV format
    Then CSV content should be generated
    And header row should be included
    And each vulnerability should be a row

  Scenario: CSV escape special characters
    Given a vulnerability with description containing "quotes, and, commas"
    When I export to CSV
    Then the description should be properly escaped
    And quotes should be doubled

  Scenario: CSV includes all vulnerability fields
    Given a vulnerability with all fields populated
    When I export to CSV
    Then ID column should be included
    And severity column should be included
    And CVSS score column should be included
    And description column should be included

  Scenario: CSV format dates correctly
    Given a vulnerability with published date "2024-01-15T10:00:00Z"
    When I export to CSV
    Then date should be formatted as "2024-01-15"

  Scenario: CSV handles empty vulnerability list
    Given no vulnerabilities exist
    When I export to CSV
    Then header row should still be included
    And no data rows should follow

  Scenario: Export components to CSV
    Given 3 components exist
    When I export components to CSV
    Then each component should be a row
    And component count should match

  Scenario: CSV includes component dependencies
    Given a component with 2 dependencies
    When I export to CSV
    Then dependencies count should be 2

  Scenario: Export to JSON format
    Given vulnerabilities exist
    When I export to JSON format
    Then valid JSON should be generated
    And all vulnerabilities should be included

  Scenario: Export to PDF format
    Given vulnerabilities exist
    When I export to PDF format
    Then PDF file should be generated
    And content should be readable

  Scenario: Generate export filename with date
    Given entity name "MyProject"
    When I generate filename for CSV export
    Then filename should include "MyProject"
    And filename should include current date
    And extension should be ".csv"

  Scenario: Sanitize filename for export
    Given entity name "Project<>:Name"
    When I generate filename
    Then invalid characters should be replaced
    And filename should be valid

  Scenario: Download CSV triggers browser download
    Given CSV content is generated
    When I trigger download
    Then browser download should start
    And file should have correct name

  Scenario: Export with UTF-8 BOM for Excel
    Given CSV content for Excel
    When I export
    Then UTF-8 BOM should be prepended
    And Excel should open correctly

  Scenario: Export audit logs to CSV
    Given audit events exist
    When I export audit logs to CSV
    Then each event should be a row
    And event details should be included

  Scenario: Export with filters applied
    Given 100 vulnerabilities exist
    When I export with severity filter "CRITICAL"
    Then only CRITICAL vulnerabilities should be exported
```

---

## FEATURE 7: Update Scheduling (10 scenarios)

### File: `features/database/update-scheduler.feature`

```gherkin
Feature: Update Scheduling
  As a system administrator
  I want to schedule automatic database updates
  So that vulnerability data stays current without manual intervention

  Scenario: Schedule daily updates
    Given I configure daily updates at 2 AM
    When the schedule is created
    Then updates should run daily at 2 AM

  Scenario: Schedule weekly updates
    Given I configure weekly updates on Monday
    When the schedule is created
    Then updates should run every Monday

  Scenario: Schedule monthly updates
    Given I configure monthly updates on the 1st
    When the schedule is created
    Then updates should run on the 1st of each month

  Scenario: Calculate next daily schedule
    Given current time is 2024-01-15 10:00 AM
    And daily schedule is for 2 AM
    When I calculate next schedule
    Then next run should be 2024-01-16 2:00 AM

  Scenario: Calculate next weekly schedule
    Given current time is Wednesday
    And weekly schedule is for Monday
    When I calculate next schedule
    Then next run should be next Monday

  Scenario: Format schedule for display
    Given a daily schedule at 2 AM
    When I format the schedule
    Then it should display as "Daily at 2:00 AM"

  Scenario: Pause scheduled update
    Given an update is scheduled
    When I pause the schedule
    Then no updates should run

  Scenario: Resume scheduled update
    Given a paused schedule
    When I resume the schedule
    Then updates should run according to schedule

  Scenario: Handle missed schedule
    Given a scheduled update was missed
    When the scheduler checks
    Then the update should run immediately
    And next schedule should be calculated

  Scenario: Calculate schedule with timezone
    Given schedule is for 2 AM Eastern
    When I calculate next schedule in Pacific
    Then time should be converted to Pacific
```

---

## Summary

**Total Scenarios:** 120

| Feature | Scenarios | Status |
|---------|-----------|--------|
| NVD Database Operations | 25 | Designed |
| Hybrid Scanner | 15 | Designed |
| Audit Logging | 20 | Designed |
| Metrics Calculator | 20 | Designed |
| SBOM Parsers | 15 | Designed |
| Export Formats | 15 | Designed |
| Update Scheduling | 10 | Designed |

**Next Steps:**
1. Create feature files in `tests/bdd/features/`
2. Implement step definitions in `tests/bdd/step-definitions/`
3. Configure Cucumber.js with Vitest
4. Run scenarios and implement backend code (TDD)
5. Verify all scenarios pass
