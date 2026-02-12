Feature: SPDX SBOM Parser
  As a vulnerability assessor
  I want to parse SPDX format SBOM files
  So that I can extract component information for scanning

  Scenario: Parse valid SPDX JSON file
    Given a valid SPDX JSON file "bom.spdx.json"
    When I parse the file
    Then components should be extracted
    And format should be "spdx"
    And format version should be detected

  Scenario: Parse SPDX with multiple packages
    Given an SPDX file with 10 packages
    When I parse the file
    Then 10 components should be extracted
    And component count should be 10

  Scenario: Parse SPDX with component versions
    Given an SPDX package with version "2.5.0"
    When I parse the file
    Then component version should be "2.5.0"

  Scenario: Parse SPDX with licenses
    Given an SPDX package with license "Apache-2.0"
    When I parse the file
    Then component licenses should include "Apache-2.0"

  Scenario: Parse SPDX with license expression
    Given an SPDX package with license "MIT OR Apache-2.0"
    When I parse the file
    Then both "MIT" and "Apache-2.0" should be extracted

  Scenario: Parse SPDX with purl reference
    Given an SPDX package with purl "pkg:npm/express@4.18.0"
    When I parse the file
    Then component purl should be "pkg:npm/express@4.18.0"

  Scenario: Parse SPDX with CPE reference
    Given an SPDX package with CPE "cpe:2.3:a:nginx:nginx:1.18.0:*:*:*:*:*:*:*"
    When I parse the file
    Then component CPE should be set

  Scenario: Parse SPDX with package description
    Given an SPDX package with description "A web server"
    When I parse the file
    Then component description should be "A web server"

  Scenario: Determine component type from download location
    Given an SPDX package with download location "https://registry.npmjs.org/express"
    When I parse the file
    Then component type should be "library"

  Scenario: Determine container type
    Given an SPDX package with download location containing "docker"
    When I parse the file
    Then component type should be "container"

  Scenario: Generate unique component ID
    Given package name "express" and version "4.18.0"
    When generating component ID
    Then ID should be "express-4.18.0"

  Scenario: Handle invalid JSON in SPDX file
    Given an SPDX file with invalid JSON
    When I attempt to parse
    Then an error should be thrown
    And error should indicate invalid JSON

  Scenario: Validate SPDX file format
    Given a valid SPDX JSON file
    When I validate the file
    Then validation should succeed

  Scenario: Detect SPDX file type
    Given a file with dataLicense "CC0-1.0"
    When I check if it's an SPDX file
    Then result should be true

  Scenario: Get SPDX version from file
    Given an SPDX file with spdxVersion "SPDX-2.3"
    When I get the version
    Then version should be "2.3"
