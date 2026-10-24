const test = require('node:test'), assert = require('node:assert/strict');
const core = require(process.env.APOLLO_CONTRACT_CORE || '../dist/core.cjs');
const {fixture} = require('./helpers/declared-target.cjs');

function textCase(characters) {
  const f = fixture(core);
  f.snapshot.nodes[2].text = {characters};
  f.manual.rules[0].targetId = 'title.target';
  f.manual.rules[0].capability = 'text.content';
  f.manual.rules[0].constraints = [{type:'layoutConstraint',fact:'textContentV1.wordCount',min:0,max:2}];
  return f;
}
const run = f => core.evaluateCompiledContract(f.snapshot, core.prepareAuthoringPreviewContract(f.compile().contract));
test('two-word boundary uses captured text; source punctuation is not an extra word', () => {
  for (const value of ['В работе', '  В\u00a0работе\t', 'Счёт-фактура готов', 'В — работе']) {
    assert(run(textCase(value)).evaluations.every(e=>e.classification==='compliant'), value);
  }
  assert(run(textCase('Ожидает подписи банка')).evaluations.some(e=>e.classification==='violation'));
});
test('word count is recomputed, not trusted from a cached fact', () => {
  const f=textCase('Ожидает подписи банка');
  f.snapshot.nodes[2].textContentV1={wordCount:0};
  assert(run(f).evaluations.some(e=>e.classification==='violation'));
  f.snapshot.nodes[2].text.characters='В работе';
  assert(run(f).evaluations.every(e=>e.classification==='compliant'));
});
test('missing and explicitly unknown captured text remain UNKNOWN', () => {
  for (const mutate of [n=>delete n.text.characters, n=>n.unknownFacts=['text.characters']]) {
    const f=textCase('В работе'); mutate(f.snapshot.nodes[2]);
    assert(run(f).evaluations.some(e=>e.classification==='human-review'));
  }
});
