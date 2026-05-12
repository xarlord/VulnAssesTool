# Example Feature File

Feature: Example Feature
  As a test developer
  I want to verify Cucumber setup
  So that I can write BDD tests

  @smoke @test
  Scenario: Verify Cucumber configuration
    Given I have a working Cucumber setup
    When I run a test scenario
    Then the test should pass successfully

  @ui @slow
  Scenario: Verify World context
    Given I have initialized the World context
    When I store data in the World
    Then I should be able to retrieve the data
    And the World should be cleaned up after the scenario
