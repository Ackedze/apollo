const test = require('node:test'), assert = require('node:assert/strict');
const { collectAuditDisplayMetadata, DISPLAY_SCHEMA } = require("../src/audit-display-resources");
const { resourceKey } = require("../src/resource-identity");
const tokenKey = 'a'.repeat(40), styleKey = 'b'.repeat(40), tokenId = `VariableID:${tokenKey}/1:2`, styleId = `S:${styleKey},2:3`;
test('v3 stable-key normalization keeps local identities separate', () => {
  assert.equal(resourceKey('token', tokenId), tokenKey); assert.equal(resourceKey('style', styleId), styleKey);
  assert.equal(resourceKey('token', 'VariableID:1:2'), null); assert.equal(resourceKey('style', '1:2'), null);
});
test('display capture resolves only referenced identities and does not mutate the audit', async () => {
  const calls = [], report = { result: { actual: [{ type: 'SOLID', tokenId }], expected: { styleId } }, snapshot: { appearance: { fillStyleId: styleId } } };
  const before = JSON.stringify(report);
  const metadata = await collectAuditDisplayMetadata({ getStyleByIdAsync: async id => { calls.push(id); return { id, key: styleKey, name: 'Text/Body' }; },
    variables: { getVariableByIdAsync: async id => { calls.push(id); return { id, key: tokenKey, name: 'Color/Primary', variableCollectionId: 'collection' }; },
      getVariableCollectionByIdAsync: async id => ({ id, name: 'Semantic' }) } }, report);
  assert.equal(metadata.schemaVersion, DISPLAY_SCHEMA); assert.equal(metadata.resources.length, 2); assert.equal(calls.length, 2);
  assert.equal(metadata.resources.find(r => r.kind === 'token').collectionName, 'Semantic'); assert.equal(JSON.stringify(report), before);
});
test('missing, throwing, mismatched and timed-out metadata remain unresolved', async () => {
  for (const read of [async () => null, async () => { throw Error('no access'); }, async () => ({ id: 'wrong', key: styleKey, name: 'Wrong token' }), () => new Promise(() => {})]) {
    const result = await collectAuditDisplayMetadata({ variables: { getVariableByIdAsync: read } }, { tokenId }, { timeoutMs: 5 });
    assert.equal(result.unresolved, 1); assert.deepEqual(result.resources, []);
  }
});
test('display lookups are bounded and never call resource import or write APIs', async () => {
  let reads = 0;
  const api = { variables: { getVariableByIdAsync: async () => { reads++; return null; }, importVariableByKeyAsync: () => assert.fail('imports forbidden') } };
  const result = await collectAuditDisplayMetadata(api, { tokenIds: Array.from({ length: 300 }, (_, i) => 'synthetic-' + i) });
  assert.equal(reads, 256); assert.equal(result.truncated, true); assert.equal(result.requested, 256);
});
test('the total display budget stops a large unavailable label set without changing audit facts', async () => {
  let reads=0,clock=0;
  const report={tokenIds:Array.from({length:256},(_,i)=>'invented-label-'+i)},before=JSON.stringify(report);
  const result=await collectAuditDisplayMetadata({variables:{getVariableByIdAsync:async()=>{reads++;clock+=1;return null;}}},report,{budgetMs:16,now:()=>clock});
  assert.ok(reads<=16);assert.equal(result.requested,256);assert.equal(result.unresolved,256);assert.deepEqual(result.resources,[]);assert.equal(JSON.stringify(report),before);
});

test('mode names come from captured or pinned display metadata without filling missing audit facts',async()=>{
 const key='c'.repeat(40),report={snapshot:{nodes:[{variable:{modes:{},modeCatalog:{[key]:{collectionName:'BackgroundColor',modes:[{modeId:'1:0',name:'Page'}]}}}}]},trace:{actual:{state:'unknown'},factPaths:['variable.modes.'+key]}},before=JSON.stringify(report);
 const result=await collectAuditDisplayMetadata({},report,{resolveModeNames:async keys=>{assert.deepEqual(keys,[key]);return [{key,name:'BackgroundColor',modes:[{modeId:'1:1',name:'Modal'}],origin:'catalog-export'},{key:'d'.repeat(40),name:'Unrelated',modes:[]}];}});
 assert.equal(result.modeCollections.length,2);assert.equal(result.modeCollections[0].origin,'native-snapshot');assert.equal(JSON.stringify(report),before);
 const missing=await collectAuditDisplayMetadata({},report,{resolveModeNames:()=>new Promise(()=>{}),timeoutMs:5});assert.equal(missing.modeCollections.length,1);
});

test('finding resource identities precede large baseline scans within existing limits',async()=>{
 const report={components:[{snapshot:{nodes:Array.from({length:50001},()=>({irrelevant:0}))},result:{engine:{evaluations:[{classification:'violation',trace:{predicate:'matches-effective-baseline',actual:{styleId},expected:[{tokenId}],factPaths:['appearance.typography']}}]}}}]};
 const metadata=await collectAuditDisplayMetadata({getStyleByIdAsync:async id=>({id,key:styleKey,name:'Text/Changed'}),variables:{getVariableByIdAsync:async id=>({id,key:tokenKey,name:'Color/Changed'})}},report);
 assert.ok(metadata.resources.some(r=>r.id===styleId));assert.ok(metadata.resources.some(r=>r.id===tokenId));assert.equal(metadata.truncated,true);assert.ok(metadata.requested<=256);
});
