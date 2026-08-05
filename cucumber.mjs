// Cucumber-js configuration (NFR-08.4). The project is ESM ("type":"module") and
// the step definitions are TypeScript, so this is run through tsx (see the
// "test:bdd" script) which transpiles the .ts step/support files cucumber imports.
export default {
  paths: ['tests/bdd/features/**/*.feature'],
  import: ['tests/bdd/support/**/*.ts', 'tests/bdd/step-definitions/**/*.ts'],
  format: ['summary', 'progress'],
  formatOptions: { snippetInterface: 'async-await' },
}
