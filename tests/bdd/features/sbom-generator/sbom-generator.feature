Feature: Excel to CycloneDX SBOM Generation
  As a security analyst or developer
  I want to generate CycloneDX SBOM files from Excel component inventories
  So that I can create standardized software bills of materials for compliance and vulnerability assessment

  Background:
    Given I am using the VulnAssessTool application
    And the application has successfully loaded
    And I am on the Dashboard page

  Scenario: Generate SBOM from valid Excel file with standard template
    Given I have a valid Excel file with components using the standard template
      | name | version | type | license | purl |
      | react | 18.2.0 | library | MIT | pkg:npm/react@18.2.0 |
      | lodash | 4.17.21 | library | MIT | pkg:npm/lodash@4.17.21 |
      | axios | 1.6.0 | library | MIT | pkg:npm/axios@1.6.0 |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I review the parsed components preview
    And I click "Generate SBOM"
    Then I should download a valid CycloneDX JSON file
    And the file should contain all 3 components from Excel
    And the file should be CycloneDX 1.5 compliant
    And each component should have the correct name, version, and license

  Scenario: Generate SBOM with custom column mapping
    Given I have an Excel file with custom column headers
      | Component Name | Component Version | License ID |
      | express | 4.18.2 | MIT |
      | moment | 2.29.4 | MIT |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I map "Component Name" to "name"
    And I map "Component Version" to "version"
    And I map "License ID" to "license"
    And I click "Generate SBOM"
    Then I should download a valid CycloneDX JSON file
    And the file should contain all 2 components
    And the components should use the correctly mapped values

  Scenario: Handle Excel file with only required fields
    Given I have an Excel file with only name and version columns
      | name | version |
      | react | 18.2.0 |
      | vue | 3.3.0 |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I click "Generate SBOM"
    Then I should download a valid CycloneDX JSON file
    And the components should have default type "library"
    And the components should not have license information

  Scenario: Validate Excel file with missing required fields
    Given I have an Excel file with incomplete data
      | name | version |
      | react | 18.2.0 |
      | | 4.17.21 |
      | axios | |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then I should see validation errors for rows with missing data
    And the error should indicate which rows have missing required fields
    And I should be able to correct the data or proceed with valid rows only

  Scenario: Generate SBOM with project metadata
    Given I have a valid Excel file with components
      | name | version |
      | react | 18.2.0 |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I enter project metadata:
      | Project Name | My Web Application |
      | Version | 1.0.0 |
      | Description | Customer-facing web application |
      | Author | My Company |
    And I click "Generate SBOM"
    Then the generated SBOM should include the metadata
    And the metadata component should have type "application"
    And the metadata should contain the timestamp

  Scenario: Handle empty rows and invalid data gracefully
    Given I have an Excel file with mixed valid and invalid data
      | name | version | type |
      | react | 18.2.0 | library |
      | | | |
      | lodash | 4.17.21 | library |
      | INVALID | | |
      | axios | 1.6.0 | library |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then the parser should skip empty rows
    And the parser should show warnings for invalid rows
    And the preview should only show valid components
    And I should be able to generate SBOM with 3 valid components

  Scenario: Generate SBOM in XML format
    Given I have a valid Excel file with components
      | name | version |
      | react | 18.2.0 |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I select XML format as output
    And I click "Generate SBOM"
    Then I should download a valid CycloneDX XML file
    And the XML file should be well-formed
    And the XML file should contain all components from Excel

  Scenario: Preview components before generating SBOM
    Given I have a valid Excel file with components
      | name | version | license |
      | react | 18.2.0 | MIT |
      | lodash | 4.17.21 | MIT |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then I should see a preview table with parsed components
    And the preview should show all component fields
    And I should be able to edit component data in the preview
    And I should be able to remove components from the preview
    And I should be able to cancel and return to the dialog

  Scenario: Handle large Excel files efficiently
    Given I have an Excel file with 1000+ components
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then the file should be parsed within 10 seconds
    And the preview should load with pagination or virtual scrolling
    And I should be able to generate SBOM without performance issues

  Scenario: Save and reuse column mappings
    Given I have previously mapped custom columns for a project
      | "Component Name" -> "name" |
      | "Component Version" -> "version" |
    When I upload a new Excel file with the same column structure
    Then the application should remember my previous mappings
    And I should not need to manually map columns again
    And I should be able to proceed directly to generation

  Scenario: Show detailed error message for invalid Excel file
    Given I have a file that is not a valid Excel file
      | Filename | document.txt |
    When I navigate to the SBOM Generator dialog
    And I attempt to upload the file
    Then I should see a clear error message
    And the error message should indicate the file format is not supported
    And the dialog should remain open for me to try again

  Scenario: Validate PURL format in Excel data
    Given I have an Excel file with components including PURLs
      | name | version | purl |
      | react | 18.2.0 | pkg:npm/react@18.2.0 |
      | invalid-package | 1.0.0 | invalid-purl-format |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then I should see validation warnings for invalid PURLs
    And I should be able to correct or ignore invalid PURLs
    And the valid PURLs should be included in the generated SBOM

  Scenario: Generate SBOM with all optional fields
    Given I have a comprehensive Excel file with all fields
      | name | version | type | license | purl | cpe | description | supplier | group |
      | react | 18.2.0 | library | MIT | pkg:npm/react@18.2.0 | cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:* | React library | Meta | frontend |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I click "Generate SBOM"
    Then the generated SBOM should include all optional fields
    And the component should have the complete set of metadata
    And the CPE and PURL should be properly formatted

  Scenario: Download template from the generator dialog
    Given I am on the SBOM Generator dialog
    When I click the "Download Template" button
    Then I should download the Excel template file
    And the template should include all standard columns
    And the template should include an Instructions sheet
    And the template should include sample data

  Scenario: Cancel SBOM generation process
    Given I have uploaded an Excel file and reviewed the preview
    When I click the "Cancel" button
    Then the dialog should close
    And no SBOM file should be generated
    And I should return to the previous page
    And my uploaded data should not be saved

  Scenario: Handle multi-sheet Excel files
    Given I have an Excel file with multiple sheets
      | Sheet1 | Components data |
      | Sheet2 | Legacy data |
      | Sheet3 | Notes |
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then I should see a dropdown to select the sheet
    And the default selection should be the first sheet
    And I should be able to switch between sheets
    And the preview should update based on selected sheet

  Scenario: Generate SBOM and automatically upload to project
    Given I have a valid Excel file with components
    And I have an existing project in VulnAssessTool
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    And I check "Add to existing project"
    And I select my project from the list
    And I click "Generate SBOM"
    Then the SBOM should be generated and downloaded
    And the SBOM should be automatically uploaded to the selected project
    And I should see a success message confirming both actions

  Scenario: Display processing progress for large files
    Given I have an Excel file with 500+ components
    When I navigate to the SBOM Generator dialog
    And I upload the Excel file
    Then I should see a progress indicator
    And the progress should show parsing status
    And the progress should show generation status
    And I should be able to see estimated time remaining
