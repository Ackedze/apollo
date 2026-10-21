const test = require('node:test'), assert = require('node:assert/strict');
const { findingDisplaySummary, readableResource, percent, findingCompactValue, modeCollectionLabel } = require("../src/finding-display");
const key = 'a'.repeat(40), id = `VariableID:${key}/1:2`;
const metadata = { schemaVersion: 'apollo.audit-display-metadata.v1', resources: [{ kind: 'token', id, key, name: 'Color/Primary', collectionName: 'Semantic' }, { kind: 'style', id: 'S:style,1:2', name: 'Text/Body' }] };
test('paint summary shows names and percentages while retaining the original evidence', () => {
  const paints = [{ type: 'SOLID', color: { r: 15, g: 25, b: 55 }, tokenId: id, opacity: .10000000149011612 }], before = JSON.stringify(paints);
  const text = findingDisplaySummary(paints, { factPath: 'appearance.fill' }, metadata);
  assert.match(text, /Color\/Primary.*Semantic/); assert.match(text, /#0F1937/); assert.match(text, /Непрозрачность: 10%/);
  assert.doesNotMatch(text, /VariableID|0\.100000001/); assert.equal(JSON.stringify(paints), before);
});
test('stable aliases get a name; ambiguous or missing metadata never guesses by colour', () => {
  assert.match(readableResource(metadata, 'token', `VariableID:${key}/9:9`), /Color\/Primary/);
  assert.match(readableResource(null, 'token', id), /название недоступно/);
  const collision = { schemaVersion: metadata.schemaVersion, resources: metadata.resources.concat({ kind: 'token', id: `VariableID:${key}/2:2`, key, name: 'Conflicting name' }) };
  assert.match(readableResource(collision, 'token', `VariableID:${key}/9:9`), /название недоступно/);
});
test('style and variable-binding facts use readable resource labels', () => {
  assert.equal(findingDisplaySummary('S:style,1:2', { factPath: 'appearance.fillStyleId' }, metadata), 'Стиль: Text/Body');
  assert.match(findingDisplaySummary({ required: true, tokenIds: [id] }, { factPath: 'variable.bindings.fills' }, metadata), /Токен: Color\/Primary/);
  assert.equal(percent(.07999999821186066), '8%');
});
test('gradient stops retain readable colours, opacity and unknown-state limits', () => {
  const summary = findingDisplaySummary([{ type: 'GRADIENT_LINEAR', opacity: .8, gradientStops: [{ position: .25, color: { r: 1, g: 0, b: 0, a: .5 }, tokenId: id }], gradientTransform: [[1, 0, 0], [0, 1, 0]] }], { factPath: 'appearance.fill' }, metadata);
  assert.match(summary, /Линейный градиент/); assert.match(summary, /25%.*#FF0000/); assert.match(summary, /Непрозрачность цвета: 50%/); assert.match(summary, /Непрозрачность: 80%/);
  assert.equal(findingDisplaySummary({ state: 'unknown' }, { factPath: 'appearance.fill' }, metadata), null);
});

test('compact solid paint values keep meaningful opacity while dropping redundant diagnostics',()=>{
 const detail={factPath:'appearance.fill'},paint={type:'SOLID',color:{r:242,g:243,b:245},tokenId:id,opacity:1,visible:true};
 assert.equal(findingCompactValue([paint],detail,metadata),'Color/Primary');assert.equal(findingCompactValue([{...paint,tokenId:null}],detail,metadata),'#F2F3F5');
 assert.equal(findingCompactValue([{...paint,opacity:.5,visible:false}],detail,metadata),'Color/Primary · 50% · скрыта');
});
test('mode labels use exact collection and mode identities, leaving unknown and conflicting names explicit',()=>{
 const collectionKey='b'.repeat(40),factPath='variable.modes.'+collectionKey;
 const m={modeCollections:[{key:collectionKey,name:'BackgroundColor',modes:[{modeId:'1:0',name:'base-bg-alt (grey)'},{modeId:'1:1',name:'base-bg (white)'}]}]};
 assert.equal(modeCollectionLabel(m,collectionKey),'BackgroundColor');assert.equal(findingDisplaySummary(['1:0','1:1'],{factPath},m),'base-bg-alt (grey), base-bg (white)');
 assert.equal(findingDisplaySummary('2:0',{factPath},m),'Режим 2:0');assert.equal(findingDisplaySummary({state:'unknown'},{factPath},m),null);
 m.modeCollections.push({key:collectionKey,name:'Other',modes:[{modeId:'1:0',name:'Untrusted'}]});assert.equal(modeCollectionLabel(m,collectionKey),null);assert.equal(findingDisplaySummary('1:0',{factPath},m),'Режим 1:0');
});

test('compact typography and distinct named tokens omit redundant annotations but retain full evidence',()=>{
 const {findingCompactValue,findingDisplaySummary}=require("../src/finding-display");
 const style='S:'+ 'a'.repeat(40)+',1:0',beforeId='VariableID:'+ 'b'.repeat(40)+'/1:0',afterId='VariableID:'+ 'c'.repeat(40)+'/1:1';
 const metadata={schemaVersion:'apollo.audit-display-metadata.v1',resources:[{kind:'style',id:style,name:"Action/16–20 Primary (Typography.Text view='component')"},{kind:'token',id:beforeId,name:'neutral/300'},{kind:'token',id:afterId,name:'neutral/200'}]};
 assert.equal(findingCompactValue({styleId:style},{factPath:'appearance.typography'},metadata),'Action/16–20 Primary');
 const detail={factPath:'appearance.fill',expected:[{type:'SOLID',tokenId:beforeId,opacity:.1}],actual:[{type:'SOLID',tokenId:afterId,opacity:.08}]};
 assert.equal(findingCompactValue(detail.expected,detail,metadata),'neutral/300');assert.equal(findingCompactValue(detail.actual,detail,metadata),'neutral/200');
 assert.match(findingDisplaySummary(detail.actual,detail,metadata),/8%/);
 detail.actual[0].tokenId=beforeId;assert.match(findingCompactValue(detail.actual,detail,metadata),/8%/);
 const missing={schemaVersion:metadata.schemaVersion,resources:metadata.resources.slice(0,2)};detail.actual[0].tokenId=afterId;detail.actual[0].color={r:1,g:2,b:3};assert.match(findingCompactValue(detail.actual,detail,missing),/#010203 · 8%/);
});
