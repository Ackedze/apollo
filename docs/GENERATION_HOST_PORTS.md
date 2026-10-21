# Apollo Generation · native/Proxy handoff

Status: implementation ports / General integration review, 05.10.2026.
The default plugin provider and actual targets remain unavailable. This document
does not assign backend service edits, approve a release or certify live parity.

## Trusted inputs before either target

`GenerationPorts.readContext(spec: ScreenSpec): Promise<GenerationContext>` is
called by preparation and execution. Both adapters repeat the same exact-spec
read before and after writes/verification. It must return fresh producer
preflight evidence; offline `prepare` or prompt-supplied confirmation is invalid.

Node provider: `scripts/generation-code-connect-inputs.js` exports
`createCodeConnectReader({repo, catalog, workspaceRoot, hash, ...})(spec)`.
It uses NEXT-01 `loadRegistry`, `verifyLock`, `verifySource`, and actual `preflight`
for every declared state. Source projection uses the unchanged canonical G02
loader and physical v4 runtime identity. Current accepted Ready gate stops at
ButtonsGroup r57 Draft; no normalized real plan is fabricated around that gate.

The provider needs real arui-private checkout, producer schema/registry/lock and
consumer tooling, exact selected authoring ZIPs/dependencies, and freshly built
v4 runtime/build-inputs. Hash must be the same canonical hash used by the v4
controller. Observation pins producer digest, producer lock, spec, code files,
all state receipts; the frozen plan separately pins full contract/view/registry
and code identities. An observation hash checks integrity, not authenticity:
the provider/transport remains a trusted boundary.

Future Proxy routing must pass this context over an authenticated existing
v4 transport. General owns endpoint/authorization, source paths and backend
service scopes. No guessed HTTP endpoint is added by this handoff.

## Draft pattern boundary

The Node-only `scripts/generation-pattern-inputs.js` consumes integrated
`packages/pattern-core@0.1.0-draft.1`. Optional provider inputs:

- `patternRequests`: pattern/context/platform/target and explicit
  composition-role → ScreenSpec node bindings;
- `readPatternSource(reference)`: immutable bytes and observed commit, checked
  again when fresh context is requested;
- reviewed `semanticRoleBindings`: entry ID, producer digest, compiledHash,
  semantic role and review evidence hash. None are supplied for the real pilot.

The draft component lock's `contractSha256` maps to canonical **compiledHash**.
Archive SHA, manual bytes SHA, canonical manualSourceHash and compiledHash stay
distinct in the common registry/package lock. `representationId` is Figma ID
for Figma and code ID for frontend; mapping ID is neither representation ID.
Required inputs/slots use accepted semantic API IDs. A source API list cannot
grant a dialog/action/notification semantic role; grants need General/Patterns
review. Internal Core Button remains an implementation dependency.

The attachment retains requirements, pattern/source receipt, decision provenance,
activeStates, transitions/actions, constraints, all gaps and explicit node
bindings. It never merges machines or assumes an initial state. Changing an
attachment invalidates the common plan. V1 accepts only Draft and always has
`executionAllowed:false`; preflight reports `PATTERN_DRAFT` for both targets.
Save failure and actual UI bindings remain unresolved. Future accepted patterns
need a separately agreed version/protocol; no promotion switch is introduced.

## Native Figma host

The exact `FigmaHost` interface is in
`packages/adapter-figma/src/index.ts`. Native plumbing is now implemented in
`src/generation/figma/host.ts`, canonical capture in `src/generation/figma/capture.ts`,
and trusted binding ports in `src/generation/native/bindings.ts`. Accepted source
recipes/native SLOT operation/live acceptance remain separate missing inputs.
See `GENERATION_NATIVE_HOST.md` for exact fields, diagnostics and tests.
The implementation follows these required operations:

1. Resolve pinned component keys, fonts, native SLOT/property and owned-action
   handlers before opening a transaction; verify resolution again before use.
2. Create real library instances and the closed stack/text primitives. Bind
   mapped typed properties and the producer's fixed Size=56/Overflow=false
   profile. Fill CorporateContent Body via native SLOT identity, preserving
   order; no name search, detach or replacement drawn component.
3. Populate ButtonGroup's owned Button occurrences. Handler input must expose
   NEXT-01 `visibleOccurrenceIds`, `handlersByOccurrenceId` and
   `identityByOccurrenceId`, direct-child order/symbol IDs and locked Button
   dependency/componentSet identity. Source occurrence bindings are still a
   dependent input; normalization leaves host IDs absent.
4. Map action IDs to actual occurrence IDs, labels, view and disabled state,
   then bind accepted prototype/state transitions. Product/backend operations
   remain explicit external handlers; no invented save/navigation behavior.
5. Capture/evaluate with the existing v4 source engine. Return actual facts/check
   hashes and provenance for nodes/actions/states/events. Context-only and
   non-executable coverage remains incomplete. Live scenarios belong to the
   user, with full rule text and stable RuleID visible on every case.
6. Track and roll back only nodes created by this transaction, including partial
   failures. Existing canvas content must survive rollback.

Inputs still needed: accepted NEXT-02 source/code passports and generation scope,
confirmed native slot/occurrence handlers, product labels/actions/transitions,
and accepted desktop viewport. Native host transaction/capture/rollback and installed typings are offline-tested; actual native execution/live acceptance are not run.

## External frontend / Proxy host — первоначальные требования

The exact `FrontendHost` interface and emitter are in
`packages/adapter-frontend/src/index.ts`. Suggested assigned local provider area:
`scripts/generation-frontend-host.js`; client transport in v4 after General
agrees the backend route. The host runs outside the Figma sandbox and needs:

1. An isolated private workspace with an explicit real arui-private source or
   distribution manifest, its lock and matching peer/type dependencies.
   Project-local installation/build is authorized; system installation,
   production deployment and package publishing are outside this handoff.
2. Atomic creation of emitted files, strict path bounds and a transaction ledger.
   Import only confirmed public subpaths. Fixed ButtonGroup props are emitted
   explicitly; event IDs bind real scenario callbacks.
3. Actual TypeScript/React compilation and installed browser execution at agreed
   widths. Verify both handlers, state transitions/disabled state, action order
   and width fit without involuntary overflow. Preserve NEXT-01 gaps concerning
   responsive geometry/paddings, surface and overflow routing.
4. Actual DOM/state/check evidence tied to the same plan/source/code hashes.
   Syntax-only transpile or a synthetic host PASS is insufficient. Failure or
   freshness drift rolls back new output files.

Историческое наблюдение до NEXT-05 implementation: Code Connect's local TypeScript/CLI tooling is installed;
root arui-private dependencies are absent; built private package resolution is
unverified. Full frontend compile/browser/geometry parity has not run. Existing
Apollo/esbuild and installed Chrome/Playwright verify local protocol/UI only.

## Local checks and remaining gates

`node scripts/check-generation-code-connect.js <arui-private> <catalog>` runs
the real read-only producer API gate, stale-lock and unsupported-prop regressions
and trusted canonical reader. It copies no catalog into tracked fixtures and
creates no target. Current result: API confirmed, source blocked `SOURCE_COMPILE`,
actual targets not-run. Pure normalization and pattern integration use synthetic
regressions; real normalization waits for accepted source/passport handoff.

Generation module, v4 and browser tests are separate from root validation.
The legacy CardImage fixture path was corrected on 05.10.2026; the full root gate passed all 81 regression scripts.
General owns product integration/review, source scope acceptance, actual two-target
pilot, semantic parity, live acceptance and release.


05.10.2026 transport update: the Node reader is now mounted at
`POST /generation/context` in the local Proxy and connected to main through
`generation-proxy-port.ts` / `generation-proxy-ui.js`. Cancelled/cross-request
responses and bad hashes fail closed. Frontend host/service subsequently connected under NEXT-05; accepted profile/commands/source/parity/live remain open. The native Figma plumbing was subsequently connected under NEXT-04; accepted recipes/source/native API/live inputs remain open.

Реализованный frontend path, closed DTO и actual import/browser receipts: [GENERATION_FRONTEND_HOST](GENERATION_FRONTEND_HOST.md). Ни одно историческое not-run выше не описывает synthetic-local NEXT-05 host tests. Normative execution/live остаётся blocked/not-run.
