'use strict';

const CHECK = 'Required approvals';
const REVIEWER = 'ackedze';
const events = new Set(['pull_request', 'pull_request_review']);
const decisive = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
const r3 = [/^\.github\/workflows\//, /^scripts\/review-policy\.cjs$/, /^manifest\.json$/,
  /^package(-lock)?\.json$/, /^build\.js$/, /^SECURITY\.md$/,
  /^src\/(?:v3-audit\/)?utils\/networkFetch\.ts$/, /^src\/v3-audit\/(data-client\.ts|transport\.js)$/];
const r2 = [/^src\/code\.ts$/, /^src\/create-check-state\.ts$/,
  /^src\/(assessment|config|contracts|filters|policies|reference|services|stats|structure|types)\//,
  /^src\/(v3-audit|v3-binding|document-audit|figma-audit|generation|skills)\//,
  /^src\/ui-app\/bridge\//,
  /^src\/utils\/(componentKeyCache|nodeHelpers|variableBindingReset|variableCollectionId|variantProperties)\.ts$/];

function riskFor(paths) {
  const matches = patterns => paths.some(path => patterns.some(pattern => pattern.test(path)));
  return matches(r3) ? 'R3' : matches(r2) ? 'R2' : paths.some(path => path.startsWith('src/')) ? 'R1' : 'R0';
}

function ownerDecision(pull, reviews) {
  if (pull.draft) return { conclusion: 'neutral', label: 'Draft; approval deferred' };
  const latest = reviews.filter(review => review.user?.login?.toLowerCase() === REVIEWER && decisive.has(review.state))
    .sort((a, b) => a.id - b.id).at(-1);
  return latest?.state === 'APPROVED' && latest.commit_id === pull.head.sha
    ? { conclusion: 'success', label: 'Approved by @Ackedze for this head' }
    : { conclusion: 'failure', label: 'Current head requires @Ackedze approval' };
}

async function reconcile({ github, context, core }) {
  if (context.eventName !== 'workflow_run' || context.payload.workflow_run?.name !== 'Review policy'
    || !events.has(context.payload.workflow_run.event)) throw Error('REVIEW_POLICY_EVENT_INVALID');
  const { owner, repo } = context.repo, target = `${owner}/${repo}`.toLowerCase();
  const base = { owner, repo }, api = github.rest;
  const active = pull => pull.state === 'open' && pull.base.ref === 'main'
    && pull.base.repo.full_name.toLowerCase() === target;
  const list = (method, args) => github.paginate(method, { ...base, per_page: 100, ...args });
  const details_url = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const rows = [], errors = [];
  const pulls = await list(api.pulls.list, { state: 'open', base: 'main' });

  for (const listed of pulls) {
    try { rows.push(await refresh(listed.number)); }
    catch { errors.push(listed.number); rows.push([`#${listed.number}`, 'Error', 'Approval could not be confirmed']); }
  }
  await core.summary.addHeading('Apollo review policy')
    .addTable([[{ data: 'PR', header: true }, { data: 'Risk', header: true }, { data: 'Current owner approval', header: true }], ...rows]).write();
  if (errors.length) throw Error(`REVIEW_POLICY_REFRESH_FAILED: ${errors.join(', ')}`);

  async function refresh(number) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: pull } = await api.pulls.get({ ...base, pull_number: number });
      if (!active(pull)) return [`#${number}`, '-', 'Closed or outside main'];
      const sha = pull.head.sha, external_id = `apollo-owner-approval:${number}`;
      const runs = (await list(api.checks.listForRef, { ref: sha, check_name: CHECK, filter: 'all' }))
        .filter(run => run.external_id === external_id && run.app?.slug === 'github-actions');
      if (!runs.length) {
        const { data: created } = await api.checks.create({ ...base, name: CHECK, head_sha: sha,
          external_id, details_url, status: 'in_progress' });
        runs.push(created);
      }
      const complete = async (conclusion, title, summary) => {
        // Reuse the same owned check, including duplicates left by an uncertain API response.
        for (const run of runs) await api.checks.update({ ...base, check_run_id: run.id, name: CHECK,
          details_url, status: 'completed', conclusion, output: { title, summary } });
      };
      try {
        const files = await list(api.pulls.listFiles, { pull_number: number });
        const reviews = await list(api.pulls.listReviews, { pull_number: number });
        const { data: current } = await api.pulls.get({ ...base, pull_number: number });
        if (!active(current) || current.head.sha !== sha) {
          await complete('cancelled', 'PR changed during evaluation', 'This check belongs to a superseded head or closed PR.');
          continue;
        }
        const risk = riskFor(files.map(file => file.filename)), decision = ownerDecision(current, reviews);
        await complete(decision.conclusion, `${risk}: ${decision.label}`,
          `Head: ${sha}\n\n${decision.label}. Native code-owner and branch protections remain required.`);
        return [`#${number}`, risk, decision.label];
      } catch {
        await complete('failure', 'Approval could not be confirmed', 'GitHub data could not be read. Approval remains required.');
        throw Error('REVIEW_POLICY_READ_FAILED');
      }
    }
    throw Error('REVIEW_POLICY_HEAD_UNSTABLE');
  }
}

module.exports = reconcile;
module.exports.riskFor = riskFor;
module.exports.ownerDecision = ownerDecision;
