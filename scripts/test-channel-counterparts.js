const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-channel-counterparts-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../src/reference/library.ts')],
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

function main() {
  const runtime = loadModule();
  runtime.__test_resetChannelCounterparts();
  runtime.__test_registerChannelCounterparts(
    {
      key: 'mobile-family',
      name: '[M] Button',
      variants: [
        {
          key: 'mobile-primary',
          channelCounterparts: {
            desktop: {
              componentKey: 'desktop-primary',
              componentName: '[D] Button',
            },
          },
        },
      ],
      channelCounterparts: {
        desktop: {
          componentKey: 'desktop-default',
          componentName: '[D] Button',
        },
      },
    },
    'Web :: Core',
  );

  assert.deepEqual(
    runtime.getChannelCounterpart('mobile-primary', 'Desktop'),
    {
      componentKey: 'desktop-primary',
      componentName: '[D] Button',
      platform: 'Desktop',
      library: 'Web :: Core',
    },
  );
  assert.equal(
    runtime.getChannelCounterpart('mobile-primary', 'Mobile Web'),
    null,
  );
  assert.deepEqual(
    runtime.getChannelCounterpart('mobile-family', 'Desktop'),
    {
      componentKey: 'desktop-default',
      componentName: '[D] Button',
      platform: 'Desktop',
      library: 'Web :: Core',
    },
  );

  console.log('Channel counterpart index regression checks passed');
}

main();
