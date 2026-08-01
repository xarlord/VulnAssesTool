/**
 * TopCriticalVulnerabilities widget tests (FR-06.2).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopCriticalVulnerabilities } from './TopCriticalVulnerabilities'
import type { TopVulnerabilityItem } from '@/lib/analytics'

function item(overrides: Partial<TopVulnerabilityItem>): TopVulnerabilityItem {
  return {
    id: 'CVE-0000',
    severity: 'critical',
    cvssScore: 9.8,
    projectId: 'p1',
    projectName: 'Project',
    affectedComponentCount: 1,
    ...overrides,
  }
}

describe('TopCriticalVulnerabilities (FR-06.2)', () => {
  it('renders each CVE id and its project name', () => {
    const items = [
      item({ id: 'CVE-2021-44228', projectName: 'Alpha' }),
      item({ id: 'CVE-2022-22965', projectName: 'Beta' }),
      item({ id: 'CVE-2023-1234', projectName: 'Gamma' }),
    ]

    render(<TopCriticalVulnerabilities vulnerabilities={items} />)

    expect(screen.getByText('CVE-2021-44228')).toBeInTheDocument()
    expect(screen.getByText('CVE-2022-22965')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('calls onProjectClick with the row projectId when a row is activated', async () => {
    const onProjectClick = vi.fn()
    const items = [item({ id: 'CVE-2021-44228', projectId: 'proj-42', projectName: 'Alpha' })]

    render(<TopCriticalVulnerabilities vulnerabilities={items} onProjectClick={onProjectClick} />)
    await userEvent.click(screen.getByText('CVE-2021-44228'))

    expect(onProjectClick).toHaveBeenCalledWith('proj-42')
  })

  it('renders an empty state and no rows when there are no critical vulnerabilities', () => {
    render(<TopCriticalVulnerabilities vulnerabilities={[]} />)

    expect(screen.getByText(/no critical vulnerabilities/i)).toBeInTheDocument()
  })
})
