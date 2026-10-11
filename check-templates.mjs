// Downloads the @schematics/angular package for a range of CLI versions and checks
// whether the tsconfig.json a new workspace gets contains "baseUrl". Needs network.
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const withBaseUrl = ['7.3.10', '8.3.29', '9.1.15', '10.2.4', '11.2.19', '12.2.18', '13.3.11', '14.2.13', '15.2.11', '16.0.0', '16.2.16'];
const without = ['17.0.0', '17.3.17', '18.2.21', '19.2.27', '20.3.39', '21.2.26', '22.2.2'];

let failed = 0;
for (const version of [...withBaseUrl, ...without]) {
  const dir = mkdtempSync(join(tmpdir(), `schematics-${version}-`));
  try {
    const tgz = execSync(`npm pack @schematics/angular@${version} --silent`, { cwd: dir, encoding: 'utf8' }).trim();
    execSync(`tar xzf ${tgz}`, { cwd: dir });
    const template = readFileSync(join(dir, 'package/workspace/files/tsconfig.json.template'), 'utf8');
    const has = template.includes('"baseUrl": "./"');
    const ok = has === withBaseUrl.includes(version);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  CLI ${version.padEnd(8)} new workspace tsconfig ${has ? 'has' : 'has no'} "baseUrl": "./"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
