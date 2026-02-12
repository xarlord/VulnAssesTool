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
