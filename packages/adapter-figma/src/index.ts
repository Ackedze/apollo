import { requirePreflight, transformValue, valueAtState, assessVerification, generationErrorCode } from '../../generation-core/src/planning';
import type { CompositionPlan, GenerationContext, Hash, MappingEntry, OwnedAction, PlanNode, Scalar, TargetReceipt, HostVerification, Diagnostic } from '../../generation-core/src/planning';
export type FigmaRollbackOutcome = { status: 'complete' | 'incomplete'; diagnostics: Diagnostic[] };
/** Apollo supplies native Plugin API operations and its existing capture /
 * evaluator. Code Connect supplies identity-specific slot/action handlers.
 * No layer name search, detach, arbitrary clone, or drawn UI fallback exists. */
export type FigmaHost = {
  readContext(spec: CompositionPlan['spec']): Promise<GenerationContext>;
  resolve(mappings: MappingEntry[], plan: CompositionPlan): Promise<void>;
  assertResolved(): Promise<void>;
  begin(viewport: { width: number; height: number }, planHash: string): Promise<string>;
  createInstance(mapping: MappingEntry, properties: Record<string, Scalar>, planNodeId?: string): Promise<string>;
  createPrimitive(node: Extract<PlanNode, { kind: 'stack' | 'text' }>): Promise<string>;
  append(parentId: string, childIds: string[]): Promise<void>;
  fillNativeSlot(instanceId: string, slot: NonNullable<MappingEntry['slots'][string]['figma']>, childIds: string[]): Promise<void>;
  fillOwnedActions(instanceId: string, handlerId: string, actions: OwnedAction[], initialState: string): Promise<Array<{ actionId: string; nodeId: string }>>;
  bindEvents(plan: CompositionPlan, provenance: TargetReceipt['provenance']): Promise<void>;
  captureAndVerify(plan: CompositionPlan, provenance: TargetReceipt['provenance']): Promise<HostVerification>;
  /** Owns only nodes created by this transaction, including partial failures. */
  rollback(): Promise<void | FigmaRollbackOutcome>;
  /** Partial writes retain identities even when a configuration operation throws. */
  transactionProvenance?(): TargetReceipt['provenance'] | Promise<TargetReceipt['provenance']>;
};
export async function executeFigma(plan: CompositionPlan, hash: Hash, host: FigmaHost): Promise<TargetReceipt> {
  const receipt: TargetReceipt = { schemaVersion: 'apollo.generation-target-receipt.v1-experimental', target: 'figma', planHash: hash(plan),
    pins: plan.pins, status: 'blocked', provenance: [], verification: 'not-run', diagnostics: [], rollback: 'not-needed' };
  if (plan.schemaVersion !== 'apollo.composition-plan.v1-experimental' || !['apollo.screen-spec.v1-experimental','apollo.screen-spec.v2-experimental'].includes(plan.spec?.schemaVersion)) {
    receipt.diagnostics.push({code:'GENERATION_PLAN_VERSION_UNSUPPORTED',stage:'preflight',target:receipt.target,message:'This target supports general ScreenSpec v1/v2 plans; the separate static Draft protocol is review-only.'});
    return receipt;
  }
  let writing = false;
  try {
    const context = await host.readContext(plan.spec), preflight = requirePreflight(plan,context,hash,'figma');
    const nodes = new Map(plan.spec.nodes.map(n => [n.id,n])), mappings = plan.components.map(n => context.registry.entries.find(m => m.id === n.mappingId)!);
    await host.resolve(mappings,plan); // imports/fonts/slots/handlers all resolved before begin
    requirePreflight(plan,await host.readContext(plan.spec),hash,'figma'); await host.assertResolved();
    writing = true; const canvas = await host.begin(plan.spec.viewport,receipt.planHash);
    async function create(id: string): Promise<string> {
      const n = nodes.get(id)!; let artifactId: string;
      await host.assertResolved();
      if (n.kind !== 'component') {
        artifactId = await host.createPrimitive(n);
        if (n.kind === 'stack') { const children: string[] = []; for (const child of n.children) children.push(await create(child)); await host.append(artifactId,children); }
      } else {
        const m = context.registry.entries.find(m => m.id === n.mappingId)!, properties: Record<string,Scalar> = Object.assign({},m.profile?.figma);
        for (const [port,value] of Object.entries(n.props)) {
          const p = m.props[port].figma!; properties[p.property] = transformValue(valueAtState(value,plan.spec.states.initial),p.transform);
        }
        artifactId = await host.createInstance(m,properties,id);
        for (const [port,childIds] of Object.entries(n.slots)) {
          const children: string[] = []; for (const child of childIds) children.push(await create(child));
          await host.fillNativeSlot(artifactId,m.slots[port].figma!,children);
        }
        if (n.actions) {
          const owned = await host.fillOwnedActions(artifactId,m.actions!.figmaHandlerId!,n.actions.items,plan.spec.states.initial);
          if (owned.length !== n.actions.items.length || n.actions.items.some(a => owned.filter(o => o.actionId === a.id && o.nodeId).length !== 1)) throw new Error('ACTION_PROVENANCE_INCOMPLETE');
          for (const a of owned) receipt.provenance.push({ planNodeId: a.actionId, artifactId: a.nodeId });
        }
      }
      receipt.provenance.push({ planNodeId: id,artifactId }); return artifactId;
    }
    await host.append(canvas,[await create(plan.spec.root)]);
    await host.bindEvents(plan,receipt.provenance);
    requirePreflight(plan,await host.readContext(plan.spec),hash,'figma'); await host.assertResolved();
    const verification = await host.captureAndVerify(plan,receipt.provenance);
    requirePreflight(plan,await host.readContext(plan.spec),hash,'figma'); await host.assertResolved();
    receipt.verification = assessVerification(plan,context,verification); receipt.verificationEvidence = verification.evidence; receipt.diagnostics = verification.diagnostics;
    if (receipt.verification === 'failed') throw new Error('TARGET_VERIFICATION_FAILED');
    receipt.status = receipt.verification === 'passed' ? 'verified' : 'created';
  } catch (error) {
    receipt.status = writing ? 'failed' : 'blocked';
    if (error && typeof error === 'object' && Array.isArray((error as {diagnostics?:unknown}).diagnostics)) {
      for (const d of (error as {diagnostics: unknown[]}).diagnostics) if (d && typeof d === 'object') {
        const v=d as Record<string,unknown>;
        if (typeof v.code==='string' && /^[A-Z][A-Z0-9_]{1,95}$/.test(v.code) && typeof v.message==='string' && v.message.length<=1500
          && ['preflight','execution'].includes(String(v.stage)) && v.target==='figma') receipt.diagnostics.push({code:v.code,message:v.message,stage:writing?'execution':v.stage as 'preflight'|'execution',target:'figma',nodeId:typeof v.nodeId==='string'?v.nodeId:undefined});
      }
    }
    if (writing && host.transactionProvenance) {
      const valid=new Set(plan.spec.nodes.map(n=>n.id));
      for(const n of plan.spec.nodes)if(n.kind==='component'&&n.actions)for(const a of n.actions.items)valid.add(a.id);
      try {
        for(const p of await host.transactionProvenance())if(valid.has(p.planNodeId)&&p.artifactId&&!receipt.provenance.some(x=>x.planNodeId===p.planNodeId&&x.artifactId===p.artifactId))receipt.provenance.push(p);
      } catch { receipt.diagnostics.push({code:'FIGMA_PARTIAL_PROVENANCE_UNAVAILABLE',stage:'execution',target:'figma',message:'Partial provenance could not be read; rollback is still required.'}); }
    }
    if (!receipt.diagnostics.some(d=>d.code===generationErrorCode(error,'TARGET_EXECUTION_FAILED'))) receipt.diagnostics.push({ code: generationErrorCode(error,'TARGET_EXECUTION_FAILED'), stage: writing ? 'execution' : 'preflight', target: 'figma', message: 'Figma generation did not complete.' });
    if (writing) {
      function rollbackDiagnostics(value: unknown) {
        if(value&&typeof value==='object'&&Array.isArray((value as {diagnostics?:unknown}).diagnostics))for(const d of (value as {diagnostics:unknown[]}).diagnostics)if(d&&typeof d==='object') {
          const v=d as Record<string,unknown>;
          if(typeof v.code==='string'&&/^[A-Z][A-Z0-9_]{1,95}$/.test(v.code)&&typeof v.message==='string'&&v.message.length<=1500&&v.stage==='execution'&&v.target==='figma')
            receipt.diagnostics.push({code:v.code,message:v.message,stage:'execution',target:'figma',nodeId:typeof v.nodeId==='string'?v.nodeId:undefined});
        }
      }
      try {
        const result=await host.rollback();
        if(result===undefined)receipt.rollback='complete'; // existing void hosts
        else if((result.status==='complete'||result.status==='incomplete')&&Array.isArray(result.diagnostics)) {
          receipt.rollback=result.status;rollbackDiagnostics(result);
        } else {
          receipt.rollback='incomplete';receipt.diagnostics.push({code:'FIGMA_ROLLBACK_RESULT_INVALID',stage:'execution',target:'figma',message:'Rollback did not return a valid recovery outcome; exact restoration is unconfirmed.'});
        }
      } catch (rollbackError) {
        receipt.rollback='incomplete';rollbackDiagnostics(rollbackError);
        const code=generationErrorCode(rollbackError,'FIGMA_ROLLBACK_INCOMPLETE');
        if(!receipt.diagnostics.some(d=>d.code===code))receipt.diagnostics.push({code,stage:'execution',target:'figma',message:'Rollback failed; foreign preservation and exact restoration must be assessed separately.'});
      }
    }
  }
  return receipt;
}
