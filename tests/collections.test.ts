import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { check } from '../src/index.js';
import { parseTypeAnnotation } from '../src/annotations.js';

const codes = (source: string, mode: 'strict' | 'permissive' = 'strict') =>
  check(source, { mode }).diagnostics.map((d) => d.code);
const typeOf = (source: string, name: string) =>
  check(source).symbols.find((s) => s.name === name)?.type;

describe('arrays and object shapes', () => {
  it('infers nested collections, shorthand, literal keys, and member reads', () => {
    const result = check(
      'const name = "Amo"; const user = { name, scores: [2, 4], active: true }; const score = user.scores[0]; const label = user["name"]; const n = user.scores.length;',
    );
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.analysisComplete, true);
    assert.equal(result.symbols.find((s) => s.name === 'score')?.type, 'number');
    assert.equal(result.symbols.find((s) => s.name === 'label')?.type, 'string');
    assert.equal(result.symbols.find((s) => s.name === 'n')?.type, 'number');
    assert.equal(typeOf('const a = [[1], [2]];', 'a'), 'number[][]');
    assert.equal(
      typeOf('const a = { ["x"]: 1, 2: true };', 'a'),
      '{ "2": boolean; "x": number }',
    );
  });
  it('supports type-preserving writes and updates through const bindings', () => {
    assert.deepEqual(
      codes(
        'const a = [1, 2]; a[0] = 3; a[1] += 4; a[0]++; const o = {n: 1}; o.n = 2; o.n++;',
      ),
      [],
    );
    assert.deepEqual(codes('const a = [1]; a = [2];'), ['E203']);
  });
  it('reports array/property write mismatches in both modes', () => {
    for (const mode of ['strict', 'permissive'] as const) {
      assert.deepEqual(codes('const a = [1]; a[0] = "one";', mode), ['E403']);
      assert.deepEqual(codes('const o = {n: 1}; o.n = false;', mode), ['E403']);
    }
  });
  it('invalidates incompatible writes through aliases and preserves initial type', () => {
    const result = check('const a = {n: 1}; const b = a; b.n = "one"; const n = a.n;');
    assert.equal(result.symbols.find((s) => s.name === 'n')?.type, 'unknown');
    assert.equal(result.symbols.find((s) => s.name === 'a')?.initialType, '{ "n": number }');
    assert.equal(result.analysisComplete, false);
  });
  it('does not invent prototype properties, and keeps special own keys safe', () => {
    assert.deepEqual(codes('const o = {}; const x = o.toString;'), ['E400']);
    assert.deepEqual(
      codes('const o = {constructor: 1, hasOwnProperty: true}; const x = o.constructor;'),
      [],
    );
  });
  it('reports missing properties, primitive access, and invalid indices', () => {
    assert.ok(codes('const o = {n: 1}; const x = o.missing;').includes('E400'));
    assert.ok(codes('const x = null.a;').includes('E401'));
    for (const index of ['"bad"', 'true', '-1', '1.5'])
      assert.ok(codes(`const a = [1]; const x = a[${index}];`).includes('E402'));
    assert.deepEqual(codes('const a = [1]; const x = a["0"];'), []);
  });
  it('marks empty, mixed, and unknown-element arrays as uncertain', () => {
    for (const source of [
      'const a = [];',
      'const a = [1, "one"];',
      'function f(x) { const a = [x]; }',
    ]) {
      const result = check(source);
      assert.equal(result.analysisComplete, false);
      assert.ok(result.diagnostics.some((d) => d.code === 'I101'));
    }
  });
  it('checks names inside collection literals', () => {
    assert.ok(codes('const a = [missing];').includes('E200'));
    assert.ok(codes('const a = {missing};').includes('E200'));
    assert.ok(codes('const a = {x: a};').includes('E201'));
  });
  it('marks dynamic property names and unknown indices as partial', () => {
    assert.equal(
      check('const o = {n: 1}; const key = "n"; const x = o[key];').analysisComplete,
      false,
    );
    assert.equal(
      check('function f(i) { const a = [1]; return a[i]; }').analysisComplete,
      false,
    );
  });
  it('invalidates const collections after skipped control flow and conditional mutation', () => {
    assert.equal(
      typeOf('const o = {n: 1}; if (true) { o.n = "one"; } const x = o;', 'x'),
      'unknown',
    );
    assert.equal(
      typeOf('const a = [1]; false && (a[0] = "one"); const x = a;', 'x'),
      'unknown',
    );
  });
  it('does not mutate collections while analyzing function declarations', () => {
    const result = check('const o = {n: 1}; function f() { o.n = "one"; } const x = o.n;');
    assert.equal(result.symbols.find((s) => s.name === 'x')?.type, 'number');
    assert.equal(result.analysisComplete, false);
    assert.equal(
      check('const o = {n: 1}; function f() { return o.n; }').analysisComplete,
      false,
    );
  });
  it('avoids recursive function types inside collections', () => {
    for (const value of ['[f]', '{f}']) {
      const result = check(`function f() { return ${value}; }`);
      assert.equal(result.analysisComplete, false);
      assert.doesNotThrow(() => JSON.stringify(result));
    }
  });
  it('reports unsupported collection features as partial', () => {
    for (const source of [
      'const a = [1,,2];',
      'const a = [...[1]];',
      'const a = {...{x:1}};',
      'const a = {get x() {return 1;}};',
      'const a = {__proto__: null};',
      'const a = [1]; a.length = 0;',
      'const a = {}; a.self = a;',
    ]) {
      const result = check(source);
      assert.equal(result.analysisComplete, false);
      assert.ok(result.diagnostics.some((d) => d.code === 'I100'));
    }
  });
  it('warns on whole-collection type changes only in strict mode', () => {
    assert.deepEqual(codes('let a = [1]; a = ["x"];'), ['W100']);
    assert.deepEqual(codes('let a = [1]; a = ["x"];', 'permissive'), []);
  });
  it('preserves aliases for every object in an array, including replacements', () => {
    const result = check(
      'const a = {n: 1}; const b = {n: 2}; const rows = [a, b]; rows[1].n = "bad"; const first = a.n; const second = b.n;',
    );
    assert.equal(result.symbols.find((s) => s.name === 'first')?.type, 'number');
    assert.equal(result.symbols.find((s) => s.name === 'second')?.type, 'unknown');
    assert.equal(result.symbols.find((s) => s.name === 'rows')?.type, 'unknown[]');
    const replacement = check(
      'const old = {n: 1}; const next = {n: 2}; const rows = [old]; rows[0] = next; next.n = "bad"; const after = rows[0].n; const before = old.n;',
    );
    assert.equal(replacement.symbols.find((s) => s.name === 'after')?.type, 'unknown');
    assert.equal(replacement.symbols.find((s) => s.name === 'before')?.type, 'number');
  });
  it('keeps dynamic references into arrays of collections uncertain', () => {
    const result = check(
      'const a = {n: 1}; const rows = [a]; const i = 0; rows[i].n = "bad"; const x = a;',
    );
    assert.equal(result.analysisComplete, false);
    assert.equal(result.symbols.find((s) => s.name === 'x')?.type, 'unknown');
  });
  it('does not widen every array element after replacing one object', () => {
    const result = check('const a = [{n: 1}, {n: 2}]; a[1] = {n: 2, extra: true};');
    assert.ok(result.diagnostics.some((d) => d.code === 'E403'));
  });
  it('invalidates collections after unmodeled writes, deletion, and methods', () => {
    for (const operation of ['a.length = 0;', 'a.push("x");', 'delete a[0];']) {
      const result = check('const a = [1]; ' + operation + ' const x = a;');
      assert.equal(result.analysisComplete, false);
      assert.equal(result.symbols.find((s) => s.name === 'x')?.type, 'unknown');
    }
    assert.equal(
      typeOf('const a = {n: 1}; const key = "n"; a[key] = "x"; const x = a;', 'x'),
      'unknown',
    );
  });
  it('retains exact source ranges for collection errors', () => {
    const source = 'const o = {n: 1};\no.n = "bad";';
    const error = check(source).diagnostics[0]!;
    assert.equal(error.code, 'E403');
    assert.equal(error.range.start.line, 2);
    assert.equal(
      source.slice(error.range.start.offset, error.range.end.offset),
      'o.n = "bad"',
    );
  });
});

describe('structural JSDoc contracts', () => {
  it('parses nested array and record annotations', () => {
    assert.ok(parseTypeAnnotation('Array<{name: string, scores: number[]}>'));
    for (const source of [
      'number|string',
      'Array<>',
      '{n: number',
      '{n?: number}',
      '{n: number, n: string}',
      'number[]oops',
    ])
      assert.equal(parseTypeAnnotation(source), undefined, source);
  });
  it('checks annotated arrays and records, including extra actual properties', () => {
    const source =
      '/** @param {{scores: number[], name: string}} user @returns {number} */ function first(user) { return user.scores[0]; } first({scores: [1,2], name: "Amo", active: true});';
    assert.deepEqual(codes(source), []);
    assert.deepEqual(codes('/** @param {number[]} a */ function f(a) {} f(["x"]);'), ['E302']);
    assert.deepEqual(codes('/** @param {{n: number}} a */ function f(a) {} f({});'), ['E302']);
  });
  it('checks collection returns and forward calls', () => {
    assert.deepEqual(codes('/** @returns {number[]} */ function f() { return ["x"]; }'), [
      'E303',
    ]);
    assert.deepEqual(
      codes('/** @returns {{n: number}} */ function f() { return {n: "x"}; }'),
      ['E303'],
    );
    assert.equal(
      typeOf('const x = f(); /** @returns {number[]} */ function f() { return [1]; }', 'x'),
      'number[]',
    );
  });
  it('keeps nested unknown types uncertain instead of producing a false mismatch', () => {
    const result = check('/** @param {number[]} a */ function f(a) {} f([]);');
    assert.ok(result.diagnostics.some((d) => d.code === 'I101'));
    assert.ok(!result.diagnostics.some((d) => d.code === 'E302'));
  });
});
