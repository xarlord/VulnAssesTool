import { describe, it, expect } from 'vitest'
import { parseCycloneDX } from './cyclonedx'

// Real-parser (UNMOCKED) tests for the CycloneDX XML path (FR-02.1).
//
// cyclonedx.test.ts mocks fast-xml-parser and pre-flattens <components>/<component> before the
// parsing code runs, so it never exercised the real XMLParser output shape — which is exactly why
// the XML path shipped broken: with the container elements forced to arrays, real output was
// `bom.components = [{ component: [...] }]`, and the extractor treated that wrapper object as a
// component, crashing mapComponentType on an undefined type. These tests feed actual XML strings
// through the real parser to pin the true end-to-end behavior; each one throws (or returns garbage)
// against the pre-fix parser config.

describe('parseCycloneDX — real XML parser (FR-02.1)', () => {
  it('extracts multiple components from a real <components><component/>… structure', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5" version="1">
  <components>
    <component type="library">
      <name>log4j-core</name>
      <version>2.14.1</version>
      <purl>pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1</purl>
    </component>
    <component type="framework">
      <name>spring-core</name>
      <version>5.3.0</version>
    </component>
  </components>
</bom>`
    const result = await parseCycloneDX(xml, 'sbom.xml')

    expect(result.metadata.formatVersion).toBe('1.5')
    expect(result.components).toHaveLength(2)
    const byName = Object.fromEntries(result.components.map((c) => [c.name, c]))
    expect(byName['log4j-core'].version).toBe('2.14.1')
    expect(byName['log4j-core'].type).toBe('library')
    expect(byName['log4j-core'].purl).toBe('pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1')
    expect(byName['spring-core'].type).toBe('framework')
  })

  it('extracts a single component (parser yields one entry, not a wrapper object)', async () => {
    const xml = `<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components><component type="application"><name>my-app</name><version>1.0.0</version></component></components></bom>`
    const result = await parseCycloneDX(xml, 'sbom.xml')

    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('my-app')
    expect(result.components[0].type).toBe('application')
  })

  it('recurses into nested components', async () => {
    const xml = `<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components>
      <component type="library"><name>parent</name><version>1.0.0</version>
        <components><component type="library"><name>child</name><version>2.0.0</version></component></components>
      </component>
    </components></bom>`
    const result = await parseCycloneDX(xml, 'sbom.xml')

    const names = result.components.map((c) => c.name)
    expect(names).toContain('parent')
    expect(names).toContain('child')
  })

  it('extracts every vulnerability from a real <vulnerabilities><vulnerability/>… structure', async () => {
    // Pre-fix this returned a single bogus vulnerability with id undefined (the wrapper object).
    const xml = `<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
      <components><component type="library"><name>log4j-core</name><version>2.14.1</version></component></components>
      <vulnerabilities>
        <vulnerability><id>CVE-2021-44228</id><description>Log4Shell</description></vulnerability>
        <vulnerability><id>CVE-2021-45046</id><description>Follow-up</description></vulnerability>
      </vulnerabilities>
    </bom>`
    const result = await parseCycloneDX(xml, 'sbom.xml')

    expect(result.vulnerabilities).toHaveLength(2)
    const ids = result.vulnerabilities.map((v) => v.id)
    expect(ids).toContain('CVE-2021-44228')
    expect(ids).toContain('CVE-2021-45046')
  })
})
