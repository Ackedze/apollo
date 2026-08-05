const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entryPath, outputLabel) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${outputLabel}-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entryPath)],
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const { getPatternRules, setPatternRulesConfig } = loadModule(
    '../src/assessment/patternRules.ts',
    'pattern-rules',
  );
  const { resolvePatternRulesUrl } = loadModule(
    '../src/reference/referenceList.ts',
    'reference-list',
  );
  const { appendCacheBustingQuery } = loadModule(
    '../src/utils/networkFetch.ts',
    'network-fetch',
  );
  const fixturePath = path.resolve(
    __dirname,
    'fixtures/pattern-rules-config.json',
  );
  const workspaceConfigPath = path.resolve(
    __dirname,
    '../../../../shared/design-system_ab/JSONS/apollo/patternRules.json',
  );

  const fixture = setPatternRulesConfig(readJson(fixturePath));
  assert.equal(fixture.schemaVersion, 1);
  assert.ok(getPatternRules().length > 0);

  const empty = setPatternRulesConfig({ schemaVersion: 1, rules: [] });
  assert.equal(empty.schemaVersion, 1);
  assert.equal(empty.rules.length, 0);
  assert.equal(getPatternRules().length, 0);

  if (fs.existsSync(workspaceConfigPath)) {
    const workspace = setPatternRulesConfig(readJson(workspaceConfigPath));
    assert.equal(workspace.schemaVersion, 1);
    assert.ok(workspace.rules.length > 0);
  }

  assert.throws(
    () => setPatternRulesConfig({ schemaVersion: 999, rules: [] }),
    /Unsupported pattern rules schemaVersion/,
  );
  assert.throws(
    () =>
      setPatternRulesConfig({
        schemaVersion: 1,
        rules: [fixture.rules[0], fixture.rules[0]],
      }),
    /Duplicate pattern rule id/,
  );
  assert.equal(
    resolvePatternRulesUrl({
      baseUrl: 'https://ackedze.github.io/design-system_ab/JSONS/',
      apollo: { patternRulesPath: 'apollo/patternRules.json' },
    }),
    'https://ackedze.github.io/design-system_ab/JSONS/apollo/patternRules.json',
  );
  assert.throws(
    () => resolvePatternRulesUrl({ baseUrl: 'https://example.com/' }),
    /does not define apollo\.patternRulesPath/,
  );
  assert.equal(
    appendCacheBustingQuery(
      'https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json',
      'apolloReferenceSources',
      123,
    ),
    'https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json?apolloReferenceSources=123',
  );
  assert.equal(
    appendCacheBustingQuery(
      'https://example.com/config.json?channel=prod',
      'apolloPatternRules',
      456,
    ),
    'https://example.com/config.json?channel=prod&apolloPatternRules=456',
  );

  console.log('Pattern rules config regression checks passed');
}

main();
