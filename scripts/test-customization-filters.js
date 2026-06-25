const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadCustomizationFilters() {
  const entryPoint = path.resolve(__dirname, '../src/filters/customizationFilters.ts');
  const outfile = path.join(
    os.tmpdir(),
    `apollo-customization-filters-${process.pid}-${Date.now()}.cjs`,
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

function makeDiff(nodePath, message) {
  return {
    nodeName: 'PaintMe',
    nodePath,
    message,
  };
}

function main() {
  const { applyCustomizationFilters } = loadCustomizationFilters();

  const filteredSandbox = applyCustomizationFilters([
    {
      nodeName: '.Grid',
      nodePath: '[D] Sandbox / .Grid',
      message: 'заливка: token/a → token/b',
    },
    {
      nodeName: '❌template',
      nodePath: '[D] Sandbox / ❌template',
      message: 'заливка: token/a → token/b',
    },
  ]);

  assert.equal(
    filteredSandbox.length,
    0,
    'Sandbox template diffs must remain suppressed',
  );

  const suppressedPartPolicy = applyCustomizationFilters([
    Object.assign(
      makeDiff(
        '[D] UniversalDateInput / Field / RightAddons / Picker / PaintMe',
        'заливка: text/info → neutral/700',
      ),
      {
        suppressAsHostControlledNestedProperty: true,
      },
    ),
    {
      nodeName: 'Caption',
      nodePath: 'Open=true / body / AccordionBody / Row 1 / Content / Caption',
      message: 'Стиль текст: body/m/regular → body/s/regular',
      suppressAsHostControlledNestedProperty: true,
    },
    {
      nodeName: '[D] TitleAddonXL',
      nodePath: '[D] TitleView / View=xLarge, Skeleton=False / MainContent / Heading / [D] TitleAddonXL',
      message: 'Паддинг left: 8 → 16',
      suppressAsHostControlledNestedProperty: true,
    },
  ]);

  assert.equal(
    suppressedPartPolicy.length,
    3,
    'Host-controlled diffs must remain available for contextual assessment',
  );

  const preservedWithoutPolicyFlag = applyCustomizationFilters([
    makeDiff(
      '[D] UniversalDateInput / Field / RightAddons / Picker / PaintMe',
      'заливка: text/info → neutral/700',
    ),
  ]);

  assert.equal(
    preservedWithoutPolicyFlag.length,
    1,
    'Path-based regex suppression must no longer hide diffs without the universal policy flag',
  );

  console.log('Customization filter regression checks passed');
}

main();
