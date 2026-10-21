const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),esbuild=require('esbuild');
const filename=path.resolve(__dirname,"../../src/design-check/DocumentAudit.tsx"),m=new Module(filename,module);m.paths=module.paths;m._compile(esbuild.buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,filename);
const {documentCoverageMessage}=m.exports,check=gaps=>({id:'customStyles',status:'incomplete',gaps});
test('unconnected additional policies do not claim an unavailable style or an exceeded scan limit',()=>{
 const message=documentCoverageMessage(check(['v3-catalog-policy-not-connected']));assert.equal(message.className,'document-audit-coverage');assert.match(message.text,/Дополнительные правила/);assert.doesNotMatch(message.text,/недоступн|лимит|неполная/);
});
test('incomplete coverage names the actual unavailable data, timeout or scan limit',()=>{
 for(const [gap,text] of [['linked-style-unavailable',/стилем или токеном/],['checker-timeout',/вовремя/],['finding-limit',/лимит этой проверки/]]){const message=documentCoverageMessage(check(['v3-catalog-policy-not-connected',gap]));assert.equal(message.className,'document-audit-warning');assert.match(message.text,text);}
 assert.equal(documentCoverageMessage({id:'customStyles',status:'complete',gaps:[]}),null);
});
