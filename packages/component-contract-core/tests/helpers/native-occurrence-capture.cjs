const assert=require('node:assert/strict');

// Independently constructed synthetic library; no user reports or catalogs.
async function runNativeOccurrenceCapture(invoke,options={}) {
 const created=[],pages=[],switches=[],registry=new Map(),page={id:'user-page',type:'PAGE',selection:[]};let sequence=0,dependencyIndex=-1;
 const fails=stage=>options.dependencyStage===stage&&dependencyIndex>=0&&(options.failAll||dependencyIndex===0);
 const fail=stage=>{if(fails(stage))throw new TypeError('synthetic dependency '+stage);};
 const node=(id,name,type,children=[])=>{const result={id,name,type,children,visible:true,opacity:1,width:100,height:40,x:0,y:0,
  resolvedVariableModes:{},componentPropertyReferences:{},remove(){this.removed=true;},exportAsync:async()=>new Uint8Array([1])};registry.set(id,result);return result;};
 const modeCollections=[{id:'static-collection',key:'9'.repeat(40),name:'Synthetic Static',defaultModeId:'default',modes:[{modeId:'default',name:'Default'}]},
  {id:'indirect-collection',key:'7'.repeat(40),name:'Synthetic Alias',defaultModeId:'light',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}]},
  {id:'shared-collection',key:'8'.repeat(40),name:'Synthetic Shared',defaultModeId:'light',modes:[{modeId:'light',name:'Light'},{modeId:'dark',name:'Dark'}]}];
 const set={id:'button-set' ,key:'button-family',type:'COMPONENT_SET',componentPropertyDefinitions:{Size:{type:'VARIANT'}}};
 const large=node('200:1','Size=56','COMPONENT',[node('200:2','Content','FRAME')]);
 const small=node('300:1','Size=40','COMPONENT',[node('300:2','Content','FRAME')]);
 for(const [main,key,size]of[[large,'button-56','56'],[small,'button-40','40']]){
  main.key=key;main.parent=set;main.variantProperties={Size:size};main.children[0].parent=main;
 }
 const sourceName=options.escaped?'@button / repeated':'Button',sourceIds=options.escaped?['100:2/%','100:3/%','100:4/%','100:5/%']:['100:2','100:3','100:4','100:5'];
 const host=node('100:1','Host','COMPONENT',sourceIds.map(id=>node(id,sourceName,'INSTANCE')));
 host.key='host';host.componentPropertyDefinitions={};for(const child of host.children)child.parent=host;
 if(options.remote){host.remote=true;host.children.forEach((child,i)=>child.id='900:'+i);}
 function scene(id,actual=false,selected=options.selectedIndex ?? 1,stage='base'){
  const root=node(id,'Host','INSTANCE');root.setExplicitVariableModeForCollection=()=>{};root.getMainComponentAsync=async()=>host;root.componentProperties={};root.setProperties=()=>{};
  const children=sourceIds.map((sourceId,index)=>{
   const targetKey=options.modePair&&index===1?'button-56':options.modeCatalogDrift==='add'?'button-56':'button-40';
   let key=options.modeCatalogDrift ? (index===selected?(options.modeCatalogDrift==='add'?'button-40':'button-56'):'button-40') : 'button-56';
   if(actual&&(index===selected||options.modePair&&index===1)&&!options.reset)key=targetKey;
   if(stage==='switched'&&index===selected)key='button-40';
   const child=node('I'+id+';'+sourceId,actual&&options.rename&&index===selected?'Renamed button':sourceName,'INSTANCE');
   child.getMainComponentAsync=async()=>{if(actual)fail('read-main-component');return key==='button-40'?small:large;};
   if(actual&&options.dependencies)Object.defineProperty(child,'resolvedVariableModes',{get(){fail('read-variable-modes');return {};}});
   child.componentProperties={Size:{type:'VARIANT',value:key==='button-40'?'40':'56'}};
   child.children=[node(child.id+';'+(key==='button-40'?'300:2':'200:2'),'Content','FRAME')];child.children[0].parent=child;
   if(options.modeCatalogDrift){
    Object.defineProperty(child,'resolvedVariableModes',{get(){return Object.assign({},key==='button-56'?{'static-collection':'default'}:{},index===(selected===0?2:0)?Object.assign({'shared-collection':'light'},options.aliasMode?{'indirect-collection':'light'}:{}):{});}});
    const bind=()=>{child.boundVariables=Object.assign({},key==='button-56'?{opacity:{type:'VARIABLE_ALIAS',id:'static-token'}}:{},index===(selected===0?2:0)?{width:{type:'VARIABLE_ALIAS',id:'shared-token'}}:{});};
    child.updateModeBindings=bind;bind();
   }
   if(actual&&index===selected)child.children[0].opacity=.4;
   child.setProperties=props=>{
    assert(!actual,'the actual instance must never be changed');assert(options.modePair?[0,1].includes(index):index===selected,'source occurrence, never an equal-name sibling guess');
    assert.deepEqual(JSON.parse(JSON.stringify(props)),{Size:targetKey==='button-40'?'40':'56'});switches.push(index);key=targetKey;child.componentProperties.Size.value=targetKey==='button-40'?'40':'56';
    if(child.updateModeBindings)child.updateModeBindings();
    child.children=[node(child.id+(targetKey==='button-40'?';300:2':';200:2'),'Content','FRAME')];child.children[0].parent=child;
   };
   child.parent=root;return child;
  });
  if(options.modeCatalogDrift)Object.defineProperty(root,'resolvedVariableModes',{get(){return Object.assign({'shared-collection':'light'},options.aliasMode?{'indirect-collection':'light'}:{},children.some(n=>n.componentProperties.Size.value==='56')?{'static-collection':'default'}:{});}});
  root.children=actual&&options.reorder?[children[3],children[1],children[0],children[2]]:children;
  if(!actual&&id.startsWith('clone')&&options.badClone){
   const child=children[selected];
   if(options.badClone==='missing')child.id='unproved';
   if(options.badClone==='foreign')root.getMainComponentAsync=async()=>({id:'foreign-host',key:'foreign-host',type:'COMPONENT',children:[]});
   if(options.badClone==='duplicate')children[0].id=child.id;
   if(options.badClone==='stale')child.getMainComponentAsync=async()=>({id:large.id,key:'foreign-key',parent:set});
   if(options.badClone==='cycle')child.children=[root];
   if(options.badClone==='topology-drift')root.getMainComponentAsync=async()=>{root.children.reverse();return host;};
   if(options.badClone==='unreadable-edge'){
    const original=root.children;let reads=0;Object.defineProperty(root,'children',{get(){if(++reads>1)throw Error('edge unavailable during capture');return original;}});
   }
  }
  root.clone=()=>{const result=scene('clone-'+(++sequence),false,selected,stage);created.push(result);return result;};
  return root;
 }
 const actual=scene('10:1',true);page.selection=[actual];
 host.createInstance=()=>{const result=scene('pristine-'+(++sequence));created.push(result);return result;};
 if(options.dependencies)large.createInstance=()=>{
  fail('create-reference-instance');
  const root=node('button-reference-'+(++sequence),'Button','INSTANCE');
  root.getMainComponentAsync=async()=>large;root.componentProperties={Size:{type:'VARIANT',value:'56'}};
  root.children=[node(root.id+';200:2','Content','FRAME')];root.children[0].parent=root;created.push(root);
  Object.defineProperty(root,'opacity',{get(){fail('capture-reference');return 1;}});
  return root;
 };
 const figma={currentPage:page,fileKey:'synthetic',root:{name:'Synthetic'},mixed:Symbol(),base64Encode:b=>Buffer.from(b).toString('base64'),
  getNodeByIdAsync:async id=>{dependencyIndex=actual.children.findIndex(child=>child.id===id);fail('resolve-instance');return registry.get(id);},
  getStyleByIdAsync:async()=>null,variables:{getVariableCollectionByIdAsync:async id=>options.modeCatalogDrift?modeCollections.find(c=>c.id===id):null,getVariableByIdAsync:async id=>options.modeCatalogDrift?{id,key:'6'.repeat(40),resolvedType:'FLOAT',variableCollectionId:id==='static-token'?'static-collection':id==='alias-token'?'indirect-collection':'shared-collection',valuesByMode:id==='static-token'?{default:1}:{light:id==='shared-token'&&options.aliasMode?{type:'VARIABLE_ALIAS',id:'alias-token'}:1,dark:2}}:null},
  createPage(){const p={id:'temporary',type:'PAGE',appendChild(n){if(n.id.startsWith('button-reference'))fail('append-reference-instance');n.parent=this;},remove(){this.removed=true;}};pages.push(p);return p;}};
 const request={componentKey:'host',acceptedComponentKeys:[],allowedComponentProperties:[],platform:'desktop',manualSourceHash:'synthetic-manual'};
 if(options.dependencies){request.componentDependencyKeys=['button-family'];request.directChildDependenciesVersion=1;}
 const result=await invoke(figma,actual,request);
 assert(created.every(n=>n.removed),'all temporary reference instances removed');assert(pages.every(p=>p.removed));assert.equal(actual.removed,undefined);
 const selected=actual.children.find(n=>n.id==='I10:1;'+sourceIds[options.selectedIndex ?? 1]);
 assert.equal(selected.children[0].opacity,.4,'actual override preserved');
 return {result,switches};
}
module.exports={runNativeOccurrenceCapture};
