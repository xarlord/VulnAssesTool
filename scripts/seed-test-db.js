/**
 * Database Seed Script for E2E Tests
 *
 * Seeds the E2E database THROUGH the built server's own NvdDatabase class, so
 * the schema (tables, migrations, FTS triggers, indexes) always matches what
 * the server under test expects. e2e/global-setup.ts builds the server before
 * calling this, so dist/server is guaranteed to exist and be current.
 *
 * The previous implementation hand-rolled a minimal sql.js schema that the
 * real server could not fully use (no FTS triggers, missing tables), and wrote
 * it to a path the server never read — E2E silently ran against whatever real
 * NVD data the developer had synced.
 *
 * Usage: node scripts/seed-test-db.js <db-path>   (db-path is REQUIRED so this
 * script can never accidentally rebuild a developer's real database)
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, mkdirSync, rmSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample CVE data for testing
const SAMPLE_CVES = [
  // CVE-2023 samples
  {
    id: 'CVE-2023-0001',
    description: 'Critical buffer overflow vulnerability in sample application allowing remote code execution.',
    cvss_score: 9.8,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2023-01-15T00:00:00Z',
    modified_at: '2023-06-20T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:sample:app:1.0.0:*:*:*:*:*:*:*', vulnerable: true },
      { cpe_text: 'cpe:2.3:a:sample:app:1.0.1:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2023-0002',
    description: 'High severity SQL injection vulnerability in database module.',
    cvss_score: 8.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N',
    severity: 'HIGH',
    published_at: '2023-02-20T00:00:00Z',
    modified_at: '2023-07-10T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:sample:database:2.0.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2023-0003',
    description: 'Medium severity cross-site scripting (XSS) vulnerability in web interface.',
    cvss_score: 6.1,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
    severity: 'MEDIUM',
    published_at: '2023-03-10T00:00:00Z',
    modified_at: '2023-08-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:sample:webui:1.5.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2023-2152',
    description: 'Low severity information disclosure vulnerability in logging component.',
    cvss_score: 3.1,
    cvss_vector: 'CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:N/A:N',
    severity: 'LOW',
    published_at: '2023-04-05T00:00:00Z',
    modified_at: '2023-09-01T00:00:00Z',
    source: 'NVD',
    cpe_matches: []
  },
  {
    id: 'CVE-2023-3854',
    description: 'Critical remote code execution vulnerability in curl library when using SOCKS5 proxy.',
    cvss_score: 9.8,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2023-10-11T00:00:00Z',
    modified_at: '2023-11-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:haxx:curl:8.3.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  // CVE-2024 samples
  {
    id: 'CVE-2024-0001',
    description: 'Critical authentication bypass vulnerability in authentication module.',
    cvss_score: 9.1,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
    severity: 'CRITICAL',
    published_at: '2024-01-10T00:00:00Z',
    modified_at: '2024-02-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:sample:auth:3.0.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2024-0002',
    description: 'High severity path traversal vulnerability in file upload handler.',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    severity: 'HIGH',
    published_at: '2024-02-01T00:00:00Z',
    modified_at: '2024-03-10T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:sample:upload:1.2.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2024-2178',
    description: 'High severity denial of service vulnerability in network protocol parser.',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
    severity: 'HIGH',
    published_at: '2024-03-05T00:00:00Z',
    modified_at: '2024-04-01T00:00:00Z',
    source: 'NVD',
    cpe_matches: []
  },
  {
    id: 'CVE-2024-3094',
    description: 'Critical backdoor in XZ Utils library allowing authentication bypass.',
    cvss_score: 10.0,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2024-03-29T00:00:00Z',
    modified_at: '2024-04-05T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:tukaani:xz:5.6.0:*:*:*:*:*:*:*', vulnerable: true },
      { cpe_text: 'cpe:2.3:a:tukaani:xz:5.6.1:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2024-4577',
    description: 'Critical remote code execution in PHP through argument injection.',
    cvss_score: 9.8,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2024-06-06T00:00:00Z',
    modified_at: '2024-06-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:php:php:8.1.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  // Common library vulnerabilities
  {
    id: 'CVE-2023-0286',
    description: 'High severity buffer overflow in OpenSSL X.509 certificate verification.',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N',
    severity: 'HIGH',
    published_at: '2023-02-07T00:00:00Z',
    modified_at: '2023-03-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:openssl:openssl:3.0.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  {
    id: 'CVE-2023-44487',
    description: 'High severity HTTP/2 rapid reset attack causing denial of service.',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
    severity: 'HIGH',
    published_at: '2023-10-10T00:00:00Z',
    modified_at: '2023-11-01T00:00:00Z',
    source: 'NVD',
    cpe_matches: []
  },
  // lodash vulnerability
  {
    id: 'CVE-2021-23337',
    description: 'Medium severity command injection in lodash template function.',
    cvss_score: 5.3,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N',
    severity: 'MEDIUM',
    published_at: '2021-02-15T00:00:00Z',
    modified_at: '2023-05-01T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  // express vulnerability
  {
    id: 'CVE-2022-24999',
    description: 'High severity prototype pollution in express.js query parser.',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N',
    severity: 'HIGH',
    published_at: '2022-11-03T00:00:00Z',
    modified_at: '2023-01-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:expressjs:express:4.18.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  // React vulnerability
  {
    id: 'CVE-2023-29827',
    description: 'Medium severity cross-site scripting in React SVG rendering.',
    cvss_score: 6.1,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
    severity: 'MEDIUM',
    published_at: '2023-04-20T00:00:00Z',
    modified_at: '2023-06-01T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:meta:react:18.0.0:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
  // Log4Shell — matches the log4j component in fixtures/sbom-with-vulns.json so the
  // upload -> scan -> vulnerabilities pipeline test surfaces a real critical CVE offline.
  // The scan falls back to an FTS text search on the component name ("log4j"), so the
  // description must contain the standalone token "Log4j"; the CPE also carries product
  // "log4j" for the CPE-based match paths.
  {
    id: 'CVE-2021-44228',
    description:
      'Critical remote code execution in Apache Log4j (Log4Shell). JNDI features in Log4j 2.x ' +
      '(2.0 through 2.14.1) allow attacker-controlled LDAP lookups. Affects log4j and log4j-core.',
    cvss_score: 10.0,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2021-12-10T00:00:00Z',
    modified_at: '2023-11-15T00:00:00Z',
    source: 'NVD',
    cpe_matches: [
      { cpe_text: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', vulnerable: true },
    ]
  },
];

async function seedDatabase(dbPath) {
  console.log('Seeding test database at:', dbPath);

  // Fresh, deterministic fixture: remove any DB left over from a prior run.
  // On Windows a lingering server process can hold the file (EPERM) — in that
  // case fall back to upserting into the existing DB, which is idempotent for
  // this fixed fixture set.
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(dbPath + suffix, { force: true });
    } catch (err) {
      console.warn(`Could not remove ${dbPath + suffix} (${err.code}); seeding into existing DB`);
    }
  }
  const dbDir = path.dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Import the BUILT server database class — schema/migrations/FTS triggers
  // are created by the same code the server runs.
  const nvdDbModule = path.join(__dirname, '..', 'dist', 'server', 'database', 'nvdDb.js');
  if (!existsSync(nvdDbModule)) {
    throw new Error(`Built server not found at ${nvdDbModule} — run "npm run build:server" first`);
  }
  const { NvdDatabase } = await import(pathToFileURL(nvdDbModule).href);

  const db = new NvdDatabase(dbPath);
  await db.initialize();

  let inserted = 0;
  for (const cve of SAMPLE_CVES) {
    const { cpe_matches: cpeMatches, ...record } = cve;
    await db.upsertCVE(record);
    if (cpeMatches.length > 0) {
      await db.insertCPEMatches(
        cve.id,
        cpeMatches.map((m) => ({ cve_id: cve.id, cpe_text: m.cpe_text, vulnerable: m.vulnerable })),
      );
    }
    inserted++;
  }

  await db.close();

  console.log('\n=== Database Seed Complete ===');
  console.log(`Inserted: ${inserted} CVEs`);
  console.log(`Database saved to: ${dbPath}`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  // A default path once pointed this script at real user data; require the
  // caller (e2e/global-setup.ts) to be explicit so that can never recur.
  console.error('Usage: node scripts/seed-test-db.js <db-path>');
  process.exit(1);
}

seedDatabase(args[0]).catch(err => {
  console.error('Failed to seed database:', err);
  process.exit(1);
});
