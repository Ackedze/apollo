# Apollo frontend generation adapter

`prepareFrontend(plan, context, hash)` emits React/TypeScript using confirmed
public arui-private imports, content children and owned ButtonGroup elements.
It accepts typed closed transformations and events, never arbitrary JSX/import
or function snippets. Text is escaped as data. A Button used internally by
ButtonGroup does not become an allowed standalone generator import.

`executeFrontend(plan, hash, host)` rechecks common preflight before preparation,
before atomic private file creation, after writing and after host verification.
`FrontendHost` runs outside the Figma sandbox through Apollo's external / Proxy
port. It must compile actual imports/dependencies, capture actual browser facts
and run agreed interaction scenarios. It must track all files created by this
transaction and roll back on failure. Receipts preserve pins and provenance;
syntax-only transpilation is explicitly not a real package typecheck.

The emitter and transaction protocol are locally tested using synthetic mappings
and hosts. Real arui-private compile/browser execution, source scope acceptance,
consumer normalization from NEXT-01 and the external v4 host remain open.
The tests neither mock a successful private package installation nor close UI
parity, source, live or release gates. Local project dependencies are permitted
when their source is real and recorded in a manifest/lock.

See `../generation-core/README.md` for shared schemas, verification and next inputs.
