const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(root, 'src/ui.html'), 'utf8');
const codeSource = fs.readFileSync(path.join(root, 'src/code.ts'), 'utf8');

function assertIncludes(source, value, message) {
  if (!source.includes(value)) {
    throw new Error(message);
  }
}

assertIncludes(
  codeSource,
  'const COMPACT_UI_SIZE = { width: 400, height: 860 };',
  'Compact Apollo width must match the 400px Figma layout.',
);
assertIncludes(
  uiSource,
  'id="agent-report-fab"',
  'The report tab is missing.',
);
assertIncludes(
  uiSource,
  "nextView !== 'audit' &&",
  'The audit view is missing from the view state guard.',
);
assertIncludes(
  uiSource,
  "nextView !== 'report' &&",
  'The report view is missing from the view state guard.',
);
assertIncludes(
  uiSource,
  "nextView !== 'dialogue'",
  'The dialogue view is missing from the view state guard.',
);
assertIncludes(
  uiSource,
  "activeApolloView !== 'dialogue'",
  'The composer must only be visible in dialogue mode.',
);
assertIncludes(
  uiSource,
  'placeholder="Введи или выбери текст"',
  'The dialogue composer placeholder does not match the Figma contract.',
);
assertIncludes(
  uiSource,
  'let agentReportMessages = [];',
  'Report messages must have isolated state.',
);
assertIncludes(
  uiSource,
  'let agentDialogueMessages = [];',
  'Dialogue messages must have isolated state.',
);
assertIncludes(
  uiSource,
  'function getCustomizationStructuredValues(diff)',
  'Customization UI must prefer structured reference and actual values.',
);
assertIncludes(
  uiSource,
  'values: structuredValues || parsed.values',
  'Customization UI must not render raw ids from a stale message when structured labels exist.',
);
assertIncludes(
  uiSource,
  "diff.assessment?.verdict === 'expected'",
  'Customization UI must render the Expected marker from assessment verdicts.',
);
assertIncludes(
  uiSource,
  'let showExpectedCustomizations = true;',
  'Expected customizations must remain visible by default.',
);
assertIncludes(
  uiSource,
  "return () => getVisibleCustomizationItems();",
  'Customization counters must use the Expected-aware visible item source.',
);
if (/const marker\s*=\s*!isVariantDiff/.test(uiSource)) {
  throw new Error(
    'Expected markers must not be suppressed for semantic variant changes.',
  );
}
assertIncludes(
  uiSource,
  "diff.details.property.indexOf('composition.') === 0",
  'Structural composition violations must not expose a no-op reset action.',
);
assertIncludes(
  uiSource,
  'function getAuditItemCaption(item)',
  'Audit cards must have a typed caption formatter for native library updates.',
);
assertIncludes(
  uiSource,
  'Доступна новая версия ·',
  'Native library updates must be distinguishable from catalog lifecycle updates.',
);
assertIncludes(
  uiSource,
  '· внутри ${ownerName}',
  'Native updates discovered in local component definitions must identify their owner.',
);

if (uiSource.includes('agentChatOpen')) {
  throw new Error('Legacy binary chat state is still present.');
}

console.log('Agent view mode regression checks passed.');
