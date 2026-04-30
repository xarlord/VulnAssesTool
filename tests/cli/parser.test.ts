import { describe, it, expect } from 'vitest'
import { parseArgs, CliCommand } from '../../cli/parser.js'

describe('CLI Argument Parser', () => {
  describe('parseArgs', () => {
    it('parses scan command with SBOM path', () => {
      const args = ['scan', 'sbom.json']
      const result = parseArgs(args)

      expect(result.command).toBe('scan')
      expect(result.positional).toEqual(['sbom.json'])
    })

    it('parses scan command with --output flag', () => {
      const args = ['scan', 'sbom.json', '--output', 'results.json']
      const result = parseArgs(args)

      expect(result.command).toBe('scan')
      expect(result.flags.output).toBe('results.json')
    })

    it('parses scan command with --format flag', () => {
      const args = ['scan', 'sbom.json', '--format', 'sarif']
      const result = parseArgs(args)

      expect(result.flags.format).toBe('sarif')
    })

    it('parses --fail-on severity threshold', () => {
      const args = ['scan', 'sbom.json', '--fail-on', 'high']
      const result = parseArgs(args)

      expect(result.flags.failOn).toBe('high')
    })

    it('parses --min-epss score', () => {
      const args = ['scan', 'sbom.json', '--min-epss', '0.5']
      const result = parseArgs(args)

      expect(result.flags.minEpss).toBe(0.5)
    })

    it('parses --check-kev boolean flag', () => {
      const args = ['scan', 'sbom.json', '--check-kev']
      const result = parseArgs(args)

      expect(result.flags.checkKev).toBe(true)
    })

    it('parses db sync command', () => {
      const args = ['db', 'sync', '--nvd']
      const result = parseArgs(args)

      expect(result.command).toBe('db')
      expect(result.subcommand).toBe('sync')
      expect(result.flags.nvd).toBe(true)
    })

    it('parses db status command', () => {
      const args = ['db', 'status']
      const result = parseArgs(args)

      expect(result.command).toBe('db')
      expect(result.subcommand).toBe('status')
    })

    it('parses config set command', () => {
      const args = ['config', 'set', 'nvd.api-key', 'MY_KEY']
      const result = parseArgs(args)

      expect(result.command).toBe('config')
      expect(result.subcommand).toBe('set')
      expect(result.positional).toEqual(['nvd.api-key', 'MY_KEY'])
    })

    it('parses --help flag', () => {
      const args = ['--help']
      const result = parseArgs(args)

      expect(result.flags.help).toBe(true)
    })

    it('parses --version flag', () => {
      const args = ['--version']
      const result = parseArgs(args)

      expect(result.flags.version).toBe(true)
    })

    it('parses verbose flag', () => {
      const args = ['scan', 'sbom.json', '--verbose']
      const result = parseArgs(args)

      expect(result.flags.verbose).toBe(true)
    })

    it('parses multiple flags together', () => {
      const args = [
        'scan',
        'sbom.json',
        '--output',
        'results.sarif',
        '--format',
        'sarif',
        '--fail-on',
        'critical',
        '--min-epss',
        '0.3',
        '--check-kev',
        '--verbose',
      ]
      const result = parseArgs(args)

      expect(result.command).toBe('scan')
      expect(result.positional).toEqual(['sbom.json'])
      expect(result.flags.output).toBe('results.sarif')
      expect(result.flags.format).toBe('sarif')
      expect(result.flags.failOn).toBe('critical')
      expect(result.flags.minEpss).toBe(0.3)
      expect(result.flags.checkKev).toBe(true)
      expect(result.flags.verbose).toBe(true)
    })

    it('returns empty command for no args', () => {
      const args: string[] = []
      const result = parseArgs(args)

      expect(result.command).toBeUndefined()
    })

    it('handles unknown flags gracefully', () => {
      const args = ['scan', 'sbom.json', '--unknown-flag', 'value']
      const result = parseArgs(args)

      expect(result.flags.unknownFlag).toBe('value')
    })

    it('parses short flag with value', () => {
      const args = ['scan', 'sbom.json', '-o', 'output.json']
      const result = parseArgs(args)

      expect(result.flags.o).toBe('output.json')
    })

    it('parses short flag without value as boolean', () => {
      const args = ['scan', 'sbom.json', '-v']
      const result = parseArgs(args)

      expect(result.flags.v).toBe(true)
    })

    it('parses short flag at end of args', () => {
      const args = ['scan', 'sbom.json', '-q']
      const result = parseArgs(args)

      expect(result.flags.q).toBe(true)
    })

    it('handles short flag followed by another flag', () => {
      const args = ['scan', 'sbom.json', '-v', '-q']
      const result = parseArgs(args)

      expect(result.flags.v).toBe(true)
      expect(result.flags.q).toBe(true)
    })

    it('handles long flag without value as boolean', () => {
      const args = ['scan', 'sbom.json', '--custom-flag']
      const result = parseArgs(args)

      expect(result.flags.customFlag).toBe(true)
    })
  })
})
