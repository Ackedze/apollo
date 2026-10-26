const test=require('node:test'),assert=require('node:assert/strict'),{collectNodes}=require('../dist/capture.cjs');
const {runNativeOccurrenceCapture}=require('./helpers/native-occurrence-capture.cjs');
async function capture(mutate=()=>{},resolve=field=>field==='family'?{resolvedType:'STRING',value:'Synthetic System'}:{resolvedType:'FLOAT',value:0}) {
 return (await runNativeOccurrenceCapture(async(figma)=>{
  const n={id:'text',type:'TEXT',name:'Label',parent:null,visible:true,characters:'',width:0,height:16,x:0,y:0,resolvedVariableModes:{},
   fontName:{family:'Synthetic Base',style:'Medium'},fontSize:12,lineHeight:{unit:'PIXELS',value:16},letterSpacing:{unit:'PIXELS',value:.19},
   textStyleId:'',getStyledTextSegments:()=>[],boundVariables:{fontFamily:[{type:'VARIABLE_ALIAS',id:'family'}],letterSpacing:[{type:'VARIABLE_ALIAS',id:'tracking'}]}};
  mutate(n);figma.variables.getVariableByIdAsync=async id=>{const resolved=resolve(id);return resolved&&{key:'a'.repeat(40),resolvedType:resolved.resolvedType,resolveForConsumer:consumer=>{assert.equal(consumer,n);return resolved;}};};
  global.figma=figma;try{return (await collectNodes(n,'desktop',{})).snapshot.nodes[0];}finally{delete global.figma;}
 })).result;
}
test('empty TEXT capture records effective bound family/tracking for this consumer',async()=>{const n=await capture();assert.deepEqual(n.text.fontName,{family:'Synthetic System',style:'Medium'});assert.deepEqual(n.text.letterSpacing,{unit:'PIXELS',value:0});assert(!n.unknownFacts.includes('text.fontName'));});
test('nonempty text and actual unbound overrides keep their measured values',async()=>{
 for(const mutate of[n=>{n.characters='X';},n=>{delete n.boundVariables.fontFamily;delete n.boundVariables.letterSpacing;}]){
  const n=await capture(mutate);assert.equal(n.text.fontName.family,'Synthetic Base');assert.equal(n.text.letterSpacing.value,.19);
 }
 const changed=await capture(n=>{n.fontName.style='Bold';delete n.boundVariables.letterSpacing;n.letterSpacing.value=7;});
 assert.equal(changed.text.fontName.style,'Bold');assert.equal(changed.text.letterSpacing.value,7);
});
test('percent tracking retains its actual unit rather than assuming pixels',async()=>{const n=await capture(n=>{n.letterSpacing={unit:'PERCENT',value:2};},id=>id==='family'?{resolvedType:'STRING',value:'Synthetic System'}:{resolvedType:'FLOAT',value:3});assert.deepEqual(n.text.letterSpacing,{unit:'PERCENT',value:3});});
for(const [name,mutate,resolve]of[
 ['ambiguous alias',n=>{n.boundVariables.fontFamily.push({type:'VARIABLE_ALIAS',id:'other'});},undefined],
 ['unreadable binding',n=>{Object.defineProperty(n,'boundVariables',{get(){throw new Error('unreadable binding');}});},undefined],
 ['unreadable variable',()=>{},()=>undefined],
 ['wrong type',()=>{},()=>({resolvedType:'BOOLEAN',value:true})],
 ['empty family and nonfinite tracking',()=>{},id=>id==='family'?{resolvedType:'STRING',value:''}:{resolvedType:'FLOAT',value:NaN}],
 ['unknown tracking units',n=>{n.letterSpacing.unit='UNKNOWN';},undefined],
])test(name+' marks the affected fact UNKNOWN',async()=>{const n=await capture(mutate,resolve);assert(n.unknownFacts.some(p=>p==='text.fontName'||p==='text.letterSpacing'));});
test('capture keeps real font/style/tracking changes detectable by the existing baseline predicate',async()=>{
 const core=require('../dist/core.cjs'),{fixture}=require('./helpers/declared-target.cjs');
 for(const mutate of[n=>{delete n.boundVariables.fontFamily;n.fontName.family='Actual custom family';},n=>{n.fontName.style='Bold';},n=>{delete n.boundVariables.letterSpacing;n.letterSpacing.value=7;}]){
  const measured=await capture(mutate),f=fixture(core);delete f.manual.metadata.declaredTargetIdentityVersion;for(const t of f.manual.targets)delete t.identityBindingsV1;
  Object.assign(f.manual.rules[0],{targetId:'title.target',capability:'text.typography',constraints:[{type:'propertyForbidden',fact:'text.fontName'},{type:'propertyForbidden',fact:'text.letterSpacing'}]});
  const n=f.snapshot.nodes[2];n.text=measured.text;n.baseline={effective:{text:{fontName:{family:'Synthetic System',style:'Medium'},letterSpacing:{unit:'PIXELS',value:0}}}};
  const compiled=f.compile();assert.equal(compiled.issues.filter(i=>i.level==='error').length,0);const result=core.evaluateCompiledContract(f.snapshot,core.prepareAuthoringPreviewContract(compiled.contract));assert(result.evaluations.some(e=>e.classification==='violation'));
 }
});
