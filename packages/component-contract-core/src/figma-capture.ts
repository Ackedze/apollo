import { captureResolvedEmptyText } from './empty-text-capture';
import { intrinsicBounds, matchesComponentIdentity, materializeEffectiveBaseline } from './instance-validation';
import { resolveCaptureRepresentation } from './capture-representation';
import { captureSupplementalFacts } from './capture-facts';
import { captureSceneTopology } from './capture-topology';
import { captureInstanceSourceIdentities, type InstanceSourceIdentity, type PristineInstanceSource } from './instance-source-identity';
import { confirmedNativeSlotCaptureBoundaries, type NativeSlotCaptureBoundary } from './native-slot-capture';
import { captureResolvedVariableModes } from './variable-mode-facts';
import { captureHostVariableUsage, type HostVariableUsage } from './host-context-variable-modes';
import { capturePropertyActivity } from './property-applicability';
import { captureGradientPaintDetails } from './gradient-paint-facts';
import { captureEffectDetails } from './effect-facts';
import { captureTextStyleEvidence } from './text-style-facts';
import { captureTextDecoration } from './text-decoration-facts';
import { captureTextFillEvidence } from './text-binding-identity';
import { COMPONENT_DEPENDENCY_CAPTURE_LIMIT, DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT } from './component-dependencies';
import { dependencyCaptureFailureDetails, type DependencyCaptureStage } from './dependency-capture-diagnostics';
import { captureVariantReference } from './variant-facts';
import { snapshotPaths } from './snapshot-topology';
import { captureTransitionContext } from './transition-capture';
import { INSTANCE_CONTENT_REFERENCE_LIMIT, materializeInstanceContentReferences, planInstanceContentReferences } from './instance-content-reference';
import { planNestedInstanceContentReferences } from './nested-instance-content-reference';
import type { InstanceBoundary } from './instance-boundaries';
import type { AnatomyNode, JsonValue, PreviewSnapshot, ComponentRepresentation } from './types';
import type { NativeSlotCapturePlan } from './native-slot-capture';
import { configureInstanceMainAliases } from './instance-main-aliases';

export type CaptureSelectionOptions = {
  componentKey: string; acceptedComponentKeys: string[]; allowedComponentProperties: string[];
  platform: string; manualSourceHash: string; captureTransitionContext?: boolean; expectedRootNodeId?: string;
  componentDependencyKeys?: string[]; directChildDependenciesVersion?:1; representations?: ComponentRepresentation[]; nativeSlotCapturePlan?: NativeSlotCapturePlan;
  instanceMainComponentAliasesVersion?:1; includePreview?:boolean;
  onTiming?:(stage:string,durationMs:number)=>void;
};
const transitionSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let transitionSequence = 0;

export function slug(value: string): string {
  return value
    .replace(/^\s*(?:❌|🔒|🔄)?\s*\[[DMT]\]\s*/u, '')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'target';
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function paintFacts(paints: readonly Paint[] | PluginAPI['mixed']): JsonValue[] | null {
  if (paints === figma.mixed || !Array.isArray(paints)) return null;
  return paints.map((paint) => {
    const fact: Record<string, JsonValue> = {
      type: paint.type,
      visible: !('visible' in paint) || paint.visible !== false,
      opacity: 'opacity' in paint ? (finite(paint.opacity) ?? 1) : 1,
    };
    const bound = (paint as SolidPaint & { boundVariables?: Record<string, VariableAlias> }).boundVariables;
    if (bound?.color?.id) fact.tokenId = bound.color.id;
    if (paint.type === 'SOLID') {
      fact.color = {
        r: Math.round(paint.color.r * 255),
        g: Math.round(paint.color.g * 255),
        b: Math.round(paint.color.b * 255),
      };
    }
    Object.assign(fact, captureGradientPaintDetails(paint));
    return fact;
  });
}

function variableBindings(node: SceneNode): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  const boundVariables = (node as SceneNode & { boundVariables?: Record<string, VariableAlias | VariableAlias[]> }).boundVariables;
  if (!boundVariables) return result;
  for (const [field, value] of Object.entries(boundVariables)) {
    const ids = (Array.isArray(value) ? value : [value]).map((alias) => {
      let candidate: unknown = alias;
      while (candidate && typeof candidate === 'object' && 'id' in candidate) {
        candidate = (candidate as { id: unknown }).id;
      }
      return String(candidate);
    });
    result[field.replace(/\./g, '_')] = {
      required: true,
      tokenIds: ids,
    };
  }
  return result;
}

function layoutFacts(node: SceneNode): Record<string, JsonValue> {
  const layout: Record<string, JsonValue> = {};
  if ('layoutMode' in node) layout.mode = String(node.layoutMode);
  if ('itemSpacing' in node) layout.itemSpacing = finite(node.itemSpacing) ?? 0;
  if ('paddingTop' in node) {
    layout.padding = {
      top: finite(node.paddingTop) ?? 0,
      right: finite(node.paddingRight) ?? 0,
      bottom: finite(node.paddingBottom) ?? 0,
      left: finite(node.paddingLeft) ?? 0,
      horizontal: (finite(node.paddingLeft) ?? 0) + (finite(node.paddingRight) ?? 0),
      vertical: (finite(node.paddingTop) ?? 0) + (finite(node.paddingBottom) ?? 0),
    };
  }
  if ('primaryAxisAlignItems' in node) layout.primaryAxisAlignItems = String(node.primaryAxisAlignItems);
  if ('counterAxisAlignItems' in node) layout.counterAxisAlignItems = String(node.counterAxisAlignItems);
  if ('layoutSizingHorizontal' in node) layout.sizingHorizontal = String(node.layoutSizingHorizontal);
  if ('layoutSizingVertical' in node) layout.sizingVertical = String(node.layoutSizingVertical);
  if ('gridStyleId' in node) layout.gridStyleId = String(node.gridStyleId);
  if ('clipsContent' in node) layout.clipsContent = node.clipsContent;
  return layout;
}

function appearanceFacts(node: SceneNode): Record<string, JsonValue> {
  const appearance: Record<string, JsonValue> = {};
  if ('fills' in node) appearance.fill = paintFacts(node.fills);
  if ('fillStyleId' in node && node.fillStyleId !== figma.mixed) appearance.fillStyleId = String(node.fillStyleId);
  if ('strokes' in node && Array.isArray(node.strokes)) appearance.stroke = paintFacts(node.strokes);
  if ('strokeStyleId' in node) appearance.strokeStyleId = String(node.strokeStyleId);
  if ('strokeWeight' in node) {
    if (node.strokeWeight !== figma.mixed) appearance.strokeWeight = finite(node.strokeWeight) ?? 0;
    else {
      const sides = node as SceneNode & {
        strokeTopWeight?: number;
        strokeRightWeight?: number;
        strokeBottomWeight?: number;
        strokeLeftWeight?: number;
      };
      appearance.strokeWeight = {
        top: finite(sides.strokeTopWeight) ?? 0,
        right: finite(sides.strokeRightWeight) ?? 0,
        bottom: finite(sides.strokeBottomWeight) ?? 0,
        left: finite(sides.strokeLeftWeight) ?? 0,
      };
    }
  }
  if ('strokeAlign' in node) appearance.strokeAlign = String(node.strokeAlign);
  if ('dashPattern' in node) appearance.dashPattern = node.dashPattern.slice();
  if ('opacity' in node) appearance.opacity = finite(node.opacity) ?? 1;
  if ('blendMode' in node && typeof node.blendMode === 'string') appearance.blendMode = node.blendMode;
  if ('effects' in node) {
    appearance.effects = node.effects.map((effect) => ({ type: effect.type, visible: effect.visible !== false })) as JsonValue;
    const details = captureEffectDetails(node.effects, 'effectStyleId' in node ? node.effectStyleId : undefined);
    if (details !== undefined) appearance.effectDetailsV1 = details;
  }
  if ('effectStyleId' in node) appearance.effectStyleId = String(node.effectStyleId);
  if ('cornerRadius' in node) {
    if (node.cornerRadius === figma.mixed) {
      const corners = node as SceneNode & {
        topLeftRadius?: number;
        topRightRadius?: number;
        bottomRightRadius?: number;
        bottomLeftRadius?: number;
      };
      appearance.radius = {
        topLeft: finite(corners.topLeftRadius) ?? 0,
        topRight: finite(corners.topRightRadius) ?? 0,
        bottomRight: finite(corners.bottomRightRadius) ?? 0,
        bottomLeft: finite(corners.bottomLeftRadius) ?? 0,
      };
    } else {
      appearance.radius = finite(node.cornerRadius) ?? 0;
    }
  }
  if ('textStyleId' in node && node.textStyleId !== figma.mixed) {
    appearance.typography = { styleId: String(node.textStyleId) };
  }
  return appearance;
}

function componentFacts(node: SceneNode, identity?: Record<string, JsonValue>, sourceIdentity?: InstanceSourceIdentity): Record<string, JsonValue> {
  const propertyReferences = Object.values(node.componentPropertyReferences || {}).filter((value): value is string => typeof value === 'string');
  const propertyReferenceBindings = Object.fromEntries(Object.entries(node.componentPropertyReferences || {}).filter((entry): entry is [string,string]=>typeof entry[1] === 'string'));
  if (node.type !== 'INSTANCE') {
    const facts: Record<string, JsonValue> = { propertyReferences, propertyReferenceBindings };
    if (sourceIdentity) facts.sourceIdentity = sourceIdentity;
    return facts;
  }
  const properties: Record<string, JsonValue> = {};
  const propertyTypes: Record<string, JsonValue> = {};
  for (const [name, property] of Object.entries(node.componentProperties)) {
    properties[name] = property.value as JsonValue;
    propertyTypes[name] = property.type;
  }
  const facts: Record<string, JsonValue> = { properties, propertyTypes, propertyReferences, propertyReferenceBindings, identity:identity || {} };
  if (sourceIdentity) facts.sourceIdentity = sourceIdentity;
  return facts;
}

function textFacts(node: SceneNode): Record<string, JsonValue> {
  if (node.type !== 'TEXT') return {};
  const text: Record<string, JsonValue> = { characters: node.characters };
  if (node.fontSize !== figma.mixed) text.fontSize = node.fontSize;
  if (node.fontName !== figma.mixed) {
    text.fontName = { family: node.fontName.family, style: node.fontName.style };
  }
  if (node.lineHeight !== figma.mixed) text.lineHeight = node.lineHeight as unknown as JsonValue;
  if (node.letterSpacing !== figma.mixed) text.letterSpacing = node.letterSpacing as unknown as JsonValue;
  if (node.textCase !== figma.mixed) text.case = node.textCase;
  const decoration = captureTextDecoration(node);
  if (decoration !== undefined) text.decoration = decoration;
  return text;
}

async function collectSceneNodes(root: SceneNode, platform: string, modes: Record<string, string>,
  captureScope?: {manualSourceHash:string;boundaries:NativeSlotCaptureBoundary[]}, projection: 'full'|'anatomy'|'identity'='full'): Promise<{
  anatomy: AnatomyNode[];
  snapshot: PreviewSnapshot;
  nativeInstances: Map<string, InstanceNode>;
}> {
  const identityOnly = projection === 'identity';
  const roleCounts = new Map<string, number>();
  const omissions:NonNullable<NonNullable<PreviewSnapshot['source']>['nativeSlotCaptureScope']>['omissions']=[];
  const topology=captureSceneTopology(root,500,(entry,index,all)=>{
    if(entry.parentIndex!==0 || entry.type!=='SLOT' || !captureScope)return false;
    const node=entry.node as SceneNode,owner=all[0].node as SceneNode;
    const property=(node.componentPropertyReferences as Record<string,string>|undefined)?.slotContentId;
    const path=entry.path.split(' / ').slice(1).join(' / ');
    const candidates=captureScope.boundaries.filter(b=>b.path===path && b.property===property);
    if(typeof property!=='string' || candidates.length!==1 || owner.type!=='INSTANCE' || String(owner.componentProperties[property]?.type)!=='SLOT'
      || node.parent?.id!==owner.id || node.parent?.type!=='INSTANCE')return false;
    // Read the direct frontier only; never descend into caller-owned content.
    const consumers=(all[0].observedChildren||[]).filter(child=>String(child.type)==='SLOT'
      && ((child as SceneNode).componentPropertyReferences as Record<string,string>|undefined)?.slotContentId===property);
    if(consumers.length!==1 || consumers[0].id!==entry.figmaNodeId)return false;
    omissions.push({nodeId:`preview:${index}`,targetId:candidates[0].targetId,property,path});return true;
  });
  const entries = topology.entries.map(entry=>{
    const baseRole = slug(entry.name);
    const count = (roleCounts.get(baseRole) || 0) + 1;
    roleCounts.set(baseRole, count);
    const role = count === 1 ? baseRole : `${baseRole}-${count}`;
    return {...entry,node:entry.node as SceneNode,role};
  });
  const collectionIds = new Set(identityOnly ? [] : entries.flatMap(entry => Object.keys(entry.node.resolvedVariableModes || {})));
  const resolvedCollections = (await Promise.all(Array.from(collectionIds).map(async id => {
    try { return await figma.variables.getVariableCollectionByIdAsync(id); }
    catch { return null; }
  }))).filter((collection): collection is VariableCollection => Boolean(collection));
  const identities = new Map<string, Record<string, JsonValue>>();
  const mains = new Map<string, ComponentNode>();
  const instances = entries.filter(entry=>entry.node.type === 'INSTANCE');
  let nextIdentity = 0;
  await Promise.all(Array.from({length:Math.min(6,instances.length)},async()=>{
    while (nextIdentity < instances.length) {
      const instance = instances[nextIdentity++].node as InstanceNode;
      try {
        const main = await instance.getMainComponentAsync();
        if (main) mains.set(instance.id, main);
        if (main) identities.set(instance.id,{componentKey:main.key,mainComponentId:main.id,
          ...(main.parent?.type === 'COMPONENT_SET' ? {componentSetKey:main.parent.key} : {})});
      } catch { /* Unknown identity stays explicit; never fall back to layer names. */ }
    }
  }));
  const pristineSources = new Map<string, PristineInstanceSource>();
  const sourceCapture: Array<{mainComponentId:string;componentKey:string;status:string;sourceInstanceId?:string;reason?:string}> = [];
  if (topology.complete) {
    const requested = new Map<string, ComponentNode>();
    for (const entry of topology.entries) {
      if (entry.parentIndex === null) continue;
      // A rename can make originally equal names unique. Capture every used
      // imported owner once so identity availability does not depend on names.
      let ownerIndex: number | null = entry.parentIndex;
      while (ownerIndex !== null && topology.entries[ownerIndex].type !== 'INSTANCE') ownerIndex=topology.entries[ownerIndex].parentIndex;
      const main=ownerIndex===null?undefined:mains.get(topology.entries[ownerIndex].figmaNodeId);
      if (main?.remote) requested.set(main.id,main);
    }
    for (const main of requested.values()) {
      let pristine: InstanceNode | undefined;
      const diagnostic: {mainComponentId:string;componentKey:string;status:string;sourceInstanceId?:string;reason?:string}={mainComponentId:main.id,componentKey:main.key,status:'unavailable'};
      try {
        pristine=main.createInstance();
        diagnostic.sourceInstanceId=pristine.id;
        const selected=await pristine.getMainComponentAsync();
        if (!selected || selected.id!==main.id || selected.key!==main.key) diagnostic.reason='pristine-source-identity-mismatch';
        else {
          const sourceTopology=captureSceneTopology(pristine,500,(entry,index)=>index>0 && (entry.type==='INSTANCE'||entry.type==='SLOT'));
          if (!sourceTopology.complete) diagnostic.reason='incomplete-pristine-source-topology';
          else {pristineSources.set(main.id,{mainComponentId:main.id,componentKey:main.key,topology:sourceTopology});diagnostic.status='captured';}
        }
      } catch {diagnostic.reason='pristine-source-capture-unavailable';}
      finally {pristine?.remove();}
      sourceCapture.push(diagnostic);
    }
  }
  const sourceIdentities = topology.complete ? captureInstanceSourceIdentities(topology.entries, mains, pristineSources, true) : new Map<string, InstanceSourceIdentity>();
  const roleToId = new Map(entries.map((entry, index) => [entry.role, `preview:${index}`]));
  const styleKeys = new Map<string, Promise<string | undefined>>();
  const resolveStyleKey = (id: string) => {
    if (!styleKeys.has(id)) styleKeys.set(id, figma.getStyleByIdAsync(id).then(s => s?.type === 'TEXT' ? s.key : undefined).catch(() => undefined));
    return styleKeys.get(id)!;
  };
  const styleEvidence = new Map<string, Record<string, JsonValue>>();
  const fillEvidence = new Map<string, Record<string, JsonValue>>();
  const variableKeys = new Map<string, Promise<string | undefined>>();
  const resolveVariableKey = (id: string) => {
    if (!variableKeys.has(id)) variableKeys.set(id, figma.variables.getVariableByIdAsync(id)
      .then(v=>v?.resolvedType==='COLOR'?v.key:undefined).catch(()=>undefined));
    return variableKeys.get(id)!;
  };
  const textEntries = identityOnly ? [] : entries.filter(entry => entry.node.type === 'TEXT');
  let nextText = 0;
  const emptyTextEvidence = new Map<string, Awaited<ReturnType<typeof captureResolvedEmptyText>>>();
  // Only independent reads overlap; pristine instance creation stays sequential.
  await Promise.all(Array.from({length:Math.min(6,textEntries.length)}, async () => {
    while (nextText < textEntries.length) {
      const node = textEntries[nextText++].node as TextNode;
      emptyTextEvidence.set(node.id, await captureResolvedEmptyText(node, figma.mixed));
      styleEvidence.set(node.id, await captureTextStyleEvidence(node, resolveStyleKey));
      fillEvidence.set(node.id, await captureTextFillEvidence(node, paintFacts, resolveVariableKey));
    }
  }));

  const usageEvidence = new Map<string, HostVariableUsage>();
  const bindingVariables = new Map<string, Promise<{variable:Variable;collection:VariableCollection} | undefined>>();
  const resolveBindingCollection = async (id: string, modes: Record<string, unknown>) => {
    if (!bindingVariables.has(id)) bindingVariables.set(id, (async () => {
      try {
        const variable = await figma.variables.getVariableByIdAsync(id);
        if (!variable) return;
        const collection = resolvedCollections.find(c => c.id === variable.variableCollectionId)
          || await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        if (!collection || !/^[a-f0-9]{40}$/i.test(collection.key)) return;
        return {variable,collection};
      } catch { return; }
    })());
    const proof = await bindingVariables.get(id)!;
    if (!proof) return;
    const mode = modes[proof.collection.id], values = proof.variable.valuesByMode;
    if (typeof mode !== 'string' || !values || !Object.prototype.hasOwnProperty.call(values,mode)) return;
    const value = values[mode];
    const alias = value && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS';
    if (alias && (!('id' in value) || typeof value.id !== 'string' || !value.id)) return;
    if (!alias && !['string','boolean','number'].includes(typeof value)
      && !(value && typeof value === 'object' && 'r' in value && 'g' in value && 'b' in value)) return;
    return {collectionId:proof.collection.id,collectionKey:proof.collection.key,
      referencedVariableIds:alias ? [(value as VariableAlias).id] : []};
  };
  let nextUsage = 0;
  await Promise.all(Array.from({length:identityOnly ? 0 : Math.min(6,entries.length)},async () => {
    while (nextUsage < entries.length) {
      const entry = entries[nextUsage++];
      usageEvidence.set(entry.node.id,await captureHostVariableUsage(entry.node,resolveBindingCollection));
    }
  }));

  const anatomy: AnatomyNode[] = entries.map((entry, index) => {
    const childIds = entry.childIndexes.map(index=>`preview:${index}`);
    // Path resolution proves topology and provenance, without recapturing visual facts.
    if (identityOnly) {
      const component:Record<string,JsonValue> = {};
      const identity=identities.get(entry.node.id), sourceIdentity=sourceIdentities.get(entry.node.id);
      if (identity) component.identity=identity;
      if (sourceIdentity) component.sourceIdentity=sourceIdentity;
      return {
        id:`preview:${index}`,figmaNodeId:entry.figmaNodeId,parentId:entry.parentIndex===null?null:`preview:${entry.parentIndex}`,
        name:entry.name,type:entry.type,path:entry.path,semanticRole:entry.role,visible:entry.node.visible,
        order:index,depth:entry.depth,childIds,properties:{component},unknownFacts:[],
      };
    }
    const supplemental = captureSupplementalFacts(entry.node as unknown as Record<string, unknown>, figma.mixed);
    const modeFacts = captureResolvedVariableModes(entry.node.resolvedVariableModes || {}, resolvedCollections);
    let bindings: Record<string, JsonValue> = {}, bindingsUnreadable = false;
    try { bindings = variableBindings(entry.node); } catch { bindingsUnreadable = true; }
    const properties: Record<string, JsonValue> = {
      layout: layoutFacts(entry.node),
      appearance: appearanceFacts(entry.node),
      variable: { bindings, modes: modeFacts.modes, modeCatalog: modeFacts.modeCatalog },
      hostVariableUsageV1: usageEvidence.get(entry.node.id)! as unknown as JsonValue,
      component: componentFacts(entry.node,identities.get(entry.node.id),sourceIdentities.get(entry.node.id)),
      text: Object.assign({}, textFacts(entry.node), supplemental.text, emptyTextEvidence.get(entry.node.id)?.text),
      ...(styleEvidence.has(entry.node.id) ? {textStyleEvidenceV1: styleEvidence.get(entry.node.id)!} : {}),
      ...(fillEvidence.has(entry.node.id) ? {textFillEvidenceV1: fillEvidence.get(entry.node.id)!} : {}),
      parent: supplemental.parent,
      propertyActivityV1: capturePropertyActivity(entry.node as unknown as Record<string, unknown>),
      bounds: {
        x: finite(entry.node.x) ?? 0,
        y: finite(entry.node.y) ?? 0,
        ...intrinsicBounds(entry.node as unknown as Record<string, unknown>),
      },
      resolvedModes: { ...entry.node.resolvedVariableModes },
    };
    return {
      id: `preview:${index}`,
      figmaNodeId: entry.figmaNodeId,
      parentId: entry.parentIndex===null?null:`preview:${entry.parentIndex}`,
      name: entry.name,
      type: entry.type,
      path: entry.path,
      semanticRole: entry.role,
      visible: entry.node.visible,
      order: index,
      depth: entry.depth,
      childIds,
      properties,
      unknownFacts: [...supplemental.unknownFacts, ...modeFacts.unknownFacts, ...(bindingsUnreadable ? ['variable.bindings'] : []), ...(emptyTextEvidence.get(entry.node.id)?.unknownFacts || [])],
    };
  });

  const relations: Record<string, string> = {};
  if (projection === 'full') roleToId.forEach((id, role) => { relations[role] = id; });
  const nodes = anatomy.map((entry) => {
    const facts = entry.properties;
    if (projection !== 'full') return {id:entry.id,parentId:entry.parentId,childIds:entry.childIds,name:entry.name,type:entry.type,
      semantic:{role:entry.semanticRole,path:entry.path},component:facts.component||{}};
    return {
      id: entry.id,
      parentId: entry.parentId,
      childIds: entry.childIds,
      order: entry.order,
      name: entry.name,
      type: entry.type,
      visible: entry.visible,
      semantic: { role: entry.semanticRole, path: entry.path },
      component: facts.component || {},
      layout: facts.layout || {},
      appearance: facts.appearance || {},
      variable: facts.variable || {},
      hostVariableUsageV1: facts.hostVariableUsageV1,
      text: facts.text || {},
      ...(facts.textStyleEvidenceV1 ? {textStyleEvidenceV1: facts.textStyleEvidenceV1} : {}),
      ...(facts.textFillEvidenceV1 ? {textFillEvidenceV1: facts.textFillEvidenceV1} : {}),
      parent: facts.parent || {},
      propertyActivityV1: facts.propertyActivityV1 || {},
      bounds: facts.bounds || {},
      resolvedModes: facts.resolvedModes || {},
      baseline: {
        effective: {
          layout: facts.layout || {},
          appearance: facts.appearance || {},
          variable: facts.variable || {},
          component: facts.component || {},
          text: facts.text || {},
          visible: entry.visible,
          bounds: intrinsicBounds(facts.bounds),
          propertyActivityV1: facts.propertyActivityV1 || {},
        },
      },
      relations,
      unknownFacts: entry.unknownFacts,
    };
  });

  for(const entry of entries)if(entry.node.id!==entry.figmaNodeId || entry.node.type!==entry.type || entry.node.name!==entry.name){
    topology.issues.push({kind:'identity-changed',nodeId:entry.figmaNodeId,path:entry.path});topology.complete=false;
  }
  const result: {anatomy:AnatomyNode[];snapshot:PreviewSnapshot} = {
    anatomy,
    snapshot: {
      schemaVersion: 'apollo.predicate-snapshot.v2',
      generatedAt: new Date().toISOString(),
      source: {
        ...(identityOnly?{}:{geometryCaptureVersion:1 as const,gradientPaintCaptureVersion:1 as const,propertyReferenceIdentityVersion:1 as const}),
        instanceIdentityVersion: 1,
        instanceSourceIdentityVersion: 1,
        occurrenceAddressVersion:1,
        instanceSourceIdentityCapture: {version:1,owners:sourceCapture},
        fileKey: figma.fileKey,
        fileName: figma.root.name,
        pageId: (() => {
          let parent: BaseNode | null = root.parent;
          while (parent && parent.type !== 'PAGE') parent = parent.parent;
          return parent?.id || figma.currentPage.id;
        })(),
        rootNodeId: root.id,
        truncated: !topology.complete,
        captureTopology:{version:1,complete:topology.complete,limitReached:topology.limitReached,issues:topology.issues},
        ...(omissions.length && captureScope?{nativeSlotCaptureScope:{version:1 as const,manualSourceHash:captureScope.manualSourceHash,omissions}}:{}),
        nodeLimit: 500,
      },
      selection: anatomy.length ? [anatomy[0].id] : [],
      context: { platform, modes, unknownFacts: [] },
      nodes,
    },
  };
  {
    const paths = snapshotPaths(result.snapshot as PreviewSnapshot);
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    if (paths) for (const entry of anatomy) {
      const path = paths.get(entry.id);
      if (path !== undefined) {
        entry.path = [root.name,path].filter(Boolean).join(' / ');
        const node = nodesById.get(entry.id)!;
        node.semantic.path = entry.path;
      }
    }
  }
  const nativeInstances = new Map<string, InstanceNode>();
  if (topology.complete) for (const entry of entries) {
    if (entry.observedChildren) {
      let children: SceneNode[];
      try { children = 'children' in entry.node ? Array.from(entry.node.children) : []; }
      catch {
        topology.complete = false;
        topology.issues.push({kind:'unreadable-node',nodeId:entry.figmaNodeId,path:entry.path});
        result.snapshot.source!.truncated = true;
        result.snapshot.source!.captureTopology!.complete = false;
        break;
      }
      if (children.length !== entry.childIndexes.length || children.some((child,index) => child.id !== entries[entry.childIndexes[index]].figmaNodeId)) {
        topology.complete = false;
        topology.issues.push({kind:'identity-changed',nodeId:entry.figmaNodeId,path:entry.path});
        result.snapshot.source!.truncated = true;
        result.snapshot.source!.captureTopology!.complete = false;
        break;
      }
    }
    if (entry.node.type === 'INSTANCE') nativeInstances.set(entry.figmaNodeId, entry.node as InstanceNode);
  }
  if (!topology.complete) nativeInstances.clear();
  return {anatomy:result.anatomy,snapshot:result.snapshot,nativeInstances};
}

export async function collectNodes(root: SceneNode, platform: string, modes: Record<string, string>,
  captureScope?: {manualSourceHash:string;boundaries:NativeSlotCaptureBoundary[]}): Promise<{anatomy:AnatomyNode[];snapshot:PreviewSnapshot}> {
  const result = await collectSceneNodes(root, platform, modes, captureScope);
  return {anatomy:result.anatomy,snapshot:result.snapshot};
}

/** Freshness reads keep every native fact; only unused snapshot projection is omitted. */
export async function collectAnatomy(root:SceneNode,platform:string,modes:Record<string,string>,
  captureScope?:{manualSourceHash:string;boundaries:NativeSlotCaptureBoundary[]}) {
  const result=await collectSceneNodes(root,platform,modes,captureScope,'anatomy');
  return {anatomy:result.anatomy};
}

export async function applyModes(instance: InstanceNode, modes: Record<string, string>): Promise<string[]> {
  const warnings: string[] = [];
  for (const [collectionId, modeId] of Object.entries(modes)) {
    try {
      const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
      if (collection) instance.setExplicitVariableModeForCollection(collection, modeId);
      else warnings.push(`Коллекция ${collectionId} недоступна; mode ${modeId} не применён к reference instance.`);
    } catch {
      warnings.push(`Не удалось применить mode ${modeId} коллекции ${collectionId} к reference instance.`);
    }
  }
  return warnings;
}

export function referenceProperties(
  subject: InstanceNode,
  reference: InstanceNode,
  allowedNames: string[],
): Record<string, string | boolean> {
  const allowed = new Set(allowedNames);
  const usesRootSwap = (node: SceneNode, property: string): boolean => {
    if (node.type === 'INSTANCE') return node.componentPropertyReferences?.mainComponent === property;
    return 'children' in node && node.children.some(child => usesRootSwap(child, property));
  };
  const result: Record<string, string | boolean> = {};
  for (const [name, property] of Object.entries(subject.componentProperties)) {
    const referenceProperty = reference.componentProperties[name];
    if (!referenceProperty) continue;
    const isVariant = property.type === 'VARIANT';
    if (!isVariant && !allowed.has(name)) continue;
    // Inactive swap ports belong to another configuration, not this reference.
    if (property.type === 'INSTANCE_SWAP' && !subject.children.some(child => usesRootSwap(child, name))) continue;
    if (typeof property.value === 'string' || typeof property.value === 'boolean') {
      result[name] = property.value;
    }
  }
  return result;
}

/** Resolve a fresh proved occurrence, then use capture-local native provenance.
 * Local graph IDs, sibling indexes and names never establish source identity. */
async function instanceAtPath(root: InstanceNode, path: string, expected: PreviewSnapshot): Promise<InstanceNode | undefined> {
  if (path.split(' / ').some(segment => segment.startsWith('@local:') || segment.startsWith('@catalog:'))) return undefined;
  const priorScope = expected.source?.nativeSlotCaptureScope;
  const captureScope = priorScope ? {manualSourceHash:priorScope.manualSourceHash,
    boundaries:priorScope.omissions.map(entry => ({targetId:entry.targetId,property:entry.property,path:entry.path,
      representationId:expected.source?.representationId || ''}))} : undefined;
  // Re-prove the same native frontier; resolving a host occurrence must not
  // expand caller-owned SLOT payload that the original capture excluded.
  const current = await collectSceneNodes(root, expected.context.platform, expected.context.modes, captureScope, 'identity');
  // Historical callers keep their exact name-path route, including reserved names.
  if (expected.source?.occurrenceAddressVersion !== 1 && current.snapshot.source) delete current.snapshot.source.occurrenceAddressVersion;
  const paths = snapshotPaths(current.snapshot), expectedPaths = snapshotPaths(expected);
  if (!paths || !expectedPaths) return undefined;
  let node = current.snapshot.nodes.find(n => paths.get(String(n.id)) === path);
  let prior = expected.nodes.find(n => expectedPaths.get(String(n.id)) === path);
  if (!node || !prior || node.type !== 'INSTANCE' || prior.type !== 'INSTANCE') return undefined;
  const locator = current.anatomy.find(n => n.id === node!.id)?.figmaNodeId;
  const instance = locator ? current.nativeInstances.get(locator) : undefined;
  while (node && prior) {
    if (node.type !== prior.type) return undefined;
    const component = node.component as {identity?:Record<string,unknown>;sourceIdentity?:InstanceSourceIdentity};
    const previous = prior.component as {identity?:Record<string,unknown>;sourceIdentity?:InstanceSourceIdentity};
    for (const field of ['componentKey','mainComponentId','componentSetKey']) {
      if (previous?.identity?.[field] !== component?.identity?.[field]) return undefined;
    }
    const source = previous?.sourceIdentity, fresh = component?.sourceIdentity;
    if (source && (!fresh || source.version !== fresh.version || source.ownerComponentKey !== fresh.ownerComponentKey
      || source.ownerMainComponentId !== fresh.ownerMainComponentId || source.sourceNodeId !== fresh.sourceNodeId)) return undefined;
    if (node.parentId === null || prior.parentId === null) return node.parentId === prior.parentId ? instance : undefined;
    node = current.snapshot.nodes.find(n => n.id === node!.parentId);
    prior = expected.nodes.find(n => n.id === prior!.parentId);
  }
  return undefined;
}

export async function captureInstanceContentReferences(
  subject: InstanceNode, pristine: InstanceNode, page: PageNode,
  snapshot: PreviewSnapshot, base: PreviewSnapshot, modesReliable: boolean,
): Promise<void> {
  const attempts: NonNullable<PreviewSnapshot['instanceContentReferences']>['attempts'] = [];
  snapshot.instanceContentReferences = { schemaVersion: 'apollo.instance-content-references.v4', hostContextVariableModesVersion: 1, base, attempts };
  const boundaries = planInstanceContentReferences(snapshot);
  let captured = 0;
  const capture = async (boundaries: InstanceBoundary[], contextHost: InstanceNode, contextSnapshot: PreviewSnapshot, parentBoundaryNodeId?: string): Promise<void> => {
    for (const boundary of boundaries) {
      const attempt: typeof attempts[number] = { boundaryNodeId: boundary.nodeId, ...(parentBoundaryNodeId?{parentBoundaryNodeId}:{}) };
      attempts.push(attempt);
      if (!modesReliable) { attempt.failure = 'variable-modes-unavailable'; continue; }
      const variant = boundary.reason === 'component-variant-changed' && Boolean(boundary.componentSetKey);
      if (!variant && (boundary.reason !== 'instance-swap' || !boundary.property || boundary.ownerPath === undefined)) {
        attempt.failure = 'explicit-swap-port-required'; continue;
      }
      if (captured++ >= INSTANCE_CONTENT_REFERENCE_LIMIT) { attempt.failure = 'reference-capture-limit'; continue; }
      let host: InstanceNode | undefined;
      try {
        const actual = await instanceAtPath(subject, boundary.actualPath, snapshot);
        const main = actual && await actual.getMainComponentAsync();
        if (!main || main.key !== boundary.actualComponentKey) { attempt.failure = 'replacement-component-unavailable'; continue; }
        // Clone only a verified independent library stage, NEVER the user's instance.
        host = contextHost.clone();
        page.appendChild(host);
        const consumer = await instanceAtPath(host, boundary.referencePath, contextSnapshot);
        const before = consumer && await consumer.getMainComponentAsync();
        const owner = boundary.ownerPath !== undefined ? await instanceAtPath(host, boundary.ownerPath, contextSnapshot) : undefined;
        const provenControl = variant
          ? before?.parent?.type === 'COMPONENT_SET' && main.parent?.type === 'COMPONENT_SET'
            && before.parent.key === boundary.componentSetKey && main.parent.key === boundary.componentSetKey
          : owner && boundary.property && consumer?.componentPropertyReferences?.mainComponent === boundary.property
            && owner.componentProperties[boundary.property]?.type === 'INSTANCE_SWAP'
            && owner.componentProperties[boundary.property]?.value === before?.id;
        if (!consumer || !before || before.key !== boundary.referenceComponentKey || !provenControl) {
          attempt.failure = 'replacement-identity-or-port-mismatch'; continue;
        }
        if (variant) {
          // Change only the library variant controls on the pristine host. Assigning
          // mainComponent would erase the author's overrides INSIDE this wrapper.
          const properties = main.variantProperties;
          if (!properties || !Object.keys(properties).length || Object.entries(properties).some(([name,value]) =>
            typeof value !== 'string' || consumer.componentProperties[name]?.type !== 'VARIANT')) {
            attempt.failure = 'variant-properties-unavailable'; continue;
          }
          consumer.setProperties(properties);
          const selected = await consumer.getMainComponentAsync();
          if (!selected || selected.key !== main.key || selected.parent?.type !== 'COMPONENT_SET'
            || selected.parent.key !== boundary.componentSetKey) {
            attempt.failure = 'variant-switch-identity-mismatch'; continue;
          }
          attempt.strategy = 'pristine-host-variant-properties';
        } else {
          // An explicit icon replacement must discard the OLD icon's overrides.
          // Its enclosing host/PaintMe is outside the replaced subtree.
          consumer.mainComponent = main;
        }
        const reference = (await collectNodes(host, snapshot.context.platform, snapshot.context.modes)).snapshot;
        configureInstanceMainAliases(reference,snapshot.source?.instanceMainComponentAliasesVersion===1);
        if (reference.source) {
          reference.source.componentKey = base.source?.componentKey;
          reference.source.componentSetKey = base.source?.componentSetKey;
        }
        attempt.reference = reference;
        // The parent stage must pass the pure replay validator before it can be
        // used to capture descendants. A missing child baseline is not a pass.
        materializeInstanceContentReferences(snapshot);
        if (snapshot.instanceContentResults?.some(r=>r.boundaryNodeId===boundary.nodeId&&r.lineageProven)) {
          await capture(planNestedInstanceContentReferences(snapshot, reference, boundary), host, reference, boundary.nodeId);
        }
      } catch {
        // Library/API failure is coverage uncertainty, never permission or a pass.
        attempt.failure = 'reference-capture-failed';
      } finally {
        host?.remove();
      }
    }
  };
  await capture(boundaries, pristine, base);
  materializeInstanceContentReferences(snapshot);
}

export async function captureComponentDependencies(
  anatomy: AnatomyNode[], snapshot: PreviewSnapshot, temporaryPage: PageNode, acceptedKeys: string[] = [], directChildDependenciesVersion?:1, instanceMainComponentAliasesVersion?:1,
): Promise<void> {
  if (!acceptedKeys.length) return;
  snapshot.componentDependencyCaptures=[];
  const keys=new Set(acceptedKeys);
  const candidates=snapshot.nodes.filter(n=>!snapshot.selection.includes(String(n.id)) && n.type==='INSTANCE'
    && (()=>{const identity=(n.component as any)?.identity;return identity&&(keys.has(identity.componentKey)||keys.has(identity.componentSetKey));})());
  for(const [index,node] of candidates.entries()) {
    const attempt:NonNullable<PreviewSnapshot['componentDependencyCaptures']>[number]={nodeId:String(node.id)};
    snapshot.componentDependencyCaptures.push(attempt);
    if(index>=(directChildDependenciesVersion===1?DIRECT_CHILD_DEPENDENCY_CAPTURE_LIMIT:COMPONENT_DEPENDENCY_CAPTURE_LIMIT)){attempt.failure='dependency-reference-capture-limit';continue;}
    let reference:InstanceNode|null=null;
    let stage:DependencyCaptureStage='resolve-instance';
    try {
      const locator=anatomy.find(n=>n.id===node.id)?.figmaNodeId;
      const instance=locator?await figma.getNodeByIdAsync(locator):null;
      if(!instance||instance.type!=='INSTANCE'){attempt.failure='dependency-instance-unavailable';continue;}
      stage='read-main-component';
      const main=await instance.getMainComponentAsync();
      if(!main){attempt.failure='dependency-main-component-unavailable';continue;}
      stage='create-reference-instance';
      reference=main.createInstance();
      stage='append-reference-instance';
      temporaryPage.appendChild(reference);
      stage='read-variable-modes';
      const modes=Object.assign({},instance.resolvedVariableModes);
      stage='apply-variable-modes';
      const warnings=await applyModes(reference,modes);
      // The entire validation context must be reproducible; a mode mismatch cannot pass.
      if(warnings.length){attempt.failure='dependency-variable-modes-unavailable';continue;}
      stage='capture-actual';
      const actual=await collectNodes(instance,snapshot.context.platform,modes);
      stage='capture-reference';
      const baseline=await collectNodes(reference,snapshot.context.platform,modes);
      const setKey=main.parent?.type==='COMPONENT_SET'?main.parent.key:'';
      for(const s of [actual.snapshot,baseline.snapshot])if(s.source){s.source.componentKey=main.key;s.source.componentSetKey=setKey;}
      configureInstanceMainAliases(actual.snapshot,instanceMainComponentAliasesVersion===1);
      configureInstanceMainAliases(baseline.snapshot,instanceMainComponentAliasesVersion===1);
      stage='materialize-baseline';
      const materialized=materializeEffectiveBaseline(actual.snapshot,baseline.snapshot,true);
      stage='capture-variant-reference';
      materialized.snapshot.variantReference=captureVariantReference(baseline.snapshot,main.key,setKey,
        Object.keys((main.parent?.type==='COMPONENT_SET'?main.parent:main).componentPropertyDefinitions));
      stage='capture-nested-reference';
      await captureInstanceContentReferences(instance,reference,temporaryPage,materialized.snapshot,baseline.snapshot,true);
      stage='map-node-ids';
      attempt.nodeMap=Object.fromEntries(actual.anatomy.map(local=>[local.id,anatomy.find(host=>host.figmaNodeId===local.figmaNodeId)?.id||'']));
      attempt.snapshot=materialized.snapshot;
    } catch(error) {
      attempt.failure='dependency-reference-capture-failed';
      attempt.failureDetails=dependencyCaptureFailureDetails(stage,error);
    }
    finally {reference?.remove();}
  }
}

export async function exportPreview(node: SceneNode): Promise<{ dataUrl: string; width: number; height: number }> {
  const longest = Math.max(node.width, node.height, 1);
  const scale = Math.min(2, 1600 / longest);
  const bytes = await node.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: scale },
  });
  return {
    dataUrl: `data:image/png;base64,${figma.base64Encode(bytes)}`,
    width: node.width,
    height: node.height,
  };
}


export type CaptureBaselineDiagnostic = {
  kind: 'unmatched-baseline'; warningIndex: number; warning: string; unmatchedNodeIds: string[];
};

/** Optional provenance for this one diagnostic; the warning text stays compatible. */
export function appendUnmatchedBaselineWarning(warnings: string[], unmatchedNodeIds: string[]): CaptureBaselineDiagnostic | undefined {
  if (!unmatchedNodeIds.length) return;
  const warning = `${unmatchedNodeIds.length} узлов instance не сопоставлены с reference baseline.`;
  const diagnostic: CaptureBaselineDiagnostic = { kind: 'unmatched-baseline', warningIndex: warnings.length,
    warning, unmatchedNodeIds: unmatchedNodeIds.slice() };
  warnings.push(warning);
  return diagnostic;
}

export async function captureInstanceAudit(subject: InstanceNode, message: CaptureSelectionOptions) {
  const timed = async <T>(stage:string, work:()=>T|Promise<T>):Promise<T> => {
    const started = Date.now();
    try { return await work(); } finally { message.onTiming?.(stage, Math.max(0,Date.now()-started)); }
  };
  if (message.expectedRootNodeId && message.expectedRootNodeId !== subject.id) {
    throw new Error('Выделение изменилось. Задайте ожидаемые параметры для нового instance и повторите проверку.');
  }
  const temporalStart=message.captureTransitionContext?captureTransitionContext(subject):undefined;
  const temporalSequence=temporalStart?++transitionSequence:0;
  const main = await subject.getMainComponentAsync();
  if (!main) throw new Error('У выделенного instance не найден main component.');
  const acceptedKeys = new Set([message.componentKey, ...message.acceptedComponentKeys].filter(Boolean));
  const componentSetKey = main.parent?.type === 'COMPONENT_SET' ? main.parent.key : '';
  const representation = message.representations === undefined ? undefined : resolveCaptureRepresentation(
    message.representations, main.key, componentSetKey,
  );
  // Compatibility for old capture callers only. New UI always sends the current
  // contract's representations; an empty/unresolved list must fail closed.
  if (!representation && !matchesComponentIdentity(main.key, componentSetKey, Array.from(acceptedKeys))) {
    throw new Error('Ключ выбранного экземпляра отсутствует в загруженном контракте. Выберите подходящий экземпляр или загрузите его пакет.');
  }
  const platform = representation?.platform || message.platform;

  let temporaryPage: PageNode | null = null;
  let reference: InstanceNode | null = null;
  try {
    temporaryPage = figma.createPage();
    temporaryPage.name = '__Apollo_IndependentReference__';
    reference = main.createInstance();
    temporaryPage.appendChild(reference);

    const compatible = referenceProperties(subject, reference, message.allowedComponentProperties);
    if (Object.keys(compatible).length) reference.setProperties(compatible);
    const modes = { ...subject.resolvedVariableModes };
    const warnings = await applyModes(reference, modes);

    // Capture the independent reference before planning a bounded actual walk.
    const baseline = await timed('reference', () => collectNodes(reference!, platform, modes));
    if (baseline.snapshot.source) {
      baseline.snapshot.source.componentKey = main.key;
      baseline.snapshot.source.componentSetKey = componentSetKey;
      if (representation) baseline.snapshot.source.representationId = representation.id;
    }
    const independentReference=captureVariantReference(baseline.snapshot,main.key,componentSetKey,
      Object.keys((main.parent?.type==='COMPONENT_SET'?main.parent:main).componentPropertyDefinitions));
    const requestedPlan=message.nativeSlotCapturePlan;
    const boundaries=requestedPlan?.manualSourceHash===message.manualSourceHash?
      confirmedNativeSlotCaptureBoundaries(requestedPlan,independentReference,representation?.id||'',main.key,componentSetKey):[];
    const actual = await timed('actual', () => collectNodes(subject, platform, modes,boundaries.length?{manualSourceHash:message.manualSourceHash,boundaries}:undefined));
    if (actual.snapshot.source) {
      actual.snapshot.source.componentKey = main.key;
      actual.snapshot.source.componentSetKey = componentSetKey;
      if (representation) actual.snapshot.source.representationId = representation.id;
    }
    configureInstanceMainAliases(actual.snapshot,message.instanceMainComponentAliasesVersion===1);
    configureInstanceMainAliases(baseline.snapshot,message.instanceMainComponentAliasesVersion===1);
    const materialized = await timed('baseline', () => materializeEffectiveBaseline(actual.snapshot, baseline.snapshot, true));
    materialized.snapshot.variantReference = independentReference;
    await timed('content-references', () => captureInstanceContentReferences(subject, reference!, temporaryPage!, materialized.snapshot, baseline.snapshot, warnings.length === 0));
    await timed('dependencies', () => captureComponentDependencies(actual.anatomy,materialized.snapshot,temporaryPage!,message.componentDependencyKeys,message.directChildDependenciesVersion,message.instanceMainComponentAliasesVersion));
    materialized.unmatchedNodeIds = materialized.snapshot.nodes
      .filter(node => (node.baselineProvenance as {status?: string})?.status !== 'matched').map(node => String(node.id));
    materialized.matchedNodes = materialized.snapshot.nodes.length - materialized.unmatchedNodeIds.length;
    const preview = message.includePreview === false
      ? { dataUrl: '', width: subject.width, height: subject.height } : await exportPreview(subject);
    if(temporalStart){
      const end=captureTransitionContext(subject),complete=temporalStart.complete&&end.complete&&temporalStart.fingerprint===end.fingerprint;
      materialized.snapshot.transitionCapture={schemaVersion:'apollo.transition-capture.v1',sessionId:transitionSessionId,
        sequence:temporalSequence,manualSourceHash:message.manualSourceHash,externalContext:temporalStart.context,complete,
        ...(!complete?{reason:temporalStart.reason||end.reason||'changed-during-capture'}:{})};
    }
    const baselineDiagnostics = appendUnmatchedBaselineWarning(warnings, materialized.unmatchedNodeIds);
    if(actual.snapshot.source?.captureTopology?.issues.length)warnings.push('Захват дерева остановлен: повторные/противоречивые Figma ID или недоступные узлы. Проверка неполная.');
    if(actual.snapshot.source?.nativeSlotCaptureScope)warnings.push('Внешнее содержимое native SLOT не обходилось: проверены только host и граница слота. Правила содержимого не проверялись.');
    return {
      componentKey: main.key,
      anatomy: actual.anatomy,
      snapshot: materialized.snapshot,
      imageDataUrl: preview.dataUrl,
      width: preview.width,
      height: preview.height,
      matchedBaselineNodes: materialized.matchedNodes,
      unmatchedBaselineNodeIds: materialized.unmatchedNodeIds,
      warnings,
      baselineDiagnostics,
      manualSourceHash: message.manualSourceHash,
    };
  } finally {
    reference?.remove();
    temporaryPage?.remove();
  }
}
