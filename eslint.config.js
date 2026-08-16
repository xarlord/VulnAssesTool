import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    // Generated coverage reports (istanbul HTML/JS) — build artifacts, never linted.
    'coverage',
    // Claude Code workflow graphs run in the Workflow sandbox (top-level return/await),
    // not as ESM modules — linting them as modules is a parse error. They are tooling,
    // like the config files, so they're exempt from the app lint (see .claude/workflows/).
    '.claude/**',
    // Files with React Compiler patterns that are valid React but trigger compiler warnings
    'src/renderer/components/CommandPalette.tsx',
    'src/renderer/components/OfflineIndicator.tsx',
    'src/renderer/components/audit/AuditLogPanel.tsx',
    'src/renderer/components/charts/CvssHistogram.tsx',
    'src/renderer/components/charts/SeverityDistributionChart.tsx',
    'src/renderer/components/charts/VulnerabilityBarChart.tsx',
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
      'src/renderer/components/executive/widgets/ComplianceStatus.tsx',
      'src/renderer/components/executive/widgets/DashboardConfig.tsx',
      'src/renderer/components/executive/widgets/ProjectHealthComparison.tsx',
      'src/renderer/components/executive/widgets/VulnerabilityTrendChart.tsx',
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
      'vitest.config.ts',
      'playwright.config.ts',
      'playwright.e2e.config.ts',
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
  // i18n guardrail (Phase 3 → Internationalization). Files migrated to i18next must stay
  // literal-free: every visible element text goes through t(), so a hardcoded string is a
  // regression. eslint-plugin-i18next isn't installed (no clean ESLint-9 flat-config support at
  // this pin), so this is the design's documented zero-dependency fallback — a JSXText selector
  // that flags element text containing letters (whitespace/punctuation like the "/" breadcrumb
  // separator are allowed). It deliberately does NOT cover string attributes (aria-label/title),
  // which are already t()'d in the shell; that's an accepted gap for the fallback. Re-declares the
  // default-export ban because flat config replaces (not merges) a rule's options. Each future i18n
  // slice appends its path here. See docs/plans/2026-08-09-i18n-baseline-design.md.
  {
    files: [
      'src/renderer/components/shell/**/*.{ts,tsx}',
      // i18n full-app rollout — migrated slices (each batch appends its files here).
      'src/renderer/App.tsx',
      'src/renderer/components/AppLogo.tsx',
      'src/renderer/components/BinarySbomDialog.tsx',
      'src/renderer/components/CPEMatchDialog.tsx',
      'src/renderer/components/ComplianceReportDialog.tsx',
      'src/renderer/components/ComponentVulnerabilitiesPopup.tsx',
      'src/renderer/components/audit/AuditExportDialog.tsx',
      'src/renderer/components/audit/EventDiffViewer.tsx',
      'src/renderer/components/ErrorBoundary.tsx',
      'src/renderer/components/ContainerScanDialog.tsx',
      'src/renderer/components/CreateProfileDialog.tsx',
      'src/renderer/components/CreateProjectDialog.tsx',
      'src/renderer/components/EmptyState.tsx',
      'src/renderer/components/cvss/CvssMetricsGrid.tsx',
      'src/renderer/components/cvss/CvssScoreGauge.tsx',
      'src/renderer/components/cvss/CvssVectorString.tsx',
      'src/renderer/components/executive/widgets/ActionItems.tsx',
      'src/renderer/components/CommandPalette.tsx',
      'src/renderer/components/executive/ExecutiveDashboard.tsx',
      'src/renderer/components/executive/widgets/DashboardLayoutEditor.tsx',
      'src/renderer/components/executive/widgets/RiskGauge.tsx',
      'src/renderer/components/executive/widgets/TopCriticalVulnerabilities.tsx',
      'src/renderer/components/executive/widgets/TeamProductivity.tsx',
      'src/renderer/components/ExportDialog.tsx',
      'src/renderer/components/FilterPresets.tsx',
      'src/renderer/components/FPF/ConfigWizard.tsx',
      'src/renderer/components/FPF/FilterDashboard.tsx',
      'src/renderer/components/FPF/FilteredItemsReview.tsx',
      'src/renderer/components/graph/DependencyGraph.tsx',
      'src/renderer/components/HealthDashboard.tsx',
      'src/renderer/components/HealthDistributionChart.tsx',
      'src/renderer/components/HealthTrendChart.tsx',
      'src/renderer/components/LicenseComplianceCard.tsx',
      'src/renderer/components/NotificationCenter.tsx',
      'src/renderer/components/NvdCveDetailModal.tsx',
      'src/renderer/components/onboarding/OnboardingTour.tsx',
      'src/renderer/components/patch/PatchLinkCard.tsx',
      'src/renderer/components/patch/RemediationSteps.tsx',
      'src/renderer/components/ProjectCard.tsx',
      'src/renderer/components/RemediationQueue.tsx',
      'src/renderer/components/SbomGeneratorDialog.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are banned by Google TS Style. Use named exports.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z]/]',
          message:
            'Hardcoded UI text in an i18n-migrated file. Use t(...) and add the string to its lib/i18n/locales/en/<ns>.json.',
        },
      ],
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
