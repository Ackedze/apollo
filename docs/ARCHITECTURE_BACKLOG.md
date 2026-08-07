# Apollo Architecture Backlog

## Current execution order

1. Ratify Contract v2 against the complete 25-package Ready corpus and close its structured-authoring gaps.
2. Promote the experimental compiler into the production publication pipeline with strict coverage gates.
3. Extend the generic Contract v2 test-contour evaluator and prove parity before production enforcement.
4. Migrate component packages in evidence-complete waves; do not add component-specific runtime branches.
5. Retire schema-v1 compatibility only after published indexes and field reports prove full cutover.

Contract v2 migration is the primary architecture track. Reference-index aggregation may proceed in
parallel, but it must not introduce another rule representation or bypass release checksums.

## P0: runtime integrity

- [x] Run every `scripts/test-*.js` regression from one `npm test` command and from CI.
- [x] Fail closed when the reference manifest, required token/style catalogs or component indexes are incomplete.
- [x] Require `componentContractIndex.json` schema v2 with explicit `required | optional | none` coverage.
- [x] Resolve contract packages deterministically by Figma key, source catalog path and then unique alias.
- [x] Reject duplicate catalog paths, component keys, Figma keys and source catalog paths before publication.
- [x] Publish component indexes before the bootstrap manifest and validate the complete release snapshot.
- [x] Preserve contextual reference labels when suppression evidence explains a diff.
- [x] Reconcile source-library updates atomically and assert that `Пора обновить` and `Актуальные компоненты` are mutually exclusive.
- [x] Preserve every source dependency occurrence as a separate update finding with its own navigable focus target.
- [x] Cover detached/local-instance parity with a sanitized fixture: both paths return 8 updates and 24 current components.
- [x] Keep detailed customization diagnostics behind the opt-in `apollo.debug.audit` trace flag.
- [ ] Field-verify the same local component as detached content and as an instance: 8 updates, 24 current components and valid focus for every update card.

## P0: finding remediation actions

- [x] Introduce a per-audit action registry so the UI executes opaque action ids instead of supplying mutation targets.
- [x] Revalidate source component/style identity immediately before every mutation and rerun the audit after success.
- [x] Apply native Figma library updates through import-by-stable-key plus override-preserving instance swap.
- [x] Generate unambiguous same-catalog Desktop/MobileWeb counterpart metadata in Athena component indexes.
- [x] Load explicit deprecated component/style replacement mappings from remote `apollo/remediations.json`.
- [x] Offer every exact custom solid fill/stroke match as an explicit user choice with its library; reject the selected action if either the node paint or imported library style changed after the audit.
- [x] Bind an unbound custom solid paint to the unique COLOR variable required by its component reference diff instead of offering a deprecated paint style with the same RGBA.
- [ ] Populate reviewed deprecated component/style mappings in `apollo/remediations.json`.
- [ ] Republish component catalogs with Athena so existing indexes receive Desktop/MobileWeb counterpart metadata.
- [ ] Extend exact custom style binding to effect styles and mixed text ranges after canonical multi-value style serialization is published.
- [x] Add typography style remediation MVP: emit one finding for a uniform unbound text layer, resolve published text styles by `fontSize + fontName.style + lineHeight + numbers style`, show an explicit candidate picker, revalidate the fingerprint, assign the style through the full text range, preserve explicit non-default `textCase`/`textDecoration` overrides and then rerun the audit.
- [x] Load scoped raw-typography exceptions from remote `apollo/auditPolicies.json`; cover canonical Web Core `Status` by stable component keys and a strict collapsed-sublayer ancestry path.
- [ ] Field-verify that `Status / 🔩 Label / Label` is absent from custom typography findings after remote policy publication.
- [ ] Extend typography remediation with component-reference priority and deliberate mixed rich-text range selection; keep non-uniform rich text fail-closed.
- [ ] Field-verify override preservation, local-owner dependency updates and stale-action rejection in Figma.

## P0: Contract v2 schema and authoring closure

- [ ] Ratify one versioned Contract v2 schema shared by package authors, Athena and Apollo: package identity, selectors, facts, `when`, assertions, evidence requirements, verdict policy and remediation metadata.
- [ ] Stabilize capability identifiers and unknown-evidence semantics for the 25-package Ready experiment: 9 selectors, 47 facts, 37 operators and 5 remediations; candidate capabilities are not executable until their exact inputs and outputs are specified.
- [ ] Normalize the observed 129 structured assertion fields into a compact versioned vocabulary instead of implementing one runtime branch per source field; record aliases and reject ambiguous mappings.
- [ ] Triage all 315 unsupported deterministic rules across the 25 Ready packages: re-author recurring rule families as typed assertions or explicitly downgrade them to `manual`/`llm`; never infer runtime behavior from `ruleText`.
- [x] Re-audit the original 315 unsupported rules by source shape: 124 already contained structured assertion fields that the compiler did not normalize, while 191 were prose-only. Do not classify runtime gaps from rule-id substrings: the original discovery heuristic confused `border` with `order` and generic `*-required` rules with `requiredChild`.
- [x] Normalize the first evidence-safe field wave in the isolated compiler: `requiredVariant`, direct variant-only `requiredState`, direct `requiredLayout`, `requiredOrder`, `forbiddenWidthOverride` and `*-component-property`. This promotes 14 deterministic rules without new runtime operators, raising coverage from 161/476 (33.82%) to 175/476 (36.76%) and reducing unsupported rules from 315 to 301.
- [ ] Normalize the remaining 106 structured-field rules that do not currently identify a missing runtime operator; group the observed source fields into typed aliases instead of adding field-name branches to Apollo.
- [ ] Re-author the 20 prose-only rules that conservatively map to existing operators; require explicit selectors, facts, assertion parameters, unknown-evidence behavior and source-rule traceability.
- [ ] Specify the 15 currently identifiable runtime-operator gaps as versioned contracts and fixtures before implementation: 7 already have structured fields and 8 remain prose-only. Define exact inputs, pass/fail/unknown semantics, evidence requirements and remediation boundaries for `statePolicy`, `numericFormat` and `visibilityPolicy`.
- [ ] Add generic conditional RuleIR composition (`when -> assert`) rather than component-specific state branches; conditions must support fact-to-value and fact-to-fact comparison with three-valued unknown propagation.
- [ ] Extend selectors with typed `where` predicates and ancestry constraints, then add filtered aggregates such as `countWhere`; use them for rules including one active sorting column and at least one visible table column.
- [ ] Classify the remaining 160 unclassified prose-only deterministic rules as `typed-authoring`, `missing-capability`, `manual` or `llm`; prohibit `checkType=deterministic` when no executable assertion can be authored.
- [ ] Use `ready-package-rule-profile.json` saturation data to define operator fixtures; require explicit coverage for state, structure/order, content, responsive context, token/paint, numeric formatting and interaction families before schema ratification.
- [ ] Require every `checkType=deterministic` rule to compile as `executable` or publish as `unsupported`; unknown selector, condition, assertion or remediation fields must fail closed instead of broadening a match.
- [ ] Prevent unsupported component rules from promoting an atomic customization diff to `violation`.
- [ ] Add schema fixtures for conditional variants, structure/count/order, token binding, paint state, layout/baseline, text/numeric formatting and unsupported-rule behavior.

## P0: Contract v2 compiler and publication

- [ ] Promote the isolated Contract v2 experiment into one production compiler; generated output must consume the complete component package while keeping raw/generated anatomy as evidence rather than implicit policy.
- [ ] Compile `contract.generated.json`, structured `rules.json`, `composition-contract.json` and enforceable ownership from `contract.overrides.json` into one deterministic RuleIR artifact with source-rule traceability.
- [ ] Generate a per-package coverage report with `executable | unsupported | manual | llm` status and block publication when an executable rule is invalid, ambiguous or references an undeclared capability.
- [ ] Make Athena publish Contract v2 artifacts, schemas, coverage, capability versions and checksums atomically with `componentContractIndex.json` and the catalog manifest.
- [ ] Add CI gates for deterministic output, source-copy integrity, source/compiled drift, duplicate identities, unsupported-capability regressions and release-snapshot completeness.
- [ ] Preserve split-repository routing so `design-system_ab` and `desing-system_abm` can publish compatible Contract v2 packages without changing Apollo semantics.

## P0: Apollo Contract v2 runtime and parity

- [x] Add a default-off, non-persistent Contract v2 test-contour toggle and lazy-load only experimental packages required by the selected component keys.
- [x] Implement the first fail-closed generic selector/fact/operator evaluator driven only by trusted versioned capabilities; component packages provide data, never executable code.
- [x] Exclude legacy component-contract verdicts from customization output while the test contour is enabled; keep the default production path unchanged while the toggle is off.
- [x] Classify non-executable, unsupported and evidence-incomplete rules as diagnostic `unknown`; never promote them to violations or infer semantics from prose.
- [ ] Stop computing discarded schema-v1 customization decisions inside the v2 contour after parity instrumentation no longer needs them.
- [ ] Complete runtime support for the ratified selector/fact/operator vocabulary; each added capability requires pass/fail/unknown fixtures before activation.
- [ ] Extend the audit snapshot only with facts required by ratified contracts, including non-variant component properties, ancestry/order, token bindings, prototype reactions and explicit page/frame/viewport context.
- [ ] Emit every result through `CustomizationAssessment` as `expected | allowed | violation | unknown`, with evidence-complete messages and stale-safe remediation actions.
- [ ] Store machine-comparable Contract v2 versus schema-v1 verdict, evidence and remediation deltas without exposing discarded legacy findings in the test-contour UI.
- [ ] Require release fixtures and field reports to reach category, verdict, baseline-label and reset-action parity before enabling Contract v2 enforcement package by package.
- [ ] Reject unknown capability versions and incomplete required packages without falling back to component-specific or prose-derived behavior.

## P1: module boundaries

- [x] Split audit orchestration, Figma traversal and action handlers out of `src/code.ts`.
- [x] Move the UI/plugin message protocol into a Figma-independent router with exhaustive regression coverage.
- [x] Move `focus-node` page resolution and viewport navigation into a dedicated action module.
- [x] Move page Theme-mode mutation into a dedicated action and queue its audit rerun until the current audit is idle.
- [x] Move corporate-component replacement, variant resolution and compatible property restoration into a dedicated action module.
- [x] Move customization reset orchestration and mutations into dedicated action modules with stale-node regression coverage.
- [x] Move audit run/cancel/idle-wait lifecycle into an explicit state machine with parallel-start and cancellation coverage.
- [x] Move per-run traversal cache and service construction into an isolated `AuditTraversalContext`.
- [x] Move UI/stats view construction and full/agent report preparation into one result orchestration service.
- [x] Move depth-first tree walking, subtree pruning and cancellation checks into a Figma-independent traversal engine.
- [x] Move local-component source traversal, dependency classification, reconciliation and metrics out of `src/code.ts`.
- [x] Move primary component classification and nested-reference diff preparation out of `src/code.ts`.
- [x] Move category aggregation and the remaining Figma node visitor out of `src/code.ts`.
- [x] Split contract transport, index resolution and artifact compilation out of `runtimeContractRegistry.ts`.
- [x] Introduce one explicit lifecycle state machine for reference and contract caches.
- [x] Add release-fixture integration tests covering manifest, indexes and contract packages as one snapshot.

## P1: Contract v2 component migration

- [x] Load package `contract.generated.json` as the target Component API, validate all published packages and emit deterministic violations for unknown variant properties, invalid values and invalid allowed combinations through the standard assessment/report pipeline.
- [x] Move all executable composition rules to package-level `manual.contracts`, migrate ButtonsGroup, and remove the global `compositionContracts.json` bootstrap/runtime fallback.
- [x] Add a trusted composition contract engine with remote declarative config and a pure function registry instead of component-specific runtime branches. Schema v1 covers count, property domain, value position, member-to-host equality, first-member equality and subtree paint policies; additional operators remain explicit code changes.
- [x] Add the first evidence-safe relational predicates: ButtonsGroup member Size follows host Size and TitleStatus Type follows visible StatusPreset Type. Missing source evidence remains non-enforcing.
- [x] Migrate and regression-test the schema-v1-safe packages: ButtonsGroup, BackgroundPlate and TitleView.
- [ ] Complete the Contract v2 pilot wave for TitleView, BackgroundPlate, ButtonsGroup and AmountStyles after the P0 parity gate; preserve their existing Figma-visible behavior and agent-report evidence.
- [ ] Select the next migration wave by capability coverage, not component popularity: prefer packages requiring no new operators, then add one operator family at a time with fixtures.
- [ ] Migrate Button, CardImage, FAQ and TableBulkActions only when their host-dependent selectors and evidence are represented exactly; advisory guidance must not become a hard violation.
- [ ] Publish a migration dashboard with package schema version, deterministic coverage, unsupported rules, last parity result and legacy dependency count.
- [ ] Forbid new component-name conditionals in Apollo runtime; a missing capability becomes an explicit engine task or leaves the rule `unsupported`.

## P1: reference index performance

- [ ] Replace startup loading of every per-catalog component index with one versioned aggregate routing index per catalog manifest; keep individual indexes as publication/debug artifacts rather than mandatory runtime requests.
- [ ] Make Athena publish the aggregate index atomically with catalog indexes and the manifest, including component key, catalog path, source repository/base URL and release checksum coverage.
- [ ] Make Apollo load the main and nested aggregate indexes first, resolve selected component keys from them, and fetch only the required component catalogs; fail closed on duplicate keys or a release/checksum mismatch.
- [ ] Add release-snapshot and split-repository regression coverage for aggregate index routing, duplicate detection, cache invalidation and a temporary backward-compatible migration path.
- [ ] Acceptance baseline: reduce the observed index phase from 770 requests and 28.3 seconds within a 42.4-second audit to O(number of manifests) index requests, without increasing loaded component catalogs or changing audit categories.

## P2: maintenance

- [ ] Generate runtime/publisher schema fixtures from the shared executable-rule definition and verify backward-compatible migrations.
- [ ] Add bundle-size and module-size budgets to CI.
- [ ] Remove schema-v1 composition compilation, compatibility fields and obsolete registries after all required packages publish Contract v2 and the migration dashboard reports zero legacy dependencies.
- [ ] Remove overlapping `patternRules.json`/package-rule runtime paths once every enforced rule has one canonical source and source-rule traceability.
- [ ] Archive experimental Contract v2 packages after their fixtures and compiler behavior are represented in production tests.

Existing schema-v1 integrity gates remain active during migration. Contract v2 is not production-enforcing
until authoring coverage, compiler publication and shadow-parity P0 gates are complete. Runtime rollout of
library-update parity remains gated by field verification in Figma; catalog rollout remains owned by
Athena's atomic publication process.
