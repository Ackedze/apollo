const { compileManualSource } = require('@apollo/component-contract-compiler');
const { importWorkspace } = require('@apollo/component-contract-importer');
const engine = require('@apollo/predicate-engine');
const { assertRuntimeContract } = require("./contract-profile");

const SOURCE_SCHEMA = 'apollo.component-contract-source.v1-experimental';
const MANUAL_SCHEMA = 'apollo.component-contract.manual.v2-experimental';
const hashPattern = /^[a-f0-9]{64}$/;
function invalid(message) {
  const error = new TypeError(message); error.code = 'APOLLO_V4_SOURCE_INVALID'; throw error;
}
function assertManual(manual) {
  if (!manual || manual.schemaVersion !== MANUAL_SCHEMA || manual.documentType !== 'component-contract-manual') {
    invalid('Загрузите главный contract.manual.json последнего поколения вместе с фактами или authoring ZIP Editor.');
  }
  if (!manual.component?.componentId || !manual.component.contractId || !Number.isInteger(manual.metadata?.revision)
    || manual.metadata.revision < 1 || !Array.isArray(manual.rules) || !Array.isArray(manual.representations)) invalid('Некорректный авторский контракт.');
}

// Only the manual supplies norms. Imported compiled files may carry anatomy and
// an old exporter stamp; their predicates are never used as compiler input.
function sourceFromFiles(files, dependencies = []) {
  if (!Array.isArray(files) || !files.length || files.length > 200) invalid('Некорректный набор файлов контракта.');
  const parsed = files.map(file => ({ name: file.name, data: JSON.parse(file.text) }));
  const manuals = parsed.filter(file => file.data.documentType === 'component-contract-manual');
  if (manuals.length !== 1) invalid('В каждом пакете нужен один главный contract.manual.json.');
  const manual = manuals[0].data; assertManual(manual);
  const workspace = importWorkspace(files, manual.component.contractId);
  if (engine.stableHash(workspace.manual) !== engine.stableHash(manual)) invalid('Импорт изменил авторский контракт. Миграция источника должна выполняться в Editor.');
  const source = { schemaVersion: SOURCE_SCHEMA, documentType: 'component-contract-source', manual,
    variantEvidence: workspace.variantEvidence, dependencies };
  const caches = parsed.filter(file => file.data.documentType === 'component-contract'
    && file.data.package?.componentId === manual.component.componentId);
  if (caches.length > 1) invalid('В пакете несколько проекций одного контракта.');
  if (caches.length) {
    const cache = caches[0].data;
    // A stale cache cannot block or override a newer manual. Recompile it; only
    // an export for this exact source can retain the historical exporter stamp.
    if (cache.package.manualSourceHash === engine.stableHash(manual)) {
      source.projectionStamp = { sourceExportVersion: cache.package.sourceExportVersion, compiledHash: engine.stableHash(cache) };
    }
  }
  return source;
}

function loadAuthoringSource(input, options) {
  // A plain manual remains a source, but facts/dependencies must be supplied in
  // the same load. Missing facts never trigger a fallback to inferred rules.
  const root = input?.documentType === 'component-contract-manual'
    ? { schemaVersion: SOURCE_SCHEMA, documentType: 'component-contract-source', manual: input, dependencies: [] } : input;
  let count = 0;
  const identities = new Map();
  function compile(source, ancestors, depth) {
    if (++count > 32 || depth > 4) invalid('Превышен лимит цепочки авторских контрактов.');
    if (!source || source.schemaVersion !== SOURCE_SCHEMA || source.documentType !== 'component-contract-source') invalid('Ожидается авторский пакет с главным manual, а не compiled-контракт.');
    assertManual(source.manual);
    const manual = source.manual, componentId = manual.component.componentId;
    if (ancestors.has(componentId)) invalid('Цикл авторских зависимостей.');
    const facts = source.variantEvidence;
    if (!facts || facts.schemaVersion !== 'apollo.variant-anatomy.v1' || !hashPattern.test(facts.sourceHash || '')
      || !Array.isArray(facts.variants) || !facts.variants.length || !facts.structures || typeof facts.structures !== 'object') {
      invalid('Для manual нужны закреплённые факты компонента. Загрузите его вместе с JSON-фактами, authoring ZIP или через ApolloProxyControl.');
    }
    if (!Array.isArray(source.dependencies)) invalid('Некорректные авторские зависимости.');
    const pins = manual.componentDependencies || [];
    if (!Array.isArray(pins) || source.dependencies.length !== new Set(pins.map(pin => pin.componentId)).size
      || new Set(source.dependencies.map(child => child?.manual?.component?.componentId)).size !== source.dependencies.length
      || pins.some(pin => !source.dependencies.some(child => child?.manual?.component?.componentId === pin.componentId))) invalid('Каждой закреплённой зависимости нужен собственный manual и факты.');
    const path = new Set(ancestors); path.add(componentId);
    const children = source.dependencies.map(child => compile(child, path, depth + 1).contract);
    // The shared compiler is pure with respect to source files; clone inputs so
    // importer/compiler normalization cannot mutate the frozen source package.
    const copied = JSON.parse(JSON.stringify({ manual, facts, children }));
    const result = compileManualSource(copied.manual, copied.facts, copied.children);
    if (result.issues.some(issue => issue.level === 'error')) invalid('Авторский контракт не готов: ' + result.issues.filter(issue => issue.level === 'error').map(issue => issue.code).join(', '));
    // Match Editor's exported JSON boundary (optional undefined fields are not
    // artifacts). This also keeps dependency pins identical in all runtimes.
    const contract = JSON.parse(JSON.stringify(result.contract));
    if (source.projectionStamp !== undefined) {
      const stamp = source.projectionStamp;
      if (!stamp || !/^component-contract-editor@0\.2\.\d+$/.test(stamp.sourceExportVersion || '') || !hashPattern.test(stamp.compiledHash || '')) invalid('Некорректный штамп проекции.');
      contract.package.sourceExportVersion = stamp.sourceExportVersion;
      if (engine.stableHash(contract) !== stamp.compiledHash) invalid('Manual и факты не воспроизводят закреплённую проекцию.');
    }
    assertRuntimeContract(contract, engine, options);
    const sourceHash = engine.stableHash(source), previous = identities.get(componentId);
    if (previous && previous !== sourceHash) invalid('Конфликт версий авторской зависимости.');
    identities.set(componentId, sourceHash);
    return { source, sourceHash, contract, issues: result.issues };
  }
  return compile(root, new Set(), 0);
}

function linkSourcePackages(inputs) {
  const sources = JSON.parse(JSON.stringify(inputs));
  const byId = new Map();
  for (const source of sources) {
    assertManual(source.manual);
    const id = source.manual.component.componentId;
    if (byId.has(id)) invalid('Выбрано несколько источников одного компонента.');
    byId.set(id, source);
  }
  const referenced = new Set();
  function link(source, ancestors) {
    const id = source.manual.component.componentId;
    if (ancestors.has(id) || ancestors.size > 4) invalid('Цикл или превышение глубины авторских зависимостей.');
    const path = new Set(ancestors); path.add(id);
    const supplied = new Map((source.dependencies || []).map(child => [child.manual.component.componentId, child]));
    source.dependencies = Array.from(new Set((source.manual.componentDependencies || []).map(pin => pin.componentId))).map(componentId => {
      referenced.add(componentId);
      const child = byId.get(componentId) || supplied.get(componentId);
      if (!child) invalid('Добавьте авторский пакет зависимости ' + componentId + ' с собственным manual.');
      return link(child, path);
    });
    return source;
  }
  for (const source of sources) link(source, new Set());
  const roots = sources.filter(source => !referenced.has(source.manual.component.componentId));
  if (roots.length !== 1) invalid('Выберите один главный контракт и его зависимости.');
  // Detect cycles before returning a package to the plugin message serializer.
  loadAuthoringSource(roots[0]);
  return roots[0];
}

// Metadata-only inspection. No CompiledContract leaves this boundary and no
// Ready/runtime acceptance is inferred from a successful source compilation.
function reviewAuthoringSource(input) {
  let count=0;const rows=new Map();
  function compile(source,ancestors,depth){
    if(++count>32||depth>4)invalid('Превышен лимит authoring review closure.');
    if(!source||source.schemaVersion!==SOURCE_SCHEMA||source.documentType!=='component-contract-source')invalid('Review требует главный authoring source.');
    assertManual(source.manual);
    const manual=source.manual,id=manual.component.componentId,facts=source.variantEvidence;
    if(ancestors.has(id))invalid('Цикл authoring review dependencies.');
    if(!facts||facts.schemaVersion!=='apollo.variant-anatomy.v1'||!hashPattern.test(facts.sourceHash||'')||!Array.isArray(facts.variants)||!facts.variants.length||!facts.structures||typeof facts.structures!=='object')invalid('Review требует исходные закреплённые facts.');
    const pins=manual.componentDependencies||[];
    if(!Array.isArray(pins)||!Array.isArray(source.dependencies)||source.dependencies.length!==new Set(pins.map(p=>p.componentId)).size
      ||new Set(source.dependencies.map(c=>c?.manual?.component?.componentId)).size!==source.dependencies.length
      ||pins.some(p=>!source.dependencies.some(c=>c?.manual?.component?.componentId===p.componentId)))invalid('Review dependency closure неполна.');
    const path=new Set(ancestors);path.add(id);
    const children=source.dependencies.map(c=>compile(c,path,depth+1));
    const copied=JSON.parse(JSON.stringify({manual,facts,children}));
    const result=compileManualSource(copied.manual,copied.facts,copied.children);
    const contract=JSON.parse(JSON.stringify(result.contract));
    if(source.projectionStamp!==undefined){
      const s=source.projectionStamp;
      if(!s||!/^component-contract-editor@0\.2\.\d+$/.test(s.sourceExportVersion||'')||!hashPattern.test(s.compiledHash||''))invalid('Некорректный review exporter stamp.');
      contract.package.sourceExportVersion=s.sourceExportVersion;
      if(engine.stableHash(contract)!==s.compiledHash)invalid('Cached stamp не воспроизводится из главного source/facts.');
    }
    const sourceHash=engine.stableHash(source),old=rows.get(id);
    if(old&&old.sourceHash!==sourceHash)invalid('Конфликт review dependency sources.');
    rows.set(id,{componentId:id,contractId:manual.component.contractId,revision:manual.metadata.revision,
      manualSourceHash:engine.stableHash(manual),factsHash:engine.stableHash(facts),sourceHash,compiledHash:engine.stableHash(contract),
      compiledStatus:contract.status,sourceExportVersion:contract.package.sourceExportVersion,issues:JSON.parse(JSON.stringify(result.issues)),
      coverage:{predicateRuleIds:contract.rules.map(r=>r.ruleId),pendingRoutes:contract.customizationPolicy.filter(r=>['delegated','context-only'].includes(r.execution.route)).map(r=>({ruleId:r.id,route:r.execution.route})),nonExecutableRuleIds:contract.nonExecutableRules.map(r=>r.sourceRuleId)},
      dependencies:pins.map(p=>({id:p.id,componentId:p.componentId,revision:p.revision,manualSourceHash:p.manualSourceHash,compiledHash:p.compiledHash}))});
    return contract; // internal compiler dependency only; never exported as authority
  }
  compile(input,new Set(),0);
  return {schemaVersion:'apollo.authoring-source-review.v1-draft',status:'draft',accepted:false,executionAllowed:false,
    rootComponentId:input.manual.component.componentId,components:Array.from(rows.values()).sort((a,b)=>a.componentId.localeCompare(b.componentId))};
}

module.exports = { reviewAuthoringSource, SOURCE_SCHEMA, MANUAL_SCHEMA, sourceFromFiles, loadAuthoringSource, linkSourcePackages };
