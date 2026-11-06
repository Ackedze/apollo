import { createCooperativeYield } from './utils/promisePool';

export type PageBaseCheck={id:'font'|'theme';status:'complete'|'incomplete'|'not-applicable';classification:'compliant'|'violation'|'unknown'|'not-applicable';message:string;focusNodeId:string|null;gaps:string[];evidence:Record<string,unknown>};
const normalize=(value:unknown)=>String(value).trim().toLowerCase().replace(/\s+/g,' ');

/** Existing page Theme/Font readers from document-audit/engine; no second audit. */
export async function checkPageBase(api:PluginAPI,channel:string,roots:readonly SceneNode[],guard:()=>void,capturedNodes?:readonly SceneNode[]):Promise<PageBaseCheck[]>{
 const checkpoint=createCooperativeYield(guard),page=api.currentPage,gaps:string[]=[],collections=new Map<string,VariableCollection|null>(),groups=new Map<string,{aliases:Set<string>;collections:VariableCollection[]}>();
 const focusNodeId=roots[0]?.id??null;
 if(['iOS','Android'].includes(channel))return(['font','theme'] as const).map(id=>({id,status:'not-applicable',classification:'not-applicable',message:'Проверка не применяется на этой платформе.',focusNodeId,gaps:[],evidence:{pageId:page.id}}));
 const explicit=Object.assign({},page.explicitVariableModes||{});
 async function collection(id:string){
  if(collections.has(id))return;collections.set(id,null);guard();
  let value:VariableCollection|null;try{value=await api.variables.getVariableCollectionByIdAsync(id);}catch(_){guard();gaps.push('variable-collection-unavailable');return;}guard();
  if(!value){gaps.push('variable-collection-unavailable');return;}collections.set(id,value);
  const identity=value.remote===true&&value.key?'published:'+value.key:'id:'+value.id;
  const group=groups.get(identity)??{aliases:new Set<string>(),collections:[]};
  group.aliases.add(id);group.aliases.add(value.id);group.collections.push(value);groups.set(identity,group);
 }
 for(const id of Object.keys(explicit)){await checkpoint();await collection(id);}
 async function visit(nodes:readonly SceneNode[]){
  const stack=Array.from(nodes).reverse(),seen=new Set<string>();
  while(stack.length){await checkpoint();const node=stack.pop()!;if(seen.has(node.id))continue;seen.add(node.id);
   for(const id of Object.keys(node.resolvedVariableModes||{}))await collection(id);
   if('children'in node)for(let i=node.children.length-1;i>=0;i--)stack.push(node.children[i]);
  }
 }
 const known=(name:string)=>Array.from(groups.values()).some(group=>group.collections.some(c=>normalize(c.name)===name));
 if(capturedNodes){for(const node of capturedNodes){await checkpoint();for(const id of Object.keys(node.resolvedVariableModes||{}))await collection(id);}}
 else await visit(roots);
 if(!known('font')||!known('theme'))await visit(page.children);
 const themeGaps=gaps.slice(),themeGroups=Array.from(groups.values()).filter(group=>group.collections.some(c=>normalize(c.name)==='theme'));
 const theme:PageBaseCheck={id:'theme',status:'incomplete',classification:'unknown',message:'Не удалось однозначно определить коллекцию Theme на текущей странице.',focusNodeId,gaps:themeGaps,evidence:{pageId:page.id,property:'Theme',collectionCount:themeGroups.length}};
 if(themeGroups.length!==1)themeGaps.push(themeGroups.length?'theme-collection-ambiguous':'theme-collection-unavailable');
 else{
  const group=themeGroups[0],all=group.collections,c=all[0],corp=all.map(c=>c.modes.filter(mode=>mode.name==='Corp'));
  const corpIds=new Set(corp.flatMap(modes=>modes.map(mode=>mode.modeId))),actualIds=new Set(Array.from(group.aliases).filter(id=>Object.prototype.hasOwnProperty.call(explicit,id)).map(id=>explicit[id]));
  const actual=actualIds.size===1?Array.from(actualIds)[0]:null;
  if(all.some(c=>normalize(c.name)!=='theme'))themeGaps.push('theme-collection-identity-conflict');
  else if(corp.some(modes=>modes.length!==1)||corpIds.size!==1)themeGaps.push('corp-mode-unavailable-or-conflicting');
  else if(actualIds.size>1)themeGaps.push('page-theme-mode-alias-conflict');
  else if(actual!==null&&all.some(c=>c.modes.filter(mode=>mode.modeId===actual).length!==1))themeGaps.push('page-theme-mode-unavailable');
  else if(actual!==null&&new Set(all.map(c=>c.modes.find(mode=>mode.modeId===actual)?.name)).size!==1)themeGaps.push('page-theme-mode-alias-conflict');
  else{
   const expected=Array.from(corpIds)[0],matches=actual===expected;
   theme.status=themeGaps.length?'incomplete':'complete';theme.classification=matches?(themeGaps.length?'unknown':'compliant'):'violation';
   theme.message=matches?'На текущей странице явно выбран режим Corp.':'На текущей странице не выбран явный режим Corp.';
   Object.assign(theme.evidence,{collectionId:c.id,collectionKey:c.key||null,collectionRemote:c.remote===true,expectedModeId:expected,actualModeId:actual,actualModeName:actual===null?null:c.modes.find(mode=>mode.modeId===actual)?.name});
  }
 }
 const fontGroups=Array.from(groups.values()).filter(group=>group.collections.some(c=>normalize(c.name)==='font'));
 const modes:Array<Record<string,any>>=[];let unknown=0;
 for(const group of fontGroups){
  await checkpoint();const all=group.collections,c=all[0],actualIds=new Set(Array.from(group.aliases).filter(id=>Object.prototype.hasOwnProperty.call(explicit,id)).map(id=>explicit[id]));
  const defaults=new Set(all.map(c=>c.defaultModeId)),expected=all.map(c=>c.modes.filter(m=>normalize(m.name)==='alfasans'));
  const expectedIds=new Set(expected.flatMap(modes=>modes.map(mode=>mode.modeId))),actual=actualIds.size===1?Array.from(actualIds)[0]:actualIds.size===0&&defaults.size===1?Array.from(defaults)[0]:null;
  const actualModes=all.map(c=>c.modes.filter(mode=>mode.modeId===actual));
  if(all.some(c=>normalize(c.name)!=='font')||actualIds.size>1||actual===null||actualModes.some(modes=>modes.length!==1)||new Set(actualModes.map(modes=>modes[0]?.name)).size!==1){unknown++;gaps.push('font-mode-unavailable-or-conflicting');continue;}
  const name=actualModes[0][0].name;
  if(!['alfasans','system (sf)'].includes(normalize(name))){unknown++;gaps.push('font-mode-unrecognized');continue;}
  modes.push({collectionId:c.id,collectionKey:c.key||null,collectionIdentity:c.remote===true&&c.key?'published:'+c.key:'id:'+c.id,collectionName:c.name,actualModeId:actual,actualModeName:name,expectedModeId:expected.every(modes=>modes.length===1)&&expectedIds.size===1?Array.from(expectedIds)[0]:null,modeSource:actualIds.size?'explicit':'default'});
 }
 if(!fontGroups.length)gaps.push('font-collection-unavailable');
 const mismatches=modes.filter(mode=>normalize(mode.actualModeName)==='system (sf)'),chosen=mismatches[0]||modes[0];
 const confirmed=!!chosen&&(mismatches.length>0||unknown===0)&&gaps.length===0;
 const violation=mismatches.length>0;
 guard();return[theme,{id:'font',status:confirmed?'complete':'incomplete',classification:violation?'violation':confirmed?'compliant':'unknown',
  message:violation?'На текущей странице выбран System (SF). Выбери AlfaSans в коллекции Font.':confirmed?'На текущей странице выбран AlfaSans.':'Не удалось подтвердить режим Font на текущей странице.',focusNodeId,gaps:Array.from(new Set(gaps)),
  evidence:Object.assign({pageId:page.id,property:'Font',checkedCollections:fontGroups.length,mismatchedCollections:mismatches.length,verifiedCollections:modes.map(mode=>mode.collectionIdentity)},chosen||{})}];
}
