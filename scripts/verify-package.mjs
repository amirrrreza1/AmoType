import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli || !process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  throw new Error('Run this script with pnpm run verify:package.');
}

const projectRoot = resolve(import.meta.dirname, '..');
const verificationRoot = resolve(projectRoot, '.verification');
const consumer = mkdtempSync(resolve(tmpdir(), 'amotype-consumer-'));
const checkerRoot = projectRoot;
mkdirSync(consumer, { recursive: true });

function runPnpm(argumentsList, cwd) {
  return execFileSync(process.execPath, [pnpmCli, ...argumentsList], {
    cwd,
    encoding: 'utf8',
  });
}

const manifest = JSON.parse(readFileSync(resolve(checkerRoot, 'package.json'), 'utf8'));
const archiveName = manifest.name.replace(/^@/, '').replaceAll('/', '-');
const archive = resolve(verificationRoot, `${archiveName}-${manifest.version}.tgz`);
runPnpm(['pack', '--out', archive], checkerRoot);
writeFileSync(
  resolve(consumer, 'package.json'),
  JSON.stringify(
    {
      name: 'amotype-verification-consumer',
      version: '0.0.0',
      private: true,
      type: 'module',
    },
    null,
    2,
  ),
);
runPnpm(['--ignore-workspace', 'add', archive, '--ignore-scripts'], consumer);

const installedRoot = resolve(consumer, 'node_modules', ...manifest.name.split('/'));
const { check } = await import(pathToFileURL(resolve(installedRoot, 'dist', 'index.js')).href);
const source = 'let age = 20; age = "twenty";';
assert.equal(check(source).diagnostics[0].code, 'W100');
const input = resolve(consumer, 'sample.js');
writeFileSync(input, source);
const command = spawnSync(
  process.execPath,
  [resolve(installedRoot, 'dist', 'cli.js'), input, '--json'],
  {
    encoding: 'utf8',
    cwd: consumer,
  },
);
assert.equal(command.status, 0, command.stderr);
assert.equal(JSON.parse(command.stdout).diagnostics[0].code, 'W100');
writeFileSync(
  resolve(consumer, 'sample.ts'),
  `import { check, type CheckResult } from '${manifest.name}';\nconst result: CheckResult = check('let count = 1;');\nconsole.log(result.analysisComplete);\n`,
);
writeFileSync(
  resolve(consumer, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2023',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
    },
    files: ['sample.ts'],
  }),
);
execFileSync(
  process.execPath,
  [resolve(projectRoot, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
  { cwd: consumer, encoding: 'utf8', stdio: 'pipe' },
);
console.log(
  'Packed artifact installs correctly; real ESM API, CLI and strict TypeScript consumer passed.',
);
console.log(`Archive: ${archive}`);
