# AmoType type system and checking policy

The analyzer handles one file under ECMAScript module grammar. It uses Acorn to parse located ESTree nodes, then walks the supported statements and expressions. It does not use TypeScript's type checker and does not execute the input.

## Types and bindings

Primitive types: number, string, boolean, null, undefined, unknown. Named function types carry a list of primitive parameter types and a return type. Type names are structural descriptions, such as `(total: number) => number`.

Scopes predeclare let/const bindings so shadowing and reads before initialization work correctly. A binding stores its declaration range, kind, initialization state, initial type, and current type. The current type follows assignments; the initial type anchors strict-policy warnings. An uninitialized let has type undefined and commits to its first known assigned type.

| Diagnostic | Meaning                                            | Severity             |
| ---------- | -------------------------------------------------- | -------------------- |
| E100       | Parser syntax error                                | Error                |
| E200       | Unresolved identifier                              | Error                |
| E201       | Read or assignment before lexical initialization   | Error                |
| E203       | Assignment to a const or protected built-in        | Error                |
| E300       | Calling a non-function value                       | Error                |
| E301       | Exact-arity mismatch against the modeled signature | Error                |
| E302       | Argument incompatible with an annotated parameter  | Error                |
| E303       | Return incompatible with an annotated result       | Error                |
| W100       | Changed initial variable type                      | Strict warning       |
| W101       | Implicit coercion or strict operator policy        | Strict warning       |
| I100       | Unsupported syntax or annotation                   | Information; partial |
| I101       | A relevant type or effect cannot be determined     | Information; partial |

Parser rejection covers duplicate lexical declarations as syntax errors.

## Operators

- Addition: number + number -> number; string + string -> string. Other modeled primitive combinations produce JavaScript's number/string result with a strict coercion warning. Function operands have an unknown result.
- Arithmetic `- * / % **` and bitwise `| & ^ << >> >>>`: known operands produce number; non-number operands cause strict warnings. Unknown operands produce unknown.
- Strict equality `=== !==`: boolean. Loose equality `== !=`: boolean with a strict warning for mismatched operands.
- Ordering `< <= > >=`: boolean; matching numbers or strings pass, other combinations get strict warnings.
- Unary `!`: boolean; `typeof`: string; `void`: undefined. Numeric unary `+ - ~`: number when known, with strict warnings for conversion.
- `typeof` an unresolved identifier is allowed, matching JavaScript behavior. A known uninitialized lexical binding still causes E201.
- `&& ||`: return the common operand type when both types match; otherwise unknown. `??`: uses the right type for null/undefined left operands and the left type for known non-nullish operands.
- Logical right-side assignment effects are treated conservatively because the right side might not execute.
- Assignments: `=`, modeled numeric compound assignments, and identifier `++/--`. Property assignment and logical assignment are unsupported.

## Functions and JSDoc

Use immediately preceding JSDoc with `@param {number|string|boolean|null|undefined|unknown} name` and `@returns {primitive}`. Optional/default/rest/destructured parameters and complex annotations are unsupported. Malformed supported tags and parameter names that do not match the signature are reported.

Analyze straightforward function bodies using the declared parameter types. Unknown parameters are not specialized to a particular call. Check each reached return expression against @returns or infer simple known results. No return produces undefined. Unconditional return ends analysis of that block; later unreachable statements are skipped.

Annotated signatures are available for forward calls. An unannotated forward call yields an unknown return, even if the declaration is later analyzed. Branches/loops are unsupported, and skipped function paths invalidate inferred unannotated return types. Captured mutable bindings are uncertain because their values depend on call timing. Writes to captured bindings are unsupported and do not mutate outer state just by analyzing a declaration.

## Completeness and limits

`analysisComplete` means that analysis did not encounter a syntax failure, unsupported construct, or an explicitly uncertain check. It does not mean there are no errors, that the whole JavaScript language is supported, or that the code cannot fail at runtime.

The checker is a conservative educational model with incomplete control-flow and interprocedural analysis. It cannot prove whether numeric values are NaN, whether division is useful, whether recursion terminates, or whether external effects are safe. Skipped control flow invalidates visible mutable types to avoid treating old types as verified current values. Remaining effect and higher-order cases are limitations of the subset.

Strict mode is an optional policy layered on top of that model. Valid JavaScript coercion and type changes remain warnings. Permissive mode suppresses only those policy warnings.
