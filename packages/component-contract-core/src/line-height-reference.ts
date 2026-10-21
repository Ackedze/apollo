import type { CompiledContract, PreviewSnapshot } from './types';
const record=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const known=(n:any,p:string)=>!(n.unknownFacts||[]).some((x:string)=>x===p||p.startsWith(x+'.')||x.startsWith(p+'.'));
/** Read the proven selected-host reference, never observed text or Style labels. */
export function materializeLineHeightReferences(snapshot:PreviewSnapshot,contract:CompiledContract):void {
  const roles=[...new Set(contract.capabilities.facts.filter(f=>f.startsWith('lineHeightReferenceV1.'))
    .map(f=>f.slice('lineHeightReferenceV1.'.length)))];
  if(!roles.length)return;
  const roots=snapshot.nodes.filter(n=>snapshot.selection.includes(String(n.id))),values:Record<string,number>={};
  for(const role of roles){
    if(roots.length!==1||!['verified','partial'].includes(record(roots[0].variantAvailability).status))continue;
    const targets=contract.facts.targets.filter(t=>t.semanticRole===role&&t.resolution==='resolved');
    const nodes=snapshot.nodes.filter(n=>n.type==='TEXT'&&record(n.semantic).role===role);
    if(targets.length!==1||nodes.length!==1)continue;
    const n=nodes[0],proof=record(n.baselineProvenance),text=record(record(record(n.baseline).effective).text),lh=record(text.lineHeight);
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
