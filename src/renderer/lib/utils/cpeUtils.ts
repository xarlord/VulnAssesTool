/**
 * CPE (Common Platform Enumeration) Utilities
 *
 * Provides CPE generation, suggestion, and validation functionality
 * for the SBOM Generator.
 *
 * CPE 2.3 Format: cpe:2.3:<part>:<vendor>:<product>:<version>:<update>:<edition>:<language>:<sw_edition>:<target_sw>:<target_hw>:<other>
 *
 * Parts:
 * - a: Application
 * - o: Operating System
 * - h: Hardware
 */

/**
 * Known vendor/product mappings for common libraries and frameworks
 * Used to suggest CPEs when a component doesn't have one
 */
const KNOWN_CPE_MAPPINGS: Record<
  string,
  {
    vendor: string
    product: string
    part: 'a' | 'o' | 'h'
    aliases?: string[]
  }
> = {
  // JavaScript/Node.js
  react: { vendor: 'facebook', product: 'react', part: 'a', aliases: ['reactjs'] },
  angular: { vendor: 'google', product: 'angular', part: 'a', aliases: ['angularjs'] },
  vue: { vendor: 'vuejs', product: 'vue.js', part: 'a', aliases: ['vuejs', 'vue.js'] },
  express: { vendor: 'expressjs', product: 'express', part: 'a' },
  lodash: { vendor: 'lodash', product: 'lodash', part: 'a' },
  axios: { vendor: 'axios', product: 'axios', part: 'a' },
  typescript: { vendor: 'microsoft', product: 'typescript', part: 'a' },
  webpack: { vendor: 'webpack', product: 'webpack', part: 'a' },
  babel: { vendor: 'babel', product: 'babel', part: 'a', aliases: ['babel-core', '@babel/core'] },
  jest: { vendor: 'facebook', product: 'jest', part: 'a' },
  electron: { vendor: 'electron', product: 'electron', part: 'a' },
  'next.js': { vendor: 'vercel', product: 'next.js', part: 'a', aliases: ['nextjs', 'next'] },
  'node.js': { vendor: 'nodejs', product: 'node.js', part: 'a', aliases: ['node', 'nodejs'] },

  // Java
  spring: {
    vendor: 'vmware',
    product: 'spring_framework',
    part: 'a',
    aliases: ['spring-framework', 'springframework'],
  },
  'spring-boot': { vendor: 'vmware', product: 'spring_boot', part: 'a', aliases: ['springboot', 'spring boot'] },
  hibernate: { vendor: 'redhat', product: 'hibernate_orm', part: 'a', aliases: ['hibernate-orm'] },
  jackson: {
    vendor: 'fasterxml',
    product: 'jackson-databind',
    part: 'a',
    aliases: ['jackson-databind', 'jackson databind'],
  },
  log4j: { vendor: 'apache', product: 'log4j', part: 'a', aliases: ['log4j-core', 'apache-log4j'] },
  tomcat: { vendor: 'apache', product: 'tomcat', part: 'a', aliases: ['apache-tomcat', 'tomcat-server'] },
  maven: { vendor: 'apache', product: 'maven', part: 'a', aliases: ['apache-maven'] },
  guava: { vendor: 'google', product: 'guava', part: 'a' },

  // Python
  django: { vendor: 'djangoproject', product: 'django', part: 'a' },
  flask: { vendor: 'palletsprojects', product: 'flask', part: 'a' },
  requests: { vendor: 'python', product: 'requests', part: 'a', aliases: ['python-requests'] },
  numpy: { vendor: 'numpy', product: 'numpy', part: 'a' },
  pandas: { vendor: 'pandas', product: 'pandas', part: 'a' },
  tensorflow: { vendor: 'google', product: 'tensorflow', part: 'a' },
  pytorch: { vendor: 'pytorch', product: 'pytorch', part: 'a' },

  // .NET/C#
  'asp.net': { vendor: 'microsoft', product: 'asp.net', part: 'a', aliases: ['aspnet', 'aspnetcore', 'asp.net core'] },
  'entity-framework': {
    vendor: 'microsoft',
    product: 'entity_framework',
    part: 'a',
    aliases: ['entityframework', 'entity framework'],
  },
  newtonsoft: { vendor: 'newtonsoft', product: 'json.net', part: 'a', aliases: ['json.net', 'newtonsoft.json'] },

  // PHP
  laravel: { vendor: 'laravel', product: 'laravel', part: 'a' },
  symfony: { vendor: 'sensiolabs', product: 'symfony', part: 'a' },
  wordpress: { vendor: 'wordpress', product: 'wordpress', part: 'a', aliases: ['wp'] },
  drupal: { vendor: 'drupal', product: 'drupal', part: 'a' },

  // Ruby
  rails: { vendor: 'rubyonrails', product: 'rails', part: 'a', aliases: ['rubyonrails', 'ruby on rails'] },
  sinatra: { vendor: 'sinatrarb', product: 'sinatra', part: 'a' },

  // Go
  gin: { vendor: 'gin-gonic', product: 'gin', part: 'a' },
  echo: { vendor: 'labstack', product: 'echo', part: 'a' },

  // Databases
  mysql: { vendor: 'oracle', product: 'mysql', part: 'a' },
  postgresql: { vendor: 'postgresql', product: 'postgresql', part: 'a', aliases: ['postgres', 'psql'] },
  mongodb: { vendor: 'mongodb', product: 'mongodb', part: 'a' },
  redis: { vendor: 'redis', product: 'redis', part: 'a' },
  sqlite: { vendor: 'sqlite', product: 'sqlite', part: 'a' },

  // Web Servers
  nginx: { vendor: 'nginx', product: 'nginx', part: 'a' },
  apache: {
    vendor: 'apache',
    product: 'http_server',
    part: 'a',
    aliases: ['httpd', 'apache-httpd', 'apache http server'],
  },

  // Operating Systems
  linux: { vendor: 'linux', product: 'linux_kernel', part: 'o', aliases: ['linux-kernel'] },
  ubuntu: { vendor: 'canonical', product: 'ubuntu_linux', part: 'o', aliases: ['ubuntu-linux'] },
  centos: { vendor: 'centos', product: 'centos', part: 'o' },
  debian: { vendor: 'debian', product: 'debian_linux', part: 'o' },
  windows: { vendor: 'microsoft', product: 'windows', part: 'o' },
  macos: { vendor: 'apple', product: 'macos', part: 'o', aliases: ['mac os x', 'osx'] },

  // Browsers
  chrome: { vendor: 'google', product: 'chrome', part: 'a', aliases: ['google-chrome', 'chromium'] },
  firefox: { vendor: 'mozilla', product: 'firefox', part: 'a', aliases: ['mozilla-firefox'] },
  safari: { vendor: 'apple', product: 'safari', part: 'a' },
  edge: { vendor: 'microsoft', product: 'edge', part: 'a', aliases: ['microsoft-edge'] },

  // Container/Cloud
  docker: { vendor: 'docker', product: 'docker', part: 'a' },
  kubernetes: { vendor: 'kubernetes', product: 'kubernetes', part: 'a', aliases: ['k8s'] },
  'aws-sdk': { vendor: 'amazon', product: 'aws_sdk', part: 'a', aliases: ['aws sdk', 'aws-sdk-js'] },

  // Security
  openssl: { vendor: 'openssl', product: 'openssl', part: 'a' },
  'openssl@3': { vendor: 'openssl', product: 'openssl', part: 'a' },

  // Utilities
  curl: { vendor: 'haxx', product: 'curl', part: 'a' },
  wget: { vendor: 'gnu', product: 'wget', part: 'a' },
  zip: { vendor: 'info-zip', product: 'zip', part: 'a' },
  unzip: { vendor: 'info-zip', product: 'unzip', part: 'a' },

  // Apache Foundation
  httpclient: { vendor: 'apache', product: 'httpclient', part: 'a', aliases: ['apache-httpclient', 'http-client'] },
  'commons-lang': {
    vendor: 'apache',
    product: 'commons_lang',
    part: 'a',
    aliases: ['commons-lang3', 'apache-commons-lang'],
  },
  'commons-io': { vendor: 'apache', product: 'commons_io', part: 'a', aliases: ['apache-commons-io'] },
}

/**
 * CPE Suggestion result
 */
export interface CPESuggestion {
  cpe: string
  vendor: string
  product: string
  confidence: 'high' | 'medium' | 'low'
  source: 'known_mapping' | 'inferred' | 'fallback'
}

/**
 * Generate CPE 2.3 formatted string
 */
export function generateCPE(
  part: 'a' | 'o' | 'h',
  vendor: string,
  product: string,
  version: string,
  options?: {
    update?: string
    edition?: string
    language?: string
    swEdition?: string
    targetSw?: string
    targetHw?: string
    other?: string
  },
): string {
  const escapeCPE = (value: string): string => {
    if (!value) return '*'
    // CPE allows: alphanumeric, hyphen, underscore, tilde, period
    // Other characters need special handling
    return value
      .replace(/\\/g, '\\\\')
      .replace(/!/g, '\\!')
      .replace(/"/g, '\\"')
      .replace(/#/g, '\\#')
      .replace(/\$/g, '\\$')
      .replace(/%/g, '\\%')
      .replace(/&/g, '\\&')
      .replace(/'/g, "\\'")
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\+/g, '\\+')
      .replace(/,/g, '\\,')
      .replace(/\//g, '\\/')
      .replace(/:/g, '\\:')
      .replace(/;/g, '\\;')
      .replace(/</g, '\\<')
      .replace(/=/g, '\\=')
      .replace(/>/g, '\\>')
      .replace(/\?/g, '\\?')
      .replace(/@/g, '\\@')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/`/g, '\\`')
      .replace(/\{/g, '\\{')
      .replace(/\|/g, '\\|')
      .replace(/\}/g, '\\}')
      .replace(/~/g, '\\~')
  }

  const parts = [
    'cpe',
    '2.3',
    part,
    escapeCPE(vendor),
    escapeCPE(product),
    escapeCPE(version),
    options?.update || '*',
    options?.edition || '*',
    options?.language || '*',
    options?.swEdition || '*',
    options?.targetSw || '*',
    options?.targetHw || '*',
    options?.other || '*',
  ]

  return parts.join(':')
}

/**
 * Parse a CPE string into its components
 */
export function parseCPE(cpe: string): {
  part: string
  vendor: string
  product: string
  version: string
  update: string
  edition: string
  language: string
  swEdition: string
  targetSw: string
  targetHw: string
  other: string
} | null {
  // Match CPE 2.3 format: cpe:2.3:<part>:<vendor>:<product>:<version>:...
  const cpe23Regex =
    /^cpe:2\.3:([aoh]):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*)$/
  const match = cpe.match(cpe23Regex)

  if (match) {
    const unescapeCPE = (value: string): string => {
      if (value === '*') return ''
      return value.replace(/\\(.)/g, '$1')
    }

    return {
      part: match[1],
      vendor: unescapeCPE(match[2]),
      product: unescapeCPE(match[3]),
      version: unescapeCPE(match[4]),
      update: unescapeCPE(match[5]),
      edition: unescapeCPE(match[6]),
      language: unescapeCPE(match[7]),
      swEdition: unescapeCPE(match[8]),
      targetSw: unescapeCPE(match[9]),
      targetHw: unescapeCPE(match[10]),
      other: unescapeCPE(match[11]),
    }
  }

  return null
}

/**
 * Validate CPE format
 */
export function isValidCPE(cpe: string): boolean {
  if (!cpe) return false

  // Check CPE 2.3 format
  const cpe23Regex = /^cpe:2\.3:[aoh]:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*:[^:]*$/
  if (cpe23Regex.test(cpe)) return true

  // Check CPE 2.2 format (deprecated but still used)
  const cpe22Regex = /^cpe:\/[aoh]:[^:]*:[^:]*(:[^:]*){0,5}$/
  if (cpe22Regex.test(cpe)) return true

  return false
}

/**
 * Normalize component name for matching
 */
function normalizeComponentName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[@]/g, '')
    .replace(/[/]/g, '-')
    .replace(/[_]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Check if a name matches a known mapping (including aliases)
 */
function findKnownMapping(componentName: string): {
  vendor: string
  product: string
  part: 'a' | 'o' | 'h'
} | null {
  const normalizedName = normalizeComponentName(componentName)

  for (const [key, mapping] of Object.entries(KNOWN_CPE_MAPPINGS)) {
    // Check direct match
    if (normalizeComponentName(key) === normalizedName) {
      return mapping
    }

    // Check aliases
    if (mapping.aliases) {
      for (const alias of mapping.aliases) {
        if (normalizeComponentName(alias) === normalizedName) {
          return mapping
        }
      }
    }
  }

  return null
}

/**
 * Infer vendor from component name
 */
function inferVendor(componentName: string): string {
  const normalizedName = normalizeComponentName(componentName)

  // Common vendor name patterns
  if (normalizedName.includes('aws') || normalizedName.includes('amazon')) return 'amazon'
  if (normalizedName.includes('azure') || normalizedName.includes('microsoft')) return 'microsoft'
  if (normalizedName.includes('google') || normalizedName.includes('gcp')) return 'google'
  if (normalizedName.includes('apache')) return 'apache'
  if (normalizedName.includes('oracle')) return 'oracle'
  if (normalizedName.includes('ibm')) return 'ibm'
  if (normalizedName.includes('redhat') || normalizedName.includes('red-hat')) return 'redhat'

  // Use the component name as vendor (common pattern)
  return componentName.toLowerCase().split(/[-_/]/)[0] || componentName.toLowerCase()
}

/**
 * Generate suggested CPEs for a component
 *
 * @param componentName - The name of the component
 * @param version - The version of the component
 * @returns Array of CPE suggestions sorted by confidence
 */
export function suggestCPEs(componentName: string, version: string): CPESuggestion[] {
  const suggestions: CPESuggestion[] = []

  if (!componentName || !version) {
    return suggestions
  }

  // 1. Check known mappings first (high confidence)
  const knownMapping = findKnownMapping(componentName)
  if (knownMapping) {
    suggestions.push({
      cpe: generateCPE(knownMapping.part, knownMapping.vendor, knownMapping.product, version),
      vendor: knownMapping.vendor,
      product: knownMapping.product,
      confidence: 'high',
      source: 'known_mapping',
    })
  }

  // 2. Generate inferred CPE (medium confidence)
  const inferredVendor = inferVendor(componentName)
  const normalizedName = normalizeComponentName(componentName)

  // Only add if different from known mapping
  const knownVendor = knownMapping?.vendor
  if (!knownMapping || inferredVendor !== knownVendor) {
    suggestions.push({
      cpe: generateCPE('a', inferredVendor, normalizedName, version),
      vendor: inferredVendor,
      product: normalizedName,
      confidence: knownMapping ? 'medium' : 'medium',
      source: 'inferred',
    })
  }

  // 3. Add fallback with component name as both vendor and product (low confidence)
  if (!knownMapping) {
    // Try with hyphenated product name
    suggestions.push({
      cpe: generateCPE('a', inferredVendor, componentName.toLowerCase().replace(/\s+/g, '_'), version),
      vendor: inferredVendor,
      product: componentName.toLowerCase().replace(/\s+/g, '_'),
      confidence: 'low',
      source: 'fallback',
    })
  }

  // Remove duplicates and sort by confidence
  const seen = new Set<string>()
  const uniqueSuggestions = suggestions.filter((s) => {
    if (seen.has(s.cpe)) return false
    seen.add(s.cpe)
    return true
  })

  // Sort by confidence (high first)
  const confidenceOrder = { high: 0, medium: 1, low: 2 }
  uniqueSuggestions.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence])

  return uniqueSuggestions
}

/**
 * Get all known component names for autocomplete/suggestions
 */
export function getKnownComponentNames(): string[] {
  const names = new Set<string>()

  for (const [key, mapping] of Object.entries(KNOWN_CPE_MAPPINGS)) {
    names.add(key)
    if (mapping.aliases) {
      mapping.aliases.forEach((alias) => names.add(alias))
    }
  }

  return Array.from(names).sort()
}

/**
 * Format CPE for display
 */
export function formatCPEForDisplay(cpe: string): string {
  const parsed = parseCPE(cpe)
  if (!parsed) return cpe

  const partNames: Record<string, string> = {
    a: 'Application',
    o: 'Operating System',
    h: 'Hardware',
  }

  return `${partNames[parsed.part] || 'Unknown'}: ${parsed.vendor} / ${parsed.product} ${parsed.version}`
}

/**
 * Convert CPE 2.2 to CPE 2.3 format
 */
export function convertCPE22To23(cpe22: string): string | null {
  // CPE 2.2 format: cpe:/[aoh]:vendor:product:version:update:edition:language
  const match = cpe22.match(
    /^cpe:\/([aoh])(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?(?::([^:]*))?$/,
  )

  if (!match) return null

  const [, part, vendor = '*', product = '*', version = '*', update = '*', edition = '*', language = '*'] = match

  return generateCPE(part as 'a' | 'o' | 'h', vendor, product, version, { update, edition, language })
}

/**
 * Normalize CPE to CPE 2.3 format
 */
export function normalizeCPE(cpe: string): string | null {
  if (!cpe) return null

  // Already CPE 2.3
  if (cpe.startsWith('cpe:2.3:')) {
    return cpe
  }

  // Convert CPE 2.2
  if (cpe.startsWith('cpe:/')) {
    return convertCPE22To23(cpe)
  }

  return null
}
