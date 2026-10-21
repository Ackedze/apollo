const groups = [
  { id: 'styles', title: 'Стили и токены', tabs: ['deprecatedStyles', 'customStyles', 'detachedStyles', 'localStyles'], description: 'Привязка значений к библиотечным стилям и токенам.' },
  { id: 'components', title: 'Компоненты', tabs: ['changes', 'deprecated', 'update', 'detached', 'local', 'wrongChannel', 'changesWip', 'presets', 'technical', 'current'], description: 'Связь с библиотекой, версии и изменения компонентов.' },
  { id: 'patterns', title: 'Паттерны', tabs: [], description: 'Правила сочетания компонентов и построения экранов.' },
];
const tabTitles = { changes: 'Кастомы', deprecated: 'Устаревшие', update: 'Пора обновить', detached: 'Детач', local: 'Локальные', customStyles: 'Кастомы', deprecatedStyles: 'Устаревшие', detachedStyles: 'Детач', localStyles: 'Локальные' };
const checkIds = { local: 'local', current: 'freshness', update: 'freshness', themization: 'theme', detached: 'detached', customStyles: 'customStyles' };
const final = new Set(['compliant', 'allowed', 'not-applicable', 'current', 'theme-current', 'font-current']);
function baseCheck(result) {
  const checks = result?.checks.filter(check => ['theme', 'font'].includes(check.id)) || [];
  if (!checks.length) return null;
  return { id: 'base', scope: 'current-page-Theme-and-Font', status: checks.some(check => check.status === 'running') ? 'running'
    : checks.some(check => check.status === 'incomplete') ? 'incomplete' : checks.every(check => check.status === 'not-applicable') ? 'not-applicable' : 'complete',
    findings: checks.flatMap(check => check.findings), gaps: Array.from(new Set(checks.flatMap(check => check.gaps || []))), checked: checks.reduce((sum, check) => sum + (check.checked || 0), 0) };
}
function summarizeTab(state, tab, items) {
  const check = tab.id === 'themization' ? baseCheck(state.documentAudit.result) : state.documentAudit.result?.checks.find(value => value.id === checkIds[tab.id]);
  const entries = check ? check.findings.filter(f => tab.id === 'current' ? f.status === 'current' : tab.id === 'update' ? ['update', 'unknown'].includes(f.status) : true) : items;
  const connected = Boolean(check) || state.tabs[tab.id]?.status !== 'not-connected' && Boolean(state.tabs[tab.id]);
  const issues = entries.filter(entry => !final.has(entry.classification || entry.status));
  return { id: tab.id, title: tab.id === 'themization' ? 'База' : tabTitles[tab.id] || tab.title, connected, count: connected ? issues.length : null,
    entries, issues, incomplete: check ? check.status !== 'complete' && check.status !== 'not-applicable' : connected && state.tabs[tab.id]?.executionComplete !== true };
}
function collectUnique(categories) {
  const ids = new Set();
  for (const category of categories) for (const [index, entry] of category.issues.entries()) {
    // Stable finding/evaluation identities avoid counting a repeated presentation twice.
    ids.add(entry.findingId ? 'native:' + entry.findingId : entry.evaluationId ? 'contract:' + entry.evaluationId : category.id + ':' + index);
  }
  return ids.size;
}
function buildResultGroups(state, tabs, getItems) {
  const categories = tabs.map(tab => summarizeTab(state, tab, getItems(tab.id)));
  const summaries = groups.map(group => {
    const members = group.tabs.map(id => categories.find(category => category.id === id) ||
      (['detachedStyles', 'localStyles'].includes(id) ? { id, title: tabTitles[id], connected: false, count: null, entries: [], issues: [], incomplete: false } : null)).filter(Boolean);
    const connected = members.some(category => category.connected);
    return Object.assign({}, group, { categories: members, connected, count: connected ? collectUnique(members) : null });
  });
  const theme = categories.find(category => category.id === 'themization') || null;
  const available = categories.some(category => category.connected);
  return { groups: summaries, theme, total: available ? collectUnique(categories) : null,
    stale: state.auditStale || state.documentAudit.status === 'stale',
    incomplete: categories.some(category => category.connected && category.incomplete) };
}
/** Presentation only: the mascot uses the same red/yellow meanings as finding cards. */
/** @returns {'unchecked' | 'clean' | 'warning' | 'violation'} */
function auditQuality(summary, busy = false) {
  if (busy || summary.total === null || summary.stale) return 'unchecked';
  const categories = summary.groups.flatMap(group => group.categories).concat(summary.theme || []);
  const red = categories.some(category => category.issues.some(entry => entry.classification
    ? entry.classification === 'violation' : !['unknown','update','local','detached'].includes(entry.status)));
  if (red) return 'violation';
  return summary.total > 0 || summary.incomplete ? 'warning' : 'clean';
}
module.exports = { buildResultGroups, auditQuality, baseCheck };
