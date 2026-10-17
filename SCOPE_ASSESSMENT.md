# AmoType student scope assessment

The local 0.2.0 extends the educational checker with homogeneous arrays and fixed object shapes. The published 0.1.0 remains the original primitive/function release. This update has not been published to npm.

## Implemented behavior

- Acorn parsing, syntax diagnostics, lexical scopes, let/const, initialization, assignments, and primitive operators.
- Named functions, exact arity, primitive and nested collection JSDoc contracts, argument checks, and return checks.
- Homogeneous arrays, nested arrays/records, own-property object shapes, array indexing/length, and static property reads.
- Member assignments and updates that preserve inferred shapes; E400–E403 explain collection errors. Const protects the reference, while members remain writable.
- Strict policy warnings for binding type changes/coercion; errors remain in permissive mode.
- Structured diagnostics, symbols, explanation trace, completeness status, ESM API, TypeScript declarations, and text/JSON CLI.
- Source and CLI tests, fresh packed-consumer verification, playground sample checks, and synchronized presentation examples.

## Limits

This is a shape/type model for straight-line code and simple function bodies, not full JavaScript analysis. Array bounds, per-index values, unions, empty-array contextual inference, arbitrary property keys, prototypes, array methods, destructuring, branching, loops, classes, imports, async, and interprocedural collection mutation are outside its guarantees. Unsupported or uncertain features mark analysis partial. Known modeled errors can occur in complete analysis.

The playground carries a local 0.2.0 archive in its own vendor folder and builds independently. The presentation teaches these rules with verified examples. Both students should be able to explain the path from AST through scope/type inference to a diagnostic. See [TYPE_SYSTEM.md](docs/TYPE_SYSTEM.md) for exact rules.
