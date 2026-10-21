import { createCompositionPlan, preflightPlan, validateScreenSpec, generationErrorCode } from "../../packages/generation-core/src/planning";
import type { CompositionPlan, Diagnostic, GenerationContext, Hash, Preflight, ScreenSpec, Target, TargetReceipt } from "../../packages/generation-core/src/planning";
import { executeFigma } from "../../packages/adapter-figma/src";
import type { FigmaHost } from "../../packages/adapter-figma/src";
import { executeFrontend } from "../../packages/adapter-frontend/src";
import type { FrontendHost } from "../../packages/adapter-frontend/src";
export type GenerationResult = {
  schemaVersion: 'apollo.v4-generation-session.v1-experimental'; sessionId: string;
  status: 'blocked' | 'prepared' | 'completed'; schemaAccepted: boolean;
  apiAvailability: 'confirmed' | 'blocked' | 'unverified'; sourceReadiness: 'ready' | 'blocked' | 'unverified';
  plan: CompositionPlan | null; preflight: Preflight | null;
  executionPorts: Record<Target, 'available' | 'unavailable'>;
  receipts: TargetReceipt[]; diagnostics: Diagnostic[];
};
export type GenerationPorts = {
  hash: Hash;
  /** Trusted canonical source / fresh Code Connect checkout projection from
   * Proxy or an approved local provider. Imported prompt JSON is not evidence. */
  readContext(spec: ScreenSpec): Promise<GenerationContext>;
  figma?: FigmaHost;
  /** This port executes outside the Plugin API sandbox, through Proxy. */
  frontend?: FrontendHost;
};
export class GenerationController {
  private revision = 0;
  private current: GenerationResult | null = null;
  private busy = false;
  constructor(private ports: GenerationPorts) {}
  invalidate() { this.revision++; this.current = null; }
  async prepare(input: unknown): Promise<GenerationResult> {
    if (this.busy) throw new Error('GENERATION_BUSY');
    const revision = ++this.revision; this.current = null;
    const result: GenerationResult = { schemaVersion: 'apollo.v4-generation-session.v1-experimental',sessionId: '',status: 'blocked',
      schemaAccepted: false, apiAvailability: 'unverified',sourceReadiness: 'unverified',plan: null,preflight: null,
      executionPorts: {figma:this.ports.figma?'available':'unavailable',frontend:this.ports.frontend?'available':'unavailable'},receipts: [],diagnostics: [] };
    result.diagnostics = validateScreenSpec(input); result.schemaAccepted = !result.diagnostics.length;
    if (!result.schemaAccepted) return result;
    // Copy before the asynchronous context request; no borrowed mutable spec.
    const spec = JSON.parse(JSON.stringify(input)) as ScreenSpec;
    try {
      const context = await this.ports.readContext(spec);
      if (revision !== this.revision) throw new Error('GENERATION_SESSION_STALE');
      const plan = createCompositionPlan(spec,context,this.ports.hash), preflight = preflightPlan(plan,context,this.ports.hash);
      result.plan = plan; result.preflight = preflight; result.apiAvailability = preflight.apiAvailability;
      result.sourceReadiness = preflight.sourceReadiness; result.diagnostics = preflight.diagnostics;
      result.status = Object.values(preflight.targets).includes('prepared') ? 'prepared' : 'blocked';
      result.sessionId = this.ports.hash({planHash:preflight.planHash,revision});
      this.current = result;
    } catch (error) {
      const code = generationErrorCode(error,'GENERATION_INPUTS_UNAVAILABLE');
      if (code === 'SOURCE_COMPILE') result.sourceReadiness = 'blocked';
      if (code === 'MAPPING_MISSING') result.apiAvailability = 'blocked';
      result.diagnostics.push({code,stage:code === 'SOURCE_COMPILE'?'source':code === 'MAPPING_MISSING'?'availability':'preflight',message:'Trusted contract and code inputs are unavailable; no target was created.'});
    }
    return result;
  }
  async execute(sessionId: string, targets: Target[]): Promise<GenerationResult> {
    if (this.busy) throw new Error('GENERATION_BUSY');
    const current = this.current, revision = this.revision;
    if (!current || !current.plan || current.sessionId !== sessionId || !targets.length || new Set(targets).size !== targets.length || targets.some(t=>!['figma','frontend'].includes(t))) throw new Error('GENERATION_SESSION_STALE');
    this.busy = true;
    try {
      const assertCurrent = () => { if (revision !== this.revision) throw new Error('GENERATION_SESSION_STALE'); };
      const scopedHost = <T>(host: T, methods: string[]): T => {
        const scoped: Record<string, unknown> = {};
        for (const method of methods) {
          if (typeof (host as Record<string,unknown>)[method] !== 'function') continue;
          if(method==='artifact'||method==='transactionProvenance'){scoped[method]=()=> {if(method==='artifact')assertCurrent();return (host as Record<string,()=>unknown>)[method]();};continue;}
          scoped[method] = async (...args: unknown[]) => {
          if (method !== 'rollback' && method !== 'transactionProvenance') assertCurrent();
          const result = await (host as Record<string, (...args: unknown[]) => unknown>)[method](...args);
          if (method !== 'rollback' && method !== 'transactionProvenance') assertCurrent();
          return result;
          };
        }
        return scoped as T;
      };
      const context = await this.ports.readContext(current.plan.spec), preflight = preflightPlan(current.plan,context,this.ports.hash);
      if (revision !== this.revision) throw new Error('GENERATION_SESSION_STALE');
      const receipts: TargetReceipt[] = [];
      for (const target of targets) {
        if (preflight.targets[target] === 'blocked' || !this.ports[target]) {
          receipts.push({schemaVersion:'apollo.generation-target-receipt.v1-experimental',target,planHash:this.ports.hash(current.plan),pins:current.plan.pins,
            status:'blocked',provenance:[],verification:'not-run',rollback:'not-needed',diagnostics:preflight.targets[target] === 'blocked'?preflight.diagnostics.filter(d=>!d.target||d.target===target):[
              {code:target==='figma'?'FIGMA_HOST_UNAVAILABLE':'FRONTEND_HOST_UNAVAILABLE',stage:'execution',target,message:'The target execution port is not configured.'}]
          });
        } else receipts.push(target==='figma'
          ? await executeFigma(current.plan,this.ports.hash,scopedHost(this.ports.figma!,['readContext','resolve','assertResolved','begin','createInstance','createPrimitive','append','fillNativeSlot','fillOwnedActions','bindEvents','captureAndVerify','rollback','transactionProvenance']))
          : await executeFrontend(current.plan,this.ports.hash,scopedHost(this.ports.frontend!,['readContext','prepare','create','verify','rollback','executeRemote','transactionProvenance','artifact'])));
      }
      const invalidated = revision !== this.revision;
      const result = Object.assign({},current,{preflight,receipts,diagnostics:preflight.diagnostics,apiAvailability:preflight.apiAvailability,sourceReadiness:preflight.sourceReadiness,
        status:!invalidated && receipts.every(r=>r.status==='created'||r.status==='verified')?'completed' as const:'blocked' as const});
      if (invalidated) result.diagnostics = result.diagnostics.concat([{code:'GENERATION_SESSION_STALE',stage:'execution',message:'The prepared session was invalidated during execution.'}]);
      this.current = null; // receipt consumes preparation; repeat requires fresh inputs
      return result;
    } finally { this.busy = false; }
  }
}
