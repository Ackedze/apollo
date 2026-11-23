const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),esbuild=require('esbuild');
const b=esbuild.buildSync({entryPoints:[path.join(__dirname,'../src/v3-audit/data-preparation.ts')],bundle:true,write:false,metafile:true,platform:'node',format:'cjs',logLevel:'silent'});
assert(!Object.keys(b.metafile.inputs).some(file=>/component-contract-core|experimentalContractV2|networkFetch/.test(file)));
const m={exports:{}};new Function('require','module','exports',b.outputFiles[0].text)(require,m,m.exports);const prep=m.exports;
const key='a'.repeat(40),base='https://ackedze.github.io/design-system_ab/JSONS/';
const entry=()=>({componentKey:'example',packageName:'Example',packagePath:'web/example',coverage:'required',figmaKeys:[key],artifacts:{generatedContract:'api.json',rules:'rules.json',composition:'composition.json'}});
const index=packages=>({schemaVersion:2,documentType:'component-contract-index',coverage:{defaultPolicy:'required'},packages});
const api={schemaVersion:'apollo.ds-contracts.v1',contracts:[{id:'example',name:'Example',normalizedName:'example',componentKey:key,status:'current',role:'Main',platform:'Desktop',figma:{variants:{properties:{View:['Primary']},allowedCombinations:[{View:'Primary'}],variantKeys:[]}}}]};
test('preparation preserves loaded-empty rules and explicit none without consulting absent artifacts',async()=>{
 const required=entry(),none=Object.assign({},entry(),{componentKey:'unregulated',coverage:'none',figmaKeys:['b'.repeat(40)],artifacts:{}}),calls=[];
 const result=await prep.preparePolicies(index([required,none]),async url=>{calls.push(url);return url.endsWith('api.json')?api:url.endsWith('rules.json')?{rules:[]}:{contracts:[]};},base);
 assert.equal(result.coverage.defaultPolicy,'required');assert.deepEqual(calls,[base+'web/example/api.json',base+'web/example/rules.json',base+'web/example/composition.json']);
 assert.equal(result.packages[0].rulesEntry,null);assert.equal(result.packages[0].loadedArtifacts.rules,true);assert(result.packages[0].apiEntry.contracts.length);
 assert(Object.values(result.packages[1].loadedArtifacts).every(value=>value===false));assert.equal(result.packages[1].indexEntry.coverage,'none');
});
test('existing V3 artifact path aliases retain their priority and missing required sources refuse',async()=>{
 const required=entry();required.rulesPath='custom/allowed.json';
 const paths=prep.policyArtifactPaths(required);assert.equal(paths.rules,'custom/allowed.json');assert.equal(paths.generatedContract,'web/example/api.json');
 await assert.rejects(prep.preparePolicies(index([required]),async url=>{if(url.endsWith('api.json'))return api;throw Error('SOURCE_MISSING');},base),/SOURCE_MISSING/);
 delete required.artifacts.generatedContract;let reads=0;
 await assert.rejects(prep.preparePolicies(index([required]),async()=>{reads++;},base),/requires generatedContract/);assert.equal(reads,0);
});
test('source inventory follows existing manifests and indexes without replacing Athena structures',async()=>{
 const body={baseUrl:base,apollo:{patternRulesPath:'apollo/patterns.json',componentContractIndexPath:'apollo/index.json'},catalogs:[{fileName:'Example',path:'components/Example.json',source:{kind:'components',indexPath:'components/Example.index.json'}}],catalogManifests:[{url:'https://ackedze.github.io/desing-system_abm/JSONS/referenceSourcesMVP.json',channels:['iOS','Android']}]};
 const requests=[];const result=await prep.describeSources(async url=>{requests.push(url);if(url===prep.entryUrl)return body;if(url===base+'apollo/index.json')return index([entry()]);if(url.includes('/desing-system_abm/'))return{baseUrl:'https://ackedze.github.io/desing-system_abm/JSONS/',catalogs:[{fileName:'Mobile',path:'components/Mobile.json',source:{kind:'components'}}]};throw Error('Unexpected source read '+url);});
 assert.equal(requests.length,3);for(const category of ['deprecated','scheduled','parts'])assert(result.sources.some(row=>row.url===base+'indexes/lifecycle/'+category+'.index.json'&&row.roles.includes('component-lifecycle-index')));assert(result.sources.some(row=>row.url===base+'components/Example.json'));assert(result.sources.some(row=>row.roles.includes('component-index')));
 assert(result.sources.some(row=>row.channels.includes('iOS')&&row.url.endsWith('Mobile.json')));assert(!requests.some(url=>url.endsWith('Example.json')));
});
