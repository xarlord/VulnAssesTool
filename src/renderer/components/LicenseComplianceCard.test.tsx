import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LicenseComplianceCard } from './LicenseComplianceCard'

const components = [
  { id: 'a', name: 'lib-a', version: '1.0.0', licenses: ['MIT'] },
  { id: 'b', name: 'lib-b', version: '2.0.0', licenses: ['GPL-3.0-only'] },
  { id: 'c', name: 'lib-c', version: '3.0.0', licenses: [] },
]

describe('LicenseComplianceCard', () => {
  it('summarizes license verdicts across components', () => {
    render(<LicenseComplianceCard components={components} />)
    expect(screen.getByText('License Compliance')).toBeInTheDocument()
    // MIT → allowed; GPL-3.0-only and the missing-license component → review.
    expect(screen.getByTestId('license-allowed-count')).toHaveTextContent('1')
    expect(screen.getByTestId('license-review-count')).toHaveTextContent('2')
  })

  it('flags a non-permissive component with its risk category', () => {
    render(<LicenseComplianceCard components={components} />)
    expect(screen.getByText('lib-b')).toBeInTheDocument()
    expect(screen.getByText(/strong-copyleft/i)).toBeInTheDocument()
  })

  it('reports components missing a license', () => {
    render(<LicenseComplianceCard components={components} />)
    expect(screen.getByTestId('license-missing-count')).toHaveTextContent('1')
  })

  it('does not flag a permissive component', () => {
    render(<LicenseComplianceCard components={[{ id: 'a', name: 'lib-a', version: '1.0.0', licenses: ['MIT'] }]} />)
    // lib-a is permissive/allowed, so it should not appear in the flagged list.
    expect(screen.queryByText('lib-a')).not.toBeInTheDocument()
  })

  it('renders nothing when there are no components', () => {
    const { container } = render(<LicenseComplianceCard components={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
