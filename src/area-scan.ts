const {parallel,boundedRead}=require("./document-audit/reads");
export const AREA_NODE_LIMIT = 10000;
export const AREA_COMPONENT_LIMIT = 1000;
export const AREA_IDENTITY_BUDGET_MS = 15000;
export function selectionSignature(nodes: readonly SceneNode[]) { return nodes.map(node => node.id).sort().join('|'); }

export async function scanArea(selection: readonly SceneNode[], assertCurrent: () => void, observe?: (nodes: Map<string, SceneNode>) => void) {
  const selected = new Set(selection.map(node => node.id));
  const roots = selection.filter(node => {
    let parent = node.parent;
    while (parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT') {
      if (selected.has(parent.id)) return false;
      parent = parent.parent;
    }
    return true;
  });
  const stack = roots.slice().reverse(), visited = new Set<string>();
  const identityReads: (()=>Promise<void>)[] = [];
  const nodes = new Map<string, SceneNode>(), components: any[] = [], topology: any[] = [], issues: string[] = [];
  while (stack.length) {
    assertCurrent();
    const node = stack.pop()!;
    if (visited.has(node.id)) continue;
    if (visited.size >= AREA_NODE_LIMIT) { issues.push('area-node-limit'); break; }
    visited.add(node.id);
    let visible = true, ancestor: BaseNode | null = node;
    while (ancestor && ancestor.type !== 'PAGE' && ancestor.type !== 'DOCUMENT') {
      if ('visible' in ancestor && ancestor.visible === false) { visible = false; break; }
      ancestor = ancestor.parent;
    }
    if (!visible || node.removed) continue;
    nodes.set(node.id, node);
    topology.push([node.id, node.parent?.id, node.type, node.name, node.x, node.y, node.width, node.height]);
    if (node.type === 'INSTANCE' || node.type === 'COMPONENT') {
      if (components.length >= AREA_COMPONENT_LIMIT) {
        if (!issues.includes('area-component-limit')) issues.push('area-component-limit');
      } else {
        const identity:any={nodeId:node.id,name:node.name,type:node.type,componentKey:'',componentSetKey:''};components.push(identity);
        const identityTopology=[node.id,'',''];topology.push(identityTopology);
        identityReads.push(async()=>{
          const started=Date.now(),timeoutMs=Math.max(0,identityDeadline-started);
          let issue='';
          try{
            const main=node.type==='COMPONENT'?node:await boundedRead(()=>node.getMainComponentAsync(),timeoutMs,assertCurrent);
            assertCurrent();identity.componentKey=main?.key||'';identity.componentSetKey=main?.parent?.type==='COMPONENT_SET'?main.parent.key:'';
            identity.componentName=main?.parent?.type==='COMPONENT_SET'?main.parent.name:main?.name||'';
            if(!identity.componentKey&&!identity.componentSetKey){issue='area-identity-unavailable';identity.identityRead={code:'AREA_IDENTITY_UNAVAILABLE',operation:'getMainComponentAsync',elapsedMs:Date.now()-started};}
          }catch(e){
            assertCurrent();const error=typeof (e as Error)?.message==='string'?(e as Error).message:String(e),timedOut=error==='NATIVE_READ_TIMEOUT';
            issue=timedOut?'area-identity-read-timeout':'area-identity-read-failed';
            identity.identityRead={code:timedOut?'AREA_IDENTITY_READ_TIMEOUT':'AREA_IDENTITY_READ_FAILED',operation:'getMainComponentAsync',elapsedMs:Date.now()-started,timeoutMs,error:error.slice(0,500)};
          }
          if(issue&&!issues.includes(issue))issues.push(issue);
          identityTopology[1]=identity.componentKey;identityTopology[2]=identity.componentSetKey;
        });
      }
    }
    if ('children' in node) stack.push(...Array.from(node.children).reverse());
  }
  // Observe the synchronous scene before yielding to library identity reads.
  observe?.(nodes);
  // Cold library sources can take seconds; queued waves share one deadline.
  const identityDeadline=Date.now()+AREA_IDENTITY_BUDGET_MS;
  await parallel(identityReads,12,(read:()=>Promise<void>)=>read());
  return { selection: { roots: roots.map(node => ({ nodeId: node.id, name: node.name, type: node.type })),
    scannedNodes: nodes.size, components, issues, complete: issues.length === 0 }, nodes, topology };
}
