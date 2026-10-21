import type { Diagnostic } from "../../../packages/generation-core/src/planning";
import type { FigmaRollbackOutcome } from "../../../packages/adapter-figma/src";

type Parent = BaseNode & ChildrenMixin;
type Position = { parent: Parent | null; index: number; order: string[]; relative: Transform; absolute: Transform; parentAbsolute: Transform | null };
type Entry = { node: SceneNode; original: Position | null; expected: Position | null; anchors: SceneNode[]; drift: boolean };
const limit = 5000;
function matrix(value: Transform): Transform {
  if (!Array.isArray(value) || value.length !== 2 || value.some(row => row.length !== 3 || row.some(n => !Number.isFinite(n)))) throw Error('FIGMA_ROLLBACK_TRANSFORM_UNREADABLE');
  return [[value[0][0],value[0][1],value[0][2]],[value[1][0],value[1][1],value[1][2]]];
}
function same(a: unknown,b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
/** Journal only existing transaction-owned boundaries. Foreign subtrees are opaque.
 * Async/external drift never grants authority to restore an earlier relationship. */
export function createNativeRollbackJournal(owned: Map<string,SceneNode>, roots: () => SceneNode[]) {
  const entries = new Map<string,Entry>();
  let activeWrites = 0, recovering = false, last: FigmaRollbackOutcome | null = null;
  function scopeRoots():SceneNode[] {
    const result=roots().slice(),ids=new Set(result.map(n=>n.id));
    for(const n of owned.values())if(!n.removed&&!ids.has(n.id)&&(!n.parent||n.parent.removed||!owned.has(n.parent.id))){result.push(n);ids.add(n.id);}
    return result;
  }
  function position(n: SceneNode): Position {
    if (n.removed) throw Error('FIGMA_ROLLBACK_NODE_REMOVED');
    const parent = n.parent;
    // Only known transaction parents and the immediate page sibling list are read.
    if (parent && parent.type !== 'PAGE' && !owned.has(parent.id)) throw Error('FIGMA_ROLLBACK_PARENT_OUTSIDE_JOURNAL');
    if (!parent || parent.removed || !('children' in parent)) throw Error('FIGMA_ROLLBACK_PARENT_UNAVAILABLE');
    const children = Array.from(parent.children);
    if (children.length > limit || new Set(children.map(c=>c.id)).size !== children.length) throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
    const index = children.indexOf(n);
    if (index < 0) throw Error('FIGMA_ROLLBACK_PARENT_UNAVAILABLE');
    return {parent,index,order:children.map(c=>c.id),relative:matrix(n.relativeTransform),absolute:matrix(n.absoluteTransform),parentAbsolute:'absoluteTransform' in parent?matrix(parent.absoluteTransform):null};
  }
  function equal(a: Position,b: Position) {
    return a.parent === b.parent && a.index === b.index && same(a.order,b.order) && same(a.relative,b.relative) && same(a.absolute,b.absolute);
  }
  function anchors(n:SceneNode):SceneNode[] {
    const result=new Map<string,SceneNode>(),seen=new Set<string>();let p=n.parent;
    while(p&&owned.has(p.id)){
      if(p.removed||seen.has(p.id)||seen.size>=limit||!('children' in p))throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
      seen.add(p.id);result.set(p.id,owned.get(p.id)!);
      const children=Array.from(p.children);if(children.length>limit)throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
      for(const child of children)if(owned.has(child.id))result.set(child.id,child);
      if(result.size>limit)throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');p=p.parent;
    }
    return Array.from(result.values());
  }
  function opaqueAncestor(n: SceneNode) {
    const seen = new Set<string>(); let p = n.parent;
    while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
      if (seen.has(p.id) || seen.size >= limit) throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
      seen.add(p.id); if (!owned.has(p.id)) return true; p = p.parent;
    }
    return false;
  }
  function boundaries(): SceneNode[] {
    const foreign: SceneNode[] = [], seen = new Set<string>(), active = new Set<string>();
    function walk(n: SceneNode) {
      if (n.removed) return;
      if (!owned.has(n.id)) { if (!foreign.some(f=>f===n)) foreign.push(n); return; }
      if (active.has(n.id)) throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
      if (seen.has(n.id)) return;
      seen.add(n.id); active.add(n.id);
      if (seen.size + foreign.length > limit) throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
      if ('children' in n) {
        const children = Array.from(n.children);
        if (children.length > limit) throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
        for (const child of children) walk(child);
      }
      active.delete(n.id);
    }
    for (const n of scopeRoots()) if (!n.removed && !opaqueAncestor(n)) walk(n);
    return foreign;
  }
  function containsForeign(root: SceneNode): boolean {
    const seen=new Set<string>();let foreign=false;
    function walk(n:SceneNode) {
      if(!owned.has(n.id)){foreign=true;return;}
      if(n.removed||seen.has(n.id)||seen.size>=limit)throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
      seen.add(n.id);
      if('children' in n){
        const children=Array.from(n.children);if(children.length>limit)throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
        for(const child of children){
          if(owned.has(child.id)&&child.parent!==n)throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
          walk(child);
        }
      }
    }
    walk(root);return foreign;
  }
  function discover(known: boolean) {
    for (const n of boundaries()) if (!entries.has(n.id)) {
      const p = position(n); entries.set(n.id,{node:n,original:known?p:null,expected:p,anchors:known?anchors(n):[],drift:false});
    }
  }
  function checkExpected() {
    for (const e of entries.values()) {
      if (e.node.removed) {e.drift=true;continue;}
      try {if (!e.expected || !equal(position(e.node),e.expected)) e.drift=true;} catch {e.drift=true;}
    }
  }
  async function write<T>(fn: () => T | Promise<T>): Promise<T> {
    if (activeWrites || recovering) throw Error('FIGMA_NATIVE_WRITE_BUSY');
    checkExpected(); discover(true); activeWrites++;
    const before = new Map<string,Position>();
    for (const [id,e] of entries) if (!e.node.removed && !e.drift && e.expected) before.set(id,e.expected);
    let synchronous = true;
    function after() {
      try {
        discover(false);
        for (const [id,e] of entries) {
          if (e.node.removed) {e.drift=true;continue;}
          try {
            const p = position(e.node), previous = before.get(id);
            if (!synchronous && previous && !equal(p,previous)) e.drift=true;
            e.expected=p;
          } catch {e.drift=true;}
        }
      } catch { for (const e of entries.values()) e.drift=true; }
    }
    try {
      const result = fn();
      if (result && typeof (result as Promise<T>).then === 'function') {
        synchronous=false; after();
        try {return await result;} finally {after();}
      }
      after(); return result;
    } catch (error) { after(); throw error; }
    finally {activeWrites--;}
  }
  function rollback(): FigmaRollbackOutcome {
    if (!activeWrites && !Array.from(owned.values()).some(n=>!n.removed) && last) return last;
    const diagnostics: Diagnostic[] = [];
    let incomplete = false;
    function note(code:string,message:string,id?:string) {
      if (!diagnostics.some(d=>d.code===code&&d.nodeId===id)) diagnostics.push({code,stage:'execution',target:'figma',nodeId:id,message});
    }
    if (activeWrites || recovering) return {status:'incomplete',diagnostics:[{code:'FIGMA_ROLLBACK_WRITE_ACTIVE',stage:'execution',target:'figma',message:'Rollback cannot delete nodes while a transaction write is still active; retry after it settles.'}]};
    recovering=true;
    try {
      checkExpected(); discover(false);
      const pendingParents: Parent[] = [];
      const relationshipAnchors: BaseNode[]=[],restoredEntries:Entry[]=[];
      // Removing a generated sibling after restoration would change the foreign
      // node's journalled order. Retain those exact anchors as well as its parent.
      for(const e of entries.values())if(e.original&&!e.drift&&!e.node.removed){
        for(const anchor of e.anchors)if(!anchor.removed)relationshipAnchors.push(anchor);
        if(e.original.parent&&!e.original.parent.removed)relationshipAnchors.push(e.original.parent);
        for(const id of e.original.order){const anchor=owned.get(id);if(anchor&&!anchor.removed)relationshipAnchors.push(anchor);}
      }
      const restoring = new Set(Array.from(entries.values()).filter(e=>e.original&&!e.drift&&!e.node.removed).map(e=>e.node.id));
      const ordered = Array.from(entries.values()).sort((a,b)=>(a.original?.index||0)-(b.original?.index||0));
      for (const e of ordered) {
        const n=e.node, original=e.original;
        if (n.removed) {incomplete=true;note('FIGMA_ROLLBACK_FOREIGN_DRIFT','Foreign content was removed outside the journal; rollback does not recreate or overwrite the user change.',n.id);continue;}
        if (!original || e.drift) {
          incomplete=true;note(e.drift?'FIGMA_ROLLBACK_FOREIGN_DRIFT':'FIGMA_ROLLBACK_FOREIGN_PRESERVED',e.drift?'Foreign relationship/transform changed outside a synchronous journalled write. Preserve its current state; exact restoration is unconfirmed.':'Foreign original relationship is unknown. Content is preserved in place with its current parent, order and transform; this is not exact restoration.',n.id);continue;
        }
        try {
          const current=position(n);
          if (!e.expected || !equal(current,e.expected)) throw Error('FIGMA_ROLLBACK_FOREIGN_DRIFT');
          const parent=original.parent;
          if (!parent || parent.removed || typeof parent.insertChild!=='function') throw Error('FIGMA_ROLLBACK_PARENT_UNAVAILABLE');
          const siblings=Array.from(parent.children);
          if (siblings.length>limit || !same(siblings.filter(c=>!restoring.has(c.id)).map(c=>c.id),original.order.filter(id=>!restoring.has(id)))) throw Error('FIGMA_ROLLBACK_ORDER_CHANGED');
          const parentTransform='absoluteTransform' in parent?matrix(parent.absoluteTransform):null;
          if (!same(parentTransform,original.parentAbsolute)) throw Error('FIGMA_ROLLBACK_TRANSFORM_CHANGED');
          if (current.parent!==parent || !same(current.relative,original.relative) || !same(current.absolute,original.absolute) || !same(current.order,original.order)) {
            const present=new Set(siblings.filter(c=>c!==n).map(c=>c.id));
            const index=original.order.slice(0,original.index).filter(id=>present.has(id)).length;
            parent.insertChild(index,n);
            n.relativeTransform=matrix(original.relative);
          }
          const restored=position(n);
          const presentOriginal=original.order.filter(id=>parent.children.some(c=>c.id===id));
          if (restored.parent!==parent || !same(restored.order,presentOriginal) || !same(restored.relative,original.relative) || !same(restored.absolute,original.absolute)) throw Error('FIGMA_ROLLBACK_RESTORE_UNCONFIRMED');
          e.expected=restored;
          for (const other of entries.values()) if (other!==e && !other.node.removed && !other.drift && other.expected) {
            try {
              const p=position(other.node),old=other.expected;
              if(p.parent===old.parent&&same(p.relative,old.relative)&&same(p.absolute,old.absolute)&&same(p.order.filter(id=>id!==n.id),old.order.filter(id=>id!==n.id)))other.expected=p;
              else other.drift=true;
            } catch {other.drift=true;}
          }
          restoredEntries.push(e);
        } catch (error) {
          incomplete=true;
          const code=error instanceof Error&&/^FIGMA_ROLLBACK_[A-Z_]+$/.test(error.message)?error.message:'FIGMA_ROLLBACK_RESTORE_FAILED';
          if(code==='FIGMA_ROLLBACK_FOREIGN_DRIFT')e.drift=true;
          if(!e.drift&&original.parent&&!original.parent.removed)pendingParents.push(original.parent);
          note(code,'Foreign recovery failed or drifted. Retain every ancestor containing it and retry safely; do not cascade-remove that content.',n.id);
          // Only a confirmed current snapshot can fence the next retry. No guess
          // of the original parent/order is made after a partial native failure.
          try {
            const p=position(n),old=e.expected;
            if(old && (p.parent!==old.parent&&p.parent!==original.parent || !same(p.relative,old.relative)&&!same(p.relative,original.relative)))e.drift=true;
            e.expected=p;
          } catch {e.drift=true;}
        }
      }
      for (const n of scopeRoots().reverse()) {
        if (n.removed) continue;
        // Re-scan immediately before each deletion, including after a failed
        // remove/restore. A later ancestor must never bypass a foreign boundary.
        const foreign=boundaries();
        let protectedRoot=opaqueAncestor(n)||containsForeign(n);
        for(const f of foreign)if(!entries.has(f.id)){
          incomplete=true;note('FIGMA_ROLLBACK_FOREIGN_PRESERVED','Foreign content appeared during recovery. Its current subtree is preserved; original relationship is unknown.',f.id);
          const p=position(f);entries.set(f.id,{node:f,original:null,expected:p,anchors:[],drift:false});
        }
        const protectedNodes: BaseNode[]=foreign.slice();
        for(const anchor of relationshipAnchors)protectedNodes.push(anchor);
        for(const e of entries.values())if(!e.node.removed)for(const anchor of anchors(e.node))protectedNodes.push(anchor);
        for(const parent of pendingParents)if(parent.type!=='PAGE')protectedNodes.push(parent);
        for (const f of protectedNodes) {
          let p: BaseNode|null=f;const seen=new Set<string>();
          while (p && p.type!=='PAGE' && p.type!=='DOCUMENT') {
            if (seen.has(p.id)||seen.size>=limit) throw Error('FIGMA_ROLLBACK_SCOPE_UNREADABLE');
            seen.add(p.id);if(p===n){protectedRoot=true;break;}p=p.parent;
          }
        }
        if (protectedRoot) {incomplete=true;note('FIGMA_ROLLBACK_OWNED_RETAINED','Generated root is retained because deleting it could destroy foreign content or change an opaque foreign subtree.',n.id);continue;}
        try {n.remove();if(!n.removed)throw Error('FIGMA_ROLLBACK_REMOVE_UNCONFIRMED');}
        catch {incomplete=true;note('FIGMA_ROLLBACK_REMOVE_FAILED','Native removal failed; later deletions re-check foreign boundaries instead of assuming cascade cleanup.',n.id);}
      }
      for(const e of restoredEntries){
        try{
          if(!e.original||!equal(position(e.node),e.original))throw Error('FIGMA_ROLLBACK_RESTORE_UNCONFIRMED');
          note('FIGMA_ROLLBACK_FOREIGN_RESTORED','Exact pre-mutation parent/order/local and absolute transform restored and checked after cleanup. Necessary generated ancestors and order/layout anchors are retained.',e.node.id);
        }catch{
          incomplete=true;note('FIGMA_ROLLBACK_RESTORE_UNCONFIRMED','Final foreign relationship changed during cleanup. Exact restoration is not confirmed; retained transaction state requires review.',e.node.id);
        }
      }
      if (Array.from(owned.values()).some(n=>!n.removed)) incomplete=true;
    } catch {
      incomplete=true;note('FIGMA_ROLLBACK_SCOPE_UNREADABLE','Bounded rollback scope is unreadable or exceeds the limit. Deletion stops; transaction state remains available for safe retry.');
    } finally {recovering=false;}
    last={status:incomplete?'incomplete':'complete',diagnostics};return last;
  }
  function reset() {if(activeWrites||recovering||Array.from(owned.values()).some(n=>!n.removed))throw Error('FIGMA_NATIVE_TRANSACTION_ACTIVE');entries.clear();last=null;}
  function rebindOwned(replacements: Map<SceneNode,SceneNode>) {
    if (!activeWrites || recovering) throw Error('FIGMA_NATIVE_WRITE_BUSY');
    const proven = new Set(replacements.values());
    // Rematerialized owned nodes may have appeared as unknown boundaries during
    // this write. Original foreign entries are never cleared or rebound.
    for (const [id,e] of entries) if (!e.original && proven.has(e.node) && owned.get(e.node.id) === e.node) entries.delete(id);
  }
  return {write,rollback,reset,rebindOwned,busy:()=>activeWrites>0||recovering};
}
