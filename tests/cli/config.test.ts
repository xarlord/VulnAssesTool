import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getConfigValue, setConfigValue, unsetConfigValue, readConfig, configFilePath } from '../../cli/config.js'

describe('CLI config store', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cfg-'))
    process.env.VULNSHIELD_CONFIG_DIR = dir
  })

  afterEach(() => {
    delete process.env.VULNSHIELD_CONFIG_DIR
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('round-trips a value through set/get', () => {
    expect(getConfigValue('db.path')).toBeUndefined()
    setConfigValue('db.path', '/tmp/nvd.db')
    // WHY: `config set` must actually persist so `scan`/`db status` can read db.path back.
    expect(getConfigValue('db.path')).toBe('/tmp/nvd.db')
  })

  it('persists all keys and reads them back', () => {
    setConfigValue('b.key', '2')
    setConfigValue('a.key', '1')
    expect(readConfig()).toEqual({ 'a.key': '1', 'b.key': '2' })
  })

  it('unset removes a key and reports whether it existed', () => {
    setConfigValue('x', '1')
    expect(unsetConfigValue('x')).toBe(true)
    expect(getConfigValue('x')).toBeUndefined()
    expect(unsetConfigValue('missing')).toBe(false)
  })

  it('treats a missing or corrupt config file as empty (no throw)', () => {
    expect(readConfig()).toEqual({})
    fs.writeFileSync(configFilePath(), '{ not json', 'utf-8')
    expect(readConfig()).toEqual({})
  })
})
