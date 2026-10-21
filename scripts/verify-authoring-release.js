// Opt-in private source verification. Output contains hashes and aggregates only.
// No Figma or agent calls; no source norms/captures are copied into the repo.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const runtime = require("../dist/runtime.cjs");
const root = path.resolve(__dirname, "..");
const ds = process.env.DESIGN_SYSTEM_AB_ROOT || path.resolve(root, "../../shared/design-system_ab");
const releaseRoot = process.argv[2] || path.join(root, "./dist/pilot-release");
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const equal = (a, b, message) => assert.ok(JSON.stringify(a) === JSON.stringify(b), message);
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, "./manifest.json")));
  const identity = Object.assign({}, manifest); delete identity.id; assert.equal(sha(JSON.stringify(identity)), manifest.id);
  assert.equal(manifest.runtime.version, runtime.RUNTIME_VERSION);
  const locations = { 'core.web.spinner': 'web-core/core/Spinner', 'core.web.button': 'web-core/core/Button',
    'web-corp.corporate-content': 'web-corp/CorporateContent/authoring',
    'core.web.amount': 'web-core/core/Amount/authoring', 'corp.web.amount-styles': 'web-corp/AmountStyles/authoring' };
  const summary = { documentType: 'apollo-v4-authoring-source-parity', releaseId: manifest.id, packages: [],
    historicalReports: 0, historicalEvaluations: 0, currentReports: 0, currentEvaluations: 0, liveFigmaVerified: false };
  let corporate;
  for (const entry of manifest.contracts) {
    const directory = path.join(ds, "./experiments", locations[entry.componentId]);
    const manual = JSON.parse(fs.readFileSync(path.join(directory, 'contract.manual.json')));
    const expected = JSON.parse(fs.readFileSync(path.join(directory, 'compiled/component-contract.v2.json')));
    const bytes = fs.readFileSync(path.join(releaseRoot, entry.file)); assert.equal(sha(bytes), entry.sha256);
    const loaded = runtime.loadAuthoringSource(JSON.parse(bytes));
    equal(loaded.source.manual, manual, 'Release must carry the principal manual unchanged');
    equal(loaded.contract, expected, 'Source compiler must exactly reproduce the accepted exported contract');
    assert.equal(loaded.sourceHash, entry.sourceHash); assert.equal(runtime.contractHash(manual), entry.manualSourceHash);
    assert.equal(runtime.contractHash(expected), entry.contractHash);
    summary.packages.push({ id: entry.id, revision: manual.metadata.revision, manualSourceHash: entry.manualSourceHash,
      generatedFactsHash: entry.generatedFactsHash, sourceHash: entry.sourceHash, compiledHash: entry.contractHash,
      sourceRules: manual.rules.length, compiledChecks: loaded.contract.rules.length, exactProjectionParity: true });
    if (entry.componentId === 'web-corp.corporate-content') corporate = { directory, contract: loaded.contract, revision: manual.metadata.revision };
  }
  if (corporate) {
    const directory = path.join(corporate.directory, 'reports/fixtures/r10-r11');
    for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.json.gz')).sort()) {
      const bytes = zlib.gunzipSync(fs.readFileSync(path.join(directory, name))), report = JSON.parse(bytes);
      equal(runtime.replayArchivedReport(report), report.results.engine, 'Historical engine replay must remain exact');
      summary.historicalReports++; summary.historicalEvaluations += report.results.engine.evaluations.length;
      if (report.sources.manual.metadata.revision === corporate.revision) {
        equal(runtime.auditContractSnapshot(report.snapshot, corporate.contract).engine, report.results.engine,
          'Current manual-derived runtime must preserve every captured evaluation');
        summary.currentReports++; summary.currentEvaluations += report.results.engine.evaluations.length;
      }
    }
    assert.equal(summary.currentReports, 2); assert.equal(summary.currentEvaluations, 34);
  }
  fs.writeFileSync(path.join(root, "./dist/authoring-parity.json"), JSON.stringify(summary, null, 2) + '\n');
  console.log(summary.packages.length + ' principal manuals reproduce the accepted projections exactly; CorporateContent: '
    + summary.historicalReports + ' historical reports, ' + summary.currentEvaluations + ' current evaluations preserved.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
