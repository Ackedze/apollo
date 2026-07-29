const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const codeSource = fs.readFileSync(path.join(root, 'src/code.ts'), 'utf8');

function assertIncludes(value, message) {
  if (!codeSource.includes(value)) {
    throw new Error(message);
  }
}

function assertExcludes(value, message) {
  if (codeSource.includes(value)) {
    throw new Error(message);
  }
}

assertIncludes(
  "? createApolloAgentDialogueSessionId()\n        : createApolloAgentSessionId(report!)",
  'Dialogue questions and audit reports must use isolated Langflow sessions.',
);
assertIncludes(
  "function buildDialogueApolloAgentInput(question: string): string",
  'Dialogue requests must use a dedicated payload builder.',
);
assertIncludes(
  "mode: 'design-dialogue'",
  'Dialogue requests must declare their mode explicitly.',
);
assertIncludes(
  'auditReport: null',
  'Dialogue context must explicitly exclude the latest audit report.',
);
assertIncludes(
  "'dialogue',\n    apolloDialogueSessionNonce",
  'Dialogue session ids must have a runtime-specific namespace.',
);
assertExcludes(
  'buildContextualApolloAgentInput',
  'Legacy dialogue payload builder still attaches audit context.',
);

console.log('Apollo Agent request isolation checks passed.');
