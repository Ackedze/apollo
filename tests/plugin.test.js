const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { contract } = require("./fixtures");
const authored = require("./authoring-fixtures");
const code = fs.readFileSync(path.join(__dirname, "../dist/code.js"), 'utf8');

function plugin(options = {}) {
  const messages = [], created = [], pages = [], handlers = {};
  const page = { id: 'page', type: 'PAGE', selection: [] };
  const main = { id: 'main', key: options.key || 'test-key', componentPropertyDefinitions: {} };
  const childMain = { id: 'child-main', key: 'child-key', componentPropertyDefinitions: {} };
  const ownerMain = { id: 'owner-main', key: 'owner-key', parent: { type: 'COMPONENT_SET', key: 'owner-set', componentPropertyDefinitions: { Type: { type: 'VARIANT', defaultValue: 'Child' } } } };
  const nodes = new Map();
  function instance(id, opacity) {
    const node = { id, name: 'Test', type: 'INSTANCE', parent: page, visible: true, children: [],
      componentProperties: {}, componentPropertyReferences: {}, resolvedVariableModes: {},
      width: 24, height: 24, x: 0, y: 0, opacity, fills: [], strokes: [], effects: [],
      getMainComponentAsync: async () => { if (options.onMainRead) await options.onMainRead(node); return main; },
      setProperties() {}, setExplicitVariableModeForCollection() {},
      exportAsync: async () => { if (options.onPreview) await options.onPreview(node); if (options.mutateDuringPreview) actual.opacity = .2; if (options.previewError) throw new Error('preview failed'); return new Uint8Array([1]); },
      remove() { this.removed = true; },
    };
    nodes.set(id, node); return node;
  }
  function children(root, prefix, opacity) {
    for (const [index, side] of ['Left', 'Right'].entries()) {
      const frame = { id: `${prefix}-${side}`, name: side, type: 'FRAME', visible: true, parent: root, children: [],
        componentPropertyReferences: {}, resolvedVariableModes: {}, width: 24, height: 24, x: 0, y: 0, opacity: 1, fills: [], strokes: [], effects: [] };
      const owner = instance(`${prefix}-${side}-owner`, 1); owner.name = 'Owner'; owner.parent = frame;
      owner.componentProperties = { Type: { type: 'VARIANT', value: 'Child' } }; owner.getMainComponentAsync = async () => ownerMain;
      const child = instance(`${prefix}-${side}-child`, index === 0 ? opacity : 1); child.name = 'Child'; child.parent = owner;
      child.getMainComponentAsync = async () => options.missingChildMain && prefix === 'actual' ? null : childMain;
      root.children.push(frame); frame.children.push(owner); owner.children.push(child); nodes.set(frame.id, frame);
    }
  }
  function internalParts(root, prefix) {
    for (let index = 0; index < (options.internalParts || 0); index++) {
      const part = instance(`${prefix}-part-${index}`, 1); part.name = `Part ${index}`; part.parent = root;
      const partMain = { id: `part-main-${index}`, key: `part-key-${index}`, componentPropertyDefinitions: {} };
      partMain.createInstance = () => { const reference = instance(`part-reference-${created.length}`, 1); reference.getMainComponentAsync = async () => partMain; created.push(reference); return reference; };
      part.getMainComponentAsync = async () => partMain;
      root.children.push(part);
    }
  }
  const actual = instance('actual', options.opacity ?? 1); page.selection = [actual];
  function slot(root) {
    if (!options.nativeSlot) return;
    const body = { id: `I${root.id};body`, name: 'Body', type: 'SLOT', parent: root, visible: true,
      componentPropertyReferences: { slotContentId: 'Body#1' }, resolvedVariableModes: {}, children: [] };
    const payload = { id: `${body.id};payload`, name: 'Payload', type: 'FRAME', parent: body, visible: true,
      componentPropertyReferences: {}, resolvedVariableModes: {}, children: [], opacity: 1 };
    body.children.push(payload); root.children.push(body); root.componentProperties['Body#1'] = { type: 'SLOT' };
    nodes.set(body.id, body); nodes.set(payload.id, payload);
  }
  slot(actual);
  if (options.nativeSlot) main.componentPropertyDefinitions['Body#1'] = { type: 'SLOT' };
  internalParts(actual, 'actual');
  if (options.dependencies) children(actual, 'actual', options.childOpacity ?? 1);
  main.createInstance = () => { const node = instance('reference', 1); slot(node); internalParts(node, 'reference'); if (options.dependencies) children(node, 'reference', 1); created.push(node); return node; };
  childMain.createInstance = () => { if (options.childReferenceError) throw new Error('Child reference unavailable'); const node = instance(`child-reference-${created.length}`, 1); node.getMainComponentAsync = async () => childMain; created.push(node); return node; };
  const figma = { currentPage: page, root: { name: 'Test file' }, fileKey: 'file', mixed: Symbol('mixed'),
    clientStorage: options.storage, showUI() {}, on(name, handler) { handlers[name] = handler; },
    ui: { resize: options.resize, postMessage(value) { messages.push(JSON.parse(JSON.stringify(value))); } },
    base64Encode(bytes) { return Buffer.from(bytes).toString('base64'); },
    getNodeByIdAsync: async id => nodes.get(id), viewport: { scrollAndZoomIntoView() {} },
    getStyleByIdAsync: async () => null,
    variables: { getVariableCollectionByIdAsync: async () => null, getVariableByIdAsync: async () => null },
    createPage() { const p = { id: 'temp', type: 'PAGE', appendChild(node) { node.parent = p; }, remove() { p.removed = true; } }; pages.push(p); return p; },
  };
  const Clock = options.now ? class extends Date { constructor(...args) { super(...(args.length ? args : [0])); } static now() { return options.now(); } } : Date;
  vm.runInNewContext(options.sourceCode || code, { figma, __html__: '', setTimeout, clearTimeout, TextEncoder, Date: Clock });
  const transportMessages=[];
  const send = async value => {
    await figma.ui.onmessage(value);
    for(const m of messages.filter(m=>m.type==='audit-result'&&m.audit.schemaVersion==='apollo.audit-summary.v1')) {
      transportMessages.push(JSON.parse(JSON.stringify(m)));
      if(!options.summaryOnly)m.audit=await require("./full-audit.fixture.cjs").fullAudit(figma,messages,m.audit);
    }
  };
  function frame(id, children, type = 'FRAME') {
    const node = { id, name: id, type, parent: page, children, visible: true, x: 0, y: 0, width: 100, height: 100 };
    for (const child of children) child.parent = node;
    nodes.set(id, node); return node;
  }
  return { send, messages, transportMessages, actual, created, pages, figma, handlers, instance, frame };
}

test('main source and bundle contain no object spread and build needs only repository sources', () => {
  for (const [filename, kind] of [['src/code.ts', ts.ScriptKind.TS], ['dist/code.js', ts.ScriptKind.JS]]) {
    const source = ts.createSourceFile(filename, fs.readFileSync(path.join(__dirname, "..", filename), 'utf8'), ts.ScriptTarget.Latest, true, kind);
    function visit(node) { assert.notEqual(node.kind, ts.SyntaxKind.SpreadAssignment); ts.forEachChild(node, visit); } visit(source);
  }
  const inputs = require("../dist/build-inputs.json").inputs;
  assert.ok(inputs.length > 10);
  assert.ok(inputs.every(input => !input.path.startsWith('..') && !input.path.includes('ComponentContractEditor') && !input.path.includes('apollo-proxy')));
});
test('actual bundled audit posts readable style metadata outside canonical evidence', async () => {
  const p = plugin({ opacity: .5 }), api = require("../dist/runtime.cjs"), source = authored.source();
  const key = 'b'.repeat(40), id = `S:${key},1:2`;
  p.actual.fillStyleId = id;
  p.figma.getStyleByIdAsync = async value => value === id ? { id, key, name: 'Surface/Primary' } : null;
  await p.send({ type: 'load-contract', source }); await p.send({ type: 'audit', requestId: 'display-sidecar' });
  const reply = p.messages.find(m => m.type === 'audit-result');
  assert.ok(reply, JSON.stringify(p.messages));
  assert.equal(reply.displayMetadata.schemaVersion, 'apollo.audit-display-metadata.v1');
  assert.equal(reply.displayMetadata.resources[0].name, 'Surface/Primary');
  assert.equal(reply.audit.result.engine.evaluations[0].classification, 'violation');
  assert.equal(reply.audit.snapshot.nodes[0].appearance.fillStyleId, id);
  assert.equal(reply.audit.displayMetadata, undefined); assert.equal(reply.audit.snapshot.displayMetadata, undefined);
  assert.equal(p.actual.fillStyleId, id); assert.ok(p.created.every(node => node.removed));
});
test('metadata reads cannot hide a property mutation before final audit delivery', async () => {
  const p = plugin({ opacity: .5 }), source = authored.source(), key = 'b'.repeat(40), id = `S:${key},1:2`;
  p.actual.fillStyleId = id;
  p.figma.getStyleByIdAsync = async () => { p.actual.opacity = .3; return { id, key, name: 'Surface/Primary' }; };
  await p.send({ type: 'load-contract', source }); await p.send({ type: 'audit', requestId: 'metadata-mutation' });
  assert.ok(p.messages.some(m=>m.type==='audit-recovery'));const fresh=p.messages.find(m=>m.type==='audit-result');assert.ok(fresh);assert.ok(fresh.audit.snapshot.nodes.some(n=>n.appearance?.opacity===.3));
});

for (const mutation of [null, 'during-final', 'before-final']) test(`SLOT freshness keeps the captured representation and detects mutations: ${mutation}`, async () => {
  let reads = 0, p;
  p = plugin({ nativeSlot: true, onMainRead(node) {
    if (node === p.actual && ++reads === 4 && mutation === 'during-final') p.actual.children[0].opacity = .5;
  } });
  if (mutation === 'before-final') {
    const key = 'b'.repeat(40); p.actual.fillStyleId = `S:${key},1:2`;
    p.figma.getStyleByIdAsync = async id => { p.actual.children[0].opacity = .5; return {id,key,name:'Synthetic surface'}; };
  }
  const source = authored.source();
  source.manual.representations.push({ id: 'frontend', kind: 'code', platform: 'desktop', status: 'draft',
    locator: { packageName: 'synthetic-ui', importPath: 'synthetic-ui/test', exportName: 'Test' } });
  source.manual.targets.push({ id: 'body', semanticRole: 'body', label: 'Body', pathHint: 'Test / Body', lineage: [], resolution: 'resolved' });
  source.manual.rules.push({ id: 'body-content', targetId: 'body', targetScope: 'self', capability: 'composition.content', permission: 'allowed',
    controlPaths: [{ kind: 'slot-api', required: true, exclusive: true, target: 'body', property: 'Body#1', contentOwnership: 'external' }],
    constraints: [], applicability: { variants: 'all', modes: 'all', platforms: ['desktop'] },
    rationale: 'Synthetic caller-owned slot content.', status: 'reviewed', execution: { route: 'auto' }, owner: 'test-author' });
  await p.send({ type: 'load-contract', source });
  assert.equal(p.messages.some(m => m.type === 'error'), false, JSON.stringify(p.messages));
  await p.send({ type: 'audit', requestId: 'shared-slot-boundary' });
  if (mutation) {
    const recovery=p.messages.find(m=>m.type==='audit-recovery');assert.ok(recovery);assert.equal(recovery.diagnostic.code,'AUDIT_CONTEXT_CHANGED');
    const fresh=p.messages.find(m=>m.type==='audit-result');assert.ok(fresh);assert.ok(fresh.audit.snapshot.nodes.some(n=>n.appearance?.opacity===.5));assert.ok(p.created.every(n=>n.removed));return;
  }
  assert.deepEqual(p.messages.filter(m => m.type === 'error'), []);
  const result = p.messages.find(m => m.type === 'audit-result'); assert.ok(result);
  assert.equal(result.audit.snapshot.source.representationId, 'figma');
  assert.equal(result.audit.snapshot.source.nativeSlotCaptureScope.omissions.length, 1);
  assert.equal(result.audit.snapshot.nodes.length, 2);
  assert.equal(p.actual.children[0].children.length, 1);
  await p.send({ type: 'focus-scope', auditId: result.audit.auditId, nodeId: 'actual' });
  assert.deepEqual(p.messages.filter(m => m.type === 'error'), []);
});

for (const [label, opacity, expected] of [['PASS', 1, 'compliant'], ['FAIL', .5, 'violation']]) {
  test(`actual bundled plugin captures independent reference and produces ${label}`, async () => {
    const p = plugin({ opacity });
    const api = require("../dist/runtime.cjs"), source = authored.source();
    source.manual.semantics.purpose = 'Синтетическая проверка Unicode 🙂';
    const loaded = api.loadAuthoringSource(source);
    await p.send({ type: 'load-contract', source, release: { id: 'synthetic-release', channel: 'local-pilot',
      contractId: loaded.contract.package.id, contractHash: api.contractHash(loaded.contract),
      sourceHash: loaded.sourceHash, manualSourceHash: loaded.contract.package.manualSourceHash } });
    await p.send({ type: 'audit', requestId: 'one' });
    const result = p.messages.find(m => m.type === 'audit-result');
    assert.ok(result, JSON.stringify(p.messages));
    assert.equal(result.audit.result.engine.evaluations[0].classification, expected);
    if(expected==='compliant')assert.equal(result.rules.length,0);
    else {assert.deepEqual(result.rules[0].assert,loaded.contract.rules[0].assert);assert.equal(result.rules[0].effect,loaded.contract.rules[0].effect);assert.equal(result.rules[0].componentScopeId,'actual');}
    assert.equal(p.actual.opacity, opacity);
    assert.equal(result.audit.snapshot.nodes[0].baseline.effective.appearance.opacity, 1);
    assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
    await p.send({ type: 'focus', auditId: result.audit.auditId, evaluationId: result.audit.result.engine.evaluations[0].evaluationId });
    assert.equal(p.figma.currentPage.selection[0].id, 'actual');
    await p.send({ type: 'focus', auditId: 'stale', evaluationId: 'unknown' });
    assert.match(p.messages.at(-1).message, /устарел/);
  });
}

test('a mutation inside initial capture is rejected by the final freshness read', async () => {
  let armed = false, opacity = .5, p;
  p = plugin({onMainRead: node => { if (node.id === 'reference') armed = true; }});
  Object.defineProperty(p.actual, 'opacity', {get() { const value = opacity; if (armed) { armed = false; opacity = .2; } return value; }, set(value) { opacity = value; }});
  await p.send({type:'load-contract', source:authored.source()}); await p.send({type:'audit',requestId:'initial-mutation'});
  assert.ok(p.messages.some(m=>m.type==='audit-recovery'));const fresh=p.messages.find(m=>m.type==='audit-result');assert.ok(fresh);assert.ok(fresh.audit.snapshot.nodes.some(n=>n.appearance?.opacity===.2));
  assert.ok(p.created.every(n=>n.removed)); assert.ok(p.pages.every(n=>n.removed));
});

test('layout changed during freshness read never publishes success and always cleans temporary nodes', async () => {
    let reads = 0, p;
    p = plugin({ onMainRead: node => { if (node.id === 'actual' && ++reads === 4) p.actual.opacity = .2; } }); await p.send({ type: 'load-contract', source: authored.source() }); await p.send({ type: 'audit', requestId: 'one' });
    assert.ok(p.messages.some(m=>m.type==='audit-recovery'));const fresh=p.messages.find(m=>m.type==='audit-result');assert.ok(fresh);assert.ok(fresh.audit.snapshot.nodes.some(n=>n.appearance?.opacity===.2));
    assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

for (const [label, options, reason] of [
  ['foreign identity', { key: 'foreign' }, 'contract-not-found'],
]) test(`${label} is an explicit incomplete area gap and cleans temporary nodes`, async () => {
  const p = plugin(options); await p.send({ type: 'load-contract', source: authored.source() });
  await p.send({ type: 'audit', requestId: 'one' });
  const { audit } = p.messages.find(m => m.type === 'audit-result');
  assert.equal(audit.result.coverage.executionComplete, false);
  assert.equal(audit.notChecked[0].reason, reason);
  assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

test('release checksum mismatch cannot replace a loaded contract', async () => {
  const p = plugin(); await p.send({ type: 'load-contract', source: authored.source(), release: { contractHash: 'bad' } });
  assert.equal(p.messages.filter(m => m.type === 'contract-loaded').length, 0);
  assert.match(p.messages.at(-1).message, /не совпадает/);
});

test('compiled-only messages and forged source pins cannot load a contract', async () => {
  const runtime = require("../dist/runtime.cjs"), source = authored.source();
  const loaded = runtime.loadAuthoringSource(source);
  for (const message of [
    { type: 'load-contract', contract: contract() },
    { type: 'load-contract', source, release: { contractHash: runtime.contractHash(loaded.contract), sourceHash: 'bad', manualSourceHash: loaded.contract.package.manualSourceHash } },
  ]) {
    const p = plugin(); await p.send(message);
    assert.equal(p.messages.filter(m => m.type === 'contract-loaded').length, 0);
    assert.equal(p.messages.at(-1).type, 'error');
  }
});

test('bundled main captures both child baselines and focuses the original nested instance', async () => {
  const { dependencyFixture } = require("./dependency-fixtures");
  const document = dependencyFixture().host;
  const p = plugin({ key: 'host-key', dependencies: true, childOpacity: .4 });
  await p.send({ type: 'load-contract', source: authored.nested().source }); await p.send({ type: 'audit', requestId: 'nested' });
  const result = p.messages.find(m => m.type === 'audit-result'); assert.ok(result, JSON.stringify(p.messages));
  assert.equal(result.audit.snapshot.componentDependencyCaptures.length, 2);
  assert.deepEqual(result.audit.result.engine.dependencyRuns.map(r => r.status), ['executed', 'executed']);
  const failure = result.audit.result.engine.evaluations.find(e => e.dependency && e.classification === 'violation');
  assert.ok(failure); assert.equal(failure.ruleId, 'test.child.opacity.1.1');
  assert.ok(result.rules.some(r => r.ruleId === failure.ruleId));
  await p.send({ type: 'focus', auditId: result.audit.auditId, evaluationId: failure.evaluationId });
  assert.equal(p.figma.currentPage.selection[0].id, 'actual-Left-child');
  assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

test('failed child reference produces an incomplete audit and cleans the host reference', async () => {
  const { dependencyFixture } = require("./dependency-fixtures");
  const p = plugin({ key: 'host-key', dependencies: true, childReferenceError: true });
  await p.send({ type: 'load-contract', source: authored.nested().source }); await p.send({ type: 'audit', requestId: 'nested' });
  const result = p.messages.find(m => m.type === 'audit-result'); assert.ok(result, JSON.stringify(p.messages));
  assert.equal(result.audit.result.coverage.executionComplete, false);
  assert.ok(result.audit.result.engine.dependencyRuns.every(run => run.status === 'not-executed'));
  assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

const api = require("../dist/runtime.cjs");
function proxyReply(request, sources) {
  const releaseId = 'e'.repeat(64), contracts = [], resolutions = [];
  for (const identity of request.components) {
    const source = sources.find(source => {
      const keys = api.collectContractKeys(api.loadAuthoringSource(source).contract);
      return keys.has(identity.componentKey) || keys.has(identity.componentSetKey);
    });
    if (!source) { resolutions.push(Object.assign({}, identity, { status: 'not-found' })); continue; }
    const loaded = api.loadAuthoringSource(source), contract = loaded.contract;
    const release = { id: releaseId, channel: 'local-pilot', contractId: contract.package.id,
      sourceHash: loaded.sourceHash, manualSourceHash: contract.package.manualSourceHash, contractHash: api.contractHash(contract) };
    if (!contracts.some(item => item.release.contractId === release.contractId)) contracts.push({ source, release });
    resolutions.push(Object.assign({}, identity, { status: 'resolved', contractId: contract.package.id }));
  }
  return { releaseId, contracts, resolutions };
}
async function proxyAudit(p, sources = [authored.source()], alter) {
  p.messages.length = 0;
  let done = false;
  const running = p.send({ type: 'audit', requestId: 'auto', ...(p.connectCatalogs ? {connectCatalogs:true} : {}) }).finally(() => { done = true; });
  const seen = new Set();
  for (let turn = 0; !done && turn < 200; turn++) {
    for (const request of p.messages.filter(m => m.type === 'resolve-contracts')) if (!seen.has(request.requestId)) {
      seen.add(request.requestId);
      const data = proxyReply(request, sources);
      const reply = { type: 'contracts-resolved', requestId: request.requestId, data };
      if (alter) alter(reply, request);
      await p.send(reply);
    }
    await new Promise(resolve => setTimeout(resolve,1));
  }
  if(!done){await p.send({type:'audit-cancel',requestId:'auto'});await running;}
  for (const request of p.messages.filter(m => m.type === 'resolve-contracts')) if (!seen.has(request.requestId))
    await p.send({ type: 'contracts-resolved', requestId: request.requestId, error: 'test interrupted' });
  assert.equal(done, true, 'Proxy handshake must finish'); await running;
  return p.messages.find(m => m.type === 'audit-result')?.audit;
}

test('current source main routes only proved direct raw owners and keeps the standalone child audit',async()=>{
  const root=path.join(__dirname,'..'),esbuild=require('esbuild'),options=require('../build').runtimeBuildOptions(false);
  const built=await esbuild.build({absWorkingDir:root,entryPoints:['src/code.ts'],bundle:true,write:false,platform:'browser',format:'iife',target:['es2017'],
    supported:{'object-rest-spread':false},alias:options.alias,define:{__APOLLO_PROGRESSBAR_PILOT__:'true',__APOLLO_AGENT_NATIVE_SCOPE__:'null',__APOLLO_NATIVE_DIAGNOSTIC_INPUTS__:'null',__APOLLO_NATIVE_BUILD_INPUTS_SHA__:'"synthetic-source-fixture"'},
    plugins:[{name:'synthetic-capture-input',setup(build){build.onLoad({filter:/[\\/]src[\\/]audit-catalog\.ts$/},()=>({contents:"import {collectAnatomy} from '../packages/component-contract-core/src/figma-capture'; export async function captureCatalogAudit(subject,contract){const observed=await collectAnatomy(subject,contract.facts.component.platform,{});return figma.syntheticRawCapture(subject,contract,observed.anatomy);}",loader:'ts'}));}}]});
  const A='a'.repeat(40),C='c'.repeat(40),H='1'.repeat(64),copy=v=>JSON.parse(JSON.stringify(v));
  const parent=authored.source(),child=authored.source();
  for(const [s,key,id]of [[parent,A,'fixture.raw-parent'],[child,C,'fixture.raw-child']]){
    s.manual.component.componentId=s.manual.component.contractId=s.manual.component.familyId=id;s.manual.component.componentKey=key;
    s.manual.representations[0].locator={componentKey:key};s.variantEvidence.variants[0].componentKey=key;s.variantEvidence.variants[0].componentSetKey=key;
  }
  parent.manual.targets.push({id:'child',semanticRole:'child',pathHint:'Test / Child',resolution:'resolved',lineage:[]});
  parent.manual.rules[0].targetScope='self-and-descendants';
  for(const supported of [true,false]){
    const p=plugin({sourceCode:built.outputFiles[0].text,key:A}),nested=p.instance('nested',1);
    nested.name='Child';nested.parent=p.actual;nested.getMainComponentAsync=async()=>({key:C,id:'nested-main',componentPropertyDefinitions:{}});p.actual.children.push(nested);p.connectCatalogs=true;
    p.figma.syntheticRawCapture=(subject,contract,anatomy)=>{
      const host=subject.id==='actual',snapshot={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:'2026-10-01T00:00:00Z',selection:['root'],context:{platform:'desktop',modes:{},unknownFacts:[]},
        source:{rootNodeId:subject.id,componentKey:host?A:C,componentSetKey:'',representationId:'figma',fileKey:'file',pageId:'page',truncated:false,occurrenceAddressVersion:1,propertyReferenceIdentityVersion:1,instanceIdentityVersion:1,
          captureTopology:{complete:true,issues:[]},catalogueNodeIds:host?{root:'actual',child:'nested'}:{root:'nested'},catalogReference:{referenceHash:host?H:'2'.repeat(64),releaseId:'e'.repeat(64)}},
        nodes:[{id:'root',name:host?'Test':'Child',type:'INSTANCE',parentId:null,childIds:host?['child']:[],visible:true,resolvedModes:{},appearance:{opacity:1},
          component:{identity:{componentKey:host?A:C,componentSetKey:''},properties:{},propertyTypes:{},propertyReferenceBindings:{}},unknownFacts:[]}]};
      if(host)snapshot.nodes.push(Object.assign(copy(snapshot.nodes[0]),{id:'child',name:'Child',parentId:'root',childIds:[],component:{identity:{componentKey:C,componentSetKey:''},properties:{},propertyTypes:{},propertyReferenceBindings:{}}}));
      const base=copy(snapshot);base.source.rawCatalogue={referenceHash:snapshot.source.catalogReference.referenceHash,manualSourceHash:contract.package.manualSourceHash,compiledContractHash:api.contractHash(contract),
        catalog:{file:host?'parent.json':'child.json',sha256:H},representationId:'figma',paths:host?{root:'',child:'Child'}:{root:''},families:{[A]:'',[C]:''}};
      if(!supported&&host)base.source.rawCatalogue.compiledContractHash='9'.repeat(64);
      const ids=Object.fromEntries(snapshot.nodes.map(n=>[n.id,anatomy.find(a=>a.figmaNodeId===snapshot.source.catalogueNodeIds[n.id]).id]));
      for(const s of [snapshot,base]){s.selection=s.selection.map(id=>ids[id]);for(const n of s.nodes){n.id=ids[n.id];n.parentId=n.parentId===null?null:ids[n.parentId];n.childIds=n.childIds.map(id=>ids[id]);}s.source.catalogueNodeIds=Object.fromEntries(Object.entries(s.source.catalogueNodeIds).map(([id,native])=>[ids[id],native]));}
      base.source.rawCatalogue.paths=Object.fromEntries(Object.entries(base.source.rawCatalogue.paths).map(([id,p])=>[ids[id],p]));
      snapshot.rawCatalogueReference={base};return {snapshot,anatomy,warnings:[],unmatchedBaselineNodeIds:[]};
    };
    const audit=await proxyAudit(p,[parent,child]);assert.ok(audit,JSON.stringify(p.messages));
    assert.equal(audit.components.length,2);assert.equal(Boolean(audit.components[1].ownerContext),supported);
    assert(audit.components.every(c=>c.result.engine.evaluations.length>0));assert.equal(audit.notChecked.length,0);
    assert.equal(p.created.length,0);assert.equal(p.pages.length,0);
  }
});

test('a selected section fetches once per key, checks repeated instances and marks missing contracts', async () => {
  const p = plugin({ opacity: .5 }), second = p.instance('second', .3), foreign = p.instance('foreign', 1);
  foreign.getMainComponentAsync = async () => ({ key: 'missing-key' });
  const hidden = p.frame('hidden', [p.instance('hidden-child', 1)]); hidden.visible = false;
  const section = p.frame('section', [p.actual, second, foreign, hidden], 'SECTION');
  p.figma.currentPage.selection = [section, p.actual]; await p.send({ type: 'ready' });
  assert.equal(p.messages.at(-1).valid, true);
  const audit = await proxyAudit(p);
  assert.equal(audit.components.length, 2); assert.equal(audit.notChecked.length, 1);
  assert.equal(audit.selection.components.length, 3); assert.equal(audit.selection.roots.length, 1);
  assert.equal(audit.notChecked[0].nodeId, 'foreign'); assert.equal(audit.result.coverage.executionComplete, false);
  const requests = p.messages.filter(m => m.type === 'resolve-contracts');
  assert.equal(requests.length, 2); assert.equal(requests[0].components.length, 2);
  assert.deepEqual(requests[1].components, []); assert.equal(requests[1].releaseId, audit.release.id);
  const evaluations = audit.result.engine.evaluations;
  assert.equal(evaluations.length, 2); assert.equal(new Set(evaluations.map(e => e.evaluationId)).size, 2);
  for (const entry of evaluations) {
    await p.send({ type: 'focus', auditId: audit.auditId, evaluationId: entry.evaluationId });
    assert.equal(p.figma.currentPage.selection[0].id, entry.componentScopeId);
  }
  await p.send({ type: 'focus-scope', auditId: audit.auditId, nodeId: 'foreign' });
  assert.equal(p.figma.currentPage.selection[0].id, 'foreign');
});

test('multiple selected roots complete an automatic area audit without a manually loaded contract', async () => {
  const p = plugin(), second = p.instance('second', 1);
  p.figma.currentPage.selection = [p.actual, p.frame('group', [second], 'GROUP')];
  const audit = await proxyAudit(p);
  assert.equal(audit.components.length, 2); assert.equal(audit.result.coverage.executionComplete, true);
  assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

test('built area audit waits for a cold source beyond the former 1200ms cutoff', async () => {
  let reads=0;
  const p=plugin({onMainRead:()=>{if(++reads===1)return new Promise(resolve=>setTimeout(resolve,1300));}});
  await p.send({type:'load-contract',source:authored.source()});
  await p.send({type:'audit',requestId:'cold-source'});
  const reply=p.messages.find(m=>m.type==='audit-result');
  assert.ok(reply,JSON.stringify(p.messages));
  assert.equal(reply.audit.components.length,1);
  assert.equal(reply.audit.result.coverage.executionComplete,true);
  assert.equal(reply.audit.notChecked.length,0);
});

test('built area audit reports native read failures with node diagnostics instead of a traversal limit', async () => {
  const p=plugin({onMainRead:()=>{throw Error('source access denied');}});
  await p.send({type:'audit',requestId:'failed-source'});
  const reply=p.messages.find(m=>m.type==='audit-result');
  assert.ok(reply,JSON.stringify(p.messages));
  const audit=reply.audit;
  assert.equal(audit.result.coverage.executionComplete,false);
  assert.equal(audit.notChecked[0].reason,'identity-read-failed');
  assert.equal(audit.notChecked[0].identityRead.error,'source access denied');
  assert.match(audit.notChecked[0].message,/AREA_IDENTITY_READ_FAILED · узел actual/);
  assert.ok(audit.warnings.some(w=>w.includes('AREA_IDENTITY_READ_FAILED')));
  assert.ok(audit.warnings.every(w=>!w.includes('Обход области остановлен')));
  assert.equal(p.messages.filter(m=>m.type==='resolve-contracts').length,0);
});

test('capture failure of one instance preserves another checked instance as a partial result', async () => {
  let reads = 0;
  const p = plugin({ onMainRead: node => { if (node.id === 'actual' && ++reads === 2) throw new Error('synthetic capture unavailable'); } });
  p.figma.currentPage.selection = [p.frame('area', [p.actual, p.instance('second', 1)])];
  const audit = await proxyAudit(p);
  assert.equal(audit.components.length, 1); assert.equal(audit.notChecked[0].reason, 'capture-failed');
  assert.equal(audit.result.coverage.executionComplete, false);
  assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

test('an earlier instance changed while a later scope captures cannot publish a stale area result', async () => {
  let reads = 0, p;
  p = plugin({ onMainRead: node => { if (node.id === 'second' && ++reads === 2) p.actual.opacity = .2; } });
  p.figma.currentPage.selection = [p.frame('area', [p.actual, p.instance('second', 1)])];
  const fresh=await proxyAudit(p);assert.ok(fresh);assert.ok(p.messages.some(m=>m.type==='audit-recovery'));assert.ok(fresh.components.find(c=>c.scopeId==='actual').snapshot.nodes.some(n=>n.appearance?.opacity===.2));
});

test('deselection during contract resolution preserves captured roots and rejects foreign late replies', async t => {
  const p=plugin();await p.send({type:'ready'});const running=p.send({type:'audit',requestId:'pending'});
  t.after(async()=>{await p.send({type:'audit-cancel',requestId:'pending'});await running;});
  const nextRequest=async previous=>{
    const deadline=Date.now()+2000;
    let request;
    while(!(request=p.messages.find(m=>m.type==='resolve-contracts'&&m.requestId!==previous))&&Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,1));
    assert.ok(request,'Proxy request must arrive after host yields');return request;
  };
  const request=await nextRequest();p.figma.currentPage.selection=[];p.handlers.selectionchange();
  await p.send({type:'contracts-resolved',requestId:'foreign',data:proxyReply(request,[authored.source()])});assert.equal(p.messages.some(m=>m.type==='audit-result'),false);
  await p.send({type:'contracts-resolved',requestId:request.requestId,data:proxyReply(request,[authored.source()])});
  const verify=await nextRequest(request.requestId);await p.send({type:'contracts-resolved',requestId:verify.requestId,data:proxyReply(verify,[authored.source()])});await running;
  const result=p.messages.find(m=>m.type==='audit-result');assert.ok(result);assert.equal(result.audit.selection.roots[0].nodeId,'actual');
  await p.send({type:'focus-scope',auditId:result.audit.auditId,nodeId:'actual'});assert.equal(p.figma.currentPage.selection[0].id,'actual');
});

test('contract cancellation acknowledges only after pending work exits; a late reply cannot restore it',async()=>{
 const p=plugin();const running=p.send({type:'audit',requestId:'cancel'}),deadline=Date.now()+2000;
 try {
  // Immediate-turn counts can expire before the cooperative reader's timer runs.
  while(!p.messages.some(m=>m.type==='resolve-contracts')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,1));
  const request=p.messages.find(m=>m.type==='resolve-contracts');assert.ok(request);
  await p.send({type:'audit-cancel',requestId:'foreign'});assert.equal(p.messages.some(m=>m.type==='audit-cancelled'),false);await p.send({type:'audit-cancel',requestId:'cancel'});await running;assert.ok(p.messages.some(m=>m.type==='audit-cancelled'&&m.requestId==='cancel'));await p.send({type:'contracts-resolved',requestId:request.requestId,data:proxyReply(request,[authored.source()])});assert.equal(p.messages.some(m=>m.type==='audit-result'),false);
 } finally { await p.send({type:'audit-cancel',requestId:'cancel'});await running; }
});

for (const [label, alter] of [
  ['incomplete resolution list', (reply, request) => { if (request.components.length) reply.data.resolutions = []; }],
  ['forged source pin', (reply, request) => { if (request.components.length) reply.data.contracts[0].release.sourceHash = 'bad'; }],
  ['changed release on final verification', (reply, request) => { if (!request.components.length) { reply.error = 'Версия контрактов изменилась.'; } }],
]) test(`${label} cannot publish a result`, async () => {
  const p = plugin(); assert.equal(await proxyAudit(p, [authored.source()], alter), undefined);
  if(label==='changed release on final verification'){assert.ok(p.messages.some(m=>m.type==='audit-recovery'));assert.ok(p.messages.some(m=>m.type==='audit-cancelled'));}else assert.equal(p.messages.at(-1).type,'error');
});

test('empty areas and component definitions remain explicitly incomplete', async () => {
  const p = plugin(); p.figma.currentPage.selection = [p.frame('empty', [])];
  const empty = await proxyAudit(p); assert.equal(empty.result.coverage.executionComplete, false);
  assert.equal(p.messages.some(m => m.type === 'resolve-contracts'), false);
  const master = p.frame('master', [], 'COMPONENT'); master.key = 'test-key';
  p.figma.currentPage.selection = [master];
  const audit = await proxyAudit(p); assert.equal(audit.notChecked[0].reason, 'component-definition');
});

test('fixed child occurrences are checked by their parent dependency without a duplicate standalone audit', async () => {
  const p = plugin({ key: 'host-key', dependencies: true });
  const sources = authored.nested();
  const audit = await proxyAudit(p, [sources.source, sources.childSource]);
  assert.equal(audit.components.length, 1); assert.equal(audit.governedComponents.length, 2);
  assert.ok(audit.notChecked.every(gap => gap.componentKey === 'owner-key'));
  assert.deepEqual(audit.result.engine.dependencyRuns.map(run => run.status), ['executed', 'executed']);
});

test('properties changed during final release verification cannot escape the final fact recheck', async () => {
  const p = plugin();
  const audit = await proxyAudit(p, [authored.source()], (reply, request) => {
    if (!request.components.length) p.actual.opacity = .2;
  });
  assert.ok(audit);assert.ok(p.messages.some(m=>m.type==='audit-recovery'));assert.ok(audit.snapshot.nodes.some(n=>n.appearance?.opacity===.2));
});

test('area membership changed during the final request invalidates the report', async () => {
  const p = plugin(), frame = p.frame('area', [p.actual]); p.figma.currentPage.selection = [frame];let changed=false;
  const audit = await proxyAudit(p, [authored.source()], (reply, request) => {
    if (!request.components.length&&!changed) {changed=true; const child = p.instance('new-child', 1); child.parent = frame; frame.children.push(child); }
  });
  assert.ok(audit);assert.ok(audit.components.some(c=>c.scopeId==='new-child'));assert.ok(p.messages.some(m=>m.type==='audit-recovery'));
});


// BUG-002: synthetic host-owned parts; no production names, keys or reports.
function sourceWithParts(count = 4) {
  const source = authored.source(), shape = [{ path: '', type: 'ROOT' }];
  for (let index = 0; index < count; index++) {
    const path = `Part ${index}`;
    shape.push({ path, type: 'INSTANCE' });
    source.manual.targets.push({ id: `part-${index}`, semanticRole: `part-${index}`, label: path,
      pathHint: `Test / ${path}`, lineage: ['test'], resolution: 'resolved' });
  }
  const shapeId = api.contractHash(shape);
  source.variantEvidence = { schemaVersion: 'apollo.variant-anatomy.v1', sourceHash: 'c'.repeat(64),
    structures: { [shapeId]: shape }, variants: [{ componentKey: 'test-key', componentSetKey: 'test-key', structureId: shapeId, properties: {} }] };
  return source;
}

test('four proven internal parts are governed by their host without missing-contract warnings', async () => {
  const p = plugin({ internalParts: 4 });
  const audit = await proxyAudit(p, [sourceWithParts()]);
  assert.ok(audit, JSON.stringify(p.messages));
  assert.equal(audit.selection.components.length, 5);
  assert.equal(audit.components.length, 1);
  assert.equal(audit.notChecked.length, 0);
  assert.equal(audit.governedComponents.length, 4);
  assert.ok(audit.governedComponents.every(part => part.reason === 'component-owned-part' && part.byScopeId === 'actual' && part.ownerComponentId === 'test.component'));
  assert.equal(audit.result.coverage.executionComplete, true);
  assert.equal(audit.result.engine.evaluations.length, 1);
  assert.ok(p.created.every(node => node.removed));
});

test('internal ownership does not hide an actual host violation', async () => {
  const p = plugin({ internalParts: 4, opacity: .5 });
  const audit = await proxyAudit(p, [sourceWithParts()]);
  assert.equal(audit.notChecked.length, 0);
  assert.equal(audit.result.engine.evaluations[0].classification, 'violation');
  assert.equal(p.actual.opacity, .5);
});

test('an independently contracted public child keeps its standalone audit', async () => {
  const p = plugin({ internalParts: 1 }), child = authored.source();
  child.manual.component.componentId = 'test.public'; child.manual.component.contractId = 'test.public';
  child.manual.component.componentKey = 'part-key-0'; child.manual.representations[0].locator.componentKey = 'part-key-0';
  child.variantEvidence.variants[0].componentKey = 'part-key-0'; child.variantEvidence.variants[0].componentSetKey = 'part-key-0';
  const audit = await proxyAudit(p, [sourceWithParts(1), child]);
  assert.ok(audit, JSON.stringify(p.messages));
  assert.equal(audit.components.length, 2);
  assert.equal(audit.governedComponents.length, 0);
  assert.equal(audit.notChecked.length, 0);
});

test('unmapped internal candidate remains an explicit gap instead of being guessed from ancestry', async () => {
  const p = plugin({ internalParts: 1 }), source = sourceWithParts(1);
  source.manual.targets = source.manual.targets.filter(target => target.id !== 'part-0');
  const audit = await proxyAudit(p, [source]);
  assert.equal(audit.notChecked.length, 1);
  assert.equal(audit.notChecked[0].reason, 'contract-not-found');
  assert.equal(audit.result.coverage.executionComplete, false);
});

// Exercise the UI-only messages through the actual built Figma main router.
test('built main UI bridge uses namespaced storage and bounded resize without auditing', async () => {
  const { UI_SCHEMA, SOURCE_SCHEMA, SOURCE_KEY } = require("../src/design-check/ui-protocol");
  const writes = [], sizes = [];
  const p = plugin({ storage: { getAsync: async () => ({ schemaVersion: SOURCE_SCHEMA, source: 'codex' }), setAsync: async (key, value) => writes.push([key, value]) }, resize: (w,h) => sizes.push([w,h]) });
  for (const [operation,payload] of [['agent-source-get',{}], ['agent-source-set',{schemaVersion:SOURCE_SCHEMA,source:'langflow'}], ['resize',{compact:true}], ['resize',{compact:false}], ['resize',{width:10000,height:10}]])
    await p.send({type:'design-check-ui-request',schemaVersion:UI_SCHEMA,requestId:'ui-'+operation+'-'+JSON.stringify(payload).length,operation,payload});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, [[SOURCE_KEY,{schemaVersion:SOURCE_SCHEMA,source:'langflow'}]]); assert.deepEqual(sizes,[[400,860],[800,860]]);
  const replies=p.messages.filter(m=>m.type==='design-check-ui-result'); assert.equal(replies.length,5); assert.equal(replies.filter(m=>m.error).length,1);
  assert.equal(p.messages.some(m=>m.type==='audit-result'||m.type==='resolve-contracts'),false); assert.equal(p.created.length,0);
});

test('terminal contract branch acknowledges a raced timeout cancellation without waiting for new work',async()=>{
 const p=plugin();p.figma.currentPage.selection=[p.frame('empty',[])];await p.send({type:'audit',requestId:'finished'});assert.ok(p.messages.some(m=>m.type==='audit-result'&&m.requestId==='finished'));await p.send({type:'audit-cancel',requestId:'finished'});assert.ok(p.messages.some(m=>m.type==='audit-cancelled'&&m.requestId==='finished'));
});

async function focusOutcome(p,id){for(let i=0;i<200;i++){const m=p.messages.find(m=>['audit-focus-result','audit-focus-cancelled'].includes(m.type)&&m.requestId===id);if(m)return m;await new Promise(r=>setTimeout(r,1));}throw Error('No focus outcome '+id);}
test('built contract focus selects the exact composite violating child and rejects a forged target',async()=>{
 const p=plugin({key:'host-key',dependencies:true,childOpacity:.4}),child=p.actual.children[0].children[0].children[0];child.id='Iactual;3541:22';
 const get=p.figma.getNodeByIdAsync;p.figma.getNodeByIdAsync=async id=>id===child.id?null:get(id);const views=[];p.figma.viewport.scrollAndZoomIntoView=nodes=>views.push(nodes.map(n=>n.id));
 await p.send({type:'load-contract',source:authored.nested().source});await p.send({type:'audit',requestId:'composite'});
 const result=p.messages.find(m=>m.type==='audit-result'),finding=result.focusTargets.findings.find(f=>f.targets.some(t=>t.nodeId===child.id));assert.ok(finding,JSON.stringify(result.focusTargets));
 const t=finding.targets.find(t=>t.nodeId===child.id),req={type:'audit-focus',requestId:'valid-focus',auditId:result.audit.auditId,evaluationId:finding.findingId,targetId:t.id};
 await p.send(req);assert.equal((await focusOutcome(p,req.requestId)).success,true);assert.equal(p.figma.currentPage.selection[0],child);assert.equal(views.length,1);assert.equal(views[0][0],child.id);
 await p.send(Object.assign({},req,{requestId:'forged-focus',targetId:'forged'}));assert.equal((await focusOutcome(p,'forged-focus')).success,false);assert.equal(views.length,1);
});
test('built contract focus cancellation guards a delayed recheck and acknowledges the terminal race',async()=>{
 const p=plugin({opacity:.4});await p.send({type:'load-contract',source:authored.source()});await p.send({type:'audit',requestId:'cancel-area'});const result=p.messages.find(m=>m.type==='audit-result'),f=result.focusTargets.findings[0],t=f.targets[0];
 let release;const get=p.figma.getNodeByIdAsync;p.figma.getNodeByIdAsync=id=>id==='actual'?new Promise(r=>release=()=>r(p.actual)):get(id);const views=[];p.figma.viewport.scrollAndZoomIntoView=nodes=>views.push(nodes);
 await p.send({type:'audit-focus',requestId:'cancel-focus',auditId:result.audit.auditId,evaluationId:f.findingId,targetId:t.id});for(let i=0;i<200&&!release;i++)await new Promise(r=>setTimeout(r,1));assert.ok(release);
 await p.send({type:'audit-focus-cancel',requestId:'cancel-focus'});assert.equal((await focusOutcome(p,'cancel-focus')).type,'audit-focus-cancelled');release();await new Promise(r=>setTimeout(r,5));assert.equal(views.length,0);assert.equal(p.messages.some(m=>m.type==='audit-focus-result'&&m.requestId==='cancel-focus'),false);
 await p.send({type:'audit-focus-cancel',requestId:'completed-race'});assert.equal((await focusOutcome(p,'completed-race')).type,'audit-focus-cancelled');
});


test('area audit skips unused PNG export even when the renderer would fail', async () => {
  let exports = 0;
  const p = plugin({ onPreview: () => { exports++; throw new Error('PNG renderer unavailable'); } });
  await p.send({ type: 'load-contract', source: authored.source() });
  await p.send({ type: 'audit', requestId: 'no-png' });
  const reply = p.messages.find(m => m.type === 'audit-result');
  assert.ok(reply, JSON.stringify(p.messages));
  assert.equal(exports, 0);
  assert.equal(reply.audit.result.coverage.executionComplete, true);
  assert.ok(p.created.every(n => n.removed)); assert.ok(p.pages.every(n => n.removed));
});

test('stage timings account for native reads without changing canonical audit or focus identities', async () => {
  async function run(readMs) {
    let clock = 100;
    const p = plugin({ now: () => clock, onMainRead: () => { clock += readMs; } });
    await p.send({ type: 'load-contract', source: authored.source() });
    await p.send({ type: 'audit', requestId: 'timed' });
    const reply = p.messages.find(m => m.type === 'audit-result');
    assert.ok(reply, JSON.stringify(p.messages));
    return reply;
  }
  const first = await run(7), second = await run(13);
  const timing = first.audit.timings;
  assert.equal(timing.schemaVersion, 'apollo.audit-timings.v1');
  assert.equal(timing.scope, 'contract-area-audit-before-delivery');
  assert.equal(timing.clock, 'Date.now');
  assert.equal(timing.totalMs, 42);
  assert.deepEqual(timing.stages.filter(s=>!s.stage.startsWith('capture.')).map(s => s.stage), ['scan','capture','evaluate','contract-hash','index-component','display-metadata','verify-final-capture','verify-final-captures','final-scan','aggregate','shared-area-snapshot','focus-targets']);
  assert.equal(timing.stages.find(s => s.stage === 'capture').durationMs, 21);
  assert.equal(timing.stages.find(s => s.stage === 'capture').scopeId, 'actual');
  assert.equal(timing.stages.filter(s=>!s.stage.startsWith('capture.')&&s.stage!=='verify-final-capture').reduce((sum,s) => sum + s.durationMs, 0), timing.totalMs);
  assert.equal(second.audit.timings.totalMs, 78);
  delete first.audit.timings; delete second.audit.timings;
  delete first.delivery; delete second.delivery;
  assert.deepEqual(first, second);
  assert.equal(first.audit.snapshot.timings, undefined);
});

test('proxy audit records resolution, compilation and release verification separately', async () => {
  const p = plugin(), audit = await proxyAudit(p);
  for (const stage of ['resolve-contracts','compile-contracts','verify-release'])
    assert.ok(audit.timings.stages.some(s => s.stage === stage), stage);
});

 test('ordinary built transport has no captures; explicit diagnostics retain all evaluations',async()=>{
 const p=plugin({summaryOnly:true});await p.send({type:'load-contract',source:authored.source()});await p.send({type:'audit',requestId:'small'});
 const reply=p.messages.find(m=>m.type==='audit-result');assert.equal(reply.audit.schemaVersion,'apollo.audit-summary.v1');assert.equal(reply.audit.snapshot,undefined);assert.equal(reply.audit.components[0].snapshot.nodes,undefined);
 const full=await require("./full-audit.fixture.cjs").fullAudit(p.figma,p.messages,reply.audit);assert(full.snapshot.nodes.length);assert.equal(full.result.engine.evaluations.length,reply.audit.projection.totalEvaluations);
 await p.send({type:'audit-context-invalidated',auditId:reply.audit.auditId});await p.send({type:'audit-report-request',requestId:'stale-read',auditId:reply.audit.auditId,operation:'full',componentAuditId:null});assert.equal(p.messages.find(m=>m.requestId==='stale-read').error,'AUDIT_REPORT_STALE');
 });
