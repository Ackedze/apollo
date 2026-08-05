# Apollo Architecture Backlog

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
- [x] Exempt unbound typography inside the canonical Web Core `Status` component by stable component key because its nested Label variant intentionally owns uppercase behavior.
- [ ] Extend typography remediation with component-reference priority and deliberate mixed rich-text range selection; keep non-uniform rich text fail-closed.
- [ ] Field-verify override preservation, local-owner dependency updates and stale-action rejection in Figma.

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

## P2: maintenance

- [ ] Generate shared runtime/publisher schema fixtures from one versioned contract definition.
- [ ] Add bundle-size and module-size budgets to CI.
- [ ] Remove compatibility fields from contract packages after all published indexes use schema v2.

P0 automated gates are complete. Runtime rollout of library-update parity remains gated by one field verification in Figma; catalog rollout remains owned by Athena's atomic publication process. A schema v1 or duplicate package index is intentionally rejected by the Apollo runtime.
