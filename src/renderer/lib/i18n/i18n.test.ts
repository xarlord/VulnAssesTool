/**
 * Tests for the i18n baseline (Phase 3 → Internationalization).
 *
 * WHY these tests matter: they pin the translation pipeline's contract that the rest of the
 * app depends on — the singleton initializes synchronously in English, namespaced keys resolve
 * to their exact English strings, and a miss degrades to a string (never null/undefined) so a
 * typo'd key can never blank a label at runtime. The exact-string assertions also guard the
 * migration invariant: extracted English must match the old hardcoded text byte-for-byte, so
 * existing component tests that query by visible text keep passing.
 */

import { describe, it, expect } from 'vitest'
import { i18n } from '@/lib/i18n'

describe('i18n baseline', () => {
  it('initializes synchronously in English', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.language).toBe('en')
  })

  it('resolves shell-namespace keys to their exact English strings', () => {
    expect(i18n.t('shell:nav.dashboard')).toBe('Dashboard')
    expect(i18n.t('shell:nav.auditLog')).toBe('Audit Log')
    expect(i18n.t('shell:nav.falsePositives')).toBe('False Positives')
    expect(i18n.t('shell:theme.system')).toBe('System')
  })

  it('returns a string (never null) and echoes the key on a miss', () => {
    const missing = i18n.t('shell:nav.__does_not_exist__')
    expect(typeof missing).toBe('string')
    expect(missing).toContain('__does_not_exist__')
  })
})
