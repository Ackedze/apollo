'use strict';
const fail=code=>{throw Object.assign(Error(code),{code});};
const STATUSES=['passed','failed','unknown','not-applicable'];
function createEvidenceLedger({hash,sourceHash,versionHash,maxEntries=512,maxHistory=4096}={}){
 const history=[],current=new Map(),parents=new Map();let head=null,seeded=false,scene=null,rootSubject=null,componentIds=new Map();
 const identity=row=>JSON.stringify([row.subject,row.RuleID,row.scope]);
 function ancestors(subject){const result=new Set();let node=subject;while(node){if(result.has(node))fail('AGENT_LEDGER_PARENT_INVALID');result.add(node);node=parents.get(node);}return result;}
 function append(key,value){if(history.length>=maxHistory)fail('AGENT_LEDGER_LIMIT');const entry=JSON.parse(JSON.stringify(value));entry.previousHead=head;entry.entryHash=hash(entry);history.push(entry);head=entry.entryHash;current.set(key,entry);return entry.entryHash;}
 function invalidate(subject,reason='mutation'){
  const affected=ancestors(subject),descendants=new Set([subject]);let changed=true;
  while(changed){changed=false;for(const [child,parent]of parents)if(descendants.has(parent)&&!descendants.has(child)){descendants.add(child);changed=true;}}
  for(const child of descendants)affected.add(child);
  const entries=Array.from(current).filter(([,value])=>affected.has(value.subject));
  if(history.length+entries.length>maxHistory)fail('AGENT_LEDGER_LIMIT');
  for(const [key,value]of entries){const row=Object.assign({},value,{status:value.status==='failed'?'failed':'unknown',invalidatedBy:subject,invalidationReason:reason,supersedes:value.entryHash,event:'invalidation'});delete row.entryHash;delete row.previousHead;append(key,row);}
 }
 function record(row){
  if(!row||row.sourceHash!==sourceHash||row.versionHash!==versionHash||typeof row.subject!=='string'||typeof row.RuleID!=='string'||typeof row.scope!=='string'||!STATUSES.includes(row.status)||row.status!=='unknown'&&row.status!=='not-applicable'&&!(typeof row.evidenceHash==='string'&&/^[a-f0-9]{64}$/.test(row.evidenceHash)))fail('AGENT_LEDGER_EVIDENCE_INVALID');
  if(history.length>=maxHistory)fail('AGENT_LEDGER_LIMIT');
  const key=identity(row),previous=current.get(key),entry=JSON.parse(JSON.stringify(row));
  if(!previous&&current.size>=maxEntries)fail('AGENT_LEDGER_LIMIT');
  // A later local PASS cannot silently erase unresolved failure or uncertainty.
  if(previous&&['failed','unknown'].includes(previous.status)&&row.status==='passed'&&row.supersedes!==previous.entryHash)fail('AGENT_LEDGER_SUPERSESSION_REQUIRED');
  if(row.supersedes&&(!previous||row.supersedes!==previous.entryHash))fail('AGENT_LEDGER_SUPERSESSION_STALE');
  return append(key,entry);
 }
 function reparent(subject,parent){if(subject===parent||ancestors(parent).has(subject))fail('AGENT_LEDGER_PARENT_INVALID');const old=parents.get(subject);invalidate(subject,'before-reparent');parents.set(subject,parent);invalidate(subject,'after-reparent');if(old&&old!==parent)invalidate(old,'child-moved-out');}
 function seed(context,spec,root=spec.root){
  if(seeded)return;scene=JSON.parse(JSON.stringify(spec));rootSubject=root;
  for(const m of (context.authoring?.mappings||[]).concat(context.authoring?.figmaMappingRecords?.semantic?.mappings||[]))componentIds.set(m.id||m.mappingId,m.componentId);
  const declaredParents=new Map();for(const node of spec.nodes)for(const child of (node.children||[]).concat(Object.values(node.slots||{}).flat()))declaredParents.set(child,node.id);
  for(const node of spec.nodes){const parent=declaredParents.get(node.id)||root;if(parent!==node.id)reparent(node.id,parent);}
  for(const c of context.authoring?.contracts||[]){const nodes=spec.nodes.filter(n=>n.kind==='component'&&componentIds.get(n.mappingId)===c.pin.componentId),subjects=nodes.length?nodes.map(n=>n.id):[root+'::dependency:'+c.pin.componentId];
   for(const subject of subjects){if(!nodes.length)reparent(subject,root);for(const rule of c.manual.rules||[])record({sourceHash,versionHash,subject,RuleID:rule.id,scope:'full-norm:'+c.pin.componentId,status:'unknown',evidenceHash:null,componentId:c.pin.componentId,manualSourceHash:c.pin.manualSourceHash||null});}
  }
  seeded=true;
 }
 function address(check,reference=null){
  if(reference)return{subject:reference.screenNodeId,RuleID:reference.RuleID,scope:'full-norm:'+reference.componentId};
  const prefix='Authoritative existing core RuleIR ',end=check.message?.lastIndexOf(': '),RuleID=check.message?.startsWith(prefix)&&end>prefix.length?check.message.slice(prefix.length,end):null;
  const node=RuleID&&scene?.nodes.find(n=>check.id==='rule-ir-'+hash([n.id,RuleID]).slice(0,32));
  return node?{subject:node.id,RuleID,scope:'full-norm:'+componentIds.get(node.mappingId)}:{subject:rootSubject||scene?.root||'screen',RuleID:check.id,scope:'whole-screen-fixed-checker'};
 }
 function modelView(){
  const full=view(),columns=Array.from(new Set(full.entries.flatMap(row=>Object.keys(row)))).filter(key=>key!=='sourceHash'&&key!=='versionHash'),strings=[],indices=new Map();
  const intern=value=>{if(!indices.has(value)){indices.set(value,strings.length);strings.push(value);}return indices.get(value);};
  return{schemaVersion:'apollo.current-evidence-ledger.compact.v1',sourceHash,versionHash,viewHash:full.viewHash,head:full.head,historyCount:full.historyCount,encoding:'Lossless current rows. Columns name each cell; nonnegative integer cells index strings; -1 means absent property; other present non-string values use {value:...}. Restore sourceHash/versionHash from this envelope on every row. entryHash and supersedes reference original immutable entries.',columns,strings,entries:full.entries.map(row=>columns.map(key=>!Object.hasOwn(row,key)?-1:typeof row[key]==='string'?intern(row[key]):{value:row[key]}))};
 }
 function view(){const value={schemaVersion:'apollo.current-evidence-ledger.v1',sourceHash,versionHash,head,entries:Array.from(current.values()),historyCount:history.length};value.viewHash=hash(value);return JSON.parse(JSON.stringify(value));}
 return{modelView,record,invalidate,reparent,seed,address,view,history:()=>JSON.parse(JSON.stringify(history))};
}
module.exports={createEvidenceLedger};
