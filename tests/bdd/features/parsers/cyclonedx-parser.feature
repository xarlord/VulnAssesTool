Feature: CycloneDX SBOM Parser
  As a vulnerability assessor
  I want to parse CycloneDX format SBOM files
  So that I can extract component information for scanning

  Scenario: Parse valid CycloneDX JSON file
    Given a valid CycloneDX JSON file "bom.json"
    When I parse the file
    Then components should be extracted
    And format should be "cyclonedx"

  Scenario: Parse CycloneDX with nested components
    Given a CycloneDX file with component dependencies
    When I parse the file
    Then all components should be extracted
    And dependencies should be tracked

  Scenario: Parse CycloneDX with vulnerability data
    Given a CycloneDX file with vulnerability information
    When I parse the file
    Then vulnerabilities should be extracted
    And component-vulnerability links should be established

  Scenario: Extract component hashes from CycloneDX
    Given a CycloneDX component with SHA-256 hash
    When I parse the file
    Then component hash should be extracted
