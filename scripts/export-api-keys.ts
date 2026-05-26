/**
 * One-Time Key Export Script
 *
 * Runs under Electron to decrypt all stored API keys from electron.safeStorage
 * and export them as plaintext JSON to ~/.vulnassesstool/exported-keys.json.
 *
 * This MUST be run before Electron is removed from the project.
 *
 * Usage: npx electron . --export-keys
 */

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import * as os from 'node:os'

const SERVICE_NAME = 'com.vulnasstool.apikeys'
const ENCRYPTION_PREFIX = 'enc:'

interface ExportedKeys {
  nvd: string | null
  osv: string | null
  github: string | null
  exportedAt: string
  machine: string
}

function readCredentialStore(): Record<string, string> {
  const userDataPath = app.getPath('userData')
  const filePath = path.join(userDataPath, 'secure-credentials.json')

  if (!existsSync(filePath)) {
    console.log('No credential store found at:', filePath)
    return {}
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (err) {
    console.error('Failed to read credential store:', err)
    return {}
  }
}

function decryptKey(encryptedValue: string): string | null {
  try {
    if (!encryptedValue.startsWith(ENCRYPTION_PREFIX)) {
      return encryptedValue
    }

    if (!safeStorage.isEncryptionAvailable()) {
      console.error('safeStorage is not available — cannot decrypt keys')
      return null
    }

    const base64Part = encryptedValue.slice(ENCRYPTION_PREFIX.length)
    const encrypted = Buffer.from(base64Part, 'base64')
    const decrypted = safeStorage.decryptString(encrypted)
    return Buffer.from(decrypted, 'base64').toString('utf8')
  } catch (err) {
    console.error('Failed to decrypt key:', err)
    return null
  }
}

function exportKeys(): void {
  const data = readCredentialStore()

  const keyTypes: Array<'nvd' | 'osv' | 'github'> = ['nvd', 'osv', 'github']
  const exported: ExportedKeys = {
    nvd: null,
    osv: null,
    github: null,
    exportedAt: new Date().toISOString(),
    machine: os.hostname(),
  }

  let foundAny = false

  for (const keyType of keyTypes) {
    const storeKey = `${SERVICE_NAME}.${keyType}`
    const storedValue = data[storeKey]

    if (storedValue) {
      const decrypted = decryptKey(storedValue)
      if (decrypted) {
        exported[keyType] = decrypted
        foundAny = true
        console.log(`[OK] Exported ${keyType} key (${decrypted.length} chars)`)
      } else {
        console.warn(`[WARN] Could not decrypt ${keyType} key`)
      }
    } else {
      console.log(`[SKIP] No ${keyType} key found in store`)
    }
  }

  const outputDir = path.join(os.homedir(), '.vulnassesstool')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, 'exported-keys.json')
  writeFileSync(outputPath, JSON.stringify(exported, null, 2), 'utf-8')

  if (foundAny) {
    console.log(`\nExported ${foundAny ? 'some' : 'no'} keys to: ${outputPath}`)
  } else {
    console.log('\nNo encrypted keys found. Empty export file written to:', outputPath)
  }
}

app.whenReady().then(() => {
  console.log('=== VulnAssessTool Key Export ===')
  console.log('Decrypting API keys from Electron safeStorage...\n')

  try {
    exportKeys()
  } catch (err) {
    console.error('Export failed:', err)
    app.exit(1)
  }

  console.log('\nDone. You can safely proceed with Electron removal.')
  app.exit(0)
})
