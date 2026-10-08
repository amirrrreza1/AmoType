import type { Node } from 'estree';
import { sourceRange, type Diagnostic, type TraceStep } from './diagnostics.js';
import { Scope } from './scope.js';
import { typeName, type Type } from './types.js';

export interface CheckOptions {
  /** Strict adds educational warnings about changing types and implicit coercion. */
  mode?: 'strict' | 'permissive';
}

export class AnalysisContext {
  readonly diagnostics: Diagnostic[] = [];
  readonly trace: TraceStep[] = [];
  readonly scopes: Scope[] = [];
  analysisComplete = true;
  functionScope?: Scope;

  constructor(readonly mode: 'strict' | 'permissive') {}

  createScope(name: string, parent?: Scope): Scope {
    const scope = new Scope(name, parent);
    this.scopes.push(scope);
    return scope;
  }

  report(node: Node, details: Omit<Diagnostic, 'range'>): void {
    this.diagnostics.push({ ...details, range: sourceRange(node) });
  }

  unsupported(node: Node, feature: string = node.type): void {
    this.analysisComplete = false;
    this.report(node, {
      code: 'I100',
      severity: 'info',
      message: `${feature} is outside the supported JavaScript subset.`,
      suggestion: 'Use a supported example or simplify this syntax. Analysis is partial.',
    });
  }

  uncertain(node: Node, message: string): void {
    this.analysisComplete = false;
    this.report(node, {
      code: 'I101',
      severity: 'info',
      message,
      suggestion: 'Add primitive JSDoc annotations or simplify the expression.',
    });
  }

  explain(node: Node, rule: string, explanation: string, type?: Type): void {
    this.trace.push({
      rule,
      explanation,
      range: sourceRange(node),
      inferredType: type === undefined ? undefined : typeName(type),
    });
  }

  coercion(node: Node, message: string, actual?: string): void {
    if (this.mode === 'strict') {
      this.report(node, {
        code: 'W101',
        severity: 'warning',
        message,
        actual,
        suggestion: 'Use matching types or convert the value explicitly.',
      });
    }
  }
}
