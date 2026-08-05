const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-remediation-config-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/remediation/remediationConfig.ts'),
    ],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    logLevel: 'silent',
  });
  try {
    return require(outfile);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
}

function main() {
  const { validateRemediationConfig } = loadModule();
  const config = validateRemediationConfig({
    schemaVersion: 1,
    components: {
      old: {
        replacementComponentKey: 'new',
        replacementName: 'New component',
      },
    },
    styles: {
      oldStyle: {
        replacementStyleKey: 'newStyle',
        styleType: 'fill',
      },
    },
  });
  assert.equal(config.components.old.replacementComponentKey, 'new');
  assert.equal(config.styles.oldStyle.styleType, 'fill');
  assert.throws(
    () =>
      validateRemediationConfig({
        schemaVersion: 2,
        components: {},
        styles: {},
      }),
    /Unsupported remediation config schemaVersion/,
  );
  assert.throws(
    () =>
      validateRemediationConfig({
        schemaVersion: 1,
        components: { same: { replacementComponentKey: 'same' } },
        styles: {},
      }),
    /Invalid component remediation target/,
  );

  console.log('Remediation config regression checks passed');
}

main();
