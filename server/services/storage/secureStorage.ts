/**
 * Secure Storage Service (Node.js)
 *
 * Replaces Electron's safeStorage with Node.js crypto AES-256-GCM encryption.
 * Uses a machine-specific key derived from hostname + username.
 * Stores encrypted keys in DATA_DIR/credentials.json.
 * On first run, imports keys from exported-keys.json (Phase 0 output).
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { config } from '../../config.js'
import type { ApiKeyStorage, SecureStorageOptions, ApiKeyType } from './types.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const PBKDF2_ITERATIONS = 100_000

function getMachineKey(): Buffer {
  const machineId = `${os.hostname()}:${os.userInfo().username}:vulnassesstool`
  const salt = 'vulnassesstool-secure-storage-salt-v1'
  return pbkdf2Sync(machineId, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512')
}

function encrypt(plaintext: string): string {
  const key = getMachineKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

function decrypt(ciphertext: string): string {
  const key = getMachineKey()
  const combined = Buffer.from(ciphertext, 'base64')

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final('utf8')
}

interface CredentialStore {
  [key: string]: string
}

let cachedStore: CredentialStore | null = null

function loadCredentialStore(): CredentialStore {
  if (cachedStore !== null) return cachedStore

  const filePath = config.CREDENTIALS_PATH
  if (!filePath) {
    cachedStore = {}
    return cachedStore
  }

  if (!existsSync(filePath)) {
    cachedStore = {}
    return cachedStore
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    cachedStore = JSON.parse(content)
    return cachedStore
  } catch {
    cachedStore = {}
    return cachedStore
  }
}

function saveCredentialStore(store: CredentialStore): void {
  const filePath = config.CREDENTIALS_PATH
  if (!filePath) return

  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8')
  cachedStore = store
}

function tryImportExportedKeys(): void {
  if (!config.EXPORTED_KEYS_PATH) return
  if (!existsSync(config.EXPORTED_KEYS_PATH)) return

  try {
    const content = readFileSync(config.EXPORTED_KEYS_PATH, 'utf-8')
    const exported = JSON.parse(content)

    const store = loadCredentialStore()
    let imported = false

    for (const keyType of ['nvd', 'osv', 'github'] as ApiKeyType[]) {
      const keyValue = exported[keyType]
      if (keyValue && typeof keyValue === 'string') {
        const storeKey = `com.vulnasstool.apikeys.${keyType}`
        if (!store[storeKey]) {
          store[storeKey] = encrypt(keyValue)
          imported = true
          console.log(`[Storage] Imported ${keyType} key from Phase 0 export`)
        }
      }
    }

    if (imported) {
      saveCredentialStore(store)
      console.log('[Storage] Key import complete')
    }
  } catch (err) {
    console.warn('[Storage] Failed to import exported keys:', err)
  }
}

export class SecureApiKeyStorage implements ApiKeyStorage {
  private readonly keyName: string

  constructor(options: SecureStorageOptions) {
    this.keyName = `${options.service}.${options.account}`
  }

  async setApiKey(key: string): Promise<boolean> {
    try {
      if (!key || key.trim().length === 0) {
        await this.deleteApiKey()
        return true
      }

      const store = loadCredentialStore()
      store[this.keyName] = encrypt(key)
      saveCredentialStore(store)
      return true
    } catch (error) {
      console.error('Failed to store API key:', error)
      return false
    }
  }

  async getApiKey(): Promise<string | null> {
    try {
      const store = loadCredentialStore()
      const encrypted = store[this.keyName]

      if (!encrypted) return null

      return decrypt(encrypted)
    } catch (error) {
      console.error('Failed to retrieve API key:', error)
      return null
    }
  }

  async deleteApiKey(): Promise<boolean> {
    try {
      const store = loadCredentialStore()
      delete store[this.keyName]
      saveCredentialStore(store)
      return true
    } catch (error) {
      console.error('Failed to delete API key:', error)
      return false
    }
  }

  async hasApiKey(): Promise<boolean> {
    const key = await this.getApiKey()
    return key !== null && key.length > 0
  }
}

const SERVICE_NAME = 'com.vulnasstool.apikeys'

export function createApiKeyStorage(keyType: ApiKeyType): ApiKeyStorage {
  return new SecureApiKeyStorage({
    service: SERVICE_NAME,
    account: keyType,
  })
}

export function isSafeStorageAvailable(): boolean {
  return true
}

export async function getAllStoredApiKeys(): Promise<{
  nvd: string | null
  osv: string | null
  github: string | null
}> {
  const nvd = createApiKeyStorage('nvd')
  const osv = createApiKeyStorage('osv')
  const github = createApiKeyStorage('github')

  return {
    nvd: await nvd.getApiKey(),
    osv: await osv.getApiKey(),
    github: await github.getApiKey(),
  }
}

export async function needsMigration(): Promise<boolean> {
  return false
}

export async function migratePlaintextKeys(): Promise<{
  success: boolean
  migrated: string[]
  failed: string[]
}> {
  return { success: true, migrated: [], failed: [] }
}

export function initializeStorage(): void {
  loadCredentialStore()
  tryImportExportedKeys()
}
