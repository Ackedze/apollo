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
    'Direct variant key must remain the highest-priority match when no variantProperties are available',
  );

  assert.equal(
    library.resolveVariantKeyForInstance(component, 'radio-default', {
      SelectedState: 'True',
      Type: 'Radio',
      View: 'Desktop',
      Preset: 'Default',
    }),
    'radio-selected',
    'Variant properties must override stale direct variant keys from slot instances',
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

  const mergedInstanceRoot = nestedReferenceMerge.mergeMaterializedInstanceReferenceNode(
    {
      path: 'Size=56, Overflow=false / [D] Button',
      type: 'INSTANCE',
      name: '[D] Button',
      visible: true,
      id: 50,
      parentId: 1,
      referenceOrigin: 'host',
      componentInstance: {
        variantProperties: {
          DisabledState: 'False',
          Shape: 'Rectangular',
          SingleIcon: 'False',
          Size: '56',
          View: 'Secondary',
        },
      },
    },
    {
      path: 'Size=56, Overflow=false / [D] Button',
      type: 'INSTANCE',
      name: '[D] Button',
      visible: true,
      id: 150,
      parentId: 100,
      referenceOrigin: 'nested-component',
      referenceOwnerComponentKey: 'button-secondary',
      referenceOwnerPath: 'Size=56, Overflow=false / [D] Button',
      referenceOwnerRelativePath: '',
      componentInstance: {
        componentKey: 'button-secondary',
      },
    },
    {
      preferCandidate: true,
      reason: 'replace-instance-root',
      existingOrigin: 'host',
      candidateOrigin: 'nested-component',
      ownerComponentKey: 'button-secondary',
      relativePath: '',
      withinMaterializedSubtree: true,
    },
  );
  assert.deepEqual(
    mergedInstanceRoot.componentInstance.variantProperties,
    {
      DisabledState: 'False',
      Shape: 'Rectangular',
      SingleIcon: 'False',
      Size: '56',
      View: 'Secondary',
    },
    'Replacing a materialized host instance root must preserve host variantProperties as reference baseline',
  );
  assert.equal(
    mergedInstanceRoot.componentInstance.componentKey,
    'button-secondary',
    'Nested candidate component key must be preserved while host variantProperties become the expected state',
  );

  const mergedHostDescendantRoot = nestedReferenceMerge.mergeMaterializedInstanceReferenceNode(
    {
      path: 'Size=56, Overflow=false / [D] Button',
      type: 'INSTANCE',
      name: '[D] Button',
      visible: true,
      id: 51,
      parentId: 1,
      referenceOrigin: 'host',
      componentInstance: {
        variantProperties: {
          DisabledState: 'False',
          Shape: 'Rectangular',
          SingleIcon: 'False',
          Size: '56',
          View: 'Secondary',
        },
      },
    },
    {
      path: 'Size=56, Overflow=false / [D] Button',
      type: 'INSTANCE',
      name: '[D] Button',
      visible: true,
      id: 151,
      parentId: 100,
      referenceOrigin: 'nested-component',
      referenceOwnerComponentKey: 'button-secondary',
      referenceOwnerPath: 'Size=56, Overflow=false / [D] Button',
      referenceOwnerRelativePath: '',
      componentInstance: {
        componentKey: 'button-secondary',
        variantProperties: {
          DisabledState: 'False',
          Shape: 'Rectangular',
          SingleIcon: 'True',
          Size: '56',
          View: 'Secondary',
        },
      },
    },
    {
      preferCandidate: true,
      reason: 'replace-host-descendant',
      existingOrigin: 'host',
      candidateOrigin: 'nested-component',
      ownerComponentKey: 'button-secondary',
      relativePath: '',
      withinMaterializedSubtree: true,
    },
  );
  assert.deepEqual(
    mergedHostDescendantRoot.componentInstance.variantProperties,
    {
      DisabledState: 'False',
      Shape: 'Rectangular',
      SingleIcon: 'False',
      Size: '56',
      View: 'Secondary',
    },
    'Root-level replace-host-descendant must also preserve host variantProperties as the reference baseline',
  );

  const baselineApplied = nestedReferenceMerge.applyMaterializedHostVariantBaselines(
    [
      {
        path: 'Size=56, Overflow=false / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        id: 150,
        parentId: 100,
        referenceOrigin: 'nested-component',
        componentInstance: {
          componentKey: 'button-primary',
        },
      },
      {
        path: 'Size=56, Overflow=false / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        id: 151,
        parentId: 100,
        referenceOrigin: 'nested-component',
        componentInstance: {
          componentKey: 'button-secondary',
        },
      },
      {
        path: 'Size=56, Overflow=false / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        id: 152,
        parentId: 100,
        referenceOrigin: 'nested-component',
        componentInstance: {
          componentKey: 'button-secondary',
        },
      },
    ],
    [
      {
        path: 'Size=56, Overflow=false / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        id: 50,
        parentId: 1,
        referenceOrigin: 'host',
        componentInstance: {
          variantProperties: { SingleIcon: 'False', View: 'Primary' },
        },
      },
      {
        path: 'Size=56, Overflow=false / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        id: 51,
        parentId: 1,
        referenceOrigin: 'host',
        componentInstance: {
          variantProperties: { SingleIcon: 'False', View: 'Secondary' },
        },
      },
      {
        path: 'Size=56, Overflow=false / [D] Button',
        type: 'INSTANCE',
        name: '[D] Button',
        visible: true,
        id: 52,
        parentId: 1,
        referenceOrigin: 'host',
        componentInstance: {
          variantProperties: { SingleIcon: 'False', View: 'Secondary' },
        },
      },
    ],
  );
  assert.deepEqual(
    baselineApplied[2].componentInstance.variantProperties,
    { SingleIcon: 'False', View: 'Secondary' },
    'Host variantProperties must be restored by occurrence even when root replacement did not merge them earlier',
  );
  assert.equal(
    baselineApplied[2].componentInstance.componentKey,
    'button-secondary',
    'Occurrence baseline restore must preserve nested candidate componentKey',
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

  const hostPaintedDecision =
    nestedReferenceMerge.getMaterializedInstanceReferenceDecision(
      {
        path: 'View=Primary / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 54,
        parentId: 50,
        referenceOrigin: 'host',
        fill: {
          token: 'Button/Desktop/Primary/text',
        },
      },
      {
        path: 'View=Primary / LeftAddon / LeftAddon / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 154,
        parentId: 150,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'addon-icon-16',
        referenceOwnerPath: 'View=Primary / LeftAddon / LeftAddon',
        referenceOwnerRelativePath: 'Fixer / PaintMe',
        fill: {
          token: 'status/info',
        },
      },
      'View=Primary / LeftAddon / LeftAddon',
      () => false,
    );

  assert.equal(
    hostPaintedDecision.preferCandidate,
    false,
    'Host-painted descendants must keep the host token as expected value',
  );
  assert.equal(
    hostPaintedDecision.reason,
    'keep-host-painted-descendant',
    'Host-painted descendant merge must report why standalone nested paint was ignored',
  );

  for (const path of [
    'View=Filled / LeftAddon / LeftAddon / Fixer / PaintMe',
    'View=Filled / Icon / Fixer / PaintMe',
    'Size=56, View=Primary / Icon / Fixer / PaintMe',
    'View=Primary / Bg / Fixer / PaintMe',
    'SelectedState=false / Arrow / Fixer / PaintMe',
  ]) {
    const decision = nestedReferenceMerge.getMaterializedInstanceReferenceDecision(
      {
        path,
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 54,
        parentId: 50,
        referenceOrigin: 'host',
        fill: {
          token: 'Host/View/text',
        },
      },
      {
        path,
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 154,
        parentId: 150,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'paintable-part',
        referenceOwnerPath: path.split(' / ').slice(0, -2).join(' / '),
        referenceOwnerRelativePath: path.split(' / ').slice(-2).join(' / '),
        fill: {
          token: 'status/info',
        },
      },
      path.split(' / ').slice(0, -2).join(' / '),
      () => false,
    );

    assert.equal(
      decision.reason,
      'keep-host-painted-descendant',
      `Host-painted descendant merge must keep host expected paint for ${path}`,
    );
  }

  const nestedHostControlledPaintDecision =
    nestedReferenceMerge.getMaterializedInstanceReferenceDecision(
      {
        path:
          'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 54,
        parentId: 50,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'filter-company-select',
        referenceOwnerPath: 'View=xLarge / [D] FilterCompanySelect_Single',
        referenceOwnerRelativePath: '[D] CompactTag / Arrow / Fixer / PaintMe',
        fill: {
          token: 'text/primary',
        },
      },
      {
        path:
          'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 154,
        parentId: 150,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'filter-tag-arrow-open-false',
        referenceOwnerPath:
          'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow',
        referenceOwnerRelativePath: 'Fixer / PaintMe',
        fill: {
          token: 'text/info',
        },
      },
      'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow',
      (ownerComponentKey, relativePath) =>
        ownerComponentKey === 'filter-tag-arrow-open-false' &&
        relativePath === 'Fixer / PaintMe',
    );

  assert.equal(
    nestedHostControlledPaintDecision.preferCandidate,
    false,
    'Deeper standalone materialization must not overwrite parent host-controlled paint',
  );
  assert.equal(
    nestedHostControlledPaintDecision.reason,
    'keep-host-controlled-descendant',
    'Nested host-controlled paint must report why parent expected token was kept',
  );

  const componentQualifiedNestedPaintDecision =
    nestedReferenceMerge.getMaterializedInstanceReferenceDecision(
      {
        path:
          'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 254,
        parentId: 250,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'filter-company-select',
        referenceOwnerPath: 'View=xLarge / [D] FilterCompanySelect_Single',
        referenceOwnerRelativePath: '[D] CompactTag / Arrow / Fixer / PaintMe',
        fill: {
          token: 'text/primary',
        },
      },
      {
        path:
          'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow / Fixer / PaintMe',
        type: 'BOOLEAN_OPERATION',
        name: 'PaintMe',
        visible: true,
        id: 354,
        parentId: 350,
        referenceOrigin: 'nested-component',
        referenceOwnerComponentKey: 'filter-tag-arrow-open-false',
        referenceOwnerPath:
          'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow',
        referenceOwnerRelativePath: 'Fixer / PaintMe',
        fill: {
          token: 'text/info',
        },
      },
      'View=xLarge / [D] FilterCompanySelect_Single / [D] CompactTag / Arrow',
      () => false,
    );

  assert.equal(
    componentQualifiedNestedPaintDecision.preferCandidate,
    false,
    'Component-qualified parent nested paint must remain the expected value even without policy registry hit',
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

  const nonColorPaintTokenDiff = diff.diffStructures(
    [
      {
        id: 1,
        parentId: null,
        path: 'ChatBubbleView',
        type: 'FRAME',
        name: 'ChatBubbleView',
        visible: true,
        radius: null,
      },
      {
        id: 2,
        parentId: 1,
        path: 'ChatBubbleView / Message Text',
        type: 'TEXT',
        name: 'Message Text',
        visible: true,
        radius: null,
        fill: {
          color: 'rgba(3,3,6,0.88)',
          token: 'token-typography-float',
        },
      },
    ],
    [
      {
        id: 1,
        parentId: null,
        path: 'ChatBubbleView',
        type: 'FRAME',
        name: 'ChatBubbleView',
        visible: true,
        radius: null,
      },
      {
        id: 2,
        parentId: 1,
        path: 'ChatBubbleView / Message Text',
        type: 'TEXT',
        name: 'Message Text',
        visible: true,
        radius: null,
        styles: {
          fill: {
            styleKey: 'S:6313f5ef73de1fb787861cd6e0408c77214b7898,8790:1',
          },
        },
      },
    ],
    {
      resolveTokenLabel: (token) =>
        token === 'token-typography-float' ? 'regular_letter_spacing/16' : token,
      resolveStyleLabel: (styleKey) =>
        styleKey === 'S:6313f5ef73de1fb787861cd6e0408c77214b7898,8790:1'
          ? 'text/primary'
          : styleKey,
      isPaintToken: (token) => token !== 'token-typography-float',
    },
  );

  assert.equal(
    nonColorPaintTokenDiff.diffs.some(
      (diffEntry) =>
        diffEntry.message === 'Стиль заливка: text/primary → rgba(3,3,6,0.88)',
    ),
    true,
    'Missing paint style binding must reuse the actual paint value inside the style diff',
  );
  assert.equal(
    nonColorPaintTokenDiff.diffs.some(
      (diffEntry) =>
        diffEntry.message === 'заливка: text/primary → rgba(3,3,6,0.88)',
    ),
    false,
    'Paint diff must not duplicate the same style-binding loss',
  );
  assert.equal(
    nonColorPaintTokenDiff.diffs.some((diffEntry) =>
      diffEntry.message.includes('regular_letter_spacing/16'),
    ),
    false,
    'Typography FLOAT variables must never be rendered as paint token diffs',
  );
  assert.equal(
    nonColorPaintTokenDiff.diffs.length,
    1,
    'Style-binding loss must surface as a single customization entry',
  );

  const addedFillWithoutReferenceDiff = diff.diffStructures(
    [
      {
        id: 1,
        parentId: null,
        path: 'Position=Level 1 (outer)',
        type: 'INSTANCE',
        name: 'Position=Level 1 (outer)',
        visible: true,
        radius: null,
        fill: {
          color: 'rgba(255,0,0,1)',
        },
      },
    ],
    [
      {
        id: 1,
        parentId: null,
        path: 'Position=Level 1 (outer)',
        type: 'COMPONENT',
        name: 'Position=Level 1 (outer)',
        visible: true,
        radius: null,
      },
    ],
    {
      strict: true,
    },
  );

  assert.equal(
    addedFillWithoutReferenceDiff.diffs.length,
    1,
    'Added fill on a node without reference fill must still be treated as customization',
  );
  assert.equal(
    addedFillWithoutReferenceDiff.diffs[0].message,
    'заливка: — → #FF0000',
    'Added fill must be rendered as a paint addition diff',
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
  assert.equal(
    hostNestedOwnerDiff.diffs[0].context.actualNestedOwnerComponentKey,
    'button-secondary',
    'Host descendant diffs must also expose the nearest actual nested instance owner component key',
  );
  assert.equal(
    hostNestedOwnerDiff.diffs[0].context.actualNestedOwnerRelativePath,
    'LeftAddon / LeftAddon / Fixer / PaintMe',
    'Host descendant diffs must also expose the nearest actual nested instance owner relative path',
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
      if (key === 'style-level-1') {
        return { key: 'style-level-1', platform: 'Desktop' };
      }
      if (key === 'style-secondary') {
        return { key: 'style-level-1', platform: 'Desktop' };
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
        message: 'заливка: Button/Desktop/Primary/text → decorative/green',
        diffKind: 'paint',
        context: {
          actualComponentKey: null,
          referenceComponentKey: null,
          referenceOrigin: 'host',
          nestedOwnerComponentKey: 'nested-a',
          nestedOwnerComponentRole: 'Part',
          nestedOwnerPath: 'Host / Nested',
          nestedOwnerRelativePath: 'PaintMe',
        },
      },
      deps,
    ),
    { suppressed: false, reason: null },
    'Manual paint changes against host reference must remain visible',
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

  library.__test_resetHostControlledNestedPathPolicies();
  library.__test_registerHostControlledNestedPath(
    'paint',
    ['addon-icon-24', 'addon-family'],
    'Fixer / PaintMe',
  );

  assert.equal(
    library.isNestedComponentPaintPathHostControlled(
      'addon-icon-24',
      'Fixer / PaintMe',
    ),
    true,
    'Host-controlled nested paint path must resolve by variant key',
  );

  assert.equal(
    library.isNestedComponentPaintPathHostControlled(
      'addon-family',
      'Fixer / PaintMe',
    ),
    true,
    'Host-controlled nested paint path must also resolve by family key alias',
  );

  const backgroundPlate = {
    key: 'background-plate',
    name: '[D] BackgroundPlate',
    structure: [
      {
        id: 1,
        parentId: null,
        path: 'Position=Level 1 (outer)',
        type: 'INSTANCE',
        name: 'Position=Level 1 (outer)',
        visible: true,
        radius: null,
      },
      {
        id: 2,
        parentId: 1,
        path: 'Position=Level 1 (outer) / [D] Style Level 1',
        type: 'INSTANCE',
        name: '[D] Style Level 1',
        visible: true,
        radius: null,
        componentInstance: {
          variantProperties: {
            BackgroundColor: 'base-bg-alt (gray)',
            Skeleton: 'False',
            Type: 'Primary',
          },
        },
        fill: { token: 'base-bg-alt-secondary' },
      },
    ],
  };
  const styleLevel = {
    key: 'style-level-1',
    name: '[D] Style Level 1',
    variants: [
      {
        key: 'style-primary',
        name: 'BackgroundColor=base-bg-alt (gray), Type=Primary, Skeleton=False',
        properties: {
          BackgroundColor: 'base-bg-alt (gray)',
          Skeleton: 'False',
          Type: 'Primary',
        },
      },
      {
        key: 'style-secondary',
        name: 'BackgroundColor=base-bg-alt (gray), Type=Secondary, Skeleton=False',
        properties: {
          BackgroundColor: 'base-bg-alt (gray)',
          Skeleton: 'False',
          Type: 'Secondary',
        },
      },
    ],
  };

  library.__test_hydrateNestedInstanceComponentKeys(backgroundPlate, [
    backgroundPlate,
    styleLevel,
  ]);

  assert.equal(
    backgroundPlate.structure[1].componentInstance.componentKey,
    'style-level-1',
    'Missing nested component keys must be restored from unique component names',
  );

  const nestedVariantDiff = diff.diffStructures(
    [
      Object.assign({}, backgroundPlate.structure[0], {
        nodeId: 'actual-root',
      }),
      Object.assign({}, backgroundPlate.structure[1], {
        nodeId: 'actual-style',
        componentInstance: {
          componentKey: 'style-secondary',
          variantProperties: {
            BackgroundColor: 'base-bg-alt (gray)',
            Skeleton: 'False',
            Type: 'Secondary',
          },
        },
        fill: { token: 'neutral-translucent-100' },
      }),
    ],
    backgroundPlate.structure,
    {
      resolveTokenLabel(token) {
        return {
          'base-bg-alt-secondary': 'base-bg-alt/secondary',
          'neutral-translucent-100': 'neutral-translucent/100',
        }[token] ?? token;
      },
    },
  ).diffs.find((entry) => entry.message.includes('заливка:'));

  assert.equal(
    nestedVariantDiff?.message,
    'заливка: base-bg-alt/secondary → neutral-translucent/100',
    'Nested Style Level variant switch reproduces the BackgroundPlate fill diff before suppression',
  );
  assert.deepEqual(
    suppressionPolicy.evaluateDiffSuppression(nestedVariantDiff, deps),
    { suppressed: true, reason: 'nested-variant-root-switch' },
    'Allowed nested Style Level variant switches inside BackgroundPlate must not surface as fill customizations',
  );

  console.log('Nested variant and suppression policy regression checks passed');
}

main();
