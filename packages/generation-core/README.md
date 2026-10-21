# Apollo generation core

G02: read-only inventory of authoring ZIPs, canonical compilation and a pinned
run lock. Norms come from each component's own manual. The caller injects the
existing Apollo source loader and compatibility profile; this package does
not import the plugin app or define another evaluator.

`loadContractPackages(archives, {runtime, readZip, identity}, expectedLock?)`
returns sources, verified compiled contracts, declared representations,
check scope and a deterministic lock. Every dependency needs its own authoring
ZIP. Embedded compiled artifacts provide anatomy/export-stamp evidence only;
manual/facts must reproduce them through the shared compiler. Conflicts,
stale host caches, missing facts, invalid pins and unsupported schemas fail.
The lock pins ZIP bytes, source/facts/compiled hashes, dependency closure and
runtime build identity. Supplying it on a repeat run rejects drift.

From the Apollo root, using Node.js 22 and existing root dependencies:

```sh
npm run generation:validate
npm run generation:packages -- /absolute/path/to/current-contract-packages /tmp/generation-lock.json
npm run generation:packages -- /absolute/path/to/current-contract-packages /tmp/generation-lock-repeat.json /tmp/generation-lock.json
```

Output files must be new and outside the source catalog. The local entry point
verifies runtime build inputs and rechecks ZIP bytes before writing a lock.
It does not write sources, publish a release, invoke an agent or mutate Figma.
No production manuals/catalogs are included in tests. Private locks and run
artifacts belong in `/tmp` or ignored `generation-runs/`.

G03/G04/G05 now have experimental portable schemas, a derived GenerationView,
a common preflight and target execution protocols. Their product controller and
diagnostics live in `.`; the actual native Figma host and external
frontend/Proxy host still require the accepted mapping/scope handoff. Compiled readiness describes the Apollo
predicate consumer; it does not certify generation, frontend parity, scenario
coverage or published consumer acceptance.


## NEXT-03: one plan for Apollo

`src/planning/index.ts` is browser portable and bundles without Node APIs.
`validateScreenSpec` accepts one bounded tree, the closed `stack` / `text`
primitive list, component mapping IDs, typed scalar/state properties, named
content slots and owned actions with declared events. It rejects cycles,
multiple parents, unknown node kinds, arbitrary code/functions, missing state
values and ambiguous transitions. Primitives cannot act as a substitute for a
missing library component. No prompt interpreter is implemented yet.

`projectGenerationView` derives APIs, representations, dependency identity,
source status and coverage from the canonical G02 inventory. It rechecks hashes
and never generates or changes norms. The existing accepted Ready gate in the
Apollo source runtime remains in place, before this projection.

`createCompositionPlan` freezes a copy of the spec and pins spec, complete
package lock, view, mapping registry and observed code checkout. `preflightPlan`
uses those same pins for Figma and frontend. Public arui-private availability is
mandatory for both. Internal implementation dependencies do not grant standalone
imports. Missing exports, API bindings, property domains, platform, slot targets,
source readiness, stale evidence or changed lock produce diagnostics before any
creation. Figma-only missing transforms/slots block its route separately.

`MappingRegistry` is an experimental **consumer port**, not a second registry
owned by Generation. NEXT-01 produces
`arui-private/tools/code-connect/registry/arui-private-80.7.1.v1.json` with schema
`apollo.arui-private-mappings.v1`; its read-only consumer verifies real files,
public exports and authoring ZIP hashes. Read-only normalization is implemented in `src/planning/code-connect.ts`; the
consumer boundary remains subject to General review. It preserves producer digest,
locks, all distinct source hashes and gaps. This port does not
promote `confirmed-source-api` into full parity or a verified contract code
representation. No real registry/catalog is copied into Apollo fixtures.

`GenerationContext` comes from a trusted canonical source/fresh checkout reader,
never a prompt or an imported ScreenSpec. A JSON assertion that an export is
confirmed is insufficient. Each host re-reads context before mutation and after
capture/build verification. The v4 controller's default input reader deliberately
reports `CODE_EVIDENCE_PORT_UNAVAILABLE` until the approved local/Proxy provider
is connected. The v4 panel validates ScreenSpec and exposes this diagnostic;
it cannot create targets through an absent host.

Target receipts pin the same plan, preserve node/action provenance, verification
facts/check hashes and rollback outcome. `assessVerification` requires evidence
for rules and every planned node/action/state/event. Syntax, a successful capture
or a host declaring PASS does not alone produce a verified receipt. Pending
context-only / non-executable routes remain incomplete. Real frontend compile /
browser verification belongs in the external frontend host, outside the Figma
sandbox. No backend behavior is inferred from event IDs.

## Current pilot and next inputs

The current pilot is CorporateContent → Body → ButtonGroup, two agreed actions,
desktop first. The previous Amount/confirmation scenario stays separate. The
tracked tests use a **synthetic** two-action scenario and synthetic source API;
its labels/states are not a frozen product pilot.

Read-only loading of the registry-selected desktop closure on 05.10.2026 stops with
`SOURCE_COMPILE / Runtime requires an accepted ready contract` for ButtonsGroup.
The newly authored behavior scope is Draft. No old revision or fabricated
accepted projection is substituted. API availability, source readiness,
preflight and actual target verification must be reported separately.

Remaining inputs/work:

1. General accepts NEXT-01 registry handoff and the consumer normalization port.
2. Contract Creation / General agree the accepted generation scope and current
   pins while preserving the complete Draft source and its behavior gaps.
3. Freeze actual pilot labels, actions, transitions, viewport and supported
   properties from that handoff; make one real saved plan.
4. Connect canonical inputs and fresh Code Connect observation to the v4
   controller. Supply native slot/action handlers and an external frontend host.
5. Compile real arui-private imports, run browser scenarios/width fit, and prepare
   user-run live Figma scenarios. Local protocol tests do not close these gates.

Run existing root dependencies without installing another product:

```sh
npm --prefix packages/generation-core run validate
npm --prefix packages/adapter-figma run validate
npm --prefix packages/adapter-frontend run validate
npm --prefix . run validate
```

Versions remain generation-core 0.1.0, shared core 0.1.9, Apollo profile 0.4.0;
new private adapter packages start at 0.1.0. Publication, live acceptance and
release are open. General owns sequential updates to the common README/backlog.


## Verified handoff snapshot, 05.10.2026

NEXT-01's real read-only consumer is now exercised by Apollo's
`scripts/inspect-generation-inputs.js`. It verifies producer registry/lock,
checkout files and public exports, then loads explicit desktop archive SHA pins
and exact own-source dependencies through the unchanged G02/compiler gates.
A separate mobile archive with the same component ID cannot shadow the selected
desktop root. Missing, ambiguous or changed dependency archives fail.

```sh
node scripts/inspect-generation-inputs.js /absolute/arui-private /absolute/current-contract-packages
```

Current observation: API availability confirmed; source readiness blocked
(`SOURCE_COMPILE`, accepted Ready gate); common preflight blocked; both actual
targets not run. Producer registry is 1.0.0 for arui-private 80.7.1 and pins
ButtonsGroup r57, CorporateContent desktop r12 / mobile-web r7. The reference
node is a producer API example, not a frozen product ScreenSpec. The inspector
creates no target, installs no package and does not normalize or promote source.
Its exit code 2 explicitly reports blocked source/preflight.

The common owned-action format can express primary/secondary and typed disabled
states when the producer confirms the group/element transformation. Unknown
recipes, a second primary, competing group priority or absent disabled bindings
block both routes. These are API mappings; source norms remain in the manual.

Final local gates: generation-core 36/36, Figma protocol 8/8, frontend emitter /
protocol 8/8, Apollo 157/157. Existing v4 UI and Generation panel pass in the
installed Chrome at 440/360 px. Actual arui-private frontend compilation and
browser behavior, native Figma host/capture and live acceptance remain open.
Run generation-core before adapters: adapter tests consume its built output.

The full root `npm run validate` still fails on the previously missing CardImage
fixture in the external DS catalog. Root typecheck, build and Figma parser gate
pass; that fixture is neither fabricated nor treated as a successful full gate.
Common README/backlog updates remain a sequential General handoff. The UI shows
`CODE_EVIDENCE_PORT_UNAVAILABLE` until its trusted canonical-input/Proxy reader
is connected, and keeps target creation disabled. CLI infrastructure does not
complete that product integration or NEXT-04/NEXT-05.


## NEXT-01 / NEXT-06 integration, 05.10.2026

`normalizeCodeConnect` selects explicit mapping IDs and joins them to a canonical
GenerationView by archive SHA, contract ID/revision, manualSourceHash, compiled
hash and exact dependency closure. The producer's manual-byte SHA stays distinct
from canonical manualSourceHash and compiledHash. Missing accepted semantic API
bindings remain absent. Proposed code representations, unresolved built package,
full parity, publication/live/release statuses and all producer gaps survive.
Current source-confirmed ButtonGroup profile is explicit size=56,
maxVisibleButtons=4, native Size=56 / Overflow=false; width fit remains a real
frontend runtime check. No Boolean overflow code prop is invented.

The trusted Node/Proxy provider in v4 `scripts/generation-code-connect-inputs.js`
loads the read-only producer, checks the exact lock and real source/mapping/ZIP
files, calls its actual `preflight` for every declared ScreenSpec state, and
rechecks freshness before returning. Common preflight requires the observation
to match producer digest/lock, code hash and the exact spec/all states. The
controller and both adapters pass that spec on every fresh context read. Neither
an imported spec nor the pure normalization helper can attest freshness.

`packages/pattern-core` is integrated unchanged from NEXT-06 as
0.1.0-draft.1. The trusted Node bridge verifies sources, prepares draft semantic
requirements and attaches decisions, compositions/activeStates, constraints,
source receipts, gaps and explicit role-to-node bindings to the frozen common
plan. Component binding `contractSha256` means canonical **compiledHash** in this
consumer; target-specific representation IDs remain distinct. Real pilot bindings
and save failure stay unresolved. No implicit state-machine/initial-state merge
or semantic-role inference occurs. Every draft attachment blocks both targets
with `PATTERN_DRAFT`; `executionAllowed:false` is preserved.

See the concrete [native/Proxy host handoff](../../docs/GENERATION_HOST_PORTS.md).
The default v4 UI reader/hosts remain unavailable until General connects these
ports. The integrated framework and read-only bridge do not establish an actual
product end-to-end route.

## NEXT-03 · Metadata-only Draft source / producer review

`readAuthoringPackageReview` is a separate Node API with exact external-main/ZIP,
source, dependency and build pins. It uses `reviewAuthoringSource` metadata and
preserves normal compiler errors/Draft coverage. `inspectStaticProducerReview`
reconstructs the closed producer-owned v1-draft JSON against an independent basis;
source/content/authority drift rejects import, consumer drift rejects freshness
and permits explicitly historical content only. Both return accepted=false and
executionAllowed=false; producer hashes never become a Generation plan hash.
The strict execution loader, normal Ready gates and v1 compatibility are unchanged.
No review DTO belongs to the execution inventory or adapter plan unions. Current
baseline core0.1.10/Editor0.2.91/Generation0.1.1/v4 0.4.0; older sections above
retain historical snapshots. [Separate Node v4 port and verified limits](../../docs/GENERATION_DRAFT_SOURCE_REVIEW.md).
