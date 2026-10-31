const PILOT = 'component-patterns-v3';
const CAPTURE_SCHEMA = 'apollo.progressbar-capture.v1';
const RESULT_SCHEMA = 'apollo.component-pattern-assessment.v3';
const FAMILIES = {
  link: { profile: 'link', kinds: ['Link'], ruleIds: ["rule:components.link.supported-actions", "rule:components.link.pseudo-link", "rule:components.link.no-underline-exception", "rule:components.link.context-color", "rule:components.link.cards-actions", "rule:components.link.component-context", "rule:components.link.self-contained-text", "rule:components.link.punctuation"] },
  progressbar: { profile: 'progressbar', kinds: ['Goal', 'Limit'], ruleIds: ['rule:components.progress-bar.goal-for-target-progress', 'rule:components.progress-bar.limit-for-threshold'] },
  amount: { profile: 'amount', kinds: ['Amount'], ruleIds: ['rule:components.amount.monetary-values-only', 'rule:components.amount.table-currency-not-duplicated'] },
  button: { profile: 'buttons', kinds: ['Button'], ruleIds: ['rule:controls.buttons-and-button-groups.action-verb'] },
  'icon-button': { profile: 'buttons', kinds: ['IconButton'], ruleIds: ['rule:controls.buttons-and-button-groups.icon-button-clear-context'] },
};
const RULE_IDS = Object.values(FAMILIES).flatMap(family => family.ruleIds);
const OUTCOMES = ['compliant', 'violation', 'insufficient-data', 'not-applicable'];
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value, limit) => typeof value === 'string' && value.length <= limit;
function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function sameSet(value, expected) { return Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && value.every(item => expected.includes(item)); }
function joint(rules) { return ['violation', 'insufficient-data', 'compliant'].find(outcome => rules.some(rule => rule.outcome === outcome)) || 'not-applicable'; }
const warningRuleIds = new Set([FAMILIES['icon-button'].ruleIds[0], ...['cards-actions','component-context','punctuation'].map(id => 'rule:components.link.' + id)]);
function severity(rules) {
  const violated = rules.filter(rule => rule.outcome === 'violation');
  return violated.some(rule => !warningRuleIds.has(rule.ruleId)) ? 'error' : violated.length ? 'warning' : null;
}
const contextValid = value => record(value) && Object.keys(value).sort().join(',') === 'basis,channel,platform' && value.basis === 'audit-settings'
  && [null,'ab','other'].includes(value.channel) && [null,'desktop','mobile-web','ios','android'].includes(value.platform);
const sameContext = (a,b) => contextValid(a) && contextValid(b) && a.channel === b.channel && a.platform === b.platform && a.basis === b.basis;
function validPreparation(value, capture, expectedContext = value?.declaredContext) {
  if (!record(value) || !sameContext(value.declaredContext, expectedContext) || value.pilot !== PILOT || value.captureId !== capture.captureId || value.reportId !== capture.captureId || !hash(value.sourcePin)
    || !text(value.knowledge?.contentVersion, 300) || !Array.isArray(value.subjects) || value.subjects.length > 32
    || !Array.isArray(value.sources) || !value.sources.length || new Set(value.sources.map(source => source?.sourceId)).size !== value.sources.length
    || !value.sources.every(source => record(source) && text(source.sourceId, 100) && text(source.path, 500) && hash(source.sha256))) return false;
  const ids = new Set(capture.nodes.map(node => node.id)), seen = new Set();
  if (!value.subjects.every(subject => {
    const family = record(subject) && Object.hasOwn(FAMILIES, subject.family) && FAMILIES[subject.family];
    return family && ids.has(subject.nodeId) && !seen.has(subject.nodeId) && seen.add(subject.nodeId) && subject.profile === family.profile
      && (subject.family !== 'link' || Array.isArray(subject.contextNodeIds) && subject.contextNodeIds.includes(subject.nodeId) && subject.contextNodeIds.every(id => ids.has(id)))
      && family.kinds.includes(subject.kind) && sameSet(subject.ruleIds, family.ruleIds) && (subject.library === null || text(subject.library, 300))
      && value.sources.some(source => source.sourceId === 'canonical-' + family.profile);
  })) return false;
  return sameSet(value.requestedRuleIds, RULE_IDS.filter(id => value.subjects.some(subject => subject.ruleIds.includes(id))));
}
function validResult(value, capture, prepared) {
  if (!validPreparation(prepared, capture) || !record(value) || value.pilot !== PILOT || value.schemaVersion !== RESULT_SCHEMA || value.mode !== 'agent-pattern-pilot'
    || value.captureId !== capture.captureId || value.reportId !== prepared.reportId || value.sourcePin !== prepared.sourcePin
    || !sameContext(value.declaredContext, prepared.declaredContext)
    || value.knowledge?.contentVersion !== prepared.knowledge.contentVersion || value.deterministicFindingsIncluded !== false
    || !Array.isArray(value.assessments) || value.assessments.length !== prepared.subjects.length
    || !Array.isArray(value.sources) || value.sources.length !== prepared.sources.length
    || !sameSet(value.sources.map(source => source?.sourceId), prepared.sources.map(source => source.sourceId))
    || !value.sources.every(source => record(source) && prepared.sources.some(pin => pin.sourceId === source.sourceId && pin.path === source.path && pin.sha256 === source.sha256))) return false;
  const ids = new Set(capture.nodes.map(node => node.id)), seen = new Set();
  return value.assessments.every(item => {
    const subject = prepared.subjects.find(subject => subject.nodeId === item?.nodeId);
    if (!record(item) || !subject || seen.has(item.nodeId) || !seen.add(item.nodeId) || item.family !== subject.family || item.kind !== subject.kind || item.library !== subject.library
      || !OUTCOMES.includes(item.outcome) || !text(item.observation, 2000) || !text(item.reason, 3000) || !sameSet(item.ruleIds, subject.ruleIds)
      || !Array.isArray(item.ruleResults) || !sameSet(item.ruleResults.map(rule => rule?.ruleId), subject.ruleIds)
      || !item.ruleResults.every(rule => record(rule) && OUTCOMES.includes(rule.outcome) && text(rule.reason, 1500)
        && Array.isArray(rule.evidenceNodeIds) && rule.evidenceNodeIds.length > 0 && rule.evidenceNodeIds.length <= 30
        && new Set(rule.evidenceNodeIds).size === rule.evidenceNodeIds.length && rule.evidenceNodeIds.includes(item.nodeId) && rule.evidenceNodeIds.every(id => ids.has(id) && (subject.family !== 'link' || subject.contextNodeIds?.includes(id))))
      || joint(item.ruleResults) !== item.outcome || item.severity !== severity(item.ruleResults)) return false;
    if (subject.family === 'link') {
      const c = prepared.declaredContext, scope = c.channel && c.channel !== 'ab' || c.platform && c.platform !== 'desktop' ? 'not-applicable'
        : c.channel === 'ab' && c.platform === 'desktop' ? 'applicable' : 'insufficient-data';
      if (scope !== 'applicable' && item.ruleResults.some(rule => rule.outcome !== scope)) return false;
    }
    const evidence = Array.from(new Set(item.ruleResults.flatMap(rule => rule.evidenceNodeIds)));
    return evidence.length <= 30 && sameSet(item.evidenceNodeIds, evidence) && Array.isArray(item.sourceRefs)
      && sameSet(item.sourceRefs.map(ref => ref?.ruleId), subject.ruleIds) && item.sourceRefs.every(ref => record(ref)
        && ref.sourceId === 'canonical-' + subject.profile && prepared.sources.some(source => source.sourceId === ref.sourceId && source.sha256 === ref.sha256));
  });
}
module.exports = { contextValid, sameContext, PILOT, CAPTURE_SCHEMA, RESULT_SCHEMA, FAMILIES, RULE_IDS, OUTCOMES, validPreparation, validResult };
