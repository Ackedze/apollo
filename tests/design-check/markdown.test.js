const test = require('node:test'), assert = require('node:assert/strict');
const { parseMarkdownBlocks, normalizeMarkdownSource, groupCollapsibleMarkdownSections } = require("../../src/design-check/markdown");
const { parseInlineTokens, safeLinkHref } = require("../../src/design-check/markdown-inline");
test('v3 block grammar retains headings, lists, quote, code, divider and tables', () => {
  const blocks = parseMarkdownBlocks(normalizeMarkdownSource('# Heading\r\n\r\nText **bold**.\n\n- One\n- Two\n\n1. First\n2. Second\n\n> Quote\n\n```js\nconst a = "<script>";\n```\n\n---\n\n| Name | Value |\n| --- | --- |\n| Token | 10% |'));
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'paragraph', 'list', 'list', 'quote', 'code', 'divider', 'table']);
  assert.equal(blocks[2].ordered, false); assert.equal(blocks[3].ordered, true);
  assert.deepEqual(blocks.at(-1).rows, [['Token', '10%']]); assert.match(blocks[5].code, /<script>/);
});
test('v3 allowed-customization sections remain collapsible without report actions', () => {
  const blocks = groupCollapsibleMarkdownSections(parseMarkdownBlocks('## Допустимые кастомизации\n- Example\n## Next\nText'));
  assert.equal(blocks[0].type, 'collapsible'); assert.equal(blocks[0].children[0].type, 'list'); assert.equal(blocks[1].type, 'heading');
});
test('inline tokens preserve bold, italic, code, line break, links and autolinks', () => {
  const tokens = parseInlineTokens('**Bold** *italic* `code`<br>[Link](https://example.test/docs) https://example.test/plain.');
  for (const type of ['strong', 'em', 'code', 'break', 'link']) assert.ok(tokens.some(t => t.type === type));
  assert.equal(tokens.filter(t => t.type === 'link').length, 2);
  assert.equal(tokens.at(-1).text, '.');
});
test('untrusted HTML is text; unsafe and repository-relative links get no href', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,evil', 'file:///tmp/data', '//example.test', 'products/ab/patterns/form.md', 'https://example.test/\nattack']) assert.equal(safeLinkHref(url), null);
  assert.equal(safeLinkHref('https://example.test/path'), 'https://example.test/path');
  assert.equal(parseInlineTokens('[Form](products/ab/patterns/form.md)')[0].href, null);
  assert.equal(parseInlineTokens('<img src=x onerror=attack()>')[0].type, 'text');
});
