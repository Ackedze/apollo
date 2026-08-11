const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadCorporateActionModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-corporate-component-action-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/actions/corporateComponentAction.ts'),
    ],
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

const {
  findBestCatalogVariantKey,
  getCorporateCounterpart,
  rebuildCorporateCounterpartIndex,
  resolveCorporateActionNodeById,
  restoreCompatibleInstanceProperties,
  snapshotInstanceComponentProperties,
  swapCorporateTarget,
} = loadCorporateActionModule();

const fixtures = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, 'fixtures/themization-catalogs.json'),
    'utf8',
  ),
);

function normalizeCorporateName(name) {
  return String(name ?? '')
    .replace(/🔄/g, ' ')
    .replace(/\[Corporate\]/gi, ' ')
    .replace(/\[(?:D|M)\]/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizePlatform(platform, name) {
  const normalizedPlatform = String(platform ?? '')
    .trim()
    .toLowerCase();

  if (normalizedPlatform === 'desktop') {
    return 'desktop';
  }

  if (
    normalizedPlatform === 'mobile web' ||
    normalizedPlatform === 'mobile-web'
  ) {
    return 'mobile-web';
  }

  const normalizedName = String(name ?? '').toLowerCase();

  if (normalizedName.includes('[d]')) {
    return 'desktop';
  }

  if (normalizedName.includes('[m]')) {
    return 'mobile-web';
  }

  return 'universal';
}

function buildIndexKey(name, platform, kind) {
  return `${normalizeCorporateName(name)}::${normalizePlatform(platform, name)}::${kind}`;
}

function testPlatformAwareCounterparts() {
  const buttonCatalog = fixtures.button;
  const tagCatalog = fixtures.tag;
  const index = new Map();

  for (const component of [...buttonCatalog.components, ...tagCatalog.components]) {
    if (!String(component.name).includes('[Corporate]') && !/\[(?:D|M)\]/i.test(String(component.name))) {
      continue;
    }

    if (String(component.name).includes('[Corporate]')) {
      index.set(buildIndexKey(component.name, component.platform, 'corp'), component.name);
    } else {
      index.set(buildIndexKey(component.name, component.platform, 'base'), component.name);
    }
  }

  assert.equal(
    index.get(buildIndexKey('🔄 [D][Corporate] Button', 'desktop', 'base')),
    '[D] Button',
  );
  assert.equal(
    index.get(buildIndexKey('🔄 [M][Corporate] Button', 'mobile-web', 'base')),
    '[M] Button',
  );
  assert.equal(
    index.get(buildIndexKey('🔄 [D][Corporate] Tag', 'desktop', 'base')),
    '[D] Tag',
  );
  assert.equal(
    index.get(buildIndexKey('🔄 [M][Corporate] Tag', 'mobile-web', 'base')),
    '[M] Tag',
  );

  rebuildCorporateCounterpartIndex([
    ...buttonCatalog.components,
    ...tagCatalog.components,
  ]);
  const desktopCorporateButton = buttonCatalog.components.find(
    (component) => component.name === '🔄 [D][Corporate] Button',
  );
  const desktopCounterpart = getCorporateCounterpart(desktopCorporateButton);
  assert.equal(
    desktopCounterpart?.base?.name,
    '[D] Button',
    'Rebuilt runtime counterpart index must retain the base desktop Button.',
  );
}

function testVariantResolution() {
  const buttonCatalog = fixtures.button;
  const tagCatalog = fixtures.tag;

  const desktopCorporateButton = buttonCatalog.components.find(
    (component) => component.name === '🔄 [D][Corporate] Button',
  );
  const desktopBaseButton = buttonCatalog.components.find(
    (component) => component.name === '[D] Button',
  );
  const desktopCorporateTag = tagCatalog.components.find(
    (component) => component.name === '🔄 [D][Corporate] Tag',
  );
  const desktopBaseTag = tagCatalog.components.find(
    (component) => component.name === '[D] Tag',
  );

  assert.ok(desktopCorporateButton && desktopBaseButton);
  assert.ok(desktopCorporateTag && desktopBaseTag);

  const sourceButtonVariant =
    'View=Accent, Size=72, Shape=Rectangular, SingleIcon=False, DisabledState=True';
  const matchedButtonKey = findBestCatalogVariantKey(
    desktopBaseButton,
    sourceButtonVariant,
  );
  const matchedButtonVariant = desktopBaseButton.variants.find(
    (variant) => variant.key === matchedButtonKey,
  );
  assert.equal(matchedButtonVariant?.name, sourceButtonVariant);

  const sourceTagVariant =
    'View=Filled, Size=56, Shape=Rectangular, SelectedState=True, DisabledState=False';
  const matchedTagKey = findBestCatalogVariantKey(
    desktopBaseTag,
    sourceTagVariant,
  );
  const matchedTagVariant = desktopBaseTag.variants.find(
    (variant) => variant.key === matchedTagKey,
  );
  assert.equal(
    matchedTagVariant?.name,
    'View=Filled, Size=56, Shape=Rectangular, SelectedState=True, DisabledState=False, SingleIcon=False, Indicator=Hidden',
  );

  const sourceCorporateTagVariant = desktopCorporateTag.variants.find(
    (variant) => variant.name === sourceTagVariant,
  );
  assert.ok(sourceCorporateTagVariant, 'Desktop corporate Tag fixture variant is missing');
}

function testCompatiblePropertyRestoration() {
  const sourceInstance = {
    componentProperties: {
      'Label#source': { type: 'TEXT', value: 'Оплатить' },
      'Disabled#source': { type: 'BOOLEAN', value: true },
      'View#source': { type: 'VARIANT', value: 'Accent' },
    },
  };
  const sourceProperties = snapshotInstanceComponentProperties(sourceInstance);
  const appliedUpdates = [];
  const targetInstance = {
    componentProperties: {
      'Label#target': { type: 'TEXT', value: 'Button' },
      'Disabled#target': { type: 'BOOLEAN', value: false },
      'View#target': { type: 'VARIANT', value: 'Primary' },
      'Icon#target': { type: 'INSTANCE_SWAP', value: 'icon-key' },
    },
    setProperties(updates) {
      appliedUpdates.push(updates);
    },
  };

  restoreCompatibleInstanceProperties(targetInstance, sourceProperties);
  assert.deepEqual(appliedUpdates, [
    {
      'Label#target': 'Оплатить',
      'Disabled#target': true,
      'View#target': 'Accent',
    },
  ]);
}

async function testNestedInstanceNodeResolution() {
  const nestedId = 'I11647:10616;37705:55361';
  const nestedInstance = {
    id: nestedId,
    name: '🔄 [D][Corporate] Button',
    type: 'INSTANCE',
  };
  const ownerInstance = {
    id: '11647:10616',
    type: 'INSTANCE',
    findOne(predicate) {
      return predicate(nestedInstance) ? nestedInstance : null;
    },
  };
  globalThis.figma = {
    getNodeByIdAsync: async (nodeId) =>
      nodeId === ownerInstance.id ? ownerInstance : null,
  };

  const resolved = await resolveCorporateActionNodeById(nestedId);
  assert.equal(
    resolved,
    nestedInstance,
    'A rendered instance sublayer must resolve through its owning instance.',
  );
  delete globalThis.figma;
}

async function testSuccessfulSwapSurvivesOverrideRestoreFailure() {
  const targetComponent = { key: 'base-variant-key' };
  let appliedComponent = null;
  const instance = {
    id: 'nested-button',
    componentProperties: {
      'Label#target': { type: 'TEXT', value: 'Button' },
    },
    swapComponent(component) {
      appliedComponent = component;
    },
    async getMainComponentAsync() {
      return appliedComponent;
    },
    setProperties() {
      throw new Error('override restore rejected');
    },
  };
  const attempts = [];
  const swapped = await swapCorporateTarget(
    instance,
    targetComponent,
    [
      {
        sourceKey: 'Label#source',
        canonicalName: 'Label',
        type: 'TEXT',
        value: 'Скачать отчёт',
      },
    ],
    'direct-variant',
    attempts,
  );

  assert.equal(
    swapped,
    true,
    'A verified component swap must stay successful when optional override restoration fails.',
  );
  assert.deepEqual(attempts, []);
}

async function main() {
  testPlatformAwareCounterparts();
  testVariantResolution();
  testCompatiblePropertyRestoration();
  await testNestedInstanceNodeResolution();
  await testSuccessfulSwapSurvivesOverrideRestoreFailure();
  console.log('Themization regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
