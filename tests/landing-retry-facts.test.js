'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/landing/ui.js'),'utf8'),start=source.indexOf(' function sameReadback('),end=source.indexOf(' function schedule(',start);
assert(start>=0&&end>start);const context=vm.createContext({});vm.runInContext(source.slice(start,end)+'\nthis.compare=sameReadback;',context);const compare=context.compare,copy=v=>JSON.parse(JSON.stringify(v));
const before={rootNodeId:'root',ownerNonce:'owner',leaseNonce:'lease',outsideHash:'outside',native:{nodes:[{id:'root',type:'FRAME',x:0},{id:'text',type:'TEXT',characters:'Confirmed',fontName:{family:'Font',style:'Regular'},resolvedVariableModes:{theme:'light'},boundVariables:{fill:{id:'Variable1'}},imageHashes:[{imageHash:'image',visible:true}]}]}};
test('retry freshness ignores object key order while preserving ordered native facts',()=>{
 const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
 assert(compare(before,reverse(before)));const reordered=copy(before);reordered.native.nodes.reverse();assert.equal(compare(before,reordered),false);
});
for(const field of ['text','font','mode','binding','image','geometry','owner','lease','outside'])test('retry freshness detects changed '+field,()=>{
 const changed=copy(before),text=changed.native.nodes[1];if(field==='text')text.characters='Edited';if(field==='font')text.fontName.family='Other';if(field==='mode')text.resolvedVariableModes.theme='dark';if(field==='binding')text.boundVariables.fill.id='Variable2';if(field==='image')text.imageHashes[0].imageHash='other';if(field==='geometry')changed.native.nodes[0].x=1;if(field==='owner')changed.ownerNonce='other';if(field==='lease')changed.leaseNonce='other';if(field==='outside')changed.outsideHash='other';assert.equal(compare(before,changed),false);
});
