#!/usr/bin/env node

/**
 * Icon Generation Script
 *
 * This script generates application icons from the SVG source.
 * Requires: npm install sharp --save-dev
 *
 * Usage: node scripts/generate-icons.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')
const buildDir = join(rootDir, 'build')

// Ensure build directory exists
if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true })
}

// PNG sizes needed for different platforms
const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

console.log('Icon Generation Script')
console.log('======================')
console.log('')
console.log('This script requires the "sharp" package to generate icons.')
console.log('Install it with: npm install sharp --save-dev')
console.log('')
console.log('Alternatively, use an online tool like:')
console.log('- https://cloudconvert.com/svg-to-ico')
console.log('- https://cloudconvert.com/svg-to-icns')
console.log('- https://svgtopng.com/')
console.log('')
console.log('Required output files:')
console.log('  build/icon.ico     - Windows icon (multi-size)')
console.log('  build/icon.icns    - macOS icon (multi-size)')
console.log('  build/icon.png     - Linux icon (512x512)')
console.log('')

// Generate placeholder PNGs using a simple approach
async function generateIcons() {
  try {
    // Try to use sharp if available
    const sharp = await import('sharp')

    const svgPath = join(buildDir, 'icon.svg')
    const svgBuffer = readFileSync(svgPath)

    console.log('Generating PNG files...')

    for (const size of pngSizes) {
      const outputPath = join(buildDir, `icon-${size}x${size}.png`)
      await sharp.default(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath)
      console.log(`  Created: icon-${size}x${size}.png`)
    }

    // Create main icon.png (512x512)
    await sharp.default(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(join(buildDir, 'icon.png'))
    console.log('  Created: icon.png (512x512)')

    console.log('')
    console.log('PNG files generated successfully!')
    console.log('')
    console.log('For ICO and ICNS files, use:')
    console.log('- Windows: Use "png-to-ico" npm package or online converter')
    console.log('- macOS: Use "iconutil" command or online converter')

  } catch (error) {
    console.log('Sharp not available. Using placeholder approach.')
    console.log('')
    console.log('To generate icons manually:')
    console.log('1. Open build/icon.svg in a vector graphics editor')
    console.log('2. Export to PNG at various sizes (16, 24, 32, 48, 64, 128, 256, 512)')
    console.log('3. Use online converters for ICO and ICNS formats')
    console.log('')
    console.log('Placeholder files will be created for development.')

    // Create a simple placeholder notice
    const placeholder = `Placeholder for icon files.

Generate actual icons from icon.svg using:
- Online: https://cloudconvert.com/svg-to-ico
- npm: npm install sharp && node scripts/generate-icons.js
`

    writeFileSync(join(buildDir, 'ICONS_README.txt'), placeholder)
    console.log('Created: ICONS_README.txt')
  }
}

generateIcons()
