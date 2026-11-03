'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript'),indexer=require('../scripts/index-landing-api');
test('portable API index addresses every top-level declaration in the exact supplied typings',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../instructions/landing/figma-workflow.md'),'utf8'),blocks=indexer.sections(workflow),types=blocks.find(p=>p.id===indexer.TYPES).text,map=JSON.parse(blocks.find(p=>p.id===indexer.SYMBOLS)?.text||'null');
 assert(map,'No addressed symbol map supplied');assert.equal(map.sourceSha256,crypto.createHash('sha256').update(types).digest('hex'));
 const prefix=types.indexOf('```typescript\n')+'```typescript\n'.length,end=types.lastIndexOf('```'),source=ts.createSourceFile('portable.d.ts',types.slice(prefix,end),ts.ScriptTarget.Latest,true);
 assert.equal(source.parseDiagnostics.length,0);
 let count=0;
 for(const node of source.statements){
  const named=ts.isVariableStatement(node)?node.declarationList.declarations.map(d=>d.name.getText(source)):node.name?[node.name.getText(source)]:[];
  for(const name of named){const rows=map.symbols[name];assert(rows?.length,'Missing declaration '+name);assert(rows.some(row=>row.offset===node.getStart(source)+prefix),name+' points outside its declaration');count++;}
 }
 assert(count>100);assert.equal(map.offsetUnits,'utf16-characters');
 for(const rows of Object.values(map.symbols))for(const row of rows){assert(row.offset>=prefix&&row.end<=end&&row.end>row.offset);assert.equal(row.line,types.slice(0,row.offset).split('\n').length);assert(row.limit>0&&row.limit<=16000);}
 assert.equal(workflow,indexer.indexWorkflow(workflow),'Generated map and index must be current and idempotent');
});
test('workflow indexing preserves non-index sources and uses character offsets with non-ASCII prefixes',()=>{
 const types='Header 🧭\n```typescript\ninterface Example { name: string }\ntype Value = Example;\n```';
 const text='# Loaded workflow file: '+indexer.TYPES+'\n'+types+'\n\n# Loaded workflow file: '+indexer.INDEX+'\nOld L99999\n\n# Loaded workflow file: figma-use/SKILL.md\nKeep original operating rules.\n';
 const after=indexer.indexWorkflow(text),blocks=indexer.sections(after),map=JSON.parse(blocks.find(p=>p.id===indexer.SYMBOLS).text),location=map.symbols.Example[0];
 assert.equal(blocks.find(p=>p.id===indexer.TYPES).text,types);assert.equal(blocks.find(p=>p.id==='figma-use/SKILL.md').text,'Keep original operating rules.');assert.equal(types.slice(location.offset,location.offset+17),'interface Example');assert.notEqual(Buffer.byteLength(types.slice(0,location.offset)),location.offset);assert.equal(indexer.indexWorkflow(after),after);
});
