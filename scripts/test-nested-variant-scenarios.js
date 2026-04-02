const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function bundleModule(entryPoint) {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-${path.basename(entryPoint, path.extname(entryPoint))}-${process.pid}-${Date.now()}.cjs`,
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

function makeComponent() {
  return {
    key: 'main-component',
    name: 'Radio_24',
    displayName: 'Radio_24',
    status: 'current',
    platform: 'Desktop',
    structure: [{ path: 'Default', id: 1, parentId: null, type: 'INSTANCE', name: 'Default', visible: true, radius: null }],
    variants: [
      {
        key: 'radio-default',
        id: '1',
        name: 'SelectedState=False, Type=Radio, View=Desktop, Preset=Default',
        properties: {
          SelectedState: 'False',
          Type: 'Radio',
          View: 'Desktop',
          Preset: 'Default',
        },
      },
      {
        key: 'radio-selected',
        id: '2',
        name: 'SelectedState=True, Type=Radio, View=Desktop, Preset=Default',
        properties: {
          SelectedState: 'True',
          Type: 'Radio',
          View: 'Desktop',
          Preset: 'Default',
        },
      },
      {
        key: 'radio-card',
        id: '3',
        name: 'SelectedState=True, Type=Card, View=Desktop, Preset=Promo',
        properties: {
          SelectedState: 'True',
          Type: 'Card',
          View: 'Desktop',
          Preset: 'Promo',
        },
      },
    ],
    variantStructures: {
      'radio-default': [{ op: 'update', id: 1, value: { path: 'SelectedState=False, Type=Radio, View=Desktop, Preset=Default' } }],
      'radio-selected': [{ op: 'update', id: 1, value: { path: 'SelectedState=True, Type=Radio, View=Desktop, Preset=Default' } }],
      'radio-card': [{ op: 'update', id: 1, value: { path: 'SelectedState=True, Type=Card, View=Desktop, Preset=Promo' } }],
    },
  };
}

function main() {
  const library = bundleModule(path.resolve(__dirname, '../src/reference/library.ts'));
  const diff = bundleModule(path.resolve(__dirname, '../src/structure/diff.ts'));
  const nestedReferenceMerge = bundleModule(
    path.resolve(__dirname, '../src/reference/nestedReferenceMerge.ts'),
  );
  const occurrenceKeys = bundleModule(
    path.resolve(__dirname, '../src/structure/occurrenceKeys.ts'),
  );
  const suppressionPolicy = bundleModule(
    path.resolve(__dirname, '../src/filters/suppressionPolicy.ts'),
  );

  const component = makeComponent();

  assert.equal(
    library.resolveVariantKeyForInstance(component, 'radio-selected', null),
    'radio-selected',
    'Direct variant key must remain the highest-priority match',
  );

  assert.equal(
    library.resolveVariantKeyForInstance(component, 'main-component', {
      SelectedState: 'True',
      Type: 'Radio',
      View: 'Desktop',
      Preset: 'Default',
    }),
    'radio-selected',
    'Variant properties must resolve SelectedState-based nested references',
  );

  assert.equal(
    library.resolveVariantKeyForInstance(component, 'main-component', {
      SelectedState: 'True',
      Type: 'Card',
      View: 'Desktop',
      Preset: 'Promo',
    }),
    'radio-card',
    'Variant properties must resolve Type/View/Preset combinations',
  );

  const resolvedStructure = library.resolveStructureForInstance(component, {
    componentKey: 'main-component',
    variantProperties: {
      SelectedState: 'True',
      Type: 'Card',
      View: 'Desktop',
      Preset: 'Promo',
    },
  });

  assert.equal(
    resolvedStructure[0].path,
    'SelectedState=True, Type=Card, View=Desktop, Preset=Promo',
    'Resolved nested structure must follow variantProperties instead of only componentKey',
  );

  assert.equal(
    nestedReferenceMerge.shouldPreferMaterializedInstanceReference(
      {
        path: 'State=Active / LeftSlot / Radio_24 / Content / Bg',
        type: 'VECTOR',
        name: 'Bg',
        visible: true,
        id: 8,
        parentId: 7,
        referenceOrigin: 'nested-component',
        referenceOwnerPath: 'State=Active / LeftSlot',
      },
      {
        path: 'State=Active / LeftSlot / Radio_24 / Content / Bg',
        type: 'VECTOR',
        name: 'Bg',
        visible: true,
        id: 18,
        parentId: 17,
        referenceOrigin: 'nested-component',
        referenceOwnerPath: 'State=Active / LeftSlot / Radio_24',
      },
      'State=Active / LeftSlot / Radio_24',
    ),
    true,
    'Deeper materialized nested instance must replace conflicting subtree nodes from the parent nested owner',
  );

  assert.equal(
    nestedReferenceMerge.shouldPreferMaterializedInstanceReference(
      {
        path: 'Size=56, Overflow=true / [D] Button / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 54,
        parentId: 50,
        referenceOrigin: 'host',
      },
      {
        path: 'Size=56, Overflow=true / [D] Button / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 154,
        parentId: 150,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'button-secondary',
        referenceOwnerPath: 'Size=56, Overflow=true / [D] Button',
        referenceOwnerRelativePath: 'LeftAddon / LeftAddon / Fixer / PaintMe',
      },
      'Size=56, Overflow=true / [D] Button',
      () => false,
    ),
    true,
    'Materialized nested descendants must replace host descendants when the path is not host-controlled',
  );

  assert.equal(
    nestedReferenceMerge.shouldPreferMaterializedInstanceReference(
      {
        path: 'Size=56, Overflow=true / [D] Button / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 54,
        parentId: 50,
        referenceOrigin: 'host',
      },
      {
        path: 'Size=56, Overflow=true / [D] Button / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 154,
        parentId: 150,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'button-secondary',
        referenceOwnerPath: 'Size=56, Overflow=true / [D] Button',
        referenceOwnerRelativePath: 'LeftAddon / LeftAddon / Fixer / PaintMe',
      },
      'Size=56, Overflow=true / [D] Button',
      () => true,
    ),
    false,
    'Host-controlled descendant paths must keep the host reference instead of being overwritten by materialized nested descendants',
  );

  const duplicateNodes = [
    {
      id: 1,
      parentId: null,
      path: 'Root',
      type: 'FRAME',
      name: 'Root',
      visible: true,
      radius: null,
    },
    {
      id: 2,
      parentId: 1,
      path: 'Root / [D] Tag / Text / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: null,
    },
    {
      id: 3,
      parentId: 1,
      path: 'Root / [D] Tag / Text / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: null,
    },
  ];

  const duplicateKeyMap = occurrenceKeys.buildOccurrenceKeyMap(duplicateNodes);
  assert.equal(
    duplicateKeyMap.get(duplicateNodes[1]),
    'Root / [D] Tag / Text / Label',
    'First duplicate path must keep the base occurrence key',
  );
  assert.equal(
    duplicateKeyMap.get(duplicateNodes[2]),
    'Root / [D] Tag / Text / Label@@2',
    'Second duplicate path must get a stable occurrence suffix',
  );

  const hiddenDuplicateNodes = [
    {
      id: 1,
      parentId: null,
      path: 'Root',
      type: 'FRAME',
      name: 'Root',
      visible: true,
      radius: null,
    },
    {
      id: 2,
      parentId: 1,
      path: 'Root / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: null,
    },
    {
      id: 3,
      parentId: 1,
      path: 'Root / Label',
      type: 'TEXT',
      name: 'Label',
      visible: false,
      radius: null,
    },
    {
      id: 4,
      parentId: 1,
      path: 'Root / Label',
      type: 'TEXT',
      name: 'Label',
      visible: true,
      radius: null,
    },
  ];

  const hiddenDuplicateKeyMap = occurrenceKeys.buildOccurrenceKeyMap(hiddenDuplicateNodes);
  assert.equal(
    hiddenDuplicateKeyMap.get(hiddenDuplicateNodes[1]),
    'Root / Label',
    'First visible duplicate must keep the base occurrence key',
  );
  assert.equal(
    hiddenDuplicateKeyMap.get(hiddenDuplicateNodes[2]),
    'Root / Label@@hidden1',
    'Hidden duplicate must not consume a visible occurrence index',
  );
  assert.equal(
    hiddenDuplicateKeyMap.get(hiddenDuplicateNodes[3]),
    'Root / Label@@2',
    'Second visible duplicate must ignore hidden siblings when receiving occurrence suffixes',
  );

  const duplicateDiff = diff.diffStructures(
    [
      duplicateNodes[0],
      Object.assign({}, duplicateNodes[1], {
        fill: { color: 'rgba(255,255,255,0.94)', token: 'token-inverted' },
      }),
      Object.assign({}, duplicateNodes[2], {
        fill: { color: 'rgba(33,33,36,1)', token: 'token-primary' },
      }),
    ],
    [
      duplicateNodes[0],
      Object.assign({}, duplicateNodes[1], {
        fill: { color: 'rgba(33,33,36,1)', token: 'token-primary' },
      }),
      Object.assign({}, duplicateNodes[2], {
        fill: { color: 'rgba(33,33,36,1)', token: 'token-primary' },
      }),
    ],
    {
      resolveTokenLabel: (token) =>
        token === 'token-primary'
          ? 'text/primary'
          : token === 'token-inverted'
            ? 'text_inverted/primary'
            : token,
    },
  );

  assert.equal(
    duplicateDiff.diffs.length,
    1,
    'Duplicate sibling paths must be diffed independently instead of collapsing into one map entry',
  );
  assert.equal(
    duplicateDiff.diffs[0].message,
    'заливка: text/primary → text_inverted/primary',
    'Only the actual differing duplicate instance should surface as customization',
  );

  const hostNestedOwnerDiff = diff.diffStructures(
    [
      {
        id: 1,
        parentId: null,
        path: 'Size=56, Overflow=true',
        type: 'FRAME',
        name: 'Size=56, Overflow=true',
        visible: true,
        radius: null,
      },
      {
        id: 2,
        parentId: 1,
        path: 'Size=56, Overflow=true / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        radius: null,
        componentInstance: {
          componentKey: 'button-secondary',
          variantProperties: {
            View: 'Secondary',
            Size: '56',
            SingleIcon: 'True',
          },
        },
      },
      {
        id: 3,
        parentId: 2,
        path: 'Size=56, Overflow=true / [D] Button / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        radius: null,
        fill: {
          color: 'rgba(3,3,6,0.88)',
          token: 'text-primary',
        },
      },
    ],
    [
      {
        id: 1,
        parentId: null,
        path: 'Size=56, Overflow=true',
        type: 'FRAME',
        name: 'Size=56, Overflow=true',
        visible: true,
        radius: null,
      },
      {
        id: 2,
        parentId: 1,
        path: 'Size=56, Overflow=true / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        radius: null,
        referenceOrigin: 'host',
        componentInstance: {
          componentKey: 'button-secondary',
          variantProperties: {
            View: 'Secondary',
            Size: '56',
            SingleIcon: 'True',
          },
        },
      },
      {
        id: 3,
        parentId: 2,
        path: 'Size=56, Overflow=true / [D] Button / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        radius: null,
        referenceOrigin: 'host',
        fill: {
          color: 'rgba(255,255,255,0.94)',
          token: 'button-primary-text',
        },
      },
    ],
    {
      resolveTokenLabel: (token) => token,
    },
  );

  assert.equal(
    hostNestedOwnerDiff.diffs.length,
    1,
    'Host descendant diff under a nested instance root must still be detected',
  );
  assert.equal(
    hostNestedOwnerDiff.diffs[0].context.nestedOwnerComponentKey,
    'button-secondary',
    'Host descendant diffs must inherit the nearest nested instance owner component key',
  );
  assert.equal(
    hostNestedOwnerDiff.diffs[0].context.nestedOwnerRelativePath,
    'LeftAddon / LeftAddon / Fixer / PaintMe',
    'Host descendant diffs must inherit the nearest nested instance owner relative path',
  );

  const deps = {
    isPaintPathHostControlled: (componentKey, relativePath) =>
      componentKey === 'nested-a' && relativePath === 'PaintMe',
    isTextPathHostControlled: (componentKey, relativePath) =>
      componentKey === 'nested-a' && relativePath === 'Caption',
    isLayoutPathHostControlled: (componentKey, relativePath) =>
      componentKey === 'nested-a' && relativePath === '',
    resolveComponent: (key) => {
      if (key === 'variant-a') {
        return { key: 'family-a', platform: 'Desktop' };
      }
      if (key === 'variant-b') {
        return { key: 'family-a', platform: 'Desktop' };
      }
      if (key === 'variant-c') {
        return { key: 'family-b', platform: 'Desktop' };
      }
      return null;
    },
  };

  assert.deepEqual(
    suppressionPolicy.evaluateDiffSuppression(
      {
        message: 'заливка: neutral/0 → accent/secondary',
        diffKind: 'paint',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'nested-a',
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: 'Host / Nested',
          nestedOwnerRelativePath: 'PaintMe',
        },
      },
      deps,
    ),
    { suppressed: true, reason: 'host-controlled-paint' },
    'Host-controlled nested paint overrides must be suppressed',
  );

  assert.deepEqual(
    suppressionPolicy.evaluateDiffSuppression(
      {
        message: 'Стиль текст: body/m → body/s',
        diffKind: 'text-style',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'nested-component',
          nestedOwnerComponentKey: 'nested-a',
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: 'Host / Nested',
          nestedOwnerRelativePath: 'Caption',
        },
      },
      deps,
    ),
    { suppressed: true, reason: 'host-controlled-text' },
    'Host-controlled nested typography overrides must be suppressed',
  );

  assert.deepEqual(
    suppressionPolicy.evaluateDiffSuppression(
      {
        message: 'Паддинг left: 8 → 16',
        diffKind: 'layout',
        context: {
          actualComponentKey: 'variant-a',
          referenceComponentKey: 'variant-b',
          referenceOrigin: 'host',
          nestedOwnerComponentKey: 'nested-a',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Nested',
          nestedOwnerRelativePath: '',
        },
      },
      deps,
    ),
    { suppressed: true, reason: 'host-controlled-layout' },
    'Host-controlled nested layout overrides must be suppressed at root path too',
  );

  assert.deepEqual(
    suppressionPolicy.evaluateDiffSuppression(
      {
        message: 'Паддинг left: 8 → 16',
        diffKind: 'layout',
        context: {
          actualComponentKey: 'variant-a',
          referenceComponentKey: 'variant-b',
          referenceOrigin: 'host',
          nestedOwnerComponentKey: 'nested-b',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Nested',
          nestedOwnerRelativePath: '',
        },
      },
      deps,
    ),
    { suppressed: true, reason: 'nested-variant-root-switch' },
    'Nested root variant switches inside one family must be suppressed',
  );

  assert.deepEqual(
    suppressionPolicy.evaluateDiffSuppression(
      {
        message: 'Паддинг left: 8 → 16',
        diffKind: 'layout',
        context: {
          actualComponentKey: 'variant-a',
          referenceComponentKey: 'variant-c',
          referenceOrigin: 'host',
          nestedOwnerComponentKey: 'nested-b',
          nestedOwnerComponentRole: 'Main',
          nestedOwnerPath: 'Host / Nested',
          nestedOwnerRelativePath: '',
        },
      },
      deps,
    ),
    { suppressed: false, reason: null },
    'Different nested families must remain visible as real customization',
  );

  console.log('Nested variant and suppression policy regression checks passed');
}

main();
