import { requirePreflight, transformValue, valueAtState } from "../../../packages/generation-core/src/planning";
import type { CompositionPlan, Diagnostic, GenerationContext, Hash, MappingEntry, OwnedAction, Scalar, TargetReceipt, HostVerification } from "../../../packages/generation-core/src/planning";
import type { FigmaHost } from "../../../packages/adapter-figma/src";
import { createNativeRollbackJournal } from "./rollback";
import type { CompiledContract } from "../../../packages/component-contract-core/src/types";
import type { NativeBinding, NativeBindingReader, NativeCapturePort, NativePrimitivePolicy, NativeScopeCapture, NativeWriteScope } from "../native/bindings";
const sha = /^[a-f0-9]{64}$/;
class NativeHostError extends Error {
  constructor(public code: string, public diagnostics: Diagnostic[] = []) { super(code); }
}
function fail(code: string, message: string, nodeId?: string): never {
  throw new NativeHostError(code,[{code,stage:'preflight',target:'figma',nodeId,message}]);
}
function descendants(root: SceneNode): SceneNode[] {
  const result: SceneNode[] = [], todo = [root];
  while (todo.length) {
    const node = todo.pop()!; result.push(node);
    if (result.length > 5000) fail('FIGMA_NATIVE_NODE_LIMIT','Native subtree exceeds the bounded capture/transaction scope.');
    if ('children' in node) for (const child of node.children) todo.push(child);
  }
  return result;
}
function bindingFacts(b: NativeBinding) { return {id:b.id,mappingId:b.mappingId,representationId:b.representationId,componentKey:b.componentKey,pin:b.pin,
  recipeHash:b.recipeHash,acceptanceEvidenceHash:b.acceptanceEvidenceHash,slots:b.slots.map(s=>({targetId:s.targetId,property:s.property,sourceNodeId:s.sourceNodeId,operationId:s.operationId,evidenceHash:s.evidenceHash})),
  actions:b.actions?{id:b.actions.id,evidenceHash:b.actions.evidenceHash,occurrences:b.actions.occurrences}:null,scenario:b.scenario?{id:b.scenario.id,evidenceHash:b.scenario.evidenceHash}:null}; }
function definitionFacts(node: ComponentNode) {
  return descendants(node).map(n => {
    const facts: Record<string,unknown> = {id:n.id,type:n.type,parent:n.parent?.id,removed:n.removed,
      children:'children' in n?n.children.map(c=>c.id):[],visible:n.visible};
    for (const field of ['componentProperties','componentPropertyDefinitions','variantProperties','componentPropertyReferences',
      'characters','fontName','textStyleId','opacity','fills','strokes','effects','relativeTransform','width','height','layoutMode',
      'itemSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','explicitVariableModes']) {
      const value=(n as unknown as Record<string,unknown>)[field]; if(value!==undefined) facts[field]=typeof value==='symbol'?'mixed':value;
    }
    if ('key' in n) facts.key=n.key;
    return facts;
  });
}
export function createGenerationFigmaHost(options: {
  api: PluginAPI; hash: Hash; readContext(spec: CompositionPlan['spec']): Promise<GenerationContext>;
  readBinding: NativeBindingReader; capture: NativeCapturePort; primitives: NativePrimitivePolicy | null;
}): FigmaHost {
  const {api,hash} = options;
  type Resolved = { mapping: MappingEntry; binding: NativeBinding; definition: ComponentNode; definitionHash: string; bindingHash: string; contract: CompiledContract };
  const resolved = new Map<string,Resolved>(), owned = new Map<string,SceneNode>(), provenance = new Map<string,string>();
  let plan: CompositionPlan | null = null, page: PageNode | null = null, canvas: FrameNode | null = null;
  let captures: NativeScopeCapture[] = [], started = false;
  let createdRoots: SceneNode[] = [];
  const layoutFrames = new Set<string>();
  const rollbackJournal = createNativeRollbackJournal(owned,()=>createdRoots);
  function own(node: SceneNode, planNodeId?: string) {
    // Record immediately, before any configuration that can throw.
    createdRoots.push(node);owned.set(node.id,node);
    if(planNodeId) provenance.set(planNodeId,node.id);
    for(const child of descendants(node)) owned.set(child.id,child);
    return node;
  }
  function node(id: string): SceneNode {
    const value=owned.get(id); if(!value||value.removed) fail('FIGMA_NATIVE_OWNERSHIP','Operation references a node outside this transaction.');return value;
  }
  function instance(id: string): InstanceNode { const n=node(id);if(n.type!=='INSTANCE')fail('FIGMA_NATIVE_IDENTITY','Expected a newly created library instance.');return n; }
  function currentPlan(): CompositionPlan { if(!plan)fail('FIGMA_NATIVE_NOT_RESOLVED','Native host has no resolved frozen plan.');return plan; }
  function recipeForInstance(id: string): Resolved {
    const n=instance(id),mappingId=n.getPluginData('apollo.generation.mapping');
    const r=resolved.get(mappingId);if(!r)fail('FIGMA_NATIVE_IDENTITY','Instance has no resolved mapping.');return r;
  }
  async function assertResolved() {
    const p=currentPlan(),context=await options.readContext(p.spec);requirePreflight(p,context,hash,'figma');
    for(const r of resolved.values()) {const binding=await options.readBinding(r.mapping,context);
      if(!binding||hash(bindingFacts(binding))!==r.bindingHash||hash(bindingFacts(r.binding))!==r.bindingHash||hash(r.contract)!==r.mapping.pin.compiledHash)fail('FIGMA_NATIVE_BINDING_STALE','Accepted native recipe/capture pin changed during generation.');}
    for(const r of resolved.values()) if(r.definition.removed||r.definition.key!==r.mapping.figma.componentKey||hash(definitionFacts(r.definition))!==r.definitionHash)
      fail('FIGMA_NATIVE_DEFINITION_STALE','Imported source definition changed during generation.');
    if(started && (!page || page.removed || api.currentPage.id!==page.id)) fail('FIGMA_NATIVE_PAGE_STALE','Generation page changed during the transaction.');
    for(const c of captures) await c.assertCurrent();
  }
  async function mutate<T>(write:()=>T|Promise<T>):Promise<T> {
    if(!started)fail('FIGMA_NATIVE_NOT_STARTED','No native transaction is open.');
    await assertResolved();let value:T;try { value=await rollbackJournal.write(write); } finally { await assertResolved(); }return value;
  }
  function scope(parent: InstanceNode, allowedActions: OwnedAction[]): NativeWriteScope {
    function within(id:string):SceneNode {
      const n=node(id);let cursor: BaseNode|null=n;
      while(cursor && cursor.id!==parent.id)cursor=cursor.parent;
      if(!cursor)fail('FIGMA_NATIVE_OWNERSHIP','Handler references a node outside its newly created owner.');return n;
    }
    return {node:within,bindAction(actionId,nodeId){
      if(!allowedActions.some(a=>a.id===actionId))fail('ACTION_PROVENANCE_INCOMPLETE','Handler binds an undeclared action.');
      const n=within(nodeId);if(n.type!=='INSTANCE')fail('FIGMA_ACTION_IDENTITY','Owned action is not a source-bound library occurrence.');
      if(provenance.has(actionId)&&provenance.get(actionId)!==nodeId)fail('ACTION_PROVENANCE_INCOMPLETE','Action resolves to conflicting occurrences.');
      if(Array.from(provenance.entries()).some(([id,target])=>id!==actionId && target===nodeId))fail('ACTION_PROVENANCE_INCOMPLETE','Two plan identities resolve to one occurrence.');
      provenance.set(actionId,nodeId);
    }};
  }
  async function resolve(mappings:MappingEntry[],p:CompositionPlan) {
    if(started)fail('FIGMA_NATIVE_TRANSACTION_ACTIVE','Previous transaction must finish or roll back before another resolution.');
    rollbackJournal.reset();
    plan=JSON.parse(JSON.stringify(p));resolved.clear();owned.clear();provenance.clear();captures=[];layoutFrames.clear();createdRoots=[];canvas=null;page=null;
    const context=await options.readContext(p.spec);requirePreflight(p,context,hash,'figma');
    const bindings=new Map<string,NativeBinding>(),issues:Diagnostic[]=[];
    for(const m of mappings) {
      if(bindings.has(m.id))continue;
      const b=await options.readBinding(m,context),uses=p.spec.nodes.filter(n=>n.kind==='component'&&n.mappingId===m.id);
      if(!b) {
        const need=(code:string,message:string)=>issues.push({code,stage:'preflight',target:'figma',nodeId:uses[0]?.id,message});
        need('FIGMA_NATIVE_BINDING_MISSING',m.id+': required mapping.figma.handlerId, matching representationId/componentKey, exact contract pin, recipeHash and acceptanceEvidenceHash from the reviewed source handoff.');
        for(const n of uses) if(n.kind==='component') {
          for(const port of Object.keys(n.slots)) {const s=m.slots[port]?.figma;
            need('FIGMA_SLOT_BINDING_MISSING',m.id+'.slots.'+port+': required native targetId='+s?.targetId+', property='+s?.property+', sourceNodeId, operationId, evidenceHash and supported Plugin API operation.');}
          if(n.actions)need('FIGMA_OWNED_ACTION_BINDING_MISSING',m.id+'.actions: required figmaHandlerId, visibleOccurrenceIds, handlersByOccurrenceId, identityByOccurrenceId, source symbol/direct-child order and pinned Button dependency/componentSet identities.');
        }
        if(p.spec.events.length||p.spec.states.values.length>1)need('FIGMA_SCENARIO_BINDING_MISSING',m.id+': required accepted property/state/action/prototype recipe for declared states/events/transitions; external product operations stay explicit.');
        need('FIGMA_CAPTURE_SCOPE_MISSING',m.id+': required canonical Ready contract from /v2/contracts/resolve matching pin.compiledHash/manualSourceHash/revision and accepted native capture boundaries.');
        continue;
      }
      if(b.id!==m.figma.handlerId||b.mappingId!==m.id||b.representationId!==m.figma.representationId||b.componentKey!==m.figma.componentKey
        ||hash(b.pin)!==hash(m.pin)||!sha.test(b.recipeHash)||!sha.test(b.acceptanceEvidenceHash))fail('FIGMA_NATIVE_BINDING_STALE',m.id+': accepted native recipe does not match mapping/source pins.');
      for(const n of uses) if(n.kind==='component') {
        for(const port of Object.keys(n.slots)) {const s=m.slots[port].figma!,matches=b.slots.filter(s1=>s1.targetId===s.targetId&&s1.property===s.property);
          if(matches.length!==1||!matches[0].sourceNodeId||!matches[0].operationId||!sha.test(matches[0].evidenceHash)||typeof matches[0].fill!=='function'||typeof matches[0].assertDefinition!=='function'||typeof matches[0].assertFilled!=='function')fail('FIGMA_SLOT_BINDING_MISSING',m.id+'.slots.'+port+': no unique accepted native SLOT operation.');}
        if(n.actions && (!b.actions||typeof b.actions.fill!=='function'||typeof b.actions.assertDefinition!=='function'||typeof b.actions.assertOccurrences!=='function'||b.actions.id!==m.actions?.figmaHandlerId||!sha.test(b.actions.evidenceHash)||b.actions.occurrences.length!==n.actions.items.length
          ||b.actions.occurrences.some(o=>!o.sourceNodeId||!o.symbolId||!o.componentSetKey||!context.view.components.find(c=>c.pin.componentId===m.pin.componentId)?.dependencies.includes(o.dependencyComponentId))
          ||new Set(b.actions.occurrences.map(o=>o.sourceNodeId)).size!==b.actions.occurrences.length))fail('FIGMA_OWNED_ACTION_BINDING_MISSING',m.id+': exact source occurrences and dependency identities are required for every action.');
      }
      if((p.spec.events.length||p.spec.states.values.length>1)&&(!b.scenario||typeof b.scenario.bind!=='function'||typeof b.scenario.assertPlan!=='function'||!b.scenario.id||!sha.test(b.scenario.evidenceHash)))fail('FIGMA_SCENARIO_BINDING_MISSING',m.id+': accepted declared-state/event recipe is absent.');
      if(b.scenario)await b.scenario.assertPlan(p,m);
      bindings.set(m.id,b);
    }
    if(p.spec.nodes.some(n=>n.kind==='text')&&(!options.primitives||!sha.test(options.primitives.evidenceHash)||!options.primitives.id||!options.primitives.textStyleId))
      issues.push({code:'FIGMA_PRIMITIVE_STYLE_MISSING',stage:'preflight',target:'figma',message:'Text primitive requires an accepted TextStyle ID and exact font policy; no default font is invented.'});
    if(issues.length)throw new NativeHostError(issues[0].code,issues);
    // All missing recipe diagnostics precede imports, fonts and canvas writes.
    for(const [id,b] of bindings) {
      const m=mappings.find(m=>m.id===id)!,contract=JSON.parse(JSON.stringify(await options.capture.loadScope(m,context))) as CompiledContract;
      const revisions=Array.from(new Set(contract.rules.map(r=>r.revision)));
      const revision=contract.package.manualRevision??(revisions.length===1?revisions[0]:undefined);
      if(hash(contract)!==m.pin.compiledHash||contract.package.id!==m.pin.contractId||contract.package.componentId!==m.pin.componentId
        ||contract.package.manualSourceHash!==m.pin.manualSourceHash||revision!==m.pin.revision||contract.status!=='ready')
        fail('FIGMA_CAPTURE_SCOPE_STALE',m.id+': canonical capture contract differs from the common plan.');
      let definition:ComponentNode;try{definition=await api.importComponentByKeyAsync(m.figma.componentKey);}catch{fail('FIGMA_COMPONENT_IMPORT_UNAVAILABLE',m.id+': pinned library component could not be imported.');}
      if(definition.removed||definition.type!=='COMPONENT'||definition.key!==m.figma.componentKey)fail('FIGMA_NATIVE_IDENTITY',m.id+': imported component key does not match.');
      for(const s of b.slots)await s.assertDefinition(definition);
      for(const n of p.spec.nodes)if(n.kind==='component'&&n.mappingId===m.id&&n.actions)await b.actions!.assertDefinition(definition,n.actions.items);
      const fonts=new Map<string,FontName>();
      for(const n of descendants(definition))if(n.type==='TEXT') {
        const list=typeof n.fontName==='symbol'?n.getRangeAllFontNames(0,n.characters.length):[n.fontName];
        for(const font of list)fonts.set(JSON.stringify(font),font);
      }
      for(const font of fonts.values())try{await api.loadFontAsync(font);}catch{fail('FIGMA_FONT_UNAVAILABLE',m.id+': required source font could not be loaded before canvas creation.');}
      resolved.set(id,{mapping:m,binding:b,contract,definition,definitionHash:hash(definitionFacts(definition)),bindingHash:hash(bindingFacts(b))});
    }
    if(p.spec.nodes.some(n=>n.kind==='text')) {
      const policy=options.primitives!,style=await api.getStyleByIdAsync(policy.textStyleId);
      if(!style||style.type!=='TEXT'||hash(style.fontName)!==hash(policy.fontName))fail('FIGMA_PRIMITIVE_STYLE_STALE','Accepted primitive text style/font is unavailable.');
      await api.loadFontAsync(policy.fontName);
    }
    await assertResolved();
  }
  return {
    readContext:options.readContext,resolve,assertResolved,
    async begin(viewport,planHash) {
      if(started||canvas)fail('FIGMA_NATIVE_TRANSACTION_ACTIVE','A canvas transaction already exists.');
      await assertResolved();if(hash(currentPlan())!==planHash)fail('FIGMA_NATIVE_PLAN_STALE','Transaction plan hash differs.');
      page=api.currentPage;started=true;
      return mutate(()=>{const frame=own(api.createFrame()) as FrameNode;layoutFrames.add(frame.id);canvas=frame;frame.name='Apollo '+currentPlan().spec.id;
        frame.fills=[];frame.clipsContent=false;frame.resize(viewport.width,viewport.height);frame.setPluginData('apollo.generation.plan',planHash);return frame.id;});
    },
    async createInstance(mapping,properties,planNodeId) {
      return mutate(()=>{const r=resolved.get(mapping.id);if(!r)fail('FIGMA_NATIVE_NOT_RESOLVED','Mapping is not resolved.');
        const n=own(r.definition.createInstance(),planNodeId) as InstanceNode;n.setPluginData('apollo.generation.mapping',mapping.id);
        const props:Record<string,string|boolean>={};for(const [key,value] of Object.entries(properties)) {
          if(typeof value!=='string'&&typeof value!=='boolean')fail('FIGMA_NATIVE_PROPERTY','Plugin component property requires a typed string/boolean.');props[key]=value;}
        n.setProperties(props);return n.id;});
    },
    async createPrimitive(n) {
      return mutate(async()=>{
        if(n.kind==='stack') {const frame=own(api.createFrame(),n.id) as FrameNode;layoutFrames.add(frame.id);frame.fills=[];frame.clipsContent=false;
          frame.layoutMode=n.direction==='vertical'?'VERTICAL':'HORIZONTAL';frame.itemSpacing=n.gap;
          frame.primaryAxisSizingMode='AUTO';frame.counterAxisSizingMode='AUTO';return frame.id;}
        const policy=options.primitives;if(!policy)fail('FIGMA_PRIMITIVE_STYLE_MISSING','No accepted primitive text policy.');
        const text=own(api.createText(),n.id) as TextNode;text.fontName=policy.fontName;await text.setTextStyleIdAsync(policy.textStyleId);text.characters=n.text;return text.id;
      });
    },
    async append(parentId,childIds) {
      return mutate(()=>{const parent=node(parentId);if(parent.type!=='FRAME'||!layoutFrames.has(parent.id))fail('FIGMA_NATIVE_APPEND','General append is restricted to new layout frames. Native SLOT uses its approved operation.');
        for(const id of childIds)parent.appendChild(node(id));});
    },
    async fillNativeSlot(instanceId,s,childIds) {
      return mutate(async()=>{const r=recipeForInstance(instanceId),handler=r.binding.slots.find(h=>h.targetId===s.targetId&&h.property===s.property);
        if(!handler)fail('FIGMA_SLOT_BINDING_MISSING','No resolved handler for native slot identity.');
        await handler.fill(instance(instanceId),childIds.map(node),scope(instance(instanceId),[]));
        await handler.assertFilled(instance(instanceId),childIds.map(node));});
    },
    async fillOwnedActions(instanceId,handlerId,actions,state) {
      return mutate(async()=>{const r=recipeForInstance(instanceId),handler=r.binding.actions;
        if(!handler||handler.id!==handlerId)fail('FIGMA_OWNED_ACTION_BINDING_MISSING','Owned action handler differs from accepted recipe.');
        const writeScope=scope(instance(instanceId),actions),result=await handler.fill(instance(instanceId),actions,state,writeScope);
        for(const item of result)writeScope.bindAction(item.actionId,item.nodeId);
        await handler.assertOccurrences(instance(instanceId),result,actions);return result;
      });
    },
    async bindEvents(p,actual) {
      return mutate(async()=>{
        for(const r of resolved.values())if(r.binding.scenario) {
          for(const component of p.spec.nodes)if(component.kind==='component'&&component.mappingId===r.mapping.id) {
            const owner=actual.find(a=>a.planNodeId===component.id);if(!owner)fail('FIGMA_NATIVE_PROVENANCE','Scenario owner is missing.');
            await r.binding.scenario.bind(p,actual,scope(instance(owner.artifactId),component.actions?.items||[]),component.id);
          }
        }
      });
    },
    async captureAndVerify(p,actual):Promise<HostVerification> {
      await assertResolved();captures=[];const checks:NonNullable<HostVerification['evidence']>['checks']=[],facts:unknown[]=[],diagnostics:Diagnostic[]=[];
      for(const c of p.components) {
        const id=actual.find(a=>a.planNodeId===c.nodeId)?.artifactId,r=resolved.get(c.mappingId);
        if(!id||!r)fail('FIGMA_NATIVE_PROVENANCE','Created component lacks plan provenance.');
        const n=instance(id),specNode=p.spec.nodes.find(n=>n.id===c.nodeId)!;
        if(specNode.kind!=='component')fail('FIGMA_NATIVE_PROVENANCE','Component provenance differs from the plan.');
        for(const [port,ids] of Object.entries(specNode.slots)){const slot=r.mapping.slots[port].figma!,handler=r.binding.slots.find(s=>s.targetId===slot.targetId&&s.property===slot.property)!;
          const children=ids.map(id=>{const artifact=actual.find(a=>a.planNodeId===id);if(!artifact)fail('FIGMA_NATIVE_PROVENANCE','Slot child lacks provenance.');return node(artifact.artifactId);});await handler.assertFilled(n,children);}
        if(specNode.actions)await r.binding.actions!.assertOccurrences(n,specNode.actions.items.map(a=>{const artifact=actual.find(p=>p.planNodeId===a.id);if(!artifact)fail('ACTION_PROVENANCE_INCOMPLETE','Action lacks source occurrence provenance.');return {actionId:a.id,nodeId:artifact.artifactId};}),specNode.actions.items);
        const captured=await options.capture.capture(n,r.mapping,r.contract);captures.push(captured);facts.push(captured.facts);checks.push(...captured.checks);diagnostics.push(...captured.diagnostics);
      }
      for(const n of p.spec.nodes) {
        const id=actual.find(a=>a.planNodeId===n.id)?.artifactId,value=id?node(id):null;let match=Boolean(value),observed:unknown=value?{id:value.id,type:value.type}:null;
        if(value&&n.kind==='stack') {observed={id:value.id,type:value.type,mode:'layoutMode' in value?value.layoutMode:null,gap:'itemSpacing' in value?value.itemSpacing:null,
          children:'children' in value?value.children.map(c=>c.id):[]};
          match=value.type==='FRAME'&&value.layoutMode===(n.direction==='vertical'?'VERTICAL':'HORIZONTAL')&&value.itemSpacing===n.gap
            &&hash(value.children.map(c=>c.id))===hash(n.children.map(id=>actual.find(a=>a.planNodeId===id)?.artifactId));}
        else if(value&&n.kind==='text') {observed={id:value.id,type:value.type,text:value.type==='TEXT'?value.characters:null,style:value.type==='TEXT'?value.textStyleId:null};match=value.type==='TEXT'&&value.characters===n.text&&value.textStyleId===options.primitives?.textStyleId;}
        else if(value&&n.kind==='component') {const m=resolved.get(n.mappingId)!.mapping,expected:Record<string,Scalar>=Object.assign({},m.profile?.figma);
          for(const [port,input] of Object.entries(n.props)){const prop=m.props[port].figma!;expected[prop.property]=transformValue(valueAtState(input,p.spec.states.initial),prop.transform);}
          const props=value.type==='INSTANCE'?value.componentProperties:{};observed={id:value.id,type:value.type,props};match=value.type==='INSTANCE'&&Object.entries(expected).every(([key,v])=>props[key]?.value===v);}
        checks.push({id:'node.'+n.id,status:match?'passed':'failed',evidenceHash:hash(observed)});facts.push(observed);
      }
      const viewport=canvas?{id:canvas.id,width:canvas.width,height:canvas.height,children:canvas.children.map(c=>c.id)}:null;
      checks.push({id:'viewport.'+p.spec.id,status:viewport&&viewport.width===p.spec.viewport.width&&viewport.height===p.spec.viewport.height&&hash(viewport.children)===hash([actual.find(a=>a.planNodeId===p.spec.root)?.artifactId])?'passed':'failed',evidenceHash:hash(viewport)});facts.push(viewport);
      // Initial-state/prototype capture is not evidence that an event was executed.
      for(const state of p.spec.states.values)checks.push({id:'state.'+state,status:'unknown',evidenceHash:hash({state,observed:'live-scenario-not-run'})});
      for(const event of p.spec.events)checks.push({id:'event.'+event.id,status:'unknown',evidenceHash:hash({event:event.id,observed:'live-event-not-run'})});
      for(const n of p.spec.nodes)if(n.kind==='component'&&n.actions)for(const action of n.actions.items)checks.push({id:(action.behavior==='none'?'content.':'action.')+action.id,status:'unknown',evidenceHash:hash({action:action.id,nodeId:provenance.get(action.id),observed:action.behavior==='none'?'content-acceptance-not-run':'live-action-not-run'})});
      const aggregated=new Map<string,typeof checks[number][]>();for(const check of checks){const key=JSON.stringify([check.componentId||'',check.id]);const list=aggregated.get(key)||[];list.push(check);aggregated.set(key,list);}
      const merged=Array.from(aggregated.values()).map(list=>({id:list[0].id,componentId:list[0].componentId,status:list.some(c=>c.status==='failed')?'failed' as const:list.some(c=>c.status==='unknown')?'unknown' as const:list.every(c=>c.status==='not-applicable')?'not-applicable' as const:'passed' as const,evidenceHash:hash(list)}));
      diagnostics.push({code:'FIGMA_LIVE_SCENARIOS_NOT_RUN',stage:'execution',target:'figma',message:'Native capture/evaluator ran; state/event/action live acceptance must be performed by the owner.'});
      await assertResolved();return {status:merged.some(c=>c.status==='failed')?'failed':'incomplete',evidence:{factsHash:hash(facts),checks:merged},diagnostics};
    },
    transactionProvenance(){return Array.from(provenance.entries()).map(([planNodeId,artifactId])=>({planNodeId,artifactId}));},
    async rollback() {
      const outcome=rollbackJournal.rollback();
      // An incomplete recovery retains its journal/ownership for retry. Once
      // cleanup has no owned nodes left, the receipt still records uncertainty.
      if(!rollbackJournal.busy()&&!Array.from(owned.values()).some(n=>!n.removed)) {
        owned.clear();provenance.clear();resolved.clear();captures=[];createdRoots=[];canvas=null;page=null;plan=null;started=false;
      }
      return outcome;
    },
  };
}
