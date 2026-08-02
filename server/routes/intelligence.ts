import { Router } from 'express'
import { getKevService } from '../services/intelligence/KevService.js'
import { getEpssService } from '../services/intelligence/EpssService.js'
import { broadcast } from '../websocket.js'
import { sanitizeErrorMessage } from '../database/ipcRequestValidator.js'
import type { EpssScore } from '../services/intelligence/EpssService.js'
import type {
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
