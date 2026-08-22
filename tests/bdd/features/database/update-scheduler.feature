@scheduler
Feature: NVD Sync Scheduling
  As a system administrator
  I want to schedule automatic database updates
  So that vulnerability data stays current without manual intervention

  # What the app actually supports is an INTERVAL, not a calendar time: the Settings UI offers
  # manual / daily / weekly / monthly, `SYNC_INTERVAL_HOURS` in server/routes/database.ts maps
  # those to 0 / 24 / 168 / 720, and NvdDeltaSync.setAutoSyncInterval persists the choice to
  # sync_status so it survives a reload. The scenarios below drive that real behaviour.

  Scenario Outline: Choose how often the NVD database syncs
    Given a delta-sync service on a fresh database
    When I set the sync schedule to "<schedule>"
    Then the persisted sync interval should be <hours> hours
    And auto-sync should be <state>

    Examples:
      | schedule | hours | state    |
      | daily    | 24    | enabled  |
      | weekly   | 168   | enabled  |
      | monthly  | 720   | enabled  |
      | manual   | 0     | disabled |

  Scenario: Pausing the schedule stops automatic syncing
    Given a delta-sync service on a fresh database
    And the sync schedule is "daily"
    When I set the sync schedule to "manual"
    Then auto-sync should be disabled

  Scenario: Resuming restores automatic syncing
    Given a delta-sync service on a fresh database
    And the sync schedule is "manual"
    When I set the sync schedule to "weekly"
    Then auto-sync should be enabled
    And the persisted sync interval should be 168 hours

  Scenario: The chosen schedule survives a restart
    # setAutoSyncInterval writes to sync_status rather than holding the choice in memory,
    # so a restarted server keeps syncing on the operator's schedule instead of silently
    # reverting to the default.
    Given a delta-sync service on a fresh database
    And the sync schedule is "monthly"
    When the delta-sync service is recreated against the same database
    Then the persisted sync interval should be 720 hours
    And auto-sync should be enabled

  # 48 hours, not 24: getSyncStatus() falls back to autoSyncIntervalHours 24 when no sync_status
  # row exists, so asserting 24 here would pass even if nothing were persisted at all.
  Scenario: Enabling the scheduler records the interval it will run at
    Given a delta-sync service on a fresh database
    When I enable auto-sync every 48 hours
    Then the persisted sync interval should be 48 hours
    And auto-sync should be enabled

  Scenario: Disabling the scheduler turns auto-sync off
    Given a delta-sync service on a fresh database
    And auto-sync is enabled every 48 hours
    When I disable auto-sync
    Then auto-sync should be disabled

  # ---------------------------------------------------------------------------
  # Excluded below: calendar scheduling, which the app does not implement.
  #
  # The schedule is an interval in hours counted from the last sync — there is no time-of-day,
  # day-of-week or day-of-month component anywhere in NvdDeltaSync, no next-run calculator
  # beyond `nextScheduledSync`, no display formatter, and no timezone handling. Implementing
  # these scenarios would mean building a cron scheduler first, so they stay @wip rather than
  # being quietly deleted. (An earlier note blamed `autoRefreshScheduler.ts` for this gap; that
  # module is the renderer's 5-minute UI refresh loop and is unrelated to NVD sync scheduling.)
  # ---------------------------------------------------------------------------

  @wip
  Scenario: Schedule daily updates at a chosen hour
    Given I configure daily updates at 2 AM
    When the schedule is created
    Then updates should run daily at 2 AM

  @wip
  Scenario: Schedule weekly updates on a chosen weekday
    Given I configure weekly updates on Monday
    When the schedule is created
    Then updates should run every Monday

  @wip
  Scenario: Schedule monthly updates on a chosen day
    Given I configure monthly updates on the 1st
    When the schedule is created
    Then updates should run on the 1st of each month

  @wip
  Scenario: Calculate next daily schedule
    Given current time is 2024-01-15 10:00 AM
    And daily schedule is for 2 AM
    When I calculate next schedule
    Then next run should be 2024-01-16 2:00 AM

  @wip
  Scenario: Calculate next weekly schedule
    Given current time is Wednesday
    And weekly schedule is for Monday
    When I calculate next schedule
    Then next run should be next Monday

  @wip
  Scenario: Format schedule for display
    Given a daily schedule at 2 AM
    When I format the schedule
    Then it should display as "Daily at 2:00 AM"

  @wip
  Scenario: Handle missed schedule
    Given a scheduled update was missed
    When the scheduler checks
    Then the update should run immediately
    And next schedule should be calculated

  @wip
  Scenario: Calculate schedule with timezone
    Given schedule is for 2 AM Eastern
    When I calculate next schedule in Pacific
    Then time should be converted to Pacific
