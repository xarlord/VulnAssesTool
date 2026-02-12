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
