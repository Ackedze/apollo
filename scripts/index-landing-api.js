'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TYPES='figma-use/references/plugin-api-standalone.d.ts';
const INDEX='figma-use/references/plugin-api-standalone.index.md';
const SYMBOLS='figma-use/references/plugin-api-standalone.symbols.json';
function sections(text){
 const headers=Array.from(text.matchAll(/^# Loaded workflow file: (.+)\r?\n/gm));
 return headers.map((m,i)=>({id:m[1].trim(),start:m.index,bodyStart:m.index+m[0].length,end:headers[i+1]?.index??text.length,text:text.slice(m.index+m[0].length,headers[i+1]?.index??text.length).trim()}));
}
function symbolIndex(text){
 const declarations=Array.from(text.matchAll(/^(?:declare\s+)?(interface|type|enum|class|function|const|let|var|namespace)\s+([A-Za-z_$][\w$]*)\b/gm));
 if(!declarations.length)throw Error('LANDING_API_DECLARATIONS_MISSING');
 const symbols=Object.create(null);
 for(let i=0;i<declarations.length;i++){
  const m=declarations[i],end=declarations[i+1]?.index??text.lastIndexOf('```');
  if(end<=m.index)throw Error('LANDING_API_DECLARATION_INVALID');
  const location={kind:m[1],offset:m.index,end,line:text.slice(0,m.index).split('\n').length,limit:Math.min(16000,end-m.index)};
  (symbols[m[2]]??=[]).push(location);
 }
 return {schemaVersion:'apollo.landing-api-symbols.v1',sourceResource:'workflow/'+TYPES,sourceSha256:crypto.createHash('sha256').update(text).digest('hex'),offsetUnits:'utf16-characters',symbols};
}
function indexWorkflow(text){
 const blocks=sections(text),types=blocks.find(p=>p.id===TYPES),index=blocks.find(p=>p.id===INDEX);
 if(!types||!index||new Set(blocks.map(p=>p.id)).size!==blocks.length)throw Error('LANDING_API_WORKFLOW_INVALID');
 const data=symbolIndex(types.text),overview=[
  '# Portable Figma Plugin API',
  '',
  'Use the pinned symbol map instead of shell grep or sequentially reading all declarations.',
  'The portable declarations omit documentation comments. Original upstream line numbers do not address this file.',
  '',
  '## Addressed reader',
  '',
  '- Symbol map resource: `workflow/'+SYMBOLS+'`.',
  '- Read `mode=keys, path=["symbols"]` to discover names. Read `mode=read, path=["symbols","FrameNode"]` for the locations of a selected name.',
  '- Each location provides `offset`, exclusive `end`, line and a first-page `limit` for `'+data.sourceResource+'`.',
  '- Read that declaration with `path=[]`, its offset and limit. For a longer declaration follow the actual returned cursor, keeping each limit at most `min(16000, end - cursor)`; stop at its end.',
  '- Read referenced base interfaces and related value types the same way. A symbol summary is navigation, not a replacement for a required signature or normative source.',
  '- `sourceSha256` in the symbol map pins the exact trimmed declaration resource. Offsets use UTF-16 characters, matching the reader; UTF-8 byte offsets must not be substituted.',
  '',
  '## API groups',
  '',
  '`PluginAPI` supplies file access, published component import, variables, fonts and node factories. Node interfaces and their mixins define properties, slots, text and layout. Read the actual interface before using an uncertain member.',
  'Keep the loaded figma-use operating rules, ownership checks, canonical font recipe and recovery rules. API signatures do not grant permission to mutate library or global definitions.',
  '',
  'Source SHA-256: `'+data.sourceSha256+'`.',
  ''
 ].join('\n');
 const replacements=new Map([[INDEX,overview],[SYMBOLS,JSON.stringify(data,null,2)+'\n']]);
 let result=text;
 for(const block of blocks.slice().reverse())if(replacements.has(block.id)){result=result.slice(0,block.bodyStart)+replacements.get(block.id).trimEnd()+(block.end===text.length?'\n':'\n\n')+result.slice(block.end);replacements.delete(block.id);}
 for(const [id,body]of replacements)result=result.trimEnd()+'\n\n# Loaded workflow file: '+id+'\n'+body.trimEnd()+'\n';
 return result;
}
if(require.main===module){
 const file=path.resolve(__dirname,'../instructions/landing/figma-workflow.md'),before=fs.readFileSync(file,'utf8'),after=indexWorkflow(before);
 if(process.argv[2]==='--write')fs.writeFileSync(file,after);
 else if(process.argv.length!==2||before!==after){process.stderr.write('Landing API index is stale. Run node scripts/index-landing-api.js --write.\n');process.exitCode=1;}
}
module.exports={TYPES,INDEX,SYMBOLS,sections,symbolIndex,indexWorkflow};
