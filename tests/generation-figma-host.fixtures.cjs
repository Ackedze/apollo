// Synthetic Plugin API/recipe boundary, not accepted production native bindings.
const assert=require('node:assert/strict'),esbuild=require('esbuild'),path=require('node:path'),vm=require('node:vm');
const {fixture,hash,clone}=require("../packages/generation-core/tests/planning-fixtures.cjs");
const {componentContract}=require("./dependency-fixtures");
const planning=require("../packages/generation-core/dist/planning.cjs");
const native=esbuild.buildSync({entryPoints:[path.join(__dirname,"../src/generation/figma/host.ts")],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text;
const adapter=esbuild.buildSync({entryPoints:[path.join(__dirname,"../packages/adapter-figma/src/index.ts")],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text;
function exportsOf(code){const m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports,setTimeout,clearTimeout});return m.exports;}
const {createGenerationFigmaHost}=exportsOf(native),{executeFigma}=exportsOf(adapter);
const journal=esbuild.buildSync({entryPoints:[path.join(__dirname,"../src/generation/figma/rollback.ts")],bundle:true,platform:'browser',format:'cjs',write:false}).outputFiles[0].text;
const {createNativeRollbackJournal}=exportsOf(journal);
function setup(options={}) {
 const f=fixture(),contracts={},all=new Map(),calls=[],created=[];let seq=0,reads=0;
 const page={id:'page',type:'PAGE',children:[],removed:false,
  appendChild(n){this.insertChild(this.children.length,n);},
  insertChild(index,n){if(this.removed||n.removed)throw Error('SYNTHETIC_REMOVED_PARENT_OR_CHILD');if(n.parent?.children)n.parent.children=n.parent.children.filter(c=>c!==n);this.children.splice(Math.min(index,this.children.length),0,n);n.parent=this;}};
 function node(type,id) {
  const data={id:id||'new-'+(++seq),type,children:[],visible:true,width:100,height:40,removed:false,componentProperties:{},componentPropertyDefinitions:{},
   absoluteTransform:[[1,0,0],[0,1,0]],relativeTransform:[[1,0,0],[0,1,0]],getPluginData(k){return this.data?.[k]||'';},setPluginData(k,v){this.data=this.data||{};this.data[k]=v;},
   appendChild(n){page.appendChild.call(this,n);},insertChild(i,n){page.insertChild.call(this,i,n);},resize(w,h){this.width=w;this.height=h;},
   remove(){calls.push('remove:'+this.id);for(const child of this.children.slice())child.remove();this.removed=true;if(this.parent?.children)this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;},
   setProperties(props){if(options.failConfigure)throw new Error('SYNTHETIC_CONFIG_FAILURE');for(const[k,value]of Object.entries(props))this.componentProperties[k]={type:typeof value==='boolean'?'BOOLEAN':'VARIANT',value};},
   async setTextStyleIdAsync(id){this.textStyleId=id;}};
  let transform=[[1,0,0],[0,1,0]];
  const multiply=(a,b)=>[[a[0][0]*b[0][0]+a[0][1]*b[1][0],a[0][0]*b[0][1]+a[0][1]*b[1][1],a[0][0]*b[0][2]+a[0][1]*b[1][2]+a[0][2]],[a[1][0]*b[0][0]+a[1][1]*b[1][0],a[1][0]*b[0][1]+a[1][1]*b[1][1],a[1][0]*b[0][2]+a[1][1]*b[1][2]+a[1][2]]];
  const copy=m=>m.map(row=>row.slice());
  Object.defineProperty(data,'relativeTransform',{enumerable:true,configurable:true,get(){return copy(transform);},set(m){transform=copy(m);}});
  Object.defineProperty(data,'absoluteTransform',{enumerable:true,configurable:true,get(){return this.parent&&this.parent.type!=='PAGE'?multiply(this.parent.absoluteTransform,transform):copy(transform);},set(m){if(this.parent&&this.parent.type!=='PAGE')throw Error('SYNTHETIC_ABSOLUTE_SET_REQUIRES_PAGE');transform=copy(m);}});
  all.set(data.id,data);return data;
 }
 const defs={};
 for(const m of f.context.registry.entries) {
  const contract=componentContract(m.pin.componentId,m.figma.componentKey);contract.package.id=m.pin.contractId;
  contract.package.manualSourceHash=m.pin.manualSourceHash;contract.facts.representations[0].id=m.figma.representationId;
  contracts[m.id]=contract;m.pin.compiledHash=hash(contract);
  const c=f.context.view.components.find(c=>c.pin.componentId===m.pin.componentId);c.pin=clone(m.pin);c.coverage.predicateRuleIds=contract.rules.map(r=>r.ruleId);
  const locked=f.context.view.lock.packages.find(c=>c.componentId===m.pin.componentId);Object.assign(locked,m.pin);
  const def=node('COMPONENT','definition-'+m.id);def.key=m.figma.componentKey;
  def.createInstance=()=>{const n=node('INSTANCE');n.getMainComponentAsync=async()=>def;n.sourceMapping=m.id;page.appendChild(n);created.push(n);
   if(m.actions)for(let i=0;i<2;i++){const action=node('INSTANCE');action.getMainComponentAsync=async()=>({key:'synthetic-owned-'+i,parent:{type:'COMPONENT_SET',key:'synthetic-owned-set'}});action.sourceSymbol='synthetic-symbol-'+i;n.appendChild(action);}return n;};
  if(options.fontFailure){const t=node('TEXT','font-'+m.id);t.characters='synthetic';t.fontName={family:'Synthetic',style:'Regular'};def.appendChild(t);}
  defs[m.figma.componentKey]=def;
 }
 const group=f.context.view.components[1],ownedPin={componentId:'synthetic-owned',contractId:'synthetic-owned',revision:1,manualSourceHash:hash('owned-manual'),compiledHash:hash('owned-compiled')};
 group.dependencies=[ownedPin.componentId];f.context.view.lock.packages[1].dependencies=[ownedPin];
 f.context.view.components.push({pin:ownedPin,sourceStatus:'ready',sourceErrors:0,api:[],representations:[],targets:[],dependencies:[],coverage:{predicateRuleIds:[],pendingRoutes:[],nonExecutableRuleIds:[]}});
 f.context.view.lock.packages.push(Object.assign({archive:'owned.zip',archiveSha256:hash('owned'),sourceHash:hash('source'),factsHash:hash('facts'),projectionEvidence:[],dependencies:[]},ownedPin));
 f.context.view.lockHash=hash(f.context.view.lock);
 const bindings={};
 for(const m of f.context.registry.entries){bindings[m.id]={id:m.figma.handlerId,mappingId:m.id,representationId:m.figma.representationId,componentKey:m.figma.componentKey,pin:clone(m.pin),recipeHash:hash('recipe-'+m.id),acceptanceEvidenceHash:hash('review-'+m.id),
  slots:Object.values(m.slots).map(s=>({targetId:s.figma.targetId,property:s.figma.property,sourceNodeId:'synthetic-source-slot',operationId:'synthetic-slot-port',evidenceHash:hash('slot'),
   assertDefinition:async()=>{},fill:async(n,children)=>{for(const child of children)n.appendChild(child);},assertFilled:async(n,children)=>{assert.equal(JSON.stringify(n.children.map(c=>c.id)),JSON.stringify(children.map(c=>c.id)));}})),
  scenario:{id:'synthetic-scenario',evidenceHash:hash('scenario'),assertPlan:async()=>{},bind:async()=>{}},
  actions:m.actions?{id:m.actions.figmaHandlerId,evidenceHash:hash('actions'),occurrences:[0,1].map(i=>({sourceNodeId:'synthetic-source-'+i,symbolId:'synthetic-symbol-'+i,dependencyComponentId:ownedPin.componentId,componentSetKey:'synthetic-owned-set'})),
   assertDefinition:async()=>{},assertOccurrences:async(n,result,actions)=>{assert.equal(JSON.stringify(result.map(r=>r.actionId)),JSON.stringify(actions.map(a=>a.id)));for(let i=0;i<result.length;i++)assert.equal(all.get(result[i].nodeId).sourceSymbol,'synthetic-symbol-'+i);},
   fill:async(n,actions,state,scope)=>actions.map((a,i)=>{scope.bindAction(a.id,n.children[i].id);return{actionId:a.id,nodeId:n.children[i].id};})}:undefined};}
 const api={currentPage:page,async importComponentByKeyAsync(key){calls.push('import:'+key);return defs[key];},async loadFontAsync(){calls.push('font');if(options.fontFailure)throw new Error('MISSING_FONT');},async getStyleByIdAsync(id){return{type:'TEXT',fontName:{family:'Synthetic',style:'Regular'}};},
  createFrame(){const n=node('FRAME');page.appendChild(n);created.push(n);calls.push('frame');return n;},createText(){const n=node('TEXT');page.appendChild(n);created.push(n);calls.push('text');return n;}};
 const readContext=async()=>{reads++;if(options.onRead)options.onRead({reads,created,f,defs,bindings});return f.context;};
 const capture={loadScope:async m=>contracts[m.id],capture:async(n,m,c)=>{calls.push('capture:'+n.id);const before=hash(n.componentProperties);return{facts:{id:n.id,props:clone(n.componentProperties)},checks:c.rules.map(r=>({id:r.ruleId,componentId:c.package.componentId,status:options.captureFailure?'failed':'passed',evidenceHash:hash({node:n.id,rule:r.ruleId})})),diagnostics:[],assertCurrent:async()=>{if(before!==hash(n.componentProperties))throw new Error('FIGMA_CAPTURE_STALE');}};}};
 const host=createGenerationFigmaHost({api,hash,readContext,readBinding:async m=>options.missingBindings?null:bindings[m.id],capture,primitives:options.primitives||null});
 const plan=planning.createCompositionPlan(f.spec,f.context,hash);
 assert.equal(planning.preflightPlan(plan,f.context,hash).targets.figma,'prepared');
 return{f,plan,host,api,page,calls,created,defs,bindings,all,node,reads:()=>reads};
}

module.exports={setup,executeFigma,hash,clone,planning,createNativeRollbackJournal};
