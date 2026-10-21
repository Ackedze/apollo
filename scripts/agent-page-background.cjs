'use strict';
/** Browser-only bounded observation, anchored to the workspace's own #root. */
function observeTaskPageBackground(groups){
 const viewport={width:innerWidth,height:innerHeight},root=document.getElementById('root');
 if(!root)return{viewport,surfaces:[],issue:'TASK_ROOT_MISSING'};
 const host=root.children.length===1?root.children[0]:root;
 const nodes=groups.map(g=>document.querySelector('[data-test-id="'+g.id+'"]')||document.querySelector('[data-plan-node="'+g.id+'"]'));
 if(nodes.some(n=>!n||!root.contains(n)||!host.contains(n)))return{viewport,surfaces:[],issue:'TASK_SURFACE_NOT_CONFIRMED'};
 const surfaces=[];let node=host;
 while(node&&surfaces.length<4){
  const style=getComputedStyle(node),rect=node.getBoundingClientRect().toJSON();
  surfaces.push({role:node===host?'task-host':node===root?'task-root':node===document.body?'body':'html',tag:node.tagName,rect,backgroundColor:style.backgroundColor,backgroundImage:style.backgroundImage,opacity:style.opacity,visibility:style.visibility,display:style.display,transform:style.transform,filter:style.filter,backdropFilter:style.backdropFilter,mixBlendMode:style.mixBlendMode,clipPath:style.clipPath,borderRadius:style.borderRadius,overflowX:style.overflowX,overflowY:style.overflowY,pseudoEffects:['::before','::after'].some(p=>{const s=getComputedStyle(node,p);return !['none','normal'].includes(s.content)&&s.display!=='none';})});
  if(node===document.documentElement)break;node=node.parentElement;
 }
 return{viewport,surfaces,issue:null};
}
/** This checks a white page condition, never general visual or contract parity. */
function checkTaskPageBackground(observation,version){
 const unknown=message=>({status:'unknown',message}),failed=message=>({status:'failed',message});
 if(version.page.background.toUpperCase()!=='#FFFFFF')return unknown('Page background condition is outside the supported white-page check');
 if(!observation||observation.issue)return unknown('Task page surface unavailable: '+(observation?.issue||'NO_OBSERVATION'));
 if(observation.viewport.width!==version.spec.viewport.width||observation.viewport.height!==version.spec.viewport.height)return failed('Observed viewport differs from frozen ScreenVersion');
 const surfaces=observation.surfaces;if(!Array.isArray(surfaces)||!surfaces.length||surfaces.length>4||surfaces[0].role!=='task-host'||surfaces.at(-1).role!=='html')return unknown('Task host ancestry is incomplete');
 const covers=s=>s.rect&&s.rect.left<=0&&s.rect.top<=0&&s.rect.right>=observation.viewport.width&&s.rect.bottom>=observation.viewport.height;
 for(const s of surfaces){
  if(s.backgroundImage!=='none'||s.opacity!=='1'||s.visibility!=='visible'||s.display==='none'||s.transform!=='none'||s.filter!=='none'||!['none',undefined].includes(s.backdropFilter)||s.mixBlendMode!=='normal'||s.clipPath!=='none'||s.borderRadius!=='0px'||s.pseudoEffects)return unknown('Complex painted task surface requires additional observation');
  if((s.overflowX!=='visible'||s.overflowY!=='visible')&&!covers(s))return unknown('An ancestor clips the task surface');
 }
 for(const s of surfaces){
  if(s.backgroundColor==='rgba(0, 0, 0, 0)')continue;
  if(!/^rgb\(\d+, \d+, \d+\)$/.test(s.backgroundColor))return unknown('Translucent task surface requires additional observation');
  if(s.backgroundColor!=='rgb(255, 255, 255)')return failed('Observed '+s.role+' background '+s.backgroundColor+'; expected white');
  if(!covers(s))return failed('White '+s.role+' does not cover the frozen viewport');
  return{status:'passed',message:'White '+s.role+' covers the frozen viewport; task-owned ancestry observed'};
 }
 return unknown('No explicit opaque task page background observed');
}
module.exports={observeTaskPageBackground,checkTaskPageBackground};
