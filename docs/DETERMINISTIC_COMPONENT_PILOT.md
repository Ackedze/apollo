# Deterministic component pilot

Apollo treats `ButtonGroup [D]`, `TitleView` and `BackgroundPlate` as the first
closed deterministic component packages. The agent may explain their findings,
but it does not calculate verdicts or remediation.

## Evidence policy

- `contract.generated.json` defines published component properties, values and
  allowed variant combinations.
- `composition-contract.json` defines trusted relational predicates.
- Typed fields in `rules.json` define atomic layout, paint, token and contextual
  predicates.
- `contract.overrides.json` supplies approved public API and reset ownership.
- Missing selector, property or context evidence produces no violation. Apollo
  must not infer a predicate from `ruleText`.
- Remediation is emitted only when the expected value comes from an explicit
  contract value, host property or source member.

## Executable coverage

### ButtonsGroup

- visible member count: 2-4;
- Button View domain: Primary or Secondary;
- optional Primary: at most one and only first;
- optional SingleIcon: at most one and only last;
- nested Button Size equals host ButtonsGroup Size;
- manual item spacing and raw visual/layout changes remain governed by typed
  component rules and effective baseline diffs.

Interaction semantics of the overflow list remain manual until the audit
snapshot contains prototype actions and overflow content evidence.

### TitleView

- StatusPreset Size equals 24;
- visible TitleStatus Type equals the preceding visible StatusPreset Type;
- nested Button View domain: Primary or Secondary;
- optional Primary and SingleIcon follow the same positional constraints as a
  ButtonsGroup;
- desktop Button Size equals 56 and mobile-web Button Size equals 48;
- StatusPreset Style is evaluated against explicit surface evidence by the
  typed component rule.

Slot availability by View, slot order and primary-action placement remain
unsupported until selectors can address named non-instance slots and the
snapshot exposes stable slot visibility/order evidence.

### BackgroundPlate

- nested Style Level 1 Type domain is Primary, Secondary, Colored or Border;
- Type switches are Expected component API changes;
- Primary and Secondary forbid manual fill and stroke;
- Colored permits only tokenized fill;
- Border permits only tokenized stroke and forbids visible fill;
- fixed sizing, stroke alignment and spacing-token rules use typed atomic
  component rules.

Generation preferences (`legacy`, `preferred`, promo-only) are not audit
violations while the corresponding Figma components remain active.

## Trusted operations

- `countBetween`
- `propertyDomain`
- `valuePosition`
- `propertyEqualsHost`
- `propertyEqualsFirst`
- `subtreePropertyPolicies`

Adding an operation requires Apollo code, schema validation, Athena publication
validation and regression tests. Editing selectors or values of an existing
operation requires only package publication and an Apollo restart.

Apollo regression tests use compact ownership-v2 fixtures from
`scripts/fixtures/composition-contracts.json` and therefore run in an isolated
checkout. Athena targeted `contracts:check-apollo` remains responsible for
validating the real component packages and their compiled registry.
