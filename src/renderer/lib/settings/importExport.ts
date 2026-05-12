/**
 * Settings Import/Export
 * Handles exporting and importing settings profiles with validation
 */

import { z } from 'zod'
import type { SettingsProfile, SettingsExport } from '@@/types'

// Zod schema for AppSettings
const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  fontSize: z.enum(['small', 'default', 'large']),
  nvdApiKey: z.string().optional(),
  dataRetentionDays: z.number(),
  autoRefresh: z.boolean(),
  autoRefreshInterval: z.number(),
  vulnDataCacheTTL: z.number(),
  vulnProviders: z.object({
    nvd: z.object({
      enabled: z.boolean(),
      apiKey: z.string().optional(),
      priority: z.number(),
      rateLimit: z.object({
        requestsPerHour: z.number(),
        requestsPerMinute: z.number().optional(),
      }),
    }),
    osv: z.object({
      enabled: z.boolean(),
      apiKey: z.string().optional(),
      priority: z.number(),
      rateLimit: z.object({
        requestsPerHour: z.number(),
        requestsPerMinute: z.number().optional(),
      }),
    }),
    ossIndex: z
      .object({
        enabled: z.boolean(),
        apiKey: z.string().optional(),
        priority: z.number(),
        rateLimit: z.object({
          requestsPerHour: z.number(),
          requestsPerMinute: z.number().optional(),
        }),
      })
      .optional(),
    githubAdvisory: z
      .object({
        enabled: z.boolean(),
        apiKey: z.string().optional(),
        priority: z.number(),
        rateLimit: z.object({
          requestsPerHour: z.number(),
          requestsPerMinute: z.number().optional(),
        }),
      })
      .optional(),
    snyk: z
      .object({
        enabled: z.boolean(),
        apiKey: z.string().optional(),
        priority: z.number(),
        rateLimit: z.object({
          requestsPerHour: z.number(),
          requestsPerMinute: z.number().optional(),
        }),
      })
      .optional(),
  }),
  cvssVersion: z.enum(['3.0', '3.1']),
  showCvssBreakdown: z.boolean(),
  maxGraphNodes: z.number(),
  showVulnerableOnly: z.boolean(),
})

// Zod schema for SettingsProfile
const SettingsProfileSchema: z.ZodType<SettingsProfile> = z.object({
  id: z.string(),
  name: z.string().min(1, 'Profile name is required'),
  description: z.string().optional(),
  settings: AppSettingsSchema,
  isDefault: z.boolean(),
  createdAt: z.string().or(z.date()),
  lastUsed: z.string().or(z.date()),
})

// Zod schema for SettingsExport
const SettingsExportSchema: z.ZodType<SettingsExport> = z.object({
  version: z.string(),
  exportedAt: z.string(),
  profiles: z.array(SettingsProfileSchema).min(1, 'At least one profile is required'),
})

/**
 * Validation result interface
 */
export interface ValidationResult {
  success: boolean
  error?: string
  data?: SettingsExport
}

/**
 * Validate settings export data
 */
export function validateSettingsExport(data: unknown): data is SettingsExport {
  try {
    SettingsExportSchema.parse(data)
    return true
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors)
    }
    return false
  }
}

/**
 * Export profiles to a SettingsExport object
 */
export function exportSettings(profiles: SettingsProfile[]): SettingsExport {
  if (profiles.length === 0) {
    throw new Error('No profiles to export')
  }

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    profiles: profiles.map((profile) => ({
      ...profile,
      createdAt: profile.createdAt instanceof Date ? profile.createdAt.toISOString() : profile.createdAt,
      lastUsed: profile.lastUsed instanceof Date ? profile.lastUsed.toISOString() : profile.lastUsed,
    })),
  }
}

/**
 * Export settings to a JSON file (triggers download)
 */
export function exportSettingsToFile(profiles: SettingsProfile[], filename?: string): void {
  try {
    const exportData = exportSettings(profiles)
    const jsonContent = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' })

    // Generate filename if not provided
    const defaultFilename = `vuln-assess-settings-${new Date().toISOString().split('T')[0]}.json`
    const finalFilename = filename || defaultFilename

    // Create download link and trigger download
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = finalFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to export settings:', error)
    throw new Error('Failed to export settings. Please try again.')
  }
}

/**
 * Import settings from JSON string
 */
export function importSettings(json: string): ValidationResult {
  try {
    // Parse JSON
    const data = JSON.parse(json)

    // Validate structure
    const validationResult = SettingsExportSchema.safeParse(data)

    if (!validationResult.success) {
      const errors = validationResult.error?.errors || []
      const errorMessage = errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ') || 'Invalid data structure'
      return {
        success: false,
        error: `Invalid settings format: ${errorMessage}`,
      }
    }

    // Validate version compatibility
    const version = validationResult.data.version
    const majorVersion = parseInt(version.split('.')[0], 10)
    if (majorVersion > 1) {
      return {
        success: false,
        error: `Unsupported settings version: ${version}. This application supports version 1.x`,
      }
    }

    // Convert date strings back to Date objects
    const validatedData: SettingsExport = {
      version: validationResult.data.version,
      exportedAt: validationResult.data.exportedAt,
      profiles: validationResult.data.profiles.map((profile) => ({
        ...profile,
        createdAt: profile.createdAt instanceof Date ? profile.createdAt : new Date(profile.createdAt),
        lastUsed: profile.lastUsed instanceof Date ? profile.lastUsed : new Date(profile.lastUsed),
      })),
    }

    return {
      success: true,
      data: validatedData,
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: 'Invalid JSON format. Please check the file contents.',
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

/**
 * Import settings from a file
 */
export async function importSettingsFromFile(file: File): Promise<ValidationResult> {
  // Validate file type
  if (!file.name.endsWith('.json')) {
    return {
      success: false,
      error: 'Invalid file type. Please select a JSON file.',
    }
  }

  // Validate file size (max 5MB)
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: 'File too large. Maximum size is 5MB.',
    }
  }

  try {
    // Read file content
    const json = await file.text()

    // Import and validate
    return importSettings(json)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    }
  }
}

/**
 * Generate a summary of settings to be imported
 */
export function summarizeImportData(data: SettingsExport): string {
  const profileCount = data.profiles.length
  const defaultProfile = data.profiles.find((p) => p.isDefault)
  const defaultName = defaultProfile ? defaultProfile.name : 'None'

  return `Importing ${profileCount} profile${profileCount !== 1 ? 's' : ''} from version ${
    data.version
  }. Default profile: "${defaultName}"`
}
