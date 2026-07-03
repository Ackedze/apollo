const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadPolicyModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-shell-component-policy-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/policies/shellComponentAuditPolicy.ts')],
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

function makeItem(name, reference = null, componentKey = null) {
  return {
    name,
    reference,
    componentKey,
  };
}

function makeDetached(componentKey, sourceFile = null) {
  return {
    componentKey,
    sourceFile,
  };
}

function main() {
  const {
    getShellComponentAuditReason,
    isShellComponentAuditExcluded,
    isShellDetachedEntryExcluded,
  } = loadPolicyModule();

  assert.equal(isShellComponentAuditExcluded(makeItem('[D] SideMenu')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('[D] Header')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('[D](768) HeaderMenu')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('[M] AppHeader :: Top')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('[M] NavigationBar')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('[M] TabBar')), false);
  assert.equal(
    isShellComponentAuditExcluded(
      makeItem('Renamed layer', null, 'd187029a0a1af08dbb499e13b3ef2ac98efaaac2'),
    ),
    true,
  );
  assert.equal(
    isShellComponentAuditExcluded(
      makeItem('Renamed mobile shell', null, '92afbeecae84ff7ba5815a20b34cc7c80394f0c5'),
    ),
    true,
  );
  assert.equal(
    isShellComponentAuditExcluded(
      makeItem('Variant key', null, '0718f1e72a3a298e20cd7597a896e249bf516a2d'),
    ),
    true,
  );
  assert.equal(
    isShellComponentAuditExcluded(
      makeItem('LeftAddon', null, '0a8e127814f572a79ddd9beec8ece3e63c7a87d6'),
    ),
    true,
  );
  assert.equal(
    isShellComponentAuditExcluded(
      makeItem('Renamed layer', {
        key: 'unknown-key',
        name: '[D] Header',
        displayName: '[D] Header',
        names: ['Header', '[D] Header'],
        sourceFile: 'Web _ Corp Components -- CorporateAppHeaderNew [D].json',
      }),
    ),
    true,
  );
  assert.equal(
    isShellComponentAuditExcluded(
      makeItem('Renamed layer', {
        name: '[D] Header',
        displayName: '[D] Header',
        names: ['Header', '[D] Header'],
      }),
    ),
    false,
  );
  assert.equal(isShellComponentAuditExcluded(makeItem('Header')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('[M] Header')), false);
  assert.equal(isShellComponentAuditExcluded(makeItem('LeftAddon')), false);
  assert.equal(
    isShellDetachedEntryExcluded(
      makeDetached(
        'detached-variant-key',
        'Web _ Corp Components -- CorporateAppHeaderMobile [M].json',
      ),
    ),
    true,
  );
  assert.equal(
    isShellDetachedEntryExcluded(makeDetached('detached-variant-key')),
    false,
  );
  assert.match(
    getShellComponentAuditReason(
      makeItem('Renamed layer', null, 'd187029a0a1af08dbb499e13b3ef2ac98efaaac2'),
    ),
    /excluded by Apollo shell settings/,
  );

  console.log('Shell component audit policy checks passed');
}

main();
