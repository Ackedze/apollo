# Apollo Agent Notes

## Figma Runtime Compatibility

- The Figma plugin main runtime parser can reject object spread syntax in `code.ts` / `dist/code.js`.
- Do not use object spread (`{ ...value }`) in the plugin main code path.
- Build request payloads and other objects with explicit assignments instead:

```ts
const payload = { component: 'apollo' };
payload.text = text;
```

- Array/function spread is allowed when already supported by the current bundle, but object spread in main code is not allowed.
- Before saying that Apollo is ready to reload in Figma, run `npm run validate`.

## Contribution Rules

- Changes to ComponentContract Editor or the shared component-contract core that
  affect contract reading must be recorded in the same task in
  `docs/ARCHITECTURE_BACKLOG.md`, under “Apollo: совместимость с ComponentContract Editor”.
  Reuse the relevant stable item; record the Editor/core version, consumer impact,
  implementation or verification required, status and acceptance criteria. Shared
  implementation and passing Editor tests do not imply Apollo integration/release
  acceptance. Link the corresponding Editor backlog item; do not copy private
  reports or catalogs into this repository. Owner instruction: 2026-10-01.

- Follow `CONTRIBUTING.md`, `docs/REVIEW_POLICY.md` and `docs/TESTING.md` for every external contribution.
- Keep one behavioral concern per pull request and add regression coverage for bug fixes.
- Rebuild Apollo after every change; before review, run the full `npm run validate` gate.
- Update Apollo README when behavior changes and the workspace README when publishing a changed process.
- Never add secrets, real user reports, private catalogs or release credentials to source, fixtures, logs or pull requests.
- Disclose AI-generated changes in the pull request and identify what was verified manually.

## Figma Rule Test Cases

- When preparing Figma test cases for component or pattern rules, label every individual PASS, FAIL, ALLOW, WARNING or UNKNOWN case with both:
  - the complete human-readable rule being tested;
  - the stable `RuleID` used by the executable package.
- Keep the rule text and `RuleID` visible in the test case itself, not only in external documentation or the section title.
- A test case is not ready for validation if its intended state cannot be mapped unambiguously to one executable or policy rule from the Figma canvas alone.

## Translating Slot Rules into Predicate Contours

Use this checklist when turning a human rule about slots, placeholders, swaps or nested content into an executable `slot-contract`. Its purpose is to prevent partial coverage such as checking `SwapMe` in some visible slots while omitting another governed slot.

1. Read the entire source section for the component, not only the first paragraph that mentions the rule. Collect every slot family governed by the same invariant, including platform-specific variants and explicit exceptions.
2. Separate the invariant from slot-specific eligibility:
   - a shared fact, such as “a visible `SwapMe` must be replaced”, belongs in one generic `slot-contract` with `slot.families`;
   - admissible final content, cardinality, interaction and platform policy stay in their own rules unless the source declares them identical.
3. Do not infer a closed slot list from an existing test case. Derive `slot.families` from the source document and component contract, then verify every family against the Figma structure and canonical family mapping.
4. Set `visibleOnly: true` only when the human rule explicitly applies to visible slots. Do not add requirements such as `minNestedComponents` unless the source requires component-instance content; direct text or another allowed non-instance must stay compliant.
5. In `rules.json`, link the executable rule to every relevant human `patternRuleId` / `patternRuleIds`. In `apollo/rule-crosswalk.json`, add matching `hubEvidence` entries with the exact headings and update the enforcement scope and review basis.
6. Add regression coverage at two levels:
   - release-loader test asserts the complete declared `slot.families` set;
   - predicate evaluation test proves FAIL for each governed slot with the forbidden placeholder, PASS for permitted final content, and NOT-APPLICABLE for a hidden slot when visibility is part of the rule.
7. Prepare Figma PASS/FAIL cases for each covered slot. Every case must visibly state the complete human rule and executable `RuleID`; include a case that would expose an omitted slot family.
8. After the field run, update the `Правила` and component registry rows: source links, crosswalk scope, Predicate status and date. Keep the component `Draft` until the PASS/FAIL evidence is reviewed.
