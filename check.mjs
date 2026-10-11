// Runs every claim the post makes against this workspace and exits 1 if any fails.
// Each step swaps a tsconfig.json (or app.ts) in from variants/, builds, and puts
// the original back, so the working tree ends where it started.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = import.meta.dirname;
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NG_CLI_ANALYTICS: 'false' };
const ansi = /\x1b\[[0-9;]*m/g;

let failed = 0;
function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`      ${detail}`);
  if (!ok) failed++;
}

function run(cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' });
  return { code: r.status, out: ((r.stdout ?? '') + (r.stderr ?? '')).replace(ansi, '') };
}

const ngBuild = () => run('npx', ['ng', 'build']);
const tsc7 = () => run('node', [join(root, 'node_modules/typescript7/bin/tsc'), '-p', 'tsconfig.app.json', '--noEmit']);

// Puts variants/<name>/<file> in place of <target> for the length of fn().
function withFile(variant, target, fn) {
  const path = join(root, target);
  const original = readFileSync(path);
  try {
    copyFileSync(join(root, 'variants', variant), path);
    return fn();
  } finally {
    writeFileSync(path, original);
  }
}

const line = (out, re) => (out.split(/\r?\n/).find((l) => re.test(l)) ?? '').trim();

const TS5101 =
  `TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0. ` +
  `Specify compilerOption '"ignoreDeprecations": "6.0"' to silence this error.`;

// Versions, so the output says what it ran on.
const ts6 = require('typescript/package.json').version;
const ts7 = require('./node_modules/typescript7/package.json').version;
const ng = require('@angular/core/package.json').version;
check(ts6.startsWith('6.0.'), `Angular ${ng} builds with TypeScript ${ts6}`);

// 1. The tsconfig an older CLI generated: baseUrl "./" plus non-relative paths.
let r = ngBuild();
check(r.code !== 0, 'ng build with "baseUrl": "./" fails', `exit code ${r.code}`);
check(r.out.includes(TS5101), 'and the error is TS5101, word for word', line(r.out, /TS5101/));
check(r.out.includes(`[ERROR] ${TS5101}`) && !/WARNING.*baseUrl/i.test(r.out), 'it is reported as an ERROR, not a warning');

// 2. The bridge: ignoreDeprecations "6.0" next to baseUrl.
r = withFile('bridge/tsconfig.json', 'tsconfig.json', ngBuild);
check(r.code === 0, 'adding "ignoreDeprecations": "6.0" makes ng build pass', line(r.out, /bundle generation/));

// 3. Dropping baseUrl but keeping "src/app/*" without the leading ./
r = withFile('half-fix/tsconfig.json', 'tsconfig.json', ngBuild);
check(r.code !== 0 && r.out.includes('TS5090'), 'removing baseUrl alone fails: the paths need a leading ./', line(r.out, /TS5090/));

// 4. Paths relative to the tsconfig, no baseUrl, no "*" entry: the bare import breaks.
r = withFile('fixed-no-star/tsconfig.json', 'tsconfig.json', ngBuild);
check(
  r.code !== 0 && r.out.includes("TS2307: Cannot find module 'src/app/shared/format-name'"),
  'with "./src/app/*" and no baseUrl, the bare import src/app/... breaks',
  line(r.out, /TS2307/),
);
check(!r.out.includes('@app/') && !r.out.includes('@env/'), 'while both aliases still resolve');

// 5. The same, plus "*": ["./*"]: the bare import works again.
r = withFile('fixed/tsconfig.json', 'tsconfig.json', ngBuild);
check(r.code === 0, 'adding "*": ["./*"] keeps the bare import working', line(r.out, /bundle generation/));

// 6. Or convert the bare import to an alias and skip "*".
r = withFile('fixed-no-star/tsconfig.json', 'tsconfig.json', () =>
  withFile('aliases-only/app.ts', 'src/app/app.ts', ngBuild),
);
check(r.code === 0, 'converting the bare import to @app/... builds without "*"', line(r.out, /bundle generation/));

// 7. TypeScript 7: baseUrl is gone, and ignoreDeprecations does not bring it back.
r = withFile('bridge/tsconfig.json', 'tsconfig.json', tsc7);
check(
  r.code !== 0 && r.out.includes("TS5102: Option 'baseUrl' has been removed."),
  `TypeScript ${ts7} rejects baseUrl even with "ignoreDeprecations": "6.0"`,
  line(r.out, /TS5102/),
);
check(r.out.includes('TS5090: Non-relative paths are not allowed.'), 'and also rejects the paths that have no leading ./', line(r.out, /TS5090/));
r = withFile('fixed/tsconfig.json', 'tsconfig.json', tsc7);
check(r.code === 0, `TypeScript ${ts7} type-checks the fixed workspace`, `exit code ${r.code}`);
r = withFile('fixed-with-ignore/tsconfig.json', 'tsconfig.json', tsc7);
check(r.code === 0, `TypeScript ${ts7} does not complain about "ignoreDeprecations": "6.0" on its own`, `exit code ${r.code}`);

// 8. The codemod, run on a copy of this workspace, produces the fixed tsconfig.
const tmp = mkdtempSync(join(tmpdir(), 'ts5to6-'));
try {
  for (const f of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.spec.json', 'angular.json', 'package.json', 'src']) {
    cpSync(join(root, f), join(tmp, f), { recursive: true });
  }
  const cli = join(root, 'node_modules/@andrewbranch/ts5to6', require('@andrewbranch/ts5to6/package.json').bin.ts5to6);
  r = run('node', [cli, '--fixBaseUrl', tmp]);
  const squash = (s) => s.replace(/\s+/g, '');
  const got = readFileSync(join(tmp, 'tsconfig.json'), 'utf8');
  const want = readFileSync(join(root, 'variants/fixed/tsconfig.json'), 'utf8');
  check(squash(got) === squash(want), 'npx @andrewbranch/ts5to6 --fixBaseUrl writes the same tsconfig as variants/fixed', line(r.out, /rely on baseUrl/));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 9. ng update to 22 has no migration that touches baseUrl.
function mentions(dir, word) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (mentions(p, word)) return true; }
    else if (readFileSync(p, 'utf8').includes(word)) return true;
  }
  return false;
}
check(
  !mentions(join(root, 'node_modules/@angular/core/schematics'), 'baseUrl') &&
    !mentions(join(root, 'node_modules/@schematics/angular/migrations'), 'baseUrl'),
  'no Angular 22 update migration mentions baseUrl',
);

// The working tree is back where it started.
check(readFileSync(join(root, 'tsconfig.json'), 'utf8').includes('"baseUrl": "./"'), 'tsconfig.json restored');

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
