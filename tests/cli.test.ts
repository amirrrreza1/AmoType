import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { demoPrograms } from '../examples/demo-programs.js';
import { check } from '../src/index.js';

const cli = resolve(import.meta.dirname, '../dist/cli.js');
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'amotype-cli-'));

function runCli(source: string, argumentsList: string[] = []) {
  const file = resolve(temporaryDirectory, 'sample.js');
  writeFileSync(file, source);
  return spawnSync(process.execPath, [cli, file, ...argumentsList], { encoding: 'utf8' });
}

describe('CLI adapter', () => {
  it('returns the same structured result as the API', () => {
    const source = demoPrograms[0]!.source;
    const command = runCli(source, ['--json']);
    assert.equal(command.status, 1);
    assert.deepEqual(JSON.parse(command.stdout), check(source));
  });
  it('does not fail a complete check for warnings alone', () => {
    assert.equal(runCli('let x = 1; x = "text";').status, 0);
  });
  it('uses a distinct exit status for partial analysis', () => {
    assert.equal(runCli('const values = [1, "two"];').status, 3);
  });
  it('handles invalid input and missing files', () => {
    assert.equal(runCli('const =').status, 1);
    assert.equal(spawnSync(process.execPath, [cli], { encoding: 'utf8' }).status, 2);
    assert.equal(
      spawnSync(process.execPath, [cli, resolve(temporaryDirectory, 'absent.js')], {
        encoding: 'utf8',
      }).status,
      2,
    );
  });
  it('keeps the demo file synchronized with the playground fixture', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../examples/checkout.js'),
      'utf8',
    );
    // Formatting and Windows checkouts may change quotes or line endings, not the program.
    assert.deepEqual(
      check(source).diagnostics.map((entry) => entry.code),
      ['W100', 'E302'],
    );
    assert.equal(
      source.replaceAll('\r\n', '\n').replaceAll("'", '"').trim(),
      demoPrograms[0]!.source.replaceAll('\r\n', '\n').replaceAll("'", '"').trim(),
    );
  });
});
