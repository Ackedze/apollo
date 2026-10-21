const test = require('node:test'), assert = require('node:assert/strict');
const { buildFindingDetails, formatFindingValue } = require("../src/finding-details");
const engine = require("../packages/component-contract-core/dist/predicate.cjs");
const fixtures = require("./fixtures");
const eq = (fact, value) => ({ predicate: 'equals', actual: { fact }, expected: { literal: value }, missingPolicy: 'unknown' });
function evaluated(expression, facts, effect = 'require') {
  const snapshot = fixtures.snapshot(); Object.assign(snapshot.nodes[0], facts);
  const rule = fixtures.contract().rules[0]; rule.assert = expression; rule.effect = effect;
  const evaluation = engine.evaluateRules({ snapshot, rules: [rule] }).evaluations[0];
  return { evaluation, rule, details: buildFindingDetails(evaluation, rule) };
}
test('real numeric trace renders expected 20 px and actual 24 px without changing evidence', () => {
  const f = evaluated(eq('layout.padding.right', 20), { layout: { padding: { right: 24 } } });
  const before = JSON.stringify(f.evaluation), detail = f.details[0];
  assert.equal(detail.property, 'Отступ справа'); assert.equal(detail.expectedLabel, 'Ожидается');
  assert.equal(formatFindingValue(detail.expected, detail), '20 px'); assert.equal(formatFindingValue(detail.actual, detail), '24 px');
  assert.equal(JSON.stringify(f.evaluation), before); assert.equal(f.evaluation.classification, 'violation');
});
test('zero, false, empty arrays and strings are present values instead of missing data', () => {
  const f = evaluated(eq('appearance.radius', 20), { appearance: { radius: 0 } });
  assert.equal(formatFindingValue(f.details[0].actual, f.details[0]), '0 px');
  assert.equal(formatFindingValue(false, {}), 'Нет'); assert.equal(formatFindingValue([], {}), 'Пустой список');
  assert.equal(formatFindingValue('', {}), 'Пустое значение');
});
test('baseline is labelled as a reference and does not invent a historical before state', () => {
  const expression = { predicate: 'matches-effective-baseline', actual: { fact: 'appearance.radius' }, expected: { fact: 'baseline.effective.appearance.radius' } };
  const f = evaluated(expression, { appearance: { radius: 24 }, baseline: { effective: { appearance: { radius: 20 } } } });
  assert.equal(f.details[0].property, 'Скругление'); assert.equal(f.details[0].expectedLabel, 'Эталон компонента');
  assert.equal(f.details[0].unit, 'px');
});
test('missing actual and reference values retain their states with explicit explanations', () => {
  const actual = evaluated(eq('layout.padding.right', 20), {}).details[0];
  assert.equal(formatFindingValue(actual.actual, actual), 'Значение отсутствует');
  assert.match(actual.note, /Фактическое значение не получено/);
  const f = evaluated({ predicate: 'matches-effective-baseline', actual: { fact: 'appearance.radius' }, expected: { fact: 'baseline.effective.appearance.radius' }, missingPolicy: 'unknown' }, { appearance: { radius: 24 } });
  assert.match(f.details[0].note, /Ожидаемое значение не получено/);
  assert.equal(formatFindingValue(f.details[0].expected, f.details[0]), 'Значение отсутствует');
  assert.equal(f.evaluation.classification, 'human-review');
  const unknown = evaluated(eq('appearance.opacity', 1), { unknownFacts: ['appearance.opacity'] });
  assert.equal(formatFindingValue(unknown.details[0].actual, {}), 'Нет подтверждённых данных');
});
test('compound AND shows the failed property, not unrelated successful comparisons', () => {
  const f = evaluated({ predicate: 'all', args: [eq('layout.padding.left', 20), eq('layout.padding.right', 20)] }, { layout: { padding: { left: 20, right: 24 } } });
  assert.equal(f.details.length, 1); assert.equal(f.details[0].property, 'Отступ справа'); assert.equal(f.details[0].actual, 24);
});
test('alternative expectations remain labelled as alternatives and are never chosen arbitrarily', () => {
  const f = evaluated({ predicate: 'any', args: [eq('bounds.width', 20), eq('bounds.width', 32)] }, { bounds: { width: 24 } });
  assert.equal(f.details.length, 2); assert.equal(f.details[0].context, 'Вариант 1 из 2');
  assert.equal(f.details[1].context, 'Вариант 2 из 2'); assert.deepEqual(f.details.map(d => d.expected), [20, 32]);
});
test('a forbidden successful OR shows only its true branch, not the false alternative', () => {
  const f = evaluated({ predicate: 'any', args: [eq('bounds.width', 24), eq('bounds.width', 32)] }, { bounds: { width: 24 } }, 'forbid');
  assert.equal(f.details.length, 1); assert.equal(f.details[0].expectedLabel, 'Не допускается'); assert.equal(f.details[0].expected, 24);
});
test('negation and forbidden rules preserve the polarity of allowed sets', () => {
  const one = { predicate: 'one-of', actual: { fact: 'bounds.width' }, expected: { literal: [20, 24] } };
  const forbidden = evaluated({ predicate: 'not', args: [one] }, { bounds: { width: 24 } });
  assert.equal(forbidden.details[0].expectedLabel, 'Запрещённые значения');
  const doubled = evaluated({ predicate: 'not', args: [one] }, { bounds: { width: 32 } }, 'forbid');
  assert.equal(doubled.details[0].expectedLabel, 'Допустимые значения');
});
test('range and quantity use recorded bounds and do not attach pixel units to counts', () => {
  const range = evaluated({ predicate: 'between', actual: { fact: 'bounds.width' }, lower: { literal: 20 }, upper: { literal: 24 }, bounds: 'inclusive-lower' }, { bounds: { width: 30 } });
  assert.equal(range.details[0].expected, '[20; 24) px');
  const count = evaluated({ predicate: 'count-between', actual: { literal: ['one', 'two'] }, lower: { literal: 1 }, upper: { literal: 1 } }, {});
  assert.equal(count.details[0].actual, 2); assert.equal(count.details[0].unit, ''); assert.equal(count.details[0].property, 'Количество элементов');
});
test('numeric comparator and tolerance do not present trace descriptor objects as expected values', () => {
  const comparison = evaluated({ predicate: 'compare', operator: 'lte', actual: { fact: 'bounds.width' }, expected: { literal: 20 } }, { bounds: { width: 24 } });
  assert.equal(comparison.details[0].expected, '≤ 20 px');
  const approximate = evaluated({ predicate: 'approximately-equals', actual: { fact: 'bounds.width' }, expected: { literal: 20 }, tolerance: .5 }, { bounds: { width: 24 } });
  assert.equal(approximate.details[0].expected, 20); assert.equal(approximate.details[0].note, 'Допуск: ±0,5 px');
});
test('geometry distance shows the recorded measurement, not the bounding box as actual distance', () => {
  const f = evaluated({ predicate: 'distance', actual: { fact: 'bounds' }, target: { literal: { x: 44, y: 0, width: 20, height: 20 } }, expected: { literal: 20 }, axis: 'horizontal' }, { bounds: { x: 0, y: 0, width: 20, height: 20 } });
  assert.equal(f.details[0].actual, 24); assert.equal(f.details[0].expected, 20); assert.equal(f.details[0].unit, 'px');
});
test('structural order, token identity and future structured evidence are retained', () => {
  const f = evaluated({ predicate: 'sequence-equals', actual: { literal: ['body', 'title'] }, expected: { literal: ['title', 'body'] } }, {});
  assert.equal(formatFindingValue(f.details[0].actual, f.details[0]), 'body → title');
  const binding = { required: true, tokenIds: ['synthetic-token'], futureEvidence: 0 };
  assert.equal(JSON.parse(formatFindingValue(binding, {})).futureEvidence, 0);
  assert.match(formatFindingValue(binding, {}), /synthetic-token/);
  assert.equal(formatFindingValue({ value: 20, unit: 'PIXELS' }, {}), '20 px');
});
test('same RuleID in different scopes keeps distinct values and trace objects', () => {
  const one = evaluated(eq('layout.padding.right', 20), { layout: { padding: { right: 24 } } });
  const two = evaluated(eq('layout.padding.right', 20), { layout: { padding: { right: 28 } } });
  assert.equal(one.evaluation.ruleId, two.evaluation.ruleId);
  assert.deepEqual([one.details[0].actual, two.details[0].actual], [24, 28]);
  assert.deepEqual(buildFindingDetails({ classification: 'human-review' }), []);
});

test('declared dependency property labels preserve values and the technical trace',()=>{
  const fact='dependencies.d_link.variantProperty', f=evaluated({predicate:'one-of',actual:{fact},expected:{literal:['S (14-20)','S (14-20) (Size-20 icons)']}},{dependencies:{d_link:{variantProperty:'L (18-24)'}}});
  f.rule.displayContext={dependency:{bindingId:'d_link',field:'variantProperty',property:'Size',componentName:'Link'}};
  const before=JSON.stringify(f.evaluation),detail=buildFindingDetails(f.evaluation,f.rule)[0];
  assert.equal(detail.property,'Размер ссылки');assert.equal(detail.factPath,fact);assert.equal(detail.actual,'L (18-24)');
  assert.deepEqual(detail.expected,['S (14-20)','S (14-20) (Size-20 icons)']);assert.equal(JSON.stringify(f.evaluation),before);
  f.rule.displayContext.dependency.bindingId='another';assert.equal(buildFindingDetails(f.evaluation,f.rule)[0].property,fact);
});
