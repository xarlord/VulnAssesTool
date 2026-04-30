/**
 * Standalone NVD Bulk Download Script
 * Downloads CVE data directly from NIST and saves to the app's database location
 *
 * Usage: node scripts/download-nvd.mjs [API_KEY]
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NVD API key from command line or environment
const API_KEY = process.argv[2] || process.env.NVD_API_KEY || process.env.NIST_API_KEY;

if (!API_KEY) {
  console.error('Error: NVD API key required.');
  console.error('Usage: node scripts/download-nvd.mjs YOUR_API_KEY');
  console.error('   or: set NVD_API_KEY=YOUR_API_KEY && node scripts/download-nvd.mjs');
  process.exit(1);
}

console.log('Using API Key:', `${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}`);

// Database location (Windows)
const DB_PATH = path.join(process.env.APPDATA || '', 'vuln-assess-tool');
const CACHE_DIR = path.join(DB_PATH, 'nvd-cache');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

console.log('Cache directory:', CACHE_DIR);

// Years to download (last 3 years)
const currentYear = new Date().getFullYear();
const YEARS = [currentYear - 2, currentYear - 1, currentYear];

console.log('Years to download:', YEARS);

/**
 * Download a file with progress
 */
function downloadFile(url, destPath, apiKey) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    // Add API key as query parameter (NIST requirement)
    const urlWithKey = url.includes('?') ? `${url}&apiKey=${apiKey}` : `${url}?apiKey=${apiKey}`;

    const options = {
      headers: {
        'User-Agent': 'VulnAssessTool/1.0',
        'Accept': 'application/json',
      }
    };

    const request = https.get(urlWithKey, options, (response) => {
      if (response.statusCode === 403) {
        reject(new Error('HTTP 403: Forbidden - API key may be invalid or rate limited'));
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0;
        process.stdout.write(`\rDownloading: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete!');
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });

    request.end();
  });
}

/**
 * Extract gzip file
 */
async function extractGzip(gzPath, jsonPath) {
  console.log('Extracting...');

  await pipeline(
    fs.createReadStream(gzPath),
    createGunzip(),
    fs.createWriteStream(jsonPath)
  );

  // Delete the gz file
  fs.unlinkSync(gzPath);
  console.log('Extraction complete!');
}

/**
 * Parse and count CVEs in JSON file
 */
function countCVEs(jsonPath) {
  const content = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(content);

  // NVD JSON 1.1 format
  const items = data.CVE_Items || data.vulnerabilities || [];
  return items.length;
}

/**
 * Main download function
 */
async function main() {
  console.log('\n=== NVD Bulk Download ===\n');

  let totalCVEs = 0;

  for (const year of YEARS) {
    console.log(`\n--- Processing year ${year} ---`);

    const gzPath = path.join(CACHE_DIR, `nvdcve-1.1-${year}.json.gz`);
    const jsonPath = path.join(CACHE_DIR, `nvdcve-1.1-${year}.json`);

    // Check if already downloaded
    if (fs.existsSync(jsonPath)) {
      console.log(`File already exists: ${jsonPath}`);
      const cveCount = countCVEs(jsonPath);
      console.log(`CVEs in file: ${cveCount}`);
      totalCVEs += cveCount;
      continue;
    }

    const url = `https://nvd.nist.gov/feeds/json/cve/1.1/nvdcve-1.1-${year}.json.gz`;
    console.log(`URL: ${url}`);

    try {
      // Download
      console.log('Downloading...');
      await downloadFile(url, gzPath, API_KEY);

      // Extract
      await extractGzip(gzPath, jsonPath);

      // Count CVEs
      const cveCount = countCVEs(jsonPath);
      console.log(`CVEs in file: ${cveCount}`);
      totalCVEs += cveCount;

    } catch (error) {
      console.error(`\nError processing year ${year}:`, error.message);

      // Clean up partial files
      if (fs.existsSync(gzPath)) fs.unlinkSync(gzPath);
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    }
  }

  console.log(`\n=== Download Complete ===`);
  console.log(`Total CVEs downloaded: ${totalCVEs}`);
  console.log(`Files saved to: ${CACHE_DIR}`);
  console.log(`\nRestart the VulnAssessTool app to import the downloaded data.`);
}

main().catch(console.error);
