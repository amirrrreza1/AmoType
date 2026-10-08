/** The first version deliberately models only primitives and named functions. */
export type PrimitiveType = 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'unknown';

export interface FunctionParameter {
  name: string;
  type: PrimitiveType;
}

export interface FunctionType {
  kind: 'function';
  parameters: FunctionParameter[];
  returnType: Type;
}

export type Type = PrimitiveType | FunctionType;

// presentation:start:typeName
export function typeName(type: Type): string {
  if (typeof type === 'string') return type;

  const parameters = type.parameters
    .map((parameter) => `${parameter.name}: ${parameter.type}`)
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
  return (
    left.parameters.length === right.parameters.length &&
    left.parameters.every(
      (parameter, index) => parameter.type === right.parameters[index]?.type,
    ) &&
    sameType(left.returnType, right.returnType)
  );
}
