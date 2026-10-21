import type { CompiledContract, ManualSource, PreviewSnapshot, TypedConstraint, VariantEvidence } from './types';
import { stableHash } from './stable';
import { matchesCaptureRepresentation } from './capture-representation';

const record = (v: any): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const unknown = (n: Record<string, any>, fact: string) => (n.unknownFacts || []).some((p: string) => p === fact || fact.startsWith(p + '.') || p.startsWith(fact + '.'));
const styleKey = (id: unknown): string | undefined => typeof id === 'string'
  ? (/^S:([a-f0-9]{40})(?:,[^\s]+)?$/i.exec(id)?.[1] || (/^[a-f0-9]{40}$/i.test(id) ? id : undefined))?.toLowerCase() : undefined;
const variableKey = (id: unknown): string | undefined => typeof id === 'string'
  ? (/^VariableID:([a-f0-9]{40})(?:\/[^\s]+)?$/i.exec(id)?.[1] || (/^[a-f0-9]{40}$/i.test(id) ? id : undefined))?.toLowerCase() : undefined;

export const bindingConsistencyKey = (c: TypedConstraint): string => `b_${stableHash({kind:c.bindingKind,reference:c.bindingReference,roles:c.targetRoles}).slice(0,16)}`;

export function hasTextBindingReference(manual: ManualSource, evidence: VariantEvidence | undefined, c: TypedConstraint): boolean {
  return Boolean(evidence?.variants.length && evidence.variants.every(v=>{
    const reps=manual.representations.filter(r=>matchesCaptureRepresentation(r,v.componentKey,v.componentSetKey));
    const rows=evidence.textBindings?.filter(b=>b.componentKey===v.componentKey&&b.componentSetKey===v.componentSetKey) || [];
    if (reps.length!==1 || rows.length!==1) return false;
    const keys=(c.targetRoles || []).map(role=>{
      const targets=manual.targets.filter(t=>t.semanticRole===role),t=targets[0];
      if (targets.length!==1) return;
      const hints=t.representationHints?.filter(h=>h.representationId===reps[0].id) || [];
      if (hints.length>1) return;
      const path=hints[0]?.pathHint || t.pathHint;
      return path && styleKey(rows[0].styleKeysByPath?.[path.split(' / ').slice(1).join(' / ')]);
    });
    return keys.length>0 && keys.every(Boolean) && new Set(keys).size===1;
  }));
}

/** Capture range-level bindings and resolve file-local IDs once per capture.
 * This is observation only: no rule evaluation and no inferred RGB identity. */
export async function captureTextFillEvidence(node: any, serialize: (paints: any) => unknown,
  resolveKey: (id: string) => Promise<string | undefined>): Promise<Record<string, any>> {
  const evidence: Record<string, any> = {version:1,keysById:{}};
  try {
    evidence.segments = node.getStyledTextSegments(['fills']).map((s: any) => ({start:s.start,end:s.end,paints:serialize(s.fills)}));
    evidence.emptyPaints = serialize(node.fills);
  } catch { return evidence; }
  const ids = new Set<string>();
  for (const paints of [evidence.emptyPaints,...evidence.segments.map((s:any)=>s.paints)]) {
    if (Array.isArray(paints)) for (const p of paints) {
      for (const id of [p.tokenId,...(Array.isArray(p.gradientStops)?p.gradientStops.map((s:any)=>s.tokenId):[])]) {
        if (typeof id === 'string' && id && !variableKey(id)) ids.add(id);
      }
    }
  }
  await Promise.all([...ids].map(async id => {
    try { const key=await resolveKey(id); if (key) evidence.keysById[id]=key; } catch { /* stays unknown */ }
  }));
  return evidence;
}

function ranges(node: Record<string, any>, evidence: Record<string, any>): any[] | undefined {
  if (evidence.version !== 1 || unknown(node,'text.characters') || typeof node.text?.characters !== 'string' || !Array.isArray(evidence.segments)) return;
  let end=0;
  const valid=evidence.segments.every((s:any)=>s && Number.isInteger(s.start) && Number.isInteger(s.end)
    && s.start===end && s.end>s.start && s.end<=node.text.characters.length && (end=s.end));
  return valid && end===node.text.characters.length ? evidence.segments : undefined;
}

/** Facts have identity/validity, never a rule verdict. RuleIR performs equality. */
export function materializeTextBindingIdentities(snapshot: PreviewSnapshot, contract: CompiledContract): void {
  if (contract.runtimePolicy.textBindingIdentityFactsVersion !== 1) return;
  for (const node of snapshot.nodes) {
    delete node.textBindingIdentityV1; delete node.selectedTextBindingV1;
    node.unknownFacts=((node.unknownFacts || []) as string[]).filter(p=>!['textBindingIdentityV1','selectedTextBindingV1'].some(base=>p===base||p.startsWith(base+'.')));
    if (node.type!=='TEXT') continue;
    const facts: Record<string, any>={};
    const missing=(kind:string)=> (node.unknownFacts as string[]).push(`textBindingIdentityV1.${kind}`);
    const fill=record(node.textFillEvidenceV1), style=record(node.textStyleEvidenceV1);
    const fillRanges=ranges(node,fill), styleRanges=ranges(node,style);
    const paints=node.textFillEvidenceV1===undefined ? [record(node.appearance).fill]
      : fillRanges ? (fillRanges.length?fillRanges.map(s=>s.paints):[fill.emptyPaints]) : undefined;
    let unavailable=!paints || unknown(node,'appearance.fill') || unknown(node,'textFillEvidenceV1');
    // A captured range list supersedes Figma's mixed node-level fill summary.
    if (fillRanges && !unknown(node,'textFillEvidenceV1')) unavailable=false;
    let invalid=false; const keys:string[]=[];
    if (paints) for (const list of paints) {
      if (!Array.isArray(list)) {unavailable=true;continue;}
      let active=0;
      for (const raw of list) {
        const p=record(raw);
        if (p.visible===false || p.opacity===0) continue;
        active++;
        if (p.visible!==true || typeof p.opacity!=='number' || !Number.isFinite(p.opacity)) {unavailable=true;continue;}
        const ids = p.type==='SOLID' ? [p.tokenId]
          : /^GRADIENT_/.test(p.type) && Array.isArray(p.gradientStops) && p.gradientStops.length
            ? p.gradientStops.filter((s:any)=>s.color?.a!==0).map((s:any)=>s.tokenId) : [];
        if (!ids.length) {invalid=true;continue;}
        for (const id of ids) {
          if (id===undefined || id===null || id==='') {invalid=true;continue;}
          const key=variableKey(id)||variableKey(record(fill.keysById)[id]);
          if (key) keys.push(key); else unavailable=true;
        }
      }
      if (!active) invalid=true;
    }
    const unique=[...new Set(keys)].sort();
    if (unique.length>1) invalid=true;
    if (!unavailable || invalid) facts.fill={valid:!invalid && !unavailable && unique.length===1,keys:unique};
    else missing('fill');

    const ids=node.textStyleEvidenceV1===undefined ? [record(record(node.appearance).typography).styleId]
      : styleRanges ? (styleRanges.length?styleRanges.map(s=>s.styleId):[record(record(node.appearance).typography).styleId]) : undefined;
    let styleUnknown=!ids || unknown(node,'textStyleEvidenceV1');
    if (node.textStyleEvidenceV1===undefined && unknown(node,'appearance.typography')) styleUnknown=true;
    let detached=false; const styles:string[]=[];
    if (ids) for (const id of ids) {
      if (id==='') {detached=true;continue;}
      const key=styleKey(id)||styleKey(record(style.keysById)[id]);
      if (key) styles.push(key); else styleUnknown=true;
    }
    const uniqueStyles=[...new Set(styles)].sort();
    if (uniqueStyles.length>1) detached=true;
    if (!styleUnknown || detached) facts.style={valid:!detached && !styleUnknown && uniqueStyles.length===1,keys:uniqueStyles};
    else missing('style');
    node.textBindingIdentityV1=facts;
  }

  const roots=snapshot.nodes.filter(n=>snapshot.selection.includes(String(n.id)));
  if (roots.length!==1) return;
  const root=roots[0], expected:Record<string,unknown>={}; root.selectedTextBindingV1=expected;
  const reps=contract.facts.representations.filter(r=>r.kind==='figma' && r.status!=='deprecated'
    && matchesCaptureRepresentation(r,snapshot.source?.componentKey || '',snapshot.source?.componentSetKey || ''));
  const variants=(contract.facts.variantEvidence?.textBindings || []).filter(v=>v.componentKey===snapshot.source?.componentKey
    && v.componentSetKey===(snapshot.source?.componentSetKey || snapshot.source?.componentKey));
  for (const c of contract.facts.textBindingComparisons || []) {
    if (c.type!=='bindingConsistency' || c.bindingReference!=='selected-variant') continue;
    const path=`selectedTextBindingV1.${bindingConsistencyKey(c)}`;
    const keys:string[]=[]; let valid=reps.length===1 && variants.length===1
      && ['verified','partial'].includes(String(record(root.variantAvailability).status));
    for (const role of c.targetRoles || []) {
      const targets=contract.facts.targets.filter(t=>t.semanticRole===role), target=targets[0];
      const hints=target?.representationHints?.filter(h=>h.representationId===reps[0]?.id) || [];
      const targetPath=hints.length===1 ? hints[0].pathHint : target?.pathHint;
      const key=targetPath && styleKey(variants[0]?.styleKeysByPath?.[targetPath.split(' / ').slice(1).join(' / ')]);
      if (targets.length!==1 || hints.length>1 || !key) valid=false;
      else keys.push(key);
    }
    if (valid && keys.length && new Set(keys).size===1) expected[bindingConsistencyKey(c)]=[keys[0]];
    else (root.unknownFacts as string[]).push(path);
  }
}
