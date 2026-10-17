# AmoType (`@amirrrreza1/amotype`)

A custom educational static checker for a documented JavaScript subset. The parser is Acorn; checking rules are implemented by this package. Submitted source is never executed.

Created by **Amirreza & Mobina** for **Programming Language Design**.

**Version 0.1.0 is published on npm; the local 0.2.0 adds arrays and objects and has not been published.** The package name is `@amirrrreza1/amotype`; the CLI command is `amotype`. This version exports ESM and requires Node.js 22+ for its CLI.

## Installation

Install the published version:

```sh
npm install @amirrrreza1/amotype
```

Published 0.1.0 consumers using TypeScript with `skipLibCheck: false` also need `pnpm add -D @types/estree`. The standalone source now includes those types in its package dependencies; that metadata correction is awaiting a future patch release. JavaScript API and CLI usage are unaffected.

Or use pnpm: `pnpm add @amirrrreza1/amotype@0.1.0`.

## Develop the standalone package

The sibling folders are `Package`, `Project` (playground), and `Presentation`. This folder builds and tests independently; no files from either sibling are required. This folder has its own local Git repository, separate from Project and Presentation. Use Node.js 22+ and pnpm 11.9.0.

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run format:check
pnpm run verify:package
pnpm pack
```

`check` runs type checking, lint, a build, and the source/CLI tests. `verify:package` packs this folder, installs the archive in a separate consumer, and checks its ESM API, CLI, and strict TypeScript declarations in a temporary consumer outside this project. Build with `npm run build` if using npm.

The playground installs the local 0.2.0 archive committed under `Project/vendor/`, so it includes array/object checks and still builds independently. After engine changes, run `pnpm run build` and `pnpm pack --pack-destination ../Project/vendor` here, then `pnpm install --force` in Project to refresh its installed archive. This does not publish to npm.

See [the type policy](docs/TYPE_SYSTEM.md) and [the student scope assessment](SCOPE_ASSESSMENT.md).

## API

```js
import { check } from '@amirrrreza1/amotype';

const result = check('let age = 20; age = "twenty";', { mode: 'strict' });
// result.diagnostics[0].code === 'W100'
// result.analysisComplete === true
```

Options: `mode: 'strict'` (default) or `'permissive'`. Strict adds policy warnings about coercion and changing variable types; permissive suppresses those warnings.

The result contains:

- `diagnostics`: code, severity (`error`, `warning`, `info`), message, source range, optional expected/actual types, and suggestion.
- `analysisComplete`: false for syntax failure, unsupported features, or uncertain checks. True does not mean there are no diagnostics; inspect both fields.
- `symbols`: binding names, kinds, initial/current types, scopes, and declaration ranges.
- `trace`: checking rules, explanations, inferred types, and source ranges.

Ranges use UTF-16 offsets, one-based lines/columns, and exclusive end positions. Syntax diagnostics can have a zero-width range at the error position.

The core can be bundled for a browser. It has no Node filesystem imports; the CLI is a separate entry point.

## CLI

```sh
pnpm exec amotype file.js
pnpm exec amotype file.js --json
pnpm exec amotype file.js --permissive
```

Exit codes: 0 complete/no errors; 1 errors; 2 usage or I/O failure; 3 partial/no errors. Error status takes precedence over partial status. Warnings alone do not fail a complete check.

## Scope and policy

Supported: homogeneous arrays, fixed object shapes, element/property reads and writes, nested collection JSDoc contracts, primitive values (`number`, `string`, `boolean`, `null`, `undefined`), `unknown`, let/const, blocks, identifier references, simple assignments and updates, common primitive operators, named non-async functions with identifier parameters, primitive and collection JSDoc contracts, and simple returns.

Functions use exact arity as an educational contract. Built-ins include `Number`, `String`, `Boolean`, and `parseFloat`, each with one argument. Unannotated parameters are unknown. Forward calls need an explicit `@returns` annotation for a known result. Mutable captured values are uncertain across calls.

Array methods, sparse/spread literals, dynamic object keys, destructuring, var, classes, arrow functions, loops, branching, imports, promises, async/generators, unions, and other generic JSDoc types are outside this version. Unsupported features generate `I100`; uncertainty generates `I101`. This package does not guarantee full JavaScript soundness or runtime correctness. The parser uses module grammar.

## Array and object playground examples

Choose **Arrays and objects**, **Array and object mistakes**, or **Collection function contracts** in the playground. Paste-ready programs are in [collections.js](examples/collections.js) and [collection-errors.js](examples/collection-errors.js).

```js
const scores = [80, 90];
const student = { name: 'Amo', scores };
const first = student.scores[0]; // number
scores[1] = 95;
scores[0] = 'eighty'; // E403: member expects number
const missing = student.grade; // E400: missing own property
```

See [the type policy](docs/TYPE_SYSTEM.md#arrays-and-objects) for bounds, mutation, and unknown-type limits.

## License

MIT. Copyright (c) 2026 Amirreza and Mobina. See [LICENSE](./LICENSE).

## Source and issues

[Source repository](https://github.com/amirrrreza1/LanguageDesign) · [Report an issue](https://github.com/amirrrreza1/LanguageDesign/issues).
