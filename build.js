const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const runNode = require('node:util').promisify(require('node:child_process').execFile);

const root = __dirname;
const repository = path.resolve(root, "./");
const coreRoot = path.join(repository, "./packages/component-contract-core");
const runtimePath = path.join(coreRoot, "./src/runtime.ts");
const dependenciesPath = path.join(coreRoot, "./src/component-dependencies.ts");
const representationPath = path.join(coreRoot, "./src/representation-evidence.ts");
const collectionsPath = path.join(coreRoot, "./src/member-collections.ts");
const compilerPath = path.join(coreRoot, "./src/compiler.ts");
const importerPath = path.join(coreRoot, "./src/importer.ts");
const zipPath = path.join(coreRoot, "./src/zip.ts");
const enginePath = path.join(coreRoot, "./predicate/index.js");
const registryPath = path.join(coreRoot, "./schemas/apollo-predicate-capabilities.v1.json");

const aliases = {
  '@apollo/component-contract-runtime': runtimePath,
  '@apollo/component-contract-dependencies': dependenciesPath,
  '@apollo/representation-evidence': representationPath,
  '@apollo/member-collections': collectionsPath,
  '@apollo/component-contract-compiler': compilerPath,
  '@apollo/component-contract-importer': importerPath,
  '@apollo/component-contract-zip': zipPath,
  '@apollo/predicate-engine': enginePath,
};

// Resolve canonical files through esbuild's normal resolver so their nearest
// tsconfig applies consistently to both aliased and relative imports.
function runtimeBuildOptions(write = true) {
  return {
    absWorkingDir: root,
    entryPoints: ['src/runtime.js'],
    outfile: path.join(root, "./dist/runtime.cjs"),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    metafile: true,
    alias: aliases,
    write,
  };
}

async function build() {
  await Promise.all(['component-contract-core/build.js', 'generation-core/build.js',
    'adapter-figma/build.js', 'adapter-frontend/build.js', 'pattern-core/build.cjs'].map(script =>
    runNode(process.execPath, [path.join(root, 'packages', script)], { cwd: root })));
  for (const file of [runtimePath, enginePath, registryPath]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Shared runtime source is missing: ${file}. See README.md.`);
    }
  }
  const dist = path.join(root, "./dist");
  fs.mkdirSync(dist, { recursive: true });
  const result = await esbuild.build(runtimeBuildOptions());
  const agentScopePath=process.env.APOLLO_AGENT_NATIVE_SCOPE_PATH;
  let agentScope=null,agentScopeInput=null;
  if(agentScopePath){const file=path.resolve(agentScopePath),bytes=fs.readFileSync(file);agentScope=JSON.parse(bytes);if(agentScope.schemaVersion!=='apollo.general-native-read-scope.v1'||agentScope.status!=='ADMITTED_CONFIGURATION_ONLY_ACTUAL_NATIVE_NOT_RUN'||agentScope.acceptedWriteOperations?.length!==0||agentScope.limits?.treeTraversal!==false||agentScope.limits?.maxNodes!==1||!Array.isArray(agentScope.destination?.allowedNodeIds)||agentScope.destination.allowedNodeIds.length!==1)throw Error('AGENT_NATIVE_SCOPE_INVALID');agentScopeInput={path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
  const agentProtocol=await esbuild.build({absWorkingDir:root,entryPoints:["src/generation/agent/protocol.js"],outfile:path.join(dist,'agent-protocol.cjs'),bundle:true,platform:'node',format:'cjs',target:['node18'],alias:aliases,metafile:true});
  const agentFigmaProtocol=await esbuild.build({absWorkingDir:root,entryPoints:["src/generation/agent/figma/protocol.js"],outfile:path.join(dist,'agent-figma-protocol.cjs'),bundle:true,platform:'node',format:'cjs',target:['node18'],alias:aliases,metafile:true});
  const agentFigmaPostconditions=await esbuild.build({absWorkingDir:root,entryPoints:["src/generation/agent/figma/postconditions.js"],outfile:path.join(dist,'agent-figma-postconditions.cjs'),bundle:true,platform:'node',format:'cjs',target:['node18'],alias:aliases,metafile:true});
  fs.writeFileSync(path.join(dist,'agent-figma-provider-descriptor.json'),JSON.stringify({schemaVersion:'apollo.agent-figma-provider-descriptor.v1',sourceHash:require(path.join(dist,'agent-figma-postconditions.cjs')).SOURCE_HASH,protocol:'agent-figma-protocol.cjs',postconditions:'agent-figma-postconditions.cjs',observation:'apollo.agent-figma-observation.v3',snapshot:'apollo.agent-figma-run-snapshot.v3',Ready:false},null,2)+'\n');
  const diagnosticInputs = await require("./scripts/native-diagnostic-inputs.cjs").prepareDiagnosticInputs(root);
  fs.writeFileSync(path.join(dist, 'native-diagnostic-inputs.json'), JSON.stringify(diagnosticInputs, null, 2) + '\n');
  const mainOptions = {
    absWorkingDir: root, entryPoints: ['src/code.ts'], outfile: path.join(dist, 'code.js'),
    bundle: true, platform: 'browser', format: 'iife', target: ['es2017'],
    supported: { 'object-rest-spread': false }, alias: aliases, metafile: true,
    define: { __APOLLO_AGENT_NATIVE_SCOPE__: JSON.stringify(agentScope), __APOLLO_NATIVE_DIAGNOSTIC_INPUTS__: JSON.stringify(diagnosticInputs), __APOLLO_NATIVE_BUILD_INPUTS_SHA__: '"pending"' },
  };
  const main = await esbuild.build(Object.assign({}, mainOptions, { write: false }));
  // Collect actual UI dependencies before sealing the build hash; the UI build uses that seal later.
  const uiOptions = {absWorkingDir: root, entryPoints: ['src/ui.js'], outfile: path.join(dist, 'ui.js'), loader: { '.module.css': 'local-css' }, bundle: true, platform: 'browser', format: 'iife', target: ['es2020'], write: false, alias: aliases, metafile: true, define: {'process.env.NODE_ENV': '"production"', __APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__: '"pending"'}};
  const uiInputs = await esbuild.build(uiOptions);
  const readPortInputs = ['build.js','scripts/contract-catalog.cjs','scripts/generation-package-inputs.js','scripts/load-generation-packages.js','scripts/static-producer-review-inputs.cjs','scripts/static-review-consumer-binding.cjs','src/ui.html',
    // Resolver/config metadata affects the actual UI bundle as well as imported JS/CSS bytes.
    'src/design-check/tsconfig.json','tsconfig.json','package.json','tsconfig.json','package.json',
    'scripts/agent-run-inputs.cjs','scripts/agent-figma-current-consumer.cjs','scripts/agent-generation-skills.cjs','instructions/agent-generation/skill-profile.json','scripts/agent-frontend-workspace.cjs','scripts/agent-page-background.cjs','instructions/agent-generation/frontend.md','instructions/agent-generation/figma.md','instructions/agent-generation/figma-owned.md','instructions/agent-generation/figma-owned-mapping.json','packages/generation-core/src/agent-types.ts','node_modules/react/package.json','node_modules/react-dom/package.json','node_modules/scheduler/package.json'];
  const inputs = Array.from(new Set(Object.keys(result.metafile.inputs).concat(Object.keys(main.metafile.inputs), Object.keys(uiInputs.metafile.inputs),Object.keys(agentProtocol.metafile.inputs),Object.keys(agentFigmaProtocol.metafile.inputs),Object.keys(agentFigmaPostconditions.metafile.inputs),readPortInputs))).filter(input => input !== '<define:__APOLLO_NATIVE_DIAGNOSTIC_INPUTS__>' && input !== '<define:__APOLLO_AGENT_NATIVE_SCOPE__>').sort().map((input) => {
    const absolutePath = path.resolve(root, input);
    if (path.relative(repository, absolutePath).startsWith('..')) {
      throw new Error(`Build reads code outside the Apollo repository: ${input}`);
    }
    const bytes = fs.readFileSync(absolutePath);
    return {
      path: path.relative(repository, absolutePath),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  });
  fs.writeFileSync(path.join(dist, 'build-inputs.json'), JSON.stringify({
    documentType: 'apollo-v4-local-build-inputs',
    runtimeVersion: JSON.parse(fs.readFileSync(path.join(coreRoot, "./package.json"))).version,
    profileVersion: require(path.join(dist, 'runtime.cjs')).RUNTIME_VERSION,
    agentNativeScopeInput:agentScopeInput,
    nativeDiagnosticInputsHash: require(path.join(dist, 'runtime.cjs')).contractHash(diagnosticInputs),
    inputs,
  }, null, 2) + '\n');
  const buildInputsHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, 'build-inputs.json'))).digest('hex');
  mainOptions.define.__APOLLO_NATIVE_BUILD_INPUTS_SHA__ = JSON.stringify(buildInputsHash);
  await esbuild.build(mainOptions);
  uiOptions.define.__APOLLO_STATIC_REVIEW_BUILD_INPUTS_SHA__ = JSON.stringify(buildInputsHash);
  const ui = await esbuild.build(uiOptions);
  fs.writeFileSync(path.join(dist, 'ui.html'), fs.readFileSync(path.join(root, "./src/ui.html"), 'utf8')
    .replace('__APOLLO_UI_CSS__', () => ui.outputFiles.find(file => file.path.endsWith('.css')).text.replace(/<\/style/gi, '<\\/style'))
    .replace('__APOLLO_UI__', () => ui.outputFiles.find(file => file.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script')));
  console.log('Apollo built from the shared ComponentContract core.');
}

module.exports = { runtimeBuildOptions };
if (require.main === module) build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
