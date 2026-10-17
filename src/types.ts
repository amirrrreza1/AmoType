/** A deliberately small structural type model. */
export type PrimitiveType = 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'unknown';

export interface FunctionParameter {
  name: string;
  type: Type;
}

export interface FunctionType {
  kind: 'function';
  parameters: FunctionParameter[];
  returnType: Type;
}

export interface ArrayType {
  kind: 'array';
  elementType: Type;
  /** Literal members retain references so nested writes also affect their aliases. */
  elements?: Type[];
}

export interface ObjectType {
  kind: 'object';
  properties: Record<string, Type>;
}

export type Type = PrimitiveType | FunctionType | ArrayType | ObjectType;

// presentation:start:typeName
export function typeName(type: Type): string {
  if (typeof type === 'string') return type;
  if (type.kind === 'array') return `${typeName(arrayElementType(type))}[]`;
  if (type.kind === 'object') {
    const properties = Object.entries(type.properties)
      .map(([name, value]) => `${JSON.stringify(name)}: ${typeName(value)}`)
      .join('; ');
    return `{ ${properties} }`;
  }

  const parameters = type.parameters
    .map((parameter) => `${parameter.name}: ${typeName(parameter.type)}`)
    .join(', ');

  return `(${parameters}) => ${typeName(type.returnType)}`;
}
// presentation:end:typeName

export function isFunctionType(type: Type): type is FunctionType {
  return typeof type === 'object' && type.kind === 'function';
}

export function isPrimitiveType(name: string): name is PrimitiveType {
  return ['number', 'string', 'boolean', 'null', 'undefined', 'unknown'].includes(name);
}

export function sameType(left: Type, right: Type): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'array' && right.kind === 'array')
    return sameType(arrayElementType(left), arrayElementType(right));
  if (left.kind === 'object' && right.kind === 'object') {
    return (
      Object.keys(left.properties).length === Object.keys(right.properties).length &&
      Object.entries(left.properties).every(
        ([key, value]) =>
          Object.hasOwn(right.properties, key) && sameType(value, right.properties[key]!),
      )
    );
  }
  if (left.kind !== 'function' || right.kind !== 'function') return false;
  return (
    left.parameters.length === right.parameters.length &&
    left.parameters.every((parameter, index) =>
      sameType(parameter.type, right.parameters[index]!.type),
    ) &&
    sameType(left.returnType, right.returnType)
  );
}

export function isCollectionType(type: Type): type is ArrayType | ObjectType {
  return typeof type === 'object' && type.kind !== 'function';
}

/** Recompute the common type after writes through references to literal members. */
export function arrayElementType(type: ArrayType): Type {
  if (!type.elements?.length) return type.elementType;
  const first = type.elements[0]!;
  return type.elements.every((element) => sameType(first, element)) ? first : 'unknown';
}

export function hasUnknown(type: Type): boolean {
  if (typeof type === 'string') return type === 'unknown';
  if (type.kind === 'array') return hasUnknown(arrayElementType(type));
  if (type.kind === 'object') return Object.values(type.properties).some(hasUnknown);
  return false;
}

/** Unknown inside a collection is uncertainty, never evidence of a mismatch. */
export function compatibleType(expected: Type, actual: Type): boolean {
  if (expected === 'unknown' || actual === 'unknown') return true;
  if (typeof expected === 'string' || typeof actual === 'string') return expected === actual;
  if (expected.kind === 'array' && actual.kind === 'array')
    return compatibleType(arrayElementType(expected), arrayElementType(actual));
  if (expected.kind === 'object' && actual.kind === 'object')
    return Object.entries(expected.properties).every(
      ([key, value]) =>
        Object.hasOwn(actual.properties, key) &&
        compatibleType(value, actual.properties[key]!),
    );
  return sameType(expected, actual);
}
