/**
 * Unit tests for queryUtils — sql.js result-row conversion utilities.
 */

import { describe, it, expect } from 'vitest'
import { rowsToObjects } from './queryUtils.js'

describe('rowsToObjects', () => {
  it('should convert a single row to an object keyed by column name', () => {
    const columns = ['id', 'name', 'age']
    const values = [[1, 'Alice', 30]]

    const result = rowsToObjects(columns, values)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 1, name: 'Alice', age: 30 })
  })

  it('should convert multiple rows', () => {
    const columns = ['x', 'y']
    const values = [
      [10, 20],
      [30, 40],
      [50, 60],
    ]

    const result = rowsToObjects(columns, values)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ x: 10, y: 20 })
    expect(result[1]).toEqual({ x: 30, y: 40 })
    expect(result[2]).toEqual({ x: 50, y: 60 })
  })

  it('should return an empty array when values is empty', () => {
    const columns = ['a', 'b']
    const values: unknown[][] = []

    const result = rowsToObjects(columns, values)

    expect(result).toEqual([])
  })

  it('should handle null and undefined cell values', () => {
    const columns = ['id', 'label', 'score']
    const values = [[1, null, undefined]]

    const result = rowsToObjects(columns, values)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 1, label: null, score: undefined })
  })

  it('should handle a single-column result set', () => {
    const columns = ['count']
    const values = [[42]]

    const result = rowsToObjects(columns, values)

    expect(result).toEqual([{ count: 42 }])
  })

  it('should handle string columns with various value types', () => {
    const columns = ['text', 'number', 'boolean', 'blob']
    const values = [['hello', 3.14, true, Buffer.from('data')]]

    const result = rowsToObjects(columns, values)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      text: 'hello',
      number: 3.14,
      boolean: true,
      blob: Buffer.from('data'),
    })
  })

  it('should map columns to values by positional index even with duplicate column names', () => {
    // sql.js can return duplicate column names in JOINs
    const columns = ['id', 'id']
    const values = [[1, 2]]

    const result = rowsToObjects(columns, values)

    // Last column wins in object assignment (standard JS behavior)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ id: 2 })
  })

  it('should handle empty columns with non-empty values gracefully', () => {
    const columns: string[] = []
    const values: unknown[][] = [[]]

    const result = rowsToObjects(columns, values)

    expect(result).toEqual([{}])
  })
})
