const routes = {
  names: '/v2/resources/display-names', resolve: '/v2/resources/display-names/resolve',
  inventory: '/v1/style-token-catalog/inventory', catalogs: '/v1/style-token-catalog/catalogs', query: '/v1/style-token-catalog/query',
};
function createCatalogPort(post) {
  const pending = new Map(); let sequence = 0;
  function read(operation, body, budgetMs = 1000) {
    if (!Object.hasOwn(routes, operation) || !Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > (operation === 'catalogs' ? 10000 : 1000)) return Promise.reject(Error('CATALOG_UNAVAILABLE'));
    const requestId = 'v3-catalog:' + ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); post({type:'v3-catalog-cancel',requestId}); reject(Error('CATALOG_TIMEOUT')); }, budgetMs);
      pending.set(requestId, {resolve, reject, timer});
      try { post({type:'v3-catalog-request',requestId,operation,body:body || null,budgetMs}); }
      catch (e) { clearTimeout(timer); pending.delete(requestId); reject(e); }
    });
  }
  function accept(m) {
    if (m?.type !== 'v3-catalog-response') return false;
    const ticket = pending.get(m.requestId); if (!ticket) return true;
    clearTimeout(ticket.timer); pending.delete(m.requestId);
    if (Object.keys(m).sort().join(',') !== 'data,error,requestId,type' || m.error !== null) ticket.reject(Error('CATALOG_UNAVAILABLE'));
    else ticket.resolve(m.data);
    return true;
  }
  return {read, accept};
}
function createCatalogTransport(send, fetcher = fetch) {
  const active = new Map();
  async function accept(m) {
    if (!['v3-catalog-request','v3-catalog-cancel'].includes(m?.type)) return false;
    if (!/^v3-catalog:[1-9][0-9]{0,15}$/.test(m.requestId)) return true;
    if (m.type === 'v3-catalog-cancel') { active.get(m.requestId)?.abort(); return true; }
    if (active.has(m.requestId) || Object.keys(m).sort().join(',') !== 'body,budgetMs,operation,requestId,type' || !Object.hasOwn(routes,m.operation)
      || !Number.isFinite(m.budgetMs) || m.budgetMs <= 0 || m.budgetMs > (m.operation === 'catalogs' ? 10000 : 1000)) return true;
    const abort = new AbortController(); active.set(m.requestId,abort);
    const timer = setTimeout(() => abort.abort(),m.budgetMs);
    try {
      const options = {signal:abort.signal,redirect:'error'};
      if (['query','resolve','catalogs'].includes(m.operation)){const body=JSON.stringify(m.body);if(new TextEncoder().encode(body).length>65536)throw Error('CATALOG_UNAVAILABLE');Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body});}
      const response = await fetcher('http://localhost:3001' + routes[m.operation],options);
      const limit = (m.operation === 'catalogs' ? 8 : 4) * 1024 * 1024;
      if (!response.ok || Number(response.headers?.get('content-length')) > limit) throw Error('CATALOG_UNAVAILABLE');
      let raw;
      if (response.body?.getReader) {
        const reader=response.body.getReader(),chunks=[];let bytes=0;
        while (true) {const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>limit){abort.abort();void reader.cancel();throw Error('CATALOG_UNAVAILABLE');}chunks.push(chunk.value);}
        const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}raw=new TextDecoder().decode(data);
      } else {raw=await response.text();if(new TextEncoder().encode(raw).length>limit)throw Error('CATALOG_UNAVAILABLE');} 
      send({type:'v3-catalog-response',requestId:m.requestId,data:JSON.parse(raw),error:null});
    } catch (_) { send({type:'v3-catalog-response',requestId:m.requestId,data:null,error:'CATALOG_UNAVAILABLE'}); }
    finally { clearTimeout(timer); active.delete(m.requestId); }
    return true;
  }
  return {accept};
}
module.exports = {createCatalogPort,createCatalogTransport};
