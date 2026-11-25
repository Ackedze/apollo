'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const reconcile = require('../scripts/review-policy.cjs');
const { ownerDecision, riskFor } = reconcile;
const pull = (number = 23, sha = 'head-a') => ({ number, state: 'open', draft: false,
  head: { sha }, base: { ref: 'main', repo: { full_name: 'Ackedze/apollo' } } });
const review = (id, state = 'APPROVED', commit_id = 'head-a', login = 'Ackedze') =>
  ({ id, state, commit_id, user: { login } });

function fixture(pulls = [pull()]) {
  const state = { pulls, reviews: new Map(), runs: [], created: [], updated: [], tables: [],
    afterReviews: () => {}, readError: null };
  const rest = {
    pulls: {
      list: async () => pulls,
      get: async ({ pull_number }) => ({ data: structuredClone(pulls.find(p => p.number === pull_number)) }),
      listFiles: async ({ pull_number }) => {
        if (state.readError === pull_number) throw Error('private error details');
        return [{ filename: 'src/v3-audit/entry.ts' }];
      },
      listReviews: async ({ pull_number }) => {
        const result = structuredClone(state.reviews.get(pull_number) || []);
        state.afterReviews(pull_number);
        return result;
      }
    },
    checks: {
      listForRef: async ({ ref }) => state.runs.filter(run => run.head_sha === ref),
      create: async args => {
        const run = { ...args, id: 100 + state.created.length, app: { slug: 'github-actions' } };
        state.runs.push(run); state.created.push(run.id);
        return { data: run };
      },
      update: async args => {
        const run = state.runs.find(run => run.id === args.check_run_id);
        Object.assign(run, args); state.updated.push(structuredClone(args));
        return { data: run };
      }
    }
  };
  const summary = { addHeading: () => summary, addTable: rows => { state.tables.push(rows); return summary; }, write: async () => {} };
  state.context = { eventName: 'workflow_run', repo: { owner: 'Ackedze', repo: 'apollo' }, runId: 9,
    payload: { workflow_run: { name: 'Review policy', event: 'pull_request_review', head_sha: 'stale-event-sha' } } };
  state.run = () => reconcile({ github: { rest, paginate: (method, args) => method(args) },
    context: state.context, core: { summary } });
  return state;
}

test('risk includes current audit paths and approval implementation', () => {
  for (const [file, expected] of [['docs/TESTING.md', 'R0'], ['src/design-check/new-shell.css', 'R1'],
    ['src/v3-audit/entry.ts', 'R2'], ['src/generation/screen.ts', 'R2'],
    ['.github/workflows/review-policy.yml', 'R3'], ['scripts/review-policy.cjs', 'R3'],
    ['src/v3-audit/transport.js', 'R3']]) assert.equal(riskFor([file]), expected);
  assert.equal(riskFor(['src/v3-audit/entry.ts', 'package.json']), 'R3');
});

test('only current-head owner approval counts; comments and foreign reviews cannot replace it', () => {
  const decision = reviews => ownerDecision(pull(), reviews).conclusion;
  assert.equal(decision([]), 'failure');
  assert.equal(decision([review(1, 'APPROVED', 'old-head')]), 'failure');
  assert.equal(decision([review(1, 'APPROVED', 'head-a', 'someone-else')]), 'failure');
  assert.equal(decision([review(1, 'APPROVED', 'head-a', 'aCkEdZe')]), 'success');
  assert.equal(decision([review(3, 'COMMENTED'), review(1)]), 'success');
  assert.equal(decision([review(2, 'CHANGES_REQUESTED'), review(1)]), 'failure');
  assert.equal(decision([review(2, 'DISMISSED'), review(1)]), 'failure');
  assert.equal(decision([review(2), review(1, 'CHANGES_REQUESTED')]), 'success');
  assert.equal(ownerDecision({ ...pull(), draft: true }, []).conclusion, 'neutral');
});

test('Approve and dismissal update the same owned check instead of leaving a stale red result', async () => {
  const state = fixture();
  state.runs.push({ id: 1, head_sha: 'head-a', name: 'Required approvals', conclusion: 'failure' },
    { id: 2, head_sha: 'head-a', external_id: 'apollo-owner-approval:23', app: { slug: 'another-app' } });
  await state.run();
  const canonical = state.runs.find(run => run.id === 100);
  assert.equal(canonical.conclusion, 'failure');
  state.reviews.set(23, [review(1)]);
  await state.run();
  assert.equal(canonical.conclusion, 'success');
  state.reviews.set(23, [review(1), review(2, 'DISMISSED')]);
  await state.run();
  assert.equal(canonical.conclusion, 'failure');
  assert.deepEqual(state.created, [100]);
  assert.deepEqual(state.updated.map(run => run.check_run_id), [100, 100, 100]);
  assert.equal(state.runs[0].conclusion, 'failure', 'historical Actions check is not rewritten');
  assert.equal(canonical.head_sha, 'head-a', 'API head wins over stale workflow payload');
});

test('a new commit requires new approval and creates a check on the new SHA', async () => {
  const state = fixture();
  state.reviews.set(23, [review(1)]);
  await state.run();
  state.pulls[0].head.sha = 'head-b';
  await state.run();
  assert.deepEqual(state.runs.map(run => [run.head_sha, run.conclusion]),
    [['head-a', 'success'], ['head-b', 'failure']]);
  state.reviews.set(23, [review(1), review(2, 'APPROVED', 'head-b')]);
  await state.run();
  assert.equal(state.runs[1].conclusion, 'success');
  assert.equal(state.created.length, 2);
});

test('head changes during evaluation cancel the stale check and retry fresh API data', async () => {
  const state = fixture();
  state.reviews.set(23, [review(1)]);
  state.afterReviews = () => { state.pulls[0].head.sha = 'head-b'; state.afterReviews = () => {}; };
  await state.run();
  assert.deepEqual(state.runs.map(run => [run.head_sha, run.conclusion]),
    [['head-a', 'cancelled'], ['head-b', 'failure']]);
});

test('all open PRs refresh even when pending workflow events are coalesced', async () => {
  const state = fixture([pull(23), pull(24, 'other-head')]);
  state.reviews.set(24, [review(1, 'APPROVED', 'other-head')]);
  await state.run();
  assert.deepEqual(state.runs.map(run => [run.external_id, run.conclusion]),
    [['apollo-owner-approval:23', 'failure'], ['apollo-owner-approval:24', 'success']]);
});

test('read errors revoke a previously green owned check and do not prevent other PR refreshes', async () => {
  const state = fixture([pull(23), pull(24, 'other-head')]);
  state.reviews.set(23, [review(1)]);
  await state.run();
  state.readError = 23;
  state.reviews.set(24, [review(1, 'APPROVED', 'other-head')]);
  await assert.rejects(state.run(), /^Error: REVIEW_POLICY_REFRESH_FAILED: 23$/);
  assert.deepEqual(state.runs.map(run => run.conclusion), ['failure', 'success']);
  assert.equal(JSON.stringify(state.updated).includes('private error details'), false);
});

test('duplicates from uncertain API responses converge; unrelated PR checks are untouched', async () => {
  const state = fixture();
  for (const id of [10, 11]) state.runs.push({ id, head_sha: 'head-a',
    external_id: 'apollo-owner-approval:23', app: { slug: 'github-actions' } });
  state.runs.push({ id: 12, head_sha: 'head-a', external_id: 'apollo-owner-approval:24', app: { slug: 'github-actions' } });
  state.reviews.set(23, [review(1)]);
  await state.run();
  assert.deepEqual(state.updated.map(run => run.check_run_id), [10, 11]);
  assert.equal(state.created.length, 0);
});

test('a PR closed or retargeted during evaluation cannot get a successful approval check', async () => {
  for (const mutate of [p => { p.state = 'closed'; }, p => { p.base.ref = 'other'; }]) {
    const state = fixture();
    state.reviews.set(23, [review(1)]);
    state.afterReviews = () => mutate(state.pulls[0]);
    await state.run();
    assert.equal(state.runs[0].conclusion, 'cancelled');
  }
});

test('an unstable head fails after bounded retries instead of approving the wrong SHA', async () => {
  const state = fixture();
  state.afterReviews = () => { state.pulls[0].head.sha += '-new'; };
  await assert.rejects(state.run(), /REVIEW_POLICY_REFRESH_FAILED: 23/);
  assert.equal(state.created.length, 3);
  assert.equal(state.runs.every(run => run.conclusion === 'cancelled'), true);
});

test('unrelated workflow events are rejected before any check is created', async () => {
  const state = fixture();
  state.context.payload.workflow_run.event = 'push';
  await assert.rejects(state.run(), /REVIEW_POLICY_EVENT_INVALID/);
  assert.equal(state.created.length, 0);
});

test('fork relay has no token permissions; privileged evaluator checks out only trusted default-branch code', () => {
  const workflow = name => fs.readFileSync(path.join(__dirname, '../.github/workflows', name), 'utf8');
  const relay = workflow('review-policy.yml'), publisher = workflow('review-policy-result.yml');
  assert.match(relay, /permissions: \{\}/);
  assert.doesNotMatch(relay, /uses:|checkout|pull_request_target|secrets\./);
  assert.match(publisher, /workflow_run:\s+workflows: \[Review policy\]/);
  assert.match(publisher, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(publisher, /persist-credentials: false/);
  assert.match(publisher, /checks: write/);
  assert.match(publisher, /cancel-in-progress: false/);
  assert.doesNotMatch(publisher, /pull_request_target|head_sha|pull_request\.head|download-artifact|npm |secrets\./);
  assert.doesNotMatch(relay + publisher, /name: Required approvals/);
});
