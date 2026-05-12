/**
 * CLI Argument Parser
 * Parses command-line arguments into structured command objects
 */

export interface CliCommand {
  command?: string
  subcommand?: string
  positional: string[]
  flags: Record<string, unknown>
}

/**
 * Converts kebab-case flag name to camelCase
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * Parses command-line arguments into a structured object
 */
export function parseArgs(args: string[]): CliCommand {
  const result: CliCommand = {
    positional: [],
    flags: {},
  }

  let i = 0
  let foundCommand = false
  let foundSubcommand = false

  while (i < args.length) {
    const arg = args[i]

    if (arg.startsWith('--')) {
      // Long flag
      const flagName = arg.slice(2)
      const camelName = kebabToCamel(flagName)

      // Boolean flags (no value)
      const booleanFlags = ['verbose', 'help', 'version', 'check-kev', 'nvd', 'osv', 'json', 'quiet']

      if (booleanFlags.includes(flagName)) {
        result.flags[camelName] = true
        i++
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        // Flag with value
        const value = args[i + 1]

        // Parse numeric values
        if (flagName === 'min-epss') {
          result.flags[camelName] = parseFloat(value)
        } else {
          result.flags[camelName] = value
        }
        i += 2
      } else {
        // Boolean flag without value
        result.flags[camelName] = true
        i++
      }
    } else if (arg.startsWith('-') && !arg.startsWith('--')) {
      // Short flag
      const flagName = arg.slice(1)

      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        result.flags[flagName] = args[i + 1]
        i += 2
      } else {
        result.flags[flagName] = true
        i++
      }
    } else {
      // Positional argument
      if (!foundCommand) {
        result.command = arg
        foundCommand = true
      } else if (!foundSubcommand && (result.command === 'db' || result.command === 'config')) {
        result.subcommand = arg
        foundSubcommand = true
      } else {
        result.positional.push(arg)
      }
      i++
    }
  }

  return result
}
