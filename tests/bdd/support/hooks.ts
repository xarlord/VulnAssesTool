import { Before, After, BeforeAll, AfterAll, BeforeStep, AfterStep } from '@cucumber/cucumber'
import { CustomWorld } from './world'

// Test database file paths
const TEST_DB_FILES = ['test-hybrid-scanner.db', 'test-nvd-data.db', 'test-query-builder.db']

/**
 * BeforeAll hook - Runs once before all scenarios
 */
BeforeAll(async () => {
  console.log('\n=== Starting Cucumber Test Suite ===')
  console.log(`Test environment: ${process.env.NODE_ENV || 'test'}`)
  console.log(`Base URL: ${process.env.BASE_URL || 'http://localhost:5173'}`)
  console.log(`Parallel execution: ${process.env.CUCUMBER_PARALLEL === 'true' ? 'enabled' : 'disabled'}`)
})

/**
 * AfterAll hook - Runs once after all scenarios
 */
AfterAll(async () => {
  console.log('\n=== Cucumber Test Suite Completed ===')

  // Cleanup test databases
  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    for (const dbFile of TEST_DB_FILES) {
      const dbPath = path.join(process.cwd(), dbFile)
      try {
        await fs.unlink(dbPath)
        console.log(`Cleaned up test database: ${dbFile}`)
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to delete ${dbFile}:`, error.message)
        }
      }
    }
  } catch (error) {
    console.warn('Error during database cleanup:', error)
  }
})

/**
 * Before hook - Runs before each scenario
 */
Before(async function (this: CustomWorld, scenario: any) {
  console.log(`\n--- Starting Scenario: ${scenario.pickle.name} ---`)

  // Initialize browser if needed
  try {
    await this.initBrowser()
  } catch (error) {
    console.error('Failed to initialize browser:', error)
    throw error
  }

  // Store scenario information
  this.setState('scenarioName', scenario.pickle.name)
  this.setState('featureName', scenario.gherkinDocument.feature?.name || 'Unknown')

  // Store tags
  const tags = scenario.pickle.tags?.map((tag: any) => tag.name) || []
  this.setState('tags', tags)

  // Check if this is a failing scenario being retried
  if (tags.includes('@retry')) {
    console.log('This scenario is marked for retry')
  }

  // Clean up test databases before each scenario
  try {
    const fs = await import('fs/promises')
    const path = await import('path')

    for (const dbFile of TEST_DB_FILES) {
      const dbPath = path.join(process.cwd(), dbFile)
      try {
        await fs.unlink(dbPath)
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to delete ${dbFile}:`, error.message)
        }
      }
    }
  } catch (error) {
    console.warn('Error during database cleanup:', error)
  }
})

/**
 * After hook - Runs after each scenario
 */
After(async function (this: CustomWorld, scenario: any) {
  const scenarioName = this.getState('scenarioName')

  // Take screenshot if scenario failed
  if (scenario.result?.status === 'FAILED') {
    console.error(`❌ Scenario failed: ${scenarioName}`)

    try {
      await this.takeScreenshot(`failed-${scenarioName.replace(/\s+/g, '-')}`)
      console.log('Screenshot saved for failed scenario')
    } catch (error) {
      console.warn('Failed to take screenshot:', error)
    }

    // Log errors
    if (this.hasErrors()) {
      console.error('Scenario errors:', this.getErrors())
    }
  } else {
    console.log(`✅ Scenario passed: ${scenarioName}`)
  }

  // Clean up resources
  try {
    await this.cleanup()
  } catch (error) {
    console.error('Error during cleanup:', error)
  }

  // Reset world state
  this.reset()
})

/**
 * BeforeStep hook - Runs before each step
 */
BeforeStep(async function (this: CustomWorld, step: any) {
  const stepText = step.pickleStep.text
  console.log(`  → Executing: ${stepText}`)

  // Set timeout based on tags
  const tags = this.getState('tags') || []
  if (tags.includes('@slow')) {
    step.pickleStep.setTimeout(60000) // 60 seconds for slow tests
  } else if (tags.includes('@very-slow')) {
    step.pickleStep.setTimeout(120000) // 2 minutes for very slow tests
  }
})

/**
 * AfterStep hook - Runs after each step
 */
AfterStep(async function (this: CustomWorld, step: any) {
  const stepText = step.pickleStep.text

  // Log step result
  if (step.result?.status === 'PASSED') {
    console.log(`  ✓ Passed: ${stepText}`)
  } else if (step.result?.status === 'FAILED') {
    console.error(`  ✗ Failed: ${stepText}`)

    // Take screenshot of failed step
    if (this.config.screenshots) {
      try {
        await this.takeScreenshot(`step-${stepText.replace(/\s+/g, '-').substring(0, 50)}`)
      } catch (error) {
        console.warn('Failed to take screenshot for failed step:', error)
      }
    }

    // Add error to world
    if (step.result.message) {
      this.addError(new Error(step.result.message))
    }
  } else if (step.result?.status === 'PENDING') {
    console.log(`  ○ Pending: ${stepText}`)
  } else if (step.result?.status === 'SKIPPED') {
    console.log(`  - Skipped: ${stepText}`)
  }
})

/**
 * Before hook for scenarios tagged with @api
 * Sets up API test environment
 */
Before({ tags: '@api' }, async function (this: CustomWorld) {
  console.log('Setting up API test environment...')
  this.setState('apiBaseURL', process.env.API_BASE_URL || 'http://localhost:3000')
})

/**
 * Before hook for scenarios tagged with @ui
 * Ensures UI is ready
 */
Before({ tags: '@ui' }, async function (this: CustomWorld) {
  console.log('Setting up UI test environment...')

  // Wait for page to be ready
  if (this.page) {
    await this.page.waitForLoadState('networkidle')
  }
})

/**
 * Before hook for scenarios tagged with @database
 * Ensures database is ready
 */
Before({ tags: '@database' }, async function (this: CustomWorld) {
  console.log('Setting up database test environment...')

  // Initialize database if needed
  const Database = (await import('../../src/main/database/index.js')).default
  this.setState('database', Database)
})

/**
 * After hook for scenarios tagged with @api
 * Cleans up API resources
 */
After({ tags: '@api' }, async function (this: CustomWorld) {
  console.log('Cleaning up API resources...')
  // Add API cleanup logic here
})

/**
 * After hook for scenarios tagged with @database
 * Cleans up database resources
 */
After({ tags: '@database' }, async function (this: CustomWorld) {
  console.log('Cleaning up database resources...')

  const db = this.getState('database')
  if (db && db.close) {
    await db.close()
  }
})
