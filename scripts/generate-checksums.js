#!/usr/bin/env node

/**
 * Generate Checksums for Release Artifacts
 *
 * This script generates SHA256 checksums for all release artifacts
 * and creates a checksums.txt file for distribution.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const releaseDir = path.join(__dirname, '..', 'release');
const checksumsFile = path.join(releaseDir, 'checksums.txt');

/**
 * Calculate SHA256 hash of a file
 *
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} SHA256 hash
 */
function calculateSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Generate checksums for all files in the release directory
 */
async function generateChecksums() {
  if (!fs.existsSync(releaseDir)) {
    console.error('Release directory not found:', releaseDir);
    process.exit(1);
  }

  console.log('Generating checksums for release artifacts...\n');

  const files = fs.readdirSync(releaseDir).filter((file) => {
    // Skip checksums.txt itself and intermediate files
    return !file.startsWith('builder') &&
           !file.includes('blockmap') &&
           !file.endsWith('.txt') &&
           fs.statSync(path.join(releaseDir, file)).isFile();
  });

  if (files.length === 0) {
    console.warn('No release artifacts found in:', releaseDir);
    process.exit(0);
  }

  const checksums = [];

  for (const file of files) {
    const filePath = path.join(releaseDir, file);
    const stats = fs.statSync(filePath);

    console.log(`Processing: ${file}`);
    console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    try {
      const sha256 = await calculateSHA256(filePath);
      checksums.push({ file, sha256 });
      console.log(`  SHA256: ${sha256}\n`);
    } catch (error) {
      console.error(`  Error: ${error.message}\n`);
    }
  }

  // Write checksums to file
  if (checksums.length > 0) {
    const content = checksums
      .map(({ file, sha256 }) => `${sha256}  ${file}`)
      .join('\n');

    fs.writeFileSync(checksumsFile, content + '\n');

    console.log(`Checksums written to: ${checksumsFile}`);
    console.log(`Total files: ${checksums.length}`);

    // Print summary table
    console.log('\nChecksum Summary:');
    console.log('─'.repeat(80));
    console.log('File'.padEnd(50) + 'SHA256');
    console.log('─'.repeat(80));
    checksums.forEach(({ file, sha256 }) => {
      const displayName = file.length > 47 ? file.substring(0, 44) + '...' : file;
      console.log(`${displayName.padEnd(50)}${sha256.substring(0, 16)}...`);
    });
    console.log('─'.repeat(80));

    // Verify command example
    console.log('\nTo verify downloaded files, run:');
    console.log(`  sha256sum -c ${path.basename(checksumsFile)}`);
  }
}

// Run the script
generateChecksums().catch((error) => {
  console.error('Error generating checksums:', error);
  process.exit(1);
});
