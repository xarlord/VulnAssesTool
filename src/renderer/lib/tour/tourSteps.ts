/**
 * Tour steps configuration for the main onboarding tour
 */

import type { TourConfig, TourStep } from './types'

/**
 * Main application tour steps
 */
export const mainTourSteps: TourStep[] = [
  {
    id: 'welcome',
    element: '', // Empty element shows centered popover
    title: 'Welcome to VulnAssessTool',
    description:
      'This quick tour will help you get started with vulnerability scanning. You can skip this tour anytime and replay it from the Help menu.',
    side: 'bottom',
  },
  {
    id: 'dashboard',
    element: '[data-tour="dashboard"]',
    title: 'Dashboard',
    description:
      'Your dashboard shows an overview of all projects, vulnerability statistics, and quick actions. Create your first project to get started.',
    side: 'right',
    highlight: true,
  },
  {
    id: 'new-project',
    element: '[data-tour="new-project-button"]',
    title: 'Create a Project',
    description:
      'Click here to create a new project. Projects help you organize SBOM files and track vulnerabilities across different applications.',
    side: 'bottom',
    highlight: true,
  },
  {
    id: 'import-sbom',
    element: '[data-tour="import-sbom-button"]',
    title: 'Import SBOM',
    description: 'Import a CycloneDX or SPDX SBOM file to scan your software components for known vulnerabilities.',
    side: 'bottom',
    highlight: true,
  },
  {
    id: 'settings',
    element: '[data-tour="settings-link"]',
    title: 'Settings',
    description:
      'Configure your NVD API key, theme preferences, and notification settings here. An API key speeds up vulnerability lookups.',
    side: 'left',
  },
]

/**
 * Main onboarding tour configuration
 */
export const mainTourConfig: TourConfig = {
  id: 'main-onboarding',
  name: 'Getting Started',
  description: 'Learn the basics of VulnAssessTool in 5 quick steps',
  steps: mainTourSteps,
  showOnFirstLaunch: true,
  allowReplay: true,
}

/**
 * Project detail tour steps
 */
export const projectTourSteps: TourStep[] = [
  {
    id: 'project-overview',
    element: '[data-tour="project-overview"]',
    title: 'Project Overview',
    description: 'This panel shows your project statistics including total vulnerabilities broken down by severity.',
    side: 'right',
  },
  {
    id: 'vulnerability-list',
    element: '[data-tour="vulnerability-list"]',
    title: 'Vulnerability List',
    description:
      'View all detected vulnerabilities here. Click on any vulnerability to see detailed information including CVSS scores and references.',
    side: 'top',
  },
  {
    id: 'scan-button',
    element: '[data-tour="scan-button"]',
    title: 'Scan Components',
    description:
      'Click here to rescan your components for new vulnerabilities. Scans check both NVD and OSV databases.',
    side: 'bottom',
    highlight: true,
  },
  {
    id: 'export-report',
    element: '[data-tour="export-button"]',
    title: 'Export Reports',
    description: 'Generate professional PDF reports for stakeholders or export vulnerability data in various formats.',
    side: 'bottom',
  },
]

/**
 * Project detail tour configuration
 */
export const projectTourConfig: TourConfig = {
  id: 'project-detail',
  name: 'Project Details',
  description: 'Learn how to work with projects and vulnerabilities',
  steps: projectTourSteps,
  showOnFirstLaunch: false,
  allowReplay: true,
}

/**
 * All available tours
 */
export const allTours: TourConfig[] = [mainTourConfig, projectTourConfig]
