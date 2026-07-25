import { describe, it, expect } from 'vitest'
import { htmlToPdfText } from './serverAdapter'

describe('htmlToPdfText', () => {
  // FR-09.2: the fallback text-only PDF export must contain the report's readable
  // content, not the raw HTML markup. `DOMParser` documents are never attached to
  // the visible DOM, so `innerText` (which requires a layout box) previously came
  // back empty and the code fell through to writing the raw HTML string into the
  // "PDF" — i.e. real users would download a file full of `<div>`/`<style>` tags.
  it('extracts readable text without leaking HTML tags', () => {
    const html = `
      <html>
        <head><style>.report-header { color: red; }</style></head>
        <body>
          <div class="report-container">
            <h1>Vulnerability Assessment Report</h1>
            <p>3 critical vulnerabilities require immediate attention</p>
          </div>
        </body>
      </html>
    `

    const text = htmlToPdfText(html)

    expect(text).toContain('Vulnerability Assessment Report')
    expect(text).toContain('3 critical vulnerabilities require immediate attention')
    expect(text).not.toContain('<')
    expect(text).not.toContain('>')
  })

  it('excludes head content such as embedded <style> rules', () => {
    const html = '<html><head><style>body { color: red; }</style></head><body><p>Report body</p></body></html>'

    const text = htmlToPdfText(html)

    expect(text).toContain('Report body')
    expect(text).not.toContain('color: red')
  })

  it('separates block-level sections with line breaks instead of mashing text together', () => {
    const html = '<body><h1>Title</h1><p>First paragraph</p><p>Second paragraph</p></body>'

    const text = htmlToPdfText(html)
    const lines = text.split('\n')

    expect(lines).toContain('Title')
    expect(lines).toContain('First paragraph')
    expect(lines).toContain('Second paragraph')
  })
})
