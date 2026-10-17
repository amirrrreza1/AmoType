import type { ArrayExpression, ObjectExpression, MemberExpression, Node } from 'estree';
import type { AnalysisContext } from './context.js';
import type { Scope } from './scope.js';
import { inferExpressionType } from './expressions.js';
import {
  arrayElementType,
  compatibleType,
  hasUnknown,
  isCollectionType,
  isFunctionType,
  sameType,
  typeName,
  type Type,
} from './types.js';

export function inferArray(
  context: AnalysisContext,
  scope: Scope,
  node: ArrayExpression,
): Type {
  const types: Type[] = [];
  let unsupported = false;
  for (const element of node.elements) {
    if (!element || element.type === 'SpreadElement') {
      context.unsupported(element ?? node, 'Array holes or spread');
      if (element) inferExpressionType(context, scope, element.argument);
      unsupported = true;
      continue;
    }
    const type = inferExpressionType(context, scope, element);
    if (isFunctionType(type)) {
      context.unsupported(element, 'Function values inside collections');
      unsupported = true;
    }
    types.push(type);
  }
  if (unsupported) return 'unknown';
  const first = types[0] ?? 'unknown';
  const elementType = types.every((type) => sameType(type, first)) ? first : 'unknown';
  if (hasUnknown(elementType))
    context.uncertain(
      node,
      'An empty, heterogeneous, or unknown-element array has no single verified element type.',
    );
  const result: Type = { kind: 'array', elementType, elements: types };
  context.explain(
    node,
    'Array literal',
    `Infer ${typeName(result)} from the elements.`,
    result,
  );
  return result;
}

export function inferObject(
  context: AnalysisContext,
  scope: Scope,
  node: ObjectExpression,
): Type {
  const properties: Record<string, Type> = Object.create(null);
  let unsupported = false;
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') {
      context.unsupported(property, 'Object spread');
      inferExpressionType(context, scope, property.argument);
      unsupported = true;
      continue;
    }
    const key =
      !property.computed && property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal' &&
            (typeof property.key.value === 'string' || typeof property.key.value === 'number')
          ? String(property.key.value)
          : undefined;
    if (property.computed && property.key.type !== 'Literal')
      inferExpressionType(context, scope, property.key);
    if (
      key === undefined ||
      property.kind !== 'init' ||
      property.method ||
      key === '__proto__'
    ) {
      context.unsupported(property, 'Dynamic keys, accessors, methods, or prototype setters');
      unsupported = true;
    }
    if (
      property.value.type === 'AssignmentPattern' ||
      property.value.type === 'ArrayPattern' ||
      property.value.type === 'ObjectPattern' ||
      property.value.type === 'RestElement'
    ) {
      context.unsupported(property);
      unsupported = true;
      continue;
    }
    const type = inferExpressionType(context, scope, property.value);
    if (isFunctionType(type)) {
      context.unsupported(property, 'Function values inside collections');
      unsupported = true;
    }
    if (key !== undefined) properties[key] = type;
  }
  if (unsupported) return 'unknown';
  const result: Type = { kind: 'object', properties };
  context.explain(
    node,
    'Object literal',
    'Infer a fixed shape from own data properties.',
    result,
  );
  return result;
}

interface MemberSlot {
  type: Type;
  set?: (value: Type) => void;
}

export function resolveMember(
  context: AnalysisContext,
  scope: Scope,
  node: MemberExpression,
): MemberSlot {
  if (
    node.object.type === 'Super' ||
    node.property.type === 'PrivateIdentifier' ||
    node.optional
  ) {
    context.unsupported(node, 'Super, private, or optional property access');
    return { type: 'unknown' };
  }
  const object = inferExpressionType(context, scope, node.object);
  const indexType = node.computed
    ? inferExpressionType(context, scope, node.property)
    : undefined;
  const key =
    !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.property.type === 'Literal'
        ? String(node.property.value)
        : undefined;
  if (object === 'unknown') {
    context.uncertain(node, 'Cannot verify property access on an unknown value.');
    return { type: 'unknown' };
  }
  if (!isCollectionType(object)) {
    context.report(node.object, {
      code: 'E401',
      severity: 'error',
      message: `Property access requires an array or object, received ${typeName(object)}.`,
      actual: typeName(object),
    });
    return { type: 'unknown' };
  }
  if (object.kind === 'array') {
    if (key === 'length') return { type: 'number' };
    if (
      key &&
      [
        'push',
        'pop',
        'shift',
        'unshift',
        'splice',
        'sort',
        'reverse',
        'map',
        'filter',
        'reduce',
        'forEach',
        'slice',
        'concat',
        'join',
        'includes',
        'indexOf',
        'find',
      ].includes(key)
    ) {
      context.unsupported(node, 'Array methods');
      invalidateCollections(context);
      return { type: 'unknown' };
    }
    const numericKey = key !== undefined && /^(0|[1-9]\d*)$/.test(key);
    if (indexType === 'unknown') {
      context.uncertain(node.property, 'Cannot verify an array index of unknown type.');
      return { type: 'unknown' };
    }
    const negativeLiteral =
      node.property.type === 'UnaryExpression' &&
      node.property.operator === '-' &&
      node.property.argument.type === 'Literal' &&
      typeof node.property.argument.value === 'number' &&
      node.property.argument.value > 0;
    if (
      negativeLiteral ||
      (numericKey && Number(key) >= 4294967295) ||
      ((!node.computed || indexType !== 'number') && !numericKey) ||
      (node.property.type === 'Literal' &&
        typeof node.property.value === 'number' &&
        (!Number.isInteger(node.property.value) ||
          node.property.value < 0 ||
          node.property.value >= 4294967295))
    ) {
      context.report(node.property, {
        code: 'E402',
        severity: 'error',
        message: 'Use a non-negative integer array index or read .length.',
        expected: 'number',
        actual: indexType ? typeName(indexType) : key,
      });
      return { type: 'unknown' };
    }
    const elementType = arrayElementType(object);
    const literalIndex =
      key !== undefined && numericKey
        ? Number(key)
        : node.property.type === 'Literal' && typeof node.property.value === 'number'
          ? node.property.value
          : undefined;
    if (isCollectionType(elementType) && literalIndex === undefined) {
      context.uncertain(
        node,
        'A dynamic index into nested collections has an uncertain reference.',
      );
      return { type: 'unknown' };
    }
    const withinLiteral =
      literalIndex !== undefined && object.elements && literalIndex < object.elements.length;
    if (object.elements && isCollectionType(elementType) && !withinLiteral) {
      context.uncertain(
        node,
        'This nested collection index does not identify a known literal member.',
      );
      return { type: 'unknown' };
    }
    return {
      type: withinLiteral ? object.elements![literalIndex!]! : elementType,
      set: (value) => {
        object.elementType = value;
        if (object.elements) {
          if (withinLiteral) object.elements[literalIndex!] = value;
          else {
            // Without a known member, preserve primitive shapes but discard references.
            object.elements = undefined;
          }
        }
      },
    };
  }
  if (key === undefined) {
    context.uncertain(node.property, 'Object access needs a statically known property name.');
    return { type: 'unknown' };
  }
  if (!Object.hasOwn(object.properties, key)) {
    context.report(node.property, {
      code: 'E400',
      severity: 'error',
      message: `Property "${key}" does not exist on ${typeName(object)}.`,
      actual: key,
      suggestion:
        'Use a declared own property. Adding properties is outside the fixed-shape model.',
    });
    return { type: 'unknown' };
  }
  return {
    type: object.properties[key]!,
    set: (value) => {
      object.properties[key] = value;
    },
  };
}

export function readMember(
  context: AnalysisContext,
  scope: Scope,
  node: MemberExpression,
): Type {
  const slot = resolveMember(context, scope, node);
  if (slot.set && hasUnknown(slot.type))
    context.uncertain(node, 'This member has an unknown type.');
  context.explain(
    node,
    'Property access',
    `Read a member of type ${typeName(slot.type)}.`,
    slot.type,
  );
  return slot.type;
}

export function writeMember(
  context: AnalysisContext,
  node: Node,
  slot: MemberSlot,
  value: Type,
): Type {
  if (context.functionScope) {
    context.unsupported(node, 'Collection mutation inside a function');
    return 'unknown';
  }
  if (!slot.set) {
    context.unsupported(node, 'Writing an unresolved member or array length');
    invalidateCollections(context);
    return 'unknown';
  }
  if (
    !compatibleType(slot.type, value) ||
    (!hasUnknown(slot.type) && !hasUnknown(value) && !sameType(slot.type, value))
  ) {
    context.report(node, {
      code: 'E403',
      severity: 'error',
      message: `Member expects ${typeName(slot.type)}, received ${typeName(value)}.`,
      expected: typeName(slot.type),
      actual: typeName(value),
      suggestion: 'Keep the inferred element/property type or use another collection.',
    });
    // Invalidate the shared slot, including aliases, instead of retaining a stale type.
    slot.set('unknown');
  } else if (hasUnknown(slot.type) || hasUnknown(value)) {
    context.uncertain(node, 'Cannot fully verify a member assignment with an unknown type.');
    slot.set('unknown');
  } else {
    // Preserve the homogeneous element type / required object shape. New aliases matter.
    slot.set(value);
  }
  context.collectionWrites++;
  context.explain(
    node,
    'Member assignment',
    `Check a member assignment of ${typeName(value)}.`,
    value,
  );
  return value;
}

/** Unknown control flow may mutate even a const collection through an alias. */
export function invalidateCollections(context: AnalysisContext): void {
  for (const scope of context.scopes) {
    for (const binding of scope.bindings.values()) {
      if (context.functionScope && !binding.scope.contains(context.functionScope)) continue;
      if (isCollectionType(binding.type)) binding.type = 'unknown';
    }
  }
}
