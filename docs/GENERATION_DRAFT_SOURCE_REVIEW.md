# NEXT-03 · Draft authoring / producer review · 06.10.2026

Implemented locally for review. General technical acceptance and sequential Code
Connect rebind remain pending. This stage provides a separate read-only Node
route; it does not enable a new action in the Apollo panel.

## Separate boundaries

- `reviewAuthoringSource` uses the existing source importer, authoritative manual,
  bound anatomy facts and standard shared compiler. It returns only
  `apollo.authoring-source-review.v1-draft` metadata: compiled status, unchanged
  compiler issues, predicate/pending/nonExecutable RuleIDs, source/compiled hashes
  and dependency pins. Even a Ready source returns accepted=false and
  executionAllowed=false. It exports no compiled contract or runtime inventory.
- `readAuthoringPackageReview` additionally verifies each external authoritative
  main, ZIP bytes, semantic manual hash, exact revision/compiled/dependency pins,
  complete own-authoring closure, archive entry limits and build identity. Cached
  projections supply anatomy/export-stamp evidence only and must be reproduced by
  the standard compiler. Output is `apollo.authoring-package-review.v1-draft`,
  with its own reviewHash; it cannot serve as a Generation lock or view.
- `inspectStaticProducerReview` checks the producer-owned static v1-draft JSON
  against an independently supplied basis. It reconstructs the entire closed
  document: spec, content, hashes, API intent, provenance, observations and gaps.
  Unknown fields/versions, interactions, authority claims, different content or
  source pins reject import. Display order and business priority stay distinct;
  canonical occurrence/symbol IDs remain null. API intent is unaccepted metadata.
- `scripts/static-producer-review-inputs.cjs` supplies this basis
  from caller-pinned producer manifest/report, actual producer/API/registry/lock
  files, full source packages and current Apollo build. It rechecks after async
  reads. Producer/content/source drift rejects the read. Consumer drift rejects
  freshness but permits explicitly historical review, with exact old/current file
  mismatches. A historical observation is never relabelled as current evidence.

The inspection DTO version is
`apollo.generation-static-producer-inspection.v1-draft`; the Node envelope is
`apollo.v4-static-review-read.v1-draft`. All remain Draft, accepted=false,
executionAllowed=false, targets blocked and generationPlanHash=null. The separate
producerPlanHash/contentHash/observationHash retain producer ownership. No new
shared normative schema, profile, primitive policy, evaluator or compiler policy
was added. Existing interactive v1 and the static Draft execution guards remain.

## Calling the review port

Call `loadStaticProducerReview` with an explicit trusted configuration containing
`producerRoot`, `workspaceRoot`, independently pinned `manifestPin` and `reportPin`
(each `{path, sha256}`), and a `reviewPath` listed by that pinned report. These pins
must come from the reviewed handoff, never the imported JSON. It returns
`inspection`, a separate unchanged `strictRuntimeProbe`, and actual review-port
build hashes. It neither prepares nor executes a Generation plan.

Current producer snapshot was verified before this consumer stage and remains
immutable. After the consumer changes, all three pinned synthetic producer outputs
inspect as **stale historical review**. Their supported/unsupported View and
priority results survive without changing product content. An exact current
consumer vector/rebind request is prepared privately after the final standard v4
build. Only the Code Connect owner should rebind or emit new observations after
General review; this consumer stage does not repin the producer.

## Evidence and limits

Actual read-only probe of the five pinned packages preserved Button31/Spinner8,
CorporateContent desktop13/mobile8, and BG59 **Draft with nine nonExecutable context
rules**. Four sources are compiled Ready; this does not accept generation. Normal
`loadContractPackages` still fails on BG with SOURCE_COMPILE; the original
`assertRuntimeContract` gate remains unchanged. Standard compiler errors are
preserved in review rather than promoted into Ready.

Local gates: Generation **127/127**, Apollo **239/239**, Figma adapter **9/9**,
frontend adapter **13/13**, root **81/81**, type-check/build/runtime parser passed.
There are **58 new synthetic checks** (52 core + 6 Node-port checks); private real
source/probe JSON remains outside tracked fixtures. Browser suites were not
repeated for this Node-only stage. No actual Figma/native/target operation, new
frontend import, browser scenario, live test, publishing or installation occurred.

Product facts stay: «Сохранить», then «Назад», local save/back IDs, both Size56,
viewport width1600, single default state. View/disabled/explicit Loading=false,
independent priority, viewport height and actual allocated group width remain
null or a separate owner-review proposal in the existing pinned drafts. Source
Ready, exact static profile, canonical CC Body/all four occurrences, measured
widths/fonts, scoped context receipts, native providers, target execution,
parity/live/release still require independent work. All five overall goals are
not completed by this technical stage.

Compatibility baseline: shared core **0.1.10**, Editor **0.2.91**, generation-core
**0.1.1**, Apollo **0.4.0**. Backlog link:
[APOLLO-V4-PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
[EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
