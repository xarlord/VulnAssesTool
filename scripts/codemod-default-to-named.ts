import { Project, SyntaxKind } from 'ts-morph'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = new Project({ skipAddingFilesFromTsConfig: true })

const summary = { defaultsRemoved: 0, importsUpdated: 0, filesModified: new Set<string>(), errors: [] as string[] }

const targetDirs = ['src/renderer', 'orchestrator']

function collectFiles(dir: string): string[] {
  const results: string[] = []
  const fullDir = path.join(projectRoot, dir)
  if (!fs.existsSync(fullDir)) return results
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const fullPath = path.join(fullDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectFiles(path.join(dir, entry.name)))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.spec\.|\.config\.|\.d\.ts/.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

const filePaths = targetDirs.flatMap((d) => collectFiles(d))
const sourceFiles = filePaths.map((fp) => project.addSourceFileAtPath(fp))

const defaultExportMap = new Map<string, string>()

for (const sf of sourceFiles) {
  const fp = sf.getFilePath()
  const baseName = path.basename(fp, path.extname(fp))
  let modified = false

  for (const fn of sf.getFunctions()) {
    if (fn.isDefaultExport() && fn.getName()) {
      const name = fn.getName()
      fn.setIsDefaultExport(false)
      fn.setIsExported(true)
      defaultExportMap.set(fp, name)
      summary.defaultsRemoved++
      modified = true
    }
  }

  for (const cls of sf.getClasses()) {
    if (cls.isDefaultExport() && cls.getName()) {
      const name = cls.getName()
      cls.setIsDefaultExport(false)
      cls.setIsExported(true)
      defaultExportMap.set(fp, name)
      summary.defaultsRemoved++
      modified = true
    }
  }

  const exportAssignments = sf.getExportAssignments()
  for (const ea of [...exportAssignments]) {
    const expr = ea.getExpression()
    const exprKind = expr.getKind()

    if (exprKind === SyntaxKind.Identifier) {
      const exportedName = expr.getText()

      const namedExports = sf.getExportedDeclarations().get(exportedName)
      const hasOwnNamedExport =
        namedExports &&
        namedExports.length > 0 &&
        namedExports.some((d) => {
          const parentNode = d.getParent()
          return (
            parentNode.getKind() === SyntaxKind.ExportKeyword ||
            (parentNode.getKind() === SyntaxKind.ClassDeclaration &&
              (parentNode as any).getName?.() === exportedName) ||
            parentNode.getKind() === SyntaxKind.FunctionDeclaration
          )
        })

      if (hasOwnNamedExport) {
        ea.remove()
      } else {
        ea.replaceWithText(`export { ${exportedName} }`)
      }
      defaultExportMap.set(fp, exportedName)
      summary.defaultsRemoved++
      modified = true
      continue
    }

    if (exprKind === SyntaxKind.ObjectLiteralExpression) {
      const constName = baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/[^a-zA-Z0-9]/g, '_') + 'Default'
      const exprText = expr.getText()
      const parent = ea.getParentIfKind(SyntaxKind.ExpressionStatement)
      if (parent) {
        parent.replaceWithText(`export const ${constName} = ${exprText}`)
      } else {
        ea.replaceWithText(`export const ${constName} = ${exprText}`)
      }
      defaultExportMap.set(fp, constName)
      summary.defaultsRemoved++
      modified = true
      continue
    }

    summary.errors.push(
      `${path.relative(projectRoot, fp)}:${ea.getStartLineNumber()} — unhandled: ${expr.getText().substring(0, 60)}`,
    )
  }

  if (modified) {
    summary.filesModified.add(fp)
  }
}

for (const [sourcePath, exportName] of defaultExportMap) {
  for (const importer of project.getSourceFiles()) {
    const impFp = importer.getFilePath()
    if (impFp === sourcePath) continue
    if (/\.test\.|\.spec\.|\.config\.|\.d\.ts|node_modules/.test(impFp)) continue

    for (const importDecl of importer.getImportDeclarations()) {
      const moduleSpec = importDecl.getModuleSpecifierValue()
      const resolved = importDecl.getModuleSpecifierSourceFile()
      if (!resolved || resolved.getFilePath() !== sourcePath) continue

      const defaultImport = importDecl.getDefaultImport()
      if (!defaultImport) continue

      const defaultName = defaultImport.getText()
      const namedImports = importDecl.getNamedImports()

      const allNames = [
        `${exportName}${defaultName !== exportName ? ` as ${defaultName}` : ''}`,
        ...namedImports.map((ni) => {
          const name = ni.getName()
          const alias = ni.getAliasNode()?.getText()
          return alias ? `${name} as ${alias}` : name
        }),
      ]

      const prefix = importDecl.isTypeOnly() ? 'import type' : 'import'
      importDecl.replaceWithText(`${prefix} { ${allNames.join(', ')} } from '${moduleSpec}'`)
      summary.importsUpdated++
      summary.filesModified.add(impFp)
    }
  }
}

for (const fp of summary.filesModified) {
  const sf = project.getSourceFile(fp)
  if (sf) {
    sf.fixUnusedIdentifiers()
  }
}

project.saveSync()

console.log('\n=== Default Export Codemod ===')
console.log(`Defaults removed: ${summary.defaultsRemoved}`)
console.log(`Imports updated: ${summary.importsUpdated}`)
console.log(`Files modified: ${summary.filesModified.size}`)
if (summary.errors.length) {
  console.log(`\nErrors:`)
  summary.errors.forEach((e) => console.log(`  ${e}`))
}
