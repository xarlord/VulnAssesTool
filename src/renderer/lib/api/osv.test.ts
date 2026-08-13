import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  queryByPurl,
  getVulnerabilityById,
  queryByPurls,
  batchQuery,
  parsePurl,
  buildPurl,
  isValidPurl,
  checkOsvApiStatus,
} from './osv'
import type { OsvVulnerability } from '@@/types'

vi.mock('@@/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@@/constants')>()
  return {
    ...actual,
    OSV_API_BASE_URL: 'https://api.osv.dev/v1',
  }
})

vi.mock('./nvd', () => ({
  getCveById: vi.fn(),
}))

import { getCveById } from './nvd'
import { getStoredToken } from '@/lib/platform/httpClient'

global.fetch = vi.fn()

describe('parsePurl', () => {
  it('should parse valid npm package URL', () => {
    const result = parsePurl('pkg:npm/lodash@4.17.21')
    expect(result).toEqual({
      ecosystem: 'npm',
      name: 'lodash',
      version: '4.17.21',
    })
  })

  it('should parse valid PyPI package URL without version', () => {
    const result = parsePurl('pkg:pypi/django')
    expect(result).toEqual({
      ecosystem: 'pypi',
      name: 'django',
      version: undefined,
    })
  })

  it('should parse package URL with namespace', () => {
    const result = parsePurl('pkg:npm/@babel/core@7.23.0')
    expect(result).toEqual({
      ecosystem: 'npm',
      name: '@babel/core',
      version: '7.23.0',
    })
  })

  it('should return null for invalid PURL', () => {
    expect(parsePurl('not-a-purl')).toBeNull()
    expect(parsePurl('')).toBeNull()
    expect(parsePurl('npm/lodash')).toBeNull()
  })
})

describe('buildPurl', () => {
  it('should build PURL with version', () => {
    expect(buildPurl('npm', 'lodash', '4.17.21')).toBe('pkg:npm/lodash@4.17.21')
  })

  it('should build PURL without version', () => {
    expect(buildPurl('pypi', 'django')).toBe('pkg:pypi/django')
  })

  it('should handle scoped package names', () => {
    expect(buildPurl('npm', '@babel/core', '7.23.0')).toBe('pkg:npm/@babel/core@7.23.0')
  })
})

describe('isValidPurl', () => {
  it('should return true for valid PURLs', () => {
    expect(isValidPurl('pkg:npm/lodash@4.17.21')).toBe(true)
    expect(isValidPurl('pkg:pypi/django')).toBe(true)
    expect(isValidPurl('pkg:golang/github.com/gorilla/mux@1.8.0')).toBe(true)
  })

  it('should return false for invalid PURLs', () => {
    expect(isValidPurl('not-a-purl')).toBe(false)
    expect(isValidPurl('')).toBe(false)
    expect(isValidPurl('npm/lodash@4.17.21')).toBe(false)
  })
})

describe('queryByPurl', () => {
  const mockOsvVulns: OsvVulnerability[] = [
    {
      id: 'OSV-2024-1001',
      summary: 'Test vulnerability 1',
      details: 'Detailed description of vulnerability 1',
      published: '2024-01-01T00:00:00.000Z',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [
        {
          package: {
            name: 'lodash',
            ecosystem: 'npm',
            purl: 'pkg:npm/lodash@4.17.21',
          },
          ranges: [
            {
              type: 'SEMVER',
              events: [{ introduced: '0' }, { fixed: '4.17.22' }],
            },
          ],
        },
      ],
      severity: [
        {
          type: 'CVSS_V3',
          score: '9.8',
        },
      ],
      references: [
        {
          type: 'ADVISORY',
          url: 'https://example.com/advisory1',
        },
      ],
    },
    {
      id: 'OSV-2024-1002',
      details: 'Detailed description of vulnerability 2',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [
        {
          package: {
            name: 'lodash',
            ecosystem: 'npm',
            purl: 'pkg:npm/lodash@4.17.21',
          },
          ranges: [
            {
              type: 'SEMVER',
              events: [{ introduced: '4.17.0' }, { fixed: '4.17.20' }],
            },
          ],
        },
      ],
      severity: [
        {
          type: 'CVSS_V3',
          score: '5.3',
        },
      ],
      references: [],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return vulnerabilities for valid PURL', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: mockOsvVulns,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('OSV-2024-1001')
    expect(result[0].severity).toBe('critical')
    expect(result[0].cvssScore).toBe(9.8)
    expect(result[1].id).toBe('OSV-2024-1002')
    expect(result[1].severity).toBe('medium')
  })

  it('should return empty array when no vulnerabilities found', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/safe-package@1.0.0')

    expect(result).toEqual([])
  })

  it('should throw error for API error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await expect(queryByPurl('pkg:npm/lodash@4.17.21')).rejects.toThrow('OSV API error: 500')
  })

  it('should use summary over details for description', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [mockOsvVulns[0]],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result[0].description).toBe('Test vulnerability 1')
  })

  it('should use details when summary is not available', async () => {
    const vulnWithoutSummary: OsvVulnerability = {
      ...mockOsvVulns[0],
      summary: undefined,
    }

    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [vulnWithoutSummary],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result[0].description).toBe('Detailed description of vulnerability 1')
  })

  it('should map references correctly', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [mockOsvVulns[0]],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result[0].references).toHaveLength(1)
    expect(result[0].references[0].source).toBe('OSV')
    expect(result[0].references[0].url).toBe('https://example.com/advisory1')
    expect(result[0].references[0].tags).toEqual(['ADVISORY'])
  })

  it('should handle low severity (score > 0 and < 4.0)', async () => {
    const lowSeverityVuln: OsvVulnerability = {
      id: 'OSV-2024-1003',
      details: 'Low severity vulnerability',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [
        {
          package: {
            name: 'lodash',
            ecosystem: 'npm',
            purl: 'pkg:npm/lodash@4.17.21',
          },
          ranges: [],
        },
      ],
      severity: [
        {
          type: 'CVSS_V3',
          score: '3.5',
        },
      ],
      references: [],
    }

    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [lowSeverityVuln],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result[0].severity).toBe('low')
    expect(result[0].cvssScore).toBe(3.5)
  })

  it('should re-throw non-Error exceptions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('string error')

    await expect(queryByPurl('pkg:npm/lodash@4.17.21')).rejects.toEqual('string error')
  })

  it('should handle NaN score', async () => {
    const nanScoreVuln: OsvVulnerability = {
      id: 'OSV-2024-1004',
      details: 'Vulnerability with invalid score',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [
        {
          package: {
            name: 'lodash',
            ecosystem: 'npm',
            purl: 'pkg:npm/lodash@4.17.21',
          },
          ranges: [],
        },
      ],
      severity: [
        {
          type: 'CVSS_V3',
          score: 'invalid',
        },
      ],
      references: [],
    }

    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [nanScoreVuln],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result[0].severity).toBe('none')
    expect(result[0].cvssScore).toBeUndefined()
  })

  it('should handle references without type', async () => {
    const refWithoutType: OsvVulnerability = {
      id: 'OSV-2024-1005',
      details: 'Vulnerability with reference without type',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [
        {
          package: {
            name: 'lodash',
            ecosystem: 'npm',
            purl: 'pkg:npm/lodash@4.17.21',
          },
          ranges: [],
        },
      ],
      references: [
        {
          url: 'https://example.com/advisory',
          // type is undefined
        },
      ],
    }

    const mockResponse = {
      ok: true,
      json: async () => ({
        vulns: [refWithoutType],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result[0].references).toHaveLength(1)
    expect(result[0].references[0].tags).toEqual([])
  })
})

describe('getVulnerabilityById', () => {
  const mockOsvVuln: OsvVulnerability = {
    id: 'OSV-2024-1001',
    summary: 'Test vulnerability',
    details: 'Detailed description',
    published: '2024-01-01T00:00:00.000Z',
    modified: '2024-01-02T00:00:00.000Z',
    affected: [
      {
        package: {
          name: 'lodash',
          ecosystem: 'npm',
          purl: 'pkg:npm/lodash@4.17.21',
        },
        ranges: [
          {
            type: 'SEMVER',
            events: [{ introduced: '0' }, { fixed: '4.17.22' }],
          },
        ],
      },
    ],
    severity: [
      {
        type: 'CVSS_V3',
        score: '7.5',
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return vulnerability for valid ID', async () => {
    const mockResponse = {
      ok: true,
      json: async () => mockOsvVuln,
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await getVulnerabilityById('OSV-2024-1001')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('OSV-2024-1001')
    expect(result?.severity).toBe('high')
    expect(result?.cvssScore).toBe(7.5)
  })

  it('should return null for 404 response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await getVulnerabilityById('OSV-9999-9999')

    expect(result).toBeNull()
  })

  it('should throw error for API error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await expect(getVulnerabilityById('OSV-2024-1001')).rejects.toThrow('OSV API error: 500')
  })

  it('should re-throw non-Error exceptions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('string error')

    await expect(getVulnerabilityById('OSV-2024-1001')).rejects.toEqual('string error')
  })
})

describe('queryByPurls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should query multiple PURLs and return map', async () => {
    const mockVulns1 = [
      {
        id: 'OSV-2024-1001',
        modified: '2024-01-02T00:00:00.000Z',
        affected: [{ package: { ecosystem: 'npm', name: 'lodash', purl: 'pkg:npm/lodash@4.17.21' } }],
      },
    ]

    // Mock different responses for each PURL
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vulns: mockVulns1 }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vulns: [] }),
      } as unknown as Response)

    const purls = ['pkg:npm/lodash@4.17.21', 'pkg:npm/express@4.18.0']

    const result = await queryByPurls(purls)

    expect(result.size).toBe(2)
    expect(result.get(purls[0])).toHaveLength(1)
    expect(result.get(purls[1])).toEqual([])
  })

  it('should handle errors for individual PURLs', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
    } as Response

    vi.mocked(fetch).mockResolvedValue(mockResponse)

    const purls = ['pkg:npm/lodash@4.17.21']

    const result = await queryByPurls(purls)

    expect(result.size).toBe(1)
    expect(result.get(purls[0])).toEqual([])
  })
})

describe('batchQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should query multiple PURLs and return unique vulnerabilities', async () => {
    const mockVulns1 = [
      {
        id: 'OSV-2024-1001',
        modified: '2024-01-02T00:00:00.000Z',
        affected: [{ package: { ecosystem: 'npm', name: 'lodash', purl: 'pkg:npm/lodash@4.17.21' } }],
      },
    ]

    const mockVulns2 = [
      {
        id: 'OSV-2024-1002',
        modified: '2024-01-02T00:00:00.000Z',
        affected: [{ package: { ecosystem: 'npm', name: 'express', purl: 'pkg:npm/express@4.18.0' } }],
      },
    ]

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: mockVulns1 }),
    } as unknown as Response)

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: mockVulns2 }),
    } as unknown as Response)

    const purls = ['pkg:npm/lodash@4.17.21', 'pkg:npm/express@4.18.0']

    const result = await batchQuery(purls)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('OSV-2024-1001')
    expect(result[1].id).toBe('OSV-2024-1002')
  })

  it('should deduplicate vulnerabilities found in multiple packages', async () => {
    const mockVuln = {
      id: 'OSV-2024-1001',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { ecosystem: 'npm', name: 'test', purl: 'pkg:npm/test@1.0.0' } }],
    }

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ vulns: [mockVuln] }),
    } as unknown as Response)

    const purls = ['pkg:npm/test1@1.0.0', 'pkg:npm/test2@1.0.0']

    const result = await batchQuery(purls)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('OSV-2024-1001')
  })

  it('should handle errors for individual PURLs', async () => {
    // Mock one success and one failure
    const mockVuln = {
      id: 'OSV-2024-1001',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { ecosystem: 'npm', name: 'test', purl: 'pkg:npm/test@1.0.0' } }],
    }

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vulns: [mockVuln] }),
      } as unknown as Response)
      .mockRejectedValueOnce(new Error('Network error'))

    const purls = ['pkg:npm/test1@1.0.0', 'pkg:npm/test2@1.0.0']

    const result = await batchQuery(purls)

    // Should return the one successful result
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('OSV-2024-1001')
  })
})

describe('checkOsvApiStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when API is accessible', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        id: 'OSV-2024-1234',
        modified: '2024-01-01T00:00:00.000Z',
        affected: [],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await checkOsvApiStatus()

    expect(result).toBe(true)
  })

  it('should return true even when vulnerability not found (404)', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await checkOsvApiStatus()

    expect(result).toBe(true)
  })

  it('should return false on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const result = await checkOsvApiStatus()

    expect(result).toBe(false)
  })
})

describe('extractCvssScore via queryByPurl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should parse CVSS vector string with scope changed', async () => {
    const vectorVuln: OsvVulnerability = {
      id: 'OSV-2024-CVSS1',
      details: 'Vector test',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [
        {
          type: 'CVSS_V3',
          score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
        },
      ],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [vectorVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBeGreaterThan(0)
    expect(result[0].cvssVector).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H')
  })

  it('should parse CVSS vector string with scope unchanged', async () => {
    const vectorVuln: OsvVulnerability = {
      id: 'OSV-2024-CVSS2',
      details: 'Scope unchanged',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [
        {
          type: 'CVSS_V3',
          score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        },
      ],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [vectorVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBeGreaterThan(0)
  })

  it('should handle CVSS vector with zero impact', async () => {
    const zeroImpactVuln: OsvVulnerability = {
      id: 'OSV-2024-CVSS3',
      details: 'Zero impact',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [
        {
          type: 'CVSS_V3',
          score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N',
        },
      ],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [zeroImpactVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBe(0)
    expect(result[0].severity).toBe('none')
  })

  it('should handle score > 10 as null (not a valid numeric score)', async () => {
    const outOfRange: OsvVulnerability = {
      id: 'OSV-2024-RANGE',
      details: 'Out of range',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [{ type: 'CVSS_V3', score: '15.0' }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [outOfRange] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].severity).toBe('none')
    expect(result[0].cvssScore).toBeUndefined()
  })

  it('should handle score of exactly 0', async () => {
    const zeroScore: OsvVulnerability = {
      id: 'OSV-2024-ZERO',
      details: 'Zero score',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [{ type: 'CVSS_V3', score: '0' }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [zeroScore] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBe(0)
    expect(result[0].severity).toBe('none')
  })

  it('should prefer CVSS_V3 over other severity types', async () => {
    const multiSeverity: OsvVulnerability = {
      id: 'OSV-2024-MULTI',
      details: 'Multi severity',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [
        { type: 'OTHER', score: '1.0' },
        { type: 'CVSS_V3', score: '8.5' },
      ],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [multiSeverity] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBe(8.5)
    expect(result[0].severity).toBe('high')
  })

  it('should handle no severity data', async () => {
    const noSeverity: OsvVulnerability = {
      id: 'OSV-2024-NOSEV',
      details: 'No severity',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [noSeverity] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].severity).toBe('none')
    expect(result[0].cvssScore).toBeUndefined()
  })

  it('should handle empty severity array', async () => {
    const emptySeverity: OsvVulnerability = {
      id: 'OSV-2024-EMPTYSEV',
      details: 'Empty severity',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [emptySeverity] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].severity).toBe('none')
  })
})

describe('CVE alias enrichment via NVD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should enrich OSV vulnerability with NVD data when CVE alias exists', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-ALIAS',
      summary: 'OSV summary',
      details: 'OSV details',
      published: '2024-01-01T00:00:00.000Z',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [{ type: 'CVSS_V3', score: '7.5' }],
      aliases: ['CVE-2024-9999'],
      references: [{ type: 'ADVISORY', url: 'https://osv.dev/advisory' }],
    }

    const nvdVuln = {
      id: 'CVE-2024-9999',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      cwes: ['CWE-79'],
      description: 'NVD description',
      references: [{ source: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-9999', tags: [] }],
      affectedComponents: [],
      publishedAt: new Date('2024-01-01'),
      modifiedAt: new Date('2024-01-02'),
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)

    vi.mocked(getCveById).mockResolvedValueOnce(nvdVuln)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(result[0].id).toBe('CVE-2024-9999')
    expect(result[0].source).toBe('nvd')
    expect(result[0].sources).toEqual(['nvd', 'osv'])
    expect(result[0].severity).toBe('critical')
    expect(result[0].cvssScore).toBe(9.8)
    expect(result[0].cwes).toEqual(['CWE-79'])
    expect(result[0].description).toBe('NVD description')
    expect(result[0].aliases).toEqual(['OSV-2024-ALIAS'])
    expect(getCveById).toHaveBeenCalledWith('CVE-2024-9999', 'nvd-api-key')
  })

  it('should use OSV data when NVD lookup returns null', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-NULL',
      summary: 'OSV summary',
      details: 'OSV details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-NONEXISTENT'],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)

    vi.mocked(getCveById).mockResolvedValueOnce(null)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(result[0].id).toBe('OSV-2024-NULL')
    expect(result[0].source).toBe('osv')
    expect(result[0].description).toBe('OSV summary')
  })

  it('should use OSV data when NVD lookup throws error', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-ERR',
      summary: 'OSV summary for error',
      details: 'OSV details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [{ type: 'CVSS_V3', score: '6.5' }],
      aliases: ['CVE-2024-ERROR'],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)

    vi.mocked(getCveById).mockRejectedValueOnce(new Error('NVD API error'))

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(result[0].id).toBe('OSV-2024-ERR')
    expect(result[0].source).toBe('osv')
    expect(result[0].description).toBe('OSV summary for error')
  })

  it('should not attempt NVD lookup when no API key provided', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-NOKEY',
      summary: 'OSV only',
      details: 'Details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-1234'],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(getCveById).not.toHaveBeenCalled()
    expect(result[0].id).toBe('OSV-2024-NOKEY')
    expect(result[0].source).toBe('osv')
  })

  it('should not attempt NVD lookup when no CVE aliases', async () => {
    const osvNoAlias: OsvVulnerability = {
      id: 'OSV-2024-NOALIAS',
      details: 'No alias',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvNoAlias] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(getCveById).not.toHaveBeenCalled()
    expect(result[0].source).toBe('osv')
  })

  it('should merge references from NVD and OSV, deduplicating by URL', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-MERGE',
      summary: 'Merge test',
      details: 'Details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-MERGE'],
      references: [
        { type: 'ADVISORY', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-MERGE' },
        { type: 'FIX', url: 'https://osv.dev/fix' },
      ],
    }

    const nvdVuln = {
      id: 'CVE-2024-MERGE',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: 'NVD desc',
      references: [
        { source: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-MERGE', tags: [] },
        { source: 'NVD', url: 'https://nvd.nist.gov/other', tags: [] },
      ],
      affectedComponents: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)

    vi.mocked(getCveById).mockResolvedValueOnce(nvdVuln)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    const urls = result[0].references.map((r) => r.url)
    expect(urls).toContain('https://nvd.nist.gov/vuln/detail/CVE-2024-MERGE')
    expect(urls).toContain('https://nvd.nist.gov/other')
    expect(urls).toContain('https://osv.dev/fix')
    expect(urls).toHaveLength(3)
  })

  it('should handle published date', async () => {
    const vulnWithPublished: OsvVulnerability = {
      id: 'OSV-2024-PUB',
      details: 'Published',
      published: '2024-06-15T10:30:00.000Z',
      modified: '2024-06-16T10:30:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [vulnWithPublished] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].publishedAt).toEqual(new Date('2024-06-15T10:30:00.000Z'))
    expect(result[0].modifiedAt).toEqual(new Date('2024-06-16T10:30:00.000Z'))
  })
})

describe('queryByPurl error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should wrap Error exceptions with descriptive message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network timeout'))

    await expect(queryByPurl('pkg:npm/test@1.0.0')).rejects.toThrow('Failed to query OSV by PURL: Network timeout')
  })

  it('should handle getVulnerabilityById with non-Error throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('string error')

    await expect(getVulnerabilityById('OSV-2024-TEST')).rejects.toEqual('string error')
  })

  it('should handle getVulnerabilityById with Error throws', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'))

    await expect(getVulnerabilityById('OSV-2024-TEST')).rejects.toThrow(
      'Failed to get OSV vulnerability by ID: Connection refused',
    )
  })

  it('should handle vulns with no CVE aliases (only non-CVE aliases)', async () => {
    const osvWithNonCveAlias: OsvVulnerability = {
      id: 'OSV-2024-NONCVE',
      summary: 'Non-CVE alias',
      details: 'Details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['GHSA-1234-5678-9012'],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithNonCveAlias] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(getCveById).not.toHaveBeenCalled()
    expect(result[0].id).toBe('OSV-2024-NONCVE')
  })
})

describe('parsePurl edge cases', () => {
  it('should parse golang package with long path', () => {
    const result = parsePurl('pkg:golang/github.com/gorilla/mux@1.8.0')
    expect(result).toEqual({
      ecosystem: 'golang',
      name: 'github.com/gorilla/mux',
      version: '1.8.0',
    })
  })

  it('should parse maven package', () => {
    const result = parsePurl('pkg:maven/org.apache.commons/lang3@3.12.0')
    expect(result).toEqual({
      ecosystem: 'maven',
      name: 'org.apache.commons/lang3',
      version: '3.12.0',
    })
  })

  it('should return null for partial match', () => {
    expect(parsePurl('pkg:')).toBeNull()
    expect(parsePurl('pkg:npm')).toBeNull()
  })
})

describe('batchQuery error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty array for empty input', async () => {
    const result = await batchQuery([])
    expect(result).toEqual([])
  })
})

describe('queryByPurls edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty map for empty input', async () => {
    const result = await queryByPurls([])
    expect(result.size).toBe(0)
  })
})

describe('buildOsvHeaders auth token attachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('attaches a Bearer Authorization header once a server token has been issued, so the same-origin proxy accepts the request in production', async () => {
    vi.mocked(getStoredToken).mockReturnValueOnce('issued-token-123')

    const mockResponse = {
      ok: true,
      json: async () => ({ vulns: [] }),
    } as unknown as Response
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await queryByPurl('pkg:npm/lodash@4.17.21')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer issued-token-123')
  })

  it('omits the Authorization header when no server token has been issued', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ vulns: [] }),
    } as unknown as Response
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await queryByPurl('pkg:npm/lodash@4.17.21')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('extractCvssScore CVSS vector edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the default Attack Complexity weight for a value the weight table does not map (AC:M)', async () => {
    // acValues only defines L and H; AC:M is a valid regex match but an
    // unmapped dictionary key, so the ?? 0.5 fallback must kick in.
    const acMediumVuln: OsvVulnerability = {
      id: 'OSV-2024-ACMED',
      details: 'AC:M vector',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:M/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [acMediumVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    // Score should still resolve to a sane number rather than NaN/undefined.
    expect(result[0].cvssScore).toBeGreaterThan(0)
    expect(result[0].cvssScore).toBeLessThanOrEqual(10)
  })

  it('defaults every exploitability/impact sub-metric when a CVSS vector omits them, instead of throwing or returning NaN', async () => {
    // Only C:H is present: AV/AC/PR/UI/S all fail to match, and I/A also
    // default to 0 — this exercises every "no match" branch in one shot.
    const sparseVectorVuln: OsvVulnerability = {
      id: 'OSV-2024-SPARSE',
      details: 'Sparse vector',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/C:H' }],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [sparseVectorVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBeGreaterThanOrEqual(0)
    expect(result[0].cvssScore).not.toBeNaN()
    expect(result[0].cvssVector).toBe('CVSS:3.1/C:H')
  })

  it('keeps CVSS_V3 priority when it is already the first entry, exercising the comparator from the opposite call order', async () => {
    const reversedOrderVuln: OsvVulnerability = {
      id: 'OSV-2024-ORDER',
      details: 'CVSS_V3 already first',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      severity: [
        { type: 'CVSS_V3', score: '8.5' },
        { type: 'OTHER', score: '1.0' },
      ],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [reversedOrderVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].cvssScore).toBe(8.5)
    expect(result[0].severity).toBe('high')
  })
})

describe('convertOsvVulnerabilityToVulnerability affected-package edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('leaves affectedComponents empty when OSV reports no affected packages, instead of throwing on the missing purl', async () => {
    const noAffectedVuln: OsvVulnerability = {
      id: 'OSV-2024-NOAFFECTED',
      details: 'No affected packages listed',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [],
      references: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [noAffectedVuln] }),
    } as unknown as Response)

    const result = await queryByPurl('pkg:npm/test@1.0.0')

    expect(result[0].affectedComponents).toEqual([])
  })
})

describe('queryByPurl response shape edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('treats a response body without a vulns field as zero results rather than throwing', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({}),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await queryByPurl('pkg:npm/lodash@4.17.21')

    expect(result).toEqual([])
  })
})

describe('CVE alias enrichment field-level fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the OSV summary when NVD returns an empty description, so the record never loses its description entirely', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-EMPTYDESC',
      summary: 'OSV summary wins',
      details: 'OSV details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-EMPTYDESC'],
      references: [],
    }

    const nvdVuln = {
      id: 'CVE-2024-EMPTYDESC',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: '',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)
    vi.mocked(getCveById).mockResolvedValueOnce(nvdVuln)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(result[0].description).toBe('OSV summary wins')
  })

  it('falls back all the way to OSV details when both NVD description and OSV summary are empty/missing', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-DETAILSFALLBACK',
      details: 'Only OSV details survive',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-DETAILSFALLBACK'],
      references: [],
    }

    const nvdVuln = {
      id: 'CVE-2024-DETAILSFALLBACK',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: '',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)
    vi.mocked(getCveById).mockResolvedValueOnce(nvdVuln)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(result[0].description).toBe('Only OSV details survive')
  })

  it('falls back to the OSV modified date when NVD supplies no modifiedAt, so the record keeps a usable timestamp', async () => {
    const osvWithCve: OsvVulnerability = {
      id: 'OSV-2024-NOMODIFIED',
      details: 'NVD lacks modifiedAt',
      modified: '2024-05-05T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-NOMODIFIED'],
      references: [],
    }

    const nvdVuln = {
      id: 'CVE-2024-NOMODIFIED',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: 'NVD desc',
      references: [],
      affectedComponents: [],
      // modifiedAt intentionally omitted
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithCve] }),
    } as unknown as Response)
    vi.mocked(getCveById).mockResolvedValueOnce(nvdVuln)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    expect(result[0].modifiedAt).toEqual(new Date('2024-05-05T00:00:00.000Z'))
  })

  it('keeps non-primary CVE aliases in the alias list instead of dropping every alias once one becomes primary', async () => {
    const osvWithTwoCves: OsvVulnerability = {
      id: 'OSV-2024-TWOALIASES',
      summary: 'Two CVE aliases',
      details: 'Details',
      modified: '2024-01-02T00:00:00.000Z',
      affected: [{ package: { name: 'test', ecosystem: 'npm', purl: 'pkg:npm/test@1.0.0' } }],
      aliases: ['CVE-2024-PRIMARY', 'CVE-2024-SECONDARY'],
      references: [],
    }

    const nvdVuln = {
      id: 'CVE-2024-PRIMARY',
      source: 'nvd',
      severity: 'high',
      cvssScore: 7.5,
      description: 'NVD desc',
      references: [],
      affectedComponents: [],
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ vulns: [osvWithTwoCves] }),
    } as unknown as Response)
    vi.mocked(getCveById).mockResolvedValueOnce(nvdVuln)

    const result = await queryByPurl('pkg:npm/test@1.0.0', 'nvd-api-key')

    // Primary CVE becomes the id and is replaced by the OSV id in aliases;
    // the secondary CVE (not chosen as primary) must be preserved.
    expect(result[0].id).toBe('CVE-2024-PRIMARY')
    expect(result[0].aliases).toEqual(['OSV-2024-TWOALIASES', 'CVE-2024-SECONDARY'])
  })
})
