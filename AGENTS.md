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

- Follow `CONTRIBUTING.md`, `docs/REVIEW_POLICY.md` and `docs/TESTING.md` for every external contribution.
- Keep one behavioral concern per pull request and add regression coverage for bug fixes.
- Rebuild Apollo after every change; before review, run the full `npm run validate` gate.
- Update Apollo README when behavior changes and the workspace README when publishing a changed process.
- Never add secrets, real user reports, private catalogs or release credentials to source, fixtures, logs or pull requests.
- Disclose AI-generated changes in the pull request and identify what was verified manually.
