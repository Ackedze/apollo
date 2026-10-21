// The v3 inline grammar, represented as React-safe tokens instead of HTML.
function safeLinkHref(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
function parseInlineTokens(source) {
  const text = String(source || ''), tokens = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|<br\s*\/?>|\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?])/gi;
  let cursor = 0, match;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) tokens.push({ type: 'text', text: text.slice(cursor, match.index) });
    const value = match[0], link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
    if (link) tokens.push({ type: 'link', text: link[1], target: link[2], href: safeLinkHref(link[2]) });
    else if (/^https?:\/\//i.test(value)) tokens.push({ type: 'link', text: value, target: value, href: safeLinkHref(value) });
    else if (/^<br\s*\/?>$/i.test(value)) tokens.push({ type: 'break', text: '' });
    else if (value.startsWith('`')) tokens.push({ type: 'code', text: value.slice(1, -1) });
    else if (value.startsWith('**')) tokens.push({ type: 'strong', text: value.slice(2, -2) });
    else tokens.push({ type: 'em', text: value.slice(1, -1) });
    cursor = match.index + value.length;
  }
  if (cursor < text.length) tokens.push({ type: 'text', text: text.slice(cursor) });
  return tokens;
}
module.exports = { parseInlineTokens, safeLinkHref };
