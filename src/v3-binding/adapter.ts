import { bindingCandidates, createBindingIndex, type Catalogs, type ReferenceCandidate } from "./candidates";
import { applyVariableBindingAction } from "./variableBindingAction";
import { applyStyleBindingAction } from "./styleBindingAction";
import { BindingControlError, type BindingLifecycle } from "./lifecycle";
export function createBindingAdapter(readCatalogs: (context: any, guard: () => void) => Promise<Catalogs>, readReference: (nodeId: string, property: string, context: any, referenceData?: any) => ReferenceCandidate | null = () => null, verifyCatalog: ((sourceIdentity: string, guard: () => void) => Promise<void>) | null = null) {
  let cachedCatalogs: Catalogs | null = null, cachedIndex: ReturnType<typeof createBindingIndex> | null = null;
  return {
    async resolve(observation: any, context: any, guard: () => void, referenceData?: any) {
      const bindings = new Map<string,any[]>();
      const findings = observation.checks.filter((c:any) => c.id === 'customStyles').flatMap((c:any) => c.findings).filter((f:any) => f.status === 'custom-style');
      if (!findings.length) return {bindings,status:{state:'ready',message:''}};
      let catalogs: Catalogs, status = {state:'ready',message:''};
      try { catalogs = await readCatalogs(context,guard); guard(); }
      catch (error) { guard(); catalogs = {tokens:[],styles:[]}; status = {state:'unavailable',message:(error as Error).message === 'CATALOG_TIMEOUT' ? 'Каталог не загрузился вовремя. Повторите проверку.' : 'Каталог токенов и стилей недоступен. Проверьте подключение к Proxy и повторите проверку.'}; }
      if (catalogs !== cachedCatalogs) { cachedIndex = createBindingIndex(catalogs); cachedCatalogs = catalogs; }
      for (const finding of findings) {
        const candidates: any[] = [];
        for (const target of finding.targets) {
          guard();
          const node = observation.nodes.get(target.nodeId); if (!node) continue;
          for (const candidate of bindingCandidates(node,finding.evidence.property,cachedIndex!,readReference(node.id,finding.evidence.property,context,referenceData))) candidates.push(Object.assign({},candidate,{catalogSourceIdentity:catalogs.sourceIdentity || null}));
        }
        bindings.set(finding.findingId,candidates);
      }
      return {bindings,status};
    },
    async apply(action: any, node: SceneNode, lifecycle: BindingLifecycle) {
      if (action.catalogSourceIdentity && verifyCatalog) {await verifyCatalog(action.catalogSourceIdentity,lifecycle.guard);lifecycle.guard();}
      let prepared = false;
      const guardedLifecycle = {guard:lifecycle.guard,onWritten:lifecycle.onWritten,beforeWrite:async()=>{lifecycle.guard();if(!prepared){if(action.catalogSourceIdentity && verifyCatalog)await verifyCatalog(action.catalogSourceIdentity,lifecycle.guard);lifecycle.guard();await lifecycle.beforeWrite();lifecycle.guard();prepared=true;}}};
      let result;
      try { result = action.kind === 'bind-variable' ? await applyVariableBindingAction(action,node,guardedLifecycle) : await applyStyleBindingAction(action,node,guardedLifecycle); }
      catch (error) { throw error instanceof BindingControlError ? error.original : error; }
      lifecycle.guard();
      if (!result.ok) throw Error(result.message);
      if (action.kind === 'bind-variable') {
        const paints = action.styleField === 'fill' ? (node as any).fills : (node as any).strokes;
        const ranges = Array.isArray(paints) ? [paints] : node.type === 'TEXT' && action.styleField === 'fill' ? (node as TextNode).getStyledTextSegments(['fills']).map(s=>s.fills) : [];
        if (!ranges.length || ranges.some(r=>!r.length || r.some((p:any)=>p.type !== 'SOLID' || p.boundVariables?.color?.type !== 'VARIABLE_ALIAS'))) throw Error('ACTION_BIND_NOT_CONFIRMED');
        for (const paints of ranges) for (const paint of paints) {
          const variable = await figma.variables.getVariableByIdAsync(paint.boundVariables.color.id); lifecycle.guard();
          if (variable?.key !== action.targetVariableKey) throw Error('ACTION_BIND_NOT_CONFIRMED');
        }
      } else {
        const property = action.styleField === 'fill' ? 'fillStyleId' : action.styleField === 'stroke' ? 'strokeStyleId' : action.styleField === 'effect' ? 'effectStyleId' : 'textStyleId';
        const styleId = (node as any)[property];
        const style = typeof styleId === 'string' ? await figma.getStyleByIdAsync(styleId) : node.type === 'TEXT' ? await figma.getStyleByIdAsync((node as TextNode).getRangeTextStyleId(0,(node as TextNode).characters.length) as string) : null;
        lifecycle.guard(); if (style?.key !== action.targetStyleKey) throw Error('ACTION_BIND_NOT_CONFIRMED');
      }
      return {verified:true,message:'Библиотечная привязка применена.'};
    },
  };
}
