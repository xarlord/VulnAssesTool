/**
 * Secure Storage Service Tests
 *
 * Verifies the security-critical contract of the API key encryption at rest
 * (SR-01.1):
 *  - API keys are never persisted as plaintext.
 *  - Stored keys round-trip through encrypt/decrypt back to the original value.
 *  - A corrupted/tampered ciphertext fails gracefully (returns null) instead of
 *    throwing and crashing callers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

describe('SecureApiKeyStorage', () => {
  let tempDir: string
  let credentialsPath: string

  beforeEach(async () => {
    vi.resetModules()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'secure-storage-test-'))
    credentialsPath = path.join(tempDir, 'credentials.json')
  })

  it('never persists the plaintext API key to the credentials store', async () => {
    const { config } = await import('../../config')
    config.CREDENTIALS_PATH = credentialsPath
    const { createApiKeyStorage } = await import('./secureStorage')

    const plaintextKey = 'nvd-super-secret-api-key-12345'
    const storage = createApiKeyStorage('nvd')
    await storage.setApiKey(plaintextKey)

    const raw = await fs.readFile(credentialsPath, 'utf-8')
    const store = JSON.parse(raw) as Record<string, string>
    const [storedCiphertext] = Object.values(store)

    // The requirement this encodes: an attacker reading credentials.json off
    // disk must never recover the raw API key.
    expect(storedCiphertext).toBeDefined()
    expect(storedCiphertext).not.toBe(plaintextKey)
    expect(raw).not.toContain(plaintextKey)
  })

  it('round-trips encrypt -> decrypt back to the original API key', async () => {
    const { config } = await import('../../config')
    config.CREDENTIALS_PATH = credentialsPath
    const { createApiKeyStorage } = await import('./secureStorage')

    const plaintextKey = 'osv-round-trip-key-67890'
    const storage = createApiKeyStorage('osv')
    await storage.setApiKey(plaintextKey)

    // Requirement: a stored key must be recoverable exactly, otherwise scans
    // that depend on it silently fail with a wrong/garbled credential.
    const retrieved = await storage.getApiKey()
    expect(retrieved).toBe(plaintextKey)
  })

  it('returns null instead of throwing when the stored ciphertext is tampered/too short', async () => {
    // Prime the store in one module instance so we learn the real on-disk
    // key name without hardcoding the module's internal naming scheme.
    const { config: configA } = await import('../../config')
    configA.CREDENTIALS_PATH = credentialsPath
    const { createApiKeyStorage: createApiKeyStorageA } = await import('./secureStorage')
    const primingStorage = createApiKeyStorageA('github')
    await primingStorage.setApiKey('github-key-to-be-corrupted')

    const raw = await fs.readFile(credentialsPath, 'utf-8')
    const store = JSON.parse(raw) as Record<string, string>
    const [storeKey] = Object.keys(store)

    // Corrupt the ciphertext: too short to contain a valid IV/authTag/payload.
    store[storeKey] = 'short-invalid'
    await fs.writeFile(credentialsPath, JSON.stringify(store, null, 2), 'utf-8')

    // Force a fresh module instance so the in-memory credential-store cache
    // is cleared and the tampered value on disk is actually read by decrypt().
    vi.resetModules()
    const { config: configB } = await import('../../config')
    configB.CREDENTIALS_PATH = credentialsPath
    const { createApiKeyStorage: createApiKeyStorageB } = await import('./secureStorage')
    const storage = createApiKeyStorageB('github')

    // Requirement: a corrupted credential must never crash the caller (e.g.
    // a scan reading its stored API key) - it must degrade to "no key found".
    await expect(storage.getApiKey()).resolves.toBeNull()
  })
})
