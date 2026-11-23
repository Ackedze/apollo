'use strict';
// Generated wrapper: helper bodies match Proxy figma-recipes.js exactly (tested).
function forApi(figma){
function boundedMcpResult(value){const bytes=encodeURIComponent(JSON.stringify(value)).replace(/%[0-9A-F]{2}/g,'x').length;if(bytes>12000)throw Error('MCP_RESULT_SCOPE_TOO_LARGE: return fewer mapped fields or split the read');return value;}
async function createMcpInstance(component,expectedKey,parent,createdIds,mutatedIds,beforeMutation){
 figma.skipInvisibleInstanceChildren=false;if(figma.skipInvisibleInstanceChildren!==false)throw Error('MCP_SOURCE_TRAVERSAL_UNKNOWN');
 if(component.type!=='COMPONENT'||component.key!==expectedKey)throw Error('MCP_SOURCE_KEY_MISMATCH');
 if(!Array.isArray(createdIds)||!Array.isArray(mutatedIds)||typeof parent?.appendChild!=='function')throw Error('MCP_INSTANCE_TRACKING_UNKNOWN');
 const fonts=new Map(),modes=JSON.parse(JSON.stringify(component.explicitVariableModes||{})),collections=[];
 if(Object.keys(modes).length>64)throw Error('MCP_SOURCE_SCOPE_TOO_LARGE');
 for(const [id,mode]of Object.entries(modes)){const collection=await figma.variables.getVariableCollectionByIdAsync(id);if(!collection||!collection.modes.some(m=>m.modeId===mode))throw Error('MCP_SOURCE_MODE_UNKNOWN');collections.push([collection,mode]);}
 for(const n of component.findAllWithCriteria({types:['TEXT']})){
  for(const segment of n.getStyledTextSegments(['fontName'])){
   const font=segment.fontName;fonts.set(JSON.stringify(font),font);
   const bindings=n.boundVariables?.fontFamily||[];
   for(const alias of Array.isArray(bindings)?bindings:[bindings]){const variable=await figma.variables.getVariableByIdAsync(alias.id);if(!variable)throw Error('MCP_SOURCE_FONT_VARIABLE_UNKNOWN');for(const family of Object.values(variable.valuesByMode)){if(typeof family!=='string')throw Error('MCP_SOURCE_FONT_VARIABLE_UNKNOWN');const value={family,style:font.style};fonts.set(JSON.stringify(value),value);}}
  }
 }
 if(fonts.size>32)throw Error('MCP_SOURCE_SCOPE_TOO_LARGE');for(const font of fonts.values())await figma.loadFontAsync(font);
 if(beforeMutation)beforeMutation();
 const instance=component.createInstance();createdIds.push(instance.id);mutatedIds.push(parent.id,instance.id);parent.appendChild(instance);
 // Preserve component-owned transitions; ambient library modes must inherit from the new scene.
 for(const [collection,mode]of collections)instance.setExplicitVariableModeForCollection(collection,mode);
 for(const [collection,mode]of collections)if(instance.resolvedVariableModes[collection.id]!==mode)throw Error('MCP_SOURCE_MODE_MISMATCH');
 return instance;
}
async function readMcpSourceFacts(component,expectedKey){
 figma.skipInvisibleInstanceChildren=false;if(figma.skipInvisibleInstanceChildren!==false)throw Error('MCP_SOURCE_TRAVERSAL_UNKNOWN');
 if(component.type!=='COMPONENT'||component.key!==expectedKey)throw Error('MCP_SOURCE_KEY_MISMATCH');
 const owner=component.parent?.type==='COMPONENT_SET'?component.parent:component;
 if(component.children.length>64)throw Error('MCP_READ_SCOPE_TOO_LARGE');
 const children=[];for(const node of component.children){const row={id:node.id,type:node.type,name:node.name};if('componentPropertyReferences'in node)row.refs=node.componentPropertyReferences;
  if(node.type==='INSTANCE'){row.mainKey=(await node.getMainComponentAsync())?.key||null;row.properties=Object.entries(node.componentProperties).map(([name,p])=>({name,type:p.type,value:p.value}));}
  if(node.type==='SLOT'){if(node.children.length>64)throw Error('MCP_READ_SCOPE_TOO_LARGE');row.children=node.children.map(child=>({id:child.id,type:child.type,name:child.name}));}children.push(row);
 }
 return boundedMcpResult({scope:'direct-children-and-slot-payload-ids',subtreeComplete:false,id:component.id,key:component.key,type:component.type,width:component.width,height:component.height,variants:component.variantProperties,definitions:Object.entries(owner.componentPropertyDefinitions).map(([name,p])=>({name,type:p.type,defaultValue:p.defaultValue,variantOptions:p.variantOptions})),children});
}
async function compareMcpDefaults(source,instance){
 figma.skipInvisibleInstanceChildren=false;if(figma.skipInvisibleInstanceChildren!==false)throw Error('MCP_SOURCE_TRAVERSAL_UNKNOWN');
 const differences=[],contextualGeometry=[],contextualValues=[],queue=[{a:source,b:instance,path:'default',root:true,flow:false}],collections=new Map();let nodesCompared=0,anchor;
 const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const observations=new Map(),mainComponents=new Map(),segmentFields=['fontName','fontSize','textStyleId','fills','letterSpacing','lineHeight','textCase','textDecoration'];
 const stamp=value=>JSON.stringify(canonical(value),(_key,v)=>typeof v==='symbol'?{symbol:String(v)}:v);
 function observe(key,path,nodeId,read,initial){if(!observations.has(key))observations.set(key,{path,nodeId,read,initial:stamp(initial===undefined?read():initial),node:key.startsWith('node:')});}
 function observeNode(n,fields,path,children=false){
  const prefix='node:'+n.id+':';
  observe(prefix+'identity',path+'.identity',n.id,()=>[n.id,n.type,n.parent?.id||null]);
  for(const field of fields)observe(prefix+field,path+'.'+field,n.id,()=>[field in n,field in n?n[field]:null]);
  if(children)observe(prefix+'children',path+'.children',n.id,()=>['children'in n,'children'in n?n.children.map(child=>child.id):[]]);
  if(children&&n.type==='TEXT'){
   observe(prefix+'segments',path+'.styledTextSegments',n.id,()=>n.getStyledTextSegments(segmentFields));
   observe(prefix+'fontRange',path+'.fontFamilyRange',n.id,()=>typeof n.getRangeBoundVariable==='function'&&n.characters.length?n.getRangeBoundVariable(0,n.characters.length,'fontFamily'):null);
  }
 }
 async function mainOf(n){
  const main=await n.getMainComponentAsync();
  if(!mainComponents.has(n))mainComponents.set(n,{id:main?.id,key:main?.key});
  return main;
 }
 async function contextAnchor(refresh=false){
  if(anchor!==undefined&&!refresh)return anchor;
  let a=source,b=instance;const lineage=[];anchor=null;
  for(let depth=0;a&&b&&depth<64;depth++){
   if(['PAGE','DOCUMENT'].includes(a.type)||['PAGE','DOCUMENT'].includes(b.type))return null;
   const fields=['name','boundVariables','explicitVariableModes','componentPropertyReferences','variantProperties','key'];
   if(a.type==='INSTANCE'&&b.type==='INSTANCE')fields.push('componentProperties');
   observeNode(a,fields,'context.source',true);observeNode(b,fields,'context.instance',true);
   lineage.push({sourceNodeId:a.id,nodeId:b.id});
   if(!equal(a.explicitVariableModes||{},b.explicitVariableModes||{})||!equal(a.boundVariables||{},b.boundVariables||{}))return null;
   if(a.type==='COMPONENT'&&b.type==='INSTANCE'){
    if(a.key&&(await mainOf(b))?.key===a.key&&equal(a.variantProperties,b.variantProperties))anchor={sourceNodeId:a.id,nodeId:b.id,key:a.key,lineage};
    return anchor;
   }
   if(a.type!==b.type||a.name!==b.name||!a.parent||!b.parent||!('children'in a.parent)||!('children'in b.parent))return null;
   if(('componentPropertyReferences'in a)!==('componentPropertyReferences'in b)||'componentPropertyReferences'in a&&!equal(a.componentPropertyReferences,b.componentPropertyReferences))return null;
   if(a.type==='INSTANCE'&&((await mainOf(a))?.key!==(await mainOf(b))?.key||!equal(a.componentProperties,b.componentProperties)))return null;
   const index=a.parent.children.findIndex(n=>n.id===a.id);if(index<0||b.parent.children.findIndex(n=>n.id===b.id)!==index)return null;
   a=a.parent;b=b.parent;
  }
  return null;
 }
 function inheritedMode(node,collection){
  let depth=0;for(let n=node;n&&n.type!=='DOCUMENT';n=n.parent){if(++depth>64)return null;observeNode(n,['explicitVariableModes'],'mode');const modes='explicitVariableModes'in n?n.explicitVariableModes:{};if(Object.prototype.hasOwnProperty.call(modes,collection.id))return{mode:modes[collection.id],ownerNodeId:n.id};}
  return{mode:collection.defaultModeId,ownerNodeId:null};
 }
 async function collectionFor(id){
  if(!collections.has(id))collections.set(id,typeof figma.variables?.getVariableCollectionByIdAsync==='function'?await figma.variables.getVariableCollectionByIdAsync(id):null);
  const collection=collections.get(id);if(collection)observe('collection:'+id,'proof.collection',id,()=>[collection.id,collection.defaultModeId,collection.modes]);return collection?.id===id?collection:null;
 }
 async function modeProof(a,b){
  const left=canonical(a.resolvedVariableModes),right=canonical(b.resolvedVariableModes);
  if(!left||!right||!equal(Object.keys(left).sort(),Object.keys(right).sort())||!await contextAnchor())return null;
  const proofs=[];for(const id of Object.keys(left)){
   if(left[id]===right[id])continue;
   const collection=await collectionFor(id);if(!collection||!collection.modes.some(m=>m.modeId===left[id])||!collection.modes.some(m=>m.modeId===right[id]))return null;
   const sourceMode=inheritedMode(a,collection),instanceMode=inheritedMode(b,collection);
   if(sourceMode?.mode!==left[id]||instanceMode?.mode!==right[id])return null;
   proofs.push({collectionId:id,source:sourceMode,instance:instanceMode});
  }
  if(!equal(left,a.resolvedVariableModes)||!equal(right,b.resolvedVariableModes))return null;
  return proofs;
 }
 async function fontProof(a,b){
  const left=canonical(a.fontName),right=canonical(b.fontName);
  if(!left||!right||typeof left.family!=='string'||typeof right.family!=='string'||!equal(left,Object.assign({},right,{family:left.family}))||!await contextAnchor())return null;
  if(!a.characters.length||!b.characters.length||typeof a.getRangeBoundVariable!=='function'||typeof b.getRangeBoundVariable!=='function')return null;
  const range=n=>n.getRangeBoundVariable(0,n.characters.length,'fontFamily'),alias=range(a),actual=range(b);
  if(!alias||alias.type!=='VARIABLE_ALIAS'||!equal(alias,actual))return null;
  for(const n of [a,b]){const binding=n.boundVariables?.fontFamily;if(!equal(Array.isArray(binding)?binding:[binding],[alias]))return null;}
  const variable=typeof figma.variables?.getVariableByIdAsync==='function'?await figma.variables.getVariableByIdAsync(alias.id):null;
  if(variable)observe('variable:'+alias.id,'proof.variable',alias.id,()=>[variable.id,variable.variableCollectionId,variable.resolvedType,variable.valuesByMode]);
  if(!variable||variable.id!==alias.id||variable.resolvedType!=='STRING'||typeof variable.resolveForConsumer!=='function')return null;
  if(typeof variable.variableCollectionId!=='string')return null;
  const collection=await collectionFor(variable.variableCollectionId);if(!collection)return null;
  for(const n of [a,b]){const mode=inheritedMode(n,collection)?.mode;if(!collection.modes.some(m=>m.modeId===mode)||n.resolvedVariableModes?.[collection.id]!==mode)return null;}
  const expectedSource=variable.resolveForConsumer(a),expectedInstance=variable.resolveForConsumer(b);
  observe('resolution:'+alias.id+':'+a.id,'proof.sourceFont',a.id,()=>variable.resolveForConsumer(a),expectedSource);
  observe('resolution:'+alias.id+':'+b.id,'proof.instanceFont',b.id,()=>variable.resolveForConsumer(b),expectedInstance);
  if(expectedSource.resolvedType!=='STRING'||expectedInstance.resolvedType!=='STRING'||expectedSource.value!==left.family||expectedInstance.value!==right.family)return null;
  if(!equal(alias,range(a))||!equal(alias,range(b))||!equal(left,a.fontName)||!equal(right,b.fontName))return null;
  return{variableId:alias.id,sourceFamily:expectedSource.value,instanceFamily:expectedInstance.value};
 }
 while(queue.length){const {a,b,path,root,flow}=queue.shift();if(++nodesCompared>512)throw Error('MCP_SOURCE_SCOPE_TOO_LARGE');
  const diff=field=>{if(differences.length>=64)throw Error('MCP_SOURCE_DIFFERENCE_LIMIT');const row={path:path+'.'+field,sourceNodeId:a.id,nodeId:b.id};if(['resolvedVariableModes','explicitVariableModes','fontName'].includes(field)){row.sourceValue=canonical(a[field]);row.value=canonical(b[field]);}differences.push(row);};
  const contextual=(field,proof)=>{if(contextualValues.length>=64)throw Error('MCP_SOURCE_SCOPE_TOO_LARGE');contextualValues.push({path:path+'.'+field,sourceNodeId:a.id,nodeId:b.id,sourceValue:canonical(a[field]),value:canonical(b[field]),proof});};
  const birth=root&&a.type==='COMPONENT'&&b.type==='INSTANCE',reflow=flow||a.layoutSizingHorizontal==='FILL'||a.layoutSizingVertical==='FILL';
  // A variant's definition name is its variant expression; its instance inherits the set name.
  // Placement and FILL-derived bounds are layout results, not definition identity or editable style.
  const fields=['visible','opacity','blendMode','fills','strokes','fillStyleId','strokeStyleId','strokeWeight','strokeAlign','dashPattern','effects','effectStyleId','cornerRadius','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','rotation','layoutMode','paddingTop','paddingRight','paddingBottom','paddingLeft','itemSpacing','primaryAxisAlignItems','counterAxisAlignItems','primaryAxisSizingMode','counterAxisSizingMode','layoutSizingHorizontal','layoutSizingVertical','layoutAlign','layoutGrow','layoutPositioning','constraints','clipsContent','boundVariables','explicitVariableModes','resolvedVariableModes'];
  if(!birth)fields.push('name');if(!root)fields.push('componentPropertyReferences');
  if(reflow)contextualGeometry.push({path,sourceNodeId:a.id,nodeId:b.id});else{fields.push('width','height');if(!root)fields.push('x','y','relativeTransform');}
  if(a.type==='TEXT'&&b.type==='TEXT')fields.push('characters','fontName','fontSize','lineHeight','letterSpacing','textStyleId','textAutoResize','textAlignHorizontal','textAlignVertical','textCase','textDecoration');
  const observed=fields.concat(birth?['key','variantProperties']:a.type==='INSTANCE'&&b.type==='INSTANCE'?['componentProperties']:[]);
  observeNode(a,observed,path+'.source',true);observeNode(b,observed,path+'.instance',true);
  if(a.type!==b.type&&!birth)diff('type');
  if(birth){if((await mainOf(b))?.key!==a.key)diff('mainKey');if(!equal(a.variantProperties,b.variantProperties))diff('variantProperties');}
  let font=null,modeContext=false,fontAttempted=false;
  for(const f of fields)if((f in a)!==(f in b)||f in a&&!equal(a[f],b[f])){
   if(f==='resolvedVariableModes'&&f in a&&f in b){const proof=await modeProof(a,b);if(proof){modeContext=true;contextual(f,proof);continue;}}
   if(f==='fontName'&&a.type==='TEXT'&&b.type==='TEXT'){fontAttempted=true;font=await fontProof(a,b);if(font){contextual(f,font);continue;}}
   diff(f);
  }
  if(a.type==='TEXT'&&b.type==='TEXT'){
   const binding=b.boundVariables?.fontFamily;
   if(modeContext&&!fontAttempted&&(Array.isArray(binding)?binding.length>0:!!binding)){
    font=await fontProof(a,b);
    if(font)contextual('fontName',font);else{diff('fontName');differences[differences.length-1].reason='BOUND_FONT_RESOLUTION_UNCONFIRMED';}
   }
   const left=a.getStyledTextSegments(segmentFields),right=b.getStyledTextSegments(segmentFields);
   // Only a uniform, still-bound family is contextual; all other range values remain exact.
   const normalized=font?right.map(s=>equal(s.fontName,b.fontName)?Object.assign({},s,{fontName:Object.assign({},s.fontName,{family:a.fontName.family})}):s):right;
   if(!equal(left,normalized))diff('styledTextSegments');
  }
  if(a.type==='INSTANCE'&&b.type==='INSTANCE'){if((await mainOf(a))?.key!==(await mainOf(b))?.key)diff('mainKey');if(!equal(a.componentProperties,b.componentProperties))diff('componentProperties');}
  const aa='children'in a?a.children:[],bb='children'in b?b.children:[];if(aa.length!==bb.length){diff('children.length');continue;}
  for(let i=0;i<aa.length;i++)queue.push({a:aa[i],b:bb[i],path:path+'.children['+i+']',root:false,flow:reflow});
 }
 if(contextualValues.length){
  const previous=anchor,current=await contextAnchor(true);
  if(!current||!equal(previous,current)){
   if(differences.length>=64)throw Error('MCP_SOURCE_DIFFERENCE_LIMIT');
   differences.push({path:'default.contextAnchor',sourceNodeId:source.id,nodeId:instance.id,sourceValue:previous,value:current});
  }
 }
 const currentMains=await Promise.all(Array.from(mainComponents,async([node,expected])=>{const main=await node.getMainComponentAsync();return{nodeId:node.id,expected,value:{id:main?.id,key:main?.key}};}));
 for(const current of currentMains)if(!equal(current.expected,current.value)){
  if(differences.length>=64)throw Error('MCP_SOURCE_DIFFERENCE_LIMIT');
  differences.push({path:'default.freshness.mainKey',nodeId:current.nodeId,sourceValue:current.expected,value:current.value});
 }
 // No awaits after this barrier: re-read every consumed fact, topology edge and proof input.
 if(figma.skipInvisibleInstanceChildren!==false)throw Error('MCP_SOURCE_TRAVERSAL_UNKNOWN');
 for(const [node,expected]of mainComponents){
  let value,reason;
  try{const main=node.mainComponent;if(main&&typeof main.key==='string'&&main.key)value={id:main.id,key:main.key};else reason='CURRENT_MAIN_IDENTITY_UNAVAILABLE';}catch{reason='CURRENT_MAIN_IDENTITY_UNAVAILABLE';}
  if(reason||!equal(expected,value)){
   if(differences.length>=64)throw Error('MCP_SOURCE_DIFFERENCE_LIMIT');
   differences.push({path:'default.freshness.mainKey',nodeId:node.id,sourceValue:expected,value,reason:reason||'CURRENT_MAIN_IDENTITY_CHANGED'});
  }
 }
 freshness:for(const node of [false,true])for(const record of observations.values())if(record.node===node){
  let reason=null;try{if(stamp(record.read())!==record.initial)reason='OBSERVED_FACT_CHANGED';}catch{reason='OBSERVED_FACT_UNAVAILABLE';}
  if(reason){if(differences.length>=64)throw Error('MCP_SOURCE_DIFFERENCE_LIMIT');differences.push({path:'default.freshness',nodeId:record.nodeId,field:record.path,reason});break freshness;}
 }
 return{equal:differences.length===0,sourceNodeId:source.id,nodeId:instance.id,nodesCompared,differences,contextualGeometry,contextualValues,contextAnchor:anchor||null};
}
function finishMcpWrite(context,root,changes){
 const expected=context?.target;
 if(context?.schemaVersion!=='apollo.mcp-write-result.v1'||typeof context.operationId!=='string'||!context.operationId||typeof context.sourcePin!=='string'||!expected||!root||root.id!==expected.rootNodeId)throw Error('MCP_WRITE_RESULT_INVALID');
 let page=root;for(let depth=0;page&&page.type!=='PAGE'&&depth<64;depth++)page=page.parent;
 const ownership={rootId:root.id,parentId:root.parent?.id,pageId:page?.id,owner:root.getSharedPluginData('apollolanding','owner'),active:root.getSharedPluginData('apollolanding','active')};
 if(ownership.parentId!==(expected.parentNodeId||expected.pageId)||ownership.pageId!==expected.pageId||ownership.owner!==expected.ownerNonce||ownership.active!==expected.leaseNonce)throw Error('MCP_WRITE_SCOPE_CHANGED');
 const ids=value=>{if(!Array.isArray(value)||value.length>256||value.some(id=>typeof id!=='string'||!id||id.length>512))throw Error('MCP_WRITE_RESULT_INVALID');return value.slice();};
 const section=changes?.section;
 if(section){let parent=section,inside=false;for(let depth=0;parent&&depth<64;depth++,parent=parent.parent)if(parent===root){inside=true;break;}if(!inside||section.getSharedPluginData('apollolanding','section')!==context.sectionId)throw Error('MCP_WRITE_SCOPE_CHANGED');}
 const result={schemaVersion:context.schemaVersion,operationId:context.operationId,sourcePin:context.sourcePin,stage:context.stage,sectionId:context.sectionId,ownership,createdNodeIds:ids(changes?.createdNodeIds),mutatedNodeIds:ids(changes?.mutatedNodeIds),section:section?{id:section.id,parentId:section.parent?.id,type:section.type,sectionId:context.sectionId}:null};
 if(JSON.stringify(result).length>3072)throw Error('MCP_WRITE_RESULT_TOO_LARGE');
 return boundedMcpResult(result);
}
return {boundedMcpResult,createMcpInstance,readMcpSourceFacts,compareMcpDefaults,finishMcpWrite};
}
module.exports={forApi};
