/**
 * Dialog Page Object
 *
 * Encapsulates dialog interactions.
 * Covers 56 dialog interactions across the test suite.
 */

import type { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

export class DialogPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async open(triggerLocator: Locator): Promise<void> {
    await triggerLocator.click()
    await this.expectDialogOpen()
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await this.expectDialogClosed()
  }

  async confirm(): Promise<void> {
    const confirmButton = this.page.getByRole('button', { name: /confirm|ok|yes|delete/i }).last()
    await confirmButton.click()
    await this.expectDialogClosed()
  }

  async cancel(): Promise<void> {
    const cancelButton = this.page.getByRole('button', { name: /cancel|close|no/i }).first()
    await cancelButton.click()
    await this.expectDialogClosed()
  }

  async isOpen(): Promise<boolean> {
    return await this.getDialog()
      .isVisible()
      .catch(() => false)
  }
}
