import { sameType, type Type } from './types.js';

export interface OperatorResult {
  type: Type;
  warning?: string;
}

const numericOperators = new Set(['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>']);
const comparisonOperators = new Set(['<', '<=', '>', '>=']);

// presentation:start:additionRule
export function inferAddition(left: Type, right: Type): OperatorResult {
  if (left === 'unknown' || right === 'unknown') return { type: 'unknown' };
  if (left === 'number' && right === 'number') return { type: 'number' };
  if (left === 'string' && right === 'string') return { type: 'string' };

  return {
    type: mixedAdditionType(left, right),
    warning: 'Mixed addition relies on JavaScript coercion. Use matching types.',
  };
}
// presentation:end:additionRule

function mixedAdditionType(left: Type, right: Type): Type {
  if (typeof left === 'object' || typeof right === 'object') return 'unknown';
  return left === 'string' || right === 'string' ? 'string' : 'number';
}

export function inferBinaryOperator(
  operator: string,
  left: Type,
  right: Type,
): OperatorResult {
  if (operator === '+') return inferAddition(left, right);
  if (operator === '===' || operator === '!==') return { type: 'boolean' };
  if (operator === '==' || operator === '!=') {
    return {
      type: 'boolean',
      warning: sameType(left, right)
        ? undefined
        : 'Loose equality may coerce its operands. Prefer === or !==.',
    };
  }
  if (numericOperators.has(operator)) {
    if (left === 'unknown' || right === 'unknown') return { type: 'unknown' };
    return {
      type: 'number',
      warning:
        left === 'number' && right === 'number'
          ? undefined
          : `Operator ${operator} expects numbers in strict educational mode.`,
    };
  }
  if (comparisonOperators.has(operator)) {
    return {
      type: 'boolean',
      warning:
        sameType(left, right) && (left === 'number' || left === 'string')
          ? undefined
          : 'Ordering different or unknown types cannot be verified without coercion.',
    };
  }
  return { type: 'unknown' };
}

export function supportedBinaryOperator(operator: string): boolean {
  return (
    operator === '+' ||
    numericOperators.has(operator) ||
    comparisonOperators.has(operator) ||
    ['===', '!==', '==', '!='].includes(operator)
  );
}
