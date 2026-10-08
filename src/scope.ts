import type { Node } from 'estree';
import type { SourceRange } from './diagnostics.js';
import { sourceRange } from './diagnostics.js';
import { typeName, type Type } from './types.js';

export interface Binding {
  name: string;
  kind: 'let' | 'const' | 'function' | 'parameter' | 'builtin';
  type: Type;
  initialType: Type;
  initialized: boolean;
  range: SourceRange;
  scope: Scope;
}

export interface SymbolInfo {
  name: string;
  kind: Binding['kind'];
  type: string;
  initialType: string;
  scope: string;
  range: SourceRange;
}

export class Scope {
  readonly bindings = new Map<string, Binding>();

  constructor(
    readonly name: string,
    readonly parent?: Scope,
  ) {}

  declare(name: string, kind: Binding['kind'], type: Type, node: Node): Binding | undefined {
    if (this.bindings.has(name)) return undefined;
    const binding: Binding = {
      name,
      kind,
      type,
      initialType: type,
      initialized: kind === 'function' || kind === 'parameter' || kind === 'builtin',
      range: sourceRange(node),
      scope: this,
    };
    this.bindings.set(name, binding);
    return binding;
  }

  // presentation:start:resolveVariable
  resolveVariable(name: string): Binding | undefined {
    const localBinding = this.bindings.get(name);
    if (localBinding) return localBinding;

    return this.parent?.resolveVariable(name);
  }
  // presentation:end:resolveVariable

  contains(scope: Scope): boolean {
    return this === scope || (this.parent?.contains(scope) ?? false);
  }

  symbols(): SymbolInfo[] {
    return [...this.bindings.values()]
      .filter((binding) => binding.kind !== 'builtin')
      .map((binding) => ({
        name: binding.name,
        kind: binding.kind,
        type: typeName(binding.type),
        initialType: typeName(binding.initialType),
        scope: this.name,
        range: binding.range,
      }));
  }
}
