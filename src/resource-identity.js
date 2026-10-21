// v3 identity rules: VariableID:<key>/<local-id>, S:<key>,<local-id>.
// Only stable library keys can match across different local IDs.
function resourceKey(kind, id) {
  if (typeof id !== 'string') return null;
  const value = kind === 'token' ? id.replace(/^VariableID:/, '').split('/')[0]
    : id.replace(/^S:|^key:/, '').split(',')[0];
  return /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}
function resourceId(kind, value) {
  return kind === 'style' && value.startsWith('local:') ? value.slice(6) : value;
}
module.exports = { resourceKey, resourceId };
