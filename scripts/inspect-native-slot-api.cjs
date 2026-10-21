// Read-only type evidence. No dependency installation or Figma calls.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inspectApi(apolloRoot,candidateDirectory){
 const ts=require(path.join(apolloRoot,'node_modules/typescript'));
 const snippets={slot:"declare const slot: SlotNode; declare const child: SceneNode; slot.appendChild(child); slot.insertChild(0,child); slot.resetSlot(); const limits: ReadonlyArray<string> = slot.limitViolations; const kind: ComponentPropertyType = 'SLOT';",
  reference:"declare const slot: SlotNode; const identity: string | undefined = slot.componentPropertyReferences?.slotContentId;",
  properties:"declare const instance: InstanceNode; instance.setProperties({ 'synthetic-label#1:2':'text', View:'Secondary', DisabledState:'False' });"};
 function probe(typesFile,source){const file='/__apollo_readonly_type_probe__.ts',options={strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2020,lib:['lib.es2020.d.ts','lib.dom.d.ts'],types:[]};const host=ts.createCompilerHost(options),read=host.readFile,exists=host.fileExists;host.readFile=p=>p===file?source:read(p);host.fileExists=p=>p===file||exists(p);const program=ts.createProgram([file,typesFile],options,host);const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);return {status:errors.length?'unsupported':'type-supported',diagnostics:errors.map(d=>({code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))};}
 function observe(directory){const pkg=path.join(directory,'package.json'),api=path.join(directory,'plugin-api.d.ts');return {version:JSON.parse(fs.readFileSync(pkg)).version,packageSha256:sha(fs.readFileSync(pkg)),declarationSha256:sha(fs.readFileSync(api)),probes:Object.fromEntries(Object.entries(snippets).map(([name,source])=>[name,probe(api,source)]))};}
 const installed=observe(path.join(apolloRoot,'node_modules/@figma/plugin-typings')),candidate=candidateDirectory?observe(candidateDirectory):null;
 if(candidate){const snapshot=JSON.parse(fs.readFileSync(path.join(candidateDirectory,'snapshot.json')));if(snapshot.version!==candidate.version||snapshot.files.find(f=>f.path==='plugin-api.d.ts')?.sha256!==candidate.declarationSha256||snapshot.files.find(f=>f.path==='package.json')?.sha256!==candidate.packageSha256)throw Error('FIGMA_API_SNAPSHOT_STALE');candidate.snapshot=snapshot;}
 return {version:1,kind:'readonly-official-native-api-type-evidence',installed,candidate,documentation:'documented',runtime:'unknown',live:'not-run',dependencyChange:'proposal-only',urls:{slot:'https://developers.figma.com/docs/plugins/api/SlotNode/',properties:'https://developers.figma.com/docs/plugins/working-with-component-properties/',settings:'https://developers.figma.com/docs/plugins/api/SlotSettings/',ga:'https://developers.figma.com/docs/plugins/updates/2026/06/10/update/'}};
}
if(require.main===module){const [apollo,candidate,out]=process.argv.slice(2);try{const proof=inspectApi(apollo,candidate);if(out)fs.writeFileSync(out,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={inspectApi};
