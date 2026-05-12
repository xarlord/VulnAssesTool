import { setWorldConstructor, World } from '@cucumber/cucumber'
import { Browser, BrowserContext, Page, chromium } from 'playwright'

/**
 * Custom World class for Cucumber tests
 * Provides test context and shared state across scenarios
 */
export class CustomWorld extends World {
  // Browser and page instances
  public browser: Browser | null = null
  public context: BrowserContext | null = null
  public page: Page | null = null

  // Test data storage
  public testData: Map<string, any> = new Map()

  // Scenario state
  public scenarioState: Record<string, any> = {}

  // Error tracking
  public errors: Error[] = []

  // Screenshot storage
  public screenshots: string[] = []

  // Configuration
  public config: {
    baseURL: string
    timeout: number
    screenshots: boolean
    headless: boolean
  }

  constructor(options: any) {
    super(options)

    this.config = {
      baseURL: process.env.BASE_URL || 'http://localhost:5173',
      timeout: parseInt(process.env.TEST_TIMEOUT || '10000', 10),
      screenshots: process.env.SCREENSHOTS !== 'false',
      headless: process.env.HEADLESS !== 'false',
    }
  }

  /**
   * Initialize browser and page
   */
  async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        slowMo: 50, // Slow down actions for better visibility
      })
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: this.config.screenshots
          ? {
              dir: 'test-results/videos',
              size: { width: 1280, height: 720 },
            }
          : undefined,
      })
    }

    if (!this.page) {
      this.page = await this.context.newPage()
      this.page.setDefaultTimeout(this.config.timeout)
    }
  }

  /**
   * Navigate to a URL
   */
  async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized. Call initBrowser() first.')
    }
    await this.page.goto(url)
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(name: string): Promise<void> {
    if (!this.page || !this.config.screenshots) {
      return
    }

    const screenshotPath = `test-results/screenshots/${name}.png`
    await this.page.screenshot({ path: screenshotPath, fullPage: true })
    this.screenshots.push(screenshotPath)
  }

  /**
   * Store test data
   */
  public set(key: string, value: any): void {
    this.testData.set(key, value)
  }

  /**
   * Retrieve test data
   */
  public get(key: string): any {
    return this.testData.get(key)
  }

  /**
   * Check if test data exists
   */
  public has(key: string): boolean {
    return this.testData.has(key)
  }

  /**
   * Set scenario state
   */
  public setState(key: string, value: any): void {
    this.scenarioState[key] = value
  }

  /**
   * Get scenario state
   */
  public getState(key: string): any {
    return this.scenarioState[key]
  }

  /**
   * Add error to tracking
   */
  public addError(error: Error): void {
    this.errors.push(error)
  }

  /**
   * Check if there are any errors
   */
  public hasErrors(): boolean {
    return this.errors.length > 0
  }

  /**
   * Get all errors
   */
  public getErrors(): Error[] {
    return this.errors
  }

  /**
   * Clear errors
   */
  public clearErrors(): void {
    this.errors = []
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close()
      }
      if (this.context) {
        await this.context.close()
      }
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close()
      }
    } catch (error) {
      console.error('Error during cleanup:', error)
    } finally {
      this.page = null
      this.context = null
      this.browser = null
    }
  }

  /**
   * Reset scenario state
   */
  public reset(): void {
    this.testData.clear()
    this.scenarioState = {}
    this.errors = []
    this.screenshots = []
  }
}

// Set the custom world constructor
setWorldConstructor(CustomWorld)
