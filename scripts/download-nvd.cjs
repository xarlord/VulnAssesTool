#!/usr/bin/env node
/**
 * Download all NVD CVE 2.0 JSON feeds to D:\nvd-data
 * Downloads .json.gz files, extracts to .json, deletes .gz
 *
 * Usage: node scripts/download-nvd.js [startYear] [endYear]
 * Default: 2002 to current year
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUTPUT_DIR = 'D:\\nvd-data'
const BASE_URL = 'https://nvd.nist.gov/feeds/json/cve/2.0'
const MAX_CONCURRENT = 3

const startYear = parseInt(process.argv[2]) || 2002
const endYear = parseInt(process.argv[3]) || new Date().getFullYear()

const years = []
for (let y = startYear; y <= endYear; y++) years.push(y)

console.log(`NVD CVE Downloader - Years ${startYear}-${endYear}`)
console.log(`Output: ${OUTPUT_DIR}`)
console.log(`Concurrent downloads: ${MAX_CONCURRENT}`)
console.log('')

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const request = (reqUrl, redirects = 0) => {
      if (redirects > 5) return reject(new Error('Too many redirects'))

      https.get(reqUrl, { headers: { 'User-Agent': 'VulnAssessTool/2.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location, redirects + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} for ${reqUrl}`))
        }

        const chunks = []
        let downloaded = 0
        const total = parseInt(res.headers['content-length'] || '0')

        res.on('data', (chunk) => {
          chunks.push(chunk)
          downloaded += chunk.length
        })

        res.on('end', () => {
          resolve(Buffer.concat(chunks))
        })

        res.on('error', reject)
      }).on('error', reject)
    }
    request(url)
  })
}

async function downloadYear(year) {
  const jsonPath = path.join(OUTPUT_DIR, `nvdcve-2.0-${year}.json`)

  // Skip if already extracted
  if (fs.existsSync(jsonPath)) {
    const stat = fs.statSync(jsonPath)
    if (stat.size > 100000) {
      console.log(`  [${year}] Already exists (${(stat.size / 1024 / 1024).toFixed(1)}MB), skipping`)
      return { year, status: 'skipped', size: stat.size }
    }
  }

  try {
    // Try .gz download first
    const url = `${BASE_URL}/nvdcve-2.0-${year}.json.gz`
    process.stdout.write(`  [${year}] Downloading...`)
    const data = await downloadFile(url)
    process.stdout.write(` (${(data.length / 1024 / 1024).toFixed(1)}MB) extracting...`)

    // Decompress directly from download buffer (no intermediate .gz file)
    const json = zlib.gunzipSync(data)
    fs.writeFileSync(jsonPath, json)

    console.log(` OK (${(json.length / 1024 / 1024).toFixed(1)}MB)`)
    return { year, status: 'ok', size: json.length }
  } catch (err) {
    // Clean up partial files
    try { fs.unlinkSync(jsonPath) } catch {}

    console.log(` FAILED: ${err.message}`)
    return { year, status: 'failed', error: err.message }
  }
}

async function run() {
  const results = []

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < years.length; i += MAX_CONCURRENT) {
    const batch = years.slice(i, i + MAX_CONCURRENT)
    const batchResults = await Promise.all(batch.map(y => downloadYear(y)))
    results.push(...batchResults)

    // Small delay between batches to be nice to NVD servers
    if (i + MAX_CONCURRENT < years.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.log('')
  console.log('=== Summary ===')
  const ok = results.filter(r => r.status === 'ok')
  const skipped = results.filter(r => r.status === 'skipped')
  const failed = results.filter(r => r.status === 'failed')

  console.log(`Downloaded: ${ok.length}`)
  console.log(`Skipped (existing): ${skipped.length}`)
  console.log(`Failed: ${failed.length}`)

  if (failed.length > 0) {
    console.log('')
    console.log('Failed years:')
    failed.forEach(r => console.log(`  ${r.year}: ${r.error}`))
  }

  const totalSize = results.reduce((sum, r) => sum + (r.size || 0), 0)
  console.log(`Total data: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
