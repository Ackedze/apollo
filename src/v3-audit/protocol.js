const SCHEMA = 'apollo.v3-audit-data.v1';
const HASH = /^[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw Error('AUDIT_DATA_INVALID');
}
function byteLength(text) {
  let size = 0;
  for (const char of text) { const n = char.codePointAt(0); size += n <= 127 ? 1 : n <= 2047 ? 2 : n <= 65535 ? 3 : 4; }
  return size;
}
function lookupUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw Error('AUDIT_DATA_URL_UNDECLARED');
  const url = value.split(/[?#]/, 1)[0];
  if (!/^https:\/\/(?:ackedze\.github\.io\/(?:design-system_ab|desing-system_abm)\/|raw\.githubusercontent\.com\/Ackedze\/(?:design-system_ab|desing-system_abm)\/main\/)/.test(url)) throw Error('AUDIT_DATA_URL_UNDECLARED');
  return url.replace(/^https:\/\/raw\.githubusercontent\.com\/Ackedze\/(design-system_ab|desing-system_abm)\/main\//, 'https://ackedze.github.io/$1/');
}
module.exports = { SCHEMA, HASH, MAX_FILE_BYTES, canonical, byteLength, lookupUrl };
