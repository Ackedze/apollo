const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const runtime = require("../dist/runtime.cjs");
const root = path.resolve(__dirname, "..");
const ds = process.env.DESIGN_SYSTEM_AB_ROOT || path.resolve(root, "../../shared/design-system_ab");
const packageRoot = path.join(ds, "./experiments/web-core/core/Button");
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

try {
  const bytes = fs.readFileSync(path.join(packageRoot, "./compiled/component-contract.v2.json"));
  const contract = runtime.loadRuntimeContract(JSON.parse(bytes));
  const acceptance = JSON.parse(fs.readFileSync(path.join(packageRoot, "./qa/final-readiness-r31.2026-09-29.json")));
  assert.equal(contract.package.manualRevision, acceptance.targetRevision);
  assert.equal(contract.package.manualSourceHash, acceptance.candidateManualHash);
  assert.equal(acceptance.snapshotComparisons.length, acceptance.historicalSnapshots);
  const summary = { documentType: 'apollo-v4-button-replay', mode: 'offline-archived-capture',
    contractId: contract.package.id, contractSha256: sha(bytes), manualSourceHash: contract.package.manualSourceHash,
    reports: 0, historicalEvaluations: 0, currentEvaluations: 0, currentIncomplete: 0,
    currentDependencyRuns: {}, exactHistoricalReplay: true, liveFigmaVerified: false, published: false };
  for (const item of acceptance.snapshotComparisons) {
    const fixture = path.resolve(packageRoot, item.file);
    assert.ok(fixture.startsWith(packageRoot + path.sep));
    const capture = zlib.gunzipSync(fs.readFileSync(fixture));
    assert.equal(sha(capture), item.sha256, 'Archived capture checksum mismatch');
    const report = JSON.parse(capture);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.replayArchivedReport(report))), report.results.engine, 'Historical JSON output must replay exactly');
    const current = runtime.auditContractSnapshot(report.snapshot, contract);
    summary.reports++; summary.historicalEvaluations += report.results.engine.evaluations.length;
    summary.currentEvaluations += current.engine.evaluations.length;
    if (!current.coverage.executionComplete) summary.currentIncomplete++;
    for (const run of current.engine.dependencyRuns || []) summary.currentDependencyRuns[run.status] = (summary.currentDependencyRuns[run.status] || 0) + 1;
  }
  summary.acceptanceComparedEvaluations = acceptance.comparedEvaluations;
  assert.equal(summary.currentEvaluations, acceptance.comparedEvaluations);
  // Current snapshots retain their original scenario inputs and evidence pins.
  // This is execution compatibility, not a claim of r31 scenario acceptance.
  fs.writeFileSync(path.join(root, "./dist/button-replay.json"), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
} catch (error) { console.error(error.message); process.exitCode = 1; }
