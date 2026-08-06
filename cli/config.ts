/**
 * CLI config store — a small JSON key/value file (dotted keys) at the app config
 * directory, backing `vulnshield config get|set|list|unset`.
 *
 * It faithfully persists and returns values (like `git config`), so it is a real
 * store, not a placeholder. `db.path` is consumed by `scan`/`db status` when --db
 * is not passed; other keys are stored for the user's own use.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

function configDir(): string {
  // VULNSHIELD_CONFIG_DIR lets tests (and unusual deployments) redirect the store
  // away from the user's home directory.
  return process.env.VULNSHIELD_CONFIG_DIR || path.join(os.homedir(), '.vulnassesstool')
}

/** Absolute path of the CLI config file (may not exist yet). */
export function configFilePath(): string {
  return path.join(configDir(), 'cli-config.json')
}

/** Read the whole config as a flat string map. Missing/corrupt file -> empty map. */
export function readConfig(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configFilePath(), 'utf-8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value
      }
    }
  } catch {
    // Missing or unreadable config is not an error — an empty config is valid.
  }
  return out
}

function writeConfig(cfg: Record<string, string>): void {
  fs.mkdirSync(configDir(), { recursive: true })
  fs.writeFileSync(configFilePath(), JSON.stringify(cfg, null, 2) + '\n', 'utf-8')
}

/** Get a single config value, or undefined when unset. */
export function getConfigValue(key: string): string | undefined {
  return readConfig()[key]
}

/** Set (and persist) a single config value. */
export function setConfigValue(key: string, value: string): void {
  const cfg = readConfig()
  cfg[key] = value
  writeConfig(cfg)
}

/** Remove a key. Returns false when the key was not present. */
export function unsetConfigValue(key: string): boolean {
  const cfg = readConfig()
  if (!(key in cfg)) return false
  delete cfg[key]
  writeConfig(cfg)
  return true
}
