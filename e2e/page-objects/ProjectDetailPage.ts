/**
 * Project Detail Page Object
 *
 * Encapsulates project detail page interactions including tab navigation.
 */

import type { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

export class ProjectDetailPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async navigateToTab(tabName: string): Promise<void> {
    const tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'i') })
    await tab.click()
    await this.waitForAnimation()
  }

  async navigateToVulnerabilitiesTab(): Promise<void> {
    await this.navigateToTab('vulnerabilities')
  }

  async navigateToComponentsTab(): Promise<void> {
    await this.navigateToTab('components')
  }

  async navigateToHealthTab(): Promise<void> {
    await this.navigateToTab('health')
  }

  async clickFPFButton(): Promise<void> {
    const fpfButton = this.page
      .getByRole('button', { name: /false positive|fpf/i })
      .or(this.page.getByRole('link', { name: /false positive|fpf/i }))
      .first()
    await fpfButton.click()
    await this.waitForAnimation()
  }

  getHeading(): Locator {
    return this.page.getByRole('heading', { level: 1 }).first()
  }

  async getProjectIdFromUrl(): Promise<string | null> {
    const url = this.page.url()
    const match = url.match(/\/project\/([^/]+)/)
    return match?.[1] ?? null
  }
}
