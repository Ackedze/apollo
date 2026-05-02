const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function bundleModule(entryPoint, name) {
  const outfile = path.join(
    os.tmpdir(),
    `${name}-${process.pid}-${Date.now()}.cjs`,
  );

  esbuild.buildSync({
    entryPoints: [entryPoint],
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
  const policyModule = bundleModule(
    path.resolve(__dirname, '../src/policies/componentAuditPolicy.ts'),
    'apollo-audit-policy',
  );
  const libraryModule = bundleModule(
    path.resolve(__dirname, '../src/reference/library.ts'),
    'apollo-library-variant-resolution',
  );

  const {
    getForcedAuditCategory,
    supportsThemizationForChannel,
    getHiddenTabsForChannel,
  } = policyModule;
  const { resolveVariantKeyForInstance } = libraryModule;

  assert.equal(
    getForcedAuditCategory({ source: 'Web :: Core Helpers' }),
    'technical',
    'Helper libraries must map into the technical bucket',
  );
  assert.equal(
    getForcedAuditCategory({ source: '❌ Web :: DEPRECATED CORP (не подключать)' }),
    'deprecated',
    'Deprecated libraries must map into the deprecated bucket',
  );
  assert.equal(
    getForcedAuditCategory({ source: 'Web :: DEPRECATED CORP (не подключать)' }),
    'deprecated',
    'Deprecated libraries must also match when the published catalog omits the leading emoji',
  );
  assert.equal(
    getForcedAuditCategory({ source: 'Web :: Core' }),
    null,
    'Regular product libraries must not get a forced audit category',
  );

  assert.equal(
    supportsThemizationForChannel('Desktop'),
    true,
    'Desktop must keep themization enabled',
  );
  assert.equal(
    supportsThemizationForChannel('iOS'),
    false,
    'iOS must skip themization entirely',
  );
  assert.deepEqual(
    getHiddenTabsForChannel('Android'),
    ['themization'],
    'Android must hide the themization tab',
  );

  const variantKey = resolveVariantKeyForInstance(
    {
      key: 'component-root',
      displayName: 'BodyCell',
      names: ['BodyCell'],
      status: 'current',
      variants: [
        {
          key: 'variant-extra',
          id: '1',
          name: 'Presets=Text, Accent=True',
        },
        {
          key: 'variant-default',
          id: '2',
          name: 'Presets=Text, Accent=False',
        },
      ],
      defaultVariant: 'variant-default',
    },
    'component-root',
    { Presets: 'Text' },
  );

  assert.equal(
    variantKey,
    'variant-default',
    'Variant lookup must prefer the default-compatible variant over arbitrary overlap ties',
  );

  console.log('Audit policy regression checks passed');
}

main();
