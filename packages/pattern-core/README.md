# Apollo pattern core · NEXT-06

Reviewable, offline **draft** framework for contextual patterns consumed by
Apollo through Generation's common CompositionPlan/preflight. Repository
name `Apollo` does not make this a legacy v3 feature. No application adapter,
shared core, generation-core or component implementation is changed here.

Package: `@apollo/pattern-core@0.1.0-draft.1`. Contract schema:
`apollo.pattern-contract.v1-draft`. Proposed output port:
`apollo.pattern-requirements.v1-draft`. Node.js 22, existing root TypeScript /
esbuild tooling, pinned Zod `3.25.58`; no installation or publication was performed.

## Artifacts

- `src/schema.ts`: closed Zod structure, types and proposed registry evidence port.
- `schemas/pattern-contract.v1-draft.schema.json`: generated JSON Schema draft-07
  projection; regenerate with `npm run build`, do not edit it separately.
- `src/validator.ts`: identity/reference closure, typed finite decisions,
  exhaustive coverage/overlap, composition graph and scenario diagnostics.
- `src/decisions.ts`: explicit context selection and read-only event resolution.
- `src/sources.ts`: immutable source-byte / Git pin / exact pattern and RuleID checks.
- `src/requirements.ts`: selected semantic requirements for the future v4 plan,
  plus fail-closed arui-private mapping checks.
- `docs/AUTHORING.md`, `docs/PATTERN_TEMPLATE.md`, `docs/template.synthetic.json`:
  workflow and authoring templates.
- `docs/COMPOSITION_PLAN_PORT.md`: proposed handoff to Generation, pending agreement.
- `pilots/interruption.draft.json`, `pilots/README.md`: source-referenced DS AB pilot.
- `tests/`: synthetic policies and mappings only; no production manual/capture fixtures.

## Local checks

From the Apollo repository root, with existing dependencies available:

```sh
npm --prefix packages/pattern-core run validate
npm --prefix packages/pattern-core run pilot:check -- --source-root design-system_ab=/absolute/path/to/design-system_ab
node packages/pattern-core/scripts/check-schema.cjs /absolute/path/to/existing/ajv
npm run validate
```

`pilot:check` reads the exact pinned Git object, not a mutable working-tree
file, and reports only identities/hashes/status. It checks all 18 declared
context combinations and the unresolved save-failure route. It writes no
source files, receipts, target artifacts or private data.

## Semantics and limits

Context v1 is boolean or finite string enum; no implicit defaults or guessed
product capabilities. Decision tables use unique hit policy, complete coverage
and explicit `any`, `eq`, `in` cells. The whole context product is capped at
4,096 combinations so exhaustive checks have a clear bound. An absent input is
`unresolved`, an out-of-domain value is invalid, and neither selects a fallback.

Semantic compositions name roles and cardinality, not Figma keys, React props,
CSS, imports or fabricated substitutes. UI roles require either a pinned
registry entry or an explicit blocking availability gap. Regions express
grouping only: they do not authorize a native div/frame/text operation. Code
Connect / Generation own the closed system-operation list and actual mappings.

State names and event routing are framework formalizations of source policy.
Reference verification proves byte/identity closure, **not** that a paraphrase
or transition is semantically approved. Unspecified events resolve to unknown;
save failure goes to a product gap without actions or a guessed destination.
The resolver does not execute saves or navigation and does not persist session
state. Its caller supplies the currently observed state and selected outcome.

Drafts cannot be promoted by changing `status`: this schema accepts `draft`
only. Requirements always carry `executionAllowed: false`. Structural/source
checks, availability, component-rule coverage, product acceptance, target/live
acceptance and release are separate. Passing synthetic mapping tests is not
evidence that an actual arui-private export exists.

The existing hub generation schema supplies the useful baseline concepts
(semantic inputs/roles, source RuleIDs, explicit gaps), but has no typed decision
tables or event graph. It is left unchanged. Zod is reused as the structural
validator rather than implementing another general JSON Schema engine. Its
generated export uses only the explicitly supported pinned Zod vocabulary;
unsupported projection constructs fail the build. Draft-07 aligns with the
existing NEXT-01 schema tooling; optional independent schema QA reuses an
explicitly supplied existing Ajv 6.15.0, without installation. Predicate evaluation and
component-owned norms remain in the shared component contracts/engine.

## Integration status

This is an independent v4 package and a proposed semantic port, not an installed
v4 feature. NEXT-01 now supplies a read-only registry/consumer for three
ButtonsGroup / CorporateContent mappings. It does not confirm the interruption
pilot's surface/content/action/notification bindings. General and
Generation must agree the port before modifying CompositionPlan or application
preflight. The pilot binds no UI export while those inputs are absent.

No normative DS rule was added, changed or promoted. If product review requires
a new rule, hand it to General / Contract Creation with the existing DS source
and ledger process instead of embedding it in this framework.
