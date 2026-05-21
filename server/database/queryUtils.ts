/**
 * Query result utilities for sql.js database operations.
 *
 * Converts sql.js query results (parallel columns + values arrays)
 * into plain objects keyed by column name.
 */

/**
 * Convert sql.js result rows into an array of plain objects.
 *
 * @param columns - Column names from `results[0].columns`
 * @param values - Row values from `results[0].values`
 * @returns Array of objects where each key is a column name
 *
 * @example
 * ```ts
 * const [result] = db.exec('SELECT id, name FROM users')
 * const rows = rowsToObjects(result.columns, result.values)
 * // rows = [{ id: 1, name: 'Alice' }, ...]
 * ```
 */
export function rowsToObjects(columns: string[], values: unknown[][]): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = []
  for (const row of values) {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i]
    }
    objects.push(obj)
  }
  return objects
}
