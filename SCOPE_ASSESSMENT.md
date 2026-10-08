# AmoType student scope assessment

The package is complete for its documented first-version educational subset. It is intentionally a small checker for a limited set of JavaScript programs. Version 0.1.0 is published on npm; the playground installs it without importing this source folder.

## What is implemented

| Area         | Implemented behavior                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Parsing      | Acorn produces an AST; syntax failures become diagnostics.                                                                  |
| Types        | Primitive values, unknown types, and simple named function signatures.                                                      |
| Variables    | let/const, initialization, assignments, updates, and initial/current types.                                                 |
| Scope        | Nested blocks, shadowing, unresolved names, reads before initialization, and const protection.                              |
| Operators    | Arithmetic, comparisons, equality, unary, bitwise, and limited logical operators.                                           |
| Functions    | Simple named functions, primitive JSDoc parameters/returns, argument count/type checks, return checks, and a few built-ins. |
| Policy       | Strict warnings for implicit coercion and type changes; permissive mode suppresses those warnings.                          |
| Output       | Diagnostic codes, severity, source locations, suggestions, symbols, explanation trace, and analysisComplete.                |
| Distribution | ESM API, TypeScript declarations, text/JSON CLI, MIT license, and npm release.                                              |
| Verification | 51 source/CLI tests, type checking, lint, and packed-package installation verification.                                     |

The core contains 12 TypeScript modules. Acorn is the only JavaScript runtime dependency. ESTree type declarations are also included as an install dependency because exported TypeScript declarations reference them; TypeScript, ESLint, and test tools are development dependencies. The published 0.1.0 archive contains about 131 KB of unpacked files, including source, declarations, and maps. Website and presentation dependencies are separate.

A packaging defect in the published 0.1.0 was found during extraction: strict TypeScript consumers need to install `@types/estree` themselves. The standalone package metadata now includes it and verification checks a fresh TypeScript consumer with `skipLibCheck: false`. A future patch release is required to distribute this correction; no new version has been published.

## What complete means

The first release covers straight-line code and simple function bodies. Unsupported syntax and uncertain checks explicitly mark analysis as partial. A complete analysis still requires inspecting diagnostics and does not prove runtime safety: numeric values, termination, and external effects are not verified.

Arrays, objects, if/else, loops, arrow functions, classes, imports, async code, generics, and complex JSDoc types are outside the documented subset. Their absence is a deliberate scope limit. Public website hosting and the course rubric are separate completion checks for the overall submission.

## Keep the student version small

No new language feature is necessary to finish this package. Prioritize clearer examples, short explanations of each rule, and fixing demonstrated defects. Both students should be able to explain the path from AST to scope lookup, type inference, and diagnostic output.

If one small extension is wanted, add primitive variable JSDoc annotations such as `/** @type {number} */ let count = 1;`. This reuses the existing type model and demonstrates declared versus inferred types. It still needs a written rule for later assignments, unsupported annotations, and focused tests. This extension is optional and is not implemented in 0.1.0.

Leave branching/loop analysis, unions and narrowing, arrays/objects, generics, cross-file analysis, classes, async analysis, and automatic fixes for a later project. Several look simple in examples but require substantially more reasoning about types and program state.

Recommended stopping point: keep the current language subset, finish documentation and rehearsal, and fix concrete bugs. The existing scope demonstrates parsing, symbol tables, static semantics, and type checking in a language-design course.
