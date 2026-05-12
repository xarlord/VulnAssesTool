/**
 * Project Management Page Object
 *
 * Encapsulates project CRUD operations and selectors.
 * Replaces 12 duplicate createTestProject implementations.
 */

import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class ProjectManagementPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  getNewProjectButton(): Locator {
    return this.page.getByRole('button', { name: 'New Project' })
  }

  getProjectNameInput(): Locator {
    return this.page.locator('#project-name')
  }

  getCreateProjectButton(): Locator {
    return this.page.getByRole('button', { name: 'Create Project' })
  }

  getProjectCard(name: string): Locator {
    return this.page.locator('.group.rounded-lg.border').filter({ hasText: name }).first()
  }

  async clickNewProject(): Promise<void> {
    await this.getNewProjectButton().click()
    await this.expectDialogOpen()
  }

  async createProject(name: string, description?: string): Promise<void> {
    await this.getNewProjectButton().click()
    await this.expectDialogOpen()
    await this.getProjectNameInput().fill(name)

    if (description) {
      const descInput = this.page.locator('#project-description, textarea[placeholder*="description"]')
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.fill(description)
      }
    }

    await this.getCreateProjectButton().click()
    await this.expectDialogClosed()
    await expect(this.page.getByText(name)).toBeVisible({ timeout: this.MEDIUM_TIMEOUT })
  }

  async createMultipleProjects(names: string[]): Promise<void> {
    for (const name of names) {
      await this.createProject(name)
      await this.waitForAnimation()
    }
  }

  async navigateToProjectDetail(projectName: string): Promise<void> {
    await this.getProjectCard(projectName).click()
    await expect(this.page.getByRole('heading', { name: new RegExp(projectName, 'i') })).toBeVisible({
      timeout: this.LONG_TIMEOUT,
    })
  }

  async deleteProject(projectName: string): Promise<void> {
    await this.navigateToProjectDetail(projectName)
    await this.page.getByRole('button', { name: /delete/i }).click()
    await this.expectDialogOpen()
    await this.page.getByRole('button', { name: /confirm|delete/i }).click()
    await this.expectDialogClosed()
  }
}
