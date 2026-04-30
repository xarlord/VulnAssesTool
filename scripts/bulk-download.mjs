/**
 * Bulk download script for NVD CVE data
 * Run with: node scripts/bulk-download.mjs
 */

import { downloadAndImportNVDData, getAvailableYears } from '../dist/electron/database/nvdDownloader.js';

const API_KEY = process.env.NVD_API_KEY || process.env.NIST_API_KEY || 'A54C1D3F-6903-F111-8368-0EBF96DE670D';

console.log('Starting NVD bulk download...');
console.log('API Key:', API_KEY ? `${API_KEY.slice(0, 8)}...` : 'Not set');

const years = getAvailableYears();
console.log('Available years:', years);

// Download last 3 years by default
const yearsToDownload = years.slice(-3);
console.log('Downloading years:', yearsToDownload);

try {
  await downloadAndImportNVDData(yearsToDownload, API_KEY, (progress) => {
    console.log(`[${progress.year}] ${progress.status}: ${progress.downloaded}/${progress.total}`);
    if (progress.totalCVEs) {
      console.log(`  Total CVEs: ${progress.processedCVEs}/${progress.totalCVEs}`);
    }
    if (progress.error) {
      console.error(`  Error: ${progress.error}`);
    }
  });
  console.log('Bulk download completed successfully!');
} catch (error) {
  console.error('Bulk download failed:', error);
  process.exit(1);
}
