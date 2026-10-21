---
name: apollo-figma-mcp-profile
version: "0.2.0"
---

# Apollo MCP generation only

The owner explicitly requested: «отключить проверки, только генерация, проверку сейчас не делаем».
Build the admitted ScreenSpec in its single owned root. Do not run design-system checking, RuleIR, whole-source/default-style audits, visual QA or automatic compliance-repair loops. Output is an unchecked Draft, Ready=false. The existing Design Check feature and built-in executor are separate.

Use only the configured apollo_figma_mcp tools/file. Check root owner/page and safe typed API operations; preserve outside nodes and exact accepted published keys. Load source fonts and preserve source Variable modes with the shipped recipe. Never edit source/library definitions or substitute guessed components, colors or fonts. Never delete roots, user content or other generated nodes. Stop and preserve partial work on unknown write outcome, ownership/freshness drift or timeout. No automatic deletion/rollback. Normal SLOT payload replacement is limited to a fresh owned instance, mapped native SLOT and a proven untouched default payload after replacement has been appended and verified; no other deletion.

## Fully loaded portable workflow

All files below are already delivered in this prompt by the proxy. Their names are virtual bundle names, not local filesystem dependencies. Reading these bodies is loading the corresponding skill/reference. Resolve their relative links within this bundle; the complete API declarations below are the inline equivalent of looking up the documented types. Do not request shell/file/other tools to re-read an installed SKILL.md. No user needs an installed skills directory or workspace. Component choices/API bindings come from the accepted host mapping; unrelated source-code/Code Connect discovery is outside this admitted task. The owner's generation-only instruction overrides workflow steps that request checking, audit, screenshot validation or acceptance; retain API correctness and protection against destructive writes.

Tag declared nodes with shared namespace apollomcp, key screenNodeId, and physical actions with apollomcp/actionId for traceability. Check apollomcp/owner before mutations.

Use skillNames="figma-use,figma-generate-design" as a string, with description and exact fileKey, on use_figma. Return actual created/mutated/removed IDs. Finish after construction; the plugin only captures root existence/ownership/preservation, not component or ScreenSpec conformance. Never claim DS compliance or Ready.


# Loaded workflow file: figma-use/SKILL.md
Source snapshot SHA256: ac385b80a05c850b5abc6bcae7c56625c4576318510545453a568aa5f21b8a95

---
name: figma-use
description: "**MANDATORY prerequisite** — you MUST invoke this skill BEFORE every `use_figma` tool call. NEVER call `use_figma` directly without loading this skill first. Skipping it causes common, hard-to-debug failures. Trigger whenever the user wants to perform a write action or a unique read action that requires JavaScript execution in the Figma file context — e.g. create/edit/delete nodes, set up variables or tokens, build components and variants, modify auto-layout or fills, bind variables to properties, or inspect file structure programmatically."
disable-model-invocation: false
---

# use_figma — Figma Plugin API Skill

Use the `use_figma` tool to execute JavaScript in Figma files via the Plugin API. All detailed reference docs live in `references/`.

**Always include `figma-use` in the comma-separated `skillNames` parameter when calling `use_figma`. If this skill was loaded via an MCP resource, you MUST prefix the name with `resource:` (e.g. `resource:figma-use`).** This is a logging parameter used to track skill usage — it does not affect execution.

**If Figma MCP tools appear as deferred tools, batch-load all their schemas in a single `ToolSearch` call** using the `select:` syntax — e.g. `ToolSearch query="select:use_figma,get_screenshot,get_metadata,create_new_file"`. One round trip beats six.

**If the task involves building or updating a full page, screen, or multi-section layout in Figma from code**, also load [figma-generate-design](../figma-generate-design/SKILL.md). It provides the workflow for discovering design system components via `search_design_system`, importing them, and assembling screens incrementally. Both skills work together: this one for the API rules, that one for the screen-building workflow.

**If the task involves creating or building a component in Figma** (even a single component), also load [figma-generate-library](../figma-generate-library/SKILL.md). It provides the component creation workflow — variable foundations, variant sets, design token bindings — that `figma-use` alone doesn't cover.

Before anything, load [plugin-api-standalone.index.md](references/plugin-api-standalone.index.md) to understand what is possible. When you are asked to write plugin API code, use this context to grep [plugin-api-standalone.d.ts](references/plugin-api-standalone.d.ts) for relevant types, methods, and properties. This is the definitive source of truth for the API surface. It is a large typings file, so do not load it all at once, grep for relevant sections as needed.

IMPORTANT: Whenever you work with design systems, start with [working-with-design-systems/wwds.md](references/working-with-design-systems/wwds.md) to understand the key concepts, processes, and guidelines for working with design systems in Figma. Then load the more specific references for components, variables, text styles, and effect styles as needed.

## 1. Critical Rules
1.  **Use `return` to send data back.** The return value is JSON-serialized automatically (objects, arrays, strings, numbers). Do NOT call `figma.closePlugin()` or wrap code in an async IIFE — this is handled for you.
2.  **Write plain JavaScript with top-level `await` and `return`.** Code is automatically wrapped in an async context. Do NOT wrap in `(async () => { ... })()`.
3.  `figma.notify()` **throws "not implemented"** — never use it
3a. **Return node IDs and keep workflow state outside the Figma file.** Set human-readable component purpose and usage in `node.description` only on a `COMPONENT` or `COMPONENT_SET` — never on a frame or instance.
3b. **Narrow before accessing type-specific properties.** Check `node.type`, use a capability guard such as `"characters" in node`, or prefilter with `findAllWithCriteria`. `characters` requires a text-capable node; optional chaining does not protect unsupported property access.
4.  `console.log()` is NOT returned — use `return` for output
5.  **Size construction calls for safe retry and validate from evidence.** Do not split a working operation solely to create validation checkpoints. Batch related work when the resulting script remains safe to retry; a complete section or page may be built in one call. Split when crossing page context, when partial execution would be difficult to recover, or after an actual failure requires a targeted retry. Return affected IDs and relevant counts, names, or bounds from each write—this counts as structural validation. Run a separate structural check only when required evidence is missing or after a relevant mutation. Normally take one screenshot after composition and one after a visual fix. The most recent passing screenshot is the final check; do not repeat it when nothing relevant changed. Stop once requirements pass.
6.  Colors are **0–1 range** (not 0–255): `{r: 1, g: 0, b: 0}` = red. Paint `color` objects use `{r, g, b}` **only — no `a` field**; opacity goes at the paint level (`{ type: 'SOLID', color: {...}, opacity: 0.5 }`).
7.  Fills/strokes are **read-only arrays** — clone, modify, reassign
8.  **Every text edit follows the canonical recipe: load font → `await` → mutate → return affected node IDs.** Skipping the load throws `Cannot write to node with unloaded font "<family> <style>"`. The rule covers more than `characters` — it applies to any operation on nodes with unloaded fonts (`appendChild`, `insertChild`, `setBoundVariable`, `setExplicitVariableModeForCollection`, `setValueForMode`, `findAll` callbacks touching text). When mutating existing text, load the node's *current* fonts via `getStyledTextSegments(['fontName'])`, not a hardcoded default. Inter is preloaded in most environments so other families surface this bug more often — the recipe is the same for every font. Use `await figma.listAvailableFontsAsync()` first if the style string is unverified — **never guess** (`"SemiBold"` vs `"Semi Bold"` is a common footgun). For `FONT_FAMILY`-scoped variables, load every value across every relevant mode before `setBoundVariable("fontFamily", …)`, `setValueForMode`, or `setExplicitVariableModeForCollection`. `lineHeight`/`letterSpacing` take `{unit, value}`, not bare numbers. See [Canonical text-edit recipe](references/gotchas.md#canonical-text-edit-recipe-font-load--await--mutate--return-ids).
9.  **Pages load incrementally** — use `await figma.setCurrentPageAsync(page)` to switch pages and load their content. The sync setter `figma.currentPage = page` does **NOT** work and throws `"Setting figma.currentPage is not supported"`. Page context resets to the **first page** at the start of every `use_figma` call, so re-switch each call; switch **at most once per call** and fan multi-page work out in parallel — see [Page Rules](#2-page-rules-critical) and [gotchas.md](references/gotchas.md#set-current-page-once-per-use_figma-call--split-multi-page-work-into-parallel-calls).
10. `setBoundVariableForPaint` returns a **NEW** paint — must capture and reassign
11. `createVariable` accepts collection **object or ID string** (object preferred)
12. **`layoutSizingHorizontal/Vertical` is value-restricted by structural context — `FIXED` always works, `HUG` and `FILL` do not.** `'HUG'` is valid only on an auto-layout frame itself OR on a **TEXT** child of one. `'FILL'` is valid only on a child of an auto-layout frame that is also not absolute-positioned, not inside an immutable frame, and not a canvas-grid child. Practical consequence: append to an auto-layout parent FIRST, then set `HUG`/`FILL` — a newly-created or unparented node can't satisfy the rule yet. The property itself exists on every `SceneNode`; the error is value-rejection, not "no such property". See [Gotchas](references/gotchas.md#layoutsizinghorizontallayoutsizingvertical-value-rules-fixed-hug-fill).
12a. **Use auto-layout for containers that hold related children.** When children have a structural relationship — stacked, side-by-side, aligned, gapped, hugged — wrap them in `figma.createAutoLayout()`, not `figma.createFrame()` with absolute `x`/`y`. Absolute coordinates govern where a container sits on the canvas; auto-layout governs how its children relate inside it. Skipping the container leaves no protection against text reflow, content changes, or overlap.
12b. **`layoutSizing*` and `*AxisSizingMode` are different enums — don't cross them.** `layoutSizingHorizontal`/`layoutSizingVertical` (set on a **child**) take `'FIXED'|'HUG'|'FILL'`; `primaryAxisSizingMode`/`counterAxisSizingMode` (set on the **frame** itself) take `'FIXED'|'AUTO'`. So `layoutSizingVertical = 'AUTO'` is invalid (use `'HUG'`), and `counterAxisSizingMode = 'FILL'` throws `Expected 'FIXED' | 'AUTO', received 'FILL'` (use `'FIXED'`/`'AUTO'`). Two more errors from the same setter — `Error: in set_layoutSizingHorizontal: node must be an auto-layout frame or a child of an auto-layout frame` and `Error: in set_layoutSizingHorizontal: FILL can only be set on children of auto-layout frames` — mean the node isn't in an auto-layout context yet; **recommendation: make the parent auto-layout (`figma.createAutoLayout()`) and `appendChild` the node before setting** (see Rule 12). See [Gotchas](references/gotchas.md#layoutsizing-vs-axissizingmode-two-different-sizing-enums).
12c. **`resize()` resets sizing modes to `FIXED`, so call it BEFORE setting `layoutSizing*`.** A wrapping **TEXT** block needs `textAutoResize = 'HEIGHT'` plus an explicit FIXED width (`resize()`), NOT `FILL` alone — the default `WIDTH_AND_HEIGHT` mode ignores `FILL` and collapses the node to a near-zero-width thread. Verify `node.width > 0` afterward.
13. **Position new top-level nodes away from (0,0).** Nodes appended directly to the page default to (0,0). Scan `figma.currentPage.children` to find a clear position (e.g., to the right of the rightmost node). This only applies to page-level nodes — nodes nested inside other frames or auto-layout containers are positioned by their parent. See [Gotchas](references/gotchas.md).
14. **On `use_figma` error, obey `safeToRetryWithoutCanvasRead`.** If `true`, fix the error and retry. If `false`, read the canvas, determine what changed, then make changes. See [Error Recovery](#7-error-recovery--self-correction).
15. **MUST `return` ALL created/mutated node IDs.** Whenever a script creates new nodes or mutates existing ones on the canvas, collect every affected node ID and return them in a structured object (e.g. `return { createdNodeIds: [...], mutatedNodeIds: [...] }`). This is essential for subsequent calls to reference, validate, or clean up those nodes. No state persists across `use_figma` calls, so pass IDs from previous calls as **string literals**, not variables. See [common-patterns.md](references/common-patterns.md) for worked multi-step examples.
16. **Always set `variable.scopes` explicitly when creating variables.** The default `ALL_SCOPES` pollutes every property picker — almost never what you want. Use specific scopes like `["FRAME_FILL", "SHAPE_FILL"]` for backgrounds, `["TEXT_FILL"]` for text colors, `["GAP"]` for spacing, etc. See [variable-patterns.md](references/variable-patterns.md) for the full list.
17. **`await` every Promise.** Never leave a Promise unawaited — unawaited async calls (e.g. `figma.loadFontAsync(...)` without `await`, or `figma.setCurrentPageAsync(page)` without `await`) will fire-and-forget, causing silent failures or race conditions. The script may return before the async operation completes, leading to missing data or half-applied changes.
18. **Never read `componentPropertyDefinitions` from a variant component.** Narrow the owner first: use the node itself when it is a `COMPONENT_SET`, use a `COMPONENT` only when its parent is not a `COMPONENT_SET`, and otherwise promote a variant `COMPONENT` to its parent set. Optional chaining does not make the getter safe. See [Component-property owner narrowing](references/component-patterns.md#component-property-owner-narrowing).
> For detailed WRONG/CORRECT examples of each rule, see [Gotchas & Common Mistakes](references/gotchas.md).

## 2. Page Rules (Critical)

The async-only setter and the per-call context reset are covered in Rule 9. This section elaborates the one rule that needs a worked example: **switch pages at most once per script, and fan multi-page work out in parallel.**

Never loop over `figma.root.children` and switch pages inside the loop — each switch reloads the file. If the work spans multiple pages, **split it into N `use_figma` calls (one per target page) and emit them in parallel** — a single assistant message containing N `use_figma` tool-use blocks. The harness runs them concurrently; each script sets `currentPage` exactly once.

> **Explicit instruction:** when fanning out, you MUST issue the N tool calls in **one message**. Do not send them across multiple turns. Do not await one before issuing the next. Sequential per-page calls waste the entire benefit of splitting.

```js
// AVOID — switches pages N times in one script, reloads the file each time
for (const page of figma.root.children) {
  await figma.setCurrentPageAsync(page);
  // ... touch this page ...
}

// PREFER — read-only discovery call to get page IDs, then in the NEXT message
// emit N parallel use_figma tool calls (one per page), each setting currentPage once.
```

Default to parallel fan-out for any multi-page work — reads and writes alike. You can also call `use_figma` multiple times to build incrementally (e.g. `return` metadata about existing nodes, then modify them in a subsequent script). See [gotchas.md → Set current page once per `use_figma` call](references/gotchas.md#set-current-page-once-per-use_figma-call--split-multi-page-work-into-parallel-calls) for the full rationale.

## 3. `return` Is Your Output Channel

The agent sees **ONLY** the value you `return` — `console.log()` is invisible (Rule 4), and thrown errors are auto-captured (let them propagate or `throw` explicitly). The hard requirement is Rule 15: every script that creates or mutates canvas nodes **MUST** return all affected node IDs plus any actionable status in a structured object — e.g. `return { createdNodeIds: [...], mutatedNodeIds: [...], count: 5, errors: [] }` — so subsequent calls can reference, validate, or clean them up.

## 4. Editor Mode

`use_figma` works in **design mode** (editorType `"figma"`, the default). FigJam (`"figjam"`) and Slides (`"slides"`) have different sets of available node types — most design nodes are blocked in FigJam, and FigJam-only nodes are blocked in Slides.

**Tell the editor from the URL:** Design = `figma.com/design/...`, FigJam = `figma.com/board/...`, Slides = `figma.com/slides/...`. Confirm before assuming an API is available.

Available in design mode: Rectangle, Frame, Component, Text, Ellipse, Star, Line, Vector, Polygon, BooleanOperation, Slice, Page, Section, TextPath.

**Blocked** in design mode: Sticky, Connector, ShapeWithText, CodeBlock, Slide, SlideRow, SlideGrid, InteractiveSlideElement, Webpage.

Available in Slides mode: Rectangle, Frame, Component, Text, Ellipse, Star, Line, Vector, Polygon, BooleanOperation, Slice, Section, TextPath, Slide, SlideRow, SlideGrid, InteractiveSlideElement.

**Blocked** in Slides mode: Sticky, Connector, ShapeWithText, CodeBlock, Webpage, Page.

**Design-only APIs (not just node types):** `figma.createPage()` is available only in Design files (`figma.com/design/...`). In both FigJam (`figma.com/board/...`) and Slides (`figma.com/slides/...`) it throws `TypeError: figma.createPage no such property 'createPage' on the figma global object`. Do not emit `figma.createPage()` in FigJam or Slides workflows.

> **Slides note:** There is no dedicated read tool for Slides files yet. Use `use_figma` with read-only scripts for inspection (see Section 6 "Inspect first" pattern), and `get_screenshot` / `await node.screenshot()` for visual context. For Slides-specific API guidance, load the [figma-use-slides](../figma-use-slides/SKILL.md) skill.

## 5. Efficient APIs — Prefer These Over Verbose Alternatives

These APIs reduce boilerplate, eliminate ordering errors, and compress token output. **Always prefer them over the verbose alternatives.**

### `node.query(selector)` — CSS-like node search

Find nodes within a subtree using CSS-like selectors. Replaces verbose `findAll` + filter loops.

```js
// BEFORE — verbose traversal
const texts = frame.findAll(n => n.type === 'TEXT' && n.name === 'Title')

// AFTER — one-liner with query
const texts = frame.query('TEXT[name=Title]')
```

**Selector syntax:**
- Type: `FRAME`, `TEXT`, `RECTANGLE`, `ELLIPSE`, `COMPONENT`, `INSTANCE`, `SECTION` (case-insensitive)
- Attribute exact: `[name=Card]`, `[visible=true]`, `[opacity=0.5]`
- Attribute substring: `[name*=art]` (contains), `[name^=Header]` (starts-with), `[name$=Nav]` (ends-with)
- Dot-path traversal: `[fills.0.type=SOLID]`, `[fills.*.type=SOLID]` (wildcard index)
- Instance matching: `[mainComponent=nodeId]`, `[mainComponent.name=Button]`
- Combinators: `FRAME > TEXT` (direct child), `FRAME TEXT` (any descendant), `A + B` (adjacent sibling), `A ~ B` (general sibling)
- Pseudo-classes: `:first-child`, `:last-child`, `:nth-child(2)`, `:not(TYPE)`, `:is(FRAME, RECTANGLE)`, `:where(TEXT, ELLIPSE)`
- Node ID: `#nodeId` or bare GUID
- Comma: `TEXT, RECTANGLE` (union)
- Wildcard: `*` (any type)

**QueryResult methods:**
| Method | Description |
|---|---|
| `.length` | Number of matched nodes |
| `.first()` | First matched node (or `null`) |
| `.last()` | Last matched node (or `null`) |
| `.toArray()` | Convert to regular array |
| `.each(fn)` | Iterate with callback, returns `this` for chaining |
| `.map(fn)` | Map to new array |
| `.filter(fn)` | Filter to new QueryResult |
| `.values(keys)` | Extract property values: `.values(['name', 'x', 'y'])` → `[{name, x, y}, ...]` |
| `.set(props)` | Set properties on all matched nodes (see `node.set()` below) |
| `.query(selector)` | Sub-query within matched nodes |
| `for...of` | Iterable — works in `for` loops |

**Scope:** `node.query()` searches within that node's subtree. To search the whole page: `figma.currentPage.query('...')`. There is no global `figma.query()`.

**Examples:**
```js
// Recolor all text inside cards
figma.currentPage.query('FRAME[name^=Card] TEXT').set({
  fills: [{type: 'SOLID', color: {r: 0.2, g: 0.2, b: 0.8}}]
})

// Get names and positions of all frames
return figma.currentPage.query('FRAME').values(['name', 'x', 'y'])

// Find the first component named "Button"
const btn = figma.currentPage.query('COMPONENT[name=Button]').first()

// Find all instances of a specific component
figma.currentPage.query(`INSTANCE[mainComponent=${compId}]`)

// Find nodes with solid fills using dot-path traversal
figma.currentPage.query('[fills.0.type=SOLID]')
```

### `node.set(props)` — batch property updates

Set multiple properties in one call. Returns `this` for chaining.

```js
// BEFORE — one line per property
frame.opacity = 0.5
frame.cornerRadius = 8
frame.name = "Card"

// AFTER — single call
frame.set({ opacity: 0.5, cornerRadius: 8, name: "Card" })
```

**Priority key ordering:** `layoutMode` is always applied before other properties (like `width`/`height`) regardless of object key order. This prevents the common bug where `resize()` behaves differently depending on whether `layoutMode` is set.

**Width/height handling:** `width` and `height` are routed through `node.resize()` automatically — setting `{ width: 200 }` calls `resize(200, currentHeight)`.

**Chaining with query:**
```js
// Find all rectangles named "Divider" and update them
figma.currentPage.query('RECTANGLE[name=Divider]').set({
  fills: [{type: 'SOLID', color: {r: 0.9, g: 0.9, b: 0.9}}],
  cornerRadius: 2
})
```

### `figma.createAutoLayout(direction?, props?)` — auto-layout frames

Creates a frame with auto-layout already enabled and both axes hugging content. **This is the default container whenever children have a structural relationship to each other (see Rule 12a).**

```js
// BEFORE — manual setup, easy to get ordering wrong
const frame = figma.createFrame()
frame.layoutMode = 'VERTICAL'
frame.primaryAxisSizingMode = 'AUTO'
frame.counterAxisSizingMode = 'AUTO'
frame.layoutSizingHorizontal = 'HUG'
frame.layoutSizingVertical = 'HUG'

// AFTER — one call, layout ready
const frame = figma.createAutoLayout('VERTICAL')
```

Children can immediately use `layoutSizingHorizontal/Vertical = 'FILL'` after being appended — no need to set sizing modes manually.

Accepts an optional props object as the first or second argument:
```js
figma.createAutoLayout({ name: 'Card', itemSpacing: 12 })               // HORIZONTAL + props
figma.createAutoLayout('VERTICAL', { name: 'Column', itemSpacing: 8 })  // VERTICAL + props
```

### `node.placeholder` — shimmer overlay for AI-in-progress feedback

Sets a visual shimmer overlay on a node indicating work is in progress. **Always remove the shimmer when done** — leftover shimmers confuse users and indicate incomplete work.

```js
// Mark as in-progress
frame.placeholder = true

// ... build out the content ...

// MUST remove when done — never leave shimmers on finished nodes
frame.placeholder = false
```

When building complex layouts, set `placeholder = true` on sections before populating them, then set `placeholder = false` on each section as it's completed.

### `await node.screenshot(opts?)` — inline screenshots

Capture a node as a PNG and return it inline in the response. Eliminates the need for a separate `get_screenshot` call.

```js
// Take a screenshot of a frame (returned inline in the tool response)
await frame.screenshot()

// Custom scale (default auto-scales: 0.5x or capped so max dimension ≤ 1024px)
await frame.screenshot({ scale: 2 })

// Include overlapping content from sibling nodes
await frame.screenshot({ contentsOnly: false })
```

**When to use:** Follow Rule 5. Take a composition screenshot when visual evidence is needed. If a visual fix follows, take one post-fix screenshot; that passing screenshot is final. Do not take an additional unchanged “final” screenshot.

**Auto-naming:** The image caption includes node metadata — `"Card (300x150 at 0,60).png"` — giving spatial context without parsing the image.

**Default scaling:** Uses 0.5x scale, but automatically caps so the largest output dimension never exceeds 1024px. Explicit `{ scale: N }` bypasses the cap.

## 6. Incremental Workflow (How to Avoid Bugs)

The most common causes of waste are unnecessary fragmentation, redundant validation, and scripts that cannot be retried safely. **Use Rule 5's safe-retry and evidence-based validation contract.**

### Key rules

- **Choose call boundaries for recoverability, not validation cadence.** Batch related creation, property updates, parenting, and targeted diagnostics when safe. A complete page may be one call; do not split it into header/content/footer calls merely to validate each section. **Slides override:** in Slides files, slides are isolated subtrees — the relevant limit is complexity per slide, not total nodes across slides. Building 3–5 new slides in one call is safe, and so is applying the same edit (e.g. adding a footer, recoloring a heading) across every slide in the deck in a single call. See [figma-use-slides](../figma-use-slides/SKILL.md) for the deck-building workflow.
- **Build top-down, starting with placeholders.** Create the outer structure first with `placeholder = true` on each section, then incrementally replace placeholders with real content in subsequent calls.

### The pattern

1. **Inspect first.** Before creating anything, run a read-only `use_figma` to discover what already exists in the file — pages, components, variables, naming conventions. Match what's there.
2. **Build the skeleton.** Create the top-level structure with placeholder sections. Set `placeholder = true` on each section so the user sees progress.
3. **Fill in content in retry-safe batches.** Multiple related sections may be populated together when the operation remains safe to retry. Set each section's `placeholder = false` when done.
4. **Return IDs from every call** (Rule 15) — you'll need created node/variable/collection IDs as inputs to subsequent calls.
5. **Return validation evidence from writes.** Return IDs and the relevant counts, names, hierarchy, or bounds. Add a separate audit only for missing evidence or after a mutation invalidates earlier evidence. Follow Rule 5 for visual checks.
6. **Fix before moving on.** If validation reveals a problem, fix it before proceeding to the next step. Don't build on a broken foundation.

### Suggested step order for complex tasks

```
Step 1: Inspect file — discover existing pages, components, variables, conventions
Step 2: Create tokens/variables (if needed)
       → return collection, variable, and mode counts
Step 3: Create individual components
       → return component IDs and relevant child/variant counts
Step 4: Compose layouts from component instances
       → return layout IDs/bounds + take a composition screenshot
Step 5: Apply a targeted visual fix only if needed
       → take one post-fix screenshot; this is final
Step 6: Stop if nothing relevant changed
```

### What to validate at each step

| After... | Check with `get_metadata` | Check with `get_screenshot` |
|---|---|---|
| Creating variables | Collection count, variable count, mode names | — |
| Creating components | Child count, variant names, property definitions | Variants visible, not collapsed, grid readable |
| Binding variables | Node properties reflect bindings | Colors/tokens resolved correctly |
| Composing layouts | Instance nodes have mainComponent, hierarchy correct | No cropped/clipped text, no overlapping elements, correct spacing |

## 7. Error Recovery & Self-Correction

On any `use_figma` error, obey `safeToRetryWithoutCanvasRead` (Rule 14): `true` → correct the identified error and retry without adding a diagnostic canvas read; `false` → read the canvas, determine what changed, then make changes. If the same API or property error occurs twice, inspect its definition once and fix the root cause before retrying; do not continue decomposing the operation around the same invalid mutation. Errors whose fix is already a Critical Rule are diagnosed there — `"not implemented"` (`figma.notify`, Rule 3), the `layoutSizing*` HUG/FILL rejections (Rules 12, 12b), `"Setting figma.currentPage is not supported"` (Rule 9), `componentPropertyDefinitions` on a variant (Rule 18), and `characters`/`description` on the wrong node type (Rules 3a, 3b). The rows below cover failures the contract doesn't name:

| Error message | Likely cause | How to fix |
|---|---|---|
| Property value out of range | Color channel > 1 (used 0–255 instead of 0–1) | Divide by 255 |
| `"Cannot read properties of null"` | Node doesn't exist (wrong ID, wrong page) | Check page context, verify ID |
| Script hangs / no response | Infinite loop or unresolved promise | Check for `while(true)` or missing `await`; ensure code terminates |
| `"The node with id X does not exist"` | Parent instance was implicitly detached by a child `detachInstance()`, changing IDs | Re-discover nodes by traversal from a stable (non-instance) parent frame |

### When the script succeeds but the result looks wrong

Call `get_metadata` for structural correctness (hierarchy, counts, positions) and `get_screenshot` for visual correctness — look closely for cropped/clipped text (line heights cutting off content) and overlapping elements, which are common and easy to miss. Identify whether the discrepancy is structural or visual, then write a **targeted** fix script that modifies only the broken parts — don't recreate everything.

> For the full validation workflow, see [Validation & Error Recovery](references/validation-and-recovery.md).

## 8. Pre-Flight Checklist
Before submitting ANY `use_figma` call, re-read the script against the operating contract in [Section 1](#1-critical-rules). Every gate that used to be enumerated here now lives there — a script that violates any of these is not ready to submit:

- [ ] **Output** — uses `return` (not `figma.closePlugin()`), not wrapped in an async IIFE, no `console.log()` as output; `return`s structured data with ALL created/mutated node IDs (Rules 1, 2, 4, 15)
- [ ] **Color & fills** — 0–1 range; paint `color` is `{r, g, b}` only (no `a`); fills/strokes reassigned as new arrays (Rules 6, 7)
- [ ] **Type narrowing** — `characters`, `description`, and `componentPropertyDefinitions` guarded/narrowed before access (Rules 3a, 3b, 18)
- [ ] **Pages** — switches use `await figma.setCurrentPageAsync(page)`, at most once per call (Rule 9)
- [ ] **Layout & sizing** — related children in `figma.createAutoLayout()`; top-level nodes positioned away from (0,0); `HUG`/`FILL` set after `appendChild`; `resize()` before sizing modes; wrapping TEXT uses `textAutoResize='HEIGHT'` + FIXED width (Rules 12, 12a, 12b, 12c, 13)
- [ ] **Text** — canonical font recipe with style names verified via `listAvailableFontsAsync()`; `lineHeight`/`letterSpacing` as `{unit, value}`; `FONT_FAMILY` variables load every mode's value first (Rule 8)
- [ ] **Async & state** — every Promise `await`ed; multi-step IDs passed as string literals (Rules 15, 17)

## 9. Discover Conventions Before Creating

**Always inspect the Figma file before creating anything.** Different files use different naming conventions, variable structures, and component patterns. Your code should match what's already there, not impose new conventions.

When in doubt about any convention (naming, scoping, structure), check the Figma file first, then the user's codebase. Only fall back to common patterns when neither exists.

### Quick inspection scripts

**List all pages and top-level nodes:**
```js
const pages = figma.root.children.map(p => `${p.name} id=${p.id} children=${p.children.length}`);
return pages.join('\n');
```

**List existing components across all pages:**

`search_design_system` is an option for published components. For on-canvas components, use the two-step fan-out — **don't loop pages inside one script.**

Step 1: one read-only `use_figma` to get page IDs:
```js
return figma.root.children.map(p => ({ id: p.id, name: p.name }));
```

Step 2: in the **next assistant turn, emit one `use_figma` per page in parallel** (a single message containing N tool-use blocks). Each runs:
```js
const page = await figma.getNodeByIdAsync(PAGE_ID);
await figma.setCurrentPageAsync(page);
// findAllWithCriteria uses an indexed type lookup — hundreds of times faster
// than the findAll(n => n.type === '…') side-effect-in-predicate antipattern.
const matches = page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
return matches.map(n => ({ page: page.name, name: n.name, type: n.type, id: n.id }));
```

**List existing variable collections and their conventions:**
```js
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const results = collections.map(c => ({
  name: c.name, id: c.id,
  varCount: c.variableIds.length,
  modes: c.modes.map(m => m.name)
}));
return results;
```

## 10. Reference Docs

Load these as needed based on what your task involves:

| Doc | When to load | What it covers |
|-----|-------------|----------------|
| [gotchas.md](references/gotchas.md) | Before any `use_figma` | Every known pitfall with WRONG/CORRECT code examples — start with the [canonical text-edit recipe](references/gotchas.md#canonical-text-edit-recipe-font-load--await--mutate--return-ids) |
| [common-patterns.md](references/common-patterns.md) | Need working code examples | Script scaffolds: shapes, text, auto-layout, variables, components, multi-step workflows |
| [plugin-api-patterns.md](references/plugin-api-patterns.md) | Creating/editing nodes | Fills, strokes, Auto Layout, effects, grouping, cloning, styles |
| [api-reference.md](references/api-reference.md) | Need exact API surface | Node creation, variables API, core properties, what works and what doesn't |
| [validation-and-recovery.md](references/validation-and-recovery.md) | Multi-step writes or error recovery | `get_metadata` vs `get_screenshot` workflow, mandatory error recovery steps |
| [component-patterns.md](references/component-patterns.md) | Creating components/variants | combineAsVariants, component properties, INSTANCE_SWAP, variant layout, discovering existing components, metadata traversal |
| [variable-patterns.md](references/variable-patterns.md) | Creating/binding variables | Collections, modes, scopes, aliasing, binding patterns, discovering existing variables |
| [text-style-patterns.md](references/text-style-patterns.md) | Creating/applying text styles | Type ramps, font discovery via `listAvailableFontsAsync`, listing styles, applying styles to nodes |
| [effect-style-patterns.md](references/effect-style-patterns.md) | Creating/applying effect styles | Drop shadows, listing styles, applying styles to nodes |
| [plugin-api-standalone.index.md](references/plugin-api-standalone.index.md) | Need to understand the full API surface | Index of all types, methods, and properties in the Plugin API |
| [plugin-api-standalone.d.ts](references/plugin-api-standalone.d.ts) | Need exact type signatures | Full typings file — grep for specific symbols, don't load all at once |

## 11. Snippet examples

You will see snippets throughout documentation here. These snippets contain useful plugin API code that can be repurposed. Use them as is, or as starter code as you go. If there are key concepts that are best documented as generic snippets, call them out and write to disk so you can reuse in the future.


# Loaded workflow file: figma-use/references/plugin-api-standalone.index.md
Source snapshot SHA256: 8dda6b014891d16fa99b41baf3d9e5c223116d3753d678ab63494d1ffcbac882

# Plugin API Index

> Full typings: `plugin-api-standalone.d.ts` (10,191 lines)
> Grep by symbol name to jump to definition. All `L#` line numbers refer to that file.
> This index describes the APIs available through `use_figma`. See the `.d.ts` for full type declarations.

---

## figma.\* — PluginAPI (L4)

### Identity & State

| Member                          | Type                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apiVersion`                    | `'1.0.0'`                                                                                                                                        |
| `editorType`                    | `'figma' \| 'figjam' \| 'dev' \| 'slides' \| 'buzz'`                                                                                             |
| `fileKey`                       | `string \| undefined`                                                                                                                            |
| `root`                          | `DocumentNode`                                                                                                                                   |
| `currentPage`                   | `PageNode` — **read-only**; sync setter `figma.currentPage = page` does NOT work and throws; use `await figma.setCurrentPageAsync(page)` instead |
| `mixed`                         | `unique symbol` — sentinel for mixed values in selection                                                                                         |
| `skipInvisibleInstanceChildren` | `boolean`                                                                                                                                        |

### Navigation & Lookup

| Method                      | Returns                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `setCurrentPageAsync(page)` | `Promise<void>` — **MUST use this**; sync setter `figma.currentPage = page` does NOT work |
| `getNodeByIdAsync(id)`      | `Promise<BaseNode \| null>`                                                               |
| `getStyleByIdAsync(id)`     | `Promise<BaseStyle \| null>`                                                              |

### Create Nodes

| Method                              | Returns                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `createFrame()`                     | `FrameNode`                                                                                                                                    |
| `createAutoLayout(direction?)`      | `FrameNode`                                                                                                                                    |
| `createComponent()`                 | `ComponentNode`                                                                                                                                |
| `createComponentFromNode(node)`     | `ComponentNode`                                                                                                                                |
| `createRectangle()`                 | `RectangleNode`                                                                                                                                |
| `createEllipse()`                   | `EllipseNode`                                                                                                                                  |
| `createLine()`                      | `LineNode`                                                                                                                                     |
| `createPolygon()`                   | `PolygonNode`                                                                                                                                  |
| `createStar()`                      | `StarNode`                                                                                                                                     |
| `createVector()`                    | `VectorNode`                                                                                                                                   |
| `createText()`                      | `TextNode`                                                                                                                                     |
| `createSection()`                   | `SectionNode`                                                                                                                                  |
| `createPage()`                      | `PageNode` — **Design files only** (`figma.com/design/...`); throws in both FigJam (`figma.com/board/...`) and Slides (`figma.com/slides/...`) |
| `createSlice()`                     | `SliceNode`                                                                                                                                    |
| `createTable(rows?, cols?)`         | `TableNode`                                                                                                                                    |
| `createImage(data: Uint8Array)`     | `Image`                                                                                                                                        |
| `createNodeFromSvg(svg)`            | `FrameNode`                                                                                                                                    |
| `importComponentByKeyAsync(key)`    | `Promise<ComponentNode>`                                                                                                                       |
| `importComponentSetByKeyAsync(key)` | `Promise<ComponentSetNode>`                                                                                                                    |
| `importStyleByKeyAsync(key)`        | `Promise<BaseStyle>`                                                                                                                           |

### Styles (Local)

| Method                        | Returns                  |
| ----------------------------- | ------------------------ |
| `createPaintStyle()`          | `PaintStyle`             |
| `createTextStyle()`           | `TextStyle`              |
| `createEffectStyle()`         | `EffectStyle`            |
| `createGridStyle()`           | `GridStyle`              |
| `getLocalPaintStylesAsync()`  | `Promise<PaintStyle[]>`  |
| `getLocalTextStylesAsync()`   | `Promise<TextStyle[]>`   |
| `getLocalEffectStylesAsync()` | `Promise<EffectStyle[]>` |
| `getLocalGridStylesAsync()`   | `Promise<GridStyle[]>`   |

### Fonts

| Method                      | Notes                              |
| --------------------------- | ---------------------------------- |
| `loadFontAsync(fontName)`   | **MUST call before any text edit** |
| `listAvailableFontsAsync()` | `Promise<Font[]>`                  |
| `hasMissingFont`            | `boolean`                          |

### Plugin Lifecycle

| Method                  | Notes                                                  |
| ----------------------- | ------------------------------------------------------ |
| `closePlugin(message?)` | Auto-called; use `return` instead to pass results back |

> Undo, notifications, external URLs, version-history saves, and `closePluginWithFailure` are not available through `use_figma`.

### Sub-APIs (properties on figma)

| Property            | Interface        | L#    |
| ------------------- | ---------------- | ----- |
| `figma.variables`   | `VariablesAPI`   | L1093 |
| `figma.motion`      | `MotionAPI`      | L1333 |
| `figma.util`        | `UtilAPI`        | L1371 |
| `figma.viewport`    | `ViewportAPI`    | L1495 |
| `figma.parameters`  | `ParametersAPI`  | L1613 |
| `figma.teamLibrary` | `TeamLibraryAPI` | L1289 |
| `figma.annotations` | `AnnotationsAPI` | L1223 |

> UI, client storage, codegen, payments, text review, timers, Buzz, and constants are not available through `use_figma`.

---

## VariablesAPI — figma.variables (L1093)

```
getVariableByIdAsync(id)                 Promise<Variable | null>    ← preferred; sync deprecated
getVariableCollectionByIdAsync(id)       Promise<VariableCollection | null>    ← preferred; sync deprecated
getLocalVariablesAsync(type?)            Promise<Variable[]>         ← preferred; filter by VariableResolvedDataType; sync deprecated
getLocalVariableCollectionsAsync()       Promise<VariableCollection[]>    ← preferred; sync deprecated
createVariable(name, collection, type)   Variable
createVariableCollection(name)           VariableCollection
createVariableAlias(variable)            VariableAlias
importVariableByKeyAsync(key)            Promise<Variable>
setBoundVariableForPaint(paint, field, variable)    → returns NEW paint — reassign
setBoundVariableForEffect(effect, field, variable)  → returns NEW effect — reassign
setBoundVariableForLayoutGrid(grid, field, variable)
```

**Variable (L9130):** `name`, `resolvedType`, `codeSyntax`, `scopes`, `hiddenFromPublishing`, `valuesByMode`, `variableCollectionId`

- `setVariableCodeSyntax(platform, value)` — platform: `'WEB' | 'ANDROID' | 'iOS'`
- `setValueForMode(collectionId, modeId, value)`
- `remove()`

**VariableCollection (L9344):** `name`, `modes`, `variableIds`, `defaultModeId`, `hiddenFromPublishing`

- `addMode(name)` → `modeId`; `removeMode(modeId)`; `renameMode(modeId, name)`

---

## Node Types

### Concrete Scene Nodes

| Node                   | L#    | Key characteristics                                |
| ---------------------- | ----- | -------------------------------------------------- |
| `DocumentNode`         | L7942 | Root; `children: PageNode[]`                       |
| `PageNode`             | L8089 | `children`, local styles, `backgrounds`            |
| `FrameNode`            | L8223 | `DefaultFrameMixin` — auto-layout, clips, children |
| `GroupNode`            | L8233 | Children only, no auto-layout                      |
| `ComponentNode`        | L8597 | Like Frame + publishable                           |
| `ComponentSetNode`     | L8580 | Variant set container                              |
| `InstanceNode`         | L8632 | Like Frame; `mainComponent`, `detach()`            |
| `RectangleNode`        | L8290 | `DefaultShapeMixin` + corners                      |
| `EllipseNode`          | L8320 | + `arcData`                                        |
| `LineNode`             | L8309 |                                                    |
| `PolygonNode`          | L8341 |                                                    |
| `StarNode`             | L8362 |                                                    |
| `VectorNode`           | L8389 | Vector paths                                       |
| `TextNode`             | L8407 | Rich text, fonts, segments                         |
| `TextPathNode`         | L8479 | Text along path                                    |
| `BooleanOperationNode` | L8725 | `booleanOperation` property                        |
| `SliceNode`            | L8280 | Export only                                        |
| `SectionNode`          | L9621 | Grouping + fills                                   |
| `TableNode`            | L8786 | `TableCellNode` children                           |

**FigJam only:** `StickyNode` L8746, `ConnectorNode` L9047, `ShapeWithTextNode` L8928, `StampNode` L8772, `CodeBlockNode` L9006, `EmbedNode` L9528, `LinkUnfurlNode` L9568, `MediaNode` L9588

**Slides only:** `SlideNode` L9664, `SlideRowNode` L9694, `SlideGridNode` L9707

**Union types:**

```
type SceneNode  (L9795) = FrameNode | GroupNode | SliceNode | RectangleNode | LineNode
  | EllipseNode | PolygonNode | StarNode | VectorNode | TextNode | ComponentSetNode
  | ComponentNode | InstanceNode | BooleanOperationNode | SectionNode | ...
type BaseNode   (L9791) = DocumentNode | PageNode | SceneNode
```

---

## Mixin Interfaces

| Mixin                        | L#    | Provides                                                                                        |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `BaseNodeMixin`              | L3944 | `id`, `name`, `type`, `parent`, `remove()`, plugin data                                         |
| `SceneNodeMixin`             | L4092 | `visible`, `locked`, `opacity`, variable bindings                                               |
| `ChildrenMixin`              | L4461 | `children`, `appendChild()`, `insertChild()`, `findAll()`, `findOne()`, `findAllWithCriteria()` |
| `LayoutMixin`                | L4826 | `x`, `y`, `width`, `height`, `rotation`, `resize()`, `rescale()`                                |
| `AutoLayoutMixin`            | L5106 | `layoutMode`, axis alignment, padding, `itemSpacing`, `layoutSizingHorizontal/Vertical`         |
| `AutoLayoutChildrenMixin`    | L5926 | `layoutAlign`, `layoutGrow`, sizing — **set AFTER `appendChild()`**                             |
| `GridLayoutMixin`            | L5668 | CSS Grid tracks, gap, template                                                                  |
| `GridChildrenMixin`          | L5989 | grid child positioning                                                                          |
| `GeometryMixin`              | L6348 | `fills`, `strokes`, `strokeWeight`, `strokeAlign`                                               |
| `MinimalFillsMixin`          | L6192 | `fills` only                                                                                    |
| `MinimalStrokesMixin`        | L6110 | `strokes`, `strokeWeight`                                                                       |
| `BlendMixin`                 | L5022 | `opacity`, `blendMode`, `isMask`, `effects`                                                     |
| `CornerMixin`                | L6400 | `cornerRadius`, `cornerSmoothing`                                                               |
| `RectangleCornerMixin`       | L6423 | Per-corner radii                                                                                |
| `ExportMixin`                | L6444 | `exportSettings`, `exportAsync()`                                                               |
| `ReactionMixin`              | L6593 | `reactions` (prototyping)                                                                       |
| `PublishableMixin`           | L6764 | `description`, `key`, `getPublishStatusAsync()`                                                 |
| `ComponentPropertiesMixin`   | L7065 | `componentProperties`, `addComponentProperty()`                                                 |
| `PluginDataMixin`            | L4035 | `getSharedPluginData()`, `setSharedPluginData()`, `getSharedPluginDataKeys()`                   |
| `FramePrototypingMixin`      | L6540 | `overflowDirection`, `numberOfFixedChildren`                                                    |
| `BaseFrameMixin`             | L6830 | ChildrenMixin + LayoutMixin + AutoLayoutMixin + GeometryMixin + …                               |
| `DefaultFrameMixin`          | L6887 | BaseFrameMixin + FramePrototypingMixin + ReactionMixin                                          |
| `DefaultShapeMixin`          | L6818 | BlendMixin + GeometryMixin + LayoutMixin + ExportMixin + ReactionMixin                          |
| `ExplicitVariableModesMixin` | L8066 | `setExplicitVariableModeForCollection()`                                                        |

---

## Paint & Fill (L2693)

| Type            | L#    | Notes                                                                             |
| --------------- | ----- | --------------------------------------------------------------------------------- |
| `SolidPaint`    | L2490 | `type:'SOLID'`, `color: RGB`, `opacity`, `visible`, `blendMode`                   |
| `GradientPaint` | L2545 | `type: 'GRADIENT_LINEAR\|RADIAL\|ANGULAR\|DIAMOND'`, `gradientStops: ColorStop[]` |
| `ImagePaint`    | L2565 | `type:'IMAGE'`, `imageHash`, `scaleMode`                                          |
| `VideoPaint`    | L2601 | `type:'VIDEO'`                                                                    |
| `PatternPaint`  | L2637 | `type:'PATTERN'`                                                                  |
| `type Paint`    | L2693 | Union of all five                                                                 |
| `ColorStop`     | L2459 | `{ position: number, color: RGBA }`                                               |
| `ImageFilters`  | L2478 | exposure, contrast, saturation, etc.                                              |

> **CRITICAL**: Fills/strokes are **read-only arrays** — clone, modify, reassign.

---

## Effects (L2115)

| Type                               | L#    |
| ---------------------------------- | ----- |
| `DropShadowEffect`                 | L2115 |
| `InnerShadowEffect`                | L2158 |
| `BlurEffect` (Normal/Progressive)  | L2250 |
| `NoiseEffect` (Mono/Duo/Multitone) | L2331 |
| `TextureEffect`                    | L2335 |
| `GlassEffect`                      | L2371 |
| `type Effect`                      | L2437 |

---

## Typography

| Type                | L#    | Notes                                                                                  |
| ------------------- | ----- | -------------------------------------------------------------------------------------- |
| `FontName`          | L1802 | `{ family: string, style: string }`                                                    |
| `TextNode`          | L8407 | `characters`, `textAlignHorizontal`, `fontSize`, `fontName`, `getStyledTextSegments()` |
| `StyledTextSegment` | L3207 | Per-range text properties                                                              |
| `LetterSpacing`     | L3147 | `{ value, unit: 'PIXELS'\|'PERCENT' }`                                                 |
| `LineHeight`        | L3151 | `{ value, unit } \| { unit: 'AUTO' }`                                                  |
| `TextCase`          | L1850 | `'ORIGINAL'\|'UPPER'\|'LOWER'\|'TITLE'\|'SMALL_CAPS'`                                  |
| `TextDecoration`    | L1851 | `'NONE'\|'UNDERLINE'\|'STRIKETHROUGH'`                                                 |
| `OpenTypeFeature`   | L1877 | Ligatures, numerals, etc.                                                              |

---

## Variables & Bindings

| Type                          | L#    | Notes                                                                         |
| ----------------------------- | ----- | ----------------------------------------------------------------------------- |
| `Variable`                    | L9130 | Core variable object                                                          |
| `VariableCollection`          | L9344 | Collection of variables + modes                                               |
| `VariableAlias`               | L9098 | Reference to another variable                                                 |
| `VariableValue`               | L9102 | `boolean \| string \| number \| RGB \| RGBA \| MotionEasing \| VariableAlias` |
| `VariableResolvedDataType`    | L9097 | `'BOOLEAN' \| 'COLOR' \| 'FLOAT' \| 'STRING' \| 'TIMING' \| 'EASING'`         |
| `VariableDataType`            | L3348 | Includes `'VARIABLE_ALIAS' \| 'EXPRESSION'`                                   |
| `VariableScope`               | L9103 | Where variable can be applied                                                 |
| `CodeSyntaxPlatform`          | L9129 | `'WEB' \| 'ANDROID' \| 'iOS'`                                                 |
| `VariableBindableNodeField`   | L4399 | Node fields that accept variable binding                                      |
| `VariableBindableTextField`   | L4427 | Text-specific bindable fields                                                 |
| `VariableBindablePaintField`  | L4436 | `'color'`                                                                     |
| `VariableBindableEffectField` | L4439 | `'color'\|'radius'\|'spread'\|'offsetX'\|'offsetY'`                           |

---

## Styles

| Interface        | L#     | Notes                                                  |
| ---------------- | ------ | ------------------------------------------------------ |
| `BaseStyleMixin` | L9856  | `name`, `id`, `key`, `type`, `description`, `remove()` |
| `PaintStyle`     | L9876  | `type:'PAINT'`, `paints: Paint[]`                      |
| `TextStyle`      | L9892  | `type:'TEXT'`, font properties                         |
| `EffectStyle`    | L9965  | `type:'EFFECT'`, `effects: Effect[]`                   |
| `GridStyle`      | L9981  | `type:'GRID'`, `layoutGrids`                           |
| `type BaseStyle` | L9997 | Union of all four                                      |
| `type StyleType` | L9834  | `'PAINT' \| 'TEXT' \| 'EFFECT' \| 'GRID'`              |

---

## Primitives & Geometry

| Type             | L#    | Shape                                         |
| ---------------- | ----- | --------------------------------------------- |
| `Vector`         | L1751 | `{ x: number, y: number }`                    |
| `Rect`           | L1755 | `{ x, y, width, height }`                     |
| `RGB`            | L1764 | `{ r, g, b }` — **0–1 range, not 0–255**      |
| `RGBA`           | L1772 | `{ r, g, b, a }` — **0–1 range**              |
| `Transform`      | L1750 | `[[a,b,tx],[c,d,ty]]` 2×3 affine matrix       |
| `ArcData`        | L2107 | `{ startingAngle, endingAngle, innerRadius }` |
| `Constraints`    | L2452 | `{ horizontal, vertical }: ConstraintType`    |
| `ConstraintType` | L2448 | `'MIN'\|'CENTER'\|'MAX'\|'STRETCH'\|'SCALE'`  |
| `VectorPath`     | L3113 | `{ windingRule, data: string }`               |
| `VectorNetwork`  | L3096 | vertices + segments + regions                 |
| `Guide`          | L2803 | `{ axis, offset }`                            |

---

## Prototyping

| Type                  | L#    | Notes                                                     |
| --------------------- | ----- | --------------------------------------------------------- |
| `Reaction`            | L3344 | trigger + action pair                                     |
| `Trigger`             | L3456 | what initiates the reaction                               |
| `Action`              | L3383 | what happens                                              |
| `Transition`          | L3455 | `SimpleTransition \| DirectionalTransition`               |
| `Easing`              | L3492 | easing curve definition                                   |
| `Navigation`          | L3488 | `'NAVIGATE'\|'SWAP'\|'OVERLAY'\|'SCROLL_TO'\|'CHANGE_TO'` |
| `OverflowDirection`   | L3869 | `'NONE'\|'HORIZONTAL'\|'VERTICAL'\|'BOTH'`                |
| `OverlayPositionType` | L3873 | overlay placement                                         |

---

## Export

| Type                        | L#    | Notes                                         |
| --------------------------- | ----- | --------------------------------------------- |
| `ExportSettingsImage`       | L2882 | PNG/JPG/WEBP/BMP                              |
| `ExportSettingsSVG`         | L2955 |                                               |
| `ExportSettingsPDF`         | L2974 |                                               |
| `ExportSettingsREST`        | L2988 |                                               |
| `ExportSettingsConstraints` | L2875 | `{ type: 'SCALE'\|'WIDTH'\|'HEIGHT', value }` |

---

## Key Sub-API Surfaces

**ViewportAPI (L1495):** `center: Vector`, `zoom: number`, `scrollAndZoomIntoView(nodes)`, `bounds: Rect`

**UtilAPI (L1371):** `solidPaint(color, overrides?)`, `rgba(color)`, `rgb(color)`, `normalizeMarkdown(markdown)`, `getSfSymbolCharacter(name)`

**TeamLibraryAPI (L1289):** `getAvailableLibraryVariableCollectionsAsync()`, `importVariableByKeyAsync(key)`

**Image (L9998):** `hash`, `getBytesAsync()`, `getSizeAsync()`

---

## All Symbols (flat — grep these against the .d.ts file)

To find any symbol: `grep -n "^interface Foo\|^type Foo\|^declare type Foo" plugin-api-standalone.d.ts`

```
PluginAPI               VariablesAPI            LibraryVariableCollectionLibraryVariable
AnnotationsAPI          BuzzTextField           BuzzMediaField          TeamLibraryAPI
MotionAPI               UtilAPI                 ViewportAPI             SuggestionResults
ParametersAPI           NodeChangeProperty      Transform               Vector
Rect                    RGB                     RGBA                    FontName
FontVariationSettings   FontNameInput           TextCase                TextDecoration
TextDecorationStyle     FontStyle               TextDecorationOffset    TextDecorationThickness
TextDecorationColor     OpenTypeFeature         ArcData                 DropShadowEffect
InnerShadowEffect       BlurEffectBase          BlurEffectNormal        BlurEffectProgressive
BlurEffect              NoiseEffectBase         NoiseEffectMonotone     NoiseEffectDuotone
NoiseEffectMultitone    NoiseEffect             TextureEffect           GlassEffect
ShaderEffect            Effect                  ConstraintType          Constraints
ColorStop               ImageFilters            SolidPaint              GradientPaint
ImagePaint              VideoPaint              PatternPaint            ShaderPaint
Paint                   ShaderPropertyValue     ShaderPropertyDefinitionShader
Guide                   RowsColsLayoutGrid      GridLayoutGrid          LayoutGrid
ExportSettingsConstraintsExportSettingsImage     ExportSettingsSVGBase   ExportSettingsSVG
ExportSettingsSVGString ExportSettingsPDF       ExportSettingsREST      ExportSettings
WindingRule             VectorVertex            VectorSegment           VectorRegion
VectorNetwork           VectorPath              VectorPaths             LetterSpacing
LineHeight              LeadingTrim             TextWrapStyle           HyperlinkTarget
TextListOptions         BlendMode               MaskType                Font
TextStyleOverrideType   StyledTextSegment       TextPathStartData       Reaction
VariableDataType        ExpressionFunction      Expression              VariableValueWithExpression
VariableData            ConditionalBlock        Action                  SimpleTransition
DirectionalTransition   Transition              Trigger                 Navigation
Easing                  EasingFunctionBezier    EasingFunctionSpring    MotionEasing
PhysicalSpring          NormalizedSpring        AnimationStylePropValue AvailableAnimationStylePropValue
BaseAnimationStyle      AvailableAnimationStyle AnimationStyleConfigurationAppliedAnimationStyle
KeyframeValue           ManualKeyframeInput     ManualKeyframeTrackInputManualKeyframe
ManualKeyframeBinding   ManualKeyframeTrack     KeyframeBinding         KeyframePropertyFieldName
EffectKeyframeFieldName KeyframeField           ComponentPropKeyframeTracksComponentPropKeyframeBindings
PaintManualKeyframeTrackPaintKeyframeBinding    EffectManualKeyframeTracksEffectKeyframeBindings
ManualKeyframeTracks    Animations              Timeline                OverflowDirection
OverlayPositionType     OverlayBackground       OverlayBackgroundInteractionPublishStatus
ConnectorEndpointPositionConnectorEndpointPositionAndEndpointNodeIdConnectorEndpointEndpointNodeIdAndMagnetConnectorEndpoint
ConnectorStrokeCap      BaseNodeMixin           PluginDataMixin         SceneNodeMixin
MotionNodeMixin         VariableBindableNodeFieldVariableBindableTextFieldVariableBindablePaintField
VariableBindablePaintStyleFieldVariableBindableColorStopFieldVariableBindableEffectFieldVariableBindableEffectStyleField
VariableBindableLayoutGridFieldVariableBindableGridStyleFieldVariableBindableComponentPropertyFieldVariableBindableComponentPropertyDefinitionField
StickableMixin          ChildrenMixin           ConstraintMixin         DimensionAndPositionMixin
LayoutMixin             AspectRatioLockMixin    BlendMixin              ContainerMixin
StrokeCap               StrokeJoin              HandleMirroring         AutoLayoutMixin
GridTrackSize           GridTrackReorderOptions GridTrackReorderEntry   GridLayoutMixin
AutoLayoutChildrenMixin GridChildrenMixin       InferredAutoLayoutResultDetachedInfo
MinimalStrokesMixin     IndividualStrokesMixin  MinimalFillsMixin       VariableWidthPoint
PresetVariableWidthStrokePropertiesCustomVariableWidthStrokePropertiesVariableWidthStrokePropertiesComplexStrokeProperties
ScatterBrushProperties  StretchBrushProperties  BrushStrokeProperties   DynamicStrokeProperties
GeometryMixin           ComplexStrokesMixin     CornerMixin             RectangleCornerMixin
ExportMixin             FramePrototypingMixin   VectorLikeMixin         ReactionMixin
DocumentationLink       PublishableMixin        DefaultShapeMixin       BaseFrameMixin
DefaultFrameMixin       OpaqueNodeMixin         MinimalBlendMixin       Annotation
AnnotationProperty      AnnotationPropertyType  AnnotationsMixin        Measurement
MeasurementSide         MeasurementOffset       MeasurementsMixin       ComponentPropertiesMixin
BaseNonResizableTextMixinNonResizableTextMixin   NonResizableTextPathMixinTextSublayerNode
DocumentNode            ExplicitVariableModesMixinPageNode                FrameNode
GroupNode               TransformGroupNode      SliceNode               RectangleNode
LineNode                EllipseNode             PolygonNode             StarNode
VectorNode              TextNode                TextPathNode            ComponentPropertyType
InstanceSwapPreferredValueSlotSettings            ComponentPropertyOptionsComponentPropertyDefinitions
ComponentSetNode        ComponentNode           ComponentProperties     InstanceNode
SlotNode                BooleanOperationNode    StickyNode              StampNode
TableNode               TableCellNode           HighlightNode           WashiTapeNode
ShapeWithTextNode       CodeBlockNode           LabelSublayerNode       ConnectorNode
VariableResolvedDataTypeVariableAlias           VariableValue           VariableScope
CodeSyntaxPlatform      Variable                VariableCollection      ExtendedVariableCollection
AnnotationCategoryColor AnnotationCategory      WidgetNode              EmbedData
EmbedNode               LinkUnfurlData          LinkUnfurlNode          MediaData
MediaNode               SectionNode             SlideNode               SlideRowNode
SlideGridNode           InteractiveSlideElementNodeSlideTransition         BaseNode
SceneNode               NodeType                StyleType               InheritedStyleField
StyleConsumers          BaseStyleMixin          PaintStyle              TextStyle
EffectStyle             GridStyle               BaseStyle               Image
FindAllCriteria         TransformModifier       RepeatModifier          LinearRepeatModifier
RadialRepeatModifier    QueryResult             ScreenshotOptions
```

---

## use_figma Conveniences

These helpers are available when running code with `use_figma`.

### Node Methods

| Method / Property                 | Returns / Type  | Description                                |
| --------------------------------- | --------------- | ------------------------------------------ |
| `node.query(selector)`            | `QueryResult`   | CSS-like selector search within subtree    |
| `node.matches(selector)`          | `boolean`       | Test if node matches a selector            |
| `node.set(props)`                 | `this`          | Set multiple properties at once, chainable |
| `await node.screenshot(options?)` | `Promise<void>` | Capture PNG inline in tool response        |
| `node.placeholder`                | `boolean`       | Show/hide shimmer overlay                  |

### figma.io Namespace

| Method                       | Returns | Description                                      |
| ---------------------------- | ------- | ------------------------------------------------ |
| `figma.io.write(path, data)` | `void`  | Write image/data to be returned in tool response |

### Types

| Type                | Description                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `QueryResult`       | Iterable result from `node.query()` with `.first()`, `.last()`, `.each()`, `.map()`, `.filter()`, `.values()`, `.set()`, `.query()` |
| `ScreenshotOptions` | `{ scale?: number, contentsOnly?: boolean }`                                                                                        |


# Loaded workflow file: figma-use/references/gotchas.md
Source snapshot SHA256: 0e6b0031e957768b3e1eb8fec549e2397a0f643ef349387c93d2e813968398b3

# Gotchas & Common Mistakes

> Part of the [use_figma skill](../SKILL.md). Every known pitfall with WRONG/CORRECT code examples.

## Contents

- Component properties and variant creation pitfalls
- Paint, color, and variable binding pitfalls
- Page context and plugin lifecycle pitfalls (set current page once per `use_figma` call; split multi-page work across calls)
- Auto Layout and sizing order pitfalls (including HUG/FILL interactions, and TEXT nodes that ignore FILL and collapse to a zero-width thread)
- Variant layout and geometry pitfalls
- Canonical text-edit recipe + font loading and text/typography pitfalls
- Sequential awaits — batch independent async calls with `Promise.all` (including `import*ByKeyAsync` families)
- Prefer indexed lookups (`getNodeByIdAsync`, `findAllWithCriteria`, `node.query`) over `findAll`/`findOne` full-tree scans
- Scope traversal to the smallest known ancestor (never `figma.root.findAll`; prefer `someFrame.findAllWithCriteria` over `figma.currentPage.findAllWithCriteria`)
- Variable scopes and mode pitfalls
- Node cleanup and empty-fill pitfalls
- "no such property" errors — reading or calling members not defined on the node type
- Non-existent property writes and "object is not extensible"
- width/height are read-only — use resize()
- detachInstance() and node ID invalidation
- Icons — import the SVG, never reconstruct from rotated line primitives


## New nodes default to (0,0) and overlap existing content

Every `figma.create*()` call places the node at position (0,0). If you append multiple nodes directly to the page, they all stack on top of each other and on top of any existing content.

**This only matters for nodes appended directly to the page** (i.e., top-level nodes). Nodes appended as children of other frames, components, or auto-layout containers are positioned by their parent — don't scan for overlaps when nesting nodes.

```js
// WRONG — top-level node lands at (0,0), overlapping existing page content
const frame = figma.createFrame()
frame.name = "My New Frame"
frame.resize(400, 300)
figma.currentPage.appendChild(frame)

// CORRECT — find existing content bounds and place the new top-level node to the right
const page = figma.currentPage
let maxX = 0
for (const child of page.children) {
  const right = child.x + child.width
  if (right > maxX) maxX = right
}
const frame = figma.createFrame()
frame.name = "My New Frame"
frame.resize(400, 300)
figma.currentPage.appendChild(frame)
frame.x = maxX + 100  // 100px gap from rightmost existing content
frame.y = 0

// NOT NEEDED — child nodes inside a parent don't need overlap scanning
const card = figma.createAutoLayout('VERTICAL')
const label = figma.createText()
card.appendChild(label)  // positioned by auto-layout, no x/y needed
```

## `addComponentProperty` returns a string key, not an object — never hardcode or guess it

Figma generates the property key dynamically (e.g. `"label#4:0"`). The suffix is unpredictable. Always capture and use the return value directly.

```js
// WRONG — guessing / hardcoding the key
comp.addComponentProperty('label', 'TEXT', 'Button')
labelNode.componentPropertyReferences = { characters: 'label#0:1' }  // Error: key not found

// WRONG — treating the return value as an object
const result = comp.addComponentProperty('Label', 'TEXT', 'Button')
const propKey = Object.keys(result)[0]  // BUG: returns '0' (first char index of string!)
labelNode.componentPropertyReferences = { characters: propKey }  // Error: property '0' not found

// CORRECT — the return value IS the key string, use it directly
const propKey = comp.addComponentProperty('Label', 'TEXT', 'Button')
// propKey === "label#4:0" (exact value varies; never assume it)
labelNode.componentPropertyReferences = { characters: propKey }
```

The same applies to `COMPONENT_SET` nodes — `addComponentProperty` always returns the property key as a string.

## MUST return ALL created/mutated node IDs

Every script that creates or mutates nodes on the canvas must track and return all affected node IDs in the return value. Without these IDs, subsequent calls cannot reference, validate, or clean up those nodes.

```js
// WRONG — only returns the parent frame ID, loses track of children
const frame = figma.createFrame()
const rect = figma.createRectangle()
const text = figma.createText()
frame.appendChild(rect)
frame.appendChild(text)
return { nodeId: frame.id }

// CORRECT — returns all created node IDs in a structured response
const frame = figma.createFrame()
const rect = figma.createRectangle()
const text = figma.createText()
frame.appendChild(rect)
frame.appendChild(text)
return {
  createdNodeIds: [frame.id, rect.id, text.id],
  rootNodeId: frame.id
}

// CORRECT — when mutating existing nodes, return those IDs too
const nodes = figma.currentPage.findAll(n => n.name === 'Card')
for (const n of nodes) {
  n.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
}
return {
  mutatedNodeIds: nodes.map(n => n.id),
  count: nodes.length
}
```

## Colors are 0–1 range

```js
// WRONG — will throw validation error (ZeroToOne enforced)
node.fills = [{ type: 'SOLID', color: { r: 255, g: 0, b: 0 } }]

// CORRECT
node.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
```

## Fills/strokes are immutable arrays

```js
// WRONG — modifying in place does nothing
node.fills[0].color = { r: 1, g: 0, b: 0 }

// CORRECT — clone, modify, reassign
const fills = JSON.parse(JSON.stringify(node.fills))
fills[0].color = { r: 1, g: 0, b: 0 }
node.fills = fills
```

## setBoundVariableForPaint returns a NEW paint

```js
// WRONG — ignoring return value
figma.variables.setBoundVariableForPaint(paint, "color", colorVar)
node.fills = [paint]  // paint is unchanged!

// CORRECT — capture the returned new paint
const boundPaint = figma.variables.setBoundVariableForPaint(paint, "color", colorVar)
node.fills = [boundPaint]
```

## Variable collection starts with 1 mode

```js
// A new collection already has one mode — rename it, don't try to add first
const collection = figma.variables.createVariableCollection("Colors")
// collection.modes = [{ modeId: "...", name: "Mode 1" }]
collection.renameMode(collection.modes[0].modeId, "Light")
const darkModeId = collection.addMode("Dark")
```

## combineAsVariants requires ComponentNodes

```js
// WRONG — passing frames
const f1 = figma.createFrame()
figma.combineAsVariants([f1], figma.currentPage) // Error!

// CORRECT — passing components
const c1 = figma.createComponent()
c1.name = "variant=primary, size=md"
const c2 = figma.createComponent()
c2.name = "variant=secondary, size=md"
figma.combineAsVariants([c1, c2], figma.currentPage)
```

## Page switching: sync setter does NOT work

The sync setter `figma.currentPage = page` does **NOT work** in `use_figma` — it throws `"Setting figma.currentPage is not supported"`. You **must** use `await figma.setCurrentPageAsync(page)` instead, which switches the page and loads its content.

Note: **reading** `figma.currentPage` is fine — it's only the **assignment** (`figma.currentPage = ...`) that throws.

```js
// WRONG — throws "Setting figma.currentPage is not supported"
figma.currentPage = targetPage

// CORRECT — async method switches and loads content
await figma.setCurrentPageAsync(targetPage)

// ALSO CORRECT — reading currentPage is fine
const page = figma.currentPage  // works
```

## Set current page once per `use_figma` call — split multi-page work into parallel calls

**A `use_figma` script must call `setCurrentPageAsync` at most once.** Never loop over `figma.root.children` and switch pages inside one script.

**The rule is the same for reads and writes:** if work spans multiple pages, split it into **multiple `use_figma` tool calls, one per target page, and YOU MUST issue them in parallel**.

> **Explicit instruction to the agent:** emit all N `use_figma` calls in a **single assistant message**, as N parallel tool-use blocks. Do not send them in separate turns. Do not await one before issuing the next. Each call sets `currentPage` exactly once; the harness runs them concurrently. Sequential per-page calls defeat the entire point of splitting and are slower than the in-loop pattern this rule replaces.

```js
// WRONG — one script switches pages on every iteration; reloads the file N times sequentially
const componentsByPage = {}
for (const page of figma.root.children) {
  await figma.setCurrentPageAsync(page)
  componentsByPage[page.name] = page.findAllWithCriteria({ types: ['COMPONENT'] }).map(n => n.id)
}
return componentsByPage
```

Instead, do it in two steps and parallelize step 2:

```js
// CORRECT — step 1: cheap, no page switch. Return the page IDs you'll fan out over.
return figma.root.children.map(p => ({ id: p.id, name: p.name }))
```

Then in the **next assistant turn**, emit **N parallel `use_figma` tool-use blocks in one message** — one per page. Each script runs this:

```js
// CORRECT — step 2: one call per page, currentPage set exactly once.
// The assistant issues N of these in parallel — do NOT loop pages inside the script.
const page = await figma.getNodeByIdAsync(PAGE_ID)  // PAGE_ID supplied by caller
await figma.setCurrentPageAsync(page)
// ... read or mutate this page ...
return { pageId: page.id, components: page.findAllWithCriteria({ types: ['COMPONENT'] }).map(n => n.id) }
```

This applies to discovery, mutation, component-set creation, and audits — reads and writes alike. **The only acceptable reason to switch pages multiple times in one script is when splitting would break a transactional/atomicity guarantee** (i.e., the operation must succeed across all pages or none, and a partial failure between calls would corrupt state). "It's read-only" and "I want a consistent snapshot" are *not* exceptions — fan out in parallel.

The same rule generalizes to *any* traversal: scope it to the smallest known ancestor — see [Scope traversal to the smallest known ancestor](#scope-traversal-to-the-smallest-known-ancestor).

## `get_metadata` operates on one subtree — discover pages explicitly

A Figma file can have multiple pages (canvas nodes). `get_metadata` only returns the subtree of whichever node you pass it. To get a usable index of every page:

- Call `get_metadata` with **no nodeId** — it returns the document's top-level pages as `{guid, name}` entries (no XML dump). This is the cheapest way to discover pages.
- For more detail per page (e.g. child counts, top-level node types), fall back to `use_figma`:

```js
const pages = figma.root.children.map(p => `${p.name} id=${p.id} children=${p.children.length}`);
return pages.join('\n');
```

Icons, variables, and components may live on pages other than the first. Always enumerate all pages before concluding that the file has no existing assets.

## Never use figma.notify()

```js
// WRONG — throws "not implemented" error
figma.notify("Done!")

// CORRECT — return a value to send data back to the agent
return "Done!"
```

## Prefer returned IDs for workflow state

Return node IDs and keep workflow state outside the Figma file. Put human-readable component purpose and usage in `node.description` only on a `COMPONENT` or `COMPONENT_SET`.

```js
const rect = figma.createRectangle()
return { nodeId: rect.id }
// Then pass nodeId as a string literal in the next use_figma call
```

## Script must always return a value

```js
// WRONG — no return, caller gets no useful response
figma.createRectangle()

// CORRECT — return a result (objects are auto-serialized, errors are auto-captured)
const rect = figma.createRectangle()
return { nodeId: rect.id }
```

## setBoundVariable for paint fields only works on SOLID paints

```js
// Only SOLID paint type supports color variable binding
// Gradient paints, image paints, etc. will throw
const solidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }
const bound = figma.variables.setBoundVariableForPaint(solidPaint, "color", colorVar)
```

## Explicit variable modes must be set per component

```js
// WRONG — all variants render with the default (first) mode
const colorCollection = figma.variables.createVariableCollection("Colors")
// ... create variables and modes ...
// Components all show the first mode's values by default!

// CORRECT — set explicit mode on each component to get variant-specific values
component.setExplicitVariableModeForCollection(colorCollection, targetModeId)
```

## `lineHeight` and `letterSpacing` must be objects, not bare numbers

```js
// WRONG — throws or silently does nothing
style.lineHeight = 1.5
style.lineHeight = 24
style.letterSpacing = 0

// CORRECT
style.lineHeight = { unit: "AUTO" }                    // auto/intrinsic
style.lineHeight = { value: 24, unit: "PIXELS" }       // fixed pixel height
style.lineHeight = { value: 150, unit: "PERCENT" }     // percentage of font size

style.letterSpacing = { value: 0, unit: "PIXELS" }     // no tracking
style.letterSpacing = { value: -0.5, unit: "PIXELS" }  // tight
style.letterSpacing = { value: 5, unit: "PERCENT" }    // percent-based
```

This applies to both `TextStyle` and `TextNode` properties. The same rule applies inside `use_figma`, interactive plugins, and any other plugin API context.

## Canonical text-edit recipe (font load → await → mutate → return IDs)

Writing to any text property on a node whose font is not yet loaded throws `Cannot write to node with unloaded font "<family> <style>"`. The fix is always the same four-step recipe — use it verbatim every time you touch text:

```js
// WRONG — font not loaded; throws Cannot write to node with unloaded font "Inter Regular"
const node = figma.createText()
node.characters = "Hello"

// CORRECT — load font, await, mutate, return affected IDs
await figma.loadFontAsync({ family: "Inter", style: "Regular" })  // any font, not just Inter — see note
const node = figma.createText()
node.characters = "Hello"
return { createdNodeIds: [node.id] }
```

**This applies to every font, not just Inter.** Inter is preloaded in most environments so the missing-`loadFontAsync` bug often only surfaces with other families (`Roboto Mono`, `Merriweather`, `Figma Hand`, library fonts, etc.). Examples in these docs use `Inter` because it's available everywhere, but the recipe is identical for any family/style pair.

**The same recipe also applies when mutating existing text** — the font already on the node, not a hardcoded default, must be loaded:

```js
// CORRECT — load the node's own current font(s), then mutate
const segments = textNode.getStyledTextSegments(['fontName'])
await Promise.all(segments.map(s => figma.loadFontAsync(s.fontName)))
textNode.characters = "Updated"
return { mutatedNodeIds: [textNode.id] }
```

Font loading is also required for **any** operation on nodes that contain unloaded fonts — `appendChild`, `insertChild`, `setBoundVariable`, `setExplicitVariableModeForCollection`, `setValueForMode`, and even `findAll` callbacks that touch text properties. If the document has existing text nodes you'll traverse, preload their fonts at the start of the script.

## Sequential awaits — batch independent async calls with `Promise.all`

Awaiting an independent async call inside a `for`/`for…of` loop — or sequentially in a straight-line block — serializes one IPC round-trip per call. Each call to `getNodeByIdAsync`, `getVariableByIdAsync`, `loadFontAsync`, `setTextStyleIdAsync`, **`importComponentByKeyAsync`, `importComponentSetByKeyAsync`, `importStyleByKeyAsync`, `importVariableByKeyAsync`**, etc. is independent — batch them with `Promise.all`. The only awaits that *must* stay sequential are `setCurrentPageAsync` (changes global page context) and explicit per-iteration dependencies.

Sequential `import*ByKeyAsync` calls at the top of a `use_figma` script are a particularly common offender — design-system scripts often import a component set plus several variables plus an effect style in a row. **Always batch the imports:**

```js
// WRONG — four sequential round-trips at the start of every section build
const buttonSet   = await figma.importComponentSetByKeyAsync("BUTTON_SET_KEY")
const bgVar       = await figma.variables.importVariableByKeyAsync("BG_COLOR_VAR_KEY")
const spacingVar  = await figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY")
const shadowStyle = await figma.importStyleByKeyAsync("SHADOW_STYLE_KEY")

// CORRECT — one round-trip
const [buttonSet, bgVar, spacingVar, shadowStyle] = await Promise.all([
  figma.importComponentSetByKeyAsync("BUTTON_SET_KEY"),
  figma.variables.importVariableByKeyAsync("BG_COLOR_VAR_KEY"),
  figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY"),
  figma.importStyleByKeyAsync("SHADOW_STYLE_KEY"),
])
```

```js
// WRONG — N sequential round-trips, scales linearly with list length
const vars = {}
for (const id of collection.variableIds) {
  vars[id] = await figma.variables.getVariableByIdAsync(id)
}

// CORRECT — one round-trip
const fetched = await Promise.all(
  collection.variableIds.map(id => figma.variables.getVariableByIdAsync(id))
)
const vars = {}
collection.variableIds.forEach((id, i) => { vars[id] = fetched[i] })
```

When the loop only needs the *same* font for every iteration, load it once before the loop instead of inside it. (For freshly-created `TextNode`s this is the platform default — typically Inter Regular in design files; for FigJam sticky/shape sublayers it's Inter Medium. Either way, read `node.fontName` rather than hardcoding.)

```js
// WRONG — loads the same default font on every iteration
for (const label of labels) {
  const t = figma.createText()
  await figma.loadFontAsync(t.fontName)
  t.characters = label
}

// CORRECT — load once, then mutate synchronously
const probe = figma.createText()
await figma.loadFontAsync(probe.fontName)
probe.remove()
for (const label of labels) {
  const t = figma.createText()
  t.characters = label
}
```

If you do need different fonts per node, dedupe and `Promise.all` them up-front:

```js
const uniqueFonts = [...new Map(
  textNodes.map(t => [JSON.stringify(t.fontName), t.fontName])
).values()]
await Promise.all(uniqueFonts.map(f => figma.loadFontAsync(f)))
```

## Prefer indexed lookups over `findAll` / `findOne` full-tree scans

**Rule: use `findAllWithCriteria({ types: [...] })` for type-based searches. Reserve `findOne` / `findAll(predicate)` for cases the criteria API can't express** — name patterns, regex, capability checks (`'fills' in n`), or any predicate that touches properties the engine doesn't index.

`findAll` and `findOne` walk the entire subtree node-by-node and run a JS predicate on each one. For supported criteria such as type, use the faster API in this table:

| You want… | DON'T | DO |
|---|---|---|
| One specific node, you have its ID | `page.findOne(n => n.id === id)` | `await figma.getNodeByIdAsync(id)` |
| All nodes of a given type | `page.findAll(n => n.type === 'TEXT')` | `page.findAllWithCriteria({ types: ['TEXT'] })` |
| Type + a few cheap attributes (`name`, `visible`, etc.) | `page.findAll(n => n.type === 'TEXT' && n.name === 'Title')` | `page.query('TEXT[name=Title]')` (see [SKILL.md → node.query](../SKILL.md#nodequeryselector--css-like-node-search)) |

**`types` is an array — pass multiple values in a single call instead of issuing N separate ones.** A union over `types` is OR'd.

```js
// Multiple types in one call — returns COMPONENT ∪ COMPONENT_SET in one indexed pass
page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })
```

One more rule applies to any traversal — see also the dedicated [Scope traversal to the smallest known ancestor](#scope-traversal-to-the-smallest-known-ancestor) gotcha below:

1. **Narrow the scope.** `frame.findAll(...)` is much cheaper than `figma.currentPage.findAll(...)`. Hold onto the smallest known subtree.

```js
// WRONG — full-tree scan for a single node you already have an ID for
const button = figma.currentPage.findOne(n => n.id === BUTTON_ID)

// CORRECT — indexed lookup
const button = await figma.getNodeByIdAsync(BUTTON_ID)

// WRONG — type filter via predicate (walks every node)
const textNodes = figma.currentPage.findAll(n => n.type === 'TEXT')

// CORRECT — type filter via criteria (indexed, hundreds of times faster on large docs)
const textNodes = figma.currentPage.findAllWithCriteria({ types: ['TEXT'] })

// WRONG — full traversal when you only need a couple of types
frame.findAll(() => true).forEach(node => { /* only touches TEXT and INSTANCE */ })

// CORRECT — restrict to the types you actually care about
const candidates = frame.findAllWithCriteria({ types: ['TEXT', 'INSTANCE'] })
for (const node of candidates) { /* ... */ }
```

**Caveat — don't enumerate every scene type just to use criteria.** If you'd need to list ~10+ types (e.g., "any node that can carry `boundVariables` or `effectStyleId`"), the type list is no longer narrowing — it's enumerating. `findAll(() => true)` is shorter, equivalently fast on real screen-sized subtrees, and saves a lot of script tokens. Reserve `findAllWithCriteria` for genuine narrowing (one to a handful of types).

**When the predicate combines type + name (or another non-indexed attribute), use criteria for the type and a `.filter`/`.find` for the rest** — the criteria stage already narrows the candidate set to the matching type using the index:

```js
// WRONG — predicate walks every node
const slot = instance.findOne(n => n.type === 'SLOT' && n.name === 'Content')

// CORRECT — type-indexed criteria + name filter
const slot = instance
  .findAllWithCriteria({ types: ['SLOT'] })
  .find(n => n.name === 'Content')
```

Name-only lookups (`findOne(n => n.name === 'X')`) cannot use criteria — they remain the right tool when you only have a name. But if you can capture the node's ID once and re-fetch with `getNodeByIdAsync` on subsequent calls, prefer that over searching by name again.

## Scope traversal to the smallest known ancestor

Every `findAll` / `findOne` / `findAllWithCriteria` walks the entire subtree of the receiver. Picking the right receiver is the single biggest performance lever you have — bigger than the type index. Cheapest to most expensive:

| Receiver | Walks… |
|---|---|
| `someFrame.findAllWithCriteria(...)` | one frame's subtree |
| `figma.currentPage.findAllWithCriteria(...)` | one page (every loaded node on it) |
| `figma.root.findAllWithCriteria(...)` | **every loaded page in the document** — only safe on tiny files |

**Rule: scope traversal to the smallest known ancestor.** If you have a specific frame's ID, search inside that frame. If you have a section, search inside that section. Drop back to `figma.currentPage` only when the work is genuinely page-wide.

```js
// WRONG — walks every loaded page in the document
const all = figma.root.findAllWithCriteria({ types: ['INSTANCE'] })

// BETTER — one page only
const onPage = figma.currentPage.findAllWithCriteria({ types: ['INSTANCE'] })

// BEST — when you have the parent frame's ID, search just that subtree
const frame = await figma.getNodeByIdAsync(FRAME_ID)
const inFrame = frame.findAllWithCriteria({ types: ['INSTANCE'] })
```

**Never use `figma.root.findAll(...)` in a `use_figma` script.** It walks every page that has been loaded into memory and forces every other page to load if not already in memory — the worst-case traversal. There is no legitimate use of it in this codebase.

**Never loop `figma.root.children` calling `setCurrentPageAsync(page)` and then `page.findAll(...)`** — that's the same antipattern in slow motion: one whole-page scan per page, plus the cost of switching pages. If work spans multiple pages, **fan out** instead: emit one `use_figma` per page in parallel (see [Set current page once per `use_figma` call](#set-current-page-once-per-use_figma-call--split-multi-page-work-into-parallel-calls)).

When you don't have a frame ID handy, capture one from a parent call and pass it to subsequent calls — `getNodeByIdAsync(id).findAllWithCriteria(...)` beats `figma.currentPage.findAllWithCriteria(...)` every time the target subtree is smaller than the page.

## Font style names are file-dependent — use `listAvailableFontsAsync` to discover them

Font style names vary per provider and per Figma file. Always call `figma.listAvailableFontsAsync()` to discover exact style strings before loading — never guess or probe with try/catch. See [text-style-patterns.md](text-style-patterns.md#discovering-available-font-styles) for the discovery + load pattern.

## combineAsVariants does NOT auto-layout in `use_figma`

```js
// WRONG — all variants stack at position (0, 0), resulting in a tiny ComponentSet
const components = [comp1, comp2, comp3]
const cs = figma.combineAsVariants(components, figma.currentPage)
// cs.width/height will be the size of a SINGLE variant!

// CORRECT — manually layout children in a grid after combining
const cs = figma.combineAsVariants(components, figma.currentPage)
const colWidth = 120
const rowHeight = 56
cs.children.forEach((child, i) => {
  const col = i % numCols
  const row = Math.floor(i / numCols)
  child.x = col * colWidth
  child.y = row * rowHeight
})
// CRITICAL: resize from actual child bounds, not formula — formula errors leave variants outside the boundary
let maxX = 0, maxY = 0
for (const child of cs.children) {
  maxX = Math.max(maxX, child.x + child.width)
  maxY = Math.max(maxY, child.y + child.height)
}
cs.resizeWithoutConstraints(maxX + 40, maxY + 40)
```

## Paint `color` must not include `a` — use `opacity` at the paint level instead

Paint `color` only accepts `{r, g, b}`. Adding `a` to it throws `"Unrecognized key(s) in object: 'a' at [0].color"`. This is a common mistake coming from CSS `rgba()` muscle memory.

Alpha/opacity belongs at the **paint level** as `opacity`, not inside `color`.

```js
// WRONG — 'a' is not valid inside color; throws validation error
node.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 0.1 } }]

// CORRECT — opacity goes at the paint level
node.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.1 }]

// CORRECT — fully opaque (no opacity needed)
node.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
```

**COLOR variable values are the exception** — they do use `{r, g, b, a}`:

```js
// Variable values use {r, g, b, a} — this is correct for variables only
const colorVar = figma.variables.createVariable("bg", collection, "COLOR")
colorVar.setValueForMode(modeId, { r: 1, g: 0, b: 0, a: 1 })  // opaque red
colorVar.setValueForMode(modeId, { r: 0, g: 0, b: 0, a: 0 })  // fully transparent
```

## `layoutSizingHorizontal`/`layoutSizingVertical` value rules: `FIXED`, `HUG`, `FILL`

The property exists on every `SceneNode`, but the **value** you can assign depends on the node's relationship to auto-layout. The scenegraph validates the assignment (`fullscreen/lib/scenegraph/FGStackLayoutSizeHelper.cpp::checkStackLayoutSize`) and rejects non-`FIXED` values that don't satisfy a structural rule:

| Value | Allowed when | Rejected with |
| --- | --- | --- |
| `'FIXED'` | always | (never throws) |
| `'HUG'` | the node IS an auto-layout frame, OR is a **TEXT** child of an auto-layout frame | `"HUG can only be set on auto-layout frames or text children of auto-layout frames"` |
| `'FILL'` | the node is a child of an auto-layout frame, AND not absolute-positioned, AND not inside an immutable frame, AND not a canvas-grid child | `"FILL can only be set on children of auto-layout frames"`, `"FILL cannot be set on absolute positioned auto-layout children"`, `"FILL cannot be set on this node"`, `"FILL cannot be set on canvas grid children"` |
| any non-`FIXED` value on a node that is neither auto-layout nor inside auto-layout | (none — always rejected) | `"node must be an auto-layout frame or a child of an auto-layout frame"` |

**Common errors thrown** (the runtime prefixes the message with the property setter that rejected the value):

- `Error: in set_layoutSizingHorizontal: node must be an auto-layout frame or a child of an auto-layout frame`
- `Error: in set_layoutSizingHorizontal: FILL can only be set on children of auto-layout frames`

The same messages surface under `set_layoutSizingVertical` when the vertical axis is the one being set.

Practical consequences:

1. **Append first, then set.** A freshly-created node has no parent, so `child.layoutSizingHorizontal = 'FILL'` immediately after `figma.createFrame()` always throws. `appendChild` to an auto-layout parent first.
2. **The parent must actually be auto-layout.** A plain `figma.createFrame()` defaults to `layoutMode = 'NONE'` — its children cannot use `'FILL'` or `'HUG'`. Prefer `figma.createAutoLayout()` (or set the parent's `layoutMode` to `'HORIZONTAL'`/`'VERTICAL'` before appending).
3. **`'HUG'` on a non-text child of auto-layout still throws.** A `FRAME` or `RECTANGLE` child of auto-layout can be `'FILL'` or `'FIXED'` — only the auto-layout frame itself and **TEXT** children may be `'HUG'`. To make a non-text child shrink to content, set its `primaryAxisSizingMode`/`counterAxisSizingMode` to `'AUTO'` instead.
4. **`'FILL'` is incompatible with absolute positioning and canvas grids.** If you set `child.layoutPositioning = 'ABSOLUTE'`, the child no longer participates in flow and cannot be `'FILL'` — size it explicitly with `resize()` instead.

```js
// WRONG — node has no parent yet
const child = figma.createFrame()
child.layoutSizingHorizontal = 'FILL'  // "FILL can only be set on children of auto-layout frames"

// WRONG — parent is a plain frame (layoutMode === 'NONE'), not auto-layout
const parent = figma.createFrame()
parent.appendChild(child)
child.layoutSizingHorizontal = 'FILL'  // "node must be an auto-layout frame or a child of an auto-layout frame"

// WRONG — HUG on a non-text auto-layout child
const al = figma.createAutoLayout()
const rect = figma.createRectangle()
al.appendChild(rect)
rect.layoutSizingHorizontal = 'HUG'  // "HUG can only be set on auto-layout frames or text children…"

// CORRECT — auto-layout parent, appended first, then sizing
const al2 = figma.createAutoLayout()
const c = figma.createFrame()
al2.appendChild(c)
c.layoutSizingHorizontal = 'FILL'    // ok

// CORRECT — HUG on the auto-layout frame itself, or on a TEXT child
al2.layoutSizingHorizontal = 'HUG'   // ok — auto-layout frame
const t = figma.createText()
al2.appendChild(t)
t.layoutSizingHorizontal = 'HUG'     // ok — TEXT child of auto-layout
```

`figma.createAutoLayout()` returns a frame with `layoutMode` already set and both axes hugging content, so its children can immediately use `'FILL'`/`'HUG'` after being appended — preferred over `figma.createFrame()` whenever the container holds related children. See Rule 12a in [SKILL.md](../SKILL.md).

The next gotcha (`## HUG parents collapse FILL children`) layers on top of the rules above: even when assignment succeeds, a `HUG` parent gives `FILL` children no room to expand. The validation rule above is about whether the assignment is _allowed_; the next gotcha is about whether it produces useful layout.

## layoutSizing vs AxisSizingMode: two different sizing enums

`layoutSizingHorizontal`/`layoutSizingVertical` and `primaryAxisSizingMode`/`counterAxisSizingMode` look interchangeable but accept **different enums** and are set on **different nodes**. Crossing them throws a value-rejection error.

| Property family | Valid values | Set on |
| --- | --- | --- |
| `layoutSizingHorizontal` / `layoutSizingVertical` | `'FIXED'` \| `'HUG'` \| `'FILL'` | a **child** node (or the auto-layout frame itself) |
| `primaryAxisSizingMode` / `counterAxisSizingMode` | `'FIXED'` \| `'AUTO'` | the **frame** itself |

`'AUTO'` is not a valid `layoutSizing*` value — the equivalent is `'HUG'`:

```js
// WRONG
node.layoutSizingVertical = 'AUTO'   // 'AUTO' is not a layoutSizing value

// CORRECT
node.layoutSizingVertical = 'HUG'
```

`'FILL'` is not a valid `*AxisSizingMode` value — use `'FIXED'` or `'AUTO'`:

```js
// WRONG
frame.counterAxisSizingMode = 'FILL'  // throws: Expected 'FIXED' | 'AUTO', received 'FILL'

// CORRECT
frame.counterAxisSizingMode = 'FIXED'
```

`layoutSizingHorizontal/Vertical` is a shorthand that also drives `primaryAxisSizingMode`/`counterAxisSizingMode` under the hood — but the two surfaces accept different value sets, so keep their enums straight. For the structural rules on _when_ `HUG`/`FILL` are legal at all, see the section above.

## HUG parents collapse FILL children

A `HUG` parent cannot give `FILL` children meaningful size. If children have `layoutSizingHorizontal = "FILL"` but the parent is `"HUG"`, the children collapse to minimum size. The parent must be `"FILL"` or `"FIXED"` for FILL children to expand. This is a common cause of truncated text in select fields, inputs, and action rows.

```js
// WRONG — parent hugs, so FILL children get zero extra space
const parent = figma.createAutoLayout()
parent.layoutSizingHorizontal = 'HUG'
const child = figma.createFrame()
parent.appendChild(child)
child.layoutSizingHorizontal = 'FILL'  // collapses to min size!

// CORRECT — parent must be FIXED or FILL for FILL children to expand
const parent = figma.createAutoLayout()
parent.resize(400, 50)
parent.layoutSizingHorizontal = 'FIXED'  // or 'FILL' if inside another auto-layout
const child = figma.createFrame()
parent.appendChild(child)
child.layoutSizingHorizontal = 'FILL'  // expands to fill remaining 400px
```

## TEXT nodes default to `WIDTH_AND_HEIGHT` and ignore `FILL` — collapsing to a near-zero-width thread

A new `TEXT` node defaults to `textAutoResize = 'WIDTH_AND_HEIGHT'`, which makes it hug its content on **both** axes. In that mode it behaves like `HUG` and ignores `layoutSizingHorizontal = 'FILL'`: instead of filling the parent it shrinks toward minimum width, wrapping every word — or even every character — onto its own line. The result is a frame that is a few pixels wide and thousands of pixels tall (a "text thread"). Long multi-line blocks (specs, docs, descriptions) are where this bites, because the runaway height is easy to miss until you screenshot.

For a wrapping text block, set `textAutoResize = 'HEIGHT'` **and** give it an explicit width — don't rely on `FILL`. The reliable recipe is `'FIXED'` + `resize()`; then verify `node.width > 0` before moving on.

```js
// WRONG — FILL is ignored while textAutoResize is the default WIDTH_AND_HEIGHT,
// so the text hugs to ~0 width and grows to thousands of px tall
const t = figma.createText()
frame.appendChild(t)
t.layoutSizingHorizontal = 'FILL'
t.characters = longString          // wraps to one char per line → width ≈ 0, height ≈ 348114

// CORRECT — switch to HEIGHT autoresize and set an explicit width, then verify
const t = figma.createText()
frame.appendChild(t)
t.textAutoResize = 'HEIGHT'                 // grow vertically, wrap at a fixed width
t.layoutSizingHorizontal = 'FIXED'
t.resize(852, t.height)                     // e.g. parent 900 − 24*2 padding
t.characters = longString
if (t.width === 0) throw new Error('text collapsed — width not applied')
```

Set `textAutoResize = 'HEIGHT'` (or `'NONE'`) **before** sizing or assigning `characters`. `FILL` on a TEXT child only works once the node is in `HEIGHT`/`NONE` mode and the auto-layout parent has a committed fixed counter-axis width — when in doubt, prefer explicit `'FIXED'` + `resize()`.

## `layoutGrow` with a hugging parent causes content compression

```js
// WRONG — layoutGrow on a child when parent has primaryAxisSizingMode='AUTO' (hug)
// causes the child to SHRINK below its natural size instead of expanding
const parent = figma.createComponent()
parent.layoutMode = 'VERTICAL'
parent.primaryAxisSizingMode = 'AUTO'  // hug contents
const content = figma.createAutoLayout('VERTICAL')
parent.appendChild(content)
content.layoutGrow = 1  // BUG: content compresses, children hidden!

// CORRECT — only use layoutGrow when parent has FIXED sizing with extra space
content.layoutGrow = 0  // let content take its natural size
// OR: set parent to FIXED sizing first
parent.primaryAxisSizingMode = 'FIXED'
parent.resizeWithoutConstraints(300, 500)
content.layoutGrow = 1  // NOW it correctly fills remaining space
```

## `width` and `height` are read-only — use `resize()`

`node.width` and `node.height` are read-only. Assigning to them throws `"TypeError: no setter for property"`. Use `resize()` or `resizeWithoutConstraints()` instead.

Note: `x` and `y` are **not** read-only and can be set directly.

```js
// WRONG — throws "no setter for property"
node.width = 300
node.height = 64

// CORRECT — use resize() to change dimensions
node.resize(300, 64)           // change both
node.resize(300, node.height)  // change width only
node.resize(node.width, 64)    // change height only

// CORRECT — x and y are writable directly
node.x = 100
node.y = 200
```

For sections and component sets, use `resizeWithoutConstraints()` instead of `resize()` (see the sections gotcha above).

## `resize()` resets `primaryAxisSizingMode` and `counterAxisSizingMode` to FIXED

`resize(w, h)` silently resets **both** sizing modes to `FIXED`. If you call it after setting `HUG`, the frame locks to the exact pixel value you passed — even a throwaway like `1`.

```js
// WRONG — resize() after setting sizing mode overwrites it back to FIXED
const frame = figma.createComponent()
frame.layoutMode = 'VERTICAL'
frame.primaryAxisSizingMode = 'AUTO'  // hug height
frame.counterAxisSizingMode = 'FIXED'
frame.resize(300, 10)  // BUG: resets BOTH axes to 'FIXED'! Height stays at 10px forever.

// ESPECIALLY DANGEROUS — throwaway values when you only care about one axis
const comp = figma.createComponent()
comp.layoutMode = 'VERTICAL'
comp.layoutSizingHorizontal = 'FIXED'
comp.layoutSizingVertical = 'HUG'
comp.resize(280, 1)  // BUG: "I only want width=280" but this locks height to 1px!
// HUG was reset to FIXED by resize(), frame is now permanently 280×1

// CORRECT — call resize() FIRST, then set sizing modes
const frame = figma.createComponent()
frame.layoutMode = 'VERTICAL'
frame.resize(300, 40)  // use a reasonable default, never 0 or 1
frame.counterAxisSizingMode = 'FIXED'  // keep width fixed at 300
frame.primaryAxisSizingMode = 'AUTO'   // NOW set height to hug — this sticks!
// Or use the modern shorthand (equivalent):
// frame.layoutSizingHorizontal = 'FIXED'
// frame.layoutSizingVertical = 'HUG'
```

**Rule of thumb**: Never pass a throwaway/garbage value (like `1` or `0`) to `resize()` for an axis you intend to be `HUG`. Either call `resize()` before setting sizing modes, or use a reasonable default that won't cause visual bugs if the mode reset goes unnoticed.

## Node positions don't auto-reset after reparenting

```js
// WRONG — assuming positions reset when moving a node into a new parent
const node = figma.createRectangle()
node.x = 500; node.y = 500;
figma.currentPage.appendChild(node)
section.appendChild(node)  // node still at (500, 500) relative to section!

// CORRECT — explicitly set x/y after ANY reparenting operation
section.appendChild(node)
node.x = 80; node.y = 80;  // reset to desired position within section
```

## Grid layout with mixed-width rows causes overlaps

```js
// WRONG — using a single column offset for rows with different-width items
// e.g. vertical cards (320px) and horizontal cards (500px) in a 2-row grid
for (let i = 0; i < allCards.length; i++) {
  allCards[i].x = (i % 4) * 370  // 370 works for 320px cards but NOT 500px cards!
}

// CORRECT — compute each row's spacing independently based on actual child widths
const gap = 50
let x = 0
for (const card of horizontalCards) {
  card.x = x
  x += card.width + gap  // use actual width, not a fixed column size
}
```

## Sections don't auto-resize to fit content

```js
// WRONG — section stays at default size, content overflows
const section = figma.createSection()
section.name = "My Section"
section.appendChild(someNode) // node may be outside section bounds

// CORRECT — explicitly resize after adding content
const section = figma.createSection()
section.name = "My Section"
section.appendChild(someNode)
section.resize(
  Math.max(someNode.width + 100, 800),
  Math.max(someNode.height + 100, 600)
)
```

## `counterAxisAlignItems` does NOT support `'STRETCH'`

```js
// WRONG — 'STRETCH' is not a valid enum value
comp.counterAxisAlignItems = 'STRETCH'
// Error: Invalid enum value. Expected 'MIN' | 'MAX' | 'CENTER' | 'BASELINE', received 'STRETCH'

// CORRECT — use 'MIN' on the parent, then set children to FILL on the cross axis
comp.counterAxisAlignItems = 'MIN'
comp.appendChild(child)
// For vertical layout, stretch width:
child.layoutSizingHorizontal = 'FILL'
// For horizontal layout, stretch height:
child.layoutSizingVertical = 'FILL'
```

## Variable collection mode limits are plan-dependent

```js
// Figma limits modes per collection based on the team/org plan:
//   Free: 1 mode only (no addMode)
//   Professional: up to 4 modes
//   Organization/Enterprise: up to 40+ modes
//
// WRONG — creating 20 modes on a Professional plan will fail silently or throw
const coll = figma.variables.createVariableCollection("Variants")
for (let i = 0; i < 20; i++) coll.addMode("mode" + i) // May fail!

// CORRECT — if you need many modes, split across multiple collections
// E.g., instead of 1 collection with 20 modes (variant×color):
//   Collection A: 4 modes (variant: plain/outlined/soft/solid)
//   Collection B: 5 modes (color: neutral/primary/danger/success/warning)
// Then use setExplicitVariableModeForCollection for BOTH on each component
```

## Variables default to `ALL_SCOPES` — always set scopes explicitly

```js
// WRONG — variable appears in every property picker (fills, text, strokes, spacing, etc.)
const bgColor = figma.variables.createVariable("Background/Default", coll, "COLOR")
// bgColor.scopes defaults to ["ALL_SCOPES"] — pollutes all dropdowns

// CORRECT — restrict to relevant property pickers
const bgColor = figma.variables.createVariable("Background/Default", coll, "COLOR")
bgColor.scopes = ["FRAME_FILL", "SHAPE_FILL"]  // fill pickers only

const textColor = figma.variables.createVariable("Text/Default", coll, "COLOR")
textColor.scopes = ["TEXT_FILL"]  // text color picker only

const borderColor = figma.variables.createVariable("Border/Default", coll, "COLOR")
borderColor.scopes = ["STROKE_COLOR"]  // stroke picker only

const spacing = figma.variables.createVariable("Space/400", coll, "FLOAT")
spacing.scopes = ["GAP"]  // gap/spacing pickers only

// Hide primitives that are only referenced via aliases
const primitive = figma.variables.createVariable("Brand/500", coll, "COLOR")
primitive.scopes = []  // hidden from all pickers
```

## Binding fills on nodes with empty fills

```js
// WRONG — binding to a node with no fills does nothing
const comp = figma.createComponent()
comp.fills = [] // transparent
// Can't bind a color variable to fills that don't exist

// CORRECT — add a placeholder SOLID fill, then bind the variable
const comp = figma.createComponent()
const basePaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }
const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, "color", colorVar)
comp.fills = [boundPaint]
// The variable's resolved value (which may be transparent) will control the actual color
```

## Mode names must be descriptive — never leave 'Mode 1'

Every new `VariableCollection` starts with one mode named `'Mode 1'`. Always rename it immediately. For single-mode collections use `'Default'`; for multi-mode collections use names from the source (e.g. `'Light'`/`'Dark'`, `'Desktop'`/`'Tablet'`/`'Mobile'`).

    // WRONG — generic names give no semantic meaning
    const coll = figma.variables.createVariableCollection('Colors')
    // coll.modes[0].name === 'Mode 1' — left as-is
    const darkId = coll.addMode('Mode 2')

    // CORRECT — rename immediately to match the source
    const coll = figma.variables.createVariableCollection('Colors')
    coll.renameMode(coll.modes[0].modeId, 'Light')   // was 'Mode 1'
    const darkId = coll.addMode('Dark')

    // For single-mode collections (primitives, spacing, etc.)
    const spacing = figma.variables.createVariableCollection('Spacing')
    spacing.renameMode(spacing.modes[0].modeId, 'Default')  // was 'Mode 1'

## CSS variable names must not contain spaces

When constructing a `var(--name)` string from a Figma variable name, replace BOTH slashes AND spaces with hyphens and convert to lowercase.

    // WRONG — only replacing slashes leaves spaces like 'var(--color-bg-brand secondary hover)'
    v.setVariableCodeSyntax('WEB', `var(--${figmaName.replace(/\//g, '-').toLowerCase()})`)

    // CORRECT — replace all whitespace and slashes in one pass
    v.setVariableCodeSyntax('WEB', `var(--${figmaName.replace(/[\s\/]+/g, '-').toLowerCase()})`)

**Best practice**: Preserve the original CSS variable name from the source token file rather than deriving it from the Figma name.

    // Preferred — use the source CSS name directly
    v.setVariableCodeSyntax('WEB', `var(${token.cssVar})`)  // e.g. '--color-bg-brand-secondary-hover'

## "no such property" errors — reading or calling members not defined on the node type

Every Figma node implements a specific set of mixins. In `use_figma`, reading or calling a non-softened property/method that isn't on the target throws `TypeError: node.X: no such property 'X' on Y node` (where `Y` is the runtime type — `TEXT`, `RECTANGLE`, `GROUP`, `PAGE`, `VECTOR`, …). Some commonly probed missing properties return `undefined`, but unsupported writes still throw. The same error fires for hallucinated API names that don't exist anywhere (e.g. `getRangeAllFontNames` — the real APIs are `getStyledTextSegments(['fontName'])` and `getRangeFontName(start, end)`).

Common shapes the bug takes — what you tried vs. where the member actually lives:
| Member | Defined on | Notably absent from |
| --- | --- | --- |
| `children`, `appendChild`, `insertChild`, `findAll`, `findOne`, `findChildren`, `findChild`, `findAllWithCriteria` | `ChildrenMixin` — container nodes (`Document`, `Page`, `Frame`, `Group`, `Component`, `ComponentSet`, `Instance`, `Section`, `BooleanOperation`) | `TEXT`, `RECTANGLE`, `VECTOR`, `ELLIPSE`, `LINE`, `STAR`, `POLYGON`, `SLICE` |
| `layoutMode`, `itemSpacing`, padding/axis-alignment (`primaryAxisAlignItems`, `counterAxisAlignItems`, `counterAxisSpacing`, `counterAxisAlignContent`, `layoutWrap`, `primaryAxisSizingMode`) | `BaseFrameMixin` / `AutoLayoutMixin` — `FRAME`, `COMPONENT`, `COMPONENT_SET`, `INSTANCE` only | `TEXT`, shapes, vectors, `GROUP`, `SECTION` |
| `fills`, `strokes`, `strokeWeight` | `GeometryMixin`/`MinimalFillsMixin` — shapes, frames, components, text, sections | `GROUP` (groups are pass-through), `PAGE`, `DOCUMENT` |
| `x`, `y`, `width`, `height`, `rotation`, `resize()` | `LayoutMixin` — every `SceneNode` | `PAGE`, `DOCUMENT` |
| `characters`, `fontName`, `fontSize`, `getStyledTextSegments`, `getRangeFontName`, `setRangeFontName`, `setRangeFontSize` | text-capable nodes (`TEXT`, `TEXT_PATH`, and text sublayers reached through `.text`) | frames, instances, and other non-text nodes |
| `description` | `COMPONENT` and `COMPONENT_SET` scene nodes | every other scene-node type; missing reads return `undefined` in `use_figma`, but writes throw |
| `createInstance` | `COMPONENT` only | every other type |
| `addComponentProperty`, `componentPropertyDefinitions` | `COMPONENT_SET`, or a non-variant `COMPONENT` (one whose parent is NOT a `COMPONENT_SET`) | every other type, **including variant `COMPONENT`s** — invoking on a variant throws `"Can only get/set component property definitions of a component set or non-variant component"`. Add properties on the variant before `combineAsVariants`, or on the parent `COMPONENT_SET` after. |
| `defaultVariant`, `variantGroupProperties` | `COMPONENT_SET` only | every other type |
| `figma.createPage` | Design files only (`figma.com/design/...`) | FigJam (`/board/`) and Slides (`/slides/`) — see Page Rules |

Verify any member you're unsure about against [plugin-api-standalone.d.ts](plugin-api-standalone.d.ts) before using it. Names that "sound plausible" but aren't in the typings will always throw — the typings are the source of truth.
For `componentPropertyDefinitions`, checking only `node.type === 'COMPONENT'` is insufficient because variants have that type too. Resolve the owner first: keep a `COMPONENT_SET`, promote a variant `COMPONENT` to its parent set, keep a non-variant `COMPONENT`, and reject every other node type. See [component-patterns.md → Component-property owner narrowing](component-patterns.md#component-property-owner-narrowing) for the owner-narrowing rule.
**Optional chaining (`?.`) does NOT defend against this.** The property access happens before `?.` is evaluated, so `node.children?.length` still throws on a `TEXT` node. The same applies to `try { node.fills }` — the access throws inside the try, which works for catching, but you should narrow up front instead.

**How to avoid:**

1. **Narrow by `node.type` before accessing type-specific surface.** `if (node.type === 'TEXT') node.getStyledTextSegments(...)`. This is the most explicit form and gives correctly-typed access in editors/typecheckers.
2. **For mixin-shaped traversal, use the `in` operator.** `if ("children" in node) for (const c of node.children) ...` — the right pattern for polymorphic helpers and generic recursion where the specific node type doesn't matter.
3. **Prefilter when possible.** `findAllWithCriteria({ types: ['TEXT'] })` returns an already-narrowed array, eliminating the need for per-iteration guards.

## Setting a non-existent property throws "object is not extensible"

Figma plugin API node objects are non-extensible — you cannot add new properties to them. Setting a property name that doesn't exist on a node type throws `"Cannot add property X, object is not extensible"` (surfaced as `"object is not extensible"`). This only fires on **write**, and only for properties not defined on that node type.

```js
// WRONG — 'strokeDashes' does not exist on VectorNode; throws "object is not extensible"
const v = figma.createVector()
v.strokeDashes = [4, 8]  // Error!

// CORRECT — the actual property is dashPattern
v.dashPattern = [4, 8]

// WRONG — any invented property name throws the same error
node.customColor = '#ff0000'  // Error — not a real API property
```

**How to avoid this**: Before setting any property, verify it exists on the node type by grepping [plugin-api-standalone.d.ts](plugin-api-standalone.d.ts). Property names that sound plausible but aren't in the typings will always throw.

## `detachInstance()` invalidates ancestor node IDs

When `detachInstance()` is called on a nested instance inside a library component instance, the parent instance may also get implicitly detached (converted from INSTANCE to FRAME with a **new ID**). Any previously cached ID for the parent becomes invalid.

```js
// WRONG — using cached parent ID after child detach
const parentId = parentInstance.id;
nestedChild.detachInstance();
const parent = await figma.getNodeByIdAsync(parentId); // null! ID changed.

// CORRECT — re-discover by traversal from a stable (non-instance) frame
const stableFrame = await figma.getNodeByIdAsync(manualFrameId);
nestedChild.detachInstance();
const parent = stableFrame.findOne(n => n.name === "ParentName");
```

If detaching multiple nested instances across siblings, do it in a **single** `use_figma` call — discover all targets by traversal before any detachment mutates the tree.

## Icons: import the SVG — never reconstruct from rotated line primitives

Rebuilding an icon out of individual `createLine()` / rectangle / ellipse primitives and rotating them is **unreliable in the `use_figma` context** — `node.rotation` pivots around the node's origin (not its center), so rotated segments drift out of place and the rendered icon comes out broken (a chevron collapses into a blob, an arrowhead detaches from its shaft). Always import the icon's SVG instead — it is both reliable and editable.

```js
// WRONG — reconstruct from rotated lines; rotation is unreliable, icon renders broken
const shaft = figma.createLine(); shaft.resize(30, 0); shaft.rotation = 90;
const barbL = figma.createLine(); barbL.resize(14, 0); barbL.rotation = 45;
const barbR = figma.createLine(); barbR.resize(14, 0); barbR.rotation = 135;

// CORRECT — import the SVG; createNodeFromSvg returns an editable FrameNode at the SVG's size
const icon = figma.createNodeFromSvg(
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M12 5v14M19 12l-7 7-7-7" stroke="#1A1A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
);
icon.resize(24, 24); // scales the whole icon — createNodeFromSvg children carry SCALE constraints
```

**Sizing:** the SVG string must include a `viewBox` plus explicit `width`/`height`. Without `width`/`height` the node falls back to the `viewBox` size, which is often smaller than the slot and reads as "the icon didn't size properly." To fit an icon to a target box, set the SVG's `width`/`height` to the target or call `icon.resize(size, size)` after import. See [figma-generate-design](../../figma-generate-design/SKILL.md) for the screen-building icon workflow.


# Loaded workflow file: figma-use/references/working-with-design-systems/wwds.md
Source snapshot SHA256: e514da78a7eed6a55c95d6b52a600bd38252bb28ad1dde689a7c72f30c99a9f8

# Working with design systems

When working with design systems in Figma, there can be many nuances when deciding how to do the right thing. Figma's model for patterns is form-agnostic, this is one of its strengths, allowing people to refer to a pattern in a spec that may take distinct forms in different codebases. However, this can result in complex procedures and nuances when translating something to Figma and back. Figma has components, tokens, and other reusable patterns (text and effect styles, prototyping actions, etc). The way that Figma's paradigms function can be difficult to translate one to one.

To make translation of patterns work between design and code forms, it is important that teams think about alignment while also embracing the function of representation (design) and implementation (production) forms independently as complementary pieces of a shared puzzle.

For the process of design, the desirable state of a system is something that is structured with experimentation in mind, something that is highly visual, easy to iterate, test, and confirm new ideas. Depending on the product and team, exploration might be mandatory to be done within the confines of an existing system, for other scenarios, exploration of new territory is the priority, a place for the system to grow into, or a new system to be made. Figma's platform allows for teams to validate, align, and collaborate on new ideas, then solidify them in product designs, which are ultimately specs. That work is supported by design libraries and that process can include code in prototypes and other less permanent forms as much as it does Figma's native paradigms.

For the process of implementation, the desirable state for production code is rigidity, efficiency, and related to secure data and functional layers. Developer experience implementing a design and the designer experience surfacing and committing to an idea are paths from distinct points of to the same shared outcome. Their optimization looks different, and that is reflected when you engage with Figma's APIs.

The key is not to avoid gaps, but to make sure they are definitively bridgable. Translation layers help agents and people go between representational and production forms.

The Figma paradigms you will need to understand when working with design systems. In each file below there will be further links to instructions for using and creating:

- [Components](wwds-components.md)
- [Variables](wwds-variables.md)
- [Effect Styles](wwds-effect-styles.md)
- [Text Styles](wwds-text-styles.md)

Things you might be asked to do with respect to design systems:

- Create patterns in Figma that match patterns in code
  - Likely (but not exclusively) to get up to speed so that visual riffing can be done in Figma
  - Create variables based on a stylesheet, JSON format, some other theme definition
  - Create Figma text styles that match a type hierarchy defined somewhere
  - Create components based on existing code components
- Sync between code and design forms
  - Making sure that Figma's concepts match a production form
- Use an existing Figma design library to create something
  - This something could be matching an existing code form, an image, or just a prompt
- Clean up a design to match some code pattern

## Things to remember

Many people will use these tools to try out ideas, and not everything you get asked to do will feel realistic for the environment you are running in. It is important to contextualize that, but then also know when you are definitively working in a production environment and there is a very real task you need to perform consistently.

Not everyone asking you to do something knows what they should be doing. You must figure out if the request is to generically perform design systems actions, uphold existing the rules that are codified in Figma or in a codebase, demonstrate an idea, enforce existing guidelines, etc.

Not every environment you are working in has the same degree of expertise and maturity. Some systems will be very complex and the priority and have a lot of things to parse through to get to the right outcome. Some scenarios will be very immature and even starting from scratch. Something as simple as creating a component could be very elementary or very sophisticated depending on the environment. The instructions you find here are attempting to be unbiased.

For example, how you reflect the "hover" state of a button could be left entirely up to you to make a reasonable decision for a user that is playing around with getting a decent example scaffolded using best practices, but it could also be something that exists definitively in the codebase and you need to go match it. That codebase definition could be refering to design tokens that do not yet exist in code that change dark and light mode values. In this second example you are now needing to do a bunch of variables work just to add a hover state to a component with proper dark and light mode support, where in the first scenario, you can kinda just do whatever is easiest. This is the line you will be walking, and making good judgement here is about doing whatever is the smartest thing in the environment you are in.


# Loaded workflow file: figma-generate-design/SKILL.md
Source snapshot SHA256: f4f05f29f69a5b4628d4574359910fea926735af78c5e264a1c4cd16f69315b0

---
name: figma-generate-design
description: "Use this skill alongside figma-use when the task involves translating an application page, view, or multi-section layout into Figma. Triggers: 'write to Figma', 'create in Figma from code', 'push page to Figma', 'take this app/page and build it in Figma', 'create a screen', 'build a landing page in Figma', 'update the Figma screen to match code', 'convert this modal/dialog/drawer/panel to Figma'. This is the preferred workflow skill whenever the user wants to build or update a full page, modal, dialog, drawer, sidebar, panel, or any composed multi-section view in Figma from code or a description. Discovers design system components, variables, and styles from Code Connect files, existing screens, and library search, then imports them and assembles views incrementally section-by-section using design system tokens instead of hardcoded values."
disable-model-invocation: false
---

# Build / Update Screens and Views from Design System

**Hard deliverable gate:** Code-to-design output must recreate the UI as editable text, components, icons, and hierarchy.
Treat any screenshot or flattened rendering of the complete UI only as a visual reference: never upload or import it into the deliverable, including as the wrapper fill or a child node, even if it exists in the repository or appears more pixel-accurate. Before completion, inspect the result; if the UI is not primarily represented by editable layers, rebuild it semantically or report failure.

Use this skill to create or update **screens, views, and multi-section UI containers** in Figma by **reusing the published design system** — components, variables, and styles — rather than drawing primitives with hardcoded values. This includes full pages, modals, dialogs, drawers, sidebars, panels, and any composed view with multiple sections. The key insight: the Figma file likely has a published design system with components, color/spacing variables, and text/effect styles that correspond to the codebase's UI components and tokens. Find and use those instead of drawing boxes with hex colors.

**MANDATORY**: You MUST also load [figma-use](../figma-use/SKILL.md) before any `use_figma` call. That skill contains critical rules (color ranges, font loading, etc.) that apply to every script you write.

**Always include `figma-generate-design` in the comma-separated `skillNames` parameter when calling `use_figma` as part of this skill. If this skill was loaded via an MCP resource, you MUST prefix the name with `resource:` (e.g. `resource:figma-generate-design`).** This is a logging parameter — it does not affect execution.

## Skill Boundaries

- Use this skill when the deliverable is a **composed Figma view** (new or updated) — full-page screens, modals, dialogs, drawers, sidebars, panels, or any multi-section container — built from design system component instances.
- If the user wants to create **new reusable components or variants**, use [figma-use](../figma-use/SKILL.md) directly.
- If the user wants to write **Code Connect mappings**, switch to [figma-code-connect](../figma-code-connect/SKILL.md).

## Prerequisites

- Figma MCP server must be connected
- The target Figma file must have a published design system with components (or access to a team library)
- User must provide a target Figma file (URL or `fileKey`). If they don't have one yet, invoke `/figma-create-new-file` (or call `create_new_file`) first and reuse the returned file_key. Both `use_figma` and `generate_figma_design` require an existing `fileKey`.
- Source code or description of the screen/view to build/update

## Parallel Workflow with generate_figma_design (Web Apps Only)

When building a screen from a **web app** that can be rendered in a browser, the best results come from running both approaches in parallel:

1. **In parallel:**
   - Start building the screen using this skill's workflow (use_figma + design system components) against the target Figma file (`fileKey`).
   - Run `generate_figma_design` against the **same `fileKey`** to capture a pixel-perfect screenshot of the running web app into that file. `generate_figma_design` always requires `fileKey` — if the user does not yet have a Figma file, first invoke `/figma-create-new-file` (or call the `create_new_file` MCP tool) to get one, and reuse that file_key for both this skill and the capture.
2. **Once both complete:** Update the use_figma output to match the pixel-perfect layout from the `generate_figma_design` capture. The capture provides the exact spacing, sizing, and visual treatment to aim for, while your use_figma output has proper component instances linked to the design system. If the capture contains images, transfer them to your use_figma output by copying `imageHash` values from the capture's image fills (see Step 5 for details).
3. **Once confirmed looking good:** Delete the `generate_figma_design` output — it was only used as a visual reference.

This combines the best of both: `generate_figma_design` gives pixel-perfect layout accuracy, while use_figma gives proper design system component instances that stay linked and updatable.

**This parallel workflow is MANDATORY when the source contains discrete content images used by the app, such as photos, avatars, logos, or icons. A screenshot or flattened rendering of the complete UI is a visual reference, not a content image.** The `use_figma` Plugin API cannot fetch external image URLs — it can only set image fills by copying `imageHash` values from nodes already in the file. `generate_figma_design` rasterizes all visible images into Figma, providing the hashes you need. If you skip the capture when these content images are present, their image frames will be left blank.

For non-web apps (iOS, Android, etc.) or when updating existing screens, use the standard workflow below.

## Required Workflow

**Follow these steps in order. Do not skip steps.**

> **Hard gates — forbidden shortcuts:**
>
> - **Forbidden:** `search_design_system` for component keys until 2a-i is complete and 2a-ii is attempted or logged N/A (e.g. "empty file, no existing screens").
> - **Forbidden:** Any `use_figma` call that mutates the canvas (Step 3+) until all Step 2 rows in the checklist below are filled in.

### Step 1: Understand the Deliverable

Before touching Figma, understand what you're building:

1. If building from code, read the relevant source files to understand the structure, sections, and which components are used.
2. Identify the major sections of the view (e.g., for a page: Header, Hero, Content Panels, Footer; for a modal: Title Bar, Form Sections, Action Bar; for a sidebar: Navigation, Content Area, Footer Actions).
3. For each section, list the UI components involved (buttons, inputs, cards, navigation pills, accordions, etc.).
4. **Identify the product's font family from the source. Do not default to Inter.** Find *which* typeface the product uses before writing any script. See [references/discover-product-font.md](references/discover-product-font.md) for where to look (CSS variables, component files) and how to resolve messy Figma font names.
5. **Check whether the view contains any images** (e.g., `<img>`, `<Image>`, background images, product photos, avatars, icons loaded from URLs). If it does and this is a web app, you **must** run the parallel `generate_figma_design` capture workflow — start it immediately alongside Step 2 so the capture runs while you discover components. See "Parallel Workflow with generate_figma_design" above.

### Step 2: Collect Component Keys, Variables, and Styles

You need three things from the design system: **components** (buttons, cards, etc.), **variables** (colors, spacing, radii), and **styles** (text styles, effect styles like shadows). Don't hardcode hex colors or pixel values when design system tokens exist.

#### 2a: Discover components


**2a-i — REQUIRED: Check Code Connect for needed components.** Starting from the component list you built in Step 1, check whether each component has a Code Connect file in the codebase. Code Connect files live next to the component source and are named by platform:

- **TypeScript/JS**: `*.figma.ts`, `*.figma.js`
- **React (parser-based)**: `*.figma.tsx`
- **Kotlin/Compose**: `.kt` files containing `@FigmaConnect`
- **Swift**: `.swift` files containing `FigmaConnect`

For each component you need (e.g., Button, Card, Input), search for its Code Connect file — glob or grep by component name (e.g., `**/Button.figma.tsx`, `**/Card.figma.ts`). Only read files that match components you actually need.

From each matching Code Connect file, extract the Figma component URL. Parse `fileKey` and `nodeId` from the URL (convert hyphens to colons: `123-456` → `123:456`). Then resolve component keys via `use_figma`:

**Example:** Code Connect file contains `// url=https://figma.com/design/ABC123/File?node-id=609-35535`. Parse `fileKey` = `ABC123`, `nodeId` = `609:35535`. Run `use_figma` against the **library file** (fileKey `ABC123`, not the target file) to resolve the key:

```js
const node = await figma.getNodeByIdAsync("609:35535");
const set = node?.parent?.type === "COMPONENT_SET" ? node.parent : node;
return { componentKey: set.key };
```

Batch multiple lookups in a single call. Use the returned keys with `importComponentSetByKeyAsync()` in Step 4.

Mark resolved components. If all components are resolved, skip 2a-ii and 2a-iii. If none of the needed components have Code Connect files, proceed to 2a-ii.

**2a-ii — REQUIRED if unresolved components remain: Inspect existing screens.** Check if the target file already contains screens using the same design system. A single `use_figma` call that walks an existing frame's instances gives you an exact, authoritative component map:

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const uniqueSets = new Map();
frame.findAllWithCriteria({ types: ["INSTANCE"] }).forEach(inst => {
  const mc = inst.mainComponent;
  const cs = mc?.parent?.type === "COMPONENT_SET" ? mc.parent : null;
  const key = cs ? cs.key : mc?.key;
  const name = cs ? cs.name : mc?.name;
  if (key && !uniqueSets.has(key)) {
    uniqueSets.set(key, { name, key, isSet: !!cs, sampleVariant: mc.name });
  }
});
return [...uniqueSets.values()];
```

Match results against your unresolved components. Mark any newly resolved. If all components are resolved, skip 2a-iii.

**2a-iii — LAST RESORT: `search_design_system`.** Only if components remain unresolved after completing both 2a-i and 2a-ii.

Before searching, call `get_libraries` to discover which libraries are available for the file. This returns two lists: libraries already added to the file and libraries available to add (community UI kits and org libraries). Each entry includes a `libraryKey` you can pass to `search_design_system` via the `includeLibraryKeys` param to scope your search to specific libraries instead of searching across everything.

```
// Step 1: Discover available libraries
get_libraries({ fileKey })
// Returns: {
//   libraries_added_to_file: [...],
//   libraries_available_to_add: [...],
//   libraries_available_to_add_next_offset: number | null
// }

// Step 2: Search within a specific library using its libraryKey
search_design_system({ queries: [{ entity: "component", query: "button" }], fileKey, includeLibraryKeys: ["lk-abc123..."] })
```

Org libraries in `libraries_available_to_add` are paginated (20 per page). When `libraries_available_to_add_next_offset` is non-null, more org libraries are available — call `get_libraries` again with `offset` set to that value to fetch the next page. Community UI kits only appear on the first page. If the user names a specific library you don't see in the current page, page further before giving up.

This is especially useful when the file has many libraries and you want targeted results (e.g. searching only within "iOS 26" or "Material 3" instead of getting matches from every library).

**Search broadly, but one intent per query** — `search_design_system` does NOT apply OR semantics, so never pack alternatives or synonyms into a single string ("Button IconButton icon" matches nothing useful). Pass each term as a component entry in one `queries` call: `{ entity: "component", query: "button" }`, `{ entity: "component", query: "input" }`, `{ entity: "component", query: "nav" }`, etc. Multi-word names and phrases are fine when they name one thing ("Material Design Icons").

**Include component properties** in your map — you need to know which TEXT properties each component exposes for text overrides. Create a temporary instance, read its `componentProperties` (and those of nested instances), then remove the temp instance.

Example component map with property info:

```
Component Map:
- Button → key: "abc123", type: COMPONENT_SET
  Properties: { "Label#2:0": TEXT, "Has Icon#4:64": BOOLEAN }
- PricingCard → key: "ghi789", type: COMPONENT_SET
  Properties: { "Device": VARIANT, "Variant": VARIANT }
  Nested "Text Heading" has: { "Text#2104:5": TEXT }
  Nested "Button" has: { "Label#2:0": TEXT }
```

#### 2b: Discover variables (colors, spacing, radii)

**Inspect existing screens first** (same as components). Or use `search_design_system` with `queries` entries whose `entity` is `"variable"`.

> **WARNING: Two different variable discovery methods — do not confuse them.**
>
> - `use_figma` with `figma.variables.getLocalVariableCollectionsAsync()` — returns **only local variables defined in the current file**. If this returns empty, it does **not** mean no variables exist. Remote/published library variables are invisible to this API.
> - `search_design_system` with `entity: "variable"` query entries — searches across **all linked libraries**, including remote and published ones. This is the correct tool for discovering design system variables.
>
> **Never conclude "no variables exist" based solely on `getLocalVariableCollectionsAsync()` returning empty.** Always also run `search_design_system` with variable query entries to check for library variables before deciding to create your own.

**Query strategy:** `search_design_system` matches against **variable names** (e.g., "Gray/gray-9", "core/gray/100", "space/400"), not categories. Put multiple short, simple searches in one `queries` call rather than one compound query. Every array entry must be an `{ "entity": "variable", "query": "..." }` object, never a bare string:

- **Primitive colors:** `{ "entity": "variable", "query": "gray" }`, `{ "entity": "variable", "query": "red" }`, etc.
- **Semantic colors:** `{ "entity": "variable", "query": "background" }`, `{ "entity": "variable", "query": "surface" }`, etc.
- **Spacing/sizing:** `{ "entity": "variable", "query": "space" }`, `{ "entity": "variable", "query": "radius" }`, etc.

If initial searches return empty, try shorter fragments or different naming conventions — libraries vary widely ("grey" vs "gray", "spacing" vs "space", "color/bg" vs "background").

Inspect an existing screen's bound variables for the most authoritative results:

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");

// boundVariables can live on any scene node — enumerating every scene type
// just to feed findAllWithCriteria is roughly the same as findAll(() => true)
// and is much noisier in script output.
const uniqueIds = new Set(
  frame.findAll(() => true).flatMap(n =>
    Object.values(n.boundVariables ?? {})
      .flatMap(b => Array.isArray(b) ? b : [b])
      .map(b => b?.id)
      .filter(Boolean)
  )
);
const variables = await Promise.all(
  [...uniqueIds].map(id => figma.variables.getVariableByIdAsync(id))
);
return variables
  .filter(Boolean)
  .map(v => ({ name: v.name, id: v.id, key: v.key, type: v.resolvedType, remote: v.remote }));
```

For library variables (remote = true), import them by key with `figma.variables.importVariableByKeyAsync(key)`. For local variables, use `figma.variables.getVariableByIdAsync(id)` directly.

See [variable-patterns.md](../figma-use/references/variable-patterns.md) for binding patterns.

#### 2c: Discover styles (text styles, effect styles)

Search for styles using `search_design_system` with `entity: "style"` query entries and terms like "heading", "body", "shadow", "elevation". Or inspect what an existing screen uses:

```js
const frame = figma.currentPage.findOne(n => n.name === "Existing Screen");
const styles = { text: new Map(), effect: new Map() };

for (const node of frame.findAll(() => true)) {
  // textStyleId is on TEXT and TEXT_PATH; effectStyleId is on most scene
  // shape/container types. Use `in` guards to handle both without an
  // exhaustive type list.
  if ('textStyleId' in node && node.textStyleId) {
    const s = figma.getStyleById(node.textStyleId);
    if (s) styles.text.set(s.id, { name: s.name, id: s.id, key: s.key });
  }
  if ('effectStyleId' in node && node.effectStyleId) {
    const s = figma.getStyleById(node.effectStyleId);
    if (s) styles.effect.set(s.id, { name: s.name, id: s.id, key: s.key });
  }
}

return {
  textStyles: [...styles.text.values()],
  effectStyles: [...styles.effect.values()]
};
```

Import library styles with `figma.importStyleByKeyAsync(key)`, then apply with `node.textStyleId = style.id` or `node.effectStyleId = style.id`.

See [text-style-patterns.md](../figma-use/references/text-style-patterns.md) and [effect-style-patterns.md](../figma-use/references/effect-style-patterns.md) for details.

### Step 3: Create the Wrapper Frame First

**Do NOT build sections as top-level page children and reparent them later** — moving nodes across `use_figma` calls with `appendChild()` silently fails and produces orphaned frames. Instead, create the wrapper first, then build each section directly inside it.

Create the wrapper in its own `use_figma` call. Position it away from existing content and return its ID:

```js
// Find clear space
let maxX = 0;
for (const child of figma.currentPage.children) {
  maxX = Math.max(maxX, child.x + child.width);
}

const wrapper = figma.createAutoLayout("VERTICAL");

// --- Size the wrapper based on container type ---
// Full page:       wrapper.resize(1440, 100); wrapper.name = "Homepage";
// Modal/dialog:    wrapper.resize(640, 100);  wrapper.name = "Settings Modal";
// Drawer/sidebar:  wrapper.resize(360, 100);  wrapper.name = "Navigation Drawer";
// Panel:           wrapper.resize(400, 100);  wrapper.name = "Details Panel";
// Adapt width to match the source code's actual dimensions.

wrapper.name = "VIEW_NAME";
wrapper.primaryAxisAlignItems = "CENTER";
wrapper.counterAxisAlignItems = "CENTER";
wrapper.resize(WIDTH, 100);
wrapper.layoutSizingHorizontal = "FIXED";
wrapper.x = maxX + 200;
wrapper.y = 0;

return { success: true, wrapperId: wrapper.id };
```

### Step 4: Build the Sections Inside the Wrapper

**This is the most important step.** Build in retry-safe construction phases: related sections may share one `use_figma` call when the resulting script is safe to retry. Split a phase only when it would cross page context, when partial execution would be hard to recover, or when an actual failure requires a targeted retry — not merely to create a validation checkpoint. At the start of each script, fetch the wrapper by ID and append new content directly to it.

```js
const createdNodeIds = [];

// Resolve the wrapper and import every design system dependency in parallel.
// Sequential awaits here serialize N independent IPC round-trips at the top
// of every section build; one Promise.all is dramatically faster.
const [wrapper, buttonSet, bgColorVar, spacingVar, shadowStyle] = await Promise.all([
  figma.getNodeByIdAsync("WRAPPER_ID_FROM_STEP_3"),
  figma.importComponentSetByKeyAsync("BUTTON_SET_KEY"),
  figma.variables.importVariableByKeyAsync("BG_COLOR_VAR_KEY"),
  figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY"),
  figma.importStyleByKeyAsync("SHADOW_STYLE_KEY"),
]);
const primaryButton = buttonSet.children.find(c =>
  c.type === "COMPONENT" && c.name.includes("variant=primary")
) || buttonSet.defaultVariant;

// Build section frame with variable bindings (not hardcoded values)
const section = figma.createAutoLayout();
section.name = "Header";
section.setBoundVariable("paddingLeft", spacingVar);
section.setBoundVariable("paddingRight", spacingVar);
const bgPaint = figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', bgColorVar
);
section.fills = [bgPaint];

// Apply the effect style imported above
section.effectStyleId = shadowStyle.id;

// Create component instances inside the section
const btnInstance = primaryButton.createInstance();
section.appendChild(btnInstance);
createdNodeIds.push(btnInstance.id);

// Append section to wrapper
wrapper.appendChild(section);
section.layoutSizingHorizontal = "FILL"; // AFTER appending

createdNodeIds.push(section.id);
return { success: true, createdNodeIds };
```

Return the created node IDs plus the relevant counts, names, and bounds from each call — this is your default structural validation. Run a separate structural read only when that evidence is missing or when a relevant mutation has invalidated it. Save the visual pass for Step 5.

#### Override instance text with setProperties()

Component instances ship with placeholder text ("Title", "Heading", "Button"). Use the component property keys you discovered in Step 2 to override them with `setProperties()` — this is more reliable than direct `node.characters` manipulation. See [component-patterns.md](../figma-use/references/component-patterns.md#overriding-text-in-a-component-instance) for the full pattern.

For nested instances that expose their own TEXT properties, call `setProperties()` on the nested instance:

```js
// Use the type-indexed criteria for the type filter, then narrow by name.
const nestedHeading = cardInstance
  .findAllWithCriteria({ types: ["INSTANCE"] })
  .find(n => n.name === "Text Heading");
if (nestedHeading) {
  nestedHeading.setProperties({ "Text#2104:5": "Actual heading from source code" });
}
```

Only fall back to direct `node.characters` for text that is NOT managed by any component property.

#### Read source code defaults carefully

When translating code components to Figma instances, check the component's default prop values in the source code, not just what's explicitly passed. For example, `<Button size="small">Register</Button>` with no variant prop — check the component definition to find `variant = "primary"` as the default. Selecting the wrong variant (e.g., Neutral instead of Primary) produces a visually incorrect result that's easy to miss.

#### What to build manually vs. import from design system

| Build manually | Import from design system |
|----------------|--------------------------|
| Wrapper frame | **Components**: buttons, cards, inputs, nav, etc. |
| Section container frames | **Variables**: colors (fills, strokes), spacing (padding, gap), radii |
| Layout grids (rows, columns) | **Text styles**: heading, body, caption, etc. |
| | **Effect styles**: shadows, blurs, etc. |

**Never hardcode hex colors or pixel spacing** when a design system variable exists. Use `setBoundVariable` for spacing/radii and `setBoundVariableForPaint` for colors. Apply text styles with `node.textStyleId` and effect styles with `node.effectStyleId`.

#### Componentize repeated and reusable elements (required)

Componentization is part of the **default** workflow, not an optional follow-up. Produce a componentized structure on the first pass; do not emit a flat tree of one-off frames and wait for a second "now make it componentized" prompt.

- **Design-system instances are already componentized** (Step 2). Prefer them.
- **For anything the design system does not cover that repeats or maps to a reusable source component, create a local component once with `figma.createComponent()` and place instances**, instead of hand-building N near-identical frames. One source component maps to one Figma main component.

See [references/componentization.md](references/componentization.md) for the build-once-place-instances pattern and code.

#### Icons: import the SVG, never reconstruct from rotated primitives

Icons are the **main exception to the build-manually-vs-import split above.** If the design system exposes an icon as a component, instance it (a single INSTANCE_SWAP property, not a variant per icon). Otherwise — most commonly when **grabbing an icon from the codebase to place or replace it in Figma** — import the icon's **SVG source directly** as a vector node. This is the primary, default path for icons; do not redraw them.

1. **Get the SVG from the codebase.** Read the icon's source — inline `<svg>`, the imported `.svg` asset, or the icon-library entry — and pass that exact SVG string. Prefer the codebase's own SVG over hand-authoring one.
2. **Import with `figma.createNodeFromSvg(svgString)`**, which returns a `FrameNode` of editable vector paths. The SVG string **must** include a `viewBox` plus explicit `width`/`height` (e.g. `<svg width="24" height="24" viewBox="0 0 24 24" ...>`). Without `width`/`height` it falls back to the `viewBox` size, which is often smaller than the slot — the usual cause of "the icon didn't size properly."
3. **Size it to the slot.** `createNodeFromSvg` frames scale their contents on resize, so `icon.resize(size, size)` fits the whole icon (stroke weight included) to the target box. Equivalently author `width`/`height` equal to the target. Match the source's icon size — commonly 16/20/24px.
4. **Never reconstruct an icon from rotated line/rect/ellipse primitives.** Figma's line rotation is unreliable in the `use_figma` context and produces broken, mis-rotated icons (a chevron collapses into a blob, an arrowhead detaches from its shaft). Importing the SVG is both more reliable and more editable.

```js
// Place / replace an icon from a codebase SVG into a 24px slot
const icon = figma.createNodeFromSvg(
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="m9 18 6-6-6-6" stroke="#1A1A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
);
icon.name = "icon/chevron-right";
icon.resize(24, 24);          // scales the whole icon to the slot
slotFrame.appendChild(icon);
```

**Codebase SVGs usually use `currentColor`** (e.g. `stroke="currentColor"` / `fill="currentColor"`), which `createNodeFromSvg` imports as **black** — it does not inherit the parent's color. Set the intended color after import: substitute the literal color into the SVG string before importing, or bind the imported vector fills/strokes to a design-system color variable with `setBoundVariableForPaint` (same as any paint). To turn an imported SVG into a reusable icon component (for INSTANCE_SWAP), see [figma-generate-library → Creating Icon Components](../figma-generate-library/references/component-creation.md) and the [INSTANCE_SWAP pattern](../figma-use/references/component-patterns.md#instance_swap-avoiding-variant-explosion).

### Step 5: Validate the Full View and Transfer Images

Before visual validation, use `use_figma` to read back the wrapper and return its total descendant count, counts for every descendant node type present, and the ID, name, node type, and dimensions of every image-filled node. These counts are evidence, not a numeric pass threshold; do not infer editability from a screenshot or accept token editable nodes layered over a complete-UI raster. If a screenshot or flattened rendering of the complete UI is present anywhere inside the wrapper, remove it and rebuild the UI semantically or report failure; do not claim completion.

After composing all sections, take **one full-view composition screenshot** of the wrapper frame and compare against the source. If it reveals a meaningful visual defect, apply targeted `use_figma` fixes — don't rebuild the entire view — then take **one** post-fix screenshot. The most recent passing screenshot is the final check: do not take an additional unchanged "final" shot, and do not screenshot every section individually.

Inspect the composition screenshot for:
- **Cropped/clipped text** — line heights or frame sizing cutting off descenders, ascenders, or entire lines
- **Overlapping content** — elements stacking on top of each other due to incorrect sizing or missing auto-layout
- Placeholder text still showing ("Title", "Heading", "Button")
- Truncated content from layout sizing bugs
- Wrong component variants (e.g., Neutral vs Primary button)
- **Wrong font family** — text rendered in a different typeface than the product uses (e.g. Inter where the product is SF Pro). The script ran without error, so this is invisible at a glance; assert it explicitly (see "Assert the font family is correct" below)
- **Blank image placeholders** — if images are missing, you need to transfer them from the `generate_figma_design` capture (see below)

#### Assert the font family is correct

**You MUST explicitly assert that rendered text uses the product font(s) identified in Step 1**, and treat any mismatch as a failed validation. Do not assume a successfully loaded font is the correct font: loading Inter when the product uses SF Pro is a failure even if no errors occur. **If you have a source reference (the running web app, a design mock, or the `generate_figma_design` capture), you MUST also compare rendered screenshots** — a near-miss style within the right family can pass a family check but still look wrong.

See [references/discover-product-font.md](references/discover-product-font.md#verify-the-font-after-building) for the read-back script (which separates free-standing text you fix from design-system-governed text you flag) and the screenshot-comparison steps.

#### Transfer images from the generate_figma_design capture

If you ran `generate_figma_design` in parallel, transfer only discrete content assets used by the app into your design system output. Never upload or transfer the capture root or any screenshot or flattened rendering of the complete UI.

1. Find all image nodes in the capture output by searching for fills with `type === "IMAGE"`:
   ```js
   const capture = await figma.getNodeByIdAsync("CAPTURE_NODE_ID");
   const imageNodes = capture.findAll(() => true).flatMap(n => {
     if (!Array.isArray(n.fills)) return [];
     const imageFill = n.fills.find(f => f.type === "IMAGE");
     return imageFill ? [{ name: n.name, id: n.id, imageHash: imageFill.imageHash }] : [];
   });
   return imageNodes;
   ```
2. Match each captured image to the corresponding frame in your use_figma output (by position, name, or order).
3. Apply the image hash to the target frame:
   ```js
   targetFrame.fills = [{ type: "IMAGE", imageHash: "hash_from_capture", scaleMode: "FILL" }];
   ```
4. Delete the `generate_figma_design` capture output after all images are transferred.

### Step 6: Updating an Existing View

When updating rather than creating from scratch:

1. Use `get_metadata` to inspect the existing screen structure.
2. Identify which sections need updating and which can stay.
3. For each section that needs changes:
   - Locate the existing nodes by ID or name
   - Swap component instances if the design system component changed
   - Update text content, variant properties, or layout as needed
   - Remove deprecated sections
   - Add new sections
4. Follow the same evidence and screenshot cadence as Steps 4–5: rely on returned IDs plus relevant counts, names, and bounds for structural validation, then take one full-view screenshot after the updates (and one post-fix screenshot only if a targeted visual fix is needed).

```js
// Example: Swap a button variant in an existing screen.
// Batch the node lookup and component-set import in parallel — they are
// independent and awaiting them sequentially serializes two IPC round-trips.
const [existingButton, buttonSet] = await Promise.all([
  figma.getNodeByIdAsync("EXISTING_BUTTON_INSTANCE_ID"),
  figma.importComponentSetByKeyAsync("BUTTON_SET_KEY"),
]);
if (existingButton && existingButton.type === "INSTANCE") {
  const newVariant = buttonSet.children.find(c =>
    c.name.includes("variant=primary") && c.name.includes("size=lg")
  ) || buttonSet.defaultVariant;
  existingButton.swapComponent(newVariant);
}
return { success: true, mutatedNodeIds: [existingButton.id] };
```

## Reference Docs

For detailed API patterns and gotchas, load these from the [figma-use](../figma-use/SKILL.md) references as needed:

- [component-patterns.md](../figma-use/references/component-patterns.md) — importing by key, finding variants, setProperties, text overrides, working with instances
- [variable-patterns.md](../figma-use/references/variable-patterns.md) — creating/binding variables, importing library variables, scopes, aliasing, discovering existing variables
- [text-style-patterns.md](../figma-use/references/text-style-patterns.md) — creating/applying text styles, importing library text styles, type ramps
- [effect-style-patterns.md](../figma-use/references/effect-style-patterns.md) — creating/applying effect styles (shadows), importing library effect styles
- [gotchas.md](../figma-use/references/gotchas.md) — layout pitfalls (HUG/FILL interactions, counterAxisAlignItems, sizing order), paint/color issues, page context resets

## Error Recovery

Follow [figma-use error recovery](../figma-use/SKILL.md#7-error-recovery--self-correction):

- If `safeToRetryWithoutCanvasRead` is `true`, fix the error and retry.
- If `false`, read the canvas, determine what changed, then make changes.

Because this skill works in retry-safe construction phases, errors are naturally scoped to the current phase. Content from previous successful calls remains intact.

## Best Practices

- **Always search before building.** The design system likely has the component, variable, or style you need. Manual construction and hardcoded values should be the exception, not the rule.
- **Search broadly, one intent per query.** Try synonyms and partial terms as separate `{ entity, query }` entries in one `queries` call, never combined into one string — a "NavigationPill" might be found under "pill", "nav", "tab", or "chip", so pass those as four component entries. For variables, use `entity: "variable"` with queries like "color", "spacing", "radius", etc.
- **Prefer design system tokens over hardcoded values.** Use variable bindings for colors, spacing, and radii. Use text styles for typography. Use effect styles for shadows. This keeps the screen linked to the design system.
- **Prefer component instances over manual builds.** Instances stay linked to the source component and update automatically when the design system evolves.
- **Componentize by default.** Build repeated or reusable elements as a component once, then place instances. Do not ship a flat tree of one-off frames that needs a second "make it componentized" pass.
- **Work in retry-safe construction phases.** Batch related sections into one `use_figma` call when the script stays safe to retry; split only at page-context boundaries, hard-to-recover mutations, or a targeted retry after an actual failure.
- **Return node IDs and validation evidence from every call.** Return created IDs plus the relevant counts, names, and bounds — this is your default structural validation, and you'll need the IDs to compose sections and for error recovery.
- **Validate visually with one composition screenshot.** Take one full-view screenshot after composition, and one more only after a targeted visual fix; the most recent passing screenshot is final.
- **Assert the font family, not just a successful load.** A script can load the wrong font without error. After building, verify rendered text uses the product font identified in Step 1 (see Step 5).
- **Match existing conventions.** If the file already has screens, match their naming, sizing, and layout patterns.


# Loaded workflow file: figma-generate-design/references/discover-product-font.md
Source snapshot SHA256: 87858089c77f71d478d0233b89498e3589ff14556b0cd503f6a3faf5941f643a

# Discover and verify the product font

This covers both ends of getting the font right: **discovering** which font the product uses (before you build) and **verifying** the rendered output uses it (during validation).

## Discover the product font

The product renders text in a specific typeface. Identify **which font the product uses** from the source before writing any `use_figma` script. Do **not** default to Inter.

`figma.listAvailableFontsAsync()` answers "is font X available in this file?". It does **not** tell you what font the product uses. Use it only *after* you know the family, to resolve the exact style strings.

Search the source for the font, in priority order. The strongest signals are usually CSS and component files, not a standalone token file:

1. **CSS / styling**: `font-family` declarations and custom properties (`--font-*`, `--font-family-*`) in CSS/SCSS, Tailwind config (`theme.fontFamily`), `styled-components`/Emotion themes, global stylesheets.
2. **Component files**: `fontFamily` props/styles on text components, design-token modules, theme objects (`theme.typography.fontFamily`), and platform defaults (e.g. iOS uses SF Pro, Android uses Roboto).
3. **Token JSON**: a `fontFamily` entry in a design-tokens file. This is often **absent**, so do not conclude "no font is specified" just because there is no token JSON.

Inter is a tempting fallback because it is reliably available with predictable styles (Regular/Medium/Semi Bold), but using it when the product uses something else (e.g. SF Pro) produces a wrong-but-runnable result that is easy to miss. Only use Inter if the source genuinely specifies no font.

Once you know the family, resolve it against `listAvailableFontsAsync()`. Real font names are often messy and will not match a clean guess. The product's "SF Pro", for example, can surface in Figma as family `"SF Pro"` with styles like `"Compressed Medium"`, not a tidy `"SF Pro Text"` / `"Regular"`. Match the actual available family plus the style closest to the product's weight, rather than silently substituting Inter because its names are cleaner.

## Verify the font after building

After building, read back the actual font on every text node and compare it against the product's expected families. The script runs without error when the font is wrong, so a mismatch is invisible at a glance — assert it explicitly and treat any mismatch as a failed validation.

```js
// Verify rendered text uses the product font(s) discovered above.
const wrapper = await figma.getNodeByIdAsync("WRAPPER_ID");
// The product font(s) — NOT a default like "Inter". Include every family the
// product legitimately uses (e.g. a primary plus a mono for code).
const EXPECTED_FAMILIES = new Set(["SF Pro", "SF Mono"]);

// Text governed by the design system — inside an instance, or carrying a
// published text style — sets its own family. Flag mismatches there as a
// library gap; don't override them.
const inInstance = (node) => {
  for (let p = node.parent; p; p = p.parent) if (p.type === "INSTANCE") return true;
  return false;
};

const offenders = []; // free-standing text you built — fix these
const dsGaps = [];     // design-system-governed text (instance or text style) — flag, don't override
for (const node of wrapper.findAll(n => n.type === "TEXT")) {
  for (const seg of node.getStyledTextSegments(["fontName", "textStyleId"])) {
    if (EXPECTED_FAMILIES.has(seg.fontName.family)) continue;
    const governed = seg.textStyleId !== "" || inInstance(node);
    (governed ? dsGaps : offenders)
      .push({ id: node.id, name: node.name, family: seg.fontName.family });
  }
}
return { expected: [...EXPECTED_FAMILIES], offenders, dsGaps };
```

If `offenders` is non-empty, free-standing text you built is in the wrong font. Fix those nodes (load the correct family/style, then set `fontName` per the canonical text-edit recipe in [figma-use](../../figma-use/SKILL.md)) before finishing. `dsGaps` is handled differently: text inside a design-system **instance**, or carrying a published **text style**, is governed by the library and may legitimately use a different family (e.g. a mono style for code), so flag those as a design-system gap rather than forcing an override onto them.

If you have a source reference (the running web app, a design mock, or the `generate_figma_design` capture), also compare rendered screenshots:

1. Screenshot the built view and compare typography side by side: letterforms, weight, and metrics.
2. Fix any issues. A visual diff catches subtle substitutions a pass/fail family check misses, such as a near-miss style ("Compressed Medium" vs the intended weight) within the right family.


# Loaded workflow file: figma-use/references/plugin-api-standalone.d.ts
Complete API declarations; documentation comments omitted. Every type and method signature is retained.

```typescript
interface PluginAPI {
    readonly apiVersion: '1.0.0';
    readonly command: string;
    readonly editorType: 'figma' | 'figjam' | 'dev' | 'slides' | 'buzz';
    readonly pluginId?: string;
    readonly widgetId?: string;
    readonly fileKey: string | undefined;
    skipInvisibleInstanceChildren: boolean;
    readonly viewport: ViewportAPI;
    closePlugin(message?: string): void;
    readonly util: UtilAPI;
    readonly parameters: ParametersAPI;
    readonly motion: MotionAPI;
    getNodeByIdAsync(id: string): Promise<BaseNode | null>;
    getStyleByIdAsync(id: string): Promise<BaseStyle | null>;
    readonly variables: VariablesAPI;
    readonly teamLibrary: TeamLibraryAPI;
    readonly annotations: AnnotationsAPI;
    readonly root: DocumentNode;
    currentPage: PageNode;
    setCurrentPageAsync(page: PageNode): Promise<void>;
    readonly mixed: unique symbol;
    createRectangle(): RectangleNode;
    createLine(): LineNode;
    createEllipse(): EllipseNode;
    createPolygon(): PolygonNode;
    createStar(): StarNode;
    createVector(): VectorNode;
    createText(): TextNode;
    createFrame(): FrameNode;
    createAutoLayout(direction?: 'HORIZONTAL' | 'VERTICAL'): FrameNode;
    createComponent(): ComponentNode;
    createComponentFromNode(node: SceneNode): ComponentNode;
    createPage(): PageNode;
    createPageDivider(dividerName?: string): PageNode;
    createSlice(): SliceNode;
    createSlide(row?: number, col?: number): SlideNode;
    createSlideRow(row?: number): SlideRowNode;
    createSticky(): StickyNode;
    createConnector(): ConnectorNode;
    createShapeWithText(): ShapeWithTextNode;
    createCodeBlock(): CodeBlockNode;
    createSection(): SectionNode;
    createTable(numRows?: number, numColumns?: number): TableNode;
    createTextPath(node: VectorNode, startSegment: number, startPosition: number): TextPathNode;
    createPaintStyle(): PaintStyle;
    createTextStyle(): TextStyle;
    createEffectStyle(): EffectStyle;
    createGridStyle(): GridStyle;
    getLocalPaintStylesAsync(): Promise<PaintStyle[]>;
    getLocalTextStylesAsync(): Promise<TextStyle[]>;
    getLocalEffectStylesAsync(): Promise<EffectStyle[]>;
    getLocalGridStylesAsync(): Promise<GridStyle[]>;
    moveLocalPaintStyleAfter(targetNode: PaintStyle, reference: PaintStyle | null): void;
    moveLocalTextStyleAfter(targetNode: TextStyle, reference: TextStyle | null): void;
    moveLocalEffectStyleAfter(targetNode: EffectStyle, reference: EffectStyle | null): void;
    moveLocalGridStyleAfter(targetNode: GridStyle, reference: GridStyle | null): void;
    moveLocalPaintFolderAfter(targetFolder: string, reference: string | null): void;
    moveLocalTextFolderAfter(targetFolder: string, reference: string | null): void;
    moveLocalEffectFolderAfter(targetFolder: string, reference: string | null): void;
    moveLocalGridFolderAfter(targetFolder: string, reference: string | null): void;
    importComponentByKeyAsync(key: string): Promise<ComponentNode>;
    importComponentSetByKeyAsync(key: string): Promise<ComponentSetNode>;
    importStyleByKeyAsync(key: string): Promise<BaseStyle>;
    listAvailableShaders(): Promise<Shader[]>;
    importShaderById(id: string): Promise<Shader>;
    listAvailableFontsAsync(): Promise<Font[]>;
    loadFontAsync(fontName: FontNameInput): Promise<void>;
    getFontFamilyVariationAxes(family: string): string[] | null;
    readonly hasMissingFont: boolean;
    createNodeFromSvg(svg: string): FrameNode;
    createImage(data: Uint8Array): Image;
    getImageByHash(hash: string): Image | null;
    combineAsVariants(nodes: ReadonlyArray<ComponentNode>, parent: BaseNode & ChildrenMixin, index?: number): ComponentSetNode;
    group(nodes: ReadonlyArray<BaseNode>, parent: BaseNode & ChildrenMixin, index?: number): GroupNode;
    transformGroup(nodes: ReadonlyArray<SceneNode>, parent: BaseNode & ChildrenMixin, index: number, modifiers: TransformModifier[]): TransformGroupNode;
    flatten(nodes: ReadonlyArray<BaseNode>, parent?: BaseNode & ChildrenMixin, index?: number): VectorNode;
    union(nodes: ReadonlyArray<BaseNode>, parent: BaseNode & ChildrenMixin, index?: number): BooleanOperationNode;
    subtract(nodes: ReadonlyArray<BaseNode>, parent: BaseNode & ChildrenMixin, index?: number): BooleanOperationNode;
    intersect(nodes: ReadonlyArray<BaseNode>, parent: BaseNode & ChildrenMixin, index?: number): BooleanOperationNode;
    exclude(nodes: ReadonlyArray<BaseNode>, parent: BaseNode & ChildrenMixin, index?: number): BooleanOperationNode;
    ungroup(node: SceneNode & ChildrenMixin): Array<SceneNode>;
    base64Encode(data: Uint8Array): string;
    base64Decode(data: string): Uint8Array;
    getCanvasGrid(): Array<Array<SceneNode>>;
    setCanvasGrid(canvasGrid: Array<Array<SceneNode>>): void;
    createCanvasRow(rowIndex?: number): SceneNode;
    loadBrushesAsync(brushType: 'STRETCH' | 'SCATTER'): Promise<void>;
}
interface VariablesAPI {
    getVariableByIdAsync(id: string): Promise<Variable | null>;
    getVariableCollectionByIdAsync(id: string): Promise<VariableCollection | null>;
    getLocalVariablesAsync(type?: VariableResolvedDataType): Promise<Variable[]>;
    getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
    createVariable(name: string, collection: VariableCollection, resolvedType: VariableResolvedDataType): Variable;
    createVariableCollection(name: string): VariableCollection;
    extendLibraryCollectionByKeyAsync(collectionKey: string, name: string): Promise<ExtendedVariableCollection>;
    createVariableAlias(variable: Variable): VariableAlias;
    createVariableAliasByIdAsync(variableId: string): Promise<VariableAlias>;
    setBoundVariableForPaint(paint: SolidPaint, field: VariableBindablePaintField, variable: Variable | null): SolidPaint;
    setBoundVariableForEffect(effect: Effect, field: VariableBindableEffectField, variable: Variable | null): Effect;
    setBoundVariableForLayoutGrid(layoutGrid: LayoutGrid, field: VariableBindableLayoutGridField, variable: Variable | null): LayoutGrid;
    importVariableByKeyAsync(key: string): Promise<Variable>;
}
interface LibraryVariableCollection {
    name: string;
    key: string;
    libraryName: string;
}
interface LibraryVariable {
    name: string;
    key: string;
    resolvedType: VariableResolvedDataType;
}
interface AnnotationsAPI {
    getAnnotationCategoriesAsync(): Promise<AnnotationCategory[]>;
    getAnnotationCategoryByIdAsync(id: string): Promise<AnnotationCategory | null>;
    addAnnotationCategoryAsync(categoryInput: {
        label: string;
        color: AnnotationCategoryColor;
    }): Promise<AnnotationCategory>;
}
interface BuzzTextField {
    readonly value: string | null;
    readonly node: TextNode | null;
    setValueAsync(value: string): Promise<void>;
}
interface BuzzMediaField {
    readonly type: 'IMAGE' | 'VIDEO' | null;
    readonly hash: string | null;
    readonly node: SceneNode | null;
    setMediaAsync(paint: ImagePaint | VideoPaint): Promise<void>;
}
interface TeamLibraryAPI {
    getAvailableLibraryVariableCollectionsAsync(): Promise<LibraryVariableCollection[]>;
    getVariablesInLibraryCollectionAsync(libraryCollectionKey: string): Promise<LibraryVariable[]>;
}
interface MotionAPI {
    figmaAnimationStyles(): AvailableAnimationStyle[];
    physicalSpringToNormalized(spring: PhysicalSpring): number;
}
interface UtilAPI {
    rgb(color: string | RGB | RGBA): RGB;
    rgba(color: string | RGB | RGBA): RGBA;
    solidPaint(color: string | RGB | RGBA, overrides?: Partial<SolidPaint>): SolidPaint;
    normalizeMarkdown(markdown: string): string;
    getSfSymbolCharacter(name: string): string;
}
interface ViewportAPI {
    center: Vector;
    zoom: number;
    scrollAndZoomIntoView(nodes: ReadonlyArray<BaseNode>): void;
    readonly bounds: Rect;
}
interface SuggestionResults {
    setSuggestions(suggestions: Array<string | {
        name: string;
        data?: any;
        icon?: string | Uint8Array;
        iconUrl?: string;
    }>): void;
    setError(message: string): void;
    setLoadingMessage(message: string): void;
}
interface ParametersAPI {
}
type NodeChangeProperty = 'pointCount' | 'name' | 'width' | 'height' | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight' | 'parent' | 'pluginData' | 'constraints' | 'locked' | 'visible' | 'opacity' | 'blendMode' | 'layoutGrids' | 'guides' | 'characters' | 'openTypeFeatures' | 'styledTextSegments' | 'vectorNetwork' | 'effects' | 'exportSettings' | 'arcData' | 'autoRename' | 'fontName' | 'innerRadius' | 'fontSize' | 'lineHeight' | 'leadingTrim' | 'paragraphIndent' | 'paragraphSpacing' | 'textWrapStyle' | 'listSpacing' | 'hangingPunctuation' | 'hangingList' | 'letterSpacing' | 'textAlignHorizontal' | 'textAlignVertical' | 'textCase' | 'textDecoration' | 'textAutoResize' | 'textTruncation' | 'maxLines' | 'fills' | 'topLeftRadius' | 'topRightRadius' | 'bottomLeftRadius' | 'bottomRightRadius' | 'constrainProportions' | 'strokes' | 'strokeWeight' | 'strokeAlign' | 'strokeCap' | 'strokeJoin' | 'strokeMiterLimit' | 'booleanOperation' | 'overflowDirection' | 'dashPattern' | 'backgrounds' | 'handleMirroring' | 'cornerRadius' | 'cornerSmoothing' | 'relativeTransform' | 'x' | 'y' | 'rotation' | 'isMask' | 'maskType' | 'clipsContent' | 'type' | 'overlayPositionType' | 'overlayBackgroundInteraction' | 'overlayBackground' | 'prototypeStartNode' | 'prototypeBackgrounds' | 'expanded' | 'fillStyleId' | 'strokeStyleId' | 'backgroundStyleId' | 'textStyleId' | 'effectStyleId' | 'gridStyleId' | 'description' | 'layoutMode' | 'layoutWrap' | 'paddingLeft' | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'itemSpacing' | 'counterAxisSpacing' | 'layoutAlign' | 'counterAxisSizingMode' | 'primaryAxisSizingMode' | 'primaryAxisAlignItems' | 'counterAxisAlignItems' | 'counterAxisAlignContent' | 'layoutGrow' | 'layoutPositioning' | 'itemReverseZIndex' | 'hyperlink' | 'mediaData' | 'stokeTopWeight' | 'strokeBottomWeight' | 'strokeLeftWeight' | 'strokeRightWeight' | 'reactions' | 'flowStartingPoints' | 'shapeType' | 'connectorStart' | 'connectorEnd' | 'connectorLineType' | 'connectorStartStrokeCap' | 'connectorEndStrokeCap' | 'codeLanguage' | 'widgetSyncedState' | 'componentPropertyDefinitions' | 'componentPropertyReferences' | 'componentProperties' | 'embedData' | 'linkUnfurlData' | 'text' | 'authorVisible' | 'authorName' | 'code' | 'textBackground' | 'gridAutoTracks' | 'gridItemsPositioning' | 'animationStyles' | 'animations' | 'manualKeyframeTracks';
type Transform = [
    [
        number,
        number,
        number
    ],
    [
        number,
        number,
        number
    ]
];
interface Vector {
    readonly x: number;
    readonly y: number;
}
interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
interface RGB {
    readonly r: number;
    readonly g: number;
    readonly b: number;
}
interface RGBA {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}
interface FontName {
    readonly family: string;
    readonly style: string;
    readonly variationSettings?: FontVariationSettings;
}
interface FontVariationSettings {
    readonly [axis: string]: number;
}
interface FontNameInput {
    readonly family: string;
    readonly style?: string;
    readonly variationSettings?: FontVariationSettings;
}
type TextCase = 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED';
type TextDecoration = 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';
type TextDecorationStyle = 'SOLID' | 'WAVY' | 'DOTTED';
type FontStyle = 'REGULAR' | 'ITALIC';
type TextDecorationOffset = {
    readonly value: number;
    readonly unit: 'PIXELS' | 'PERCENT';
} | {
    readonly unit: 'AUTO';
};
type TextDecorationThickness = {
    readonly value: number;
    readonly unit: 'PIXELS' | 'PERCENT';
} | {
    readonly unit: 'AUTO';
};
type TextDecorationColor = {
    readonly value: SolidPaint;
} | {
    readonly value: 'AUTO';
};
type OpenTypeFeature = 'PCAP' | 'C2PC' | 'CASE' | 'CPSP' | 'TITL' | 'UNIC' | 'ZERO' | 'SINF' | 'ORDN' | 'AFRC' | 'DNOM' | 'NUMR' | 'LIGA' | 'CLIG' | 'DLIG' | 'HLIG' | 'RLIG' | 'AALT' | 'CALT' | 'RCLT' | 'SALT' | 'RVRN' | 'VERT' | 'SWSH' | 'CSWH' | 'NALT' | 'CCMP' | 'STCH' | 'HIST' | 'SIZE' | 'ORNM' | 'ITAL' | 'RAND' | 'DTLS' | 'FLAC' | 'MGRK' | 'SSTY' | 'KERN' | 'FWID' | 'HWID' | 'HALT' | 'TWID' | 'QWID' | 'PWID' | 'JUST' | 'LFBD' | 'OPBD' | 'RTBD' | 'PALT' | 'PKNA' | 'LTRA' | 'LTRM' | 'RTLA' | 'RTLM' | 'ABRV' | 'ABVM' | 'ABVS' | 'VALT' | 'VHAL' | 'BLWF' | 'BLWM' | 'BLWS' | 'AKHN' | 'CJCT' | 'CFAR' | 'CPCT' | 'CURS' | 'DIST' | 'EXPT' | 'FALT' | 'FINA' | 'FIN2' | 'FIN3' | 'HALF' | 'HALN' | 'HKNA' | 'HNGL' | 'HOJO' | 'INIT' | 'ISOL' | 'JP78' | 'JP83' | 'JP90' | 'JP04' | 'LJMO' | 'LOCL' | 'MARK' | 'MEDI' | 'MED2' | 'MKMK' | 'NLCK' | 'NUKT' | 'PREF' | 'PRES' | 'VPAL' | 'PSTF' | 'PSTS' | 'RKRF' | 'RPHF' | 'RUBY' | 'SMPL' | 'TJMO' | 'TNAM' | 'TRAD' | 'VATU' | 'VJMO' | 'VKNA' | 'VKRN' | 'VRTR' | 'VRT2' | 'SS01' | 'SS02' | 'SS03' | 'SS04' | 'SS05' | 'SS06' | 'SS07' | 'SS08' | 'SS09' | 'SS10' | 'SS11' | 'SS12' | 'SS13' | 'SS14' | 'SS15' | 'SS16' | 'SS17' | 'SS18' | 'SS19' | 'SS20' | 'CV01' | 'CV02' | 'CV03' | 'CV04' | 'CV05' | 'CV06' | 'CV07' | 'CV08' | 'CV09' | 'CV10' | 'CV11' | 'CV12' | 'CV13' | 'CV14' | 'CV15' | 'CV16' | 'CV17' | 'CV18' | 'CV19' | 'CV20' | 'CV21' | 'CV22' | 'CV23' | 'CV24' | 'CV25' | 'CV26' | 'CV27' | 'CV28' | 'CV29' | 'CV30' | 'CV31' | 'CV32' | 'CV33' | 'CV34' | 'CV35' | 'CV36' | 'CV37' | 'CV38' | 'CV39' | 'CV40' | 'CV41' | 'CV42' | 'CV43' | 'CV44' | 'CV45' | 'CV46' | 'CV47' | 'CV48' | 'CV49' | 'CV50' | 'CV51' | 'CV52' | 'CV53' | 'CV54' | 'CV55' | 'CV56' | 'CV57' | 'CV58' | 'CV59' | 'CV60' | 'CV61' | 'CV62' | 'CV63' | 'CV64' | 'CV65' | 'CV66' | 'CV67' | 'CV68' | 'CV69' | 'CV70' | 'CV71' | 'CV72' | 'CV73' | 'CV74' | 'CV75' | 'CV76' | 'CV77' | 'CV78' | 'CV79' | 'CV80' | 'CV81' | 'CV82' | 'CV83' | 'CV84' | 'CV85' | 'CV86' | 'CV87' | 'CV88' | 'CV89' | 'CV90' | 'CV91' | 'CV92' | 'CV93' | 'CV94' | 'CV95' | 'CV96' | 'CV97' | 'CV98' | 'CV99';
interface ArcData {
    readonly startingAngle: number;
    readonly endingAngle: number;
    readonly innerRadius: number;
}
interface DropShadowEffect {
    readonly type: 'DROP_SHADOW';
    readonly color: RGBA;
    readonly offset: Vector;
    readonly radius: number;
    readonly spread?: number;
    readonly visible: boolean;
    readonly blendMode: BlendMode;
    readonly showShadowBehindNode?: boolean;
    readonly boundVariables?: {
        [field in VariableBindableEffectField]?: VariableAlias;
    };
}
interface InnerShadowEffect {
    readonly type: 'INNER_SHADOW';
    readonly color: RGBA;
    readonly offset: Vector;
    readonly radius: number;
    readonly spread?: number;
    readonly visible: boolean;
    readonly blendMode: BlendMode;
    readonly boundVariables?: {
        [field in VariableBindableEffectField]?: VariableAlias;
    };
}
interface BlurEffectBase {
    readonly type: 'LAYER_BLUR' | 'BACKGROUND_BLUR';
    readonly radius: number;
    readonly visible: boolean;
    readonly boundVariables?: {
        ['radius']?: VariableAlias;
    };
}
interface BlurEffectNormal extends BlurEffectBase {
    readonly blurType: 'NORMAL';
}
interface BlurEffectProgressive extends BlurEffectBase {
    readonly blurType: 'PROGRESSIVE';
    readonly startRadius: number;
    readonly startOffset: Vector;
    readonly endOffset: Vector;
}
type BlurEffect = BlurEffectNormal | BlurEffectProgressive;
interface NoiseEffectBase {
    readonly type: 'NOISE';
    readonly color: RGBA;
    readonly visible: boolean;
    readonly blendMode: BlendMode;
    readonly noiseSize: number;
    readonly noiseSizeVector?: Vector;
    readonly density: number;
    readonly boundVariables?: {};
}
interface NoiseEffectMonotone extends NoiseEffectBase {
    readonly noiseType: 'MONOTONE';
}
interface NoiseEffectDuotone extends NoiseEffectBase {
    readonly noiseType: 'DUOTONE';
    readonly secondaryColor: RGBA;
}
interface NoiseEffectMultitone extends NoiseEffectBase {
    readonly noiseType: 'MULTITONE';
    readonly opacity: number;
}
type NoiseEffect = NoiseEffectMonotone | NoiseEffectDuotone | NoiseEffectMultitone;
interface TextureEffect {
    readonly type: 'TEXTURE';
    readonly visible: boolean;
    readonly noiseSize: number;
    readonly noiseSizeVector?: Vector;
    readonly radius: number;
    readonly clipToShape: boolean;
    readonly boundVariables?: {};
}
interface GlassEffect {
    readonly type: 'GLASS';
    readonly visible: boolean;
    readonly lightIntensity: number;
    readonly lightAngle: number;
    readonly refraction: number;
    readonly depth: number;
    readonly dispersion: number;
    readonly radius: number;
    readonly boundVariables?: {};
}
interface ShaderEffect {
    readonly type: 'SHADER';
    readonly visible: boolean;
    readonly id: string;
    readonly properties?: {
        [defId: string]: ShaderPropertyValue;
    };
}
type Effect = DropShadowEffect | InnerShadowEffect | BlurEffect | NoiseEffect | TextureEffect | GlassEffect | ShaderEffect;
type ConstraintType = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE';
interface Constraints {
    readonly horizontal: ConstraintType;
    readonly vertical: ConstraintType;
}
interface ColorStop {
    readonly position: number;
    readonly color: RGBA;
    readonly boundVariables?: {
        [field in VariableBindableColorStopField]?: VariableAlias;
    };
}
interface ImageFilters {
    readonly exposure?: number;
    readonly contrast?: number;
    readonly saturation?: number;
    readonly temperature?: number;
    readonly tint?: number;
    readonly highlights?: number;
    readonly shadows?: number;
}
interface SolidPaint {
    readonly type: 'SOLID';
    readonly color: RGB;
    readonly visible?: boolean;
    readonly opacity?: number;
    readonly blendMode?: BlendMode;
    readonly boundVariables?: {
        [field in VariableBindablePaintField]?: VariableAlias;
    };
}
interface GradientPaint {
    readonly type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND';
    readonly gradientTransform: Transform;
    readonly gradientStops: ReadonlyArray<ColorStop>;
    readonly visible?: boolean;
    readonly opacity?: number;
    readonly blendMode?: BlendMode;
}
interface ImagePaint {
    readonly type: 'IMAGE';
    readonly scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE';
    readonly imageHash: string | null;
    readonly imageTransform?: Transform;
    readonly scalingFactor?: number;
    readonly rotation?: number;
    readonly filters?: ImageFilters;
    readonly visible?: boolean;
    readonly opacity?: number;
    readonly blendMode?: BlendMode;
}
interface VideoPaint {
    readonly type: 'VIDEO';
    readonly scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE';
    readonly videoHash: string | null;
    readonly videoTransform?: Transform;
    readonly scalingFactor?: number;
    readonly rotation?: number;
    readonly filters?: ImageFilters;
    readonly visible?: boolean;
    readonly opacity?: number;
    readonly blendMode?: BlendMode;
}
interface PatternPaint {
    readonly type: 'PATTERN';
    readonly sourceNodeId: string;
    readonly tileType: 'RECTANGULAR' | 'HORIZONTAL_HEXAGONAL' | 'VERTICAL_HEXAGONAL';
    readonly scalingFactor: number;
    readonly spacing: Vector;
    readonly horizontalAlignment: 'START' | 'CENTER' | 'END';
    readonly visible?: boolean;
    readonly opacity?: number;
    readonly blendMode?: BlendMode;
}
interface ShaderPaint {
    readonly type: 'SHADER';
    readonly id: string;
    readonly properties?: {
        [defId: string]: ShaderPropertyValue;
    };
    readonly visible?: boolean;
    readonly opacity?: number;
    readonly blendMode?: BlendMode;
}
type Paint = SolidPaint | GradientPaint | ImagePaint | VideoPaint | PatternPaint | ShaderPaint;
type ShaderPropertyValue = boolean | string | number | RGB | RGBA | {
    x: number;
    y: number;
} | {
    x: number;
    y: number;
    x2: number;
    y2: number;
} | {
    x: number;
    y: number;
    radius: number;
} | {
    x: number;
    y: number;
    radius: number;
    angle: number;
} | {
    x: number;
    y: number;
    color: RGB | RGBA | VariableAlias;
} | {
    stops: {
        position: number;
        color: RGB | RGBA | VariableAlias;
    }[];
} | VariableAlias;
interface ShaderPropertyDefinition {
    readonly name: string;
    readonly type: 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'IMAGE' | 'INSTANCE_SWAP' | 'SLOT' | 'COLOR' | 'POINT' | 'LINE' | 'CIRCLE' | 'CIRCLE_POINT' | 'COLOR_POINT' | 'GRADIENT';
    readonly defaultValue?: ShaderPropertyValue;
    readonly description?: string;
}
interface Shader {
    readonly id: string;
    readonly name: string;
    readonly type: 'effect' | 'fill';
    readonly imported: boolean;
    readonly propertyDefinitions?: {
        [defId: string]: ShaderPropertyDefinition;
    };
}
interface Guide {
    readonly axis: 'X' | 'Y';
    readonly offset: number;
}
interface RowsColsLayoutGrid {
    readonly pattern: 'ROWS' | 'COLUMNS';
    readonly alignment: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';
    readonly gutterSize: number;
    readonly count: number;
    readonly sectionSize?: number;
    readonly offset?: number;
    readonly visible?: boolean;
    readonly color?: RGBA;
    readonly boundVariables?: {
        [field in VariableBindableLayoutGridField]?: VariableAlias;
    };
}
interface GridLayoutGrid {
    readonly pattern: 'GRID';
    readonly sectionSize: number;
    readonly visible?: boolean;
    readonly color?: RGBA;
    readonly boundVariables?: {
        ['sectionSize']?: VariableAlias;
    };
}
type LayoutGrid = RowsColsLayoutGrid | GridLayoutGrid;
interface ExportSettingsConstraints {
    readonly type: 'SCALE' | 'WIDTH' | 'HEIGHT';
    readonly value: number;
}
interface ExportSettingsImage {
    readonly format: 'JPG' | 'PNG';
    readonly contentsOnly?: boolean;
    readonly useAbsoluteBounds?: boolean;
    readonly suffix?: string;
    readonly constraint?: ExportSettingsConstraints;
    readonly colorProfile?: 'DOCUMENT' | 'SRGB' | 'DISPLAY_P3_V4';
}
interface ExportSettingsSVGBase {
    readonly contentsOnly?: boolean;
    readonly useAbsoluteBounds?: boolean;
    readonly suffix?: string;
    readonly svgOutlineText?: boolean;
    readonly svgIdAttribute?: boolean;
    readonly svgSimplifyStroke?: boolean;
    readonly colorProfile?: 'DOCUMENT' | 'SRGB' | 'DISPLAY_P3_V4';
}
interface ExportSettingsSVG extends ExportSettingsSVGBase {
    readonly format: 'SVG';
}
interface ExportSettingsSVGString extends ExportSettingsSVGBase {
    readonly format: 'SVG_STRING';
}
interface ExportSettingsPDF {
    readonly format: 'PDF';
    readonly contentsOnly?: boolean;
    readonly useAbsoluteBounds?: boolean;
    readonly suffix?: string;
    readonly colorProfile?: 'DOCUMENT' | 'SRGB' | 'DISPLAY_P3_V4';
}
interface ExportSettingsREST {
    readonly format: 'JSON_REST_V1';
}
type ExportSettings = ExportSettingsImage | ExportSettingsSVG | ExportSettingsPDF;
type WindingRule = 'NONZERO' | 'EVENODD';
interface VectorVertex {
    readonly x: number;
    readonly y: number;
    readonly strokeCap?: StrokeCap;
    readonly strokeJoin?: StrokeJoin;
    readonly cornerRadius?: number;
    readonly handleMirroring?: HandleMirroring;
}
interface VectorSegment {
    readonly start: number;
    readonly end: number;
    readonly tangentStart?: Vector;
    readonly tangentEnd?: Vector;
}
interface VectorRegion {
    readonly windingRule: WindingRule;
    readonly loops: ReadonlyArray<ReadonlyArray<number>>;
    readonly fills?: ReadonlyArray<Paint>;
    readonly fillStyleId?: string;
}
interface VectorNetwork {
    readonly vertices: ReadonlyArray<VectorVertex>;
    readonly segments: ReadonlyArray<VectorSegment>;
    readonly regions?: ReadonlyArray<VectorRegion>;
}
interface VectorPath {
    readonly windingRule: WindingRule | 'NONE';
    readonly data: string;
}
type VectorPaths = ReadonlyArray<VectorPath>;
interface LetterSpacing {
    readonly value: number;
    readonly unit: 'PIXELS' | 'PERCENT';
}
type LineHeight = {
    readonly value: number;
    readonly unit: 'PIXELS' | 'PERCENT';
} | {
    readonly unit: 'AUTO';
};
type LeadingTrim = 'CAP_HEIGHT' | 'NONE';
type TextWrapStyle = 'AUTO' | 'BALANCE' | 'PRETTY';
type HyperlinkTarget = {
    type: 'URL' | 'NODE';
    value: string;
};
type TextListOptions = {
    type: 'ORDERED' | 'UNORDERED' | 'NONE';
};
type BlendMode = 'PASS_THROUGH' | 'NORMAL' | 'DARKEN' | 'MULTIPLY' | 'LINEAR_BURN' | 'COLOR_BURN' | 'LIGHTEN' | 'SCREEN' | 'LINEAR_DODGE' | 'COLOR_DODGE' | 'OVERLAY' | 'SOFT_LIGHT' | 'HARD_LIGHT' | 'DIFFERENCE' | 'EXCLUSION' | 'HUE' | 'SATURATION' | 'COLOR' | 'LUMINOSITY';
type MaskType = 'ALPHA' | 'VECTOR' | 'LUMINANCE';
interface Font {
    fontName: FontName;
}
type TextStyleOverrideType = {
    type: 'SEMANTIC_ITALIC' | 'SEMANTIC_WEIGHT' | 'HYPERLINK' | 'TEXT_DECORATION';
};
interface StyledTextSegment {
    characters: string;
    start: number;
    end: number;
    fontSize: number;
    fontName: FontName;
    fontWeight: number;
    fontStyle: FontStyle;
    textDecoration: TextDecoration;
    textDecorationStyle: TextDecorationStyle | null;
    textDecorationOffset: TextDecorationOffset | null;
    textDecorationThickness: TextDecorationThickness | null;
    textDecorationColor: TextDecorationColor | null;
    textDecorationSkipInk: boolean | null;
    textCase: TextCase;
    lineHeight: LineHeight;
    letterSpacing: LetterSpacing;
    fills: Paint[];
    textStyleId: string;
    fillStyleId: string;
    listOptions: TextListOptions;
    listSpacing: number;
    indentation: number;
    paragraphIndent: number;
    paragraphSpacing: number;
    textWrapStyle: TextWrapStyle;
    hyperlink: HyperlinkTarget | null;
    openTypeFeatures: {
        readonly [feature in OpenTypeFeature]: boolean;
    };
    boundVariables?: {
        [field in VariableBindableTextField]?: VariableAlias;
    };
    textStyleOverrides: TextStyleOverrideType[];
}
interface TextPathStartData {
    segment: number;
    position: number;
}
type Reaction = {
    actions?: Action[];
    trigger: Trigger | null;
};
type VariableDataType = 'BOOLEAN' | 'COLOR' | 'EASING' | 'EXPRESSION' | 'FLOAT' | 'STRING' | 'TIMING' | 'VARIABLE_ALIAS';
type ExpressionFunction = 'ADDITION' | 'SUBTRACTION' | 'MULTIPLICATION' | 'DIVISION' | 'EQUALS' | 'NOT_EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL' | 'AND' | 'OR' | 'VAR_MODE_LOOKUP' | 'NEGATE' | 'NOT';
interface Expression {
    expressionFunction: ExpressionFunction;
    expressionArguments: VariableData[];
}
type VariableValueWithExpression = VariableValue | Expression;
interface VariableData {
    type?: VariableDataType;
    resolvedType?: VariableResolvedDataType;
    value?: VariableValueWithExpression;
}
type ConditionalBlock = {
    condition?: VariableData;
    actions: Action[];
};
type Action = {
    readonly type: 'BACK' | 'CLOSE';
} | {
    readonly type: 'URL';
    url: string;
    openInNewTab?: boolean;
} | {
    readonly type: 'UPDATE_MEDIA_RUNTIME';
    readonly destinationId: string | null;
    readonly mediaAction: 'PLAY' | 'PAUSE' | 'TOGGLE_PLAY_PAUSE' | 'MUTE' | 'UNMUTE' | 'TOGGLE_MUTE_UNMUTE';
} | {
    readonly type: 'UPDATE_MEDIA_RUNTIME';
    readonly destinationId?: string | null;
    readonly mediaAction: 'SKIP_FORWARD' | 'SKIP_BACKWARD';
    readonly amountToSkip: number;
} | {
    readonly type: 'UPDATE_MEDIA_RUNTIME';
    readonly destinationId?: string | null;
    readonly mediaAction: 'SKIP_TO';
    readonly newTimestamp: number;
} | {
    readonly type: 'SET_VARIABLE';
    readonly variableId: string | null;
    readonly variableValue?: VariableData;
} | {
    readonly type: 'SET_VARIABLE_MODE';
    readonly variableCollectionId: string | null;
    readonly variableModeId: string | null;
} | {
    readonly type: 'CONDITIONAL';
    readonly conditionalBlocks: ConditionalBlock[];
} | {
    readonly type: 'NODE';
    readonly destinationId: string | null;
    readonly navigation: Navigation;
    readonly transition: Transition | null;
    readonly overlayRelativePosition?: Vector;
    readonly resetVideoPosition?: boolean;
    readonly resetScrollPosition?: boolean;
    readonly resetInteractiveComponents?: boolean;
};
interface SimpleTransition {
    readonly type: 'DISSOLVE' | 'SMART_ANIMATE' | 'SCROLL_ANIMATE';
    readonly easing: Easing;
    readonly duration: number;
}
interface DirectionalTransition {
    readonly type: 'MOVE_IN' | 'MOVE_OUT' | 'PUSH' | 'SLIDE_IN' | 'SLIDE_OUT';
    readonly direction: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
    readonly matchLayers: boolean;
    readonly easing: Easing;
    readonly duration: number;
}
type Transition = SimpleTransition | DirectionalTransition;
type Trigger = {
    readonly type: 'ON_CLICK' | 'ON_HOVER' | 'ON_PRESS' | 'ON_DRAG';
} | {
    readonly type: 'AFTER_TIMEOUT';
    readonly timeout: number;
} | {
    readonly type: 'MOUSE_UP' | 'MOUSE_DOWN';
    readonly delay: number;
} | {
    readonly type: 'MOUSE_ENTER' | 'MOUSE_LEAVE';
    readonly delay: number;
    readonly deprecatedVersion: boolean;
} | {
    readonly type: 'ON_KEY_DOWN';
    readonly device: 'KEYBOARD' | 'XBOX_ONE' | 'PS4' | 'SWITCH_PRO' | 'UNKNOWN_CONTROLLER';
    readonly keyCodes: ReadonlyArray<number>;
} | {
    readonly type: 'ON_MEDIA_HIT';
    readonly mediaHitTime: number;
} | {
    readonly type: 'ON_MEDIA_END';
};
type Navigation = 'NAVIGATE' | 'SWAP' | 'OVERLAY' | 'SCROLL_TO' | 'CHANGE_TO';
interface Easing {
    readonly type: 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' | 'EASE_IN_BACK' | 'EASE_OUT_BACK' | 'EASE_IN_AND_OUT_BACK' | 'CUSTOM_CUBIC_BEZIER' | 'GENTLE' | 'QUICK' | 'BOUNCY' | 'SLOW' | 'CUSTOM_SPRING';
    readonly easingFunctionCubicBezier?: EasingFunctionBezier;
    readonly easingFunctionSpring?: EasingFunctionSpring;
}
interface EasingFunctionBezier {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
interface EasingFunctionSpring {
    mass: number;
    stiffness: number;
    damping: number;
    initialVelocity: number;
}
interface MotionEasing {
    readonly type: 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' | 'EASE_IN_BACK' | 'EASE_OUT_BACK' | 'EASE_IN_AND_OUT_BACK' | 'CUSTOM_CUBIC_BEZIER' | 'GENTLE' | 'QUICK' | 'BOUNCY' | 'SLOW' | 'CUSTOM_SPRING' | 'HOLD';
    readonly easingFunctionCubicBezier?: EasingFunctionBezier;
    readonly easingFunctionSpring?: NormalizedSpring;
}
interface PhysicalSpring {
    readonly mass: number;
    readonly stiffness: number;
    readonly damping: number;
}
interface NormalizedSpring {
    readonly bounce: number;
}
type AnimationStylePropValue = string | number | boolean | MotionEasing | VariableAlias;
type AvailableAnimationStylePropValue = string;
interface BaseAnimationStyle {
    readonly styleId: string;
    readonly name: string;
}
interface AvailableAnimationStyle extends BaseAnimationStyle {
    readonly description?: string;
    readonly props?: {
        readonly [key: string]: AvailableAnimationStylePropValue;
    };
}
interface AnimationStyleConfiguration {
    readonly duration?: number;
    readonly timelineOffset?: number;
    readonly props?: {
        readonly [key: string]: AnimationStylePropValue;
    };
}
interface AppliedAnimationStyle extends BaseAnimationStyle, AnimationStyleConfiguration {
    readonly id: string;
}
type KeyframeValue = {
    readonly type: 'FLOAT';
    readonly value: number;
} | {
    readonly type: 'COLOR';
    readonly value: RGBA;
} | {
    readonly type: 'TEXT_DATA';
    readonly value: string;
} | {
    readonly type: 'VECTOR';
    readonly value: Vector;
} | {
    readonly type: 'BOOL';
    readonly value: boolean;
} | {
    readonly type: 'CIRCLE';
    readonly value: {
        readonly x: number;
        readonly y: number;
        readonly radius: number;
    };
} | {
    readonly type: 'LINE';
    readonly value: {
        readonly x: number;
        readonly y: number;
        readonly x2: number;
        readonly y2: number;
    };
} | {
    readonly type: 'CIRCLE_POINT';
    readonly value: {
        readonly x: number;
        readonly y: number;
        readonly radius: number;
        readonly angle: number;
    };
} | {
    readonly type: 'COLOR_POINT';
    readonly value: {
        readonly x: number;
        readonly y: number;
        readonly color: RGBA;
    };
};
interface ManualKeyframeInput {
    readonly id?: string;
    readonly timelinePosition: number;
    readonly easing?: MotionEasing | VariableAlias;
    readonly value: KeyframeValue;
}
interface ManualKeyframeTrackInput {
    readonly id?: string;
    readonly baseValue?: KeyframeValue;
    readonly keyframes: ReadonlyArray<ManualKeyframeInput>;
}
interface ManualKeyframe extends ManualKeyframeInput {
    readonly id: string;
    readonly easing: MotionEasing | VariableAlias;
}
interface ManualKeyframeBinding {
    readonly id: string;
    readonly baseValue: KeyframeValue;
    readonly keyframes: ReadonlyArray<ManualKeyframe>;
}
interface ManualKeyframeTrack {
    readonly id: string;
    readonly keyframeOperation: 'SET' | 'OFFSET' | 'SCALE';
    readonly keyframes: ReadonlyArray<ManualKeyframe>;
}
interface KeyframeBinding {
    readonly baseValue: KeyframeValue;
    readonly timelineDuration: number;
    readonly tracks: ReadonlyArray<ManualKeyframeTrack>;
}
type KeyframePropertyFieldName = 'CORNER_RADIUS' | 'STROKE_WEIGHT' | 'STACK_SPACING' | 'STACK_PADDING_LEFT' | 'STACK_PADDING_TOP' | 'STACK_PADDING_RIGHT' | 'STACK_PADDING_BOTTOM' | 'WIDTH' | 'HEIGHT' | 'RECTANGLE_TOP_LEFT_CORNER_RADIUS' | 'RECTANGLE_TOP_RIGHT_CORNER_RADIUS' | 'RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS' | 'RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS' | 'BORDER_TOP_WEIGHT' | 'BORDER_BOTTOM_WEIGHT' | 'BORDER_LEFT_WEIGHT' | 'BORDER_RIGHT_WEIGHT' | 'STACK_COUNTER_SPACING' | 'OPACITY' | 'GRID_ROW_GAP' | 'GRID_COLUMN_GAP' | 'TRANSLATION_X' | 'TRANSLATION_Y' | 'TRANSLATION_XY' | 'ROTATION' | 'SCALE_X' | 'SCALE_Y' | 'SCALE_XY' | 'PATH_TRIM_START' | 'PATH_TRIM_END';
type EffectKeyframeFieldName = 'OFFSET_X' | 'OFFSET_Y' | 'RADIUS' | 'SPREAD' | 'COLOR' | 'REFRACTION_RADIUS' | 'SPECULAR_ANGLE' | 'SPECULAR_INTENSITY' | 'CHROMATIC_ABERRATION' | 'SPLAY' | 'REFRACTION_INTENSITY' | 'START_RADIUS' | 'NOISE_SIZE_X' | 'NOISE_SIZE_Y' | 'DENSITY' | 'EFFECT_OPACITY' | 'SECONDARY_COLOR';
type KeyframeField = {
    readonly type: 'PROPERTY';
    readonly name: KeyframePropertyFieldName;
} | {
    readonly type: 'INDEXED_ITEM';
    readonly collection: 'fills' | 'strokes';
    readonly index: number;
} | {
    readonly type: 'INDEXED_ITEM';
    readonly collection: 'fills' | 'strokes';
    readonly index: number;
    readonly propertyId: string;
} | {
    readonly type: 'INDEXED_ITEM';
    readonly collection: 'effects';
    readonly index: number;
    readonly field: EffectKeyframeFieldName;
} | {
    readonly type: 'INDEXED_ITEM';
    readonly collection: 'effects';
    readonly index: number;
    readonly propertyId: string;
};
type ComponentPropKeyframeTracks = Partial<Record<string, ManualKeyframeBinding>>;
type ComponentPropKeyframeBindings = Partial<Record<string, KeyframeBinding>>;
type PaintManualKeyframeTrack = ManualKeyframeBinding | {
    readonly properties: ComponentPropKeyframeTracks;
};
type PaintKeyframeBinding = KeyframeBinding | {
    readonly properties: ComponentPropKeyframeBindings;
};
type EffectManualKeyframeTracks = Partial<Record<EffectKeyframeFieldName, ManualKeyframeBinding>> & {
    readonly properties?: ComponentPropKeyframeTracks;
};
type EffectKeyframeBindings = Partial<Record<EffectKeyframeFieldName, KeyframeBinding>> & {
    readonly properties?: ComponentPropKeyframeBindings;
};
type ManualKeyframeTracks = Partial<Record<KeyframePropertyFieldName, ManualKeyframeBinding>> & {
    readonly fills?: Partial<Record<number, PaintManualKeyframeTrack>>;
    readonly strokes?: Partial<Record<number, PaintManualKeyframeTrack>>;
    readonly effects?: Partial<Record<number, EffectManualKeyframeTracks>>;
};
type Animations = Partial<Record<KeyframePropertyFieldName, KeyframeBinding>> & {
    readonly fills?: Partial<Record<number, PaintKeyframeBinding>>;
    readonly strokes?: Partial<Record<number, PaintKeyframeBinding>>;
    readonly effects?: Partial<Record<number, EffectKeyframeBindings>>;
};
interface Timeline {
    readonly id: string;
    readonly duration: number;
}
type OverflowDirection = 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH';
type OverlayPositionType = 'CENTER' | 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_CENTER' | 'BOTTOM_RIGHT' | 'MANUAL';
type OverlayBackground = {
    readonly type: 'NONE';
} | {
    readonly type: 'SOLID_COLOR';
    readonly color: RGBA;
};
type OverlayBackgroundInteraction = 'NONE' | 'CLOSE_ON_CLICK_OUTSIDE';
type PublishStatus = 'UNPUBLISHED' | 'CURRENT' | 'CHANGED';
interface ConnectorEndpointPosition {
    position: {
        x: number;
        y: number;
    };
}
interface ConnectorEndpointPositionAndEndpointNodeId {
    position: {
        x: number;
        y: number;
    };
    endpointNodeId: string;
}
interface ConnectorEndpointEndpointNodeIdAndMagnet {
    endpointNodeId: string;
    magnet: 'NONE' | 'AUTO' | 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT' | 'CENTER';
}
type ConnectorEndpoint = ConnectorEndpointPosition | ConnectorEndpointEndpointNodeIdAndMagnet | ConnectorEndpointPositionAndEndpointNodeId;
type ConnectorStrokeCap = 'NONE' | 'ARROW_EQUILATERAL' | 'ARROW_LINES' | 'TRIANGLE_FILLED' | 'DIAMOND_FILLED' | 'CIRCLE_FILLED' | 'ERD_ZERO_OR_ONE' | 'ERD_EXACTLY_ONE' | 'ERD_ZERO_OR_MORE' | 'ERD_ONE_OR_MORE' | 'ERD_ONE' | 'ERD_MANY';
interface BaseNodeMixin extends PluginDataMixin {
    readonly id: string;
    readonly parent: (BaseNode & ChildrenMixin) | null;
    name: string;
    readonly removed: boolean;
    toString(): string;
    remove(): void;
    readonly isAsset: boolean;
    getCSSAsync(): Promise<{
        [key: string]: string;
    }>;
    getTopLevelFrame(): FrameNode | undefined;
}
interface PluginDataMixin {
    getPluginData(key: string): string;
    setPluginData(key: string, value: string): void;
    getPluginDataKeys(): string[];
    getSharedPluginData(namespace: string, key: string): string;
    setSharedPluginData(namespace: string, key: string, value: string): void;
    getSharedPluginDataKeys(namespace: string): string[];
}
interface SceneNodeMixin extends ExplicitVariableModesMixin, MotionNodeMixin {
    visible: boolean;
    locked: boolean;
    readonly stuckNodes: SceneNode[];
    readonly attachedConnectors: ConnectorNode[];
    componentPropertyReferences: {
        [nodeProperty in 'visible' | 'characters' | 'mainComponent']?: string;
    } | null;
    readonly boundVariables?: {
        readonly [field in VariableBindableNodeField]?: VariableAlias;
    } & {
        readonly [field in VariableBindableTextField]?: VariableAlias[];
    } & {
        readonly fills?: VariableAlias[];
        readonly strokes?: VariableAlias[];
        readonly effects?: VariableAlias[];
        readonly layoutGrids?: VariableAlias[];
        readonly componentProperties?: {
            readonly [propertyName: string]: VariableAlias;
        };
        readonly textRangeFills?: VariableAlias[];
    };
    setBoundVariable(field: VariableBindableNodeField | VariableBindableTextField, variable: Variable | null): void;
    readonly inferredVariables?: {
        readonly [field in VariableBindableNodeField]?: VariableAlias[];
    } & {
        readonly fills?: VariableAlias[][];
        readonly strokes?: VariableAlias[][];
    };
    resolvedVariableModes: {
        [collectionId: string]: string;
    };
}
interface MotionNodeMixin {
    readonly animationStyles: AppliedAnimationStyle[];
    readonly animations: Animations;
    readonly manualKeyframeTracks: ManualKeyframeTracks;
    readonly timelines: ReadonlyArray<Timeline>;
    applyAnimationStyle(styleId: string, animationStyleData?: AnimationStyleConfiguration): string;
    removeAnimationStyle(id: string): void;
    applyManualKeyframeTrack(field: KeyframeField, track: ManualKeyframeTrackInput): void;
    removeManualKeyframeTrack(field: KeyframeField): void;
    setTimelineDuration(id: string, duration: number): void;
}
type VariableBindableNodeField = 'height' | 'width' | 'characters' | 'itemSpacing' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom' | 'visible' | 'cornerRadius' | 'topLeftRadius' | 'topRightRadius' | 'bottomLeftRadius' | 'bottomRightRadius' | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight' | 'counterAxisSpacing' | 'strokeWeight' | 'strokeTopWeight' | 'strokeRightWeight' | 'strokeBottomWeight' | 'strokeLeftWeight' | 'opacity' | 'gridRowGap' | 'gridColumnGap';
type VariableBindableTextField = 'fontFamily' | 'fontSize' | 'fontStyle' | 'fontWeight' | 'letterSpacing' | 'lineHeight' | 'paragraphSpacing' | 'paragraphIndent';
type VariableBindablePaintField = 'color';
type VariableBindablePaintStyleField = 'paints';
type VariableBindableColorStopField = 'color';
type VariableBindableEffectField = 'color' | 'radius' | 'spread' | 'offsetX' | 'offsetY';
type VariableBindableEffectStyleField = 'effects';
type VariableBindableLayoutGridField = 'sectionSize' | 'count' | 'offset' | 'gutterSize';
type VariableBindableGridStyleField = 'layoutGrids';
type VariableBindableComponentPropertyField = 'value';
type VariableBindableComponentPropertyDefinitionField = 'defaultValue';
interface StickableMixin {
    stuckTo: SceneNode | null;
}
interface ChildrenMixin {
    readonly children: ReadonlyArray<SceneNode>;
    appendChild(child: SceneNode): void;
    insertChild(index: number, child: SceneNode): void;
    findChildren(callback?: (node: SceneNode) => boolean): SceneNode[];
    findChild(callback: (node: SceneNode) => boolean): SceneNode | null;
    findAll(callback?: (node: SceneNode) => boolean): SceneNode[];
    findOne(callback: (node: SceneNode) => boolean): SceneNode | null;
    findAllWithCriteria<T extends NodeType[]>(criteria: FindAllCriteria<T>): Array<{
        type: T[number];
    } & SceneNode>;
    findWidgetNodesByWidgetId(widgetId: string): Array<WidgetNode>;
}
interface ConstraintMixin {
    constraints: Constraints;
}
interface DimensionAndPositionMixin {
    x: number;
    y: number;
    readonly width: number;
    readonly height: number;
    minWidth: number | null;
    maxWidth: number | null;
    minHeight: number | null;
    maxHeight: number | null;
    relativeTransform: Transform;
    readonly absoluteTransform: Transform;
    readonly absoluteBoundingBox: Rect | null;
}
interface LayoutMixin extends DimensionAndPositionMixin, AutoLayoutChildrenMixin, GridChildrenMixin {
    readonly absoluteRenderBounds: Rect | null;
    rotation: number;
    layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL';
    layoutSizingVertical: 'FIXED' | 'HUG' | 'FILL';
    resize(width: number, height: number): void;
    resizeWithoutConstraints(width: number, height: number): void;
    rescale(scale: number): void;
}
interface AspectRatioLockMixin {
    readonly targetAspectRatio: Vector | null;
    lockAspectRatio(): void;
    unlockAspectRatio(): void;
}
interface BlendMixin extends MinimalBlendMixin {
    isMask: boolean;
    maskType: MaskType;
    effects: ReadonlyArray<Effect>;
    effectStyleId: string;
    setEffectStyleIdAsync(styleId: string): Promise<void>;
}
interface ContainerMixin {
    expanded: boolean;
}
declare type StrokeCap = 'NONE' | 'ROUND' | 'SQUARE' | 'ARROW_LINES' | 'ARROW_EQUILATERAL' | 'DIAMOND_FILLED' | 'TRIANGLE_FILLED' | 'CIRCLE_FILLED';
declare type StrokeJoin = 'MITER' | 'BEVEL' | 'ROUND';
declare type HandleMirroring = 'NONE' | 'ANGLE' | 'ANGLE_AND_LENGTH';
interface AutoLayoutMixin {
    layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    primaryAxisSizingMode: 'FIXED' | 'AUTO';
    counterAxisSizingMode: 'FIXED' | 'AUTO';
    strokesIncludedInLayout: boolean;
    layoutWrap: 'NO_WRAP' | 'WRAP';
    primaryAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN' | 'SPACE_EVENLY' | 'SPACE_AROUND';
    counterAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE';
    counterAxisAlignContent: 'AUTO' | 'SPACE_BETWEEN';
    itemSpacing: number;
    counterAxisSpacing: number | null;
    itemReverseZIndex: boolean;
}
interface GridTrackSize {
    value?: number;
    type: 'FLEX' | 'FIXED' | 'HUG';
}
interface GridTrackReorderOptions {
    fromIndices: ReadonlyArray<number>;
    insertionIndex: number;
}
interface GridTrackReorderEntry {
    from: number;
    to: number;
}
interface GridLayoutMixin {
    gridRowCount: number;
    gridColumnCount: number;
    gridRowGap: number;
    gridColumnGap: number;
    gridRowSizes: Array<GridTrackSize>;
    gridColumnSizes: Array<GridTrackSize>;
    appendChildAt(node: SceneNode, rowIndex: number, columnIndex: number): void;
    gridAutoTracks: 'NONE' | 'ROWS';
    gridItemsPositioning: 'MANUAL' | 'ROW_AUTO_FLOW';
    reorderRows(options: GridTrackReorderOptions): ReadonlyArray<GridTrackReorderEntry>;
    reorderColumns(options: GridTrackReorderOptions): ReadonlyArray<GridTrackReorderEntry>;
}
interface AutoLayoutChildrenMixin {
    layoutAlign: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT';
    layoutGrow: number;
    layoutPositioning: 'AUTO' | 'ABSOLUTE';
}
interface GridChildrenMixin {
    setGridChildPosition(rowIndex: number, columnIndex: number): void;
    readonly gridRowAnchorIndex: number;
    readonly gridColumnAnchorIndex: number;
    gridRowSpan: number;
    gridColumnSpan: number;
    gridChildHorizontalAlign: 'MIN' | 'CENTER' | 'MAX' | 'AUTO';
    gridChildVerticalAlign: 'MIN' | 'CENTER' | 'MAX' | 'AUTO';
}
interface InferredAutoLayoutResult extends AutoLayoutChildrenMixin, AutoLayoutMixin {
}
type DetachedInfo = {
    type: 'local';
    componentId: string;
} | {
    type: 'library';
    componentKey: string;
};
interface MinimalStrokesMixin {
    strokes: ReadonlyArray<Paint>;
    strokeStyleId: string;
    setStrokeStyleIdAsync(styleId: string): Promise<void>;
    strokeWeight: number | PluginAPI['mixed'];
    strokeJoin: StrokeJoin | PluginAPI['mixed'];
    strokeAlign: 'CENTER' | 'INSIDE' | 'OUTSIDE';
    dashPattern: ReadonlyArray<number>;
    readonly strokeGeometry: VectorPaths;
    setStrokesAsync(strokes: ReadonlyArray<Paint>): Promise<void>;
}
interface IndividualStrokesMixin {
    strokeTopWeight: number;
    strokeBottomWeight: number;
    strokeLeftWeight: number;
    strokeRightWeight: number;
}
interface MinimalFillsMixin {
    fills: ReadonlyArray<Paint> | PluginAPI['mixed'];
    fillStyleId: string | PluginAPI['mixed'];
    setFillStyleIdAsync(styleId: string): Promise<void>;
    setFillsAsync(paints: ReadonlyArray<Paint>): Promise<void>;
}
interface VariableWidthPoint {
    position: number;
    width: number;
}
interface PresetVariableWidthStrokeProperties {
    widthProfile: 'UNIFORM' | 'WEDGE' | 'TAPER' | 'QUARTER_TAPER' | 'EYE' | 'MIRRORED_TAPER';
}
interface CustomVariableWidthStrokeProperties {
    widthProfile: 'CUSTOM';
    variableWidthPoints: ReadonlyArray<VariableWidthPoint>;
}
declare type VariableWidthStrokeProperties = PresetVariableWidthStrokeProperties | CustomVariableWidthStrokeProperties;
declare type ComplexStrokeProperties = {
    type: 'BASIC';
} | DynamicStrokeProperties | BrushStrokeProperties;
interface ScatterBrushProperties {
    type: 'BRUSH';
    brushType: 'SCATTER';
    brushName: 'BUBBLEGUM' | 'WITCH_HOUSE' | 'SHOEGAZE' | 'HONKY_TONK' | 'SCREAMO' | 'DRONE' | 'DOO_WOP' | 'SPOKEN_WORD' | 'VAPORWAVE' | 'OI' | 'CUSTOM';
    gap: number;
    wiggle: number;
    sizeJitter: number;
    angularJitter: number;
    rotation: number;
}
interface StretchBrushProperties {
    type: 'BRUSH';
    brushType: 'STRETCH';
    brushName: 'HEIST' | 'BLOCKBUSTER' | 'GRINDHOUSE' | 'BIOPIC' | 'SPAGHETTI_WESTERN' | 'SLASHER' | 'HARDBOILED' | 'VERITE' | 'EPIC' | 'SCREWBALL' | 'ROM_COM' | 'NOIR' | 'PROPAGANDA' | 'MELODRAMA' | 'NEW_WAVE' | 'CUSTOM';
    direction: 'FORWARD' | 'BACKWARD';
}
type BrushStrokeProperties = StretchBrushProperties | ScatterBrushProperties;
interface DynamicStrokeProperties {
    type: 'DYNAMIC';
    frequency: number;
    wiggle: number;
    smoothen: number;
}
interface GeometryMixin extends MinimalStrokesMixin, MinimalFillsMixin {
    strokeCap: StrokeCap | PluginAPI['mixed'];
    strokeMiterLimit: number;
    outlineStroke(): VectorNode | null;
    readonly fillGeometry: VectorPaths;
}
interface ComplexStrokesMixin {
    variableWidthStrokeProperties: VariableWidthStrokeProperties | null;
    complexStrokeProperties: ComplexStrokeProperties;
}
interface CornerMixin {
    cornerRadius: number | PluginAPI['mixed'];
    cornerSmoothing: number;
}
interface RectangleCornerMixin {
    topLeftRadius: number;
    topRightRadius: number;
    bottomLeftRadius: number;
    bottomRightRadius: number;
}
interface ExportMixin {
    exportSettings: ReadonlyArray<ExportSettings>;
    exportAsync(settings?: ExportSettings): Promise<Uint8Array>;
    exportAsync(settings: ExportSettingsSVGString): Promise<string>;
    exportAsync(settings: ExportSettingsREST): Promise<Object>;
}
interface FramePrototypingMixin {
    overflowDirection: OverflowDirection;
    numberOfFixedChildren: number;
    readonly overlayPositionType: OverlayPositionType;
    readonly overlayBackground: OverlayBackground;
    readonly overlayBackgroundInteraction: OverlayBackgroundInteraction;
}
interface VectorLikeMixin {
    vectorNetwork: VectorNetwork;
    setVectorNetworkAsync(vectorNetwork: VectorNetwork): Promise<void>;
    vectorPaths: VectorPaths;
    handleMirroring: HandleMirroring | PluginAPI['mixed'];
}
interface ReactionMixin {
    reactions: ReadonlyArray<Reaction>;
    setReactionsAsync(reactions: Array<Reaction>): Promise<void>;
}
interface DocumentationLink {
    readonly uri: string;
}
interface PublishableMixin {
    description: string;
    descriptionMarkdown: string;
    documentationLinks: ReadonlyArray<DocumentationLink>;
    readonly remote: boolean;
    readonly key: string;
    getPublishStatusAsync(): Promise<PublishStatus>;
}
interface DefaultShapeMixin extends BaseNodeMixin, SceneNodeMixin, ReactionMixin, BlendMixin, GeometryMixin, LayoutMixin, ExportMixin {
}
interface BaseFrameMixin extends BaseNodeMixin, SceneNodeMixin, ChildrenMixin, ContainerMixin, GeometryMixin, ComplexStrokesMixin, CornerMixin, RectangleCornerMixin, BlendMixin, ConstraintMixin, LayoutMixin, ExportMixin, IndividualStrokesMixin, AutoLayoutMixin, GridLayoutMixin, AspectRatioLockMixin, AnnotationsMixin {
    readonly detachedInfo: DetachedInfo | null;
    layoutGrids: ReadonlyArray<LayoutGrid>;
    gridStyleId: string;
    setGridStyleIdAsync(styleId: string): Promise<void>;
    clipsContent: boolean;
    guides: ReadonlyArray<Guide>;
    inferredAutoLayout: InferredAutoLayoutResult | null;
}
interface DefaultFrameMixin extends BaseFrameMixin, FramePrototypingMixin, ReactionMixin {
}
interface OpaqueNodeMixin extends BaseNodeMixin, SceneNodeMixin, ExportMixin, DimensionAndPositionMixin {
}
interface MinimalBlendMixin {
    opacity: number;
    blendMode: BlendMode;
}
interface Annotation {
    readonly label?: string;
    readonly labelMarkdown?: string;
    readonly properties?: ReadonlyArray<AnnotationProperty>;
    readonly categoryId?: string;
}
interface AnnotationProperty {
    readonly type: AnnotationPropertyType;
}
type AnnotationPropertyType = 'width' | 'height' | 'maxWidth' | 'minWidth' | 'maxHeight' | 'minHeight' | 'fills' | 'strokes' | 'effects' | 'strokeWeight' | 'cornerRadius' | 'textStyleId' | 'textAlignHorizontal' | 'fontFamily' | 'fontStyle' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'itemSpacing' | 'padding' | 'layoutMode' | 'alignItems' | 'opacity' | 'mainComponent' | 'gridRowGap' | 'gridColumnGap' | 'gridRowCount' | 'gridColumnCount' | 'gridRowAnchorIndex' | 'gridColumnAnchorIndex' | 'gridRowSpan' | 'gridColumnSpan';
interface AnnotationsMixin {
    annotations: ReadonlyArray<Annotation>;
}
interface Measurement {
    id: string;
    start: {
        node: SceneNode;
        side: MeasurementSide;
    };
    end: {
        node: SceneNode;
        side: MeasurementSide;
    };
    offset: MeasurementOffset;
    freeText: string;
}
type MeasurementSide = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT';
type MeasurementOffset = {
    type: 'INNER';
    relative: number;
} | {
    type: 'OUTER';
    fixed: number;
};
interface MeasurementsMixin {
    getMeasurements(): Measurement[];
    getMeasurementsForNode(node: SceneNode): Measurement[];
    addMeasurement(start: {
        node: SceneNode;
        side: MeasurementSide;
    }, end: {
        node: SceneNode;
        side: MeasurementSide;
    }, options?: {
        offset?: MeasurementOffset;
        freeText?: string;
    }): Measurement;
    editMeasurement(id: string, newValue: {
        offset?: MeasurementOffset;
        freeText?: string;
    }): Measurement;
    deleteMeasurement(id: string): void;
}
interface ComponentPropertiesMixin {
    readonly componentPropertyDefinitions: ComponentPropertyDefinitions;
    addComponentProperty(propertyName: string, type: ComponentPropertyType, defaultValue: string | boolean | VariableAlias, options?: ComponentPropertyOptions): string;
    editComponentProperty(propertyName: string, newValue: {
        name?: string;
        defaultValue?: string | boolean | VariableAlias;
        preferredValues?: InstanceSwapPreferredValue[];
        description?: string;
        slotSettings?: SlotSettings;
    }): string;
    deleteComponentProperty(propertyName: string): void;
}
interface BaseNonResizableTextMixin {
    readonly hasMissingFont: boolean;
    fontSize: number | PluginAPI['mixed'];
    fontName: FontName | PluginAPI['mixed'];
    readonly fontWeight: number | PluginAPI['mixed'];
    textCase: TextCase | PluginAPI['mixed'];
    readonly openTypeFeatures: {
        readonly [feature in OpenTypeFeature]: boolean;
    } | PluginAPI['mixed'];
    letterSpacing: LetterSpacing | PluginAPI['mixed'];
    hyperlink: HyperlinkTarget | null | PluginAPI['mixed'];
    characters: string;
    insertCharacters(start: number, characters: string, useStyle?: 'BEFORE' | 'AFTER'): void;
    deleteCharacters(start: number, end: number): void;
    getRangeFontSize(start: number, end: number): number | PluginAPI['mixed'];
    setRangeFontSize(start: number, end: number, value: number): void;
    getRangeFontName(start: number, end: number): FontName | PluginAPI['mixed'];
    setRangeFontName(start: number, end: number, value: FontNameInput): void;
    getRangeFontWeight(start: number, end: number): number | PluginAPI['mixed'];
    getRangeAllFontNames(start: number, end: number): FontName[];
    getRangeTextCase(start: number, end: number): TextCase | PluginAPI['mixed'];
    setRangeTextCase(start: number, end: number, value: TextCase): void;
    getRangeOpenTypeFeatures(start: number, end: number): {
        readonly [feature in OpenTypeFeature]: boolean;
    } | PluginAPI['mixed'];
    getRangeLetterSpacing(start: number, end: number): LetterSpacing | PluginAPI['mixed'];
    setRangeLetterSpacing(start: number, end: number, value: LetterSpacing): void;
    getRangeHyperlink(start: number, end: number): HyperlinkTarget | null | PluginAPI['mixed'];
    setRangeHyperlink(start: number, end: number, value: HyperlinkTarget | null): void;
    getRangeFills(start: number, end: number): Paint[] | PluginAPI['mixed'];
    setRangeFills(start: number, end: number, value: Paint[]): void;
    getRangeTextStyleId(start: number, end: number): string | PluginAPI['mixed'];
    setRangeTextStyleIdAsync(start: number, end: number, styleId: string): Promise<void>;
    getRangeFillStyleId(start: number, end: number): string | PluginAPI['mixed'];
    setRangeFillStyleIdAsync(start: number, end: number, styleId: string): Promise<void>;
    getRangeBoundVariable(start: number, end: number, field: VariableBindableTextField): VariableAlias | null | PluginAPI['mixed'];
    setRangeBoundVariable(start: number, end: number, field: VariableBindableTextField, variable: Variable | null): void;
    getStyledTextSegments<StyledTextSegmentFields extends (keyof Omit<StyledTextSegment, 'characters' | 'start' | 'end'>)[]>(fields: StyledTextSegmentFields, start?: number, end?: number): Array<Pick<StyledTextSegment, StyledTextSegmentFields[number] | 'characters' | 'start' | 'end'>>;
}
interface NonResizableTextMixin extends BaseNonResizableTextMixin {
    paragraphIndent: number | PluginAPI['mixed'];
    paragraphSpacing: number | PluginAPI['mixed'];
    textWrapStyle: TextWrapStyle | PluginAPI['mixed'];
    listSpacing: number | PluginAPI['mixed'];
    hangingPunctuation: boolean;
    hangingList: boolean;
    textDecoration: TextDecoration | PluginAPI['mixed'];
    textDecorationStyle: TextDecorationStyle | PluginAPI['mixed'] | null;
    textDecorationOffset: TextDecorationOffset | PluginAPI['mixed'] | null;
    textDecorationThickness: TextDecorationThickness | PluginAPI['mixed'] | null;
    textDecorationColor: TextDecorationColor | PluginAPI['mixed'] | null;
    textDecorationSkipInk: boolean | PluginAPI['mixed'] | null;
    lineHeight: LineHeight | PluginAPI['mixed'];
    leadingTrim: LeadingTrim | PluginAPI['mixed'];
    getRangeTextDecoration(start: number, end: number): TextDecoration | PluginAPI['mixed'];
    setRangeTextDecoration(start: number, end: number, value: TextDecoration): void;
    getRangeTextDecorationStyle(start: number, end: number): TextDecorationStyle | PluginAPI['mixed'] | null;
    setRangeTextDecorationStyle(start: number, end: number, value: TextDecorationStyle): void;
    getRangeTextDecorationOffset(start: number, end: number): TextDecorationOffset | PluginAPI['mixed'] | null;
    setRangeTextDecorationOffset(start: number, end: number, value: TextDecorationOffset): void;
    getRangeTextDecorationThickness(start: number, end: number): TextDecorationThickness | PluginAPI['mixed'] | null;
    setRangeTextDecorationThickness(start: number, end: number, value: TextDecorationThickness): void;
    getRangeTextDecorationColor(start: number, end: number): TextDecorationColor | PluginAPI['mixed'] | null;
    setRangeTextDecorationColor(start: number, end: number, value: TextDecorationColor): void;
    getRangeTextDecorationSkipInk(start: number, end: number): boolean | PluginAPI['mixed'] | null;
    setRangeTextDecorationSkipInk(start: number, end: number, value: boolean): void;
    getRangeLineHeight(start: number, end: number): LineHeight | PluginAPI['mixed'];
    setRangeLineHeight(start: number, end: number, value: LineHeight): void;
    getRangeListOptions(start: number, end: number): TextListOptions | PluginAPI['mixed'];
    setRangeListOptions(start: number, end: number, value: TextListOptions): void;
    getRangeListSpacing(start: number, end: number): number | PluginAPI['mixed'];
    setRangeListSpacing(start: number, end: number, value: number): void;
    getRangeIndentation(start: number, end: number): number | PluginAPI['mixed'];
    setRangeIndentation(start: number, end: number, value: number): void;
    getRangeParagraphIndent(start: number, end: number): number | PluginAPI['mixed'];
    setRangeParagraphIndent(start: number, end: number, value: number): void;
    getRangeParagraphSpacing(start: number, end: number): number | PluginAPI['mixed'];
    setRangeParagraphSpacing(start: number, end: number, value: number): void;
    getRangeTextWrapStyle(start: number, end: number): TextWrapStyle | PluginAPI['mixed'];
    setRangeTextWrapStyle(start: number, end: number, value: TextWrapStyle): void;
}
interface NonResizableTextPathMixin extends BaseNonResizableTextMixin {
}
interface TextSublayerNode extends NonResizableTextMixin, MinimalFillsMixin {
}
interface DocumentNode extends BaseNodeMixin {
    readonly type: 'DOCUMENT';
    readonly children: ReadonlyArray<PageNode>;
    readonly documentColorProfile: 'LEGACY' | 'SRGB' | 'DISPLAY_P3';
    appendChild(child: PageNode): void;
    insertChild(index: number, child: PageNode): void;
    findChildren(callback?: (node: PageNode) => boolean): Array<PageNode>;
    findChild(callback: (node: PageNode) => boolean): PageNode | null;
    findAll(callback?: (node: PageNode | SceneNode) => boolean): Array<PageNode | SceneNode>;
    findOne(callback: (node: PageNode | SceneNode) => boolean): PageNode | SceneNode | null;
    findAllWithCriteria<T extends NodeType[]>(criteria: FindAllCriteria<T>): Array<{
        type: T[number];
    } & (PageNode | SceneNode)>;
    findWidgetNodesByWidgetId(widgetId: string): Array<WidgetNode>;
}
interface ExplicitVariableModesMixin {
    explicitVariableModes: {
        [collectionId: string]: string;
    };
    clearExplicitVariableModeForCollection(collection: VariableCollection): void;
    setExplicitVariableModeForCollection(collection: VariableCollection, modeId: string): void;
}
interface PageNode extends BaseNodeMixin, ChildrenMixin, ExportMixin, ExplicitVariableModesMixin, MeasurementsMixin {
    readonly type: 'PAGE';
    clone(): PageNode;
    guides: ReadonlyArray<Guide>;
    selection: ReadonlyArray<SceneNode>;
    selectedTextRange: {
        node: TextNode;
        start: number;
        end: number;
    } | null;
    flowStartingPoints: ReadonlyArray<{
        nodeId: string;
        name: string;
    }>;
    backgrounds: ReadonlyArray<Paint>;
    prototypeBackgrounds: ReadonlyArray<Paint>;
    readonly prototypeStartNode: FrameNode | GroupNode | ComponentNode | InstanceNode | null;
    readonly isPageDivider: boolean;
    loadAsync(): Promise<void>;
    focusedSlide?: SlideNode | null;
    focusedNode: SceneNode | null;
}
interface FrameNode extends DefaultFrameMixin {
    readonly type: 'FRAME';
    clone(): FrameNode;
}
interface GroupNode extends BaseNodeMixin, SceneNodeMixin, ReactionMixin, ChildrenMixin, ContainerMixin, BlendMixin, LayoutMixin, ExportMixin, AspectRatioLockMixin {
    readonly type: 'GROUP';
    clone(): GroupNode;
}
interface TransformGroupNode extends BaseNodeMixin, SceneNodeMixin, ReactionMixin, ChildrenMixin, ContainerMixin, BlendMixin, LayoutMixin, ExportMixin, AspectRatioLockMixin {
    readonly type: 'TRANSFORM_GROUP';
    clone(): TransformGroupNode;
    transformModifiers: TransformModifier[];
}
interface SliceNode extends BaseNodeMixin, SceneNodeMixin, LayoutMixin, ExportMixin {
    readonly type: 'SLICE';
    clone(): SliceNode;
}
interface RectangleNode extends DefaultShapeMixin, ConstraintMixin, CornerMixin, ComplexStrokesMixin, RectangleCornerMixin, IndividualStrokesMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'RECTANGLE';
    clone(): RectangleNode;
}
interface LineNode extends DefaultShapeMixin, ConstraintMixin, AnnotationsMixin, ComplexStrokesMixin {
    readonly type: 'LINE';
    clone(): LineNode;
}
interface EllipseNode extends DefaultShapeMixin, ConstraintMixin, CornerMixin, ComplexStrokesMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'ELLIPSE';
    clone(): EllipseNode;
    arcData: ArcData;
}
interface PolygonNode extends DefaultShapeMixin, ConstraintMixin, CornerMixin, ComplexStrokesMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'POLYGON';
    clone(): PolygonNode;
    pointCount: number;
}
interface StarNode extends DefaultShapeMixin, ConstraintMixin, CornerMixin, ComplexStrokesMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'STAR';
    clone(): StarNode;
    pointCount: number;
    innerRadius: number;
}
interface VectorNode extends DefaultShapeMixin, ConstraintMixin, CornerMixin, ComplexStrokesMixin, VectorLikeMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'VECTOR';
    clone(): VectorNode;
}
interface TextNode extends DefaultShapeMixin, ConstraintMixin, NonResizableTextMixin, ComplexStrokesMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'TEXT';
    clone(): TextNode;
    textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM';
    textAutoResize: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
    textTruncation: 'DISABLED' | 'ENDING';
    maxLines: number | null;
    autoRename: boolean;
    textStyleId: string | PluginAPI['mixed'];
    setTextStyleIdAsync(styleId: string): Promise<void>;
}
interface TextPathNode extends DefaultShapeMixin, ConstraintMixin, NonResizableTextPathMixin, ComplexStrokesMixin, AnnotationsMixin, AspectRatioLockMixin {
    readonly type: 'TEXT_PATH';
    clone(): TextPathNode;
    textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
    textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM';
    autoRename: boolean;
    textStyleId: string | PluginAPI['mixed'];
    setTextStyleIdAsync(styleId: string): Promise<void>;
    readonly vectorPaths: VectorPaths;
    readonly vectorNetwork: VectorNetwork;
    readonly handleMirroring: HandleMirroring | PluginAPI['mixed'];
    textPathStartData: TextPathStartData;
}
type ComponentPropertyType = 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT';
type InstanceSwapPreferredValue = {
    type: 'COMPONENT' | 'COMPONENT_SET';
    key: string;
};
type SlotSettings = {
    stretchChildOnInsert?: boolean;
    displayEmptyByDefault?: boolean;
    minChildren?: number | null;
    maxChildren?: number | null;
    allowPreferredValuesOnly?: boolean;
};
type ComponentPropertyOptions = {
    preferredValues?: InstanceSwapPreferredValue[];
    description?: string;
    slotSettings?: SlotSettings;
};
type ComponentPropertyDefinitions = {
    [propertyName: string]: {
        type: ComponentPropertyType;
        defaultValue: string | boolean;
        preferredValues?: InstanceSwapPreferredValue[];
        variantOptions?: string[];
        description?: string;
        slotSettings?: SlotSettings;
        readonly boundVariables?: {
            [field in VariableBindableComponentPropertyDefinitionField]?: VariableAlias;
        };
    };
};
interface ComponentSetNode extends BaseFrameMixin, PublishableMixin, ComponentPropertiesMixin {
    readonly type: 'COMPONENT_SET';
    clone(): ComponentSetNode;
    readonly defaultVariant: ComponentNode;
}
interface ComponentNode extends DefaultFrameMixin, PublishableMixin, ComponentPropertiesMixin {
    readonly type: 'COMPONENT';
    clone(): ComponentNode;
    createInstance(): InstanceNode;
    createSlot(): SlotNode;
    getInstancesAsync(): Promise<InstanceNode[]>;
}
type ComponentProperties = {
    [propertyName: string]: {
        type: ComponentPropertyType;
        value: string | boolean;
        preferredValues?: InstanceSwapPreferredValue[];
        readonly boundVariables?: {
            [field in VariableBindableComponentPropertyField]?: VariableAlias;
        };
    };
};
interface InstanceNode extends DefaultFrameMixin {
    readonly type: 'INSTANCE';
    clone(): InstanceNode;
    getMainComponentAsync(): Promise<ComponentNode | null>;
    mainComponent: ComponentNode | null;
    swapComponent(componentNode: ComponentNode): void;
    setProperties(properties: {
        [propertyName: string]: string | boolean | VariableAlias;
    }): void;
    readonly componentProperties: ComponentProperties;
    detachInstance(): FrameNode;
    scaleFactor: number;
    readonly exposedInstances: InstanceNode[];
    isExposedInstance: boolean;
    readonly overrides: {
        id: string;
        overriddenFields: NodeChangeProperty[];
    }[];
    removeOverrides(): void;
}
interface SlotNode extends DefaultFrameMixin {
    readonly type: 'SLOT';
    clone(): FrameNode;
    resetSlot(): void;
    readonly limitViolations: Array<'BELOW_MIN' | 'ABOVE_MAX' | 'HAS_NON_PREFERRED'>;
}
interface BooleanOperationNode extends DefaultShapeMixin, ChildrenMixin, CornerMixin, ComplexStrokesMixin, ContainerMixin, AspectRatioLockMixin {
    readonly type: 'BOOLEAN_OPERATION';
    clone(): BooleanOperationNode;
    booleanOperation: 'UNION' | 'INTERSECT' | 'SUBTRACT' | 'EXCLUDE';
}
interface StickyNode extends OpaqueNodeMixin, MinimalFillsMixin, MinimalBlendMixin {
    readonly type: 'STICKY';
    readonly text: TextSublayerNode;
    authorVisible: boolean;
    authorName: string;
    isWideWidth: boolean;
    clone(): StickyNode;
}
interface StampNode extends DefaultShapeMixin, ConstraintMixin, StickableMixin, AspectRatioLockMixin {
    readonly type: 'STAMP';
    clone(): StampNode;
}
interface TableNode extends OpaqueNodeMixin, MinimalFillsMixin, MinimalBlendMixin {
    readonly type: 'TABLE';
    clone(): TableNode;
    readonly numRows: number;
    readonly numColumns: number;
    cellAt(rowIndex: number, columnIndex: number): TableCellNode;
    insertRow(rowIndex: number): void;
    insertColumn(columnIndex: number): void;
    removeRow(rowIndex: number): void;
    removeColumn(columnIndex: number): void;
    moveRow(fromIndex: number, toIndex: number): void;
    moveColumn(fromIndex: number, toIndex: number): void;
    resizeRow(rowIndex: number, height: number): void;
    resizeColumn(columnIndex: number, width: number): void;
}
interface TableCellNode extends MinimalFillsMixin {
    readonly type: 'TABLE_CELL';
    readonly text: TextSublayerNode;
    readonly rowIndex: number;
    readonly columnIndex: number;
    readonly toString: string;
    readonly parent: TableNode;
    readonly height: number;
    readonly width: number;
}
interface HighlightNode extends DefaultShapeMixin, ConstraintMixin, CornerMixin, VectorLikeMixin, StickableMixin, AspectRatioLockMixin {
    readonly type: 'HIGHLIGHT';
    clone(): HighlightNode;
}
interface WashiTapeNode extends DefaultShapeMixin, StickableMixin, AspectRatioLockMixin {
    readonly type: 'WASHI_TAPE';
    clone(): WashiTapeNode;
}
interface ShapeWithTextNode extends OpaqueNodeMixin, MinimalFillsMixin, MinimalBlendMixin, MinimalStrokesMixin {
    readonly type: 'SHAPE_WITH_TEXT';
    shapeType: 'SQUARE' | 'ELLIPSE' | 'ROUNDED_RECTANGLE' | 'DIAMOND' | 'TRIANGLE_UP' | 'TRIANGLE_DOWN' | 'PARALLELOGRAM_RIGHT' | 'PARALLELOGRAM_LEFT' | 'ENG_DATABASE' | 'ENG_QUEUE' | 'ENG_FILE' | 'ENG_FOLDER' | 'TRAPEZOID' | 'PREDEFINED_PROCESS' | 'SHIELD' | 'DOCUMENT_SINGLE' | 'DOCUMENT_MULTIPLE' | 'MANUAL_INPUT' | 'HEXAGON' | 'CHEVRON' | 'PENTAGON' | 'OCTAGON' | 'STAR' | 'PLUS' | 'ARROW_LEFT' | 'ARROW_RIGHT' | 'SUMMING_JUNCTION' | 'OR' | 'SPEECH_BUBBLE' | 'INTERNAL_STORAGE';
    readonly text: TextSublayerNode;
    readonly cornerRadius?: number;
    rotation: number;
    resize(width: number, height: number): void;
    rescale(scale: number): void;
    clone(): ShapeWithTextNode;
}
interface CodeBlockNode extends OpaqueNodeMixin, MinimalBlendMixin {
    readonly type: 'CODE_BLOCK';
    code: string;
    codeLanguage: 'TYPESCRIPT' | 'CPP' | 'RUBY' | 'CSS' | 'JAVASCRIPT' | 'HTML' | 'JSON' | 'GRAPHQL' | 'PYTHON' | 'GO' | 'SQL' | 'SWIFT' | 'KOTLIN' | 'RUST' | 'BASH' | 'PLAINTEXT' | 'DART';
    clone(): CodeBlockNode;
}
interface LabelSublayerNode {
    fills: Paint[] | PluginAPI['mixed'];
}
interface ConnectorNode extends OpaqueNodeMixin, MinimalBlendMixin, MinimalStrokesMixin {
    readonly type: 'CONNECTOR';
    readonly text: TextSublayerNode;
    readonly textBackground: LabelSublayerNode;
    readonly cornerRadius?: number;
    connectorLineType: 'ELBOWED' | 'STRAIGHT' | 'CURVED';
    connectorStart: ConnectorEndpoint;
    connectorEnd: ConnectorEndpoint;
    connectorStartStrokeCap: ConnectorStrokeCap;
    connectorEndStrokeCap: ConnectorStrokeCap;
    rotation: number;
    clone(): ConnectorNode;
}
type VariableResolvedDataType = 'BOOLEAN' | 'COLOR' | 'EASING' | 'FLOAT' | 'STRING' | 'TIMING';
interface VariableAlias {
    type: 'VARIABLE_ALIAS';
    id: string;
}
type VariableValue = boolean | string | number | RGB | RGBA | MotionEasing | VariableAlias;
type VariableScope = 'ALL_SCOPES' | 'TEXT_CONTENT' | 'CORNER_RADIUS' | 'WIDTH_HEIGHT' | 'GAP' | 'ALL_FILLS' | 'FRAME_FILL' | 'SHAPE_FILL' | 'TEXT_FILL' | 'STROKE_COLOR' | 'STROKE_FLOAT' | 'EFFECT_FLOAT' | 'EFFECT_COLOR' | 'OPACITY' | 'FONT_FAMILY' | 'FONT_STYLE' | 'FONT_WEIGHT' | 'FONT_SIZE' | 'LINE_HEIGHT' | 'LETTER_SPACING' | 'PARAGRAPH_SPACING' | 'PARAGRAPH_INDENT';
type CodeSyntaxPlatform = 'WEB' | 'ANDROID' | 'iOS';
interface Variable extends PluginDataMixin {
    readonly id: string;
    name: string;
    description: string;
    hiddenFromPublishing: boolean;
    getPublishStatusAsync(): Promise<PublishStatus>;
    readonly remote: boolean;
    readonly variableCollectionId: string;
    readonly key: string;
    readonly resolvedType: VariableResolvedDataType;
    resolveForConsumer(consumer: SceneNode): {
        value: VariableValue;
        resolvedType: VariableResolvedDataType;
    };
    setValueForMode(modeId: string, newValue: VariableValue): void;
    readonly valuesByMode: {
        [modeId: string]: VariableValue;
    };
    remove(): void;
    scopes: Array<VariableScope>;
    readonly codeSyntax: {
        [platform in CodeSyntaxPlatform]?: string;
    };
    setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void;
    removeVariableCodeSyntax(platform: CodeSyntaxPlatform): void;
    valuesByModeForCollectionAsync(collection: VariableCollection): Promise<{
        [modeId: string]: VariableValue;
    }>;
    removeOverrideForMode(extendedModeId: string): void;
}
interface VariableCollection extends PluginDataMixin {
    readonly id: string;
    name: string;
    hiddenFromPublishing: boolean;
    getPublishStatusAsync(): Promise<PublishStatus>;
    readonly remote: boolean;
    readonly isExtension: boolean;
    readonly modes: Array<{
        modeId: string;
        name: string;
    }>;
    readonly variableIds: string[];
    readonly defaultModeId: string;
    readonly key: string;
    extend(name: string): ExtendedVariableCollection;
    remove(): void;
    removeMode(modeId: string): void;
    addMode(name: string): string;
    renameMode(modeId: string, newName: string): void;
}
interface ExtendedVariableCollection extends Omit<VariableCollection, 'addMode'> {
    readonly isExtension: true;
    readonly parentVariableCollectionId: string;
    readonly rootVariableCollectionId: string;
    readonly variableIds: string[];
    readonly variableOverrides: {
        [variableId: string]: {
            [extendedModeId: string]: VariableValue;
        };
    };
    removeOverridesForVariable(variableToClear: Variable): void;
    readonly modes: Array<{
        modeId: string;
        name: string;
        parentModeId: string;
    }>;
    removeMode(modeId: string): void;
}
type AnnotationCategoryColor = 'yellow' | 'orange' | 'red' | 'pink' | 'violet' | 'blue' | 'teal' | 'green';
interface AnnotationCategory {
    readonly id: string;
    readonly label: string;
    readonly color: AnnotationCategoryColor;
    readonly isPreset: boolean;
    remove(): void;
    setColor(color: AnnotationCategoryColor): void;
    setLabel(label: string): void;
}
interface WidgetNode extends OpaqueNodeMixin, StickableMixin {
    readonly type: 'WIDGET';
    readonly widgetId: string;
    readonly widgetSyncedState: {
        [key: string]: any;
    };
    clone(): WidgetNode;
}
interface EmbedData {
    srcUrl: string;
    canonicalUrl: string | null;
    title: string | null;
    description: string | null;
    provider: string | null;
}
interface EmbedNode extends OpaqueNodeMixin {
    readonly type: 'EMBED';
    readonly embedData: EmbedData;
    clone(): EmbedNode;
}
interface LinkUnfurlData {
    url: string;
    title: string | null;
    description: string | null;
    provider: string | null;
}
interface LinkUnfurlNode extends OpaqueNodeMixin {
    readonly type: 'LINK_UNFURL';
    readonly linkUnfurlData: LinkUnfurlData;
    clone(): LinkUnfurlNode;
}
interface MediaData {
    hash: string;
}
interface MediaNode extends OpaqueNodeMixin {
    readonly type: 'MEDIA';
    readonly mediaData: MediaData;
    resize(width: number, height: number): void;
    resizeWithoutConstraints(width: number, height: number): void;
    clone(): MediaNode;
}
interface SectionNode extends ChildrenMixin, MinimalFillsMixin, OpaqueNodeMixin, AspectRatioLockMixin, MinimalStrokesMixin, CornerMixin, RectangleCornerMixin {
    readonly type: 'SECTION';
    sectionContentsHidden: boolean;
    clone(): SectionNode;
    resizeWithoutConstraints(width: number, height: number): void;
    resize(width: number, height: number): void;
}
interface SlideNode extends BaseFrameMixin {
    readonly type: 'SLIDE';
    clone(): SlideNode;
    getSlideTransition(): SlideTransition;
    setSlideTransition(transition: SlideTransition): void;
    isSkippedSlide: boolean;
    speakerNotes: string;
}
interface SlideRowNode extends OpaqueNodeMixin, ChildrenMixin {
    readonly type: 'SLIDE_ROW';
    clone(): SlideRowNode;
}
interface SlideGridNode extends OpaqueNodeMixin, ChildrenMixin {
    readonly type: 'SLIDE_GRID';
    clone(): SlideGridNode;
}
interface InteractiveSlideElementNode extends OpaqueNodeMixin {
    readonly type: 'INTERACTIVE_SLIDE_ELEMENT';
    readonly interactiveSlideElementType: 'POLL' | 'EMBED' | 'FACEPILE' | 'ALIGNMENT' | 'YOUTUBE';
    clone(): InteractiveSlideElementNode;
}
interface SlideTransition {
    readonly style: 'NONE' | 'DISSOLVE' | 'SLIDE_FROM_LEFT' | 'SLIDE_FROM_RIGHT' | 'SLIDE_FROM_BOTTOM' | 'SLIDE_FROM_TOP' | 'PUSH_FROM_LEFT' | 'PUSH_FROM_RIGHT' | 'PUSH_FROM_BOTTOM' | 'PUSH_FROM_TOP' | 'MOVE_FROM_LEFT' | 'MOVE_FROM_RIGHT' | 'MOVE_FROM_TOP' | 'MOVE_FROM_BOTTOM' | 'SLIDE_OUT_TO_LEFT' | 'SLIDE_OUT_TO_RIGHT' | 'SLIDE_OUT_TO_TOP' | 'SLIDE_OUT_TO_BOTTOM' | 'MOVE_OUT_TO_LEFT' | 'MOVE_OUT_TO_RIGHT' | 'MOVE_OUT_TO_TOP' | 'MOVE_OUT_TO_BOTTOM' | 'SMART_ANIMATE';
    readonly duration: number;
    readonly curve: 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' | 'GENTLE' | 'QUICK' | 'BOUNCY' | 'SLOW';
    readonly timing: {
        readonly type: 'ON_CLICK' | 'AFTER_DELAY';
        readonly delay?: number;
    };
}
type BaseNode = DocumentNode | PageNode | SceneNode;
type SceneNode = SliceNode | FrameNode | GroupNode | ComponentSetNode | ComponentNode | InstanceNode | BooleanOperationNode | VectorNode | StarNode | LineNode | EllipseNode | PolygonNode | RectangleNode | TextNode | TextPathNode | TransformGroupNode | StickyNode | ConnectorNode | ShapeWithTextNode | CodeBlockNode | StampNode | WidgetNode | EmbedNode | LinkUnfurlNode | MediaNode | SectionNode | HighlightNode | WashiTapeNode | TableNode | SlideNode | SlideRowNode | SlideGridNode | SlotNode | InteractiveSlideElementNode;
type NodeType = BaseNode['type'];
type StyleType = 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID';
type InheritedStyleField = 'fillStyleId' | 'strokeStyleId' | 'backgroundStyleId' | 'textStyleId' | 'effectStyleId' | 'gridStyleId' | 'strokeStyleId';
interface StyleConsumers {
    node: SceneNode;
    fields: InheritedStyleField[];
}
interface BaseStyleMixin extends PublishableMixin, PluginDataMixin {
    readonly id: string;
    readonly type: StyleType;
    getStyleConsumersAsync(): Promise<StyleConsumers[]>;
    name: string;
    remove(): void;
}
interface PaintStyle extends BaseStyleMixin {
    type: 'PAINT';
    paints: ReadonlyArray<Paint>;
    readonly boundVariables?: {
        readonly [field in VariableBindablePaintStyleField]?: VariableAlias[];
    };
}
interface TextStyle extends BaseStyleMixin {
    type: 'TEXT';
    fontSize: number;
    textDecoration: TextDecoration;
    fontName: FontName;
    letterSpacing: LetterSpacing;
    lineHeight: LineHeight;
    leadingTrim: LeadingTrim;
    paragraphIndent: number;
    paragraphSpacing: number;
    textWrapStyle: TextWrapStyle;
    listSpacing: number;
    hangingPunctuation: boolean;
    hangingList: boolean;
    textCase: TextCase;
    boundVariables?: {
        [field in VariableBindableTextField]?: VariableAlias;
    };
    setBoundVariable(field: VariableBindableTextField, variable: Variable | null): void;
}
interface EffectStyle extends BaseStyleMixin {
    type: 'EFFECT';
    effects: ReadonlyArray<Effect>;
    readonly boundVariables?: {
        readonly [field in VariableBindableEffectStyleField]?: VariableAlias[];
    };
}
interface GridStyle extends BaseStyleMixin {
    type: 'GRID';
    layoutGrids: ReadonlyArray<LayoutGrid>;
    readonly boundVariables?: {
        readonly [field in VariableBindableGridStyleField]?: VariableAlias[];
    };
}
type BaseStyle = PaintStyle | TextStyle | EffectStyle | GridStyle;
interface Image {
    readonly hash: string;
    getBytesAsync(): Promise<Uint8Array>;
    getSizeAsync(): Promise<{
        width: number;
        height: number;
    }>;
}
interface FindAllCriteria<T extends NodeType[]> {
    types?: T;
    pluginData?: {
        keys?: string[];
    };
    sharedPluginData?: {
        namespace: string;
        keys?: string[];
    };
}
type TransformModifier = LinearRepeatModifier | RadialRepeatModifier;
interface RepeatModifier {
    type: 'REPEAT';
    count: number;
    unitType: 'RELATIVE' | 'PIXELS';
    offset: number;
}
interface LinearRepeatModifier extends RepeatModifier {
    repeatType: 'LINEAR';
    axis: 'HORIZONTAL' | 'VERTICAL';
}
interface RadialRepeatModifier extends RepeatModifier {
    repeatType: 'RADIAL';
}
interface QueryResult extends Iterable<SceneNode> {
    readonly length: number;
    first(): SceneNode | null;
    last(): SceneNode | null;
    toArray(): SceneNode[];
    each(callback: (node: SceneNode, index: number) => void): QueryResult;
    map<T>(callback: (node: SceneNode, index: number) => T): T[];
    filter(callback: (node: SceneNode, index: number) => boolean): QueryResult;
    values(keys: string[]): Record<string, unknown>[];
    set(props: Record<string, unknown>): QueryResult;
    query(selector: string): QueryResult;
}
interface ScreenshotOptions {
    scale?: number;
    contentsOnly?: boolean;
}
interface BaseNodeMixin {
    set(props: Record<string, unknown>): this;
    query(selector: string): QueryResult;
    matches(selector: string): boolean;
}
interface SceneNodeMixin {
    screenshot(settings?: ScreenshotOptions): Promise<void>;
    placeholder: boolean;
    tree(options?: {
        maxDepth?: number;
        maxChildren?: number;
        fields?: string[];
    }): string;
}
interface PluginAPI {
    readonly io: {
        write(path: string, data: Uint8Array | string): void;
    };
}
interface PageNode {
    findPlacement(size: {
        width: number;
        height: number;
    }): Rect | null;
}
export { PluginAPI, VariablesAPI, LibraryVariableCollection, LibraryVariable, AnnotationsAPI, BuzzTextField, BuzzMediaField, TeamLibraryAPI, MotionAPI, UtilAPI, ViewportAPI, SuggestionResults, ParametersAPI, NodeChangeProperty, Transform, Vector, Rect, RGB, RGBA, FontName, FontVariationSettings, FontNameInput, TextCase, TextDecoration, TextDecorationStyle, FontStyle, TextDecorationOffset, TextDecorationThickness, TextDecorationColor, OpenTypeFeature, ArcData, DropShadowEffect, InnerShadowEffect, BlurEffectBase, BlurEffectNormal, BlurEffectProgressive, BlurEffect, NoiseEffectBase, NoiseEffectMonotone, NoiseEffectDuotone, NoiseEffectMultitone, NoiseEffect, TextureEffect, GlassEffect, ShaderEffect, Effect, ConstraintType, Constraints, ColorStop, ImageFilters, SolidPaint, GradientPaint, ImagePaint, VideoPaint, PatternPaint, ShaderPaint, Paint, ShaderPropertyValue, ShaderPropertyDefinition, Shader, Guide, RowsColsLayoutGrid, GridLayoutGrid, LayoutGrid, ExportSettingsConstraints, ExportSettingsImage, ExportSettingsSVGBase, ExportSettingsSVG, ExportSettingsSVGString, ExportSettingsPDF, ExportSettingsREST, ExportSettings, WindingRule, VectorVertex, VectorSegment, VectorRegion, VectorNetwork, VectorPath, VectorPaths, LetterSpacing, LineHeight, LeadingTrim, TextWrapStyle, HyperlinkTarget, TextListOptions, BlendMode, MaskType, Font, TextStyleOverrideType, StyledTextSegment, TextPathStartData, Reaction, VariableDataType, ExpressionFunction, Expression, VariableValueWithExpression, VariableData, ConditionalBlock, Action, SimpleTransition, DirectionalTransition, Transition, Trigger, Navigation, Easing, EasingFunctionBezier, EasingFunctionSpring, MotionEasing, PhysicalSpring, NormalizedSpring, AnimationStylePropValue, AvailableAnimationStylePropValue, BaseAnimationStyle, AvailableAnimationStyle, AnimationStyleConfiguration, AppliedAnimationStyle, KeyframeValue, ManualKeyframeInput, ManualKeyframeTrackInput, ManualKeyframe, ManualKeyframeBinding, ManualKeyframeTrack, KeyframeBinding, KeyframePropertyFieldName, EffectKeyframeFieldName, KeyframeField, ComponentPropKeyframeTracks, ComponentPropKeyframeBindings, PaintManualKeyframeTrack, PaintKeyframeBinding, EffectManualKeyframeTracks, EffectKeyframeBindings, ManualKeyframeTracks, Animations, Timeline, OverflowDirection, OverlayPositionType, OverlayBackground, OverlayBackgroundInteraction, PublishStatus, ConnectorEndpointPosition, ConnectorEndpointPositionAndEndpointNodeId, ConnectorEndpointEndpointNodeIdAndMagnet, ConnectorEndpoint, ConnectorStrokeCap, BaseNodeMixin, PluginDataMixin, SceneNodeMixin, MotionNodeMixin, VariableBindableNodeField, VariableBindableTextField, VariableBindablePaintField, VariableBindablePaintStyleField, VariableBindableColorStopField, VariableBindableEffectField, VariableBindableEffectStyleField, VariableBindableLayoutGridField, VariableBindableGridStyleField, VariableBindableComponentPropertyField, VariableBindableComponentPropertyDefinitionField, StickableMixin, ChildrenMixin, ConstraintMixin, DimensionAndPositionMixin, LayoutMixin, AspectRatioLockMixin, BlendMixin, ContainerMixin, StrokeCap, StrokeJoin, HandleMirroring, AutoLayoutMixin, GridTrackSize, GridTrackReorderOptions, GridTrackReorderEntry, GridLayoutMixin, AutoLayoutChildrenMixin, GridChildrenMixin, InferredAutoLayoutResult, DetachedInfo, MinimalStrokesMixin, IndividualStrokesMixin, MinimalFillsMixin, VariableWidthPoint, PresetVariableWidthStrokeProperties, CustomVariableWidthStrokeProperties, VariableWidthStrokeProperties, ComplexStrokeProperties, ScatterBrushProperties, StretchBrushProperties, BrushStrokeProperties, DynamicStrokeProperties, GeometryMixin, ComplexStrokesMixin, CornerMixin, RectangleCornerMixin, ExportMixin, FramePrototypingMixin, VectorLikeMixin, ReactionMixin, DocumentationLink, PublishableMixin, DefaultShapeMixin, BaseFrameMixin, DefaultFrameMixin, OpaqueNodeMixin, MinimalBlendMixin, Annotation, AnnotationProperty, AnnotationPropertyType, AnnotationsMixin, Measurement, MeasurementSide, MeasurementOffset, MeasurementsMixin, ComponentPropertiesMixin, BaseNonResizableTextMixin, NonResizableTextMixin, NonResizableTextPathMixin, TextSublayerNode, DocumentNode, ExplicitVariableModesMixin, PageNode, FrameNode, GroupNode, TransformGroupNode, SliceNode, RectangleNode, LineNode, EllipseNode, PolygonNode, StarNode, VectorNode, TextNode, TextPathNode, ComponentPropertyType, InstanceSwapPreferredValue, SlotSettings, ComponentPropertyOptions, ComponentPropertyDefinitions, ComponentSetNode, ComponentNode, ComponentProperties, InstanceNode, SlotNode, BooleanOperationNode, StickyNode, StampNode, TableNode, TableCellNode, HighlightNode, WashiTapeNode, ShapeWithTextNode, CodeBlockNode, LabelSublayerNode, ConnectorNode, VariableResolvedDataType, VariableAlias, VariableValue, VariableScope, CodeSyntaxPlatform, Variable, VariableCollection, ExtendedVariableCollection, AnnotationCategoryColor, AnnotationCategory, WidgetNode, EmbedData, EmbedNode, LinkUnfurlData, LinkUnfurlNode, MediaData, MediaNode, SectionNode, SlideNode, SlideRowNode, SlideGridNode, InteractiveSlideElementNode, SlideTransition, BaseNode, SceneNode, NodeType, StyleType, InheritedStyleField, StyleConsumers, BaseStyleMixin, PaintStyle, TextStyle, EffectStyle, GridStyle, BaseStyle, Image, FindAllCriteria, TransformModifier, RepeatModifier, LinearRepeatModifier, RadialRepeatModifier, QueryResult, ScreenshotOptions };

```
