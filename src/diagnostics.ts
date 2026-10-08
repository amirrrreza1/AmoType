import type { Node } from 'estree';

export interface SourcePosition {
  /** UTF-16 offset, compatible with JavaScript strings and CodeMirror. */
  offset: number;
  /** Lines and columns are both one-based. */
  line: number;
  column: number;
}

export interface SourceRange {
  start: SourcePosition;
  /** Exclusive end position. */
  end: SourcePosition;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  range: SourceRange;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

export interface TraceStep {
  rule: string;
  explanation: string;
  range: SourceRange;
  inferredType?: string;
}

export function sourceRange(node: Node): SourceRange {
  const [start, end] = node.range ?? [0, 0];
  return {
    start: {
      offset: start,
      line: node.loc?.start.line ?? 1,
      column: (node.loc?.start.column ?? 0) + 1,
    },
    end: {
      offset: end,
      line: node.loc?.end.line ?? 1,
      column: (node.loc?.end.column ?? 0) + 1,
    },
  };
}
