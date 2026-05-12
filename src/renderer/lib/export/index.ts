/**
 * Export Library
 * Coordinates all export functionality (CSV, JSON, PDF)
 */

import type { Project } from '@@/types'
import {
  exportVulnerabilitiesToCsv,
  exportComponentsToCsv,
  downloadCsv,
  generateFilename,
  buildComponentMap,
} from './csv'
import {
  prepareProjectJson,
  prepareVulnerabilitiesJson,
  prepareComponentsJson,
  prepareAllProjectsJson,
  downloadJson,
} from './json'
import {
  prepareProjectPdf,
  prepareVulnerabilitiesPdf,
  prepareComponentsPdf,
  prepareAllProjectsPdf,
  downloadPdf,
} from './pdf'
import type { ExportFormat, ExportDataType } from './types'

/**
 * Export project data to specified format
 */
export function exportProjectData(project: Project, format: ExportFormat, dataType: ExportDataType = 'project'): void {
  const filename = generateFilename(project.name, format, dataType)

  if (format === 'csv') {
    if (dataType === 'project' || dataType === 'all-projects') {
      // For CSV, export vulnerabilities when full project report is requested
      // CSV format is limited to one data type per file
      const csvContent = exportVulnerabilitiesToCsv(project.vulnerabilities, buildComponentMap(project.vulnerabilities))
      downloadCsv(csvContent, filename.replace('.csv', '-vulnerabilities.csv'))
    } else if (dataType === 'vulnerabilities') {
      const csvContent = exportVulnerabilitiesToCsv(project.vulnerabilities, buildComponentMap(project.vulnerabilities))
      downloadCsv(csvContent, filename)
    } else if (dataType === 'components') {
      const csvContent = exportComponentsToCsv(project.components)
      downloadCsv(csvContent, filename)
    }
  } else if (format === 'json') {
    let jsonContent: string

    if (dataType === 'project') {
      jsonContent = prepareProjectJson(project)
    } else if (dataType === 'vulnerabilities') {
      jsonContent = prepareVulnerabilitiesJson(project)
    } else if (dataType === 'components') {
      jsonContent = prepareComponentsJson(project)
    }

    downloadJson(jsonContent, filename)
  } else if (format === 'pdf') {
    let pdfDoc: ReturnType<typeof prepareProjectPdf>

    if (dataType === 'project') {
      pdfDoc = prepareProjectPdf(project)
    } else if (dataType === 'vulnerabilities') {
      pdfDoc = prepareVulnerabilitiesPdf(project)
    } else if (dataType === 'components') {
      pdfDoc = prepareComponentsPdf(project)
    } else {
      pdfDoc = prepareProjectPdf(project)
    }

    downloadPdf(pdfDoc, filename)
  }
}

/**
 * Export all projects to specified format
 */
export function exportAllProjects(projects: Project[], format: ExportFormat): void {
  const filename = generateFilename('all-projects', format, 'all-projects')

  if (format === 'csv') {
    // For CSV of all projects, export combined vulnerabilities
    const allVulnerabilities = projects.flatMap((p) => p.vulnerabilities)
    const componentMap = new Map<string, string>()

    // Build component map for all projects
    for (const project of projects) {
      for (const vuln of project.vulnerabilities) {
        for (const compId of vuln.affectedComponents) {
          const comp = project.components.find((c) => c.id === compId)
          if (comp && !componentMap.has(compId)) {
            componentMap.set(compId, `${project.name}:${comp.name}`)
          }
        }
      }
    }

    const csvContent = exportVulnerabilitiesToCsv(allVulnerabilities, componentMap)
    downloadCsv(csvContent, filename)
  } else if (format === 'json') {
    const jsonContent = prepareAllProjectsJson(projects)
    downloadJson(jsonContent, filename)
  } else if (format === 'pdf') {
    const pdfDoc = prepareAllProjectsPdf(projects)
    downloadPdf(pdfDoc, filename)
  }
}

// Re-export types for convenience
export * from './types'
