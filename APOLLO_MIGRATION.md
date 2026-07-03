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
   - later `contract.overrides.json` and `audit-mapping.json`.
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

For runtime audit Apollo needs only `artifacts.rules` and `artifacts.composition` at first. `artifacts.agentContext`, `audit-mapping.json`, `examples.json`, `contract.overrides.json` and `contract.generated.json` remain future pipeline inputs until the corresponding runtime phases are implemented.

### Apollo Runtime Loading Step

The first runtime implementation should:

1. Read optional `apollo.componentContractIndexPath` from `referenceSourcesMVP.json`.
2. Load the component contract index once per plugin session.
3. During scan, collect component keys from the selected area.
4. Resolve references for those keys through the existing component index/catalog loader.
5. Match contract packages by `figmaKeys`, `aliases` or `sourceCatalogPath`.
6. Lazily fetch only matched `artifacts.rules` and `artifacts.composition`.
7. Prefer remote artifacts over bundled artifacts for matching `componentKey`.
8. Fall back to bundled artifacts when the remote index is absent or a package is not available.
9. Log index/artifact failures without breaking raw Apollo audit.

## Migration Phases

### Phase 1: Document and Stabilize Current MVP

- Keep the existing stable bootstrap URL.
- Document the current artifact meanings and limitations.
- Stop duplicating rule text/severity in `agent-context.json`; use `ruleReferences`.
- Keep direct imports only as temporary MVP implementation details.

### Phase 2: Add Contract Index

- Add `JSONS/apollo/indexes/componentContractIndex.json`.
- Map component keys and aliases to component package directories and available artifacts.
- Include checksums or content versions for cache diagnostics.
- Extend `referenceSourcesMVP.json` to point to this index.

### Phase 3: Runtime Lazy Loading

- Replace static imports of `composition-contract.json` and `rules.json` in Apollo with manifest-driven lazy loading.
- Cache loaded contract artifacts per component family during a scan.
- Keep behavior identical for existing test cases.

### Phase 4: Move Classification Policy Out of Code

- Start consuming `audit-mapping.json` for grouping, ordering and reset-action decisions.
- Move hardcoded customization grouping rules into declarative mappings where possible.
- Keep code fallbacks only for missing draft mappings.

### Phase 5: Use Overrides as Effective Model Input

- Load `contract.overrides.json` before diff/classification.
- Use overrides for public API, anatomy semantics, reset model and dependency policy.
- Keep `contract.generated.json` and raw catalog as structural baseline sources.

### Phase 6: Agent Context on Demand

- Add a compact context resolver for agent requests.
- Include matched `rules.json` entries in `*_agent.json`.
- Include relevant `agent-context.json` slices only for affected components.
- Load `examples.json` only for direct Q&A or when the agent explicitly needs examples.

### Phase 7: CI and Publication Gates

- Add schema validation for all contract artifacts.
- Add consistency checks between raw catalogs, indexes, contracts, rules and agent context.
- Add a publish dry-run command.
- Make GitHub Pages publication fail if any referenced artifact is missing or stale.

## Open Questions

- Whether `referenceSourcesMVP.json` should be upgraded in place to `schemaVersion: 2` or point to a secondary `apolloManifest.json`.
- Exact normalized filename for raw catalogs inside component packages, for example `catalog.raw.json`.
- How aggressively Apollo should fail if a component has a raw catalog but no contract kit.
- Which contract artifacts are required for MVP runtime and which remain optional until their pipeline is mature.

## Current Decision

Preserve the one-link bootstrap model. Modernize the files behind that link and the publish pipeline rather than moving operational knowledge into the plugin bundle.
