import { Router } from 'express'
import { getKevService } from '../services/intelligence/KevService.js'
import { getEpssService } from '../services/intelligence/EpssService.js'
import { broadcast } from '../websocket.js'
import { sanitizeErrorMessage } from '../database/ipcRequestValidator.js'
import type { EpssScore } from '../services/intelligence/EpssService.js'
import type {
  CheckKevBatchResponse,
  CheckKevResponse,
  GetKevDetailsResponse,
  GetKevStatsResponse,
  SyncKevResponse,
  GetEpssScoreResponse,
  GetEpssScoresResponse,
  RefreshEpssScoreResponse,
  GetEpssStatsResponse,
} from '../types/intelligence.js'

const router = Router()

/** A non-empty string `cveId` from the request body, or null if missing/invalid. */
function readCveId(body: unknown): string | null {
  const cveId = (body as { cveId?: unknown } | null | undefined)?.cveId
  return typeof cveId === 'string' && cveId.trim().length > 0 ? cveId : null
}

/** An array-of-strings `cveIds` from the request body, or null if missing/invalid. */
function readCveIds(body: unknown): string[] | null {
  const cveIds = (body as { cveIds?: unknown } | null | undefined)?.cveIds
  return Array.isArray(cveIds) && cveIds.every((id) => typeof id === 'string') ? (cveIds as string[]) : null
}

/**
 * POST /kev/check — check whether the `cveId` in the request body is in the CISA KEV
 * catalog. Responds `{ success: false, isKev: false, error }` if `cveId` is missing/invalid
 * or the lookup throws.
 */
router.post('/kev/check', async (req, res) => {
  try {
    const cveId = readCveId(req.body)
    if (cveId === null) {
      res.json({ success: false, isKev: false, error: 'cveId is required and must be a non-empty string' })
      return
    }
    const kevService = getKevService()
    const isKev = kevService.isKev(cveId)
    const response: CheckKevResponse = { success: true, isKev }
    res.json(response)
  } catch (error) {
    res.json({ success: false, isKev: false, error: sanitizeErrorMessage(error) })
  }
})

/**
 * POST /kev/details — return the full KEV catalog entry for the `cveId` in the request
 * body, or `entry: null` if it isn't in the catalog. Responds `{ success: false, entry:
 * null, error }` if `cveId` is missing/invalid or the lookup throws.
 */
router.post('/kev/details', async (req, res) => {
  try {
    const cveId = readCveId(req.body)
    if (cveId === null) {
      res.json({ success: false, entry: null, error: 'cveId is required and must be a non-empty string' })
      return
    }
    const kevService = getKevService()
    const entry = kevService.getKevDetails(cveId)
    const response: GetKevDetailsResponse = { success: true, entry }
    res.json(response)
  } catch (error) {
    res.json({ success: false, entry: null, error: sanitizeErrorMessage(error) })
  }
})

/**
 * POST /kev/checks — batched sibling of /kev/check + /kev/details, mirroring /epss/scores.
 *
 * Enrichment needs KEV status for every CVE in a scan. One CVE at a time meant TWO requests
 * each, so a 132-CVE project fired ~264 calls within seconds and tripped the 300/min rate
 * limiter — the app throttled itself and KEV flags went silently missing. Both lookups are
 * local synchronous SQLite reads, so answering a whole batch in one request is cheap.
 */
router.post('/kev/checks', async (req, res) => {
  try {
    const cveIds = readCveIds(req.body)
    if (cveIds === null) {
      res.json({ success: false, results: {}, error: 'cveIds is required and must be an array of strings' })
      return
    }
    const kevService = getKevService()
    const results: CheckKevBatchResponse['results'] = {}
    for (const cveId of cveIds) {
      const entry = kevService.getKevDetails(cveId)
      results[cveId] = { isKev: kevService.isKev(cveId), entry }
    }
    const response: CheckKevBatchResponse = { success: true, results }
    res.json(response)
  } catch (error) {
    res.json({ success: false, results: {}, error: sanitizeErrorMessage(error) })
  }
})

/**
 * GET /kev/stats — return aggregate KEV catalog stats (total entries, ransomware-related
 * count, last-updated timestamp). Responds with all-zero/null stats and an error message
 * if the lookup throws.
 */
router.get('/kev/stats', async (_req, res) => {
  try {
    const kevService = getKevService()
    const stats = kevService.getCatalogStats()
    const response: GetKevStatsResponse = { success: true, stats }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      stats: { total: 0, ransomwareRelated: 0, lastUpdated: null },
      error: sanitizeErrorMessage(error),
    })
  }
})

/**
 * POST /kev/sync — sync the KEV catalog from CISA's published feed, broadcast a
 * `kev-synced` event with the result, and return it. Responds `{ success: false, result:
 * null, error }` if the sync fails.
 */
router.post('/kev/sync', async (_req, res) => {
  try {
    const kevService = getKevService()
    const result = await kevService.syncFromCisa()
    broadcast('kev-synced', result)
    const response: SyncKevResponse = { success: true, result }
    res.json(response)
  } catch (error) {
    res.json({ success: false, result: null, error: sanitizeErrorMessage(error) })
  }
})

/**
 * POST /epss/score — return the EPSS score for the `cveId` in the request body. Responds
 * `{ success: false, score: null, error }` if `cveId` is missing/invalid or the lookup throws.
 */
router.post('/epss/score', async (req, res) => {
  try {
    const cveId = readCveId(req.body)
    if (cveId === null) {
      res.json({ success: false, score: null, error: 'cveId is required and must be a non-empty string' })
      return
    }
    const epssService = getEpssService()
    const score = await epssService.getEpssScore(cveId)
    const response: GetEpssScoreResponse = { success: true, score }
    res.json(response)
  } catch (error) {
    res.json({ success: false, score: null, error: sanitizeErrorMessage(error) })
  }
})

/**
 * POST /epss/scores — return a map of CVE ID to EPSS score for the `cveIds` array in the
 * request body. Responds `{ success: false, scores: {}, error }` if `cveIds` is
 * missing/invalid (not an array of strings) or the lookup throws.
 */
router.post('/epss/scores', async (req, res) => {
  try {
    const cveIds = readCveIds(req.body)
    if (cveIds === null) {
      res.json({ success: false, scores: {}, error: 'cveIds is required and must be an array of strings' })
      return
    }
    const epssService = getEpssService()
    const scoreMap = await epssService.getEpssScores(cveIds)
    const scores: Record<string, EpssScore> = {}
    for (const [cveId, score] of scoreMap) {
      scores[cveId] = score
    }
    const response: GetEpssScoresResponse = { success: true, scores }
    res.json(response)
  } catch (error) {
    res.json({ success: false, scores: {}, error: sanitizeErrorMessage(error) })
  }
})

/**
 * POST /epss/refresh — force a fresh EPSS score lookup (bypassing any cache) for the
 * `cveId` in the request body. Responds `{ success: false, score: null, error }` if
 * `cveId` is missing/invalid or the refresh throws.
 */
router.post('/epss/refresh', async (req, res) => {
  try {
    const cveId = readCveId(req.body)
    if (cveId === null) {
      res.json({ success: false, score: null, error: 'cveId is required and must be a non-empty string' })
      return
    }
    const epssService = getEpssService()
    const score = await epssService.refreshEpssScore(cveId)
    const response: RefreshEpssScoreResponse = { success: true, score }
    res.json(response)
  } catch (error) {
    res.json({ success: false, score: null, error: sanitizeErrorMessage(error) })
  }
})

/**
 * GET /epss/stats — return aggregate EPSS cache stats (cached count, average score,
 * average percentile). Responds with all-zero stats and an error message if the lookup throws.
 */
router.get('/epss/stats', async (_req, res) => {
  try {
    const epssService = getEpssService()
    const stats = epssService.getStats()
    const response: GetEpssStatsResponse = { success: true, stats }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      stats: { cachedCount: 0, avgScore: 0, avgPercentile: 0 },
      error: sanitizeErrorMessage(error),
    })
  }
})

/**
 * POST /epss/cleanup — remove stale entries from the EPSS score cache and return how many
 * were cleaned. Responds `{ success: false, cleanedCount: 0, error }` if cleanup throws.
 */
router.post('/epss/cleanup', async (_req, res) => {
  try {
    const epssService = getEpssService()
    const cleanedCount = await epssService.cleanupCache()
    res.json({ success: true, cleanedCount })
  } catch (error) {
    res.json({ success: false, cleanedCount: 0, error: sanitizeErrorMessage(error) })
  }
})

export { router as intelligenceRoutes }
