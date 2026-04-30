# VulnAssessTool Deployment Guide

This guide covers the complete deployment process for VulnAssessTool, including code signing, build configuration, automated releases, and update distribution.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Code Signing Setup](#code-signing-setup)
4. [Local Builds](#local-builds)
5. [Automated Releases](#automated-releases)
6. [GitHub Secrets Configuration](#github-secrets-configuration)
7. [Update Distribution](#update-distribution)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Overview

VulnAssessTool uses the following deployment stack:

- **electron-builder** - Cross-platform packaging and code signing
- **electron-updater** - Automatic update mechanism
- **GitHub Actions** - CI/CD automation
- **GitHub Releases** - Distribution platform

### Supported Platforms

| Platform | Architectures         | Package Formats              |
| -------- | --------------------- | ---------------------------- |
| Windows  | x64, arm64            | NSIS installer, Portable ZIP |
| macOS    | x64, arm64, Universal | DMG, ZIP                     |
| Linux    | x64, arm64            | AppImage, DEB, RPM           |

---

## Prerequisites

### Development Tools

```bash
# Install Node.js dependencies
npm install
```

### Platform-Specific Requirements

**Windows (Windows Code Signing)**

- Windows 10/11 with admin privileges
- Code signing certificate (`.pfx` or `.p12` file)
- Visual Studio Build Tools (for native modules)

**macOS (Apple Code Signing)**

- macOS 11+ (Big Sur or later)
- Xcode Command Line Tools: `xcode-select --install`
- Apple Developer Account ($99/year)
- Code signing certificate
- Notarization credentials

**Linux (GPG Signing)**

- GnuPG 2.x
- GPG key pair for package signing
- Docker (for AppImage builds)

---

## Code Signing Setup

### Why Code Signing Matters

Code signing provides:

1. **User Trust** - Verified publisher identity
2. **Security Warnings** - Eliminates "unidentified developer" warnings
3. **SmartScreen Bypass** - Windows Defender trust
4. **Auto-Updates** - Required for secure update distribution
5. **Compliance** - Enterprise security requirements

### Windows Code Signing

#### Option 1: Extended Validation (EV) Certificate

Recommended for production releases.

**Obtaining an EV Certificate:**

1. Choose a Certificate Authority (CA):
   - DigiCert
   - Sectigo (formerly Comodo)
   - GlobalSign
   - SSL.com

2. Purchase a "Code Signing Certificate" for Individual or Organization

3. Complete identity verification (organization documents required)

4. Receive certificate via hardware token or email

**Converting Certificate Format:**

```bash
# If received as PFX/P12, export for cross-platform use
openssl pkcs12 -in certificate.pfx -out cert.pem -nokeys
openssl pkcs12 -in certificate.pfx -out key.pem -nocerts -nodes

# Convert to base64 for GitHub Secrets
base64 -i certificate.pfx | pbcopy  # macOS
base64 -w 0 certificate.pfx > cert.txt  # Linux
```

**Local Testing (Windows):**

```bash
# Set environment variables
set WIN_CSC_LINK=C:\path\to\certificate.pfx
set WIN_CSC_KEY_PASSWORD=your-password

# Build signed package
npm run dist:win
```

#### Option 2: Self-Signed Certificate (Development Only)

For testing only - users will see security warnings.

```powershell
# Create self-signed certificate
New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=VulnAssessTool Dev" `
  -CertStoreLocation "Cert:\LocalMachine\My"

# Export to PFX
$password = ConvertTo-SecureString -String "password" -Force -AsPlainText
Export-PfxCertificate `
  -Cert "Cert:\LocalMachine\My\<Thumbprint>" `
  -FilePath dev-cert.pfx `
  -Password $password
```

### macOS Code Signing & Notarization

#### Step 1: Apple Developer Account

1. Join [Apple Developer Program](https://developer.apple.com/programs/)
2. Pay annual fee ($99)
3. Complete enrollment (may take 24-48 hours)

#### Step 2: Generate Certificates

**Developer ID Application Certificate:**

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Generate Certificate Signing Request
openssl genrsa -out macos.key 2048
openssl req -new -key macos.key -out macos.csr

# Submit CSR to Apple Developer Portal
# Download resulting certificate: developerID_application.cer

# Convert to P12
openssl x509 -in developerID_application.cer -inform DER -out developerID_application.pem
openssl pkcs12 -export -out macos_cert.p12 -inkey macos.key -in developerID_application.pem
```

**Developer ID Installer Certificate (for PKG installers):**

Repeat the process for an installer certificate.

#### Step 3: App-Specific Password for Notarization

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. Go to "Security" > "App-Specific Passwords"
4. Generate a new password for "VulnAssessTool Notarization"
5. Save this password - you won't see it again

#### Step 4: Find Your Team ID

```bash
# List all developer identities
security find-identity -v -p codesigning

# Output example: 1) 83A3B5K7Y9 "Developer ID Application: Your Name (TEAMID)"
#                                                    ^^^^^^^^ This is your Team ID
```

#### Local Testing (macOS):\*\*

```bash
# Set environment variables
export APPLE_ID="your-email@example.com"
export APPLE_ID_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
export MAC_CERTS="$(base64 -i macos_cert.p12)"
export MAC_CERTS_PASSWORD="p12-password"
export KEYCHAIN_PASSWORD="temp-keychain-password"

# Build signed package
npm run dist:mac
```

### Linux GPG Signing

**Generate GPG Key:**

```bash
# Generate new key
gpg --full-generate-key

# Select: (1) RSA and RSA
# Key size: 4096
# Valid for: 0 (does not expire)
# Real name: VulnAssessTool Release Bot
# Email: releases@vulnasstool.com

# Export public key
gpg --armor --export your-email@example.com > public-key.asc

# Export secret key (handle carefully!)
gpg --armor --export-secret-keys your-email@example.com > secret-key.asc
```

**Sign Packages (Post-Build):**

```bash
# Sign AppImage
gpg --detach-sign --armor VulnAssessTool-0.1.0.AppImage

# Sign DEB
dpkg-sig --sign builder VulnAssessTool-0.1.0.deb

# Sign RPM
rpm --addsign VulnAssessTool-0.1.0.rpm
```

---

## Local Builds

### Build for Current Platform

```bash
# Build for current platform only
npm run build

# Package (no code signing)
npm run pack

# Build and package (with code signing if configured)
npm run dist
```

### Platform-Specific Builds

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux

# All platforms (cross-platform builds require platform-specific tools)
npm run dist:all
```

### Build Configuration

The build configuration is in `package.json` under the `build` key. Key settings:

```json
{
  "build": {
    "appId": "com.vulnasstool.app",
    "productName": "VulnAssessTool",
    "directories": {
      "output": "release",
      "buildResources": "build"
    },
    "publish": {
      "provider": "github",
      "owner": "vulnasstool",
      "repo": "vuln-asses-tool"
    }
  }
}
```

---

## Automated Releases

### GitHub Actions Workflow

The project includes two GitHub Actions workflows:

1. **CI** - Runs on every push/PR (`ci.yml`)
   - Runs tests
   - Checks code quality
   - Validates build

2. **Release** - Runs on version tags (`release.yml`)
   - Builds all platforms
   - Applies code signing
   - Creates GitHub Release
   - Uploads artifacts

### Creating a Release

**Manual Release:**

```bash
# 1. Update version in package.json
npm version patch  # or minor, or major

# 2. Push tag to GitHub
git push origin main
git push origin v0.1.1

# 3. GitHub Actions will:
#    - Build all platforms
#    - Sign binaries
#    - Create release on GitHub
#    - Upload artifacts
```

**Via GitHub UI:**

1. Go to "Actions" tab in GitHub
2. Select "Release" workflow
3. Click "Run workflow"
4. Enter version (e.g., `v1.0.0`)
5. Click "Run workflow"

### Release Checklist

Before creating a release:

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md`
- [ ] All tests passing
- [ ] Code coverage meets threshold (95%)
- [ ] Security audit passes
- [ ] Release notes prepared
- [ ] Beta testing completed
- [ ] Code signing certificates valid

---

## GitHub Secrets Configuration

Configure the following secrets in your GitHub repository settings (Settings > Secrets and variables > Actions):

### Windows Code Signing

| Secret Name            | Description                     | Example                  |
| ---------------------- | ------------------------------- | ------------------------ |
| `WIN_CSC_LINK`         | Base64-encoded certificate file | `base64 certificate.pfx` |
| `WIN_CSC_KEY_PASSWORD` | Certificate password            | `your-password`          |

### macOS Code Signing & Notarization

| Secret Name          | Description                    | Example                  |
| -------------------- | ------------------------------ | ------------------------ |
| `APPLE_ID`           | Apple ID email                 | `your-email@example.com` |
| `APPLE_ID_PASSWORD`  | App-specific password          | `abcd-efgh-ijkl-mnop`    |
| `APPLE_TEAM_ID`      | Developer Team ID              | `83A3B5K7Y9`             |
| `MAC_CERTS`          | Base64-encoded P12 certificate | `base64 cert.p12`        |
| `MAC_CERTS_PASSWORD` | P12 file password              | `p12-password`           |
| `KEYCHAIN_PASSWORD`  | Temporary keychain password    | `random-password`        |

### GitHub Token

The `GITHUB_TOKEN` is automatically provided by GitHub Actions with necessary permissions.

### Setting Secrets via GitHub CLI

```bash
# Install GitHub CLI
# macOS: brew install gh
# Windows: winget install GitHub.cli

# Authenticate
gh auth login

# Add secrets
gh secret set WIN_CSC_LINK < cert-base64.txt
gh secret set WIN_CSC_KEY_PASSWORD
gh secret set APPLE_ID
gh secret set APPLE_ID_PASSWORD
gh secret set APPLE_TEAM_ID
gh secret set MAC_CERTS < cert-base64.txt
gh secret set MAC_CERTS_PASSWORD
gh secret set KEYCHAIN_PASSWORD

# Verify secrets
gh secret list
```

---

## Update Distribution

VulnAssessTool uses electron-updater for automatic updates.

### Update Feed Configuration

Updates are distributed via GitHub Releases. The feed URL is:

```
https://github.com/vulnasstool/vuln-asses-tool/releases/latest
```

### Update Flow

1. App checks for updates on startup (5-second delay)
2. User can manually check in Settings
3. If update available:
   - User notified
   - Update auto-downloads (if enabled)
   - User prompted to install
4. On install:
   - App quits
   - Installer runs
   - App restarts with new version

### Update Frequency

- Automatic check: Every app launch
- Background checks: Can be configured in settings
- Manual check: Via Settings menu

### Channel Configuration

For beta/nightly builds, configure update channels:

```typescript
// In electron/updater.ts
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'vulnasstool',
  repo: 'vuln-asses-tool',
  // v${version}%20+ is the prerelease tag
  channel: 'beta', // or 'alpha', 'nightly'
})
```

---

## Troubleshooting

### Windows Code Signing

**Problem: "Cannot find signer certificate"**

Solution:

```powershell
# Install certificate to local machine store
certutil -importPFX certificate.pfx

# Verify installation
certutil -store My | findstr "Developer"
```

**Problem: "SignTool error: No certificates were found"**

Solution:

- Ensure certificate password is correct
- Check `WIN_CSC_LINK` environment variable
- Verify certificate has code signing EKU

### macOS Notarization

**Problem: "Unable to find login keychain"**

Solution:

```bash
# Create temporary keychain
security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
security default-keychain -s build.keychain
security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
```

**Problem: "Notarization failed"**

Solution:

- Check Apple ID credentials
- Verify app-specific password
- Check Team ID is correct
- Review notarization logs:

```bash
xcrun notarytool log \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_ID_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  <submission-id>
```

### Build Issues

**Problem: Native module compilation fails**

Solution:

```bash
# Rebuild native modules
npm rebuild

# Rebuild for specific electron version
npx electron-rebuild -f -w better-sqlite3
```

**Problem: "Out of memory" during build**

Solution:

```bash
# Increase Node memory limit
export NODE_OPTIONS="--max-old-space-size=8192"
npm run dist
```

### Update Issues

**Problem: Updates not detected**

Solution:

- Verify version in package.json matches release tag
- Check release has `latest` pointer
- Ensure `publish` config in package.json is correct
- Check update feed URL accessibility

**Problem: "Could not get code signature"**

Solution:

- Ensure app is signed before notarization (macOS)
- Verify hardening runtime is enabled
- Check entitlements file is correct

---

## Security Hardening

### Pre-Deployment Security Checklist

Before deploying VulnAssesTool to production, ensure all security measures are in place:

#### Code Security

- [x] All API keys removed from renderer process
- [x] SQL injection prevention applied consistently
- [x] Input validation on all user inputs
- [x] File upload size limits enforced
- [x] Parsing timeout protection in place

#### Electron Security

- [x] Context isolation enabled
- [x] Node integration disabled
- [x] Custom CSP headers implemented
- [x] webSecurity enabled
- [x] SafeStorage API configured

#### Network Security

- [x] IPC rate limiting configured
- [x] External API validation (URLs, protocols)
- [x] Certificate pinning for critical APIs
- [x] Request timeout enforcement

#### Data Security

- [x] Sensitive data encrypted at rest
- [x] API keys in platform secure storage
- [x] No sensitive data in localStorage
- [x] Secure credential clearing on logout

### CSP Configuration

Content Security Policy (CSP) is configured in `index.html`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self';
  connect-src 'self' https://services.nvd.nist.gov https://api.osv.dev;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
"
/>
```

**CSP Directives Explained:**

| Directive       | Value                  | Purpose                          |
| --------------- | ---------------------- | -------------------------------- |
| default-src     | 'self'                 | Default policy: only same-origin |
| script-src      | 'self'                 | No inline scripts or eval()      |
| connect-src     | Specific URLs          | Only connect to NVD and OSV APIs |
| style-src       | 'self' 'unsafe-inline' | Allow inline styles for Tailwind |
| object-src      | 'none'                 | No plugins or objects allowed    |
| frame-ancestors | 'none'                 | Prevent clickjacking             |

**To Customize CSP:**

Edit `electron/main/index.html` and modify the CSP meta tag. After changes:

1. Test all application features
2. Check browser console for violations
3. Adjust directives as needed

### Rate Limiting Configuration

IPC rate limiting is configured in `electron/main/rateLimit.ts`:

**Default Limits:**

| IPC Channel        | Max Requests | Window   | Priority |
| ------------------ | ------------ | -------- | -------- |
| db:nvd-search      | 100          | 60000ms  | 5        |
| db:nvd-get-by-cve  | 200          | 60000ms  | 7        |
| db:sync-start      | 5            | 300000ms | 3        |
| secure-storage:get | 50           | 60000ms  | 8        |
| secure-storage:set | 10           | 60000ms  | 6        |

**To Customize Rate Limits:**

```typescript
// electron/main/rateLimit.ts
export const RATE_LIMITS = {
  'db:nvd-search': {
    maxRequests: 100, // Increase if needed
    windowMs: 60000, // 1 minute
    priority: 5,
    burstAllowance: 10, // Allow temporary bursts
  },
  // Add custom limits for new channels
}
```

**Monitoring Rate Limits:**

Rate limit violations are logged to the main process console. Monitor production logs to:

- Detect abuse patterns
- Identify legitimate users hitting limits
- Adjust limits based on usage patterns

---

## Best Practices

### Version Management

1. **Semantic Versioning**: Follow MAJOR.MINOR.PATCH
   - MAJOR: Breaking changes
   - MINOR: New features
   - PATCH: Bug fixes

2. **Pre-release Versions**: Use suffixes
   - `1.0.0-beta.1`
   - `1.0.0-rc.1`

3. **Changelog Maintenance**: Update with every release

### Security Best Practices

1. **Certificate Storage**
   - Never commit certificates to repository
   - Use environment variables or secret managers
   - Rotate certificates annually

2. **Build Verification**
   - Verify checksums of built packages
   - Test signed binaries on clean systems
   - Virus scan all releases

3. **Access Control**
   - Limit who can push to main branch
   - Require code review for all changes
   - Use protected branches in GitHub

4. **Security Testing**
   - Run security audits before each release
   - Test with vulnerable test files
   - Penetration test annually
   - Monitor for CVEs in dependencies

5. **Secrets Management**
   - Use environment variables for all secrets
   - Never hardcode API keys or credentials
   - Rotate secrets regularly
   - Use different keys for dev/staging/prod

### Release Checklist

**Before Release:**

- [ ] Version incremented
- [ ] CHANGELOG updated
- [ ] All tests passing
- [ ] Security audit clean
- [ ] Documentation updated
- [ ] Beta testing completed
- [ ] Backup current release

**After Release:**

- [ ] Verify all artifacts uploaded
- [ ] Test update from previous version
- [ ] Announce release (users, changelog)
- [ ] Monitor download statistics
- [ ] Monitor crash reports
- [ ] Tag issues for next release

### Continuous Improvement

- Track build times
- Monitor failure rates
- Gather user feedback on updates
- Regular security audits
- Dependency updates

---

## Additional Resources

- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing Best Practices](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)

---

## Support

For deployment issues:

1. Check GitHub Issues for similar problems
2. Review build logs in GitHub Actions
3. Consult troubleshooting section above
4. Open a new issue with full error logs

---

**Last Updated:** 2026-02-12
**Version:** 1.0.0
