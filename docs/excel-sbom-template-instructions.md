# Excel SBOM Template Instructions

This document describes the structure and usage of the Excel SBOM template for generating CycloneDX SBOMs.

## Template Structure

The Excel template consists of two sheets:

### Sheet 1: Components

This sheet contains the component data that will be converted to the CycloneDX SBOM.

#### Column Descriptions

| Column          | Required | Data Type | Description                         | Example                                         |
| --------------- | -------- | --------- | ----------------------------------- | ----------------------------------------------- |
| **name**        | Yes      | Text      | Component name (e.g., package name) | `react`, `lodash`, `axios`                      |
| **version**     | Yes      | Text      | Component version                   | `18.2.0`, `4.17.21`                             |
| **type**        | No       | Text      | Component type                      | `library`, `application`, `framework`           |
| **license**     | No       | Text      | SPDX License ID                     | `MIT`, `Apache-2.0`, `BSD-3-Clause`             |
| **purl**        | No       | Text      | Package URL                         | `pkg:npm/react@18.2.0`                          |
| **cpe**         | No       | Text      | CPE identifier                      | `cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*` |
| **description** | No       | Text      | Component description               | `React JavaScript library`                      |
| **supplier**    | No       | Text      | Vendor/author name                  | `Meta Platforms`                                |
| **group**       | No       | Text      | Component grouping                  | `frontend`, `backend`                           |

#### Sample Data Rows

```
name    | version  | type    | license     | purl                       | description
react   | 18.2.0   | library | MIT         | pkg:npm/react@18.2.0       | React library
lodash  | 4.17.21  | library | MIT         | pkg:npm/lodash@4.17.21     | Utility library
axios   | 1.6.0    | library | MIT         | pkg:npm/axios@1.6.0        | HTTP client
```

### Sheet 2: Instructions

This sheet contains detailed instructions for users on how to fill out the template.

## How to Use This Template

### Step 1: Fill in Required Columns

- **name**: Enter the component name
- **version**: Enter the component version

### Step 2: Add Optional Data

Enhance your SBOM by providing:

- **type**: Specify the component type (defaults to "library" if empty)
- **license**: Provide the SPDX license ID
- **purl**: Add the Package URL for unambiguous identification
- **cpe**: Add CPE identifier if available
- **description**: Describe what the component does
- **supplier**: Name the vendor or author
- **group**: Group related components

### Step 3: Save and Upload

1. Save your Excel file (.xlsx or .xls format)
2. Open VulnAssessTool
3. Navigate to **File > Generate SBOM > From Excel**
4. Upload your file and follow the prompts

## Data Validation

The template includes data validation rules:

- **name**: Cannot be empty
- **version**: Cannot be empty
- **license**: Must be a valid SPDX ID if provided
- **purl**: Must follow PURL format if provided
- **cpe**: Must follow CPE format if provided

## Best Practices

1. **Use Semantic Versioning**: Follow the `MAJOR.MINOR.PATCH` format (e.g., 1.2.3)
2. **Include PURLs**: Package URLs provide unambiguous component identification
3. **Use Standard Licenses**: Refer to the [SPDX License List](https://spdx.org/licenses/)
4. **Be Consistent**: Use the same column names and formats across all your files
5. **Add Descriptions**: Help your team understand what each component does
6. **Group Components**: Use the `group` field to organize related components

## PURL Format Reference

Package URLs follow this format:

```
pkg:type/namespace/name@version?qualifiers#subpath
```

### Examples by Ecosystem

| Ecosystem | Type   | Example                                           |
| --------- | ------ | ------------------------------------------------- |
| npm       | npm    | `pkg:npm/react@18.2.0`                            |
| Maven     | maven  | `pkg:maven/org.springframework/spring-core@5.3.8` |
| PyPI      | pypi   | `pkg:pypi/django@3.2.4`                           |
| NuGet     | nuget  | `pkg:nuget/Newtonsoft.Json@12.0.3`                |
| Go        | golang | `pkg:golang/github.com/gorilla/mux@v1.8.0`        |
| RubyGems  | gem    | `pkg:gem/rails@6.1.3`                             |

## CPE Format Reference

CPE 2.3 format:

```
cpe:2.3:part:vendor:product:version:update:edition:language:sw_edition:target_sw:target_hw:other
```

### Example

```
cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*
```

## Common Errors and Solutions

### Error: "Missing required field: name"

**Solution**: Ensure every row has a component name in the `name` column.

### Error: "Missing required field: version"

**Solution**: Ensure every row has a version in the `version` column.

### Error: "Invalid SPDX license ID"

**Solution**: Check the [SPDX License List](https://spdx.org/licenses/) and use the exact ID.

### Error: "Invalid PURL format"

**Solution**: Verify your PURL follows the format: `pkg:type/name@version`

## Advanced Features

### Column Mapping

If your Excel file uses different column names, you can map them during upload:

1. Upload your file
2. The generator will attempt auto-detection
3. Manually adjust mappings if needed
4. Save mappings for future use

### Bulk Import

The template supports bulk import of components:

- No limit on number of rows
- Empty rows are automatically skipped
- Invalid rows show warnings but don't stop processing

### Metadata Enhancement

Add project-level metadata during generation:

- Project name
- Project version
- Description
- Author/organization

## Support

For additional help:

- Review the [User Guide](./sbom-generator-guide.md)
- Check the [CycloneDX Specification](https://cyclonedx.org/capabilities/sbom/)
- Submit issues on GitHub

---

**Version:** 1.0.0
**Last Updated:** 2026-02-11
