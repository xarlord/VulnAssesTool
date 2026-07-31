/**
 * Audit Log — content contracts (FR-07.2 / FR-07.3)
 *
 * The audit trail is fully client-side: events are recorded into the Zustand audit store
 * (lib/audit) by the real store actions and rendered by components/audit/AuditLogPanel via
 * the /audit page + sidebar nav added in FR-07.2, so this is deterministic offline.
 *
 *   - store/useStore.ts        — logProjectCreate fires a CREATE event on project creation
 *                                (description "Created project: <name>").
 *   - components/shell/Sidebar — "Audit Log" nav link → /audit route (App.tsx).
 *   - components/audit/AuditLogPanel — events table + Export menu (CSV/JSON/PDF).
 */
import { test, expect, resetAppState } from '../test-helper'
import { createProjectOnly, navigateToAuditLog } from '../shared-helpers'

test.describe('Audit Log', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
  })

  test('reaches the audit log from the sidebar and shows the project CREATE event', async ({ page }) => {
    await createProjectOnly(page, 'Audit Trail Project')

    await navigateToAuditLog(page)

    // FR-07.2: the /audit route and nav link must exist — this fails today without them.
    await expect(page).toHaveURL(/\/audit$/)
    // FR-07.1 records a CREATE event on project creation; FR-07.2 makes it viewable.
    await expect(page.getByText('CREATE').first()).toBeVisible()
    await expect(page.getByText(/Created project: Audit Trail Project/).first()).toBeVisible()
  })

  test('downloads a CSV export of the audit log from the /audit page', async ({ page }) => {
    await createProjectOnly(page, 'Audit Export Project')
    await navigateToAuditLog(page)
    await expect(page).toHaveURL(/\/audit$/)

    // FR-07.3: the export path (not just the viewer) must be reachable from the page.
    await page.getByRole('button', { name: /^Export$/ }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByText('Export as CSV').click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/audit.*\.csv/i)
  })
})
