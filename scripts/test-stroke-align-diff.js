const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule(entryPoint, label) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${label}-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, entryPoint)],
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

function strokeNode({
  id,
  parentId = null,
  path: nodePath,
  name,
  align = 'INSIDE',
  type = 'RECTANGLE',
  componentInstance = null,
}) {
  return {
    id,
    parentId,
    nodeId: String(id),
    path: nodePath,
    type,
    name,
    visible: true,
    opacity: 1,
    radius: null,
    stroke: {
      color: 'rgba(0,0,0,1)',
      token: 'border-token',
      weight: 1,
      align,
    },
    componentInstance,
  };
}

function main() {
  const { diffStructures } = loadModule('../src/structure/diff.ts', 'stroke-align-diff');
  const { setNodeStrokeAlignment } = loadModule(
    '../src/structure/strokeAlignment.ts',
    'stroke-align-reset',
  );
  const { findComponentContractViolationForDiff } = loadModule(
    '../src/contracts/componentRules.ts',
    'stroke-align-rules',
  );

  const reference = [
    strokeNode({ id: 1, path: '[D] BackgroundPlate', name: '[D] BackgroundPlate' }),
  ];
  const center = [
    strokeNode({
      id: 1,
      path: '[D] BackgroundPlate',
      name: '[D] BackgroundPlate',
      align: 'CENTER',
    }),
  ];
  const outside = [
    strokeNode({
      id: 1,
      path: '[D] BackgroundPlate',
      name: '[D] BackgroundPlate',
      align: 'OUTSIDE',
    }),
  ];

  const centerDiff = diffStructures(center, reference).diffs.find(
    (diff) => diff.details?.property === 'stroke.align',
  );
  assert.ok(centerDiff, 'INSIDE -> CENTER must produce stroke.align diff');
  assert.equal(centerDiff.message, 'Положение обводки: Inside → Center');
  assert.equal(centerDiff.diffKind, 'shape');
  assert.equal(centerDiff.details.reference.value, 'Inside');
  assert.equal(centerDiff.details.actual.value, 'Center');

  const outsideDiff = diffStructures(outside, reference).diffs.find(
    (diff) => diff.details?.property === 'stroke.align',
  );
  assert.ok(outsideDiff, 'INSIDE -> OUTSIDE must produce stroke.align diff');
  assert.equal(outsideDiff.message, 'Положение обводки: Inside → Outside');
  assert.equal(
    diffStructures(reference, reference).diffs.some(
      (diff) => diff.details?.property === 'stroke.align',
    ),
    false,
    'Unchanged stroke alignment must not produce a diff',
  );

  const componentInstance = {
    componentKey: 'web-corp.background-plate',
    variantProperties: { Type: 'Border' },
  };
  const nestedReference = [
    strokeNode({
      id: 1,
      path: 'Page / [D] BackgroundPlate',
      name: '[D] BackgroundPlate',
      type: 'INSTANCE',
      componentInstance,
    }),
    strokeNode({
      id: 2,
      parentId: 1,
      path: 'Page / [D] BackgroundPlate / Border',
      name: 'Border',
    }),
  ];
  const nestedActual = [
    nestedReference[0],
    strokeNode({
      id: 2,
      parentId: 1,
      path: 'Page / [D] BackgroundPlate / Border',
      name: 'Border',
      align: 'CENTER',
    }),
  ];
  const nestedDiff = diffStructures(nestedActual, nestedReference).diffs.find(
    (diff) => diff.details?.property === 'stroke.align',
  );
  assert.ok(nestedDiff, 'Nested stroke alignment must be reported');
  assert.equal(nestedDiff.nodeName, 'Border');
  assert.equal(
    nestedDiff.context.actualNestedOwnerComponentKey,
    'web-corp.background-plate',
  );
  assert.deepEqual(nestedDiff.context.actualVariantProperties, { Type: 'Border' });

  globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__ = [
    {
      componentKey: 'web-corp.background-plate',
      aliases: ['[D] BackgroundPlate'],
      rulesFile: {
        componentKey: 'web-corp.background-plate',
        rules: [
          {
            ruleId: 'component:web-corp.background-plate.border-stroke-align-is-fixed',
            severity: 'error',
            ruleKind: 'design-rule',
            severityScope: 'design',
            source: 'pattern-link',
            appliesTo: 'stroke.align|strokeAlign',
            checkType: 'deterministic',
            matchKind: 'exact_component_rule',
            conditions: {
              component: 'web-corp.background-plate',
              variant: { Type: 'Border' },
            },
            ruleText: 'Stroke alignment must remain INSIDE for Type=Border.',
          },
        ],
      },
    },
  ];
  const violation = findComponentContractViolationForDiff(nestedDiff);
  assert.equal(
    violation?.ruleId,
    'component:web-corp.background-plate.border-stroke-align-is-fixed',
  );

  const primaryDiff = Object.assign({}, nestedDiff, {
    context: Object.assign({}, nestedDiff.context, {
      actualVariantProperties: { Type: 'Primary' },
      referenceVariantProperties: { Type: 'Primary' },
    }),
  });
  assert.equal(
    findComponentContractViolationForDiff(primaryDiff),
    null,
    'Border rule must not raise severity for another BackgroundPlate Type',
  );

  const resetTarget = {
    strokeAlign: 'CENTER',
    strokeWeight: 3,
    strokes: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
  };
  const originalStrokes = resetTarget.strokes;
  assert.equal(setNodeStrokeAlignment(resetTarget, 'Inside'), true);
  assert.equal(resetTarget.strokeAlign, 'INSIDE');
  assert.equal(resetTarget.strokeWeight, 3);
  assert.equal(resetTarget.strokes, originalStrokes);

  delete globalThis.__APOLLO_TEST_REMOTE_COMPONENT_RULE_REGISTRY__;
  console.log('Stroke alignment diff regression checks passed');
}

main();
