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

// Mock fetch globally
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
