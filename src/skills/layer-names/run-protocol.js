const WIRE_VERSION='0.2.0',WIRE_SHA256='39d607e1ab17ef895cf43c512f88e3e8ef8ab7d458caa846cd749205ff291d36';
module.exports = function runProtocol(base) {
  if (base.SCHEMA!=='apollo.layer-names.v1') throw Error('LAYER_NAMES_WIRE_INCOMPATIBLE');
  const {MAX_NODES,MAX_CANDIDATES,exact,string,snapshotValid,planValid,planSchema}=base;
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const RUN_SCHEMA='apollo.layer-names-run.v1',MAX_CONTEXT_NODES=24;
function contextValid(value, snapshot, nodeIds) {
  if (!snapshotValid(snapshot) || !exact(value,['snapshotId','nodes']) || value.snapshotId !== snapshot.snapshotId || !Array.isArray(value.nodes)
    || !Array.isArray(nodeIds) || !nodeIds.length || nodeIds.length > MAX_CONTEXT_NODES || new Set(nodeIds).size !== nodeIds.length
    || value.nodes.length !== nodeIds.length) return false;
  const candidates = new Map(snapshot.nodes.map(n=>[n.nodeId,n])), seen = new Set();
  return value.nodes.every(n=>{
    if (!object(n)) return false;
    const source = candidates.get(n.nodeId);
    if (!source || !nodeIds.includes(n.nodeId) || seen.has(n.nodeId)) return false;
    seen.add(n.nodeId);
    return exact(n,['nodeId','type','parentId','oldName','path','texts','layoutMode','geometry','childTypes'])
      && ['type','parentId','oldName','path'].every(k=>n[k]===source[k]) && JSON.stringify(n.texts)===JSON.stringify(source.texts)
      && (n.layoutMode===null || string(n.layoutMode,50)) && Array.isArray(n.geometry) && n.geometry.length===4
      && n.geometry.every(v=>v===null || typeof v==='number' && Number.isFinite(v))
      && Array.isArray(n.childTypes) && n.childTypes.length<=64 && n.childTypes.every(object) && new Set(n.childTypes.map(v=>v.type)).size===n.childTypes.length
      && n.childTypes.every(v=>exact(v,['type','count']) && string(v.type,50) && Number.isSafeInteger(v.count) && v.count>0 && v.count<=MAX_NODES);
  });
}
const stepSchema = {type:'object',additionalProperties:false,required:['action','nodeIds','changes'],properties:{
  action:{type:'string',enum:['read_nodes','finish']},nodeIds:{type:'array',maxItems:MAX_CONTEXT_NODES,items:{type:'string'}},changes:planSchema.properties.changes
}};
function stepValid(value,snapshot) {
  if (!exact(value,['action','nodeIds','changes']) || !Array.isArray(value.nodeIds) || !Array.isArray(value.changes)) return false;
  if (value.action==='finish') return !value.nodeIds.length && planValid({changes:value.changes},snapshot);
  return value.action==='read_nodes' && !value.changes.length && value.nodeIds.length>0 && value.nodeIds.length<=MAX_CONTEXT_NODES
    && new Set(value.nodeIds).size===value.nodeIds.length && value.nodeIds.every(id=>snapshot.nodes.some(n=>n.nodeId===id));
}
function runValid(value,snapshot,requestId,runId=null) {
  if (!exact(value,['schemaVersion','requestId','runId','snapshotId','status','step','readCount','pending','plan','error','skill','wire'])
    || value.schemaVersion!==RUN_SCHEMA || value.requestId!==requestId || value.snapshotId!==snapshot.snapshotId
    || !exact(value.wire,['version','sha256']) || value.wire.version!==WIRE_VERSION || value.wire.sha256!==WIRE_SHA256
    || !/^[a-f0-9-]{36}$/.test(value.runId) || runId!==null && value.runId!==runId
    || !['running','awaiting-context','completed','failed','cancelled'].includes(value.status)
    || !Number.isInteger(value.step) || value.step<0 || value.step>8 || !Number.isInteger(value.readCount) || value.readCount<0 || value.readCount>MAX_CANDIDATES
    || !exact(value.skill,['name','version','sha256']) || value.skill.name!=='figma-layer-name-hygiene'
    || !/^\d+\.\d+\.\d+$/.test(value.skill.version) || !/^[a-f0-9]{64}$/.test(value.skill.sha256)) return false;
  if (value.status==='awaiting-context') {
    if (!exact(value.pending,['callId','nodeIds']) || !string(value.pending.callId,100)
      || !stepValid({action:'read_nodes',nodeIds:value.pending.nodeIds,changes:[]},snapshot)) return false;
  } else if (value.pending!==null) return false;
  if (value.status==='completed' ? !planValid(value.plan,snapshot) : value.plan!==null) return false;
  return ['failed','cancelled'].includes(value.status)
    ? exact(value.error,['code','message']) && string(value.error.code,100) && typeof value.error.message==='string' && value.error.message.length<=2048
    : value.error===null;
}
  return Object.assign({},base,{RUN_SCHEMA,MAX_CONTEXT_NODES,WIRE_VERSION,WIRE_SHA256,contextValid,stepSchema,stepValid,runValid});
};
module.exports.wire={version:WIRE_VERSION,sha256:WIRE_SHA256};
