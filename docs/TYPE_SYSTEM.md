# AmoType type system and checking policy

The analyzer handles one file under ECMAScript module grammar. It uses Acorn to parse located ESTree nodes, then walks the supported statements and expressions. It does not use TypeScript's type checker and does not execute the input.

## Types and bindings

Primitive types: number, string, boolean, null, undefined, unknown. Array types carry an element type; object types carry required own data properties. Named function types carry parameter types and a return type, including collections. Type names are structural descriptions, such as `(total: number) => number`.

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
| E400       | Missing own property on a fixed object shape       | Error                |
| E401       | Property access on a modeled non-collection value  | Error                |
| E402       | Invalid array index in this model                  | Error                |
| E403       | Incompatible element/property assignment           | Error                |
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
- Assignments: `=`, modeled numeric compound assignments, and identifier `++/--`. Type-preserving element/property assignments and updates are supported. Logical assignment is unsupported.

## Arrays and objects

- Infer homogeneous literals as `number[]`, `string[]`, nested arrays, or arrays of matching object shapes. Empty, heterogeneous, or unknown-element arrays become `unknown[]` with I101; unions and contextual typing are not implemented.
- Infer plain object literals structurally, including shorthand and literal string/number keys. Duplicate data keys use the last initializer. Own properties are stored without inheriting JavaScript prototype names. Display names quote property keys, for example `{ "name": string; "scores": number[] }`.
- Read `items[0]`, numeric indices, canonical numeric string indices, `items.length`, `user.name`, and `user["name"]`. Dynamic object keys are uncertain (I101). Known invalid array indices produce E402. Array methods, holes, spread, accessors, object methods, prototype setters, and optional access are outside this subset (I100).
- Array indexing describes the element type; bounds, holes introduced by writes, and runtime integer values of nonliteral numeric indices are not proven. A read can still be undefined at runtime. The model does not track array lengths or tuples.
- Check simple, compound, and update assignments to members. A const binding protects its reference; its members may be updated. Writes must preserve the inferred element type or exact nested object shape. A mismatched write produces E403 in both modes and invalidates the shared member type so aliases do not retain a verified stale type. Unknown writes stay uncertain. Adding properties and writing array length are unsupported.
- Function contracts check array elements recursively and require every annotated object property with a compatible type. Extra actual object properties are allowed at call/return boundaries; whole-binding type equality and member writes use exact shapes. Unknown nested members cause uncertainty rather than a false mismatch.
- Collection mutation inside functions and captured collection reads are partial: no interprocedural heap/effect model is implemented. Skipped control flow, short-circuit member writes, and unmodeled mutations invalidate visible collection bindings, including const bindings. Literal array members retain references for known literal indices, so nested writes preserve aliases of objects and arrays. Dynamic references into arrays of collections are uncertain. This remains a conservative shape model rather than a precise heap, bounds, or general per-index analysis.

## Functions and JSDoc

Use immediately preceding JSDoc with a primitive type name, `T[]`, `Array<T>`, or a record such as `@param {{name: string, scores: number[]}} user`. The same types work with `@returns`. Array and record types can nest. Record keys in annotations are identifiers and all properties are required; comma or semicolon separators work. Union, optional/default/rest/destructured parameters, function-valued collection members, and other generic annotations are unsupported. Malformed supported tags and parameter names that do not match the signature are reported.

Analyze straightforward function bodies using the declared parameter types. Unknown parameters are not specialized to a particular call. Check each reached return expression against @returns or infer simple known results. No return produces undefined. Unconditional return ends analysis of that block; later unreachable statements are skipped.

Annotated signatures are available for forward calls. An unannotated forward call yields an unknown return, even if the declaration is later analyzed. Branches/loops are unsupported, and skipped function paths invalidate inferred unannotated return types. Captured mutable bindings are uncertain because their values depend on call timing. Writes to captured bindings are unsupported and do not mutate outer state just by analyzing a declaration.

## Completeness and limits

`analysisComplete` means that analysis did not encounter a syntax failure, unsupported construct, or an explicitly uncertain check. It does not mean there are no errors, that the whole JavaScript language is supported, or that the code cannot fail at runtime.

The checker is a conservative educational model with incomplete control-flow and interprocedural analysis. It cannot prove whether numeric values are NaN, whether division is useful, whether recursion terminates, or whether external effects are safe. Skipped control flow invalidates visible mutable types to avoid treating old types as verified current values. Remaining effect and higher-order cases are limitations of the subset.

Strict mode is an optional policy layered on top of that model. Valid JavaScript coercion and type changes remain warnings. Permissive mode suppresses only those policy warnings.
