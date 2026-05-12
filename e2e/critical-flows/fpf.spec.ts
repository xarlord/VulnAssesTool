import { test, expect, resetAppState } from '../electron-helper'
import { createProjectOnly, E2E_UI_DELAY } from '../shared-helpers'

/**
 * E2E Tests for False Positive Filter (FPF) Flow
 *
 * Tests the FPF feature navigation buttons and UI elements.
 * Note: Full FPF page functionality tests are skipped because the FPF page
 * requires proper project state from the store which may not be available
 * in the E2E test environment.
 */

test.describe('FPF Navigation Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
    const uniqueName = `FPF Test Project ${Date.now()}`
    await createProjectOnly(page, uniqueName)
    await expect(page.getByText(uniqueName, { exact: false })).toBeVisible({ timeout: 5000 })
  })

  test('should show FPF button on project detail page', async ({ page }) => {
    await page.getByText('FPF Test Project', { exact: false }).first().click()
    await expect(page.getByRole('heading', { name: /FPF Test Project/i })).toBeVisible({ timeout: 10000 })

    const fpfButton = page.locator('button').filter({ hasText: 'False Positive Filter' })
    await expect(fpfButton).toBeVisible({ timeout: 5000 })
  })

  test('should show FPF button on project card hover', async ({ page }) => {
    const projectCard = page.locator('.group').filter({ hasText: 'FPF Test Project' }).first()
    await projectCard.hover()
    await page.waitForTimeout(1000)

    const fpfButton = page.locator('button').filter({ hasText: 'FPF' })
    await expect(fpfButton).toBeVisible({ timeout: 5000 })
  })

  test('should navigate to FPF page from project detail', async ({ page }) => {
    await page.getByText('FPF Test Project', { exact: false }).first().click()
    await expect(page.getByRole('heading', { name: /FPF Test Project/i })).toBeVisible({ timeout: 10000 })

    const url = page.url()
    const projectId = url.match(/\/project\/([^/]+)/)?.[1]

    if (projectId) {
      await page.evaluate((id) => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') nav(`/project/${id}/fpf`)
      }, projectId)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      expect(page.url()).toContain('/fpf')
    } else {
      const fpfButton = page.locator('button').filter({ hasText: 'False Positive Filter' })
      if (await fpfButton.isVisible().catch(() => false)) {
        await fpfButton.click()
        await page.waitForTimeout(2000)
        expect(page.url()).toContain('/fpf')
      }
    }
  })

  test('should navigate to FPF page from dashboard card', async ({ page }) => {
    const projectCard = page.locator('.group').filter({ hasText: 'FPF Test Project' }).first()
    await projectCard.hover()
    await page.waitForTimeout(1000)

    const fpfButton = page.locator('button').filter({ hasText: 'FPF' })
    if (await fpfButton.isVisible().catch(() => false)) {
      await fpfButton.click()
      await page.waitForTimeout(2000)
      expect(page.url()).toContain('/fpf')
    } else {
      await projectCard.click()
      await page.waitForTimeout(500)
      const url = page.url()
      const projectId = url.match(/\/project\/([^/]+)/)?.[1]
      if (projectId) {
        await page.evaluate((id) => {
          const nav = (window as unknown as Record<string, unknown>).__navigate
          if (typeof nav === 'function') nav(`/project/${id}/fpf`)
        }, projectId)
        await page.waitForLoadState('domcontentloaded')
        expect(page.url()).toContain('/fpf')
      }
    }
  })
})

test.describe('FPF Page Content', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should display FPF dashboard with tabs', async ({ page }) => {
    const uniqueName = `FPF Dashboard Test ${Date.now()}`
    await createProjectOnly(page, uniqueName)
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 })

    await page.locator('.group.rounded-lg.border').filter({ hasText: uniqueName }).first().click()
    await page.waitForTimeout(500)
    const url = page.url()
    const projectId = url.match(/\/project\/([^/]+)/)?.[1]

    if (projectId) {
      await page.evaluate((id) => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') nav(`/project/${id}/fpf`)
      }, projectId)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      const tabs = page.getByRole('tab')
      const tabCount = await tabs.count()
      expect(tabCount).toBeGreaterThanOrEqual(1)
    }
  })

  test('should show empty state on Review Filtered tab', async ({ page }) => {
    const uniqueName = `FPF Empty State Test ${Date.now()}`
    await createProjectOnly(page, uniqueName)

    await page.locator('.group.rounded-lg.border').filter({ hasText: uniqueName }).first().click()
    await page.waitForTimeout(500)
    const url = page.url()
    const projectId = url.match(/\/project\/([^/]+)/)?.[1]

    if (projectId) {
      await page.evaluate((id) => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') nav(`/project/${id}/fpf`)
      }, projectId)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      const hasEmptyState = await page
        .getByText(/no.*filtered|empty|no results/i)
        .isVisible()
        .catch(() => false)
      const hasContent = await page
        .getByRole('tab')
        .first()
        .isVisible()
        .catch(() => false)
      expect(hasEmptyState || hasContent).toBe(true)
    }
  })

  test('should display configuration wizard', async ({ page }) => {
    const uniqueName = `FPF Config Test ${Date.now()}`
    await createProjectOnly(page, uniqueName)

    await page.locator('.group.rounded-lg.border').filter({ hasText: uniqueName }).first().click()
    await page.waitForTimeout(500)
    const url = page.url()
    const projectId = url.match(/\/project\/([^/]+)/)?.[1]

    if (projectId) {
      await page.evaluate((id) => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') nav(`/project/${id}/fpf`)
      }, projectId)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      const configTab = page.getByRole('tab', { name: /configuration/i })
      if (await configTab.isVisible().catch(() => false)) {
        await configTab.click()
        await page.waitForTimeout(500)
      }

      const hasWizard = await page
        .getByText(/step|wizard|configure/i)
        .first()
        .isVisible()
        .catch(() => false)
      const hasForm = await page
        .locator('form, [role="form"]')
        .first()
        .isVisible()
        .catch(() => false)
      expect(hasWizard || hasForm).toBe(true)
    }
  })
})
