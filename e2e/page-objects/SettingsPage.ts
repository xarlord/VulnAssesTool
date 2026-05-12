/**
 * Settings Page Object
 *
 * Encapsulates settings page navigation and form interactions.
 * Replaces 3 duplicate navigateToSettings implementations.
 */

import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  getSettingsButton(): Locator {
    return this.page.getByRole('button', { name: /settings/i })
  }

  getSettingsLink(): Locator {
    return this.page.getByRole('link', { name: /settings/i })
  }

  getSettingsHeading(): Locator {
    return this.page.getByRole('heading', { name: /settings/i })
  }

  async navigateToSettings(): Promise<boolean> {
    const button = this.getSettingsButton()
    const link = this.getSettingsLink()

    if (await button.isVisible().catch(() => false)) {
      await button.click()
    } else if (await link.isVisible().catch(() => false)) {
      await link.click()
    } else {
      return false
    }

    await this.waitForSettingsLoad()
    return true
  }

  async waitForSettingsLoad(): Promise<void> {
    await expect(this.getSettingsHeading()).toBeVisible({ timeout: this.LONG_TIMEOUT })
  }

  getSyncScheduleSelect(): Locator {
    return this.page
      .locator('select, [role="combobox"]')
      .filter({ hasText: /sync|schedule/i })
      .first()
  }

  getPruneToggle(): Locator {
    return this.page
      .getByRole('switch', { name: /prune/i })
      .or(this.page.locator('button[role="switch"]').filter({ hasText: /prune/i }))
      .first()
  }

  getCacheToggle(): Locator {
    return this.page
      .getByRole('switch', { name: /cache/i })
      .or(this.page.locator('button[role="switch"]').filter({ hasText: /cache/i }))
      .first()
  }
}
