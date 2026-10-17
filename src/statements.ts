import type { Comment } from 'acorn';
import type { FunctionDeclaration, Node, Statement, ModuleDeclaration } from 'estree';
import { readFunctionAnnotations } from './annotations.js';
import type { AnalysisContext } from './context.js';
import { inferExpressionType } from './expressions.js';
import type { Scope } from './scope.js';
import {
  compatibleType,
  hasUnknown,
  isFunctionType,
  sameType,
  typeName,
  type FunctionType,
  type Type,
} from './types.js';
import { invalidateCollections } from './collections.js';

interface FunctionFrame {
  declaredReturn?: Type;
  returnTypes: Type[];
}

interface StatementEnvironment {
  source: string;
  comments: Comment[];
  frame?: FunctionFrame;
}

function supportedFunction(node: FunctionDeclaration): boolean {
  return (
    !node.async &&
    !node.generator &&
    node.params.every((parameter) => parameter.type === 'Identifier')
  );
}

function declareStatements(
  context: AnalysisContext,
  scope: Scope,
  statements: (Statement | ModuleDeclaration)[],
  environment: StatementEnvironment,
): void {
  for (const statement of statements) {
    if (statement.type === 'VariableDeclaration') {
      if (statement.kind !== 'let' && statement.kind !== 'const') continue;
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier') continue;
        scope.declare(declaration.id.name, statement.kind, 'unknown', declaration.id);
      }
    }
    if (statement.type === 'FunctionDeclaration' && statement.id) {
      const annotations = readFunctionAnnotations(
        statement,
        environment.source,
        environment.comments,
      );
      const parameters = statement.params.map((parameter) => ({
        name: parameter.type === 'Identifier' ? parameter.name : '(unsupported)',
        type:
          parameter.type === 'Identifier'
            ? (annotations.parameters.get(parameter.name) ?? 'unknown')
            : ('unknown' as const),
      }));
      const signature: FunctionType = {
        kind: 'function',
        parameters,
        returnType: annotations.returnType ?? 'unknown',
      };
      scope.declare(
        statement.id.name,
        'function',
        supportedFunction(statement) ? signature : 'unknown',
        statement.id,
      );
    }
  }
}

function checkReturnType(
  context: AnalysisContext,
  node: Node,
  expected: Type,
  actual: Type,
): void {
  if (expected === 'unknown') return;
  if (hasUnknown(actual) && compatibleType(expected, actual)) {
    context.uncertain(node, `Cannot verify this return against ${typeName(expected)}.`);
  } else if (!compatibleType(expected, actual)) {
    context.report(node, {
      code: 'E303',
      severity: 'error',
      message: `Return type expects ${typeName(expected)}, received ${typeName(actual)}.`,
      expected: typeName(expected),
      actual: typeName(actual),
      suggestion: 'Return the annotated type or correct the @returns annotation.',
    });
  }
}

function analyzeFunction(
  context: AnalysisContext,
  scope: Scope,
  node: FunctionDeclaration,
  environment: StatementEnvironment,
): void {
  if (!supportedFunction(node) || !node.id) {
    context.unsupported(node, 'Async/generator functions or non-identifier parameters');
    return;
  }
  const annotations = readFunctionAnnotations(node, environment.source, environment.comments);
  for (const annotation of annotations.unsupported) context.unsupported(node, annotation);
  for (const name of annotations.parameters.keys()) {
    if (
      !node.params.some(
        (parameter) => parameter.type === 'Identifier' && parameter.name === name,
      )
    ) {
      context.unsupported(node, `JSDoc parameter "${name}" does not match the signature`);
    }
  }
  const binding = scope.bindings.get(node.id.name);
  if (!binding || !isFunctionType(binding.type)) return;
  const functionScope = context.createScope(
    `function ${node.id.name} · line ${node.loc?.start.line}`,
    scope,
  );
  node.params.forEach((parameter, index) => {
    if (parameter.type !== 'Identifier') return;
    functionScope.declare(
      parameter.name,
      'parameter',
      binding.type !== 'unknown' && isFunctionType(binding.type)
        ? (binding.type.parameters[index]?.type ?? 'unknown')
        : 'unknown',
      parameter,
    );
  });

  const frame: FunctionFrame = { declaredReturn: annotations.returnType, returnTypes: [] };
  const previousFunction = context.functionScope;
  context.functionScope = functionScope;
  const unsupportedBefore = context.diagnostics.filter(
    (diagnostic) => diagnostic.code === 'I100',
  ).length;
  const returns = analyzeStatements(context, functionScope, node.body.body, {
    ...environment,
    frame,
  });
  context.functionScope = previousFunction;
  if (!returns) frame.returnTypes.push('undefined');
  if (annotations.returnType && !returns)
    checkReturnType(context, node.body, annotations.returnType, 'undefined');
  const inferred = frame.returnTypes[0] ?? 'undefined';
  const consistent = frame.returnTypes.every((type) => sameType(type, inferred));
  const unsupportedAfter = context.diagnostics.filter(
    (diagnostic) => diagnostic.code === 'I100',
  ).length;
  const returnType =
    consistent && unsupportedBefore === unsupportedAfter ? inferred : 'unknown';
  if (returnType === 'unknown' && !annotations.returnType)
    context.uncertain(node, `Cannot infer the return type of "${node.id.name}".`);
  binding.type.returnType = annotations.returnType ?? returnType;
  context.explain(
    node,
    'Function signature',
    `Infer the signature of ${node.id.name}.`,
    binding.type,
  );
}

/** Returns true when a reached, unconditional return ends this block. */
export function analyzeStatements(
  context: AnalysisContext,
  scope: Scope,
  statements: (Statement | ModuleDeclaration)[],
  environment: StatementEnvironment,
): boolean {
  declareStatements(context, scope, statements, environment);
  for (const statement of statements) {
    switch (statement.type) {
      case 'VariableDeclaration': {
        if (statement.kind !== 'let' && statement.kind !== 'const') {
          context.unsupported(statement, `${statement.kind} declarations`);
          break;
        }
        for (const declaration of statement.declarations) {
          if (declaration.id.type !== 'Identifier') {
            context.unsupported(declaration.id, 'Destructuring declarations');
            continue;
          }
          const binding = scope.bindings.get(declaration.id.name);
          if (!binding) continue;
          const inferred = declaration.init
            ? inferExpressionType(context, scope, declaration.init)
            : 'undefined';
          binding.type = inferred;
          // An uninitialized let has no strict type commitment until its first assignment.
          binding.initialType = declaration.init ? structuredClone(inferred) : 'unknown';
          binding.initialized = true;
          context.explain(
            declaration,
            'Variable declaration',
            `Infer ${binding.name} from its initializer.`,
            inferred,
          );
        }
        break;
      }
      case 'ExpressionStatement':
        inferExpressionType(context, scope, statement.expression);
        break;
      case 'FunctionDeclaration':
        analyzeFunction(context, scope, statement, environment);
        break;
      case 'BlockStatement': {
        const child = context.createScope(`block · line ${statement.loc?.start.line}`, scope);
        if (analyzeStatements(context, child, statement.body, environment)) return true;
        break;
      }
      case 'ReturnStatement': {
        if (!environment.frame) {
          context.unsupported(statement, 'Return outside a function');
          break;
        }
        let actual = statement.argument
          ? inferExpressionType(context, scope, statement.argument)
          : 'undefined';
        if (isFunctionType(actual)) {
          context.unsupported(statement, 'Returning function values');
          actual = 'unknown';
        }
        environment.frame.returnTypes.push(actual);
        if (environment.frame.declaredReturn)
          checkReturnType(
            context,
            statement.argument ?? statement,
            environment.frame.declaredReturn,
            actual,
          );
        context.explain(
          statement,
          'Return',
          `The return expression has type ${typeName(actual)}.`,
          actual,
        );
        return true;
      }
      case 'EmptyStatement':
        break;
      default:
        context.unsupported(statement);
        invalidateCollections(context);
        // Skipped control flow might change any visible mutable binding.
        for (let visible: Scope | undefined = scope; visible; visible = visible.parent) {
          for (const binding of visible.bindings.values()) {
            if (context.functionScope && !binding.scope.contains(context.functionScope))
              continue;
            if (binding.kind === 'let' || binding.kind === 'parameter')
              binding.type = 'unknown';
          }
        }
    }
  }
  return false;
}
