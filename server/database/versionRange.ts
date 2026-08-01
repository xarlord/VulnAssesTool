/**
 * NVD version-range matching (FR-03.1).
 *
 * NVD applicability rows frequently mark a product vulnerable across a version
 * RANGE (cpe23_uri with version='*' plus version_start/end bound columns) rather
 * than by literal version. These helpers let searchCVEsByCPE decide whether a
 * concrete component version falls inside such a range.
 */

/** The four optional NVD version-range bound columns for a single cpe_matches row. */
export interface VersionRange {
  versionStartIncluding?: string
  versionStartExcluding?: string
  versionEndIncluding?: string
  versionEndExcluding?: string
}

/**
 * Compare two version strings by numeric segment value.
 *
 * Best-effort, NOT full semver: segments are split on '.' and '-', compared
 * numerically when both sides are pure digits and lexically otherwise, with
 * missing trailing segments treated as 0. This handles the overwhelmingly
 * common `MAJOR.MINOR.PATCH` NVD case correctly; exotic pre-release/build
 * suffixes (e.g. '2.0-beta9') are ordered heuristically, matching the PRD's
 * "fuzzy matching" wording.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const aParts = splitVersion(a)
  const bParts = splitVersion(b)
  const length = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < length; i++) {
    const aSeg = aParts[i] ?? '0'
    const bSeg = bParts[i] ?? '0'
    if (aSeg === bSeg) continue

    const aNum = Number(aSeg)
    const bNum = Number(bSeg)
    const bothNumeric = /^\d+$/.test(aSeg) && /^\d+$/.test(bSeg)

    if (bothNumeric) {
      if (aNum !== bNum) return aNum < bNum ? -1 : 1
    } else {
      return aSeg < bSeg ? -1 : 1
    }
  }
  return 0
}

/**
 * Whether `version` falls inside the given NVD version range.
 *
 * A range with no bounds at all is treated as always-in-range, matching NVD's
 * "always vulnerable" semantics (a cpe23_uri with version='*' and no bound
 * columns means every version of the product is affected).
 */
export function isVersionInRange(version: string, range: VersionRange): boolean {
  const { versionStartIncluding, versionStartExcluding, versionEndIncluding, versionEndExcluding } = range

  if (versionStartIncluding !== undefined && compareVersions(version, versionStartIncluding) < 0) {
    return false
  }
  if (versionStartExcluding !== undefined && compareVersions(version, versionStartExcluding) <= 0) {
    return false
  }
  if (versionEndIncluding !== undefined && compareVersions(version, versionEndIncluding) > 0) {
    return false
  }
  if (versionEndExcluding !== undefined && compareVersions(version, versionEndExcluding) >= 0) {
    return false
  }
  return true
}

/** Split a version string into comparable segments on '.' and '-' separators. */
function splitVersion(value: string): string[] {
  return value.split(/[.-]/).filter((segment) => segment.length > 0)
}
