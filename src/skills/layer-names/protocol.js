const SCHEMA = 'apollo.layer-names.v1';
const MAX_NODES = 3000, MAX_CANDIDATES = 300, MAX_NAME = 160;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
const string = (value, max = 512) => typeof value === 'string' && value.length > 0 && value.length <= max;
const name = value => string(value, MAX_NAME) && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
function preservesEmoji(oldName, newName) {
  const emoji = /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3/gu;
  return Array.from(oldName.matchAll(emoji), match => match[0]).every(value => newName.includes(value));
}
function snapshotValid(value) {
  return exact(value, ['schemaVersion','snapshotId','pageId','rootIds','scopeName','nodes','observedCount','skippedCount'])
    && value.schemaVersion === SCHEMA && string(value.snapshotId) && string(value.pageId) && string(value.scopeName, 2048)
    && Array.isArray(value.rootIds) && value.rootIds.length > 0 && value.rootIds.length <= 100 && value.rootIds.every(id => string(id))
    && Array.isArray(value.nodes) && value.nodes.length <= MAX_CANDIDATES && new Set(value.nodes.map(n => n.nodeId)).size === value.nodes.length
    && value.nodes.every(n => exact(n, ['nodeId','type','parentId','oldName','path','texts']) && string(n.nodeId)
      && string(n.type, 50) && string(n.parentId) && typeof n.oldName === 'string' && n.oldName.length <= 2048
      && typeof n.path === 'string' && n.path.length <= 2048 && Array.isArray(n.texts) && n.texts.length <= 12
      && n.texts.every(t => typeof t === 'string' && t.length <= 160))
    && Number.isInteger(value.observedCount) && value.observedCount >= value.nodes.length && value.observedCount <= MAX_NODES
    && Number.isInteger(value.skippedCount) && value.skippedCount >= 0 && value.skippedCount <= MAX_NODES;
}
function planValid(plan, snapshot) {
  if (!exact(plan, ['changes']) || !Array.isArray(plan.changes) || plan.changes.length > MAX_CANDIDATES || !snapshotValid(snapshot)) return false;
  const nodes = new Map(snapshot.nodes.map(n => [n.nodeId, n])), seen = new Set();
  return plan.changes.every(change => {
    if (!exact(change, ['nodeId','oldName','newName','reason','category']) || seen.has(change.nodeId)) return false;
    seen.add(change.nodeId);
    return nodes.has(change.nodeId) && nodes.get(change.nodeId).oldName === change.oldName && name(change.newName)
      && change.newName !== change.oldName && preservesEmoji(change.oldName,change.newName)
      && !/^SLOT(?:\b|[/:])/iu.test(change.newName) && string(change.reason, 500) && ['recommended','optional'].includes(change.category);
  });
}
const planSchema = {type:'object',additionalProperties:false,required:['changes'],properties:{changes:{type:'array',maxItems:MAX_CANDIDATES,items:{
  type:'object',additionalProperties:false,required:['nodeId','oldName','newName','reason','category'],properties:{
    nodeId:{type:'string'},oldName:{type:'string'},newName:{type:'string',minLength:1,maxLength:MAX_NAME},
    reason:{type:'string',minLength:1,maxLength:500},category:{type:'string',enum:['recommended','optional']}
  }
}}}};
module.exports = {SCHEMA,MAX_NODES,MAX_CANDIDATES,MAX_NAME,exact,string,name,snapshotValid,planValid,planSchema};
