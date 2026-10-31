const {linkedStyleValue}=require('./styles');
const SCHEMA='apollo.deprecated-styles.v1',KEY=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
function validateIndex(value,hash){
 const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
 if(!closed(value,['indexId','schemaVersion','policyVersion','createdAt','policySha256','sources','styles'])||value.schemaVersion!==SCHEMA||!HASH.test(value.indexId)||!HASH.test(value.policySha256)
   ||!Number.isSafeInteger(value.policyVersion)||value.policyVersion<1||!Number.isFinite(Date.parse(value.createdAt))||!Array.isArray(value.sources)||!value.sources.length||!Array.isArray(value.styles))throw Error('DEPRECATED_STYLE_INDEX_INVALID');
 const paths=new Set();for(const s of value.sources){if(!closed(s,['path','sha256'])||!/^JSONS\/styles\/[^/]+\.json$/.test(s.path)||!HASH.test(s.sha256)||paths.has(s.path))throw Error('DEPRECATED_STYLE_INDEX_INVALID');paths.add(s.path);}
 const styles=new Map();for(const s of value.styles){
  if(!closed(s,['key','type','name','library','status','sourceIds'])||!KEY.test(s.key)||styles.has(s.key)||!['deprecated','ambiguous'].includes(s.status)||!['PAINT','TEXT','EFFECT',null].includes(s.type)||s.status==='deprecated'&&!s.type
    ||typeof s.name!=='string'||!s.name||s.name.length>500||typeof s.library!=='string'||!s.library||s.library.length>500||!Array.isArray(s.sourceIds)||!s.sourceIds.length||new Set(s.sourceIds).size!==s.sourceIds.length||s.sourceIds.some(p=>!paths.has(p)))throw Error('DEPRECATED_STYLE_INDEX_INVALID');styles.set(s.key,s);
 }
 const data=Object.assign({},value);delete data.indexId;if(hash(data)!==value.indexId)throw Error('DEPRECATED_STYLE_INDEX_INVALID');
 return{indexId:value.indexId,policyVersion:value.policyVersion,styles};
}
function createDeprecatedStyleReader(port,hash){return{read:async()=>validateIndex(await port.read('deprecatedStyles'),hash)};}
async function describeDeprecatedStyles(api,node,{read,styleCache,index}){
 const findings=[],resources=[],gaps=[],bindings=[];
 const add=(property,id,type)=>{if(id)bindings.push({property,id,type});};
 for(const [property,field,type]of [['fills','fillStyleId','PAINT'],['strokes','strokeStyleId','PAINT'],['effects','effectStyleId','EFFECT']]){
  const values=node[property];
  if(property==='fills'&&node.type==='TEXT'&&(typeof values==='symbol'||typeof node[field]==='symbol')&&typeof node.getStyledTextSegments==='function'){
   for(const s of node.getStyledTextSegments(['fills','fillStyleId']))if(s.end>s.start&&Array.isArray(s.fills)&&s.fills.some(p=>p&&p.visible!==false))add(property,s.fillStyleId,type);
  }else if(Array.isArray(values)){if(values.some(p=>p&&p.visible!==false))add(property,node[field],type);}
  else if(typeof values==='symbol')gaps.push('deprecated-style-binding-unavailable');
 }
 if(node.type==='TEXT'&&String(node.characters||'').trim()){
  if(typeof node.textStyleId==='symbol'&&typeof node.getStyledTextSegments==='function'){for(const s of node.getStyledTextSegments(['textStyleId']))if(s.end>s.start)add('typography',s.textStyleId,'TEXT');}
  else add('typography',node.textStyleId,'TEXT');
 }
 const seen=new Set();for(const b of bindings){
  const identity=b.property+':'+String(b.id);if(seen.has(identity))continue;seen.add(identity);
  let style=null;
  if(typeof b.id==='string'){
   if(!styleCache.has(b.id))styleCache.set(b.id,read(()=>api.getStyleByIdAsync(b.id)).then(linkedStyleValue).catch(()=>null));
   style=await styleCache.get(b.id);resources.push({kind:'style',id:b.id,value:style});
  }
  const row=style&&KEY.test(style.key)?index.styles.get(style.key):null;
  const unknown=!style||style.id!==b.id||style.type!==b.type||!KEY.test(style.key)||row&&(row.status==='ambiguous'||row.type!==style.type);
  if(unknown)gaps.push('deprecated-style-identity-unconfirmed');
  if(unknown||row)findings.push({status:unknown?'unknown':'deprecated-style',evidence:{property:b.property,styleId:typeof b.id==='string'?b.id:'mixed',styleKey:style?.key||null,styleName:style?.name||null,library:row?.library||null,sourceIds:row?.sourceIds||[],indexId:index.indexId,policyVersion:index.policyVersion}});
 }
 return{findings,resources,gaps};
}
// A missing index never turns an incomplete check into an empty successful one.
async function verifyDeprecatedStyles(reader,observation){
 if(!reader||!observation.deprecatedIndexId)return;
 try{const next=await reader.read();if(next.indexId!==observation.deprecatedIndexId)throw Error('NATIVE_FACTS_CHANGED');}
 catch(error){
  if(error.message==='NATIVE_FACTS_CHANGED')throw error;
  const check=observation.checks.find(c=>c.id==='deprecatedStyles');check.status='incomplete';
  if(!check.gaps.includes('deprecated-style-index-unavailable'))check.gaps.push('deprecated-style-index-unavailable');
  for(const f of check.findings){f.status='unknown';f.message='Не удалось подтвердить актуальность индекса устаревших стилей.';}
 }
}
module.exports={validateIndex,createDeprecatedStyleReader,describeDeprecatedStyles,verifyDeprecatedStyles};
