import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSeverityFromScore,
  parseCvssScore,
  searchCvesByCpe,
  getCveById,
  searchCvesByCpes,
  isValidNvdApiKey,
  checkNvdApiStatus,
} from './nvd'
import type { NvdApiCve } from '@@/types'

// Mock fetch globally
global.fetch = vi.fn()

describe('getSeverityFromScore', () => {
  it('should return critical for score >= 9.0', () => {
    expect(getSeverityFromScore(9.0)).toBe('critical')
    expect(getSeverityFromScore(9.5)).toBe('critical')
    expect(getSeverityFromScore(10.0)).toBe('critical')
  })

  it('should return high for score >= 7.0 and < 9.0', () => {
    expect(getSeverityFromScore(7.0)).toBe('high')
    expect(getSeverityFromScore(8.5)).toBe('high')
    expect(getSeverityFromScore(8.9)).toBe('high')
  })

  it('should return medium for score >= 4.0 and < 7.0', () => {
    expect(getSeverityFromScore(4.0)).toBe('medium')
    expect(getSeverityFromScore(5.5)).toBe('medium')
    expect(getSeverityFromScore(6.9)).toBe('medium')
  })

  it('should return low for score > 0 and < 4.0', () => {
    expect(getSeverityFromScore(0.1)).toBe('low')
    expect(getSeverityFromScore(2.5)).toBe('low')
    expect(getSeverityFromScore(3.9)).toBe('low')
  })

  it('should return none for score 0', () => {
    expect(getSeverityFromScore(0)).toBe('none')
  })
})

describe('parseCvssScore', () => {
  it('should return undefined for no vector', () => {
    expect(parseCvssScore(undefined)).toBeUndefined()
  })

  it('should return undefined for valid vector (calculation not implemented)', () => {
    const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
    expect(parseCvssScore(vector)).toBeUndefined()
  })
})

describe('isValidNvdApiKey', () => {
  it('should return true for valid UUID format', () => {
    expect(isValidNvdApiKey('00000000-0000-0000-0000-000000000000')).toBe(true)
    expect(isValidNvdApiKey('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidNvdApiKey('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true)
  })

  it('should return false for invalid formats', () => {
    expect(isValidNvdApiKey('')).toBe(false)
    expect(isValidNvdApiKey('not-a-uuid')).toBe(false)
    expect(isValidNvdApiKey('12345')).toBe(false)
    expect(isValidNvdApiKey('550e8400-e29b-41d4-a716')).toBe(false)
    expect(isValidNvdApiKey('550e8400_e29b_41d4_a716_446655440000')).toBe(false)
  })
})

describe('getCveById', () => {
  const mockCve: NvdApiCve = {
    id: 'CVE-2024-1234',
    sourceIdentifier: 'nvd@nist.gov',
    published: '2024-01-01T00:00:00.000Z',
    lastModified: '2024-01-02T00:00:00.000Z',
    vulnStatus: 'Analyzed',
    descriptions: [
      {
        lang: 'en',
        value: 'A test vulnerability description',
      },
    ],
    metrics: {
      cvssMetricV31: [
        {
          cvssData: {
            version: '3.1',
            vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
            baseScore: 9.8,
            baseSeverity: 'CRITICAL',
          },
        },
      ],
    },
    weaknesses: [
      {
        description: [
          {
            lang: 'en',
            value: 'CWE-79',
          },
        ],
      },
    ],
    references: [
      {
        url: 'https://example.com/advisory',
        source: 'vendor',
        tags: ['vendor-advisory'],
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return vulnerability for valid CVE ID', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCve],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await getCveById('CVE-2024-1234')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('CVE-2024-1234')
    expect(result?.severity).toBe('critical')
    expect(result?.cvssScore).toBe(9.8)
    expect(result?.description).toBe('A test vulnerability description')
  })

  it('should format CVE ID correctly', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCve],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await getCveById('2024-1234')

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('cveId=CVE-2024-1234'), expect.any(Object))
  })

  it('should return null for 404 response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await getCveById('CVE-9999-9999')

    expect(result).toBeNull()
  })

  it('should throw error for 403 rate limit response', async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await expect(getCveById('CVE-2024-1234')).rejects.toThrow('rate limit exceeded')
  })

  it('should throw error for other error responses', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await expect(getCveById('CVE-2024-1234')).rejects.toThrow('NVD API error: 500')
  })

  it('should include API key in request if provided', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCve],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await getCveById('CVE-2024-1234', 'test-api-key-123')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          apiKey: 'test-api-key-123',
        }),
      }),
    )
  })

  it('should return null when vulnerabilities array is empty', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await getCveById('CVE-2024-1234')

    expect(result).toBeNull()
  })

  it('should re-throw non-Error exceptions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('string error')

    await expect(getCveById('CVE-2024-1234')).rejects.toEqual('string error')
  })
})

describe('searchCvesByCpe', () => {
  const mockCves: NvdApiCve[] = [
    {
      id: 'CVE-2024-1001',
      sourceIdentifier: 'nvd@nist.gov',
      published: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-02T00:00:00.000Z',
      vulnStatus: 'Analyzed',
      descriptions: [
        {
          lang: 'en',
          value: 'First vulnerability',
        },
      ],
      metrics: {
        cvssMetricV31: [
          {
            cvssData: {
              version: '3.1',
              vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
              baseScore: 9.8,
              baseSeverity: 'CRITICAL',
            },
          },
        ],
      },
      weaknesses: [],
      references: [],
    },
    {
      id: 'CVE-2024-1002',
      sourceIdentifier: 'nvd@nist.gov',
      published: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-02T00:00:00.000Z',
      vulnStatus: 'Analyzed',
      descriptions: [
        {
          lang: 'en',
          value: 'Second vulnerability',
        },
      ],
      metrics: {
        cvssMetricV31: [
          {
            cvssData: {
              version: '3.1',
              vectorString: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:N/A:H',
              baseScore: 5.9,
              baseSeverity: 'MEDIUM',
            },
          },
        ],
      },
      weaknesses: [],
      references: [],
    },
  ]

  const mockCveWithoutMetrics: NvdApiCve = {
    id: 'CVE-2024-1003',
    sourceIdentifier: 'nvd@nist.gov',
    published: '2024-01-01T00:00:00.000Z',
    lastModified: '2024-01-02T00:00:00.000Z',
    vulnStatus: 'Analyzed',
    descriptions: [
      {
        lang: 'en',
        value: 'Vulnerability without CVSS metrics',
      },
    ],
    weaknesses: [],
    references: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return vulnerabilities for valid CPE', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: mockCves,
        resultsPerPage: 2000,
        totalResults: 2,
        startIndex: 0,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('CVE-2024-1001')
    expect(result[0].severity).toBe('critical')
    expect(result[1].id).toBe('CVE-2024-1002')
    expect(result[1].severity).toBe('medium')
  })

  it('should handle pagination', async () => {
    const mockResponse1 = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCves[0]],
        resultsPerPage: 1,
        totalResults: 2,
        startIndex: 0,
      }),
    } as unknown as Response

    const mockResponse2 = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCves[1]],
        resultsPerPage: 1,
        totalResults: 2,
        startIndex: 1,
      }),
    } as unknown as Response

    // Set up both responses before calling the function
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse1)
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse2)

    // Use the real implementation without fake timers
    // Instead, patch the delay function to be instant
    const originalDelay = globalThis.setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
      if (typeof cb === 'function') {
        cb(0 as unknown as number)
      }
      return 0 as unknown as NodeJS.Timeout
    })

    const result = await searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')

    // Restore setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockRestore()

    expect(result).toHaveLength(2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('should return empty array when no vulnerabilities found', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [],
        resultsPerPage: 2000,
        totalResults: 0,
        startIndex: 0,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')

    expect(result).toEqual([])
  })

  it('should throw error for 403 rate limit response', async () => {
    const mockResponse = {
      ok: false,
      status: 403,
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await expect(searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')).rejects.toThrow('rate limit exceeded')
  })

  it('should include API key in request if provided', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [],
        resultsPerPage: 2000,
        totalResults: 0,
        startIndex: 0,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*', 'api-key')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          apiKey: 'api-key',
        }),
      }),
    )
  })

  it('should handle CVE without CVSS metrics', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCveWithoutMetrics],
        resultsPerPage: 2000,
        totalResults: 1,
        startIndex: 0,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('CVE-2024-1003')
    expect(result[0].severity).toBe('none')
    expect(result[0].cvssScore).toBeUndefined()
  })

  it('should re-throw non-Error exceptions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce('string error')

    await expect(searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')).rejects.toEqual('string error')
  })

  it('should throw error for non-403 error responses', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    await expect(searchCvesByCpe('cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*')).rejects.toThrow(
      'NVD API error: 500 Internal Server Error',
    )
  })
})

describe('searchCvesByCpes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should search multiple CPEs and return map', async () => {
    const mockCve: NvdApiCve = {
      id: 'CVE-2024-1001',
      sourceIdentifier: 'nvd@nist.gov',
      published: '2024-01-01T00:00:00.000Z',
      lastModified: '2024-01-02T00:00:00.000Z',
      vulnStatus: 'Analyzed',
      descriptions: [{ lang: 'en', value: 'Test' }],
      metrics: {
        cvssMetricV31: [
          {
            cvssData: {
              version: '3.1',
              vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
              baseScore: 9.8,
              baseSeverity: 'CRITICAL',
            },
          },
        ],
      },
      weaknesses: [],
      references: [],
    }

    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [mockCve],
        resultsPerPage: 2000,
        totalResults: 1,
        startIndex: 0,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValue(mockResponse)

    // Patch setTimeout to be instant
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
      if (typeof cb === 'function') {
        cb(0 as unknown as number)
      }
      return 0 as unknown as NodeJS.Timeout
    })

    const cpes = ['cpe:2.3:a:vendor:product1:1.0:*:*:*:*:*:*:*', 'cpe:2.3:a:vendor:product2:1.0:*:*:*:*:*:*:*']

    const result = await searchCvesByCpes(cpes)

    // Restore setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockRestore()

    expect(result.size).toBe(2)
    expect(result.get(cpes[0])).toHaveLength(1)
    expect(result.get(cpes[1])).toHaveLength(1)
  })

  it('should handle errors for individual CPEs', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [],
        resultsPerPage: 2000,
        totalResults: 0,
        startIndex: 0,
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValue(mockResponse)

    // Patch setTimeout to be instant
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
      if (typeof cb === 'function') {
        cb(0 as unknown as number)
      }
      return 0 as unknown as NodeJS.Timeout
    })

    const cpes = ['cpe:2.3:a:vendor:product1:1.0:*:*:*:*:*:*:*']

    const result = await searchCvesByCpes(cpes)

    // Restore setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockRestore()

    expect(result.size).toBe(1)
    expect(result.get(cpes[0])).toEqual([])
  })

  it('should handle errors and continue with other CPEs', async () => {
    // First CPE fails, second succeeds
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vulnerabilities: [],
          resultsPerPage: 2000,
          totalResults: 0,
          startIndex: 0,
        }),
      } as unknown as Response)

    // Patch setTimeout to be instant
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
      if (typeof cb === 'function') {
        cb(0 as unknown as number)
      }
      return 0 as unknown as NodeJS.Timeout
    })

    const cpes = ['cpe:2.3:a:vendor:product1:1.0:*:*:*:*:*:*:*', 'cpe:2.3:a:vendor:product2:1.0:*:*:*:*:*:*:*']

    const result = await searchCvesByCpes(cpes)

    // Restore setTimeout
    vi.spyOn(globalThis, 'setTimeout').mockRestore()

    expect(result.size).toBe(2)
    // First CPE should have empty array due to error
    expect(result.get(cpes[0])).toEqual([])
    // Second CPE should have empty array (no vulnerabilities)
    expect(result.get(cpes[1])).toEqual([])
  })
})

describe('checkNvdApiStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return true when API is accessible', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        vulnerabilities: [
          {
            id: 'CVE-2024-2389',
            sourceIdentifier: 'nvd@nist.gov',
            vulnStatus: 'Analyzed',
            descriptions: [{ lang: 'en', value: 'Test' }],
          },
        ],
      }),
    } as unknown as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await checkNvdApiStatus()

    expect(result).toBe(true)
  })

  it('should return false when API is not accessible', async () => {
    const mockResponse = {
      ok: false,
    } as Response

    vi.mocked(fetch).mockResolvedValueOnce(mockResponse)

    const result = await checkNvdApiStatus()

    expect(result).toBe(false)
  })

  it('should return false on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const result = await checkNvdApiStatus()

    expect(result).toBe(false)
  })
})
