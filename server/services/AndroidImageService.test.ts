/**
 * Tests for the Android Image Service: image-type detection (isAndroidImageDir) and the
 * generateSbom unpack+scan pipeline.
 *
 * generateSbom shells out to WSL2/bash against a multi-GB image in production, so here the
 * `spawn`-ed child process is mocked — these tests pin down the routing/progress/error/parsing
 * logic around that child process, not the real unpack script or a real WSL2 install. The
 * script's actual behavior is still verified manually against a real device image (see
 * docs/sbom-cataloging-guidelines.md §1).
 *
 * Not covered here: the `!fs.existsSync(script)` "unpack script missing" guard. Exercising it
 * would need fs partially mocked (real for isAndroidImageDir's temp-file checks below, faked for
 * just that one path), and vitest's `importOriginal` on a Node builtin errors under this project's
 * global jsdom test environment (Vite resolves it to a browser-external stub) — see vitest.config.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Controllable stand-in for child_process.spawn: each call records a FakeChildProcess that a test
// can drive via its stdout/stderr/error/close events. Hoisted so it is visible inside the vi.mock
// factory below (mirrors the execFile-handler pattern in ContainerService.test.ts, adapted for
// spawn's event-based API instead of execFile's callback API). Built on a hand-rolled on/emit pub-sub
// rather than node:events' EventEmitter: vi.hoisted's callback runs before the module's own imports
// are initialized, so a real import can't be referenced inside it.
const spawnState = vi.hoisted(() => {
  function createEmitter() {
    const listeners = new Map<string, Array<(...eventArgs: unknown[]) => void>>()
    return {
      on(event: string, listener: (...eventArgs: unknown[]) => void): void {
        const existing = listeners.get(event) ?? []
        existing.push(listener)
        listeners.set(event, existing)
      },
      emit(event: string, ...eventArgs: unknown[]): void {
        for (const listener of listeners.get(event) ?? []) listener(...eventArgs)
      },
    }
  }

  function createFakeChildProcess(command: string, args: string[]) {
    return {
      ...createEmitter(),
      command,
      args,
      kill: vi.fn(),
      stdout: { ...createEmitter(), setEncoding: () => {} },
      stderr: { ...createEmitter(), setEncoding: () => {} },
    }
  }

  return {
    createFakeChildProcess,
    children: [] as Array<ReturnType<typeof createFakeChildProcess>>,
  }
})

vi.mock('node:child_process', () => {
  const spawn = (command: string, args: string[]) => {
    const child = spawnState.createFakeChildProcess(command, args)
    spawnState.children.push(child)
    return child
  }
  return { spawn, default: { spawn } }
})

// Imported after the mock above is registered (see ContainerService.test.ts / SyftService.test.ts
// for the same pattern): generateSbom shells out via `spawn`, which must be mocked before the
// module under test is loaded.
const { isAndroidImageDir, AndroidImageService, AndroidImageError } = await import('./AndroidImageService.js')

/** Runs `fn` with `process.platform` temporarily forced to `value`, regardless of the real host OS. */
async function withPlatform<T>(value: NodeJS.Platform, fn: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value })
  try {
    return await fn()
  } finally {
    Object.defineProperty(process, 'platform', { value: original })
  }
}

/** The most recently spawned FakeChildProcess, or throws if generateSbom didn't spawn one. */
function lastSpawnedChild(): ReturnType<typeof spawnState.createFakeChildProcess> {
  const child = spawnState.children[spawnState.children.length - 1]
  if (!child) throw new Error('no child process was spawned')
  return child
}

/** Awaits `promise`, resolving to the rejection reason instead of throwing (or undefined if it resolved). */
async function captureError<T>(promise: Promise<T>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

afterEach(() => {
  spawnState.children.length = 0
})

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vat-android-detect-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Write a file whose first bytes are `magic`, optionally at a byte offset. */
function writeWithMagic(name: string, magic: Buffer, offset = 0): void {
  const buf = Buffer.alloc(offset + magic.length)
  magic.copy(buf, offset)
  fs.writeFileSync(path.join(dir, name), buf)
}

describe('isAndroidImageDir', () => {
  it('detects a sparse super.img (magic 0x3aff26ed)', () => {
    writeWithMagic('super.img', Buffer.from([0x3a, 0xff, 0x26, 0xed]))
    expect(isAndroidImageDir(dir)).toBe(true)
  })

  it('detects a raw LP super.img (gDla geometry magic at offset 4096)', () => {
    writeWithMagic('super.img', Buffer.from([0x67, 0x44, 0x6c, 0x61]), 4096)
    expect(isAndroidImageDir(dir)).toBe(true)
  })

  it('detects an Android boot.img (ANDROID! magic)', () => {
    writeWithMagic('boot.img', Buffer.from('ANDROID!', 'ascii'))
    expect(isAndroidImageDir(dir)).toBe(true)
  })

  it('ignores a super.img with an unrelated header (does not route to unpack)', () => {
    writeWithMagic('super.img', Buffer.from([0x00, 0x01, 0x02, 0x03]))
    expect(isAndroidImageDir(dir)).toBe(false)
  })

  it('ignores a boot.img with an unrelated header (does not route to unpack)', () => {
    writeWithMagic('boot.img', Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]))
    expect(isAndroidImageDir(dir)).toBe(false)
  })

  it('returns false for an ordinary directory (e.g. an extracted rootfs)', () => {
    fs.writeFileSync(path.join(dir, 'README.txt'), 'hello')
    fs.mkdirSync(path.join(dir, 'usr'))
    expect(isAndroidImageDir(dir)).toBe(false)
  })

  it('returns false for a non-existent path', () => {
    expect(isAndroidImageDir(path.join(dir, 'nope'))).toBe(false)
  })

  it('returns false when given a file instead of a directory', () => {
    const file = path.join(dir, 'super.img')
    writeWithMagic('super.img', Buffer.from([0x3a, 0xff, 0x26, 0xed]))
    expect(isAndroidImageDir(file)).toBe(false)
  })

  it('treats a super.img that is actually a directory as unreadable (no crash, no false match)', () => {
    // WHY: readMagic opens the path as a file; a directory (e.g. from a botched extraction)
    // must be handled as "can't read a magic number here", not throw out of isAndroidImageDir.
    fs.mkdirSync(path.join(dir, 'super.img'))
    expect(isAndroidImageDir(dir)).toBe(false)
  })
})

describe('AndroidImageService.generateSbom — platform-specific command/args', () => {
  it('invokes wsl.exe with the configured distro and mounts a Windows drive-letter imageDir under /mnt', async () => {
    const originalDistro = process.env.VAT_WSL_DISTRO
    process.env.VAT_WSL_DISTRO = 'Debian'
    try {
      await withPlatform('win32', async () => {
        const svc = new AndroidImageService()
        const promise = svc.generateSbom('D:\\android\\prebuilt')
        const child = lastSpawnedChild()

        expect(child.command).toBe('wsl.exe')
        expect(child.args.slice(0, 4)).toEqual(['-d', 'Debian', '-e', 'bash'])
        // toWslPath must mount the drive-letter path under /mnt/<lowercase drive>/...
        expect(child.args[5]).toBe('/mnt/d/android/prebuilt')

        child.emit('close', 0)
        await captureError(promise)
      })
    } finally {
      if (originalDistro === undefined) delete process.env.VAT_WSL_DISTRO
      else process.env.VAT_WSL_DISTRO = originalDistro
    }
  })

  it('defaults to the "Ubuntu" WSL distro when VAT_WSL_DISTRO is unset', async () => {
    const originalDistro = process.env.VAT_WSL_DISTRO
    delete process.env.VAT_WSL_DISTRO
    try {
      await withPlatform('win32', async () => {
        const svc = new AndroidImageService()
        const promise = svc.generateSbom(dir)

        expect(lastSpawnedChild().args[1]).toBe('Ubuntu')

        lastSpawnedChild().emit('close', 0)
        await captureError(promise)
      })
    } finally {
      if (originalDistro !== undefined) process.env.VAT_WSL_DISTRO = originalDistro
    }
  })

  it('passes an already-POSIX-style imageDir through unchanged (no drive letter to mount)', async () => {
    await withPlatform('win32', async () => {
      const svc = new AndroidImageService()
      const promise = svc.generateSbom('/already/posix/style')
      const child = lastSpawnedChild()

      expect(child.args[5]).toBe('/already/posix/style')

      child.emit('close', 0)
      await captureError(promise)
    })
  })

  it('invokes bash directly with the script and image dir as plain positional args on non-Windows', async () => {
    await withPlatform('linux', async () => {
      const svc = new AndroidImageService()
      const promise = svc.generateSbom(dir)
      const child = lastSpawnedChild()

      expect(child.command).toBe('bash')
      expect(child.args[1]).toBe(dir)

      child.emit('close', 0)
      await captureError(promise)
    })
  })
})

describe('AndroidImageService.generateSbom — progress reporting', () => {
  it('reports start/phase/done via onProgress, mapping only PROGRESS:-prefixed stderr lines', async () => {
    const onProgress = vi.fn()
    const svc = new AndroidImageService()
    const cyclonedx = JSON.stringify({ bomFormat: 'CycloneDX', components: [] })

    const promise = svc.generateSbom(dir, onProgress)
    const child = lastSpawnedChild()

    child.stderr.emit('data', 'PROGRESS:unpacking super.img\nnoise: not a progress line\n')
    child.stdout.emit('data', cyclonedx)
    child.emit('close', 0)

    await expect(promise).resolves.toBe(cyclonedx)
    expect(onProgress).toHaveBeenCalledWith('Starting Android image unpack…')
    expect(onProgress).toHaveBeenCalledWith('unpacking super.img')
    expect(onProgress).toHaveBeenCalledWith('Android image SBOM ready')
    // A stderr line without the PROGRESS: prefix must never reach the caller as a phase update.
    expect(onProgress).not.toHaveBeenCalledWith(expect.stringContaining('noise'))
  })

  it('completes the full pipeline when no onProgress callback is supplied', async () => {
    const svc = new AndroidImageService()
    const cyclonedx = JSON.stringify({ bomFormat: 'CycloneDX', components: [] })

    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stderr.emit('data', 'PROGRESS:unpacking\n')
    child.stdout.emit('data', cyclonedx)
    child.emit('close', 0)

    await expect(promise).resolves.toBe(cyclonedx)
  })

  it('accumulates stdout arriving across multiple data events before parsing', async () => {
    const svc = new AndroidImageService()
    const cyclonedx = JSON.stringify({ bomFormat: 'CycloneDX', components: [{ name: 'x' }] })

    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stdout.emit('data', cyclonedx.slice(0, 10))
    child.stdout.emit('data', cyclonedx.slice(10))
    child.emit('close', 0)

    await expect(promise).resolves.toBe(cyclonedx)
  })
})

describe('AndroidImageService.generateSbom — spawn/start failure', () => {
  it('maps an ENOENT spawn error to a no_wsl error with the Windows-specific message', async () => {
    await withPlatform('win32', async () => {
      const svc = new AndroidImageService()
      const promise = svc.generateSbom(dir)
      const child = lastSpawnedChild()

      child.emit('error', Object.assign(new Error('spawn wsl.exe ENOENT'), { code: 'ENOENT' }))

      const caught = await captureError(promise)
      expect(caught).toBeInstanceOf(AndroidImageError)
      expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('no_wsl')
      expect((caught as Error).message).toMatch(/WSL2 is required/)
    })
  })

  it('maps an ENOENT spawn error to a no_wsl error with the bash-specific message on non-Windows', async () => {
    await withPlatform('linux', async () => {
      const svc = new AndroidImageService()
      const promise = svc.generateSbom(dir)
      const child = lastSpawnedChild()

      child.emit('error', Object.assign(new Error('spawn bash ENOENT'), { code: 'ENOENT' }))

      const caught = await captureError(promise)
      expect(caught).toBeInstanceOf(AndroidImageError)
      expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('no_wsl')
      expect((caught as Error).message).toMatch(/bash was not found/)
    })
  })

  it('maps a non-ENOENT spawn error to unpack_failed, carrying the original message', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.emit('error', new Error('EACCES: permission denied'))

    const caught = await captureError(promise)
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('unpack_failed')
    expect((caught as Error).message).toBe('Failed to start Android unpack: EACCES: permission denied')
  })

  it('ignores a spurious error event after the process already settled successfully', async () => {
    // WHY: a late error after a clean exit must not flip an already-successful scan to a failure.
    const svc = new AndroidImageService()
    const cyclonedx = JSON.stringify({ bomFormat: 'CycloneDX', components: [] })
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stdout.emit('data', cyclonedx)
    child.emit('close', 0)
    child.emit('error', new Error('late noise'))

    await expect(promise).resolves.toBe(cyclonedx)
  })

  it('ignores a close event after the process already settled via a spawn error', async () => {
    // WHY: symmetric to the case above — whichever event settles the promise first must win,
    // regardless of which handler (error vs close) fires second.
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.emit('error', Object.assign(new Error('spawn bash ENOENT'), { code: 'ENOENT' }))
    child.emit('close', 0)

    const caught = await captureError(promise)
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('no_wsl')
  })
})

describe('AndroidImageService.generateSbom — unpack timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('kills the child and rejects with unpack_failed after 15 minutes of silence', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()
    const captured = captureError(promise)

    await vi.advanceTimersByTimeAsync(900_000)

    const caught = await captured
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('unpack_failed')
    expect((caught as Error).message).toBe('Android image unpack timed out')
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('does not kill the child if it already closed successfully before the deadline', async () => {
    const svc = new AndroidImageService()
    const cyclonedx = JSON.stringify({ bomFormat: 'CycloneDX', components: [] })
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stdout.emit('data', cyclonedx)
    child.emit('close', 0)
    await expect(promise).resolves.toBe(cyclonedx)

    await vi.advanceTimersByTimeAsync(900_000)

    expect(child.kill).not.toHaveBeenCalled()
  })
})

describe('AndroidImageService.generateSbom — stdout size guard', () => {
  it('kills the child and rejects when stdout exceeds the 100MB buffer cap', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stdout.emit('data', 'x'.repeat(100 * 1024 * 1024 + 1024))

    const caught = await captureError(promise)
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('unpack_failed')
    expect((caught as Error).message).toMatch(/exceeded the maximum buffer size/)
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('ignores further oversized chunks once already settled (no double kill/reject)', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()
    const hugeChunk = 'x'.repeat(100 * 1024 * 1024 + 1024)

    child.stdout.emit('data', hugeChunk)
    child.stdout.emit('data', hugeChunk)

    await captureError(promise)
    expect(child.kill).toHaveBeenCalledTimes(1)
  })
})

describe('AndroidImageService.generateSbom — exit code handling', () => {
  it('rejects with unpack_failed including the exit code and the last stderr lines on non-zero exit', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stderr.emit('data', 'line1\nline2\nline3\nline4\n')
    child.emit('close', 1)

    const caught = await captureError(promise)
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('unpack_failed')
    expect((caught as Error).message).toBe('Android unpack failed (exit 1). line2 line3 line4')
  })
})

describe('AndroidImageService.generateSbom — output validation', () => {
  it('rejects with invalid_output when stdout is not JSON at all', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stdout.emit('data', 'not json output')
    child.emit('close', 0)

    const caught = await captureError(promise)
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('invalid_output')
    expect((caught as Error).message).toMatch(/did not produce valid CycloneDX JSON/)
  })

  it('rejects with invalid_output when the JSON parses but is not a CycloneDX document', async () => {
    const svc = new AndroidImageService()
    const promise = svc.generateSbom(dir)
    const child = lastSpawnedChild()

    child.stdout.emit('data', JSON.stringify({ hello: 'world' }))
    child.emit('close', 0)

    const caught = await captureError(promise)
    expect(caught).toBeInstanceOf(AndroidImageError)
    expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('invalid_output')
    expect((caught as Error).message).toMatch(/output is not a CycloneDX document/)
  })

  it('falls back to a generic "unknown error" message when a non-Error value is thrown while parsing', async () => {
    // WHY: the catch's `error instanceof Error ? error.message : 'unknown error'` fallback exists
    // for a thrown non-Error value; JSON.parse itself never does this, so force it directly or the
    // fallback text can silently rot.
    const parseSpy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
      throw 'not an Error instance'
    })
    try {
      const svc = new AndroidImageService()
      const promise = svc.generateSbom(dir)
      const child = lastSpawnedChild()

      child.stdout.emit('data', '{}')
      child.emit('close', 0)

      const caught = await captureError(promise)
      expect(caught).toBeInstanceOf(AndroidImageError)
      expect((caught as InstanceType<typeof AndroidImageError>).code).toBe('invalid_output')
      expect((caught as Error).message).toMatch(/unknown error/)
    } finally {
      parseSpy.mockRestore()
    }
  })
})
