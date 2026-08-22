@database
Feature: NVD Database Operations
  As a vulnerability assessor
  I want to store and query CVE data locally
  So that I can scan components offline and get fast results

  Scenario: Initialize a new database
    Given no database exists at the target location
    When I initialize the NVD database
    Then a new database file should be created
    And the database schema should be applied
    And WAL mode should be enabled
    And foreign keys should be enabled

  Scenario: Initialize database with a custom path
    Given a custom database path "custom/nested/nvd.db"
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
    And the database should still hold exactly 1 CVE

  # A CVE's publication date is immutable. upsertCVE's ON CONFLICT clause refreshes
  # description, scores, severity, source and modified_at, but deliberately leaves
  # published_at alone — a re-import must not silently re-date an existing CVE, which
  # would move it in and out of the "published after 2021" metadata count.
  Scenario: Re-importing a CVE keeps its original publication date
    Given the database is initialized
    And CVE "CVE-2024-1234" exists with description "Old description"
    When I re-import the CVE with a later publication date
    Then the publication date should be unchanged
    And the CVE should reflect the updated description

  Scenario: Insert CPE matches for a CVE
    Given the database is initialized
    And CVE "CVE-2024-1234" exists in the database
    When I insert 3 CPE matches for the CVE
    Then all 3 CPE matches should be stored
    And each CPE match should be linked to the CVE

  # insertCPEMatches is a delete-then-insert wrapped in a single better-sqlite3
  # transaction, so re-inserting replaces the whole set rather than appending. This
  # is the atomicity guarantee the old "Begin/Commit transaction" scenarios were
  # reaching for; NvdDatabase exposes no begin/commit API of its own.
  Scenario: Replace the CPE matches for a CVE
    Given the database is initialized
    And CVE "CVE-2024-1234" exists in the database
    And I insert 3 CPE matches for the CVE
    When I insert 2 different CPE matches for the CVE
    Then exactly 2 CPE matches should be stored
    And none of the replaced CPE matches should remain

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
    And 10 CVEs exist with CPE matches for "nginx"
    When I search CVEs using CPE text "nginx"
    Then I should receive results containing CVEs with nginx CPE matches
    And results should be ordered by CVSS score descending

  Scenario: Search CVEs by CPE with limit
    Given the database is initialized
    And 50 CVEs exist with CPE matches for "apache"
    When I search CVEs using CPE text "apache" with limit 10
    Then I should receive exactly 10 results
    And results should be the highest CVSS scored CVEs

  Scenario: Get database metadata
    Given the database is initialized
    And the database contains 20 CVEs, 12 of them published after 2021
    When I retrieve the database metadata
    Then total CVEs should be 20
    And CVEs after 2021 should be 12
    And schema version should be returned

  Scenario: Update metadata key-value
    Given the database is initialized
    When I update metadata with key "last_sync_at" and value "2024-01-15T10:00:00Z"
    Then the metadata should be stored
    And the reported last sync time should be "2024-01-15T10:00:00Z"

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
    Given a database path that cannot be created
    When I attempt to initialize the database
    Then initialization should fail with an error

  # ---------------------------------------------------------------------------
  # Excluded below: capabilities NvdDatabase does not have. Keeping the scenarios
  # documents the gap instead of hiding it — see tests/bdd/README.md.
  # ---------------------------------------------------------------------------

  # No filtered-list query exists. server/database/types.ts declares
  # DatabaseQueryOptions and SeverityDateSearchOptions (severity[]/min-max CVSS/
  # start-end date), but nothing consumes them: NvdDatabase's only reads are
  # getCVEById, getCVEsByIds, getCVEFullDetails, searchCVEsByText/ByCPE/ByProduct,
  # getTotalCVECount and getMetadata. Implementing these scenarios would mean
  # inventing the query API first.
  @wip
  Scenario: Get CVEs filtered by severity
    Given the database is initialized
    And CVEs exist with severities: CRITICAL, HIGH, MEDIUM, LOW
    When I query CVEs with severity filter "CRITICAL"
    Then only CRITICAL CVEs should be returned
    And results should be ordered by published date descending

  @wip
  Scenario: Get CVEs by multiple severities
    Given the database is initialized
    And CVEs exist with all severity levels
    When I query CVEs with severity filter "CRITICAL,HIGH"
    Then only CRITICAL and HIGH CVEs should be returned

  @wip
  Scenario: Get CVEs within CVSS score range
    Given the database is initialized
    And CVEs exist with CVSS scores from 0.0 to 10.0
    When I query CVEs with CVSS range 7.0 to 9.0
    Then only CVEs with scores between 7.0 and 9.0 should be returned
    And results should be ordered by CVSS score descending

  @wip
  Scenario: Get CVEs published after a date
    Given the database is initialized
    And CVEs exist from 2020 to 2024
    When I query CVEs published after "2023-01-01"
    Then only CVEs published after 2023-01-01 should be returned
    And results should be ordered by published date descending

  @wip
  Scenario: Get CVEs within date range
    Given the database is initialized
    And CVEs exist across multiple years
    When I query CVEs with start date "2023-01-01" and end date "2023-12-31"
    Then only CVEs from 2023 should be returned

  @wip
  Scenario: Query with multiple filters combined
    Given the database is initialized
    And diverse CVEs exist in the database
    When I query with severity "HIGH" and CVSS range 7.0-8.0
    Then results should match all criteria
    And query time should be under 1 second

  # No begin/commit/rollback is exposed. Transactions exist inside NvdDatabase
  # (insertCPEMatches, insertReferences and the v2 schema migration each wrap their
  # writes in db.transaction), but the caller cannot open one. "Replace the CPE
  # matches for a CVE" above covers the guarantee that is actually reachable.
  @wip
  Scenario: Commit transaction
    Given the database is initialized
    And a transaction is in progress
    And I inserted CVEs within the transaction
    When I commit the transaction
    Then all CVEs should be persisted

  @wip
  Scenario: Rollback transaction
    Given the database is initialized
    And a transaction is in progress
    And I inserted CVEs within the transaction
    When I rollback the transaction
    Then no CVEs should be persisted

  # NvdDatabase has no truncate/clear API; the app replaces data per-CVE (upsertCVE,
  # insertCPEMatches, insertReferences) or deletes the database file outright.
  @wip
  Scenario: Clear all data from database
    Given the database is initialized
    And the database contains data
    When I clear all data
    Then the CVEs table should be empty
    And the CPE matches table should be empty
    And the references table should be empty
    And the metadata table should be empty
