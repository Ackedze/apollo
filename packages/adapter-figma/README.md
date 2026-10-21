# Apollo Figma generation adapter

`executeFigma(plan, hash, host)` executes the same frozen CompositionPlan as the
frontend adapter. It runs common arui-private/source/preflight gates before any
mutation, resolves all imports/fonts/native slots/action handlers before begin,
rechecks inputs, creates library instances and fills declared native slots.
The host never searches layer names or draws substitute UI.

`FigmaHost` is the native Plugin API / existing Apollo capture port. It records
all nodes created by its transaction, including partially created nodes; cleanup
must leave prior document content untouched. Failures return a pinned receipt
with explicit rollback success/failure. Owned action IDs and plan node IDs retain
provenance. Capture and existing predicate evaluation are supplied by Apollo;
the adapter does not define another normative engine.

The execution protocol is implemented and tested with a synthetic host. A real
native host, verified identity-specific slot/action handlers, prototype behavior
and user-run live acceptance are **not implemented/accepted** by these tests.
Current ButtonsGroup Draft/source gate remains blocking. The Apollo product
controller exposes missing ports rather than manufacturing a successful result.

See `../generation-core/README.md` for source/registry handoff, checks and gaps.
