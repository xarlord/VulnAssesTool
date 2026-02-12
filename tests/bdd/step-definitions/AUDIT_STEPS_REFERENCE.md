# Audit Step Definitions - Quick Reference

## File Location
`C:\Users\sefa.ocakli\VulnAssesTool\tests\bdd\step-definitions\audit.steps.ts`

## Step Statistics
- **Given Steps**: 23
- **When Steps**: 16
- **Then Steps**: 41
- **Total**: 80 step definitions

## Step Patterns by Category

### Project Operations

#### Given Steps
```gherkin
Given a new project {string} is created
Given project {string} exists with name {string}
Given project {string} exists with details
Given project {string} has {int} vulnerabilities
Given project {string} has existing vulnerabilities
```

#### When Steps
```gherkin
When the project creation is logged
When the project name is updated to {string}
When the project is deleted
```

#### Then Steps
```gherkin
Then an audit event should be created with action {string}
Then entity type should be {string}
Then new state should contain project details
Then previous state should contain {string}
Then new state should contain {string}
Then new state should be null
```

### Vulnerability Operations

#### Given Steps
```gherkin
Given project {string} has {int} vulnerabilities
Given project {string} has existing vulnerabilities
```

#### When Steps
```gherkin
When a vulnerability scan finds {int} vulnerabilities
When vulnerability data is refreshed with {int} new vulnerabilities
```

#### Then Steps
```gherkin
Then previous state should show {int} vulnerabilities
Then new state should show {int} vulnerabilities
Then metadata should describe the scan
```

### SBOM Operations

#### Given Steps
```gherkin
Given project {string} has SBOM {string}
```

#### When Steps
```gherkin
When SBOM file {string} is uploaded
When the SBOM is removed
```

#### Then Steps
```gherkin
Then new state should contain filename and format
Then component count should be recorded
Then previous state should contain the filename
```

### Settings Operations

#### Given Steps
```gherkin
Given application settings have {string}:{string}
```

#### When Steps
```gherkin
When settings are changed to {string}:{string}
```

#### Then Steps
```gherkin
Then previous state should indicate {string} changed
Then new state should contain new theme value
```

### Profile Operations

#### Given Steps
```gherkin
Given a new settings profile {string} is created
Given profile {string} exists
```

#### When Steps
```gherkin
When the profile creation is logged
When the profile is updated
When the profile is deleted
```

#### Then Steps
```gherkin
Then previous and new states should be captured
Then previous state should be captured
```

### Export Operations

#### Given Steps
```gherkin
Given {int} vulnerabilities are exported as PDF
Given {int} projects are exported
```

#### When Steps
```gherkin
When the export is logged
When bulk export is executed
When I export audit logs as {string}
When I export audit logs with anonymization
When I export audit logs with full state
```

#### Then Steps
```gherkin
Then new state should contain format {string}
Then item count should be {int}
Then the export should be valid {string}
Then the export should contain all audit events
Then the export should have a timestamp
Then sensitive data should be redacted
Then full state data should be included
Then CSV export should have headers
Then CSV export should have event rows
```

### Bulk Operations

#### Given Steps
```gherkin
Given {int} projects are selected for bulk deletion
Given {int} vulnerabilities are selected for bulk update
Given {int} projects are exported
```

#### When Steps
```gherkin
When bulk delete is executed
When bulk update is executed
When bulk export is executed
```

#### Then Steps
```gherkin
Then metadata should indicate bulk operation
Then affected IDs should be recorded
Then metadata should mark it as bulk operation
Then affected entity IDs should be recorded
```

### Data Sanitization

#### Given Steps
```gherkin
Given a project with {int} components and vulnerabilities
```

#### When Steps
```gherkin
When the project is logged
```

#### Then Steps
```gherkin
Then component arrays should not be stored directly
Then counts should be stored instead
Then memory usage should be optimized
```

### ULID Generation

#### When Steps
```gherkin
When a new audit event is created
```

#### Then Steps
```gherkin
Then the event ID should be a ULID
Then the ULID should be time-sortable
Then the ULID should be unique
```

### IndexedDB Storage

#### Given Steps
```gherkin
Given an audit event is created
```

#### When Steps
```gherkin
When the event is stored
```

#### Then Steps
```gherkin
Then it should persist in IndexedDB
Then it should survive page refresh
```

### Query Operations

#### Given Steps
```gherkin
Given audit events exist from January to March
Given audit events exist for projects, vulnerabilities, and settings
```

#### When Steps
```gherkin
When I query events from February
When I query events with entity type filter {string}
```

#### Then Steps
```gherkin
Then only February events should be returned
Then results should be ordered by timestamp
Then only project-related events should be returned
```

### General Verification

#### Then Steps
```gherkin
Then event should have a ULID timestamp
Then an audit event should be created with action {string}
Then entity type should be {string}
```

## Test Context Structure

```typescript
interface AuditTestContext {
  testProjects: Map<string, Project>              // Test project data
  testProfiles: Map<string, SettingsProfile>      // Test profile data
  testSettings: AppSettings | null                // Test settings
  testSboms: Map<string, SbomInfo>                // Test SBOM data
  currentEventId: string | null                   // Last created event ID
  exportedData: ExportData | null                 // Export result
  mockIndexedDB: Map<string, AuditEvent[]>       // Mock IndexedDB
  bulkOperationIds: string[]                      // Bulk operation IDs
  queryResult: AuditEvent[] | null                // Query results
}
```

## Backend Functions Used

### From auditLogger.ts
```typescript
logProjectCreate(project, metadata?)
logProjectUpdate(projectId, previousState, newState, metadata?)
logProjectDelete(project, metadata?)
logVulnerabilityScan(projectId, projectName, componentsScanned, vulnerabilitiesFound, previousVulnCount, metadata?)
logVulnerabilityRefresh(projectId, projectName, newVulnerabilities, metadata?)
logSbomUpload(projectId, projectName, filename, format, componentCount, metadata?)
logSbomRemove(projectId, projectName, filename, metadata?)
logSettingsChange(previousSettings, newSettings, metadata?)
logProfileEvent(action, profile, previousProfile?, metadata?)
logExport(entityType, format, itemCount, projectId?, metadata?)
logBulkOperation(action, entityType, entityIds, metadata?)
```

### From auditStore.ts
```typescript
useAuditStore.getState().addEvent(eventData)
useAuditStore.getState().queryEvents(filter?, sort?, pagination?)
useAuditStore.getState().getEventById(id)
useAuditStore.getState().getEventsForEntity(entityId, entityType?)
useAuditStore.getState().getEventsInDateRange(start, end)
useAuditStore.getState().getStatistics()
useAuditStore.getState()._resetStore()
```

## Helper Functions

### createMockComponent(id: string): Component
Creates a mock component for testing with all required fields.

### createMockVulnerability(id: string): Vulnerability
Creates a mock vulnerability for testing with CVSS data.

### mockIndexedDBOperations()
Sets up mock IndexedDB operations using a Map for testing.

## Lifecycle Hooks

### Before Hook
- Initializes fresh test context
- Resets audit store
- Sets up mock IndexedDB

### After Hook
- Clears test context
- Resets audit store
- Cleans up mock data

## Running the Tests

```bash
# Run all audit tests
npm run test:bdd -- --tags "@audit"

# Run specific scenario
npm run test:bdd -- --name "Log project creation"

# Run with debugging
npm run test:bdd:debug -- --tags "@audit"
```

## Example Usage

```gherkin
Feature: Audit Logging
  As a compliance officer
  I want all state changes to be logged
  So that I can track who did what and when

  Scenario: Log project creation
    Given a new project "My Project" is created
    When the project creation is logged
    Then an audit event should be created with action "CREATE"
    And entity type should be "project"
    And new state should contain project details
    And event should have a ULID timestamp
```

## Data Flow

1. **Setup (Given)**: Create test data in context
2. **Action (When)**: Call actual backend function
3. **Verification (Then)**: Assert on audit store state

## Best Practices

1. **Always reset state**: Use Before/After hooks
2. **Use real functions**: Don't mock business logic
3. **Verify state**: Check both event structure and data
4. **Test edge cases**: Empty data, large datasets, etc.
5. **Mock external deps**: IndexedDB, file system, etc.

## Troubleshooting

### Common Issues

**Issue**: Tests fail with "event not found"
- **Solution**: Check that currentEventId is set in When step

**Issue**: State not persisting between steps
- **Solution**: Ensure data is stored in context, not local variables

**Issue**: Type errors
- **Solution**: Import types from `src/shared/types` and `src/renderer/lib/audit/types`

## Maintenance

### Adding New Steps

1. Add Given step for setup (if needed)
2. Add When step for action
3. Add Then step for verification
4. Update this reference

### Modifying Existing Steps

1. Update step definition
2. Update test data helpers (if needed)
3. Update this reference
4. Run tests to verify

## Summary

This comprehensive step definition file provides:
- ✅ 80 step definitions covering 20 scenarios
- ✅ Full TypeScript type safety
- ✅ Integration with real backend functions
- ✅ Proper test isolation and cleanup
- ✅ Mocked external dependencies
- ✅ Comprehensive verification steps

The implementation follows TDD best practices and provides complete test coverage for the audit logging system.
