import type { Comment } from 'acorn';
import type { FunctionDeclaration } from 'estree';
import { isPrimitiveType, type PrimitiveType } from './types.js';

export interface FunctionAnnotations {
  parameters: Map<string, PrimitiveType>;
  returnType?: PrimitiveType;
  unsupported: string[];
}

/** Only an immediately preceding JSDoc block belongs to a function. */
export function readFunctionAnnotations(
  node: FunctionDeclaration,
  source: string,
  comments: Comment[],
): FunctionAnnotations {
  const annotations: FunctionAnnotations = { parameters: new Map(), unsupported: [] };
  const start = node.range?.[0] ?? 0;
  const comment = comments.findLast(
    (candidate) =>
      candidate.type === 'Block' &&
      candidate.value.startsWith('*') &&
      candidate.end <= start &&
      source.slice(candidate.end, start).trim() === '',
  );
  if (!comment) return annotations;

  for (const match of comment.value.matchAll(/@param\s+\{([^}]+)\}\s+(\S+)/g)) {
    const type = match[1]?.trim() ?? '';
    const name = match[2] ?? '';
    if (isPrimitiveType(type) && /^[A-Za-z_$][\w$]*$/.test(name)) {
      annotations.parameters.set(name, type);
    } else {
      annotations.unsupported.push(`@param {${type}} ${name}`);
    }
  }

  const returnMatch = /@returns?\s+\{([^}]+)\}/.exec(comment.value);
  if (returnMatch) {
    const type = returnMatch[1]?.trim() ?? '';
    if (isPrimitiveType(type)) annotations.returnType = type;
    else annotations.unsupported.push(`@returns {${type}}`);
  }

  // Malformed supported tags must not silently become unconstrained parameters.
  const tagCount = [...comment.value.matchAll(/@(?:param|returns?)\b/g)].length;
  const parsedCount =
    [...comment.value.matchAll(/@param\s+\{[^}]+\}\s+\S+/g)].length + (returnMatch ? 1 : 0);
  if (tagCount > parsedCount) annotations.unsupported.push('Malformed JSDoc type annotation');
  return annotations;
}
