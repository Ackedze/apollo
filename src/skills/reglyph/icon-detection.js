'use strict';
const visibleInLayout = node => { for (let part = node; part; part = part.parent) if (part.removed || ('visible' in part && part.visible === false) || ('opacity' in part && part.opacity === 0)) return false; return true; };

// An unknown source is eligible only inside a verified container, never by its name.
function isVectorIcon(node) {
  const shapes = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'RECTANGLE', 'ELLIPSE', 'LINE', 'POLYGON', 'STAR']);
  let geometry = false;
  function visit(part) {
    if (part.visible === false) return true;
    if (part !== node && !shapes.has(part.type) && !['FRAME', 'GROUP'].includes(part.type)) return false;
    for (const field of ['fills', 'strokes']) {
      if (Array.isArray(part[field]) && part[field].some(p => p.visible !== false && ['IMAGE', 'VIDEO'].includes(p.type))) return false;
    }
    if (shapes.has(part.type)) geometry = true;
    return !part.children || part.children.every(visit);
  }
  return node.visible !== false && visit(node) && geometry;
}

// Conservative artwork identity for the legacy all-currencies-in-one component.
// Paints and names are overrides; neither identifies a currency.
function currencyArtwork(node) {
  const painted = part => ['fills', 'strokes'].some(field => Array.isArray(part[field]) && part[field].some(p => p.visible !== false && p.opacity !== 0));
  if (painted(node)) return null;
  const children = (node.children || []).filter(c => c.visible !== false && c.opacity !== 0);
  if (children.length !== 1) return null;
  const vector = children[0];
  if (vector.type !== 'VECTOR' || !vector.vectorPaths?.length || (vector.effects || []).some(e => e.visible !== false) || (vector.strokes || []).some(p => p.visible !== false && p.opacity !== 0)) return null;
  const round = n => Math.round(n * 10000) / 10000;
  const paths = vector.vectorPaths.map(p => [p.windingRule, p.data.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, n => String(round(Number(n)))).replace(/\s+/g, ' ').trim()]);
  return JSON.stringify([round(vector.width), round(vector.height), vector.relativeTransform?.map(row => row.map(round)), paths]);
}

async function iconContext(node, mainOf, containers, iconViewSets) {
  if (!isVectorIcon(node)) return null;
  let container = null;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== 'INSTANCE') continue;
    const main = await mainOf(parent);
    if (!container) {
      // Legacy IconView exposes the icon directly through a verified swap property.
      // No name or visual-size heuristics: the nearest instance must be that family.
      const set = main?.parent?.type === 'COMPONENT_SET' ? main.parent : null;
      const view = set && iconViewSets.get(set.key);
      const property = node.componentPropertyReferences?.mainComponent;
      if (view?.directIconProperties?.includes(property)) {
        return { key: main.key, name: view.name, iconViewSetKey: set.key, iconProperty: property };
      }
      // Other verified IconViews keep the explicit inner .icon container.
      const info = main && containers.get(main.key);
      if (!info) return null;
      container = { key: main.key, name: info.name };
    } else {
      // That container must belong directly to a verified IconView, never a Tab or arbitrary component.
      const set = main && main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
      return set && iconViewSets.has(set.key) ? Object.assign({}, container, {iconViewSetKey: set.key}) : null;
    }
  }
  return null;
}

function createProtectedIconReader(detection){
  const rules=name=>detection[name]||[];
  const protectedSets = new Set(rules('protectedComponentSets').map(c => c.key));
  const protectedComponents = new Set(rules('protectedComponents').map(c => c.key));
  const hiddenProtectedSets = new Set(rules('protectedComponentSets').filter(c => !c.showInNativeSection).map(c => c.key));
  const hiddenProtectedComponents = new Set(rules('protectedComponents').filter(c => !c.showInNativeSection).map(c => c.key));
  const fixedIconRules = rules('protectedFixedIconRules'), sourceIconSlots = rules('protectedSourceIconSlots');
  const sourceId = part => part?.id?.split(';').pop();
  async function insideProtectedIconSlot(node, mainOf) {
    // Bound resources belong to designer-configurable slots, not variant-fixed artwork.
    if (node.componentPropertyReferences?.mainComponent) return false;
    const sourceSlots = sourceIconSlots.filter(slot => sourceId(node) === slot.iconSourceId && sourceId(node.parent) === slot.containerSourceId);
    if (sourceSlots.length) {
      const main = await mainOf(node);
      if (main && sourceSlots.some(slot => slot.iconComponentKeys.includes(main.key))) return true;
    }
    let control = node.parent;
    const frames = [];
    for (; control && control.type !== 'INSTANCE' && control.type !== 'COMPONENT' && control.type !== 'PAGE' && control.type !== 'DOCUMENT'; control = control.parent) {
      if (control.componentPropertyReferences?.mainComponent) return false;
      frames.push(control);
    }
    if (!control || !['INSTANCE', 'COMPONENT'].includes(control.type)) return false;
    const owner = control.type === 'INSTANCE' ? await mainOf(control) : control;
    const setKey = owner?.parent?.type === 'COMPONENT_SET' ? owner.parent.key : null;
    const rules = fixedIconRules.filter(rule => rule.componentSetKey === setKey);
    if (!rules.length) return false;
    const main = await mainOf(node);
    if (!main) return false;
    const iconSet = main.parent?.type === 'COMPONENT_SET' ? main.parent.key : null;
    return rules.some(rule => {
      if (!rule.iconComponentKeys.includes(main.key) && !rule.iconSetKeys.includes(iconSet)) return false;
      if (rule.containerDepth && (frames.length !== rule.containerDepth || frames.some(frame => frame.type !== 'FRAME'))) return false;
      if (rule.containerVisibilityProperty && !frames.some(frame => frame.componentPropertyReferences?.visible === rule.containerVisibilityProperty)) return false;
      return Object.entries(rule.variantProperties || {}).every(([property, values]) => values.includes(String(owner.variantProperties?.[property])));
    });
  }

  async function insideProtectedComponent(node, mainOf, cache = new Map(), includeIconSlots = true, includeObserved = true) {
    const sets = includeObserved ? protectedSets : hiddenProtectedSets;
    const components = includeObserved ? protectedComponents : hiddenProtectedComponents;
    if (includeIconSlots && await insideProtectedIconSlot(node, mainOf)) return true;
    async function check(part) {
      if (!part || part.type === 'PAGE' || part.type === 'DOCUMENT') return false;
      if (cache.has(part)) return cache.get(part);
      let protectedPart = false;
      if (part.type === 'INSTANCE') {
        const main = await mainOf(part);
        protectedPart = !!main && (components.has(main.key) || (main.parent?.type === 'COMPONENT_SET' && sets.has(main.parent.key)));
      } else if (part.type === 'COMPONENT') {
        protectedPart = components.has(part.key) || (part.parent?.type === 'COMPONENT_SET' && sets.has(part.parent.key));
      } else if (part.type === 'COMPONENT_SET') protectedPart = sets.has(part.key);
      const result = protectedPart || await check(part.parent);
      cache.set(part, result);
      return result;
    }
    return check(node.parent);
  }
  return insideProtectedComponent;
}
module.exports={currencyArtwork,iconContext,createProtectedIconReader,visibleInLayout};
