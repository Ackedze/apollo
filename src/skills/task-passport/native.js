const { minimalRoots } = require('../../document-audit/scoped-recheck');
const { currentPageTarget } = require('../../canvas-target');
const { resultValid, itemSource, WIRE } = require('./protocol');

const NS = 'neuroredakciya';
const TYPE = 'task-passport';
const BODY = 'apollo-body-v1';
const WIDTH = 760;
const FRAMES = new Set(['FRAME','COMPONENT','INSTANCE']);
const CONTAINERS = new Set(['SECTION','GROUP']);
const color = (r,g,b) => [{type:'SOLID',color:{r,g,b}}];
const clean = value => typeof value === 'string' ? value.replace(/\s+/g,' ').trim() : '';
const visible = node => !node.removed && node.visible !== false && node.opacity !== 0;
function visibleRoot(node) {
  for (let current = node; current && current.type !== 'PAGE'; current = current.parent) {
    if (!visible(current)) return false;
  }
  return true;
}
const fail = code => { throw Error(code); };
const box = node => node.absoluteBoundingBox;

function bounds(nodes) {
  const boxes = nodes.map(box);
  if (boxes.some(b => !b || ![b.x,b.y,b.width,b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0)) fail('TASK_PASSPORT_AREA_INVALID');
  return boxes;
}

function captureFlow(api) {
  const page = api.currentPage;
  const roots = minimalRoots(Array.from(page.selection))
    .filter(node => currentPageTarget(node,page.id) && visibleRoot(node))
    .sort((a,b) => a.id.localeCompare(b.id));
  if (!roots.length || roots.some(n => !FRAMES.has(n.type) && !CONTAINERS.has(n.type))) fail('TASK_PASSPORT_SELECTION_REQUIRED');
  const frames = [], notes = [], connectors = new Map(), screenByNode = new Map();
  let seen = 0;
  function visit(node) {
    if (++seen > 12000) fail('TASK_PASSPORT_CAPTURE_LIMIT');
    return visible(node) && node.getSharedPluginData?.(NS,'type') !== TYPE;
  }
  function findScreens(node, expandFrame) {
    if (!visit(node)) return;
    const children = node.children || [];
    if (FRAMES.has(node.type)) {
      const nested = node.type === 'FRAME' && expandFrame && children.filter(c => {
        const b = box(c);
        return FRAMES.has(c.type) && visible(c) && b?.width >= 300 && b?.height >= 300;
      }).length >= 2;
      if (!nested) { frames.push(node); return; }
    }
    if (node.type === 'CONNECTOR') connectors.set(node.id,node);
    if (node.type === 'TEXT' && clean(node.characters)) notes.push(clean(node.characters).slice(0,400));
    if (FRAMES.has(node.type) || CONTAINERS.has(node.type)) {
      for (const child of children) findScreens(child,true);
    }
  }
  for (const root of roots) findScreens(root,roots.length === 1);
  if (!frames.length) fail('TASK_PASSPORT_SELECTION_REQUIRED');
  if (frames.length > 24 || notes.length > 40) fail('TASK_PASSPORT_CAPTURE_LIMIT');
  const ordered = bounds(frames).map((b,i) => ({node:frames[i], b}))
    .sort((a,b) => a.b.x+a.b.y-b.b.x-b.b.y || a.node.id.localeCompare(b.node.id));
  const screens = [], reactions = [];

  for (const [index, {node,b}] of ordered.entries()) {
    const id = 's'+(index+1), texts = [], buttons = new Map(), components = new Set();
    function scan(layer, button) {
      if (!visit(layer)) return;
      screenByNode.set(layer.id,id);
      if (layer.type === 'INSTANCE' && /^(?:\[[DM]\]|Corporate)|Header|SideMenu|NavigationBar|HomeIndicator|\b\w+View\b/i.test(layer.name)) {
        components.add(clean(layer.name).slice(0,120));
      }
      if (layer !== node && FRAMES.has(layer.type) && /button|btn|кнопк|cta/i.test(layer.name)) button = layer.id;
      if (layer.type === 'TEXT') {
        const value = clean(layer.characters);
        if (value) {
          const bounds = box(layer);
          texts.push({value,x:bounds?.x ?? b.x,y:bounds?.y ?? b.y});
          if (button && !buttons.has(button)) buttons.set(button,value.slice(0,400));
        }
      }
      if (layer.type === 'CONNECTOR') connectors.set(layer.id,layer);
      for (const reaction of layer.reactions || []) {
        for (const action of reaction.actions || [reaction.action]) {
          if (action?.type === 'NODE' && action.destinationId) reactions.push([id,action.destinationId]);
        }
      }
      for (const child of layer.children || []) scan(child,button);
    }
    scan(node,null);
    const orderedTexts = texts.sort((a,b) => a.y-b.y || a.x-b.x)
      .flatMap(({value}) => (value.match(/.{1,200}/gu) || []).map(part => part.trim()).filter(Boolean));
    if (orderedTexts.length > 160 || buttons.size > 40 || components.size > 40) fail('TASK_PASSPORT_CAPTURE_LIMIT');
    screens.push({id,name:clean(node.name).slice(0,240) || 'Экран '+(index+1),
      box:[b.x,b.y,b.width,b.height].map(Math.round), texts:orderedTexts,
      buttons:Array.from(new Set(buttons.values())),components:Array.from(components)});
  }
  // Top-level arrows can be outside a selected section. Only their endpoints are used.
  for (const layer of page.children) if (layer.type === 'CONNECTOR' && visible(layer)) connectors.set(layer.id,layer);
  const links = new Map();
  function add(from,to,signal) {
    if (from !== to && (from || to)) links.set([from,to,signal].join(':'),{from,to,signal});
  }
  for (const [from,dest] of reactions) if (screenByNode.has(dest)) add(from,screenByNode.get(dest),'prototype');
  for (const line of connectors.values()) {
    add(screenByNode.get(line.connectorStart?.endpointNodeId) || null,
      screenByNode.get(line.connectorEnd?.endpointNodeId) || null,'connector');
  }
  const name = roots.length === 1 ? clean(roots[0].name).slice(0,240) : 'Выделение · '+screens.length+' экранов';
  const snapshot = {name:name || 'Выбранный флоу',screens,links:Array.from(links.values()),notes};
  if (links.size > 160 || JSON.stringify(snapshot).length > 65000) fail('TASK_PASSPORT_CAPTURE_LIMIT');
  return {page,roots,key:roots.map(n => n.id).join(','),screenIds:ordered.map(({node}) => node.id),snapshot};
}

function ownFrame(page, key) {
  const found = page.children.filter(node => node.type === 'FRAME' &&
    node.getSharedPluginData(NS,'type') === TYPE && node.getSharedPluginData(NS,'flow') === key);
  if (found.length > 1) fail('TASK_PASSPORT_FRAME_CONFLICT');
  return found[0] || null;
}

function render(api, capture, result, fonts) {
  const {page,key,snapshot,roots} = capture;
  const existing = ownFrame(page,key);
  if (existing?.locked) fail('TASK_PASSPORT_WRITE_FAILED');
  const previous = existing?.children.find(node => node.getSharedPluginData(NS,'body') === BODY);
  if (existing && !previous) fail('TASK_PASSPORT_FRAME_CONFLICT');
  const boundsOfFlow = bounds(roots);
  let frame = existing, body = null;
  function stack(name, spacing) {
    const node = api.createFrame();
    node.name = name;
    node.layoutMode = 'VERTICAL';
    node.primaryAxisSizingMode = 'AUTO';
    node.counterAxisSizingMode = 'FIXED';
    node.itemSpacing = spacing;
    node.fills = [];
    return node;
  }
  function line(parent, text, size, emphasis, muted = false) {
    const node = api.createText();
    parent.appendChild(node);
    node.fontName = emphasis ? fonts.medium : fonts.regular;
    node.characters = text;
    node.fontSize = size;
    node.fills = muted ? color(.37,.38,.42) : color(.09,.09,.11);
    node.textAutoResize = 'HEIGHT';
    node.layoutSizingHorizontal = 'FILL';
  }
  try {
    body = stack('Содержание паспорта',12);
    body.setSharedPluginData(NS,'body',BODY);
    body.resize(existing ? existing.width : WIDTH,1);
    body.layoutSizingVertical = 'HUG';
    body.paddingLeft = body.paddingRight = body.paddingTop = body.paddingBottom = 32;
    line(body,'Паспорт задачи',28,true);
    line(body,snapshot.name,16,false,true);
    for (const section of result.sections) {
      const container = stack(section.title,8);
      body.appendChild(container);
      container.layoutSizingHorizontal = 'FILL';
      container.paddingTop = 10;
      line(container,section.title,18,true);
      for (const row of section.rows) {
        line(container,row.label,13,true,true);
        for (const item of row.items) {
          const source = itemSource(item);
          line(container,item.value,15,false);
          if (source) line(container,source,12,false,true);
        }
      }
    }
    if (!frame) {
      frame = stack('Паспорт задачи — '+snapshot.name,0);
      frame.resize(WIDTH,1);
      frame.layoutSizingVertical = 'HUG';
      frame.x = Math.min(...boundsOfFlow.map(b => b.x))-WIDTH-96;
      frame.y = Math.min(...boundsOfFlow.map(b => b.y));
      frame.cornerRadius = 24;
      frame.fills = color(1,1,1);
      frame.strokes = color(.9,.9,.92);
      frame.setSharedPluginData(NS,'type',TYPE);
      frame.setSharedPluginData(NS,'flow',key);
    }
    if (previous) frame.insertChild(frame.children.indexOf(previous),body);
    else frame.appendChild(body);
    if (body.parent !== frame || frame.parent !== page || frame.removed || !body.children.length) fail('TASK_PASSPORT_WRITE_FAILED');
    if (previous) previous.remove();
    return {frameId:frame.id,updated:!!existing};
  } catch (error) {
    if (!existing && frame && !frame.removed) frame.remove();
    if (body && !body.removed) body.remove();
    throw error;
  }
}

function createTaskPassportBridge({api,hash,post,isBusy = () => false,onMutation = () => {}}) {
  let session = null, saving = false;
  const digest = capture => hash([capture.screenIds,capture.snapshot]);
  async function respond(message) {
    const {requestId, operation, payload} = message;
    const type = 'task-passport-reply';
    try {
      if (message.schemaVersion !== WIRE) fail('TASK_PASSPORT_INCOMPATIBLE');
      if (saving || (operation !== 'capture' && isBusy())) fail('TASK_PASSPORT_BUSY');
      if (operation === 'capture') {
        session = null;
        const capture = captureFlow(api);
        session = {id:requestId,capture,digest:digest(capture)};
        post({type,requestId,result:{captureId:requestId,snapshot:capture.snapshot}});
        return;
      }
      if (operation !== 'save' || !session || payload?.captureId !== session.id ||
          !resultValid(payload.result) || payload.result.status !== 'draft') fail('TASK_PASSPORT_STALE');
      const expected = session;
      saving = true;
      try {
        const fonts = { regular:{family:'Inter',style:'Regular'}, medium:{family:'Inter',style:'Medium'} };
        await Promise.all(Object.values(fonts).map(font => api.loadFontAsync(font)));
        let current;
        try { current = captureFlow(api); } catch { fail('TASK_PASSPORT_STALE'); }
        if (current.page.id !== expected.capture.page.id || current.key !== expected.capture.key ||
            digest(current) !== expected.digest || session !== expected || isBusy()) fail('TASK_PASSPORT_STALE');
        const result = render(api,current,payload.result,fonts);
        onMutation();
        post({type,requestId,result});
      } finally { saving = false; }
    } catch (error) {
      post({type,requestId,error:/^TASK_PASSPORT_[A-Z_]+$/.test(error?.message || '') ? error.message : 'TASK_PASSPORT_WRITE_FAILED'});
    }
  }
  return {
    accept(message) {
      if (message?.type !== 'task-passport-request') return false;
      if (typeof message.requestId === 'string' && /^[a-z0-9-]{8,120}$/i.test(message.requestId)) void respond(message);
      return true;
    },
    busy: () => saving,
  };
}

module.exports = { createTaskPassportBridge, captureFlow };
