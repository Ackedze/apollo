const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,hash}=require("./document-audit.test");
const {collect,recheck}=require("../src/document-audit/engine");
const {impact,mergeObservation}=require("../src/document-audit/scoped-recheck");
const check=o=>o.checks.find(c=>c.id==='customStyles');
const solid=()=>({type:'SOLID',color:{r:.2,g:.3,b:.4}});
function scene(property='fills'){
 const f=fixture(),area=f.node('area'),target=f.node('target','RECTANGLE',area,{fills:[solid()],fillStyleId:'',effects:[{type:'DROP_SHADOW'}],effectStyleId:'missing-effect'}),peer=f.node('peer','RECTANGLE',f.page,{fills:[solid()],fillStyleId:''});
 f.node('unavailable-sibling','RECTANGLE',area,{fills:[solid()],fillStyleId:'missing-paint'});
 if(property==='strokes'){target.strokes=[solid()];target.strokeStyleId='';}
 if(property==='effects')target.effectStyleId='';
 if(property==='typography'){target.type='TEXT';target.characters='Invented text';target.textStyleId='';target.getStyledTextSegments=()=>[{start:0,end:target.characters.length,textStyleId:target.textStyleId,fills:target.fills,fillStyleId:target.fillStyleId}];}
 f.api.getStyleByIdAsync=async id=>id==='bound-style'?{id,key:'invented-style-key',name:'Invented style',type:property==='typography'?'TEXT':'EFFECT'}:null;f.api.variables.getVariableByIdAsync=async id=>id==='bound-token'?{id,key:'invented-key',name:'Invented token',resolvedType:'COLOR',variableCollectionId:'invented-collection'}:null;
 f.theme('corp');f.page.selection=[area,peer];return Object.assign(f,{area,target,peer});
}
for(const property of ['fills','strokes','typography','effects'])test('scoped '+property+' binding refresh removes a confirmed fix despite unrelated style gaps',async()=>{
 const f=scene(property),old=await f.capture(),context=f.context(),plan=impact(old,{kind:['fills','strokes'].includes(property)?'bind-variable':'bind-style',nodeId:f.target.id},context);
 // The owning contract expands this recheck to its observed descendants.
 plan.roots=[f.area];plan.includeCurrent();
 if(['fills','strokes'].includes(property))f.target[property]=[Object.assign(solid(),{boundVariables:{color:{type:'VARIABLE_ALIAS',id:'bound-token'}}})];
 else f.target[property==='typography'?'textStyleId':'effectStyleId']='bound-style';
 const fresh=await collect(f.api,context,{hash,assertCurrent:()=>{},roots:plan.roots,scoped:true}),merged=mergeObservation(old,fresh,plan);
 await recheck(f.api,merged.facts,{hash,assertCurrent:()=>{}});
 const repaired=check(old).findings.find(x=>x.occurrences.includes(f.target.id)&&x.evidence.property===property);
 assert.equal(check(merged).findings.some(x=>x.findingId===repaired.findingId),false);
 assert.equal(merged.staleFindingIds.includes(repaired.findingId),false);
 assert.equal(check(merged).findings.length,check(old).findings.length-1);
 if(property!=='effects')assert.ok(check(merged).findings.some(x=>x.occurrences.includes(f.target.id)&&x.evidence.property==='effects'&&x.status==='unknown'));
 assert.ok(check(merged).findings.some(x=>x.occurrences.includes('unavailable-sibling')&&x.status==='unknown'));
 assert.deepEqual(check(merged).findings.find(x=>x.occurrences.includes(f.peer.id)),check(old).findings.find(x=>x.occurrences.includes(f.peer.id)));
 assert.equal(check(merged).status,'incomplete');
});
test('scoped binding refresh preserves the old finding when the new binding cannot be read',async()=>{
 const f=scene(),old=await f.capture(),context=f.context(),plan=impact(old,{kind:'bind-variable',nodeId:f.target.id},context);
 f.target.fills=[Object.assign(solid(),{boundVariables:{color:{type:'VARIABLE_ALIAS',id:'unavailable-token'}}})];
 const fresh=await collect(f.api,context,{hash,assertCurrent:()=>{},roots:plan.roots,scoped:true}),merged=mergeObservation(old,fresh,plan);
 const original=check(old).findings.find(x=>x.occurrences.includes(f.target.id)&&x.evidence.property==='fills');
 assert.ok(check(merged).findings.some(x=>x.findingId===original.findingId));assert.ok(merged.staleFindingIds.includes(original.findingId));
});
for(const kind of ['bind-variable','bind-style'])test(kind+' includes observed Auto Layout peers while preserving the original selection boundary',async()=>{
 const f=fixture(),layout=f.node('layout','FRAME',f.page,{layoutMode:'VERTICAL',explicitVariableModes:{}}),selected=f.node('selected','FRAME',layout,{explicitVariableModes:{}}),prefix=f.node('prefix','TEXT',selected,{explicitVariableModes:{}}),title=f.node('title','TEXT',selected,{explicitVariableModes:{}}),outside=f.node('outside','FRAME',layout);
 f.page.selection=[selected];const old=await f.capture(),plan=impact(old,{kind,nodeId:prefix.id},f.context());
 assert.deepEqual(plan.roots.map(n=>n.id),[selected.id]);assert.ok(plan.ids.has(title.id));assert.ok(plan.ids.has(selected.id));assert.equal(plan.ids.has(outside.id),false);assert.equal(plan.ids.has(layout.id),false);assert.equal(plan.ids.has(f.page.id),false);
});
