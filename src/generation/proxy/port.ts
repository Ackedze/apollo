import type { GenerationContext, Hash, ScreenSpec } from "../../../packages/generation-core/src/planning";
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
/** Correlated UI/Proxy RPC. No source, readiness or arbitrary URL comes from imported JSON. */
export function createGenerationProxyPort(post: (message: unknown) => void, hash: Hash, timeoutMs = 30000) {
  const pending = new Map<string, Pending>(); let sequence = 0;
  function request(spec: ScreenSpec): Promise<unknown> {
    const requestId = 'generation-context:' + (++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('GENERATION_PROXY_TIMEOUT')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      try { post({ type: 'generation-context-request', requestId, spec }); }
      catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
    });
  }
  function accept(message: any): boolean {
    if (message?.type !== 'generation-context-response') return false;
    const item = pending.get(message.requestId); if (!item) return true;
    clearTimeout(item.timer); pending.delete(message.requestId);
    if (message.error) {
      const code = typeof message.code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(message.code) ? message.code : 'GENERATION_PROXY_UNAVAILABLE';
      item.reject(new Error(code));
    } else item.resolve(message.data);
    return true;
  }
  function invalidate() {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('GENERATION_SESSION_STALE')); }
    pending.clear();
  }
  async function readContext(spec: ScreenSpec): Promise<GenerationContext> {
    const frozen = JSON.parse(JSON.stringify(spec)) as ScreenSpec, specHash = hash(frozen);
    const data: any = await request(frozen);
    if (!data || data.success !== true || data.schemaVersion !== 'apollo.v4-generation-context.v1-experimental'
      || data.specHash !== specHash || !data.context || data.contextHash !== hash(data.context)) throw new Error('GENERATION_PROXY_RESPONSE_INVALID');
    return data.context;
  }
  return { readContext, accept, invalidate };
}
