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
