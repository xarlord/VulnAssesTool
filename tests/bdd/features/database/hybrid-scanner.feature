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
