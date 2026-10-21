const SCHEMA = 'apollo.document-audit.v1';
const platforms = ['Desktop','MobileWeb','iOS','Android'];
const closed = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const text = (v,max=1000) => typeof v === 'string' && v.length > 0 && v.length <= max;
const contextValid = v => closed(v,['pageId','selectionSignature','platform']) && text(v.pageId,100) && typeof v.selectionSignature==='string' && v.selectionSignature.length<=20000 && platforms.includes(v.platform);
function requestValid(m) { return closed(m,['type','schemaVersion','requestId','context']) && m.type==='document-audit-request' && m.schemaVersion===SCHEMA && text(m.requestId,100) && /^[\w.:-]+$/.test(m.requestId) && contextValid(m.context); }
function focusValid(m) { return closed(m,['type','schemaVersion','requestId','runId','findingId','targetId']) && m.type==='document-audit-focus' && m.schemaVersion===SCHEMA && [m.requestId,m.runId,m.findingId,m.targetId].every(v=>text(v,150)); }
function resultValid(r) {
 try {
 if(JSON.stringify(r).length > 4 * 1024 * 1024) return false;
 if(!closed(r,['runId','context','checks','observedAt','coverage']) || !text(r.runId,100) || !contextValid(r.context) || !Number.isFinite(r.observedAt) || r.coverage!=='native-subsets-only' || !Array.isArray(r.checks) || r.checks.length<3 || r.checks.length>6) return false;
 const seen=new Set();
 return ['local','freshness','theme'].every(id=>r.checks.some(c=>c.id===id)) && r.checks.every(c=>{
  if(!closed(c,['id','scope','status','findings','gaps','checked','categoryComplete']) || !['local','freshness','theme','font','detached','customStyles'].includes(c.id) || seen.has(c.id) || !text(c.scope) || !['complete','incomplete','not-applicable','running'].includes(c.status) || c.categoryComplete!==false || !Number.isInteger(c.checked) || c.checked<0 || !Array.isArray(c.gaps) || c.gaps.length>2000 || !c.gaps.every(v=>text(v,200)) || !Array.isArray(c.findings) || c.findings.length>2000)return false;
  seen.add(c.id);
  return c.findings.every(f=>closed(f,['findingId','status','name','message','componentKey','owner','occurrences','targets','evidence']) && text(f.findingId,150) && ['local','current','update','unknown','theme-mismatch','theme-current','font-mismatch','font-current','detached','custom-style'].includes(f.status) && text(f.name,500) && text(f.message,2000) && (f.componentKey===null || text(f.componentKey,150)) && (f.owner===null || closed(f.owner,['id','name','pageId']) && [f.owner.id,f.owner.name,f.owner.pageId].every(v=>text(v,500))) && Array.isArray(f.occurrences) && f.occurrences.length<=1000 && f.occurrences.every(v=>text(v,100)) && Array.isArray(f.targets) && f.targets.length<=1001 && f.targets.every(t=>closed(t,['id','kind','nodeId','pageId']) && text(t.id,150) && ['occurrence','owner','page-anchor'].includes(t.kind) && text(t.nodeId,100) && t.pageId===r.context.pageId) && f.evidence && typeof f.evidence==='object' && !Array.isArray(f.evidence) && JSON.stringify(f.evidence).length<4000);
 });
 } catch (_) { return false; }
}
module.exports={SCHEMA,platforms,contextValid,requestValid,focusValid,resultValid};
