// Presentation of existing evidence only. Never evaluates predicates or supplies facts.
const labels = {
  'bounds.width': 'Ширина', 'bounds.height': 'Высота', 'bounds.x': 'Положение по X', 'bounds.y': 'Положение по Y',
  'layout.itemSpacing': 'Расстояние между элементами', 'layout.padding.top': 'Отступ сверху',
  'layout.padding.right': 'Отступ справа', 'layout.padding.bottom': 'Отступ снизу', 'layout.padding.left': 'Отступ слева',
  'layout.padding.horizontal': 'Сумма горизонтальных отступов', 'layout.padding.vertical': 'Сумма вертикальных отступов',
  'layout.sizingHorizontal': 'Размер по горизонтали', 'layout.sizingVertical': 'Размер по вертикали',
  'layout.mode': 'Направление Auto layout', 'layout.clipsContent': 'Обрезка содержимого',
  'layout.primaryAxisAlignItems': 'Выравнивание по основной оси', 'layout.counterAxisAlignItems': 'Выравнивание по поперечной оси',
  'appearance.radius': 'Скругление', 'appearance.opacity': 'Непрозрачность (0–1)',
  'appearance.fill': 'Заливка', 'appearance.stroke': 'Обводка', 'appearance.strokeWeight': 'Толщина обводки',
  'appearance.strokeAlign': 'Положение обводки', 'appearance.effects': 'Эффекты', 'appearance.effectDetailsV1': 'Параметры эффектов',
  'text.fontSize': 'Размер шрифта', 'text.lineHeight': 'Высота строки', 'text.letterSpacing': 'Межбуквенный интервал',
  'text.characters': 'Текст', 'text.styleId': 'Текстовый стиль', 'appearance.typography': 'Типографика',
  'expectedInput.ViewportClass': 'Платформа проверки',
  'component.platform': 'Платформа компонента', 'page.context.platform': 'Платформа',
  'page.context.product': 'Продукт', 'semantic.role': 'Роль слоя', 'structuralOrderV1.directChildRoles': 'Порядок элементов',
  'libraryTextV1.actualTrimmedCharacters': 'Текст без крайних пробелов', 'libraryTextV1.characters': 'Текст',
};
const pixelFacts = /^(bounds\.(width|height|x|y)|layout\.(itemSpacing|padding\.(top|right|bottom|left|horizontal|vertical))|appearance\.(radius|strokeWeight)|text\.fontSize)$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
function evidenceState(value) {
  if (value === undefined) return 'unknown';
  const object = record(value);
  return Object.keys(object).length === 1 && ['unknown', 'absent'].includes(object.state) ? object.state : 'known';
}
function propertyName(path, predicate, rule) {
  const dependency = rule?.displayContext?.dependency || rule?.presentation?.dependency;
  if (dependency?.field === 'variantProperty' && path === `dependencies.${dependency.bindingId}.variantProperty` && typeof dependency.property === 'string') {
    const name = ({Size:'Размер',View:'Вид',Presets:'Предустановка'})[dependency.property] || `Свойство ${dependency.property}`;
    return dependency.componentName === 'Link' ? `${name} ссылки` : [name, dependency.componentName].filter(Boolean).join(' · ');
  }
  if (predicate === 'count-between') return 'Количество элементов';
  if (predicate === 'string-length-between') return 'Длина текста';
  if (['distance', 'aligned', 'contains', 'overlaps'].includes(predicate)) return ({ distance: 'Расстояние между слоями', aligned: 'Выравнивание слоёв', contains: 'Размещение внутри слоя', overlaps: 'Пересечение слоёв' })[predicate];
  if (labels[path]) return labels[path];
  if (path.startsWith('component.properties.')) return `Свойство ${path.slice('component.properties.'.length)}`;
  if (path.startsWith('variable.bindings.')) return `Привязка · ${path.slice('variable.bindings.'.length).replace(/_/g, '.')}`;
  return path || 'Условие правила';
}
function factPath(trace, expression) {
  if (typeof expression?.actual?.fact === 'string') return expression.actual.fact;
  const paths = (trace.factPaths || []).filter(path => typeof path === 'string');
  return paths.find(path => !path.startsWith('baseline.effective.')) || paths[0] || '';
}

function formatFindingValue(value, detail, complexFormatter) {
  const state = evidenceState(value);
  if (state !== 'known') return state === 'absent' ? 'Значение отсутствует' : 'Нет подтверждённых данных';
  if (value === null) return 'Не задано';
  if (typeof value === 'number') return String(value).replace('.', ',') + (detail.unit ? ' ' + detail.unit : '');
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value === 'string') return value || 'Пустое значение';
  if (complexFormatter) {
    const summary = complexFormatter(value, detail.factPath);
    if (summary) return summary;
  }
  if (Array.isArray(value)) return value.length ? value.map(item => formatFindingValue(item, detail)).join(detail.predicate === 'sequence-equals' ? ' → ' : ', ')
    : detail.factPath === 'appearance.fill' ? 'Нет заливок' : detail.factPath === 'appearance.stroke' ? 'Нет обводок' : 'Пустой список';
  const object = record(value);
  if (typeof object.value === 'number' && ['PIXELS', 'PERCENT'].includes(object.unit)) return formatFindingValue(object.value, { unit: object.unit === 'PIXELS' ? 'px' : '%' });
  const keys = Object.keys(object);
  if (keys.length && keys.every(key => ['required', 'library', 'tokenIds'].includes(key))) {
    const names = { required: 'Привязка', library: 'Библиотечная привязка', tokenIds: 'Токены' };
    return keys.map(key => `${names[key]}: ${formatFindingValue(object[key], {})}`).join('\n');
  }
  if (['appearance.radius', 'appearance.strokeWeight'].includes(detail.factPath)) {
    const names = { topLeft: 'Сверху слева', topRight: 'Сверху справа', bottomLeft: 'Снизу слева', bottomRight: 'Снизу справа', top: 'Сверху', right: 'Справа', bottom: 'Снизу', left: 'Слева' };
    if (keys.length && keys.every(key => names[key] && typeof object[key] === 'number')) return keys.map(key => `${names[key]}: ${formatFindingValue(object[key], detail)}`).join('\n');
  }
  // Retain unknown fields and identities instead of hiding meaningful evidence.
  return JSON.stringify(value, null, 2);
}

function expectation(trace, negative, unit) {
  const predicate = trace.predicate, value = trace.expected;
  const label = negative ? 'Не допускается' : 'Ожидается';
  if (predicate === 'one-of' || predicate === 'none-of') return { value, label: (predicate === 'none-of') !== negative ? 'Запрещённые значения' : 'Допустимые значения' };
  if (predicate === 'not-equals') return { value, label: negative ? 'Ожидается' : 'Не допускается' };
  if (predicate === 'exists' || predicate === 'fact-present') return { value: negative ? 'Отсутствие значения' : 'Наличие значения', label: 'Требование' };
  if (['direct-parent', 'ancestor', 'direct-child', 'descendant', 'before', 'after', 'adjacent'].includes(predicate)) {
    const relations = { 'direct-parent': 'родитель', ancestor: 'предок', 'direct-child': 'дочерний слой', descendant: 'потомок', before: 'перед', after: 'после', adjacent: 'соседний слой' };
    return { value: `${relations[predicate]}: ${formatFindingValue(value, {})}`, label: negative ? 'Запрещённая связь' : 'Требуемая связь' };
  }
  if (evidenceState(value) !== 'known') return { value, label };
  if (predicate === 'compare' && own(value, 'value')) {
    const operator = { lt: '<', lte: '≤', gt: '>', gte: '≥' }[value.operator];
    if (operator) return { value: `${operator} ${formatFindingValue(value.value, { unit })}`, label: negative ? 'Запрещённое условие' : 'Ожидается' };
  }
  if (predicate === 'approximately-equals' && own(value, 'value')) return { value: value.value, label,
    note: own(value, 'tolerance') ? `Допуск: ±${formatFindingValue(value.tolerance, { unit })}` : '' };
  if (['between', 'count-between', 'string-length-between'].includes(predicate) && own(value, 'lower') && own(value, 'upper')) {
    const bounds = value.bounds || 'inclusive';
    const left = ['inclusive', 'inclusive-lower'].includes(bounds) ? '[' : '(';
    const right = ['inclusive', 'inclusive-upper'].includes(bounds) ? ']' : ')';
    const range = value.lower === value.upper && bounds === 'inclusive'
      ? formatFindingValue(value.lower, { unit }) : `${left}${formatFindingValue(value.lower, {})}; ${formatFindingValue(value.upper, {})}${right}${unit ? ' ' + unit : ''}`;
    return { value: range, label: negative ? 'Запрещённый диапазон' : 'Допустимый диапазон' };
  }
  return { value, label };
}

function buildFindingDetails(evaluation, rule = {}) {
  if (evaluation.collection?.id && rule.presentation?.collectionId === evaluation.collection.id) {
    const c=evaluation.collection;
    return [{factPath:`memberCollectionsV1.${c.id}`,property:'Состав и условия коллекции',predicate:'collection',unit:'',
      actual:c.selectedCount ?? c.knownSelectedCount ?? (c.assertionKind==='membership'?c.actualCount:undefined),expected:'Соблюдение исходного правила',actualLabel:c.knownSelectedCount!==undefined?'Доказанный минимум элементов':'Подтверждённые элементы',expectedLabel:'Требование',
      note:c.summary || '',context:c.ownerNodeId || '',truth:evaluation.trace?.truth,negative:false}];
  }
  const details = [];
  function visit(trace, expression, negative, context, depth) {
    if (!trace || typeof trace !== 'object' || depth > 32) return;
    const children = Array.isArray(trace.children) ? trace.children : [];
    if (['all', 'any', 'not'].includes(trace.predicate) && children.length) {
      for (const [index, child] of children.entries()) {
        // Show only branches that contributed to the recorded truth. A failing
        // leaf inside a successful alternative is not the cause of a finding.
        if (trace.predicate !== 'not' && child.truth !== trace.truth) continue;
        const branch = trace.predicate === 'any' && children.length > 1
          ? context.concat(`Вариант ${index + 1} из ${children.length}`) : context;
        visit(child, expression?.args?.[index], trace.predicate === 'not' ? !negative : negative, branch, depth + 1);
      }
      return;
    }
    const path = factPath(trace, expression), predicate = trace.predicate;
    const unit = ['count-between', 'string-length-between'].includes(predicate) ? '' : pixelFacts.test(path) || ['distance', 'aligned'].includes(predicate) ? 'px' : '';
    const expected = expectation(trace, negative, unit);
    let actual = trace.actual, expectedValue = expected.value, expectedLabel = expected.label, note = expected.note || '';
    if (predicate === 'matches-effective-baseline' && !negative) expectedLabel = 'Эталон компонента';
    if (predicate === 'distance' && own(trace.expected, 'measured')) { actual = trace.expected.measured; expectedValue = trace.expected.distance; }
    if (predicate === 'aligned' && own(trace.expected, 'measured')) {
      actual = trace.expected.measured; expectedValue = `≤ ${formatFindingValue(trace.expected.tolerance, { unit })}`;
    }
    const missing = [];
    if (evidenceState(actual) !== 'known') missing.push('Фактическое значение не получено');
    if (evidenceState(expectedValue) !== 'known') missing.push('Ожидаемое значение не получено');
    if (missing.length) note = missing.join('. ') + (path ? ` · ${path}` : '');
    const detail = { factPath: path, property: propertyName(path, predicate, rule), predicate, unit,
      actual, expected: expectedValue, actualLabel: 'Фактически', expectedLabel, note,
      context: context.join(' · '), truth: trace.truth, negative };
    if (['exists', 'fact-present'].includes(predicate)) detail.actual = evidenceState(trace.actual) === 'absent' ? 'Значение отсутствует' : evidenceState(trace.actual) === 'known' ? `Значение присутствует: ${formatFindingValue(trace.actual, {})}` : trace.actual;
    details.push(detail);
  }
  visit(evaluation.trace, rule.assert, rule.effect === 'forbid', [], 0);
  return details;
}

module.exports = { buildFindingDetails, formatFindingValue };
