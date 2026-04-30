/**
 * Output Capture Utility
 *
 * Captures and streams stdout/stderr from child processes with real-time parsing
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'

export interface OutputCaptureOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeout?: number
  onOutput?: (line: string, type: 'stdout' | 'stderr') => void
}

export interface CapturedOutput {
  stdout: string
  stderr: string
  combined: string
  exitCode: number | null
  signal: string | null
  timedOut: boolean
  duration: number
}

export class OutputCapture extends EventEmitter {
  private process: ChildProcess | null = null
  private stdout = ''
  private stderr = ''
  private combined = ''
  private startTime = 0
  private timeoutId: NodeJS.Timeout | null = null
  private timedOut = false

  /**
   * Execute a command and capture all output
   */
  async execute(command: string, args: string[] = [], options: OutputCaptureOptions = {}): Promise<CapturedOutput> {
    return new Promise((resolve, reject) => {
      this.startTime = Date.now()
      this.stdout = ''
      this.stderr = ''
      this.combined = ''
      this.timedOut = false

      // Spawn the process
      this.process = spawn(command, args, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env },
        shell: true,
        windowsHide: true,
      })

      // Set up timeout
      if (options.timeout) {
        this.timeoutId = setTimeout(() => {
          this.timedOut = true
          this.kill()
        }, options.timeout)
      }

      // Capture stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.stdout += text
        this.combined += text

        // Emit for real-time processing
        const lines = text.split('\n').filter(Boolean)
        for (const line of lines) {
          this.emit('stdout', line)
          options.onOutput?.(line, 'stdout')
        }
      })

      // Capture stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        this.stderr += text
        this.combined += text

        // Emit for real-time processing
        const lines = text.split('\n').filter(Boolean)
        for (const line of lines) {
          this.emit('stderr', line)
          options.onOutput?.(line, 'stderr')
        }
      })

      // Handle process completion
      this.process.on('close', (code, signal) => {
        this.clearTimeout()

        const result: CapturedOutput = {
          stdout: this.stdout,
          stderr: this.stderr,
          combined: this.combined,
          exitCode: code,
          signal,
          timedOut: this.timedOut,
          duration: Date.now() - this.startTime,
        }

        this.emit('complete', result)
        resolve(result)
      })

      // Handle errors
      this.process.on('error', (error) => {
        this.clearTimeout()
        this.emit('error', error)
        reject(error)
      })
    })
  }

  /**
   * Kill the running process
   */
  kill(): void {
    if (this.process) {
      // On Windows, use taskkill for forceful termination
      if (process.platform === 'win32' && this.process.pid) {
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'])
      } else {
        this.process.kill('SIGTERM')
      }
      this.process = null
    }
    this.clearTimeout()
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * Get current combined output
   */
  getOutput(): string {
    return this.combined
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.timedOut
  }
}

/**
 * Execute a command with output capture (convenience function)
 */
export async function captureCommand(
  command: string,
  args: string[] = [],
  options: OutputCaptureOptions = {},
): Promise<CapturedOutput> {
  const capture = new OutputCapture()
  return capture.execute(command, args, options)
}
