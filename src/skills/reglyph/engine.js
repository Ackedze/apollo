// Adapted from the supplied ReGlyph 0.1 Public Beta. See ORIGIN.md.
'use strict';

function validateCatalog(data) {
  if (!data || data.version !== 1) throw new Error('Нужен каталог версии 1.');
  for (const field of ['oldIcons', 'newIcons']) {
    if (!Array.isArray(data[field])) throw new Error('Нет списка ' + field);
    const keys = new Set();
    for (const icon of data[field]) {
      if (!icon || typeof icon.key !== 'string' || !icon.key.trim() || typeof icon.name !== 'string' || !icon.name.trim()) {
        throw new Error('У каждой иконки должны быть key и name.');
      }
      if (keys.has(icon.key)) throw new Error('Повтор ключа: ' + icon.key);
      keys.add(icon.key);
    }
  }
  if (!Array.isArray(data.mappings)) throw new Error('Нет списка mappings.');
  const oldKeys = new Set(data.oldIcons.map(i => i.key));
  const newKeys = new Set(data.newIcons.map(i => i.key));
  for (const key of oldKeys) if (newKeys.has(key)) throw new Error('Старые и новые ключи должны различаться.');
  const mapped = new Set();
  for (const mapping of data.mappings) {
    if (!mapping || !oldKeys.has(mapping.oldKey) || !newKeys.has(mapping.newKey) || mapping.oldKey === mapping.newKey) throw new Error('Соответствие ссылается на неизвестную иконку.');
    if (mapped.has(mapping.oldKey)) throw new Error('Два соответствия для одной старой иконки.');
    mapped.add(mapping.oldKey);
  }
  const candidateKeys = new Set();
  for (const candidate of data.mappingCandidates || []) {
    if (!candidate || !oldKeys.has(candidate.oldKey) || mapped.has(candidate.oldKey) || candidateKeys.has(candidate.oldKey) || !Array.isArray(candidate.options) || candidate.options.length < 1) throw new Error('Неоднозначные соответствия заданы некорректно.');
    const choices = new Set();
    for (const option of candidate.options) {
      if (!option || !newKeys.has(option.newKey) || choices.has(option.newKey)) throw new Error('Неизвестная или повторная замена сервиса.');
      choices.add(option.newKey);
    }
    candidateKeys.add(candidate.oldKey);
  }
  if (data.observedIcons !== undefined) {
    if (!Array.isArray(data.observedIcons)) throw new Error('Некорректный список библиотек для проверки.');
    const keys = new Set([...oldKeys, ...newKeys]);
    for (const icon of data.observedIcons) {
      if (!icon || typeof icon.key !== 'string' || !icon.key || typeof icon.name !== 'string' || !icon.name || !['unused', 'native', 'logo'].includes(icon.category) || typeof icon.library !== 'string' || !icon.library) throw new Error('Некорректная иконка библиотеки.');
      if (keys.has(icon.key)) throw new Error('Ключ иконки относится к нескольким библиотекам.');
      keys.add(icon.key);
    }
  }
  return data;
}

const copyValue = value => JSON.parse(JSON.stringify(value));
function paintSignature(paints) {
  function normalize(value) {
    if (typeof value === 'number') return Math.round(value * 100000) / 100000;
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().filter(k => !(k === 'boundVariables' && !Object.keys(value[k] || {}).length)).map(k => [k, normalize(value[k])]));
    }
    return value;
  }
  return JSON.stringify(normalize(paints.map(p => (Object.assign({}, {visible: true, opacity: 1, blendMode: 'NORMAL'}, p)))));
}

function colorRecords(root) {
  const records = [];
  function visit(node, path, opacity) {
    if ((node !== root && (node.visible === false || node.opacity === 0)) || node.isMask) return;
    const alpha = opacity * (node === root ? 1 : node.opacity === undefined ? 1 : node.opacity);
    for (const field of ['fills', 'strokes']) {
      if (!Array.isArray(node[field])) continue;
      const paints = node[field].filter(p => p.visible !== false && p.opacity !== 0);
      if (!paints.length) continue;
      if (paints.some(p => !['SOLID', 'GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'].includes(p.type))) {
        throw new Error('Не удалось безопасно перенести цвет: сложная заливка.');
      }
      const effective = copyValue(paints).map(p => (Object.assign({}, p, {opacity: (p.opacity === undefined ? 1 : p.opacity) * alpha})));
      records.push({ node, path: path + '/' + field, field, paints: effective,
        styleId: node[field === 'fills' ? 'fillStyleId' : 'strokeStyleId'] || '', alpha });
    }
    // A boolean's children are inputs, not independently painted shapes.
    if (node.type !== 'BOOLEAN_OPERATION' && Array.isArray(node.children)) {
      node.children.forEach((child, index) => visit(child, path + '/' + index + ':' + child.name, alpha));
    }
  }
  visit(root, '', 1);
  return records;
}

function colorTransferPlan(source, target, captured) {
  const from = captured || colorRecords(source), to = colorRecords(target);
  if (!from.length && !to.length) return [];
  if (!from.length || !to.length) throw new Error('Не удалось определить цвет иконки.');
  const uniform = new Set(from.map(r => paintSignature(r.paints))).size === 1;
  if (uniform) return to.map(record => ({ target: record, source: from[0] }));
  // Never flatten a multicolour icon or guess correspondence by layer order alone.
  if (from.length !== to.length) throw new Error('Многоцветная иконка: структура слоёв отличается, замена пропущена.');
  return to.map(record => {
    const original = from.find(r => r.path === record.path && r.node.type === record.node.type);
    if (!original) throw new Error('Многоцветная иконка: соответствие цветов неоднозначно, замена пропущена.');
    return { target: record, source: original };
  });
}

// Only recolour a preview when its visible artwork has one solid RGB colour.
// Gradients, images and effects keep their source appearance conservatively.
function isMonochrome(node) {
  try {
    function hasEffects(part) {
      if (part.visible === false) return false;
      return (Array.isArray(part.effects) && part.effects.some(e => e.visible !== false)) || (Array.isArray(part.children) && part.children.some(hasEffects));
    }
    if (hasEffects(node)) return false;
    const records = colorRecords(node), colors = new Set();
    for (const record of records) for (const paint of record.paints) {
      if (paint.type !== 'SOLID') return false;
      colors.add([paint.color.r, paint.color.g, paint.color.b].map(v => Math.round(v * 255)).join(','));
    }
    return colors.size === 1;
  } catch (_) { return false; }
}

// Boolean inputs have no render bounds of their own: Figma paints the result.
// Use that result for previews, but keep the instance as the swap/selection target.
function iconPreviewNode(node) {
  let artwork = node;
  for (let part = node.parent; part && part.type !== 'PAGE'; part = part.parent) {
    if (part.type === 'BOOLEAN_OPERATION') artwork = part;
  }
  return artwork;
}

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



function createReglyphEngine({api, catalogs, detection, post, assertActive = () => {}, onMutation = () => {}}) {
  const figma = api;
  const BUNDLED_CATALOG = catalogs.default;
  const BUNDLED_SCENARIOS = catalogs;
  const BUNDLED_ICON_DETECTION = detection;
  const bundled = typeof BUNDLED_CATALOG !== 'undefined' ? validateCatalog(BUNDLED_CATALOG) : null;
  const scenarios = typeof BUNDLED_SCENARIOS !== 'undefined' ? BUNDLED_SCENARIOS : bundled ? { default: bundled } : {};
  const iconContainers = new Map((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.containers : []).map(c => [c.key, c]));
  const iconViewSets = new Map((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.iconViewSets || [] : []).map(c => [c.key, c]));
  const protectedSets = new Set((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.protectedComponentSets || [] : []).map(c => c.key));
  const protectedComponents = new Set((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.protectedComponents || [] : []).map(c => c.key));
  const hiddenProtectedSets = new Set((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.protectedComponentSets || [] : []).filter(c => !c.showInNativeSection).map(c => c.key));
  const hiddenProtectedComponents = new Set((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.protectedComponents || [] : []).filter(c => !c.showInNativeSection).map(c => c.key));
  const fixedIconRules = typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.protectedFixedIconRules || [] : [];
  const sourceIconSlots = typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.protectedSourceIconSlots || [] : [];
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
  let scenario = 'default';
  let catalog = bundled || { version: 1, oldIcons: [], newIcons: [], mappings: [] };
  let snapshot = null;
  let pendingScan = null, scanPromptSerial = 0;
  let busy = false;
  let revision = 0;
  const components = new Map();
  const previews = new Map();
  const scenarioPreviewCache = new Map();
  const colorVariables = new Map();
  let localComponentPage = null;
  let localComponents = new Map();
  let previewCacheDirty = 0;
  let previewCache = {};
  const previewCacheKey = () => 'apollo-reglyph-abm-v1-preview' + (scenario === 'default' ? '' : '-' + scenario);
  const send = (type, payload = {}) => post(Object.assign({type}, payload));
  const pageOf = node => { for (let part = node; part; part = part.parent) if (part.type === 'PAGE') return part; return null; };
  const scopeMatches = plan => {
    try { return !!plan && !plan.page.removed && plan.roots.length > 0 && plan.roots.every(root => !root.removed && pageOf(root)?.id === plan.page.id); }
    catch (_) { return false; }
  };
  const containsNode = (plan, node) => {
    if (!scopeMatches(plan) || !node || node.removed) return false;
    for (let part = node; part && part.type !== 'PAGE'; part = part.parent) if (plan.roots.some(root => root.id === part.id)) return true;
    return false;
  };
  function captureScope() {
    const page = figma.currentPage, selectedIds = new Set(page.selection.map(node => node.id));
    const roots = page.selection.filter(node => { for (let parent = node.parent; parent; parent = parent.parent) if (selectedIds.has(parent.id)) return false; return true; });
    return { page, roots };
  }
  const scopeLabel = plan => plan.roots.length === 1 ? plan.roots[0].name : `Областей: ${plan.roots.length}`;
  const visibleInLayout = node => { for (let part = node; part; part = part.parent) if (part.removed || ('visible' in part && part.visible === false) || ('opacity' in part && part.opacity === 0)) return false; return true; };
  const knownIconKeys = () => new Set([catalog, ...Object.values(scenarios)].flatMap(c => [...c.oldIcons, ...c.newIcons, ...(c.observedIcons || [])]).map(icon => icon.key));
  async function serviceCardRoles(root, knownKeys, mainOf) {
    const roles = [];
    async function visit(part) {
      if (!visibleInLayout(part)) return;
      if (part.type === 'TEXT') {
        const text = String(part.characters || '').normalize('NFC').replace(/\s+/gu, ' ').trim();
        if (text) roles.push({ kind: 'text', text, id: part.id });
        return;
      }
      if (part.type === 'INSTANCE') {
        const main = await mainOf(part);
        if (main && knownKeys.has(main.key)) { roles.push({ kind: 'icon' }); return; }
      }
      if (part.children) for (const child of part.children) await visit(child);
    }
    await visit(root);
    return roles;
  }
  const message = error => error instanceof Error ? error.message : String(error);
  async function bounded(operation, milliseconds, label) {
    if (typeof setTimeout !== 'function') return operation;
    let timer;
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), milliseconds);
      })]);
    } finally { clearTimeout(timer); }
  }
  function validateSupportedCatalog(data) {
    const base = scenarios[scenario] || bundled;
    if (base?.nativeCurrencyKeys?.length) {
      const currencyKeys = new Set(base.nativeCurrencyKeys);
      const approvedMappings = base.mappings.filter(rule => currencyKeys.has(rule.oldKey));
      const requiredTargets = new Set(approvedMappings.map(rule => rule.newKey));
      const savedTargets = new Set(data.newIcons.map(icon => icon.key));
      data = Object.assign({}, data, {oldIcons: [...data.oldIcons.filter(icon => !currencyKeys.has(icon.key)), ...base.oldIcons.filter(icon => currencyKeys.has(icon.key))], newIcons: [...data.newIcons, ...base.newIcons.filter(icon => requiredTargets.has(icon.key) && !savedTargets.has(icon.key))], mappings: [...data.mappings.filter(rule => !currencyKeys.has(rule.oldKey)), ...approvedMappings], mappingCandidates: (data.mappingCandidates || []).filter(rule => !currencyKeys.has(rule.oldKey))});
    }
    const searchDescriptions = new Map((base?.newIcons || []).map(icon => [icon.key, icon.searchDescription]));
    const next = validateCatalog(base ? Object.assign({}, data, {newIcons: data.newIcons.map(icon => (Object.assign({}, icon, {searchDescription: searchDescriptions.get(icon.key) || ''}))), scenarioId: scenario, source: base.source || data.source, observedIcons: base.observedIcons || [], iconCategories: base.iconCategories || []}) : data);
    if (base) {
      const oldAllowed = new Set(base.oldIcons.map(i => i.key));
      const newAllowed = new Set(base.newIcons.map(i => i.key));
      if (next.oldIcons.some(i => !oldAllowed.has(i.key)) || next.newIcons.some(i => !newAllowed.has(i.key))) {
        throw new Error('Разрешены только иконки со ссылками в исходной таблице.');
      }
    }
    return next;
  }

  async function component(key) {
    const cached = components.get(key);
    if (cached && !cached.removed) return cached;
    if (localComponentPage !== figma.currentPage.id) {
      localComponentPage = figma.currentPage.id;
      localComponents = new Map(figma.currentPage.findAllWithCriteria({ types: ['COMPONENT'] }).map(n => [n.key, n]));
    }
    const local = localComponents.get(key);
    const result = local || await bounded(figma.importComponentByKeyAsync(key), 5000, 'Компонент библиотеки не ответил.');
    components.set(key, result);
    return result;
  }

  async function exportPreview(node, scale) {
    const settings = { format: 'PNG', constraint: { type: 'SCALE', value: scale } };
    if (node.absoluteRenderBounds !== null) return bounded(node.exportAsync(settings), 3000, 'Превью не ответило.');
    // A clipped instance exports as a transparent 1×1 image. Export an isolated
    // copy instead; never change clipping, position or visibility in the layout.
    const isolated = node.clone();
    try {
      figma.currentPage.appendChild(isolated);
      // Preserve variable modes inherited from the original layout.
      for (const [collectionId, modeId] of Object.entries(node.resolvedVariableModes || {})) {
        try {
          const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
          if (collection) isolated.setExplicitVariableModeForCollection(collection, modeId);
        } catch (_) { /* A missing mode must not prevent the image from exporting. */ }
      }
      return await bounded(isolated.exportAsync(settings), 3000, 'Превью не ответило.');
    } finally {
      isolated.remove();
    }
  }

  async function previewBytes(node, scale, fallback) {
    try {
      const bytes = await exportPreview(node, scale);
      // Figma returns a transparent 1×1 PNG for non-rendering/clipped content.
      const empty = bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 &&
        bytes[16] === 0 && bytes[17] === 0 && bytes[18] === 0 && bytes[19] === 1 &&
        bytes[20] === 0 && bytes[21] === 0 && bytes[22] === 0 && bytes[23] === 1;
      if (!empty || !fallback) return bytes;
    } catch (error) { if (!fallback) throw error; }
    return exportPreview(fallback, scale);
  }

  async function preview(node, fallback) {
    const bytes = await previewBytes(node, 2, fallback);
    return 'data:image/png;base64,' + figma.base64Encode(bytes);
  }

  async function savePreviewCache(force = false) {
    if (!previewCacheDirty || (!force && previewCacheDirty < 30)) return;
    // Leave room in clientStorage for the catalogue and other plugin settings.
    const entries = Object.entries(previewCache).sort((a, b) => b[1].time - a[1].time);
    const compact = {}; let bytes = 0;
    for (const [key, value] of entries) {
      bytes += key.length + value.image.length + 50;
      if (bytes > 1800000) break;
      compact[key] = value;
    }
    try { await figma.clientStorage.setAsync(previewCacheKey(), compact); previewCacheDirty = 0; }
    catch (_) { /* Live previews remain available if local storage is full. */ }
  }

  async function restorePreviewCache() {
    try {
      const stored = scenarioPreviewCache.get(scenario) || await figma.clientStorage.getAsync(previewCacheKey());
      const allowed = new Set(catalog.newIcons.map(i => i.key));
      previewCache = {};
      for (const [key, value] of Object.entries(stored || {})) {
        if (allowed.has(key) && value && typeof value.image === 'string' && value.image.startsWith('data:image/png;base64,') && Date.now() - value.time < 86400000) {
          previewCache[key] = value; previews.set(key, value.image);
        }
      }
      send('preview-cache', { images: Array.from(previews, ([key, image]) => ({ key, image, monochrome: previewCache[key]?.monochrome === true })) });
    } catch (_) { /* A missing cache is a normal first launch. */ }
  }

  function paintAliases(paints) {
    const aliases = [];
    function visit(value, path) {
      if (!value || typeof value !== 'object') return;
      if (value.boundVariables?.color?.id) aliases.push({ id: value.boundVariables.color.id, path });
      for (const [key, child] of Object.entries(value)) if (key !== 'boundVariables' && child && typeof child === 'object') visit(child, path + '/' + key);
    }
    visit(paints, '');
    return aliases;
  }
  async function captureColors(root) {
    const records = colorRecords(root);
    for (const record of records) for (const alias of paintAliases(record.paints)) {
      if (colorVariables.has(alias.id)) continue;
      const variable = await figma.variables.getVariableByIdAsync(alias.id);
      if (!variable) throw new Error('Переменная исходного цвета недоступна.');
      colorVariables.set(alias.id, variable);
    }
    return records;
  }
  async function applyColors(root, prepared) {
    const records = colorRecords(root);
    if (records.length !== prepared.length) throw new Error('После замены изменилась структура заливок.');
    for (let index = 0; index < prepared.length; index++) {
      const record = records[index], source = prepared[index];
      const paints = copyValue(source.paints);
      // Reapply colour-variable aliases explicitly, rather than copying resolved RGB only.
      for (let i = 0; i < paints.length; i++) {
        const alias = paints[i].boundVariables && paints[i].boundVariables.color;
        if (alias) {
          const variable = colorVariables.get(alias.id) || await figma.variables.getVariableByIdAsync(alias.id);
          if (!variable) throw new Error('Переменная исходного цвета недоступна.');
          paints[i] = figma.variables.setBoundVariableForPaint(paints[i], 'color', variable);
        }
      }
      // Effective descendant opacity is folded into the paint; root opacity stays intact.
      for (let layer = record.node; layer && layer !== root; layer = layer.parent) {
        if ('opacity' in layer) layer.opacity = 1;
      }
      const setter = record.field === 'fills' ? 'setFillStyleIdAsync' : 'setStrokeStyleIdAsync';
      let styleRestored = false;
      if (source.styleId && source.alpha === 1 && typeof record.node[setter] === 'function') {
        try {
          await record.node[setter](source.styleId);
          styleRestored = paintSignature(record.node[record.field]) === paintSignature(paints);
        } catch (_) { /* Keep the explicit paint if its original style is unavailable. */ }
      }
      if (!styleRestored) record.node[record.field] = paints;
      if (paintSignature(record.node[record.field]) !== paintSignature(paints)) throw new Error('Проверка цвета после замены не прошла.');
    }
  }

  function invalidate() {
    revision += 1;
    snapshot = null;
    pendingScan = null;
    send('stale');
  }
  function selectionChanged() {
    if ((snapshot && !scopeMatches(snapshot)) || (pendingScan && !scopeMatches(pendingScan))) invalidate();
    send('selection', { count: figma.currentPage.selection.length });
  }

  async function scan(confirmed = false, scope = captureScope()) {
    pendingScan = null;
    snapshot = null;
    const scanRevision = revision;
    if (!scope.roots.length) throw Object.assign(new Error('Выдели макеты в Figma'), { code: 'NO_SELECTION' });
    if (!catalog.oldIcons.length && !(catalog.observedIcons || []).length) throw new Error('Каталог иконок недоступен.');
    const old = new Map(catalog.oldIcons.map(i => [i.key, i]));
    const observed = new Map((catalog.observedIcons || []).map(i => [i.key, i]));
    const knownKeys = knownIconKeys();
    // Only already-target icons and observed-only assets are excluded across scenarios.
    // An inactive scenario's source may still need manual migration in a verified icon slot.
    const excludedUnknownKeys = new Set([catalog, ...Object.values(scenarios)].flatMap(c => [
      ...c.newIcons, ...(c.observedIcons || []).filter(i => ['native', 'logo'].includes(i.category))
    ]).map(i => i.key));
    const mains = new Map(), protectedParents = new Map(), hiddenProtectedParents = new Map();
    const knownInfo = new Map([catalog, ...Object.values(scenarios)].flatMap(c => [...c.oldIcons, ...c.newIcons, ...(c.observedIcons || [])]).map(i => [i.key, i]));
    const mainOf = node => {
      if (!mains.has(node.id)) mains.set(node.id, bounded(node.getMainComponentAsync(), 5000, 'Не удалось прочитать компонент.'));
      return mains.get(node.id);
    };
    const mappings = new Map(catalog.mappings.map(i => [i.oldKey, i.newKey]));
    const candidates = new Map((catalog.mappingCandidates || []).map(i => [i.oldKey, i.options]));
    const found = new Map();
    const monitored = new Map();
    const sourcePreviews = [];
    const nodes = new Map();
    const roots = scope.roots;
    for (const root of roots) {
      if (root.type === 'INSTANCE') nodes.set(root.id, root);
      if ('findAllWithCriteria' in root) {
        for (const node of root.findAllWithCriteria({ types: ['INSTANCE'] })) nodes.set(node.id, node);
      }
    }
    // Screen boundaries come from verified navigation headers, never platform
    // names. This also works when a selection contains a section of screens.
    const screenAncestors = new Set(), occurrenceCounts = new Map(), cardContexts = new Map();
    const headerSets = new Set((typeof BUNDLED_ICON_DETECTION !== 'undefined' ? BUNDLED_ICON_DETECTION.serviceHeaderSets || [] : []).map(header => header.key));
    if (scenario === 'services' && candidates.size) {
      let inspected = 0;
      for (const node of nodes.values()) {
        if (!visibleInLayout(node)) continue;
        try {
          const main = await mainOf(node);
          if (main?.parent?.type === 'COMPONENT_SET' && headerSets.has(main.parent.key)) {
            for (let parent = node.parent; parent && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT'; parent = parent.parent) screenAncestors.add(parent);
          }
        } catch (_) { /* Unreadable nodes are reported by the scan below. */ }
        if (++inspected % 25 === 0 && typeof setTimeout === 'function') await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    function screenOf(node) {
      let selectedRoot = null;
      for (let part = node; part && part.type !== 'PAGE' && part.type !== 'DOCUMENT'; part = part.parent) {
        if (screenAncestors.has(part)) return part;
        if (selectedIds.has(part.id)) selectedRoot = part;
      }
      return selectedRoot;
    }
    async function cardContext(node, screen) {
      if (!screen) return null;
      for (let parent = node.parent; parent && parent !== screen && parent.type !== 'PAGE' && parent.type !== 'DOCUMENT'; parent = parent.parent) {
        if (!cardContexts.has(parent)) {
          cardContexts.set(parent, await serviceCardRoles(parent, knownKeys, mainOf));
        }
        const roles = cardContexts.get(parent), texts = roles.filter(role => role.kind === 'text');
        if (!texts.length) continue;
        // Do not use a whole list, toolbar or another multi-icon container as
        // evidence that two ambiguous occurrences represent the same service.
        if (roles.filter(role => role.kind === 'icon').length !== 1) return null;
        return { title: texts[0].text.toLocaleLowerCase('ru'), structure: roles.map(role => role.kind).join(','), titleId: texts[0].id, cardId: parent.id };
      }
      return null;
    }
    if (!confirmed) {
      let hasServiceTitle = false;
      for (const node of nodes.values()) {
        if (!visibleInLayout(node)) continue;
        let main;
        try { main = await mainOf(node); } catch (_) { continue; }
        if (main?.parent?.type !== 'COMPONENT_SET' || !headerSets.has(main.parent.key) || !node.findAllWithCriteria) continue;
        for (const text of node.findAllWithCriteria({ types: ['TEXT'] })) {
          if (text.name !== '_title' || !visibleInLayout(text) || !text.characters.trim()) continue;
          if (/(^|[^\p{L}\p{N}_])сервисы(?=$|[^\p{L}\p{N}_])/iu.test(text.characters)) hasServiceTitle = true;
        }
      }
      const suggestedScenario = scenario === 'default' && hasServiceTitle ? 'services' : scenario === 'services' && !hasServiceTitle ? 'default' : null;
      if (suggestedScenario) {
        if (revision !== scanRevision || !scopeMatches(scope)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
        pendingScan = Object.assign({}, scope, { token: String(++scanPromptSerial), revision });
        send('scan-confirmation', { token: pendingScan.token, suggestedScenario });
        return;
      }
    }
    let unreadable = 0, processed = 0;
    const progress = () => send('scan-progress', { processed, total: nodes.size });
    progress();
    for (const node of nodes.values()) {
      if(scanRevision !== revision) throw new Error('Проверяемая область изменилась. Повторите проверку.');
      try {
      if (!visibleInLayout(node)) continue;
      try { if (await insideProtectedComponent(node, mainOf, hiddenProtectedParents, false, false)) continue; }
      catch (_) { unreadable += 1; continue; }
      let main;
      try { main = await mainOf(node); } catch (_) { unreadable += 1; continue; }
      if (!main || !main.key) continue;
      const protectedSlot = await insideProtectedComponent(node, mainOf, protectedParents);
      let info = old.get(main.key) || observed.get(main.key) || (protectedSlot ? knownInfo.get(main.key) : null);
      if (protectedSlot && (info || await iconContext(node, mainOf, iconContainers, iconViewSets))) {
        const set = main.parent?.type === 'COMPONENT_SET' ? main.parent : null;
        info = Object.assign({}, (info || { name: set?.name || main.name || node.name }), {category: 'protected', preserveColor: info?.category === 'logo' || info?.library === 'Logo-corp', library: info?.library || 'Glyph'});
      }
      let context = null;
      let currency = null, artwork;
      const legacy = (scenarios[scenario] || bundled)?.legacyCurrencies;
      if (!protectedSlot && legacy?.sourceKeys.includes(main.key)) {
        artwork = currencyArtwork(node);
        const matches = artwork && legacy.rows.filter(rule => rule.artwork === artwork);
        if (matches?.length === 1 && catalog.newIcons.some(icon => icon.key === matches[0].targetKey)) currency = matches[0];
      }
      if (currency) info = { name: currency.currency, library: 'Glyph' };
      if (!info) {
        if (excludedUnknownKeys.has(main.key)) continue;
        try { context = await iconContext(node, mainOf, iconContainers, iconViewSets); } catch (_) { unreadable += 1; }
        if (!context) continue;
        const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
        info = { name: set ? set.name : main.name || node.name, variant: set ? main.name : '' };
      }
      const collection = ['native', 'logo', 'protected'].includes(info.category) ? monitored : found;
      let rowId = scenario === 'services' && collection === found ? info.serviceGroup || main.key : main.key;
      // Unknown overrides with the same main key can contain different artwork.
      if (context || currency) rowId = JSON.stringify(['icon-occurrence', main.key, node.id]);
      if (info.category === 'protected') rowId = 'protected:' + main.key;
      let serviceOccurrence = null;
      if (scenario === 'services' && collection === found && (candidates.get(main.key)?.length || 0) > 1) {
        const screen = screenOf(node);
        let card = null;
        try { card = await cardContext(node, screen); } catch (_) { /* Uncertain occurrences stay independent. */ }
        if (card) {
          const identity = JSON.stringify([rowId, card.title, card.structure]);
          const countKey = JSON.stringify([screen.id, identity]);
          const ordinal = occurrenceCounts.get(countKey) || 0;
          occurrenceCounts.set(countKey, ordinal + 1);
          rowId = JSON.stringify(['service-occurrence', identity, ordinal]);
          serviceOccurrence = Object.assign({}, card, {screenId: screen.id, ordinal});
        } else rowId = JSON.stringify(['service-occurrence', rowId, node.id]);
      }
      let row = collection.get(rowId);
      if (!row) {
        row = Object.assign({}, {rowId, oldKey: main.key, name: info.baseName || info.name, variant: info.variant || '', newKey: collection === found ? currency?.targetKey || mappings.get(main.key) || '' : '', image: null, monochrome: info.category !== 'logo' && !info.preserveColor && isMonochrome(iconPreviewNode(node)), ids: [], sourceKeys: {}}, (artwork !== undefined ? { sourceArtwork: artwork } : {}), (currency ? { verifiedCurrency: true } : {}), (info.library ? { library: info.library } : {}), (serviceOccurrence ? { serviceOccurrences: {} } : {}), (candidates.has(main.key) && collection === found ? { candidates: candidates.get(main.key), needsServiceChoice: true } : {}), (info.category ? { category: info.category } : {}), (info.preserveColor ? { preserveColor: true } : {}), (context ? Object.assign({}, {outsideCatalog: true}, (currency ? { verifiedCurrency: true } : { category: 'unknown' }), {detection: context}) : {}));
        collection.set(rowId, row);
        sourcePreviews.push({ row, node, main });
      }
      row.ids.push(node.id);
      row.sourceKeys[node.id] = main.key;
      if (serviceOccurrence) row.serviceOccurrences[node.id] = serviceOccurrence;
      } finally {
        processed++;
        if(processed % 25 === 0 || processed === nodes.size){
          progress();
          if(typeof setTimeout === 'function')await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
    }
    // Source PNGs must not stall discovery of the remaining instances. Export
    // in a small pool, with bounded waits for unresponsive Figma render jobs.
    let previewIndex = 0;
    await Promise.all(Array.from({ length: Math.min(4, sourcePreviews.length) }, async () => {
      while (previewIndex < sourcePreviews.length && scanRevision === revision) {
        const { row, node, main } = sourcePreviews[previewIndex++];
        try { row.image = await preview(iconPreviewNode(node), main); }
        catch (_) { /* An unavailable image never removes an icon from results. */ }
      }
    }));
    if (scanRevision !== revision || !scopeMatches(scope)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
    snapshot = Object.assign({}, scope, { rows: Array.from(found.values()), observedRows: Array.from(monitored.values()), revision });
    send('scan', { rows: snapshot.rows, observedRows: snapshot.observedRows, unreadable, scopeName: scopeLabel(snapshot) });
  }

  async function replace(choices) {
    assertActive();
    const plan = snapshot;
    if (!plan || !scopeMatches(plan) || plan.revision !== revision) throw new Error('Проверяемая область изменилась. Повторите проверку.');
    if (!Array.isArray(choices)) throw new Error('Некорректный список замен.');
    const allowed = new Set(catalog.newIcons.map(i => i.key));
    const selected = new Map();
    for (const choice of choices) {
      const matches = choice ? plan.rows.filter(r => r.oldKey === choice.oldKey && (!choice.rowId || (r.rowId || r.oldKey) === choice.rowId)) : [];
      const row = matches.length === 1 ? matches[0] : null;
      if (!row || (choice.newKey && (!allowed.has(choice.newKey) || choice.newKey === row.oldKey || Object.values(row.sourceKeys || {}).includes(choice.newKey))) || selected.has(row.rowId || row.oldKey)) {
        throw new Error('Некорректная замена. Повторите проверку.');
      }
      selected.set(row.rowId || row.oldKey, choice.newKey);
    }
    // Resolve every chosen target before the first mutation.
    const targets = new Map();
    for (const key of new Set(selected.values())) if (key) targets.set(key, await component(key));
    if (snapshot !== plan || !scopeMatches(plan)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
    const jobs = [];
    const currentKnownKeys = knownIconKeys(), checkedCards = new Map();
    async function validateOccurrence(row, node, checkedCards) {
      if (snapshot !== plan || plan.revision !== revision || !containsNode(plan, node)) throw new Error('Иконка больше не находится в проверенной области. Повторите проверку.');
      const id = node.id;
      if (node && !visibleInLayout(node)) throw new Error('Иконка находится в скрытом слое. Повторите проверку.');
      if (await insideProtectedComponent(node, n => n.getMainComponentAsync())) throw new Error('Иконка находится в исключённом компоненте. Повторите проверку.');
      const occurrence = row.serviceOccurrences?.[id];
      if (occurrence) {
        const title = await figma.getNodeByIdAsync(occurrence.titleId);
        const text = title?.type === 'TEXT' ? String(title.characters || '').normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru') : '';
        const ancestors = new Map();
        for (let parent = node.parent; parent; parent = parent.parent) ancestors.set(parent.id, parent);
        if (!title || !visibleInLayout(title) || text !== occurrence.title || !ancestors.has(occurrence.cardId) || !ancestors.has(occurrence.screenId)) throw new Error('Контекст сервиса изменился. Повторите проверку.');
        if (!checkedCards.has(occurrence.cardId)) checkedCards.set(occurrence.cardId, await serviceCardRoles(ancestors.get(occurrence.cardId), currentKnownKeys, n => n.getMainComponentAsync()));
        const roles = checkedCards.get(occurrence.cardId);
        if (roles.map(role => role.kind).join(',') !== occurrence.structure || roles.find(role => role.kind === 'text')?.id !== occurrence.titleId) throw new Error('Структура карточки сервиса изменилась. Повторите проверку.');
      }
      if (row.outsideCatalog && !(await iconContext(node, n => n.getMainComponentAsync(), iconContainers, iconViewSets))) {
        throw new Error('Контекст иконки изменился. Повторите проверку.');
      }
      const original = node.type === 'INSTANCE' ? await node.getMainComponentAsync() : null;
      if (!original || original.key !== (row.sourceKeys?.[id] || row.oldKey)) {
        throw new Error('Иконки в макете изменились. Повторите проверку.');
      }
      if (row.sourceArtwork !== undefined && currencyArtwork(node) !== row.sourceArtwork) throw new Error('Рисунок иконки изменился. Повторите проверку.');
      assertActive();
      if (snapshot !== plan || plan.revision !== revision || !containsNode(plan, node) || !visibleInLayout(node)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
      return original;
    }
    for (const row of plan.rows) {
      const target = targets.get(selected.get(row.rowId || row.oldKey));
      if (!target) continue;
      for (const id of row.ids) {
        const node = await figma.getNodeByIdAsync(id);
        const original = await validateOccurrence(row, node, checkedCards);
        let depth = 0;
        for (let parent = node.parent; parent; parent = parent.parent) depth += 1;
        jobs.push({ node, row, target, original, depth });
      }
    }
    if (snapshot !== plan || !scopeMatches(plan)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
    if (!jobs.length) throw new Error('Выберите хотя бы одну замену.');
    const errors = [];
    let replaced = 0;
    const completed = new Set();
    // Descendants first, so swapping a parent cannot invalidate a pending child.
    for (const { node, row, target, original } of jobs.sort((a, b) => b.depth - a.depth)) {
      const name = node.name;
      let swapped = false;
      let originalPaints;
      const width = node.width, height = node.height, opacity = node.opacity;
      const sizing = { horizontal: node.layoutSizingHorizontal, vertical: node.layoutSizingVertical };
      const restoreLayout = () => {
        node.resize(width, height); node.name = name;
        if (opacity !== undefined) node.opacity = opacity;
        if (sizing.horizontal) node.layoutSizingHorizontal = sizing.horizontal;
        if (sizing.vertical) node.layoutSizingVertical = sizing.vertical;
      };
      try {
        assertActive();
        const captured = await captureColors(node);
        await validateOccurrence(row, node, new Map());
        const savedColor = record => ({ paints: record.paints, styleId: record.styleId, alpha: record.alpha });
        originalPaints = captured.map(savedColor);
        const colors = colorTransferPlan(node, target, captured).map(pair => savedColor(pair.source));
        assertActive();
        node.swapComponent(target);
        swapped = true;
        onMutation();
        restoreLayout();
        await applyColors(node, colors);
        replaced += 1;completed.add(node.id);
      } catch (error) {
        if (swapped) {
          try {
            node.swapComponent(original);
            restoreLayout(); await applyColors(node, originalPaints);
          } catch (rollbackError) {
            errors.push(name + ': не удалось восстановить исходную иконку — ' + message(rollbackError));
          }
        }
        errors.push(name + ': замена не выполнена — ' + message(error));
      }
    }
    figma.commitUndo();
    plan.rows = plan.rows.map(row => (Object.assign({}, row, {ids: row.ids.filter(id => !completed.has(id)), newKey: selected.get(row.rowId || row.oldKey) || ''}))).filter(row => row.ids.length);
    const skipped = plan.rows.filter(row => !selected.get(row.rowId || row.oldKey)).reduce((n, row) => n + row.ids.length, 0);
    send('done', { replaced, skipped, failed: jobs.length - replaced, errors, remainingRows: plan.rows });
  }

  async function activateScenario(id) {
    await savePreviewCache(true);
    scenarioPreviewCache.set(scenario, previewCache);
    scenario = id;
    catalog = validateCatalog(scenarios[scenario]);
    previews.clear(); previewCache = {}; previewCacheDirty = 0;
    colorVariables.clear(); invalidate();
    send('catalog', { catalog });
    await restorePreviewCache();
  }

  const handle = async msg => {
    if (!msg || typeof msg.type !== 'string') return;
    if (busy) { send('error', { text: 'Дождитесь завершения текущей операции.' }); return; }
    busy = true;
    send('busy', { value: true, requestType: msg.type });
    try {
      if (msg.type === 'ready') {
        try {
          const saved = await figma.clientStorage.getAsync(bundled ? 'apollo-reglyph-abm-v1-catalog' : 'apollo-reglyph-abm-v1-catalog');
          if (saved) {
            // Library classification comes from the maintained bundle, never an old saved catalogue.
            catalog = validateSupportedCatalog(Object.assign({}, saved, {observedIcons: bundled ? bundled.observedIcons || [] : saved.observedIcons || []}));
          }
        } catch (_) { catalog = scenarios[scenario] || bundled || catalog; }
        send('catalog', { catalog });
        send('selection', { count: figma.currentPage.selection.length });
        await restorePreviewCache();
      } else if (msg.type === 'catalog') {
        const next = validateSupportedCatalog(msg.catalog);
        scenarioPreviewCache.delete(scenario);
        await figma.clientStorage.setAsync(bundled ? 'apollo-reglyph-abm-v1-catalog' : 'apollo-reglyph-abm-v1-catalog', next);
        catalog = next;
        components.clear(); previews.clear(); localComponentPage = null; colorVariables.clear(); invalidate();
        send('catalog', { catalog });
        await restorePreviewCache();
      } else if (msg.type === 'reset') {
        revision += 1; snapshot = null; pendingScan = null;
        send('reset');
      } else if (msg.type === 'scan') {
        const confirmed = msg.confirmationToken !== undefined;
        let scope;
        if (confirmed) {
          const plan = pendingScan;
          if (!plan || msg.confirmationToken !== plan.token || plan.revision !== revision || !scopeMatches(plan)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
          pendingScan = null;
          scope = plan;
          if (!['default', 'services'].includes(msg.scenarioId) || !scenarios[msg.scenarioId]) throw new Error('Неизвестный сценарий.');
          const switched = msg.scenarioId !== scenario;
          if (switched) await activateScenario(msg.scenarioId);
          if (revision !== plan.revision + Number(switched) || !scopeMatches(plan)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
        } else if (msg.scenarioId && msg.scenarioId !== scenario) throw new Error('Сценарий изменился. Повторите проверку.');
        await scan(confirmed, scope);
      } else if (msg.type === 'scenario') {
        if (!Object.prototype.hasOwnProperty.call(scenarios, msg.id)) throw new Error('Неизвестный сценарий.');
        await activateScenario(msg.id);
      } else if (msg.type === 'go-to') {
        if (!snapshot || snapshot.revision !== revision || !scopeMatches(snapshot) || ![...snapshot.rows, ...snapshot.observedRows].some(r => r.ids.includes(msg.id))) throw new Error('Проверяемая область изменилась. Повторите проверку.');
        const plan = snapshot, node = await figma.getNodeByIdAsync(msg.id);
        if (!containsNode(plan, node)) throw new Error('Иконка больше не находится в проверенной области.');
        if (figma.currentPage.id !== plan.page.id) await figma.setCurrentPageAsync(plan.page);
        if (snapshot !== plan || !containsNode(plan, node)) throw new Error('Проверяемая область изменилась. Повторите проверку.');
        plan.page.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      } else if (msg.type === 'icon-preview') {
        let node, fallback, preserveColor = false;
        if (msg.key) {
          if (!catalog.newIcons.some(icon => icon.key === msg.key)) throw new Error('Неизвестная новая иконка.');
          node = await component(msg.key);preserveColor = scenario === 'services';
        } else {
          if (!snapshot || !scopeMatches(snapshot) || snapshot.revision !== revision) throw new Error('Проверяемая область изменилась. Повторите проверку.');
          const row = [...snapshot.rows, ...snapshot.observedRows].find(row => row.ids.includes(msg.id));
          if (!row) throw new Error('Иконка не входит в проверку.');
          node = await figma.getNodeByIdAsync(msg.id);preserveColor = row.category === 'logo' || row.preserveColor === true;
          if (!containsNode(snapshot, node) || !visibleInLayout(node)) throw new Error('Иконка больше не доступна в проверенной области.');
          if (row.category !== 'protected' && await insideProtectedComponent(node, n => n.getMainComponentAsync())) throw new Error('Иконка находится в исключённом компоненте.');
          fallback = await node.getMainComponentAsync();
          node = iconPreviewNode(node);
        }
        const bytes = await previewBytes(node, 300 / Math.max(node.width, node.height, 1), fallback);
        const image='data:image/png;base64,'+figma.base64Encode(bytes),monochrome=!preserveColor&&isMonochrome(node);
        if(msg.key){previews.set(msg.key,image);previewCache[msg.key]={image,monochrome,time:Date.now()};previewCacheDirty++;}
        send('icon-preview', { token: msg.token, image, monochrome });
      } else if (msg.type === 'preview') {
        if (!catalog.newIcons.some(i => i.key === msg.key)) throw new Error('Неизвестная новая иконка.');
        if(msg.refresh){previews.delete(msg.key);delete previewCache[msg.key];}
        if (!previews.has(msg.key)) {
          const target = await component(msg.key), image = await preview(target);
          previews.set(msg.key, image); previewCache[msg.key] = { image, monochrome: scenario !== 'services' && isMonochrome(target), time: Date.now() }; previewCacheDirty += 1;
        }
        send('preview', { key: msg.key, image: previews.get(msg.key), monochrome: previewCache[msg.key]?.monochrome === true });
        await savePreviewCache(msg.flush === true);
      } else if (msg.type === 'flush-previews') {
        await savePreviewCache(true);
      } else if (msg.type === 'clear-preview-cache') {
        scenarioPreviewCache.delete(scenario);previews.clear(); previewCache = {}; previewCacheDirty = 1;
        await savePreviewCache(true);
        send('preview-cache-reset');
      } else if (msg.type === 'replace') {
        await replace(msg.choices);
      }
    } catch (error) {
      if (msg.type === 'icon-preview') send('icon-preview-error', { token: msg.token, text: message(error) });
      else if (msg.type === 'preview'){components.delete(msg.key);send('preview-error', { key: msg.key, text: message(error) });}
      else send('error', { text: message(error), requestType: msg.type, code: error.code });
    } finally { busy = false; send('busy', { value: false, requestType: msg.type }); }
  };
  return {handle, invalidate, selectionChanged, busy: () => busy};
}
module.exports = {createReglyphEngine, validateCatalog, paintSignature, colorRecords, colorTransferPlan, isMonochrome, currencyArtwork};
