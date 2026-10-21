// Capture adapter only: never chooses a policy or changes the Figma document.
import {stableHash} from './stable';
const layoutKeys=['layoutMode','layoutWrap','layoutSizingHorizontal','layoutSizingVertical','primaryAxisSizingMode','counterAxisSizingMode',
  'primaryAxisAlignItems','counterAxisAlignItems','counterAxisAlignContent','paddingTop','paddingRight','paddingBottom','paddingLeft',
  'itemSpacing','counterAxisSpacing','layoutGrow','layoutAlign','layoutPositioning','minWidth','maxWidth','minHeight','maxHeight','constraints','resolvedVariableModes','boundVariables','rotation','visible'];
function fields(node:any,keys:string[]):Record<string,unknown>{
 const out:Record<string,unknown>={};for(const k of keys)if(k in node){const v=node[k];if(v!==undefined)out[k]=v;}
 return JSON.parse(JSON.stringify(out));
}
export function captureTransitionContext(subject:any):{context:Record<string,unknown>;fingerprint:string;complete:boolean;reason?:string}{
 try{
  const ancestors:unknown[]=[];let branch=subject,parent=subject.parent;
  while(parent&&parent.type!=='PAGE'){
   if(ancestors.length>=32)throw Error('ancestor-limit');
   const siblings=(parent.children||[]).filter((n:any)=>n!==branch);
   if(siblings.length>200)throw Error('sibling-limit');
   const layout=fields(parent,layoutKeys);
   if(parent.relativeTransform)layout.linearTransform=parent.relativeTransform.map((row:number[])=>row.slice(0,2));
   if(parent.type!=='GROUP'){
    if(parent.layoutSizingHorizontal!=='HUG'){
     if(!Number.isFinite(parent.width))throw Error('parent-width-unknown');
     layout.width=parent.width;
    }
    if(parent.layoutSizingVertical!=='HUG'){
     if(!Number.isFinite(parent.height))throw Error('parent-height-unknown');
     layout.height=parent.height;
    }
   }
   if(parent.layoutMode==='GRID')throw Error('unsupported-grid-context');
   ancestors.push({id:parent.id,type:parent.type,layout,
    childIds:(parent.children||[]).map((n:any)=>n.id),
    siblings:siblings.map((n:any)=>({id:n.id,...fields(n,['width','height','visible',...layoutKeys])}))});
   branch=parent;parent=parent.parent;
  }
  if(!parent||parent.type!=='PAGE')throw Error('page-unknown');
  const context={profile:'same-instance-context@1',pageId:parent.id,ancestors,
    rootConstraints:fields(subject,['minWidth','maxWidth','minHeight','maxHeight','constraints','layoutGrow','layoutAlign','layoutPositioning','rotation'])};
  const nodes:unknown[]=[];
  const visit=(n:any)=>{if(nodes.length>=500)throw Error('node-limit');nodes.push({id:n.id,...fields(n,['visible','width','height','componentProperties','resolvedVariableModes',...layoutKeys])});for(const c of n.children||[])visit(c);};
  visit(subject);
  return{context,fingerprint:stableHash({context,nodes}),complete:true};
 }catch{return{context:{profile:'same-instance-context@1'},fingerprint:'',complete:false,reason:'capture-context-incomplete'};}
}
