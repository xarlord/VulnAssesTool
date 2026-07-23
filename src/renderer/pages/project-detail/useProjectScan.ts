import React from 'react'
import { toast } from '@/components/Toaster'
import { matchVulnerabilitiesForComponents, getVulnerabilityStatistics } from '@/lib/api/vulnMatcher'
import type { ScanProgressEvent } from '@/lib/api/vulnMatcher'
import { refreshVulnerabilityData } from '@/lib/refresh'
import { getSecureKeyService } from '@/lib/storage'
import { enrichVulnerabilities } from '@/lib/services/intelligence/enrichVulnerabilities'
import type { AppSettings, Project, Vulnerability } from '@@/types'

interface UseProjectScanArgs {
  project: Project | null | undefined
  updateProject: (id: string, updates: Partial<Project>) => void
  settings: AppSettings
}

/**
 * Owns the vulnerability scan / refresh operations for a project along with
 * their transient progress state. Extracted from the ProjectDetail god
 * component so the orchestrator stays a thin shell; the scan progress it
 * returns is rendered in the page header.
 */
export function useProjectScan({ project, updateProject, settings }: UseProjectScanArgs) {
  const [isScanning, setIsScanning] = React.useState(false)
  const [isRefreshingVuln, setIsRefreshingVuln] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [scanLog, setScanLog] = React.useState<string[]>([])
  const [scanPhase, setScanPhase] = React.useState<string>('')

  const handleScan = async () => {
    if (!project) return
    if (project.components.length === 0) {
      toast.warning('Cannot Scan', 'No components to scan. Please upload an SBOM first.')
      return
    }

    const secureKeyService = getSecureKeyService()
    const nvdApiKey = await secureKeyService.getApiKey('nvd')

    if (!nvdApiKey) {
      toast.info(
        'No NVD API Key',
        'Scanning will use the public NVD API with rate limits. Add an API key in Settings for better performance.',
      )
    }

    setIsScanning(true)
    setScanProgress(0)
    setScanLog([])
    setScanPhase('Initializing...')

    const appendLog = (msg: string) => {
      setScanLog((prev) => [...prev.slice(-4), msg])
    }

    const handleMatchProgress = (event: ScanProgressEvent) => {
      const pct = event.total > 0 ? Math.round((event.current / event.total) * 70) : 70
      setScanProgress(pct)
      setScanPhase(event.message)
      appendLog(event.message)
    }

    try {
      const results = await matchVulnerabilitiesForComponents(
        project.components,
        nvdApiKey ?? undefined,
        handleMatchProgress,
      )

      setScanProgress(75)
      setScanPhase('Deduplicating results...')
      appendLog('Deduplicating vulnerability results...')

      const allVulnerabilities: Vulnerability[] = []
      const seenIds = new Set<string>()

      for (const [componentId, vulns] of results.entries()) {
        for (const vuln of vulns) {
          if (!seenIds.has(vuln.id)) {
            allVulnerabilities.push({
              ...vuln,
              affectedComponents: [componentId],
            })
            seenIds.add(vuln.id)
          } else {
            const existingVuln = allVulnerabilities.find((v) => v.id === vuln.id)
            if (existingVuln && !existingVuln.affectedComponents.includes(componentId)) {
              existingVuln.affectedComponents.push(componentId)
            }
          }
        }
      }

      setScanProgress(80)
      setScanPhase('Merging with SBOM data...')
      appendLog(`Found ${allVulnerabilities.length} vulnerabilities from NVD/OSV`)

      const existingVulnerabilities = project.vulnerabilities || []
      const mergedVulnerabilities: Vulnerability[] = []

      for (const existingVuln of existingVulnerabilities) {
        const foundInScan = allVulnerabilities.find((v) => v.id === existingVuln.id)
        if (foundInScan) {
          mergedVulnerabilities.push(foundInScan)
        } else {
          mergedVulnerabilities.push(existingVuln)
        }
      }

      for (const scanVuln of allVulnerabilities) {
        if (!existingVulnerabilities.some((v) => v.id === scanVuln.id)) {
          mergedVulnerabilities.push(scanVuln)
        }
      }

      setScanProgress(85)
      setScanPhase('Enriching with KEV/EPSS intelligence...')
      appendLog(`Enriching ${mergedVulnerabilities.length} vulnerabilities with threat intelligence...`)

      const enrichedVulnerabilities = await enrichVulnerabilities(mergedVulnerabilities, {
        onProgress: (msg) => {
          appendLog(msg)
          setScanPhase(msg)
        },
      })

      setScanProgress(95)
      setScanPhase('Calculating statistics...')
      appendLog('Finalizing scan results...')

      const stats = getVulnerabilityStatistics(enrichedVulnerabilities)
      const vulnerableComponents = new Set(enrichedVulnerabilities.flatMap((v) => v.affectedComponents)).size

      updateProject(project.id, {
        vulnerabilities: enrichedVulnerabilities,
        lastScanAt: new Date(),
        updatedAt: new Date(),
        statistics: {
          ...project.statistics,
          totalVulnerabilities: stats.total,
          criticalCount: stats.critical,
          highCount: stats.high,
          mediumCount: stats.medium,
          lowCount: stats.low,
          vulnerableComponents,
        },
      })

      setScanProgress(100)
      setScanPhase('Scan complete!')
      appendLog(`Done: ${stats.total} vulnerabilities (${stats.critical} critical, ${stats.high} high)`)

      const newVulnsFound = allVulnerabilities.length
      const sbomVulnsPreserved =
        existingVulnerabilities.length -
        existingVulnerabilities.filter((v) => allVulnerabilities.some((s) => s.id === v.id)).length

      toast.success(
        'Scan Complete',
        `Found ${newVulnsFound} vulnerabilities from NVD/OSV APIs. ` +
          `Total vulnerabilities: ${stats.total} ` +
          (sbomVulnsPreserved > 0 ? `(${sbomVulnsPreserved} from SBOM preserved)` : ''),
      )
    } catch (error) {
      toast.error('Scan Failed', error instanceof Error ? error.message : 'Unknown error occurred')
    } finally {
      setIsScanning(false)
      setScanProgress(0)
      setScanPhase('')
    }
  }

  const handleRefreshVulnData = async () => {
    if (!project) return
    // API key is now fetched from secure storage, not from settings
    const secureKeyService = getSecureKeyService()
    const apiKey = await secureKeyService.getApiKey('nvd')
    if (!apiKey) {
      toast.warning('No NVD API Key', 'Please add your NVD API key in Settings to refresh vulnerability data from NVD.')
      return
    }

    setIsRefreshingVuln(true)
    try {
      const result = await refreshVulnerabilityData(project.components, {
        cacheTTL: settings.vulnDataCacheTTL,
        onProgress: (current, total) => {
          console.log(`Refresh progress: ${current}/${total}`)
        },
      })

      if (result.success) {
        // Update the project with new vulnerabilities
        updateProject(project.id, {
          vulnerabilities: result.vulnerabilities,
          lastVulnDataRefresh: new Date(),
          statistics: {
            ...project.statistics,
            totalVulnerabilities: result.vulnerabilities.length,
            criticalCount: result.vulnerabilities.filter((v) => v.severity === 'critical').length,
            highCount: result.vulnerabilities.filter((v) => v.severity === 'high').length,
            mediumCount: result.vulnerabilities.filter((v) => v.severity === 'medium').length,
            lowCount: result.vulnerabilities.filter((v) => v.severity === 'low').length,
          },
        })

        toast.success('Refresh Complete', `Refreshed vulnerability data for ${result.componentsScanned} components`)
      }
    } catch (error) {
      console.error('Failed to refresh vulnerability data:', error)
      toast.error('Refresh Failed', error instanceof Error ? error.message : 'Unknown error occurred')
    } finally {
      setIsRefreshingVuln(false)
    }
  }

  return {
    isScanning,
    isRefreshingVuln,
    scanProgress,
    scanLog,
    scanPhase,
    handleScan,
    handleRefreshVulnData,
  }
}
