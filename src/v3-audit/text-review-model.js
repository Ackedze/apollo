'use strict';

const textTabs = [
 {id:'errors',label:'Ошибки'},
 {id:'clarifications',label:'Уточнения'},
 {id:'unchecked',label:'Не проверено'},
];
function textReviewGroups(result,applied={}) {
 const groups={errors:[],clarifications:[],unchecked:[]};
 const pending=(result?.findings||[]).filter(finding=>!Object.prototype.hasOwnProperty.call(applied,finding.nodeId));
 const issues=new Set(pending.filter(f=>f.priority==='error'||f.priority==='warning').map(f=>f.nodeId));
 const skipped=new Map();
 for(const row of result?.unverifiedTexts||[]){
  if(issues.has(row.nodeId)||Object.prototype.hasOwnProperty.call(applied,row.nodeId))continue;
  if(!skipped.has(row.nodeId))skipped.set(row.nodeId,new Set());
  skipped.get(row.nodeId).add(row.reason);
 }
 for(const finding of pending){
  if(finding.priority==='error'||finding.priority==='warning')groups.errors.push(finding);
  else if(!skipped.has(finding.nodeId))groups.clarifications.push(finding);
 }
 for(const [nodeId,reasons]of skipped)groups.unchecked.push({nodeId,reason:[...reasons].join('\n')});
 return groups;
}
function safeReplacement(value) {
 if(typeof value!=='string'||value.length>2000000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value))return false;
 for(const char of value){const code=char.codePointAt(0);if(code>=0xd800&&code<=0xdfff)return false;}
 return true;
}
function validTextReplacements(changes) {
 if(!Array.isArray(changes)||!changes.length||changes.length>10000)return false;
 const ids=new Set();let bytes=0;
 for(const row of changes){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='after,before,focusActionId'||
    typeof row.focusActionId!=='string'||!/^v3-focus-\d+$/.test(row.focusActionId)||ids.has(row.focusActionId)||
    typeof row.before!=='string'||!safeReplacement(row.after))return false;
  ids.add(row.focusActionId);bytes+=row.before.length+row.after.length;if(bytes>2000000)return false;
 }
 return true;
}
function textReplacements(texts,nodeIds){
 if(!texts?.capture?.mutationAvailable||texts.stale)return [];
 const facts=new Map((texts.capture.textReport?.facts?.texts||[]).map(fact=>[fact.node.id,fact.text]));
 const targets=new Map((texts.capture.textTargets||[]).map(target=>[target.nodeId,target.focusActionId]));
 const selected=nodeIds?new Set(nodeIds):null,changes=[];
 for(const finding of texts.result?.findings||[]){
  if(Object.prototype.hasOwnProperty.call(texts.applied||{},finding.nodeId)||typeof finding.replacement!=='string'||selected&&!selected.has(finding.nodeId))continue;
  const before=facts.get(finding.nodeId),focusActionId=targets.get(finding.nodeId);
  const after=Object.prototype.hasOwnProperty.call(texts.drafts||{},finding.nodeId)?texts.drafts[finding.nodeId]:finding.replacement;
  if(typeof before==='string'&&focusActionId&&before!==after)changes.push({focusActionId,before,after});
 }
 return validTextReplacements(changes)?changes:[];
}
function normalizeUnverifiedTexts(rows,nodes,targets){
 if(!Array.isArray(rows)||rows.some(row=>!row||!nodes.has(row.nodeId)||!targets.has(row.nodeId)||typeof row.reason!=='string'||!row.reason.trim()))throw Error('UX_WRITER_RESPONSE_INVALID');
 const byId=new Map();
 for(const row of rows){
  if(!byId.has(row.nodeId))byId.set(row.nodeId,new Set());
  byId.get(row.nodeId).add(row.reason.trim());
 }
 return [...byId].map(([nodeId,reasons])=>({nodeId,reason:[...reasons].join('\n')}));
}
function confirmedTextReplacements(texts,runId,requested,returned){
 const applied=Object.assign({},texts.applied);
 if(texts.runId!==runId||!Array.isArray(returned))return applied;
 const targets=new Map((texts.capture?.textTargets||[]).map(row=>[row.focusActionId,row.nodeId]));
 const expected=new Map(requested.map(row=>[targets.get(row.focusActionId),row.after]));
 for(const row of returned)if(typeof row?.nodeId==='string'&&expected.has(row.nodeId)&&row.text===expected.get(row.nodeId))applied[row.nodeId]=row.text;
 return applied;
}
module.exports={normalizeUnverifiedTexts,confirmedTextReplacements,textTabs,textReviewGroups,safeReplacement,validTextReplacements,textReplacements};
