/**
 * Release checksum utility (SR-03 — update security / checksum validation).
 *
 * Pure, testable core shared by scripts/generate-checksums.js. Post-Electron the app ships as a
 * self-hosted web server + CLI, so integrity is provided by SHA256 checksums of the published
 * artifacts (a `checksums.txt` consumable by `sha256sum -c`) rather than signed desktop installers.
 */

import crypto from 'node:crypto'

/**
 * @param {Buffer | Uint8Array | string} buffer
 * @returns {string} lowercase hex SHA256 digest
 */
export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Render entries as standard `<hash>  <file>` lines (two-space GNU coreutils separator),
 * trailing newline included.
 * @param {Array<{ file: string, sha256: string }>} entries
 * @returns {string}
 */
export function formatChecksumsFile(entries) {
  return entries.map(({ file, sha256 }) => `${sha256}  ${file}`).join('\n') + '\n'
}

/**
 * Parse a `<hash>  <file>` checksums file back into entries (inverse of formatChecksumsFile).
 * @param {string} content
 * @returns {Array<{ file: string, sha256: string }>}
 */
export function parseChecksumsFile(content) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const sep = line.indexOf('  ')
      return { sha256: line.slice(0, sep), file: line.slice(sep + 2) }
    })
}

/**
 * True iff `buffer` hashes to `expectedHex`. Rejects tampered artifacts.
 * @param {string} expectedHex
 * @param {Buffer | Uint8Array | string} buffer
 * @returns {boolean}
 */
export function verifyChecksum(expectedHex, buffer) {
  return sha256Hex(buffer) === expectedHex
}
