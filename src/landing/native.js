'use strict';
const {createOpaqueId}=require('../design-check/opaque-id');
const {cooperativeRead}=require('../document-audit/reads');
const NS='apollolanding',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const fail=(code,nodeId=null)=>{throw Object.assign(Error(code),{code,nodeId});};
function createLandingCanvasBridge({api,hash,post,buildId=null,isUnavailable=()=>false}){
 const runs=new Map();let serial=Promise.resolve();
 const fileKey=()=>{try{return api.fileKey||null;}catch{return null;}};
 const geometry=n=>({id:n.id,type:n.type,x:n.x,y:n.y,width:n.width,height:n.height,visible:n.visible});
 const pageOf=n=>{const seen=new Set();while(n&&!seen.has(n.id)){if(n.type==='PAGE')return n;seen.add(n.id);n=n.parent;}return null;};
 const sectionNodes=page=>{const rows=[],queue=Array.from(page.children);while(queue.length){const n=queue.shift();rows.push(n);if(n.type==='SECTION')queue.push(...Array.from(n.children));}return rows;};
 const outside=(page,root,parent=page)=>{const ancestors=new Set();for(let n=parent;n&&n!==page;n=n.parent)ancestors.add(n);const row=n=>{if(n===root)return null;let value=geometry(n);if(ancestors.has(n)){if(n===parent){value={id:n.id,type:n.type,x:n.x,y:n.y,visible:n.visible};}value.children=Array.from(n.children).map(row).filter(Boolean);}return value;};return Array.from(page.children).map(row).filter(Boolean);};
 const placementValid=p=>p&&exact(p,['mode','sectionId'])&&['new-section','section'].includes(p.mode)&&(p.mode==='section'?typeof p.sectionId==='string'&&/^[\w:;-]{1,512}$/.test(p.sectionId):p.sectionId===null);
 const target=r=>{const value={fileKey:r.fileKey,pageId:r.page.id,rootNodeId:r.root.id,ownerNonce:r.ownerNonce,leaseNonce:r.leaseNonce};if(r.parent!==r.page)value.parentNodeId=r.parent.id;return value;};
 function owned(r,active=true,verifyOutside=false){
  if(r.root.removed||r.root.type!=='FRAME'||r.root.parent!==r.parent||r.parent!==r.page&&(r.parent.removed||r.parent.type!=='SECTION'||pageOf(r.parent)!==r.page||active&&(r.parent.width!==r.parentWidth||r.parent.height!==r.parentHeight))||r.root.getSharedPluginData(NS,'chat')!==r.chatId||r.root.getSharedPluginData(NS,'owner')!==r.ownerNonce)fail('LANDING_CANVAS_STALE',r.root.id);
  if(active&&(!r.active||api.currentPage.id!==r.page.id||r.root.getSharedPluginData(NS,'active')!==r.leaseNonce||isUnavailable()))fail('LANDING_CANVAS_UNAVAILABLE',r.root.id);
  if(active&&verifyOutside&&hash(outside(r.page,r.root,r.parent))!==r.outsideHash)fail('LANDING_OUTSIDE_CHANGED',r.root.id);
 }
 function field(n,key){try{const value=n[key];return typeof value==='symbol'?'FIGMA_MIXED':value===undefined?null:JSON.parse(JSON.stringify(value));}catch(error){throw Object.assign(Error('LANDING_READ_FAILED'),{code:'LANDING_READ_FAILED',nodeId:n.id,property:key,nativeMessage:String(error?.message||error).slice(0,1000)});}}
 async function capture(r){
  const guard=()=>owned(r);owned(r,true,true);api.skipInvisibleInstanceChildren=false;
  const sections=[],text=[],nativeNodes=[],queue=[{node:r.root,section:null}],seen=new Set();let count=0,instanceCount=0,textLength=0;
  while(queue.length){
   guard();const item=queue.pop(),n=item.node;if(seen.has(n.id))fail('LANDING_TREE_INVALID',n.id);seen.add(n.id);count++;
   let section=item.section,component=null;const sectionId=n.getSharedPluginData(NS,'section');
   if(sectionId){
    if(n===r.root||!/^[a-zA-Z0-9_-]{1,120}$/.test(sectionId)||sections.some(s=>s.sectionId===sectionId))fail('LANDING_SECTION_INVALID',n.id);
    section={id:n.id,sectionId,type:n.type,name:n.name,width:n.width,height:n.height,componentKey:null,fields:[]};sections.push(section);
    if(n.type==='INSTANCE'){component=await cooperativeRead(()=>n.getMainComponentAsync(),1000,guard);guard();section.componentKey=component?.key||null;}
   }
   if(n.type==='INSTANCE'){
    instanceCount++;
    if(r.evidenceVersion===1&&!component){component=await cooperativeRead(()=>n.getMainComponentAsync(),1000,guard);guard();}
   }
   if(r.evidenceVersion===1){
    const row={id:n.id,parentId:n.parent?.id||null,type:n.type,name:n.name,role:n.getSharedPluginData(NS,'role'),sectionId:section?.sectionId||null};
    for(const key of ['x','y','width','height','visible','clipsContent','layoutMode','boundVariables','explicitVariableModes','resolvedVariableModes'])if(key in n)row[key]=field(n,key);
    if(n.type==='INSTANCE'){row.componentKey=component?.key||null;row.componentSetKey=component?.parent?.type==='COMPONENT_SET'?component.parent.key:null;row.componentProperties=field(n,'componentProperties');}
    if(n.type==='TEXT'){row.characters=n.characters;row.fontName=field(n,'fontName');row.hasMissingFont=field(n,'hasMissingFont');}
    const fills='fills'in n?field(n,'fills'):null;row.imageHashes=Array.isArray(fills)?fills.filter(fill=>fill.type==='IMAGE').map(fill=>({imageHash:fill.imageHash||null,visible:fill.visible!==false})):[];
    nativeNodes.push(row);
   }
   if(n.type==='TEXT'){text.push(n.characters);textLength+=n.characters.length+1;if(textLength>64000)fail('LANDING_READBACK_TOO_LARGE',n.id);}
   if(section){
    const row={id:n.id,type:n.type,name:n.name,children:'children'in n?Array.from(n.children,c=>c.id):[]};
    for(const key of ['visible','opacity','fills','strokes','effects','boundVariables','explicitVariableModes','layoutMode','itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','componentProperties','textStyleId','fontName','fontSize','characters'])if(key in n)row[key]=field(n,key);
    if(n.id!==section.id)for(const key of ['x','y','width','height'])row[key]=field(n,key);
    if(component)row.componentKey=component.key||null;section.fields.push(row);
   }
   if('children'in n)for(let i=n.children.length-1;i>=0;i--)queue.push({node:n.children[i],section});
   if(count%128===0){await new Promise(resolve=>setTimeout(resolve,0));guard();}
  }
  owned(r,true,true);
  if(r.parent!==r.page){const width=Math.max(r.parent.width,r.root.x+r.root.width+40),height=Math.max(r.parent.height,r.root.y+r.root.height+40);if(width!==r.parent.width||height!==r.parent.height)r.parent.resizeWithoutConstraints(width,height);r.parentWidth=r.parent.width;r.parentHeight=r.parent.height;}
  const rows=sections.map(s=>({id:s.id,sectionId:s.sectionId,type:s.type,name:s.name,width:s.width,height:s.height,componentKey:s.componentKey,fingerprint:hash(s.fields)}));
  const value={rootNodeId:r.root.id,pageId:r.page.id,ownerNonce:r.ownerNonce,leaseNonce:r.leaseNonce,outsideHash:r.outsideHash,nodeCount:count,instanceCount,sections:rows,text:text.join('\n'),coverage:'tagged-sections-and-text'};
  if(r.evidenceVersion===1)value.native={schemaVersion:'apollo.landing-native.v1',nodes:nativeNodes};
  if(encodeURIComponent(JSON.stringify(value)).replace(/%[0-9A-F]{2}/g,'x').length>262144)fail('LANDING_READBACK_TOO_LARGE',r.root.id);return value;
 }
 async function open(p){
  const fields=['chatId','revision','pageId','fileKey','rootNodeId','ownerNonce'];if(Object.hasOwn(p||{},'evidenceVersion')){if(p.evidenceVersion!==1)fail('LANDING_CANVAS_INVALID');fields.push('evidenceVersion');}
  if(!(exact(p,fields)||exact(p,fields.concat('placement'))&&placementValid(p.placement))||!UUID.test(p.chatId||'')||!Number.isSafeInteger(p.revision)||p.revision<1||p.pageId!==api.currentPage.id||typeof p.fileKey!=='string'||!/^[a-zA-Z0-9_-]{6,128}$/.test(p.fileKey)||fileKey()&&fileKey()!==p.fileKey||isUnavailable())fail('LANDING_CANVAS_INVALID');
  const old=runs.get(p.chatId);
  if(old?.active&&old.revision===p.revision){if(old.evidenceVersion!==p.evidenceVersion)fail('LANDING_CANVAS_STALE');owned(old);return {target:target(old),readback:await capture(old)};}
  const page=api.currentPage,guard=()=>{if(api.currentPage!==page||isUnavailable())fail('LANDING_CANVAS_UNAVAILABLE');};let root,parent=page;
  if(p.rootNodeId){root=await cooperativeRead(()=>api.getNodeByIdAsync(p.rootNodeId),1000,guard);guard();if(!root||root.getSharedPluginData(NS,'owner')!==p.ownerNonce||root.getSharedPluginData(NS,'chat')!==p.chatId)fail('LANDING_CANVAS_STALE');parent=root.parent;}
  else{
   const candidates=sectionNodes(page);
   const matches=candidates.filter(n=>n.getSharedPluginData(NS,'chat')===p.chatId);if(matches.length>1)fail('LANDING_ROOT_AMBIGUOUS');root=matches[0];
   if(root)parent=root.parent;
   else{
    if(p.placement?.mode==='section'){
     parent=await cooperativeRead(()=>api.getNodeByIdAsync(p.placement.sectionId),1000,guard);guard();if(!parent||parent.type!=='SECTION'||pageOf(parent)!==page||parent.removed)fail('LANDING_SECTION_UNAVAILABLE');
    }else if(p.placement?.mode==='new-section'){
     if(typeof api.createSection!=='function')fail('LANDING_SECTION_UNAVAILABLE');const surface=outside(page,null);parent=api.createSection();parent.name='Лендинг · Apollo';parent.x=Math.max(0,...surface.map(n=>n.x+n.width))+80;parent.y=0;parent.resizeWithoutConstraints(1520,80);page.appendChild(parent);
    }
    const surface=Array.from(parent.children).map(geometry);root=api.createFrame();root.name='Лендинг · Apollo';root.x=parent===page?Math.max(0,...surface.map(n=>n.x+n.width))+80:Math.max(40,...surface.map(n=>n.x+n.width+40));root.y=parent===page?0:40;root.resize(1440,1);root.layoutMode='VERTICAL';root.primaryAxisSizingMode='AUTO';root.counterAxisSizingMode='FIXED';root.fills=[];root.clipsContent=false;parent.appendChild(root);root.setSharedPluginData(NS,'chat',p.chatId);root.setSharedPluginData(NS,'owner',hash([p.chatId,createOpaqueId()]));
   }
  }
  guard();if(root.type!=='FRAME'||parent!==page&&(parent?.type!=='SECTION'||pageOf(parent)!==page)||p.placement?.mode==='section'&&parent.id!==p.placement.sectionId||!/^[a-f0-9]{64}$/.test(root.getSharedPluginData(NS,'owner')))fail('LANDING_CANVAS_STALE');
  const r={evidenceVersion:p.evidenceVersion,chatId:p.chatId,revision:p.revision,fileKey:p.fileKey,page,parent,root,parentWidth:parent.width,parentHeight:parent.height,ownerNonce:root.getSharedPluginData(NS,'owner'),leaseNonce:hash([p.chatId,p.revision,createOpaqueId()]),active:true,outsideHash:hash(outside(page,root,parent))};
  root.setSharedPluginData(NS,'active',r.leaseNonce);runs.set(p.chatId,r);
  return {target:target(r),readback:await capture(r)};
 }
 function context(){
  const page=api.currentPage,sections=sectionNodes(page).filter(n=>n.type==='SECTION'&&!n.removed).map(n=>({id:n.id,name:n.name})),selected=new Set();
  for(let n of page.selection||[]){while(n&&n!==page&&n.type!=='SECTION')n=n.parent;if(n?.type==='SECTION'&&pageOf(n)===page)selected.add(n.id);else selected.add(null);}
  return{pageId:page.id,fileKey:fileKey(),buildId,sections,selectedSectionId:selected.size===1?Array.from(selected)[0]:null};
 }
 function release(chatId){const r=runs.get(chatId);if(r){r.active=false;owned(r,false);r.root.setSharedPluginData(NS,'active','');}return {preserved:true,rootNodeId:r?.root.id||null};}
 function accept(m){
  if(m?.type!=='landing-canvas')return false;
  const reply=v=>post(Object.assign({type:'landing-canvas-result',requestId:m.requestId,operation:m.operation},v));
  if(!exact(m,['type','requestId','operation','payload'])||typeof m.requestId!=='string'||!/^[a-zA-Z0-9._:-]{1,120}$/.test(m.requestId)){return true;}
  // Stop revokes the lease immediately, including while a cooperative read waits.
  if(m.operation==='release'&&exact(m.payload,['chatId'])&&UUID.test(m.payload.chatId||'')){try{reply({value:release(m.payload.chatId),error:null});}catch(e){reply({value:null,error:{code:e.code||'LANDING_CANVAS_UNAVAILABLE',nodeId:e.nodeId||null,property:e.property||null,nativeMessage:e.nativeMessage||String(e.message||e).slice(0,1000)}});}return true;}
  serial=serial.catch(()=>{}).then(async()=>{
   try{
    let value;if(m.operation==='context'&&exact(m.payload,[]))value=context();
    else if(m.operation==='open')value=await open(m.payload);
    else if(m.operation==='observe'&&exact(m.payload,['chatId','revision','rootNodeId','ownerNonce','leaseNonce'])){const p=m.payload,r=runs.get(p.chatId);if(!r||['revision','ownerNonce','leaseNonce'].some(k=>r[k]!==p[k])||r.root.id!==p.rootNodeId)fail('LANDING_CANVAS_STALE');value=await capture(r);}
    else fail('LANDING_CANVAS_INVALID');reply({value,error:null});
   }catch(e){reply({value:null,error:{code:e.code||'LANDING_CANVAS_UNAVAILABLE',nodeId:e.nodeId||null,property:e.property||null,nativeMessage:e.nativeMessage||String(e.message||e).slice(0,1000)}});}
  });return true;
 }
 function close(){for(const r of runs.values())if(r.active)try{release(r.chatId);}catch{r.active=false;}}
 return {accept,close,pageChanged:close,busy:()=>Array.from(runs.values()).some(r=>r.active)};
}
module.exports={createLandingCanvasBridge,NS};
