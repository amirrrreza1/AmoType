import type {
  Expression,
  Node,
  Literal,
  BinaryExpression,
  UnaryExpression,
  LogicalExpression,
  AssignmentExpression,
  UpdateExpression,
  SimpleCallExpression,
} from 'estree';
import type { AnalysisContext } from './context.js';
import type { Scope } from './scope.js';
import { readVariable, writeVariable } from './bindings.js';
import { inferBinaryOperator, supportedBinaryOperator } from './operators.js';
import { isFunctionType, sameType, typeName, type Type } from './types.js';

function checkKnownOperands(
  context: AnalysisContext,
  node: Node,
  left: Type,
  right?: Type,
): void {
  if (left === 'unknown' || right === 'unknown') {
    context.uncertain(
      node,
      'An operand has unknown type, so this operation cannot be fully verified.',
    );
  }
}

/** Dispatch by AST node kind; each handler implements one small checking rule. */
export function inferExpressionType(
  context: AnalysisContext,
  scope: Scope,
  node: Expression,
): Type {
  switch (node.type) {
    case 'Literal':
      return inferLiteral(context, node);
    case 'Identifier':
      return readVariable(context, scope, node);
    case 'BinaryExpression':
      return inferBinaryExpression(context, scope, node);
    case 'UnaryExpression':
      return inferUnaryExpression(context, scope, node);
    case 'LogicalExpression':
      return inferLogicalExpression(context, scope, node);
    case 'AssignmentExpression':
      return inferAssignmentExpression(context, scope, node);
    case 'UpdateExpression':
      return inferUpdateExpression(context, scope, node);
    case 'CallExpression':
      return inferCallExpression(context, scope, node);
    default:
      context.unsupported(node);
      return 'unknown';
  }
}

function inferLiteral(context: AnalysisContext, node: Literal): Type {
  if ('regex' in node || 'bigint' in node) {
    context.unsupported(node, 'Regular-expression or bigint literal');
    return 'unknown';
  }
  const type = node.value === null ? 'null' : typeof node.value;
  const inferred =
    type === 'number' || type === 'string' || type === 'boolean' || type === 'null'
      ? type
      : 'unknown';
  context.explain(node, 'Literal', `A ${inferred} literal has type ${inferred}.`, inferred);
  return inferred;
}

function inferBinaryExpression(
  context: AnalysisContext,
  scope: Scope,
  node: BinaryExpression,
): Type {
  if (!supportedBinaryOperator(node.operator) || node.left.type === 'PrivateIdentifier') {
    context.unsupported(node, `Operator ${node.operator}`);
    return 'unknown';
  }
  const left = inferExpressionType(context, scope, node.left);
  const right = inferExpressionType(context, scope, node.right);
  checkKnownOperands(context, node, left, right);
  const result = inferBinaryOperator(node.operator, left, right);
  if (result.type === 'unknown' && left !== 'unknown' && right !== 'unknown') {
    context.uncertain(node, 'This operand combination does not have a modeled result type.');
  }
  if (result.warning)
    context.coercion(node, result.warning, `${typeName(left)}, ${typeName(right)}`);
  context.explain(
    node,
    'Binary operator',
    `${typeName(left)} ${node.operator} ${typeName(right)} -> ${typeName(result.type)}.`,
    result.type,
  );
  return result.type;
}

function inferUnaryExpression(
  context: AnalysisContext,
  scope: Scope,
  node: UnaryExpression,
): Type {
  if (!['!', '+', '-', '~', 'typeof', 'void'].includes(node.operator)) {
    context.unsupported(node, `Unary operator ${node.operator}`);
    return 'unknown';
  }
  // typeof an unresolved identifier is valid JavaScript and produces "undefined".
  if (
    node.operator === 'typeof' &&
    node.argument.type === 'Identifier' &&
    !scope.resolveVariable(node.argument.name)
  )
    return 'string';
  const argument = inferExpressionType(context, scope, node.argument);
  checkKnownOperands(context, node, argument);
  if (node.operator === 'typeof') return 'string';
  if (node.operator === 'void') return 'undefined';
  if (node.operator === '!') return 'boolean';
  if (argument === 'unknown') return 'unknown';
  if (argument !== 'number')
    context.coercion(
      node,
      `Unary ${node.operator} expects a number in strict mode.`,
      typeName(argument),
    );
  return 'number';
}

function inferLogicalExpression(
  context: AnalysisContext,
  scope: Scope,
  node: LogicalExpression,
): Type {
  const left = inferExpressionType(context, scope, node.left);
  // The right side might not execute. Analyze it without committing its assignments.
  const snapshots = context.scopes
    .flatMap((entry) => [...entry.bindings.values()])
    .map((binding) => ({ binding, type: binding.type, initialType: binding.initialType }));
  const right = inferExpressionType(context, scope, node.right);
  for (const snapshot of snapshots) {
    snapshot.binding.initialType = snapshot.initialType;
    if (!sameType(snapshot.binding.type, snapshot.type)) {
      snapshot.binding.type = 'unknown';
      context.uncertain(
        node,
        `Short-circuit assignment leaves "${snapshot.binding.name}" with an uncertain type.`,
      );
    }
  }
  checkKnownOperands(context, node, left, right);
  if (node.operator === '??' && (left === 'null' || left === 'undefined')) return right;
  if (node.operator === '??' && left !== 'unknown') return left;
  if (sameType(left, right)) return left;
  context.uncertain(
    node,
    'Logical operators return an operand. Different operand types need union-type analysis.',
  );
  return 'unknown';
}

function inferAssignmentExpression(
  context: AnalysisContext,
  scope: Scope,
  node: AssignmentExpression,
): Type {
  if (node.operator === '=') {
    const value = inferExpressionType(context, scope, node.right);
    return writeVariable(context, scope, node.left, value, node.right);
  }
  const operator = node.operator.slice(0, -1);
  if (node.left.type !== 'Identifier' || !supportedBinaryOperator(operator)) {
    context.unsupported(node, `Assignment operator ${node.operator}`);
    return 'unknown';
  }
  const left = readVariable(context, scope, node.left);
  const right = inferExpressionType(context, scope, node.right);
  checkKnownOperands(context, node, left, right);
  const result = inferBinaryOperator(operator, left, right);
  if (result.warning) context.coercion(node, result.warning);
  return writeVariable(context, scope, node.left, result.type, node.right);
}

function inferUpdateExpression(
  context: AnalysisContext,
  scope: Scope,
  node: UpdateExpression,
): Type {
  if (node.argument.type !== 'Identifier') {
    context.unsupported(node);
    return 'unknown';
  }
  const current = readVariable(context, scope, node.argument);
  checkKnownOperands(context, node, current);
  if (current !== 'unknown' && current !== 'number')
    context.coercion(
      node,
      `${node.operator} converts its operand to a number.`,
      typeName(current),
    );
  return writeVariable(
    context,
    scope,
    node.argument,
    current === 'unknown' ? 'unknown' : 'number',
    node,
  );
}

function inferCallExpression(
  context: AnalysisContext,
  scope: Scope,
  node: SimpleCallExpression,
): Type {
  if (
    node.optional ||
    node.callee.type === 'Super' ||
    node.arguments.some((argument) => argument.type === 'SpreadElement')
  ) {
    context.unsupported(node, 'Optional calls, super, or spread arguments');
    return 'unknown';
  }
  const callee = inferExpressionType(context, scope, node.callee);
  const argumentsWithTypes = node.arguments.map((argument) => ({
    node: argument,
    type:
      argument.type === 'SpreadElement'
        ? ('unknown' as const)
        : inferExpressionType(context, scope, argument),
  }));
  if (callee === 'unknown') {
    context.uncertain(
      node,
      'The function signature is unknown, so this call cannot be verified.',
    );
    return 'unknown';
  }
  if (!isFunctionType(callee)) {
    context.report(node.callee, {
      code: 'E300',
      severity: 'error',
      message: `A value of type ${typeName(callee)} is not callable.`,
      expected: 'function',
      actual: typeName(callee),
    });
    return 'unknown';
  }
  if (argumentsWithTypes.length !== callee.parameters.length) {
    context.report(node, {
      code: 'E301',
      severity: 'error',
      message: `Expected ${callee.parameters.length} argument(s), received ${argumentsWithTypes.length}.`,
      suggestion: 'Match the declared function signature. This checker uses exact arity.',
    });
  }
  argumentsWithTypes.forEach((argument, index) => {
    const parameter = callee.parameters[index];
    if (!parameter || parameter.type === 'unknown') return;
    if (argument.type === 'unknown') {
      context.uncertain(
        argument.node,
        `Cannot verify argument "${parameter.name}" against ${parameter.type}.`,
      );
    } else if (!sameType(parameter.type, argument.type)) {
      context.report(argument.node, {
        code: 'E302',
        severity: 'error',
        message: `Argument "${parameter.name}" expects ${parameter.type}, received ${typeName(argument.type)}.`,
        expected: parameter.type,
        actual: typeName(argument.type),
        suggestion: `Pass a ${parameter.type} value or correct the JSDoc signature.`,
      });
    }
  });
  if (callee.returnType === 'unknown')
    context.uncertain(
      node,
      'The return type of this call is unknown. Add @returns or define the function before this call.',
    );
  context.explain(
    node,
    'Function call',
    `Check arguments against ${typeName(callee)}.`,
    callee.returnType,
  );
  return callee.returnType;
}
