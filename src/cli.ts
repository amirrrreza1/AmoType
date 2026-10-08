#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { check, type CheckOptions } from './index.js';

const usage = `Usage: amotype <file.js> [--json] [--permissive]

Checks a documented JavaScript subset without executing it.
Exit codes: 0 complete/no errors; 1 errors; 2 usage or I/O; 3 partial analysis.
Strict-policy warnings alone do not fail a complete check.`;

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  if (argumentsList.includes('--help') || argumentsList.includes('-h')) {
    console.log(usage);
    return;
  }
  const files = argumentsList.filter((argument) => !argument.startsWith('-'));
  const unknownOptions = argumentsList.filter(
    (argument) => argument.startsWith('-') && !['--json', '--permissive'].includes(argument),
  );
  if (files.length !== 1 || unknownOptions.length > 0) {
    console.error(usage);
    process.exitCode = 2;
    return;
  }
  const file = files[0]!;
  try {
    const source = await readFile(file, 'utf8');
    const mode: CheckOptions['mode'] = argumentsList.includes('--permissive')
      ? 'permissive'
      : 'strict';
    const result = check(source, { mode });
    if (argumentsList.includes('--json')) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const diagnostic of result.diagnostics) {
        const { line, column } = diagnostic.range.start;
        console.log(
          `${file}:${line}:${column} ${diagnostic.severity} ${diagnostic.code} ${diagnostic.message}`,
        );
        if (diagnostic.suggestion) console.log(`  Suggestion: ${diagnostic.suggestion}`);
      }
      console.log(
        result.analysisComplete
          ? 'Analysis complete.'
          : 'Analysis partial: some code could not be verified.',
      );
    }
    process.exitCode = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? 1
      : result.analysisComplete
        ? 0
        : 3;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

await main();
