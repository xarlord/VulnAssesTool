/**
 * Type shim for cytoscape-fcose (the package ships no type declarations).
 *
 * Its default export is a Cytoscape extension registration function passed to
 * `cytoscape.use(...)`. Typed as Cytoscape's own `Ext` (referenced inline so this
 * file stays an ambient script and actually declares the untyped module, rather
 * than becoming a module that tries — and fails — to augment a non-existent one).
 */

declare module 'cytoscape-fcose' {
  const fcose: import('cytoscape').Ext
  export = fcose
}
