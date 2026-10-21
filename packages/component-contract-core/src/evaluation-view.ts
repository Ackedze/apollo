import type { AnatomyNode, CompiledContract } from './types';
import { validationInputs } from './validation-inputs';

export type EvaluationDetail = {
  id: string;
  classification: string;
  classificationLabel: string;
  severity: string;
  ruleId: string;
  ruleTitle: string;
  capability: string;
  nodeId: string;
  nodeName: string;
  nodePath: string;
  factPath: string;
  reason: string;
  reasonLabel: string;
  actual: unknown;
  expected: unknown;
  actualLabel: string;
  expectedLabel: string;
  comparisonSymbol: string;
  showComparison: boolean;
  scopeMismatch: boolean;
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  compliant: 'Пройдено',
  violation: 'Нарушение',
  'human-review': 'Нужна проверка',
  'not-evaluable': 'Нельзя проверить',
  'not-applicable': 'Не применяется',
  'not-executed': 'Не выполнено',
  allowed: 'Разрешено',
};

const REASON_LABELS: Record<string, string> = {
  'actual value differs from effective baseline': 'Значение отличается от эталона компонента',
  'actual value matches effective baseline': 'Значение совпадает с эталоном компонента',
  'comparison value is absent': 'Фактическое или эталонное значение отсутствует',
  'rule authority is not active': 'Правило ещё не активно',
  'rule scope does not apply': 'Правило не действует в этом сценарии',
  'rule product scope does not apply': 'Выбранный Product не входит в область действия правила; проверка ограничения не запускалась',
  'rule channel scope does not apply': 'Текущий Channel не входит в область действия правила; проверка ограничения не запускалась',
  'rule product scope is unknown': 'Недостаточно данных: Product не задан или неизвестен; применимость правила не установлена',
  'rule platform scope is unknown': 'Недостаточно данных: платформа не задана или неизвестна',
  'rule channel scope is unknown': 'Недостаточно данных: Channel не задан или неизвестен',
  'rule page type scope is unknown': 'Недостаточно данных: тип страницы не задан или неизвестен',
  'rule platform scope does not apply': 'Текущая платформа не входит в область действия правила; проверка ограничения не запускалась',
  'rule page type scope does not apply': 'Текущий тип страницы не входит в область действия правила; проверка ограничения не запускалась',
  'selector evidence is unknown': 'Недостаточно данных для выбора слоя',
  'selector matched no visible nodes': 'Подходящий видимый слой не найден',
  'value is outside the allowed set': 'Значение не входит в допустимый набор',
  'value belongs to the allowed set': 'Значение входит в допустимый набор',
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function unavailableTrace(trace: Record<string, unknown>): boolean {
  const children = Array.isArray(trace.children) ? trace.children : [];
  if (children.length) return children.some(child => unavailableTrace(record(child)));
  return trace.truth === 'false' && trace.actual === false
    && Array.isArray(trace.factPaths) && trace.factPaths.some(path => String(path).startsWith('variantAvailability.'));
}

function activityTrace(trace: Record<string, unknown>, truth: string): boolean {
  if (trace.predicate === 'any' && trace.truth === truth && Array.isArray(trace.factPaths)
    && trace.factPaths.length === 2 && trace.factPaths.every(p => String(p).includes('propertyActivityV1.'))) return true;
  return Array.isArray(trace.children) && trace.children.some(t => activityTrace(record(t), truth));
}

/** Read a proven failed scope condition; never infer applicability or re-run a rule. */
function falseScopeCondition(trace: Record<string, unknown>, path: string, actual: unknown = false, expected: unknown = true): boolean {
  if (trace.truth !== 'false') return false;
  if (trace.predicate === 'equals') {
    return trace.actual === actual && trace.expected === expected
      && Array.isArray(trace.factPaths) && trace.factPaths.includes(path);
  }
  // Only false logical branches explain a failed condition. A false leaf inside
  // a successful OR (or an unknown branch) must not be presented as the cause.
  return (trace.predicate === 'all' || trace.predicate === 'any')
    && Array.isArray(trace.children)
    && trace.children.some(child => falseScopeCondition(record(child), path, actual, expected));
}

/** Presentation of a proven mapping branch; never re-evaluates the rule. */
function dependencyDisplayTrace(trace: Record<string, unknown>): Record<string, unknown> {
  const children = Array.isArray(trace.children) ? trace.children.map(record) : [];
  const branches = children.filter(child => child.predicate === 'all' && Array.isArray(child.children)
    && record(child.children[0]).truth === 'true');
  let selected = trace;
  if (trace.predicate === 'any' && branches.length === 1) selected = record((branches[0].children as unknown[])[1]);
  // A singleton tolerance range is a display leaf; do not pick arbitrarily
  // among alternative allowed ranges or an unknown host mapping.
  if (selected.predicate === 'any' && Array.isArray(selected.children) && selected.children.length === 1) selected=record(selected.children[0]);
  return selected;
}

export function buildEvaluationDetails(
  result: Record<string, unknown>,
  contract: CompiledContract,
  anatomy: AnatomyNode[],
): EvaluationDetail[] {
  const rules = new Map(contract.rules.map((rule) => [rule.ruleId, rule]));
  const dependencyRules = new Map<string, typeof contract.rules>();
  const collect = (current: CompiledContract, depth=0) => {
    if(depth>4)return;
    for(const d of current.componentDependencies||[])if(d.contract){dependencyRules.set(d.compiledHash,d.contract.rules);collect(d.contract,depth+1);}
  };
  collect(contract);
  const nodes = new Map(anatomy.map((node) => [node.id, node]));
  const evaluations = Array.isArray(result.evaluations) ? result.evaluations : [];

  return evaluations.map((candidate, index) => {
    const evaluation = record(candidate);
    const ruleId = String(evaluation.ruleId || '');
    const nodeId = String((evaluation.collection ? evaluation.focusNodeId : evaluation.subjectNodeId) || '');
    const provenance=record(evaluation.dependency);
    const rule = provenance.compiledHash ? dependencyRules.get(String(provenance.compiledHash))?.find(r=>r.ruleId===ruleId) : rules.get(ruleId);
    const presentation = record(rule?.presentation);
    const dependency = record(presentation.dependency);
    const originalTrace = record(evaluation.trace);
    const specificationNotRequested = contract.runtimePolicy?.validationModeVersion === 1
      && evaluation.classification === 'not-applicable'
      && falseScopeCondition(originalTrace, 'validationScopeV1.mode', 'component-audit', 'specification');
    const findExpectedCondition = (value: Record<string, unknown>): Record<string, unknown> | undefined => {
      if (value.predicate === 'equals' && (value.truth === 'unknown' || evaluation.classification === 'not-applicable' && value.truth === 'false')
        && Array.isArray(value.factPaths) && value.factPaths.some(p => String(p).startsWith('expectedInput.'))) return value;
      for (const child of Array.isArray(value.children) ? value.children : []) {
        const found = findExpectedCondition(record(child)); if (found) return found;
      }
    };
    const expectedCondition = !specificationNotRequested && [1,2].includes(contract.runtimePolicy?.validationIntentVersion || 0)
      && ['human-review','not-applicable'].includes(String(evaluation.classification)) ? findExpectedCondition(originalTrace) : undefined;
    const trace = expectedCondition || (dependency.field && ['violation','compliant','human-review'].includes(String(evaluation.classification))
      ? dependencyDisplayTrace(originalTrace) : originalTrace);
    const factPaths = Array.isArray(trace.factPaths)
      ? trace.factPaths.filter((value): value is string => typeof value === 'string')
      : [];
    const factPath = factPaths.find((path) => !path.startsWith('baseline.effective.')) || factPaths[0] || '';
    const node = nodes.get(nodeId);
    const reason = typeof trace.reason === 'string' ? trace.reason : '';
    const classification = String(evaluation.classification || 'unknown');
    const scopeMismatch = /^rule (?:product|platform|channel|page type) scope does not apply$/.test(reason);
    const scopeUnknown = /^rule (?:product|platform|channel|page type) scope is unknown$/.test(reason);
    const conditionalMismatch = classification === 'not-applicable' && trace.truth === 'false' && !scopeMismatch;
    const activityPolicy = presentation.propertyApplicability;
    const inactive = activityPolicy && conditionalMismatch && activityTrace(trace, 'false');
    const unknownActivity = activityPolicy && ['human-review','not-evaluable'].includes(classification) && activityTrace(trace, 'unknown');
    const unavailable = conditionalMismatch && unavailableTrace(trace);
    const childOwned = presentation.boundaryPolicy === 'component-owned@1' && conditionalMismatch
      && falseScopeCondition(trace, 'ruleScopeV1.local');
    const hiddenTarget = presentation.targetApplicability === 'visible-target@1' && conditionalMismatch
      && factPaths.some(path => /^ruleScopeV1\.targets\..+\.visible$/.test(path) && falseScopeCondition(trace, path));
    const missingDimension = ['human-review', 'not-evaluable'].includes(classification)
      && ['baseline.effective.bounds.width', 'baseline.effective.bounds.height'].some(path => factPaths.includes(path))
      && ['absent', 'unknown'].includes(String(record(trace.expected).state));
    const missingDimensionPath = factPaths.find(path => /^baseline\.effective\.bounds\.(width|height)$/.test(path));
    const pairedDimension = Boolean(presentation.transitionId) && trace.predicate === 'approximately-equals'
      && ['compliant','violation'].includes(classification);
    const unknownExpectedInput = expectedCondition?.truth === 'unknown';
    const inputName = validationInputs(contract.facts).find(p => `expectedInput.${p.id}` === factPath)?.validationInput?.label || factPath;
    const showComparison = !specificationNotRequested && !unknownExpectedInput && !unavailable && !childOwned && !hiddenTarget && (scopeMismatch || conditionalMismatch || trace.actual !== undefined || trace.expected !== undefined);
    return {
      id: String(evaluation.evaluationId || `${ruleId}:${nodeId}:${index}`),
      classification,
      classificationLabel: CLASSIFICATION_LABELS[classification] || classification,
      severity: String(evaluation.severity || rule?.severity || 'info'),
      ruleId,
      ruleTitle: typeof presentation.title === 'string' && presentation.title
        ? presentation.title
        : String(evaluation.ruleTitle || ruleId),
      capability: pairedDimension ? 'Размер при переходе состояния, px' : dependency.field ? `${String(dependency.targetRole)} · ${{width:dependency.contractDependencyId?'Ширина компонента, px':'Ширина иконки, px',height:dependency.contractDependencyId?'Высота компонента, px':'Высота иконки, px',portName:'Активный порт',variantProperty:`${dependency.contractDependencyId?'Вариант компонента':'Вариант иконки'} · ${String(dependency.property || '')}`}[String(dependency.field)] || dependency.field}`
        : typeof presentation.group === 'string' ? presentation.group : String(evaluation.capability || factPath),
      nodeId,
      nodeName: node?.name || String(evaluation.subjectNodeName || nodeId),
      nodePath: node?.path || String(evaluation.subjectNodeName || nodeId),
      factPath,
      reason,
      reasonLabel: record(evaluation.collection).summary ? String(record(evaluation.collection).summary) : specificationNotRequested ? 'Проверка по спецификации не запрошена. Это правило сопоставления с внешними ожиданиями не входит в аудит компонента; соответствие спецификации не подтверждено.'
        : unknownExpectedInput ? `Не задано или не подтверждено независимое ожидание «${inputName}». Укажите его в «Ожидаемых параметрах» и повторите проверку; текущее значение слоя не заменяет ожидание.`
        : expectedCondition ? `Указанное ожидание «${inputName}» не активирует это условное требование; это не нарушение.`
        : Array.isArray(evaluation.evidenceIssues) && evaluation.evidenceIssues.length
        ? `Недостаточно данных ${evaluation.evidenceIssues.some(path => /gradient(Stops|Transform)/.test(String(path))) ? 'градиента' : 'заливки или обводки'}: ${evaluation.evidenceIssues.join(', ')}. Повторите захват экземпляра и эталона; проверка неполная.`
        : pairedDimension ? `${classification==='violation'?'Размер изменился':'Размер сохранён'} относительно исходного снимка того же экземпляра. Допуск: ${record(trace.expected).tolerance} px.`
        : missingDimension ? `Нет размера независимого эталона: ${missingDimensionPath}. Ограничение не проверено.`
        : childOwned ? 'Область принадлежит подтверждённому вложенному контракту; внутренние свойства проверяются его правилами'
        : hiddenTarget ? 'Цель доказанно скрыта или отсутствует в варианте; стилевое правило не применяется по условию контракта'
        : inactive ? activityPolicy === 'stroke-present-either@1'
          ? 'Обводка отсутствует и в экземпляре, и в эталоне; толщина не проверяется по условию контракта'
          : activityPolicy === 'auto-layout-padding-either@1'
          ? 'Auto layout отсутствует и в экземпляре, и в эталоне; padding не проверяется по условию контракта'
          : activityPolicy === 'flow-alignment-either@1'
          ? 'Горизонтальный или вертикальный auto layout отсутствует и в экземпляре, и в эталоне; выравнивание не проверяется по условию контракта'
          : 'В экземпляре и эталоне нет двух участвующих в auto layout элементов; gap не проверяется по условию контракта'
        : unknownActivity ? 'Недостаточно данных о применимости свойства в экземпляре или независимом эталоне; проверка неполная'
        : evaluation.origin === 'editor-hidden-target-scope' ? 'Слой найден и подтверждён, но скрыт. Эта проверка не применяется.'
        : unavailable ? 'Элемент или свойство недоступны в выбранном варианте; подтверждено каталогом и reference из Figma'
        : conditionalMismatch ? 'Условие применения правила не выполнено; ограничение не проверялось'
        : dependency.field && trace.predicate === 'between' && trace.truth === 'false' ? 'Размер иконки не входит в диапазон из контракта'
        : presentation.textStyleBinding && trace.predicate === 'binding-satisfies'
        ? classification === 'violation' ? record(trace.actual).state === 'detached'
          ? 'Отвязан текстовый стиль' : 'Текстовый стиль не входит в разрешённый библиотечный каталог'
          : classification === 'compliant' ? 'Библиотечный текстовый стиль привязан'
          : 'Недостаточно данных о привязке Text Style; проверка неполная'
        : REASON_LABELS[reason] || reason || 'Predicate Engine вернул результат без пояснения',
      actual: trace.actual,
      expected: pairedDimension ? record(trace.expected).value : trace.expected,
      actualLabel: pairedDimension ? 'После перехода' : scopeMismatch || scopeUnknown ? 'Контекст проверки' : conditionalMismatch ? 'Сценарий сейчас' : 'Сейчас',
      expectedLabel: pairedDimension ? 'Должно быть — как до перехода' : scopeMismatch || scopeUnknown ? 'Правило действует для' : conditionalMismatch ? 'Правило применяется при' : 'Должно быть',
      comparisonSymbol: classification === 'not-applicable' ? '≠' : '→',
      showComparison: evaluation.origin !== 'editor-hidden-target-scope' && showComparison,
      scopeMismatch,
    };
  });
}
