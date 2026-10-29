'use strict';
const SCHEMA = 'apollo.local-operation.v1';
const KINDS = new Set(['check','recheck','reglyph-scan','reglyph-replace','layer-names-run','layer-names-apply','layer-names-undo','pattern-check']);
const HYBRID = new Set(['layer-names-run','pattern-check']);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');
function valid(value) {
  return exact(value,['id','operation','startedAt','durationMs','status','usageMode']) && typeof value.id === 'string' && /^[a-zA-Z0-9:_-]{1,150}$/.test(value.id)
    && KINDS.has(value.operation) && typeof value.startedAt === 'string' && value.startedAt.length <= 40 && Number.isFinite(Date.parse(value.startedAt))
    && ['running','completed','failed','cancelled','interrupted'].includes(value.status)
    && (value.durationMs === null ? ['running','interrupted'].includes(value.status) : Number.isSafeInteger(value.durationMs) && value.durationMs >= 0 && value.durationMs <= 86400000)
    && (value.usageMode === 'none' || value.usageMode === 'separate' && HYBRID.has(value.operation));
}
const same = (a,b) => ['id','operation','startedAt','durationMs','status','usageMode'].every(key=>a?.[key]===b?.[key]);
const follows = (a,b) => valid(a) && valid(b) && a.id===b.id && a.operation===b.operation && a.startedAt===b.startedAt
  && (same(a,b) || a.status==='running' && (a.usageMode===b.usageMode || a.usageMode==='none' && b.usageMode==='separate'));
function activity(start,kind) { try { return start(kind); } catch (_) { return null; } }
module.exports={SCHEMA,KINDS,HYBRID,exact,valid,same,follows,activity};
