const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(root, 'src/ui.html'), 'utf8');
const start = uiSource.indexOf('const TECHNICAL_DIFF_PATTERN');
const end = uiSource.indexOf('function setScanningState', start);

assert.notEqual(start, -1, 'Customization dedupe helpers are missing.');
assert.notEqual(end, -1, 'Customization dedupe helper boundary is missing.');

const context = {showExpectedCustomizations: true};
vm.createContext(context);
vm.runInContext(uiSource.slice(start, end), context);

const fill = {
  nodeId: 'nested-style-node',
  message: 'заливка: — → VariableID:token-id',
  details: {
    property: 'fill',
    reference: {value: null},
    actual: {value: 'VariableID:token-id'},
  },
};
const variant = {
  nodeId: 'nested-style-node',
  message: 'type: Primary → Border',
  details: {
    property: 'variant.Type',
    reference: {value: 'Primary'},
    actual: {value: 'Border'},
  },
};

const distinctProperties = context.prepareChangeDiffs({
  diffs: [fill, variant],
});
assert.equal(
  distinctProperties.length,
  2,
  'Different properties on one node must remain separate UI rows.',
);

const duplicateProperty = context.prepareChangeDiffs({
  diffs: [fill, Object.assign({}, fill)],
});
assert.equal(
  duplicateProperty.length,
  1,
  'Duplicate changes of the same node property must still collapse.',
);

const alignment = {
  nodeId: 'amount-text',
  message: 'Выравнивание: сверху справа → снизу слева',
  details: {
    property: 'layout.alignment',
    reference: {value: 'сверху справа'},
    actual: {value: 'снизу слева'},
    atomicChanges: [
      {
        property: 'layout.primaryAxisAlignItems',
        reference: {value: 'MIN'},
        actual: {value: 'MAX'},
      },
      {
        property: 'layout.counterAxisAlignItems',
        reference: {value: 'MAX'},
        actual: {value: 'MIN'},
      },
    ],
  },
};
const alignmentResetDetails = context.getCustomizationResetDetails(
  alignment,
  true,
  null,
);
assert.deepEqual(
  alignmentResetDetails.map((detail) => detail.property),
  ['layout.primaryAxisAlignItems', 'layout.counterAxisAlignItems'],
  'One semantic alignment row must reset both axis properties.',
);

const expected = Object.assign({}, fill, {
  nodeId: 'expected-node',
  assessment: {verdict: 'expected'},
});
const violation = Object.assign({}, variant, {
  nodeId: 'violation-node',
  assessment: {verdict: 'violation'},
});
context.showExpectedCustomizations = false;
const expectedHidden = context.prepareChangeDiffs({
  diffs: [expected, violation],
});
assert.deepEqual(
  expectedHidden.map((diff) => diff.nodeId),
  ['violation-node'],
  'Expected customizations must be hidden without suppressing violations.',
);

const expectedOnlyItems = context.getVisibleCustomizationItems;
assert.equal(
  typeof expectedOnlyItems,
  'function',
  'Customization item filtering must be available to the tab counter.',
);

console.log('Customization UI dedupe regression checks passed.');
