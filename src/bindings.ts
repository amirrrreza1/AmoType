import type { Expression, Identifier, Node, Pattern } from 'estree';
import type { AnalysisContext } from './context.js';
import type { Binding, Scope } from './scope.js';
import { sameType, typeName, type Type } from './types.js';

function resolveBinding(
  context: AnalysisContext,
  scope: Scope,
  node: Identifier,
): Binding | undefined {
  const binding = scope.resolveVariable(node.name);
  if (!binding) {
    context.report(node, {
      code: 'E200',
      severity: 'error',
      message: `Cannot resolve the name "${node.name}".`,
      suggestion: 'Declare this name in the current scope or check its spelling.',
    });
    return undefined;
  }
  return binding;
}

export function readVariable(context: AnalysisContext, scope: Scope, node: Identifier): Type {
  const binding = resolveBinding(context, scope, node);
  if (!binding) return 'unknown';

  const captured =
    context.functionScope &&
    !binding.scope.contains(context.functionScope) &&
    binding.kind !== 'builtin' &&
    binding.kind !== 'function';
  if (
    captured &&
    (binding.kind === 'let' || binding.kind === 'parameter' || !binding.initialized)
  ) {
    context.uncertain(
      node,
      `The value of captured binding "${node.name}" depends on when the function is called.`,
    );
    return 'unknown';
  }
  if (!binding.initialized) {
    context.report(node, {
      code: 'E201',
      severity: 'error',
      message: `"${node.name}" is used before its declaration is initialized.`,
      suggestion: 'Initialize the variable before reading it.',
    });
    return 'unknown';
  }
  context.explain(
    node,
    'Scope lookup',
    `Resolve ${node.name} in ${binding.scope.name}.`,
    binding.type,
  );
  return binding.type;
}

export function writeVariable(
  context: AnalysisContext,
  scope: Scope,
  target: Pattern | Expression,
  value: Type,
  sourceNode: Node,
): Type {
  if (target.type !== 'Identifier') {
    context.unsupported(target, 'Assignment to a non-identifier');
    return 'unknown';
  }
  const binding = resolveBinding(context, scope, target);
  if (!binding) return 'unknown';
  if (context.functionScope && !binding.scope.contains(context.functionScope)) {
    context.unsupported(target, 'Assignment to a captured binding');
    return 'unknown';
  }
  if (!binding.initialized) {
    context.report(target, {
      code: 'E201',
      severity: 'error',
      message: `"${target.name}" is assigned before initialization.`,
    });
    return 'unknown';
  }
  if (binding.kind === 'const' || binding.kind === 'builtin') {
    context.report(target, {
      code: 'E203',
      severity: 'error',
      message: `Cannot assign to constant "${target.name}".`,
      suggestion: 'Use a new variable, or declare a mutable binding with let.',
    });
    return binding.type;
  }
  if (binding.kind === 'function') {
    context.unsupported(target, 'Reassignment of a function declaration');
    return 'unknown';
  }
  if (
    context.mode === 'strict' &&
    binding.initialType !== 'unknown' &&
    value !== 'unknown' &&
    !sameType(binding.initialType, value)
  ) {
    context.report(sourceNode, {
      code: 'W100',
      severity: 'warning',
      message: `"${binding.name}" started as ${typeName(binding.initialType)} and is now assigned ${typeName(value)}. JavaScript allows this; strict mode warns about it.`,
      expected: typeName(binding.initialType),
      actual: typeName(value),
      suggestion: 'Keep one type for this variable or introduce another variable.',
    });
  }
  // Follow the actual assignment, even when the educational policy warns about it.
  binding.type = value;
  if (binding.initialType === 'unknown' && value !== 'unknown') binding.initialType = value;
  context.explain(
    sourceNode,
    'Assignment',
    `${binding.name} now has type ${typeName(value)}.`,
    value,
  );
  return value;
}
