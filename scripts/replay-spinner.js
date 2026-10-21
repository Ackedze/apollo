const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const runtime = require("../dist/runtime.cjs");

const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../..");
const designSystemRoot = process.env.DESIGN_SYSTEM_AB_ROOT
  ? path.resolve(process.env.DESIGN_SYSTEM_AB_ROOT)
  : path.join(workspace, "./shared/design-system_ab");
const packageRoot = path.join(designSystemRoot, 'experiments/web-core/core/Spinner');
const read = (name) => JSON.parse(fs.readFileSync(path.join(packageRoot, name), 'utf8'));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function semanticEvaluations(evaluations) {
  return evaluations.map((entry) => {
    const result = Object.assign({}, entry);
    delete result.evaluationId;
    delete result.ruleRevision;
    return result;
  });
}

function replay() {
  const contractBytes = fs.readFileSync(path.join(packageRoot, 'compiled/component-contract.v2.json'));
  const contract = runtime.loadRuntimeContract(JSON.parse(contractBytes));
  const acceptance = read('qa/layout-live-acceptance.2026-09-27.json');
  const routing = read('runtime/component-contract.index.json');
  assert.equal(acceptance.reportResults.length, 6, 'Six preserved Spinner captures are required');
  let total = 0;
  const reports = [];
  for (const item of acceptance.reportResults) {
    const fixturePath = path.resolve(packageRoot, item.fixtureFile);
    assert.ok(fixturePath.startsWith(packageRoot + path.sep), 'Fixture must remain inside the package');
    const bytes = zlib.gunzipSync(fs.readFileSync(fixturePath));
    assert.equal(hash(bytes), item.sha256, 'Preserved capture checksum must match acceptance');
    const report = JSON.parse(bytes);
    assert.deepEqual(runtime.replayArchivedReport(report), report.results.engine, 'Historical engine result must replay exactly');
    const current = runtime.auditContractSnapshot(report.snapshot, contract);
    assert.deepEqual(semanticEvaluations(current.engine.evaluations), semanticEvaluations(report.results.engine.evaluations), 'Accepted revision must preserve every evaluation except revision-derived IDs');
    assert.deepEqual(current.engine.coverage, report.results.engine.coverage);
    assert.equal(current.coverage.executionComplete, true);
    total += current.engine.evaluations.length;
    reports.push({ checksum: item.sha256, evaluations: current.engine.evaluations.length,
      byClassification: current.engine.coverage.byClassification, exactHistoricalReplay: true, acceptedRevisionParity: true });
  }
  assert.equal(total, 1008, 'All archived evaluations must be preserved');
  const summary = {
    documentType: 'apollo-v4-spinner-parity', mode: 'offline-archived-capture',
    contractId: contract.package.id, contractSha256: hash(contractBytes), manualSourceHash: contract.package.manualSourceHash,
    reports: reports.length, evaluations: total, exactHistoricalReplay: true, acceptedRevisionParity: true,
    routingPublished: routing.published, routingStatus: routing.status,
    liveFigmaVerified: false, codexIntegrated: false,
    captures: reports,
  };
  fs.writeFileSync(path.join(root, "./dist/spinner-parity.json"), JSON.stringify(summary, null, 2) + '\n');
  console.log(`Spinner: ${summary.reports} archived captures, ${total} evaluations; exact historical replay and accepted-revision parity passed.`);
  console.log(`Routing remains ${routing.status}, published=${routing.published}; this is offline evidence, not a live Figma run.`);
}

try { replay(); } catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
