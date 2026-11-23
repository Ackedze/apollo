const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const corePath=process.env.APOLLO_CONTRACT_CORE || path.join(__dirname,'../dist/core.cjs');
const core=require(corePath),engine=require(path.join(path.dirname(corePath),'predicate.cjs'));
const clone=x=>JSON.parse(JSON.stringify(x));
const paint=()=>({type:'SOLID',visible:true,opacity:.88,color:{r:3,g:3,b:6},tokenId:'synthetic-color-token'});
const node=()=>({id:'text',type:'TEXT',visible:true,semantic:{role:'label'},text:{characters:':.'},appearance:{fill:null},
 textFillEvidenceV1:{version:1,keysById:{},segments:[{start:0,end:1,paints:[paint()]},{start:1,end:2,paints:[]}],emptyPaints:null},unknownFacts:[]});
const snapshot=n=>({schemaVersion:'apollo.predicate-snapshot.v2',selection:['text'],nodes:[n],context:{}});
const expression={predicate:'matches-effective-baseline',actual:{fact:'appearance.fill'},expected:{fact:'baseline.effective.appearance.fill'},missingPolicy:'unknown'};
const rule={schemaVersion:'apollo.rule-ir.v1',ruleId:'synthetic.fill',revision:1,source:{path:'fixture',checksum:'a'.repeat(64),anchor:'fixture'},authority:{status:'active',provenance:'test'},effect:'require',scope:{},select:{from:'selection-root',traverse:'self'},assert:expression,severity:'error',unknownPolicy:'human-review'};
function prepare(changeActual=()=>{},changeReference=()=>{}){const actual=node(),reference=node();changeActual(actual);changeReference(reference);return core.materializeEffectiveBaseline(snapshot(actual),snapshot(reference),false).snapshot;}
function run(s){core.materializeGradientPaintEvidence(s);return engine.evaluateRules({snapshot:s,rules:[rule]}).evaluations[0];}
test('complete mixed text fills match an independently materialized baseline',()=>{
 const actual=node(),reference=node(),before=JSON.stringify({actual,reference});
 const s=core.materializeEffectiveBaseline(snapshot(actual),snapshot(reference),false).snapshot;
 assert.equal(run(s).classification,'compliant');assert.equal(JSON.stringify({actual,reference}),before);
 assert.equal(s.nodes[0].appearance.fill,null);assert.equal(s.nodes[0].baseline.effective.appearance.fill,null);
});
for(const [name,change]of Object.entries({color:n=>n.textFillEvidenceV1.segments[0].paints[0].color.r=4,
 token:n=>n.textFillEvidenceV1.segments[0].paints[0].tokenId='synthetic-other-token',
 opacity:n=>n.textFillEvidenceV1.segments[0].paints[0].opacity=.4,
 detached:n=>n.textFillEvidenceV1.segments[0].paints[0].tokenId=null,
 removed:n=>n.textFillEvidenceV1.segments[0].paints=[],
 secondRange:n=>n.textFillEvidenceV1.segments[1].paints=[paint()]}))test('mixed text fill detects changed '+name,()=>assert.equal(run(prepare(change)).classification,'violation'));
test('reference range paints remain independent from changed actual paints',()=>assert.equal(run(prepare(()=>{},n=>n.textFillEvidenceV1.segments[0].paints[0].color.b=7)).classification,'violation'));
test('unknown reference source evidence is not promoted into the baseline',()=>{
 assert.equal(run(prepare(()=>{},n=>n.unknownFacts.push('textFillEvidenceV1'))).classification,'human-review');
});
test('reference-only ranges do not change host-context fact projection',()=>{
 assert.equal(core.effectiveFacts(node()).textFillEvidenceV1,undefined);
});
for(const side of ['actual','reference'])for(const [name,change]of Object.entries({missing:n=>delete n.textFillEvidenceV1,
 partial:n=>n.textFillEvidenceV1.segments.pop(),overlap:n=>n.textFillEvidenceV1.segments[1].start=0,
 unavailable:n=>n.textFillEvidenceV1.segments[0].paints=null,
 malformed:n=>delete n.textFillEvidenceV1.segments[0].paints[0].color}))test(side+' '+name+' range evidence stays UNKNOWN',()=>{
 assert.equal(run(prepare(side==='actual'?change:()=>{},side==='reference'?change:()=>{})).classification,'human-review');
});
for(const prefix of ['','baseline.effective.'])for(const fact of ['appearance.fill','textFillEvidenceV1','text.characters'])test('explicit unknown '+prefix+fact+' is preserved',()=>{
 const s=prepare();s.nodes[0].unknownFacts.push(prefix+fact);assert.equal(run(s).classification,'human-review');
});
test('non-text null fills do not gain a text fallback',()=>{
 const s=prepare(n=>n.type='FRAME',n=>n.type='FRAME');assert.equal(run(s).classification,'human-review');
});
test('uniform fills keep existing comparison and allow changed text length',()=>{
 const s=prepare(n=>{n.appearance.fill=[paint()];n.text.characters='Longer label';delete n.textFillEvidenceV1;},n=>{n.appearance.fill=[paint()];delete n.textFillEvidenceV1;});
 assert.equal(run(s).classification,'compliant');
});
test('mixed actual versus uniform reference detects a changed range',()=>{
 assert.equal(run(prepare(()=>{},n=>{n.appearance.fill=[paint()];delete n.textFillEvidenceV1;})).classification,'violation');
});
test('uniform actual versus mixed reference detects removed range formatting',()=>{
 assert.equal(run(prepare(n=>{n.appearance.fill=[];delete n.textFillEvidenceV1;})).classification,'violation');
});
test('paint-equivalent range splits do not change the fill baseline',()=>{
 const same=n=>{n.textFillEvidenceV1.segments[1].paints=[paint()];};
 const s=prepare(same,n=>{same(n);n.textFillEvidenceV1.segments=[{start:0,end:2,paints:[paint()]}];});
 assert.equal(run(s).classification,'compliant');
});
