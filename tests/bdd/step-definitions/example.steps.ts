import { Given, When, Then, And } from '@cucumber/cucumber'
import { expect } from '@vitest/expect'
import { CustomWorld } from '../support/world'

// Example steps demonstrating the setup

Given('I have a working Cucumber setup', async function (this: CustomWorld) {
  // Verify World context is initialized
  expect(this).toBeDefined()
  expect(this.testData).toBeInstanceOf(Map)
})

Given('I have initialized the World context', async function (this: CustomWorld) {
  // Initialize browser for this test
  await this.initBrowser()
  expect(this.browser).toBeDefined()
})

When('I run a test scenario', async function (this: CustomWorld) {
  // Store some test data
  this.set('testKey', 'testValue')
})

When('I store data in the World', async function (this: CustomWorld) {
  this.set('user', { name: 'Test User', email: 'test@example.com' })
  this.setState('initialized', true)
})

Then('the test should pass successfully', async function (this: CustomWorld) {
  expect(this.has('testKey')).toBe(true)
  expect(this.get('testKey')).toBe('testValue')
})

Then('I should be able to retrieve the data', async function (this: CustomWorld) {
  const user = this.get('user')
  expect(user).toBeDefined()
  expect(user.name).toBe('Test User')
  expect(user.email).toBe('test@example.com')

  const initialized = this.getState('initialized')
  expect(initialized).toBe(true)
})

And('the World should be cleaned up after the scenario', async function (this: CustomWorld) {
  // This will be verified in the After hook
  expect(this.screenshots).toBeDefined()
  expect(Array.isArray(this.screenshots)).toBe(true)
})
