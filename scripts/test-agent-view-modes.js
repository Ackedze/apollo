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

if (uiSource.includes('agentChatOpen')) {
  throw new Error('Legacy binary chat state is still present.');
}

console.log('Agent view mode regression checks passed.');
