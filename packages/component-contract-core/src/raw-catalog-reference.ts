import type { CompiledContract, PreviewSnapshot } from './types';
import type { PreparedCatalogReference } from './catalog-reference';
import { slug, stableHash } from './stable';
import { catalogOccurrencePaths, selectedTargetPathHint } from './occurrence-address';
import { effectiveFacts } from './instance-validation';
import { projectDeclaredTargetLedger } from './declared-target-identity';
import { declaredTargetMembershipKey } from './declared-target-membership';
import { snapshotPaths } from './snapshot-topology';
import { capturePropertyActivity } from './property-applicability';
import { matchesCaptureRepresentation } from './capture-representation';
import type { DependencyOwnerBaseline } from './component-dependencies';

const clone = <T>(v:T):T => JSON.parse(JSON.stringify(v));
const own = (v:any,k:string) => Object.prototype.hasOwnProperty.call(v || {},k);
const key = (v:any) => typeof v === 'string' && /^[a-f0-9]{40}$/i.test(v);
const at = (v:any,path:string) => path.split('.').reduce((x,k)=>x?.[k],v);
const fail = (code:string):never => {throw Object.assign(Error(code),{code});};
const identity = (n:any) => n.component?.identity || {};
const unknown = (n:any,p:string) => (n.unknownFacts || []).some((q:string)=>q===p || p.startsWith(q+'.'));
const resourceKey = (id:any) => typeof id === 'string' && /^(?:S:|VariableID:)?([a-f0-9]{40})(?:[,/][\d:]+)?$/i.exec(id)?.[1].toLowerCase();
const modelHash = (contract:CompiledContract) => {
  const model=Object.assign({},contract) as Partial<CompiledContract>;
  delete model.rules; // Explicit authoring-preview and enclosing rule guards leave the source model unchanged.
  return stableHash(model);
};

/** Existing Athena structure/patch fields become facts in memory; no new data export. */
export function buildRawCatalogReference(response:any,contract:CompiledContract):PreparedCatalogReference {
  const setKey=response.variant ? response.component.key : '';
  const variants=contract.facts.variantEvidence?.variants.filter(v=>v.componentKey===response.selection.componentKey
    && (v.componentSetKey || '')===setKey) || [];
  if(variants.length!==1) fail('CATALOG_CONTRACT_VARIANT_UNAVAILABLE');
  const result=rawReference(response,contract,variants[0].properties || {});
  (result.snapshot.source as any).rawCatalogue.contractModelHash=modelHash(contract);
  if(response.selection.hostContext?.nestedComponentKeys?.length&&!Array.isArray(response.nestedReferences))
    fail('CATALOG_NESTED_REFERENCES_UNAVAILABLE');
  (result.snapshot.source as any).rawCatalogue.nestedReferenceIssues=clone(response.nestedReferenceIssues || []);
  const requested=response.selection.hostContext?.nestedComponentKeys || [], allowed=new Set(requested.concat(
    response.structure.map((n:any)=>n.componentInstance?.componentKey).filter(Boolean)));
  const seen=new Set<string>(), nested:any[]=[];
  for(const r of response.nestedReferences || []) {
    if(!key(r.componentKey)||seen.has(r.componentKey)||!allowed.has(r.componentKey)
      || !/^[a-f0-9]{64}$/.test(r.catalog?.sha256 || '')
      || !(response.provenance.familyCatalogs || []).some((pin:any)=>pin.file===r.catalog.file&&pin.sha256===r.catalog.sha256)
      || r.variant && (r.variant.key!==r.componentKey || r.component.key!==r.componentSetKey)
      || !r.variant && (r.component.key!==r.componentKey || r.componentSetKey!=='')) fail('CATALOG_NESTED_REFERENCE_INVALID');
    seen.add(r.componentKey);
    const properties=Object.fromEntries((r.variant?.name || '').split(',').flatMap((part:string)=>{
      const pair=/^\s*([^=]+?)\s*=\s*([^=]+?)\s*$/.exec(part);return pair?[[pair[1],pair[2]]]:[];
    }));
    const p=rawReference(Object.assign({},response,{selection:Object.assign({},response.selection,{componentKey:r.componentKey}),
      component:r.component,variant:r.variant,structure:r.structure,provenance:Object.assign({},response.provenance,{catalog:r.catalog})}),contract,properties);
    nested.push(p.snapshot);
    for(const kind of ['style','variable','collection','component'] as const) Object.assign(result.sourceResources[kind],p.sourceResources[kind]);
  }
  // Nested facts stay in the resource walk, so style/token IDs use the same remap.
  if(nested.length)(result.snapshot.nodes[0] as any).rawNestedReferencesV1=nested;
  return result;
}

function rawReference(response:any,contract:CompiledContract,selectedProperties:Record<string,any>):PreparedCatalogReference {
  const selection=response.selection, rows=response.structure, tree=new Map<string,any>();
  for(const row of rows) {
    if(!row || !['string','number'].includes(typeof row.id) || tree.has(String(row.id)) || typeof row.name!=='string'
      || typeof row.type!=='string') fail('CATALOG_SOURCE_TOPOLOGY_INVALID');
    tree.set(String(row.id),row);
  }
  const paths=catalogOccurrencePaths(tree);
  if(!paths) fail('CATALOG_SOURCE_TOPOLOGY_INVALID');
  const root=rows.find((n:any)=>n.parentId===null), families=response.componentFamilies || {};
  if(!['COMPONENT','INSTANCE'].includes(root.type) || Object.entries(families).some(([k,v])=>!key(k)||v!==''&&!key(v)))fail('CATALOG_COMPONENT_FAMILIES_INVALID');
  const setKey=response.variant ? response.component.key : '';
  const properties=clone(selectedProperties), resources:any={style:{},variable:{},collection:{},component:{}};
  const add=(kind:'style'|'variable',id:any) => {const k=resourceKey(id);if(k)resources[kind][id]={id,key:k};return k;};
  const nodes=rows.map((r:any,i:number)=>{
    const layout:any={},appearance:any={},text:any={},component:any={},bindings:any={},unavailablePaints:string[]=[];
    for(const k of ['padding','paddingTokens','itemSpacing','minWidth','minHeight','maxWidth','maxHeight','primaryAxisAlignItems','counterAxisAlignItems'])
      if(own(r.layout,k))layout[k]=clone(r.layout[k]);
    if(r.layout?.direction==='H'||r.layout?.direction==='V')layout.mode=r.layout.direction==='H'?'HORIZONTAL':'VERTICAL';
    for(const [axis,name] of [['horizontal','sizingHorizontal'],['vertical','sizingVertical']])
      if(typeof r.layout?.sizing?.[axis]==='string')layout[name]=r.layout.sizing[axis];
    for(const k of ['opacity','blendMode','strokeAlign','dashPattern'])if(own(r,k))appearance[k]=clone(r[k]);
    if(typeof r.strokeWeight==='number'&&Number.isFinite(r.strokeWeight)&&r.strokeWeight>=0)appearance.strokeWeight=r.strokeWeight;
    if(Array.isArray(r.effects))appearance.effects=r.effects.map((e:any)=>({type:e.type,visible:e.visible!==false}));
    if(['FRAME','INSTANCE','COMPONENT','RECTANGLE'].includes(r.type)&&own(r,'radius'))appearance.radius=clone(r.radius);
    for(const [source,destination]of [['fills','fill'],['strokes','stroke']])if(Array.isArray(r[source])) {
      const normalized=r[destination];
      appearance[destination]=r[source].map((p:any)=>{
        const q:any={type:p.type,visible:p.visible!==false,opacity:p.opacity===undefined?1:p.opacity};
        if(p.type!=='SOLID')unavailablePaints.push('appearance.'+destination);
        if(p.color && typeof p.color==='object') {
          const scale=Math.max(p.color.r,p.color.g,p.color.b)<=1?255:1;
          q.color=Object.fromEntries(['r','g','b'].map(k=>[k,Math.round(p.color[k]*scale)]));
        }
        const token=r[source].length===1?normalized?.token||r[source==='fills'?'fillToken':'strokeToken']||p.tokenKey:p.tokenKey;
        if(token && add('variable',token))q.tokenId=token;
        if(r[source].length===1 && typeof normalized?.color==='string') {
          const rgb=/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(normalized.color);
          if(rgb){q.color={r:Number(rgb[1]),g:Number(rgb[2]),b:Number(rgb[3])};if(rgb[4]!==undefined)q.opacity=Number(rgb[4]);}
          else unavailablePaints.push('appearance.'+destination);
        }
        return q;
      });
      const ids=appearance[destination].flatMap((p:any)=>p.tokenId?[p.tokenId]:[]);
      if(ids.length)bindings[source]={required:true,tokenIds:[...new Set(ids)]};
    }
    for(const [kind,field]of [['fill','fillStyleId'],['stroke','strokeStyleId'],['effects','effectStyleId'],['text','typography']]) {
      const sourceStyle=r.styles?.[kind];
      const style=kind==='effects'&&Array.isArray(sourceStyle)?sourceStyle.length===1?sourceStyle[0]:undefined:sourceStyle;
      const id=style?.styleKey;
      if(kind==='effects'&&(typeof id!=='string'||!/^(?:S:)?[a-f0-9]{40}(?:,[\d:]+)?$/i.test(id)))continue;
      if(id && add('style',id)) {if(kind==='text')appearance.typography={styleId:id};else appearance[field]=id;}
    }
    for(const k of ['characters','fontSize','paragraphSpacing','case','textAlignHorizontal','textAlignVertical'])if(own(r.text,k))text[k]=r.text[k];
    if(typeof r.text?.lineHeight==='number')text.lineHeight={unit:'PIXELS',value:r.text.lineHeight};
    if(typeof r.text?.letterSpacing==='number')text.letterSpacing={unit:'PIXELS',value:r.text.letterSpacing};
    const font=typeof r.text?.fontName==='string' && /^(.*) (Regular|Medium|Bold|Semibold|Light|Black|Heavy|Thin|Italic)$/.exec(r.text.fontName);
    if(font)text.fontName={family:font[1],style:font[2]};
    if(own(r.text,'decoration'))text.decoration=Array.isArray(r.text.decoration)?r.text.decoration:[r.text.decoration];
    if(r.text?.alignHorizontal)text.textAlignHorizontal=r.text.alignHorizontal;
    const instance=r===root?{componentKey:selection.componentKey,variantProperties:properties}:r.componentInstance;
    if(instance?.componentKey)component.identity=Object.assign({componentKey:instance.componentKey},
      own(families,instance.componentKey)?{componentSetKey:families[instance.componentKey]}:r===root?{componentSetKey:setKey}:{});
    component.properties=clone(instance?.variantProperties || {});
    component.propertyTypes=Object.fromEntries(Object.keys(component.properties).map(k=>[k,'VARIANT']));
    const activity=capturePropertyActivity({type:r.type,layoutMode:layout.mode,strokes:r.strokes,
      children:rows.filter((c:any)=>c.parentId===r.id).map((c:any)=>({visible:c.visible}))});
    const facts:any={layout,appearance,text,component,variable:{bindings},visible:r.visible,
      propertyActivityV1:activity,bounds:{},rawCatalogNodeId:String(r.id)};
    for(const k of ['width','height'])if(typeof r.layout?.[k]==='number')facts.bounds[k]=r.layout[k];
    if(Array.isArray(r.strokes))facts.propertyActivityV1.strokePresent=r.strokes.length>0;
    const missing=new Set<string>(['component.propertyReferences','component.propertyReferenceBindings','explicitModes','resolvedModes','hostVariableUsageV1']);
    const strokeSource=r.catalogStrokeWeightUncertainty;
    if(appearance.strokeWeight===undefined || strokeSource?.reason==='inherited-scalar-may-have-lost-undefined-clear'
      &&strokeSource.selectedVariantKey===response.variant?.key&&strokeSource.baseVariantKey!==strokeSource.selectedVariantKey)
      missing.add('appearance.strokeWeight');
    unavailablePaints.forEach(p=>missing.add(p));
    for(const field of ['opacity','radius'])if(r[field+'Token'])missing.add('appearance.'+field);
    for(const f of contract.capabilities.facts.filter(p=>p.startsWith('baseline.effective.')).map(p=>p.slice(19)))
      if(at(facts,f)===undefined)missing.add(f);
    // A token's selected mode is not stored on this raw occurrence. Keep its
    // rendered value unknown rather than copying the tested instance's value.
    for(const [field,b]of Object.entries(bindings) as any)if(b.tokenIds.length)missing.add(field==='fills'?'appearance.fill':'appearance.stroke');
    if(r.typographyToken){missing.add('text.fontName');missing.add('text.letterSpacing');}
    return Object.assign(facts,{id:'raw:'+r.id,parentId:r===root?null:'raw:'+r.parentId,
      childIds:rows.filter((c:any)=>c.parentId===r.id).map((c:any)=>'raw:'+c.id),name:r.name,
      type:r===root?'INSTANCE':r.type,order:i,semantic:{role:slug(r.name),path:r.path},unknownFacts:[...missing]},
      strokeSource?{rawCatalogFactEvidenceV1:{strokeWeight:clone(strokeSource)}}:{});
  });
  const snapshot:any={schemaVersion:'apollo.predicate-snapshot.v2',generatedAt:contract.package.sourceGeneratedAt,
    selection:['raw:'+root.id],context:{platform:contract.facts.representations.find(r=>r.id===selection.representationId)!.platform,modes:{},unknownFacts:['modes']},nodes,
    source:{componentKey:selection.componentKey,componentSetKey:setKey,representationId:selection.representationId,
      rootNodeId:'raw:'+root.id,truncated:false,captureTopology:{version:1,complete:true,issues:[]},
      rawCatalogue:{referenceHash:response.referenceHash,catalog:response.provenance.catalog,manualSourceHash:contract.package.manualSourceHash,compiledContractHash:stableHash(contract),
        representationId:selection.representationId,paths:Object.fromEntries(rows.map((r:any)=>['raw:'+r.id,paths!.get(String(r.id))])),
        familyIssues:clone(response.componentFamilyIssues || []),families}}};
  return {snapshot,variantReference:{componentKey:selection.componentKey,componentSetKey:setKey,complete:false,nodes:[],properties,propertyTypes:Object.fromEntries(Object.keys(properties).map(k=>[k,'VARIANT'])),propertyReferences:[],nodeProperties:{}},
    preparedSourceTopology:{componentKey:selection.componentKey,rootNodeId:'raw:'+root.id,nodes:[]},resourceRequirements:[],
    referenceHash:response.referenceHash,configuration:clone(selection),definedProperties:Object.keys(properties),sourceCollections:{},sourceResources:resources,fontPairs:[],modePaths:[]};
}

/** Proof is local to a parent/owner chain. Values under test never select a match. */
export function rawCatalogCorrespondence(actual:PreviewSnapshot,base:PreviewSnapshot,contract:CompiledContract) {
  const proof=(base.source as any)?.rawCatalogue, pairs=new Map<string,string>(), usageOnly=new Set<string>();
  const matches=new Map<string,{node:any;referencePath:string;kind:string}>();
  if(!proof || proof.manualSourceHash!==contract.package.manualSourceHash || !/^[a-f0-9]{64}$/.test(proof.referenceHash || '')
    || !/^[a-f0-9]{64}$/.test(proof.catalog?.sha256 || '') || actual.selection.length!==1 || base.selection.length!==1
    || !snapshotPaths(actual)) return {pairs,usageOnly,matches};
  const ar=actual.nodes.find(n=>n.id===actual.selection[0]),br=base.nodes.find(n=>n.id===base.selection[0]);
  if(!ar||!br||identity(ar).componentKey!==identity(br).componentKey||ar.type!==br.type
    || (identity(ar).componentSetKey||'')!==(identity(br).componentSetKey||'')
    || unknown(ar,'component.identity.componentKey')||unknown(ar,'component.identity.componentSetKey')||unknown(ar,'type'))return {pairs,usageOnly,matches};
  const actualById=new Map(actual.nodes.map(n=>[String(n.id),n]));
  const bindings=new Map<string,any[]>();
  for(const t of contract.facts.targets) {
    const hint=selectedTargetPathHint(t,proof.representationId,identity(br).componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1)?.split(' / ').slice(1).join(' / ');
    if(hint===undefined)continue;
    const selected=(t.identityBindingsV1 || []).filter(b=>b.componentKey===identity(br).componentKey && b.representationId===proof.representationId && b.nativeSource);
    if(selected.length===1)bindings.set(hint,(bindings.get(hint)||[]).concat(selected[0].nativeSource));
  }
  const sameFamily=(a:any,b:any)=>{
    const x=identity(a),y=identity(b),family=proof.families[y.componentKey];
    return key(x.componentKey)&&key(y.componentKey)&&!unknown(a,'component.identity.componentKey')&&!unknown(a,'component.identity.componentSetKey')
      && !(proof.familyIssues || []).some((issue:any)=>[x.componentKey,y.componentKey].includes(issue.componentKey))
      && (x.componentKey===y.componentKey && (!own(y,'componentSetKey') || (x.componentSetKey||'')===(y.componentSetKey||''))
          && (!own(proof.families,x.componentKey) || (x.componentSetKey||'')===proof.families[x.componentKey])
        || key(family)&&x.componentSetKey===family&&proof.families[x.componentKey]===family);
  };
  const addressMatches=(a:any,b:any)=>{
    const selected=bindings.get(proof.paths[b.id]) || [];
    if(selected.length!==1)return false;
    const pin=selected[0];let owner=actualById.get(String(a.parentId));
    while(owner&&owner.type!=='INSTANCE')owner=actualById.get(String(owner.parentId));
    if(!owner||identity(owner).componentKey!==pin.ownerComponentKey)return false;
    const source=(a.component as any)?.sourceIdentity,observed=(actual.source as any)?.catalogueNodeIds?.[a.id];
    return source?.sourceNodeId===pin.sourceNodeId&&source.ownerComponentKey===pin.ownerComponentKey
      || typeof observed==='string'&&observed.endsWith(';'+pin.sourceNodeId);
  };
  const nested:any[]=(base.nodes[0] as any)?.rawNestedReferencesV1 || [];
  const nestedFor=(k:string)=>{
    const found=nested.filter(s=>s.source?.componentKey===k && s.source?.rawCatalogue?.referenceHash===proof.referenceHash
      && s.source.rawCatalogue.manualSourceHash===proof.manualSourceHash && snapshotPaths(s)
      && s.nodes.filter((n:any)=>s.selection.includes(n.id)&&identity(n).componentKey===k
        && (identity(n).componentSetKey||'')===(s.source.componentSetKey||'')).length===1);
    return found.length===1?found[0]:undefined;
  };
  const visit=(a:any,b:any,tree:any=base,path:string=proof.paths[b.id],old?:{wrapper:any;library:any;tree:any;path:string})=>{
    if(tree===base)pairs.set(a.id,b.id);
    if(a.type==='INSTANCE'&&identity(a).componentKey!==identity(b).componentKey){
      const next=nestedFor(identity(a).componentKey), prior=nestedFor(identity(b).componentKey);
      const root=next?.nodes.find((n:any)=>next.selection.includes(n.id));
      if(!root||!prior||!sameFamily(a,root)){usageOnly.add(a.id);return;}
      visit(a,root,next,path,{wrapper:b,library:prior,tree,path});return;
    }
    let expected=b;
    if(old) {
      expected=clone(b);
      const prefix=old.tree.source.rawCatalogue.paths[old.wrapper.id], relative=path===old.path?'':path.slice(old.path.length+3);
      const wrappers=old.tree.nodes.filter((n:any)=>old.tree.source.rawCatalogue.paths[n.id]===[prefix,relative].filter(Boolean).join(' / '));
      const originals=old.library.nodes.filter((n:any)=>old.library.source.rawCatalogue.paths[n.id]===relative);
      // Keep proved enclosing overrides; missing old facts never prove equality.
      for(const group of ['layout','appearance','text','variable','bounds','propertyActivityV1'])for(const field of Object.keys(expected[group] || {})) {
        const fact=group+'.'+field, w=wrappers[0], l=originals[0];
        if(wrappers.length!==1||originals.length!==1||unknown(w,fact)||unknown(l,fact)||at(w,fact)===undefined||at(l,fact)===undefined)
          expected.unknownFacts=Array.from(new Set([...(expected.unknownFacts || []),fact]));
        else if(JSON.stringify(at(w,fact))!==JSON.stringify(at(l,fact)))expected[group][field]=clone(at(w,fact));
      }
    }
    matches.set(a.id,{node:expected,referencePath:path,kind:tree===base?'pinned-raw-catalogue':'pinned-raw-nested-variant'});
    const ac=actual.nodes.filter(n=>n.parentId===a.id),bc=tree.nodes.filter((n:any)=>n.parentId===b.id),claimed=new Set<string>();
    for(const r of bc) {
      let candidates=ac.filter(n=>!unknown(n,'type')&&n.type===r.type&&(r.type==='INSTANCE'?sameFamily(n,r):!unknown(n,'name')&&n.name===r.name));
      if(r.type==='INSTANCE') {
        const exact=candidates.filter(n=>identity(n).componentKey===identity(r).componentKey);
        if(exact.length)candidates=exact;
        else candidates=candidates.filter(n=>!bc.some((peer:any)=>peer.type==='INSTANCE'&&identity(peer).componentKey===identity(n).componentKey));
      }
      const anchored=tree===base?candidates.filter(n=>addressMatches(n,r)):[];
      if(anchored.length)candidates=anchored;
      else if(bc.filter((n:any)=>n.type===r.type&&(r.type==='INSTANCE'
        ?identity(n).componentKey===identity(r).componentKey:n.name===r.name)).length!==1)continue;
      if(candidates.length!==1||claimed.has(String(candidates[0].id)))continue;
      const childPath=tree===base?proof.paths[r.id]:[path,tree.source.rawCatalogue.paths[r.id].split(' / ').slice(
        tree.source.rawCatalogue.paths[b.id].split(' / ').filter(Boolean).length).join(' / ')].filter(Boolean).join(' / ');
      claimed.add(String(candidates[0].id));visit(candidates[0],r,tree,childPath,old);
    }
  };
  visit(ar,br);return {pairs,usageOnly,matches};
}

/** Partial facts never establish an occurrence identity or a whole baseline. */
function rawCandidateConsensus(actual:PreviewSnapshot,base:PreviewSnapshot,contract:CompiledContract,
  pairs:Map<string,string>,matches:ReturnType<typeof rawCatalogCorrespondence>['matches']) {
  const result=new Map<string,{facts:Record<string,any>;paths:string[];candidates:string[]}>(),proof=(base.source as any)?.rawCatalogue;
  const a=actual.source as any,b=base.source,topology=a?.captureTopology;
  const root=actual.nodes.find(n=>n.id===actual.selection[0]);
  if(!proof||proof.contractModelHash!==modelHash(contract)
    ||!snapshotPaths(Object.assign({},base,{source:Object.assign({},b,{occurrenceAddressVersion:1})}))
    ||!topology?.complete||topology.limitReached||topology.issues?.length
    ||actual.nodes.concat(base.nodes).some(n=>['type','parentId','childIds'].some(p=>unknown(n,p)))
    ||a?.componentKey!==b?.componentKey||(a?.componentSetKey||'')!==(b?.componentSetKey||'')
    ||a?.representationId!==b?.representationId||proof.representationId!==b?.representationId
    ||b?.rootNodeId!==base.selection[0]||!a?.rootNodeId
    ||a.catalogueNodeIds?.[actual.selection[0]]!==a.rootNodeId||a.catalogReference?.referenceHash!==proof.referenceHash
    ||identity(root).componentKey!==a.componentKey||(identity(root).componentSetKey||'')!==(a.componentSetKey||'')
    ||pairs.get(actual.selection[0])!==base.selection[0]
    ||actual.context.unknownFacts?.some(p=>['platform','context.platform','environment.platform'].includes(p)))return result;
  const reps=contract.facts.representations.filter(r=>r.kind==='figma'&&r.status!=='deprecated'
    &&matchesCaptureRepresentation(r,b?.componentKey||'',b?.componentSetKey||''));
  if(reps.length!==1||reps[0].id!==b?.representationId||!actual.context.platform
    ||!['universal',actual.context.platform].includes(reps[0].platform)||base.context.platform!==reps[0].platform)return result;
  const ac=new Map<string,any[]>(),bc=new Map<string,any[]>();
  for(const [tree,index]of [[actual,ac],[base,bc]] as const)for(const n of tree.nodes){
    const parent=String(n.parentId);index.set(parent,(index.get(parent)||[]).concat(n));
  }
  const signature=(n:any)=>JSON.stringify(n.type==='INSTANCE'?[n.type,identity(n).componentKey,identity(n).componentSetKey||'']:[n.type,n.name]);
  const identityKnown=(n:any)=>n.type==='INSTANCE'&&key(identity(n).componentKey)
    &&!['type','component.identity.componentKey','component.identity.componentSetKey'].some(p=>unknown(n,p))
    &&own(identity(n),'componentSetKey')&&!(proof.familyIssues||[]).some((issue:any)=>issue.componentKey===identity(n).componentKey)
    &&own(proof.families,identity(n).componentKey)&&proof.families[identity(n).componentKey]===(identity(n).componentSetKey||'');
  const descend=(node:any,candidates:any[])=>{
    if(candidates.length<2)return;
    const facts:Record<string,any>={},paths:string[]=[];
    const allowed=['paddingApplicable','gapApplicable','axisAlignmentApplicable'].map(f=>'propertyActivityV1.'+f)
      .concat(['top','right','bottom','left'].map(f=>'layout.padding.'+f));
    for(const path of allowed){
      if(path.startsWith('layout.padding.')&&candidates.some(n=>Object.values(n.layout?.paddingTokens||{}).some(Boolean)))continue;
      const values=candidates.map(n=>at(n,path)),value=values[0];
      const typed=path.startsWith('layout.padding.')?typeof value==='number'&&Number.isFinite(value)&&value>=0:typeof value==='boolean';
      if(!typed
        ||candidates.some((n,i)=>unknown(n,path)||(n.unknownFacts||[]).some((p:string)=>p.startsWith(path+'.'))||values[i]!==value))continue;
      const parts=path.split('.');let target=facts;
      for(const part of parts.slice(0,-1))target=target[part]||(target[part]={});
      target[parts[parts.length-1]]=value;paths.push('baseline.effective.'+path);
    }
    if(paths.length)result.set(String(node.id),{facts,paths,candidates:candidates.map(n=>proof.paths[String(n.id)]).sort()});
    const children=ac.get(String(node.id))||[];
    const scopeChildren=children.concat(...candidates.map(parent=>bc.get(String(parent.id))||[]));
    if(scopeChildren.some(child=>unknown(child,'type')||child.type!=='INSTANCE'&&unknown(child,'name')))return;
    for(const child of children){
      if(['INSTANCE','SLOT'].includes(child.type)||unknown(child,'name')||unknown(child,'type')
        ||children.filter(n=>signature(n)===signature(child)).length!==1)continue;
      const next=candidates.map(parent=>(bc.get(String(parent.id))||[]).filter(n=>signature(n)===signature(child)));
      if(next.every(nodes=>nodes.length===1))descend(child,next.map(nodes=>nodes[0]));
    }
  };
  const claimed=new Set(pairs.values());
  for(const [id,rawId]of pairs){
    if(matches.get(id)?.kind!=='pinned-raw-catalogue')continue;
    const left=(ac.get(id)||[]).filter(n=>!pairs.has(String(n.id))),right=(bc.get(rawId)||[]).filter(n=>!claimed.has(String(n.id)));
    if(!left.length||left.length!==right.length||left.concat(right).some(n=>!identityKnown(n)))continue;
    const groups=new Set(left.concat(right).map(signature));
    if([...groups].some(group=>left.filter(n=>signature(n)===group).length!==right.filter(n=>signature(n)===group).length))continue;
    for(const node of left)descend(node,right.filter(n=>signature(n)===signature(node)));
  }
  return result;
}

/** This proves inactivity only, never an active dependency or native reference. */
export function rawHiddenDeclaredTarget(snapshot:PreviewSnapshot,contract:CompiledContract,role:string):boolean {
  const base=(snapshot as any).rawCatalogueReference?.base as PreviewSnapshot|undefined;
  const proof=(base?.source as any)?.rawCatalogue,ledger=(snapshot as any).declaredTargetIdentitiesV1;
  if(!base||!proof||proof.manualSourceHash!==contract.package.manualSourceHash
    ||ledger?.schemaVersion!=='apollo.declared-target-identities.v1'||ledger.basis!=='pinned-raw-catalogue'
    ||ledger.manualSourceHash!==contract.package.manualSourceHash||ledger.referenceHash!==proof.referenceHash
    ||!Array.isArray(ledger.targets)||snapshot.source?.captureTopology?.complete!==true
    ||snapshot.source.captureTopology.limitReached||snapshot.source.captureTopology.issues?.length
    ||snapshot.source.componentKey!==base.source?.componentKey||(snapshot.source.componentSetKey||'')!==(base.source?.componentSetKey||'')
    ||snapshot.source.representationId!==base.source?.representationId
    ||snapshot.context.unknownFacts?.some(p=>['platform','context.platform','environment.platform'].includes(p)))return false;
  const reps=contract.facts.representations.filter(r=>r.id===base.source?.representationId&&r.kind==='figma'&&r.status!=='deprecated'
    &&['universal',snapshot.context.platform].includes(r.platform)&&matchesCaptureRepresentation(r,base.source?.componentKey||'',base.source?.componentSetKey||''));
  const targets=contract.facts.targets.filter(t=>t.semanticRole===role&&t.resolution==='resolved');
  if(reps.length!==1||targets.length!==1)return false;
  const path=selectedTargetPathHint(targets[0],reps[0].id,base.source!.componentKey!,contract.facts.variantEvidence?.occurrenceAddressVersion===1)?.split(' / ').slice(1).join(' / ');
  const claims=ledger.targets.filter((t:any)=>t.targetId===targets[0].id);
  if(path===undefined||claims.length!==1||claims[0].status!=='resolved'||claims[0].referencePath!==path)return false;
  const byId=new Map(snapshot.nodes.map(n=>[String(n.id),n])),node=byId.get(claims[0].nodeId);
  const match=node&&rawCatalogCorrespondence(snapshot,base,contract).matches.get(String(node.id));
  const provenance=node?.baselineProvenance as any;
  if(!node||!match||match.referencePath!==path||provenance?.status!=='matched'||provenance.referencePath!==path
    ||provenance.basis!==match.kind||unknown(node,'baselineProvenance'))return false;
  let current:any=node,visible=true;const seen=new Set<string>();
  while(current&&!seen.has(String(current.id))) {
    seen.add(String(current.id));
    if(unknown(current,'visible')||unknown(current,'parentId')||typeof current.visible!=='boolean')return false;
    visible&&=current.visible;
    if(current.id===snapshot.selection[0])return current.parentId===null&&!visible;
    current=byId.get(String(current.parentId));
  }
  return false;
}

export function materializeRawCatalog(snapshot:PreviewSnapshot,base:PreviewSnapshot,contract:CompiledContract,ownerBaseline?:DependencyOwnerBaseline):void {
  delete (snapshot as any).rawCatalogueInactiveDependencies;
  for(const node of snapshot.nodes)delete node.nativeTargetPropertiesV1;
  const proof=(base.source as any)?.rawCatalogue,{pairs,matches}=rawCatalogCorrespondence(snapshot,base,contract);
  const ledger:any={schemaVersion:'apollo.declared-target-identities.v1',manualSourceHash:contract.package.manualSourceHash,
    basis:'pinned-raw-catalogue',referenceHash:proof?.referenceHash,targets:[]};
  const byId=new Map(base.nodes.map(n=>[String(n.id),n]));
  const contextual=new Map<string,NonNullable<DependencyOwnerBaseline[string]>>();
  for(const node of snapshot.nodes){
    const baseline=ownerBaseline?.[String(node.id)],p=baseline?.provenance,source=p?.rawOwnerContextV1 as any,raw=source&&byId.get(source.childRawNodeId);
    if(p?.basis!=='pinned-raw-owner-context'||p.status!=='matched'||!raw||source.childReferenceHash!==proof?.referenceHash
      ||source.childManualSourceHash!==contract.package.manualSourceHash||source.childCompiledContractHash!==proof.compiledContractHash
      ||p.referencePath!==proof.paths[String(raw.id)]||raw.type!==node.type)continue;
    const expected=Object.assign({},clone(raw),clone(baseline!.effective),{unknownFacts:(baseline!.unknownFacts||[]).map(f=>f.slice('baseline.effective.'.length))});
    pairs.set(String(node.id),String(raw.id));matches.set(String(node.id),{node:expected,referencePath:String(p.referencePath),kind:'pinned-raw-owner-context'});
    contextual.set(String(node.id),baseline!);
  }
  const consensus=rawCandidateConsensus(snapshot,base,contract,pairs,matches);
  for(const node of snapshot.nodes) {
    const match=matches.get(String(node.id)),expected=match?.node;
    node.baseline={effective:expected?effectiveFacts(expected,true):{}};
    node.baselineProvenance=contextual.has(String(node.id))?clone(contextual.get(String(node.id))!.provenance)
      :match?{status:'matched',referencePath:match.referencePath,basis:match.kind}:{status:'unresolved',reason:'raw-correspondence-unavailable'};
    node.unknownFacts=(node.unknownFacts as string[]||[]).filter(p=>p!=='baseline.effective'&&!p.startsWith('baseline.effective.'));
    (node.unknownFacts as string[]).push(...(expected?(expected.unknownFacts as string[]||[]).map(p=>'baseline.effective.'+p):['baseline.effective']));
    delete node.knownFacts;
    const partial=!match&&consensus.get(String(node.id));
    if(partial){
      node.baseline={effective:partial.facts};node.knownFacts=partial.paths;
      node.baselineProvenance={status:'partial',basis:'pinned-raw-candidate-consensus',referenceHash:proof.referenceHash,
        contractModelHash:proof.contractModelHash,candidates:partial.candidates};
    }
    // A proven uniform scalar and four equal sides are the same expectation.
    // Only the representation changes; every side comes from the source value.
    if(typeof expected?.appearance?.strokeWeight==='number'&&(node.appearance as any)?.strokeWeight
      &&typeof (node.appearance as any).strokeWeight==='object') {
      const weight=expected.appearance.strokeWeight;
      (node.baseline as any).effective.appearance=Object.assign({},expected.appearance,{strokeWeight:{top:weight,right:weight,bottom:weight,left:weight}});
    }
  }
  const rootNode=snapshot.nodes.find(n=>n.id===snapshot.selection[0]),rawRoot=base.nodes.find(n=>n.id===base.selection[0]);
  const variants=contract.facts.variantEvidence?.variants.filter(v=>v.componentKey===base.source?.componentKey&&(v.componentSetKey||'')===(base.source?.componentSetKey||''))||[];
  const shape=variants.length===1?contract.facts.variantEvidence?.structures[variants[0].structureId]:undefined;
  const sourceShapeKnown=contextual.size===snapshot.nodes.length&&contextual.size===base.nodes.length&&Array.isArray(shape)
    &&shape.length===base.nodes.length&&shape.every(s=>base.nodes.filter(n=>proof.paths[String(n.id)]===s.path&&(n===rawRoot?'ROOT':n.type)===s.type).length===1)
    &&[rootNode,rawRoot,matches.get(String(rootNode?.id))?.node].every(n=>n&&!unknown(n,'component.properties')&&!unknown(n,'component.propertyTypes')
      &&JSON.stringify(Object.keys(n.component?.propertyTypes||{}).filter(k=>n.component.propertyTypes[k]==='VARIANT').sort())===JSON.stringify(Object.keys(variants[0].properties||{}).sort()))
    &&Object.entries(variants[0].properties||{}).every(([name,value])=>[rootNode,rawRoot,matches.get(String(rootNode?.id))?.node].every(n=>
      n?.component?.propertyTypes?.[name]==='VARIANT'&&n.component.properties?.[name]===value&&!unknown(n,'component.properties.'+name)&&!unknown(n,'component.propertyTypes.'+name)))
    &&[snapshot,base].every(s=>s.nodes.every(n=>n.type!=='SLOT'&&!Object.values((n.component as any)?.propertyTypes||{}).some(t=>t==='SLOT'||t==='INSTANCE_SWAP')));
  if(!proof||!pairs.size){
    ledger.targets=contract.facts.targets.map(t=>({targetId:t.id,semanticRole:t.semanticRole,status:'unknown',reason:'raw-correspondence-unavailable'}));
    projectDeclaredTargetLedger(snapshot,contract,ledger);
    return;
  }
  const typed:any={};
  for(const target of contract.facts.targets) {
    const fact:any={targetId:target.id,semanticRole:target.semanticRole,status:'unknown',reason:'raw-correspondence-unavailable'};ledger.targets.push(fact);
    if(target.resolution!=='resolved'||target.nativeSourceContinuity)continue;
    const path=selectedTargetPathHint(target,proof.representationId,(base.source as any).componentKey,contract.facts.variantEvidence?.occurrenceAddressVersion===1)?.split(' / ').slice(1).join(' / ');
    if(path===undefined)continue;
    let expected=base.nodes.filter(n=>proof.paths[String(n.id)]===path),candidates=snapshot.nodes.filter(n=>expected.length===1
      && (pairs.get(String(n.id))===expected[0].id||matches.get(String(n.id))?.referencePath===path));
    if(!expected.length&&sourceShapeKnown){Object.assign(fact,{status:'resolved',reason:'closed-raw-owner-variant-absence',present:false,referencePath:path});continue;}
    if(!candidates.length && path.split(' / ').some(p=>p.startsWith('@source:'))) {
      const pins=(target.identityBindingsV1||[]).filter(b=>b.componentKey===(base.source as any).componentKey
        && b.representationId===proof.representationId && b.referencePath===path && b.nativeSource);
      const parentPath=path.split(' / ').slice(0,-1).join(' / '),parents=base.nodes.filter(n=>proof.paths[String(n.id)]===parentPath);
      const members=parents.length===1?base.nodes.filter(n=>n.parentId===parents[0].id && n.type==='INSTANCE'):[];
      const families=new Set(members.map(n=>identity(n).componentSetKey));
      // A native contract address can identify usage inside a homogeneous raw
      // family. It cannot pick an ordinal baseline among identical siblings.
      if(pins.length===1 && members.length && families.size===1 && key([...families][0])) {
        const pin=pins[0].nativeSource!;
        candidates=snapshot.nodes.filter(n=>{
          const source=(n.component as any)?.sourceIdentity,observed=(snapshot.source as any)?.catalogueNodeIds?.[String(n.id)];
          let owner=snapshot.nodes.find(p=>p.id===n.parentId);
          while(owner&&owner.type!=='INSTANCE')owner=snapshot.nodes.find(p=>p.id===owner!.parentId);
          return n.type==='INSTANCE' && !unknown(n,'type') && !unknown(n,'component.identity.componentKey')
            && !unknown(n,'component.identity.componentSetKey') && pairs.get(String(n.parentId))===parents[0].id && identity(n).componentSetKey===[...families][0]
            && proof.families[identity(n).componentKey]===[...families][0] && owner && identity(owner).componentKey===pin.ownerComponentKey
            && (source?.sourceNodeId===pin.sourceNodeId && source.ownerComponentKey===pin.ownerComponentKey
              || typeof observed==='string'&&observed.endsWith(';'+pin.sourceNodeId));
        });
        const types=Object.fromEntries(Object.entries((members[0].component as any)?.propertyTypes||{}).filter(([name,type])=>
          type==='VARIANT'&&members.every(n=>(n.component as any)?.propertyTypes?.[name]===type)));
        expected=[{component:{identity:{componentSetKey:[...families][0]},propertyTypes:types}} as any];
      }
    }
    if(candidates.length!==1)continue;
    const node:any=candidates[0],original:any=contextual.has(String(node.id))?matches.get(String(node.id))!.node:expected[0],properties:any={},types:any={};
    Object.assign(fact,{status:'resolved',reason:'exact-raw-owner-correspondence',nodeId:node.id,nodeType:node.type,present:true,referencePath:path});
    let visible:any=node,known=true,effective=true;const seen=new Set<string>();
    while(visible&&!seen.has(visible.id)){seen.add(visible.id);if(typeof visible.visible!=='boolean'||unknown(visible,'visible'))known=false;else effective&&=visible.visible;visible=snapshot.nodes.find(n=>n.id===visible.parentId);}
    if(known)fact.effectiveVisible=effective;
    for(const [name,type]of Object.entries(original.component?.propertyTypes||{}))
      if(type==='VARIANT'&&node.component?.propertyTypes?.[name]===type&&typeof node.component?.properties?.[name]==='string'
        &&!unknown(node,'component.properties.'+name)&&!unknown(node,'component.propertyTypes.'+name)){properties[name]=node.component.properties[name];types[name]=type;}
    typed[declaredTargetMembershipKey(target.id)]=Object.assign({properties,propertyTypes:types,componentSetKey:identity(node).componentSetKey,
      referenceComponentSetKey:identity(original).componentSetKey},known?{effectiveVisible:effective}:{});
  }
  // Explicit source continuity uses the captured native address and the exact
  // independently matched subtree, never a similarly named service part.
  const continuity=contract.runtimePolicy.nativeSourceContinuityVersion===1?contract.facts.targets.filter(t=>t.nativeSourceContinuity):[];
  for(let pass=0;pass<continuity.length;pass++)for(const target of continuity) {
    const fact=ledger.targets.find((f:any)=>f.targetId===target.id), c=target.nativeSourceContinuity!;
    if(!fact||fact.status==='resolved')continue;
    const anchorFact=ledger.targets.find((f:any)=>f.targetId===c.anchorTargetId&&f.status==='resolved');
    const anchor=snapshot.nodes.find(n=>n.id===anchorFact?.nodeId);
    if(!anchor||anchor.type!=='INSTANCE'||unknown(anchor,'component.identity.componentKey'))continue;
    const candidates=snapshot.nodes.filter(n=>{
      if(n.type!==c.nodeType||unknown(n,'type')||unknown(n,'parentId')||!matches.has(String(n.id)))return false;
      let owner=snapshot.nodes.find(p=>p.id===n.parentId);
      while(owner&&!['INSTANCE','COMPONENT','SLOT'].includes(String(owner.type)))owner=snapshot.nodes.find(p=>p.id===owner!.parentId);
      if(owner!==anchor)return false;
      const source=(n.component as any)?.sourceIdentity, observed=(snapshot.source as any)?.catalogueNodeIds?.[String(n.id)];
      return c.sources.filter(s=>s.ownerComponentKey===identity(anchor).componentKey
        && (source?.sourceNodeId===s.sourceNodeId&&source.ownerComponentKey===s.ownerComponentKey
          || typeof observed==='string'&&observed.endsWith(';'+s.sourceNodeId))).length===1;
    });
    if(candidates.length!==1)continue;
    const node:any=candidates[0], match=matches.get(String(node.id))!;
    Object.assign(fact,{status:'resolved',reason:'exact-raw-native-source-continuity',nodeId:node.id,nodeType:node.type,
      present:true,referencePath:match.referencePath});
    const properties:any={},propertyTypes:any={};
    for(const [name,type] of Object.entries(match.node.component?.propertyTypes || {}))if(type==='VARIANT'
      &&node.component?.propertyTypes?.[name]===type&&typeof node.component?.properties?.[name]==='string'
      &&!unknown(node,'component.properties.'+name)&&!unknown(node,'component.propertyTypes.'+name)) {
      properties[name]=node.component.properties[name];propertyTypes[name]=type;
    }
    typed[declaredTargetMembershipKey(target.id)]={properties,propertyTypes,componentSetKey:identity(node).componentSetKey,
      referenceComponentSetKey:identity(match.node).componentSetKey};
  }
  // Reuse the ledger's rooted visibility proof for continuity targets as well.
  projectDeclaredTargetLedger(snapshot,contract,ledger);
  for(const fact of ledger.targets)if(fact.status==='resolved'&&fact.nodeId) {
    const visible=(snapshot.nodes.find(n=>n.id===fact.nodeId)?.visibility as any)?.effective;
    if(typeof visible==='boolean') {
      fact.effectiveVisible=visible;
      const properties=typed[declaredTargetMembershipKey(fact.targetId)];
      if(properties)properties.effectiveVisible=visible;
    }
  }
  projectDeclaredTargetLedger(snapshot,contract,ledger);
  for(const fact of ledger.targets)if(fact.status!=='resolved')delete typed[declaredTargetMembershipKey(fact.targetId)];
  const root=snapshot.nodes.find(n=>n.id===snapshot.selection[0])!;root.nativeTargetPropertiesV1=typed;
  const inactive:string[]=[];
  const relative=(node:any):string=>node.parentId===null?'':[relative(snapshot.nodes.find(n=>n.id===node.parentId)),node.name].filter(Boolean).join(' / ');
  for(const dependency of contract.componentDependencies||[])for(const binding of dependency.bindings) {
    if(!('activeVariant' in binding)||!('ownerComponentSetKeys' in binding)||!binding.activeVariant)continue;
    const activation=binding.activeVariant;
    const owners=snapshot.nodes.filter(n=>{
      const expected=byId.get(pairs.get(String(n.id))||''),path=relative(n),c:any=n.component;
      return expected && n.type==='INSTANCE' && (path===binding.relativePath||path.startsWith(binding.relativePath+' / '))
        && binding.ownerComponentSetKeys?.includes(identity(n).componentSetKey) && identity(n).componentKey===identity(expected).componentKey
        && c?.propertyTypes?.[activation.property]==='VARIANT' && !unknown(n,'component.properties.'+activation.property);
    });
    if(owners.length===1) {
      const value=(owners[0].component as any).properties[activation.property];
      if(typeof value==='string'&&!activation.values.includes(value))inactive.push(dependency.componentId+':'+binding.id);
    }
  }
  (snapshot as any).rawCatalogueInactiveDependencies=inactive;
}
