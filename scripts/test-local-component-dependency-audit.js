const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');

function loadModule() {
  const outfile = path.join(
    os.tmpdir(),
    `apollo-local-dependencies-${process.pid}-${Date.now()}.cjs`,
  );
  esbuild.buildSync({
    entryPoints: [
      path.resolve(__dirname, '../src/services/localComponentDependencyAudit.ts'),
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

function frame(id, children = [], visible = true) {
  return { id, name: id, type: 'FRAME', children, visible };
}

function component(id, children = [], remote = false) {
  return { id, name: id, type: 'COMPONENT', children, remote, visible: true };
}

function instance(id, mainComponent, children = []) {
  return {
    id,
    name: id,
    type: 'INSTANCE',
    children,
    visible: true,
    async getMainComponentAsync() {
      return mainComponent;
    },
  };
}

async function main() {
  const {
    extractInstanceSublayerSourceNodeIds,
    resolveLocalComponentDefinition,
    walkLocalComponentDependencies,
  } = loadModule();

  assert.deepEqual(
    extractInstanceSublayerSourceNodeIds(
      'I11281:68684;14:67168;74754:73724;54711:82220',
    ),
    ['14:67168', '74754:73724', '54711:82220'],
  );
  assert.deepEqual(
    extractInstanceSublayerSourceNodeIds('11301:64485'),
    [],
    'Independent nodes must not be treated as flattened source chains',
  );
  assert.deepEqual(
    extractInstanceSublayerSourceNodeIds('I1:2;invalid;3:4;3:4'),
    ['3:4'],
    'Malformed and duplicate source ids must be ignored',
  );

  const localDefinition = component('local-definition');
  const remoteDefinition = component('remote-definition', [], true);
  const definitionOptions = {
    getNodeType: (node) => node.type,
    getMainComponent: (node) => node.getMainComponentAsync(),
    isRemoteComponent: (node) => node.remote,
  };
  assert.equal(
    await resolveLocalComponentDefinition(localDefinition, definitionOptions),
    localDefinition,
    'A selected local ComponentNode must audit its own definition',
  );
  assert.equal(
    await resolveLocalComponentDefinition(
      instance('local-instance-with-reference-key', localDefinition),
      definitionOptions,
    ),
    localDefinition,
    'Native local ownership must not depend on catalog classification',
  );
  assert.equal(
    await resolveLocalComponentDefinition(
      instance('remote-instance', remoteDefinition),
      definitionOptions,
    ),
    null,
    'Remote library definitions must not be traversed as local sources',
  );
  assert.equal(
    await resolveLocalComponentDefinition(
      instance('unregistered-remote-instance', remoteDefinition),
      { ...definitionOptions, includeRemoteDefinition: true },
    ),
    remoteDefinition,
    'An unregistered remote wrapper may be traversed explicitly as the audit root',
  );
  const remoteCell = component('remote-cell', [], true);
  const remoteIcon = component('remote-icon', [], true);
  const nestedRemoteSublayer = instance('rendered-icon', remoteIcon);
  const sourceCell = instance('source-cell', remoteCell, [nestedRemoteSublayer]);
  const nestedLocal = component('nested-local', [
    instance('nested-source-cell', remoteCell),
  ]);
  const localRoot = component('local-root', [
    frame('cells', [sourceCell]),
    instance('nested-local-usage-a', nestedLocal),
    instance('nested-local-usage-b', nestedLocal),
    frame('hidden', [instance('hidden-cell', remoteCell)], false),
  ]);

  const dependencies = [];
  let activeDependencies = 0;
  let maxActiveDependencies = 0;
  const walkStats = await walkLocalComponentDependencies([localRoot, localRoot], {
    getNodeId: (node) => node.id,
    getNodeType: (node) => node.type,
    getChildren: (node) => node.children || [],
    getMainComponent: (node) => node.getMainComponentAsync(),
    isRemoteComponent: (node) => node.remote,
    isVisible: (node) => node.visible !== false,
    onRemoteDependency: async (node, owner) => {
      activeDependencies += 1;
      maxActiveDependencies = Math.max(
        maxActiveDependencies,
        activeDependencies,
      );
      await new Promise((resolve) => setTimeout(resolve, 2));
      dependencies.push(`${owner.id}:${node.id}`);
      activeDependencies -= 1;
    },
    dependencyConcurrency: 2,
    throwIfCancelled: () => {},
  });

  assert.deepEqual(dependencies.sort(), [
    'local-root:source-cell',
    'nested-local:nested-source-cell',
  ]);
  assert.equal(
    dependencies.some((entry) => entry.includes('rendered-icon')),
    false,
    'Remote component sublayers must not be traversed',
  );
  assert.equal(
    dependencies.some((entry) => entry.includes('hidden-cell')),
    false,
    'Invisible source branches must not be audited',
  );
  assert.equal(maxActiveDependencies, 2);
  assert.deepEqual(walkStats, {
    ownerDefinitions: 2,
    visitedSourceNodes: 5,
    remoteDependencies: 2,
  });

  console.log('Local component dependency audit regression checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
