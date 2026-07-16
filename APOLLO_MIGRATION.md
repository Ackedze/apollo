# Apollo migration plan

## Goal

Apollo must remain a thin Figma runtime. A published plugin build should keep working from one stable reference URL, while catalogs, indexes, rules, component contracts and agent context can change through Git publication without re-uploading the plugin.

Current stable entrypoint:

```text
https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json
```

This file should stay the single bootstrap URL known by Apollo. Everything else must be discovered through that manifest or through manifests referenced by it.

## Invariants

- Plugin rebuild is required only when Apollo runtime code, UI, Figma permissions or network domains change.
- Data-only changes must be publishable through `Ackedze/design-system_ab` and GitHub Pages.
- Apollo should not import component kits directly into the bundle for production behavior.
- Runtime loading remains lazy: Apollo fetches only catalogs and contract artifacts needed for component keys found in the selected area.
- A user should never need local catalogs, GitHub token, Supabase access or a local collector.
- Broken or partial publication must fail loudly during bootstrap or component load; Apollo should not silently fall back to stale bundled data.

## Target Manifest Model

`referenceSourcesMVP.json` should evolve from a list of raw catalog sources into a versioned manifest with these sections:

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-06-30T00:00:00.000Z",
  "apollo": {
    "patternRulesPath": "JSONS/apollo/patternRules.json",
    "componentIndexPath": "JSONS/apollo/componentIndex.json",
    "componentContractIndexPath": "JSONS/apollo/indexes/componentContractIndex.json"
  },
  "tokens": [],
  "styles": [],
  "components": [],
  "contracts": {
    "basePath": "JSONS/web/components",
    "files": []
  }
}
```

The exact schema can change, but the design should keep one stable bootstrap URL and move all additional file discovery into indexed manifests.

## Component Kit Files

Target layout: every component should have one package directory that contains both the raw Figma catalog and all Apollo-derived artifacts. Raw catalogs should not remain as loose sibling files once the migration is complete.

Example:

```text
JSONS/web/components/web-core/core/button/
  catalog.raw.json
  contract.generated.json
  contract.overrides.json
  rules.json
  audit-mapping.json
  agent-context.json
  examples.json

JSONS/web/components/web-corp/TitleView/
  catalog.raw.json
  contract.generated.json
  contract.overrides.json
  composition-contract.json
  rules.json
  audit-mapping.json
  agent-context.json
  examples.json
```

The exact raw catalog filename can be finalized later, but it should be stable inside the package. Prefer `catalog.raw.json` or another normalized name over repeating long Figma export names in runtime indexes.

For each component package, the publication pipeline should be able to produce or validate:

- raw Figma catalog inside the component package;
- `contract.generated.json`;
- `contract.overrides.json`;
- optional `composition-contract.json`;
- `rules.json`;
- `audit-mapping.json`;
- `agent-context.json`;
- optional `examples.json`.

`composition-contract.json` is not required for every component. It is needed for composite or wrapper components that own nested component baselines. Standalone core components such as Button can be described by generated contract, overrides and rules without a composition contract.

## Runtime Loading Plan

1. Apollo loads only `referenceSourcesMVP.json`.
2. Apollo reads component indexes from paths declared in that manifest.
3. During scan, Apollo collects component keys from the selected area.
4. Apollo resolves each key to a component package directory through the index.
5. Apollo lazily loads raw component catalogs required for those keys from the package directory.
6. Apollo lazily loads component contract artifacts for those same component families from the same package directory:
   - `composition-contract.json` when present;
   - `rules.json`;
   - `agent-context.json`;
   - `contract.overrides.json` and `audit-mapping.json` for the currently supported compact context and presentation fields.
7. Apollo applies contract-aware diffing before customization assessment.
8. Apollo applies matched component rules while building stats and `*_agent.json`.
9. Apollo includes only matched rules and compact relevant context in the agent report.

No production behavior should depend on component kits statically imported into the plugin bundle.

## Athena CLI / Publish Pipeline

Athena CLI, or a dedicated publish job, should become the source of deterministic publication. On every catalog publication it should:

1. Read raw exported component catalogs.
2. Write each raw catalog into its component package directory.
3. Generate or update component indexes with package paths.
4. Generate `contract.generated.json`.
5. Validate `contract.overrides.json` against the generated contract.
6. Generate or validate `composition-contract.json` for wrapper components.
7. Validate `rules.json` schema and rule references.
8. Validate `audit-mapping.json` property references.
9. Generate or validate `agent-context.json`.
10. Validate that every `agent-context.ruleReferences[]` entry exists in `rules.json`.
11. Validate that every pattern-linked rule points to an existing pattern rule.
12. Write a contract index consumed by Apollo runtime.
13. Write `referenceSourcesMVP.json` last, after all referenced files are present.

Publication to GitHub Pages should be atomic from Apollo's point of view. The plugin must not see a new manifest pointing to files that are not yet published.

### Athena CLI Target Commands

The publish surface should be explicit and repeatable:

```bash
athena apollo export-catalogs
athena apollo build-indexes
athena apollo build-contracts
athena apollo build-contract-index
athena apollo build-manifest
athena apollo validate-release
athena apollo publish
```

Command responsibilities:

- `export-catalogs` writes normalized raw Figma catalogs and keeps raw data immutable.
- `build-indexes` creates component key indexes used by Apollo lazy loading.
- `build-contracts` creates or refreshes package artifacts: `contract.generated.json`, `composition-contract.json`, `rules.json`, `agent-context.json`, `audit-mapping.json` and `examples.json`.
- `build-manifest` writes `referenceSourcesMVP.json` and points it to always-on Apollo indexes.
- `build-contract-index` writes `apollo/indexes/componentContractIndex.json`, the runtime lookup index consumed by Apollo.
- `validate-release` verifies schema versions, file existence, component key coverage, rule references, pattern-rule references and artifact size limits.
- `publish` uploads files in dependency order and updates `referenceSourcesMVP.json` last.

### Runtime Component Contract Index

Apollo runtime should discover component contract artifacts through an always-on index referenced from `referenceSourcesMVP.json`:

```json
{
  "apollo": {
    "patternRulesPath": "apollo/patternRules.json",
    "componentContractIndexPath": "apollo/indexes/componentContractIndex.json"
  }
}
```

The component contract index shape for the MVP:

```json
{
  "schemaVersion": 1,
  "documentType": "component-contract-index",
  "generatedAt": "2026-07-03T00:00:00.000Z",
  "baseUrl": "https://ackedze.github.io/design-system_ab/JSONS/",
  "packages": [
    {
      "componentKey": "web-corp.title-view",
      "packageName": "TitleView",
      "packagePath": "web/components/web-corp/TitleView",
      "figmaKeys": ["3bfd179dc3b4c996f58db4cbcd26687a356fb3b7"],
      "aliases": ["TitleView", "[D] TitleView", "[M] TitleView"],
      "sourceCatalogPath": "web/components/web-corp/Web _ Corp Components -- TitleView.json",
      "artifacts": {
        "rules": "rules.json",
        "composition": "composition-contract.json",
        "agentContext": "agent-context.json"
      }
    }
  ],
  "components": {
    "3bfd179dc3b4c996f58db4cbcd26687a356fb3b7": {
      "componentKey": "web-corp.title-view",
      "packagePath": "web/components/web-corp/TitleView",
      "sourceCatalogPath": "web/components/web-corp/Web _ Corp Components -- TitleView.json",
      "artifacts": {
        "rules": "rules.json",
        "composition": "composition-contract.json",
        "agentContext": "agent-context.json"
      }
    }
  },
  "aliases": {
    "[D] TitleView": "web-corp.title-view"
  }
}
```

For runtime audit Apollo uses `artifacts.rules`, `artifacts.composition`, `artifacts.agentContext`, `audit-mapping.json` and compact sections of `contract.overrides.json`. `examples.json` is fetched only for direct agent questions. `contract.generated.json` remains a future baseline-loader input and is not loaded alongside the raw catalog.

### Apollo Runtime Loading Step

The current runtime/hardening sequence is:

1. Read optional `apollo.componentContractIndexPath` from `referenceSourcesMVP.json`.
2. Load the component contract index once per plugin session.
3. During scan, collect component keys from the selected area.
4. Resolve references for those keys through the existing component index/catalog loader.
5. Match contract packages by `figmaKeys`, `aliases` or `sourceCatalogPath`.
6. Lazily fetch only matched runtime artifacts: rules, composition, agent context, audit mapping and overrides.
7. Use remote artifacts as the only production source for matching `componentKey`.
8. Apply an explicit contract-coverage policy: fail loudly when a required package or artifact is unavailable, and continue without contract-aware checks only when the manifest explicitly marks that component family as not contract-covered.
9. Do not silently fall back to stale bundled artifacts.

## Audit Snapshot — 2026-07-13

### Confirmed implemented

- Apollo uses the stable `referenceSourcesMVP.json` bootstrap URL and reads both flat and `libraries[].catalogs[]` manifest forms.
- Apollo preloads token/style catalogs, loads component indexes in the background and lazily fetches raw component catalogs only for keys found in the selected area.
- Apollo reads `apollo.componentContractIndexPath` and lazily loads remote `rules.json` and `composition-contract.json` for matched packages.
- Production component rules and composition contracts are remote-only; the runtime no longer imports bundled component kits as a fallback.
- Athena publishes a component index together with a component catalog and updates `referenceSourcesMVP.json` after related publish targets for newly registered catalogs.
- Athena CLI performs targeted catalog/index sync and contract-package sync after a successful configured export.

### Verification results

- Apollo `npm run validate` passes. All 17 `scripts/test-*.js` regression scripts also pass when run explicitly.
- Apollo `npm run validate` currently executes only 4 of those 17 regression scripts; 13 tests are outside the release gate.
- Athena `npm run build` passes because esbuild transpiles without type-checking, but `npx tsc --noEmit` fails with 33 diagnostics across component snapshots, text/effect/style export and token serialization.
- Athena has no automated test command.
- Athena CLI `npm run typecheck` and its 3 tests pass.
- Athena CLI `catalogs:sync-apollo -- --check` fails with dirty indexes.
- Athena CLI `contracts:check-apollo` fails on a stale generated section in `web/components/Spacing component/audit-mapping.json`.
- The current manifest has 1,354 entries marked as component sources, but only 334 point to payloads with `kind: "catalog"`. The remaining 1,020 entries point to contract artifacts, registries or other non-catalog JSON files.
- Apollo derives an index URL for every component-source entry. With the current manifest, 334 derived indexes exist and 1,020 derived index URLs are guaranteed to return 404.
- All 334 generated `*.index.json` files have empty `source.fileKey` and `source.figmaLink`.
- The catalog tree contains 1,750 confirmed `category` values with a truncated `[D]`, `[M]` or `[T]` opening bracket across 181 files.
- The catalog tree contains 126,707 `tokenKey: null` paint occurrences across 433 non-index JSON files. This is a raw signal that still needs auxiliary-layer filtering before it can be treated as the actionable warning count.
- The component contract index covers 14,339 of 35,804 keys present in component indexes (40.0%), or 14,339 of 22,354 keys under `web/components` (64.1%). Partial coverage may be intentional, but it is not declared in the manifest and unmatched packages are currently skipped silently.

## Migration Phases

### Phase 1: Document and Stabilize Current MVP

Status: **partial**. Stable bootstrap and remote-only production artifacts are implemented; versioned manifest validation and clean release gates are not.

- [x] Keep the existing stable bootstrap URL.
- [ ] Finish documenting and validating the current artifact meanings and limitations.
- [ ] Stop duplicating rule text/severity in `agent-context.json`; use `ruleReferences`.
- [x] Remove direct production imports of component kits from Apollo runtime.

### Phase 2: Add Contract Index

Status: **implemented, hardening required**. `componentContractIndex.json` is published and referenced by the manifest; coverage policy, checksums and runtime schema validation remain open.

- [x] Add `JSONS/apollo/indexes/componentContractIndex.json`.
- [x] Map component keys and aliases to component package directories and available artifacts.
- [ ] Include checksums or content versions for cache diagnostics.
- [x] Extend `referenceSourcesMVP.json` to point to this index.

### Phase 3: Runtime Lazy Loading

Status: **implemented, hardening required**. Raw component catalogs and remote rules/composition artifacts are loaded lazily; manifest pollution and unbounded index preload currently undermine the intended startup behavior.

- [x] Replace static imports of `composition-contract.json` and `rules.json` in Apollo with manifest-driven lazy loading.
- [x] Cache loaded contract artifacts per component family during a scan.
- [x] Keep existing contract-aware regression cases passing.
- [ ] Add explicit coverage and failure policies for unmatched component packages.

### Phase 4: Move Classification Policy Out of Code

Status: **partial**. Apollo consumes presentation grouping, order and reset metadata from `audit-mapping.json`; the complete classification policy still has code-owned fallbacks.

- Start consuming `audit-mapping.json` for grouping, ordering and reset-action decisions.
- Move hardcoded customization grouping rules into declarative mappings where possible.
- Keep code fallbacks only for missing draft mappings.

### Phase 5: Use Overrides as Effective Model Input

Status: **partial**. `contract.overrides.json` is loaded for matched component packages; compact `publicApi` and `resetModel` sections are included in agent context. Applying the full override model to diff/classification remains pending.

- Load `contract.overrides.json` before diff/classification.
- Use overrides for public API, anatomy semantics, reset model and dependency policy.
- Keep `contract.generated.json` and raw catalog as structural baseline sources.

### Phase 6: Agent Context on Demand

Status: **implemented for agent context**. Matched remote component rules and compact component context are included in `*_agent.json`; examples are loaded only for direct questions.

- [x] Add a compact context resolver for agent requests.
- [x] Include matched `rules.json` entries in `*_agent.json`.
- [x] Include relevant `agent-context.json` slices only for affected components.
- [x] Load `examples.json` only for direct Q&A or when the agent explicitly needs examples.

Runtime hardening (2026-07-15): relevant context is collected from the root finding and every actual/reference nested diff owner, canonical component keys come from the contract index, and each agent-report change retains its normalized `DiffContext`. Component-rule attachments are deduplicated by `ruleId`; explicit owner keys take priority over path aliases, layer targets must end at the changed node, and token-source violations require actual missing-binding evidence.

### Phase 7: CI and Publication Gates

Status: **not implemented**. Local checks exist, but they are incomplete and the current catalog/contract check commands do not pass on the audited workspace.

- Add schema validation for all contract artifacts.
- Add consistency checks between raw catalogs, indexes, contracts, rules and agent context.
- Add a publish dry-run command.
- Make GitHub Pages publication fail if any referenced artifact is missing or stale.

## Apollo / Athena Delivery Backlog

### P0. Remove non-catalog artifacts from the reference manifest and index preload

- [x] Change Athena CLI `sync-apollo-catalogs` so it registers only validated publishable payloads: raw component catalogs, token catalogs and style catalogs.
- [x] Do not classify arbitrary JSON under `JSONS/` as `source.kind=components`; exclude contract packages, Apollo indexes, registries, pattern rules, copies and sidecar documents.
- [x] Add `schemaVersion` and `generatedAt` to `referenceSourcesMVP.json` and validate every entry against its declared source kind before writing the manifest.
- [x] Write an explicit `source.indexPath` for every component catalog and validate that the referenced index exists.
- [x] Clean the existing 1,020 non-catalog component entries in a prepared local release.
- [ ] Publish the prepared cleaned manifest release to GitHub Pages.
- [x] Add bounded concurrency to Apollo component-index preload and request only explicit, validated component index sources.
- [x] Report the number of manifest entries, index requests, successful indexes and failures as release/runtime metrics.
- [x] Add regression fixtures proving that `rules.json`, `contract.generated.json`, `agent-context.json`, `componentContractIndex.json` and `patternRules.json` never become catalog entries.

Implementation verification (live local catalog tree, 2026-07-14):

- Manifest reduced from 1,385 entries to 365 publishable entries: 334 components, 22 tokens and 9 styles.
- All 334 component entries have explicit existing index paths; contract artifacts in the manifest: 0.
- A second `catalogs:sync-apollo -- --check` run is clean. Index comparison is now JSON-canonical and no longer changes `generatedAt` because of omitted `undefined` fields.
- Apollo schema-v2 loading requires explicit index paths. Legacy loading filters known contract/registry artifacts and caps index requests at 8 concurrent operations.
- Athena CLI `catalogs:rebuild-apollo` now performs the full rebuild in disk-backed staging, runs a second full catalog check and activates only the validated tree with a cumulative release receipt.
- Live manifest rebuild release `2026-07-14T19-06-05-527Z-c3252d08` is ready and supersedes the two pending Icons releases. Publish dry-run passes with 343 receipt changes mapped to 318 actual Git paths; no commit or push has been performed.

Acceptance criteria:

- Every manifest entry resolves to a payload whose document kind matches `source.kind`.
- The number of component entries equals the number of published raw component catalogs, not the total number of JSON files under `JSONS/`.
- Every component entry has one existing explicit index path; Apollo no longer produces 404 requests for synthetic indexes of contract artifacts.
- `catalogs:sync-apollo -- --check` passes on a clean catalog repository.
- Apollo bootstrap remains responsive under normal GitHub Pages latency and does not start more than the configured number of index requests concurrently.

### P0. Make publication transactional and keep the bootstrap manifest last

- [ ] Replace Athena's sequence of independent GitHub Contents API writes with a staged release mechanism: one Git tree/commit, a versioned release directory plus pointer switch, or another transaction with equivalent visibility guarantees.
- [ ] Ensure catalog, component index, contract package artifacts, contract index, registries and pattern-rule dependencies are all uploaded and validated before the bootstrap manifest becomes visible.
- [ ] Update the manifest last for both new and already registered catalogs; the current path updates it only when a reference entry is newly created.
- [x] Reorder Athena CLI generation so catalogs, indexes, contracts and targeted release validation complete in a disk-backed staging tree before the local publish tree is activated.
- [ ] Preserve the previous published release when any target upload, schema check or consistency check fails.
- [ ] Add an idempotent retry path and deterministic conflict handling for the entire release, not only the web-corp rules registry.
- [ ] Add failure-injection tests for errors after catalog upload, after index upload and before manifest switch.

Implementation status (Athena CLI local publish tree, 2026-07-14):

- [x] A configured export creates a copy-on-write release workspace on disk instead of retaining a 40–100 catalog batch in process memory.
- [x] Catalogs, reference/index updates, contract packages, contract index and registries are generated and checked against the staged `outputRoot`.
- [x] Activation rejects concurrent changes to the live `outputRoot`; task, sync or validation failures discard staging and preserve the previous tree.
- [x] A per-`outputRoot` process lock prevents a second Athena CLI run from deleting or activating another live staging workspace.
- [x] A durable `release.json` journal carries one release identifier and restores the previous directory after an interrupted first rename.
- [x] Regression tests cover complete activation, discard, concurrent-change rejection, interrupted-swap recovery and in-root/out-of-root path routing.
- [x] Every activated local batch writes a completed receipt outside the publish tree with the exact added/modified/deleted paths and SHA-256 hashes.
- [x] `npm run release:publish-apollo` is a dry-run by default: it verifies receipt drift and builds the proposed commit in an isolated temporary Git index without touching the user's index, `HEAD` or remote.
- [x] `release:publish-apollo -- --execute` fetches the target branch, rejects remote divergence and publishes all receipt paths through one Git commit/push. Manifest ordering inside the batch is no longer observable because Git exposes the complete commit snapshot at once.
- [x] Unrelated staged, dirty and untracked files are excluded from the release commit and remain unchanged.
- [x] A rejected push leaves the remote release unchanged and persists `commit-created`; an idempotent retry pushes the same commit, while unexpected branch movement produces a deterministic conflict.
- [x] Isolated Git regression tests cover dry-run, exact commit scope, content drift, remote divergence, rejected push, preserved remote state and successful retry.
- [x] Athena CLI detects renamed component catalogs in staging by exact Figma node identity, with an exact component/variant-key signature fallback for legacy catalogs that have no source metadata.
- [x] A detected rename deletes the previous raw catalog and component index, removes its targeted manifest entry, validates the replacement entry and records both deletions in the release receipt.
- [x] Ambiguous legacy signature matches fail the batch before activation; tests cover source-identity rename, legacy rename, manifest/index cleanup and ambiguity preservation.
- [x] Consecutive local batches activated before Git publication now form one cumulative pending scope. Repeated paths use their latest content while change kinds are composed against the original Git baseline.
- [x] New finalize operations mark carried predecessors `superseded`; the publisher can also consolidate legacy consecutive `ready` receipts in memory, so dry-run remains read-only and existing pending batches do not require re-export.
- [x] Publishing a non-latest pending receipt is rejected, and a `commit-created` receipt blocks further consolidation until its push is resumed or the conflict is resolved.
- [x] Regression tests cover automatic carry-forward, `added + modified` composition, predecessor status, legacy receipt consolidation and one Git commit containing files from both batches.
- [ ] The legacy Athena Figma plugin still uses independent GitHub Contents API writes. Route it through the CLI/service release pipeline or give it equivalent transactional semantics before considering publication transactional from every supported surface.

Acceptance criteria:

- Apollo can observe either the complete previous release or the complete next release, never a mixed set of catalog/index/contract files.
- A failed publication does not change the stable bootstrap manifest and does not leave it pointing to missing or stale artifacts.
- Re-publishing an unchanged release performs no semantic data changes and can safely resume after a network or Git conflict.
- Publication logs expose one release identifier across every generated and uploaded artifact.
- Renaming a configured catalog path leaves exactly one raw catalog, one matching component index and one manifest entry after activation; the previous paths are absent and appear as `deleted` in the receipt.
- Two or more local batches completed before publication are exposed as one cumulative latest receipt; publishing it includes every still-current path from all pending batches and marks predecessors `superseded`.

### P0. Restore Athena TypeScript correctness and add a validation gate

- [ ] Add `type-check` and `validate` scripts to Athena; `validate` must run type-check, build, Figma-runtime compatibility checks and tests.
- [ ] Fix the current TypeScript errors instead of suppressing them globally. Cover mixed values, `LineHeight.AUTO`, text case, effect unions, SceneNode property guards, `StrokeAlign`, style paints and token serialization.
- [ ] Align `tsconfig.json` libraries/types so Figma globals do not conflict with DOM declarations while the UI bundle still has the browser types it needs.
- [ ] Add a runtime compatibility check equivalent to Apollo's guard for syntax unsupported by the Figma main runtime.
- [ ] Make Athena release/build automation call `npm run validate`, not bare esbuild.

Acceptance criteria:

- `npm run validate` in Athena exits successfully with zero TypeScript diagnostics.
- Esbuild can no longer produce a release artifact from source that fails the TypeScript gate.
- Regression tests cover mixed Figma values and effect/text variants implicated by the current diagnostics.

### P0. Preserve variant-aware host paint through deep nested materialization

Evidence from Apollo 0.1.43 report `Alexey-Kukhta-CORP-Lead-Designer_15-07-2026_08-20-39_agent.json`: four table rows use `[D] StatusPreset` with `Type=Approved, Style=Muted, Size=20`. The published Status & Property catalog correctly defines `decorative-text/green` for the nested Label, but Apollo compares it with the standalone Label baseline `text/info` and reports four false fill customizations.

- [x] Keep the effective paint descriptor from the selected host variant when a deeper standalone nested component is materialized.
- [x] Resolve the complete owner chain `StatusPreset -> Status -> Label` before applying standalone fallback data.
- [x] Do not replace a host-controlled descendant fill/stroke/style with the default baseline of the nested Label component.
- [x] Add a regression fixture for `[D] StatusPreset`, `Type=Approved, Style=Muted, Size=20`, nested inside a changed `Table Wide [D]` cell.
- [x] Keep genuine `variant.Presets` changes in the same row visible; the confirmed `Account -> Text`, `Status -> Account` and `Amount -> Status` changes must not be suppressed by the paint fix.
- [x] Verify the same behavior across at least four repeated table rows so occurrence suffixes do not change the effective baseline.
- [x] Re-run the control layout and confirm that the four false fill changes are gone while all 12 confirmed `variant.Presets` changes remain.

Implementation status (Apollo 0.1.46): variant structure resolution records deterministic property-level provenance for patch-owned paint, styles, layout, opacity, radius, effects, component properties, text and visibility. A deeper standalone materialization remains the structural base, but parent-variant-owned leaf properties are overlaid back onto it together with the parent owner/variant context. The 0.1.44 field run exposed a stale original host merge source; 0.1.45 corrected that source but the field run still showed four false fills because the catalog branch `Status / 🔩 Label / Label` did not share a literal path with actual `Status / Label / Label`. Version 0.1.46 aligns descendant instance subtrees by component-key chain and occurrence, with a normalized-name-chain fallback when raw variant patches omit the nested component key. This avoids component-specific suppression and still lets standalone references provide fields the parent variant did not define. `test:nested-variants` covers stale-host selection, renamed nested instances without raw keys, Approved baseline, a real manual recolor and four repeated rows and is part of `npm run validate`.

Field verification (Apollo 0.1.46, report `Alexey-Kukhta-CORP-Lead-Designer_15-07-2026_09-31-22_agent.json`): false fill customizations `text/info -> decorative-text/green` reduced from four to zero; all 12 confirmed `variant.Presets` changes remain; duplicate rule attachments remain zero. The report contains 22 total changes because four independently detected `variant.Uppercase` changes are now visible alongside the 12 presets and six layout changes.

Acceptance criteria:

- `decorative-text/green -> decorative-text/green` produces no fill customization for the Approved preset.
- A real manual recolor of the same Label still produces one paint customization with the Approved preset baseline.
- The 12 confirmed `variant.Presets` customizations in the control layout remain present after the fix.

### P1. Support the complete published `rules.target` schema in Apollo runtime

Evidence from the same 0.1.43 report: changes inside Section descendants receive unrelated CorporateContent root rules because runtime matching understands only `target.component` and `target.layers`. Published packages also use `target.components`, singular `target.layer`, `target.slots`, component key/name arrays and root selectors.

- [x] Extend the runtime rule type and validator for `target.component`, `target.components`, `target.componentKeys`, `target.componentNames`, `target.layer`, `target.layers`, `target.slot` and `target.slots`.
- [x] Interpret `target.layer: "root"` against the targeted component root, not every descendant in the same package.
- [x] Match renamed component instances by Figma component key while preserving layer/slot scope.
- [x] Prevent CorporateContent root rules from attaching to Section `Content`/`Isle` descendants and BackgroundPlateSlot padding changes.
- [x] Keep rule attachment deduplicated by `ruleId` after schema expansion.
- [x] Add schema fixtures from CorporateContent, Table Wide and BackgroundPlate packages.
- [ ] Re-run the control layout on Apollo 0.1.47 and confirm the corrected rule attachments in a field report.

Implementation status (Apollo 0.1.47): runtime validates every declared `target` before matching and supports the complete published component/layer/slot selector family. Actual/reference component identities are resolved to canonical catalog names by Figma key. Direct changed instances take precedence over package ancestors for component and root rules; an ancestor remains eligible only for explicit slot selectors such as `CorporateContent -> Body`. Root scope requires the targeted component itself, while layer and slot scopes use terminal matching and do not leak to descendants. Unsupported structural selectors such as `placeholder`, `parentComponents` or `prohibitedDescendants` are reported once and skipped instead of becoming unconstrained rules. `test:component-rules` includes CorporateContent, Table Wide and BackgroundPlate fixtures, renamed instances, singular/plural selectors, key/name arrays, unsupported targets and `ruleId` deduplication.

Field verification (Apollo 0.1.47, report `Alexey-Kukhta-CORP-Lead-Designer_15-07-2026_10-49-14_agent.json`): root-rule leakage into BackgroundPlateSlot is fixed, all 12 confirmed Table Wide `variant.Presets` changes retain the correct rule, false paint changes remain at zero and duplicate rule ids remain at zero. The task is not closed because two targetless package rules, `gutter-horizontal-composition` and `header-adjacency`, still attach to Section `Content` and `Isle` item-spacing changes. Targetless composition/screen rules need their own change-scope policy instead of package-wide per-diff attachment.

Acceptance criteria:

- Every attached rule satisfies both its component selector and its layer/slot selector.
- Package membership alone is not sufficient to attach a root-only rule to a nested component.
- Unsupported target shapes fail artifact validation or are reported explicitly instead of being treated as unconstrained rules.

### P0. Make repeated Apollo audits deterministic after lazy catalog loading

Evidence from four consecutive Apollo 0.1.47 reports for the same selected frame and unchanged 207 component instances:

- `10-47-47`: 22 changes, including four `variant.Uppercase True -> False` changes;
- `10-48-26`: 19 changes, including one `variant.Uppercase` change;
- `10-48-37`: 18 changes, no `variant.Uppercase` changes;
- `10-49-14`: 18 changes, no `variant.Uppercase` changes.

The stable 12 `variant.Presets`, six layout changes and zero paint changes show that only nested Label variant baselines drift as component catalogs become available or cached. A repeated audit must not mutate cached catalog structures or change host-vs-standalone materialization semantics.

- [x] Reproduce the 4 -> 1 -> 0 `variant.Uppercase` drift in a regression that executes the same audit/materialization sequence at least three times in one runtime.
- [x] Make lazy nested-component loading complete before the effective reference is finalized, or make the merge result invariant to whether the standalone nested catalog was already cached.
- [x] Keep catalog `structure` and `variantStructures` immutable across scans; clone every cached structure before alignment, provenance and merge operations.
- [x] Confirm in regression coverage that repeated materialization produces the same ordered change signatures, excluding timestamps and report ids.
- [ ] Re-run the control layout at least three times without restarting Apollo and verify an identical change count each time.

Implementation status (Apollo 0.1.48): `diffExplicitNestedVariantStates` aligns the host reference with actual nested instance paths by component identity and normalized name before comparing variant properties. Explicit host-owned state therefore remains visible whether expanded standalone materialization produced four, one or zero copies of the same change; existing diffs are still deduplicated by node/property. Component catalogs loaded in one lazy batch no longer update inferred nested keys and host policies in fetch-completion order. Apollo waits for the batch, removes previous inferred-only keys, recomputes unique-name inference over the complete loaded set, rebuilds indexes in deterministic catalog order and then rebuilds host-controlled policies. Regression coverage models the observed 4 -> 1 -> 0 sequence, verifies four stable `variant.Uppercase` signatures and asserts that repeated comparisons do not mutate actual or cached host structures.

Field verification (Apollo 0.1.48, report `Alexey-Kukhta-CORP-Lead-Designer_15-07-2026_11-22-10_agent.json`): failed with 18 changes and zero `variant.Uppercase` changes. The synthetic fallback covered a StatusPreset used as the direct host, while the real audit starts at CorporateContent and materializes `Table Wide -> StatusPreset -> Label`. The broader Table host descendant carried `Uppercase=False` and overwrote the selected StatusPreset variant-owned `Uppercase=True` before the explicit fallback ran.

Follow-up implementation (Apollo 0.1.49): host variant restoration now merges nested instance variant properties at property level. Values marked in `referenceVariantOwnedProperties`, such as `componentInstance.variantProperties.Uppercase`, remain owned by the selected parent variant; the broader host supplies only properties that parent variant does not own. The same rule is applied both during instance-root replacement and during the final occurrence-based host baseline restoration. Regression coverage includes the real stale Table host (`False`) versus selected StatusPreset (`True`) conflict.

Field verification (Apollo 0.1.49, reports `12-34-36` and `12-34-41`): both consecutive saved runs contain the same 18 changes: 12 `variant.Presets` changes and six layout changes, with zero paint/stroke changes, zero `variant.Uppercase` changes and no duplicate `ruleId` values. After removing report metadata, their ordered full change signatures and rule sets are identical (`SHA-256 b9bae2a7d973c4e86e19f2d7eb7aef216620363ab84d5ac6930e75018bd6b782`). This confirms deterministic output for the two available 0.1.49 reports. The third attached report, `11-22-10`, was produced by Apollo 0.1.48, so the formal three-run field acceptance remains open. The stable absence of `variant.Uppercase` is a semantic-baseline question rather than evidence of repeated-run drift and must not be treated as a determinism failure without confirming that these four differences are expected user-visible customizations.

Acceptance criteria:

- The first and every subsequent scan in one Apollo session produce the same customization signatures for an unchanged Figma selection.
- Host-variant-owned Label properties do not depend on lazy-load/cache timing of the standalone Label catalog.
- A full plugin restart does not change the effective baseline or finding set.

### P0. Make variable bindings and modes first-class audit evidence

Field evidence from Apollo report `Alexey-Kukhta-CORP-Lead-Designer_15-07-2026_20-44-06_agent.json`: Apollo reports CorporateContent `paddingLeft/right 52 -> 30` and nested Section `itemSpacing 24 -> 16` as layer customizations, then exposes contract rules that the agent interprets as prohibitions on manual spacing. The audited Figma nodes are in fact bound to the intended variables. The reference catalog also contains `VariableID:76532:102340` for CorporateContent left/right padding and `VariableID:76532:102341` for Section item spacing. Apollo already captures padding binding ids in the snapshot, but the numeric diff ignores binding identity, the stats builder drops `DiffValueDetails.bindingId`, and the item-spacing numeric diff does not carry its binding at all. The agent therefore receives only resolved numbers and cannot distinguish a manual override from the same variable resolving under another collection mode.

- [x] Preserve property-level variable binding evidence for currently audited token-aware properties: padding, item spacing, radius, opacity, fills and strokes.
- [ ] Extend property-level binding evidence to width/height constraints, visibility, stroke geometry, effects and layout-grid fields as Apollo adds deterministic diffs for those properties.
- [x] Resolve binding ids to stable variable, collection and mode names and include both actual and reference binding evidence in the full stats report and `*_agent.json`.
- [x] Capture the relevant explicit and resolved collection mode from the changed node and its ancestor chain, including the node that owns the mode, without serializing unrelated collections.
- [x] Compare binding identity before resolved numeric values. When actual and reference use the same canonical variable, do not report a manual layer override solely because the resolved numbers differ between modes.
- [x] Route a same-binding/different-value case to variable-mode validation. A prohibited or misplaced mode may still be a deterministic violation, but it must not be described as manual padding, gap, color or radius.
- [ ] Distinguish at least `same-binding`, `allowed-binding`, `different-binding`, `unbound`, `unresolved-binding` and `missing-reference-binding` outcomes in assessment evidence.
- [x] Require positive `unbound` or disallowed-binding evidence before an agent or deterministic rule describes a value as manual.
- [x] Keep exact component rules such as `spacing-uses-grid-cols-mode` and `section-gutter-required`, but evaluate them against binding collection/mode evidence rather than the existence of a numeric diff.
- [x] Add field-shaped regression coverage for CorporateContent `52 -> 30` and Section `24 -> 16` with the same binding, incorrect mode, wrong variable and unbound numeric value.
- [ ] Extend the same evidence model to grid/layout-style identity and mode-driven layout changes so agents can distinguish valid responsive composition from manual geometry edits.

Acceptance criteria:

- Correctly bound CorporateContent padding and Section Gutter produce no manual-spacing violation when their values change only because the intended Grid & Cols mode resolves differently.
- The report names the actual variable, collection, resolved mode and mode-owning node for every rule whose decision depends on variables.
- An unbound `padding=30` still produces a deterministic manual-padding violation, while a wrong variable or prohibited mode produces its own precise violation.
- Agent guidance never infers “manual” from `referenceValue != actualValue` alone.

Implementation status (Apollo 0.1.50): actual snapshots preserve resolved modes plus the nearest explicit mode owner for every collection visible on the audited node. Token-catalog metadata resolves local and remote alias ids to one canonical variable key and names the variable, collection and mode. Padding, item spacing, radius and opacity compare binding identity before their resolved values; fill/stroke retain the same token-first behavior and now carry equivalent binding/mode evidence in reports. CorporateContent `Grid Margin 52 -> 30` and Section `Gutter 24 -> 16` are suppressed when the canonical bindings match. Unbound and different-variable cases remain visible with `bindingStatus` and become deterministic manual-spacing violations only when the exact component rule explicitly prohibits manual values. Rules with `variables.<collection>.mode` plus `allowedModes`/`prohibitedModes` are audited independently even when the component has no direct overrides; prohibited modes produce a dedicated mode finding with the collection, resolved mode and inherited/explicit owner. `npm run validate` includes the field-shaped binding regression and snapshot mode-ownership regression.

Field verification (Apollo 0.1.50, report `Alexey-Kukhta-CORP-Lead-Designer_15-07-2026_23-02-08_agent.json`): same-binding responsive padding/gutter noise is removed. A follow-up experiment detached only the CorporateContent left-padding variable while preserving its current numeric value. Apollo correctly kept the case visible, but the UI still rendered the generic reference-mode numbers `52 -> 30`, so the user could not distinguish a detached binding from a value selected by another mode. Numeric contextual assessment could also reclassify the detached binding as expected, and ordinary properties with no variable on either side were incorrectly tagged `unbound`.

Follow-up implementation (Apollo 0.1.51): a reference binding missing from actual now produces a dedicated `bindingStatus=unbound` diff before numeric comparison, even when the raw numbers are equal. Padding, item spacing, radius, opacity and tokenized fill/stroke use explicit `Переменная ... -> Отвязана` messages. Component-contract binding violations are assessed before contextual numeric baselines, so a correct accidental number cannot hide the missing variable. Properties unbound on both sides keep `bindingStatus=null`. The UI renders binding and mode findings in a separate `Переменные` section, and reset-by-details rebinds the reference variable in addition to restoring its raw value. Regression coverage includes detached CorporateContent padding with both different and equal numeric values.

Field follow-up after Apollo 0.1.51: the detached left padding was correctly classified under `Переменные`, but reset wrote the catalog's exported raw value `52` and failed to restore the variable. The active document mode was `1024`, where `Grid/Grid Margin` resolves to `30`. The reset resolver incorrectly passed the local suffix `76532:102340` to `importVariableByKeyAsync`, which requires the published canonical key; a failed lookup returned `null` and the reset silently left the numeric fallback.

Follow-up implementation (Apollo 0.1.52): binding reset no longer writes the catalog raw value before rebinding. Apollo first tries the exact local `VariableID`, then the variable id and canonical published key resolved from the token catalog. A requested non-null binding that cannot be resolved fails explicitly and never calls `setBoundVariable(..., null)` or leaves the catalog-mode number behind. Successful binding lets Figma resolve the value from the current inherited mode, so the same Grid Margin variable becomes `30` in mode `1024`. Reset-by-details applies this binding-first behavior to padding, item spacing, radius and opacity.

The remaining unchecked evidence-status item covers `allowed-binding` and incomplete-reference classification; the unchecked property-extension item covers variable-bindable properties for which Apollo does not yet emit a deterministic structural diff.

### P1. Define per-change scope for targetless component rules

- [x] Treat targetless composition and screen rules as package/agent context by default, not as unconstrained rules for every atomic diff in that package.
- [x] Add an explicit artifact field or deterministic mapping for rules that are intentionally attachable to atomic layer changes.
- [x] Prevent `header-adjacency` from attaching to Section `Content`/`Isle` `layout.itemSpacing` changes.
- [x] Attach `gutter-horizontal-composition` only when horizontal-composition evidence is present; do not infer direction from `layout.itemSpacing` alone.
- [x] Add CorporateContent fixtures for targetless `composition_rule`, `screen.composition` and package-level informational context.

Implementation status (Apollo 0.1.53): targetless `composition_rule`, `screen.*` and `component.composition` rules no longer match atomic layer/property diffs solely through package membership. Explicit `changeScope=component-context|screen-context|package-context` forces context-only behavior, while `changeScope=atomic` opts a component-wide rule into atomic matching. Legacy deterministic and `exact_component_rule` rules without a target remain compatible unless their property scope is composition/screen context. CorporateContent regressions verify that Section root `layout.itemSpacing` keeps only `section-gutter-required`; `header-adjacency`, `gutter-horizontal-composition` and package context do not attach. Agent-report coverage verifies that composition instructions remain available through `componentContexts` while staying out of the atomic change's `componentRules`.

Acceptance criteria:

- A rule without `target` never becomes a per-change rule solely because the changed component key belongs to the same package.
- Screen-level composition rules appear in component/agent context until the report contains the screen relationship required to evaluate them.
- Section slot layout changes contain only rules whose selector and semantic change scope are both satisfied.

### P1. Unify Athena plugin and Athena CLI publication contracts

- [ ] Extract shared catalog naming, category inference, index construction, source metadata and validation logic into one tested module or schema package.
- [ ] Choose one canonical full-package publisher. The Athena plugin currently writes the raw catalog, component index, generated-draft `audit-mapping.json`/`agent-context.json` and web-corp registries, while Athena CLI builds the full contract package and `componentContractIndex.json`.
- [ ] Ensure a catalog published from either supported surface produces the same raw catalog, index paths, package paths, manifest entry and contract-index entry.
- [ ] Do not publish a new contract-covered component from the plugin without refreshing `componentContractIndex.json`, or explicitly route plugin publication through the canonical CLI/service pipeline.
- [ ] Remove duplicated implementations of `inferCategoryFromName` and index payload generation after shared behavior is in place.
- [ ] Add golden-fixture tests that compare plugin and CLI output for `BackgroundPlate` and `TitleView`.

Acceptance criteria:

- The same Figma source exported through Athena and Athena CLI yields contract-compatible, semantically identical source metadata, categories and component-key indexes.
- Newly published contract-covered packages are discoverable by Apollo immediately after the release manifest switches.
- There is one documented owner for generation of each artifact and no publication path silently omits an always-on index update.

### P1. Make contract coverage explicit and validate runtime artifacts

- [ ] Declare contract coverage in the manifest or component index instead of inferring it from package matches. Support at least `required`, `optional` and `none` policies.
- [ ] Make Apollo fail loudly when a `required` component key has no matching package or required `rules`/`composition` artifact.
- [ ] Keep raw catalog audit available for components explicitly marked `none`; do not treat an unmatched package as an implicit opt-out.
- [ ] Validate contract index schema version, duplicate keys/aliases, artifact paths and artifact document schemas before publication and again when loading remote data.
- [ ] Add checksums or content versions to the contract index and include them in cache diagnostics.
- [ ] Report covered, uncovered and invalid component keys by library in `validate-release` output.
- [ ] Add runtime tests for required missing package, required missing artifact, optional artifact and explicit no-contract behavior.

Acceptance criteria:

- Apollo never logs `remote artifacts skipped: no matching packages` for a required component and then continues as if contract validation succeeded.
- Contract coverage is measurable and intentional; percentage changes are visible in release validation.
- Invalid or incompatible remote artifacts produce actionable errors containing component key, package path and failing schema/path.

### P1. Put every regression and catalog consistency check into CI

- [ ] Replace Apollo's hand-written partial `validate` chain with an aggregate test command that discovers or explicitly includes all 17 regression scripts.
- [ ] Add Athena unit tests for category parsing, source metadata, untokenized-paint diagnostics, component-index construction and publish ordering.
- [ ] Expand Athena CLI tests beyond the current 3 hybrid-merge cases to cover catalog normalization, manifest filtering, index generation, targeted sync and end-to-end check mode.
- [ ] Run `catalogs:sync-apollo -- --check` and `contracts:check-apollo -- --update-generated` against the catalog repository in CI.
- [ ] Make stale indexes, stale generated/hybrid sections and unexpected manifest changes blocking release failures.
- [ ] Add concise failure summaries listing every stale artifact instead of stopping at the first file.

Acceptance criteria:

- One documented validation command per project runs all project checks locally and in CI.
- Removing any component index, corrupting source metadata or making a generated contract stale fails the gate with the affected paths listed.
- The currently stale catalog index state and `Spacing component/audit-mapping.json` generated section are reconciled without overwriting manual data.

### P1. Capture and diff auto-layout sizing

- [x] Add `layoutSizingHorizontal` and `layoutSizingVertical` to Apollo structure snapshots for nodes that support auto-layout sizing.
- [x] Normalize values into stable diff properties such as `layout.sizing.horizontal` and `layout.sizing.vertical`, while preserving Figma API aliases for contract matching.
- [x] Compare sizing against the effective reference baseline in `diffStructures` and expose changes as independently resettable layer customizations.
- [x] Include sizing changes in the full stats report and `*_agent.json` without losing the owning component and nested layer path.
- [x] Allow component rules to match sizing properties deterministically. Initial required case: `BackgroundPlateSlot / Slot` must use `FILL` horizontally and `HUG` vertically.
- [x] Add regression tests for `FILL -> FIXED`, `HUG -> FILL`, unchanged sizing, nested component ownership and layer-only reset.

Implementation status (2026-07-15): implemented in Apollo runtime and included in `npm run validate` through `test:layout-sizing-diff` and `test:component-rules`. Apollo reads sizing from snapshots and normalized catalogs; while older catalogs do not yet carry these fields, deterministic component-rule `requiredValues` provides the effective baseline. Components with required sizing rules always receive a structural audit because Figma may omit sizing changes from `instance.overrides`. Component ownership is matched by explicit actual/reference keys, while nested targets must end at the changed relative layer path, so a `Slot` rule cannot leak into its descendants. Stats and agent-report regression coverage preserves the owning component, nested layer path, canonical property and human-readable values.

Acceptance criteria:

- Apollo displays horizontal and vertical sizing changes on the correct nested layer.
- The reference and actual values use human-readable `Fill`, `Hug` or `Fixed` labels in the UI and agent report.
- Rule `component:web-corp.background-plate.slot-sizing-fill-width-hug-height` matches the captured properties and raises the declared design severity.
- Reset restores only the selected sizing property to the effective baseline without resetting unrelated component properties or layout settings.

### P1. Diff stroke alignment

- [x] Compare the existing snapshot field `stroke.align` in `diffStructures`; Apollo already captures `strokeAlign`, but previously diffed only stroke paint and weight.
- [x] Emit a separate layer customization with canonical property `stroke.align` and human-readable values `Inside`, `Center` or `Outside`.
- [x] Include the property in the full stats report and `*_agent.json` and support a layer-only reset to the effective reference value.
- [x] Add deterministic component-rule matching for `stroke.align`. `BackgroundPlate` with `Type=Border` must keep `INSIDE`; variant conditions prevent this rule from raising severity for other types.
- [x] Add regression tests for `INSIDE -> CENTER`, `INSIDE -> OUTSIDE`, unchanged alignment, nested ownership and reset without changing stroke color or weight.

Implementation status (2026-07-14): implemented in Apollo runtime and included in `npm run validate` through `test:stroke-align-diff`. Stats/agent regression coverage confirms the exact BackgroundPlate component rule and human-readable values.

Acceptance criteria:

- Apollo reports the stroke alignment change on the correct nested layer independently from stroke color and weight.
- Rule `component:web-corp.background-plate.border-stroke-align-is-fixed` matches the captured change and raises the declared design severity.
- Reset restores only stroke alignment and preserves tokenized stroke color and context-controlled stroke weight.

### P1. Diff visual effects

- [ ] Compare the existing snapshot field `effects` in `diffStructures`; Apollo already extracts effect types, but does not currently emit structural effect diffs.
- [ ] Emit separate layer customizations for added, removed or changed `DROP_SHADOW` and `INNER_SHADOW` effects without merging them with opacity or paint findings.
- [ ] Preserve effect type during classification: component rules may prohibit `DROP_SHADOW` and `INNER_SHADOW` while allowing contextual `LAYER_BLUR` and `BACKGROUND_BLUR` on the same component family.
- [ ] Preserve effect type, visibility and style identity in the full stats report and `*_agent.json` using human-readable labels.
- [ ] Support deterministic component-rule matching for effect types. Initial required case: BackgroundPlate prohibits manually added shadows.
- [ ] Add layer-only reset and regression tests for raw Drop shadow, Inner shadow, effect style, unchanged effects and nested component ownership.

Acceptance criteria:

- Rule `component:web-corp.background-plate.manual-shadows-are-prohibited` matches a manually added shadow and raises the declared design severity.
- Rule `component:web-corp.background-plate.blur-is-context-controlled` keeps Layer blur and Background blur informational and does not route them through the shadow prohibition.
- Reset removes only the detected shadow and preserves opacity, fill, stroke and component properties.

### P1. Capture and diff blend mode

- [ ] Add `blendMode` to Apollo structure snapshots for nodes that expose `BlendMixin`.
- [ ] Normalize it as canonical property `blend.mode` while preserving the Figma API alias `blendMode` for contract matching.
- [ ] Compare actual and effective reference values in `diffStructures` and emit an independently resettable layer customization.
- [ ] Include human-readable blend mode values in the full stats report and `*_agent.json`.
- [ ] Support deterministic component-rule matching. Initial required case: BackgroundPlate prohibits manual blend mode changes.
- [ ] Add regression tests for unchanged mode, `PASS_THROUGH -> MULTIPLY`, nested surface ownership and layer-only reset.

Acceptance criteria:

- Rule `component:web-corp.background-plate.blend-mode-is-fixed` matches a manual blend mode change and raises the declared design severity.
- Reset restores only blend mode to the effective baseline and preserves opacity, effects, paint and component properties.

### P1. Capture ancestor variable-mode context

- [ ] Collect relevant `explicitVariableModes` and `resolvedVariableModes` from the audited node and its ancestor chain without serializing unrelated variable collections.
- [ ] Resolve collection and mode ids to stable names through the loaded token catalog. Initial required collections: `BackgroundPlate Level`, `BackgroundPlate Radius` and `BackgroundPlate Color`.
- [ ] Include compact ancestor surface context in the full stats report and `*_agent.json` for affected component families.
- [ ] Support composition-rule matching against required ancestor modes. Initial required case: the root page or modal surface containing `BackgroundPlateSlot` must provide `BackgroundPlate Level=Level-0 (base)`.
- [ ] Distinguish mode assigned to the parent surface from a mode assigned directly to the component instance.
- [ ] Add regression tests for inherited Level-0, missing Level-0, Level-0 assigned to the wrong node, automatic Level-1 resolution and modal/page color modes.

Acceptance criteria:

- Rule `component:web-corp.background-plate.root-surface-requires-level-0` receives deterministic ancestor-mode evidence instead of relying on an unsupported inference.
- The agent report names the collection, resolved mode and owning ancestor without exposing unrelated variables.
- Apollo does not report a violation when Level-0 is correctly inherited and the first BackgroundPlate resolves to Level-1.

### P1. Preserve the full component name in catalog `category`

- [x] Fix Athena CLI catalog export so `category` preserves the complete component name and opening bracket in prefixes such as `[D]` and `[M]`.
- [ ] Fix both confirmed implementations of `inferCategoryFromName`: Athena plugin and Athena CLI currently call `replace(/^[^\wА-Яа-я]+/, "")`, which strips the opening bracket.
- [x] Cover `[T]` and other supported bracketed prefixes in Athena CLI in addition to `[D]` and `[M]`.
- [x] Apply the Athena CLI fix in the shared normalizer for all component catalogs rather than patching individual exported files.
- [x] Add Athena CLI regression coverage for `[D] BackgroundPlate`, `[D] Style Level 1`, `[M] TitleViewMobile` and `[D] RightAddon`.
- [x] Verify in Athena CLI tests that names without bracketed prefixes remain unchanged after export.

Implementation status (2026-07-14): Athena CLI is fixed and covered by tests. The Athena Figma plugin implementation and re-export of existing published catalogs remain pending.

Acceptance criteria:

- The exported `category` exactly matches the full Figma component name, including its `[D]` or `[M]` prefix.
- `BackgroundPlate`, `TitleViewMobile`, `Style Level 1` and `RightAddon` no longer produce values such as `D] BackgroundPlate` or `M] TitleViewMobile`.
- A repeat export does not introduce new changes to already-correct category values.

### P1. Populate Figma source metadata in catalog indexes

- [x] Update Athena CLI `*.index.json` generation to read the current Figma file key and write it to `source.fileKey`.
- [x] Preserve `ComponentsReport.meta.fileKey` and source node/page context when Athena CLI normalizes a raw response.
- [x] Remove the hardcoded `fileKey: ""` and `figmaLink: ""` values from Athena CLI `sync-apollo-catalogs`.
- [ ] In the Athena plugin, populate index source metadata in the main runtime from `figma.fileKey`; do not depend only on UI `document.referrer`, and patch/validate related index JSON before upload.
- [x] Generate Athena CLI `source.figmaLink` in the form `https://www.figma.com/file/{fileKey}/...` and include a page or node target when that context is available.
- [x] Emit an explicit Athena CLI sync warning when required source context is unavailable instead of silently publishing empty strings; missing values serialize as `null`.
- [x] Keep the Athena CLI source metadata contract usable by Apollo and Argus without reconstructing a file key from catalog names or paths.
- [x] Add Athena CLI regression coverage for raw catalog and index source metadata generation.

Implementation status (2026-07-14): Athena CLI writes canonical source metadata and can recover it for legacy raw catalogs from the reference-library link. Athena plugin changes and re-export of published indexes remain pending.

Acceptance criteria:

- Newly exported indexes, including `BackgroundPlate.index.json`, have non-empty `source.fileKey` and `source.figmaLink` values.
- `source.fileKey` identifies the Figma file from which the catalog was exported.
- `source.figmaLink` is a valid link to the same file and can be used as an Apollo/Argus deep link.
- Missing source context is visible in export or release validation and cannot pass as a successful publication with empty required fields.

### P1. Warn about untokenized catalog colors

- [ ] Add the same structured export warnings in Athena plugin and Athena CLI for `tokenKey: null` on fills and strokes of non-auxiliary elements.
- [x] Add structured Athena CLI warnings for `tokenKey: null` on fills and strokes of non-auxiliary elements without aborting export.
- [x] Include catalog, component, variant, layer name/path/type, paint property/index, resolved color and effective layer visibility in every Athena CLI warning.
- [x] Define and document a narrow auxiliary-layer rule: exact case-insensitive names `Fixer`, `Helper`, `Mask`, `Placeholder`, `Spacer`; `isMask` alone and hidden layers are not excluded.
- [x] Add an Athena CLI batch summary with the total count and deterministic structured warning list.
- [ ] Bind the known source colors to design tokens in Figma and re-export the affected catalogs:
  - `TitleViewMobile / Shape`: `#CF70FF`;
  - `TitleViewMobile / Indicator (Ellipse)`: `#3778FB`;
  - `TitleView / icon`: `#9032EE` and `#747474`.
- [x] Add Athena CLI regression coverage for fill/stroke warnings, an explicitly auxiliary layer, an invisible paint and a hidden ordinary layer.
- [x] Preserve `tokenState: "missing-binding"` so Apollo can distinguish a missing token binding from a future parsing error or unsupported token format.

Implementation status (2026-07-14): Athena CLI implementation and tests are complete. Verification against saved real export responses reports the known `TitleView` icon colors and all three `TitleViewMobile` Shape/Indicator paints. Athena plugin parity and Figma-side token binding remain pending.

Acceptance criteria:

- Every untokenized fill or stroke on a non-auxiliary element produces an actionable warning with its exact source location and color.
- Export completes and reports a deterministic untokenized-color summary.
- After the Figma sources are corrected, the listed `TitleViewMobile` and `TitleView` layers export with non-null `tokenKey` values.
- Apollo can validate light/dark theming for the corrected paints and the layout generator can resolve their theme-specific values.

## Open Questions

- Whether `referenceSourcesMVP.json` should be upgraded in place to `schemaVersion: 2` or point to a secondary `apolloManifest.json`.
- Exact normalized filename for raw catalogs inside component packages, for example `catalog.raw.json`.
- How aggressively Apollo should fail if a component has a raw catalog but no contract kit.
- Which contract artifacts are required for MVP runtime and which remain optional until their pipeline is mature.

## Current Decision

Preserve the one-link bootstrap model. Modernize the files behind that link and the publish pipeline rather than moving operational knowledge into the plugin bundle.
