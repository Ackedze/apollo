import type { CompiledContract, PreviewSnapshot } from './types';
const record=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const known=(n:any,p:string)=>!(n.unknownFacts||[]).some((x:string)=>x===p||p.startsWith(x+'.')||x.startsWith(p+'.'));
/** Read the proven selected-host reference, never observed text or Style labels. */
export function materializeLineHeightReferences(snapshot:PreviewSnapshot,contract:CompiledContract):void {
  const roles=[...new Set(contract.capabilities.facts.filter(f=>f.startsWith('lineHeightReferenceV1.'))
    .map(f=>f.slice('lineHeightReferenceV1.'.length)))];
  if(!roles.length)return;
  const roots=snapshot.nodes.filter(n=>snapshot.selection.includes(String(n.id))),values:Record<string,number>={};
  const raw=record(record((snapshot as any).rawCatalogueReference).base),source=record(record(raw.source).rawCatalogue);
  const ledger=record((snapshot as any).declaredTargetIdentitiesV1);
  const actualIdentity=record(record(roots[0]?.component).identity);
  const rawProven=roots.length===1&&actualIdentity.componentKey===record(raw.source).componentKey
    &&(actualIdentity.componentSetKey||'')===(record(raw.source).componentSetKey||'')
    &&known(roots[0],'component.identity.componentKey')&&known(roots[0],'component.identity.componentSetKey')
    &&source.manualSourceHash===contract.package.manualSourceHash
    &&ledger.schemaVersion==='apollo.declared-target-identities.v1'&&ledger.basis==='pinned-raw-catalogue'
    &&ledger.manualSourceHash===contract.package.manualSourceHash&&/^[a-f0-9]{64}$/.test(source.referenceHash||'')
    &&ledger.referenceHash===source.referenceHash;
  for(const role of roles){
    if(roots.length!==1)continue;
    const native=['verified','partial'].includes(record(roots[0].variantAvailability).status);
    const targets=contract.facts.targets.filter(t=>t.semanticRole===role&&t.resolution==='resolved');
    const nodes=snapshot.nodes.filter(n=>n.type==='TEXT'&&record(n.semantic).role===role);
    if(targets.length!==1||nodes.length!==1)continue;
    const n=nodes[0],proof=record(n.baselineProvenance),text=record(record(record(n.baseline).effective).text),lh=record(text.lineHeight);
    if(!native&&(!rawProven||!Array.isArray(ledger.targets)||ledger.targets.filter((t:any)=>t.targetId===targets[0].id
      &&t.status==='resolved'&&t.nodeId===n.id&&t.nodeType==='TEXT'&&t.referencePath===proof.referencePath).length!==1
      ||!['pinned-raw-catalogue','pinned-raw-nested-variant'].includes(proof.basis)))continue;
    if(proof.status!=='matched'||!known(n,'baseline.effective.text.lineHeight')||!known(n,'baselineProvenance'))continue;
    const pixels=lh.unit==='PIXELS'?lh.value:lh.unit==='PERCENT'&&known(n,'baseline.effective.text.fontSize')
      &&typeof text.fontSize==='number'&&Number.isFinite(text.fontSize)&&text.fontSize>0?text.fontSize*lh.value/100:undefined;
    if(typeof pixels==='number'&&Number.isFinite(pixels)&&pixels>0)values[role]=pixels;
  }
  for(const node of snapshot.nodes){
    node.lineHeightReferenceV1={...values};
    node.unknownFacts=((node.unknownFacts||[]) as string[]).filter(p=>p!=='lineHeightReferenceV1'&&!p.startsWith('lineHeightReferenceV1.'));
    for(const role of roles)if(values[role]===undefined)(node.unknownFacts as string[]).push(`lineHeightReferenceV1.${role}`);
  }
}
