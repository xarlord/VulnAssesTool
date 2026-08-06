/**
 * Shared SHA-256 hex digest for the renderer.
 *
 * Uses the Web Crypto SubtleCrypto API so the same content always yields the
 * same digest. This is the single implementation behind the FPF ISO-21434 audit
 * hash chain and content-addressable SBOM file hashes — call sites consume this
 * instead of re-deriving the crypto.subtle boilerplate (and must never fall back
 * to Date.now()/Math.random(), which are not content-derived).
 *
 * @param input - text to hash, or raw bytes (e.g. file contents) as an ArrayBuffer
 * @returns lowercase 64-character hex SHA-256 digest
 */
export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
