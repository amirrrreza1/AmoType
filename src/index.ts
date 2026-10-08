import { AnalysisContext, type CheckOptions } from './context.js';
import type { Diagnostic, TraceStep } from './diagnostics.js';
import { parseSource } from './parser.js';
import type { SymbolInfo } from './scope.js';
import { analyzeStatements } from './statements.js';
import type { FunctionType } from './types.js';

export type { CheckOptions } from './context.js';
export type {
  Diagnostic,
  Severity,
  SourceRange,
  SourcePosition,
  TraceStep,
} from './diagnostics.js';
export type { SymbolInfo } from './scope.js';
export type { Type, PrimitiveType, FunctionType } from './types.js';
export { typeName } from './types.js';

export interface CheckResult {
  diagnostics: Diagnostic[];
  analysisComplete: boolean;
  symbols: SymbolInfo[];
  trace: TraceStep[];
}

/** Parse and analyze source text. Submitted JavaScript is never executed. */
export function check(source: string, options: CheckOptions = {}): CheckResult {
  const parsed = parseSource(source);
  if (!parsed.success) {
    return {
      diagnostics: [parsed.diagnostic],
      analysisComplete: false,
      symbols: [],
      trace: [],
    };
  }
  const context = new AnalysisContext(options.mode ?? 'strict');
  const builtins = context.createScope('built-ins');
  const globalScope = context.createScope('global', builtins);

  for (const [name, type] of Object.entries({
    undefined: 'undefined',
    NaN: 'number',
    Infinity: 'number',
  } as const)) {
    builtins.declare(name, 'builtin', type, parsed.program);
  }
  for (const [name, parameter, returnType] of [
    ['Number', 'unknown', 'number'],
    ['String', 'unknown', 'string'],
    ['Boolean', 'unknown', 'boolean'],
    ['parseFloat', 'string', 'number'],
  ] as const) {
    const signature: FunctionType = {
      kind: 'function',
      parameters: [{ name: 'value', type: parameter }],
      returnType,
    };
    builtins.declare(name, 'builtin', signature, parsed.program);
  }
  analyzeStatements(context, globalScope, parsed.program.body, {
    source,
    comments: parsed.comments,
  });
  context.diagnostics.sort(
    (left, right) => left.range.start.offset - right.range.start.offset,
  );
  return {
    diagnostics: context.diagnostics,
    analysisComplete: context.analysisComplete,
    symbols: context.scopes.flatMap((scope) => scope.symbols()),
    trace: context.trace,
  };
}
