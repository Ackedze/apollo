const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

function parseVariantName(name) {
  const result = {};

  for (const rawSegment of String(name ?? '').split(',')) {
    const segment = rawSegment.trim();
    if (!segment) {
      continue;
    }

    const separatorIndex = segment.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function chooseBestVariantByName(variants, sourceVariantName, defaultVariantName) {
  const sourceProperties = parseVariantName(sourceVariantName);
  const defaultProperties = parseVariantName(defaultVariantName);
  const sourceEntries = Object.entries(sourceProperties);

  const exact = variants.find((variant) => variant.name === sourceVariantName);
  if (exact) {
    return exact;
  }

  const compatible = variants
    .map((variant) => {
      const targetProperties = parseVariantName(variant.name);

      for (const [key, value] of sourceEntries) {
        if (targetProperties[key] !== value) {
          return null;
        }
      }

      let nonDefaultExtraCount = 0;
      let extraCount = 0;
      for (const [key, value] of Object.entries(targetProperties)) {
        if (key in sourceProperties) {
          continue;
        }

        extraCount += 1;
        if (defaultProperties[key] !== value) {
          nonDefaultExtraCount += 1;
        }
      }

      return {
        variant,
        nonDefaultExtraCount,
        extraCount,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.nonDefaultExtraCount !== right.nonDefaultExtraCount) {
        return left.nonDefaultExtraCount - right.nonDefaultExtraCount;
      }

      return left.extraCount - right.extraCount;
    });

  return compatible[0]?.variant ?? null;
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
  const matchedButtonVariant = chooseBestVariantByName(
    desktopBaseButton.variants,
    sourceButtonVariant,
    desktopBaseButton.variants[0].name,
  );
  assert.equal(matchedButtonVariant?.name, sourceButtonVariant);

  const sourceTagVariant =
    'View=Filled, Size=56, Shape=Rectangular, SelectedState=True, DisabledState=False';
  const defaultDesktopTagVariant = desktopBaseTag.variants.find(
    (variant) => variant.key === desktopBaseTag.defaultVariant,
  );
  const matchedTagVariant = chooseBestVariantByName(
    desktopBaseTag.variants,
    sourceTagVariant,
    defaultDesktopTagVariant?.name ?? desktopBaseTag.variants[0].name,
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

function main() {
  testPlatformAwareCounterparts();
  testVariantResolution();
  console.log('Themization regression checks passed');
}

main();
