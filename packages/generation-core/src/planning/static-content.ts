import { pinOf } from './projection';
import { representationProof } from './representation-proof';
import type { Diagnostic, GenerationContext, Hash, Target } from './types';
import { STATIC_CONTENT_MAPPING, STATIC_GROUP_MAPPING, STATIC_SCREEN_VERSION, STATIC_PLAN_VERSION, STATIC_FACT_VERSION } from './static-content-types';
import type { StaticScreenSpec, StaticCompositionPlan, StaticContentProjection, StaticFactInputDraft, StaticPreflight } from './static-content-types';

const record = (v: unknown): v is Record<string,any> => !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (v: unknown, names: string[]): v is Record<string,any> => record(v) && Object.keys(v).length === names.length && names.every(k => Object.prototype.hasOwnProperty.call(v,k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 8192;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const number = (v: unknown, min: number, max = 8192): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const same = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ids = (v: unknown, count: number): v is string[] => Array.isArray(v) && v.length === count && v.every(id) && new Set(v).size === count;
const ruleNames = ['actions-descend-by-priority','overflow-moves-nearest-action-first','single-icon-opens-overflow-list','overflow-container-follows-platform',
  'overflow-items-preserve-action-content','visible-and-overflow-actions-are-unique','disabled-state-is-preserved-in-overflow','overflow-list-closes-after-action','visible-button-loading-follows-button'];
export const STATIC_CONTEXT_RULE_IDS = Object.freeze(ruleNames.map(name => 'component:buttons-group.desktop.buttons-group.' + name));
function diagnostic(code: string,message: string,nodeId?: string,target?: Target): Diagnostic { return {code,stage:'schema',message,nodeId,target}; }
/** Deliberately narrow Draft pilot. No imported authority, callbacks or events. */
export function validateStaticScreenSpec(input: unknown): Diagnostic[] {
  if (!closed(input,['schemaVersion','status','executionAllowed','id','platform','viewport','root','nodes','states','unresolved'])
    || input.schemaVersion !== STATIC_SCREEN_VERSION || input.status !== 'draft' || input.executionAllowed !== false || input.platform !== 'desktop'
    || !id(input.id) || !id(input.root) || !closed(input.viewport,['width','height']) || input.viewport.width !== 1600
    || !closed(input.states,['initial','values']) || input.states.initial !== 'default' || !same(input.states.values,['default'])
    || !Array.isArray(input.unresolved) || input.unresolved.length > 64 || input.unresolved.some(s => typeof s !== 'string' || s.length > 2048)
    || !Array.isArray(input.nodes) || input.nodes.length !== 2)
    return [diagnostic('STATIC_SCREEN_SCHEMA','Unsupported static Draft version, scope or closed shape.')];
  const errors: Diagnostic[] = [];
  if (!Number.isInteger(input.viewport.height) || !number(input.viewport.height,1)) errors.push(diagnostic('STATIC_PRODUCT_INPUT_REQUIRED','Exact viewport height is required; width1600/default do not supply it.'));
  const roots = input.nodes.filter(n => record(n) && n.mappingId === STATIC_CONTENT_MAPPING);
  const groups = input.nodes.filter(n => record(n) && n.mappingId === STATIC_GROUP_MAPPING);
  if (roots.length !== 1 || groups.length !== 1) return errors.concat(diagnostic('STATIC_SCREEN_SCHEMA','Exactly one desktop CorporateContent and one ButtonsGroup are required.'));
  const root=roots[0],group=groups[0];
  if (!closed(root,['kind','id','mappingId','props','slots']) || root.kind !== 'component' || !id(root.id) || root.id !== input.root
    || !closed(root.props,[]) || !closed(root.slots,['body']) || !same(root.slots.body,[group.id])
    || !closed(group,['kind','id','mappingId','props','slots','staticActions']) || group.kind !== 'component' || !id(group.id) || group.id === root.id
    || !closed(group.props,['size']) || group.props.size !== '56' || !closed(group.slots,[])
    || !closed(group.staticActions,['port','items','displayOrder','priorityOrder']) || group.staticActions.port !== 'button-label'
    || !Array.isArray(group.staticActions.items) || group.staticActions.items.length !== 2)
    return errors.concat(diagnostic('STATIC_SCREEN_SCHEMA','Static pilot tree/ports/properties are unsupported.'));
  const actions=group.staticActions.items;
  for (const a of actions) {
    if (!closed(a,['id','label','view','disabled','loading'])) errors.push(diagnostic('STATIC_ACTION_SCHEMA','Static action fields are closed; interactive fields/events are forbidden.',group.id));
    else if (!id(a.id) || !text(a.label) || !['primary','secondary'].includes(a.view) || typeof a.disabled !== 'boolean' || a.loading !== false)
      errors.push(diagnostic('STATIC_PRODUCT_INPUT_REQUIRED','Each static action requires real ID/label/View/disabled and explicit Loading=false.',group.id));
  }
  const actionIds=actions.map(a => record(a)?a.id:null);
  if (!ids(actionIds,2) || actionIds.includes(root.id) || actionIds.includes(group.id)) errors.push(diagnostic('STATIC_ACTION_IDENTITY','Two unique ActionIDs must be distinct from node IDs.',group.id));
  if (!ids(group.staticActions.displayOrder,2) || !same(group.staticActions.displayOrder.slice().sort(),actionIds.slice().sort()))
    errors.push(diagnostic('STATIC_DISPLAY_ORDER_REQUIRED','Display order must explicitly contain both ActionIDs.',group.id));
  if (!ids(group.staticActions.priorityOrder,2) || !same(group.staticActions.priorityOrder.slice().sort(),actionIds.slice().sort()))
    errors.push(diagnostic('STATIC_PRIORITY_REQUIRED','Independent priorityOrder must be an explicit permutation of both ActionIDs.',group.id));
  return errors;
}
function freeze<T>(v:T):T { if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v; }
function copy<T>(v:T):T {return JSON.parse(JSON.stringify(v));}
/** Content metadata only; does not compile sources or construct an execution plan. */
export function projectStaticContent(spec:StaticScreenSpec):StaticContentProjection {
  if(validateStaticScreenSpec(spec).length)throw Error('STATIC_SCREEN_SCHEMA');
  const root=spec.nodes.find(n=>n.mappingId===STATIC_CONTENT_MAPPING)!;
  const group=spec.nodes.find(n=>n.mappingId===STATIC_GROUP_MAPPING)!;
  if(!('staticActions' in group))throw Error('STATIC_SCREEN_SCHEMA');
  const actions=group.staticActions.displayOrder.map(id=>copy(group.staticActions.items.find(a=>a.id===id)!));
  const content:StaticContentProjection={ownerNodeId:root.id,slotPort:'body',groupNodeId:group.id,actionPort:'button-label',size:'56',overflow:false,state:'default',actions,
    displayOrder:group.staticActions.displayOrder.slice(),priorityOrder:group.staticActions.priorityOrder.slice(),provenance:actions.map(a=>({actionId:a.id,ownerNodeId:group.id,port:'button-label',canonicalOccurrenceId:null,symbolId:null}))};
  return freeze(copy(content));
}
/** Pure content projection. Occurrence/symbol IDs remain unknown until source review. */
export function createStaticCompositionPlan(spec: StaticScreenSpec,context: GenerationContext,hash: Hash): StaticCompositionPlan {
  const errors=validateStaticScreenSpec(spec);
  if(errors.length){const error=Object.assign(new Error('STATIC_SCREEN_SCHEMA'),{diagnostics:errors});throw error;}
  const content=projectStaticContent(spec);
  const root=spec.nodes.find(n=>n.mappingId===STATIC_CONTENT_MAPPING)!;
  const group=spec.nodes.find(n=>n.mappingId===STATIC_GROUP_MAPPING)!;
  const components=[root,group].map(n=>{
    const m=context.registry.entries.find(m=>m.id===n.mappingId);if(!m)throw Error('MAPPING_MISSING');return{nodeId:n.id,mappingId:m.id,pin:pinOf(m.pin)};
  });
  const coverage:StaticCompositionPlan['requirements']['dependencyCoverage']=[],seen=new Set<string>();
  function dependency(id:string){if(seen.has(id))return;seen.add(id);const c=context.view.components.find(c=>c.pin.componentId===id);if(c){coverage.push(copy(c.coverage));c.dependencies.forEach(dependency);}}
  components.forEach(c=>dependency(c.pin.componentId));
  return freeze(copy({schemaVersion:STATIC_PLAN_VERSION,status:'draft',executionAllowed:false,spec,
    pins:{specHash:hash(spec),packageLockHash:context.view.lockHash,viewHash:hash(context.view),registryHash:hash(context.registry),codeHash:hash(context.code)},components,content,contentHash:hash(content),
    requirements:{sourceOccurrences:4,visibleProductActions:2,hiddenSourceOccurrences:2,deleteSourceOccurrences:false,requiredContextRuleIds:STATIC_CONTEXT_RULE_IDS.slice(),
      verificationSlots:['canonical.cc-body','canonical.bg-four-occurrences','content.two-action-provenance','content.priority-order','content.disabled-loading-addon','width.figma','width.frontend','fonts.button-label-readback','source.dependency-predicates','native.mutation-readback-rollback','profile.static-acceptance'],dependencyCoverage:coverage}} as StaticCompositionPlan));
}
export function createStaticFactInputDraft(plan:StaticCompositionPlan,hash:Hash,buildHash:string):StaticFactInputDraft {
  if(!sha(buildHash))throw Error('STATIC_BUILD_PIN_REQUIRED');
  return {schemaVersion:STATIC_FACT_VERSION,status:'draft',accepted:false,planHash:hash(plan),buildHash,widths:{figma:null,frontend:null},canonical:null,targetSupport:{figma:'not-supported',frontend:'not-supported'}};
}
/** Populated candidates still carry accepted=false. This validator grants no authority. */
export function validateStaticFactInputDraft(value:unknown,plan:StaticCompositionPlan,hash:Hash):Diagnostic[] {
  const invalid=()=>[diagnostic('STATIC_FACT_INPUT_SCHEMA','Unsupported/changed closed Draft fact input; no trusted receipt is inferred.')];
  if(!closed(value,['schemaVersion','status','accepted','planHash','buildHash','widths','canonical','targetSupport'])||value.schemaVersion!==STATIC_FACT_VERSION
    ||value.status!=='draft'||value.accepted!==false||value.planHash!==hash(plan)||!sha(value.buildHash)||!closed(value.widths,['figma','frontend'])
    ||!closed(value.targetSupport,['figma','frontend'])||value.targetSupport.figma!=='not-supported'||value.targetSupport.frontend!=='not-supported')return invalid();
  const actionIds=plan.content.priorityOrder;
  for(const target of ['figma','frontend'] as const){
    const width=value.widths[target];if(width===null)continue;
    if(!closed(width,['availableWidth','buttonWidths','gap','paddingStart','paddingEnd','measurementHash','fontHash'])||!number(width.availableWidth,1,1600)||!number(width.gap,0,1024)
      ||!number(width.paddingStart,0)||!number(width.paddingEnd,0)||!sha(width.measurementHash)||!sha(width.fontHash)||!Array.isArray(width.buttonWidths)||width.buttonWidths.length!==2
      ||width.buttonWidths.some(b=>!closed(b,['actionId','width'])||!id(b.actionId)||!number(b.width,1))
      ||!same(width.buttonWidths.map(b=>b.actionId).sort(),actionIds.slice().sort()))return invalid();
  }
  const c=value.canonical;
  if(c!==null){
    if(!closed(c,['body','occurrences','crosswalkHash'])||!sha(c.crosswalkHash)||!closed(c.body,['ownerSourceAddress','property','slotSourceAddress'])
      ||!Object.values(c.body).every(text)||!Array.isArray(c.occurrences)||c.occurrences.length!==4
      ||c.occurrences.some(o=>!closed(o,['occurrenceId','symbolId','actionId','visible'])||!text(o.occurrenceId)||!text(o.symbolId)||typeof o.visible!=='boolean'||(o.visible?!id(o.actionId):o.actionId!==null))
      ||new Set(c.occurrences.map(o=>o.occurrenceId)).size!==4||c.occurrences.filter(o=>!o.visible).length!==2
      ||!same(c.occurrences.filter(o=>o.visible).map(o=>o.actionId).sort(),actionIds.slice().sort()))return invalid();
  }
  return [];
}
/** Review preflight: permanently blocked in Draft; preserves source/profile gates. */
export function preflightStaticPlan(plan:StaticCompositionPlan,context:GenerationContext,hash:Hash,facts?:StaticFactInputDraft):StaticPreflight {
  const diagnostics:Diagnostic[]=[],coverage:StaticPreflight['coverage']=[];let planHash='';
  function add(code:string,stage:Diagnostic['stage'],message:string,nodeId?:string,target?:Target){diagnostics.push({code,stage,message,nodeId,target});}
  add('STATIC_PROTOCOL_DRAFT','preflight','Static content protocol is Draft; schema and content projection do not authorize target execution.');
  add('STATIC_PRODUCER_UNSUPPORTED','availability','Current Code Connect producer has no accepted static emit without event handlers.');
  add('STATIC_CONTEXT_RECEIPTS_UNACCEPTED','preflight','All nine scoped context-rule fact/checker receipts require separate review; no Draft bypass.');
  for(const target of ['figma','frontend'] as const)add('STATIC_TARGET_UNSUPPORTED','preflight','Current target does not support execution of this static Draft version.',undefined,target);
  try{
    planHash=hash(plan);
    if(!closed(plan,['schemaVersion','status','executionAllowed','spec','pins','components','content','contentHash','requirements'])||plan.schemaVersion!==STATIC_PLAN_VERSION||plan.status!=='draft'||plan.executionAllowed!==false){add('STATIC_PLAN_SCHEMA','schema','Unsupported closed static Draft plan.');throw Error('STOP');}
    const schema=validateStaticScreenSpec(plan.spec);diagnostics.push(...schema);if(schema.length)throw Error('STOP');
    const expected=createStaticCompositionPlan(plan.spec,context,hash);
    if(hash(expected)!==hash(plan))add('STALE_PLAN','preflight','Static content, facts requirements, component pins or context differ from the deterministic plan.');
    const {view,registry,code}=context;
    if(view.schemaVersion!=='apollo.generation-view.v1-experimental'||view.lock.schemaVersion!=='apollo.generation-package-lock.v1-experimental'||hash(view.lock)!==view.lockHash)add('CONTRACT_LOCK_INVALID','source','Exact authoring package lock is required.');
    if(registry.schemaVersion!=='apollo.generation-registry-port.v1-experimental'||registry.producer.name!=='code-connect'||registry.producer.status!=='verified'
      ||new Set(registry.entries.map(m=>m.id)).size!==registry.entries.length||code.package.name!==registry.package.name||code.package.version!==registry.package.version||code.package.commit!==registry.package.commit
      ||!Object.keys(registry.package.files).length||Object.entries(registry.package.files).some(([file,digest])=>!sha(digest)||code.package.files[file]!==digest))add('REGISTRY_UNCONFIRMED','availability','Fresh exact registry and checkout pins remain required.');
    const seen=new Set<string>();
    function source(componentId:string,nodeId:string){
      if(seen.has(componentId))return;seen.add(componentId);
      const c=view.components.find(c=>c.pin.componentId===componentId),locked=view.lock.packages.find(p=>p.componentId===componentId);
      if(!c||!locked||hash(c.pin)!==hash(pinOf(locked))){add('CONTRACT_MISSING','source','Exact component/dependency source is missing.',nodeId);return;}
      coverage.push(copy(c.coverage));
      if(c.sourceStatus!=='ready'||c.sourceErrors)add('SOURCE_NOT_READY','source','Authoring source remains Draft or invalid.',nodeId);
      if(!same(c.dependencies.slice().sort(),locked.dependencies.map(d=>d.componentId).sort()))add('DEPENDENCY_PIN_INVALID','source','Declared dependency closure differs from the exact lock.',nodeId);
      for(const d of locked.dependencies){const child=view.lock.packages.find(p=>p.componentId===d.componentId);if(!child||d.revision!==child.revision||d.manualSourceHash!==child.manualSourceHash||d.compiledHash!==child.compiledHash)add('DEPENDENCY_PIN_INVALID','source','Dependency pin drifted.',nodeId);source(d.componentId,nodeId);}
    }
    for(const component of plan.components){
      source(component.pin.componentId,component.nodeId);
      const m=registry.entries.find(m=>m.id===component.mappingId),c=view.components.find(c=>c.pin.componentId===component.pin.componentId);
      if(!m||!c||hash(component.pin)!==hash(c.pin)||hash(component.pin)!==hash(m.pin)){add('MAPPING_CONTRACT_STALE','availability','Static mapping source pin differs from authoring source.',component.nodeId);continue;}
      if(m.status!=='verified'||m.platform!=='desktop'||!code.publicExports.some(e=>e.module===m.code.module&&e.exportName===m.code.exportName&&e.indexFile===m.code.indexFile))add('PUBLIC_EXPORT_MISSING','availability','Confirmed desktop public export is required.',component.nodeId);
      for(const target of ['figma','frontend'] as const){const repId=target==='figma'?m.figma.representationId:m.code.representationId;const rep=c.representations.find(r=>r.id===repId);if(!rep||rep.status!=='verified'||rep.platform!=='desktop')add('REPRESENTATION_UNCONFIRMED','preflight','Target representation remains unconfirmed.',component.nodeId,target);}
      const proof=representationProof(context,c,m,hash);if(!proof.api)add('CODE_EVIDENCE_UNVERIFIED','availability','Fresh source API evidence remains required.',component.nodeId);
      // Historical interactive acceptance cannot accept a newly versioned static mode.
      add('CODE_PROFILE_UNACCEPTED','preflight','Exact static-content profile acceptance is not implemented or delivered.',component.nodeId,'frontend');
      add('FIGMA_NATIVE_BINDING_UNACCEPTED','preflight','Accepted static SLOT/owned occurrence/selected-variant recipe remains absent.',component.nodeId,'figma');
    }
    if(registry.source)add('PRODUCER_PREFLIGHT_REQUIRED','availability','Static emit/current producer observation format has not been accepted.');
    if(!same(plan.content.displayOrder,plan.content.priorityOrder))add('STATIC_PRIORITY_ORDER_MISMATCH','preflight','Explicit display order differs from independently supplied business priority; do not silently reorder product content.',plan.content.groupNodeId);
    for(const unresolved of plan.spec.unresolved)add('SCREEN_UNRESOLVED','preflight','A product decision remains unresolved.');
    if(!facts)add('STATIC_FACT_INPUT_REQUIRED','preflight','Actual width and canonical crosswalk input slots are missing.');
    else{const errors=validateStaticFactInputDraft(facts,plan,hash);diagnostics.push(...errors);if(errors.length)throw Error('STOP');add('STATIC_FACT_INPUT_UNACCEPTED','preflight','Populated Draft facts/hashes are review inputs, not trusted runtime evidence.');}
    if(!facts?.canonical)add('STATIC_CANONICAL_CROSSWALK_MISSING','preflight','Independent CC Body/all four BG source and symbol correspondence is unknown.',undefined,'figma');
    else if(!same(facts.canonical.occurrences.filter(o=>o.visible).map(o=>o.actionId),plan.content.priorityOrder))add('STATIC_PRIORITY_OBSERVATION_MISMATCH','preflight','Canonical visible candidate order differs from independent product priority.',plan.content.groupNodeId,'figma');
    for(const target of ['figma','frontend'] as const){
      const width=facts?.widths[target];
      if(!width)add('STATIC_WIDTH_FACTS_MISSING','preflight','Actual available group width/button widths/fonts/gaps/padding are unknown.',plan.content.groupNodeId,target);
      else if(width.buttonWidths.reduce((sum,b)=>sum+b.width,0)+width.gap+width.paddingStart+width.paddingEnd>width.availableWidth)add('STATIC_WIDTH_DOES_NOT_FIT','preflight','Candidate fixed width cannot fit both buttons; Overflow=false is unconfirmed.',plan.content.groupNodeId,target);
    }
  }catch(error){if(!(error instanceof Error&&error.message==='STOP'))add('STATIC_INPUT_UNAVAILABLE','schema','Malformed static plan/context or unavailable source inputs.');}
  return {schemaVersion:'apollo.static-content-preflight.v1-draft',status:'draft',executionAllowed:false,planHash,apiAvailability:'blocked',sourceReadiness:diagnostics.some(d=>['schema','source'].includes(d.stage))?'blocked':'ready',targets:{figma:'blocked',frontend:'blocked'},coverage,diagnostics};
}
