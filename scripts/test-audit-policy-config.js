const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const outfile = path.join(
  os.tmpdir(),
  `apollo-audit-policy-config-${process.pid}-${Date.now()}.cjs`,
);
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/policies/auditPolicyConfig.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  logLevel: 'silent',
});
const {
  __test_setAuditPolicyConfig,
  shouldIgnoreRawTypography,
  validateAuditPolicyConfig,
} = require(outfile);
fs.rmSync(outfile, { force: true });

const payload = {
  schemaVersion: 1,
  rawTypography: {
    rules: [
      {
        id: 'web-core.status-label-uppercase',
        componentKeys: ['status-key', 'label-key'],
        nodeName: 'Label',
        ancestorPath: ['Status', '🔩 Label'],
        reasonCode: 'variant-owned-text-case',
      },
    ],
  },
};

assert.equal(validateAuditPolicyConfig(payload).rawTypography.rules.length, 1);
__test_setAuditPolicyConfig(payload);
assert.equal(
  shouldIgnoreRawTypography({
    componentKeys: ['status-key'],
    nodeName: 'Label',
    ancestorNames: [],
  }),
  true,
);
assert.equal(
  shouldIgnoreRawTypography({
    componentKeys: [],
    nodeName: 'Label',
    ancestorNames: ['🔩 Label', 'Status'],
  }),
  true,
);
assert.equal(
  shouldIgnoreRawTypography({
    componentKeys: [],
    nodeName: 'Label',
    ancestorNames: ['🔩 Label', 'Wrapper', 'Status'],
  }),
  false,
);
assert.equal(
  shouldIgnoreRawTypography({
    componentKeys: [],
    nodeName: 'Label',
    ancestorNames: ['🔩 Label'],
  }),
  false,
);
assert.throws(
  () =>
    validateAuditPolicyConfig({
      schemaVersion: 1,
      rawTypography: {
        rules: [
          {
            id: 'invalid',
            componentKeys: [],
            nodeName: 'Label',
            ancestorPath: [],
            reasonCode: 'missing-scope',
          },
        ],
      },
    }),
  /requires componentKeys or ancestorPath/,
);

console.log('Audit policy config regression checks passed');
