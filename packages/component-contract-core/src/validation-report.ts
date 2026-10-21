import type { CompileResult, ManualSource, PreviewSnapshot } from './types';
import { validationIssueLabel } from './rule-editing';
import { buildContractReadiness, diagnoseRuleApplicability, inspectRuleFacts, provenHiddenRuleTarget } from './validation-coverage';
import { prepareValidationSnapshot } from './runtime';
import { withinBoundary } from './instance-boundaries';
import { targetResolutionReason } from './target-resolution';
import { transitionReason } from './transition-facts';
import { buildOwnershipCoverage, validRuleOwnership } from './rule-ownership';
import { validationMode } from './validation-mode';
import { dependencyCaptureFailureLabel } from './dependency-capture-diagnostics';

/** Editor diagnostics only. Does not change Predicate Engine verdicts or RuleIR. */
export function buildEditorValidationReport(result: Record<string, unknown>, compiled: CompileResult, manual: ManualSource, snapshot?: PreviewSnapshot,
  options?: {hiddenTargetCoverageVersion:1}) {
  const evaluations: Array<Record<string, unknown>> = Array.isArray(result.evaluations) ? result.evaluations.slice() : [];
  const engineEvaluations = evaluations.length;
  const checkedSnapshot = snapshot ? prepareValidationSnapshot(snapshot, compiled.contract) : undefined;
  if (compiled.contract.runtimePolicy.gradientPaintFactsVersion === 1 && checkedSnapshot) {
    evaluations.forEach((evaluation, index) => {
      if (!['human-review', 'not-evaluable'].includes(String(evaluation.classification))) return;
      const rule = compiled.contract.rules.find(rule => rule.ruleId === evaluation.ruleId);
      const assertion = rule?.assert as Record<string, unknown> | undefined;
      const field = (assertion?.actual as Record<string, unknown> | undefined)?.fact;
      if (field !== 'appearance.fill' && field !== 'appearance.stroke') return;
      const issues = checkedSnapshot.nodes.filter(node => !evaluation.subjectNodeId || node.id === evaluation.subjectNodeId)
        .flatMap(node => (node.gradientPaintIssues || []) as Array<{ fact: string; missing: string[] }>)
        .filter(issue => issue.fact === field || issue.fact === `baseline.effective.${field}`)
        .flatMap(issue => issue.missing);
      if (issues.length) evaluations[index] = { ...evaluation, evidenceIssues: [...new Set(issues)] };
    });
  }
  const contractReadiness = buildContractReadiness(compiled, manual);
  const pending = new Map<string, Set<string>>();
  const add = (id: string, reason: string) => {
    if (!pending.has(id)) pending.set(id, new Set());
    pending.get(id)!.add(reason);
  };
  const dependencyRuns=(result.dependencyRuns||[]) as Array<Record<string,unknown>>;
  if (compiled.contract.runtimePolicy.memberCollectionsVersion === 1) for (const e of evaluations) {
    const evidence=e.collection as Record<string, any> | undefined;
    if (!evidence?.missing?.length) continue;
    const rule=compiled.contract.rules.find(r=>r.ruleId===e.ruleId);
    add(String((rule?.source as any)?.anchor || e.ruleId), `Коллекция не проверена полностью: ${evidence.missing.join('; ')}.`);
  }
  const mode = compiled.contract.runtimePolicy.validationModeVersion === 1 ? validationMode(checkedSnapshot) : undefined;
  if (mode === 'unknown') add('validation-mode', 'Режим проверки отсутствует в поддерживаемом формате. Повторите проверку в режиме аудита или спецификации.');
  if(checkedSnapshot&&compiled.contract.runtimePolicy.transitionFactsVersion===1){
    const root=checkedSnapshot.nodes.find(n=>checkedSnapshot.selection.includes(String(n.id)));
    for(const t of compiled.contract.facts.transitions||[]){
      const evidence=(root?.transitionsV1 as Record<string,any>|undefined)?.[t.id];
      if(evidence?.applicable===false||evidence?.reason==='paired')continue;
      add(t.sourceRuleId,transitionReason(evidence?.reason||'before-not-captured'));
      // Keep raw engine unknown in the JSON, present one actionable coverage gap.
      for(let i=evaluations.length-1;i>=0;i--){const atomic=compiled.contract.rules.find(r=>r.ruleId===evaluations[i].ruleId);
        if((atomic?.presentation as any)?.transitionId===t.id&&['human-review','not-evaluable'].includes(String(evaluations[i].classification)))evaluations.splice(i,1);
      }
    }
  }
  dependencyRuns.filter(run=>run.status==='not-executed'||run.status==='incomplete').forEach(run=>{
    const captures=checkedSnapshot?.componentDependencyCaptures?.filter(capture=>capture.nodeId===run.nodeId)||[];
    const diagnostic=run.reason==='dependency-reference-capture-failed'&&captures.length===1&&captures[0].failure===run.reason
      ?dependencyCaptureFailureLabel(captures[0].failureDetails):'';
    add(`component-dependency:${run.dependencyId}:${run.bindingId}`,`Вложенный контракт ${run.componentId} r${run.revision} не проверен полностью: ${run.reason}.${diagnostic}`);
  });
  compiled.contract.nonExecutableRules.forEach((entry) => {
    const index = manual.rules.findIndex((rule) => rule.id === entry.sourceRuleId);
    const errors = compiled.issues.filter((issue) => issue.level === 'error' && issue.path.startsWith(`/rules/${index}/`));
    if (errors.length) add(entry.sourceRuleId, errors.map(validationIssueLabel).join(' '));
    else if (manual.rules[index]?.execution?.route !== 'context-only') add(entry.sourceRuleId, entry.reason);
  });
  manual.rules.forEach((rule) => {
    if (rule.status === 'deprecated') return;
    if (manual.metadata.ruleOwnershipVersion === 1 && !validRuleOwnership(rule.ownership, manual.component.componentId)) {
      add(rule.id, 'Не указан или некорректен нормативный владелец правила; принадлежность компоненту или применению не подтверждена.');
    }
    const target = manual.targets.find((entry) => entry.id === rule.targetId);
    if (!target) add(rule.id, 'Не найдена цель правила в manual source.');
    const binding = checkedSnapshot?.targetResolution?.targets.find(entry => entry.targetId === rule.targetId);
    if (binding && binding.resolution !== 'resolved') add(rule.id, `Цель требует сопоставления: ${targetResolutionReason(binding.reason)}. Ручная привязка не изменена.`);
    if (rule.execution?.route === 'delegated') add(rule.id, `Внешние правила не исполнялись в этой проверке: ${(rule.execution.externalRuleIds || []).join(', ')}.`);
    if (rule.execution?.route === 'context-only') add(rule.id, 'Правило пока не подключено к автоматической проверке (context-only).');
    if (checkedSnapshot && compiled.contract.runtimePolicy.nativeSlotTargetsVersion === 1
      && ['allowed', 'constrained'].includes(rule.permission)) {
      for (const control of rule.controlPaths.filter(path => path.kind === 'slot-api' && path.contentOwnership === 'external')) {
        const ownerTarget = control.ownerTargetId ? manual.targets.find(entry => entry.id === control.ownerTargetId) : undefined;
        const node = checkedSnapshot.nodes.find(entry => (entry.semantic as Record<string, unknown> | undefined)?.role === target?.semanticRole);
        const boundary = node?.slotBoundaryV1 as Record<string, unknown> | undefined;
        if (node?.type === 'SLOT' && boundary?.evidence === 'native-slot-content-reference'
          && boundary?.targetId === target?.id && boundary?.property === control.property && boundary?.contentOwnership === 'external') continue;
        const ownerPath = ownerTarget?.pathHint?.split(' / ').slice(1).join(' / ') || '';
        const expectedType = checkedSnapshot.variantReference?.nodeProperties[ownerPath]?.propertyTypes[control.property || ''];
        if (expectedType === 'BOOLEAN') continue; // Preserve the original INSTANCE/BOOLEAN slot route.
        add(rule.id, 'Граница внешнего native SLOT не подтверждена: нужны уникальный SLOT-якорь, корректный владелец и независимый эталон. Содержимое не исключено из проверки по имени.');
      }
    }
  });
  compiled.contract.rules.forEach((rule) => {
    const sourceId = String((rule.source as Record<string, unknown>)?.anchor || rule.ruleId);
    const matches = (result.evaluations as Array<Record<string, unknown>> || []).filter((entry) => entry.ruleId === rule.ruleId);
    if (!matches.length) add(sourceId, 'Predicate Engine не вернул результат для исполняемой проверки.');
    matches.forEach((entry) => {
      const reason = String((entry.trace as Record<string, unknown>)?.reason || '');
      const source = manual.rules.find(entry => entry.id === sourceId);
      const hidden = options?.hiddenTargetCoverageVersion === 1 && checkedSnapshot && source
        && reason === 'selector matched no visible nodes' ? provenHiddenRuleTarget(manual, source, checkedSnapshot) : undefined;
      if (hidden) {
        const index = evaluations.indexOf(entry);
        if (index >= 0) evaluations[index] = Object.assign({}, entry, {
          origin:'editor-hidden-target-scope', subjectNodeId:hidden.id, subjectNodeName:hidden.name,
          focusNodeId:hidden.id, focusNodeName:hidden.name,
          trace:{predicate:'equals',truth:'false',reason:'exact declared target is present but effectively hidden',
            actual:false,expected:true,factPaths:['visibility.effective']},
        });
        return;
      }
      if (reason === 'selector matched no visible nodes' || reason === 'rule authority is not active') {
        add(sourceId, reason === 'rule authority is not active' ? 'Правило не активно.' : 'Целевой слой не найден; ограничение не проверено.');
      }
    });
  });
  // An unresolved legacy target is a coverage gap, not a second not-applicable
  // card for the engine's empty-selector placeholder. Raw engine output remains
  // intact in the downloadable report; historical snapshots retain their views.
  if (checkedSnapshot?.targetResolution) {
    for (let index = evaluations.length - 1; index >= 0; index--) {
      const entry = evaluations[index];
      if ((entry.trace as Record<string, unknown>)?.reason !== 'selector matched no visible nodes') continue;
      const atomic = compiled.contract.rules.find(rule => rule.ruleId === entry.ruleId);
      const sourceId = String((atomic?.source as Record<string, unknown>)?.anchor || '');
      const source = manual.rules.find(rule => rule.id === sourceId);
      const binding = checkedSnapshot.targetResolution.targets.find(target => target.targetId === source?.targetId);
      if (binding && binding.resolution !== 'resolved') evaluations.splice(index, 1);
    }
  }
  const globalErrors = compiled.issues.filter((issue) => issue.level === 'error' && !issue.path.startsWith('/rules/'));
  if (snapshot?.source?.captureTopology?.issues.length) add('snapshot-capture',
    `Захват дерева не подтверждён: ${snapshot.source.captureTopology.issues.map(i=>`${i.kind}${i.nodeId?` (${i.nodeId})`:''}`).join('; ')}. Повторите проверку; недостоверная топология не считается проверенной.`);
  else if (snapshot?.source?.truncated) add('snapshot-capture', `Снимок ограничен ${snapshot.source.nodeLimit} узлами; часть компонента не проверена.`);
  const boundaries = checkedSnapshot?.instanceBoundaries || [];
  boundaries.forEach(boundary => {
    const slot = checkedSnapshot?.nodes.find(n => String(n.id) === boundary.nodeId)?.slotBoundaryV1 as {contentOwnership?:string} | undefined;
    if (compiled.contract.runtimePolicy.slotTargetFactsVersion === 1 && slot?.contentOwnership === 'external') return; // Explicit, re-proven open-slot boundary; root constraints still execute.
    const content = checkedSnapshot?.instanceContentResults?.find(entry => entry.boundaryNodeId === boundary.nodeId);
    if (content?.status === 'matched') return; // Independent baseline gap closed, not permission to swap.
    // The proven parent is not a second unexecuted area: report its unresolved
    // child explicitly, while preserving incomplete scenario coverage.
    if (content?.status === 'partial' && content.lineageProven && boundaries.some(b=>b.nodeId!==boundary.nodeId&&withinBoundary(b.actualPath,boundary.actualPath))) return;
    const location = `Вложенная область «${boundary.actualPath}» не проверена: ${boundary.reason === 'instance-swap' ? `замена через ${boundary.property}` : boundary.reason === 'component-variant-changed' ? 'выбран другой вариант того же вложенного компонента' : boundary.reason === 'component-identity-changed' ? 'изменён вложенный компонент' : 'недостаточно данных об идентичности вложенного компонента'}.`;
    // Keep old report replay exact. New captures distinguish domain verdicts from content coverage.
    if (!checkedSnapshot?.instanceContentReferences) {
      add(`instance-boundary:${boundary.nodeId}`, `${location} Baseline прежнего компонента не используется. Допустимость замены и содержимое требуют отдельного контракта/reference.`);
      return;
    }
    const labels: Record<string, string> = {
      'reference-not-captured': 'независимый эталон не получен',
      'reference-parent-mismatch': 'цепочка независимых эталонов не соответствует родительской области',
      'nested-content-reference-unresolved': 'контекст владельца подтверждён, но содержимое вложенной замены проверено не полностью',
      'original-host-evidence-invalid': 'исходный эталон host не подтверждён',
      'explicit-swap-port-required': 'не подтверждён однозначный INSTANCE_SWAP port',
      'ambiguous-reference': 'получено несколько эталонов одной замены',
      'replacement-reference-incomplete': 'эталон неполон или не соответствует modes/контексту',
      'replacement-identity-or-port-mismatch': 'identity или port эталона не совпадают с заменой',
      'host-context-changed': 'при построении эталона изменилось окружение заменяемого содержимого',
      'replacement-structure-needs-remap': 'структура нового компонента не сопоставлена однозначно',
      'replacement-nested-identity-unresolved': 'не подтверждены ключи вложенных компонентов новой иконки',
      'variant-properties-mismatch': 'variant properties не соответствуют независимому эталону выбранного варианта',
      'variant-properties-unavailable': 'не получены VARIANT-свойства выбранного main component',
      'variant-switch-identity-mismatch': 'переключение VARIANT-свойств не привело к ожидаемому component key',
      'variant-capture-strategy-unproven': 'не подтверждено переключение варианта с сохранением библиотечного host-контекста',
      'variable-modes-unavailable': 'не удалось воспроизвести variable modes',
      'reference-capture-limit': 'достигнут лимит 8 независимых эталонов за проверку',
      'replacement-component-unavailable': 'новый main component недоступен или изменился',
      'reference-capture-failed': 'Figma не позволила построить независимый эталон',
    };
    add(`instance-boundary:${boundary.nodeId}`, `${location} Причина: ${labels[content?.reason || ''] || 'нет подтверждённого эталона содержимого'}. Baseline прежнего компонента не используется. Допустимость замены оценивается отдельными правилами; этот пункт относится только к проверке содержимого.`);
  });
  globalErrors.forEach((issue) => add('contract-validation', `${issue.path}: ${validationIssueLabel(issue)}`));
  let excludedRules = 0;
  let notExecuted = 0;
  let unknownApplicabilityRules = 0;
  pending.forEach((reasons, sourceId) => {
    const packageGapReasons = Array.from(reasons);
    const rule = manual.rules.find((entry) => entry.id === sourceId);
    const applicability = rule ? diagnoseRuleApplicability(manual, rule, checkedSnapshot,
      ['variant-facts-v3','variant-facts-v4','dependency-facts-v5'].includes(compiled.contract.package.snapshotProfile || ''),
      compiled.contract.runtimePolicy.rootTargetAliasesVersion === 1) : undefined;
    const excluded = applicability?.status === 'not-applicable';
    if (excluded) excludedRules++;
    else {
      notExecuted++;
      if (applicability?.status === 'unknown') {
        unknownApplicabilityRules++;
        reasons.add('Применимость не установлена; правило не исключено из полноты прогона.');
        if (applicability.unsupportedConditions.length) reasons.add(`Требуют сопоставления или подтверждения: ${applicability.unsupportedConditions.join(', ')}.`);
      }
    }
    const facts = rule ? inspectRuleFacts(manual, rule, checkedSnapshot, compiled.contract.runtimePolicy.rootTargetAliasesVersion === 1) : [];
    if (facts.length && !excluded) {
      const available = facts.filter((fact) => fact.state === 'available').map((fact) => fact.path);
      const missing = facts.filter((fact) => fact.state !== 'available').map((fact) => fact.path);
      if (missing.length) reasons.add(`Недостаточно runtime-данных: ${missing.join(', ')}.`);
      if (available.length) reasons.add(`Уже доступны: ${available.join(', ')}.`);
      if (!missing.length) reasons.add('Все заявленные факты доступны, но это не означает, что правило исполнено.');
    }
    const evidence = applicability?.evaluations.find((entry) => entry.applicability === 'not-applicable' && entry.trace.truth === 'false');
    const boundary = boundaries.find(b=>sourceId===`instance-boundary:${b.nodeId}`);
    evaluations.push({
      evaluationId: `editor:${excluded ? 'not-applicable' : 'not-executed'}:${sourceId}`, ruleId: sourceId,
      classification: excluded ? 'not-applicable' : 'not-executed', severity: rule?.severity || 'error',
      origin: 'editor-coverage', applicability: applicability?.status || 'unknown',
      ruleTitle: rule?.message || rule?.rationale || sourceId,
      capability: rule?.capability || rule?.capabilitySet || '',
      subjectNodeName: manual.targets.find((target) => target.id === rule?.targetId)?.label || manual.component.family,
      ...(boundary ? {subjectNodeId:boundary.nodeId,subjectNodeName:boundary.actualPath,focusNodeId:boundary.nodeId,ruleTitle:'Непроверенное содержимое вложенного компонента'} : {}),
      trace: excluded && evidence ? evidence.trace : { reason: Array.from(reasons).join(' ') },
      applicabilityEvidence: applicability,
      factAvailability: facts,
      packageGapReasons,
    });
  });
  const inconclusive = evaluations.filter((entry) => ['human-review', 'not-evaluable', 'unknown'].includes(String(entry.classification))).length;
  const ownershipCoverage = manual.metadata.ruleOwnershipVersion === 1 ? buildOwnershipCoverage(evaluations, compiled, manual) : undefined;
  const complete = notExecuted === 0 && inconclusive === 0 && evaluations.length > 0 && !ownershipCoverage?.unclassified.evaluations;
  const scenarioCoverage = { complete, notExecuted, inconclusive, engineEvaluations, excludedRules, unknownApplicabilityRules,
    ...(options?.hiddenTargetCoverageVersion === 1 ? {hiddenTargetCoverageVersion:1} : {}),
    ...(mode ? { validationMode: mode, specificationStatus: mode === 'component-audit' ? 'not-requested' : mode === 'unknown' ? 'unknown' : 'requested' } : {}),
  };
  return {
    ...result, evaluations,
    contractReadiness, scenarioCoverage,
    ...(ownershipCoverage ? { ownershipCoverage } : {}),
    // Compatibility alias: this now describes the current scenario, not package readiness.
    editorCoverage: scenarioCoverage,
  };
}
