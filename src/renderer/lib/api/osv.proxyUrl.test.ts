import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Regression guard for the proxy-relative OSV base URL.
 *
 * In the web app `OSV_API_BASE_URL` is the RELATIVE proxy path `/api/osv` (src/shared/constants.ts
 * picks it whenever the page is served over http/https). `new URL('/api/osv/query')` with no base
 * throws `TypeError: Invalid URL`, so every OSV lookup failed at runtime — observed live as
 * "Failed to query OSV for PURL pkg:npm/lodash@4.17.15: TypeError: Invalid URL".
 *
 * osv.test.ts cannot catch this: it mocks the constant to the ABSOLUTE
 * 'https://api.osv.dev/v1', so it only ever exercises the path production does NOT take. This
 * file deliberately mocks the relative value the browser actually gets, which is why it lives
 * separately — vi.mock applies per module registry, file-wide.
 */
vi.mock('@@/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@@/constants')>()
  return { ...actual, OSV_API_BASE_URL: '/api/osv' }
})

vi.mock('./nvd', () => ({ getCveById: vi.fn() }))

import { queryByPurl, getVulnerabilityById } from './osv'

describe('OSV client with a proxy-relative base URL', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ vulns: [] }), { status: 200 })),
    )
  })

  it('resolves the relative proxy path against the page origin instead of throwing', async () => {
    await expect(queryByPurl('pkg:npm/lodash@4.17.15')).resolves.toEqual([])

    const calledWith = vi.mocked(fetch).mock.calls[0][0] as string
    // Must be an absolute URL (fetch on a relative string would work, but `new URL` must not
    // throw) and must still target the proxy path so Vite/Express forwards it.
    expect(() => new URL(calledWith)).not.toThrow()
    expect(new URL(calledWith).pathname).toBe('/api/osv/query')
  })

  it('resolves the relative proxy path for a single-vulnerability lookup too', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'GHSA-x', affected: [] }), { status: 200 }),
    )
    await getVulnerabilityById('GHSA-x')

    const calledWith = vi.mocked(fetch).mock.calls[0][0] as string
    expect(() => new URL(calledWith)).not.toThrow()
    expect(new URL(calledWith).pathname).toBe('/api/osv/vulns/GHSA-x')
  })
})
