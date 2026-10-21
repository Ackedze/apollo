# Generation integration handoff · Apollo · 05.10.2026

Текущий NEXT-05 status и окончательные build pins: [GENERATION_FRONTEND_HOST](GENERATION_FRONTEND_HOST.md).
Предыдущие разделы фиксируют соответствующие исторические milestones.

Owner: Apollo CB :: Generation, following General's NEXT-01/NEXT-06 assignment.
The direct product request in this turn also added ScreenSpec drag/drop.

## Implemented

- v4 Generation panel accepts one JSON by drag/drop or accessible file picker,
  up to 1 MiB. Shared parsing/invalidations, stale plan clearing, busy guards,
  hover state and outside-drop navigation prevention are tested in Chrome.
- `generation-core/src/planning/code-connect.ts` normalizes the read-only
  NEXT-01 producer into the existing consumer port. It preserves registry
  digest/lock, distinct archive/manual-byte/manualSource/compiled hashes,
  exact dependencies, public exports, proposed representation and independent
  API/parity/build/live/publication/release states and all gaps. Missing passport
  semantic bindings stay absent; no representation or source is promoted.
- `v4/scripts/generation-code-connect-inputs.js` is a Node/Proxy trusted reader.
  It uses the producer's real `preflight` for each declared spec state, verifies
  filesystem/git/mapping/archive freshness and rechecks at the boundary. Common
  preflight requires the exact spec/code/producer/all-state observation. Every
  controller/adapter context read now receives the frozen ScreenSpec.
- The fixed confirmed group profile is explicit in both output protocols:
  size=56/maxVisibleButtons=4, native Size=56/Overflow=false. Width fit and
  overflow/geometry gaps remain actual runtime verification requirements.
- NEXT-06 scoped pattern-core source transferred unchanged: 26 original source,
  schema, pilot, test and documentation files match the isolated checkout.
  One consumer integration note is added. Draft version/schema, pilot/source
  receipt pins and `executionAllowed:false` remain intact.
- Node-only pattern bridge attaches source-verified requirements, decisions,
  activeStates/transitions, constraints, gaps and explicit node bindings to
  the common frozen plan. It blocks both targets with PATTERN_DRAFT. Save
  failure and real pilot UI bindings remain unresolved. No machines/default
  states/product functions are inferred.
- Proposed port reconciliation is concrete and regression-covered:
  component contractSha256 = canonical compiledHash, target-specific code/Figma
  representation IDs, producer digest, semantic API ports and reviewed role
  bindings pinned by digest/compiledHash/evidence. General/Patterns review is
  still required; no real semantic role grants are supplied.

## Current source and execution observations

Producer registry schema `apollo.arui-private-mappings.v1`, registry version
1.0.0, digest `bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0`.
arui-private 80.7.1, commit `c037d0c322ea9774a9c251400d76d41222819b87`.
Исторический NEXT-01/NEXT-04 producer закреплял ButtonsGroup r57 / CorporateContent desktop r12 / mobile r7.
Readonly consumer tests report API confirmed, canonical source blocked
SOURCE_COMPILE (accepted Ready gate), actual Figma/frontend targets not-run.
Real normalization/common-plan execution waits for accepted source/passports;
no fabricated real Ready view or older revision is substituted.

NEXT-05 owner selective build/browser input is now available for two public
subpaths; full package distribution and layout/profile acceptance remain unconfirmed.
The source-build report hash was verified read-only; that browser work was not repeated.
Native host is connected, while accepted recipes and actual execution remain missing.
NEXT-02 fields/exporter/consumer proof are now implemented in core 0.1.10 / Editor
0.2.91; see [exact owner handoff](GENERATION_CODE_EVIDENCE.md). Production source
ZIPs/registry/locks/manifest and scoped authority remain unchanged.

## Validation

- pattern-core: typecheck/build + 60/60 tests; independent Ajv 12/12 schema cases.
- real pattern pilot: sources/exact IDs and 18 contexts pass; Draft with 4 states,
  10 transitions, save failure/UI availability unresolved. Pattern/source/schema
  receipt pins match NEXT-06; local rebuilt bundle hash differs with checkout path.
- generation-core: typecheck/build + 47/47 tests.
- Figma protocol: 8/8; frontend emitter/protocol: 8/8. All module checks rebuilt.
- Apollo: typecheck/build + 162/162 tests.
- UI: existing and Generation browser tests pass at 440/360 px. Drag/drop success,
  invalid extension/JSON, oversized/multiple files, busy and stale-response guards.
- real read-only Code Connect bridge: 4 checks pass (actual producer preflight,
  stale exact lock, unsupported prop and current trusted canonical source gate).
- full root npm validate: typecheck/build/Figma parser PASS; existing CardImage
  ENOENT stops legacy suite. Full gate/live reload readiness is not claimed.

Build pins: runtime SHA
`c5e3e64b8fa8db6738f12a95a2ffc251ec50505245fd199abbc86d13193b9734`,
build-inputs SHA
`f2b4e05b8f87c56b3dd638641f9d2c3130ff9e6a78fab7352e7f2c802890642d`.
Versions unchanged: generation/adapters 0.1.0, shared core 0.1.9,
v4 profile 0.4.0, pattern-core 0.1.0-draft.1.

## Next inputs / assigned boundaries

Concrete operations, suggested v4 source/provider files and ownership are in
`docs/GENERATION_HOST_PORTS.md`. General needs to connect the
trusted reader/transport (default UI reader still unavailable), accept source
scope/passports and port reconciliation, and assign native identity/slot/owned
occurrence handlers plus the external frontend transaction/build/browser host.
Backend routing/services stay with General. Real pilot labels, actions,
transitions and desktop viewport still need freezing. Internal Core Button is
never granted a standalone public import. User owns live Figma checks.

Pattern review must resolve save failure, semantic role aggregation/actual UI
bindings and a future accepted pattern protocol; the current draft always blocks.
Legacy CardImage input remains a separate root regression prerequisite.


## User-authorized Proxy connection · 05.10.2026

Direct user approval connected the read-only trusted reader, including the scoped
backend route in apollo-proxy. Only two server.js insertions (import/mount) and
`src/generation-agent/service.js` were added; pre-existing Proxy edits are preserved.
No message was sent to another chat. General retains shared release/manifest and
source/passport acceptance ownership.

Main → UI → `/generation/context` is connected with correlated request IDs,
30s main/28s HTTP bounds, cancellation, immutable spec copy, spec/context hashes,
bounded diagnostics and separate audit/Generation request handling. Responses are
handled before main's busy guard. The backend accepts only `{spec}`, fixed
server-configured roots, validates the closed schema before the reader, rejects
concurrent reads and refreshes generated module caches after local rebuilds.
No old semantic planner, agent call, target creation or publication is involved.

The same running local ApolloProxyControl instance was updated with only this
route/module and restarted when active requests were zero. Its previous server
is preserved at `/private/tmp/apollo-generation-bridge/installed-server-backup.js`.
The signed launcher/app bundle and env/knowledge/configuration were preserved.
The published/release bundle was not rebuilt or released.

Validation:

- Apollo type-check/build + **169/169** tests passed;
- full Apollo root validate + **81/81** regression scripts passed;
- Proxy contract-v4/launcher/Generation route suite **27/27** passed;
- Chrome UI at 440/360px passed, including real HTTP bridge error projection;
- built main + built UI + running Proxy + actual current ZIP/Code Connect reader
  returned **SOURCE_COMPILE**, source blocked, no plan, creation disabled and
  **0 native writes**. Screenshot:
  `/private/tmp/apollo-generation-bridge/live-source-gate.png`.

Execution Figma/frontend ports remain unavailable. Accepted source/passports,
native Body/owned occurrence/action/capture bindings and real private frontend
build/browser verifier remain external prerequisites. The task does not promote
Draft, invent host IDs, create replacement drawn components or claim live target
acceptance. `GENERATION_PROXY.md` records the concrete remaining action points.

Current build SHA256:

- runtime: `0208e4a1150f5a99ee6d02f62219b184451039a05f5592b9e6ecb724e9701851`;
- build inputs: `64af8f750a617389a1ec074a75d1ba3b561d7bece0d1dcc6c4cd60fddffcc945`;
- main: `6eac9d38597c066f664762f5b75e0164de78a66cb608d232bbd0f0afa3921266`;
- UI: `b3ce5644cf1068efc269bf6baaf224669e8ec829ce1367b60997b9794df2a4a4`.

Older CardImage/gate and disconnected-reader notes above are historical:
CardImage paths were corrected separately and both the reader and root gate now
pass their transport/regression checks. SOURCE_COMPILE remains the genuine
contract acceptance gate, not the old missing-evidence-port error.


## NEXT-04 native host handoff · current

The delegated native-host stage is implemented and connected in v4/adapter-figma.
See `GENERATION_NATIVE_HOST.md` for exact field/source identity/operation/evidence
requirements, tests and owner live checklist. Previous "Figma execution port
unavailable" / "native implementation missing" entries above are historical.

Version profile remains v4 0.4.0, core 0.1.9, adapter-figma 0.1.0. V4 180/180,
adapter 8/8 and root 81/81 passed; Chrome 440/360 and actual built-main/UI/current
Proxy read-only gate passed with SOURCE_COMPILE and 0 native writes. Figma host
plumbing is connected, accepted native bindings remain missing, actual native
execution/live/release/publication remain not-run. No DS/ZIP/registry/native
canvas or frontend service edits. No message sent to another chat.

NEXT-02 proposal inputs were read from the owner report. Preserve their current
pins; primary source reconciliation and dependency projection packaging stay
with Contract Creation. COMPONENT_DEPENDENCY_LINK and later Draft SOURCE_COMPILE
are distinct; no historical projection injection is enabled here. Independent
private frontend/browser execution is still with Code Connect, no duplicate run.

General assigned the subsequent shared typed evidence/binding schema/core/
Editor consumer/exporter work to this chat. That is a separate next stage:
REPRESENTATION-EVIDENCE, OWNED-OCCURRENCE-CODE-BINDING, NATIVE-SLOT-CODE-BINDING.
SCOPED-GENERATION-AUTHORITY remains a proposal; no whole-package Draft bypass.

NEXT-02 final consumer/source/build status and immutable hashes are recorded in
[GENERATION_CODE_EVIDENCE](GENERATION_CODE_EVIDENCE.md). The earlier build hashes
above describe their historical milestone; current builds use core 0.1.10.

NEXT-05: frontend external host/service теперь подключён. Authoritative source текущий BG r58 / CC r13/r8, Button r31 / Spinner r8 re-export выполнен владельцем. До producer refresh текущий real route корректно выдаёт STALE_CONTRACT_PIN; после refresh сохраняются независимые Draft/profile/native/live gates.
