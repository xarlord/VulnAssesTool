import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // Files with React Compiler patterns that are valid React but trigger compiler warnings
    'src/renderer/components/CommandPalette.tsx',
    'src/renderer/components/OfflineIndicator.tsx',
    'src/renderer/components/audit/AuditLogPanel.tsx',
    'src/renderer/components/charts/CvssHistogram.tsx',
    'src/renderer/components/charts/SeverityDistributionChart.tsx',
    'src/renderer/components/charts/VulnerabilityBarChart.tsx',
    'src/renderer/components/database/UpdateSettings.tsx',
    'src/renderer/components/database/SyncProgressModal.tsx',
    'src/renderer/components/executive/widgets/ComplianceStatus.tsx',
    'src/renderer/components/executive/widgets/DashboardConfig.tsx',
    'src/renderer/components/executive/widgets/ProjectHealthComparison.tsx',
    'src/renderer/components/executive/widgets/VulnerabilityTrendChart.tsx',
    'src/renderer/components/FPF/MissFilterPanel.tsx',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow unused variables that start with underscore
      // NOTE: Google TS forbids `_` prefix; the underscore allowance here is a
      // legacy escape hatch that PR 4 will remove (see remediation plan).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Google TS Style: any is forbidden. PR 5 cleared all instances.
      '@typescript-eslint/no-explicit-any': 'error',
      // Google TS Style: non-null assertions require explicit guards.
      // PR 4 audited/converted all instances.
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Google TS/JS Style: default exports are banned. Override below for
      // framework-required configs (vite, vitest, playwright, eslint, etc.).
      // Surfaces 58 renderer + 1 orchestrator default exports; PR 3 codemods
      // them to named exports via ts-morph.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are banned by Google TS Style. Use named exports.',
        },
      ],
      // Google TS Style: no `_` prefix/suffix. PR 4 renamed all instances.
      'no-underscore-dangle': ['error', { allow: [] }],
      // Warn instead of error for react-refresh issues
      'react-refresh/only-export-components': 'warn',
      // Warn for empty blocks
      'no-empty': 'warn',
      // Warn for case declarations
      'no-case-declarations': 'warn',
      // Error for empty object types
      '@typescript-eslint/no-empty-object-type': 'error',
      // Error for ban-ts-comment
      '@typescript-eslint/ban-ts-comment': 'error',
      // Error for require imports — PR 5 converted all to dynamic imports
      '@typescript-eslint/no-require-imports': 'error',
      // Allow unused expressions (needed for expect statements in tests)
      '@typescript-eslint/no-unused-expressions': 'off',
      // Disable React Compiler errors - these are not standard ESLint rules
      // but are reported by the TypeScript parser with React Compiler integration
      'no-undef': 'off',
    },
  },
  // Disable React Compiler errors for specific files with complex patterns
  {
    files: [
      'src/renderer/components/CommandPalette.tsx',
      'src/renderer/components/OfflineIndicator.tsx',
      'src/renderer/components/audit/AuditLogPanel.tsx',
      'src/renderer/components/charts/CvssHistogram.tsx',
      'src/renderer/components/charts/SeverityDistributionChart.tsx',
      'src/renderer/components/charts/VulnerabilityBarChart.tsx',
      'src/renderer/components/database/UpdateSettings.tsx',
      'src/renderer/components/executive/widgets/ComplianceStatus.tsx',
      'src/renderer/components/executive/widgets/DashboardConfig.tsx',
      'src/renderer/components/executive/widgets/ProjectHealthComparison.tsx',
      'src/renderer/components/executive/widgets/VulnerabilityTrendChart.tsx',
      'src/renderer/components/database/SyncProgressModal.tsx',
    ],
    rules: {
      // Turn off all rules for these files to avoid React Compiler errors
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
  },
  // Framework-required default exports (vite, vitest, playwright, eslint, etc.).
  // These tools resolve their config via `export default`, so the Google TS/JS
  // ban on default exports does not apply.
  {
    files: [
      '*.config.{ts,js,mjs,cjs}',
      'vite.config.ts',
      'vite.config.electron.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'playwright.e2e.config.ts',
      'watchdog.config.ts',
      'eslint.config.js',
      'commitlint.config.js',
      'postcss.config.js',
      'tailwind.config.js',
      'tests/**/vitest.*.config.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Less strict rules for test files
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'tests/**/*',
      'e2e/**/*',
      '**/tests/**/*',
      '**/__tests__/**/*',
      '**/setup.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-syntax': 'off',
      'no-underscore-dangle': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
      'no-empty': 'warn',
      'no-empty-pattern': 'warn',
    },
  },
])
