const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const outfile = path.join(
  os.tmpdir(),
  `apollo-color-token-value-index-${process.pid}-${Date.now()}.cjs`,
);
esbuild.buildSync({
  entryPoints: [
    path.resolve(__dirname, '../src/services/colorTokenValueIndex.ts'),
  ],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  logLevel: 'silent',
});
const {
  __test_buildColorTokenValueIndex,
  __test_getNodeUniformColorKey,
} = require(outfile);
fs.rmSync(outfile, { force: true });

const catalogs = [
  {
    meta: { fileName: 'colors.json', library: 'Colors' },
    collections: [
      {
        name: 'Interface Dynamic',
        variables: [
          {
            key: 'text-primary',
            name: 'text/primary',
            groupName: 'text',
            tokenName: 'primary',
            resolvedType: 'COLOR',
            scopes: ['TEXT_FILL'],
            actualValuesByMode: {
              light: [{ r: 1, g: 0, b: 0 }],
              dark: [{ r: 0, g: 0, b: 0 }],
            },
          },
          {
            key: 'hidden-primitive',
            name: 'primitive/red',
            resolvedType: 'COLOR',
            hiddenFromPublishing: true,
            actualValuesByMode: { value: [{ r: 1, g: 0, b: 0 }] },
          },
          {
            key: 'legacy-direct',
            name: 'legacy/red',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { value: { r: 1, g: 0, b: 0, a: 1 } },
          },
          {
            key: 'translucent-red',
            name: 'translucent/red',
            resolvedType: 'COLOR',
            scopes: ['ALL_SCOPES'],
            valuesByMode: { value: { r: 1, g: 0, b: 0, a: 0.4 } },
          },
        ],
      },
    ],
  },
];

const index = __test_buildColorTokenValueIndex(catalogs);
assert.deepEqual(
  index.get('1:0:0:1').map((entry) => entry.key),
  ['text-primary', 'legacy-direct'],
);
assert.deepEqual(
  index.get('1:0:0:0.4').map((entry) => entry.key),
  ['translucent-red'],
);
assert.equal(
  index.get('1:0:0:1').some((entry) => entry.key === 'hidden-primitive'),
  false,
);

const node = {
  type: 'RECTANGLE',
  fills: [
    {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      opacity: 0.4,
      visible: true,
    },
  ],
};
assert.equal(__test_getNodeUniformColorKey(node, 'fill'), '1:0:0:0.4');

const opaqueNode = {
  ...node,
  fills: [{ ...node.fills[0], opacity: 1 }],
};
assert.equal(__test_getNodeUniformColorKey(opaqueNode, 'fill'), '1:0:0:1');

const mixedTextNode = {
  type: 'TEXT',
  fills: Symbol('mixed'),
  getStyledTextSegments: () => [
    { fills: node.fills },
    { fills: node.fills },
  ],
};
assert.equal(
  __test_getNodeUniformColorKey(mixedTextNode, 'fill'),
  '1:0:0:0.4',
);

console.log('Color token value index regression checks passed');
