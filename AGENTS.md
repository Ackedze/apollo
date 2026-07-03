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
