const test=require('node:test'),assert=require('node:assert/strict'),core=require(process.env.APOLLO_CONTRACT_CORE||'../dist/core.cjs');
const {fixture:base,clone}=require('./helpers/declared-target.cjs');
const family='a'.repeat(40),key='b'.repeat(40);
function fixture(){
 const f=base(core),{manual:m,snapshot:s}=f;delete m.metadata.declaredTargetIdentityVersion;
 for(const t of m.targets)delete t.identityBindingsV1;
 m.targets[1]={id:'items',semanticRole:'items',label:'Items',lineage:['Card'],pathHint:'Card / Items',resolution:'resolved'};
 for(const t of m.targets)t.variantHints=[{representationId:'desktop',componentKey:'synthetic-variant',pathHint:t.pathHint}];
 const root=s.nodes[0],slot=s.nodes[1];s.nodes.pop();root.childIds=['slot'];
 Object.assign(root.component,{properties:{Size:'40'},propertyTypes:{Size:'VARIANT','Items#1:0':'SLOT'}});
 Object.assign(slot,{id:'slot',name:'Items',type:'SLOT',childIds:[],semantic:{role:'items',path:'Card / Items'}});
 slot.component.propertyReferenceBindings={slotContentId:'Items#1:0'};
 slot.component.propertyReferences=['Items#1:0'];
 s.source.propertyReferenceIdentityVersion=1;s.source.captureTopology={version:1,complete:true,limitReached:false,issues:[]};
 s.variantReference=core.captureVariantReference(clone(s),'synthetic-variant','synthetic-set');
 const shape=s.variantReference.nodes,structureId=core.stableHash(shape);
 Object.assign(f.evidence,{structures:{[structureId]:shape},variants:[{componentKey:'synthetic-variant',componentSetKey:'synthetic-set',structureId,properties:{Size:'40'}}]});
 const template=m.rules[0];m.rules=[Object.assign({},template,{id:'synthetic.open-slot',targetId:'items',capability:'composition.content',permission:'allowed',constraints:[],controlPaths:[{kind:'slot-api',property:'Items#1:0',target:'items',contentOwnership:'external'}],execution:{route:'policy-only'}}),Object.assign({},template,{id:'synthetic.size-match',targetId:'root',capability:'composition.members',permission:'constrained',constraints:[{type:'memberCollection',collection:{version:1,ownerTargetRole:'root',memberTargetRoles:['items'],slotContent:{componentSetKeys:[family]},representationIds:['desktop'],visibleOnly:false,assertion:{kind:'propertyMapping',property:'Size',propertyType:'VARIANT',hostProperty:'Size',hostPropertyType:'VARIANT'}}}]})];
 function add(id,size='40',parent='slot',set=family){const node={id,parentId:parent,name:'Untrusted display name',type:'INSTANCE',visible:true,childIds:[],unknownFacts:[],component:{identity:{componentKey:key,componentSetKey:set,mainComponentId:'member-main'},properties:{Size:size},propertyTypes:{Size:'VARIANT'}}};s.nodes.push(node);s.nodes.find(n=>n.id===parent).childIds.push(id);return node;}
 return Object.assign(f,{add});
}
function run(f){const c=f.compile();assert.equal(c.issues.filter(i=>i.level==='error').length,0,JSON.stringify(c.issues));const e=core.evaluateCompiledContract(f.snapshot,core.prepareAuthoringPreviewContract(c.contract)).evaluations;return e.find(e=>e.ruleId.startsWith('synthetic.size-match'));}
test('open SLOT compares zero/one/many dynamic members without closing membership',()=>{const f=fixture();assert.equal(run(f).classification,'compliant',JSON.stringify(run(f)));f.add('one');assert.equal(run(f).classification,'compliant');f.add('two','32');assert.equal(run(f).classification,'violation');f.snapshot.nodes.find(n=>n.id==='two').component.properties.Size='40';assert.equal(run(f).classification,'compliant');});
test('neutral wrapper is traversed; nested component stops outer ownership',()=>{const f=fixture(),s=f.snapshot;s.nodes.push({id:'wrapper',parentId:'slot',type:'FRAME',name:'Anything',childIds:[],visible:true,unknownFacts:[]});s.nodes[1].childIds.push('wrapper');f.add('wrapped','32','wrapper');assert.equal(run(f).classification,'violation');s.nodes.find(n=>n.id==='wrapped').component.properties.Size='40';f.add('foreign','40','slot','c'.repeat(40));f.add('nested','32','foreign');assert.equal(run(f).classification,'compliant');});
for(const [name,mutate]of[
 ['unreadable identity',f=>{f.add('one').unknownFacts=['component.identity'];}],
 ['unreadable property',f=>{delete f.add('one').component.properties.Size;}],
 ['wrong property type',f=>{f.add('one').component.propertyTypes.Size='TEXT';}],
 ['forged SLOT port',f=>{f.add('one');f.snapshot.nodes[1].component.propertyReferenceBindings.slotContentId='Foreign#1:0';}],
 ['stale reference',f=>{f.add('one');f.snapshot.variantReference.nodes[1].type='FRAME';}],
 ['truncation',f=>{f.add('one');f.snapshot.source.truncated=true;}],
 ['missing topology evidence',f=>{f.add('one');delete f.snapshot.source.captureTopology;}],
 ['duplicate source occurrence',f=>{f.add('one');const slot=clone(f.snapshot.nodes[1]);slot.id='duplicate';slot.childIds=[];f.snapshot.nodes.push(slot);f.snapshot.nodes[0].childIds.push(slot.id);}],
])test(name+' remains UNKNOWN',()=>{const f=fixture();mutate(f);assert.equal(run(f).classification,'human-review');});
test('known mismatch survives another unreadable member',()=>{const f=fixture();f.add('wrong','32');f.add('unknown').unknownFacts=['component.identity'];const e=run(f);assert.equal(e.classification,'violation');assert(e.collection.missing.length);});
test('SLOT payload is captured fully and unsupported collection kinds are rejected',()=>{const f=fixture();assert.equal(core.nativeSlotCapturePlan(f.compile().contract),undefined);f.manual.rules[1].constraints[0].collection.assertion={kind:'membership'};assert(f.compile().issues.some(i=>i.level==='error'));});
