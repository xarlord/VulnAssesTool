/**
 * Health-score history (FR-05.3: "Trend line for score changes over time").
 *
 * Persists a per-project time series of the project's average health score in
 * localStorage. This is a client-only app with no scan scheduler, so a snapshot is
 * recorded whenever the Health tab computes a score — deduped to one entry per calendar
 * day (the latest score of the day wins). Mirrors the load/guard/persist pattern used by
 * settings profiles and saved searches: corrupt data degrades to an empty history.
 */

const HEALTH_HISTORY_KEY = 'vuln-assess-health-history'
/** Keep at most a year of daily points so the store cannot grow without bound. */
const MAX_SNAPSHOTS = 365

export interface HealthSnapshot {
  date: string // YYYY-MM-DD (UTC calendar day)
  score: number // 0-100, rounded
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function isSnapshot(value: unknown): value is HealthSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.date === 'string' && typeof candidate.score === 'number'
}

function loadAll(): Record<string, HealthSnapshot[]> {
  try {
    const stored = localStorage.getItem(HEALTH_HISTORY_KEY)
    if (!stored) return {}
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, HealthSnapshot[]>
  } catch (error) {
    console.error('Failed to load health history:', error)
    return {}
  }
}

function persistAll(map: Record<string, HealthSnapshot[]>): void {
  try {
    localStorage.setItem(HEALTH_HISTORY_KEY, JSON.stringify(map))
  } catch (error) {
    console.error('Failed to save health history:', error)
  }
}

/** Clean + order a raw stored list: drop malformed entries, oldest first. */
function normalizeSnapshots(raw: unknown): HealthSnapshot[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isSnapshot).sort((a, b) => a.date.localeCompare(b.date))
}

/** All recorded snapshots for a project, oldest first, malformed entries dropped. */
export function getHealthHistory(projectId: string): HealthSnapshot[] {
  return normalizeSnapshots(loadAll()[projectId])
}

/**
 * Pure: return `existing` with today's point upserted (the latest score of the day wins),
 * clamped to 0-100 and rounded, sorted oldest-first, and capped to MAX_SNAPSHOTS days. Used
 * both to persist (recordHealthScore) and to derive the displayed history during render
 * without a write, so the two never drift.
 */
export function mergeTodaySnapshot(existing: HealthSnapshot[], score: number): HealthSnapshot[] {
  const rounded = Math.round(Math.max(0, Math.min(100, score)))
  const today = todayIso()
  return [...existing.filter((snapshot) => snapshot.date !== today), { date: today, score: rounded }]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS)
}

/**
 * Record today's average health score for a project and return the updated history.
 * Re-recording on the same day overwrites that day's point (so the trend reflects the latest
 * state, not every tab view).
 */
export function recordHealthScore(projectId: string, score: number): HealthSnapshot[] {
  // Load the cross-project blob once and reuse it for both the read and the write, rather
  // than calling getHealthHistory() (which would parse localStorage a second time).
  const all = loadAll()
  const next = mergeTodaySnapshot(normalizeSnapshots(all[projectId]), score)
  all[projectId] = next
  persistAll(all)
  return next
}
