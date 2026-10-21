const test = require('node:test'), assert = require('node:assert/strict');
const { createPromptConversation } = require("../src/generation/prompt/conversation");
function result() { return { status: 'draft', executionAllowed: false, spec: { id: 'synthetic', nodes: [{ id: 'layout', kind: 'stack', direction: 'vertical', gap: 24, children: [] }], unresolved: ['Synthetic missing port'] } }; }
test('clarification includes the original request, ordered changes and immutable last draft', () => {
  const messages = [], chat = createPromptConversation(m => messages.push(m));
  assert.equal(chat.submit('  Synthetic screen  '), 'Synthetic screen');
  const draft = result(); chat.receive(draft); draft.spec.nodes[0].gap = 99;
  const next = chat.submit('Use placeholder labels; keep buttons without actions.');
  assert.match(next, /Synthetic screen/); assert.match(next, /placeholder labels/); assert.match(next, /"gap":24/); assert.doesNotMatch(next, /"gap":99/);
  chat.receive(result());
  const third = chat.submit('Make the spacing 32 px.');
  assert(third.indexOf('Synthetic screen') < third.indexOf('Use placeholder labels'));
  assert(third.indexOf('Use placeholder labels') < third.indexOf('Make the spacing'));
  assert.equal(messages.length, 5); assert.equal(messages[1].result.executionAllowed, false);
});
test('failed or cancelled planning preserves the last successful draft', () => {
  const chat = createPromptConversation(); chat.submit('Synthetic'); chat.receive(result());
  chat.submit('Change spacing'); chat.feedback('Cancelled'); chat.feedback('Connection failed');
  assert.match(chat.submit('Retry'), /"gap":24/);
});
test('oversized context is rejected without losing or silently trimming conversation', () => {
  const messages = [], chat = createPromptConversation(m => messages.push(m));
  chat.submit('x'.repeat(11990));
  assert.throws(() => chat.submit('Clarification'), /PROMPT_CONVERSATION_TOO_LONG/);
  assert.equal(messages.length, 1); assert.equal(messages[0].text.length, 11990);
});
test('only an explicit new conversation resets its context', () => {
  const chat = createPromptConversation(); chat.submit('Old screen'); chat.receive(result());
  assert.equal(chat.hasMessages(), true); chat.reset(); assert.equal(chat.hasMessages(), false);
  assert.equal(chat.submit('New screen'), 'New screen');
});
test('a newly imported spec becomes the context for the next clarification', () => {
  const chat = createPromptConversation(), imported = result().spec;
  imported.id = 'synthetic-import'; chat.useSpec(imported); imported.id = 'mutated';
  const prompt = chat.submit('Refine the uploaded screen.');
  assert.match(prompt, /synthetic-import/); assert.doesNotMatch(prompt, /mutated/);
});
