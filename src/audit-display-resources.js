const { resourceKey } = require("./resource-identity");
const {collectReferences}=require("./v3-binding/resource-labels");
const DISPLAY_SCHEMA = 'apollo.audit-display-metadata.v1';

/** Read-only display sidecar. Never adds facts, imports resources or changes evaluation. */
async function collectAuditDisplayMetadata(api, report, { timeoutMs = 300, budgetMs = 1000, now = Date.now, resolveNames = null, resolveModeNames = null } = {}) {
  const deadline = now() + budgetMs;
  const batch=collectReferences(report),rows=batch.references,resources=[],collections=new Map();
  async function bounded(read,limit=timeoutMs) {
    const remaining = deadline - now();
    if (remaining <= 0) return null;
    let timer;
    try { return await Promise.race([Promise.resolve().then(read), new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.min(limit, remaining)); })]); }
    catch { return null; }
    finally { clearTimeout(timer); }
  }
  async function read({ kind, id }) {
    const host = kind === 'token' ? api.variables : api;
    const method = kind === 'token' ? 'getVariableByIdAsync' : 'getStyleByIdAsync';
    const fallback = kind === 'token' ? 'getVariableById' : 'getStyleById';
    const item = await bounded(() => typeof host?.[method] === 'function' ? host[method](id)
      : typeof host?.[fallback] === 'function' ? host[fallback](id) : null);
    const key = resourceKey(kind, id);
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 500
      || key && typeof item.key==='string' && /^[a-f0-9]{40}$/i.test(item.key) && item.key.toLowerCase()!==key
      || item.id !== id && (!key || typeof item.key !== 'string' || item.key.toLowerCase() !== key)) return;
    let collectionName = null;
    if (kind === 'token' && typeof item.variableCollectionId === 'string') {
      const collectionId = item.variableCollectionId;
      if (!collections.has(collectionId)) collections.set(collectionId, bounded(() => api.variables?.getVariableCollectionByIdAsync?.(collectionId)));
      const collection = await collections.get(collectionId);
      if (collection?.id === collectionId && typeof collection.name === 'string' && collection.name.length <= 500) collectionName = collection.name.trim() || null;
    }
    resources.push({ kind, id, key: typeof item.key === 'string' && /^[a-f0-9]{40}$/i.test(item.key) ? item.key.toLowerCase() : key,
      name: item.name.trim(), collectionName, origin: 'native-document' });
  }
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(8, rows.length) }, async () => { while (index < rows.length && now() < deadline) await read(rows[index++]); }));
  let catalogStates=[];
  if(resolveNames&&now()<deadline){
    const keyed=Array.from(new Map(rows.map(ref=>{const native=resources.find(r=>r.kind===ref.kind&&r.id===ref.id),key=resourceKey(ref.kind,ref.id)||native?.key;return[key?ref.kind+':'+key:null,key?{kind:ref.kind,key}:null];}).filter(([key])=>key)).values());
    const catalog=keyed.length?await bounded(()=>resolveNames(keyed,Math.max(0,deadline-now())),deadline-now()):null;
    if(catalog&&Array.isArray(catalog.resources)){
      catalogStates=catalog.resources.filter(r=>['token','style'].includes(r.kind)&&/^[a-f0-9]{40}$/.test(r.key)&&['resolved','ambiguous','unavailable','not-packaged'].includes(r.state));
      for(const r of catalogStates)if(r.state==='resolved'&&typeof r.name==='string'&&r.name&&r.name.length<=500)resources.push({kind:r.kind,id:r.kind==='token'?'VariableID:'+r.key:'S:'+r.key,key:r.key,name:r.name,collectionName:r.collectionName||null,origin:'catalog-export',sourcePins:r.sourcePins,contentVersion:catalog.contentVersion});
    }
  }
  resources.sort((a, b) => (a.kind + ':' + a.id).localeCompare(b.kind + ':' + b.id));
  const modes = collectModeMetadata(report);
  if (resolveModeNames && now() < deadline) {
    const exported = await bounded(() => resolveModeNames(modes.keys));
    for (const row of Array.isArray(exported) ? exported : []) if (modes.keys.includes(row.key) && validModeCollection(row)) modes.rows.push(row);
  }
  return { schemaVersion: DISPLAY_SCHEMA, resources, catalogStates, modeCollections:modes.rows, requested: rows.length, unresolved: rows.filter(ref=>!resources.some(r=>r.kind===ref.kind&&(r.id===ref.id||resourceKey(ref.kind,ref.id)&&r.key===resourceKey(ref.kind,ref.id)))).length, truncated:batch.truncated || modes.truncated };
}
function validModeCollection(row) {
  return /^[a-f0-9]{40}$/.test(row?.key) && typeof row.name === 'string' && row.name.trim() && row.name.length <= 500
    && Array.isArray(row.modes) && row.modes.length <= 256 && row.modes.every(mode => typeof mode.modeId === 'string' && mode.modeId.length <= 300 && typeof mode.name === 'string' && mode.name.trim() && mode.name.length <= 500);
}
function collectModeMetadata(report) {
  const keys = new Set(), rows = new Map(); let visited = 0, truncated = false;
  function visit(value, depth = 0) {
    if (++visited > 50000 || depth > 32) { truncated = true; return; }
    if (typeof value === 'string') { const match = /^variable\.modes\.([a-f0-9]{40})$/i.exec(value); if (match && keys.size < 128) keys.add(match[1].toLowerCase()); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, collection] of Object.entries(value.modeCatalog || {})) {
      const row = {key:key.toLowerCase(), name:collection?.collectionName, modes:collection?.modes, origin:'native-snapshot'};
      if (validModeCollection(row) && keys.size < 128) { keys.add(row.key); rows.set(JSON.stringify(row), row); }
    }
    for (const child of Object.values(value)) visit(child, depth + 1);
  }
  visit(report); return {keys:Array.from(keys), rows:Array.from(rows.values()), truncated};
}
module.exports = { collectAuditDisplayMetadata, DISPLAY_SCHEMA };
