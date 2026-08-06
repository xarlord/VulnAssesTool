/**
 * Bandwidth throttling for NVD bulk downloads (FR-10.3).
 *
 * Pure helper, deliberately free of timers or client state so the throttle math
 * can be unit-tested in isolation. The caller (nvdApiV2Client) measures the size
 * of each downloaded page and awaits this many milliseconds before the next
 * request, capping the sustained transfer rate at `kbpsLimit` KB/s.
 */

const BYTES_PER_KB = 1024
const MS_PER_SECOND = 1000

/**
 * How long to wait, in milliseconds, after downloading `bytesDownloaded` bytes
 * so the average rate does not exceed `kbpsLimit` KB/s.
 *
 * Returns 0 when `kbpsLimit <= 0` (unlimited — the default) or when no bytes
 * were downloaded, so an unset limit is a byte-for-byte no-op.
 */
export function computeThrottleDelayMs(bytesDownloaded: number, kbpsLimit: number): number {
  if (kbpsLimit <= 0 || bytesDownloaded <= 0) {
    return 0
  }
  const bytesPerSecondLimit = kbpsLimit * BYTES_PER_KB
  return Math.round((bytesDownloaded / bytesPerSecondLimit) * MS_PER_SECOND)
}
