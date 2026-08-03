# Apollo Architecture Backlog

## P0: runtime integrity

- [x] Run every `scripts/test-*.js` regression from one `npm test` command and from CI.
- [x] Fail closed when the reference manifest, required token/style catalogs or component indexes are incomplete.
- [x] Require `componentContractIndex.json` schema v2 with explicit `required | optional | none` coverage.
- [x] Resolve contract packages deterministically by Figma key, source catalog path and then unique alias.
- [x] Reject duplicate catalog paths, component keys, Figma keys and source catalog paths before publication.
- [x] Publish component indexes before the bootstrap manifest and validate the complete release snapshot.
- [x] Preserve contextual reference labels when suppression evidence explains a diff.

## P1: module boundaries

- [ ] Split audit orchestration, Figma traversal and action handlers out of `src/code.ts`.
- [ ] Split contract transport, index resolution and artifact compilation out of `runtimeContractRegistry.ts`.
- [ ] Introduce one explicit lifecycle state machine for reference and contract caches.
- [ ] Replace unconditional allowed-customization debug output with opt-in instrumentation.
- [ ] Add release-fixture integration tests covering manifest, indexes and contract packages as one snapshot.

## P2: maintenance

- [ ] Generate shared runtime/publisher schema fixtures from one versioned contract definition.
- [ ] Add bundle-size and module-size budgets to CI.
- [ ] Remove compatibility fields from contract packages after all published indexes use schema v2.

P0 code is complete, but production rollout remains gated by regenerating and atomically publishing the current catalog tree. A schema v1 or duplicate package index is intentionally rejected by the new Apollo runtime.
