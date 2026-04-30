/**
 * Database Seed Script for E2E Tests
 *
 * This script populates the local NVD database with sample CVE data
 * to ensure E2E tests have data to work with.
 *
 * Usage: node scripts/seed-test-db.js [db-path]
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

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
      { cpe_text: 'cpe:2.3:a:sample:app:1.0.0:*:*:*:*:*:*:*', vulnerable: 1 },
      { cpe_text: 'cpe:2.3:a:sample:app:1.0.1:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:sample:database:2.0.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:sample:webui:1.5.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:haxx:curl:8.3.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:sample:auth:3.0.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:sample:upload:1.2.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:tukaani:xz:5.6.0:*:*:*:*:*:*:*', vulnerable: 1 },
      { cpe_text: 'cpe:2.3:a:tukaani:xz:5.6.1:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:php:php:8.1.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:openssl:openssl:3.0.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:expressjs:express:4.18.0:*:*:*:*:*:*:*', vulnerable: 1 },
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
      { cpe_text: 'cpe:2.3:a:meta:react:18.0.0:*:*:*:*:*:*:*', vulnerable: 1 },
    ]
  },
];

async function seedDatabase(dbPath) {
  console.log('Seeding test database at:', dbPath);

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Find WASM file
  const possiblePaths = [
    path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(__dirname, '../dist/sql-wasm.wasm'),
    path.join(__dirname, '../sql-wasm.wasm'),
  ];

  let wasmPath = null;
  for (const testPath of possiblePaths) {
    if (existsSync(testPath)) {
      wasmPath = testPath;
      break;
    }
  }

  if (!wasmPath) {
    throw new Error('Could not find sql.js WASM file');
  }

  console.log('Found WASM at:', wasmPath);

  // Initialize sql.js
  const wasmBuffer = readFileSync(wasmPath);
  const sqlJs = await initSqlJs({
    wasmBinary: wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength)
  });

  // Load or create database
  let db;
  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath);
    db = new sqlJs.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new sqlJs.Database();
    console.log('Created new database');
  }

  // Create schema if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS cves (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      cvss_score REAL,
      cvss_vector TEXT,
      severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
      published_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      source TEXT CHECK(source IN ('NVD', 'OSV')) NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS cpe_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve_id TEXT NOT NULL,
      cpe_text TEXT NOT NULL,
      vulnerable INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS "references" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve_id TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT,
      tags TEXT,
      FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
    )
  `);

  // Create FTS table if not exists (wrapped in try/catch since FTS5 may not be available)
  try {
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
        id,
        description,
        content='cves',
        content_rowid='rowid'
      )
    `);
  } catch (ftsError) {
    console.log('FTS5 not available, skipping FTS table creation');
  }

  // Create metadata table
  db.run(`
    CREATE TABLE IF NOT EXISTS db_metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Insert sample CVEs
  let inserted = 0;
  let skipped = 0;

  for (const cve of SAMPLE_CVES) {
    // Check if CVE already exists
    const existing = db.exec(`SELECT id FROM cves WHERE id = '${cve.id}'`);
    if (existing.length > 0 && existing[0].values.length > 0) {
      skipped++;
      continue;
    }

    // Insert CVE
    db.run(
      `INSERT OR REPLACE INTO cves (id, description, cvss_score, cvss_vector, severity, published_at, modified_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cve.id, cve.description, cve.cvss_score, cve.cvss_vector, cve.severity, cve.published_at, cve.modified_at, cve.source]
    );

    // Insert CPE matches
    for (const cpe of cve.cpe_matches) {
      db.run(
        `INSERT INTO cpe_matches (cve_id, cpe_text, vulnerable) VALUES (?, ?, ?)`,
        [cve.id, cpe.cpe_text, cpe.vulnerable]
      );
    }

    // Insert into FTS (if table exists)
    try {
      db.run(
        `INSERT INTO cves_fts (id, description) VALUES (?, ?)`,
        [cve.id, cve.description]
      );
    } catch {
      // FTS table may not exist, ignore
    }

    inserted++;
  }

  // Update metadata
  const now = new Date().toISOString();
  db.run(`INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_sync', ?)`, [now]);
  db.run(`INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('schema_version', ?)`, ['9']);

  // Save database
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);

  // Get stats
  const countResult = db.exec('SELECT COUNT(*) FROM cves');
  const totalCves = countResult[0]?.values[0]?.[0] || 0;

  console.log(`\n=== Database Seed Complete ===`);
  console.log(`Total CVEs in database: ${totalCves}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`Database saved to: ${dbPath}`);

  db.close();
}

// Get database path from args or use default
const args = process.argv.slice(2);
let dbPath;

if (args.length > 0) {
  dbPath = args[0];
} else {
  // Default path in user data directory
  const isWindows = os.platform() === 'win32';
  const homeDir = os.homedir();

  if (isWindows) {
    dbPath = path.join(homeDir, 'AppData', 'Roaming', 'vuln-assess-tool', 'nvd-data.db');
  } else {
    dbPath = path.join(homeDir, '.config', 'vuln-assess-tool', 'nvd-data.db');
  }
}

seedDatabase(dbPath).catch(err => {
  console.error('Failed to seed database:', err);
  process.exit(1);
});
