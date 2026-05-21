import { describe, it, expect } from 'vitest'
import { getReferenceDisplayName, getReferenceIcon } from './referenceUtils'

describe('referenceUtils', () => {
  describe('getReferenceDisplayName', () => {
    describe('GitHub URLs', () => {
      it('should return "GitHub Security Advisory" for advisories path', () => {
        expect(getReferenceDisplayName('https://github.com/org/repo/advisories/GHSA-1234')).toBe(
          'GitHub Security Advisory',
        )
      })

      it('should return "GitHub Issue" for issues path', () => {
        expect(getReferenceDisplayName('https://github.com/org/repo/issues/42')).toBe('GitHub Issue')
      })

      it('should return "GitHub Pull Request" for pull path', () => {
        expect(getReferenceDisplayName('https://github.com/org/repo/pull/10')).toBe('GitHub Pull Request')
      })

      it('should return "GitHub Commit" for commit path', () => {
        expect(getReferenceDisplayName('https://github.com/org/repo/commit/abc123')).toBe('GitHub Commit')
      })

      it('should return "GitHub Release" for releases path', () => {
        expect(getReferenceDisplayName('https://github.com/org/repo/releases/tag/v1.0')).toBe('GitHub Release')
      })

      it('should return "GitHub" for other GitHub URLs', () => {
        expect(getReferenceDisplayName('https://github.com/org/repo')).toBe('GitHub')
        expect(getReferenceDisplayName('https://github.com/org/repo/blob/main/README.md')).toBe('GitHub')
      })

      it('should match hostname containing "github"', () => {
        expect(getReferenceDisplayName('https://github-enterprise.example.com/something')).toBe('GitHub')
      })
    })

    describe('NVD / NIST URLs', () => {
      it('should return NVD name for nvd.nist.gov', () => {
        expect(getReferenceDisplayName('https://nvd.nist.gov/vuln/detail/CVE-2024-1234')).toBe(
          'NVD (National Vulnerability Database)',
        )
      })

      it('should return NVD name for other nist.gov domains', () => {
        expect(getReferenceDisplayName('https://services.nist.gov/some-page')).toBe(
          'NVD (National Vulnerability Database)',
        )
      })
    })

    describe('Huntr URLs', () => {
      it('should return Huntr name for huntr.dev', () => {
        expect(getReferenceDisplayName('https://huntr.dev/bounties/abc123')).toBe('Huntr (Bug Bounty)')
      })

      it('should return Huntr name for hostname containing huntr', () => {
        expect(getReferenceDisplayName('https://www.huntr.dev/bounties/1')).toBe('Huntr (Bug Bounty)')
      })
    })

    describe('OSV URLs', () => {
      it('should return OSV name for osv.dev', () => {
        expect(getReferenceDisplayName('https://osv.dev/vulnerability/OSV-2024-1')).toBe(
          'OSV (Open Source Vulnerabilities)',
        )
      })
    })

    describe('MITRE CVE URLs', () => {
      it('should return MITRE CVE name for cve.mitre.org', () => {
        expect(getReferenceDisplayName('https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2024-1')).toBe('MITRE CVE')
      })

      it('should return MITRE CVE for other mitre.org domains', () => {
        expect(getReferenceDisplayName('https://www.mitre.org/publications')).toBe('MITRE CVE')
      })
    })

    describe('Exploit Database URLs', () => {
      it('should return Exploit-DB for exploit-db.com', () => {
        expect(getReferenceDisplayName('https://www.exploit-db.com/exploits/12345')).toBe('Exploit-DB')
      })
    })

    describe('CERT URLs', () => {
      it('should return CERT/CC for URLs containing "cert"', () => {
        expect(getReferenceDisplayName('https://www.kb.cert.org/vuls/id/123456')).toBe('CERT/CC')
      })

      it('should return CERT/CC for URLs containing "us-cert"', () => {
        expect(getReferenceDisplayName('https://www.us-cert.gov/advisories/abc')).toBe('CERT/CC')
      })
    })

    describe('Vendor advisory URLs', () => {
      it('should return Microsoft Security for microsoft.com', () => {
        expect(getReferenceDisplayName('https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-1')).toBe(
          'Microsoft Security',
        )
      })

      it('should return Oracle Security for oracle.com', () => {
        expect(getReferenceDisplayName('https://www.oracle.com/security-alerts/cpu2024.html')).toBe('Oracle Security')
      })

      it('should return Red Hat Security for redhat.com', () => {
        expect(getReferenceDisplayName('https://access.redhat.com/errata/RHSA-2024:1234')).toBe('Red Hat Security')
      })

      it('should return Debian Security for debian.org', () => {
        expect(getReferenceDisplayName('https://security-tracker.debian.org/tracker/CVE-2024-1')).toBe(
          'Debian Security',
        )
      })

      it('should return Ubuntu Security for ubuntu.com', () => {
        expect(getReferenceDisplayName('https://ubuntu.com/security/CVE-2024-1')).toBe('Ubuntu Security')
      })

      it('should return SUSE Security for suse.com', () => {
        expect(getReferenceDisplayName('https://www.suse.com/security/cve/CVE-2024-1')).toBe('SUSE Security')
      })

      it('should return SUSE Security for suse.de', () => {
        expect(getReferenceDisplayName('https://bugzilla.suse.de/show_bug.cgi?id=123')).toBe('SUSE Security')
      })

      it('should return Apache Security for apache.org', () => {
        expect(getReferenceDisplayName('https://www.apache.org/security/advisories')).toBe('Apache Security')
      })

      it('should return Node.js Security for nodejs.org', () => {
        expect(getReferenceDisplayName('https://nodejs.org/en/blog/vulnerability/abc')).toBe('Node.js Security')
      })

      it('should return Python Security for python.org', () => {
        expect(getReferenceDisplayName('https://www.python.org/security/advisory')).toBe('Python Security')
      })

      it('should return Ruby Security for ruby-lang.org', () => {
        expect(getReferenceDisplayName('https://www.ruby-lang.org/en/news/2024/01/01/advisory')).toBe('Ruby Security')
      })
    })

    describe('Bug tracker URLs', () => {
      it('should return Issue Tracker (Jira) for jira URLs', () => {
        expect(getReferenceDisplayName('https://issues.jira.com/browse/PROJ-123')).toBe('Issue Tracker (Jira)')
      })

      it('should return Issue Tracker (Jira) for atlassian.net URLs', () => {
        expect(getReferenceDisplayName('https://example.atlassian.net/browse/PROJ-123')).toBe('Issue Tracker (Jira)')
      })

      it('should return Bugzilla for bugzilla URLs', () => {
        expect(getReferenceDisplayName('https://bugzilla.mozilla.org/show_bug.cgi?id=123')).toBe('Bugzilla')
      })
    })

    describe('Security blog URLs', () => {
      it('should return SecurityFocus for securityfocus.com', () => {
        expect(getReferenceDisplayName('https://www.securityfocus.com/bid/12345')).toBe('SecurityFocus')
      })

      it('should return SecLists for seclists.org', () => {
        expect(getReferenceDisplayName('https://seclists.org/fulldisclosure/2024/Jan/1')).toBe('SecLists')
      })

      it('should return Packet Storm Security for packetstormsecurity.com', () => {
        expect(getReferenceDisplayName('https://packetstormsecurity.com/files/123456')).toBe('Packet Storm Security')
      })
    })

    describe('Fallback behavior', () => {
      it('should format hostname for unknown URLs', () => {
        const result = getReferenceDisplayName('https://www.example.com/page')
        expect(result).toBe('Example')
      })

      it('should capitalize the domain name part', () => {
        const result = getReferenceDisplayName('https://somewebsite.io/path')
        expect(result).toBe('Somewebsite')
      })

      it('should strip www. prefix in fallback', () => {
        const result = getReferenceDisplayName('https://www.unknown-site.org/path')
        expect(result).toBe('Unknown-site')
      })
    })

    describe('Invalid URL handling', () => {
      it('should return "External Link" for invalid URL', () => {
        expect(getReferenceDisplayName('not-a-url')).toBe('External Link')
      })

      it('should return "External Link" for empty string', () => {
        expect(getReferenceDisplayName('')).toBe('External Link')
      })
    })
  })

  describe('getReferenceIcon', () => {
    it('should return "github" for GitHub URLs', () => {
      expect(getReferenceIcon('https://github.com/org/repo')).toBe('github')
    })

    it('should return "nvd" for nvd.nist.gov URLs', () => {
      expect(getReferenceIcon('https://nvd.nist.gov/vuln/detail/CVE-2024-1')).toBe('nvd')
    })

    it('should return "nvd" for nist.gov URLs', () => {
      expect(getReferenceIcon('https://services.nist.gov/page')).toBe('nvd')
    })

    it('should return "huntr" for huntr.dev URLs', () => {
      expect(getReferenceIcon('https://huntr.dev/bounties/1')).toBe('huntr')
    })

    it('should return "osv" for osv.dev URLs', () => {
      expect(getReferenceIcon('https://osv.dev/vulnerability/OSV-1')).toBe('osv')
    })

    it('should return "vendor" for microsoft.com', () => {
      expect(getReferenceIcon('https://msrc.microsoft.com/update')).toBe('vendor')
    })

    it('should return "vendor" for oracle.com', () => {
      expect(getReferenceIcon('https://www.oracle.com/security')).toBe('vendor')
    })

    it('should return "vendor" for redhat.com', () => {
      expect(getReferenceIcon('https://access.redhat.com/errata')).toBe('vendor')
    })

    it('should return "vendor" for debian.org', () => {
      expect(getReferenceIcon('https://security-tracker.debian.org')).toBe('vendor')
    })

    it('should return "vendor" for ubuntu.com', () => {
      expect(getReferenceIcon('https://ubuntu.com/security')).toBe('vendor')
    })

    it('should return "vendor" for apache.org', () => {
      expect(getReferenceIcon('https://www.apache.org/security')).toBe('vendor')
    })

    it('should return "external" for unknown URLs', () => {
      expect(getReferenceIcon('https://www.example.com/page')).toBe('external')
    })

    it('should return "external" for invalid URL', () => {
      expect(getReferenceIcon('not-a-url')).toBe('external')
    })

    it('should return "external" for empty string', () => {
      expect(getReferenceIcon('')).toBe('external')
    })
  })
})
