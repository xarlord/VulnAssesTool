/**
 * Playwright global setup.
 *
 * Build + port cleanup + DB seeding live in scripts/e2e-prepare.mjs, which the
 * test:e2e* npm scripts run BEFORE `playwright test`. They cannot live here:
 * Playwright's webServer lifecycle interleaves with globalSetup, so killing
 * ports or rebuilding from inside it races the server it is about to use.
 */
async function globalSetup() {
  console.log('=== E2E Global Setup ===')
  console.log('Express server is started by the Playwright webServer config;')
  console.log('build/seed/port-cleanup ran via scripts/e2e-prepare.mjs (npm test:e2e*).')
  return undefined
}

export default globalSetup
