# Interruption scenario · DS AB draft pilot

`interruption.draft.json` is a review formalization of the existing source
`design-system_ab/patterns/p_interruption-scenario.md`. It keeps exact existing
pattern/RuleIDs and immutable Git/file pins. It is not a new normative source
and is not a production test fixture. No manual body, private capture or code
catalog is copied here. Human source: the pinned document in the DS AB checkout.

Context: explicit product data-loss risk, confirmed save mode and platform.
The source's main choices become six mutually exclusive rows over 18 contexts:
no-risk exit; automatic save; manual/discard choices on desktop or mobile
surfaces. UI copy and exact components are not filled in from guessed exports.

The scenario scaffolding has four states and ten transitions. State/event IDs
are framework mechanics for review, not newly introduced DS RuleIDs. The
success event is an observed product result; requesting save does not imply
it succeeded. No event is executed by pattern-core.

`save-failed` intentionally targets `save-failure-policy` with `basis: gap-route`
and no actions. The referenced save rule supplies the surrounding scope; it
does not define failure recovery. The product owner must define that behavior.
The draft does not prescribe retry, exit, stay, notifications or data cleanup
on failure. Undefined dismiss/close events likewise remain unresolved.

All UI bindings are `unresolved`. Source mentions of Modal/PopUpSheet or any
other Figma name are not code availability evidence. Code Connect / General
must provide confirmed arui-private entries per platform/target before binding
surface, content, actions or save-result notification. `save-result` describes
the source-required notification role in the automatic-save outcome; timing
is expressed by the successful product event, not by unconditional rendering
as soon as an outcome is selected. The common plan must preserve this distinction.

Other explicit gaps: optional remembered choices, CompositionPlan port
agreement, product interpretation and live acceptance. The local source check
verifies bytes and exact IDs only; it does not certify the semantic projection.

Read-only check from the Apollo root:

```sh
npm --prefix packages/pattern-core run pilot:check -- --source-root design-system_ab=/absolute/path/to/design-system_ab
```

Expected local result: structure/source PASS, 18 selected contexts, save failure
unresolved, UI availability unresolved, execution forbidden, product/live
acceptance pending and release not published.
