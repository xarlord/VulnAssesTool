import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import * as os from 'node:os'

describe('Server Config', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('default values', () => {
    afterEach(() => {
      delete process.env.PORT
      delete process.env.DATA_DIR
    })

    it('should have PORT defaulting to 3001', async () => {
      delete process.env.PORT
      const { config } = await import('./config')
      expect(config.PORT).toBe(3001)
    })

    it('should have HOST as 127.0.0.1', async () => {
      const { config } = await import('./config')
      expect(config.HOST).toBe('127.0.0.1')
    })

    it('should have DATA_DIR based on home directory by default', async () => {
      delete process.env.DATA_DIR
      const { config } = await import('./config')
      expect(config.DATA_DIR).toBe(path.join(os.homedir(), '.vulnassesstool'))
    })

    it('should have NODE_ENV set', async () => {
      const { config } = await import('./config')
      expect(config.NODE_ENV).toBeDefined()
      expect(typeof config.NODE_ENV).toBe('string')
    })

    it('should start with empty derived paths', async () => {
      const { config } = await import('./config')
      expect(config.DB_PATH).toBe('')
      expect(config.BACKUP_DIR).toBe('')
      expect(config.LOG_DIR).toBe('')
      expect(config.TOKEN_PATH).toBe('')
      expect(config.EXPORTED_KEYS_PATH).toBe('')
      expect(config.CREDENTIALS_PATH).toBe('')
    })
  })

  describe('initializePaths', () => {
    it('should derive all paths from DATA_DIR', async () => {
      const { config, initializePaths } = await import('./config')
      config.DATA_DIR = '/test/data'
      initializePaths()

      expect(config.DB_PATH).toBe(path.join('/test/data', 'nvd-data.db'))
      expect(config.BACKUP_DIR).toBe(path.join('/test/data', 'backups'))
      expect(config.LOG_DIR).toBe(path.join('/test/data', 'logs'))
      expect(config.TOKEN_PATH).toBe(path.join('/test/data', '.server-token'))
      expect(config.EXPORTED_KEYS_PATH).toBe(path.join('/test/data', 'exported-keys.json'))
      expect(config.CREDENTIALS_PATH).toBe(path.join('/test/data', 'credentials.json'))
    })

    it('should update derived paths when DATA_DIR changes', async () => {
      const { config, initializePaths } = await import('./config')

      config.DATA_DIR = '/first'
      initializePaths()
      expect(config.DB_PATH).toBe(path.join('/first', 'nvd-data.db'))

      config.DATA_DIR = '/second'
      initializePaths()
      expect(config.DB_PATH).toBe(path.join('/second', 'nvd-data.db'))
    })

    it('should derive paths with platform-specific separators', async () => {
      const { config, initializePaths } = await import('./config')
      config.DATA_DIR = '/custom/path'
      initializePaths()

      expect(config.DB_PATH).toMatch(/custom.path/)
      expect(config.BACKUP_DIR).toMatch(/custom.path/)
      expect(config.LOG_DIR).toMatch(/custom.path/)
      expect(config.TOKEN_PATH).toMatch(/custom.path/)
    })
  })

  describe('isDev', () => {
    it('should return true when NODE_ENV is development', async () => {
      const { config, isDev } = await import('./config')
      config.NODE_ENV = 'development'
      expect(isDev()).toBe(true)
    })

    it('should return false when NODE_ENV is production', async () => {
      const { config, isDev } = await import('./config')
      config.NODE_ENV = 'production'
      expect(isDev()).toBe(false)
    })

    it('should return false when NODE_ENV is test', async () => {
      const { config, isDev } = await import('./config')
      config.NODE_ENV = 'test'
      expect(isDev()).toBe(false)
    })

    it('should return false for arbitrary NODE_ENV values', async () => {
      const { config, isDev } = await import('./config')
      config.NODE_ENV = 'staging'
      expect(isDev()).toBe(false)
    })
  })

  describe('env overrides', () => {
    afterEach(() => {
      delete process.env.PORT
      delete process.env.DATA_DIR
    })

    it('should use PORT env variable when set', async () => {
      process.env.PORT = '5000'
      const { config } = await import('./config')
      expect(config.PORT).toBe(5000)
    })

    it('should use DATA_DIR env variable when set', async () => {
      process.env.DATA_DIR = '/tmp/custom-data'
      const { config } = await import('./config')
      expect(config.DATA_DIR).toBe('/tmp/custom-data')
    })

    it('should fall back to default PORT when env not set', async () => {
      delete process.env.PORT
      const { config } = await import('./config')
      expect(config.PORT).toBe(3001)
    })

    it('should fall back to default DATA_DIR when env not set', async () => {
      delete process.env.DATA_DIR
      const { config } = await import('./config')
      expect(config.DATA_DIR).toBe(path.join(os.homedir(), '.vulnassesstool'))
    })
  })
})
