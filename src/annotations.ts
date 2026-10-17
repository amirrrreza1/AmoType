import type { Comment } from 'acorn';
import type { FunctionDeclaration } from 'estree';
import { isPrimitiveType, type Type } from './types.js';

export interface FunctionAnnotations {
  parameters: Map<string, Type>;
  returnType?: Type;
  unsupported: string[];
}

/** Primitive names, T[], Array<T>, and required record properties only. */
export function parseTypeAnnotation(source: string): Type | undefined {
  let position = 0;
  const skip = () => {
    while (/\s/.test(source[position] ?? '') && position < source.length) position++;
  };
  const take = (text: string) => {
    skip();
    if (!source.startsWith(text, position)) return false;
    position += text.length;
    return true;
  };
  const name = () => {
    skip();
    const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(position));
    if (!match) return undefined;
    position += match[0].length;
    return match[0];
  };
  const parse = (): Type | undefined => {
    let result: Type | undefined;
    if (take('{')) {
      const properties: Record<string, Type> = Object.create(null);
      if (!take('}')) {
        do {
          const key = name();
          if (!key || !take(':')) return undefined;
          const value = parse();
          if (!value || Object.hasOwn(properties, key)) return undefined;
          properties[key] = value;
          if (take('}')) break;
          if (!take(',') && !take(';')) return undefined;
          if (take('}')) break;
        } while (position < source.length);
        if (source[position - 1] !== '}') return undefined;
      }
      result = { kind: 'object', properties };
    } else {
      const identifier = name();
      if (identifier === 'Array' && take('<')) {
        const elementType = parse();
        if (!elementType || !take('>')) return undefined;
        result = { kind: 'array', elementType };
      } else if (identifier && isPrimitiveType(identifier)) result = identifier;
      else return undefined;
    }
    while (take('[]')) result = { kind: 'array', elementType: result };
    return result;
  };
  const result = parse();
  skip();
  return position === source.length ? result : undefined;
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
  // Split on tags, then balance braces so record types can nest.
  for (const match of comment.value.matchAll(/@(param|returns?)\b([^@]*)/g)) {
    const tag = match[1]!;
    const body = match[2]!.trim();
    let end = -1;
    let depth = 0;
    if (body.startsWith('{')) {
      for (let index = 0; index < body.length; index++) {
        if (body[index] === '{') depth++;
        if (body[index] === '}' && --depth === 0) {
          end = index;
          break;
        }
      }
    }
    const type = end < 0 ? undefined : parseTypeAnnotation(body.slice(1, end));
    const parameter =
      body
        .slice(end + 1)
        .trim()
        .split(/\s/)[0] ?? '';
    if (!type || (tag === 'param' && !/^[A-Za-z_$][\w$]*$/.test(parameter))) {
      annotations.unsupported.push(`Malformed or unsupported JSDoc @${tag} annotation`);
    } else if (tag === 'param') annotations.parameters.set(parameter, type);
    else annotations.returnType = type;
  }
  return annotations;
}
