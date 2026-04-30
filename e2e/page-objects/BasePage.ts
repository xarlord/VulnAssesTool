/**
 * Base Page Object
 *
 * Provides common methods and constants for all page objects.
 */

import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { E2E_BASE_URL } from '../shared-helpers'

export class BasePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  readonly SHORT_TIMEOUT = 500
  readonly MEDIUM_TIMEOUT = 5000
  readonly LONG_TIMEOUT = 10000

  async navigateTo(route: string): Promise<void> {
    await this.page.goto(`${E2E_BASE_URL}${route}`)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async waitForAnimation(timeout = 500): Promise<void> {
    await this.page.waitForTimeout(timeout)
  }

  getDialog(): Locator {
    return this.page.getByRole('dialog')
  }

  async expectDialogOpen(): Promise<void> {
    await expect(this.getDialog()).toBeVisible({ timeout: this.MEDIUM_TIMEOUT })
  }

  async expectDialogClosed(): Promise<void> {
    await expect(this.getDialog()).not.toBeVisible({ timeout: this.MEDIUM_TIMEOUT })
  }
}
