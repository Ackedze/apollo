const PILOT = 'progressbar-goal-limit-v1';
const CAPTURE_SCHEMA = 'apollo.progressbar-capture.v1';
const RESULT_SCHEMA = 'apollo.progressbar-assessment.v1';
const RULE_IDS = ['rule:components.progress-bar.goal-for-target-progress', 'rule:components.progress-bar.limit-for-threshold'];
const OUTCOMES = ['compliant', 'violation', 'insufficient-data', 'not-applicable'];
function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validResult(value, capture, sourcePin) {
  if (!record(value) || value.schemaVersion !== RESULT_SCHEMA || value.captureId !== capture.captureId || value.sourcePin !== sourcePin
    || typeof value.knowledge?.contentVersion !== 'string' || !Array.isArray(value.assessments) || value.assessments.length > 32 || !Array.isArray(value.sources) || !value.sources.length) return false;
  const ids = new Set(capture.nodes.map(node => node.id)), seen = new Set();
  return value.assessments.every(item => record(item) && ids.has(item.nodeId) && !seen.has(item.nodeId) && seen.add(item.nodeId)
    && OUTCOMES.includes(item.outcome) && typeof item.observation === 'string' && item.observation.length <= 2000
    && typeof item.reason === 'string' && item.reason.length <= 3000 && Array.isArray(item.ruleIds) && item.ruleIds.length > 0
    && item.ruleIds.length === 2 && new Set(item.ruleIds).size === 2 && item.ruleIds.every(id => RULE_IDS.includes(id))
    && Array.isArray(item.ruleResults) && item.ruleResults.length === 2 && new Set(item.ruleResults.map(r => r?.ruleId)).size === 2
    && item.ruleResults.every(r => record(r) && RULE_IDS.includes(r.ruleId) && OUTCOMES.includes(r.outcome) && typeof r.reason === 'string')
    && Array.isArray(item.evidenceNodeIds) && item.evidenceNodeIds.length > 0 && item.evidenceNodeIds.every(id => ids.has(id))
    && Array.isArray(item.sourceRefs) && item.sourceRefs.length > 0 && item.sourceRefs.length <= 4 && item.sourceRefs.every(ref => record(ref)
      && item.ruleIds.includes(ref.ruleId) && value.sources.some(source => record(source) && source.sourceId === ref.sourceId && source.sha256 === ref.sha256 && /^[a-f0-9]{64}$/.test(ref.sha256)))
    && item.ruleIds.every(id => item.sourceRefs.some(ref => ref.ruleId === id)));
}
module.exports = { PILOT, CAPTURE_SCHEMA, RESULT_SCHEMA, RULE_IDS, OUTCOMES, validResult };
