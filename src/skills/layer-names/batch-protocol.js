const p = require('./protocol');
const SCHEMA = 'apollo.layer-names-batches.v1';
// Local scheduling targets. The agent still receives the unchanged, capped v1 wire.
const TARGET_CANDIDATES = 40, TARGET_BYTES = 60000, MAX_SCOPE = 50000, MAX_BATCHES = 1250;
function bytes(value) {
  let size = 0;
  for (const char of JSON.stringify(value)) { const n = char.codePointAt(0); size += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4; }
  return size;
}
function manifestValid(m) {
  return p.exact(m,['schemaVersion','sessionId','status','pageId','rootIds','scopeName','observedCount','candidateCount','skippedCount','batchCount','completedCount'])
    && m.schemaVersion === SCHEMA && p.string(m.sessionId) && ['capturing','ready'].includes(m.status) && p.string(m.pageId)
    && Array.isArray(m.rootIds) && m.rootIds.length > 0 && m.rootIds.length <= 100 && m.rootIds.every(id=>p.string(id)) && p.string(m.scopeName,2048)
    && ['observedCount','candidateCount','skippedCount'].every(k=>Number.isInteger(m[k]) && m[k]>=0 && m[k]<=MAX_SCOPE)
    && m.candidateCount <= m.observedCount && m.skippedCount <= m.observedCount
    && Number.isInteger(m.batchCount) && m.batchCount >= 0 && m.batchCount <= MAX_BATCHES
    && Number.isInteger(m.completedCount) && m.completedCount >= 0 && m.completedCount <= m.batchCount;
}
module.exports = {SCHEMA,TARGET_CANDIDATES,TARGET_BYTES,MAX_SCOPE,MAX_BATCHES,bytes,manifestValid};
