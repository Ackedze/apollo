// NEXT-03 read-only handoff check. No target files, native nodes or release writes.
const fs = require('node:fs'), path = require('node:path');
async function inspectGenerationInputs(ports) {
  const report = {schemaVersion:'apollo.v4-generation-input-inspection.v1-experimental',targetProduct:'apollo-v4',
    apiAvailability:'unverified',sourceReadiness:'unverified',preflight:'blocked',
    actualTargets:{figma:'not-run',frontend:'not-run'},registry:null,diagnostics:[]};
  try {
    const observed = await ports.verifyCode();
    if (observed.status !== 'availability-pass' || observed.targetProduct !== 'apollo-v4' || observed.fullContractParity !== 'not-confirmed') throw Object.assign(new Error(),{code:'UNCONFIRMED_AVAILABILITY_RECEIPT'});
    report.apiAvailability = 'confirmed'; report.registry = observed.registry;
  } catch (error) {
    report.apiAvailability = 'blocked';report.diagnostics.push({stage:'availability',code:error.code || 'CODE_EVIDENCE_UNAVAILABLE'});return report;
  }
  try {
    await ports.verifySources(); report.sourceReadiness = 'ready';
    // This inventory check does not normalize/freeze a real ScreenSpec/plan.
    report.diagnostics.push({stage:'preflight',code:'PLAN_AND_MAPPING_NORMALIZATION_REQUIRED'});
  } catch (error) {
    report.sourceReadiness = 'blocked';report.diagnostics.push({stage:'source',code:error.code || 'SOURCE_GATE_REJECTED'});
  }
  return report;
}
async function main() {
  const args = process.argv.slice(2);
  if (!args[0] || !args[1] || args.length > 2) throw new Error('Usage: inspect-generation-inputs.js <arui-private checkout> <current-contract-packages>');
  const repo = path.resolve(args[0]), catalog = path.resolve(args[1]);
  const producerDirectory = path.join(repo,'tools/code-connect'), bridge = require(path.join(producerDirectory,'registry/consumer.cjs'));
  const registry = bridge.loadRegistry(), lock = JSON.parse(fs.readFileSync(path.join(producerDirectory,'registry/lock.v1.json'),'utf8'));
  const referenceNode = JSON.parse(fs.readFileSync(path.join(producerDirectory,'examples/pilot.desktop.plan.json'),'utf8'));
  const roots = new Map();
  function select(node) {
    const mapping = bridge.resolve(registry,node.mappingId,node.platform);
    const archiveFile = path.resolve(path.dirname(repo),mapping.contract.archivePath);
    if(path.dirname(archiveFile)!==catalog)throw Object.assign(new Error(),{code:'CONTRACT_CATALOG_MISMATCH'});
    roots.set(path.basename(archiveFile),{name:path.basename(archiveFile),archiveSha256:mapping.contract.archiveSha256});
    for(const slot of Object.values(node.slots||{}))for(const child of slot)if(child&&typeof child==='object')select(child);
  }
  select(referenceNode);
  const report = await inspectGenerationInputs({
    verifyCode() {
      const observed = bridge.preflight(registry,referenceNode,lock,{repo,workspaceRoot:path.dirname(repo)});
      return Object.assign({},observed,{registry:{schemaVersion:registry.schemaVersion,version:registry.registryVersion,digest:registry.registryDigest,
        codeVersion:registry.source.version,codeCommit:registry.source.commit,
        contractRevisions:registry.mappings.map(m=>({kind:m.kind,revision:m.contract.revision}))}});
    },
    async verifySources() {
      // Reuse G02's physical runtime identity / canonical source / ZIP pin gates.
      // The reference node is an API example; it is not a frozen product spec.
      await require("./generation-package-inputs").loadPinnedGenerationInputs(catalog,Array.from(roots.values()));
    },
  });
  console.log(JSON.stringify(report,null,2));
  if (report.sourceReadiness !== 'ready' || report.apiAvailability !== 'confirmed') process.exitCode = 2;
}
module.exports = {inspectGenerationInputs};
if (require.main === module) main().catch(error=>{console.error(error.code || 'GENERATION_INPUT_INSPECTION_FAILED');process.exitCode=1;});
