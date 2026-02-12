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
