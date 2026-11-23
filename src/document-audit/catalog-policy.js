const {readError}=require('./reads');
const KEY=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/;
const closed=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
function validatePolicy(value,hash){
 if(!closed(value,['schemaVersion','indexId','snapshotId','sources','resources','paintComponentKeys','rawTypography'])||value.schemaVersion!=='apollo.catalog-audit-policy.v1'
  ||!HASH.test(value.indexId)||!HASH.test(value.snapshotId)||!Array.isArray(value.sources)||!value.sources.length
  ||!Array.isArray(value.resources)||!Array.isArray(value.paintComponentKeys)||!Array.isArray(value.rawTypography))throw Error('CATALOG_AUDIT_POLICY_INVALID');
 const sources=new Set();for(const s of value.sources){if(!closed(s,['path','sha256'])||!/^JSONS\/(?:referenceSourcesMVP\.json|apollo\/[^/]+\.json|(?:styles|tokens)\/[^/]+\.json|indexes\/(?:icons|logotypes)\/[^/]+\.index\.json)$/.test(s.path)||!HASH.test(s.sha256)||sources.has(s.path))throw Error('CATALOG_AUDIT_POLICY_INVALID');sources.add(s.path);}
 const resources=new Map();for(const r of value.resources){
  const id=r.kind+':'+r.key;
  if(!closed(r,['kind','key','type'])||!['style','variable'].includes(r.kind)||!KEY.test(r.key)||resources.has(id)
   ||r.type!==null&&!(r.kind==='style'?['PAINT','TEXT','EFFECT']:['COLOR','STRING','BOOLEAN','FLOAT']).includes(r.type))throw Error('CATALOG_AUDIT_POLICY_INVALID');resources.set(id,r.type);
 }
 if(value.paintComponentKeys.some(k=>!KEY.test(k))||new Set(value.paintComponentKeys).size!==value.paintComponentKeys.length)throw Error('CATALOG_AUDIT_POLICY_INVALID');
 const rules=new Set();for(const r of value.rawTypography){
  if(!closed(r,['id','nodeName','reasonCode','componentKeys','ancestorPath'])||!['id','nodeName','reasonCode'].every(k=>typeof r[k]==='string'&&r[k]&&r[k].length<=500)||rules.has(r.id)
   ||!Array.isArray(r.componentKeys)||r.componentKeys.some(k=>!KEY.test(k))||!Array.isArray(r.ancestorPath)||r.ancestorPath.some(n=>typeof n!=='string'||!n||n.length>500)||!r.componentKeys.length&&!r.ancestorPath.length)throw Error('CATALOG_AUDIT_POLICY_INVALID');rules.add(r.id);
 }
 const data=Object.assign({},value);delete data.indexId;if(hash(data)!==value.indexId)throw Error('CATALOG_AUDIT_POLICY_INVALID');
 return{indexId:value.indexId,resources,paintComponentKeys:new Set(value.paintComponentKeys),rawTypography:value.rawTypography};
}
function createCatalogPolicyReader(port,hash){return{read:async(guard=()=>{})=>{
 guard();try{const value=await port.read('auditPolicy',null,null,guard);guard();return validatePolicy(value,hash);}
 catch(error){guard();throw readError(error,{operation:'catalogAuditPolicy.index',nodeId:null,resourceId:null});}
}};}
function contextPolicy(index,nodeName,ancestors){
 const keys=new Set(ancestors.map(a=>a.key).filter(Boolean)),names=ancestors.filter(a=>!a.self).map(a=>a.name);
 const ignoreTypography=index.rawTypography.some(r=>r.nodeName===nodeName&&(r.componentKeys.some(k=>ancestors.some(a=>!a.self&&a.key===k))||r.ancestorPath.length&&names.some((_,start)=>r.ancestorPath.slice().reverse().every((name,i)=>names[start+i]===name))));
 return{indexId:index.indexId,resources:index.resources,ignorePaint:Array.from(keys).some(k=>index.paintComponentKeys.has(k)),ignoreTypography};
}
async function verifyCatalogPolicy(reader,observation,{guard=()=>{},onReadFailure=()=>{}}={}){
 if(!reader||!observation.stylePolicyIndexId)return;
 try{const next=await reader.read(guard);guard();if(next.indexId!==observation.stylePolicyIndexId)throw Error('NATIVE_FACTS_CHANGED');}
 catch(error){
  guard();if(error.message==='NATIVE_FACTS_CHANGED')throw error;
  onReadFailure(readError(error,{operation:'catalogAuditPolicy.index',nodeId:null,resourceId:observation.stylePolicyIndexId}));
  const check=observation.checks.find(c=>c.id==='customStyles');check.status='incomplete';if(!check.gaps.includes('v3-catalog-policy-not-connected'))check.gaps.push('v3-catalog-policy-not-connected');
  for(const f of check.findings){f.status='unknown';f.message='Не удалось подтвердить актуальность каталожных правил стилей и токенов.';}
 }
}
module.exports={validatePolicy,createCatalogPolicyReader,contextPolicy,verifyCatalogPolicy};
