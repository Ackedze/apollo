# Authoring a contextual pattern

Target: Apollo. This workflow produces a review draft, not an executable
component policy or permission to generate a live interface.

1. **Fix the boundary and outcome.** Name one user goal, success criteria,
   owner, platform/surface scope and exclusions. Collect source links, exact
   existing pattern/RuleIDs and immutable repository/file pins. Keep manuals,
   captures and reports out of tracked fixtures.
2. **Separate known facts from open questions.** Record which facts come from
   product/runtime input and which are observable in a design. A form does not
   prove data-loss risk; a Save button does not prove successful persistence.
   Missing capability, failure behavior or mapping becomes an owned gap.
3. **Define typed context.** Use booleans and finite enums without defaults.
   Name every input and enumerate its domain. If a context exceeds 4,096
   combinations or needs numeric/free-text decisions, request an explicit
   schema extension through General rather than encoding an opaque expression.
4. **Build decision tables.** Every row names every declared table column.
   Use explicit wildcard cells only when policy is independent of the input.
   Each row selects one outcome and links existing source/RuleIDs. Run complete
   finite coverage and overlap checks. Do not infer priority from row order.
5. **Describe semantic composition.** Name parent/child roles, sibling order,
   cardinality and `activeStates`. Success notifications must not be rendered
   before an observed success event. Reuse component-contract identities/revisions via confirmed
   registry entries. Do not copy component-owned constraints into the pattern.
   Every unknown role/export is unresolved with a blocking gap. A semantic
   region is not permission to substitute a frame/div for a missing component.
6. **Formalize observable behavior.** Define states, user/product events,
   selected-outcome-specific transitions and semantic requests. Source-backed
   transitions use `source-formalization`; undefined product behavior uses
   `gap-route`, a blocking product question, and no actions. Events without
   routes remain unresolved. Mechanical IDs are not new normative rules.
7. **Connect check routes.** Link constraints to declared decision tables,
   compositions, transitions, context inputs or manual gaps. Component-owned
   execution goes through component contracts. The framework checks closure;
   it does not certify the meaning of editorial/product claims.
8. **Verify in distinct stages.** Validate structure and semantic closure;
   verify immutable source bytes and exact IDs; resolve example contexts;
   check mapping availability separately per target/platform. Review source
   interpretation with the owner. Product/live acceptance and release remain
   independent of local PASS.
9. **Hand off through General.** Supply draft schema/pattern hashes, source
   pins, positive/negative synthetic tests, gaps and selected requirements.
   Agree CompositionPlan and registry adapters with Generation / Code Connect.
   Promotion or new normative rules goes to Contract Creation and the DS ledger
   workflow; it is not accomplished by a schema validator.

Use `PATTERN_TEMPLATE.md` for the human discussion and
`template.synthetic.json` as a structurally valid example. Its source and
mapping IDs are fictional and must be replaced with pinned, verified inputs.
The machine document is authoritative for selections; the Markdown explains
scope and open decisions. Review both together to avoid two conflicting rules.

Schema compatibility is exact. The version string, framework/package version,
pattern revision and content hash are independent pins. Changes to the current
draft must be reviewed before a consumer relies on them; incompatible changes
require a new schema version and explicit migration tests.
