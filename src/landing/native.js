'use strict';
const {createOpaqueId}=require('../design-check/opaque-id');
const {cooperativeRead}=require('../document-audit/reads');
const NS='apollolanding',UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const fail=(code,nodeId=null)=>{throw Object.assign(Error(code),{code,nodeId});};
function createLandingCanvasBridge({api,hash,post,buildId=null,isUnavailable=()=>false}){
 const runs=new Map();let serial=Promise.resolve();
 const fileKey=()=>{try{return api.fileKey||null;}catch{return null;}};
 const outside=(page,root)=>Array.from(page.children).filter(n=>n!==root).map(n=>({id:n.id,type:n.type,x:n.x,y:n.y,width:n.width,height:n.height,visible:n.visible}));
 function owned(r,active=true,verifyOutside=false){
  if(r.root.removed||r.root.type!=='FRAME'||r.root.parent?.id!==r.page.id||r.root.getSharedPluginData(NS,'chat')!==r.chatId||r.root.getSharedPluginData(NS,'owner')!==r.ownerNonce)fail('LANDING_CANVAS_STALE',r.root.id);
  if(active&&(!r.active||api.currentPage.id!==r.page.id||r.root.getSharedPluginData(NS,'active')!==r.leaseNonce||isUnavailable()))fail('LANDING_CANVAS_UNAVAILABLE',r.root.id);
  if(active&&verifyOutside&&hash(outside(r.page,r.root))!==r.outsideHash)fail('LANDING_OUTSIDE_CHANGED',r.root.id);
 }
 function field(n,key){try{const value=n[key];return typeof value==='symbol'?'FIGMA_MIXED':value===undefined?null:JSON.parse(JSON.stringify(value));}catch(error){throw Object.assign(Error('LANDING_READ_FAILED'),{code:'LANDING_READ_FAILED',nodeId:n.id,property:key,nativeMessage:String(error?.message||error).slice(0,1000)});}}
 async function capture(r){
  const guard=()=>owned(r);owned(r,true,true);api.skipInvisibleInstanceChildren=false;
  const sections=[],text=[],queue=[{node:r.root,section:null}],seen=new Set();let count=0,instanceCount=0,textLength=0;
  while(queue.length){
   guard();const item=queue.pop(),n=item.node;if(seen.has(n.id))fail('LANDING_TREE_INVALID',n.id);seen.add(n.id);count++;
   let section=item.section;const sectionId=n.getSharedPluginData(NS,'section');
   if(sectionId){
    if(n===r.root||!/^[a-zA-Z0-9_-]{1,120}$/.test(sectionId)||sections.some(s=>s.sectionId===sectionId))fail('LANDING_SECTION_INVALID',n.id);
    section={id:n.id,sectionId,type:n.type,name:n.name,width:n.width,height:n.height,componentKey:null,fields:[]};sections.push(section);
    if(n.type==='INSTANCE'){const component=await cooperativeRead(()=>n.getMainComponentAsync(),1000,guard);guard();section.componentKey=component?.key||null;}
   }
   if(n.type==='INSTANCE')instanceCount++;
   if(n.type==='TEXT'){text.push(n.characters);textLength+=n.characters.length+1;if(textLength>64000)fail('LANDING_READBACK_TOO_LARGE',n.id);}
   if(section){
    const row={id:n.id,type:n.type,name:n.name,children:'children'in n?Array.from(n.children,c=>c.id):[]};
    for(const key of ['visible','opacity','fills','strokes','effects','boundVariables','explicitVariableModes','layoutMode','itemSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','componentProperties','textStyleId','fontName','fontSize','characters'])if(key in n)row[key]=field(n,key);
    if(n.id!==section.id)for(const key of ['x','y','width','height'])row[key]=field(n,key);
    section.fields.push(row);
   }
   if('children'in n)for(let i=n.children.length-1;i>=0;i--)queue.push({node:n.children[i],section});
   if(count%128===0){await new Promise(resolve=>setTimeout(resolve,0));guard();}
  }
  owned(r,true,true);const rows=sections.map(s=>({id:s.id,sectionId:s.sectionId,type:s.type,name:s.name,width:s.width,height:s.height,componentKey:s.componentKey,fingerprint:hash(s.fields)}));
  const value={rootNodeId:r.root.id,pageId:r.page.id,ownerNonce:r.ownerNonce,leaseNonce:r.leaseNonce,outsideHash:r.outsideHash,nodeCount:count,instanceCount,sections:rows,text:text.join('\n'),coverage:'tagged-sections-and-text'};
  if(encodeURIComponent(JSON.stringify(value)).replace(/%[0-9A-F]{2}/g,'x').length>262144)fail('LANDING_READBACK_TOO_LARGE',r.root.id);return value;
 }
 async function open(p){
  if(!exact(p,['chatId','revision','pageId','fileKey','rootNodeId','ownerNonce'])||!UUID.test(p.chatId||'')||!Number.isSafeInteger(p.revision)||p.revision<1||p.pageId!==api.currentPage.id||typeof p.fileKey!=='string'||!/^[a-zA-Z0-9_-]{6,128}$/.test(p.fileKey)||fileKey()&&fileKey()!==p.fileKey||isUnavailable())fail('LANDING_CANVAS_INVALID');
  const old=runs.get(p.chatId);
  if(old?.active&&old.revision===p.revision){owned(old);return {target:{fileKey:p.fileKey,pageId:old.page.id,rootNodeId:old.root.id,ownerNonce:old.ownerNonce,leaseNonce:old.leaseNonce},readback:await capture(old)};}
  const page=api.currentPage,guard=()=>{if(api.currentPage!==page||isUnavailable())fail('LANDING_CANVAS_UNAVAILABLE');};let root;
  if(p.rootNodeId){root=await cooperativeRead(()=>api.getNodeByIdAsync(p.rootNodeId),1000,guard);guard();if(!root||root.parent!==page||root.getSharedPluginData(NS,'owner')!==p.ownerNonce||root.getSharedPluginData(NS,'chat')!==p.chatId)fail('LANDING_CANVAS_STALE');}
  else{
   const matches=Array.from(page.children).filter(n=>n.getSharedPluginData(NS,'chat')===p.chatId);if(matches.length>1)fail('LANDING_ROOT_AMBIGUOUS');root=matches[0];
   if(!root){
    const surface=outside(page,null);root=api.createFrame();root.name='Лендинг · Apollo';root.x=Math.max(0,...surface.map(n=>n.x+n.width))+80;root.y=0;root.resize(1440,1);root.layoutMode='VERTICAL';root.primaryAxisSizingMode='AUTO';root.counterAxisSizingMode='FIXED';root.fills=[];root.clipsContent=false;page.appendChild(root);root.setSharedPluginData(NS,'chat',p.chatId);root.setSharedPluginData(NS,'owner',hash([p.chatId,createOpaqueId()]));
   }
  }
  guard();if(root.type!=='FRAME'||!/^[a-f0-9]{64}$/.test(root.getSharedPluginData(NS,'owner')))fail('LANDING_CANVAS_STALE');
  const r={chatId:p.chatId,revision:p.revision,page,root,ownerNonce:root.getSharedPluginData(NS,'owner'),leaseNonce:hash([p.chatId,p.revision,createOpaqueId()]),active:true,outsideHash:hash(outside(page,root))};
  root.setSharedPluginData(NS,'active',r.leaseNonce);runs.set(p.chatId,r);
  return {target:{fileKey:p.fileKey,pageId:page.id,rootNodeId:root.id,ownerNonce:r.ownerNonce,leaseNonce:r.leaseNonce},readback:await capture(r)};
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
    let value;if(m.operation==='context'&&exact(m.payload,[]))value={pageId:api.currentPage.id,fileKey:fileKey(),buildId};
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
