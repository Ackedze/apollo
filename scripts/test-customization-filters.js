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

  const filtered = applyCustomizationFilters([
    makeDiff(
      '[D] HeadCellWeb / Text / RightAddon / RightAddon / StatusBadge / 🔩 Content / Fixer / PaintMe',
      'заливка: status/info → neutral-translucent/500',
    ),
    makeDiff(
      '[D] Select / Size=56 / Field / RightAddons / Arrow_Down / PaintMe',
      'заливка: text/info → neutral-translucent/700',
    ),
    makeDiff(
      '[D] SliderInput / Size=56 / Field / Lock / Lock / PaintMe',
      'заливка: text/info → neutral-translucent/700',
    ),
    makeDiff(
      '[D] Table / ColumnControl / [D] IconButton / 🔩 Icon / Fixer / PaintMe',
      'заливка: text/info → neutral-translucent/700',
    ),
    makeDiff(
      '[D] Dropdown / Content / Chevron / container / Fixer / PaintMe',
      'заливка: text/info → neutral-translucent/700',
    ),
    makeDiff(
      '[D] BodyActionCell :: Wide / Presets=PickerButton, Skeleton=False / PickerButton / 🔩 Icon / Fixer / PaintMe',
      'заливка: status/info → text/primary',
    ),
  ]);

  assert.equal(filtered.length, 0, 'Nested accessory PaintMe fill diffs must be suppressed');

  const preservedStandalone = applyCustomizationFilters([
    makeDiff(
      '[D] IconButton / 🔩 Icon / Fixer / PaintMe',
      'заливка: text/info → neutral-translucent/700',
    ),
    makeDiff(
      'Chevron / Open=False / container / Fixer / PaintMe',
      'заливка: text/info → neutral-translucent/700',
    ),
  ]);

  assert.equal(
    preservedStandalone.length,
    2,
    'Standalone accessory components must remain visible as real customizations',
  );

  const preservedStroke = applyCustomizationFilters([
    makeDiff(
      '[D] Select / Size=56 / Field / RightAddons / Arrow_Down / PaintMe',
      'обводка: text/info → neutral-translucent/700',
    ),
  ]);

  assert.equal(
    preservedStroke.length,
    1,
    'Nested accessory suppression must not hide non-fill paint differences',
  );

  console.log('Customization filter regression checks passed');
}

main();
