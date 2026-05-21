import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SUPPRESSION_RULES,
  matchSuppressionRule,
  matchCPEPattern,
  getMatchingDefaultRules,
  validateSuppressionRule,
  createSuppressionRule,
} from './defaultRules'
import type { SuppressionRule } from '../../../../shared/types/fpf'

describe('DEFAULT_SUPPRESSION_RULES', () => {
  it('contains a non-empty array of rules', () => {
    expect(DEFAULT_SUPPRESSION_RULES.length).toBeGreaterThan(0)
  })

  it('every rule has required fields', () => {
    for (const rule of DEFAULT_SUPPRESSION_RULES) {
      expect(rule.id).toBeTruthy()
      expect(rule.cpePattern).toMatch(/^cpe:2\.3:/)
      expect(rule.reason).toBeTruthy()
      expect(rule.severityLimit.length).toBeGreaterThan(0)
    }
  })

  it('every rule has a unique id', () => {
    const ids = DEFAULT_SUPPRESSION_RULES.map((r) => r.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('matchCPEPattern', () => {
  it('matches exact CPE string', () => {
    const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
    const pattern = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(true)
  })

  it('matches wildcard parts', () => {
    const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*'
    const pattern = 'cpe:2.3:*:*:openssl:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(true)
  })

  it('returns false when a non-wildcard part mismatches', () => {
    const cpe = 'cpe:2.3:a:apache:http_server:2.4:*:*:*:*:*:*:*'
    const pattern = 'cpe:2.3:a:nginx:nginx:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(false)
  })

  it('returns false when pattern has fewer than 4 parts', () => {
    const cpe = 'cpe:2.3:a:openssl'
    const pattern = 'cpe:2.3'
    expect(matchCPEPattern(cpe, pattern)).toBe(false)
  })

  it('returns false when CPE is shorter than pattern', () => {
    const cpe = 'cpe:2.3:a:openssl'
    const pattern = 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(false)
  })

  it('matches when CPE is longer than pattern (extra parts ignored)', () => {
    const cpe = 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*:extra'
    const pattern = 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(true)
  })

  it('requires exact case match (normalization done by caller)', () => {
    // matchCPEPattern does NOT normalize; matchSuppressionRule normalizes before calling
    const cpe = 'CPE:2.3:A:APACHE:HTTP_SERVER:*:*:*:*:*:*:*'
    const pattern = 'cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(false)
  })

  it('matches when both CPE and pattern are already lowercased', () => {
    const cpe = 'cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*'
    const pattern = 'cpe:2.3:a:apache:http_server:*:*:*:*:*:*:*'
    expect(matchCPEPattern(cpe, pattern)).toBe(true)
  })
})

describe('matchSuppressionRule', () => {
  const baseRule: SuppressionRule = {
    id: 'TEST-001',
    cpePattern: 'cpe:2.3:*:*:openssl:*:*:*:*:*:*:*',
    reason: 'Test rule',
    severityLimit: ['medium', 'low'],
  }

  it('returns false for empty CPE string', () => {
    expect(matchSuppressionRule(baseRule, '', 'medium')).toBe(false)
  })

  it('returns false when severity is not in severityLimit', () => {
    expect(matchSuppressionRule(baseRule, 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*', 'critical')).toBe(false)
  })

  it('returns false when severity is not in severityLimit (high)', () => {
    expect(matchSuppressionRule(baseRule, 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*', 'high')).toBe(false)
  })

  it('returns true when CPE matches and severity is allowed (medium)', () => {
    expect(matchSuppressionRule(baseRule, 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*', 'medium')).toBe(true)
  })

  it('returns true when CPE matches and severity is allowed (low)', () => {
    expect(matchSuppressionRule(baseRule, 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*', 'low')).toBe(true)
  })

  it('returns false when CPE does not match pattern', () => {
    expect(matchSuppressionRule(baseRule, 'cpe:2.3:a:nginx:nginx:*:*:*:*:*:*:*', 'medium')).toBe(false)
  })

  it('returns false for "none" severity', () => {
    expect(matchSuppressionRule(baseRule, 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*', 'none')).toBe(false)
  })

  it('matches rules with "high" in severityLimit', () => {
    const highRule: SuppressionRule = {
      ...baseRule,
      severityLimit: ['high', 'medium', 'low'],
    }
    expect(matchSuppressionRule(highRule, 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*', 'high')).toBe(true)
  })
})

describe('getMatchingDefaultRules', () => {
  it('returns rules matching an OpenSSL CPE', () => {
    const matches = getMatchingDefaultRules('cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*')
    expect(matches.length).toBeGreaterThan(0)
    for (const rule of matches) {
      expect(rule.cpePattern).toContain('openssl')
    }
  })

  it('returns empty array for non-matching CPE', () => {
    const matches = getMatchingDefaultRules('cpe:2.3:a:nonexistent:product:1.0:*:*:*:*:*:*:*')
    expect(matches).toEqual([])
  })

  it('returns empty array for empty CPE', () => {
    const matches = getMatchingDefaultRules('')
    expect(matches).toEqual([])
  })

  it('matches ethernet-related CPEs', () => {
    const matches = getMatchingDefaultRules('cpe:2.3:*:*:ethernet:*:*:*:*:*:*:*')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('matches bluetooth CPEs', () => {
    const matches = getMatchingDefaultRules('cpe:2.3:*:*:bluetooth:*:*:*:*:*:*:*')
    expect(matches.length).toBeGreaterThan(0)
  })
})

describe('validateSuppressionRule', () => {
  it('validates a correct rule', () => {
    const rule: SuppressionRule = {
      id: 'VALID-001',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: 'Valid reason',
      severityLimit: ['medium', 'low'],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('catches empty ID', () => {
    const rule: SuppressionRule = {
      id: '',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: 'Reason',
      severityLimit: ['medium'],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Rule ID is required')
  })

  it('catches whitespace-only ID', () => {
    const rule: SuppressionRule = {
      id: '   ',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: 'Reason',
      severityLimit: ['medium'],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Rule ID is required')
  })

  it('catches empty CPE pattern', () => {
    const rule: SuppressionRule = {
      id: 'RULE-001',
      cpePattern: '',
      reason: 'Reason',
      severityLimit: ['medium'],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('CPE pattern is required')
  })

  it('catches invalid CPE pattern format', () => {
    const rule: SuppressionRule = {
      id: 'RULE-001',
      cpePattern: 'invalid-pattern',
      reason: 'Reason',
      severityLimit: ['medium'],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('CPE pattern must start with "cpe:2.3:"')
  })

  it('catches empty reason', () => {
    const rule: SuppressionRule = {
      id: 'RULE-001',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: '',
      severityLimit: ['medium'],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Reason is required')
  })

  it('catches empty severityLimit', () => {
    const rule: SuppressionRule = {
      id: 'RULE-001',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: 'Reason',
      severityLimit: [],
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('At least one severity must be specified in severityLimit')
  })

  it('catches invalid expiration date', () => {
    const rule: SuppressionRule = {
      id: 'RULE-001',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: 'Reason',
      severityLimit: ['medium'],
      expires: 'not-a-date',
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Invalid expiration date format')
  })

  it('accepts valid expiration date', () => {
    const rule: SuppressionRule = {
      id: 'RULE-001',
      cpePattern: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      reason: 'Reason',
      severityLimit: ['medium'],
      expires: '2025-12-31',
    }
    const result = validateSuppressionRule(rule)
    expect(result.valid).toBe(true)
  })

  it('collects multiple errors at once', () => {
    const rule = {
      id: '',
      cpePattern: '',
      reason: '',
      severityLimit: [] as ('critical' | 'high' | 'medium' | 'low')[],
    }
    const result = validateSuppressionRule(rule as SuppressionRule)
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })
})

describe('createSuppressionRule', () => {
  it('creates a rule with required fields', () => {
    const rule = createSuppressionRule('RULE-001', 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*', 'Test reason', [
      'medium',
      'low',
    ])

    expect(rule.id).toBe('RULE-001')
    expect(rule.cpePattern).toBe('cpe:2.3:a:vendor:product:*:*:*:*:*:*:*')
    expect(rule.reason).toBe('Test reason')
    expect(rule.severityLimit).toEqual(['medium', 'low'])
  })

  it('includes optional fields when provided', () => {
    const rule = createSuppressionRule(
      'RULE-001',
      'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*',
      'Test reason',
      ['medium'],
      {
        expires: '2025-12-31',
        approvedBy: 'admin',
        notes: 'Some notes',
      },
    )

    expect(rule.expires).toBe('2025-12-31')
    expect(rule.approvedBy).toBe('admin')
    expect(rule.notes).toBe('Some notes')
  })

  it('does not include optional fields when not provided', () => {
    const rule = createSuppressionRule('RULE-001', 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*', 'Test reason', ['medium'])

    expect(rule.expires).toBeUndefined()
    expect(rule.approvedBy).toBeUndefined()
    expect(rule.notes).toBeUndefined()
  })
})
