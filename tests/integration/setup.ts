/**
 * Integration Test Setup
 *
 * This setup file is for integration tests that run in Node environment
 * and use real data files from fixtures.
 */

import { beforeEach, vi } from 'vitest'

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
})

// Console methods - keep original for debugging integration tests
global.console = {
  ...console,
}
