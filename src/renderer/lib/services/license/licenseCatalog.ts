import type { LicenseCategory } from './types'

/**
 * Curated offline catalog of common SPDX license ids → risk category.
 * Keyed by lowercased SPDX id for case-insensitive lookup. Covers the licenses
 * that dominate real SBOMs; unrecognized ids fall through to 'unknown'.
 */
const CATALOG: Record<string, LicenseCategory> = {
  // Public domain / no-attribution
  'cc0-1.0': 'public-domain',
  unlicense: 'public-domain',
  '0bsd': 'public-domain',
  wtfpl: 'public-domain',

  // Permissive
  mit: 'permissive',
  'mit-0': 'permissive',
  'apache-2.0': 'permissive',
  'apache-1.1': 'permissive',
  'bsd-2-clause': 'permissive',
  'bsd-3-clause': 'permissive',
  'bsd-3-clause-clear': 'permissive',
  isc: 'permissive',
  zlib: 'permissive',
  'bsl-1.0': 'permissive',
  'python-2.0': 'permissive',
  postgresql: 'permissive',
  x11: 'permissive',
  ncsa: 'permissive',
  'ms-pl': 'permissive',
  'libpng-2.0': 'permissive',
  'unicode-dfs-2016': 'permissive',

  // Weak copyleft (file/library scope)
  'lgpl-2.0-only': 'weak-copyleft',
  'lgpl-2.0-or-later': 'weak-copyleft',
  'lgpl-2.1-only': 'weak-copyleft',
  'lgpl-2.1-or-later': 'weak-copyleft',
  'lgpl-3.0-only': 'weak-copyleft',
  'lgpl-3.0-or-later': 'weak-copyleft',
  'mpl-1.1': 'weak-copyleft',
  'mpl-2.0': 'weak-copyleft',
  'epl-1.0': 'weak-copyleft',
  'epl-2.0': 'weak-copyleft',
  'cddl-1.0': 'weak-copyleft',
  'cddl-1.1': 'weak-copyleft',
  'cpl-1.0': 'weak-copyleft',
  'osl-3.0': 'weak-copyleft',
  'artistic-2.0': 'weak-copyleft',
  // Deprecated LGPL short forms
  'lgpl-2.1': 'weak-copyleft',
  'lgpl-3.0': 'weak-copyleft',

  // Strong copyleft
  'gpl-2.0-only': 'strong-copyleft',
  'gpl-2.0-or-later': 'strong-copyleft',
  'gpl-3.0-only': 'strong-copyleft',
  'gpl-3.0-or-later': 'strong-copyleft',
  // Deprecated GPL short forms
  'gpl-2.0': 'strong-copyleft',
  'gpl-3.0': 'strong-copyleft',

  // Network copyleft (SaaS reach)
  'agpl-3.0-only': 'network-copyleft',
  'agpl-3.0-or-later': 'network-copyleft',
  'agpl-3.0': 'network-copyleft',
}

/** Look up a single SPDX id's category, or undefined if not in the catalog. */
export function lookupSpdxCategory(id: string): LicenseCategory | undefined {
  return CATALOG[id.trim().toLowerCase()]
}
