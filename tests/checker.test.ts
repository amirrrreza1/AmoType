import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  demoPrograms,
  assignmentDemo,
  correctedAssignmentDemo,
} from '../examples/demo-programs.js';
import { check } from '../src/index.js';

const codes = (source: string) =>
  check(source).diagnostics.map((diagnostic) => diagnostic.code);

describe('shared presentation and playground examples', () => {
  for (const example of demoPrograms) {
    it(example.title, () => {
      const result = check(example.source);
      assert.deepEqual(
        result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
        [...example.expectedCodes].sort(),
      );
      assert.equal(result.analysisComplete, example.analysisComplete);
    });
  }
  it('shows the type-change warning and its corrected example', () => {
    assert.deepEqual(codes(assignmentDemo), ['W100']);
    assert.deepEqual(codes(correctedAssignmentDemo), []);
  });
});

describe('primitive inference and operators', () => {
  it('infers every supported primitive and distinguishes initial/current types', () => {
    const result = check(
      'const n = 1; const s = "hi"; const b = true; const nil = null; let u;',
    );
    assert.deepEqual(
      result.symbols.map((symbol) => symbol.type),
      ['number', 'string', 'boolean', 'null', 'undefined'],
    );
    assert.equal(result.analysisComplete, true);
    assert.deepEqual(result.diagnostics, []);
  });
  it('uses the newly assigned type for subsequent operations', () => {
    const result = check('let value = 1; value = "one"; const label = value + "!";');
    assert.deepEqual(
      result.diagnostics.map((entry) => entry.code),
      ['W100'],
    );
    assert.equal(result.symbols[0]?.initialType, 'number');
    assert.equal(result.symbols[0]?.type, 'string');
    assert.equal(result.symbols[1]?.type, 'string');
  });
  it('commits an uninitialized let to its first assigned type', () => {
    assert.deepEqual(codes('let value; value = 1; value = "one";'), ['W100']);
  });
  it('reports coercion and supports explicit conversions', () => {
    assert.deepEqual(codes('const n = "2" * 3;'), ['W101']);
    assert.deepEqual(codes('const n = Number("2") * 3;'), []);
    assert.deepEqual(codes('const s = "Count: " + String(3);'), []);
  });
  it('keeps warnings separate from permissive checking', () => {
    const result = check('let n = 1; n = "one"; const v = "2" * 3;', { mode: 'permissive' });
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.symbols[0]?.type, 'string');
  });
  it('infers equality and unary expression results', () => {
    const result = check(
      'const a = 1 === "1"; const b = !0; const c = typeof absent; const d = void 1;',
    );
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.symbols.map((symbol) => symbol.type),
      ['boolean', 'boolean', 'string', 'undefined'],
    );
  });
  it('reports logical expressions with different operand types as partial', () => {
    const result = check('const x = true && 1;');
    assert.equal(result.analysisComplete, false);
    assert.equal(result.symbols[0]?.type, 'unknown');
  });
  it('does not commit a conditional short-circuit assignment', () => {
    const result = check('let x = 1; false && (x = "text"); const y = x * 2;');
    assert.equal(result.symbols[0]?.type, 'unknown');
    assert.equal(result.analysisComplete, false);
  });
  it('supports compound assignments and update expressions', () => {
    assert.deepEqual(codes('let n = 1; n += 2; n++;'), []);
    assert.deepEqual(codes('const n = 1; n++;'), ['E203']);
  });
});

describe('lexical scope', () => {
  it('resolves shadowed names independently', () => {
    assert.deepEqual(
      codes('const x = "text"; { const x = 1; const y = x * 2; } const z = x + "!";'),
      [],
    );
  });
  it('detects references before initialization, including self-initialization', () => {
    assert.deepEqual(codes('const x = x;'), ['E201']);
    assert.deepEqual(codes('const x = 1; { const y = x; const x = 2; }'), ['E201']);
  });
  it('detects unresolved names and constant reassignment', () => {
    assert.deepEqual(codes('const x = missing;'), ['E200']);
    assert.deepEqual(codes('const x = 1; x = 2;'), ['E203']);
  });
});

describe('function contracts', () => {
  it('checks exact argument count and annotated argument types', () => {
    assert.deepEqual(
      codes('/** @param {number} n @returns {number} */ function f(n) { return n; } f();'),
      ['E301'],
    );
    assert.deepEqual(
      codes('/** @param {number} n @returns {number} */ function f(n) { return n; } f("hi");'),
      ['E302'],
    );
  });
  it('infers a literal return type and implicit undefined', () => {
    const result = check(
      'function f() { return 1; } function g() {} const a = f(); const b = g();',
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.symbols.find((symbol) => symbol.name === 'a')?.type, 'number');
    assert.equal(result.symbols.find((symbol) => symbol.name === 'b')?.type, 'undefined');
  });
  it('detects a missing or incorrect annotated return', () => {
    assert.deepEqual(codes('/** @returns {number} */ function f() {}'), ['E303']);
    assert.deepEqual(codes('/** @returns {number} */ function f() { return "hi"; }'), [
      'E303',
    ]);
  });
  it('does not guess the type of an unannotated parameter', () => {
    const result = check('function f(x) { return x * 2; } f(1);');
    assert.equal(result.analysisComplete, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'I101'));
  });
  it('supports hoisted calls with explicit return annotations', () => {
    assert.deepEqual(
      codes('const x = f(); /** @returns {number} */ function f() { return 1; }'),
      [],
    );
  });
  it('marks unannotated forward-call returns as unknown', () => {
    const result = check('const x = f(); function f() { return 1; }');
    assert.equal(result.analysisComplete, false);
    assert.equal(result.symbols.find((symbol) => symbol.name === 'x')?.type, 'unknown');
  });
  it('rejects calling a primitive', () => {
    assert.deepEqual(codes('const x = 1; x();'), ['E300']);
  });
  it('does not change outer bindings just by analyzing a function body', () => {
    const result = check('let x = 1; function f() { x = "text"; } const y = x;');
    assert.equal(result.symbols.find((symbol) => symbol.name === 'x')?.type, 'number');
    assert.equal(result.analysisComplete, false);
  });
  it('marks captured mutable reads as unknown across calls', () => {
    const result = check('let x = 1; function f() { return x; }');
    assert.equal(result.analysisComplete, false);
  });
  it('ignores unreachable expressions after an unconditional return', () => {
    assert.deepEqual(codes('function f() { return 1; missing(); }'), []);
  });
  it('marks returned functions as unsupported instead of creating cyclic types', () => {
    const result = check('function f() { return f; }');
    assert.equal(result.analysisComplete, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'I100'));
  });
  it('compares function types independently of parameter names', () => {
    const result = check(
      '/** @param {number} x @returns {number} */ function f(x) { return x; } /** @param {number} y @returns {number} */ function g(y) { return y; } let fn = f; fn = g;',
    );
    assert.deepEqual(result.diagnostics, []);
  });
  it('does not silently accept unsupported or malformed annotations', () => {
    assert.ok(codes('/** @param {number[]} x */ function f(x) {}').includes('I100'));
    assert.ok(codes('/** @param number x */ function f(x) {}').includes('I100'));
  });
});

describe('partial analysis and source locations', () => {
  for (const source of [
    'const x = [1];',
    'const x = { a: 1 };',
    'const x = () => 1;',
    'while (true) {}',
    'var x = 1;',
    'import x from "x";',
  ]) {
    it(`marks unsupported syntax: ${source}`, () => {
      const result = check(source);
      assert.equal(result.analysisComplete, false);
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'I100'));
    });
  }
  it('reports one-based positions and exact UTF-16 ranges', () => {
    const source = 'let age = 20;\r\nage = "twenty";';
    const diagnostic = check(source).diagnostics[0]!;
    assert.equal(diagnostic.range.start.line, 2);
    assert.equal(diagnostic.range.start.column, 7);
    assert.equal(
      source.slice(diagnostic.range.start.offset, diagnostic.range.end.offset),
      '"twenty"',
    );
  });
  it('returns a syntax diagnostic instead of throwing on invalid input', () => {
    const result = check('const =');
    assert.equal(result.diagnostics[0]?.code, 'E100');
    assert.equal(result.analysisComplete, false);
  });
  it('does not infer stale mutable types after skipped control flow', () => {
    const result = check('let x = 1; if (true) { x = "text"; } const y = x * 2;');
    assert.equal(result.symbols.find((symbol) => symbol.name === 'y')?.type, 'unknown');
    assert.equal(result.analysisComplete, false);
  });
  it('does not infer a complete return type from a function with skipped paths', () => {
    const result = check(
      'function f() { if (true) { return "text"; } return 1; } const x = f();',
    );
    assert.equal(result.symbols.find((symbol) => symbol.name === 'x')?.type, 'unknown');
    assert.equal(result.analysisComplete, false);
  });
  it('treats empty source as a complete check', () => {
    assert.deepEqual(check('').diagnostics, []);
    assert.equal(check('').analysisComplete, true);
  });
  it('never executes submitted source', () => {
    const result = check('throw new Error("This must not execute");');
    assert.equal(result.analysisComplete, false);
    assert.equal(result.diagnostics[0]?.code, 'I100');
  });
});
