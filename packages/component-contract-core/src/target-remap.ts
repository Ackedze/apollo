import type { ManualSource, ManualRule, PreviewSnapshot, SemanticTarget, VariantEvidence } from './types';
import { stableHash } from './stable';
import { capabilitiesForSet, factForCapability } from './capabilities';
import { compileManualSource } from './compiler';
import { prepareValidationSnapshot } from './runtime';
import { snapshotPaths } from './snapshot-topology';
import { resolveSnapshotTargets, targetResolutionReason } from './target-resolution';
import { variantAvailability } from './variant-facts';
import { compareInstanceBoundaries, correspondingPath } from './instance-boundaries';

export type TargetRemapInput = {
  manual: ManualSource;
  snapshot: PreviewSnapshot;
  variantEvidence?: VariantEvidence;
  targetId: string;
  nodeId: string;
};

export type TargetRemapPlan = {
  planHash: string;
  manualSourceHash: string;
  snapshotHash: string;
  evidenceHash: string;
  targetId: string;
  nodeId: string;
  representationId?: string;
  before?: SemanticTarget;
  after?: SemanticTarget;
  previousPath?: string;
  nextPath?: string;
  candidate?: { name: string; type: string; lineage: Array<{ name: string; type: string; componentKey?: string; componentSetKey?: string }> };
  affectedRules: Array<{ id: string; title: string; status: string; reasons: string[] }>;
  affectedExamples: string[];
  capabilities: Array<{ ruleId: string; path: string; available: boolean }>;
  blockers: string[];
  warnings: string[];
  changed: boolean;
  canApply: boolean;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const relative = (path?: string): string | undefined => path === undefined ? undefined : path.split(' / ').slice(1).join(' / ');
const includesPath = (ancestor: string, path: string) => ancestor === '' || ancestor === path || path.startsWith(`${ancestor} / `);
const declaredPath = (target: SemanticTarget, representationId: string, componentKey?:string) =>
  target.variantHints?.find(h=>h.representationId===representationId && h.componentKey===componentKey)?.pathHint
  || target.representationHints?.find(h => h.representationId === representationId)?.pathHint || target.pathHint;

function references(value: unknown, keys: Set<string>, role: string): boolean {
  if (typeof value === 'string') return keys.has(value) || ['relations', 'semanticTargets', 'variantAvailability.targets'].some(prefix => value === `${prefix}.${role}` || value.startsWith(`${prefix}.${role}.`));
  if (Array.isArray(value)) return value.some(entry => references(entry, keys, role));
  return Boolean(value && typeof value === 'object' && Object.values(value).some(entry => references(entry, keys, role)));
}

/** No inference from prose: only structured targets, references and subtree scopes. */
function affectedRules(manual: ManualSource, target: SemanticTarget, representationId: string, nextPath: string, componentKey?:string) {
  const before = relative(declaredPath(target, representationId,componentKey));
  const after = relative(nextPath)!;
  const keys = new Set([target.id, target.semanticRole, declaredPath(target, representationId,componentKey) || '',
    ...manual.controlPorts.filter(port => port.targetId === target.id).map(port => port.id)].filter(Boolean));
  return manual.rules.flatMap(rule => {
    if (rule.status === 'deprecated') return [];
    const reasons: string[] = [];
    if (rule.targetId === target.id) reasons.push('цель правила');
    if (references(rule.constraints, keys, target.semanticRole)) reasons.push('связь или зависимость');
    if (references(rule.controlPaths, keys, target.semanticRole)) reasons.push('управляющий путь / port');
    if (references(rule.applicability.context, keys, target.semanticRole)) reasons.push('условие');
    if (rule.targetScope === 'self-and-descendants' || rule.targetScope === 'descendants') {
      const owner = manual.targets.find(t => t.id === rule.targetId);
      const path = owner && relative(declaredPath(owner, representationId,componentKey));
      if (path !== undefined && ((before !== undefined && includesPath(path, before)) || includesPath(path, after))) reasons.push('охват потомков');
    }
    return reasons.length ? [{ id: rule.id, title: rule.message || rule.rationale || rule.id, status: rule.status, reasons }] : [];
  });
}

function hasFact(node: Record<string, unknown>, path: string): boolean {
  if (((node.unknownFacts || []) as string[]).some(p => path === p || path.startsWith(`${p}.`))) return false;
  // Property names may contain dots; component properties are an exact keyed map.
  if (path.startsWith('component.properties.')) return Object.prototype.hasOwnProperty.call(record(record(node.component).properties), path.slice('component.properties.'.length));
  let current: unknown = node;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return current !== undefined;
}

function requiredFacts(rule: ManualRule): string[] {
  const registered = rule.capabilitySet ? [...capabilitiesForSet(rule.capabilitySet)] : [rule.capability];
  const capabilities = rule.capabilitySet && rule.capabilitySelection ? registered.filter(c => rule.capabilitySelection!.includes(c)) : registered;
  const constraints = rule.constraints.length ? rule.constraints : rule.permission === 'forbidden' ? [{type:'propertyForbidden'}] : [];
  return [...new Set(capabilities.flatMap(capability => !constraints.length ? [factForCapability(capability)] : constraints.flatMap(constraint => {
    const fact = (constraint as {fact?:string}).fact || factForCapability(capability);
    return constraint.type === 'propertyForbidden' ? [fact,`baseline.effective.${fact}`]
      : ['propertyDomain', 'layoutConstraint'].includes(constraint.type) ? [fact]
      : constraint.type === 'tokenBinding' ? ['variable.bindings'] : [];
  })))];
}

/** Read-only proposal. All mutations happen only in applyTargetRemap after an
 * exact proposal/context hash check and explicit user confirmation. */
export function planTargetRemap(input: TargetRemapInput): TargetRemapPlan {
  const {manual, snapshot, variantEvidence, targetId, nodeId} = input;
  const plan: TargetRemapPlan = {
    planHash:'', manualSourceHash:stableHash(manual), snapshotHash:stableHash(snapshot), evidenceHash:stableHash(variantEvidence || null),
    targetId, nodeId, affectedRules:[], affectedExamples:[], capabilities:[], blockers:[], warnings:[], changed:false, canApply:false,
  };
  const finish = () => {
    plan.blockers = [...new Set(plan.blockers)]; plan.warnings = [...new Set(plan.warnings)];
    plan.canApply = plan.changed && !plan.blockers.length;
    plan.planHash = stableHash({...plan,planHash:undefined});
    return plan;
  };
  const targets = manual.targets.filter(t => t.id === targetId);
  if (targets.length !== 1) {plan.blockers.push('Исходная цель отсутствует или её ID не уникален.');return finish();}
  const target = targets[0]; plan.before = clone(target);
  if (manual.targets.filter(t => t.semanticRole === target.semanticRole).length !== 1) plan.blockers.push('Semantic role исходной цели не уникальна.');
  const paths = snapshotPaths(snapshot);
  if (!paths) {plan.blockers.push('Нужен полный однозначный снимок компонента без усечения и конфликтов структуры.');return finish();}
  const node = snapshot.nodes.find(n => n.id === nodeId);
  if (!node) {plan.blockers.push('Выберите новый объект из текущего снимка.');return finish();}
  const keys = [snapshot.source?.componentKey,snapshot.source?.componentSetKey].filter(Boolean);
  const reps = manual.representations.filter(rep => rep.kind === 'figma' && rep.status !== 'deprecated' && rep.platform === snapshot.context.platform
    && keys.some(key => key === rep.locator.componentKey || key === rep.locator.componentSetKey));
  if (reps.length !== 1) {plan.blockers.push('Снимок не подтверждает единственное Figma-представление этого компонента.');return finish();}
  const rep = reps[0]; plan.representationId = rep.id;
  const occurrenceMode=variantEvidence?.occurrenceAddressVersion===1;
  const componentKey=snapshot.source?.componentKey;
  const hints = occurrenceMode ? target.variantHints?.filter(h=>h.representationId===rep.id && h.componentKey===componentKey) || []
    : target.representationHints?.filter(h => h.representationId === rep.id) || [];
  if (hints.length > 1) {plan.blockers.push('Для представления уже заданы конфликтующие привязки; сначала разрешите конфликт.');return finish();}
  if (!occurrenceMode && target.resolution !== 'resolved' && manual.representations.filter(r => r.kind === 'figma' && r.status !== 'deprecated').length > 1) {
    plan.blockers.push('Глобально неподтверждённую цель с несколькими Figma-представлениями нельзя подтвердить одним снимком. Нужна отдельная настройка scope привязок.');
  }
  const oldPath = declaredPath(target,rep.id,componentKey); plan.previousPath = oldPath;
  const actualPath = paths.get(nodeId)!;
  const comparison=occurrenceMode && snapshot.variantReference ? compareInstanceBoundaries(snapshot,snapshot.variantReference) : undefined;
  const path=occurrenceMode ? correspondingPath(comparison,actualPath) : actualPath;
  if(path===undefined || occurrenceMode && (!componentKey || snapshot.variantReference?.occurrenceAddressVersion!==1)){
    plan.blockers.push('У выбранного экземпляра нет подтверждённого source address в независимом эталоне варианта.');return finish();
  }
  if ((target.semanticRole === 'root' || oldPath !== undefined && relative(oldPath) === '') !== (path === '')) plan.blockers.push('Корневую цель нельзя переносить на потомка, а цель потомка — на корень.');
  const root = snapshot.nodes.find(n => snapshot.selection.includes(String(n.id)))!;
  const prefix = oldPath?.split(' / ')[0] || manual.component.family;
  const nextPath = [prefix,path].filter(Boolean).join(' / '); plan.nextPath = nextPath;
  const lineage: NonNullable<TargetRemapPlan['candidate']>['lineage'] = [];
  let current: Record<string, unknown> | undefined = node;
  while (current) {
    const identity = record(record(current.component).identity);
    lineage.unshift({name:String(current.name),type:String(current.type),
      ...(identity.componentKey ? {componentKey:String(identity.componentKey)} : {}),
      ...(identity.componentSetKey ? {componentSetKey:String(identity.componentSetKey)} : {})});
    current = current.parentId === null ? undefined : snapshot.nodes.find(n => n.id === current!.parentId);
  }
  plan.candidate = {name:String(node.name),type:String(node.type),lineage};
  if (snapshot.source?.occurrenceAddressVersion!==1 && lineage.slice(1).some(n => n.name.includes(' / '))) plan.blockers.push('Имя слоя содержит разделитель пути « / »; такая привязка неоднозначна.');
  for (const other of manual.targets.filter(t => t.id !== targetId)) {
    if (relative(declaredPath(other,rep.id,componentKey)) === path) plan.blockers.push(`Объект уже закреплён за ${other.id}; автоматическое объединение целей запрещено.`);
  }
  const fingerprint = stableHash({type:node.type,path:nextPath,order:node.order}).slice(0,16);
  plan.changed = oldPath !== nextPath || (occurrenceMode ? hints.length!==1 : (record(hints[0]).structuralFingerprint || target.structuralFingerprint) !== fingerprint) || target.resolution !== 'resolved';
  if (!plan.changed) plan.blockers.push('Эта привязка уже актуальна. Изменение node ID само по себе не требует перепривязки.');
  plan.after = occurrenceMode ? {...clone(target),resolution:'resolved',variantHints:[
    ...(target.variantHints || []).filter(h=>h.representationId!==rep.id || h.componentKey!==componentKey).map(clone),
    {representationId:rep.id,componentKey:componentKey!,pathHint:nextPath},
  ]} : {...clone(target),resolution:'resolved',representationHints:[
    ...(target.representationHints || []).filter(h => h.representationId !== rep.id).map(clone),
    {representationId:rep.id,nameHint:String(node.name),pathHint:nextPath,structuralFingerprint:fingerprint},
  ]};
  plan.affectedRules = affectedRules(manual,target,rep.id,nextPath,componentKey);
  const affected = new Set(plan.affectedRules.map(rule => rule.id));
  plan.affectedExamples = manual.examples.filter(example => example.status !== 'deprecated'
    && (example.ruleIds?.some(id => affected.has(id)) || references([example.input,example.expected],new Set([target.id,target.semanticRole]),target.semanticRole))).map(e => e.id);
  const proposed = {...manual,targets:manual.targets.map(t => t.id === targetId ? plan.after! : t)};
  const compiled = compileManualSource(proposed,variantEvidence).contract;
  if (variantEvidence) {
    const availability = variantAvailability(snapshot,compiled);
    if (availability.targets[target.semanticRole]?.state !== 'present') plan.blockers.push(`Новая цель не подтверждена Athena и независимым эталоном (${availability.reason}). Обновите исходные факты; не используйте перепривязку для обхода drift или instance swap.`);
  } else {
    const resolution = resolveSnapshotTargets(snapshot,compiled).targets.find(t => t.targetId === targetId);
    if (resolution?.resolution !== 'resolved') plan.blockers.push(`Привязка не доказана: ${targetResolutionReason(resolution?.reason || 'topology-incomplete-or-ambiguous')}.`);
  }
  const prepared = prepareValidationSnapshot(snapshot,compiled);
  const candidate = prepared.nodes.find(n => n.id === nodeId)!;
  for (const rule of manual.rules.filter(rule => affected.has(rule.id))) {
    if (rule.targetId === targetId) {
      const deferred = ['delegated','context-only','policy-only'].includes(rule.execution?.route || '');
      if (deferred) plan.warnings.push(`${rule.id}: совместимость отложенного правила (${rule.execution!.route}) не доказана автоматически; маршрут сохраняется, нужен review владельца.`);
      for (const fact of deferred ? [] : requiredFacts(rule)) {
        const available = hasFact(candidate,fact);
        plan.capabilities.push({ruleId:rule.id,path:fact,available});
        if (!available) plan.blockers.push(`${rule.id}: у нового объекта не подтверждено свойство ${fact}.`);
      }
      for (const control of deferred ? [] : rule.controlPaths) {
        if (control.kind === 'host-property' && control.property && !hasFact(root,`component.properties.${control.property}`)) plan.blockers.push(`${rule.id}: управляющее свойство host «${control.property}» недоступно.`);
        if (control.kind === 'nested-property') plan.warnings.push(`${rule.id}: связь с nested property необходимо повторно проверить; она не переносится автоматически.`);
      }
    }
    for (const constraint of rule.constraints) {
      for (const subject of constraint.dependency?.subjects || []) {
        const boundPaths=[...paths.values()].map(p=>occurrenceMode ? correspondingPath(comparison,p) : p);
        if (subject.targetRole === target.semanticRole && !boundPaths.includes([path,subject.relativePath].filter(Boolean).join(' / '))) {
          plan.blockers.push(`${rule.id}: новый объект не содержит declared dependency path «${subject.relativePath}».`);
        }
      }
    }
  }
  if (plan.affectedRules.some(rule => ['self-and-descendants', 'descendants'].includes(manual.rules.find(r => r.id === rule.id)?.targetScope || 'self'))) plan.warnings.push('Охват правил с потомками изменится; проверьте весь новый subtree. Другие semantic targets не перемещаются вместе с этой целью.');
  plan.warnings.push('Проверена совместимость с текущим снимком. Все варианты и modes требуют повторного review; Product, conditions, severity, constraints и control paths не меняются.');
  return finish();
}

export function applyTargetRemap(input: TargetRemapInput, expectedPlanHash: string, confirmed: boolean, updatedAt = new Date().toISOString()): ManualSource {
  if (!confirmed) throw new Error('Подтвердите изменение привязки и повторный review затронутых правил.');
  const plan = planTargetRemap(input);
  if (plan.planHash !== expectedPlanHash) throw new Error('Контракт, снимок или Athena facts изменились. Откройте новое сравнение перед подтверждением.');
  if (!plan.canApply || !plan.after) throw new Error(plan.blockers.join(' ') || 'Перепривязка недоступна.');
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('Некорректная дата изменения.');
  const next = clone(input.manual);
  next.targets = next.targets.map(target => target.id === input.targetId ? clone(plan.after!) : target);
  const affected = new Set(plan.affectedRules.map(rule => rule.id));
  next.rules = next.rules.map(rule => affected.has(rule.id) ? {...rule,status:'draft'} : rule);
  next.examples = next.examples.map(example => plan.affectedExamples.includes(example.id) ? {...example,status:'draft'} : example);
  next.metadata.revision += 1;
  next.metadata.updatedAt = updatedAt;
  return next;
}
