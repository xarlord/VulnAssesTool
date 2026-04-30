# CycloneDX SBOM Generator User Guide

## Overview

The CycloneDX SBOM Generator allows you to create valid CycloneDX Software Bill of Materials (SBOM) files from Excel spreadsheets. This feature is particularly useful when you maintain component inventories in Excel format and need to generate standardized SBOMs for compliance, vulnerability scanning, or software supply chain transparency.

### What is CycloneDX?

CycloneDX is a full-stack SBOM (Software Bill of Materials) specification that provides:

- Standardized format for software component inventory
- Support for vulnerabilities, dependencies, and metadata
- Industry adoption across multiple sectors
- Compatibility with vulnerability assessment tools like VulnAssessTool

### Key Features

- **Flexible Excel Import**: Support for various Excel formats with column mapping
- **CycloneDX 1.5 Compliant**: Generate SBOMs that comply with the latest specification
- **JSON & XML Output**: Choose your preferred output format
- **Validation**: Automatic validation of generated SBOMs
- **Preview**: Review parsed components before generating the final SBOM
- **Bulk Processing**: Handle large inventories with thousands of components

## Download Template

You can download our pre-configured Excel template with sample data and column descriptions:

**[Download Excel Template](./excel-sbom-template.xlsx)**

This template includes:

- Proper column headers for all supported fields
- Sample components for reference
- Built-in data validation
- Instructions sheet with detailed explanations

## Quick Start

### Step 1: Prepare Your Excel File

1. Download the [Excel Template](./excel-sbom-template.xlsx)
2. Fill in your component data (minimum required: name and version)
3. Save the file

### Step 2: Open SBOM Generator

1. Navigate to **Dashboard** in VulnAssessTool
2. Click the **"Generate SBOM from Excel"** button in the toolbar
3. Or use the menu: **File > Generate SBOM > From Excel**

### Step 3: Upload Excel File

1. Click **"Choose File"** or drag-and-drop your Excel file
2. Supported formats: `.xlsx`, `.xls`
3. The tool will automatically parse the file

### Step 4: Map Columns

If your Excel columns don't match the standard template:

1. Review the auto-detected column mappings
2. Adjust mappings using the dropdown menus
3. Required fields must be mapped (name, version)
4. Optional fields can be left unmapped

### Step 5: Preview & Generate

1. Review the parsed components in the preview table
2. Add metadata (project name, version, description)
3. Click **"Generate SBOM"**
4. Download your CycloneDX JSON or XML file

## Excel Column Mapping Guide

### Required Columns

| Column Name | Description       | Example                    | Notes                                           |
| ----------- | ----------------- | -------------------------- | ----------------------------------------------- |
| **name**    | Component name    | `react`, `lodash`, `axios` | Required. Must not be empty                     |
| **version** | Component version | `18.2.0`, `4.17.21`        | Required. Use semantic versioning when possible |

### Optional Columns

| Column Name     | Description           | Example                                      | Notes                                                        |
| --------------- | --------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| **type**        | Component type        | `library`, `application`, `framework`        | Default: `library`                                           |
| **license**     | SPDX License ID       | `MIT`, `Apache-2.0`, `BSD-3-Clause`          | See [SPDX License List](https://spdx.org/licenses/)          |
| **purl**        | Package URL           | `pkg:npm/react@18.2.0`                       | Follow [PURL spec](https://github.com/package-url/purl-spec) |
| **cpe**         | CPE identifier        | `cpe:2.3:a:react:react:18.2.0:*:*:*:*:*:*:*` | [CPE format](https://nvd.nist.gov/products/cpe)              |
| **description** | Component description | `React JavaScript library`                   | Free-form text                                               |
| **supplier**    | Vendor/author name    | `Meta Platforms`, `OpenJS Foundation`        | Organization or person                                       |
| **group**       | Component group       | `frontend`, `backend`, `shared`              | Custom grouping                                              |

### Column Mapping Best Practices

1. **Use Standard Headers**: When possible, use the standard column names listed above
2. **Be Consistent**: Use the same column names across all your Excel files
3. **Include PURLs**: PURLs provide unambiguous component identification
4. **Use SPDX Licenses**: Standard license IDs improve interoperability
5. **Add Descriptions**: Help teams understand what each component does

## Sample Excel Data

Here's a sample of how your Excel data should look:

| name   | version | type    | license | purl                   | description              | supplier |
| ------ | ------- | ------- | ------- | ---------------------- | ------------------------ | -------- |
| react  | 18.2.0  | library | MIT     | pkg:npm/react@18.2.0   | React JavaScript library | Meta     |
| lodash | 4.17.21 | library | MIT     | pkg:npm/lodash@4.17.21 | Lodash utility library   | OpenJS   |
| axios  | 1.6.0   | library | MIT     | pkg:npm/axios@1.6.0    | HTTP client              | Axios    |

## Advanced Features

### Column Mapping

If your Excel uses different column names (e.g., "Component Name" instead of "name"), the generator will:

1. **Auto-detect**: Try to match columns intelligently
2. **Manual mapping**: Allow you to specify the correct mapping
3. **Save mappings**: Remember your preferences for future uploads

### Metadata Configuration

Enhance your SBOM with metadata:

- **Project Name**: Your application or system name
- **Version**: Project version
- **Description**: What the project does
- **Author**: Your organization or team name
- **License**: Project-level license

### Output Format Options

#### JSON Format (Recommended)

- Easier to parse programmatically
- Smaller file size
- Better web tool compatibility
- Default format

#### XML Format

- Required by some legacy systems
- Schema validation support
- Better for certain compliance tools

### Validation

The generator validates:

- **Required fields**: Ensures name and version are present
- **Data types**: Checks for proper format
- **PURL syntax**: Validates Package URL structure
- **SPDX IDs**: Verifies license identifiers
- **CPE format**: Checks CPE syntax

## FAQ

### Q: What's the minimum required data?

**A:** Only `name` and `version` are required. All other fields are optional.

### Q: Can I use my existing Excel inventory?

**A:** Yes! The column mapping feature allows you to map your existing columns to SBOM fields.

### Q: What file formats are supported?

**A:** `.xlsx` (Excel 2007+) and `.xls` (Excel 97-2003) formats are supported.

### Q: How many components can I process?

**A:** The generator can handle thousands of components. Performance tests show:

- 100 components: < 1 second
- 1,000 components: < 5 seconds
- 10,000 components: < 30 seconds

### Q: Can I include component dependencies?

**A:** Currently, the generator creates a flat component list. Dependency trees are planned for a future release.

### Q: What CycloneDX version is generated?

**A:** The generator creates CycloneDX 1.5 compliant SBOMs (the latest stable version).

### Q: Can I validate my generated SBOM?

**A:** Yes! You can:

1. Upload the generated SBOM to VulnAssessTool
2. Use [CycloneDX online validator](https://cyclonedx.org/validator/)
3. Use the `cyclonedx` CLI tool

### Q: What if my Excel has multiple sheets?

**A:** The generator processes the first sheet by default. You can specify which sheet to use in the upload dialog.

### Q: Are empty rows handled?

**A:** Yes, empty rows are automatically skipped during parsing.

### Q: Can I save my column mappings?

**A:** Yes, mappings are saved per project and remembered for future uploads.

## Troubleshooting

### Issue: "Failed to parse Excel file"

**Solutions:**

- Ensure the file is a valid Excel file (.xlsx or .xls)
- Check that the file is not password protected
- Verify the file is not corrupted (try opening in Excel)
- Make sure you're using the first sheet with data

### Issue: "No components found"

**Solutions:**

- Verify your Excel has data rows (not just headers)
- Check that required columns (name, version) are mapped
- Ensure column headers are in the first row
- Look for empty rows between data rows

### Issue: "Invalid PURL format"

**Solutions:**

- Verify PURL follows the format: `pkg:type/name@version`
- Check the [PURL specification](https://github.com/package-url/purl-spec)
- Leave PURL empty if you don't have one (it's optional)

### Issue: "Invalid SPDX license ID"

**Solutions:**

- Check the [SPDX License List](https://spdx.org/licenses/)
- Use exact IDs (e.g., "MIT" not "MIT License")
- Leave empty if unknown (it's optional)

### Issue: Generated SBOM won't upload to VulnAssessTool

**Solutions:**

- Validate the SBOM using the CycloneDX validator
- Check that bomFormat is "CycloneDX"
- Verify specVersion is "1.5" or compatible
- Ensure the file is not corrupted during download

### Issue: Column mapping not working

**Solutions:**

- Use the dropdown menus to manually map columns
- Check for typos in column headers
- Ensure headers are in the first row
- Try using the standard template column names

### Issue: Performance is slow with large files

**Solutions:**

- Split large files into smaller batches
- Remove unnecessary columns to reduce file size
- Close other applications to free up memory
- Consider using CSV export for very large inventories

## Best Practices

### 1. Data Quality

- Use semantic versioning (e.g., 1.2.3)
- Include PURLs when available
- Use standard SPDX license identifiers
- Add descriptions for clarity

### 2. File Organization

- Keep one component per row
- Use consistent column naming
- Avoid merged cells
- Place headers in the first row

### 3. Validation

- Validate your Excel data before uploading
- Use the preview feature to check results
- Test with a small sample first
- Keep a backup of your original file

### 4. Maintenance

- Update your Excel inventory regularly
- Version control your SBOM files
- Document any custom column mappings
- Keep the template for future use

## Integration with VulnAssessTool

Once you've generated your SBOM:

1. **Upload to VulnAssessTool**: Use the SBOM upload feature
2. **Scan for Vulnerabilities**: Automatically check against NVD and OSV databases
3. **Track Component Health**: Monitor vulnerabilities over time
4. **Export Reports**: Generate PDF, CSV, or JSON reports
5. **Set Up Notifications**: Get alerts for new vulnerabilities

## Additional Resources

- [CycloneDX Specification](https://cyclonedx.org/capabilities/sbom/)
- [CycloneDX Validator](https://cyclonedx.org/validator/)
- [PURL Specification](https://github.com/package-url/purl-spec)
- [SPDX License List](https://spdx.org/licenses/)
- [CPE Dictionary](https://nvd.nist.gov/products/cpe)

## Support

For issues, questions, or feature requests:

1. Check this guide's FAQ section
2. Review the [Excel Template](./excel-sbom-template.xlsx) instructions
3. Submit an issue on GitHub
4. Contact the VulnAssessTool team

---

**Version:** 1.0.0
**Last Updated:** 2026-02-11
**Related:** [CycloneDX Parser Documentation](../README.md)
