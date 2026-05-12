/**
 * NVD API 2.0 Bulk Download Script
 * Downloads CVE data month by month to handle API limitations
 *
 * Usage: node scripts/download-nvd-api.mjs [API_KEY]
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NVD API key from command line or environment
const API_KEY = process.argv[2] || process.env.NVD_API_KEY || '';

// Note: The provided API key may be invalid - test without it first
console.log('API Key:', API_KEY ? `${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}` : 'Not provided (rate limited to 5 req/30s)');
if (API_KEY) {
  console.log('Note: If you get 404 errors, the API key may be invalid. Try running without it.');
}

// Database location (Windows)
const DB_PATH = path.join(process.env.APPDATA || '', 'vuln-assess-tool');
const OUTPUT_FILE = path.join(DB_PATH, 'nvd-cache', 'nvd-cves-bulk.json');

// Ensure directory exists
const cacheDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

console.log('Output file:', OUTPUT_FILE);

/**
 * Make an API request with rate limiting
 */
let lastRequestTime = 0;
const RATE_LIMIT_MS = API_KEY ? 700 : 6500; // Conservative rate limiting

async function fetchAPI(urlPath) {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
    process.stdout.write(` [wait ${Math.round(waitTime/1000)}s]`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();

  return new Promise((resolve, reject) => {
    // Don't use URL class - it encodes the query params which breaks NVD API
    const options = {
      hostname: 'services.nvd.nist.gov',
      path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'VulnAssessTool/1.0',
      }
    };

    if (API_KEY) {
      options.headers['apiKey'] = API_KEY;
    }

    const req = https.request(options, (response) => {
      let data = '';

      if (response.statusCode === 403) {
        reject(new Error('HTTP 403: Forbidden - Rate limit exceeded or invalid API key'));
        return;
      }

      if (response.statusCode === 429) {
        reject(new Error('HTTP 429: Too Many Requests - Rate limit exceeded'));
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Fetch all CVEs from a date range
 */
async function fetchCVEsByDateRange(startDate, endDate) {
  const allCVEs = [];
  let startIndex = 0;
  const resultsPerPage = 500; // Max is 2000
  let totalResults = 0;
  let retryCount = 0;
  const MAX_RETRIES = 5;

  do {
    // Build URL path (NOT full URL - don't URL encode the dates!)
    const urlPath = `/rest/json/cves/2.0?pubStartDate=${startDate}&pubEndDate=${endDate}&resultsPerPage=${resultsPerPage}&startIndex=${startIndex}`;

    console.log(`  Fetching: services.nvd.nist.gov${urlPath.substring(0, 70)}...`);

    try {
      const response = await fetchAPI(urlPath);

      if (!response.vulnerabilities || response.vulnerabilities.length === 0) {
        break;
      }

      totalResults = response.totalResults;
      allCVEs.push(...response.vulnerabilities);
      startIndex += response.vulnerabilities.length;
      retryCount = 0; // Reset retry count on success

      process.stdout.write(`\r  Progress: ${allCVEs.length}/${totalResults} (${Math.round((allCVEs.length / totalResults) * 100)}%)`);

    } catch (error) {
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        throw error;
      }
      console.log(`\n  Retry ${retryCount}/${MAX_RETRIES}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  } while (startIndex < totalResults);

  console.log('');
  return allCVEs;
}

/**
 * Generate month ranges for a year
 */
function getMonthRanges(year) {
  const ranges = [];
  for (let month = 0; month < 12; month++) {
    // Format dates with UTC timezone indicator (Z suffix)
    const monthStr = String(month + 1).padStart(2, '0');
    const startDate = `${year}-${monthStr}-01T00:00:00.000Z`; // Added Z for UTC

    // Get last day of month
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`; // Added Z for UTC

    ranges.push({
      start: startDate,
      end: endDate,
      label: `${year}-${monthStr}`
    });
  }
  return ranges;
}

/**
 * Main download function
 */
async function main() {
  console.log('\n=== NVD API 2.0 Bulk Download ===\n');

  const year = 2024; // Start with 2024
  const months = getMonthRanges(year);

  console.log(`Downloading CVEs for ${year} (12 months)`);
  console.log(`Rate limit: ${API_KEY ? '50 requests/30s (with API key)' : '5 requests/30s (no API key)'}`);
  console.log('');

  const allCVEs = [];

  for (const month of months) {
    console.log(`\n--- ${month.label} ---`);
    console.log(`Date range: ${month.start} to ${month.end}`);

    try {
      const cves = await fetchCVEsByDateRange(month.start, month.end);
      console.log(`  CVEs fetched: ${cves.length}`);
      allCVEs.push(...cves);
    } catch (error) {
      console.error(`  Error: ${error.message}`);
      console.log('  Continuing with next month...');
    }
  }

  console.log(`\n\n=== Download Summary ===`);
  console.log(`Total CVEs fetched: ${allCVEs.length}`);

  // Save to file
  const output = {
    timestamp: new Date().toISOString(),
    totalResults: allCVEs.length,
    format: 'NVD_CVE',
    version: '2.0',
    vulnerabilities: allCVEs
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to: ${OUTPUT_FILE}`);
  console.log(`File size: ${fileSizeMB} MB`);

  console.log('\n=== Download Complete ===');
  console.log('Restart the VulnAssessTool app to import the downloaded data.');
}

main().catch(console.error);
