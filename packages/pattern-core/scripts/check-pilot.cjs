#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validatePattern, verifySources, resolveDecisions, resolveTransition, prepareRequirements, contractHash, sha256 } = require('../dist/index.cjs');

// Immutable, read-only Git source port. No network, captures or source text output.
const args = process.argv.slice(2), roots = new Map();
const usage = 'Usage: npm run pilot:check -- --source-root design-system_ab=/absolute/checkout';
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--source-root' || !args[i + 1]) throw Error(usage);
  const value = args[++i], split = value.indexOf('=');
  if (split < 1 || !path.isAbsolute(value.slice(split + 1))) throw Error(usage);
  roots.set(value.slice(0, split), value.slice(split + 1));
}
const pilotPath = path.join(__dirname, '../pilots/interruption.draft.json');
const pilot = JSON.parse(fs.readFileSync(pilotPath, 'utf8'));
const structural = validatePattern(pilot);
if (!structural.valid) { console.log(JSON.stringify({ status: 'failed', issues: structural.issues }, null, 2)); process.exit(1); }
const sourceResult = verifySources(pilot, ref => {
  const root = roots.get(ref.repository);
  if (!root) throw Error('Source root required.');
  execFileSync('git', ['-C', root, 'cat-file', '-e', ref.commit + '^{commit}'], { stdio: 'pipe' });
  const bytes = execFileSync('git', ['-C', root, 'show', ref.commit + ':' + ref.path], { stdio: 'pipe', maxBuffer: 2 * 1024 * 1024 });
  return { bytes, commit: ref.commit };
});
const cases = [];
for (const dataLossRisk of [false, true]) for (const saveMode of ['none', 'manual', 'automatic']) for (const platform of ['desktop', 'mobileweb', 'mobile']) {
  const context = { dataLossRisk, saveMode, platform }, result = resolveDecisions(pilot, context);
  const expected = !dataLossRisk ? 'exit-no-risk' : saveMode === 'automatic' ? 'automatic-save'
    : (saveMode === 'manual' ? 'manual-' : 'discard-') + (platform === 'desktop' ? 'modal' : 'sheet');
  if (result.status !== 'selected' || result.selections[0].outcomeId !== expected) throw Error('Decision matrix mismatch.');
  cases.push({ context, outcomeId: result.selections[0].outcomeId });
}
const context = { dataLossRisk: true, saveMode: 'automatic', platform: 'desktop' };
const failure = resolveTransition(pilot, context, { stateId: 'saving', eventId: 'save-failed', outcomeId: 'automatic-save' });
if (failure.status !== 'unresolved' || failure.gapId !== 'save-failure-policy' || failure.actions !== undefined) throw Error('Save failure must stay an open product question.');
const port = prepareRequirements(pilot, context, { platform: 'desktop', target: 'frontend', sourceReceipt: sourceResult.receipt });
const report = {
  consumer: 'apollo-v4', status: 'draft', structural: 'passed', sourceVerification: sourceResult.status,
  patternSha256: contractHash(pilot), schemaSha256: sha256(fs.readFileSync(path.join(__dirname, '../schemas/pattern-contract.v1-draft.schema.json'))),
  frameworkVersion: require('../package.json').version,
  runtimeBundleSha256: sha256(fs.readFileSync(path.join(__dirname, '../dist/index.cjs'))),
  sourceReceiptSha256: sourceResult.receipt?.receiptSha256,
  sources: pilot.sources.map(({ repository, path: sourcePath, commit, sha256 }) => ({ repository, path: sourcePath, commit, sha256 })),
  decisionCases: cases.length, states: pilot.scenario.states.length, transitions: pilot.scenario.transitions.length,
  saveFailure: failure.status, availability: port.requirements?.availability.status,
  executionAllowed: false, productAcceptance: 'pending', liveAcceptance: 'pending', release: 'not-published',
  issues: sourceResult.issues,
};
console.log(JSON.stringify(report, null, 2));
if (sourceResult.status !== 'passed') process.exitCode = 1;
