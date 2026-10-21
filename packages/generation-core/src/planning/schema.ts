import { STATIC_SCREEN_VERSION } from './static-content-types';
import type { Diagnostic, ScreenSpec, PlanNode, Scalar } from './types';
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(v);
const scalar = (v: unknown): v is Scalar => typeof v === 'string' && v.length <= 8192 || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v);
const keys = (v: Record<string, any>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const ids = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 256 && v.every(id) && new Set(v).size === v.length;
export function childIds(node: PlanNode): string[] {
  return node.kind === 'stack' ? node.children : node.kind === 'component' ? Object.values(node.slots).flat() : [];
}
/** Runtime validation for imported JSON, including a single bounded tree. */
export function validateScreenSpec(input: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (record(input) && input.schemaVersion === STATIC_SCREEN_VERSION) return [{code:'STATIC_PROTOCOL_UNSUPPORTED',stage:'schema',message:'Static Draft content requires its separate review API; the interactive v1 target consumer cannot execute this version.'}];
  const v2 = record(input) && input.schemaVersion === 'apollo.screen-spec.v2-experimental';
  const fail = (message: string, nodeId?: string) => diagnostics.push({ code: 'SCREEN_SCHEMA', stage: 'schema', nodeId, message });
  if (!record(input) || !keys(input, ['schemaVersion','id','platform','viewport','root','nodes','states','events','transitions','unresolved'].concat(v2 ? ['capabilityGaps'] : []))
    || !['apollo.screen-spec.v1-experimental','apollo.screen-spec.v2-experimental'].includes(input.schemaVersion) || !id(input.id) || !id(input.root)
    || !['desktop','mobile-web'].includes(input.platform) || !record(input.viewport) || !keys(input.viewport, ['width','height'])
    || ![input.viewport.width,input.viewport.height].every(n => Number.isInteger(n) && n > 0 && n <= 8192)
    || !record(input.states) || !keys(input.states, ['initial','values']) || !ids(input.states.values) || !input.states.values.length || !input.states.values.includes(input.states.initial)
    || !Array.isArray(input.events) || input.events.length > 256 || !input.events.every(e => record(e) && keys(e,['id']) && id(e.id))
    || new Set(input.events.map(e => e.id)).size !== input.events.length
    || !Array.isArray(input.transitions) || input.transitions.length > 512
    || !Array.isArray(input.unresolved) || input.unresolved.length > 64 || !input.unresolved.every(s => typeof s === 'string' && s.length <= 2048)
    || v2 && (!Array.isArray(input.capabilityGaps) || input.capabilityGaps.length > 64 || !input.capabilityGaps.every(g => record(g) && keys(g,['code','message','nodeId']) && /^[A-Z][A-Z0-9_]{1,79}$/.test(g.code) && typeof g.message === 'string' && !!g.message.trim() && g.message.length <= 2048 && (g.nodeId === undefined || id(g.nodeId))))
    || !Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > 256) {
    fail('Unsupported or malformed ScreenSpec.'); return diagnostics;
  }
  const states = input.states.values as string[], events = new Set(input.events.map(e => e.id));
  const transitions = new Set<string>();
  for (const t of input.transitions) {
    if (!record(t) || !keys(t,['eventId','from','to']) || !events.has(t.eventId) || !states.includes(t.from) || !states.includes(t.to)) fail('Transition refers to an undeclared state/event.');
    else { const key = JSON.stringify([t.eventId,t.from]); if (transitions.has(key)) fail('Ambiguous state transition.'); transitions.add(key); }
  }
  const nodes = new Map<string, PlanNode>(), actionIds = new Set<string>();
  for (const n of input.nodes) {
    if (!record(n) || !id(n.id) || nodes.has(n.id)) { fail('Invalid or duplicate plan node ID.'); continue; }
    let valid = false;
    if (n.kind === 'text') valid = keys(n,['kind','id','text']) && typeof n.text === 'string' && n.text.length <= 8192;
    if (n.kind === 'stack') valid = keys(n,['kind','id','direction','gap','children']) && ['vertical','horizontal'].includes(n.direction)
      && typeof n.gap === 'number' && Number.isFinite(n.gap) && n.gap >= 0 && n.gap <= 1024 && ids(n.children);
    if (n.kind === 'component') {
      valid = keys(n,['kind','id','mappingId','props','slots','actions']) && id(n.mappingId) && record(n.props) && record(n.slots)
        && Object.keys(n.props).length <= 64 && Object.keys(n.slots).length <= 16
        && Object.entries(n.slots).every(([k,v]) => id(k) && ids(v))
        && Object.entries(n.props).every(([k,v]) => id(k) && (scalar(v) || record(v) && keys(v,['state']) && record(v.state)
          && Object.keys(v.state).length === states.length && states.every(s => Object.prototype.hasOwnProperty.call(v.state,s) && scalar(v.state[s]))));
      if (n.actions !== undefined) {
        valid = valid && record(n.actions) && keys(n.actions,['port','items']) && id(n.actions.port)
          && Array.isArray(n.actions.items) && n.actions.items.length <= 64;
        if (valid) for (const a of n.actions.items) {
          if (!record(a) || !keys(a,['id','label','eventId','view','disabled'].concat(v2 ? ['behavior'] : [])) || !id(a.id) || actionIds.has(a.id)
            || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 8192 || !(v2 && a.behavior === 'none' && !Object.prototype.hasOwnProperty.call(a,'eventId') || a.behavior === undefined && events.has(a.eventId))
            || a.view !== undefined && !['primary','secondary'].includes(a.view)
            || a.disabled !== undefined && !(typeof a.disabled === 'boolean' || record(a.disabled) && keys(a.disabled,['state']) && record(a.disabled.state)
              && Object.keys(a.disabled.state).length === states.length && states.every(s => typeof a.disabled.state[s] === 'boolean'))) valid = false;
          else actionIds.add(a.id);
        }
      }
    }
    if (!valid) fail('Unsupported node/property/action shape.', n.id);
    else nodes.set(n.id, n as PlanNode);
  }
  if (v2 && input.capabilityGaps.some((g: Record<string,any>) => g.nodeId !== undefined && !nodes.has(g.nodeId))) fail('Capability gap references an undeclared node.');
  if (Array.from(actionIds).some(actionId => nodes.has(actionId))) fail('Action IDs and node IDs must be distinct.');
  if (diagnostics.length) return diagnostics;
  const parents = new Map<string, number>(), visited = new Set<string>(), active = new Set<string>();
  function visit(nodeId: string, depth: number) {
    if (depth > 16 || active.has(nodeId)) { fail('Tree depth/cycle limit exceeded.', nodeId); return; }
    const n = nodes.get(nodeId); if (!n) { fail('Missing child node.', nodeId); return; }
    if (visited.has(nodeId)) return;
    visited.add(nodeId); active.add(nodeId);
    for (const child of childIds(n)) { parents.set(child,(parents.get(child) || 0) + 1); visit(child,depth+1); }
    active.delete(nodeId);
  }
  visit(input.root,0);
  if (visited.size !== nodes.size || parents.has(input.root) || Array.from(parents.values()).some(count => count !== 1)) fail('Nodes must form one connected tree with a single parent per node.');
  return diagnostics;
}
