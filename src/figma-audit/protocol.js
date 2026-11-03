'use strict';
// Transport validation only. Design-system rules are supplied by DSI Hub.
const VERSION='apollo.figma-audit.v1';
const MAX_NODES=1000,MAX_BYTES=400000,MAX_READ=12;
const STATUSES=['PASS','FAIL','UNKNOWN','NOT_CHECKED','NOT_APPLICABLE'];
const string=(v,max=2048)=>typeof v==='string'&&v.length>0&&v.length<=max;
const list=(v,max=MAX_NODES)=>Array.isArray(v)&&v.length<=max;
const unique=v=>new Set(v).size===v.length;
function byteLength(text){let size=0;for(const c of text){const n=c.codePointAt(0);size+=n<128?1:n<2048?2:n<65536?3:4;}return size;}
function snapshotValid(v){return v?.version===VERSION&&string(v.snapshotId,120)&&string(v.pageId,120)&&list(v.rootIds,100)&&v.rootIds.length>0&&unique(v.rootIds)&&v.rootIds.every(id=>string(id,120))&&list(v.nodes)&&v.nodes.length>0&&unique(v.nodes.map(n=>n.id))&&v.nodes.every(n=>string(n.id,120)&&string(n.name)&&string(n.type,64))&&v.rootIds.every(id=>v.nodes.some(n=>n.id===id));}
function coverage(checks){const counts=Object.fromEntries(STATUSES.map(s=>[s,0]));for(const c of checks)counts[c.status]++;const applicable=checks.length-counts.NOT_APPLICABLE,decisive=counts.PASS+counts.FAIL;return {counts,applicable,decisive,percent:applicable?Math.round(1000*decisive/applicable)/10:null,basis:'declared-rule-targets; not all Hub knowledge'};}
function reportValid(report,snapshot){return report?.version===VERSION&&report.snapshotId===snapshot.snapshotId&&list(report.checks,2000)&&report.checks.every(c=>STATUSES.includes(c.status)&&string(c.id,120)&&string(c.sourceId)&&list(c.targets)&&c.targets.length>0&&c.targets.every(id=>snapshot.nodes.some(n=>n.id===id)))&&unique(report.checks.map(c=>c.id));}
module.exports={VERSION,MAX_NODES,MAX_BYTES,MAX_READ,STATUSES,string,list,unique,byteLength,snapshotValid,coverage,reportValid};
