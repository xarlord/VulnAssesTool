/**
 * Post-build script to convert all Electron main process files from ESM to CommonJS
 * and rename them to .cjs extension so Node.js treats them as CommonJS modules
 */

const fs = require('fs')
const path = require('path')

const electronDir = path.join(__dirname, '..', 'dist', 'electron')

/**
 * Convert a single file from ES modules to CommonJS
 */
function convertFileToCjs(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8')

    // Check if already converted
    if (content.includes("require('electron')") || content.includes('require("electron")')) {
      return { converted: false, reason: 'already-converted' }
    }

    // Remove ES module polyfills for __dirname and __filename (CommonJS has these built-in)
    // Pattern 1: const __filename = fileURLToPath(import.meta.url)
    content = content.replace(/const\s+__filename\s*=\s*fileURLToPath\s*\(\s*import\.meta\.url\s*\)\s*;?/g, '')
    // Pattern 2: const __dirname = dirname(__filename) - from node:path
    content = content.replace(/const\s+__dirname\s*=\s*dirname\s*\(\s*__filename\s*\)\s*;?/g, '')
    // Pattern 3: const __dirname = path.dirname(__filename)
    content = content.replace(/const\s+__dirname\s*=\s*path\.dirname\s*\(\s*__filename\s*\)\s*;?/g, '')
    // Pattern 4: Polyfill block at the top of files
    content = content.replace(/\/\/\s*Polyfill\s+for\s+__dirname[^]*?const\s+__dirname\s*=\s*(?:dirname|path\.dirname)\s*\(\s*__filename\s*\)\s*;?\n/g, '')
    // Remove the import for fileURLToPath if it's no longer needed
    content = content.replace(/import\s*\{\s*fileURLToPath\s*\}\s*from\s*['"]node:url['"]\s*;?\n?/g, '')
    content = content.replace(/import\s*\{\s*fileURLToPath\s*,\s*dirname\s*\}\s*from\s*['"]node:url['"]\s*;?\n?/g, '')
    // Also remove dirname import from node:path if only used for polyfill
    content = content.replace(/import\s*\{\s*dirname\s*\}\s*from\s*['"]node:path['"]\s*;?\n?/g, '')

    // Remove import.meta.url references
    content = content.replace(/import\.meta\.url/g, '__filename')

    // Helper to get the correct path with .cjs extension
    const getCjsPath = (modulePath) => {
      if (!modulePath.startsWith('.')) return modulePath
      if (modulePath.endsWith('.js')) return modulePath.replace(/\.js$/, '.cjs')
      if (modulePath.endsWith('.cjs') || modulePath.endsWith('.json')) return modulePath
      return modulePath + '.cjs'
    }

    // Convert import statements to require
    content = content.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g, (match, imports, modulePath) => {
      const cleanImports = imports.split(',')
        .map(s => s.trim().replace(/\s+as\s+/, ': '))
        .filter(s => s.length > 0)
        .join(', ')

      return `const { ${cleanImports} } = require('${getCjsPath(modulePath)}')`
    })

    // Handle bare imports
    content = content.replace(/import\s*['"]([^'"]+)['"]/g, (match, modulePath) => {
      return `require('${getCjsPath(modulePath)}')`
    })

    // Handle default imports
    content = content.replace(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g, (match, varName, modulePath) => {
      const finalPath = getCjsPath(modulePath)
      return `const ${varName} = require('${finalPath}').default || require('${finalPath}')`
    })

    // Handle namespace imports
    content = content.replace(/import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g, (match, varName, modulePath) => {
      return `const ${varName} = require('${getCjsPath(modulePath)}')`
    })

    // Handle export statements
    // First handle re-exports (export { ... } from '...')
    content = content.replace(/export\s+\{([^}]+)\}\s+from\s*['"]([^'"]+)['"]/g, (match, exports, modulePath) => {
      const finalPath = getCjsPath(modulePath)
      const exportNames = exports.split(',').map(s => s.trim().replace(/\s+as\s+/, ': ')).join(', ')
      return `module.exports = { ...require('${finalPath}') }`
    })

    // Handle export * from (re-export all)
    content = content.replace(/export\s+\*\s+from\s*['"]([^'"]+)['"]/g, (match, modulePath) => {
      const finalPath = getCjsPath(modulePath)
      return `Object.assign(module.exports, require('${finalPath}'))`
    })

    // Handle regular export { ... } (without from)
    content = content.replace(/export\s+\{([^}]+)\}(?!\s+from)/g, 'module.exports = { $1 }')

    // Handle export default
    content = content.replace(/export\s+default\s+/g, 'module.exports = ')

    // Handle export const/let/var/function/class/async function
    content = content.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ')
    content = content.replace(/export\s+async\s+function\s+/g, 'async function ')

    // Handle empty exports (often from type-only files)
    content = content.replace(/export\s*\{\s*\}\s*;?/g, '// Empty export removed')

    // Clean up empty lines left by removed code
    content = content.replace(/\n{3,}/g, '\n\n')

    return { converted: true, content }
  } catch (err) {
    return { converted: false, reason: err.message }
  }
}

/**
 * Update require paths to use .cjs extension
 */
function updateRequirePaths(content) {
  // Update relative require paths to include .cjs extension
  return content.replace(/require\(['"](\.[^'"]+)['"]\)/g, (match, modulePath) => {
    if (modulePath.endsWith('.cjs') || modulePath.endsWith('.json')) {
      return match
    }
    // Replace .js with .cjs if present, otherwise append .cjs
    if (modulePath.endsWith('.js')) {
      return `require('${modulePath.replace(/\.js$/, '.cjs')}')`
    }
    return `require('${modulePath}.cjs')`
  })
}

/**
 * Convert all .js files in dist/electron directory and rename to .cjs
 */
function convertAllFiles() {
  console.log('Converting Electron files to CommonJS (.cjs)...')

  if (!fs.existsSync(electronDir)) {
    console.error('Electron dist directory not found:', electronDir)
    process.exit(1)
  }

  let convertedCount = 0
  const renamedFiles = []

  // First pass: convert and rename all files
  const processDir = (dir, relativePath = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        processDir(fullPath, path.join(relativePath, entry.name))
      } else if (entry.name.endsWith('.js')) {
        const result = convertFileToCjs(fullPath)

        if (result.converted) {
          // Write converted content
          const finalContent = updateRequirePaths(result.content)
          fs.writeFileSync(fullPath, finalContent)

          // Rename to .cjs
          const newPath = fullPath.replace(/\.js$/, '.cjs')
          fs.renameSync(fullPath, newPath)

          const relativeFilePath = path.join(relativePath, entry.name)
          console.log(`  Converted ${relativeFilePath} -> ${entry.name.replace('.js', '.cjs')}`)
          renamedFiles.push({ old: fullPath, new: newPath })
          convertedCount++
        } else if (result.reason === 'already-converted') {
          // Still rename to .cjs
          const newPath = fullPath.replace(/\.js$/, '.cjs')
          const content = updateRequirePaths(fs.readFileSync(fullPath, 'utf-8'))
          fs.writeFileSync(fullPath, content)
          fs.renameSync(fullPath, newPath)

          const relativeFilePath = path.join(relativePath, entry.name)
          console.log(`  Renamed ${relativeFilePath} -> ${entry.name.replace('.js', '.cjs')}`)
          renamedFiles.push({ old: fullPath, new: newPath })
          convertedCount++
        }
      }
    }
  }

  processDir(electronDir)

  if (convertedCount === 0) {
    console.log('All files already in CommonJS format')
  } else {
    console.log(`Converted ${convertedCount} file(s) to CommonJS (.cjs)`)
  }

  return renamedFiles
}

convertAllFiles()
