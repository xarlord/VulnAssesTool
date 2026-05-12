/**
 * Type augmentation for jspdf-autotable
 *
 * The autoTable plugin mutates the jsPDF instance at runtime, adding a
 * `lastAutoTable` property. Since jsPDF's own types don't include it,
 * we augment the module here so downstream code can access it safely.
 */

import type { Table } from 'jspdf-autotable'

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: Table
  }
}
