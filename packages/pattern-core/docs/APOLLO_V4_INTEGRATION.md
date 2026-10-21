# Generation consumer integration · 05.10.2026

The scoped NEXT-06 package was transferred unchanged to the main Apollo
checkout by the General-appointed Generation integrator. It remains
`@apollo/pattern-core@0.1.0-draft.1`; schema, pattern pilot and source receipt pins
match the original handoff. Local bundle hash may differ with checkout paths.

The Node-only v4 bridge is
`scripts/generation-pattern-inputs.js`; common plan/preflight
integration is in `packages/generation-core/src/planning`. No Node crypto or
pattern runtime is bundled in the Figma plugin. Type-only draft attachments
retain decisions, activeStates, outcome-scoped transitions, abstract actions,
constraints, gaps, source receipt and explicit role-to-node bindings.

Consumer reconciliation of the proposed port:

| Draft field | Common Generation interpretation |
| --- | --- |
| `registrySha256` | exact NEXT-01 producer registry digest |
| component `contractSha256` | canonical component compiledHash; archive/manual hashes remain separately pinned |
| `representationId` | target-specific Figma or code representation ID |
| semantic inputs/slots | accepted component semantic API IDs |
| semantic role | explicit reviewed binding with producer digest/compiledHash/evidence pin |
| pattern `contractSha256` | unchanged canonical hash of the complete draft pattern |
| source receipt | unchanged pattern source verification receipt |

This is a concrete consumer proposal for General/Patterns review, not a change
to the authoring schema. No semantic role grant is supplied for the real pilot.
UI bindings and save failure stay unresolved. A fresh source/producer provider
is required; absence returns failed/unresolved availability. API confirmation
never promotes representation, coverage, built-package, parity/live/release states.

The frozen common plan pins the complete attachment. Every attachment is Draft,
preserves `executionAllowed:false`, and blocks both target executions with
`PATTERN_DRAFT`. No state/initial-state merge, accepted pattern protocol or real
pilot generation is introduced. Regression coverage lives in
`tests/generation-pattern.test.js`.

See `docs/GENERATION_HOST_PORTS.md` for the required native/Proxy
provider operations and remaining product/source/toolchain inputs.
