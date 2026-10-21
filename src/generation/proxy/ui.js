// Fixed local endpoint only. Errors retain a bounded machine code, never backend paths/details.
async function resolveGenerationContext(data, send, fetcher = fetch) {
  if (typeof data.requestId !== 'string' || !/^generation-context:[1-9][0-9]{0,15}$/.test(data.requestId)) return;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetcher('http://localhost:3001/generation/context', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({spec:data.spec}), signal:controller.signal,
    });
    let body; try { body = await response.json(); } catch { throw Object.assign(new Error(),{code:response.status===404?'GENERATION_PROXY_ROUTE_UNAVAILABLE':'GENERATION_PROXY_RESPONSE_INVALID'}); }
    if (!response.ok || body.success !== true) {
      const code = typeof body.code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(body.code) ? body.code : response.status===404?'GENERATION_PROXY_ROUTE_UNAVAILABLE':'GENERATION_PROXY_UNAVAILABLE';
      throw Object.assign(new Error(),{code});
    }
    send({type:'generation-context-response',requestId:data.requestId,data:body});
  } catch (error) {
    send({type:'generation-context-response',requestId:data.requestId,error:true,code:error.name==='AbortError'?'GENERATION_PROXY_TIMEOUT':error.code||'GENERATION_PROXY_UNAVAILABLE'});
  } finally { clearTimeout(timer); }
}
module.exports = {resolveGenerationContext};
