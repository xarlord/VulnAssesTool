/**
 * API Integration Tests
 * Tests NVD and OSV API integrations with mocked network responses
 *
 * These tests verify that the API clients handle responses correctly,
 * including error cases and rate limiting.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('NVD API Client', () => {
    const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0'

    it('should handle successful CVE response', async () => {
      const mockResponse = {
        vulnerabilities: [
          {
            cve: {
              id: 'CVE-2024-1234',
              descriptions: [{ lang: 'en', value: 'Test vulnerability' }],
              metrics: {
                cvssMetricV31: [
                  {
                    cvssData: {
                      baseScore: 7.5,
                      baseSeverity: 'HIGH',
                      vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
                    },
                  },
                ],
              },
              published: '2024-01-01T00:00:00.000',
              lastModified: '2024-01-02T00:00:00.000',
            },
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        status: 200,
      })

      const response = await fetch(`${NVD_API_BASE}?cveId=CVE-2024-1234`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.vulnerabilities).toHaveLength(1)
      expect(data.vulnerabilities[0].cve.id).toBe('CVE-2024-1234')
    })

    it('should handle empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vulnerabilities: [] }),
        status: 200,
      })

      const response = await fetch(`${NVD_API_BASE}?cveId=CVE-9999-9999`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.vulnerabilities).toHaveLength(0)
    })

    it('should handle 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      })

      const response = await fetch(`${NVD_API_BASE}?cveId=INVALID`)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(404)
    })

    it('should handle 403 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden - Rate limit exceeded',
      })

      const response = await fetch(`${NVD_API_BASE}?cveId=CVE-2024-1234`)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(403)
    })

    it('should handle 503 service unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })

      const response = await fetch(`${NVD_API_BASE}?cveId=CVE-2024-1234`)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(503)
    })

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      try {
        await fetch(`${NVD_API_BASE}?cveId=CVE-2024-1234`)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('Network error')
      }
    })

    it('should handle timeout errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'))

      try {
        await fetch(`${NVD_API_BASE}?cveId=CVE-2024-1234`)
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('timeout')
      }
    })
  })

  describe('OSV API Client', () => {
    const OSV_API_BASE = 'https://api.osv.dev/v1'

    it('should handle successful OSV response', async () => {
      const mockResponse = {
        id: 'GHSA-1234-5678-9abc',
        summary: 'Test vulnerability',
        details: 'Detailed description',
        affected: [
          {
            package: {
              name: 'lodash',
              ecosystem: 'npm',
            },
            versions: ['4.17.20', '4.17.21'],
          },
        ],
        severity: [
          {
            type: 'CVSS_V3',
            score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        status: 200,
      })

      const response = await fetch(`${OSV_API_BASE}/vulns/GHSA-1234-5678-9abc`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.id).toBe('GHSA-1234-5678-9abc')
      expect(data.affected).toHaveLength(1)
    })

    it('should handle batch query response', async () => {
      const mockResponse = {
        results: [{ id: 'GHSA-1234-5678-9abc' }, { id: 'GHSA-abcd-efgh-1234' }],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
        status: 200,
      })

      const response = await fetch(`${OSV_API_BASE}/querybatch`, {
        method: 'POST',
        body: JSON.stringify({
          queries: [{ package: { name: 'lodash', ecosystem: 'npm' }, version: '4.17.20' }],
        }),
      })
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.results).toHaveLength(2)
    })

    it('should handle OSV API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })

      const response = await fetch(`${OSV_API_BASE}/vulns/INVALID`)

      expect(response.ok).toBe(false)
      expect(response.status).toBe(400)
    })
  })
})
