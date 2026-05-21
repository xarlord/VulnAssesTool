/**
 * Server Configuration
 *
 * Centralizes all path/port configuration.
 * Replaces Electron's app.getPath('userData') with configurable paths.
 */

import * as os from 'node:os'
import * as path from 'node:path'

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: '127.0.0.1',
  DATA_DIR: process.env.DATA_DIR || path.join(os.homedir(), '.vulnassesstool'),
  DB_PATH: '',
  BACKUP_DIR: '',
  LOG_DIR: '',
  TOKEN_PATH: '',
  EXPORTED_KEYS_PATH: '',
  CREDENTIALS_PATH: '',
  NODE_ENV: process.env.NODE_ENV || 'development',
}

export function initializePaths(): void {
  config.DB_PATH = path.join(config.DATA_DIR, 'nvd-data.db')
  config.BACKUP_DIR = path.join(config.DATA_DIR, 'backups')
  config.LOG_DIR = path.join(config.DATA_DIR, 'logs')
  config.TOKEN_PATH = path.join(config.DATA_DIR, '.server-token')
  config.EXPORTED_KEYS_PATH = path.join(config.DATA_DIR, 'exported-keys.json')
  config.CREDENTIALS_PATH = path.join(config.DATA_DIR, 'credentials.json')
}

export function isDev(): boolean {
  return config.NODE_ENV === 'development'
}
