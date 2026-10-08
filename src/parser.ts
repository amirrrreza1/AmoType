import { parse, type Comment } from 'acorn';
import type { Program } from 'estree';
import type { Diagnostic } from './diagnostics.js';

export type ParsedSource =
  | { success: true; program: Program; comments: Comment[] }
  | { success: false; diagnostic: Diagnostic };

export function parseSource(source: string): ParsedSource {
  const comments: Comment[] = [];
  try {
    const ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      ranges: true,
      onComment: comments,
      allowHashBang: true,
    });

    // Acorn produces ESTree nodes. Confine the structural cast to this parser boundary.
    return { success: true, program: ast as unknown as Program, comments };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const parseError = error as SyntaxError & {
      pos?: number;
      loc?: { line: number; column: number };
    };
    const offset = parseError.pos ?? 0;
    const position = {
      offset,
      line: parseError.loc?.line ?? 1,
      column: (parseError.loc?.column ?? 0) + 1,
    };

    return {
      success: false,
      diagnostic: {
        code: 'E100',
        severity: 'error',
        message: error.message.replace(/ \(\d+:\d+\)$/, ''),
        range: { start: position, end: position },
        suggestion: 'Fix the syntax before checking types.',
      },
    };
  }
}
