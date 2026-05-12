/**
 * Convert preload.js from ES modules to CommonJS
 *
 * This script runs after the build to convert the preload script
 * from ES modules to CommonJS format, which is required for Electron.
 */

const fs = require('fs');
const path = require('path');

const preloadPath = path.join(__dirname, '..', 'dist', 'electron', 'preload.js');

try {
  if (!fs.existsSync(preloadPath)) {
    console.log('preload.js not found, skipping conversion');
    process.exit(0);
  }

  let content = fs.readFileSync(preloadPath, 'utf-8');

  // Check if already converted (look for require statements)
  if (content.includes("require('electron')") || content.includes('require("electron")')) {
    console.log('preload.js already in CommonJS format');
    process.exit(0);
  }

  // Convert import statements to require
  // Handle: import { x, y } from 'module' and import { x as a, y as b } from 'module'
  content = content.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g, (match, imports, modulePath) => {
    // Convert "as" to ":" for destructuring (import { x as a } -> const { x: a })
    const cleanImports = imports.split(',')
      .map((s) => {
        const trimmed = s.trim();
        // Replace "as" with ":" for destructuring syntax
        return trimmed.replace(/\s+as\s+/, ': ');
      })
      .filter((s) => s.length > 0)
      .join(', ');
    return `const { ${cleanImports} } = require('${modulePath}')`;
  });

  // Handle bare imports: import 'module' -> require('module')
  content = content.replace(/import\s*['"]([^'"]+)['"]/g, "require('$1')");

  // Handle default imports: import x from 'module' -> const x = require('module').default
  content = content.replace(/import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g, "const $1 = require('$2').default || require('$2')");

  fs.writeFileSync(preloadPath, content);
  console.log('Converted preload.js to CommonJS format');
} catch (err) {
  console.warn('Could not convert preload.js to CommonJS:', err.message);
  process.exit(1);
}
