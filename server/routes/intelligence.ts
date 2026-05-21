import { Router } from 'express'
import { getKevService } from '../services/intelligence/KevService.js'
import { getEpssService } from '../services/intelligence/EpssService.js'
import { broadcast } from '../websocket.js'
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

router.post('/kev/check', async (req, res) => {
  try {
    const kevService = getKevService()
    const cveId = req.body.cveId as string
    const isKev = kevService.isKev(cveId)
    const response: CheckKevResponse = { success: true, isKev }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      isKev: false,
      error: error instanceof Error ? error.message : 'Failed to check KEV status',
    })
  }
})

router.post('/kev/details', async (req, res) => {
  try {
    const kevService = getKevService()
    const cveId = req.body.cveId as string
    const entry = kevService.getKevDetails(cveId)
    const response: GetKevDetailsResponse = { success: true, entry }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      entry: null,
      error: error instanceof Error ? error.message : 'Failed to get KEV details',
    })
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
      error: error instanceof Error ? error.message : 'Failed to get KEV stats',
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
    res.json({
      success: false,
      result: null,
      error: error instanceof Error ? error.message : 'Failed to sync KEV catalog',
    })
  }
})

router.post('/epss/score', async (req, res) => {
  try {
    const epssService = getEpssService()
    const cveId = req.body.cveId as string
    const score = await epssService.getEpssScore(cveId)
    const response: GetEpssScoreResponse = { success: true, score }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      score: null,
      error: error instanceof Error ? error.message : 'Failed to get EPSS score',
    })
  }
})

router.post('/epss/scores', async (req, res) => {
  try {
    const epssService = getEpssService()
    const cveIds = req.body.cveIds as string[]
    const scoreMap = await epssService.getEpssScores(cveIds)
    const scores: Record<string, EpssScore> = {}
    for (const [cveId, score] of scoreMap) {
      scores[cveId] = score
    }
    const response: GetEpssScoresResponse = { success: true, scores }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      scores: {},
      error: error instanceof Error ? error.message : 'Failed to get EPSS scores',
    })
  }
})

router.post('/epss/refresh', async (req, res) => {
  try {
    const epssService = getEpssService()
    const cveId = req.body.cveId as string
    const score = await epssService.refreshEpssScore(cveId)
    const response: RefreshEpssScoreResponse = { success: true, score }
    res.json(response)
  } catch (error) {
    res.json({
      success: false,
      score: null,
      error: error instanceof Error ? error.message : 'Failed to refresh EPSS score',
    })
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
      error: error instanceof Error ? error.message : 'Failed to get EPSS stats',
    })
  }
})

router.post('/epss/cleanup', async (_req, res) => {
  try {
    const epssService = getEpssService()
    const cleanedCount = await epssService.cleanupCache()
    res.json({ success: true, cleanedCount })
  } catch (error) {
    res.json({
      success: false,
      cleanedCount: 0,
      error: error instanceof Error ? error.message : 'Failed to cleanup EPSS cache',
    })
  }
})

export { router as intelligenceRoutes }
