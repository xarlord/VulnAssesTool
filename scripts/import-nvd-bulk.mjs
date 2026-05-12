/**
 * Import NVD CVE data from bulk download file into the database
 *
 * Usage: node scripts/import-nvd-bulk.mjs [input-file]
 *
 * If no input file is specified, uses the default location:
 * %APPDATA%/vuln-assess-tool/nvd-cache/nvd-cves-bulk.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default input file location
const DB_PATH = path.join(process.env.APPDATA || '', 'vuln-assess-tool');
const DEFAULT_INPUT = path.join(DB_PATH, 'nvd-cache', 'nvd-cves-bulk.json');
const SQLITE_DB = path.join(DB_PATH, 'nvd-data.db');

const INPUT_FILE = process.argv[2] || DEFAULT_INPUT;

console.log('Input file:', INPUT_FILE);
console.log('Database:', SQLITE_DB);

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`Error: Input file not found: ${INPUT_FILE}`);
  console.error('Run download-nvd-api.mjs first to download the data.');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_DB)) {
  console.error(`Error: Database not found: ${SQLITE_DB}`);
  console.error('Start the VulnAssessTool app first to create the database.');
  process.exit(1);
}

/**
 * Transform NVD API 2.0 CVE to database format
 */
function transformCve(vuln) {
  const cve = vuln.cve;
  const id = cve.id;
  const descriptions = cve.descriptions || [];
  const enDesc = descriptions.find(d => d.lang === 'en') || descriptions[0];
  const description = enDesc?.value || 'No description available';

  // Extract CVSS scores
  const metrics = cve.metrics || {};
  let cvss_score = null;
  let cvss_vector = null;
  let severity = null;
  let cvss_v31_score = null;
  let cvss_v31_vector = null;
  let cvss_v31_severity = null;
  let cvss_v30_score = null;
  let cvss_v30_vector = null;
  let cvss_v30_severity = null;
  let cvss_v2_score = null;
  let cvss_v2_vector = null;
  let cvss_v2_severity = null;

  // CVSS v3.1
  if (metrics.cvssMetricV31?.[0]) {
    const m = metrics.cvssMetricV31[0];
    cvss_v31_score = m.cvssData.baseScore;
    cvss_v31_vector = m.cvssData.vectorString;
    cvss_v31_severity = m.cvssData.baseSeverity;
    cvss_score = cvss_v31_score;
    cvss_vector = cvss_v31_vector;
    severity = cvss_v31_severity;
  }

  // CVSS v3.0
  if (metrics.cvssMetricV30?.[0]) {
    const m = metrics.cvssMetricV30[0];
    cvss_v30_score = m.cvssData.baseScore;
    cvss_v30_vector = m.cvssData.vectorString;
    cvss_v30_severity = m.cvssData.baseSeverity;
    if (!cvss_score) {
      cvss_score = cvss_v30_score;
      cvss_vector = cvss_v30_vector;
      severity = cvss_v30_severity;
    }
  }

  // CVSS v2.0
  if (metrics.cvssMetricV2?.[0]) {
    const m = metrics.cvssMetricV2[0];
    cvss_v2_score = m.cvssData.baseScore;
    cvss_v2_vector = m.cvssData.vectorString;
    cvss_v2_severity = m.baseSeverity || null;
    if (!cvss_score) {
      cvss_score = cvss_v2_score;
      cvss_vector = cvss_v2_vector;
      severity = cvss_v2_severity;
    }
  }

  // Extract CPE matches
  const cpeMatches = [];
  const configurations = cve.configurations || [];
  for (const config of configurations) {
    for (const node of config.nodes || []) {
      for (const cpe of node.cpeMatch || []) {
        // NVD API 2.0 uses 'criteria' for the CPE string
        const cpeUri = cpe.criteria || cpe.cpe23Uri || '';
        if (cpeUri) {
          cpeMatches.push({
            cve_id: id,
            cpe23_uri: cpeUri,
            vulnerable: cpe.vulnerable ? 1 : 0,
            version_start_including: cpe.versionStartIncluding || null,
            version_start_excluding: cpe.versionStartExcluding || null,
            version_end_including: cpe.versionEndIncluding || null,
            version_end_excluding: cpe.versionEndExcluding || null,
          });
        }
      }
    }
  }

  // Extract CWE references
  const cweRefs = [];
  const weaknesses = cve.weaknesses || [];
  for (const weakness of weaknesses) {
    for (const desc of weakness.description || []) {
      if (desc.value?.startsWith('CWE-')) {
        cweRefs.push({
          cve_id: id,
          cwe_id: desc.value,
          description: null,
        });
      }
    }
  }

  // Extract references
  const references = [];
  for (const ref of cve.references || []) {
    references.push({
      cve_id: id,
      url: ref.url,
      source: ref.source || null,
      tags: ref.tags?.join(',') || null,
      reference_type: classifyReferenceType(ref.tags || []),
    });
  }

  return {
    cve: {
      id,
      description,
      cvss_v31_score,
      cvss_v31_vector,
      cvss_v31_severity,
      cvss_v30_score,
      cvss_v30_vector,
      cvss_v30_severity,
      cvss_v2_score,
      cvss_v2_vector,
      cvss_v2_severity,
      cvss_score,
      cvss_vector,
      severity,
      published_at: cve.published,
      modified_at: cve.lastModified,
      source: 'NVD',
      vuln_status: cve.vulnStatus || null,
      assigner: cve.sourceIdentifier || null,
    },
    cpeMatches,
    cweRefs,
    references,
  };
}

function classifyReferenceType(tags) {
  if (tags.includes('Vendor Advisory')) return 'vendor';
  if (tags.includes('Patch')) return 'patch';
  if (tags.includes('Third Party Advisory')) return 'third-party';
  if (tags.includes('Issue Tracking')) return 'issue';
  if (tags.includes('Exploit')) return 'exploit';
  if (tags.includes('Release Notes')) return 'release';
  return null;
}

/**
 * Main import function
 */
async function main() {
  console.log('\n=== NVD Bulk Import ===\n');

  // Read the JSON file
  console.log('Reading input file...');
  const fileContent = fs.readFileSync(INPUT_FILE, 'utf-8');
  const data = JSON.parse(fileContent);

  const vulnerabilities = data.vulnerabilities || [];
  const totalCves = vulnerabilities.length;

  console.log(`Found ${totalCves.toLocaleString()} CVEs to import`);

  // Open database
  console.log('Opening database...');
  const db = new Database(SQLITE_DB);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Prepare statements
  const insertCve = db.prepare(`
    INSERT OR REPLACE INTO cves (
      id, description,
      cvss_v31_score, cvss_v31_vector, cvss_v31_severity,
      cvss_v30_score, cvss_v30_vector, cvss_v30_severity,
      cvss_v2_score, cvss_v2_vector, cvss_v2_severity,
      cvss_score, cvss_vector, severity,
      published_at, modified_at, source, vuln_status, assigner
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCpe = db.prepare(`
    INSERT OR IGNORE INTO cpe_matches (
      cve_id, cpe_text, cpe23_uri, vulnerable,
      version_start_including, version_start_excluding,
      version_end_including, version_end_excluding
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCwe = db.prepare(`
    INSERT OR IGNORE INTO cwe_references (cve_id, cwe_id, description)
    VALUES (?, ?, ?)
  `);

  const insertRef = db.prepare(`
    INSERT OR IGNORE INTO "references" (cve_id, url, source, tags, reference_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  const deleteCpe = db.prepare('DELETE FROM cpe_matches WHERE cve_id = ?');
  const deleteCwe = db.prepare('DELETE FROM cwe_references WHERE cve_id = ?');
  const deleteRef = db.prepare('DELETE FROM "references" WHERE cve_id = ?');

  // Import in transaction
  const batchSize = 500;
  let imported = 0;
  let cpeCount = 0;
  let cweCount = 0;
  let refCount = 0;
  const startTime = Date.now();

  console.log('\nImporting CVEs...\n');

  for (let i = 0; i < vulnerabilities.length; i += batchSize) {
    const batch = vulnerabilities.slice(i, Math.min(i + batchSize, vulnerabilities.length));

    const importBatch = db.transaction(() => {
      for (const vuln of batch) {
        try {
          const transformed = transformCve(vuln);
          const c = transformed.cve;

          // Insert CVE
          insertCve.run(
            c.id, c.description,
            c.cvss_v31_score, c.cvss_v31_vector, c.cvss_v31_severity,
            c.cvss_v30_score, c.cvss_v30_vector, c.cvss_v30_severity,
            c.cvss_v2_score, c.cvss_v2_vector, c.cvss_v2_severity,
            c.cvss_score, c.cvss_vector, c.severity,
            c.published_at, c.modified_at, c.source, c.vuln_status, c.assigner
          );

          // Delete existing related data
          deleteCpe.run(c.id);
          deleteCwe.run(c.id);
          deleteRef.run(c.id);

          // Insert CPE matches
          for (const cpe of transformed.cpeMatches) {
            insertCpe.run(
              cpe.cve_id, cpe.cpe23_uri, cpe.cpe23_uri, cpe.vulnerable,
              cpe.version_start_including, cpe.version_start_excluding,
              cpe.version_end_including, cpe.version_end_excluding
            );
            cpeCount++;
          }

          // Insert CWE references
          for (const cwe of transformed.cweRefs) {
            insertCwe.run(cwe.cve_id, cwe.cwe_id, cwe.description);
            cweCount++;
          }

          // Insert references
          for (const ref of transformed.references) {
            insertRef.run(ref.cve_id, ref.url, ref.source, ref.tags, ref.reference_type);
            refCount++;
          }

          imported++;
        } catch (error) {
          console.error(`Failed to import: ${error.message}`);
        }
      }
    });

    importBatch();

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = imported / elapsed;
    const remaining = (totalCves - imported) / rate;

    process.stdout.write(
      `\rProgress: ${imported.toLocaleString()}/${totalCves.toLocaleString()} (${Math.round(imported/totalCves*100)}%) - ` +
      `${Math.round(rate)} CVEs/s - ETA: ${Math.round(remaining)}s   `
    );
  }

  console.log('\n\nRebuilding FTS index...');

  try {
    // Check if FTS table exists
    const ftsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'").get();

    if (ftsExists) {
      db.exec('DELETE FROM cves_fts');
      db.exec(`INSERT INTO cves_fts(rowid, id, description) SELECT rowid, id, description FROM cves`);
      console.log('FTS index rebuilt.');
    } else {
      console.log('FTS table does not exist, skipping.');
    }
  } catch (error) {
    console.warn('FTS rebuild failed:', error.message);
  }

  // Update metadata
  db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES ('last_sync_at', ?)").run(new Date().toISOString());

  // Close database
  db.close();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== Import Summary ===');
  console.log(`CVEs imported: ${imported.toLocaleString()}`);
  console.log(`CPE matches: ${cpeCount.toLocaleString()}`);
  console.log(`CWE references: ${cweCount.toLocaleString()}`);
  console.log(`References: ${refCount.toLocaleString()}`);
  console.log(`Duration: ${duration}s`);
  console.log(`\nImport complete! Restart the VulnAssessTool app to use the new data.`);
}

main().catch(console.error);
