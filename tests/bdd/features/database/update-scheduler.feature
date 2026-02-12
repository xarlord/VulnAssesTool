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
