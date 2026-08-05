const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadReferenceList() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-reference-manifest-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/reference/referenceList.ts')],
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
  const {
    buildReferenceCatalogSources,
    resolveAuditPolicyConfigUrl,
    resolveRemediationConfigUrl,
  } = loadReferenceList();
  const baseUrl = 'https://ackedze.github.io/design-system_ab/JSONS/';
  const explicit = buildReferenceCatalogSources({
    schemaVersion: 2,
    baseUrl,
    libraries: [
      {
        catalogs: [
          {
            fileName: 'web/components/Test.json',
            path: 'web/components/Test.json',
            source: {
              kind: 'components',
              indexPath: 'indexes/web/components/Test.index.json',
            },
          },
        ],
      },
    ],
  });
  assert.equal(
    explicit[0].indexUrl,
    `${baseUrl}indexes/web/components/Test.index.json`,
  );
  assert.equal(
    resolveRemediationConfigUrl({
      baseUrl,
      apollo: { remediationConfigPath: 'apollo/remediations.json' },
    }),
    `${baseUrl}apollo/remediations.json`,
  );
  assert.equal(resolveRemediationConfigUrl({ baseUrl, apollo: {} }), null);
  assert.equal(
    resolveAuditPolicyConfigUrl({
      baseUrl,
      apollo: { auditPolicyConfigPath: 'apollo/auditPolicies.json' },
    }),
    `${baseUrl}apollo/auditPolicies.json`,
  );
  assert.equal(resolveAuditPolicyConfigUrl({ baseUrl, apollo: {} }), null);
  assert.throws(
    () =>
      buildReferenceCatalogSources({
        schemaVersion: 2,
        baseUrl,
        catalogs: [
          {
            fileName: 'web/components/Missing.json',
            path: 'web/components/Missing.json',
            source: { kind: 'components' },
          },
        ],
      }),
    /has no indexPath/,
  );
  assert.throws(
    () =>
      buildReferenceCatalogSources({
        schemaVersion: 2,
        baseUrl,
        catalogs: [
          {
            fileName: 'tokens/Duplicate.json',
            path: 'tokens/Duplicate.json',
            source: { kind: 'tokens' },
          },
          {
            fileName: 'tokens/Duplicate.json',
            path: 'tokens/Duplicate.json',
            source: { kind: 'tokens' },
          },
        ],
      }),
    /duplicate catalog path/,
  );

  const legacy = buildReferenceCatalogSources({
    baseUrl,
    catalogs: [
      {
        fileName: 'web/components/Test.json',
        path: 'web/components/Test.json',
        source: { kind: 'components' },
      },
      {
        fileName: 'web/components/Test/rules.json',
        path: 'web/components/Test/rules.json',
        source: { kind: 'components' },
      },
      {
        fileName: 'apollo/patternRules.json',
        path: 'apollo/patternRules.json',
        source: { kind: 'components' },
      },
      {
        fileName: 'tokens/Test.json',
        path: 'tokens/Test.json',
        source: { kind: 'tokens' },
      },
    ],
  });
  assert.equal(
    legacy[0].indexUrl,
    `${baseUrl}indexes/web/components/Test.index.json`,
  );
  assert.equal(legacy[1].indexUrl, undefined);
  assert.equal(legacy[2].indexUrl, undefined);
  assert.equal(legacy[3].indexUrl, undefined);

  console.log('Reference manifest regression checks passed');
}

main();
