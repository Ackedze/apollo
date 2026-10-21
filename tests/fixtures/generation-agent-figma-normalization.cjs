const {providerFixture}=require("./generation-agent-figma-provider.cjs");
const observed=require("./native69-group-source.json");
function normalizationFixture(protocol,hash,options={}){
 const x=providerFixture(protocol,hash),originalAppend=x.Node.prototype.appendChild,originalRemove=x.Node.prototype.remove,originalMain=x.Node.prototype.getMainComponentAsync;let revision=0,transfers=0,mainCalls=0,lookups=0;const replacements=[],invalid=new Set();let pendingRoot=null,pendingChildren=null;
 for(const [id,d]of x.defs)if(id.startsWith('bg.')){
  if(id.endsWith('.true')){const buttons=new Map(d.children.map(n=>[n.id,n]));d.children=[];const graph=new Map([['@',d]]);for(const row of observed.sourceCoordinateTree.slice(1)){const n=new x.Node(row.type,row.id),button=buttons.get(row.id);n.visible=row.visible;n.componentPropertyReferences=structuredClone(row.refs);if(button){n.definition=button.definition;n.componentProperties=structuredClone(button.componentProperties);}else if(row.type==='INSTANCE'){const definition=new x.Node('COMPONENT','synthetic-main:'+row.id);definition.key='synthetic-main:'+row.id;n.definition=definition;}if(row.type==='TEXT'){n.characters=row.refs.characters?.startsWith('✎ Label')?'Label':'';n.fontName={family:'Alfa Interface Sans',style:'Regular'};n.fontSize=16;n.fontWeight=400;n.textStyleId='style:label';}const parent=graph.get(row.parent);n.parent=parent;parent.children.push(n);graph.set(row.id,n);}}
  else for(let i=0;i<4;i++)for(let j=0;j<(i===3?11:12);j++)originalAppend.call(d.children[i],new x.Node(j%2?'RECTANGLE':'FRAME','source-'+id+'-'+i+'-'+j));
 }
 x.Node.prototype.setPluginData=function(k,v){this.data||={};this.data[k]=v;if(options.pluginDataEvents)x.event({nodeChanges:[{type:'PROPERTY_CHANGE',id:this.id,origin:'LOCAL',properties:['pluginData']}]});};x.Node.prototype.getPluginData=function(k){return this.data?.[k]||'';};
 x.api.getNodeByIdAsync=async id=>{lookups++;if(pendingRoot&&id===pendingRoot.id){pendingRoot.children=pendingChildren;pendingRoot=null;pendingChildren=null;}await options.lookupHook?.({x,id,normalizations:transfers});return x.nodes.get(id)||null;};
 x.Node.prototype.getMainComponentAsync=async function(){mainCalls++;await options.mainHook?.({x,node:this,normalizations:transfers});return originalMain.call(this);};
 function normalize(parent){let slot=null;for(let n=parent;n&&n.type!=='PAGE';n=n.parent)if(n.type==='SLOT')slot=n;if(!slot||!x.walk(slot).some(n=>n.type==='INSTANCE'))return;
  let owner=slot;while(owner.parent&&owner.parent.type!=='PAGE'&&owner.parent.type!=='FRAME')owner=owner.parent;
  // Find the enclosing instance while leaving the trusted screen FRAME stable.
  if(slot.parent?.type==='INSTANCE')owner=slot.parent;const outer=owner.parent;if(!outer)return;const map=new Map(),scope=slot.id;revision++;transfers++;
  function clone(old,id,instanceRoot=null,oldInstanceRoot=null,inside=false){const n=new x.Node(old.type,id);map.set(old,n);for(const [k,v]of Object.entries(old))if(!['id','children','parent','removed'].includes(k))n[k]=v&&typeof v==='object'&&!v.type?structuredClone(v):v;n.children=[];n.removed=false;
   if(old.type==='INSTANCE'&&inside&&!oldInstanceRoot){instanceRoot=n.id;oldInstanceRoot=old.id;}
   for(const child of old.children){const childInside=inside||old===slot;let nextId=child.id;
    if(childInside){const prefix=oldInstanceRoot&&(oldInstanceRoot.startsWith('I')?oldInstanceRoot:'I'+oldInstanceRoot)+';';nextId=prefix&&child.id.startsWith(prefix)?(instanceRoot.startsWith('I')?instanceRoot:'I'+instanceRoot)+';'+child.id.slice(prefix.length):scope+';normalized-'+revision+'-'+(++serial);}
    const c=clone(child,nextId,instanceRoot,oldInstanceRoot,childInside);c.parent=n;n.children.push(c);
   }return n;
  }
  let serial=0;const fresh=clone(owner,owner.id);fresh.parent=outer;outer.children=outer.children.map(n=>n===owner?fresh:n);if(options.unreadableSync){pendingRoot=outer;pendingChildren=outer.children;outer.children=outer.children.map(n=>n===fresh?owner:n);}
  for(const [old,next]of map){if(old.id!==next.id){x.nodes.delete(old.id);invalid.add(old.id);}x.nodes.set(next.id,next);replacements.push({before:old.id,after:next.id});}
  // Cached owned proxies retain scalar snapshots, but traversing the old BG
  // yields unreadable immediate child proxies (the actual probe51 shape).
  for(const [old]of map)if(old.type==='INSTANCE'&&old.children.length===4&&old.children.every(c=>c.type==='INSTANCE'))old.children=old.children.map(c=>new Proxy(c,{get(t,k){if(k==='name'||k==='type')throw Error('STALE_NATIVE_PROXY');return Reflect.get(t,k);}}));
  options.afterNormalize?.({x,fresh,map,slot:map.get(slot),revision});
 }
 x.Node.prototype.appendChild=function(n){originalAppend.call(this,n);normalize(this);};
 x.Node.prototype.remove=function(){const parent=this.parent;originalRemove.call(this);if(parent)normalize(parent);};
 return{...x,normalizations:()=>transfers,identityReplacements:replacements,oldLookupMissing:id=>invalid.has(id)&&!x.nodes.has(id),apiMetrics:()=>({mainCalls,lookups})};
}
module.exports={normalizationFixture};
