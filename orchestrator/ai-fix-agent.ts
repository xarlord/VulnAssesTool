/**
 * AI Fix Agent
 *
 * Uses GLM API (OpenAI-compatible) to analyze errors and automatically fix code
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ErrorMatch, FixResult, FileChange, AIFixContext, WatchdogConfig } from './types'

export interface AIFixAgentOptions {
  config: WatchdogConfig
  onFix?: (result: FixResult) => void
  onProgress?: (message: string) => void
}

interface GLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface GLMResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class AIFixAgent {
  private config: WatchdogConfig
  private apiKey: string | null = null
  private baseUrl: string
  private model: string
  private fixHistory: FixResult[] = []

  constructor(options: AIFixAgentOptions) {
    this.config = options.config

    // Initialize GLM client from environment variables
    this.apiKey = process.env.GLM_API_KEY || this.config.aiFix.apiKey || null
    this.baseUrl = process.env.GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4'
    this.model = process.env.GLM_MODEL || this.config.aiFix.model || 'glm-5'

    if (this.apiKey && this.config.aiFix.enabled) {
      this.log(`GLM API initialized with model: ${this.model}`)
    } else if (!this.apiKey) {
      this.log('WARNING: GLM_API_KEY not set. AI auto-fix is disabled. Set GLM_API_KEY in .env file to enable.')
    } else if (!this.config.aiFix.enabled) {
      this.log('AI auto-fix is disabled in configuration. Set aiFix.enabled to true to enable.')
    }
  }

  /**
   * Check if AI fix is available
   */
  isAvailable(): boolean {
    return this.apiKey !== null
  }

  /**
   * Analyze an error and generate a fix
   */
  async analyzeAndFix(error: ErrorMatch): Promise<FixResult> {
    const errorId = this.generateErrorId(error)

    this.log(`Analyzing error: ${error.message.substring(0, 100)}...`)

    if (!this.isAvailable()) {
      return this.createNoFixResult(errorId, 'AI fix agent not available - set GLM_API_KEY in .env file')
    }

    try {
      // Gather context about the error
      const context = await this.gatherContext(error)

      // Generate fix using GLM
      const fixResult = await this.generateFix(error, context)
      fixResult.errorId = errorId

      // Apply the fix if one was generated
      if (fixResult.fixed && fixResult.changes.length > 0) {
        await this.applyFix(fixResult)
      }

      this.fixHistory.push(fixResult)
      return fixResult
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return this.createNoFixResult(errorId, `Error during fix generation: ${errorMessage}`)
    }
  }

  /**
   * Gather context about the error from the codebase
   */
  private async gatherContext(error: ErrorMatch): Promise<AIFixContext> {
    const relatedFiles = new Map<string, string>()

    // If we have a file path, read the file
    if (error.file) {
      const filePath = this.resolveFilePath(error.file)
      if (filePath && fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        relatedFiles.set(filePath, content)
      }
    }

    // Try to find related files from stack trace
    if (error.stack) {
      const fileMatches = Array.from(error.stack.matchAll(/at .*?\((.+?):(\d+):(\d+)\)/g))
      for (const match of fileMatches) {
        const filePath = this.resolveFilePath(match[1])
        if (filePath && fs.existsSync(filePath) && !relatedFiles.has(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8')
          relatedFiles.set(filePath, content)
        }
      }
    }

    // Get project context
    const projectContext = await this.getProjectContext()

    return {
      error,
      relatedFiles,
      previousFixes: this.fixHistory,
      projectContext,
    }
  }

  /**
   * Generate a fix using GLM API
   */
  private async generateFix(error: ErrorMatch, context: AIFixContext): Promise<FixResult> {
    const messages: GLMMessage[] = [
      {
        role: 'system',
        content: this.getSystemPrompt(),
      },
      {
        role: 'user',
        content: this.buildPrompt(error, context),
      },
    ]

    try {
      const response = await this.callGLMApi(messages)
      const responseText = response.choices[0]?.message?.content || ''

      return this.parseFixResponse(responseText, error)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return this.createNoFixResult('', `GLM API error: ${errorMessage}`)
    }
  }

  /**
   * Call GLM API (OpenAI-compatible endpoint)
   */
  private async callGLMApi(messages: GLMMessage[]): Promise<GLMResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: this.config.aiFix.maxTokens || 4096,
        temperature: 0.3, // Lower temperature for more consistent fixes
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GLM API request failed: ${response.status} - ${errorText}`)
    }

    return (await response.json()) as GLMResponse
  }

  /**
   * Build the prompt for GLM
   */
  private buildPrompt(error: ErrorMatch, context: AIFixContext): string {
    let prompt = `## Error Analysis Request

### Error Details
- **Type**: ${error.type}
- **Message**: ${error.message}
- **Severity**: ${error.severity}
${error.file ? `- **File**: ${error.file}` : ''}
${error.line ? `- **Line**: ${error.line}` : ''}
${error.stack ? `- **Stack Trace**:\n\`\`\`\n${error.stack}\n\`\`\`` : ''}

### Raw Output
\`\`\`
${error.rawOutput.substring(0, 2000)}
\`\`\`

### Related Files
`

    for (const [filePath, content] of context.relatedFiles) {
      const relativePath = path.relative(process.cwd(), filePath)
      prompt += `\n#### ${relativePath}\n\`\`\`typescript\n${content.substring(0, 5000)}\n\`\`\`\n`
    }

    if (context.previousFixes.length > 0) {
      prompt += `\n### Previous Fixes in This Session\n`
      for (const fix of context.previousFixes.slice(-3)) {
        prompt += `- ${fix.explanation}\n`
      }
    }

    prompt += `
### Task
Analyze the error and provide a fix. Output your response in this JSON format:
\`\`\`json
{
  "analysis": "Brief explanation of the root cause",
  "fixable": true/false,
  "changes": [
    {
      "path": "relative/path/to/file.ts",
      "search": "exact code to find",
      "replace": "code to replace with"
    }
  ],
  "explanation": "What was changed and why",
  "confidence": 0.0-1.0
}
\`\`\`

If the error is not fixable automatically, set "fixable" to false and explain why.
`

    return prompt
  }

  /**
   * Parse the fix response from GLM
   */
  private parseFixResponse(responseText: string, _error: ErrorMatch): FixResult {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/)
      if (!jsonMatch) {
        return this.createNoFixResult('', 'Could not parse fix response - no JSON found')
      }

      const parsed = JSON.parse(jsonMatch[1])

      if (!parsed.fixable) {
        return {
          fixed: false,
          changes: [],
          explanation: parsed.analysis || 'Error not automatically fixable',
          confidence: 0,
          errorId: '',
        }
      }

      // Convert search/replace to FileChange objects
      const changes: FileChange[] = []

      for (const change of parsed.changes || []) {
        const filePath = path.resolve(process.cwd(), change.path)

        if (fs.existsSync(filePath)) {
          const before = fs.readFileSync(filePath, 'utf-8')
          const after = before.replace(change.search, change.replace)

          if (before !== after) {
            changes.push({
              path: filePath,
              before,
              after,
              changeType: 'modify',
            })
          }
        }
      }

      return {
        fixed: changes.length > 0,
        changes,
        explanation: parsed.explanation || 'Fix applied',
        confidence: parsed.confidence || 0.5,
        errorId: '',
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      return this.createNoFixResult('', `Failed to parse fix response: ${errorMessage}`)
    }
  }

  /**
   * Apply the fix to the filesystem
   */
  private async applyFix(fixResult: FixResult): Promise<void> {
    for (const change of fixResult.changes) {
      this.log(`Applying fix to: ${path.relative(process.cwd(), change.path)}`)

      // Create backup
      const backupPath = `${change.path}.watchdog-backup`
      fs.writeFileSync(backupPath, change.before)

      // Apply change
      fs.writeFileSync(change.path, change.after, 'utf-8')

      this.log(`Fix applied to ${path.relative(process.cwd(), change.path)}`)
    }
  }

  /**
   * Get the system prompt for GLM
   */
  private getSystemPrompt(): string {
    return `You are an expert software engineer specializing in debugging and fixing TypeScript/React/Electron applications.

Your task is to analyze error messages and provide precise, minimal fixes.

Rules:
1. Only fix what's broken - don't refactor or improve unrelated code
2. Preserve existing code style and patterns
3. Provide exact search/replace patterns that match the current code
4. If unsure, set confidence low and explain the uncertainty
5. If the error requires human intervention, mark as not fixable

The application is VulnAssesTool - an Electron-based vulnerability assessment tool using:
- React 19 + TypeScript
- Vite for bundling
- Electron for desktop
- SQLite for database
- Zustand for state management`
  }

  /**
   * Resolve a file path from error stack trace
   */
  private resolveFilePath(filePath: string): string | null {
    // Handle various path formats from stack traces
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '')
    }

    // Remove webpack/vite prefixes
    filePath = filePath.replace(/^webpack-internal:\/\/\/?/, '')
    filePath = filePath.replace(/^\/?/, '')

    // Try various locations
    const locations = [
      filePath,
      path.resolve(process.cwd(), filePath),
      path.resolve(process.cwd(), 'src', filePath),
      path.resolve(process.cwd(), 'electron', filePath),
    ]

    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        return loc
      }
    }

    return null
  }

  /**
   * Get project context for better fixes
   */
  private async getProjectContext(): Promise<string> {
    const contextParts: string[] = []

    // Read package.json for dependencies context
    const packageJsonPath = path.resolve(process.cwd(), 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      contextParts.push(`Dependencies: ${Object.keys(pkg.dependencies || {}).join(', ')}`)
    }

    // Read tsconfig for type context
    const tsconfigPath = path.resolve(process.cwd(), 'tsconfig.json')
    if (fs.existsSync(tsconfigPath)) {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
      contextParts.push(`TypeScript config: ${JSON.stringify(tsconfig.compilerOptions || {})}`)
    }

    return contextParts.join('\n')
  }

  /**
   * Generate a unique error ID
   */
  private generateErrorId(error: ErrorMatch): string {
    const hash = `${error.type}:${error.message}:${error.file || 'unknown'}`
    return Buffer.from(hash).toString('base64').substring(0, 16)
  }

  /**
   * Create a no-fix result
   */
  private createNoFixResult(errorId: string, reason: string): FixResult {
    return {
      fixed: false,
      changes: [],
      explanation: reason,
      confidence: 0,
      errorId,
    }
  }

  /**
   * Log a message
   */
  private log(message: string): void {
    console.log(`[AI-Fix] ${message}`)
  }

  /**
   * Get fix history
   */
  getFixHistory(): FixResult[] {
    return [...this.fixHistory]
  }

  /**
   * Clear fix history
   */
  clearHistory(): void {
    this.fixHistory = []
  }
}

/**
 * Create an AI fix agent instance
 */
export function createAIFixAgent(options: AIFixAgentOptions): AIFixAgent {
  return new AIFixAgent(options)
}
