const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

const outfile = path.join(
  os.tmpdir(),
  `apollo-variable-binding-action-${process.pid}-${Date.now()}.cjs`,
);
esbuild.buildSync({
  entryPoints: [path.resolve(__dirname, '../src/actions/variableBindingAction.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  logLevel: 'silent',
});
const { applyVariableBindingAction } = require(outfile);
fs.rmSync(outfile, { force: true });

async function main() {
  const paint = {
    type: 'SOLID',
    color: { r: 1, g: 0, b: 0 },
    opacity: 1,
    blendMode: 'NORMAL',
    visible: true,
  };
  const node = { id: 'I1:2;3:4', type: 'TEXT', fills: [paint], fillStyleId: '' };
  const variable = { key: 'variable-primary', resolvedType: 'COLOR' };
  const calls = [];
  globalThis.figma = {
    getNodeByIdAsync: async () => null,
    variables: {
      importVariableByKeyAsync: async (key) => {
        calls.push(['import', key]);
        return variable;
      },
      setBoundVariableForPaint: (sourcePaint, field, targetVariable) => {
        calls.push(['bind', field, targetVariable.key]);
        return {
          ...sourcePaint,
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: targetVariable.key } },
        };
      },
    },
  };
  const result = await applyVariableBindingAction(
    {
      kind: 'bind-variable',
      nodeId: node.id,
      expectedStyleId: null,
      targetVariableKey: variable.key,
      targetName: 'text/primary',
      targetLibrary: 'Interface Dynamic',
      styleField: 'fill',
      expectedFingerprint: 'paint:solid:1:0:0:1:NORMAL',
    },
    node,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    ['import', variable.key],
    ['bind', 'color', variable.key],
  ]);
  assert.equal(node.fills[0].boundVariables.color.id, variable.key);
  assert.equal(node.fills[0].opacity, 1);

  const mixed = Symbol('mixed');
  const rangeCalls = [];
  const mixedNode = {
    id: 'I1:2;3:5',
    type: 'TEXT',
    fills: mixed,
    fillStyleId: '',
    getStyledTextSegments: () => [
      { start: 0, end: 4, fills: [paint] },
      { start: 4, end: 8, fills: [paint] },
    ],
    setRangeFills: (start, end, fills) => {
      rangeCalls.push([start, end, fills]);
    },
  };
  const mixedResult = await applyVariableBindingAction(
    {
      kind: 'bind-variable',
      nodeId: mixedNode.id,
      expectedStyleId: null,
      targetVariableKey: variable.key,
      targetName: 'text/primary',
      targetLibrary: 'Interface Dynamic',
      styleField: 'fill',
      expectedFingerprint: 'paint:solid:1:0:0:1:NORMAL',
    },
    mixedNode,
  );
  assert.equal(mixedResult.ok, true);
  assert.equal(rangeCalls.length, 2);
  assert.equal(
    rangeCalls[0][2][0].boundVariables.color.id,
    variable.key,
  );
  assert.equal(rangeCalls[0][2][0].opacity, 1);
  delete globalThis.figma;
  console.log('Variable binding action regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
