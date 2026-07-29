import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures')

const cycloneDxSample = path.join(FIXTURES_DIR, 'sbom', 'sample-cyclonedx.json')
const spdxSample = path.join(FIXTURES_DIR, 'sbom', 'sample-spdx.json')

interface ConsoleMessage {
  type: string
  text: string
}

function collectConsole(page: Page, messages: ConsoleMessage[]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      messages.push({ type: msg.type(), text: msg.text() })
    }
  })
  page.on('pageerror', (error) => {
    messages.push({ type: 'pageerror', text: error.message })
  })
}

function getErrors(messages: ConsoleMessage[]): ConsoleMessage[] {
  return messages.filter((m) => m.type === 'error' || m.type === 'pageerror')
}

async function gotoDashboard(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15000 })
}

async function clearStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
}

async function navigateToProject(page: Page, name: string): Promise<void> {
  await page.locator('.group.rounded-lg.border').filter({ hasText: name }).first().click()
  await expect(page.getByRole('heading', { name: new RegExp(name, 'i') })).toBeVisible({ timeout: 10000 })
}

async function uploadSbom(page: Page, filePath: string): Promise<void> {
  const uploadButton = page.getByRole('button', { name: /upload sbom/i }).first()
  await uploadButton.waitFor({ state: 'visible', timeout: 10000 })
  await uploadButton.click({ force: true })
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 10000 })
  const fileInput = dialog.locator('input[type="file"]')
  await fileInput.setInputFiles(filePath)
  const confirmButton = dialog.getByRole('button', { name: /add to project/i })
  const errorButton = dialog.getByRole('button', { name: /try again/i })
  // Parsing may auto-open the modal "CPE Estimation Required" dialog on top; as a stacked Radix
  // modal it inerts the underlying Add to Project button, so wait for whichever of the three
  // appears and dismiss the CPE dialog before waiting on the success/error button.
  const cpeDialog = page.getByRole('dialog', { name: /cpe|match|estimation/i })
  await Promise.race([
    confirmButton.waitFor({ state: 'visible', timeout: 30000 }),
    errorButton.waitFor({ state: 'visible', timeout: 30000 }),
    cpeDialog.waitFor({ state: 'visible', timeout: 30000 }),
  ])
  if (await cpeDialog.isVisible().catch(() => false)) {
    const skipButton = cpeDialog.getByRole('button', { name: /skip|cancel|close/i }).first()
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click()
      await page.waitForTimeout(500)
    }
    await Promise.race([
      confirmButton.waitFor({ state: 'visible', timeout: 10000 }),
      errorButton.waitFor({ state: 'visible', timeout: 10000 }),
    ])
  }
  if (await confirmButton.isVisible().catch(() => false)) {
    await confirmButton.click({ force: true })
    await page.waitForTimeout(500)
  }
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
}

test.describe('Full Assessment Workflow — Console Error Audit', () => {
  const messages: ConsoleMessage[] = []

  test.beforeEach(async ({ page }) => {
    messages.length = 0
    collectConsole(page, messages)
    await gotoDashboard(page)
    await clearStorage(page)
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
  })

  test('Step 1: Create project with zero console errors', async ({ page }) => {
    await createProject(page, 'Workflow Test')
    await page.waitForTimeout(2000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] create-project: "${e.text}"`)
    expect(errors, `Errors during project creation:\n${errors.map((e) => e.text).join('\n')}`).toHaveLength(0)
  })

  test('Step 2: Upload CycloneDX SBOM with zero console errors', async ({ page }) => {
    await createProject(page, 'SBOM Upload Test')
    await navigateToProject(page, 'SBOM Upload Test')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] upload-cyclonedx: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 3: Upload SPDX SBOM with zero console errors', async ({ page }) => {
    await createProject(page, 'SPDX Upload Test')
    await navigateToProject(page, 'SPDX Upload Test')
    await uploadSbom(page, spdxSample)
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] upload-spdx: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 4: Component list renders with version numbers after upload', async ({ page }) => {
    await createProject(page, 'Version Test')
    await navigateToProject(page, 'Version Test')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    await page.getByRole('tab', { name: /components/i }).click()
    await page.waitForTimeout(2000)

    const hasVersion = await page.evaluate(() => {
      const main = document.querySelector('main, [role="tabpanel"], tbody')
      if (main === null) return false
      return /\d+\.\d+/.test(main.textContent ?? '')
    })
    expect(hasVersion, 'No version numbers found in components').toBeTruthy()

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] version-numbers: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 5: Vulnerabilities tab renders without console errors', async ({ page }) => {
    await createProject(page, 'Vuln Tab Test')
    await navigateToProject(page, 'Vuln Tab Test')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    const vulnTab = page.getByRole('tab', { name: /vulnerabilities/i })
    if (await vulnTab.isVisible().catch(() => false)) {
      await vulnTab.click()
      await page.waitForTimeout(3000)
    }

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] vuln-tab: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 6: Health tab renders without console errors', async ({ page }) => {
    await createProject(page, 'Health Tab Test')
    await navigateToProject(page, 'Health Tab Test')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    const healthTab = page.getByRole('tab', { name: /health/i })
    if (await healthTab.isVisible().catch(() => false)) {
      await healthTab.click()
      await page.waitForTimeout(3000)
    }

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] health-tab: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 7: Settings page — Database status without errors', async ({ page }) => {
    await page
      .getByRole('link', { name: /settings/i })
      .or(page.getByRole('button', { name: /settings/i }))
      .first()
      .click()
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] settings-db: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 8: Export dialog opens and closes without errors', async ({ page }) => {
    await createProject(page, 'Export Test')
    await navigateToProject(page, 'Export Test')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    const exportBtn = page.getByRole('button', { name: /export/i }).first()
    if (await exportBtn.isVisible().catch(() => false)) {
      await exportBtn.click()
      await page.waitForTimeout(1500)
      const dialog = page.getByRole('dialog')
      if (await dialog.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] export: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 9: FPF (False Positive Filter) page without errors', async ({ page }) => {
    await createProject(page, 'FPF Test')
    await navigateToProject(page, 'FPF Test')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    const fpfBtn = page.getByRole('button', { name: /false positive|fpf/i })
    const fpfLink = page.getByRole('link', { name: /false positive|fpf/i })
    if (await fpfBtn.isVisible().catch(() => false)) {
      await fpfBtn.click()
      await page.waitForTimeout(3000)
    } else if (await fpfLink.isVisible().catch(() => false)) {
      await fpfLink.click()
      await page.waitForTimeout(3000)
    }

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] fpf: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 10: Search page renders without console errors', async ({ page }) => {
    await page
      .getByRole('link', { name: /search/i })
      .or(page.getByRole('button', { name: /search/i }))
      .first()
      .click()
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] search: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 11: Full workflow — create → upload → tabs → export — zero errors', async ({ page }) => {
    await createProject(page, 'Full Workflow')
    await navigateToProject(page, 'Full Workflow')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    await page.getByRole('tab', { name: /components/i }).click()
    await page.waitForTimeout(1500)

    const vulnTab = page.getByRole('tab', { name: /vulnerabilities/i })
    if (await vulnTab.isVisible().catch(() => false)) {
      await vulnTab.click()
      await page.waitForTimeout(2000)
    }

    const healthTab = page.getByRole('tab', { name: /health/i })
    if (await healthTab.isVisible().catch(() => false)) {
      await healthTab.click()
      await page.waitForTimeout(2000)
    }

    const exportBtn = page.getByRole('button', { name: /export/i }).first()
    if (await exportBtn.isVisible().catch(() => false)) {
      await exportBtn.click()
      await page.waitForTimeout(1000)
      if (
        await page
          .getByRole('dialog')
          .isVisible()
          .catch(() => false)
      ) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }

    await page.waitForTimeout(2000)
    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] full-workflow: "${e.text}"`)
    expect(errors, `Errors during full workflow:\n${errors.map((e) => e.text).join('\n')}`).toHaveLength(0)
  })

  test('Step 12: No hydration or undefined-property errors in any workflow', async ({ page }) => {
    await createProject(page, 'Hydration Check')
    await navigateToProject(page, 'Hydration Check')
    await uploadSbom(page, cycloneDxSample)
    await page.waitForTimeout(3000)

    const bad = messages.filter(
      (m) =>
        (m.type === 'error' || m.type === 'pageerror') &&
        (m.text.includes('hydration') ||
          m.text.includes('Text content did not match') ||
          m.text.includes('Cannot read properties of undefined') ||
          m.text.includes('Cannot read properties of null')),
    )
    expect(bad).toHaveLength(0)
  })
})
