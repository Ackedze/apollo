const { readdirSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const scriptsDirectory = __dirname;
const testFiles = readdirSync(scriptsDirectory)
  .filter((fileName) => /^test-.*\.js$/.test(fileName))
  .sort((left, right) => left.localeCompare(right));

if (!testFiles.length) {
  throw new Error('Apollo regression test discovery found no test files.');
}

for (const fileName of testFiles) {
  console.log(`\n[Apollo] ${fileName}`);
  const result = spawnSync(process.execPath, [path.join(scriptsDirectory, fileName)], {
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[Apollo] ${testFiles.length} regression tests passed.`);
