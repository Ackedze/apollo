import { applyCodeTransform } from '../../../component-contract-core/src/representation-evidence';
import { representationProof } from './representation-proof';
import { validateScreenSpec } from './schema';
import { pinOf } from './projection';
import type { CompositionPlan, Diagnostic, GenerationContext, Hash, MappingEntry, Preflight, PropertyValue, Scalar, ScreenSpec, Target, ValueTransform } from './types';
const sha = /^[a-f0-9]{64}$/, identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const safePath = (p: string) => typeof p === 'string' && !!p && !p.includes('\\') && !p.startsWith('/') && !p.split('/').some(s => !s || s === '..' || s === '.') && !/^[a-z]:/i.test(p);
export function transformValue(value: Scalar, transform: ValueTransform): Scalar {
  if (transform.kind === 'identity') return value;
  const matches = transform.values.filter(v => v.input === value);
  if (matches.length !== 1) throw new Error('MAPPING_VALUE_UNSUPPORTED');
  return matches[0].output;
}
export function propertyValues(value: PropertyValue): Scalar[] { return typeof value === 'object' ? Object.values(value.state) : [value]; }
export function valueAtState(value: PropertyValue, state: string): Scalar { return typeof value === 'object' ? value.state[state] : value; }
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v;
}
export function createCompositionPlan(spec: ScreenSpec, context: GenerationContext, hash: Hash): CompositionPlan {
  if (validateScreenSpec(spec).length) throw new Error('SCREEN_SCHEMA');
  const components = spec.nodes.filter(n => n.kind === 'component').map(n => {
    const mapping = context.registry.entries.find(m => m.id === n.mappingId);
    if (!mapping) throw new Error('MAPPING_MISSING');
    return { nodeId: n.id, mappingId: mapping.id, pin: pinOf(mapping.pin) };
  });
  return freeze(JSON.parse(JSON.stringify({ schemaVersion: 'apollo.composition-plan.v1-experimental', spec,
    pins: { specHash: hash(spec), packageLockHash: context.view.lockHash, viewHash: hash(context.view), registryHash: hash(context.registry), codeHash: hash(context.code) }, components, patterns: context.patterns })));
}
/** Both target routes share the real arui-private availability gate. This is
 * preparation only: no predicate, pixel, interaction or live PASS is inferred. */
export function preflightPlan(plan: CompositionPlan, context: GenerationContext, hash: Hash): Preflight {
  const diagnostics: Diagnostic[] = [], coverage: Preflight['coverage'] = [];
  const add = (code: string, stage: Diagnostic['stage'], message: string, nodeId?: string, target?: Target) => diagnostics.push({ code, stage, message, nodeId, target });
  let planHash = '';
  function inspect() {
    planHash = hash(plan);
    if (plan.schemaVersion !== 'apollo.composition-plan.v1-experimental') { add('PLAN_SCHEMA','schema','Unsupported CompositionPlan.'); return; }
    diagnostics.push(...validateScreenSpec(plan.spec));
    if (diagnostics.length) return;
    const { view, registry, code } = context;
    if (view.schemaVersion !== 'apollo.generation-view.v1-experimental' || hash(view.lock) !== view.lockHash
      || view.lock.schemaVersion !== 'apollo.generation-package-lock.v1-experimental') add('CONTRACT_LOCK_INVALID','preflight','Invalid contract inventory lock.');
    if (plan.pins.specHash !== hash(plan.spec) || plan.pins.packageLockHash !== view.lockHash || plan.pins.viewHash !== hash(view)
      || plan.pins.registryHash !== hash(registry) || plan.pins.codeHash !== hash(code)) add('STALE_PLAN','preflight','Plan inputs differ from the current contracts, mapping or checkout.');
    if (registry.schemaVersion !== 'apollo.generation-registry-port.v1-experimental' || registry.producer.name !== 'code-connect'
      || registry.producer.status !== 'verified' || !registry.producer.revision || registry.package.name !== 'arui-private'
      || !registry.package.version || !/^[a-f0-9]{40}$/.test(registry.package.commit) || !Object.keys(registry.package.files).length
      || !Array.isArray(registry.package.implementationDependencies) || new Set(registry.entries.map(m => m.id)).size !== registry.entries.length)
      add('REGISTRY_UNCONFIRMED','availability','A confirmed Code Connect registry is required.');
    if (code.package.name !== registry.package.name || code.package.version !== registry.package.version || code.package.commit !== registry.package.commit)
      add('CODE_CHECKOUT_STALE','availability','Checkout identity differs from the mapping registry.');
    for (const [file,fileHash] of Object.entries(registry.package.files)) {
      if (!safePath(file) || !sha.test(fileHash) || code.package.files[file] !== fileHash) add('CODE_FILE_STALE','availability','Missing or changed mapping evidence file.');
    }
    if (registry.source) {
      const observation = context.producerObservation;
      if(registry.source.version==='1.1.0'){const i=registry.source.producerInputs,o=observation?.inputObservation;
        if(!i||!o||o.version!==1||o.basisRegistryDigest!==i.basisRegistryDigest||o.currentRegistryDigest!==registry.source.digest||o.currentInputsDigest!==i.currentInputsDigest||hash(i.currentInputs)!==i.currentInputsDigest||o.codeRepresentations!=='draft'||o.acceptance!=='not-run'||o.proofScope!=='source-api-freshness-only')add('PRODUCER_INPUT_OBSERVATION_REQUIRED','availability','Fresh complete producer input observation is required; it does not accept a Code profile.');
      }
      if (!observation || observation.schemaVersion !== 'apollo.code-connect-observation.v1-experimental'
        || observation.status !== 'availability-pass' || observation.targetProduct !== 'apollo-v4'
        || observation.fullContractParity !== 'not-confirmed' || observation.registryDigest !== registry.source.digest
        || observation.lockHash !== registry.source.lockHash || observation.specHash !== hash(plan.spec)
        || observation.codeHash !== hash(code) || observation.stateReceipts.length !== plan.spec.states.values.length
        || plan.spec.states.values.some(state => observation.stateReceipts.filter(r => r.state === state && sha.test(r.preparedHash)).length !== 1))
        add('PRODUCER_PREFLIGHT_REQUIRED','availability','Fresh NEXT-01 preflight evidence is required for every screen state.');
      else {
        const body = Object.assign({}, observation); delete (body as Partial<typeof body>).receiptHash;
        if (hash(body) !== observation.receiptHash) add('PRODUCER_RECEIPT_STALE','availability','Producer observation has changed.');
      }
      if (!sha.test(registry.source.digest) || !sha.test(registry.source.lockHash)) add('PRODUCER_PIN_INVALID','availability','Producer digest/lock is invalid.');
    }
    if (hash(plan.patterns || []) !== hash(context.patterns || [])) add('PATTERN_PLAN_STALE','preflight','Pattern requirements/source receipt or role bindings changed.');
    for (const attachment of plan.patterns || []) {
      const r = attachment.requirements;
      if (attachment.schemaVersion !== 'apollo.pattern-plan-attachment.v1-draft' || r.schemaVersion !== 'apollo.pattern-requirements.v1-draft'
        || r.consumer !== 'apollo-v4' || r.status !== 'draft' || r.executionAllowed !== false || hash(r) !== attachment.requirementsHash
        || r.platform !== plan.spec.platform) add('PATTERN_PORT_INVALID','preflight','Unsupported or changed draft pattern attachment.');
      add('PATTERN_DRAFT','preflight','Draft pattern requirements do not authorize target execution.');
      if (r.sourceVerification !== 'passed' || attachment.sourceReceipt.receiptSha256 !== r.patternLock.sourceReceiptSha256)
        add('PATTERN_SOURCE_UNVERIFIED','source','Pattern source receipt is missing or changed.');
      if (r.availability.status !== 'passed') add('PATTERN_AVAILABILITY_UNRESOLVED','availability','Pattern UI bindings are unresolved or failed.');
      for (const gap of r.gaps) if (gap.blocking) add('PATTERN_GAP_UNRESOLVED','preflight','A blocking pattern product/integration gap remains unresolved.');
      const roles = r.compositions.flatMap(c => c.roles.filter(role => role.kind === 'ui-component').map(role => ({c,role})));
      for (const {c,role} of roles) {
        const binding = attachment.nodeBindings.filter(b => b.compositionId === c.id && b.roleId === role.id);
        if (binding.length !== 1 || binding[0].nodeIds.length < role.minimum || binding[0].nodeIds.length > role.maximum
          || binding[0].nodeIds.some(id => !plan.spec.nodes.some(n => n.id === id && n.kind === 'component' && role.binding?.kind === 'registry' && n.mappingId === role.binding.entryId)))
          add('PATTERN_ROLE_BINDING_UNRESOLVED','preflight','A semantic role has no explicit matching plan component binding.');
      }
    }
    for (const unresolved of plan.spec.unresolved) add('SCREEN_UNRESOLVED','preflight',unresolved);
    for (const gap of plan.spec.capabilityGaps || []) add('SCREEN_CAPABILITY_GAP','availability',gap.code + ': ' + gap.message,gap.nodeId);
    const expectedComponents = plan.spec.nodes.filter(n => n.kind === 'component').map(n => {
      const m = registry.entries.find(e => e.id === n.mappingId);
      return m ? { nodeId: n.id, mappingId: m.id, pin: pinOf(m.pin) } : null;
    });
    if (expectedComponents.some(c => !c) || hash(expectedComponents) !== hash(plan.components)) add('PLAN_MAPPING_DRIFT','preflight','Node mapping/pins do not match the plan.');
    const used = new Set<string>();
    const sourceCheck = (componentId: string, nodeId: string) => {
      if (used.has(componentId)) return; used.add(componentId);
      const c = view.components.find(c => c.pin.componentId === componentId), locked = view.lock.packages.find(p => p.componentId === componentId);
      if (!c || !locked || hash(c.pin) !== hash(pinOf(locked))) { add('CONTRACT_MISSING','source','Missing exact authoring source/pin.',nodeId); return; }
      coverage.push(c.coverage);
      if (c.sourceStatus !== 'ready' || c.sourceErrors) add('SOURCE_NOT_READY','source','The authoring source is Draft or has validation errors.',nodeId);
      if (hash(c.dependencies.slice().sort()) !== hash(locked.dependencies.map(d => d.componentId).sort())) add('DEPENDENCY_PIN_INVALID','source','Dependency closure differs from the authoring lock.',nodeId);
      for (const d of locked.dependencies) {
        const child = view.lock.packages.find(p => p.componentId === d.componentId);
        if (!child || d.revision !== child.revision || d.manualSourceHash !== child.manualSourceHash || d.compiledHash !== child.compiledHash) add('DEPENDENCY_PIN_INVALID','source','Dependency source differs from the required pin.',nodeId);
        sourceCheck(d.componentId,nodeId);
      }
    };
    for (const n of plan.spec.nodes) {
      if (n.kind !== 'component') continue;
      const m = registry.entries.find(e => e.id === n.mappingId);
      if (!m) { add('MAPPING_MISSING','availability','Component has no confirmed mapping.',n.id); continue; }
      sourceCheck(m.pin.componentId,n.id);
      const c = view.components.find(c => c.pin.componentId === m.pin.componentId);
      if (!c || hash(c.pin) !== hash(m.pin)) { add('MAPPING_CONTRACT_STALE','availability','Mapping is for a different contract revision/hash.',n.id); continue; }
      if (m.status !== 'verified' || m.platform !== plan.spec.platform) add('PLATFORM_UNSUPPORTED','availability','Component mapping is unconfirmed or unavailable on this platform.',n.id);
      if (!/^arui-private\/[a-z0-9-]+$/.test(m.code.module) || !identifier.test(m.code.exportName)
        || !code.publicExports.some(e => e.module === m.code.module && e.exportName === m.code.exportName && e.indexFile === m.code.indexFile))
        add('PUBLIC_EXPORT_MISSING','availability','No confirmed public arui-private export.',n.id);
      if (m.profile && (!registry.source || m.code.module !== 'arui-private/button-group'
        || hash(m.profile) !== hash({code:{size:56,maxVisibleButtons:4},figma:{Size:'56',Overflow:'false'},requiresRuntimeWidthFit:true})))
        add('PRODUCER_PROFILE_UNCONFIRMED','availability','Unsupported fixed producer profile.',n.id);
      if (!m.evidenceFiles.length || !m.evidenceFiles.includes(m.code.indexFile) || m.evidenceFiles.some(f => !registry.package.files[f])) add('MAPPING_EVIDENCE_MISSING','availability','Mapping/API evidence is not pinned.',n.id);
      for (const target of ['frontend','figma'] as const) {
        const representationId = target === 'frontend' ? m.code.representationId : m.figma.representationId;
        const rep = c.representations.find(r => r.id === representationId && r.kind === (target === 'frontend' ? 'code' : 'figma'));
        if (!rep || rep.status !== 'verified' || rep.platform !== plan.spec.platform) add('REPRESENTATION_UNCONFIRMED','preflight','Contract representation is not verified for this target/platform.',n.id,target);
        if (target === 'figma' && (!m.figma.componentKey || !m.figma.handlerId || rep && rep.locator.componentKey !== m.figma.componentKey)) add('FIGMA_IDENTITY_UNCONFIRMED','preflight','Figma identity/handler does not match the contract.',n.id,target);
      }
      const proof=representationProof(context,c,m,hash);
      if(!proof.api)add('CODE_EVIDENCE_UNVERIFIED','availability','Stored API evidence requires a fresh trusted checkout/registry/scope observation.',n.id);
      const selectedProfile=c.generationProfiles?.find(p=>p.id===m.generationProfileId);
      if(selectedProfile&&Object.entries(selectedProfile.properties).some(([port,expected])=>!Object.prototype.hasOwnProperty.call(n.props,port)||propertyValues(n.props[port]).some(v=>hash(v)!==hash(expected))))add('CODE_PROFILE_INPUT_MISMATCH','preflight','Screen input differs from the accepted profile properties.',n.id,'frontend');
      if(!proof.profile)add('CODE_PROFILE_UNACCEPTED','preflight','Code parity and live acceptance are required for the exact declared generation profile.',n.id,'frontend');
      const api = (port: string) => c.api.find(a => a.id === port);
      const codeBinding = (port: string, prop: string) => api(port)?.bindings.some(b => b.representationId === m.code.representationId && [prop,'props.'+prop].includes(b.path));
      const reservedProps = new Set<string>();
      for (const [port,p] of Object.entries(m.props)) if (p.required && !Object.prototype.hasOwnProperty.call(n.props,port)) add('PROPERTY_REQUIRED','availability','A required code API property is missing.',n.id);
      for (const [port,s] of Object.entries(m.slots)) if (s.min > 0 && !Object.prototype.hasOwnProperty.call(n.slots,port)) add('SLOT_REQUIRED','availability','A required content port is missing.',n.id);
      if (m.actions && m.actions.min > 0 && !n.actions) add('ACTION_PORT_REQUIRED','availability','Required owned action elements are missing.',n.id);
      for (const [port,value] of Object.entries(n.props)) {
        const p = m.props[port], a = api(port);
        if (!p || !a || !codeBinding(port,p.code.prop) || !identifier.test(p.code.prop) || reservedProps.has(p.code.prop)
          || ['children','elements','key','ref','dataTestId'].includes(p.code.prop)) { add('PROPERTY_UNSUPPORTED','availability','Property has no exact code API binding.',n.id); continue; }
        reservedProps.add(p.code.prop);
        const typed=a.bindings.find(b=>b.representationId===m.code.representationId)?.codeTransform;
        if(typed){try{if(propertyValues(value).some(v=>hash(applyCodeTransform(v,typed))!==hash(transformValue(v,p.code.transform))))throw new Error();}
          catch{add('PROPERTY_TRANSFORM_STALE','availability','Mapping transform differs from the closed source transform for this input.',n.id);}}
        if (a.kind === 'slot' || !['string','number','boolean','enum'].includes(a.valueType)) add('PROPERTY_UNSUPPORTED','availability','Non-scalar API requires a supported content port.',n.id);
        for (const v of propertyValues(value)) {
          if (typeof v !== p.type || p.values && !p.values.some(x => x === v) || a.domain && !a.domain.some(x => x === v)) { add('PROPERTY_VALUE_UNSUPPORTED','availability','Property value is outside the confirmed domain.',n.id); continue; }
          try {
            const output = transformValue(v,p.code.transform);
            if (!['string','number','boolean'].includes(typeof output) || typeof output === 'number' && !Number.isFinite(output)) throw new Error();
          } catch { add('PROPERTY_TRANSFORM_UNSUPPORTED','availability','Code transform is not confirmed for this value.',n.id); }
          if (!p.figma || !a.bindings.some(b => b.representationId === m.figma.representationId && b.path === p.figma!.property)) add('FIGMA_PROPERTY_UNSUPPORTED','preflight','No exact Figma property transform.',n.id,'figma');
          else try {
            const out = transformValue(v,p.figma.transform);
            if (typeof out !== (p.figma.type === 'BOOLEAN' ? 'boolean' : 'string')) throw new Error();
          } catch { add('FIGMA_PROPERTY_UNSUPPORTED','preflight','Invalid Figma typed property value.',n.id,'figma'); }
        }
      }
      for (const [port,children] of Object.entries(n.slots)) {
        const s = m.slots[port], a = api(port);
        if (!s || !a || !['node','content'].includes(a.valueType) || !codeBinding(port,s.codeProp) || s.codeProp !== 'children'
          || children.length < s.min || children.length > s.max || reservedProps.has(s.codeProp)) add('SLOT_UNSUPPORTED','availability','Content slot/cardinality has no confirmed code API.',n.id);
        if (s) reservedProps.add(s.codeProp);
        if (!s?.figma || !c.targets.includes(s.figma.targetId) || !a?.bindings.some(b => b.representationId === m.figma.representationId && b.path === s.figma!.property && (!b.targetId || b.targetId === s.figma!.targetId))) add('FIGMA_SLOT_UNSUPPORTED','preflight','Native Figma slot target is unconfirmed.',n.id,'figma');
      }
      if (n.actions) {
        const a = m.actions;
        if (!a || a.port !== n.actions.port || !api(a.port) || !codeBinding(a.port,a.codeProp) || a.codeProp !== 'elements'
          || a.fields.label !== 'children' || a.fields.event !== 'onClick'
          || n.actions.items.length < a.min || n.actions.items.length > a.max || reservedProps.has(a.codeProp)) add('ACTION_PORT_UNSUPPORTED','availability','Owned action elements have no confirmed code API.',n.id);
        if (!a?.figmaHandlerId) add('FIGMA_ACTION_PORT_UNSUPPORTED','preflight','Owned action Figma handler is unconfirmed.',n.id,'figma');
        const views = n.actions.items.filter(item => item.view !== undefined);
        if (views.length && (a?.fields.priorityProp !== 'primaryFirst' || views.length !== n.actions.items.length
          || n.actions.items.some((item,index) => index > 0 && item.view === 'primary') || reservedProps.has('primaryFirst')))
          add('ACTION_VIEW_UNSUPPORTED','availability','Owned action priority has no unambiguous confirmed group transformation.',n.id);
        if (n.actions.items.some(item => item.disabled !== undefined) && a?.fields.disabled !== 'disabled')
          add('ACTION_DISABLED_UNSUPPORTED','availability','Owned disabled state has no confirmed implementation API.',n.id);
      }
    }
  }
  try { inspect(); } catch { add('INPUT_SCHEMA','schema','Malformed plan/context or unavailable trusted evidence.'); }
  const apiAvailability = diagnostics.some(d => ['schema','availability'].includes(d.stage)) ? 'blocked' : 'confirmed';
  const sourceReadiness = diagnostics.some(d => ['schema','source'].includes(d.stage)) ? 'blocked' : 'ready';
  const blocked = (target: Target) => diagnostics.some(d => !d.target || d.target === target);
  return { schemaVersion: 'apollo.generation-preflight.v1-experimental', planHash, apiAvailability, sourceReadiness,
    targets: { figma: blocked('figma') ? 'blocked' : 'prepared', frontend: blocked('frontend') ? 'blocked' : 'prepared' }, coverage, diagnostics };
}
export function requirePreflight(plan: CompositionPlan, context: GenerationContext, hash: Hash, target: Target): Preflight {
  const result = preflightPlan(plan,context,hash);
  if (result.targets[target] !== 'prepared') throw new Error('GENERATION_PREFLIGHT_BLOCKED');
  return result;
}
