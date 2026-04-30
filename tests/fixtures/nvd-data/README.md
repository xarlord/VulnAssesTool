# NVD Integration Test Fixtures

This directory contains real NVD data for integration testing.

## Files

- `nvdcve-2.0-2024-sample.json` - A curated subset of ~10 CVEs from NVD API
- `README.md` - This file

## Data Source

Data sourced from NIST National Vulnerability Database:
https://nvd.nist.gov/feeds/json/cve/2.0/

## Update Process

To update the sample data:

1. Download latest NVD feed:

   ```bash
   curl -L -o nvdcve-2.0-2024-recent.json.gz \
     "https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-2024.json.gz"
   gunzip nvdcve-2.0-2024-recent.json.gz
   ```

2. Extract a representative sample (5-10 CVEs covering different scenarios):
   - Different severity levels (CRITICAL, HIGH, MEDIUM, LOW)
   - With CPE matches
   - With references
   - Different configurations

3. Validate JSON structure matches NVD API format
