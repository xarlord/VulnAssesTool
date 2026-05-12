/**
 * Utility functions for formatting vulnerability references
 *
 * Implements custom naming based on the URL source
 */

/**
 * Get a display name for a reference based on its URL
 *
 * @param url - The reference URL
 * @returns A human-readable source name
 */
export function getReferenceDisplayName(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    const pathname = urlObj.pathname.toLowerCase()

    // GitHub
    if (hostname === 'github.com' || hostname.includes('github')) {
      if (pathname.includes('/advisories/')) {
        return 'GitHub Security Advisory'
      }
      if (pathname.includes('/issues/')) {
        return 'GitHub Issue'
      }
      if (pathname.includes('/pull/')) {
        return 'GitHub Pull Request'
      }
      if (pathname.includes('/commit/')) {
        return 'GitHub Commit'
      }
      if (pathname.includes('/releases/')) {
        return 'GitHub Release'
      }
      return 'GitHub'
    }

    // NVD
    if (hostname === 'nvd.nist.gov' || hostname.includes('nist.gov')) {
      return 'NVD (National Vulnerability Database)'
    }

    // Huntr
    if (hostname === 'huntr.dev' || hostname.includes('huntr')) {
      return 'Huntr (Bug Bounty)'
    }

    // OSV
    if (hostname === 'osv.dev' || hostname.includes('osv')) {
      return 'OSV (Open Source Vulnerabilities)'
    }

    // MITRE CVE
    if (hostname === 'cve.mitre.org' || hostname.includes('mitre.org')) {
      return 'MITRE CVE'
    }

    // Exploit Database
    if (hostname === 'exploit-db.com' || hostname.includes('exploit-db')) {
      return 'Exploit-DB'
    }

    // CERT
    if (hostname.includes('cert') || hostname.includes('us-cert')) {
      return 'CERT/CC'
    }

    // Vendor advisories
    if (hostname.includes('microsoft.com')) {
      return 'Microsoft Security'
    }
    if (hostname.includes('oracle.com')) {
      return 'Oracle Security'
    }
    if (hostname.includes('redhat.com')) {
      return 'Red Hat Security'
    }
    if (hostname.includes('debian.org')) {
      return 'Debian Security'
    }
    if (hostname.includes('ubuntu.com')) {
      return 'Ubuntu Security'
    }
    if (hostname.includes('suse.com') || hostname.includes('suse.de')) {
      return 'SUSE Security'
    }
    if (hostname.includes('apache.org')) {
      return 'Apache Security'
    }
    if (hostname.includes('nodejs.org')) {
      return 'Node.js Security'
    }
    if (hostname.includes('python.org')) {
      return 'Python Security'
    }
    if (hostname.includes('ruby-lang.org')) {
      return 'Ruby Security'
    }

    // Jira / Bug trackers
    if (hostname.includes('jira') || hostname.includes('atlassian.net')) {
      return 'Issue Tracker (Jira)'
    }
    if (hostname.includes('bugzilla')) {
      return 'Bugzilla'
    }

    // Security blogs and news
    if (hostname.includes('securityfocus.com')) {
      return 'SecurityFocus'
    }
    if (hostname.includes('seclists.org')) {
      return 'SecLists'
    }
    if (hostname.includes('packetstormsecurity.com')) {
      return 'Packet Storm Security'
    }

    // Fallback: use the hostname with proper capitalization
    return formatHostname(hostname)
  } catch {
    // If URL parsing fails, return 'External Link'
    return 'External Link'
  }
}

/**
 * Format a hostname into a readable name
 *
 * @param hostname - The hostname to format
 * @returns A formatted hostname
 */
function formatHostname(hostname: string): string {
  // Remove www. prefix
  let name = hostname.replace(/^www\./, '')

  // Split by dots and take the main part
  const parts = name.split('.')
  if (parts.length > 0) {
    name = parts[0]
  }

  // Capitalize first letter
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Get an icon name or type for a reference based on its URL
 * Can be used to show appropriate icons in the UI
 *
 * @param url - The reference URL
 * @returns An icon type identifier
 */
export function getReferenceIcon(url: string): 'github' | 'nvd' | 'huntr' | 'osv' | 'vendor' | 'external' {
  try {
    const hostname = new URL(url).hostname.toLowerCase()

    if (hostname.includes('github')) return 'github'
    if (hostname.includes('nvd.nist.gov') || hostname.includes('nist.gov')) return 'nvd'
    if (hostname.includes('huntr')) return 'huntr'
    if (hostname.includes('osv.dev')) return 'osv'

    // Check for vendor advisories
    const vendorDomains = ['microsoft.com', 'oracle.com', 'redhat.com', 'debian.org', 'ubuntu.com', 'apache.org']
    if (vendorDomains.some((d) => hostname.includes(d))) {
      return 'vendor'
    }

    return 'external'
  } catch {
    return 'external'
  }
}
