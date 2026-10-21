import { requirePreflight, transformValue, assessVerification, generationErrorCode } from '../../generation-core/src/planning';
import type { CompositionPlan, GenerationContext, Hash, MappingEntry, PropertyValue, TargetReceipt, HostVerification } from '../../generation-core/src/planning';
export type FrontendPrepared = { planHash: string; files: Array<{ path: string; text: string }>; provenance: Array<{ planNodeId: string; artifactId: string }> };
const quote = (v: unknown) => JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
/** Produces React only after the common gate. No arbitrary JSX/import/function
 * strings are accepted from the plan or producer registry. */
export function prepareFrontend(plan: CompositionPlan, context: GenerationContext, hash: Hash): FrontendPrepared {
  const preflight = requirePreflight(plan,context,hash,'frontend'), nodes = new Map(plan.spec.nodes.map(n => [n.id,n]));
  const mappings: MappingEntry[] = [];
  for (const node of plan.spec.nodes) if (node.kind === 'component') {
    const m = context.registry.entries.find(m => m.id === node.mappingId)!;
    if (!mappings.some(existing => existing.id === m.id)) mappings.push(m);
  }
  const alias = (m: MappingEntry) => 'LibraryComponent' + mappings.indexOf(m);
  const property = (v: PropertyValue, m: MappingEntry, port: string) => typeof v === 'object'
    ? '(' + quote(Object.fromEntries(Object.entries(v.state).map(([s,value]) => [s,transformValue(value,m.props[port].code.transform)]))) + ' as const)[state]'
    : quote(transformValue(v,m.props[port].code.transform));
  function render(id: string): string {
    const n = nodes.get(id)!;
    const marker = '{/* plan-node: ' + n.id + ' */}\n';
    if (n.kind === 'text') return marker + '<span data-plan-node=' + quote(n.id) + '>{' + quote(n.text) + '}</span>';
    if (n.kind === 'stack') return marker + '<div data-plan-node=' + quote(n.id) + ' style={{display:"flex",flexDirection:' + quote(n.direction === 'vertical' ? 'column' : 'row') + ',gap:' + n.gap + '}}>' + n.children.map(render).join('\n') + '</div>';
    const m = context.registry.entries.find(m => m.id === n.mappingId)!;
    const explicitProps = Object.keys(n.props).map(port => m.props[port].code.prop);
    const props = Object.entries(m.profile?.code || {}).filter(([name]) => !explicitProps.includes(name)).map(([name,value]) => name + '={' + quote(value) + '}')
      .concat(Object.keys(n.props).map(port => m.props[port].code.prop + '={' + property(n.props[port],m,port) + '}'));
    if (n.actions) {
      if (n.actions.items.some(a => a.view !== undefined)) props.push('primaryFirst={' + (n.actions.items[0].view === 'primary') + '}');
      props.push('elements={[' + n.actions.items.map(a => {
        const disabled = a.disabled === undefined ? '' : ', disabled:' + (typeof a.disabled === 'boolean' ? quote(a.disabled) : '(' + quote(a.disabled.state) + ' as const)[state]');
        return '{ /* plan-action: ' + a.id + ' */ children:' + quote(a.label) + disabled + (a.behavior === 'none' ? '' : ', onClick:() => dispatch(' + quote(a.eventId) + ')') + ' }';
      }).join(',') + ']}');
    }
    const children = Object.values(n.slots).flat().map(render).join('\n');
    return marker + '<' + alias(m) + ' ' + props.join(' ') + '>' + children + '</' + alias(m) + '>';
  }
  const stateType = plan.spec.states.values.map(quote).join(' | ');
  const transitions = Object.fromEntries(plan.spec.events.map(e => [e.id,Object.fromEntries(plan.spec.transitions.filter(t => t.eventId === e.id).map(t => [t.from,t.to]))]));
  const imports = mappings.map(m => 'import { ' + m.code.exportName + ' as ' + alias(m) + ' } from ' + quote(m.code.module) + ';').join('\n');
  const eventType = plan.spec.events.length ? plan.spec.events.map(e => quote(e.id)).join(' | ') : 'never';
  const text = 'import { useState } from "react";\n' + imports + '\n'
    + 'type ScreenState = ' + stateType + ';\ntype ScreenEvent = ' + eventType + ';\n'
    + 'const transitions: Partial<Record<ScreenEvent,Partial<Record<ScreenState,ScreenState>>>> = ' + quote(transitions) + ';\n'
    + 'export function GeneratedScreen({onEvent}:{onEvent?:(event:ScreenEvent)=>void}) {\n'
    + 'const [state,setState] = useState<ScreenState>(' + quote(plan.spec.states.initial) + ');\n'
    + 'function dispatch(event:ScreenEvent) { setState(current => transitions[event]?.[current] ?? current); onEvent?.(event); }\n'
    + 'return <div data-generation-plan=' + quote(preflight.planHash) + ' data-screen-state={state}>' + render(plan.spec.root) + '</div>;\n}\n';
  const lineOf = (marker: string) => text.split('\n').findIndex(line => line.includes(marker)) + 1;
  const provenance = plan.spec.nodes.map(n => ({ planNodeId: n.id, artifactId: 'GeneratedScreen.tsx:' + lineOf('plan-node: '+n.id+' */') }));
  for (const n of plan.spec.nodes) if (n.kind === 'component' && n.actions) for (const a of n.actions.items) provenance.push({ planNodeId: a.id, artifactId: 'GeneratedScreen.tsx:' + lineOf('plan-action: '+a.id+' */') });
  return { planHash: preflight.planHash, files: [{ path: 'GeneratedScreen.tsx', text }], provenance };
}
export type FrontendHost = {
  readContext(spec: CompositionPlan['spec']): Promise<GenerationContext>;
  /** Atomic private workspace write; track all new files even on partial error. */
  create(prepared: FrontendPrepared): Promise<void>;
  prepare?(plan:CompositionPlan,context:GenerationContext):Promise<FrontendPrepared>;
  executeRemote?(plan:CompositionPlan):Promise<TargetReceipt>;
  transactionProvenance?():FrontendPrepared['provenance'];
  artifact?():NonNullable<TargetReceipt['artifact']>;
  verify(plan: CompositionPlan): Promise<HostVerification>;
  rollback(): Promise<void>;
};
export async function executeFrontend(plan: CompositionPlan, hash: Hash, host: FrontendHost): Promise<TargetReceipt> {
  const receipt: TargetReceipt = { schemaVersion: 'apollo.generation-target-receipt.v1-experimental', target: 'frontend', planHash: hash(plan),
    pins: plan.pins, status: 'blocked', provenance: [], verification: 'not-run', diagnostics: [], rollback: 'not-needed' };
  if (plan.schemaVersion !== 'apollo.composition-plan.v1-experimental' || !['apollo.screen-spec.v1-experimental','apollo.screen-spec.v2-experimental'].includes(plan.spec?.schemaVersion)) {
    receipt.diagnostics.push({code:'GENERATION_PLAN_VERSION_UNSUPPORTED',stage:'preflight',target:receipt.target,message:'This target supports general ScreenSpec v1/v2 plans; the separate static Draft protocol is review-only.'});
    return receipt;
  }
  let writing = false;
  try {
    const context = await host.readContext(plan.spec), preflight = requirePreflight(plan,context,hash,'frontend');
    if(host.executeRemote){
      writing=true;
      const remote=await host.executeRemote(plan);
      if(!remote||!Array.isArray(remote.diagnostics)||!Array.isArray(remote.provenance)||!['not-run','passed','failed','incomplete'].includes(remote.verification)||!['not-needed','complete','incomplete'].includes(remote.rollback))throw new Error('FRONTEND_RECEIPT_INVALID');
      if(remote.schemaVersion!==receipt.schemaVersion||remote.target!=='frontend'||remote.planHash!==hash(plan)||hash(remote.pins)!==hash(plan.pins)||!['blocked','failed','created','verified'].includes(remote.status))throw new Error('FRONTEND_RECEIPT_INVALID');
      try { requirePreflight(plan,await host.readContext(plan.spec),hash,'frontend'); }catch(error){await host.rollback();throw error;}
      if(remote.status==='verified'&&remote.verification!=='passed'||remote.status==='created'&&!['passed','incomplete'].includes(remote.verification)||['blocked','failed'].includes(remote.status)&&remote.artifact)throw new Error('FRONTEND_RECEIPT_INVALID');
      if(remote.verification==='passed'&&assessVerification(plan,context,{status:'passed',evidence:remote.verificationEvidence,diagnostics:remote.diagnostics})!=='passed')throw new Error('FRONTEND_RECEIPT_INVALID');
      if(remote.artifact&&(remote.artifact.version!==1||! /^[a-f0-9]{32}$/.test(remote.artifact.id)||remote.artifact.entryPath!=='dist/index.html'||!['accepted-source','synthetic-local'].includes(remote.artifact.authority)||!Array.isArray(remote.artifact.files)||remote.artifact.files.length>128||remote.artifact.files.some(f=>typeof f.path!=='string'||! /^[A-Za-z0-9_./-]+$/.test(f.path)||f.path.startsWith('/')||f.path.split('/').some(s=>s==='..'||s==='.'||!s)||! /^[a-f0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.bytes)||f.bytes<0)||new Set(remote.artifact.files.map(f=>f.path)).size!==remote.artifact.files.length||!remote.artifact.files.some(f=>f.path===remote.artifact!.entryPath)||remote.artifact.manifestHash!==hash(remote.artifact.files)))throw new Error('FRONTEND_RECEIPT_INVALID');
      return remote;
    }
    const prepared = host.prepare?await host.prepare(plan,context):prepareFrontend(plan,context,hash);
    // Read again after preparation. A producer/checkout edit must not reach disk.
    requirePreflight(plan,await host.readContext(plan.spec),hash,'frontend');
    writing = true; await host.create(prepared); receipt.provenance = prepared.provenance;
    requirePreflight(plan,await host.readContext(plan.spec),hash,'frontend');
    const verification = await host.verify(plan); receipt.diagnostics = verification.diagnostics;
    requirePreflight(plan,await host.readContext(plan.spec),hash,'frontend');
    if(host.artifact)receipt.artifact=host.artifact();
    receipt.verification = assessVerification(plan,context,verification); receipt.verificationEvidence = verification.evidence;
    if (receipt.verification === 'failed') throw new Error('TARGET_VERIFICATION_FAILED');
    receipt.status = receipt.verification === 'passed' ? 'verified' : 'created';
  } catch (error) {
    delete receipt.artifact;
    receipt.status = writing ? 'failed' : 'blocked';
    if(host.transactionProvenance)try{receipt.provenance=host.transactionProvenance();}catch{}
    const native=(error as any)?.diagnostics;
    if(Array.isArray(native))receipt.diagnostics.push(...native.filter((d:any)=>d&&typeof d.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(d.code)&&typeof d.message==='string').slice(0,32).map((d:any)=>({code:d.code,stage:writing?'execution' as const:'preflight' as const,target:'frontend' as const,message:d.message.slice(0,500)})));
    receipt.diagnostics.push({ code: generationErrorCode(error,'TARGET_EXECUTION_FAILED'), stage: writing ? 'execution' : 'preflight', target: 'frontend', message: 'Frontend generation did not complete.' });
    if (writing) { try { await host.rollback(); receipt.rollback = 'complete'; } catch { receipt.rollback = 'incomplete'; } }
  }
  return receipt;
}

export {assertFrontendProfile} from './profile';
export type {FrontendProfile,FrontendProfileId} from './profile';
