# Loaded workflow file: figma-generate-design/references/componentization.md
Source snapshot SHA256: 98ca878fe4b4839646af27314ec5c24803f511962949e4a5f2be78e9cc1afbee

# Componentize repeated and reusable elements

Componentization is part of the **default** workflow, not an optional follow-up. Produce a componentized structure on the first pass — do not emit a flat tree of one-off frames and wait for a second "now make it componentized" prompt.
This applies to **empty files with no design system**: published-library discovery (Step 2) does not cover local components, so an empty library search is a reason to create local components, not a reason to skip them.

- **Design-system instances are already componentized.** Where Step 2 found a published component, instancing it satisfies this and is the preferred path.
- **For anything the design system does not cover, create a local component when the element repeats or maps to a reusable source component.** If the source defines a reusable component (`<ListRow>`, `<StatCard>`, `<NavItem>`) or the same element appears more than once, build it **once** with `$fig.component(...)` (or `$fig.variants(...)` for visual states), then place instances with `$fig.instance(...)` and override per-instance content — instead of hand-building N near-identical frames.
- **Mirror the source's component boundaries.** One source component maps to one Figma main component. This keeps the output editable and matches what designers expect to receive.

```js
// Build the reusable element ONCE as a main component, off to the side of the wrapper...
const wrapper = await figma.getNodeByIdAsync('WRAPPER_ID')
const row = $fig.component({ name: 'List Row', layoutMode: 'HORIZONTAL', itemSpacing: 8, x: wrapper.x + wrapper.width + 200, y: wrapper.y }, [
  $fig.text({ characters: 'Title' }).textProp('Title'),
  $fig.text({ characters: 'Meta' }).textProp('Meta').booleanProp('Show Meta'),
])
// ...then place instances with per-item props instead of rebuilding frames.
$fig.get('LIST_PLACEHOLDER_ID').replace(
  $fig.autoLayout({ name: 'List', layoutMode: 'VERTICAL', layoutSizingHorizontal: 'FILL' },
    ITEMS.map((item) => $fig.instance(row, {
      layoutSizingHorizontal: 'FILL',
      props: { Title: item.title, Meta: item.meta ?? '', 'Show Meta': Boolean(item.meta) },
    })),
  ),
)
await $fig.done()
return { listRowId: row.node.id }
```

Keep the main component off to the side of the wrapper (or in the file's existing components area) and place only **instances** inside the view, exactly as you do with design-system components. Labels and values are TEXT properties, optional parts are BOOLEAN properties, and only meaningful visual states are variants. A plan handle does not survive between calls: return the component's node ID and use `$fig.instance('ID', { props })` in later calls. For differing child counts, give the component a fixed maximum of slots with a BOOLEAN per slot instead of detaching or appending into an instance.

# Loaded workflow file: figma-generate-design/references/discover-product-font.md
Source snapshot SHA256: 212ee1c8d4ec2bd4f580fde52e97bda62e091a763aa1d2390af8182843802450

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
// Flush any queued builder changes before reading raw Plugin API nodes.
await $fig.done();
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

# Loaded workflow file: figma-generate-design/SKILL.md
Source snapshot SHA256: b3247e893ece4cd8437e06aa8b498b584b95c9785aa902dd6bd9e51b41eaa022

---
name: figma-generate-design
description: "Use this skill alongside figma-use when the task involves translating an application page, view, or multi-section layout into Figma. Triggers: 'write to Figma', 'create in Figma from code', 'push page to Figma', 'take this app/page and build it in Figma', 'create a screen', 'build a landing page in Figma', 'update the Figma screen to match code', 'convert this modal/dialog/drawer/panel to Figma'. This is the preferred workflow skill whenever the user wants to build or update a full page, modal, dialog, drawer, sidebar, panel, form, dashboard, list, table, card, header, message preview, or other composed product UI in Figma from code or a description—even when the user calls that composed UI a component. Discovers design system components, variables, and styles from Code Connect files, existing screens, and library search, then imports them and assembles views incrementally section-by-section using design system tokens instead of hardcoded values."
disable-model-invocation: false
---
# Build / Update Screens and Views from Design System
**Hard deliverable gate:** Code-to-design output must recreate the UI as editable text, components, icons, and hierarchy.
Treat any screenshot or flattened rendering of the complete UI only as a visual reference: never upload or import it into the deliverable, including as the wrapper fill or a child node, even if it exists in the repository or appears more pixel-accurate. Before completion, inspect the result; if the UI is not primarily represented by editable layers, rebuild it semantically or report failure.
Repeated UI is delivered as **instances of one main component**, not as N copies of a frame.

Use this skill to create or update **screens, views, and multi-section UI containers** in Figma by **reusing the published design system** — components, variables, and styles — rather than drawing primitives with hardcoded values. This includes full pages, modals, dialogs, drawers, sidebars, panels, and any composed view with multiple sections. The key insight: the Figma file likely has a published design system with components, color/spacing variables, and text/effect styles that correspond to the codebase's UI components and tokens. Find and use those instead of drawing boxes with hex colors.

**MANDATORY**: You MUST also load [figma-use](../figma-use/SKILL.md) before any `use_figma` call. That skill contains critical rules (color ranges, font loading, etc.) that apply to every script you write.

When available, call `create_session` with `fileKey` and `description` before file reads or edits (create the file first if needed), then pass the returned `sessionId` unchanged to every call that accepts it, including follow-ups and work across files.

**Always include `figma-generate-design` in the comma-separated `skillNames` parameter when calling `use_figma` as part of this skill. If this skill was loaded via an MCP resource, you MUST prefix the name with `resource:` (e.g. `resource:figma-generate-design`).** This is a logging parameter — it does not affect execution.
## Image and vector assets
Reuse available source, captured, or library assets first. If suitable assets are unavailable, use Figma’s `generate_image` for raster images or `generate_vector_illustration` for editable icons, logos, and illustrations.
## Skill Boundaries

- Use this skill when the deliverable is a **composed Figma view** (new or updated) — including a form, dashboard, list, table, card, header, panel, dialog, message preview, or other multi-section container — built from design system component instances. This applies even when the user calls the composed view a component.
- If the primary deliverable is a **reusable library primitive or foundation** intended for variants, tokens, or publication, use [figma-generate-library](../figma-generate-library/SKILL.md) with [figma-use](../figma-use/SKILL.md) instead.
- If the user wants to write **Code Connect mappings**, switch to [figma-code-connect](../figma-code-connect/SKILL.md).

## Prerequisites

- Figma MCP server must be connected
- The target Figma file may have a published design system (or access to a team library). An **empty file with no library is supported**: reuse whatever the file has, and create local components for the rest.
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

> **Required invariants:**
>
> - Complete Code Connect discovery and select the target library before mutating the deliverable. Discovery-only imports and temporary instances are allowed; remove temporary instances immediately.
> - Apply each selected asset where it is imported. If an import fails, try the next applicable exact result before building a manual fallback.

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
if (set?.type === "COMPONENT_SET") {
  return { assetType: "component_set", componentSetKey: set.key };
}
if (set?.type === "COMPONENT") {
  return { assetType: "component", componentKey: set.key };
}
throw new Error("Expected a component or component set");
```

Batch multiple lookups in a single call. Use the returned keys with either `importComponentByKeyAsync()` or `importComponentSetByKeyAsync()` depending on each item's `assetType` in Step 4.

Mark resolved components and continue with unresolved ones.

**2a-ii — REQUIRED: Select the library scope, then search and inspect the whole view.** Call `get_libraries`. If the user names one or more libraries, use their exact keys whether they appear in `libraries_added_to_file` or `libraries_available_to_add`. Otherwise search across all libraries in `libraries_added_to_file` together. Pass the selected keys in `includeLibraryKeys` on every search. Only when unresolved gaps have no suitable match, add specifically relevant libraries from `libraries_available_to_add` and retry those unresolved queries; do not broaden to unrelated available libraries. In the first batched `search_design_system` call, include one component query for the requested view or flow alongside queries for unresolved items already known from source or Code Connect inspection. Name the whole-view query by purpose and container (for example, `billing settings drawer`). Inspect the strongest candidate. If it covers two or more requested sections, select it as a foundation; otherwise continue without a whole-view composite.

**2a-iii — Inspect existing screens.** Check if the target file already contains screens using the same design system. One read-only `use_figma` call inventories an existing frame — its component keys, bound variables, and text/effect styles — in a single authoritative pass. Run it once here and reuse the result in 2b and 2c rather than re-walking the frame:

```js
const frame = figma.currentPage
  .query('[name="Existing Screen"]')
  .first();

if (!frame) {
  return {
    components: [],
    variables: [],
    textStyles: [],
    effectStyles: [],
  };
}

const components = new Map();

frame.query('INSTANCE').each(instance => {
  const mc = instance.mainComponent;
  if (!mc) return;

  const cs = mc.parent?.type === 'COMPONENT_SET' ? mc.parent : null;
  const asset = cs ?? mc;

  if (asset.key && !components.has(asset.key)) {
    components.set(asset.key, {
      name: asset.name,
      key: asset.key,
      isSet: !!cs,
      sampleVariant: mc.name,
    });
  }
});

// Inspect bindings on every descendant node that has them.
const variableIds = new Set(
  frame.query('[boundVariables.*]')
    .values(['boundVariables'])
    .flatMap(({ boundVariables }) =>
      Object.values(boundVariables).flat()
    )
    .map(binding => binding?.id)
    .filter(Boolean)
);

async function collectStyles(prop) {
  const ids = new Set(
    frame.query(`[${prop}]`)
      .values([prop])
      .map(row => row[prop])
      .filter(id => typeof id === 'string' && id.length > 0)
  );

  const styles = await Promise.all(
    [...ids].map(id => figma.getStyleByIdAsync(id))
  );

  return styles.filter(Boolean).map(({ name, id, key }) => ({
    name, id, key,
  }));
}

const [variables, textStyles, effectStyles] = await Promise.all([
  Promise.all(
    [...variableIds].map(id => figma.variables.getVariableByIdAsync(id))
  ),
  collectStyles('textStyleId'),
  collectStyles('effectStyleId'),
]);

return {
  components: [...components.values()],
  variables: variables.filter(Boolean).map(v => ({
    name: v.name,
    id: v.id,
    key: v.key,
    type: v.resolvedType,
    remote: v.remote,
  })),
  textStyles,
  effectStyles,
};
```

Match `components` against your unresolved components; Code Connect keys from 2a-i stay authoritative. Mark any newly resolved.

**2a-iv — Search only the gaps needed for construction.** After Code Connect, whole-view discovery, and existing-screen inspection, search for unresolved components and tokens the design still needs. Batch independent one-intent entries, keep `includeLibraryKeys` restricted to the selected library scope, and carry selected keys into the build. Do not delay construction to exhaustively search every unresolved role.

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

**Use one intent per query.** `search_design_system` does not apply OR semantics, so never pack alternatives or synonyms into one string ("Button IconButton icon" matches nothing useful). Use an exact design-system name or component type when known; otherwise search by the asset's UI role, such as "archive action icon" or "primary submit button".
Map every selected key to a section or property. Reuse applicable composite descendants instead of building parallel replacements, and keep nested instances intact unless only an example/template wrapper must be detached.

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

**Inspect existing screens first.** Reuse `variables` from the 2a-iii inventory; if that step was skipped, run the inventory here when an existing screen is available. For unresolved variables, use `search_design_system` with `queries` entries whose `entity` is `"variable"`.

> **WARNING: Two different variable discovery methods — do not confuse them.**
>
> - `use_figma` with `figma.variables.getLocalVariableCollectionsAsync()` — returns **only local variables defined in the current file**. If this returns empty, it does **not** mean no variables exist. Remote/published library variables are invisible to this API.
> - `search_design_system` with `entity: "variable"` query entries — searches remote and published library variables. Scope every query to the library keys selected in 2a-ii with `includeLibraryKeys`.
>
> **Never conclude "no variables exist" based solely on `getLocalVariableCollectionsAsync()` returning empty.** Always also run `search_design_system` with variable query entries to check for library variables before deciding to create your own.

**Query strategy:** `search_design_system` matches against **variable names** (e.g., "Gray/gray-9", "core/gray/100", "space/400"), not categories. Put multiple short, simple searches in one `queries` call rather than one compound query. Every array entry must be an `{ "entity": "variable", "query": "..." }` object, never a bare string:

- **Primitive colors:** `{ "entity": "variable", "query": "gray" }`, `{ "entity": "variable", "query": "red" }`, etc.
- **Semantic colors:** `{ "entity": "variable", "query": "background" }`, `{ "entity": "variable", "query": "surface" }`, etc.
- **Spacing/sizing:** `{ "entity": "variable", "query": "space" }`, `{ "entity": "variable", "query": "radius" }`, etc.

If initial searches return empty, try shorter fragments or different naming conventions — libraries vary widely ("grey" vs "gray", "spacing" vs "space", "color/bg" vs "background").

For library variables (remote = true), import them by key with `figma.variables.importVariableByKeyAsync(key)`. For local variables, use `figma.variables.getVariableByIdAsync(id)` directly.

See [variable-patterns.md](../figma-use/references/variable-patterns.md) for binding patterns.

#### 2c: Discover styles (text styles, effect styles)

Reuse `textStyles` and `effectStyles` from the inventory in 2a-iii or 2b. If no inventory exists, inspect an available screen with the same script. Before hardcoding an unresolved reusable fill/stroke, typography, or effect role, issue a focused `search_design_system` entry with `entity: "style"`, such as "surface", "border", "heading", "body", "shadow", or "elevation". Batch independent entries, but do not exhaustively search roles covered by a selected component or existing-screen style. Search for any styles still missing.

Import library styles with `figma.importStyleByKeyAsync(key)`, then apply with `node.textStyleId = style.id` or `node.effectStyleId = style.id`.

See [text-style-patterns.md](../figma-use/references/text-style-patterns.md) and [effect-style-patterns.md](../figma-use/references/effect-style-patterns.md) for details.

### Step 3: Create the Wrapper Frame First With Placeholders

**MUST use $fig** Use `$fig` for all node creation. Start with the `$fig` quick reference in [figma-use](../figma-use/SKILL.md); open [fig-builder.md](../figma-use/references/fig-builder.md) only for APIs it does not list.

**Use as few `use_figma` calls as safely possible.** When the view fits in one retry-safe script, create the wrapper and build its sections in that same call. Use placeholders only for sections that must be built in a later call. New nodes with `placeholder: true` show up in the tool call result after plan changes are auto-flushed, e.g. `{ created: { '0:3': 'My Screen', '0:4': 'Header Placeholder' }}`

If Step 2 selected a whole-view composite, instance it inside the wrapper with `$fig.instance(...)` and create placeholders only for the sections it does not cover. Customize its covered descendants in Step 4; never append children directly to an instance.

```js
// --- Size the wrapper based on container type ---
// Full page:       { width: 1440, name: "Homepage" }
// Modal/dialog:    { width: 640, name: "Settings Modal" }
// Drawer/sidebar:  { width: 360, name: "Navigation Drawer" }
// Panel:           { width: 400, name: "Details Panel" }
// Adapt width to match the source code's actual dimensions.

$fig.autoLayout(
  {
    name: 'VIEW_NAME',
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'CENTER',
    width: WIDTH,
  },
  // Create placeholder sections for the screen
  [
    $fig.autoLayout({ name: 'Header', layoutSizingHorizontal: 'FILL', placeholder: true }),
    $fig.autoLayout({ name: 'Content', layoutSizingHorizontal: 'FILL', placeholder: true }),
    $fig.autoLayout({ name: 'Footer', layoutSizingHorizontal: 'FILL', placeholder: true }),
  ]
)
```

### Step 4: Build the Sections Inside the Wrapper

**This is the most important step.** Batch related sections into one `use_figma` call when the script stays safe to retry. Split only for page-context boundaries, hard-to-recover partial execution, or a targeted retry after a failure—not merely to create a validation checkpoint. When a section was left as a placeholder by an earlier call, fetch it by ID and replace it with the real section.

```js
const header = $fig.get("HEADER_PLACEHOLDER_ID_FROM_STEP_3");

// Import design system components by key
const buttonSet = await figma.importComponentSetByKeyAsync("BUTTON_SET_KEY");
const primaryButton = buttonSet.children.find(c =>
  c.type === "COMPONENT" && c.name.includes("variant=primary")
) || buttonSet.defaultVariant;

// Import design system variables for colors and spacing
const bgColorVar = await figma.variables.importVariableByKeyAsync("BG_COLOR_VAR_KEY");
const spacingVar = await figma.variables.importVariableByKeyAsync("SPACING_VAR_KEY");

const shadowStyle = await figma.importStyleByKeyAsync("SHADOW_STYLE_KEY");

// Replace the placeholder with a real section frame with variable bindings (not hardcoded values)
header.replace(
  $fig.autoLayout(
    {
      name: 'Header',
      layoutSizingHorizontal: 'FILL', // Set to FILL because auto-layout frames default to HUG
      paddingLeft: spacingVar,
      paddingRight: spacingVar,
      fills: [{ type: 'SOLID', color: bgColorVar }],
      effects: shadowStyle,
    },
    [
      $fig.instance(primaryButton)
    ]
  )
)
```

Use the runtime's automatically returned created/updated node IDs as structural evidence. If needed, `await $fig.done()` before reading materialized nodes and return relevant counts, names, or bounds. Follow Step 5 for the full-view composition screenshot and any post-fix visual validation.

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
- **For anything the design system does not cover that repeats or maps to a reusable source component, create a local component once with `$fig.component(...)` and place instances with `$fig.instance(...)`**, instead of hand-building N near-identical frames. One source component maps to one Figma main component.


See [references/componentization.md](references/componentization.md) for the build-once-place-instances pattern and code.

#### Icons: import the SVG, never reconstruct from rotated primitives

Icons are the **main exception to the build-manually-vs-import split above.** If the design system exposes an icon as a component, instance it (a single INSTANCE_SWAP property, not a variant per icon). Otherwise — most commonly when **grabbing an icon from the codebase to place or replace it in Figma** — import the icon's **SVG source directly** as a vector node. This is the primary, default path for icons; do not redraw them.

1. **Get the SVG from the codebase.** Read the icon's source — inline `<svg>`, the imported `.svg` asset, or the icon-library entry — and pass that exact SVG string. Prefer the codebase's own SVG over hand-authoring one.
2. **Create it with `$fig.svg(svgString, opts?)`**, which parses the SVG into a vector node tree. The SVG string **must** include a `viewBox` plus explicit `width`/`height` (e.g. `<svg width="24" height="24" viewBox="0 0 24 24" ...>`); without them it falls back to the `viewBox` size, which is often smaller than the slot — the usual cause of "the icon didn't size properly." (The imperative `figma.createNodeFromSvg(svgString)` also works and returns a `FrameNode` you can `.resize(size, size)`.)
3. **Size it to the slot.** Match the source's icon size — commonly 16/20/24px — via the `width`/`height` in the SVG string. Append it like any other plan node: as a child in the parent's `children`, or `slot.svg(svgString, opts)`.
4. **Never reconstruct an icon from rotated line/rect/ellipse primitives.** Figma's line rotation is unreliable in the `use_figma` context and produces broken, mis-rotated icons (a chevron collapses into a blob, an arrowhead detaches from its shaft). Importing the SVG is both more reliable and more editable.

```js
// Import a codebase icon SVG as a vector, sized to a 24px slot
const chevron = $fig.svg(
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="m9 18 6-6-6-6" stroke="#1A1A1A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  { name: 'icon/chevron-right' }
);
// include as a child when building a section — e.g. $fig.autoLayout({...}, [ label, chevron ])
// or append onto an existing plan node — e.g. row.svg('<svg .../>', { name: 'icon/chevron-right' })
```

**Codebase SVGs usually use `currentColor`** (e.g. `stroke="currentColor"` / `fill="currentColor"`), which `createNodeFromSvg` imports as **black** — it does not inherit the parent's color. Set the intended color after import: substitute the literal color into the SVG string before importing, or bind the imported vector fills/strokes to a design-system color variable with `setBoundVariableForPaint` (same as any paint). To turn an imported SVG into a reusable icon component (for INSTANCE_SWAP), see [figma-generate-library → Creating Icon Components](../figma-generate-library/references/component-creation.md) and the [INSTANCE_SWAP pattern](../figma-use/references/component-patterns.md#instance_swap-avoiding-variant-explosion).

### Step 5: Validate the Full View and Transfer Images

Before visual validation, use `use_figma` to read back the wrapper and return its total descendant count, counts for every descendant node type present, and the ID, name, node type, and dimensions of every image-filled node. These counts are evidence, not a numeric pass threshold; do not infer editability from a screenshot or accept token editable nodes layered over a complete-UI raster. If a screenshot or flattened rendering of the complete UI is present anywhere inside the wrapper, remove it and rebuild the UI semantically or report failure; do not claim completion.

After composing all sections, take **one full-view composition screenshot** of the wrapper frame and compare against the source. If it reveals a meaningful visual defect, apply targeted `use_figma` fixes — don't rebuild the entire view — then take **one** post-fix screenshot. The most recent passing screenshot is the final check: do not take an additional unchanged "final" shot, and do not screenshot every section individually.

Before visual fixes, compare the wrapper's instance, style, and bound-variable keys with the Step 2 map. Every applicable selected asset should appear in the output; replace manual equivalents and raw values before finishing.

Inspect the composition screenshot for:
- **Cropped/clipped text** — line heights or frame sizing cutting off descenders, ascenders, or entire lines
- **Overlapping content** — elements stacking on top of each other due to incorrect sizing or missing auto-layout
- Placeholder text still showing ("Title", "Heading", "Button")
- Truncated content from layout sizing bugs
- Wrong component variants (e.g., Neutral vs Primary button)
- **Wrong font family** — text rendered in a different typeface than the product uses (e.g. Inter where the product is SF Pro). The script ran without error, so this is invisible at a glance; assert it explicitly (see "Assert the font family is correct" below)
- **Blank image placeholders** — if images are missing, transfer them from the `generate_figma_design` capture before considering `generate_image` or `generate_vector_illustration` to generate placeholders (see "Transfer images from the generate_figma_design capture" below)

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

#### Generating placeholder images and vectors

Reuse existing assets if possible. If not, choose between `generate_image` and `generate_vector_illustration`. Then inform the user that Figma AI credits were used.

If Figma AI is unavailable or its credit limit is reached, ask before using an alternative image-generation provider. Upload only these alternative-provider images with `upload_assets`.

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

Follow [figma-use error recovery](../figma-use/references/validation-and-recovery.md#error-recovery-after-failed-use_figma):

- If `safeToRetryWithoutCanvasRead` is `true`, fix the error and retry.
- If `false`, read the canvas, determine what changed, then make changes.

Because this skill works in retry-safe construction phases, errors are naturally scoped to the current phase. Content from previous successful calls remains intact.

## Best Practices

- **Always search before building.** The design system likely has the component, variable, or style you need. Manual construction and hardcoded values should be the exception, not the rule.
- **Search unresolved gaps, one intent per query.** Try synonyms and partial terms as separate `{ entity, query }` entries in one `queries` call, never combined into one string—a "NavigationPill" might be found under "pill", "nav", "tab", or "chip", so pass those as four component entries. For variables, use `entity: "variable"` with queries like "color", "spacing", and "radius". Do this only for unresolved construction gaps, and stop once a suitable asset is found.
- **Prefer design system tokens over hardcoded values.** Use variable bindings for colors, spacing, and radii. Use text styles for typography. Use effect styles for shadows. This keeps the screen linked to the design system.
- **Prefer component instances over manual builds.** Instances stay linked to the source component and update automatically when the design system evolves.
- **Componentize by default.** Build repeated or reusable elements as a component once, then place instances. Do not ship a flat tree of one-off frames that needs a second "make it componentized" pass.
- **MUST use $fig for all node creation.** Do not use `figma.createFrame()`, `figma.createText()`, etc. Use `$fig.autoLayout()`, `$fig.text()`, `$fig.rectangle()`, etc.
- **Use auto-layout unless you have a compelling reason not to.** Auto-layout is the most reliably way to layout nodes. The only reason you should not use auto-layout is when you are asked not to, or if surrounding content does not use it.
- **Work in retry-safe construction phases.** Batch related sections into one `use_figma` call when the script stays safe to retry; split only at page-context boundaries, hard-to-recover mutations, or a targeted retry after an actual failure.
- **Validate visually with one composition screenshot.** Take one full-view screenshot after composition, and one more only after a targeted visual fix; the most recent passing screenshot is final.
- **Assert the font family, not just a successful load.** A script can load the wrong font without error. After building, verify rendered text uses the product font identified in Step 1 (see Step 5).
- **Match existing conventions.** If the file already has screens, match their naming, sizing, and layout patterns.

# Loaded workflow file: figma-use/references/common-patterns.md
Source snapshot SHA256: 7618569e29722cf4072547031fa14665129f90a546377a3aaeaba53dbd9f539b

# Common Patterns

> Part of the [use_figma skill](../SKILL.md). Working code examples for frequently used operations.

## Contents

- Basic Script Structure
- Create a Styled Shape
- Create a Text Node
- Create Frame with Auto-Layout
- Create Variable Collection with Multiple Modes
- Bind Color Variable to a Fill
- Create Component Variants with Component Properties
- Use a Component by Key (Team Libraries)
- Component Set with Variable Modes (Full Pattern)
- Large ComponentSet with Variable Modes (Multi-Step Pattern)
- Read Existing Nodes and Return Data


## Basic Script Structure

When using only `$fig` for mutations:

```js
// Your code here
// $fig...
```

When using the raw plugin API for mutations:

```js
const createdNodeIds = []
const mutatedNodeIds = []

// Your code here — track every node you create or mutate
// createdNodeIds.push(newNode.id)
// mutatedNodeIds.push(existingNode.id)

return {
  success: true,
  createdNodeIds,
  mutatedNodeIds,
  // Plus any other useful data for subsequent calls
  count: createdNodeIds.length
}
```

## Create a Styled Shape

```js
$fig.rectangle({
  name: "Blue Box",
  width: 200,
  height: 100,
  fills: [{ type: 'SOLID', color: { r: 0.047, g: 0.549, b: 0.914 } }],
  cornerRadius: 8,
})
```

## Create a Text Node

```js
$fig.text({
  characters: "Hello World",
  fontSize: 16,
  fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
  textAutoResize: 'WIDTH_AND_HEIGHT',
})
```

## Create Frame with Auto-Layout

```js
$fig.autoLayout({
  name: "Card",
  layoutMode: 'VERTICAL',
  primaryAxisAlignItems: 'MIN',
  counterAxisAlignItems: 'MIN',
  paddingLeft: 16,
  paddingRight: 16,
  paddingTop: 12,
  paddingBottom: 12,
  itemSpacing: 8,
  fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
  cornerRadius: 8,
})
```

## Create Variable Collection with Multiple Modes

```js
const collection = $fig.varCollection({ name: 'Theme/Colors', modes: ['Light', 'Dark'] })
const bgVar = collection.colorVar({
  name: 'bg',
  values: { Light: '#FFFFFF', Dark: '#1A1A1A' },
})
const textVar = collection.colorVar({
  name: 'text', values: { Light: '#000000', Dark: '#FFFFFF' },
})
await $fig.done()

// Real collection, mode, and variable IDs are available after materialization.
const modes = Object.fromEntries(collection.variableCollection.modes.map(m => [m.name, m.modeId]))
return {
  collectionId: collection.id,
  lightModeId: modes.Light,
  darkModeId: modes.Dark,
  bgVarId: bgVar.id,
  textVarId: textVar.id,
}
```

## Bind Color Variable to a Fill

```js
const variable = $fig.getVar('VariableID:1:2')
const rect = $fig.rectangle({ fills: [{ type: 'SOLID', color: variable }] })
await $fig.done()
return { nodeId: rect.id }
```

## Create Component Variants with Component Properties

Use the builder's property helpers on the layers inside each variant. Keep all creation in the plan; only unwrap to measure and lay out the materialized variants.

```js
const components = ['primary', 'secondary'].map((variant) =>
  $fig.component({
    name: `variant=${variant}`, layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER',
    paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
    layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
    cornerRadius: 6, itemSpacing: 8,
  }, [
    $fig.instance('ICON_COMPONENT_ID', { visible: false })
      .booleanProp('Show Icon').instanceSwapProp('Icon'),
    $fig.text({ characters: 'Button', fontSize: 14,
      fontName: { family: 'Inter', style: 'Regular' } }).textProp('Label'),
  ]),
)
const set = $fig.variants({ name: 'Button' }, components)
const preview = $fig.instance(set, { name: 'Button preview', props: { variant: 'primary' } })
$fig.get('DESTINATION_FRAME_ID').append(preview)
await $fig.done()
const componentSet = set.node // raw node; set.children still contains plan nodes

// Layout variants in a row after combining (they stack at 0,0 by default)
const colW = 140
componentSet.children.forEach((child, i) => {
  child.x = i * colW
  child.y = 0
})
// Resize from actual child bounds — formula-based sizing is error-prone
let maxX = 0, maxY = 0
for (const c of componentSet.children) {
  maxX = Math.max(maxX, c.x + c.width)
  maxY = Math.max(maxY, c.y + c.height)
}
componentSet.resizeWithoutConstraints(maxX + 40, maxY + 40)

return {
  componentSetId: componentSet.id,
  componentIds: components.map(c => c.id)
}
```

## Use a Component by Key (Team Libraries)

`search_design_system` returns `componentKey` for `assetType: "component"` and `componentSetKey` for `assetType: "component_set"`. Pass it directly into `$fig.get(...)` / `$fig.instance(...)` — the plan queues the library import automatically, so no separate `importComponentByKeyAsync` call is needed. The same call site accepts node IDs for components in the current file.

```js
// PREFERRED — asset key flows straight from search_design_system into $fig
const instance = $fig.instance(BUTTON_COMPONENT_KEY, { name: 'Submit', x: 40, y: 40 })

// Component set: pass the set's componentSetKey + variant props
const variantInstance = $fig.instance(BUTTON_SET_KEY, {
  name: 'Submit (md)',
  x: 240, y: 40,
  props: { Size: 'md', Variant: 'primary' },
})

// Wrap a set without instantiating, e.g. to inspect it after $fig.done()
const set = $fig.get(BUTTON_SET_KEY)
```

You do not need to import the component set, drill into `compSet.children`, or call `defaultVariant.createInstance()` yourself. `$fig.instance(setKey, { props })` picks the matching variant by `setProperties` after the instance is created from the default variant — the same path you'd use for variant switches on an existing instance via `$fig.set(inst, { props })` or `inst.setInstanceProps({...})`.

### Discover a set's variant props when you only have its key

`search_design_system` returns the set's `componentSetKey` but not its variant properties. Discover them across **two `use_figma` calls** because the first call returns the valid values in the tool result:

```js
const setHandle = $fig.get(BUTTON_SET_KEY)
await $fig.done()
const set = setHandle.node
if (!set || set.type !== 'COMPONENT_SET') {
  throw new Error(`Key ${BUTTON_SET_KEY} is not a COMPONENT_SET`)
}
return {
  componentPropertyDefinitions: set.componentPropertyDefinitions,
  variants: set.children
    .filter((child) => child.type === 'COMPONENT')
    .map((child) => ({ name: child.name, variantProperties: child.variantProperties })),
}
```

```js
// Call 2 — read the props from call 1's result, then instantiate the variant you want
$fig.instance(BUTTON_SET_KEY, { props: { Size: 'Large', Kind: 'Secondary' } })
```

The library must be reachable from the current file — a key from an inaccessible library errors with `failed to import DS asset <key>`.

## Component Set with Variable Modes (Full Pattern)

Create collections, variables, and components in the plan. FigQuery loads the requested fonts and binds variable handles in paints. After materialization, use the raw node API to select explicit modes and lay out the variants; FigQuery has no builder method for explicit variable modes.

```js
// 1. Create color collection with modes per variant
const modeNames = ['primary', 'secondary']
const colors = $fig.varCollection({ name: 'Component/Colors', modes: modeNames })
const bgVar = colors.colorVar({
  name: 'bg',
  values: { primary: '#0066E6', secondary: '#000000' },
})
const textVar = colors.colorVar({
  name: 'text-color',
  values: { primary: '#FFFFFF', secondary: '#1A1A1A' },
})

// 2. Create components with variable bindings
const components = modeNames.map(mode => $fig.component({
  name: `variant=${mode}`, layoutMode: 'HORIZONTAL',
  primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER',
  paddingLeft: 12, paddingRight: 12,
  layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG', cornerRadius: 6,
  fills: [{ type: 'SOLID', color: bgVar }],
}, [
  $fig.text({
    characters: 'Button', fontName: { family: 'Inter', style: 'Medium' }, fontSize: 14,
    fills: [{ type: 'SOLID', color: textVar }],
  }),
]))
const set = $fig.variants({ name: 'Button' }, components)
await $fig.done()

const collection = colors.variableCollection
const modeIds = Object.fromEntries(collection.modes.map(m => [m.name, m.modeId]))
let nextX = 40
for (const [i, component] of components.entries()) {
  const node = component.node
  node.setExplicitVariableModeForCollection(collection, modeIds[modeNames[i]])
  node.x = nextX
  node.y = 40
  nextX += node.width + 40
}
set.node.resizeWithoutConstraints(nextX, Math.max(...components.map(c => c.node.height)) + 80)
return { componentSetId: set.id, colorCollectionId: colors.id }
```

## Large ComponentSet with Variable Modes (Multi-Step Pattern)

For component sets with many variants (50+), split into multiple `use_figma` calls. Plan nodes do not survive between calls; return real IDs after `$fig.done()` and resolve them again in the next call.

**Call 1: Create variable collections and return IDs**

```js
const modeNames = ['mode1', 'mode2']
const coll = $fig.varCollection({ name: 'MyComponent/Colors', modes: modeNames })
const colorData = {
  'bg/default': ['#0B6BCB', '#636B74'],
  'bg/hover': ['#084E96', '#424A53'],
  'text': ['#FFFFFF', '#FFFFFF'],
}
const variables = Object.fromEntries(Object.entries(colorData).map(([name, values]) => [
  name,
  coll.colorVar({ name, values: Object.fromEntries(modeNames.map((mode, i) => [mode, values[i]])) }),
]))
await $fig.done()
return {
  collId: coll.id,
  modeIds: Object.fromEntries(coll.variableCollection.modes.map(m => [m.name, m.modeId])),
  varIds: Object.fromEntries(Object.entries(variables).map(([name, variable]) => [name, variable.id])),
}
```

**Call 2: Create components using stored IDs, combine and layout**

```js
// Replace these literals with the IDs returned by Call 1.
const collId = 'VariableCollectionId:X:Y'
const modeIds = { mode1: 'X:0', mode2: 'X:1' }
const varIds = {
  'bg/default': 'VariableID:X:2',
  'bg/hover': 'VariableID:X:3',
  'text': 'VariableID:X:4',
}
const collection = $fig.getVarCollection(collId)
const backgrounds = {
  default: $fig.getVar(varIds['bg/default']),
  hover: $fig.getVar(varIds['bg/hover']),
}
const textColor = $fig.getVar(varIds.text)
const modeNames = ['mode1', 'mode2']
const states = ['default', 'hover']
const variants = []
for (const [row, mode] of modeNames.entries()) {
  for (const [col, state] of states.entries()) {
    const component = $fig.component({
      name: `mode=${mode}, state=${state}`, layoutMode: 'HORIZONTAL',
      primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER',
      layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
      paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
      fills: [{ type: 'SOLID', color: backgrounds[state] }],
    }, [
      $fig.text({
        characters: 'Button', fontName: { family: 'Inter', style: 'Semi Bold' }, fontSize: 14,
        fills: [{ type: 'SOLID', color: textColor }],
      }),
    ])
    variants.push({ component, mode, row, col })
  }
}
const set = $fig.variants({ name: 'MyComponent' }, variants.map(v => v.component))
const section = $fig.section({ name: 'MyComponent Section' }, [set])
await $fig.done()

// Explicit modes require raw nodes. Variants also need manual grid layout.
const colW = Math.max(...variants.map(v => v.component.node.width)) + 40
const rowH = Math.max(...variants.map(v => v.component.node.height)) + 40
for (const { component, mode, row, col } of variants) {
  const node = component.node
  node.setExplicitVariableModeForCollection(collection.variableCollection, modeIds[mode])
  node.x = 40 + col * colW
  node.y = 40 + row * rowH
}
const cs = set.node
cs.resizeWithoutConstraints(
  Math.max(...cs.children.map(c => c.x + c.width)) + 40,
  Math.max(...cs.children.map(c => c.y + c.height)) + 40,
)
cs.x = 100
cs.y = 100
section.node.resize(cs.width + 200, cs.height + 200)
return { csId: set.id, sectionId: section.id, count: variants.length }
```

## Read Existing Nodes and Return Data

```js
// Query the current page. map receives raw FRAME nodes, so children is safe to read.
const data = $fig.query('FRAME').map(node => ({
  id: node.id,
  name: node.name,
  width: node.width,
  height: node.height,
  childCount: node.children.length,
}))
return { frames: data }
```

# Loaded workflow file: figma-use/references/component-patterns.md
Source snapshot SHA256: 5d7b3a4f468d7ad1cb3fe5a8deb9359a0cc770ebcf761a2a369397ab79302931

# Component & Variant API Patterns

> Part of the [use_figma skill](../SKILL.md). How to correctly use the Plugin API for components, variants, and component properties.
>
> For design system context (when to use variants vs properties, code-to-Figma translation, property model), see [wwds-components](working-with-design-systems/wwds-components.md).

## Contents

- Plan nodes vs real nodes
- Creating a Component
- Combining Components into a Component Set (Variants)
- Laying Out Variants After combineAsVariants (Required)
- Component Properties: addComponentProperty API
- Linking Properties to Child Nodes (Required)
- INSTANCE_SWAP: Avoiding Variant Explosion
- Slots: createSlot and SLOT Properties
- Discovering Existing Conventions in the File
- Importing Components by Key
- Working with Instances (finding variants, setProperties, text overrides, detachInstance)


## Plan nodes vs real nodes

Use `$fig` for node creation. Its constructors and `componentHandle.createInstance()` alias return plan nodes. `done()` does not convert them to raw nodes, and `planNode.children` remains an array of plan nodes. Prefer `$fig.instance(componentPlanNode, opts)`, `.set(...)`, and `planNode.append(...)` for creation and placement. The raw property-inspection examples below explicitly access `.node` after materializing; never omit that step. See [fig-builder.md](fig-builder.md#creating-instances-from-component-plan-nodes).

## Creating a Component

`$fig.component()` returns a component plan node. Use options or `.set()` to configure it. For the raw component-property examples below, materialize and explicitly access `.node` to get a `ComponentNode`.

```javascript
const compPlan = $fig.component({
  name: 'MyComponent', layoutMode: 'HORIZONTAL',
  primaryAxisAlignItems: 'CENTER', counterAxisAlignItems: 'CENTER',
  paddingLeft: 12, paddingRight: 12,
  layoutSizingHorizontal: 'HUG', layoutSizingVertical: 'HUG',
  fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.36, b: 0.96 } }],
});
// Only needed if continuing with the raw component-property examples below:
await $fig.done();
const comp = compPlan.node;
if (!comp || comp.type !== 'COMPONENT') throw new Error('Expected a component');
```

## Combining Components into a Component Set (Variants)

`$fig.variants(opts, components)` groups component plan nodes into a component-set plan node. Use `$fig.component(...)` for each variant; frames are not valid variants.

Variant names use a `Property=Value` format. Every unique combination must exist as a child component — missing ones show as blank gaps in the variant picker.

```javascript
// Each component's name encodes its variant properties
const comp1 = $fig.component({ name: "size=md, style=primary" });
const comp2 = $fig.component({ name: "size=md, style=secondary" });
const set = $fig.variants({ name: "Button" }, [comp1, comp2]);
// Select a variant through the set; no intermediate flush is required.
const preview = $fig.instance(set, { name: "Button preview", props: { size: "md", style: "primary" } });
```

**Before creating variants, inspect the file** for existing naming patterns. Different files use different conventions (`State=Default` vs `state=default` vs `State/Default`). Always match what's already there.

## Laying Out Variants After combineAsVariants (Required)

After `$fig.variants` materializes, all children stack at `(0, 0)`. You **must** position them or the component set will appear as a single collapsed element with all variants overlapping.

```javascript
// Continue from the set plan node above. Flush to read measured sizes.
await $fig.done();
const cs = set.node; // cs.children contains raw ComponentNodes

// Simple row layout
cs.children.forEach((child, i) => {
  child.x = i * 150;
  child.y = 0;
});

// CRITICAL: resize the component set from actual child bounds
let maxX = 0, maxY = 0;
for (const child of cs.children) {
  maxX = Math.max(maxX, child.x + child.width);
  maxY = Math.max(maxY, child.y + child.height);
}
cs.resizeWithoutConstraints(maxX + 40, maxY + 40);
```

For multi-axis variants (e.g., size × style × state), parse the child's name to determine grid position:

```javascript
for (const child of cs.children) {
  const props = Object.fromEntries(
    child.name.split(', ').map(p => p.split('='))
  );
  const col = stateValues.indexOf(props.state);
  const row = styleValues.indexOf(props.style);
  child.x = col * colWidth;
  child.y = row * rowHeight;
}
```

## Component Properties: addComponentProperty API

> **Building with `$fig`?** Prefer the builder methods `layer.textProp(name)` / `.booleanProp(name)` / `.instanceSwapProp(name)` / `.slotProp(name)` — they add the property to the (set-aware) component with defaults inferred from the layer for TEXT, BOOLEAN, and INSTANCE_SWAP (SLOT uses an empty default), de-dup across variants, and handle materialization timing for you. See [fig-builder.md → Component properties](fig-builder.md#component-properties). Use the raw `addComponentProperty` API below when you are not in a `$fig` plan.

`addComponentProperty` adds a TEXT, BOOLEAN, or INSTANCE_SWAP property to a component. It returns a **string key** (e.g., `"label#4:0"`) — never hardcode or guess this key.

```javascript
// Returns the key as a string — capture it!
const labelKey = comp.addComponentProperty('Label', 'TEXT', 'Default text');
const showIconKey = comp.addComponentProperty('Show Icon', 'BOOLEAN', true);
const iconSlotKey = comp.addComponentProperty('Icon', 'INSTANCE_SWAP', iconComponentId);
```

**Timing**: Add component properties to each variant component **before** calling `combineAsVariants`. After combining, the component set inherits all properties from its children. Do not add properties to the `ComponentSetNode` directly.

## Linking Properties to Child Nodes (Required)

A property that is added but not linked to a child node does **nothing**. You must set `componentPropertyReferences` on the child:

`$fig.text(...)` loads the required font during `await $fig.done()` before applying text properties. Raw text writes still require an explicit font load first.

```javascript
// TEXT property → link to a text node's characters
const labelKey = comp.addComponentProperty('Label', 'TEXT', 'Button');
const textPlan = $fig.text({ characters: "Button" });
await $fig.done();
const textNode = textPlan.node;
comp.appendChild(textNode);
textNode.componentPropertyReferences = { characters: labelKey };

// BOOLEAN + INSTANCE_SWAP → link to an instance node
const showIconKey = comp.addComponentProperty('Show Icon', 'BOOLEAN', true);
const iconSlotKey = comp.addComponentProperty('Icon', 'INSTANCE_SWAP', iconComp.id);
const iconInstancePlan = $fig.instance(iconComp.id);
await $fig.done();
const iconInstance = iconInstancePlan.node; // raw node for componentPropertyReferences
comp.appendChild(iconInstance);
iconInstance.componentPropertyReferences = {
  visible: showIconKey,        // BOOLEAN controls show/hide
  mainComponent: iconSlotKey   // INSTANCE_SWAP controls which component
};
```

**Valid `componentPropertyReferences` keys:**
- `characters` — TEXT property on a TextNode
- `visible` — BOOLEAN property (any node)
- `mainComponent` — INSTANCE_SWAP property on an InstanceNode

## Slots: createSlot and SLOT Properties

Slots are designated drop zones inside a component where designers can place arbitrary content in instances — more flexible than INSTANCE_SWAP (which only swaps component instances). They appear as `SlotNode` (type `'SLOT'`) in the Plugin API and as a `SLOT`-typed component property.

### Builder: `planFrame.slotProp()` (preferred)

For new components, use `$fig.component` and attach `.slotProp(name)` to a descendant frame to create a slot property.

```javascript
const contentSlot = $fig.autoLayout({
  layoutMode: 'VERTICAL', width: 320, height: 200,
}).slotProp('Content');
const card = $fig.component({
  name: 'Card', layoutMode: 'VERTICAL', width: 320,
  primaryAxisSizingMode: 'AUTO', counterAxisSizingMode: 'FIXED',
}, [contentSlot]);
await $fig.done();
const slotPropKey = contentSlot.node.componentPropertyReferences.slotContentId;
```

Multiple slots are supported — bind a distinct direct child for each property:

```javascript
const cardWithFooter = $fig.component({ name: 'Card with footer' }, [
  $fig.frame({ name: 'Content' }).slotProp('Content'),
  $fig.frame({ name: 'Footer' }).slotProp('Footer'),
]);
await $fig.done();
return Object.keys(cardWithFooter.node.componentPropertyDefinitions);
```

### Raw Plugin API: `component.createSlot()` (preferred)

Creates a `SlotNode` as a direct child of the component and automatically creates a linked `SLOT` component property. No manual wiring needed.

```javascript
const card = figma.createComponent();
card.name = "Card";
card.layoutMode = "VERTICAL";
card.primaryAxisSizingMode = "AUTO";
card.counterAxisSizingMode = "FIXED";
card.resize(320, 100);

// Creates a SlotNode and auto-wires a SLOT component property
const contentSlot = card.createSlot();
contentSlot.name = "Content";
contentSlot.layoutMode = "VERTICAL"; // GRID is NOT allowed on slots
contentSlot.resize(320, 200);

// The auto-created property key is accessible via componentPropertyReferences
const slotPropKey = contentSlot.componentPropertyReferences["slotContentId"];
// e.g. "Content#7:1"
```

Multiple slots are supported — each call to `createSlot()` produces a separate slot and property:

```javascript
const contentSlot = card.createSlot();
contentSlot.name = "Content";

const footerSlot = card.createSlot();
footerSlot.name = "Footer";

// Component now has two SLOT properties automatically
return Object.keys(card.componentPropertyDefinitions);
// → ["Content#7:1", "Footer#7:2"]
```

### Manual binding via `addComponentProperty()`

Link a regular frame to a `SLOT` property with `componentPropertyReferences`:

```javascript
const slotPropKey = component.addComponentProperty("Content", "SLOT", "");
const slotFrame = figma.createFrame();
component.appendChild(slotFrame);
// slotFrame must not have GRID layoutMode, and must be a direct child (not nested inside another slot)
slotFrame.componentPropertyReferences = { slotContentId: slotPropKey };
```

### Populating slots in instances

Find the slot by its property reference after materializing the instance. A `SLOT`-only type lookup would miss a frame bound by `.slotProp()`.

```javascript
const instance = $fig.instance(card);
await $fig.done();
const instanceSlot = instance.query("SLOT[name=Content]").first();
if (!instanceSlot.node) throw new Error('Content slot not found');
instanceSlot.append($fig.autoLayout({ name: 'Button', cornerRadius: 8 }));
await $fig.done();
```

### Slot restrictions

- `GRID` layoutMode is not allowed on slot nodes
- Widgets, Stickies, and ComponentNodes cannot be appended directly to a slot
- Frames nested inside another slot cannot themselves be bound to a slot property
- `instance.setProperties({ [slotPropKey]: ... })` throws — slot content is set by appending children, not via `setProperties`
- For a raw `SlotNode` in an instance, `slotNode.resetSlot()` restores the original component slot content. Do not assume a frame bound to a `SLOT` property exposes this method.

## INSTANCE_SWAP: Avoiding Variant Explosion

When a component has many possible sub-elements (e.g., 30 different icons), **never** create a variant per sub-element. Use a single INSTANCE_SWAP property instead — the user picks from any compatible component at design time.

```javascript
// Create icon as its own ComponentNode
const iconPlan = $fig.component(
  { name: "Icon/Search", width: 24, height: 24 },
  [$fig.svg('<svg>...</svg>')]
);
await $fig.done();
const iconComp = iconPlan.node;

// Use it as the default for INSTANCE_SWAP
const iconSlotKey = comp.addComponentProperty('Icon', 'INSTANCE_SWAP', iconComp.id);
const instancePlan = $fig.instance(iconComp.id);
await $fig.done();
const instance = instancePlan.node; // raw node for componentPropertyReferences
comp.appendChild(instance);
instance.componentPropertyReferences = { mainComponent: iconSlotKey };
```

This works for icons, avatars, badges, or any swappable nested element.

## Discovering Existing Conventions in the File

**Always inspect the file before creating components.** Different files have different naming styles, structures, and conventions. Your code should match what's already there.

### List all existing components across all pages

`search_design_system` (MCP tool) is an option for published components. For on-canvas components, **don't loop pages inside one script** — even for read-only discovery.

**Prefer the two-step fan-out:**

```javascript
// Step 1 — one cheap use_figma call, no page switch. Returns the page IDs to fan out over.
return figma.root.children.map(p => ({ id: p.id, name: p.name }));
```

Then issue one `use_figma` call per page in parallel. Each script runs:

```javascript
// Step 2 — one call per page, currentPage set exactly once.
// Issue these calls in parallel; do not loop pages inside the script.
const page = await figma.getNodeByIdAsync(PAGE_ID); // PAGE_ID supplied by caller
await figma.setCurrentPageAsync(page);
// Indexed type lookup — much faster than findAll with a side-effect predicate.
const matches = page.findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] });
return matches.map(n => ({ pageName: page.name, name: n.name, type: n.type, id: n.id }));
```

See [gotchas.md → Set current page once per `use_figma` call](gotchas.md#set-current-page-once-per-use_figma-call--split-multi-page-work-into-parallel-calls) for the full rule.

### Inspect an existing component set's variant naming pattern

```javascript
const cs = await figma.getNodeByIdAsync('COMPONENT_SET_ID');
if (!cs || cs.type !== 'COMPONENT_SET') {
  throw new Error('Expected a component set');
}
const variantNames = cs.children.map(c => c.name);
const propDefs = cs.componentPropertyDefinitions;
return { variantNames, propDefs };
```

### Find existing components in the file

`search_design_system` is an option for published components. For on-canvas components, use the two-step fan-out from the section above — **don't loop pages inside one script.**

**Step 1** — one cheap `use_figma` call returns page IDs:

```javascript
return figma.root.children.map(p => ({ id: p.id, name: p.name }));
```

**Step 2** — issue one `use_figma` call per page in parallel. Each script:

```javascript
const page = await figma.getNodeByIdAsync(PAGE_ID);
await figma.setCurrentPageAsync(page);
// Indexed type lookup — much faster than findAll with a side-effect predicate.
const components = page.findAllWithCriteria({ types: ['COMPONENT'] });
return components.map(n => ({ name: n.name, id: n.id, page: page.name, w: n.width, h: n.height }));
```

## Using Components by Key (Team Libraries)

`search_design_system` returns `componentKey` for `assetType: "component"` and `componentSetKey` for `assetType: "component_set"`. Pass it directly into `$fig.get(...)` / `$fig.instance(...)` — the plan queues the library import automatically, so no separate `importComponentByKeyAsync` call is needed.

```javascript
// Instance a library component by its componentKey
$fig.instance(BUTTON_COMPONENT_KEY, { name: 'Submit' });

// Instance a specific variant of a component set by passing the set's
// componentSetKey + variant props
$fig.instance(BUTTON_SET_KEY, { props: { Size: 'md', Variant: 'primary' } });
```

You do not need to import the component set, drill into `compSet.children`, or call `defaultVariant.createInstance()` yourself. `$fig.instance(setKey, { props })` picks the matching variant by `setProperties` after the instance is created from the default variant — the same path used for variant switches on an existing instance via `$fig.set(inst, { props })` or `inst.setInstanceProps({...})`.

## Working with Instances

### Selecting a variant in a component set

Pass the variant property values in `props` — `$fig.instance` resolves them on the underlying `setProperties` call:

```javascript
$fig.instance(BUTTON_SET_KEY, {
  props: { variant: 'primary', size: 'md' },
});
```

### Switching the variant of an existing instance

Use `$fig.set` / `$fig.query(...).set({ props })` or `planNode.setInstanceProps({...})`. Both go through the same plan-managed `setProperties` path:

```javascript
const instance = $fig.get('1:42')                // an existing INSTANCE
instance.setInstanceProps({ variant: 'primary', size: 'medium' })

// Bulk: every matching instance on the page
$fig.query('INSTANCE[name=Button]').set({ props: { variant: 'primary' } })
```

### Overriding text in a component instance

**Always discover component properties BEFORE writing text overrides.** Components expose text as `TEXT`-type component properties, and `setProperties()` is the correct way to override them. Direct `node.characters` changes on property-managed text may be overridden by the component property system on render.

**Step 1: Inspect componentProperties on a sample instance:**

```javascript
const instancePlan = $fig.instance(comp.id); // comp is a raw ComponentNode in this example
await $fig.done();
const instance = instancePlan.node; // raw InstanceNode for property inspection
const propDefs = instance.componentProperties;
// Returns e.g.: { "Label#2:0": { type: "TEXT", value: "Button" }, "Has Icon#4:64": { type: "BOOLEAN", value: true } }
return propDefs;
```

Also check nested instances — a parent component may not expose text properties directly, but its nested child instances might:

```javascript
const nestedInstances = instance.findAllWithCriteria({ types: ["INSTANCE"] });
const nestedProps = nestedInstances.map(ni => ({
  name: ni.name,
  id: ni.id,
  properties: ni.componentProperties
}));
```

**Step 2: Use setProperties() for TEXT-type properties:**

```javascript
const instancePlan = $fig.instance(comp.id); // comp is a raw ComponentNode in this example
await $fig.done();
const instance = instancePlan.node; // raw InstanceNode for property inspection
const propDefs = instance.componentProperties;
for (const [key, def] of Object.entries(propDefs)) {
  if (def.type === "TEXT") {
    instance.setProperties({ [key]: "New text value" });
  }
}
```

For nested instances that expose their own TEXT properties, call `setProperties()` on the nested instance:

```javascript
// Use the type-indexed criteria for the type filter, then narrow by name.
const nestedHeading = instance
  .findAllWithCriteria({ types: ["INSTANCE"] })
  .find(n => n.name === "Text Heading");
if (nestedHeading) {
  nestedHeading.setProperties({ "Text#2104:5": "Actual heading text" });
}
```

**Step 3: Only fall back to direct node.characters for unmanaged text.** If text is NOT controlled by any component property, find text nodes directly. **Always load the node's actual font first** — instance text nodes inherit fonts from the source component, so don't assume Inter Regular:

```javascript
const textNodes = instance.findAllWithCriteria({ types: ["TEXT"] });
// Dedupe fonts and load them in parallel before mutating text. Awaiting
// loadFontAsync per node in the loop serializes one IPC round-trip per
// text node and reloads the same font repeatedly.
const uniqueFonts = [...new Map(
  textNodes.map(t => [JSON.stringify(t.fontName), t.fontName])
).values()];
await Promise.all(uniqueFonts.map(f => figma.loadFontAsync(f)));
for (const t of textNodes) {
  t.characters = "Updated text";
}
```

### detachInstance() invalidates ancestor node IDs

**Warning:** When `detachInstance()` is called on a nested instance inside a library component instance, the parent instance may also get implicitly detached (converted from INSTANCE to FRAME with a **new ID**). Subsequent `getNodeByIdAsync(oldParentId)` returns null.

```javascript
// WRONG — cached parent ID becomes invalid after child detach
const parentId = parentInstance.id;
nestedChild.detachInstance();
const parent = await figma.getNodeByIdAsync(parentId); // null!

// CORRECT — re-discover nodes by traversal from a stable (non-instance) parent
const stableFrame = await figma.getNodeByIdAsync(manualFrameId); // a frame YOU created
nestedChild.detachInstance();
// Re-find the parent by traversing from the stable frame
const parent = stableFrame.findOne(n => n.name === "ParentName");
```

If you must detach multiple nested instances across sibling components, do it in a **single** `use_figma` call — discover all targets by traversal at the start before any detachment mutates the tree.

## Inspecting Component Metadata (Deep Traversal)

For a library component, use `$fig.get(componentKey)` to wrap it, then read `.node` after `await $fig.done()`.

These helpers extract the full property schema and descendant structure of a component. Useful for understanding complex components before creating instances or setting properties.
<a id="component-property-owner-narrowing"></a>**Component-property owner narrowing:** `componentPropertyDefinitions` throws when read from a variant `COMPONENT`, including through optional chaining. Always resolve the property-owning node before touching the getter: a `COMPONENT_SET` owns its definitions, a variant component delegates to its parent set, and a non-variant component owns its own definitions.
```javascript
/**
 * Given a main component node, returns the component set parent if one exists,
 * otherwise returns the component itself. Used to get the top-level node that
 * holds `componentPropertyDefinitions`.
 *
 * @param {ComponentNode} mainComponent
 * @returns {ComponentNode|ComponentSetNode}
 */
function getRelevantComponentNode(mainComponent) {
  return mainComponent.parent.type === "COMPONENT_SET"
    ? mainComponent.parent
    : mainComponent;
}

/**
 * Extracts `componentPropertyDefinitions` from a component or component set node
 * into a flat map keyed by property key.
 *
 * @param {ComponentNode|ComponentSetNode} node
 * @returns {Record<string, {name: string, type: string, key: string, variantOptions?: string[]}>}
 */
function getComponentProps(node) {
  const owner = node.type === "COMPONENT" && node.parent.type === "COMPONENT_SET"
    ? node.parent
    : node;
  const definitions = owner.componentPropertyDefinitions;
  const result = {};
  for (const key in definitions) {
    const prop = {
      name: key.replace(/#[^#]+$/, ""),
      type: definitions[key].type,
      key: key
    };
    if (prop.type === "VARIANT") {
      prop.variantOptions = definitions[key].variantOptions;
    }
    result[key] = prop;
  }
  return result;
}

/**
 * Recursively walks a component tree and collects all INSTANCE and TEXT nodes
 * into `result`, keyed by `TYPE[name]`. Handles variant namespacing and
 * deduplicates nodes with identical names but differing property references.
 *
 * @param {SceneNode} node - The node to traverse.
 * @param {string[]} namespace - Accumulated variant names for the current path.
 * @param {Record<string, object>} result - Accumulator object populated in place.
 */
function collectDescendants(node, namespace, result) {
  if (node.type === "INSTANCE" || node.type === "TEXT") {
    const references = node.componentPropertyReferences || {};
    if (!node.visible && !references.visible) return;

    const object = { type: node.type, name: node.name, references };
    let key = `${node.type}[${node.name}]`;

    if (result[key] && JSON.stringify(references) !== JSON.stringify(result[key].references)) {
      key += btoa(btoa(unescape(encodeURIComponent(JSON.stringify(references)))));
    }

    if (node.type === "INSTANCE") {
      const mainComponent = getRelevantComponentNode(node.mainComponent);
      object.properties = getComponentProps(mainComponent);
      object.descendants = {};
      object.mainComponentName = mainComponent.name;
      collectDescendants(mainComponent, [], object.descendants);
    }

    const start = namespace.length ? { variants: [] } : {};
    result[key] = Object.assign(object, result[key] || start);
    if (namespace.length) result[key].variants.push(namespace[namespace.length - 1]);
  } else if ("children" in node && node.visible) {
    if (node.type === "COMPONENT" && node.parent.type === "COMPONENT_SET") namespace.push(node.name);
    node.children.forEach(child => collectDescendants(child, namespace, result));
  }
}

/**
 * Returns structured metadata for a component or component set defined in the current file.
 *
 * @param {string} componentId - The node ID of a COMPONENT or COMPONENT_SET node.
 * @returns {Promise<{name: string, nodeId: string, properties: object, descendants: object}|undefined>}
 */
async function getLocalComponentMetadata(componentId) {
  const node = await figma.getNodeByIdAsync(componentId);
  if (node.type === "COMPONENT_SET" || node.type === "COMPONENT") {
    const result = {
      name: node.name,
      nodeId: node.id,
      properties: {},
      descendants: {}
    };
    result.properties = getComponentProps(node);
    collectDescendants(node, [], result.descendants);
    return result;
  } else {
    throw new Error("Node is not a Component or Component Set");
  }
}

/**
 * Returns structured metadata for a published component or component set loaded by its key.
 *
 * @param {string} componentKey - The published key of the component or component set.
 * @returns {Promise<{name: string, nodeId: string, properties: object, descendants: object}>}
 */
async function getPublishedComponentMetadata(componentKey) {
  // $fig.get queues the library import in the plan; await $fig.done() to
  // materialize, then read the live SceneNode via planNode.node.
  const planNode = $fig.get(componentKey);
  await $fig.done();
  const node = planNode.node;
  if (!node || (node.type !== 'COMPONENT' && node.type !== 'COMPONENT_SET')) {
    throw new Error(`No Component or Component Set available with key '${componentKey}'`);
  }
  const result = {
    name: node.name,
    nodeId: node.id,
    properties: getComponentProps(node),
    descendants: {},
  };
  collectDescendants(node, [], result.descendants);
  return result;
}
```

### Full metadata extraction script

```javascript
// For local components, use getLocalComponentMetadata:
const result = await getLocalComponentMetadata('COMPONENT_OR_SET_ID');
return result;

// For published components, use getPublishedComponentMetadata:
// const result = await getPublishedComponentMetadata('COMPONENT_KEY');
// return result;
```

# Loaded workflow file: figma-use/references/critical-rules-deep.md
Source snapshot SHA256: d2c4fec54b80aff4c57c8bef6c45f1b7c8ca0e7e0967273b22632bae8e7a1399

# figma-use — Deep Critical Rules & Worked Examples

The SKILL.md body has the terse rules. This file has the worked WRONG/RIGHT examples and edge cases. Load this when:
- You're about to write a multi-section script and want to see the full $fig builder pattern
- You hit a `Property X failed validation` error and want the validation reference
- You're doing bulk-mutation work and need the concrete 3-call template

---

## $fig — full worked examples

```js
// WRONG — verbose raw Plugin API (don't do this)
const frame = figma.createFrame()
frame.layoutMode = "VERTICAL"; frame.itemSpacing = 8
await figma.loadFontAsync({ family: "Inter", style: "Bold" })
const title = figma.createText(); title.fontName = { family: "Inter", style: "Bold" }
title.characters = "Title"; title.fontSize = 20
frame.appendChild(title)
// ...30+ lines

// RIGHT — one $fig expression (DEFAULT)
$fig.autoLayout(
  { name: 'Card', layoutMode: 'VERTICAL', itemSpacing: 8 },
  [
    $fig.text({ characters: 'Title', fontSize: 20, fontName: { family: 'Inter', style: 'Bold' } }),
    $fig.text({ characters: 'Description', fontSize: 14 }),
  ]
)
```

### Bulk component swap — use $fig.query().each(), not findAll() + setProperties loop

```js
// WRONG — raw findAll + manual loop (no batching, no font preload, verbose)
const chevron = await figma.importComponentByKeyAsync(CHEVRON_KEY)
const instances = figma.root.findAll(n => n.type === 'INSTANCE' && n.name === 'arrow_drop_down')
for (const inst of instances) {
  inst.setProperties({ [swapKey]: chevron.id })  // verbose, hits per-node overhead
}

// RIGHT — $fig.query batched + asset-key direct from `search_design_system`
// CHEVRON_KEY here is the `componentKey` field returned by search_design_system.
// $fig.get queues the library import in the plan; no separate await needed.
const chevron = $fig.get(CHEVRON_KEY)
$fig.query('INSTANCE[name=arrow_drop_down]').each(inst => {
  $fig.set(inst, { mainComponent: chevron })  // batched into plan; auto-materialized at script end
})
```

### Bulk variable creation — loop with `$fig.set`

```js
// WRONG — raw figma.variables.createVariable() per variable, 4 lines × 100 = 400 lines
const coll = figma.variables.createVariableCollection('FX Colors')
const v1 = figma.variables.createVariable('blue/10', coll.id, 'COLOR')
v1.setValueForMode(coll.modes[0].modeId, { r: 0.1, g: 0.3, b: 0.9 })
// ...repeat 100x

// RIGHT — loop in a single script
const coll = figma.variables.createVariableCollection('FX Colors')
const modeId = coll.modes[0].modeId
for (const { name, color } of FX_COLORS) {
  const v = figma.variables.createVariable(name, coll.id, 'COLOR')
  v.setValueForMode(modeId, color)
}
// no per-call $fig overhead because variables aren't SceneNodes
```

### When NOT to use $fig
Mid-script reading real `SceneNode` state, or operations on non-SceneNode types (Variables, Components themselves). For those, raw Plugin API in a single `use_figma` call is correct.

Note: "I need a library component" alone is **not** a reason to leave `$fig`. Pass the matching `componentKey` or `componentSetKey` from `search_design_system` straight into `$fig.get(...)` / `$fig.instance(...)` — same for style `key` (`$fig.getStyle`) and variable `key` (`$fig.getVar`). For component sets, pass variant property values in `props` and `$fig.instance` resolves the matching variant via `setProperties` — you do not need to import the set and drill into `compSet.children`.

---

## Variants via data, not enumeration

When the task asks for N parallel things ("build 3 styles", "create 4 button states", "5 color swatches"):

1. Define varying parts as a JS array of objects.
2. Define a single builder function that takes one object → one output.
3. Loop: `VARIANTS.forEach((v, i) => build(v, i))` or `VARIANTS.map(build)`.

The expensive way is writing N separate procedural blocks — that requires reasoning through each variant independently in thinking (1–3KB per variant). The data-array pattern compresses that to one builder + one array literal.

Each KB of pre-mutation thinking costs ~$0.02–0.04. Replacing 15KB of "Style 1 has blue accents... Style 2 has warm orange tones..." with `const STYLES = [{...}, {...}, {...}]; STYLES.forEach(build)` saves ~$0.30 on a typical multi-variant task.

---

## Color validation — WRONG vs RIGHT

```js
// WRONG — these all throw "fills: Property color.r failed validation: Required value missing"
fills = [{ type: 'SOLID', color: { hex: '#ff0000' } }]           // ❌ no hex shorthand
fills = [{ type: 'SOLID', color: '#ff0000' }]                    // ❌ color must be object
fills = [{ type: 'SOLID', color: { r: 1 } }]                     // ❌ missing g, b
fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 0.5 } }] // ❌ no `a` in color

// RIGHT — full RGB + opacity outside color
fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.5 }]
```

Use built-in utilities for literal colors; they are available in every `use_figma` call:
```js
$fig.rectangle({ fills: [figma.util.solidPaint('#2563eb80')] }) // alpha becomes paint opacity
const rgb = figma.util.rgb('#2563eb') // RGB only; ignores input alpha
const rgba = figma.util.rgba('#2563eb80') // RGBA for gradient stops/effects
```

---

## Gradient paints — all fields required

```js
const grad = {
  type: 'GRADIENT_LINEAR',
  gradientStops: [
    { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
    { position: 1, color: { r: 1, g: 1, b: 1, a: 1 } },
  ],
  gradientTransform: [[1, 0, 0], [0, 1, 0]],  // identity = top-to-bottom
}
frame.fills = [grad]
```

Omitting any of `type`, `gradientStops`, or `gradientTransform` throws `Property "gradientTransform" failed validation: Required value missing`.

---

## Node-type property gotchas (full list)

Touching a property that doesn't exist on a node's type throws `TypeError: node.foo: no such property 'foo' on TYPE node`. Each throw burns a retry.

- **Only `FRAME` / `COMPONENT` / `COMPONENT_SET` / `INSTANCE` / `GROUP` / `SECTION` / `PAGE` have `.children`.** `RECTANGLE`, `TEXT`, `ELLIPSE`, `POLYGON`, `STAR`, `VECTOR`, `LINE`, `SLICE`, `STICKY`, `SHAPE_WITH_TEXT`, `STAMP`, `CONNECTOR`, `TABLE`, `WIDGET`, `EMBED`, `MEDIA` do NOT.
- **`GROUP` has NO `fills` / `strokes` / `cornerRadius`.** Apply paints/radii on the child shapes inside.
- **`TEXT` has NO `cornerRadius`, `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `layoutMode`, `layoutSizingHorizontal/Vertical`** (those are container properties). Text has font / size / decoration / fills.
- **`INSTANCE` descendants are read-only for structural ops** — you cannot `appendChild` / `insertChild` into an instance child. Edit the source `COMPONENT` or detach first.
- **`layoutPositioning = 'ABSOLUTE'` requires the parent to have `layoutMode !== 'NONE'`.** Setting ABSOLUTE under a plain frame / page throws.
- **`layoutSizingHorizontal/Vertical = 'FILL'` requires parent with auto-layout.** Either set parent's `layoutMode` first, or use explicit `resize(w, h)`.
- **`counterAxisAlignItems` is an enum**: only `'MIN' | 'CENTER' | 'MAX' | 'BASELINE'`. `'STRETCH'` / `'SPACE_BETWEEN'` fail. `primaryAxisAlignItems` has different valid values — don't confuse.
- **There is NO `instance.swapMainComponent(...)`.** Use `instance.setProperties({...})` with the component-property variant value, OR `$fig.query(...).set({componentProperties: {...}})`. There IS `instance.swapComponent(component)` (different method name).

Before referencing any property: (a) check `'<prop>' in node`, (b) gate by `if (node.type === 'FRAME' || ...)`, or (c) consult [plugin-api-standalone.d.ts](plugin-api-standalone.d.ts).

---

## Bulk-mutation stopping rule (full template)

A bulk-mutation task (swap N icons, update M colors, replace K instances) is COMPLETE in **3 `use_figma` calls**:

1. **Call 1 — DISCOVER + MUTATE in one script.** Combine: find targets via `figma.root.findAll`, import components, mutate. Use `$fig.query(...).each(...)` for the loop. Return the count.

2. **Call 2 — VERIFY (optional).** Read-only `findAll` to count remaining targets. Skip if Call 1's return showed full coverage.

3. **Call 3 — FINAL REPORT in assistant text, no tool call.** State what was swapped + any remaining edges. STOP.

NO 4th call. NO chasing the last 20% of edge cases. If Call 1 errors, fix and redo — that's still your one mutation call. Cap: 2 mutation attempts + 1 verify.

### Concrete arrow→chevron template:
```js
// Call 1: discover + mutate, all in one script. CHEVRON_FWD_KEY / CHEVRON_BWD_KEY
// are componentKeys from search_design_system — $fig queues the library import.
const chevronFwd = $fig.get(CHEVRON_FWD_KEY)
const chevronBwd = $fig.get(CHEVRON_BWD_KEY)
let swapped = 0
$fig.query('INSTANCE[name*=arrow_forward], INSTANCE[name*=arrow_right], INSTANCE[name*=arrow_drop_down]')
  .each(inst => { $fig.set(inst, { mainComponent: chevronFwd }); swapped++ })
$fig.query('INSTANCE[name*=arrow_back], INSTANCE[name*=arrow_left], INSTANCE[name*=arrow_drop_up]')
  .each(inst => { $fig.set(inst, { mainComponent: chevronBwd }); swapped++ })
return { swapped }
```

Observed worst case before this rule: 35 `use_figma` calls chasing the same 2-3 nested arrows for 25+ minutes. With 3-call max, worst-case cost is bounded.

---

## Cross-page bulk operations — one query, all pages

```js
// RIGHT — one query, all pages, all instances
const instances = figma.root.findAll(n => n.type === 'INSTANCE' && n.name === 'arrow_drop_down')
// OR — using $fig.query (preferred):
$fig.query('INSTANCE[name=arrow_drop_down]', figma.root)
```

NOT: "Explore page 1", "Explore page 2"... each costs ~30s + thinking tax. One `findAll` from `figma.root` searches the entire document in one call.

---

## "An unexpected error occurred" handling

When `use_figma` returns an error message `"An unexpected error occurred"` (no JS stack), the request hit a server-side path error. Do NOT retry the same script unchanged — that has near-zero success probability.

Change approach: break into smaller batches, switch from `$fig.query(...).set(...)` to per-node `node.set(...)` (or vice versa), pick a tighter selector, or drop one node-property to isolate which triggers the server error. If the same shape recurs after 2 different attempts, stop and report.

---

## Common JS syntax bugs to avoid before submitting >5KB scripts

- **Unbalanced braces in template literals** — `${{...}}` or missing `}` in multi-line strings throws `SyntaxError: expecting '}'`.
- **Trailing commas in function calls** — `foo(a, b,)` may fail in some JS engines.
- **Missing `await`** before async ops — `figma.loadFontAsync(...)` without `await` is a silent bug.
- **`=` vs `==`** inside object literals — `{ size: =14 }` should be `{ size: 14 }`.

SyntaxError costs a full retry ($0.10–0.20). Scan visually before submitting large scripts.

---

## Why decisiveness matters (cost breakdown)

Each KB of upfront thinking ≈ $0.02–0.04. A 20KB upfront plan = ~$0.30–$0.80 spent before any tool call.

For multi-section tasks: decide high-level approach in <2KB, write the FIRST section's script, then plan the second once you've seen the first work. Plan-as-you-build is materially cheaper than plan-then-build-all.

---

## Workflow — incremental + recovery

- Break large ops into multiple `use_figma` calls; validate after each *logical phase* (not every micro-step).
- On error: read the message carefully, identify which property/type triggered it, fix once, retry. Don't blindly resubmit.
- On 3 retries of same error: switch approach (most often: switch to `$fig`).
- Cap script size around 8 KB / ~250 lines. Larger → split by section.

# Loaded workflow file: figma-use/references/effect-style-patterns.md
Source snapshot SHA256: 9146f004447bd6e8bc5fae545d0d7685bde8e00836e8d069755c48cf08677d50

# Effect Style API Patterns

> Part of the [use_figma skill](../SKILL.md). How to create, apply, and inspect effect styles using the Plugin API.
>
> For design system context (effect types, variable bindings on effects, gotchas), see [wwds-effect-styles](working-with-design-systems/wwds-effect-styles.md).

## Contents

- Listing Effect Styles
- Creating a Drop Shadow Style
- Importing Library Effect Styles
- Applying Effect Styles to Nodes

## Listing Effect Styles

```javascript
/**
 * Lists all local effect styles.
 *
 * @returns {Promise<Array<{id: string, name: string, key: string, effectCount: number}>>}
 */
async function listEffectStyles() {
  const styles = await figma.getLocalEffectStylesAsync();
  return styles.map(s => ({
    id: s.id,
    name: s.name,
    key: s.key,
    effectCount: s.effects.length
  }));
}
```

Full runnable script:

```javascript
const results = await listEffectStyles();
return results;
```

## Creating a Drop Shadow Style

Use `$fig` to create styles and bind them to nodes in the same plan. Colors are **RGBA 0–1 range**.

```javascript
const style = $fig.effectStyle({
  name: "Elevation/200",
  effects: [{
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.15 },
    offset: { x: 0, y: 4 },
    radius: 12,
    spread: 0,
    visible: true,
    blendMode: "NORMAL",
  }],
});
$fig.rectangle({ name: "Card", effects: style })
```
## Using Library Effect Styles by key (preferred)

A style found via a `search_design_system` `queries` entry with `entity: "style"` returns a `key`. Pass it directly into `$fig.getStyle(styleKey)` and apply via the `effects` property on any `$fig.rectangle(...)` / `$fig.frame(...)` / `$fig.query(...).set(...)` — the plan queues the library import automatically.

```javascript
const shadow = $fig.getStyle(ELEVATION_200_KEY)
$fig.frame({ name: 'Card', effects: shadow })

// Bulk apply
$fig.query('FRAME[name=Card]').set({ effects: shadow })
```

Prefer reusing library effect styles over creating new ones.

### Raw-API fallback

```javascript
// If you need the imported EffectStyle's metadata mid-script
const shadowStyle = await figma.importStyleByKeyAsync("EFFECT_STYLE_KEY");
node.effectStyleId = shadowStyle.id;
```

## Applying Effect Styles to Nodes

```javascript
// `planStyle` from `$fig.effectStyle()` or `$fig.getStyle()`
// Bulk-apply an effect style to all nodes whose names contain `Card`
$fig.query('[name*=Card]').set({ effects: planStyle });

// Set an effect style on a specific node
$fig.get(NODE_ID).set({ effects: planStyle });
await $fig.done();
```

# Loaded workflow file: figma-use/references/fig-builder.md
Source snapshot SHA256: eb19654225cd7c1c770d87e5ee67d0de4037ba9caaeae256c950d224e350e0ce

---
name: $fig builder API
description: Plan-based builder for creating and editing Figma nodes with automatic font loading, correct ordering, and one-batch materialization
---

# `$fig` Builder API

`$fig` is a plan-based builder exposed as a global in `use_figma` scripts. Every call builds a lightweight plan tree; nothing touches the Figma API until the plan is materialized. The plan is **automatically materialized** when the script finishes — you do not need to call `$fig.done()` explicitly.

## When to use `$fig` vs raw Plugin API

**Default to `$fig`.** Any `use_figma` script that creates nodes or mutates more than one node at a time should reach for `$fig` first. The builder handles:

- Font preloading (collects every `fontName` used anywhere in the plan and loads them in one batch before materialization)
- Correct property ordering (`layoutMode` before sizing, `connectorLineType` before start/end, etc.)
- Parenting and auto-layout child sizing

Fall back to the raw Plugin API (`figma.createFrame()`, direct property assignment, `findAll`) **only** when `$fig` genuinely cannot express the operation:

- You need the result of an async call mid-build — e.g. `setCurrentPageAsync` or `loadFontAsync` that must complete before the next create decision. (You do NOT need raw `importComponentByKeyAsync` / `importComponentSetByKeyAsync` to use a library component: pass the matching `componentKey` or `componentSetKey` straight into `$fig.get(...)` / `$fig.instance(...)`. For component sets, variant selection happens via `{ props: {...} }` — no need to inspect `compSet.children` yourself.)
- You need to read a real node's computed property (e.g. measured `width` after auto-layout) to decide what to create next
- You need tight per-node control flow where each node's shape depends on the previous one's state

These cases are the minority. If your first instinct is "I'll just call `figma.createRectangle()` once," rewrite it as `$fig.rectangle(...)`. If you're assigning properties one line at a time, rewrite it as `$fig.set(node, { ... })` or inline the props into the create call.

You can mix the APIs explicitly: build with `$fig`, `await $fig.done()` to materialize, then access real nodes through `planNode.node`. The original plan node and its `.children` remain plan nodes after the flush. Keep creation and supported mutations in `$fig`; flushing does not make raw methods or direct property assignments work on plan nodes.

## Creating nodes

Every create method has the same shape: `(name?, opts?, children?)`. `children` is an array of plan nodes that become the node's children.

```js
// Frame with children — children passed as an array
$fig.autoLayout({ name: 'Card', layoutMode: 'VERTICAL', itemSpacing: 8 }, [
  $fig.text({ characters: 'Title', fontSize: 20, fontName: { family: 'Inter', style: 'Bold' } }),
  $fig.text({ characters: 'Description', fontSize: 14 }),
  $fig.rectangle({ name: 'Divider', width: 320, height: 1, fills: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }] }),
])
```

Plan nodes are also **chainable** — calling a create method on a plan node adds the new node as a child of that plan node:

```js
const card = $fig.autoLayout({ name: 'Card', layoutMode: 'VERTICAL', itemSpacing: 8 })
card.text({ characters: 'Title', fontSize: 20 })
card.text({ characters: 'Description', fontSize: 14 })
```

### Design-mode create methods

| Method | Node type |
|---|---|
| `$fig.frame(opts?, children?)` | `FRAME` |
| `$fig.autoLayout(opts?, children?)` | `FRAME` with auto-layout pre-configured (both axes hugging content). Default direction `HORIZONTAL`; pass `layoutMode: 'VERTICAL'` in opts to switch. |
| `$fig.rectangle(opts?)` | `RECTANGLE` |
| `$fig.ellipse(opts?)` | `ELLIPSE` |
| `$fig.polygon(opts?)` | `REGULAR_POLYGON` |
| `$fig.star(opts?)` | `STAR` |
| `$fig.line(opts?)` | `LINE` |
| `$fig.vector(opts?)` | `VECTOR` |
| `$fig.text(opts?)` | `TEXT` |
| `$fig.section(opts?, children?)` | `SECTION` |
| `$fig.slice(opts?)` | `SLICE` |
| `$fig.component(opts?, children?)` | `SYMBOL` (main component) |
| `$fig.page(opts?, children?)` | `PAGE` (new page node) |
| `$fig.svg(svgString, opts?)` | Node tree parsed from SVG |
| `$fig.svgComponent(svgString, opts?)` | Main component from SVG: converts the imported outer frame into a component without adding a wrapper. Available in Design and Slides. |
| `$fig.instance(compRef, opts?)` | `INSTANCE` — `compRef` is a component plan node, a node ID string, OR a library asset key (`componentKey` or `componentSetKey` from `search_design_system`); the import is queued in the plan automatically. |

FigJam-only types (`$fig.sticky`, `$fig.connector`, `$fig.shapeWithText`, `$fig.codeBlock`, `$fig.table`) are available when the script runs in a FigJam file; Slides-only types (`$fig.slide`, `$fig.slideRow`) are available in Slides.

### Grouping and boolean operations

Each wraps its `children` in a single parent node of the given type. Use the same `(name?, opts?, children?)` signature.

```js
$fig.union({ name: 'U' }, [
  $fig.rectangle({ name: 'R1', x: 0, y: 0, width: 100, height: 100 }),
  $fig.rectangle({ name: 'R2', x: 50, y: 50, width: 100, height: 100 }),
])
```

| Method | Effect |
|---|---|
| `$fig.group(opts?, children?)` | Regular group |
| `$fig.union(opts?, children?)` | Boolean union |
| `$fig.subtract(opts?, children?)` | Boolean subtract |
| `$fig.intersect(opts?, children?)` | Boolean intersect |
| `$fig.exclude(opts?, children?)` | Boolean exclude |
| `$fig.variants(opts?, children?)` | `combineAsVariants` on the child components. **Does NOT position the variants — see the caveat below.** |

**⚠️ `$fig.variants` does NOT lay out the variants — they stack at (0,0).** Unlike `$fig.autoLayout` (which arranges its children), `$fig.variants` is a thin wrapper over `figma.combineAsVariants`: it groups the child components into a ComponentSet but leaves every variant at `(0, 0)`, so the set renders as a single collapsed element with all variants overlapping. After creating the set you **must** position the variants into a readable grid and resize the set — the requirement is identical whether you use `$fig.variants` or the raw `figma.combineAsVariants`.

#### Required follow-up — grid the variants (`$fig` build + raw layout)

`$fig.variants` can't lay the set out itself, and you can't know each variant's size until it's built — so the pattern is: **build with `$fig`, `await $fig.done()` to materialize, then measure the real variants and grid them with the raw Plugin API.** This is a legitimate `$fig` + raw-API mix — "read a real node's computed property (e.g. measured `width` after auto-layout) to decide what to create next" is exactly the escape hatch called out in [When to use `$fig` vs raw Plugin API](#when-to-use-fig-vs-raw-plugin-api).

```js
// 1) Build each variant as a $fig.component. Encode the axes in the NAME
//    ("Prop=Value, Prop=Value") — that's how combineAsVariants derives the set's properties.
const set = $fig.variants({ name: 'KPICard' }, [
  $fig.component({ name: 'Trend=Up' },   [ /* …header, value, footer… */ ]),
  $fig.component({ name: 'Trend=Down' }, [ /* …header, value, footer… */ ]),
])

// 2) Materialize NOW so every variant has a real, measured width/height.
await $fig.done()

// 3) Grid the variants with the raw Plugin API, using MEASURED sizes.
const cs = set.node                 // the live ComponentSetNode
const variants = cs.children        // live ComponentNodes; set.children would still be plan nodes
const GRID_GAP = 16, PADDING = 40
const cols = 2                      // # of values on the axis you want across the top (e.g. State)
const cellW = Math.max(...variants.map((v) => v.width))   // uniform cells → aligned columns
const cellH = Math.max(...variants.map((v) => v.height))
variants.forEach((v, i) => {
  v.x = PADDING + (i % cols) * (cellW + GRID_GAP)
  v.y = PADDING + Math.floor(i / cols) * (cellH + GRID_GAP)
})

// 4) Resize the set to wrap the grid (+ padding), then place it on the canvas.
const totalCols = Math.min(cols, variants.length)
const totalRows = Math.ceil(variants.length / cols)
cs.resizeWithoutConstraints(
  totalCols * cellW + (totalCols - 1) * GRID_GAP + PADDING * 2,
  totalRows * cellH + (totalRows - 1) * GRID_GAP + PADDING * 2,
)
cs.x = 480
cs.y = 80
```

Skipping step 2–4 is the single most common variant bug — the set collapses to one visible variant with the rest hidden behind it. For the full multi-axis version (State on columns, Size/Style on rows) plus doc frames and grid labels, see [Laying Out Variants After combineAsVariants (Required)](component-patterns.md#laying-out-variants-after-combineasvariants-required) and the complete [`createComponentWithVariants.js`](../../figma-generate-library/scripts/createComponentWithVariants.js) script.

## Creating instances from component plan nodes

`$fig.instance(componentPlanNode, opts)` accepts a newly created component plan node without an intermediate `done()`. `componentPlanNode.createInstance(opts)` is an alias with the same queued behavior and returns an instance **plan node**, not a raw `InstanceNode`. `parentPlanNode.instance(componentPlanNode, opts)` instead creates the instance under that parent.

```js
const component = $fig.component({ name: 'Card' })
const instance = component.createInstance({ name: 'Card preview' })
$fig.get('DESTINATION_FRAME_ID').append(instance)
instance.set({ x: 20, y: 20 })
// Auto-flush creates and places the instance. Use instance.node only after a flush.
```

The same calls work after `await $fig.done()`. A subsequent flush applies newly queued operations. Never pass the returned plan node to raw `appendChild` or assign `instance.name` directly; use the options, `.set()`, and plan node `.append()` as above.

## Component properties

Expose component properties directly from the builder with `.textProp` / `.booleanProp` / `.instanceSwapProp` — no raw `addComponentProperty` needed. Call these chainable methods on the **layer inside a component definition** that carries the property; the property is added to the containing component (or, if that component is part of a set, to the ComponentSet), with its default inferred from that layer:

| Method | Property | Default from | Controls |
|---|---|---|---|
| `layer.textProp(name)` | `TEXT` | the layer's `characters` | the layer's text |
| `layer.booleanProp(name)` | `BOOLEAN` | the layer's `visible` | the layer's visibility |
| `layer.instanceSwapProp(name)` | `INSTANCE_SWAP` | the layer's `mainComponent` (layer must be an INSTANCE) | which instance is shown |

Each returns the layer, so calls chain. Rules:

- **Must be inside a component.** The method walks up to the enclosing `$fig.component(...)`; calling it on a node that is not within a component definition throws (`property ref of type … can only be used on nodes within a component definition`).
- **Variant sets de-dup.** If the enclosing component is part of a set, the definition lands on the set. Applying the same property name to the corresponding layer in each variant is de-duplicated into a single definition — so you can add props per-variant safely.

```js
// A Button component exposing Label (TEXT), Show Icon (BOOLEAN), and Icon (INSTANCE_SWAP)
$fig.component({ name: 'Button' }, [
  $fig.autoLayout({ name: 'Content', layoutMode: 'HORIZONTAL', itemSpacing: 8 }, [
    $fig.instance(iconComp, { name: 'Icon' })
      .instanceSwapProp('Icon')     // swap which icon is shown
      .booleanProp('Show Icon'),    // toggle the icon on/off
    $fig.text({ characters: 'Button' })
      .textProp('Label'),           // override the label text
  ]),
])
```

Prefer these over raw `comp.addComponentProperty(...)`, which must run on a materialized *product* component in the right order — mis-sequencing throws (`"Can only set component property definitions on a product component"`, `"no setter for property"`). The `$fig` methods handle the timing and the variant de-dup for you. To set property *values* on an instance (not define them), use `setProperties` — see [component-patterns.md](component-patterns.md).

**Setting values on instances.** Pass the declared property names (no `#id` suffix) in `props`; a variant axis name selects the variant: `$fig.instance(setId, { props: { State: 'Today', Date: '15', 'Show Event 2': false } })`. For an existing or nested instance, use `$fig.get(instanceId).set({ props: {...} })` — look nested instances up on the materialized parent (`parent.node.children.find(...)`), not with `$fig.query(selector, planNode)`, which can match the same layer in every instance. Worked recipe with component reuse across calls: [figma-generate-design → componentization](../../figma-generate-design/references/componentization.md).

## Styles — create, reference, apply

Plan-step style API. Creators return per-style handles — `FigPlanPaintStyle` / `FigPlanTextStyle` / `FigPlanEffectStyle` / `FigPlanGridStyle` — with the union exported as `FigPlanStyle`. Existing styles can be wrapped by name or id via `$fig.getStyle()` (returns the union or `null`; narrow via `handle.style?.type`). Every handle supports `.set`, `.remove`, and a `.style` getter for escape-to-live-Figma access post-`done()`. The per-style handles tighten `.style` and the `.set` fn arg to the concrete style class so type-specific fields (e.g. `paints` on paint, `fontName` on text) autocomplete without casts.

| Method | Returns | Effect |
|---|---|---|
| `$fig.paintStyle(opts)` | `FigPlanPaintStyle` | Create a paint style. `opts.name` required. `opts.paints` optional. |
| `$fig.textStyle(opts)` | `FigPlanTextStyle` | Create a text style. `opts.name` required. `opts.fontName` / `opts.fontSize` / etc. |
| `$fig.effectStyle(opts)` | `FigPlanEffectStyle` | Create an effect style. `opts.name` required. `opts.effects` optional. |
| `$fig.gridStyle(opts)` | `FigPlanGridStyle` | Create a grid style. `opts.name` required. `opts.layoutGrids` optional. |
| `$fig.getStyle(nameOrIdOrKey)` | `FigPlanStyle \| null` | Wrap an existing local style OR a library style by `key` (the value returned by a `search_design_system` `queries` entry with `entity: "style"`). Tries id, then asset key (queues a plan-managed library import if the style isn't yet in the file), then scans paint → text → effect → grid styles by name. |
| `planStyle.set(opts \| fn)` | `this` | Apply props in place. Fn form receives the **live Figma `Style`** narrowed to the concrete subtype (`PaintStyle` / `TextStyle` / `EffectStyle` / `GridStyle`). |
| `planStyle.remove()` | `this` | Delete the style. |
| `planStyle.id` | `string` | Real style id (after `done()`) or planId (before). Use this when binding by id manually. |
| `planStyle.style` | concrete `Style` or `null` | `null` before `done()`, the live `Style` object after. |

### Applying a style to a node

Pass the style handle directly in the property. `$fig` routes through the corresponding `*StyleId` setter at flush time:

```js
const brand = $fig.paintStyle({ name: 'Brand/Primary', paints: [solidBlue] })
$fig.rectangle({ fills: brand, effects: shadowStyle })
$fig.text({ characters: 'Title', textStyle: headingStyle })

// Existing styles work the same way
const existing = $fig.getStyle('Brand/Secondary')
$fig.query('FRAME[name^=Card]').set({ fills: existing })
```

Properties that accept a `FigPlanStyle`: `fills` → `fillStyleId`, `strokes` → `strokeStyleId`, `effects` → `effectStyleId`, `layoutGrids` → `gridStyleId`, `textStyle` → `textStyleId`. Plain paint/effect/grid arrays in those properties still apply as direct values (no style binding).

**Why route through `fills` rather than `fillStyleId`?** `fills` is where agents already think about the visual layer, and the property is non-style-binding by default — passing a plain paint array applies as the fill verbatim, so routing only fires when the value is a `FigPlanStyle`. Using the property name keeps the call site readable (`fills: brand` reads as "the fill is brand"), and the `*StyleId` form remains the Plugin API spelling underneath. `textStyle` is the one property that's genuinely synthetic — `TextNode` has no `textStyle` prop natively, only `textStyleId`, so it's accepted purely to spare agents the `*StyleId` suffix.

**Raw `node.set` caveat.** The same routing also fires on a raw `node.set({ fills: handle })` call outside a `$fig` plan, but only **`$fig.getStyle()` handles** are detected (they carry a `_type` marker and a real id). Two cases that don't work:

- A raw Figma `PaintStyle` from `figma.createPaintStyle()` — no `_type` marker; the value falls through and `node.set` tries to assign the style object to `fills`, which fails type validation. Use either `$fig.getStyle(ps.id)` to wrap it, or assign `rect.fillStyleId = ps.id` directly.
- A freshly-created `$fig.paintStyle(...)` handle whose plan isn't flushed yet — detected by `_type`, but the handle's `id` is still a `planId`; Figma's `*StyleId` setter silently accepts and ignores unknown ids, so the bind never lands and the property's existing array is left untouched.

Go through a `$fig` plan (`$fig.rectangle({...})`, `$fig.set(target, ...)`, `$fig.query(...).set(...)`) when binding a style you just created — the plan path resolves the `planId` → real id at flush time via the plan registry.

## Variables — create, reference, bind

Plan-step variable API. `$fig.varCollection(opts)` creates a new collection; `opts.modes` (non-empty string array) is required alongside `opts.name`. Variable creators on the collection handle return per-type `FigPlanVariable` handles. The union is `FigPlanVariable = FigPlanColorVar | FigPlanNumVar | FigPlanBoolVar | FigPlanStringVar`.

| Method | Returns | Effect |
|---|---|---|
| `$fig.varCollection(opts)` | `FigPlanVarCollection` | Create a variable collection. `opts.name` + `opts.modes` required. |
| `$fig.getVarCollection(idOrName)` | `FigPlanVarCollection` | Wrap existing collection by id or name. Throws if not found. |
| `$fig.getVar(idOrKey)` | `FigPlanVariable` | Wrap an existing variable by real Figma variable id OR a library variable `key` (the value returned by a `search_design_system` `queries` entry with `entity: "variable"`). For an asset key, the plan queues a library import automatically. Throws if not found. |
| `coll.colorVar(opts)` | `FigPlanColorVar` | Create a COLOR variable. `opts.name` required; mode values may be hex colors or `{ color, opacity }` (0–100 opacity; at least one variable reference). |
| `coll.numVar(opts)` | `FigPlanNumVar` | Create a FLOAT variable. `opts.name` required. `opts.values` as `{ modeName: number }`. |
| `coll.boolVar(opts)` | `FigPlanBoolVar` | Create a BOOLEAN variable. `opts.values` as `{ modeName: boolean }`. |
| `coll.stringVar(opts)` | `FigPlanStringVar` | Create a STRING variable. `opts.values` as `{ modeName: string }`. |
| `coll.getVar(nameOrId)` | `FigPlanVariable` | Wrap existing variable in this collection by name or id. Throws if not found. |
| `coll.set(opts \| fn)` | `this` | Update collection properties (name, etc.). |
| `coll.remove()` | `this` | Delete the collection. |
| `variable.set(opts \| fn)` | `this` | Update variable properties. Accepts `name`, `scopes`, `description`, `codeSyntax: { WEB?, ANDROID?, iOS? }`, and other writable `Variable` properties. |
| `variable.value(modeName, value)` | `this` | Set a single mode value. |
| `variable.setValues(map \| fn)` | `this` | Set all mode values at once. Fn form receives the live `Variable` object. |
| `variable.remove()` | `this` | Delete the variable. |
| `variable.id` | `string` | Real variable id (after `done()`) or planId (before). |
| `variable.resolvedType` | `string` | `'COLOR'` / `'FLOAT'` / `'BOOLEAN'` / `'STRING'`. |
| `variable.variable` | `Variable \| null` | `null` before `done()`, the live Figma `Variable` object after. |

`opts.scopes: VariableScope[]` on variable creators controls which Figma property pickers show the variable. Specify intentionally — defaults can bind to unwanted properties. Common scopes: `['WIDTH_HEIGHT']`, `['GAP']`, `['CORNER_RADIUS']`, `['SHAPE_FILL', 'FRAME_FILL']`, `['TEXT_FILL']`, `['OPACITY']`. Valid values: `ALL_SCOPES`, `TEXT_CONTENT`, `CORNER_RADIUS`, `WIDTH_HEIGHT`, `GAP`, `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `STROKE_FLOAT`, `EFFECT_FLOAT`, `EFFECT_COLOR`, `OPACITY`, `FONT_FAMILY`, `FONT_STYLE`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`; there is no `STROKE` scope.

Variable names may not contain `.`, `{`, or `}`, and no `/`-separated segment may be empty or start with `$`. Build names from decimal values without the dot: `space/0-5`, not `space/0.5`.

`opts.codeSyntax: { WEB?, ANDROID?, iOS? }` links a variable to its code counterpart. Pass at creation time or via `variable.set()` afterward:

```js
// At creation time
tokens.colorVar({
  name: 'color/brand',
  values: { Light: '#3B82F6', Dark: '#60A5FA' },
  codeSyntax: { WEB: 'var(--color-brand)', ANDROID: 'colorBrand', iOS: 'Color.brand' },
})

// Or after creation
myVar.set({ codeSyntax: { WEB: 'var(--color-brand)' } })
```

### Binding a variable to a node property

Pass the variable handle directly as the property value. `$fig` detects the handle and routes to `setBoundVariable` at flush time:

```js
const tokens = $fig.varCollection({ name: 'Tokens', modes: ['Light', 'Dark'] })
const w = tokens.numVar({ name: 'size/lg', values: { Light: 200, Dark: 200 }, scopes: ['WIDTH_HEIGHT'] })
const blue = tokens.colorVar({ name: 'color/brand', values: { Light: '#3B82F6', Dark: '#60A5FA' }, scopes: ['SHAPE_FILL'] })
const alpha = tokens.numVar({ name: 'opacity/btn', values: { Light: 1, Dark: 0.8 }, scopes: ['OPACITY'] })

// Scalar props (numVar)
$fig.rectangle({ name: 'Card', width: w, opacity: alpha })

// Paint color (colorVar): bind via the paint's `color` field
$fig.rectangle({ fills: [{ type: 'SOLID', color: blue }] })

// Effect color + numeric fields (mix colorVar + numVar)
$fig.frame({
  effects: [{
    type: 'DROP_SHADOW',
    color: shadowColorVar, radius: shadowRadiusVar,
    offset: { x: 0, y: 4 }, spread: 0, visible: true, blendMode: 'NORMAL',
  }],
})

// Layout grid numeric fields
$fig.frame({
  layoutGrids: [{ pattern: 'COLUMNS', sectionSize: colSizeVar, count: colCountVar,
    gutterSize: 24, alignment: 'CENTER', visible: true }],
})

// queryResult.set works too
$fig.query('FRAME[name^=Card]').set({ width: w })
```

Properties that route `FigPlanNumVar` to `setBoundVariable`: any numeric-typed bindable field — `width`, `height`, `opacity`, `topLeftRadius` / `topRightRadius` / `bottomLeftRadius` / `bottomRightRadius`, `paddingLeft` / `paddingRight` / `paddingTop` / `paddingBottom`, `itemSpacing`, `counterAxisSpacing`, `strokeWeight`, `minWidth` / `maxWidth` / `minHeight` / `maxHeight`.

`cornerRadius` is a shorthand: passing `cornerRadius: numVar` binds all four individual corner properties to that variable (there is no `boundVariables.cornerRadius` slot — Figma only exposes the per-corner bindings). Individual corner props override the shorthand when both are present.

Paint `color` fields and effect / layout-grid numeric fields are detected per-item in the array at flush time — the array itself is applied as a plain property, but any variable handle inside is bound via `setBoundVariable{ForPaint,ForEffect,ForLayoutGrid}`.

**Raw `node.set` caveat.** Same-plan variable handles (planId before `done()`) don't work reliably via raw `node.set` — use the `$fig` plan path. Handles from `$fig.getVar(id)` / `coll.getVar(nameOrId)` (real id already set) work fine with raw `node.set`.

### Variable aliasing (semantic → primitive)

Pass a variable handle as the `values` entry of another variable to create a `VARIABLE_ALIAS`:

```js
const prims = $fig.varCollection({ name: 'Primitives', modes: ['Value'] })
const blue500 = prims.colorVar({ name: 'blue/500', values: { Value: '#3B82F6' } })

const semantic = $fig.varCollection({ name: 'Semantic', modes: ['Light', 'Dark'] })
const bgPrimary = semantic.colorVar({
  name: 'bg/primary',
  values: { Light: blue500, Dark: darkBlue500 },
})
```

### Building a component with bound variables (the default for components)

When you build a **component or reusable UI** — even a single component — binding its tokenized visual properties is part of finishing the work, not an optional nicety. The component is **not complete** while a value that *has* a corresponding token (colors, radii, spacing the source defines, or that you created) is still a hardcoded literal. Pass the variable **handle straight into the property** (same routing as above). **Do not** copy resolved token values into local JS constants (e.g. `const VARIANTS = [{ bg: '#2c2c2c' }]`) and paint with resolved literal colors — that bypasses variables entirely. **Only bind values that have a token**; values with genuinely no token (one-off geometry, static dividers) correctly stay literal — don't fabricate tokens to bind. Build a primitive tier, alias a semantic tier to it, then bind the semantic vars into `$fig.component`:

```js
const prims = $fig.varCollection({ name: 'Primitives', modes: ['Value'] })
const blue600 = prims.colorVar({ name: 'blue/600',  values: { Value: '#2563EB' }, scopes: ['FRAME_FILL'] })
const white   = prims.colorVar({ name: 'base/white', values: { Value: '#FFFFFF' }, scopes: ['TEXT_FILL'] })
const space3  = prims.numVar({ name: 'space/3',  values: { Value: 12 }, scopes: ['GAP'] })
const radius2 = prims.numVar({ name: 'radius/2', values: { Value: 8 }, scopes: ['CORNER_RADIUS'] })

const sem = $fig.varCollection({ name: 'Semantic', modes: ['Light', 'Dark'] })
const btnBg   = sem.colorVar({ name: 'button/bg',   values: { Light: blue600, Dark: blue600 }, scopes: ['FRAME_FILL'] })
const btnText = sem.colorVar({ name: 'button/text', values: { Light: white,   Dark: white  }, scopes: ['TEXT_FILL'] })

// Bind the handles straight into the component's props — no literal hex / numbers.
$fig.component({
  name: 'Size=md, State=default',
  layoutMode: 'HORIZONTAL',
  paddingLeft: space3, paddingRight: space3, itemSpacing: space3,
  cornerRadius: radius2,                       // numVar → binds all four corners
  fills: [{ type: 'SOLID', color: btnBg }],    // colorVar → bound paint
}, [
  $fig.text({
    characters: 'Button',
    fontName: { family: 'Inter', style: 'Medium' },
    fills: [{ type: 'SOLID', color: btnText }],
  }),
])
```

For a full variant set, build each variant this way, then wrap them in `$fig.variants(...)` and lay them out in a grid. Only intentionally-fixed geometry (icon pixel sizes, static 1px dividers) should stay literal.

**Building across multiple `use_figma` calls? Rehydrate the variable handles before binding.** A common failure: create the variable collection in one call, then build the component in a *later* call and bind nothing (falling back to literals) because the handles from the first call are out of scope. Each `use_figma` call is independent — a plan handle does not survive across calls. In the build call, re-fetch the variables by the IDs you returned (`$fig.getVar(realId)`, or `figma.variables.getVariableByIdAsync(id)` for the raw API) and bind those. Prefer doing var-creation and component-build in the **same** call when practical, so the handles are already in scope.

## Reading / referencing existing nodes

`$fig.get(idOrKey)` accepts a real node ID (`'123:456'`) or a library `componentKey` or `componentSetKey` from `search_design_system`. For an asset key, the plan queues a library import automatically — you don't need a separate `await figma.importComponentByKeyAsync(...)` step.

```js
// Wrap an existing node by ID so it can be mutated in the plan
const card = $fig.get('123:456')
$fig.set(card, { name: 'Updated Card', opacity: 0.8 })

// Wrap a library component / component set by its asset key
const button = $fig.get(BUTTON_KEY)
$fig.instance(button, { name: 'Submit' })

// CSS-like search over the current page (or a scope node)
$fig.query('FRAME[name*=Card] TEXT').set({
  fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
})

// Scoped search
$fig.query('TEXT', card)
```

`$fig.query(selector, scope?)` returns a result object with `.length`, `.first()`, `.last()`, `.each(fn)`, `.set(props)`, `.remove()`, and `.screenshot(opts?)`. Selector syntax matches `node.query()` (see the main SKILL — types, attributes, combinators, pseudo-classes).

## Mutating nodes

All mutate methods enqueue operations; they are applied during the auto-flush at the end of the script.

**Pattern paints:** Pass `{ type: 'PATTERN', sourceNodeId: source.id, tileType: 'RECTANGULAR' }` in `fills` or `strokes` on constructors or `.set()`. For a newly created source, `await $fig.done()` first so `source.id` is a real node ID.

| Method | Effect |
|---|---|
| `$fig.set(target, props)` | Apply props to a plan node or existing-node wrapper |
| `$fig.delete(...nodes)` | Remove nodes (variadic) |
| `$fig.move(target, newParent, index?)` | Move a node under a new parent at `index` |
| `$fig.clone(target, props?)` | Clone a node; merges `props` over the original's opts |
| `$fig.add(parent, child)` / `$fig.append(parent, child)` | Append child to parent |
| `$fig.addAt(parent, index, child)` | Insert child at a specific index |
| `$fig.replace(oldNode, newNode)` | Swap `oldNode` with `newNode` |
| `$fig.reorder(parent, children)` | Reorder `parent`'s children to match `children` |
| `$fig.gradient(node, type, stops, transform?)` | Apply a gradient paint. `type` is `'LINEAR'` / `'RADIAL'` / `'ANGULAR'` / `'DIAMOND'` |
| `$fig.image(node, hash, scaleMode?)` | Apply an image paint by hash |

> To switch the current page during a script, use `await figma.setCurrentPageAsync(page)` directly — `$fig` doesn't expose a `setPage` because the plan flushes node creates before the switch would land, so any `$fig` ops queued after a hypothetical `setPage` would still target the page that was active at flush start. `$fig.page` (the create method) makes a new page node — different concept.

## Plan-node methods (chainable)

The object returned by every create method has its own methods that operate on that subtree:

| Method | Effect |
|---|---|
| `planNode.<create>(...)` | Any basic create method (`.frame(...)`, `.text(...)`, `.rectangle(...)`, etc.) appends as a child |
| `planNode.svg(svgStr, opts?)` / `.svgComponent(svgStr, opts?)` / `.instance(compRef, opts?)` | Append as a child; `.svgComponent` is available in Design and Slides |
| `planNode.set(props)` | Apply props to this node |
| `planNode.remove()` | Delete this node |
| `planNode.clone(props?)` | Clone this node (sibling by default) |
| `planNode.moveTo(newParent, index?)` | Reparent this node |
| `planNode.reorderChildren(children)` | Reorder children of this node |
| `planNode.replace(newNode)` | Replace this node with `newNode` |
| `planNode.add(child)` / `.append(child)` / `.addAt(index, child)` | Child insertion |
| `planNode.gradient(type, stops, transform?)` / `.image(hash, scaleMode?)` | Paint shortcuts |
| `planNode.query(selector)` | Sub-query. String selectors are only valid **after materialization**; pre-materialization only function selectors (`n => ...`) work. |
| `planNode.screenshot(opts?)` | Queue a screenshot. Chainable plan-step — returns `this`, **not a Promise**. Image bytes flow through `figma.io` into the tool response at flush time. `opts` is `{ scale?, contentsOnly? }`; `contentsOnly` defaults to `false`. |
| `planNode.node` | Getter. Returns the materialized `SceneNode`, or `null` if the plan node hasn't been built yet (pre-`done()`) or the real node was deleted. Use for any `SceneNode` API not exposed as a plan step (`exportAsync`, `setRelaunchData`, `getStyledTextSegments`, etc.). |

## Inline screenshots — `planNode.screenshot(opts?)`

Plan-step screenshot. Like `set` / `add` / `move` / `gradient` / `image`, it queues an op and returns the plan node itself (`this`) — **not a Promise**. The bytes travel through the `figma.io` side channel into the tool response at flush time, so you don't need to `await` anything:

```js
// Single screenshot per node — chains naturally with set().
$fig.autoLayout({ name: 'Card', layoutMode: 'VERTICAL' })
  .set({ opacity: 0.5, cornerRadius: 12 })
  .screenshot({ scale: 2 })

// Different nodes — each shot has a distinct caption, all arrive.
$fig.rectangle({ name: 'R1', width: 60, height: 60 }).screenshot()
$fig.rectangle({ name: 'R2', width: 60, height: 60 }).screenshot()
```

`opts` is `{ scale?: number, contentsOnly?: boolean }`. `scale` defaults to `0.5` capped so the largest output dimension stays ≤ 1024 px; `contentsOnly` defaults to `false` (overlapping content included). Distinct from `node.screenshot()` (the `SceneNode` method on materialized nodes), which returns a Promise and must be `await`ed. `await rect.screenshot()` is harmless (`await` on a non-Promise resolves to the value), but misleading — nothing is being waited on, and the bytes still arrive at flush time.

Child-creation methods like `.text()` return the new child, not `this`, so they shift the chain. Stick to `.set()` / `.screenshot()` to keep chaining on the same plan node.

**Don't queue multiple `.screenshot()` calls on the same node.** `done()` processes all queued mutations before any screenshot fires (`done.ts` runs `screenshotOps` after `updates` / `reparentOps` / `gradientOps` / etc.), so every shot of the same node captures the same post-flush state — interleaving `.set().screenshot().set().screenshot()` does not give you intermediate frames. And `figma.io.write` keys output bytes by `"<name> (<W>x<H> at <x>,<y>).png`", so two shots of the same node collide on caption and the second overwrites the first in `assistantPluginFiles`. Net effect: only one PNG arrives in the response. Take one shot per node; for before/after comparisons, run two scripts or screenshot different nodes.

### `queryResult.screenshot(opts?)` — bulk screenshots from a query

Same chainable plan-step contract as `planNode.screenshot()`, but emits one shot per matched node. Available on both `$fig.query()` and raw `node.query()` (same surface; same cap behavior).

```js
// Canonical pattern from the eval workload — set + screenshot the matches.
$fig.query('FRAME[name=Button]').set({ fills: brand }).screenshot()

// Raw plugin API works too.
figma.currentPage.query('RECTANGLE[name^=Card-]').screenshot({ scale: 2 })
```

**Capped at 5 matches by default.** Pass `{ max: N }` to raise (or lower) the cap. Over-cap **throws** rather than silently truncating, so the agent has to make a deliberate choice: filter the result, call `.first()`, or pass `max` explicitly. Examples:

```js
// Throws: "queryResult.screenshot() matched 7 nodes, which exceeds the cap of 5..."
qr.screenshot()

// Works — explicit override.
qr.screenshot({ max: 10 })

// Works — narrow first via filter.
qr.filter(n => n.opacity < 1).screenshot()
```

`opts` accepts everything `planNode.screenshot()` does (`scale`, `contentsOnly`) plus `max`. `max` is stripped before forwarding to the underlying per-node screenshot.

The same caption-collision warning above applies: each match's PNG is keyed by `<name> (<W>x<H> at <x>,<y>).png`, so matches that share name + position + size will overwrite each other in `assistantPluginFiles`. In practice this only happens for duplicates that you wouldn't really want N images of anyway.

## Reaching the real `SceneNode` — `planNode.node`

For any `SceneNode` API not surfaced as a plan step (`exportAsync`, `setBoundVariable`, `getStyledTextSegments`, etc.), reach the materialized scene node through `.node`:

```js
const rect = $fig.rectangle({ name: 'R', width: 50, height: 50 })
await $fig.done()
const png = await rect.node.exportAsync({ format: 'PNG' })
```

`.node` is a sync getter that returns `null` when the plan node hasn't been materialized yet (pre-`done()`) or when the real node was deleted. That null doubles as a materialization probe — there's no other clean way to ask "has this been built yet?":

```js
const rect = $fig.rectangle({ name: 'R', width: 50, height: 50 })
if (!rect.node) await $fig.done()                    // probe — null means not yet
const png = await rect.node?.exportAsync({ ... })    // any SceneNode method
```

`$fig.get(realId)` wraps an existing scene node and pre-populates `realNodeId` at construction, so `.node` works without `done()` for those.

## Auto-flush and `done()`

The plan is automatically materialized when your `use_figma` script finishes — you do **not** need to call `$fig.done()`. The runtime registers a shutdown action that flushes any pending plan state before the script returns. The tool result will include a `FigDoneResult` object containing the created/updated/deleted node IDs and names.

**All queued roots are materialized, including unused drafts.** Calling a constructor such as `$fig.autoLayout(...)` registers creation immediately. JavaScript variable usage does not determine which nodes are built: ignoring the plan node, returning a different node, or screenshotting only one screen does not discard other queued roots. Unattached roots are placed under the current page.

A root cannot use `layoutSizingHorizontal: 'FILL'` or `layoutSizingVertical: 'FILL'`: the page is not an auto-layout parent. Setting `layoutMode: 'VERTICAL'` on the root controls its own children and does not satisfy this requirement. Attach a section before the next flush:

```js
const body = $fig.autoLayout({
  name: 'Body', layoutMode: 'VERTICAL',
  layoutSizingHorizontal: 'FILL', layoutSizingVertical: 'FILL',
})
$fig.autoLayout({
  name: 'Screen', layoutMode: 'VERTICAL', width: 390, height: 844,
}, [body]) // Use the same body; do not build a duplicate and leave this one unattached.
// Automatic flush now sees an auto-layout parent for body.
```

**Queued versus immediate sizing:** with `$fig`, establish the planned parent before flush. With the raw Plugin API, append the actual node before assigning `FILL`; the raw setter validates the current parent immediately. For an existing raw node and a verified auto-layout destination:

```js
// Both variables here are raw nodes, not Figquery wrappers.
parentNode.appendChild(childNode)
childNode.layoutSizingHorizontal = 'FILL'
```

Also inspect the arguments passed to `.append(...)`. Passing `...children.map(() => null).filter(() => false)` is an empty append, not attachment of `children`. Pass the actual intended wrappers, for example `parentHandle.append(...children)`, and check whether filtering accidentally removed every intended child.

Before flushing, check that every intended section is attached and every remaining root is intentional with `FIXED`/`HUG` sizing. Remove abandoned constructor calls from the generated script. Do not fix an accidental orphan by merely dropping `FILL` or adding another `done()`; remove it or attach it to its intended parent.

You can still call `$fig.done()` explicitly if you need to materialize partway through a script and then read real node properties (e.g. measuring `width`/`height` that depend on auto-layout). `done()` returns a promise that you need to `await`.

```js
// Usually not needed — but if you need real node state mid-script:
await $fig.done()
```

If you want a custom tool result other than `FigDoneResult`, you can use the `.id` getter on plan nodes, which will return real node IDs after `done()` has run.

## Security gating

`$fig` is only exposed in the `evals`, `assistant`, and `mcp-server` plugin runtimes. It is **not** available to regular web plugins — this is a security boundary, not a bug.

# Loaded workflow file: figma-use/references/gotchas.md
Source snapshot SHA256: 18b21fc8dab6bb2a31daf15dcbc0bd9989096aa7460f768f42e46d0383da4f57

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

The property exists on every `SceneNode`, but the **value** you can assign depends on the node's relationship to auto-layout. The tool validates the assignment and rejects non-`FIXED` values that don't satisfy a structural rule:

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

# Loaded workflow file: figma-use/references/plugin-api-standalone.d.ts
Source snapshot SHA256: c4a2654700880c7c7220f87f9b4d5e8af46957c90bf50f8c82d2f9dd9ff9d2fe

```typescript
/**
 * @see https://developers.figma.com/docs/plugins/api/figma
 */
interface PluginAPI {
  /**
   * The version of the Figma API this plugin is running on, as defined in your `manifest.json` in the `"api"` field.
   */
  readonly apiVersion: '1.0.0'
  /**
   * The currently executing command from the `manifest.json` file. It is the command string in the `ManifestMenuItem` (more details in the [manifest guide](https://developers.figma.com/docs/plugins/manifest)). If the plugin does not have any menu item, this property is undefined.
   */
  readonly command: string
  /**
   * The current editor type this plugin is running in. See also [Setting editor type](https://developers.figma.com/docs/plugins/setting-editor-type).
   */
  readonly editorType: 'figma' | 'figjam' | 'dev' | 'slides' | 'buzz'
  /**
   * The value specified in the `manifest.json` "id" field. This only exists for Plugins.
   */
  readonly pluginId?: string
  /**
   * Similar to `figma.pluginId` but for widgets. The value specified in the `manifest.json` "id" field. This only exists for Widgets.
   */
  readonly widgetId?: string
  /**
   * The file key of the current file this plugin is running on.
   * **Only [private plugins](https://help.figma.com/hc/en-us/articles/4404228629655-Create-private-organization-plugins) and Figma-owned resources (such as the Jira and Asana widgets) have access to this.**
   * To enable this behavior, you need to specify `enablePrivatePluginApi` in your `manifest.json`.
   */
  readonly fileKey: string | undefined
  /**
   * When enabled, causes all node properties and methods to skip over invisible nodes (and their descendants) inside {@link InstanceNode | instances}.
   * This makes operations like document traversal much faster.
   *
   * Note: Defaults to true in Figma Dev Mode and false in Figma and FigJam
   *
   * @remarks
   *
   * Accessing and modifying invisible nodes and their descendants inside instances can be slow with the plugin API.
   * This is especially true in large documents with tens of thousands of nodes where a call to {@link ChildrenMixin.findAll} might come across many of these invisible instance children.
   *
   * If your plugin does not need access to these nodes, we recommend setting `figma.skipInvisibleInstanceChildren = true` as that often makes document traversal significantly faster.
   *
   * When this flag is enabled, it will not be possible to access invisible nodes (and their descendants) inside instances. This has the following effects:
   *
   * - {@link ChildrenMixin.children} and methods such as {@link ChildrenMixin.findAll} will exclude these nodes.
   * - {@link PluginAPI.getNodeByIdAsync} will return a promise containing null.
   * - {@link PluginAPI.getNodeById} will return null.
   * - Accessing a property on an existing node object for an invisible node will throw an error.
   *
   * For example, suppose that a portion of the document tree looks like this:
   *
   * Frame (visible) → Instance (visible) → Frame (invisible) → Text (visible)
   *
   * The last two frame and text nodes cannot be accessed after setting `figma.skipInvisibleInstanceChildren = true`.
   *
   * The benefit of enabling this flag is that document traversal methods, {@link ChildrenMixin.findAll} and {@link ChildrenMixin.findOne}, can be up to several times faster in large documents that have invisible instance children.
   * {@link ChildrenMixin.findAllWithCriteria} can be up to hundreds of times faster in large documents.
   */
  skipInvisibleInstanceChildren: boolean
  /**
   * This property contains methods used to read and set the viewport, the user-visible area of the current page.
   *
   * Read more in the [viewport section](https://developers.figma.com/docs/plugins/api/figma-viewport).
   */
  readonly viewport: ViewportAPI
  /**
   * Closes the plugin. You should always call this function once your plugin is done running. When called, any UI that's open will be closed and any `setTimeout` or `setInterval` timers will be cancelled.
   *
   * @param message - Optional -- display a visual bell toast with the message after the plugin closes.
   *
   * @remarks
   *
   * Calling `figma.closePlugin()` disables callbacks and Figma APIs. It does not, however, abort the plugin. Any lines of Javascript after this call will also run. For example, consider the following plugin that expects the user to have one layer selected:
   *
   * ```ts title="Simple closePlugin"
   * if (figma.currentPage.selection.length !== 1) {
   *   figma.closePlugin()
   * }
   * figma.currentPage.selection[0].opacity = 0.5
   * ```
   *
   * This will not work. The last line will still run, but will throw an exception because access to `figma.currentPage` has been disabled. As such, it is not recommended to run any code after calling `figma.closePlugin()`.
   *
   * A simple way to easily exit your plugin is to wrap your plugin in a function, instead of running code at the top-level, and always follow `figma.closePlugin()` with a `return` statement:
   *
   * ```ts title="Early return"
   * function main() {
   *   if (figma.currentPage.selection.length !== 1) {
   *     figma.closePlugin()
   *     return
   *   }
   *   figma.currentPage.selection[0].opacity = 0.5
   * }
   * main()
   * ```
   *
   * It's good practice to have all input validation done at the start of the plugin. However, there may be cases where the plugin may need to close after a chain of multiple function calls. If you expect to have to close the plugin deep within your code, but don't want to necessarily want the user to see an error, the example above will not be sufficient.
   *
   * One alternative is to use a top-level try-catch statement. However, you will need to be responsible for making sure that there are no usages of try-catch between the top-level try-catch and the call to `figma.closePlugin()`, or to pass along the close command if necessary. Example:
   *
   * ```ts title="Top-level try-catch"
   * const CLOSE_PLUGIN_MSG = "_CLOSE_PLUGIN_"
   * function someNestedFunctionCallThatClosesThePlugin() {
   *   throw CLOSE_PLUGIN_MSG
   * }
   *
   * function main() {
   *   someNestedFunctionCallThatClosesThePlugin()
   * }
   *
   * try {
   *   main()
   * } catch (e) {
   *   if (e === CLOSE_PLUGIN_MSG) {
   *     figma.closePlugin()
   *   } else {
   *     // >> DO NOT LEAVE THIS OUT <<
   *     // If we caught any other kind of exception,
   *     // it's a real error and should be passed along.
   *     throw e
   *   }
   * }
   * ```
   */
  closePlugin(message?: string): void
  /**
   * This property contains convenience functions for common operations.
   *
   * Read more in the [util section](https://developers.figma.com/docs/plugins/api/figma-util).
   */
  readonly util: UtilAPI
  /**
   * This property contains methods to handle user inputs when a plugin is launched in query mode. See [Accepting Parameters as Input](https://developers.figma.com/docs/plugins/plugin-parameters) for more details.
   */
  readonly parameters: ParametersAPI
  /**
   * This property contains methods for reading Motion animation styles available in the current document.
   *
   * Read more in the [Motion section](https://developers.figma.com/docs/plugins/api/figma-motion).
   */
  readonly motion: MotionAPI
  /**
   * Finds a node by its id in the current document. Every node has an `id` property, which is unique within the document. If the id is invalid, or the node cannot be found (e.g. removed), returns a promise containing null.
   */
  getNodeByIdAsync(id: string): Promise<BaseNode | null>
  /**
   * Finds a style by its id in the current document. If not found, returns a promise containing null.
   */
  getStyleByIdAsync(id: string): Promise<BaseStyle | null>
  /**
   * This property contains methods to work with Variables and Variable Collections within Figma.
   *
   * */
  readonly variables: VariablesAPI
  /** This property contains methods to work with assets residing in a team library. */
  readonly teamLibrary: TeamLibraryAPI
  /**
   * This property contains methods to work with annotations.
   */
  readonly annotations: AnnotationsAPI
  /**
   * The root of the entire Figma document. This node is used to access other pages. Each child is a {@link PageNode}.
   */
  readonly root: DocumentNode
  /**
   * The page that the user currently viewing. You can set this value to a {@link PageNode} to switch pages.
   *
   * * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use {@link PluginAPI.setCurrentPageAsync} to update the value.
   */
  currentPage: PageNode
  /**
   * Switch the active page to the specified {@link PageNode}.
   */
  setCurrentPageAsync(page: PageNode): Promise<void>
  /**
   * This a constant value that some node properties return when they are a mix of multiple values. An example might be font size: a single text node can use multiple different font sizes for different character ranges. For those properties, you should always compare against `figma.mixed`.
   *
   * @remarks
   *
   * Example:
   *
   * ```ts title="Check if property is a mix of multiple values"
   * if (node.type === 'RECTANGLE') {
   *   if (node.cornerRadius !== figma.mixed) {
   *     console.log(`Single corner radius: ${node.cornerRadius}`)
   *   } else {
   *     console.log(`Mixed corner radius: ${node.topLeftRadius}, ${node.topRightRadius}, ${node.bottomLeftRadius}, ${node.bottomRightRadius}`)
   *   }
   * }
   * ```
   *
   * Note: Your plugin never needs to know what the actual value of `figma.mixed` is, only that it is a unique, constant value that can be compared against. That being said, this value returns an object of type `symbol` which is a more advanced feature of Javascript. [Read more about symbols](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol). It works in TypeScript via the `unique symbol` [subtype](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-7.html#unique-symbol).
   */
  readonly mixed: unique symbol
  /**
   * Creates a new rectangle. The behavior is similar to using the `R` shortcut followed by a click.
   *
   * @remarks
   *
   * By default, the new node has a default fill, width and height both at 100, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a rectangle and set basic styles"
   * const rect = figma.createRectangle()
   *
   * // Move to (50, 50)
   * rect.x = 50
   * rect.y = 50
   *
   * // Set size to 200 x 100
   * rect.resize(200, 100)
   *
   * // Set solid red fill
   * rect.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   * ```
   */
  createRectangle(): RectangleNode
  /**
   * Creates a new line.
   *
   * @remarks
   *
   * By default, the new node is 100 in width, has a black stroke, with weight 1, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a line and set basic styles"
   * const line = figma.createLine()
   *
   * // Move to (50, 50)
   * line.x = 50
   * line.y = 50
   *
   * // Make line 200px long
   * line.resize(200, 0)
   *
   * // 4px thick red line with arrows at each end
   * line.strokeWeight = 4
   * line.strokes = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   * line.strokeCap = 'ARROW_LINES'
   * ```
   */
  createLine(): LineNode
  /**
   * Creates a new ellipse. The behavior is similar to using the `O` shortcut followed by a click.
   *
   * @remarks
   *
   * By default, the new node has a default fill, width and height both at 100, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a red, U-shaped half donut"
   * const ellipse = figma.createEllipse()
   *
   * // Move to (50, 50)
   * ellipse.x = 50
   * ellipse.y = 50
   *
   * // Set size to 200 x 100
   * ellipse.resize(200, 100)
   *
   * // Set solid red fill
   * ellipse.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   *
   * // Arc from 0° to 180° clockwise
   * ellipse.arcData = {startingAngle: 0, endingAngle: Math.PI, innerRadius: 0.5}
   * ```
   */
  createEllipse(): EllipseNode
  /**
   * Creates a new polygon (defaults to a triangle).
   *
   * @remarks
   *
   * By default, the new node has three edges (i.e. a triangle), a default fill, width and height both at 100, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a red octagon"
   * const polygon = figma.createPolygon()
   *
   * // Move to (50, 50)
   * polygon.x = 50
   * polygon.y = 50
   *
   * // Set size to 200 x 200
   * polygon.resize(200, 200)
   *
   * // Make the polygon 8-sided
   * polygon.pointCount = 8
   *
   * // Set solid red fill
   * polygon.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   * ```
   */
  createPolygon(): PolygonNode
  /**
   * Creates a new star.
   *
   * @remarks
   *
   * By default, the new node has five points edges (i.e. a canonical star), a default fill, width and height both at 100, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a red, 7-pointed star"
   * const star = figma.createStar()
   *
   * // Move to (50, 50)
   * star.x = 50
   * star.y = 50
   *
   * // Set size to 200 x 200
   * star.resize(200, 200)
   *
   * // Make the star 7-pointed
   * star.pointCount = 7
   *
   * // Set solid red fill
   * star.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   *
   * // Make the angles of each point less acute
   * star.innerRadius = 0.6
   * ```
   */
  createStar(): StarNode
  /**
   * Creates a new, empty vector network with no vertices.
   *
   * @remarks
   *
   * By default, parented under `figma.currentPage`. Without setting additional properties, the vector has a bounding box but doesn't have any vertices. There are two ways to assign vertices to a vector node - [`vectorPaths`](https://developers.figma.com/docs/plugins/api/VectorNode#vectorpaths) and [`setVectorNetworkAsync`](https://developers.figma.com/docs/plugins/api/VectorNode#setvectornetworkasync). Please refer to the documentation of those properties for more details.
   */
  createVector(): VectorNode
  /**
   * Creates a new, empty text node.
   *
   * @remarks
   *
   * By default, parented under `figma.currentPage`. Without setting additional properties, the text has no characters. You can assign a string, to the [`characters`](https://developers.figma.com/docs/plugins/api/properties/TextNode-characters) property of the returned node to provide it with text.
   *
   * ```ts title="Create a styled 'Hello world!' text node"
   * (async () => {
   *   const text = figma.createText()
   *
   *   // Move to (50, 50)
   *   text.x = 50
   *   text.y = 50
   *
   *   // Load the font in the text node before setting the characters
   *   await figma.loadFontAsync(text.fontName)
   *   text.characters = 'Hello world!'
   *
   *   // Set bigger font size and red color
   *   text.fontSize = 18
   *   text.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   * })()
   * ```
   */
  createText(): TextNode
  /**
   * Creates a new frame. The behavior is similar to using the `F` shortcut followed by a click.
   *
   * @remarks
   *
   * By default, the new node has a white background, width and height both at 100, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a frame"
   * const frame = figma.createFrame()
   *
   * // Move to (50, 50)
   * frame.x = 50
   * frame.y = 50
   *
   * // Set size to 1280 x 720
   * frame.resize(1280, 720)
   * ```
   */
  createFrame(): FrameNode
  /**
   * Note: This API is only available via `use_figma` in the MCP server
   *
   * Creates a new frame with auto layout already enabled. Both axes default to hug content
   * (`primaryAxisSizingMode = "AUTO"`, `counterAxisSizingMode = "AUTO"`), so children can
   * immediately use `layoutSizingHorizontal/Vertical = "FILL"` after being appended.
   *
   * @remarks
   *
   * Prefer this over `createFrame()` whenever you need an auto-layout parent. Since `layoutMode` is
   * already set, children can use `FILL` sizing immediately after being appended.
   *
   * The default direction is `"HORIZONTAL"`. Pass `"VERTICAL"` for a column layout.
   *
   * ```ts title="Create an auto-layout frame"
   * const row = figma.createAutoLayout()
   * const column = figma.createAutoLayout("VERTICAL")
   *
   * row.itemSpacing = 16
   * row.paddingTop = 24
   * row.paddingBottom = 24
   * row.paddingLeft = 24
   * row.paddingRight = 24
   * ```
   */
  createAutoLayout(direction?: 'HORIZONTAL' | 'VERTICAL'): FrameNode
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a new, empty component.
   *
   * @remarks
   *
   * By default, the new node has width and height both at 100, and is parented under `figma.currentPage`.
   *
   * This function creates a brand new component. To create a component from an existing node, use {@link PluginAPI.createComponentFromNode}.
   *
   * ```ts title="Create a component"
   * const component = figma.createComponent()
   * ```
   */
  createComponent(): ComponentNode
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a component from an existing node, preserving all of its properties and children. The behavior is similar to using the **Create component** button in the toolbar.
   *
   * @remarks
   *
   * To create a brand new component instead, use {@link PluginAPI.createComponent}.
   *
   * There are many restrictions on what nodes can be turned into components. For example, the node cannot be a component or component set and cannot be inside a component, component set, or instance.
   *
   * If you try to create a component from a node that cannot be turned into a component, then the function will throw a `Cannot create component from node` error.
   *
   * ```ts title="Create a component from a node"
   * const frame = figma.createFrame()
   * const component = figma.createComponentFromNode(frame)
   */
  createComponentFromNode(node: SceneNode): ComponentNode
  /**
   * Creates a new page, appended to the document's list of children.
   *
   * @remarks
   *
   * A page node can be the parent of all types of nodes except for the document node and other page nodes.
   *
   * Files in a Starter team are limited to three pages in Figma Design files and one page in FigJam files. When a plugin tries to exceed this limit, it triggers the following error:
   *
   * ```text title="Page limit error"
   * The Starter plan only comes with 3 pages. Upgrade to
   * Professional for unlimited pages.
   * ```
   */
  createPage(): PageNode
  /**
   * Creates a new page divider, appended to the document's list of children. A page divider is a {@link PageNode} with `isPageDivider` true.
   *
   * @remarks
   *
   * A page divider is always the child of the document node and cannot have any children.
   *
   * @param dividerName - An optional argument to specify the name of the page divider node. It won't change how the page divider appears in the UI, but it specifies the name of the underlying node. The dividerName must be a page divider name (all asterisks, all en dashes, all em dashes, or all spaces). If no dividerName is specified, the default name for the created page divider node is "---".
   */
  createPageDivider(dividerName?: string): PageNode
  /**
     * Creates a new slice object.
     *
     * @remarks
     *
     * By default, the new node is parented under `figma.currentPage`.
     *
     * ```ts title="Create a slice and export as PNG"
     * (async () => {
     *   const slice = figma.createSlice()
     *
     *   // Move to (50, 50)
     *   slice.x = 50
     *   slice.y = 50
     *
     *   // Set size to 500 x 500
     *   slice.resize(500, 500)
     *
     *   // Export a PNG of this region of the canvas
     *   const bytes = await slice.exportAsync()
     *
     *   // Add the image onto the canvas as an image fill in a frame
     *   const image = figma.createImage(bytes)
     *   const frame = figma.createFrame()
     *   frame.resize(500, 500)
     *   frame.fills = [{
     *     imageHash: image.hash,
     *     scaleMode: "FILL",
     *     scalingFactor: 1,
     *     type: "IMAGE",
     *   }]
  })()
     * ```
     */
  createSlice(): SliceNode
  /**
   * Note: This API is only available in Figma Slides
   *
   * @remarks
   *
   * By default, the slide gets appended to the end of the presentation (the last child in the last Slide Row).
   *
   * ```ts title="Create a slide"
   * const slide = figma.createSlide()
   * ```
   *
   * To specify a position in the Slide Grid, pass a row and column index to the function.
   *
   * ```ts title="Create a slide at index 0, 0"
   * const slide = figma.createSlide(0, 0)
   * ```
   */
  createSlide(row?: number, col?: number): SlideNode
  /**
   * Note: This API is only available in Figma Slides
   *
   * Creates a new Slide Row, which automatically gets appended to the Slide Grid.
   *
   * @remarks
   *
   * By default, the row gets appended to the end of the Slide Grid.
   *
   * ```ts title="Create a slide row"
   * const slideRow = figma.createSlideRow()
   * ```
   *
   * To specify a position in the Slide Grid, pass a row index to the function.
   *
   * ```ts title="Create a slide row at index 0"
   * const slideRow = figma.createSlideRow(0)
   * ```
   */
  createSlideRow(row?: number): SlideRowNode
  /**
   * Note: This API is only available in FigJam
   *
   * Creates a new sticky. The behavior is similar to using the `S` shortcut followed by a click.
   *
   * @remarks
   *
   * By default, the new node has constant width and height both at 240, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a sticky with text"
   * (async () => {
   *   const sticky = figma.createSticky()
   *
   *   // Load the font before setting characters
   *   await figma.loadFontAsync(sticky.text.fontName)
   *   sticky.text.characters = 'Hello world!'
   * })()
   * ```
   */
  createSticky(): StickyNode
  /**
   * Note: This API is only available in FigJam
   *
   * Creates a new connector. The behavior is similar to using the `Shift-C` shortcut followed by a click.
   *
   * @remarks
   *
   * By default, the new node has a width of 200, and is parented under `figma.currentPage`.
   *
   * ```ts title="Add a connector between two stickies"
   * // Create two stickies
   * const stickyLeft = figma.createSticky()
   * stickyLeft.x = -200
   *
   * const stickyRight = figma.createSticky()
   * stickyRight.x = 200
   *
   * // Connect the two stickies
   * const connector = figma.createConnector()
   * connector.connectorStart = {
   *   endpointNodeId: stickyLeft.id,
   *   magnet: 'AUTO'
   * }
   *
   * connector.connectorEnd = {
   *   endpointNodeId: stickyRight.id,
   *   magnet: 'AUTO'
   * }
   * ```
   */
  createConnector(): ConnectorNode
  /**
   * Note: This API is only available in FigJam
   *
   * Creates a new shape with text.
   *
   * @remarks
   *
   * By default, the new node has a width and height of 208, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a rounded rectangle shape with text"
   * (async () => {
   *   const shape = figma.createShapeWithText()
   *   shape.shapeType = 'ROUNDED_RECTANGLE'
   *
   *   // Load the font before setting characters
   *   await figma.loadFontAsync(shape.text.fontName)
   *   shape.text.characters = 'Hello world!'
   * })()
   * ```
   */
  createShapeWithText(): ShapeWithTextNode
  /**
   * Note: This API is only available in FigJam
   *
   * Creates a new code block.
   */
  createCodeBlock(): CodeBlockNode
  /**
   *
   * Creates a new section
   */
  createSection(): SectionNode
  /**
   * Note: This API is only available in FigJam
   *
   * Creates a new table.
   *
   * @remarks
   *
   * By default, a table has two rows and two columns, and is parented under `figma.currentPage`.
   *
   * ```ts title="Create a table and add text to cells inside"
   * (async () => {
   *   // Create a table with 2 rows and 3 columns
   *   const table = figma.createTable(2, 3)
   *
   *   // Load the font before setting characters
   *   await figma.loadFontAsync(table.cellAt(0, 0).text.fontName)
   *
   *   // Sets characters for the table cells:
   *   // A B C
   *   // 1 2 3
   *   table.cellAt(0, 0).text.characters = 'A'
   *   table.cellAt(0, 1).text.characters = 'B'
   *   table.cellAt(0, 2).text.characters = 'C'
   *   table.cellAt(1, 0).text.characters = '1'
   *   table.cellAt(1, 1).text.characters = '2'
   *   table.cellAt(1, 2).text.characters = '3'
   * })()
   * ```
   */
  createTable(numRows?: number, numColumns?: number): TableNode
  /**
   * Creates a new text on a path node from an existing vector node.
   *
   * @remarks
   * Once you create a TextPathNode, you can then modify properties such as `characters`, `fontSize`, `fill`, etc just like a regular TextNode.
   *
   * Example:
   * ```ts
   * const circle = figma.createEllipse()
   * circle.resize(200, 200)
   * await figma.loadFontAsync({ family: "Inter", style: "Regular" })
   * const textPath = figma.createTextPath(circle, 2, 0.5)
   * textPath.characters = "This is text on a path!"
   * ```
   * The base vector network cannot currently be modified after creating the TextPathNode.
   *
   * Note: Creating a `TextPathNode` modifies the `type` of the underlying node. Make sure that you use the node object returned from this function rather than the original node object.
   *
   *
   * @param node - The vector-like node to convert to a text on a path node. These can be VectorNodes, shape nodes (Rectangle, Ellipse, Polygon, Star), or Line nodes.
   * @param startSegment - The index of the segment in the vector network to start the text path from.
   * @param startPosition - A number between 0 and 1 representing the position along the start segment to start the text path from.
   */
  createTextPath(node: VectorNode, startSegment: number, startPosition: number): TextPathNode
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a new Paint style. This might be referred to as a Color style, or Fill style more colloquially. However, since this type of style may contain images, and may be used for backgrounds, strokes, and fills, it is called a Paint.
   */
  createPaintStyle(): PaintStyle
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a new Text style. By default, the text style has the Figma default text properties (font family Inter Regular, font size 12).
   */
  createTextStyle(): TextStyle
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a new Effect style.
   */
  createEffectStyle(): EffectStyle
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a new Grid style.
   */
  createGridStyle(): GridStyle

  /**
   * :::info
   *
   * This API is only available in Figma Design
   *
   * :::
   *
   * Creates a new custom animation style. See {@link CustomAnimationStyle}.
   */
  createCustomAnimationStyle(): CustomAnimationStyle
  /**
   * Returns the list of local paint styles.
   */
  getLocalPaintStylesAsync(): Promise<PaintStyle[]>
  /**
   * Returns the list of local text styles.
   */
  getLocalTextStylesAsync(): Promise<TextStyle[]>
  /**
   * Returns the list of local effect styles.
   */
  getLocalEffectStylesAsync(): Promise<EffectStyle[]>
  /**
   * Returns the list of local grid styles.
   */
  getLocalGridStylesAsync(): Promise<GridStyle[]>

  /**
   * Returns the list of local custom animation styles.
   *
   * @deprecated Use {@link PluginAPI.getLocalCustomAnimationStylesAsync} instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.
   */
  getLocalCustomAnimationStyles(): CustomAnimationStyle[]

  /**
   * Returns the list of local custom animation styles.
   */
  getLocalCustomAnimationStylesAsync(): Promise<CustomAnimationStyle[]>
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local paint styles.
   */
  moveLocalPaintStyleAfter(targetNode: PaintStyle, reference: PaintStyle | null): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local text styles.
   */
  moveLocalTextStyleAfter(targetNode: TextStyle, reference: TextStyle | null): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local effect styles.
   */
  moveLocalEffectStyleAfter(targetNode: EffectStyle, reference: EffectStyle | null): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local grid styles.
   */
  moveLocalGridStyleAfter(targetNode: GridStyle, reference: GridStyle | null): void

  /**
   * :::info
   *
   * This API is only available in Figma Design
   *
   * :::
   *
   * Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local custom animation styles.
   */
  moveLocalCustomAnimationStyleAfter(
    targetNode: CustomAnimationStyle,
    reference: CustomAnimationStyle | null,
  ): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target folder after the specified reference folder (if provided) or to be first in the parent folder if reference is null. The target and reference folders must have the same parent folder. The target and reference folders must contain paint styles. When referring to nested folders, the full delimited folder name must be used. See the {@link BaseStyle } section for more info.
   */
  moveLocalPaintFolderAfter(targetFolder: string, reference: string | null): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target folder after the specified reference folder (if provided) or to be first in the parent folder if reference is null. The target and reference folders must have the same parent folder. The target and reference folders must contain text styles. When referring to nested folders, the full delimited folder name must be used. See the {@link BaseStyle } section for more info.
   */
  moveLocalTextFolderAfter(targetFolder: string, reference: string | null): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target folder after the specified reference folder (if provided) or to be first in the parent folder if reference is null. The target and reference folders must have the same parent folder. The target and reference folders must contain effect styles. When referring to nested folders, the full delimited folder name must be used. See the {@link BaseStyle } section for more info.
   */
  moveLocalEffectFolderAfter(targetFolder: string, reference: string | null): void
  /**
   * Note: This API is only available in Figma Design
   *
   * Reorders a target folder after the specified reference folder (if provided) or to be first in the parent folder if reference is null. The target and reference folders must have the same parent folder. The target and reference folders must contain grid styles. When referring to nested folders, the full delimited folder name must be used. See the {@link BaseStyle } section for more info.
   */
  moveLocalGridFolderAfter(targetFolder: string, reference: string | null): void

  /**
   * :::info
   *
   * This API is only available in Figma Design
   *
   * :::
   *
   * Reorders a target folder after the specified reference folder (if provided) or to be first in the parent folder if reference is null. The target and reference folders must have the same parent folder. The target and reference folders must contain custom animation styles. When referring to nested folders, the full delimited folder name must be used. See the {@link BaseStyle } section for more info.
   */
  moveLocalCustomAnimationFolderAfter(targetFolder: string, reference: string | null): void
  /**
   * Loads a component node from the team library. Promise is rejected if there is no published component with that key or if the request fails.
   */
  importComponentByKeyAsync(key: string): Promise<ComponentNode>
  /**
   * Loads a component set node from the team library. Promise is rejected if there is no published component set with that key or if the request fails.
   */
  importComponentSetByKeyAsync(key: string): Promise<ComponentSetNode>
  /**
   * Loads a style from the team library. Promise is rejected if there is no style with that key or if the request fails.
   */
  importStyleByKeyAsync(key: string): Promise<BaseStyle>
  /**
   * Lists every shader available to the current file: shaders already in the file, shaders from subscribed libraries, and the user's owned shaders.
   *
   * @remarks
   *
   * A shader applies either as an effect (`node.effects`) or as a fill (`node.fills` / `node.strokes`), depending on its `type`. Owned or subscribed shaders that aren't materialized in the file yet are returned with `imported: false` — call {@link PluginAPI.importShaderById} on the shader's `id` before applying it (this mirrors `loadFontAsync` for fonts).
   *
   * ```ts
   * const shaders = await figma.listAvailableShaders()
   * for (const shader of shaders) {
   *   console.log(shader.name, shader.type, shader.imported)
   * }
   * ```
   */
  listAvailableShaders(): Promise<Shader[]>
  /**
   * Materializes a shader into the current file by `id` and returns it with `imported: true` and its `propertyDefinitions` populated. The `id` is one returned by {@link PluginAPI.listAvailableShaders}. This is idempotent for a shader that is already imported, and mirrors {@link PluginAPI.importComponentByKeyAsync}.
   *
   * @remarks
   *
   * A shader must be imported before it can be applied. Applying an unloaded shader id throws `Shader not imported. Call figma.importShaderById(id) first.`
   *
   * ```ts
   * const [shader] = await figma.listAvailableShaders()
   * if (shader && !shader.imported) {
   *   const imported = await figma.importShaderById(shader.id)
   *   console.log(imported.propertyDefinitions)
   * }
   * ```
   */
  importShaderById(id: string): Promise<Shader>
  /**
   * Returns the lists of currently available fonts. This should be the same list as the one you'd see if you manually used the font picker.
   */
  listAvailableFontsAsync(): Promise<Font[]>
  /**
   * Makes a font available _in the plugin_ for use when creating and modifying text. Calling this function is **necessary** to modify any property of a text node that may cause the rendered text to change, including `.characters`, `.fontSize`, `.fontName`, etc.
   *
   * You can either pass in a hardcoded font, a font loaded via `listAvailableFontsAsync`, or the font stored on an existing text node.
   *
   * Read more about how to work with fonts, when to load them, and how to load them in the [Working with Text](https://developers.figma.com/docs/plugins/working-with-text) page.
   *
   * @remarks
   *
   * This function only works to load fonts _already accessible in the Figma editor_ available to _plugins_. It does not load fonts from the internet.
   *
   * Tip: to load multiple fonts at the same time, you may find [Promise.all](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all) helpful.
   *
   * A common question is whether a plugin needs to be careful about calling `loadFontAsync(font)` for the same font multiple times. The answer is somewhat nuanced. The result of loading a font is cached, so calling `loadFontAsync` won't re-fetch the same font from disk. Therefore, calling `loadFontAsync` on every frame would be perfectly ok.
   *
   * However, note that `loadFontAsync` returns a Promise. Even a Promise resolves immediately, it still needs to round-trip to the JavaScript event loop. So you probably shouldn't call `loadFontAsync` on the same font repeatedly inside a loop.
   *
   * **Variable fonts**
   *
   * You can pass a {@link FontNameInput} and omit `style` to load every style of the family in one call. This works for both variable and static families, and is convenient when you plan to drive the font with {@link FontName.variationSettings} rather than enumerating named instances. {@link FontName.variationSettings} on the argument is ignored — variation values affect what gets rendered, not what gets loaded — so you can pass the same object you later assign to `node.fontName`.
   *
   * ```ts title="Loading and applying a variable font"
   * (async () => {
   *   await figma.loadFontAsync({ family: 'Inter' })
   *
   *   const text = figma.createText()
   *   text.fontName = {
   *     family: 'Inter',
   *     style: 'Regular',
   *     variationSettings: { wght: 550 },
   *   }
   *   text.characters = 'Hello, world'
   * })()
   * ```
   */
  loadFontAsync(fontName: FontNameInput): Promise<void>
  /**
   * Returns the [OpenType variation axis](https://fonts.google.com/knowledge/glossary/axis_in_variable_fonts) tags a variable font family exposes, or `null` for a static family. These are the tags accepted by {@link FontName.variationSettings}.
   *
   * @remarks
   *
   * The family has to be available in the editor but does not have to be loaded, so this can be called before {@link PluginAPI.loadFontAsync} to decide what to load. Throws for an unknown family, so `null` always means the family is static.
   *
   * Each tag is a 4-character OpenType axis tag such as `"wght"` (weight), `"wdth"` (width), `"slnt"` (slant), `"opsz"` (optical size), or a custom tag defined by the font designer.
   *
   * ```ts title="Discovering variation axes, then applying one"
   * (async () => {
   *   const family = 'Inter'
   *   const axes = figma.getFontFamilyVariationAxes(family)
   *   if (axes === null) {
   *     console.log(`${family} is a static font`)
   *     return
   *   }
   *
   *   await figma.loadFontAsync({ family })
   *   const text = figma.createText()
   *   if (axes.includes('wght')) {
   *     text.fontName = { family, style: 'Regular', variationSettings: { wght: 550 } }
   *   }
   *   text.characters = 'Variable!'
   * })()
   * ```
   */
  getFontFamilyVariationAxes(family: string): string[] | null
  /**
   * Returns true if the document contains text with missing fonts.
   */
  readonly hasMissingFont: boolean
  /**
   * Creates a new node from an SVG string. This is equivalent to the SVG import feature in the editor. See the [official documentation on SVG paths](https://www.w3.org/TR/SVG/paths.html) for more details.
   */
  createNodeFromSvg(svg: string): FrameNode
  /**
   * Creates an `Image` object from the raw bytes of a file content. Note that `Image` objects **are not nodes**. They are handles to images stored by Figma. Frame backgrounds, or fills of shapes (e.g. a rectangle) may contain images.
   * [Example: how to work with images](https://developers.figma.com/docs/plugins/working-with-images).
   * @remarks
   *
   * The `data` passed in must be encoded as a PNG, JPEG, or GIF. Images have a maximum size of 4096 pixels (4K) in width and height. Invalid images will throw an error.
   */
  createImage(data: Uint8Array): Image
  /**
   * This gets the corresponding `Image` object for a given image hash, which can then be used to obtain the bytes of the image. This hash is found in a node's fill property as part of the ImagePaint object. If there is no image with this hash, returns null.
   */
  getImageByHash(hash: string): Image | null
  /**
   * Note: This API is only available in Figma Design
   *
   * Creates a new {@link ComponentSetNode} by combining all the nodes in `nodes`, which should all have type {@link ComponentNode}.
   *
   * @param nodes - The list of nodes in the new component set. This list must be non-empty, and must consist of only component nodes.
   * @param parent - The node under which the new component set will be created. This is similar to `parent.appendChild(componentSet)`, but must be specified at the time that the group is created rather than later.
   * @param index - An optional index argument that specifies where inside `parent` the new component set will be created. When this argument is not provided, it will default to appending the component set as the last (topmost) child. This is similar to the index argument in `parent.insertChild(index, componentSet)`.
   *
   * @remarks
   *
   * This API is roughly the equivalent of pressing the "Combine as Variants" button in the editor, but combines the specified list of nodes rather than the current selection. You may still, of course, combine the current selection as variants by passing it as an argument:
   *
   * ```ts title="Combining variants"
   * figma.combineAsVariants(figma.currentPage.selection, parent)
   * ```
   *
   * Note: Why is there no `figma.createComponentSet()` function? It would create an empty component set, and empty component sets are not supported in Figma.
   *
   * Since combining as variants involves moving nodes to a different parent, this operation is subject to many reparenting restrictions:
   */
  combineAsVariants(
    nodes: ReadonlyArray<ComponentNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number,
  ): ComponentSetNode
  /**
   * Creates new group containing all the nodes in `nodes`. There is no `createGroup` function -- use this instead. Group nodes have many quirks, like auto-resizing, that you can read about in the {@link FrameNode} section.
   *
   * @param nodes - The list of nodes in the new group. This list must be non-empty as Figma does not support empty groups. This list cannot include any node that cannot be reparented, such as children of instances.
   * @param parent - The node under which the new group will be created. This is similar to `parent.appendChild(group)`, but must be specified at the time that the group is created rather than later.
   * @param index - An optional index argument that specifies where inside `parent` the new group will be created. When this argument is not provided, it will default to appending the group as the last (topmost) child. This is similar to the index argument in `parent.insertChild(index, group)`.
   *
   * @remarks
   *
   * This API is roughly the equivalent of pressing Ctrl-G/⌘G in the editor, but groups the specified list of nodes rather than the current selection. You may still, of course, group the current selection by passing it as an argument:
   *
   * ```ts title="Group nodes"
   * figma.group(figma.currentPage.selection, parent)
   * ```
   *
   * Note: Why is there no `figma.createGroup()` function? It would create an empty group, and empty groups are not supported in Figma.
   *
   * Note: Why do we require `figma.group(...)` to specify the parent, rather let you call `parent.appendChild(group)` separately? It allows you to create the new group while keeping all the grouped layers in the same absolute x/y locations. The method `.appendChild` preserves the *relative* position of a node, so if you use `.appendChild` to populate a group, you would need to do additional work to put them back in their original location if that was the desired behavior.
   *
   * Since grouping involves moving nodes to a different parent, this operation is subject to many reparenting restrictions:
   */
  group(nodes: ReadonlyArray<BaseNode>, parent: BaseNode & ChildrenMixin, index?: number): GroupNode
  /**
   * Creates a new {@link TransformGroupNode} containing all the nodes in `nodes`, applying the transformations specified in `modifiers` to each child node.
   *
   * @param nodes - The list of nodes in the new group. This list must be non-empty as Figma does not support empty groups. This list cannot include any node that cannot be reparented, such as children of instances.
   * @param parent - The node under which the new group will be created. This is similar to `parent.appendChild(group)`, but must be specified at the time that the group is created rather than later.
   * @param index - An index argument that specifies where inside `parent` the new group will be created.
   * @param modifiers - The list of transform modifiers to apply to each corresponding node in `nodes`.
   */
  transformGroup(
    nodes: ReadonlyArray<SceneNode>,
    parent: BaseNode & ChildrenMixin,
    index: number,
    modifiers: TransformModifier[],
  ): TransformGroupNode
  /**
   * Flattens every node in nodes into a new vector network.
   *
   * @param nodes - The list of nodes in the new group. This list must be non-empty and cannot include any node that cannot be reparented, such as children of instances. Make a copy of those nodes first if necessary.
   * @param parent - The node under which the new vector will be created. This is similar to `parent.appendChild(group)` and defaults to `figma.currentPage` if left unspecified.
   * @param index - An optional index argument that specifies where inside `parent` the new vector will be created. When this argument is not provided, it will default to appending the vector as the last (topmost) child. This is similar to the index argument in `parent.insertChild(index, group)`.
   *
   * @remarks
   *
   * This API is roughly the equivalent of pressing Ctrl-E/⌘E in the editor, but flattens the specified list of nodes rather than the current selection. You may still, of course, flatten the current selection by passing it as an argument:
   *
   * ```ts title="Flatten nodes"
   * figma.flatten(figma.currentPage.selection, parent)
   * ```
   *
   * Since flattening involves moving nodes to a different parent, this operation is subject to many reparenting restrictions:
   */
  flatten(
    nodes: ReadonlyArray<BaseNode>,
    parent?: BaseNode & ChildrenMixin,
    index?: number,
  ): VectorNode
  /**
   * Creates a new {@link BooleanOperationNode} using the UNION operation using the contents of `nodes`. The arguments to `union` are the same as in {@link PluginAPI.group}.
   */
  union(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number,
  ): BooleanOperationNode
  /**
   * Creates a new {@link BooleanOperationNode} using the SUBTRACT operation using the contents of `nodes`. The arguments to `union` are the same as in {@link PluginAPI.subtract}.
   */
  subtract(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number,
  ): BooleanOperationNode
  /**
   * Creates a new {@link BooleanOperationNode} using the INTERSECT operation using the contents of `nodes`. The arguments to `union` are the same as in {@link PluginAPI.intersect}.
   */
  intersect(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number,
  ): BooleanOperationNode
  /**
   * Creates a new {@link BooleanOperationNode} using the EXCLUDE operation using the contents of `nodes`. The arguments to `union` are the same as in {@link PluginAPI.exclude}.
   */
  exclude(
    nodes: ReadonlyArray<BaseNode>,
    parent: BaseNode & ChildrenMixin,
    index?: number,
  ): BooleanOperationNode
  /**
   * Ungroups the given `node`, moving all of `node`'s children into `node`'s parent and removing `node`. Returns an array of nodes that were children of `node`.
   *
   * @remarks
   *
   * This API is roughly the equivalent of pressing Ctrl-Shift-G/⌘⇧G in the editor, but ungroups the given node rather than all nodes in the current selection.
   *
   * If the ungrouped node is part of the current selection, the ungrouped node's children will become part of the selection. Otherwise the selection is unchanged.
   *
   * @param node - The node to ungroup.
   */
  ungroup(node: SceneNode & ChildrenMixin): Array<SceneNode>
  /**
   * Returns a base64-encoded string from the Uint8Array `data`.
   */
  base64Encode(data: Uint8Array): string
  /**
   * Decodes and returns a Uint8Array from the base64-encoded string `data`.
   */
  base64Decode(data: string): Uint8Array
  /**
   * Gets the current canvas grid layout as a 2D array of nodes.
   *
   * Note: This API is only available in Figma Slides and Figma Buzz
   *
   * @remarks
   *
   * The canvas grid represents the organizational structure of assets in Slides and Buzz,
   * where each position can contain a node (slide or asset).
   *
   * To visualize the nodes in the canvas grid in a 2D array, you can call this function.
   *
   * ```ts
   * const grid = figma.getCanvasGrid()
   * ```
   */
  getCanvasGrid(): Array<Array<SceneNode>>
  /**
   * Sets the canvas grid layout, reorganizing nodes in the canvas.
   *
   * Note: This API is only available in Figma Slides and Figma Buzz
   *
   * @remarks
   *
   * This allows you to programmatically rearrange the layout of slides or assets in the canvas grid.
   * All nodes in the current grid must be included in the new layout.
   *
   * For example:
   *
   * ```ts
   * const grid = figma.getCanvasGrid()
   * const [firstRow, ...rest] = grid
   *
   * // move the first row to the end
   * figma.setCanvasGrid([...rest, firstRow])
   * ```
   *
   * @param canvasGrid - A 2D array representing the new canvas grid layout
   */
  setCanvasGrid(canvasGrid: Array<Array<SceneNode>>): void
  /**
   * Creates a new row in the canvas grid at the specified index.
   *
   * Note: This API is only available in Figma Slides and Figma Buzz
   *
   *
   * @param rowIndex - The index where to insert the new row (optional)
   *
   * @remarks
   *
   * If no row index is provided, the row will be added at the end of the grid.
   */
  createCanvasRow(rowIndex?: number): SceneNode
  /**
   * Makes all built-in brushes of the specified type available for use in the plugin. This function must be called before
   * setting the stroke of a node to a brush of the specified type.
   *
   * There are two types of brushes: 'STRETCH' brushes, which stretch along the length of the stroke, and 'SCATTER' brushes, which scatter instances of the brush shape along the stroke.
   *
   * @param brushType - The type of brush to load. Can be either 'STRETCH' or 'SCATTER'.
   *
   * @remarks
   *
   * This function only needs to be called once per plugin run for each brush type that will be used. Once loaded, brushes of the specified type can be used freely.
   */
  loadBrushesAsync(brushType: 'STRETCH' | 'SCATTER'): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-variables
 */
interface VariablesAPI {
  /**
   * Finds a variable by ID. If not found or the provided ID is invalid, returns a promise containing `null`.
   *
   * @param id - The variable ID to search for, which represents a unique identifier for the variable.
   */
  getVariableByIdAsync(id: string): Promise<Variable | null>
  /**
   * Finds a variable collection by ID. If not found or the provided ID is invalid, returns a promise containing `null`.
   *
   * @param id - The variable collection ID to search for, which represents a unique identifier for the variable collection.
   */
  getVariableCollectionByIdAsync(id: string): Promise<VariableCollection | null>
  /**
   * Returns all local variables in the current file, optionally filtering by resolved type.
   *
   * @param type - Filters the returned variables to only be of the given resolved type.
   */
  getLocalVariablesAsync(type?: VariableResolvedDataType): Promise<Variable[]>
  /**
   * Returns all local variable collections in the current file.
   */
  getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>
  /**
   * Creates a variable with a given name and resolved type inside a collection.
   *
   * @param name - The name of the newly created variable
   * @param collection - A variable collection. Make sure to pass a collection object here; passing a collection ID is deprecated.
   * @param resolvedType - The resolved type of this variable
   */
  createVariable(
    name: string,
    collection: VariableCollection,
    resolvedType: VariableResolvedDataType,
  ): Variable
  /**
   * Creates a new variable collection with the given name.
   * @param name - The name of the newly created variable collection.
   */
  createVariableCollection(name: string): VariableCollection
  /**
   * Creates a new extended variable collection from a library or local variable collection with the given name.
   * @param collectionKey - The key of the library or local variable collection to extend.
   * @param name - The name of the newly created variable collection.
   *
   * Note: This API is limited to the Enterprise plan.
   * If limited by the current pricing tier, this method will throw an error with the message
   * `in extend: Cannot create extended collections outside of enterprise plan.`
   */
  extendLibraryCollectionByKeyAsync(
    collectionKey: string,
    name: string,
  ): Promise<ExtendedVariableCollection>
  /**
   * Helper function to create a variable alias.
   *
   * This should be used with functions such as `node.setProperties()` to
   * assign component properties to variables.
   */
  createVariableAlias(variable: Variable): VariableAlias
  /**
   * Helper function to create a variable alias.
   *
   * This should be used with functions such as `node.setProperties()` to
   * assign component properties to variables.
   */
  createVariableAliasByIdAsync(variableId: string): Promise<VariableAlias>
  /**
   * Helper function to bind a variable to a {@link SolidPaint}.
   *
   * If `null` is provided as the `variable`, the given `field` will be unbound from any variables.
   *
   * @returns a copy of the paint which is now bound to the provided variable.
   */
  setBoundVariableForPaint(
    paint: SolidPaint,
    field: VariableBindablePaintField,
    variable: Variable | null,
  ): SolidPaint
  /**
   * Helper function to bind a variable to an {@link Effect}.
   *
   * If `null` is provided as the `variable`, the given `field` will be unbound from any variables.
   *
   * @returns a copy of the effect which is now bound to the provided variable.
   */
  setBoundVariableForEffect(
    effect: Effect,
    field: VariableBindableEffectField,
    variable: Variable | null,
  ): Effect
  /**
   * Helper function to bind a variable to a {@link LayoutGrid}.
   *
   * If `null` is provided as the `variable`, the given `field` will be unbound from any variables.
   *
   * @returns a copy of the layout grid which is now bound to the provided variable.
   */
  setBoundVariableForLayoutGrid(
    layoutGrid: LayoutGrid,
    field: VariableBindableLayoutGridField,
    variable: Variable | null,
  ): LayoutGrid
  /**
   * Loads a variable from the team library. Promise is rejected if there is
   * no published variable with that key or if the request fails.
   *
   * @param key the key of the variable to import.
   */
  importVariableByKeyAsync(key: string): Promise<Variable>
}
interface LibraryVariableCollection {
  /** The name of the variable collection. */
  name: string
  /** The key of the variable collection. */
  key: string
  /** The name of the library that contains this variable collection. */
  libraryName: string
}
interface LibraryVariable {
  /** The name of the variable. */
  name: string
  /** The key of the variable. */
  key: string
  /** The resolved type of this variable. */
  resolvedType: VariableResolvedDataType
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-annotations
 */
interface AnnotationsAPI {
  /**
   * Returns a list of all {@link AnnotationCategory}s that exist in the current file.
   */
  getAnnotationCategoriesAsync(): Promise<AnnotationCategory[]>
  /**
   * Returns an {@link AnnotationCategory} by its ID. If not found, returns a promise containing null.
   *
   * @param id - The annotation category ID to search for.
   */
  getAnnotationCategoryByIdAsync(id: string): Promise<AnnotationCategory | null>
  /**
   * Adds a new {@link AnnotationCategory}.
   *
   * @param categoryInput - The label and color of the annotation category.
   */
  addAnnotationCategoryAsync(categoryInput: {
    label: string
    color: AnnotationCategoryColor
  }): Promise<AnnotationCategory>
}
/**
 * Represents a text field within a Buzz media asset that can be dynamically updated.
 * BuzzTextField objects are returned by {@link BuzzAPI.getTextContent} and provide access
 * to both the current text content and the underlying text node.
 */
interface BuzzTextField {
  /**
   * The current text content of the field, or null if the field is empty.
   */
  readonly value: string | null
  /**
   * The underlying TextNode that contains this text content, or null if not found.
   */
  readonly node: TextNode | null
  /**
   * Updates the text content asynchronously
   */
  setValueAsync(value: string): Promise<void>
}
/**
 * Represents a media field within a Buzz media asset that can contain images or videos.
 * BuzzMediaField objects are returned by {@link BuzzAPI.getMediaContent} and provide access
 * to the current media content and the ability to update it dynamically.
 */
interface BuzzMediaField {
  /**
   * The type of media content: 'IMAGE' for images, 'VIDEO' for videos, or null if no media is present.
   */
  readonly type: 'IMAGE' | 'VIDEO' | null
  /**
   * A unique identifier for the current media content, or null if no media is set.
   */
  readonly hash: string | null
  /**
   * The underlying SceneNode that contains this media content, or null if not found.
   */
  readonly node: SceneNode | null
  /**
   * Updates the media content with a new ImagePaint or VideoPaint
   */
  setMediaAsync(paint: ImagePaint | VideoPaint): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-teamlibrary
 */
interface TeamLibraryAPI {
  /**
   * Returns a descriptor of all {@link VariableCollection}s that exist in the enabled libraries of the current file. Rejects if the request fails.
   *
   * Note: This requires that users enable libraries that contain variables via the UI. Currently it is not possible to enable libraries via the Plugin API.
   *
   * @returns A list of {@link LibraryVariableCollection}s that are available for this file
   *
   * @remarks
   *
   * This is intended to be used in conjunction with {@link TeamLibraryAPI.getVariablesInLibraryCollectionAsync}
   */
  getAvailableLibraryVariableCollectionsAsync(): Promise<LibraryVariableCollection[]>
  /**
   * Returns a descriptor of all {@link Variable}s that exist in a given {@link LibraryVariableCollection}.
   * Rejects if the given variable collection does not exist, or if the current user
   * does not have access to that variable collection's library, or if the request fails.
   *
   * @param libraryCollectionKey the key of the library variable collection that contains the returned library variables.
   *
   * ## Example usage
   *
   * ```ts title="Example usage of getVariablesInLibraryCollectionAsync"
   * // Query all published collections from libraries enabled for this file
   * const libraryCollections =
   *     await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()
   * // Select a library variable collection to import into this file
   * const variablesInFirstLibrary =
   *     await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libraryCollections[0].key)
   * // Import the first number variable we find in that collection
   * const variableToImport =
   *     variablesInFirstLibrary.find((libVar) => libVar.resolvedType === 'FLOAT')
   * const importedVariable =
   *     await figma.variables.importVariableByKeyAsync(variableToImport.key)
   * ```
   *
   */
  getVariablesInLibraryCollectionAsync(libraryCollectionKey: string): Promise<LibraryVariable[]>
}
/**
 * The Motion API is available in Beta. This API is subject to change.
 *
 * @see https://developers.figma.com/docs/plugins/api/figma-motion
 */
interface MotionAPI {
  /**
   * Returns the Motion animation styles available in the current document.
   *
   * @remarks
   *
   * The returned styles describe animation templates that can be applied to nodes with {@link MotionNodeMixin.applyAnimationStyle}.
   * Their `props` values are type/default descriptions for each configurable property.
   *
   * ```ts
   * const styles = figma.motion.figmaAnimationStyles()
   * for (const style of styles) {
   *   console.log(style.name, style.styleId, style.props)
   * }
   * ```
   */
  figmaAnimationStyles(): AvailableAnimationStyle[]
  /**
   * Converts physical spring parameters to Motion's normalized `bounce` value from 0 to 1.
   *
   * @param spring - Positive finite physical spring values.
   *
   * @remarks
   * The returned value is the normalized `bounce` scalar used by {@link NormalizedSpring}.
   *
   * ```ts
   * const bounce = figma.motion.physicalSpringToNormalized({
   *   mass: 1,
   *   stiffness: 100,
   *   damping: 10,
   * })
   * ```
   */
  physicalSpringToNormalized(spring: PhysicalSpring): number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-util
 */
interface UtilAPI {
  /**
   * Creates an `RGB` color object from a variety of common color encodings.
   *
   * **Note**: since `RGB` colors are primarily used for creating `SolidPaint` objects, you might want to use {@link UtilAPI.solidPaint} instead.
   *
   * Accepted color formats include CSS color strings with hex, `rgb()`, `hsl()`, or `lab()` encodings, as well as `RGB` and `RGBA` objects. Alpha values in the input will be ignored. If a string encoding cannot be parsed, an error will be thrown.
   *
   * Examples:
   *
   * ```ts
   * const color1 = figma.util.rgb('#FF00FF')
   * const color2 = figma.util.rgb('hsl(25% 50% 75%)')
   * ```
   *
   * You can alias this function for more concise code:
   *
   * ```ts
   * const rgb = figma.util.rgb
   * const color = rgb('#FF00FF')
   * ```
   *
   * @param color - A CSS color string, `RGB` object, or `RGBA` object. The input color's alpha value, if any, will be ignored.
   */
  rgb(color: string | RGB | RGBA): RGB
  /**
   * Creates an `RGBA` color object from a variety of common color encodings.
   *
   * Accepted color formats include CSS color strings with hex, `rgb()`, `hsl()`, or `lab()` encodings, as well as `RGB` and `RGBA` objects. Alpha defaults to 1 (opaque) if not provided in the input. If a string encoding cannot be parsed, an error will be thrown.
   *
   * Examples:
   *
   * ```ts
   * const layoutGrid = {
   *   pattern: 'GRID',
   *   sectionSize: 1,
   *   color: figma.util.rgba('rgb(25% 25% 25% / 0.5)')
   * }
   * ```
   *
   * You can alias this function for more concise code:
   *
   * ```ts
   * const rgba = figma.util.rgba
   * const color = rgba('rgb(25% 25% 25% / 0.5)')
   * ```
   *
   * @param color - A CSS color string, `RGB` object, or `RGBA` object.
   */
  rgba(color: string | RGB | RGBA): RGBA
  /**
   * Creates a `SolidPaint` object, assigning color and opacity from a variety of common color encodings.
   *
   * Accepted color formats include CSS color strings with hex, `rgb()`, `hsl()`, or `lab()` encodings, as well as `RGB` and `RGBA` objects. The resulting alpha value will be applied to the `SolidPaint`'s `opacity` property, which defaults to 1 (opaque) if not specified. If a string encoding cannot be parsed, an error will be thrown.
   *
   * Optionally, you can provide a set of overrides for any of the non-color properties of the `SolidPaint` object. This is useful for modifying the color of an existing `SolidPaint` while preserving its other properties.
   *
   * Examples:
   *
   * ```ts
   * // Set the current page background to red
   * figma.currentPage.backgrounds = [figma.util.solidPaint("#FF0000")]
   *
   * // Modify an existing SolidPaint with new color and opacity
   * if (node.fills[0].type === 'SOLID') {
   *   const updated = figma.util.solidPaint('#FF00FF88', node.fills[0])
   * }
   * ```
   *
   * You can alias this function for more concise code:
   *
   * ```ts
   * const solidPaint = figma.util.solidPaint
   *
   * // Set the current page background to red
   * figma.currentPage.backgrounds = [solidPaint("#FF0000")]
   *
   * // Modify an existing SolidPaint with new color and opacity
   * if (node.fills[0].type === 'SOLID') {
   *   const updated = solidPaint('#FF00FF88', node.fills[0])
   * }
   * ```
   *
   * @param color - A CSS color string, `RGB` object, or `RGBA` object.
   * @param overrides - An optional object that allows you to specify additional `SolidPaint` properties, aside from color. This is useful for modifying the color of a pre-existing `SolidPaint` object.
   */
  solidPaint(color: string | RGB | RGBA, overrides?: Partial<SolidPaint>): SolidPaint
  /**
   *
   * Normalizes the markdown string to verify what markdown will render with Figma's rich-text editors.
   *
   * Examples:
   *
   * ```ts
   * const md = "# Hello, world!\n\nThis is a **bold** text."
   * const normalizedMd = figma.util.normalizeMarkdown(md);
   *
   * // Set an component description with descriptionMarkdown
   * component.descriptionMarkdown = normalizedMd;
   * ```
   *
   * @param markdown - A markdown string to normalize.
   */
  normalizeMarkdown(markdown: string): string
  /**
   * Returns the single-character Private Use Area string for an Apple SF Symbol, given the symbol's canonical name (e.g. `'square.and.arrow.up'`). Assigning the returned character to a text node's `characters` — after loading the SF Pro font — causes the symbol to render in the text layer.
   *
   * Throws if `name` is not a string or does not match a known SF Symbol.
   *
   * Example:
   *
   * ```ts
   * const text = figma.createText()
   * await figma.loadFontAsync({ family: 'SF Pro', style: 'Regular' })
   * text.characters = 'Share ' + figma.util.getSfSymbolCharacter('square.and.arrow.up')
   * ```
   *
   * @param name - The canonical SF Symbol name.
   */
  getSfSymbolCharacter(name: string): string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-viewport
 */
interface ViewportAPI {
  /**
   * Center of the the current page that is currently visible on screen.
   */
  center: Vector
  /**
   * Zoom level. A value of 1.0 means 100% zoom, 0.5 means 50% zoom.
   *
   * @remarks
   * - zoom &lt; 1: design is zoomed out
   * - zoom = 1: design is shown at exact size
   * - zoom &gt; 1: design is zoomed in
   *
   */
  zoom: number
  /**
   * Automatically sets the viewport coordinates such that the nodes are visible on screen. It is the equivalent of pressing Shift-1.
   *
   */
  scrollAndZoomIntoView(nodes: ReadonlyArray<BaseNode>): void
  /**
   * The bounds of the viewport of the page that is currently visible on screen. The (x, y) corresponds to the top-left of the screen. User actions such as resizing the window or showing/hiding the rulers/UI will change the bounds of the viewport.
   *
   */
  readonly bounds: Rect
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-parameters
 */
interface SuggestionResults {
  /**
   * Sets the list of autocomplete suggestions to be displayed in the quick action UI.
   *
   * If you only want to provide a string suggestion, and don't need metadata or icons, you can use
   * an array of simple string values. For example
   *
   * ```ts title="Simple string suggestions"
   * figma.parameters.on('input', ({ query, result }) => {
   *   result.setSuggestions(
   *     ["Armadillo", "Baboon", "Cacatua", "Dolphin"]
   *     .filter(s => s.includes(query)))
   * })
   * ```
   *
   * However the API also allows providing more information with each suggestion:
   * * The text to display to the user
   * * An icon (optional)
   * * Hidden metadata which is passed back to the plugin if the user chooses this suggestion (optional)
   *
   * Example
   * ```ts title="Suggestions with icons and data"
   * result.setSuggestions([
   *   { name: node1.name, data: node1.id, icon: node1Preview },
   *   { name: node2.name, data: node2.id, icon: node2Preview },
   *   ...
   * ])
   * ```
   *
   * The `name` property contains the text to display to the user in the autocomplete suggestions. This
   * property is required.
   *
   * The `data` property allows associating hidden metadata with a given autocomplete suggestion.
   * This data is passed back to the plugin as the parameter's value if the user chooses this option.
   * If no `data` property is provided, it defaults to the value of the `name` property. I.e. the value
   * of the parameter will be the string that was displayed to the user.
   *
   * An icon can be provided through a `icon` or `iconUrl` property. The `icon` property can contain
   * either a raster image in the form of a `Uint8Array`, or an SVG image in the form of a string. You
   * can alternatively use the `iconUrl` property to provide a URL to the image. Note that for this to
   * work the target server has to support CORS.
   */
  setSuggestions(
    suggestions: Array<
      | string
      | {
          name: string
          data?: any
          icon?: string | Uint8Array
          iconUrl?: string
        }
    >,
  ): void
  /**
   * Displays an error message to the user instead of a list of autocomplete suggestions. When this function
   * is called, the user is prevented from moving on to the next parameter without first changing the input
   * for the current parameter.
   *
   * This is useful to signal to the user that they have entered an invalid value and provide them
   * instruction for how to correct the input.
   *
   * You can also use this as a way to validate pre-conditions, like current selection, or some state of the
   * current document. To do this, in the 'input' event handler for the first parameter key, check the that
   * all pre-conditions are fulfilled and call `setError` with an appropriate error message if they are not,
   * unconditionally of what the current `query` value is.
   *
   * This function is *not* available on parameters with `allowFreeform` set. The purpose of `allowFreeform`
   * is to allow users to enter arbitrary values and so Figma doesn't guarantee that the plugin gets an
   * opportunity to handle an input event and call `setError` before the user moves on to the next parameter.
   *
   * If you want to generally allow freeform input, but still retain the ability to call `setError`, you can
   * remove `allowFreeform` and manually add a autocomplete entry containing the current `query` string. I.e.
   * make the first item in the array passed to `setSuggestions` simply be the string in `query`.
   *
   * For a full example of what this can look like, see the [Resizer sample plugin](https://github.com/figma/plugin-samples/blob/master/resizer/code.ts)
   */
  setError(message: string): void
  /**
   * Modify the default "Loading Suggestions..." message displayed until the plugin calls `setSuggestions`.
   * This can be useful if your plugin needs to load autocomplete messages from the network, or if you need
   * to perform lengthy calculations.
   *
   * You can call `setLoadingMessage` multiple times in order to provide an updated message.
   */
  setLoadingMessage(message: string): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/figma-parameters
 */
interface ParametersAPI {}
/**
 * @see https://developers.figma.com/docs/plugins/api/NodeChangeProperty
 */
type NodeChangeProperty =
  | 'pointCount'
  | 'name'
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'parent'
  | 'pluginData'
  | 'constraints'
  | 'locked'
  | 'visible'
  | 'opacity'
  | 'blendMode'
  | 'layoutGrids'
  | 'guides'
  | 'characters'
  | 'openTypeFeatures'
  | 'styledTextSegments'
  | 'vectorNetwork'
  | 'effects'
  | 'exportSettings'
  | 'arcData'
  | 'autoRename'
  | 'fontName'
  | 'innerRadius'
  | 'fontSize'
  | 'lineHeight'
  | 'leadingTrim'
  | 'paragraphIndent'
  | 'paragraphSpacing'
  | 'textWrapStyle'
  | 'listSpacing'
  | 'hangingPunctuation'
  | 'hangingList'
  | 'letterSpacing'
  | 'textAlignHorizontal'
  | 'textAlignVertical'
  | 'textCase'
  | 'textDecoration'
  | 'textAutoResize'
  | 'textTruncation'
  | 'maxLines'
  | 'fills'
  | 'topLeftRadius'
  | 'topRightRadius'
  | 'bottomLeftRadius'
  | 'bottomRightRadius'
  | 'constrainProportions'
  | 'strokes'
  | 'strokeWeight'
  | 'strokeAlign'
  | 'strokeCap'
  | 'strokeJoin'
  | 'strokeMiterLimit'
  | 'booleanOperation'
  | 'overflowDirection'
  | 'dashPattern'
  | 'backgrounds'
  | 'handleMirroring'
  | 'cornerRadius'
  | 'cornerSmoothing'
  | 'relativeTransform'
  | 'x'
  | 'y'
  | 'rotation'
  | 'isMask'
  | 'maskType'
  | 'clipsContent'
  | 'type'
  | 'overlayPositionType'
  | 'overlayBackgroundInteraction'
  | 'overlayBackground'
  | 'prototypeStartNode'
  | 'prototypeBackgrounds'
  | 'expanded'
  | 'fillStyleId'
  | 'strokeStyleId'
  | 'backgroundStyleId'
  | 'textStyleId'
  | 'effectStyleId'
  | 'gridStyleId'
  | 'description'
  | 'layoutMode'
  | 'layoutWrap'
  | 'paddingLeft'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'itemSpacing'
  | 'counterAxisSpacing'
  | 'layoutAlign'
  | 'counterAxisSizingMode'
  | 'primaryAxisSizingMode'
  | 'primaryAxisAlignItems'
  | 'counterAxisAlignItems'
  | 'counterAxisAlignContent'
  | 'layoutGrow'
  | 'layoutPositioning'
  | 'itemReverseZIndex'
  | 'hyperlink'
  | 'mediaData'
  | 'stokeTopWeight'
  | 'strokeBottomWeight'
  | 'strokeLeftWeight'
  | 'strokeRightWeight'
  | 'reactions'
  | 'flowStartingPoints'
  | 'shapeType'
  | 'connectorStart'
  | 'connectorEnd'
  | 'connectorLineType'
  | 'connectorStartStrokeCap'
  | 'connectorEndStrokeCap'
  | 'codeLanguage'
  | 'widgetSyncedState'
  | 'componentPropertyDefinitions'
  | 'componentPropertyReferences'
  | 'componentProperties'
  | 'embedData'
  | 'linkUnfurlData'
  | 'text'
  | 'authorVisible'
  | 'authorName'
  | 'code'
  | 'textBackground'
  | 'gridAutoTracks'
  | 'gridItemsPositioning'
  | 'animationStyles'
  | 'animations'
  | 'manualKeyframeTracks'
type Transform = [[number, number, number], [number, number, number]]
interface Vector {
  readonly x: number
  readonly y: number
}
interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/RGB
 */
interface RGB {
  readonly r: number
  readonly g: number
  readonly b: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/RGB
 */
interface RGBA {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/FontName
 *
 * Describes a font used by a text node. For example, the default font is `{ family: "Inter", style: "Regular" }`.
 *
 * @remarks
 *
 * Reads always include `family` and `style`. For [variable fonts](https://fonts.google.com/knowledge/glossary/variable_fonts), they also include {@link FontName.variationSettings} with every axis the family defines. Static fonts omit `variationSettings`.
 *
 * To apply a font without naming a style, pass a {@link FontNameInput} to {@link PluginAPI.loadFontAsync}, {@link BaseNonResizableTextMixin.setRangeFontName}, or `fontName`. Use {@link PluginAPI.getFontFamilyVariationAxes} to discover the axis tags a family accepts.
 *
 * ```ts title="Setting a font with custom variation settings"
 * (async () => {
 *   const text = figma.createText()
 *   await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
 *   text.fontName = {
 *     family: 'Inter',
 *     style: 'Regular',
 *     variationSettings: { wght: 600, slnt: -5 },
 *   }
 *   text.characters = 'Hello, variable fonts!'
 * })()
 * ```
 */
interface FontName {
  readonly family: string
  readonly style: string
  /**
   * The variable font axis values applied to the text, for example `{ wght: 600, slnt: -10 }`. Absent for a static font.
   *
   * Reading reports every axis the family defines. When setting, an omitted axis keeps the value of the named instance `style` refers to, so `{ wght: 900 }` on Inter Regular changes only the weight and leaves slant at Regular's default. Setting an axis the family does not define throws; use {@link PluginAPI.getFontFamilyVariationAxes} to discover the valid tags.
   */
  readonly variationSettings?: FontVariationSettings
}
/**
 * @see https://developers.figma.com/docs/plugins/api/FontName
 *
 * Variable font axis values keyed by [OpenType variation axis](https://fonts.google.com/knowledge/glossary/axis_in_variable_fonts) tag, mirroring the CSS `font-variation-settings` property. A tag is always four ASCII characters.
 */
interface FontVariationSettings {
  readonly [axis: string]: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/FontName
 *
 * A font to apply where `style` can be inferred rather than named. Unlike {@link FontName}, `style` may be omitted, in which case Figma resolves the named instance that most closely matches {@link FontName.variationSettings}. Reads always return a fully populated {@link FontName}.
 *
 * @remarks
 *
 * Accepted by {@link PluginAPI.loadFontAsync}, {@link BaseNonResizableTextMixin.setRangeFontName}, and when assigning {@link BaseNonResizableTextMixin.fontName}.
 *
 * Omitting `style` in {@link PluginAPI.loadFontAsync} loads every style of the family. Omitting `style` when setting a font lets Figma pick the named instance closest to `variationSettings` (for example `{ family: 'Inter', variationSettings: { wght: 900 } }` resolves to Inter Black).
 *
 * ```ts title="Inferring a named instance from variation settings"
 * (async () => {
 *   await figma.loadFontAsync({ family: 'Inter' })
 *   const text = figma.createText()
 *   text.characters = 'Hello'
 *   text.setRangeFontName(0, text.characters.length, {
 *     family: 'Inter',
 *     variationSettings: { wght: 900 },
 *   })
 *   // Read back: { family: 'Inter', style: 'Black', variationSettings: { wght: 900, slnt: 0 } }
 *   console.log(text.fontName)
 * })()
 * ```
 */
interface FontNameInput {
  readonly family: string
  readonly style?: string
  readonly variationSettings?: FontVariationSettings
}
type TextCase = 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED'
type TextDecoration = 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH'
type TextDecorationStyle = 'SOLID' | 'WAVY' | 'DOTTED'
type FontStyle = 'REGULAR' | 'ITALIC'
type TextDecorationOffset =
  | {
      readonly value: number
      readonly unit: 'PIXELS' | 'PERCENT'
    }
  | {
      readonly unit: 'AUTO'
    }
type TextDecorationThickness =
  | {
      readonly value: number
      readonly unit: 'PIXELS' | 'PERCENT'
    }
  | {
      readonly unit: 'AUTO'
    }
type TextDecorationColor =
  | {
      readonly value: SolidPaint
    }
  | {
      readonly value: 'AUTO'
    }
type OpenTypeFeature =
  | 'PCAP'
  | 'C2PC'
  | 'CASE'
  | 'CPSP'
  | 'TITL'
  | 'UNIC'
  | 'ZERO'
  | 'SINF'
  | 'ORDN'
  | 'AFRC'
  | 'DNOM'
  | 'NUMR'
  | 'LIGA'
  | 'CLIG'
  | 'DLIG'
  | 'HLIG'
  | 'RLIG'
  | 'AALT'
  | 'CALT'
  | 'RCLT'
  | 'SALT'
  | 'RVRN'
  | 'VERT'
  | 'SWSH'
  | 'CSWH'
  | 'NALT'
  | 'CCMP'
  | 'STCH'
  | 'HIST'
  | 'SIZE'
  | 'ORNM'
  | 'ITAL'
  | 'RAND'
  | 'DTLS'
  | 'FLAC'
  | 'MGRK'
  | 'SSTY'
  | 'KERN'
  | 'FWID'
  | 'HWID'
  | 'HALT'
  | 'TWID'
  | 'QWID'
  | 'PWID'
  | 'JUST'
  | 'LFBD'
  | 'OPBD'
  | 'RTBD'
  | 'PALT'
  | 'PKNA'
  | 'LTRA'
  | 'LTRM'
  | 'RTLA'
  | 'RTLM'
  | 'ABRV'
  | 'ABVM'
  | 'ABVS'
  | 'VALT'
  | 'VHAL'
  | 'BLWF'
  | 'BLWM'
  | 'BLWS'
  | 'AKHN'
  | 'CJCT'
  | 'CFAR'
  | 'CPCT'
  | 'CURS'
  | 'DIST'
  | 'EXPT'
  | 'FALT'
  | 'FINA'
  | 'FIN2'
  | 'FIN3'
  | 'HALF'
  | 'HALN'
  | 'HKNA'
  | 'HNGL'
  | 'HOJO'
  | 'INIT'
  | 'ISOL'
  | 'JP78'
  | 'JP83'
  | 'JP90'
  | 'JP04'
  | 'LJMO'
  | 'LOCL'
  | 'MARK'
  | 'MEDI'
  | 'MED2'
  | 'MKMK'
  | 'NLCK'
  | 'NUKT'
  | 'PREF'
  | 'PRES'
  | 'VPAL'
  | 'PSTF'
  | 'PSTS'
  | 'RKRF'
  | 'RPHF'
  | 'RUBY'
  | 'SMPL'
  | 'TJMO'
  | 'TNAM'
  | 'TRAD'
  | 'VATU'
  | 'VJMO'
  | 'VKNA'
  | 'VKRN'
  | 'VRTR'
  | 'VRT2'
  | 'SS01'
  | 'SS02'
  | 'SS03'
  | 'SS04'
  | 'SS05'
  | 'SS06'
  | 'SS07'
  | 'SS08'
  | 'SS09'
  | 'SS10'
  | 'SS11'
  | 'SS12'
  | 'SS13'
  | 'SS14'
  | 'SS15'
  | 'SS16'
  | 'SS17'
  | 'SS18'
  | 'SS19'
  | 'SS20'
  | 'CV01'
  | 'CV02'
  | 'CV03'
  | 'CV04'
  | 'CV05'
  | 'CV06'
  | 'CV07'
  | 'CV08'
  | 'CV09'
  | 'CV10'
  | 'CV11'
  | 'CV12'
  | 'CV13'
  | 'CV14'
  | 'CV15'
  | 'CV16'
  | 'CV17'
  | 'CV18'
  | 'CV19'
  | 'CV20'
  | 'CV21'
  | 'CV22'
  | 'CV23'
  | 'CV24'
  | 'CV25'
  | 'CV26'
  | 'CV27'
  | 'CV28'
  | 'CV29'
  | 'CV30'
  | 'CV31'
  | 'CV32'
  | 'CV33'
  | 'CV34'
  | 'CV35'
  | 'CV36'
  | 'CV37'
  | 'CV38'
  | 'CV39'
  | 'CV40'
  | 'CV41'
  | 'CV42'
  | 'CV43'
  | 'CV44'
  | 'CV45'
  | 'CV46'
  | 'CV47'
  | 'CV48'
  | 'CV49'
  | 'CV50'
  | 'CV51'
  | 'CV52'
  | 'CV53'
  | 'CV54'
  | 'CV55'
  | 'CV56'
  | 'CV57'
  | 'CV58'
  | 'CV59'
  | 'CV60'
  | 'CV61'
  | 'CV62'
  | 'CV63'
  | 'CV64'
  | 'CV65'
  | 'CV66'
  | 'CV67'
  | 'CV68'
  | 'CV69'
  | 'CV70'
  | 'CV71'
  | 'CV72'
  | 'CV73'
  | 'CV74'
  | 'CV75'
  | 'CV76'
  | 'CV77'
  | 'CV78'
  | 'CV79'
  | 'CV80'
  | 'CV81'
  | 'CV82'
  | 'CV83'
  | 'CV84'
  | 'CV85'
  | 'CV86'
  | 'CV87'
  | 'CV88'
  | 'CV89'
  | 'CV90'
  | 'CV91'
  | 'CV92'
  | 'CV93'
  | 'CV94'
  | 'CV95'
  | 'CV96'
  | 'CV97'
  | 'CV98'
  | 'CV99'
interface ArcData {
  readonly startingAngle: number
  readonly endingAngle: number
  readonly innerRadius: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface DropShadowEffect {
  /**
   * The string literal representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'DROP_SHADOW'
  /**
   * The color of the shadow, including its opacity.
   */
  readonly color: RGBA
  /**
   * The offset of the shadow relative to its object. Use this property to simulate the direction of the light.
   */
  readonly offset: Vector
  /**
   * The blur radius of the shadow. Must be >= 0. A lower radius creates a sharper shadow.
   */
  readonly radius: number
  /**
   * The distance by which to expand (or contract) the shadow. For drop shadows, a positive spread value creates a shadow larger than the node, whereas a negative value creates a shadow smaller than the node. For inner shadows, a positive `spread` value contracts the shadow. `spread` values are only accepted on rectangles and ellipses, or on frames, components, and instances with visible fill paints and `clipsContent` enabled. When left unspecified, the default value is 0.
   */
  readonly spread?: number
  /**
   * Whether this shadow is visible.
   */
  readonly visible: boolean
  /**
   * Determines how the color of this shadow blends with the colors underneath it. The typical default value is "NORMAL".
   */
  readonly blendMode: BlendMode
  /**
   * Whether the drop shadow should show behind translucent or transparent pixels within the node's geometry. Defaults to `false`.
   */
  readonly showShadowBehindNode?: boolean
  /**
   * The variables bound to a particular field on this shadow effect
   */
  readonly boundVariables?: {
    [field in VariableBindableEffectField]?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface InnerShadowEffect {
  /**
   * The string literal representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'INNER_SHADOW'
  /**
   * The color of the shadow, including its opacity.
   */
  readonly color: RGBA
  /**
   * The offset of the shadow relative to its object. Use this property to simulate the direction of the light.
   */
  readonly offset: Vector
  /**
   * The blur radius of the shadow. Must be >= 0. A lower radius creates a sharper shadow.
   */
  readonly radius: number
  /**
   * The distance by which to expand (or contract) the shadow. For drop shadows, a positive spread value creates a shadow larger than the node, whereas a negative value creates a shadow smaller than the node. For inner shadows, a positive `spread` value contracts the shadow. `spread` values are only accepted on rectangles and ellipses, or on frames, components, and instances with visible fill paints and `clipsContent` enabled. When left unspecified, the default value is 0.
   */
  readonly spread?: number
  /**
   * Whether this shadow is visible.
   */
  readonly visible: boolean
  /**
   * Determines how the color of this shadow blends with the colors underneath it. The typical default value is "NORMAL".
   */
  readonly blendMode: BlendMode
  /**
   * The variables bound to a particular field on this shadow effect
   */
  readonly boundVariables?: {
    [field in VariableBindableEffectField]?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface BlurEffectBase {
  /**
   * The string literal representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  /**
   * The radius of the blur. Must be >= 0. A lower radius creates a sharper blur. For progressive blurs, this is the end radius of the blur.
   */
  readonly radius: number
  /**
   * Whether this blur is visible.
   */
  readonly visible: boolean
  /**
   * The variable bound to the radius field on this blur effect
   * */
  readonly boundVariables?: {
    ['radius']?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface BlurEffectNormal extends BlurEffectBase {
  /**
   * The string literal representing the blur type. Always check the `blurType` before reading other properties.
   */
  readonly blurType: 'NORMAL'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface BlurEffectProgressive extends BlurEffectBase {
  /**
   * The string literal representing the blur type. Always check the `blurType` before reading other properties.
   */
  readonly blurType: 'PROGRESSIVE'
  /**
   * Radius of the starting point of the progressive blur.
   */
  readonly startRadius: number
  /**
   * Position of the starting point of the progressive blur. The position is in normalized object space (top left corner of the bounding box of the object is (0, 0) and the bottom right is (1,1)).
   */
  readonly startOffset: Vector
  /**
   * Position of the ending point of the progressive blur. The position is in normalized object space (top left corner of the bounding box of the object is (0, 0) and the bottom right is (1,1)).
   */
  readonly endOffset: Vector
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
type BlurEffect = BlurEffectNormal | BlurEffectProgressive
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface NoiseEffectBase {
  /**
   * The string literal representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'NOISE'
  /**
   * The color of the noise effect.
   */
  readonly color: RGBA
  /**
   * Whether the noise effect is visible.
   */
  readonly visible: boolean
  /**
   * The blend mode of the noise.
   */
  readonly blendMode: BlendMode
  /**
   * The size of the noise effect. Applies to both axes. When `noiseSizeVector` is set, this value
   * is always equal to `noiseSizeVector.x`.
   */
  readonly noiseSize: number
  /**
   * The size of the noise effect along the x and y axes. When omitted, `noiseSize` applies to both
   * axes. When provided, its `x` component must equal `noiseSize` or an error is thrown on write.
   */
  readonly noiseSizeVector?: Vector
  /**
   * The density of the noise effect.
   */
  readonly density: number
  /**
   * Noise effects currently do not support binding variables.
   */
  readonly boundVariables?: {}
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface NoiseEffectMonotone extends NoiseEffectBase {
  /**
   * The string literal representing the type of noise this is. Always check the `noiseType` before reading
   * other properties.
   */
  readonly noiseType: 'MONOTONE'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface NoiseEffectDuotone extends NoiseEffectBase {
  /**
   * The string literal representing the type of noise this is. Always check the `noiseType` before reading
   * other properties.
   */
  readonly noiseType: 'DUOTONE'
  /**
   * The secondary color of the noise effect.
   */
  readonly secondaryColor: RGBA
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface NoiseEffectMultitone extends NoiseEffectBase {
  /**
   * The string literal representing the type of noise this is. Always check the `noiseType` before reading
   * other properties.
   */
  readonly noiseType: 'MULTITONE'
  /**
   * The opacity of the noise effect.
   */
  readonly opacity: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
type NoiseEffect = NoiseEffectMonotone | NoiseEffectDuotone | NoiseEffectMultitone
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface TextureEffect {
  /**
   * The string literal representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'TEXTURE'
  /**
   * Whether the texture effect is visible.
   */
  readonly visible: boolean
  /**
   * The size of the texture effect. Applies to both axes. When `noiseSizeVector` is set, this value
   * is always equal to `noiseSizeVector.x`.
   */
  readonly noiseSize: number
  /**
   * The size of the texture effect along the x and y axes. When omitted, `noiseSize` applies to
   * both axes. When provided, its `x` component must equal `noiseSize` or an error is thrown on
   * write.
   */
  readonly noiseSizeVector?: Vector
  /**
   * The radius of the texture effect.
   */
  readonly radius: number
  /**
   * Whether the texture is clipped to the shape.
   */
  readonly clipToShape: boolean
  /**
   * Texture effects currently do not support binding variables.
   */
  readonly boundVariables?: {}
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface GlassEffect {
  /**
   * The string literal representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'GLASS'
  /**
   * Whether this glass effect is visible.
   */
  readonly visible: boolean
  /**
   * The intensity of specular highlights. Must be between 0 and 1. Higher values create brighter highlights.
   */
  readonly lightIntensity: number
  /**
   * The angle of the specular light in degrees. Controls the direction of highlights on the glass surface.
   */
  readonly lightAngle: number
  /**
   * The intensity of the refraction distortion. Must be between 0 and 1. Higher values create more distortion.
   */
  readonly refraction: number
  /**
   * The depth of the refraction effect. Must be >= 1. Higher values create deeper glass appearance.
   */
  readonly depth: number
  /**
   * The amount of chromatic aberration (color separation). Must be between 0 and 1. Higher values create more rainbow-like distortion at edges.
   */
  readonly dispersion: number
  /**
   * The radius of frost on the glass effect.
   */
  readonly radius: number
  /**
   * Glass effects currently do not support binding variables.
   */
  readonly boundVariables?: {}
}
/**
 * A shader applied to a node's `effects`.
 *
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
interface ShaderEffect {
  /**
   * The string literal "SHADER" representing the type of effect this is. Always check the `type` before reading other properties.
   */
  readonly type: 'SHADER'
  /**
   * Whether this shader effect is visible.
   */
  readonly visible: boolean
  /**
   * The id of the shader, as returned by {@link PluginAPI.listAvailableShaders} and {@link PluginAPI.importShaderById}. The shader must be imported with {@link PluginAPI.importShaderById} before it can be applied.
   */
  readonly id: string
  /**
   * The read/write map of property assignments, keyed by property-definition id (the keys of {@link Shader.propertyDefinitions}, not property names). On reads, this is populated with the effect's current assignments, including author-defined defaults, so a plugin can discover the available ids after the shader is applied.
   */
  readonly properties?: {
    [defId: string]: ShaderPropertyValue
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Effect
 */
type Effect =
  | DropShadowEffect
  | InnerShadowEffect
  | BlurEffect
  | NoiseEffect
  | TextureEffect
  | GlassEffect
  | ShaderEffect
/**
 * @see https://developers.figma.com/docs/plugins/api/Constraints
 */
type ConstraintType = 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'SCALE'
/**
 * @see https://developers.figma.com/docs/plugins/api/Constraints
 */
interface Constraints {
  readonly horizontal: ConstraintType
  readonly vertical: ConstraintType
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface ColorStop {
  /**
   * The position of the stop along the gradient between 0 and 1
   */
  readonly position: number
  /**
   * The color value of the gradient stop
   */
  readonly color: RGBA
  /**
   * The variable bound to a gradient stop
   */
  readonly boundVariables?: {
    [field in VariableBindableColorStopField]?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface ImageFilters {
  readonly exposure?: number
  readonly contrast?: number
  readonly saturation?: number
  readonly temperature?: number
  readonly tint?: number
  readonly highlights?: number
  readonly shadows?: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface SolidPaint {
  /**
   * The string literal "SOLID" representing the type of paint this is. Always check the `type` before reading other properties.
   */
  readonly type: 'SOLID'
  /**
   * The color of the paint. This does not have a alpha property, use `opacity` instead.
   *
   * You can use the {@link UtilAPI.solidPaint} utility function to set both `color` and `opacity` using CSS color strings:
   *
   * ```
   * // Create a new SolidPaint
   * const paint = figma.util.solidPaint('#FF00FF88')
   *
   * // Modify an existing SolidPaint
   * if (node.fills[0].type === 'SOLID') {
   *   const updated = figma.util.solidPaint('#FF00FF88', node.fills[0])
   * }
   * ```
   */
  readonly color: RGB
  /**
   * Whether the paint is visible. Defaults to true.
   */
  readonly visible?: boolean
  /**
   * The opacity of the paint. Must be a value between 0 and 1. Defaults to 1.
   *
   * You can use the {@link UtilAPI.solidPaint} utility function to set both `color` and `opacity` using CSS color strings:
   *
   * ```
   * // Create a new SolidPaint
   * const paint = figma.util.solidPaint('#FF00FF88')
   *
   * // Modify an existing SolidPaint
   * if (node.fills[0].type === 'SOLID') {
   *   const updated = figma.util.solidPaint('#FF00FF88', node.fills[0])
   * }
   * ```
   */
  readonly opacity?: number
  /**
   * Determines how the color of this paint blends with the colors underneath it. Defaults to "NORMAL".
   */
  readonly blendMode?: BlendMode
  /**
   * The variables bound to a particular field on this paint
   */
  readonly boundVariables?: {
    [field in VariableBindablePaintField]?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface GradientPaint {
  /**
   * The string literal representing the type of paint this is. Always check the `type` before reading other properties.
   */
  readonly type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND'
  /**
   * The positioning of the gradient within the layer.
   */
  readonly gradientTransform: Transform
  /**
   * Array of colors and their position within the gradient.
   */
  readonly gradientStops: ReadonlyArray<ColorStop>
  readonly visible?: boolean
  readonly opacity?: number
  readonly blendMode?: BlendMode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface ImagePaint {
  /**
   * The string literal "IMAGE" representing the type of paint this is. Always check the `type` before reading other properties.
   */
  readonly type: 'IMAGE'
  /**
   * How the image is positioned and scaled within the layer. Same as in the properties panel.
   */
  readonly scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE'
  /**
   * The hash (id) of the image used for this paint, if any. Use {@link PluginAPI.getImageByHash} to get the corresponding image object.
   */
  readonly imageHash: string | null
  /**
   * Applicable only for `scaleMode == "CROP"`. Determines how the image is positioned (thus, cropped) within the layer.
   */
  readonly imageTransform?: Transform
  /**
   * Applicable only for `scaleMode == "TILE"` (automatic for other modes). Determines the scaling (thus, repetition) of the image within the layer.
   */
  readonly scalingFactor?: number
  /**
   * Applicable only for `scaleMode == "TILE" | "FILL" | "FIT"` (automatic for `scaleMode == "CROP"`). Determines the rotation of the image within the layer. Must be in increments of +90.
   */
  readonly rotation?: number
  /**
   * The values for the image filter slides, equivalent to those in the paint picker. All values default to 0.0 and have range -1.0 to +1.0.
   */
  readonly filters?: ImageFilters
  readonly visible?: boolean
  readonly opacity?: number
  readonly blendMode?: BlendMode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface VideoPaint {
  /**
   * The string literal "VIDEO" representing the type of paint this is. Always check the `type` before reading other properties.
   */
  readonly type: 'VIDEO'
  /**
   * How the image is positioned and scaled within the layer. Same as in the properties panel.
   */
  readonly scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE'
  /**
   * The hash (id) of the video used for this paint, if any.
   */
  readonly videoHash: string | null
  /**
   * Applicable only for `scaleMode == "CROP"`. Determines how the video is positioned (thus, cropped) within the layer.
   */
  readonly videoTransform?: Transform
  /**
   * Applicable only for `scaleMode == "TILE"` (automatic for other modes). Determines the scaling (thus, repetition) of the video within the layer.
   */
  readonly scalingFactor?: number
  /**
   * Applicable only for `scaleMode == "TILE" | "FILL" | "FIT"` (automatic for `scaleMode == "CROP"`). Determines the rotation of the video within the layer. Must be in increments of +90.
   */
  readonly rotation?: number
  /**
   * The values for the video filter slides, equivalent to those in the paint picker. All values default to 0.0 and have range -1.0 to +1.0.
   */
  readonly filters?: ImageFilters
  readonly visible?: boolean
  readonly opacity?: number
  readonly blendMode?: BlendMode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface PatternPaint {
  /**
   * The string literal representing the type of paint this is. Always check the `type` before reading other properties.
   */
  readonly type: 'PATTERN'
  /**
   * The node id of the source node for the pattern
   */
  readonly sourceNodeId: string
  /**
   * The way the pattern is tiled
   */
  readonly tileType: 'RECTANGULAR' | 'HORIZONTAL_HEXAGONAL' | 'VERTICAL_HEXAGONAL'
  /**
   * The scaling factor of the pattern
   */
  readonly scalingFactor: number
  /**
   * The spacing of the pattern
   */
  readonly spacing: Vector
  /**
   * The horizontal alignment of the pattern
   */
  readonly horizontalAlignment: 'START' | 'CENTER' | 'END'
  readonly visible?: boolean
  readonly opacity?: number
  readonly blendMode?: BlendMode
}
/**
 * A shader applied to a node's `fills` or `strokes`.
 *
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
interface ShaderPaint {
  /**
   * The string literal "SHADER" representing the type of paint this is. Always check the `type` before reading other properties.
   */
  readonly type: 'SHADER'
  /**
   * The id of the shader, as returned by {@link PluginAPI.listAvailableShaders} and {@link PluginAPI.importShaderById}. The shader must be imported with {@link PluginAPI.importShaderById} before it can be applied.
   */
  readonly id: string
  /**
   * The read/write map of property assignments, keyed by property-definition id (the keys of {@link Shader.propertyDefinitions}, not property names). On reads, this is populated with the paint's current assignments, including author-defined defaults, so a plugin can discover the available ids after the shader is applied.
   */
  readonly properties?: {
    [defId: string]: ShaderPropertyValue
  }
  readonly visible?: boolean
  readonly opacity?: number
  readonly blendMode?: BlendMode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Paint
 */
type Paint = SolidPaint | GradientPaint | ImagePaint | VideoPaint | PatternPaint | ShaderPaint
/**
 * A single value assignable to a shader property, read from or written to the `properties` map of a {@link ShaderEffect} or {@link ShaderPaint}. The shape that's valid for a given property depends on that property's declared `type` in its {@link ShaderPropertyDefinition}. A value can always be a variable binding via the standard `VariableAlias` form.
 *
 * @see https://developers.figma.com/docs/plugins/api/Shader
 */
type ShaderPropertyValue =
  | boolean
  | string
  | number
  | RGB
  | RGBA
  | {
      x: number
      y: number
    }
  | {
      x: number
      y: number
      x2: number
      y2: number
    }
  | {
      x: number
      y: number
      radius: number
    }
  | {
      x: number
      y: number
      radius: number
      angle: number
    }
  | {
      x: number
      y: number
      color: RGB | RGBA | VariableAlias
    }
  | {
      stops: {
        position: number
        color: RGB | RGBA | VariableAlias
      }[]
    }
  | VariableAlias
/**
 * A read-only description of one property declared by a shader. Surfaced via the `propertyDefinitions` field of a {@link Shader}, keyed by property-definition id.
 *
 * @see https://developers.figma.com/docs/plugins/api/Shader
 */
interface ShaderPropertyDefinition {
  /**
   * The author-defined name of the property.
   */
  readonly name: string
  /**
   * The declared type of the property. This determines which shape of {@link ShaderPropertyValue} is valid for it. `POINT` corresponds to the editor's "point" property type.
   */
  readonly type:
    | 'BOOLEAN'
    | 'TEXT'
    | 'NUMBER'
    | 'IMAGE'
    | 'INSTANCE_SWAP'
    | 'SLOT'
    | 'COLOR'
    | 'POINT'
    | 'LINE'
    | 'CIRCLE'
    | 'CIRCLE_POINT'
    | 'COLOR_POINT'
    | 'GRADIENT'
  /**
   * The author-defined default value for the property, if any.
   */
  readonly defaultValue?: ShaderPropertyValue
  /**
   * The author-defined description of the property, if any.
   */
  readonly description?: string
}
/**
 * A shader available to the current file, as returned by {@link PluginAPI.listAvailableShaders} and {@link PluginAPI.importShaderById}.
 *
 * @see https://developers.figma.com/docs/plugins/api/Shader
 */
interface Shader {
  /**
   * A stable identifier for the shader. The same value round-trips through {@link PluginAPI.importShaderById} and the `id` field of a {@link ShaderEffect} / {@link ShaderPaint} when applying the shader.
   */
  readonly id: string
  /**
   * The name of the shader.
   */
  readonly name: string
  /**
   * Whether the shader applies as an effect (`node.effects`) or as a fill (`node.fills` / `node.strokes`).
   */
  readonly type: 'effect' | 'fill'
  /**
   * Whether the shader has been imported into the file yet. When `false`, call {@link PluginAPI.importShaderById} with this shader's `id` before applying it.
   */
  readonly imported: boolean
  /**
   * The shader's declared properties, keyed by property-definition id. Populated for imported shaders; may be absent until the shader is imported.
   */
  readonly propertyDefinitions?: {
    [defId: string]: ShaderPropertyDefinition
  }
}
interface Guide {
  readonly axis: 'X' | 'Y'
  readonly offset: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/LayoutGrid
 */
interface RowsColsLayoutGrid {
  /**
   * The string literal representing the layout grid this is. Always check the `pattern` before reading other properties.
   */
  readonly pattern: 'ROWS' | 'COLUMNS'
  /**
   * How the layout grid is aligned. "MIN" corresponds to "Left" or "Top" in the UI depending on the orientation of the layout grid. "MAX" corresponds to "Right" or "Bottom".
   */
  readonly alignment: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER'
  /**
   * The distance between the sections of the grid.
   */
  readonly gutterSize: number
  /**
   * The number of sections. This can be set to the value `Infinity`, which corresponds to "Auto" in the UI.
   */
  readonly count: number
  /**
   * The size of a section. This is ignored when `alignment == "STRETCH"` since the size is set automatically.
   */
  readonly sectionSize?: number
  /**
   * The distance between the layout grid sections and the edges of the frame. This is ignored when `alignment == "CENTER"` since the size is set automatically.
   */
  readonly offset?: number
  /**
   * Whether the layout grid is visible. Defaults to true.
   */
  readonly visible?: boolean
  /**
   * The color of the layout grid.
   */
  readonly color?: RGBA
  /**
   * The variables bound to a particular field on this shadow effect
   */
  readonly boundVariables?: {
    [field in VariableBindableLayoutGridField]?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/LayoutGrid
 */
interface GridLayoutGrid {
  /**
   * The string literal "GRID" representing the layout grid this is. Always check the `pattern` before reading other properties.
   */
  readonly pattern: 'GRID'
  /**
   * The size of individual grid cells.
   */
  readonly sectionSize: number
  readonly visible?: boolean
  readonly color?: RGBA
  readonly boundVariables?: {
    ['sectionSize']?: VariableAlias
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/LayoutGrid
 */
type LayoutGrid = RowsColsLayoutGrid | GridLayoutGrid
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
interface ExportSettingsConstraints {
  readonly type: 'SCALE' | 'WIDTH' | 'HEIGHT'
  readonly value: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
interface ExportSettingsImage {
  /**
   * The string literal representing the export format.
   * When reading {@link ExportMixin.exportSettings }, always check the `format` before reading other properties.
   */
  readonly format: 'JPG' | 'PNG'
  /**
   * Whether only the contents of the node are exported, or any overlapping layer in the same area. Defaults to `true`.
   */
  readonly contentsOnly?: boolean
  /**
   * Use the full dimensions of the node regardless of whether or not it is cropped or the space around it is empty. Use this to export text nodes without cropping. Defaults to `false`.
   */
  readonly useAbsoluteBounds?: boolean
  /**
   * Suffix appended to the file name when exporting. Defaults to empty string.
   */
  readonly suffix?: string
  /**
   * Constraint on the image size when exporting.
   *
   * ```ts
   * interface ExportSettingsConstraints {
   *   type: "SCALE" | "WIDTH" | "HEIGHT"
   *   value: number
   * }
   * ```
   *
   * Defaults to 100% of image size `{ type: "SCALE", value: 1 }`.
   *
   *
   * - `"SCALE"`: The size of the exported image is proportional to the size of the exported layer in Figma. A `value` of 1 means the export is 100% of the layer size.
   * - `"WIDTH"`: The exported image is scaled to have a fixed width of `value`.
   * - `"HEIGHT"`: The exported image is scaled to have a fixed height of `value`.
   */
  readonly constraint?: ExportSettingsConstraints
  /**
   * Color profile of the export.
   *
   * Defaults to `'DOCUMENT'`
   *
   *
   * - `"DOCUMENT"`: Use the color profile of {@link DocumentNode.documentColorProfile}.
   * - `"SRGB"`: Use sRGB colors. This was the previous behavior of Figma before [color management](https://help.figma.com/hc/en-us/articles/360039825114).
   * - `"DISPLAY_P3_V4"`: Use Display P3 colors.
   */
  readonly colorProfile?: 'DOCUMENT' | 'SRGB' | 'DISPLAY_P3_V4'
}
interface ExportSettingsSVGBase {
  readonly contentsOnly?: boolean
  readonly useAbsoluteBounds?: boolean
  readonly suffix?: string
  /**
   * Whether text elements are rendered as outlines (vector paths) or as `<text>` elements in SVGs. Defaults to `true`.
   *
   * Rendering text elements as outlines guarantees that the text looks exactly the same in the SVG as it does in the browser/inside Figma.
   *
   * Exporting as `<text>` allows text to be selectable inside SVGs and generally makes the SVG easier to read. However, this relies on the browser’s rendering engine which can vary between browsers and/or operating systems. As such, visual accuracy is not guaranteed as the result could look different than in Figma.
   */
  readonly svgOutlineText?: boolean
  /**
   * Whether to include layer names as ID attributes in the SVG. This can be useful as a way to reference particular elements, but increases the size of the SVG. SVG features that require IDs to function, such as masks and gradients, will always have IDs. Defaults to `false`.
   */
  readonly svgIdAttribute?: boolean
  /**
   * Whether to export inside and outside strokes as an approximation of the original to simplify the output. Otherwise, it uses a more precise but more bloated masking technique. This is needed because SVGs only support center strokes. Defaults to `true`.
   */
  readonly svgSimplifyStroke?: boolean
  readonly colorProfile?: 'DOCUMENT' | 'SRGB' | 'DISPLAY_P3_V4'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
interface ExportSettingsSVG extends ExportSettingsSVGBase {
  /**
   * The string literal "SVG" representing the export format.
   * When reading {@link ExportMixin.exportSettings }, always check the `format` before reading other properties.
   */
  readonly format: 'SVG'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
interface ExportSettingsSVGString extends ExportSettingsSVGBase {
  /**
   * The string literal "SVG_STRING" representing the export format.
   */
  readonly format: 'SVG_STRING'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
interface ExportSettingsPDF {
  /**
   * The string literal "PDF" representing the export format.
   *  When reading {@link ExportMixin.exportSettings }, always check the `format` before reading other properties.
   */
  readonly format: 'PDF'
  readonly contentsOnly?: boolean
  readonly useAbsoluteBounds?: boolean
  readonly suffix?: string
  readonly colorProfile?: 'DOCUMENT' | 'SRGB' | 'DISPLAY_P3_V4'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
interface ExportSettingsREST {
  /**
   * Returns the equivalent REST API response of hitting the endpoint `https://api.figma.com/v1/files/:file_key/nodes?ids=:id`.
   *
   * This is useful if you have existing code that uses the REST API that you would like to have work inside a plugin as well. It can also be significantly more perfomant if you need to serialize large groups of nodes and their children.
   * Here is an example that logs the name of every child in a node using the REST API response:
   *
   * ```ts title="Using the JSON_REST_V1 format"
   * function visitChildren(child: Object) {
   *   console.log(child.name);
   *   if (child.children) {
   *     child.children.forEach(visitChildren);
   *   }
   * }
   *
   * const response = await figma.currentPage.selection[0].exportAsync({
   *   format: "JSON_REST_V1",
   * });
   *
   * visitChildren(response.document);
   * ```
   *
   * For more information on the shape of the output of the 'JSON_REST_V1' format, see the [files](https://developers.figma.com/docs/rest-api/files) documentation.
   */
  readonly format: 'JSON_REST_V1'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ExportSettings
 */
type ExportSettings = ExportSettingsImage | ExportSettingsSVG | ExportSettingsPDF
/**
 * @see https://developers.figma.com/docs/plugins/api/properties/VectorPath-windingrule
 */
type WindingRule = 'NONZERO' | 'EVENODD'
/**
 * @see https://developers.figma.com/docs/plugins/api/VectorNetwork
 */
interface VectorVertex {
  /**
   * x position of the vertex relative to the position of the node.
   */
  readonly x: number
  /**
   * y position of the vertex relative to the position of the node.
   */
  readonly y: number
  /**
   * Appearance of the end of a stroke. Defaults to the node's property if left unspecified.
   */
  readonly strokeCap?: StrokeCap
  /**
   * Appearance of the join between two segments. Defaults to the node's property if left unspecified.
   */
  readonly strokeJoin?: StrokeJoin
  /**
   * Corner radius at this vertex. Defaults to the node's property if left unspecified.
   */
  readonly cornerRadius?: number
  /**
   * How two curve handles behave relative to one another. Defaults to the node's property if left unspecified.
   */
  readonly handleMirroring?: HandleMirroring
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VectorNetwork
 */
interface VectorSegment {
  /**
   * The index of the vertex that starts this segment.
   */
  readonly start: number
  /**
   * The index of the vertex that ends this segment.
   */
  readonly end: number
  /**
   * The tangent on the start side of this segment. Defaults to `{ x: 0, y: 0 }`
   */
  readonly tangentStart?: Vector
  /**
   * The tangent on the end side of this segment. Defaults to `{ x: 0, y: 0 }`
   */
  readonly tangentEnd?: Vector
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VectorNetwork
 */
interface VectorRegion {
  /**
   * Winding rule for this region.
   */
  readonly windingRule: WindingRule
  /**
   * List of loops, each of which is a list of indices of `VectorSegment`(s)
   */
  readonly loops: ReadonlyArray<ReadonlyArray<number>>
  /**
   * Array of fill paints used on this region.
   */
  readonly fills?: ReadonlyArray<Paint>
  /**
   * Style key of fill style applied to this region, if any.
   */
  readonly fillStyleId?: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VectorNetwork
 */
interface VectorNetwork {
  /**
   * Vertices are points in the graph.
   */
  readonly vertices: ReadonlyArray<VectorVertex>
  /**
   * Segments connect vertices.
   */
  readonly segments: ReadonlyArray<VectorSegment>
  /**
   * Regions are defined by segments and specify that an area is to be filled. Defaults to [].
   */
  readonly regions?: ReadonlyArray<VectorRegion>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VectorPath
 */
interface VectorPath {
  /**
   * The winding rule for the path (same as in SVGs). This determines whether a given point in space is inside or outside the path.
   *
   * @remarks
   *
   * ```ts
   * type WindingRule = "NONZERO" | "EVENODD"
   * ```
   *
   * Winding rules work off a concept called the winding number, which tells you for a given point how many times the path winds around that point. This is described in much more detail [here](https://oreillymedia.github.io/Using_SVG/extras/ch06-fill-rule.html). This field can have three possible values:
   * - `"NONZERO"`: The point is considered inside the path if the winding number is NONZERO.
   * - `"EVENODD"`: The point is considered inside the path if the winding number is odd.
   * - `"NONE"`: An open path won’t have a fill.
   */
  readonly windingRule: WindingRule | 'NONE'
  /**
   * A series of path commands that encodes how to draw the path.
   *
   * @remarks
   *
   * Figma supports a subset of the SVG path format. Path commands must be joined into a single string in order separated by a single space. Here are the path commands we support:
   * - `M x y`: The absolute "move to" command.
   * - `L x y`: The absolute "line to" command.
   * - `Q x0 y0 x y`: The absolute "quadratic spline to" command. _Note_ that while Figma supports this as input, we will never generate this ourselves. All quadratic splines are converted to cubic splines internally.
   * - `C x0 y0 x1 y1 x y`: The absolute "cubic spline to" command.
   * - `Z`: The "close path" command.
   */
  readonly data: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VectorPath
 */
type VectorPaths = ReadonlyArray<VectorPath>
interface LetterSpacing {
  readonly value: number
  readonly unit: 'PIXELS' | 'PERCENT'
}
type LineHeight =
  | {
      readonly value: number
      readonly unit: 'PIXELS' | 'PERCENT'
    }
  | {
      readonly unit: 'AUTO'
    }
type LeadingTrim = 'CAP_HEIGHT' | 'NONE'
/**
 * @see https://developers.figma.com/docs/plugins/api/TextWrapStyle
 */
type TextWrapStyle = 'AUTO' | 'BALANCE' | 'PRETTY'
type HyperlinkTarget = {
  type: 'URL' | 'NODE'
  value: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextListOptions
 */
type TextListOptions = {
  type: 'ORDERED' | 'UNORDERED' | 'NONE'
}
type BlendMode =
  | 'PASS_THROUGH'
  | 'NORMAL'
  | 'DARKEN'
  | 'MULTIPLY'
  | 'LINEAR_BURN'
  | 'COLOR_BURN'
  | 'LIGHTEN'
  | 'SCREEN'
  | 'LINEAR_DODGE'
  | 'COLOR_DODGE'
  | 'OVERLAY'
  | 'SOFT_LIGHT'
  | 'HARD_LIGHT'
  | 'DIFFERENCE'
  | 'EXCLUSION'
  | 'HUE'
  | 'SATURATION'
  | 'COLOR'
  | 'LUMINOSITY'
type MaskType = 'ALPHA' | 'VECTOR' | 'LUMINANCE'
/**
 * @see https://developers.figma.com/docs/plugins/api/FontName
 */
interface Font {
  fontName: FontName
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextStyleOverrides
 */
type TextStyleOverrideType = {
  type: 'SEMANTIC_ITALIC' | 'SEMANTIC_WEIGHT' | 'HYPERLINK' | 'TEXT_DECORATION'
}
interface StyledTextSegment {
  /**
   * The characters in the range of text with the same styles.
   */
  characters: string
  /**
   * Start index (inclusive) of the range of characters.
   */
  start: number
  /**
   * End index (exclusive) of the range of characters.
   */
  end: number
  /**
   * The size of the font. Has minimum value of 1.
   */
  fontSize: number
  /**
   * The font family (e.g. `"Inter"`), font style (e.g. `"Regular"`). For [variable fonts](https://developers.figma.com/docs/plugins/api/FontName), also {@link FontName.variationSettings}.
   */
  fontName: FontName
  /**
   * The weight of the font (e.g. 400 for "Regular", 700 for "Bold").
   */
  fontWeight: number
  /**
   * The style of the font (i.e. "REGULAR", "ITALIC").
   */
  fontStyle: FontStyle
  /**
   * Whether the text is underlined or has a strikethrough.
   */
  textDecoration: TextDecoration
  /**
   * The text decoration style (e.g. "SOLID"). If the text is not underlined, this value will be null.
   */
  textDecorationStyle: TextDecorationStyle | null
  /**
   * The text decoration offset. If the text is not underlined, this value will be null.
   */
  textDecorationOffset: TextDecorationOffset | null
  /**
   * The text decoration thickness. If the text is not underlined, this value will be null.
   */
  textDecorationThickness: TextDecorationThickness | null
  /**
   * The text decoration color. If the text is not underlined, this value will be null.
   */
  textDecorationColor: TextDecorationColor | null
  /**
   * Whether the text decoration skips descenders. If the text is not underlined, this value will be null.
   */
  textDecorationSkipInk: boolean | null
  /**
   * Overrides the case of the raw characters in the text node.
   */
  textCase: TextCase
  /**
   * The spacing between the lines in a paragraph of text.
   */
  lineHeight: LineHeight
  /**
   * The spacing between the individual characters.
   */
  letterSpacing: LetterSpacing
  /**
   * The paints used to fill the area of the shape.
   */
  fills: Paint[]
  /**
   * The id of the TextStyle object that the text properties of this node are linked to
   */
  textStyleId: string
  /**
   * The id of the PaintStyle object that the fills property of this node is linked to.
   */
  fillStyleId: string
  /**
   * The list settings.
   */
  listOptions: TextListOptions
  /**
   * The spacing between list items.
   */
  listSpacing: number
  /**
   * The indentation.
   */
  indentation: number
  /**
   * The paragraph indent.
   */
  paragraphIndent: number
  /**
   * The paragraph spacing.
   */
  paragraphSpacing: number
  /**
   * The text wrap style applied to the paragraph.
   */
  textWrapStyle: TextWrapStyle
  /**
   * A HyperlinkTarget if the text node has exactly one hyperlink, or null if the node has none.
   */
  hyperlink: HyperlinkTarget | null
  /**
   * OpenType features that have been explicitly enabled or disabled.
   */
  openTypeFeatures: {
    readonly [feature in OpenTypeFeature]: boolean
  }
  /**
   * The variables bound to a particular field.
   */
  boundVariables?: {
    [field in VariableBindableTextField]?: VariableAlias
  }
  /**
   * Overrides applied over a text style.
   */
  textStyleOverrides: TextStyleOverrideType[]
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextPathStartData
 *
 * Interface representing the starting point of a text path.
 */
interface TextPathStartData {
  /**
   * The segment index where the text path starts.
   */
  segment: number
  /**
   * The position (0 to 1) along the segment where the text path starts.
   */
  position: number
}
type Reaction = {
  actions?: Action[]
  trigger: Trigger | null
}
type VariableDataType =
  'BOOLEAN' | 'COLOR' | 'EASING' | 'EXPRESSION' | 'FLOAT' | 'STRING' | 'TIMING' | 'VARIABLE_ALIAS'
type ExpressionFunction =
  | 'ADDITION'
  | 'SUBTRACTION'
  | 'MULTIPLICATION'
  | 'DIVISION'
  | 'EQUALS'
  | 'NOT_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'AND'
  | 'OR'
  | 'VAR_MODE_LOOKUP'
  | 'NEGATE'
  | 'NOT'
interface Expression {
  expressionFunction: ExpressionFunction
  expressionArguments: VariableData[]
}
type VariableValueWithExpression = VariableValue | Expression
interface VariableData {
  type?: VariableDataType
  resolvedType?: VariableResolvedDataType
  value?: VariableValueWithExpression
}
type ConditionalBlock = {
  condition?: VariableData
  actions: Action[]
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Action
 */
type Action =
  | {
      readonly type: 'BACK' | 'CLOSE'
    }
  | {
      readonly type: 'URL'
      url: string
      openInNewTab?: boolean
    }
  | {
      readonly type: 'UPDATE_MEDIA_RUNTIME'
      readonly destinationId: string | null
      readonly mediaAction:
        'PLAY' | 'PAUSE' | 'TOGGLE_PLAY_PAUSE' | 'MUTE' | 'UNMUTE' | 'TOGGLE_MUTE_UNMUTE'
    }
  | {
      readonly type: 'UPDATE_MEDIA_RUNTIME'
      readonly destinationId?: string | null
      readonly mediaAction: 'SKIP_FORWARD' | 'SKIP_BACKWARD'
      readonly amountToSkip: number
    }
  | {
      readonly type: 'UPDATE_MEDIA_RUNTIME'
      readonly destinationId?: string | null
      readonly mediaAction: 'SKIP_TO'
      readonly newTimestamp: number
    }
  | {
      readonly type: 'SET_VARIABLE'
      readonly variableId: string | null
      readonly variableValue?: VariableData
    }
  | {
      readonly type: 'SET_VARIABLE_MODE'
      readonly variableCollectionId: string | null
      readonly variableModeId: string | null
    }
  | {
      readonly type: 'CONDITIONAL'
      readonly conditionalBlocks: ConditionalBlock[]
    }
  | {
      readonly type: 'NODE'
      readonly destinationId: string | null
      readonly navigation: Navigation
      readonly transition: Transition | null
      readonly overlayRelativePosition?: Vector
      readonly resetVideoPosition?: boolean
      readonly resetScrollPosition?: boolean
      readonly resetInteractiveComponents?: boolean
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Transition
 */
interface SimpleTransition {
  readonly type: 'DISSOLVE' | 'SMART_ANIMATE' | 'SCROLL_ANIMATE'
  readonly easing: Easing
  readonly duration: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Transition
 */
interface DirectionalTransition {
  readonly type: 'MOVE_IN' | 'MOVE_OUT' | 'PUSH' | 'SLIDE_IN' | 'SLIDE_OUT'
  readonly direction: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM'
  readonly matchLayers: boolean
  readonly easing: Easing
  readonly duration: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Transition
 */
type Transition = SimpleTransition | DirectionalTransition
type Trigger =
  | {
      readonly type: 'ON_CLICK' | 'ON_HOVER' | 'ON_PRESS' | 'ON_DRAG'
    }
  | {
      readonly type: 'AFTER_TIMEOUT'
      readonly timeout: number
    }
  | {
      readonly type: 'MOUSE_UP' | 'MOUSE_DOWN'
      readonly delay: number
    }
  | {
      readonly type: 'MOUSE_ENTER' | 'MOUSE_LEAVE'
      readonly delay: number
      readonly deprecatedVersion: boolean
    }
  | {
      readonly type: 'ON_KEY_DOWN'
      readonly device: 'KEYBOARD' | 'XBOX_ONE' | 'PS4' | 'SWITCH_PRO' | 'UNKNOWN_CONTROLLER'
      readonly keyCodes: ReadonlyArray<number>
    }
  | {
      readonly type: 'ON_MEDIA_HIT'
      readonly mediaHitTime: number
    }
  | {
      readonly type: 'ON_MEDIA_END'
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Action
 */
type Navigation = 'NAVIGATE' | 'SWAP' | 'OVERLAY' | 'SCROLL_TO' | 'CHANGE_TO'
/**
 * @see https://developers.figma.com/docs/plugins/api/Transition
 */
interface Easing {
  readonly type:
    | 'EASE_IN'
    | 'EASE_OUT'
    | 'EASE_IN_AND_OUT'
    | 'LINEAR'
    | 'EASE_IN_BACK'
    | 'EASE_OUT_BACK'
    | 'EASE_IN_AND_OUT_BACK'
    | 'CUSTOM_CUBIC_BEZIER'
    | 'GENTLE'
    | 'QUICK'
    | 'BOUNCY'
    | 'SLOW'
    | 'CUSTOM_SPRING'
  readonly easingFunctionCubicBezier?: EasingFunctionBezier
  readonly easingFunctionSpring?: EasingFunctionSpring
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Transition
 */
interface EasingFunctionBezier {
  x1: number
  y1: number
  x2: number
  y2: number
}
interface EasingFunctionSpring {
  mass: number
  stiffness: number
  damping: number
  initialVelocity: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface MotionEasing {
  readonly type:
    | 'EASE_IN'
    | 'EASE_OUT'
    | 'EASE_IN_AND_OUT'
    | 'LINEAR'
    | 'EASE_IN_BACK'
    | 'EASE_OUT_BACK'
    | 'EASE_IN_AND_OUT_BACK'
    | 'CUSTOM_CUBIC_BEZIER'
    | 'GENTLE'
    | 'QUICK'
    | 'BOUNCY'
    | 'SLOW'
    | 'CUSTOM_SPRING'
    | 'HOLD'
  readonly easingFunctionCubicBezier?: EasingFunctionBezier
  readonly easingFunctionSpring?: NormalizedSpring
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface PhysicalSpring {
  readonly mass: number
  readonly stiffness: number
  readonly damping: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface NormalizedSpring {
  /**
   * A normalized bounce value from 0 to 1.
   */
  readonly bounce: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type AnimationStylePropValue = string | number | boolean | MotionEasing | VariableAlias
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type AvailableAnimationStylePropValue = string
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface BaseAnimationStyle {
  readonly styleId: string
  readonly name: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface AvailableAnimationStyle extends BaseAnimationStyle {
  readonly description?: string
  readonly props?: {
    readonly [key: string]: AvailableAnimationStylePropValue
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface FigmaAnimationStyleConfiguration {
  /**
   * Defaults to `"FIGMA"` when omitted.
   */
  readonly type?: 'FIGMA'
  /**
   * The duration of the applied animation style in seconds. Must be finite and non-negative.
   */
  readonly duration?: number
  /**
   * The timeline offset of the applied animation style in seconds. Must be finite and non-negative.
   */
  readonly timelineOffset?: number
  readonly props?: { readonly [key: string]: AnimationStylePropValue }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface CustomAnimationStyleConfiguration {
  readonly type: 'CUSTOM'
  /**
   * The timeline offset of the applied animation style in seconds. Must be finite and non-negative.
   */
  readonly timelineOffset?: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type AnimationStyleConfiguration =
  FigmaAnimationStyleConfiguration | CustomAnimationStyleConfiguration
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface AppliedFigmaAnimationStyle extends BaseAnimationStyle, FigmaAnimationStyleConfiguration {
  /**
   * Always present when read back, unlike the optional `type` on
   * {@link FigmaAnimationStyleConfiguration}.
   */
  readonly type: 'FIGMA'
  readonly id: string
  readonly description?: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface AppliedCustomAnimationStyle
  extends BaseAnimationStyle, CustomAnimationStyleConfiguration {
  readonly id: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type AppliedAnimationStyle = AppliedFigmaAnimationStyle | AppliedCustomAnimationStyle
/**
 * One Figma animation contained in a {@link CustomAnimationStyle}. Read via
 * `style.animationEntries` and created by `style.addAnimationEntryAsync()`.
 *
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type AnimationEntry = AppliedFigmaAnimationStyle
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type KeyframeValue =
  | {
      readonly type: 'FLOAT'
      readonly value: number
    }
  | {
      readonly type: 'COLOR'
      readonly value: RGBA
    }
  | {
      readonly type: 'TEXT_DATA'
      readonly value: string
    }
  | {
      readonly type: 'VECTOR'
      readonly value: Vector
    }
  | {
      readonly type: 'BOOL'
      readonly value: boolean
    }
  | {
      readonly type: 'CIRCLE'
      readonly value: {
        readonly x: number
        readonly y: number
        readonly radius: number
      }
    }
  | {
      readonly type: 'LINE'
      readonly value: {
        readonly x: number
        readonly y: number
        readonly x2: number
        readonly y2: number
      }
    }
  | {
      readonly type: 'CIRCLE_POINT'
      readonly value: {
        readonly x: number
        readonly y: number
        readonly radius: number
        readonly angle: number
      }
    }
  | {
      readonly type: 'COLOR_POINT'
      readonly value: {
        readonly x: number
        readonly y: number
        readonly color: RGBA
      }
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface ManualKeyframeInput {
  readonly id?: string
  /**
   * The keyframe position on the timeline in seconds.
   */
  readonly timelinePosition: number
  readonly easing?: MotionEasing | VariableAlias
  readonly value: KeyframeValue
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface ManualKeyframeTrackInput {
  readonly id?: string
  readonly baseValue?: KeyframeValue
  readonly keyframes: ReadonlyArray<ManualKeyframeInput>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface ManualKeyframe extends ManualKeyframeInput {
  readonly id: string
  readonly easing: MotionEasing | VariableAlias
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface ManualKeyframeBinding {
  readonly id: string
  readonly baseValue: KeyframeValue
  readonly keyframes: ReadonlyArray<ManualKeyframe>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface ManualKeyframeTrack {
  readonly id: string
  readonly keyframeOperation: 'SET' | 'OFFSET' | 'SCALE'
  readonly keyframes: ReadonlyArray<ManualKeyframe>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface KeyframeBinding {
  readonly baseValue: KeyframeValue
  readonly timelineDuration: number
  readonly tracks: ReadonlyArray<ManualKeyframeTrack>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type KeyframePropertyFieldName =
  | 'CORNER_RADIUS'
  | 'STROKE_WEIGHT'
  | 'STACK_SPACING'
  | 'STACK_PADDING_LEFT'
  | 'STACK_PADDING_TOP'
  | 'STACK_PADDING_RIGHT'
  | 'STACK_PADDING_BOTTOM'
  | 'WIDTH'
  | 'HEIGHT'
  | 'RECTANGLE_TOP_LEFT_CORNER_RADIUS'
  | 'RECTANGLE_TOP_RIGHT_CORNER_RADIUS'
  | 'RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS'
  | 'RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS'
  | 'BORDER_TOP_WEIGHT'
  | 'BORDER_BOTTOM_WEIGHT'
  | 'BORDER_LEFT_WEIGHT'
  | 'BORDER_RIGHT_WEIGHT'
  | 'STACK_COUNTER_SPACING'
  | 'OPACITY'
  | 'GRID_ROW_GAP'
  | 'GRID_COLUMN_GAP'
  | 'TRANSLATION_X'
  | 'TRANSLATION_Y'
  | 'TRANSLATION_XY'
  | 'ROTATION'
  | 'SCALE_X'
  | 'SCALE_Y'
  | 'SCALE_XY'
  | 'PATH_TRIM_START'
  | 'PATH_TRIM_END'
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type EffectKeyframeFieldName =
  | 'OFFSET_X'
  | 'OFFSET_Y'
  | 'RADIUS'
  | 'SPREAD'
  | 'COLOR'
  | 'REFRACTION_RADIUS'
  | 'SPECULAR_ANGLE'
  | 'SPECULAR_INTENSITY'
  | 'CHROMATIC_ABERRATION'
  | 'SPLAY'
  | 'REFRACTION_INTENSITY'
  | 'START_RADIUS'
  | 'NOISE_SIZE_X'
  | 'NOISE_SIZE_Y'
  | 'DENSITY'
  | 'EFFECT_OPACITY'
  | 'SECONDARY_COLOR'
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type KeyframeField =
  | {
      readonly type: 'PROPERTY'
      readonly name: KeyframePropertyFieldName
    }
  | {
      readonly type: 'INDEXED_ITEM'
      readonly collection: 'fills' | 'strokes'
      readonly index: number
    }
  | {
      readonly type: 'INDEXED_ITEM'
      readonly collection: 'fills' | 'strokes'
      readonly index: number
      readonly propertyId: string
    }
  | {
      readonly type: 'INDEXED_ITEM'
      readonly collection: 'effects'
      readonly index: number
      readonly field: EffectKeyframeFieldName
    }
  | {
      readonly type: 'INDEXED_ITEM'
      readonly collection: 'effects'
      readonly index: number
      readonly propertyId: string
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type ComponentPropKeyframeTracks = Partial<Record<string, ManualKeyframeBinding>>
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type ComponentPropKeyframeBindings = Partial<Record<string, KeyframeBinding>>
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type PaintManualKeyframeTrack =
  | ManualKeyframeBinding
  | {
      readonly properties: ComponentPropKeyframeTracks
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type PaintKeyframeBinding =
  | KeyframeBinding
  | {
      readonly properties: ComponentPropKeyframeBindings
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type EffectManualKeyframeTracks = Partial<
  Record<EffectKeyframeFieldName, ManualKeyframeBinding>
> & {
  readonly properties?: ComponentPropKeyframeTracks
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type EffectKeyframeBindings = Partial<Record<EffectKeyframeFieldName, KeyframeBinding>> & {
  readonly properties?: ComponentPropKeyframeBindings
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type ManualKeyframeTracks = Partial<Record<KeyframePropertyFieldName, ManualKeyframeBinding>> & {
  readonly fills?: Partial<Record<number, PaintManualKeyframeTrack>>
  readonly strokes?: Partial<Record<number, PaintManualKeyframeTrack>>
  readonly effects?: Partial<Record<number, EffectManualKeyframeTracks>>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
type Animations = Partial<Record<KeyframePropertyFieldName, KeyframeBinding>> & {
  readonly fills?: Partial<Record<number, PaintKeyframeBinding>>
  readonly strokes?: Partial<Record<number, PaintKeyframeBinding>>
  readonly effects?: Partial<Record<number, EffectKeyframeBindings>>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Motion
 */
interface Timeline {
  readonly id: string
  /**
   * The timeline duration in seconds.
   */
  readonly duration: number
}
type OverflowDirection = 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'BOTH'
/**
 * @see https://developers.figma.com/docs/plugins/api/Overlay
 */
type OverlayPositionType =
  | 'CENTER'
  | 'TOP_LEFT'
  | 'TOP_CENTER'
  | 'TOP_RIGHT'
  | 'BOTTOM_LEFT'
  | 'BOTTOM_CENTER'
  | 'BOTTOM_RIGHT'
  | 'MANUAL'
/**
 * @see https://developers.figma.com/docs/plugins/api/Overlay
 */
type OverlayBackground =
  | {
      readonly type: 'NONE'
    }
  | {
      readonly type: 'SOLID_COLOR'
      readonly color: RGBA
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/Overlay
 */
type OverlayBackgroundInteraction = 'NONE' | 'CLOSE_ON_CLICK_OUTSIDE'
/**
 * @see https://developers.figma.com/docs/plugins/api/PublishStatus
 */
type PublishStatus = 'UNPUBLISHED' | 'CURRENT' | 'CHANGED'
interface ConnectorEndpointPosition {
  position: {
    x: number
    y: number
  }
}
interface ConnectorEndpointPositionAndEndpointNodeId {
  position: {
    x: number
    y: number
  }
  endpointNodeId: string
}
interface ConnectorEndpointEndpointNodeIdAndMagnet {
  endpointNodeId: string
  magnet: 'NONE' | 'AUTO' | 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT' | 'CENTER'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ConnectorEndpoint
 */
type ConnectorEndpoint =
  | ConnectorEndpointPosition
  | ConnectorEndpointEndpointNodeIdAndMagnet
  | ConnectorEndpointPositionAndEndpointNodeId
/**
 * @see https://developers.figma.com/docs/plugins/api/ConnectorStrokeCap
 */
type ConnectorStrokeCap =
  | 'NONE'
  | 'ARROW_EQUILATERAL'
  | 'ARROW_LINES'
  | 'TRIANGLE_FILLED'
  | 'DIAMOND_FILLED'
  | 'CIRCLE_FILLED'
  | 'ERD_ZERO_OR_ONE'
  | 'ERD_EXACTLY_ONE'
  | 'ERD_ZERO_OR_MORE'
  | 'ERD_ONE_OR_MORE'
  | 'ERD_ONE'
  | 'ERD_MANY'
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface BaseNodeMixin extends PluginDataMixin {
  /**
   * The unique identifier of a node. For example, `1:3`. The node id can be used with methods such as {@link PluginAPI.getNodeByIdAsync}, but plugins typically don't need to use this since you can usually just access a node directly.
   *
   * @remarks
   *
   * One possible use case for using the `id` is to have a serializable representation of a Figma node. To "deserialize" an id back into a node, pass it to {@link PluginAPI.getNodeByIdAsync}. This will return null if the node is no longer present in the document.
   *
   * In the URLs for Figma files, node ids are hyphenated. However, for use with the API, node ids must use colons. For example, if a Figma file URL has the node id `1-3`, you must convert it to `1:3`.
   */
  readonly id: string
  /**
   * Returns the parent of this node, if any. This property is not meant to be directly edited. To reparent, see {@link ChildrenMixin.appendChild}.
   *
   * @remarks
   *
   * The root node (i.e. `figma.root`) doesn't have a parent.
   *
   * Components accessed via {@link InstanceNode.getMainComponentAsync | instance.getMainComponentAsync()} or {@link InstanceNode.mainComponent | instance.mainComponent} do not always have a parent. They could be remote components or soft-deleted components.
   */
  readonly parent: (BaseNode & ChildrenMixin) | null
  /**
   * The name of the layer that appears in the layers panel. Calling `figma.root.name` will return the name, read-only, of the current file.
   *
   * @remarks
   *
   * If the node is a {@link TextNode}, the name will update automatically by default based on the `characters` property (`autoRename` is true). If you manually override the text node's name, it will set `autoRename` to false. This matches the behavior in the editor.
   *
   * If the node is a {@link PageNode} with no children and the name is a page divider name, it will set `isPageDivider` to true. A page divider name consists of all asterisks, all en dashes, all em dashes, or all spaces.
   */
  name: string
  /**
   * Returns true if this node has been removed since it was first accessed. If your plugin stays open for a while and stores references to nodes, you should write your code defensively and check that the nodes haven't been removed by the user.
   *
   * @remarks
   *
   * A node can be removed for any number of reasons. Some examples:
   * - Your plugin called node.remove() on it
   * - Someone else deleted the node using multiplayer
   * - The user triggered an undo action and the node was removed
   * - The user simply deleted the node
   * - You removed all children out of a group, and the group auto-deleted itself
   */
  readonly removed: boolean
  /**
   * Returns a string representation of the node. For debugging purposes only, do not rely on the exact output of this string in production code.
   *
   * @remarks
   *
   * This currently returns a string of the form `[Node ID]` where `ID` is the id of the node. This is just for debugging convenience so the node displays something useful when converted to a string. We recommend not relying on this in production.
   *
   * Example:
   * ```ts
   * // e.g. [Node 0:5]
   * console.log(`Current selected node ${figma.currentPage.selection[0]}`)
   * ```
   */
  toString(): string
  /**
   * Removes this node and **all of its children** from the document.
   *
   * @remarks
   *
   * If you want to only remove this node but not its children, you will have to first move them to another node before calling `remove()`.
   */
  remove(): void
  /**
   * Returns true if Figma detects that a node is an asset, otherwise returns false. An asset is is either an icon or a raster image.
   *
   * This property is useful if you're building a [plugin for code generation](https://developers.figma.com/docs/plugins/codegen-plugins).
   *
   * Note: This property uses a set of heuristics to determine if a node is an asset. At a high level an icon is a small vector graphic and an image is a node with an image fill.
   */
  readonly isAsset: boolean
  /**
   * Resolves to a JSON object of CSS properties of the node. This is the same CSS that Figma shows in the inspect panel and is helpful if you are building a [plugin for code generation](https://developers.figma.com/docs/plugins/codegen-plugins).
   *
   */
  getCSSAsync(): Promise<{
    [key: string]: string
  }>
  /**
   * Returns the top-most frame that contains this node. If the node is not inside a frame, this will return undefined.
   *
   * Note: This function will only work in Figma Design and will throw an error if called in FigJam or Slides.
   */
  getTopLevelFrame(): FrameNode | undefined
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface PluginDataMixin {
  /**
   * Retrieves custom information that was stored on this node or style using {@link PluginDataMixin.setPluginData}. If there is no data stored for the provided key, an empty string is returned.
   */
  getPluginData(key: string): string
  /**
   * Lets you store custom information on any node or style, **private** to your plugin. The total size of your entry (`pluginId`, `key`, `value`) cannot exceed 100 kB.
   *
   * @param key - The key under which to store the data. This is similar to writing to a plain object via `obj[key] = value`.
   * @param value - The data you want to store. If you want to store a value type other than a string, encode it as a JSON string first via `JSON.stringify` and `JSON.parse`. If you set the value to the empty string (""), the key/value pair is removed.
   *
   * @remarks
   *
   * The data is specific to your plugin ID. Plugins with other IDs won't be able to read this data. You can retrieve it later by calling `getPluginData` with the same key. To find all data stored on a node or style by your plugin use `getPluginDataKeys`.
   *
   * Caution: ⚠ The data is stored privately for **stability**, not **security**. It prevents other plugins from accessing with your data. It does not, however, prevent users from seeing the data given sufficient effort. For example, they could export the document as a .fig file and try to decode it.
   *
   * Caution: ⚠ Data will become inaccessible if your plugin ID changes.
   *
   *
   * Caution: ⚠ Total entry size cannot exceed 100 kB.
   */
  setPluginData(key: string, value: string): void
  /**
   * Retrieves a list of all keys stored on this node or style using using {@link PluginDataMixin.setPluginData}. This enables iterating through all data stored privately on a node or style by your plugin.
   */
  getPluginDataKeys(): string[]
  /**
   * Retrieves custom information that was stored on this node or style using {@link PluginDataMixin.setSharedPluginData}. If there is no data stored for the provided namespace and key, an empty string is returned.
   */
  getSharedPluginData(namespace: string, key: string): string
  /**
   * Lets you store custom information on any node or style, **public** to all plugins. The total size of your entry (`namespace`, `key`, `value`) cannot exceed 100 kB.
   *
   * @param namespace - A unique string to identify your plugin and avoid key collisions with other plugins. The namespace must be at least 3 alphanumeric characters.
   * @param key - The key under which to store the data. This is similar to writing to a plain object via `obj[key] = value`.
   * @param value - The data you want to store. If you want to store a value type other than a string, encode it as a JSON string first via `JSON.stringify` and `JSON.parse`. If you set the value to the empty string (""), the key/value pair is removed.
   *
   * @remarks
   *
   * This lets you store custom information on any node or style. You can retrieve it later by calling {@link PluginDataMixin.getSharedPluginData} with the same namespace and key. To find all data stored on a node or style in a particular namespace, use {@link PluginDataMixin.getSharedPluginDataKeys}.
   *
   * Any data you write using this API will be readable by any plugin. The intent is to allow plugins to interoperate with each other. Use {@link PluginDataMixin.setPluginData} instead if you don't want other plugins to be able to read your data.
   *
   * You must also provide a `namespace` argument to avoid key collisions with other plugins. This argument is mandatory to prevent multiple plugins from using generic key names like `data` and overwriting one another. We recommend passing a value that identifies your plugin. This namespace can be given to authors of other plugins so that they can read data from your plugin.
   *
   * Caution: ⚠ Total entry size cannot exceed 100 kB.
   */
  setSharedPluginData(namespace: string, key: string, value: string): void
  /**
   * Retrieves a list of all keys stored on this node or style using {@link PluginDataMixin.setSharedPluginData}. This enables iterating through all data stored in a given namespace.
   */
  getSharedPluginDataKeys(namespace: string): string[]
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface SceneNodeMixin extends ExplicitVariableModesMixin, MotionNodeMixin {
  /**
   * Whether the node is visible or not. Does not affect a plugin's ability to access the node.
   *
   * @remarks
   *
   * The value that this property returns is independent from the node's parent. i.e.
   * - The node isn't necessarily visible if this is `.visible === true`.
   * - The node isn't necessarily invisible if this is `.visible === false`.
   * - An object is visible if `.visible == true` for itself and **all** its parents.
   */
  visible: boolean
  /**
   * Whether the node is locked or not, preventing certain user interactions on the canvas such as selecting and dragging. Does not affect a plugin's ability to write to those properties.
   *
   * @remarks
   *
   * The value that this property returns is independent from the node's parent. i.e.
   * - The node isn't necessarily locked if this is `.locked === true`.
   * - The node isn't necessarily unlocked if this is `.locked === false`.
   * - An object is locked if `.locked == true` for itself or **any** of its parents.
   */
  locked: boolean
  /**
   * An array of nodes that are "stuck" to this node. In FigJam, stamps, highlights, and some widgets can "stick"
   * to other nodes if they are dragged on top of another node.
   *
   * @remarks
   *
   * This property is only available in FigJam.
   *
   *
   * In FigJam a stickable host that means that stickables, like `'STAMP'` nodes, are allowed to attach themselves to the node. If the stickable host moves all nodes that are in `stuckNodes` move along with it.
   */
  readonly stuckNodes: SceneNode[]
  /**
   * An array of `ConnectorNode`s that are attached to a node.
   */
  readonly attachedConnectors: ConnectorNode[]
  /**
   * All component properties that are attached on this node. A node can only have `componentPropertyReferences` if it is a component sublayer or an instance sublayer. It will be `null` otherwise. The value in the key-value pair refers to the component property name as returned by `componentPropertyDefinitions` on the containing component, component set or main component (for instances).
   *
   * When setting, may throw the following errors: cannotApplySlotPropertyToNonFrameNode, cannotApplySlotPropertyToFrameWithGrid, or cannotApplySlotPropertyToFrame.
   */
  componentPropertyReferences:
    | {
        [nodeProperty in 'visible' | 'characters' | 'mainComponent']?: string
      }
    | null
  /**
   * The variables bound to a particular field on this node. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables) guide for how to get and set variable bindings.
   *
   * @remarks
   *
   * On nodes with independent corner radii (e.g. rectangles, frames), a `cornerRadius` binding sets all four corners and appears in `boundVariables` as `topLeftRadius`/`topRightRadius`/`bottomLeftRadius`/`bottomRightRadius` rather than `cornerRadius`; elsewhere it appears as `cornerRadius`.
   *
   */
  readonly boundVariables?: {
    readonly [field in VariableBindableNodeField]?: VariableAlias
  } & {
    readonly [field in VariableBindableTextField]?: VariableAlias[]
  } & {
    readonly fills?: VariableAlias[]
    readonly strokes?: VariableAlias[]
    readonly effects?: VariableAlias[]
    readonly layoutGrids?: VariableAlias[]
    readonly componentProperties?: {
      readonly [propertyName: string]: VariableAlias
    }
    readonly textRangeFills?: VariableAlias[]
  }
  /**
   * Binds the provided `field` on this node to the given variable. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables) guide for how to get and set variable bindings.
   *
   * If `null` is provided as the variable, the given `field` will be unbound from any variables.
   *
   * @param field - The field to bind the variable to.
   * @param variable - The variable to bind to the field. If `null` is provided, the field will be unbound from any variables. Make sure to pass a Variable object or null; passing a variable ID is deprecated.
   */
  setBoundVariable(
    field: VariableBindableNodeField | VariableBindableTextField,
    variable: Variable | null,
  ): void
  /**
   * An object, keyed by field, returning any variables that match the raw value of that field for the mode of the node (or the default variable value if no mode is set)
   *
   * @remarks
   *
   * Inferred variables are only returned for a field when it is not using a [bound variable](https://developers.figma.com/docs/plugins/api/node-properties#boundvariables).
   *
   * Variables can be inferred from:
   * - The collections of variables used in the file
   * - Variables from subscribed libraries, provided the variable is used in the file
   *
   * Variables can only be inferred when there is a single variable that matches the raw value used for the scope of the variable.
   * - i.e. For a property set to width: 100px, where there are two variables set to a value of 100 with the default scope, a value cannot be inferred as there are two matches.
   * - i.e. For a property set to width: 100px, where there is a variable set to 100 with a scope of "Width and height" and a variable set to 100 with a scope of "Corner radius", a value can be inferred as there is a single match for the given scope.
   *
   * Inferred variables for fills and strokes return a list of results where the index matches that of node.fills and node.strokes.
   * - i.e. node.inferredVariables.fills[0] holds the inferred variables for node.fills[0]
   */
  readonly inferredVariables?: {
    readonly [field in VariableBindableNodeField]?: VariableAlias[]
  } & {
    readonly fills?: VariableAlias[][]
    readonly strokes?: VariableAlias[][]
  }
  /**
   * The resolved mode for this node for each variable collection in this file.
   *
   * @remarks
   *
   * The set of resolved modes on a node includes the explicitly set modes on the node, as well as the explicitly set modes on ancestors of the node. By default, nodes [automatically inherit](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables#Auto_mode) the modes of their parents.
   *
   * ```ts title="explicitVariableModes vs resolvedVariableModes"
   * // Create two collections with two modes each
   * const collection1 = figma.variables.createVariableCollection("Collection 1")
   * const collection1Mode1Id = collection1.modes[0].modeId
   * const collection1Mode2Id = collection1.addMode('Mode 2')
   * const collection2 = figma.variables.createVariableCollection("Collection 2")
   * const collection2Mode1Id = collection2.modes[0].modeId
   * const collection2Mode2Id = collection2.addMode('Mode 2')
   *
   * const parentFrame = figma.createFrame()
   * const childFrame = figma.createFrame()
   * parentFrame.appendChild(childFrame)
   *
   * parentFrame.setExplicitVariableModeForCollection(
   *   collection1,
   *   collection1Mode2Id
   * )
   * childFrame.setExplicitVariableModeForCollection(
   *   collection2,
   *   collection2Mode1Id
   * )
   *
   * // Example output (only collection2 is present):
   * // { 'VariableCollectionId:1:3': '1:2' }
   * console.log(childFrame.explicitVariableModes);
   *
   * // Example output (both collections are present):
   * // { 'VariableCollectionId:1:2': '1:1', 'VariableCollectionId:1:3': '1:2' }
   * console.log(childFrame.resolvedVariableModes);
   * ```
   */
  resolvedVariableModes: {
    [collectionId: string]: string
  }
}
/**
 * Motion node properties and methods are available in Beta. This API is subject to change.
 *
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface MotionNodeMixin {
  /**
   * The Motion animation style instances currently applied to this node.
   *
   * Each entry is discriminated by `type`: `"FIGMA"` for a Figma-provided
   * animation style, whose `props` values are the configured property values
   * for this node, and `"CUSTOM"` for a {@link CustomAnimationStyle}.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * if (node) {
   *   for (const style of node.animationStyles) {
   *     if (style.type === 'FIGMA') {
   *       console.log(style.name, style.id, style.props)
   *     } else {
   *       console.log(style.name, style.id)
   *     }
   *   }
   * }
   * ```
   */
  readonly animationStyles: AppliedAnimationStyle[]
  /**
   * All Motion animation keyframes on this node, including keyframes created by animation styles and manual keyframe tracks.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * const translationX = node?.animations.TRANSLATION_X
   * if (translationX) {
   *   console.log(translationX.timelineDuration, translationX.tracks)
   * }
   * ```
   */
  readonly animations: Animations
  /**
   * The manual Motion keyframe tracks bound to this node.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * const manualTranslationX = node?.manualKeyframeTracks.TRANSLATION_X
   * if (manualTranslationX) {
   *   console.log(manualTranslationX.keyframes)
   * }
   * ```
   */
  readonly manualKeyframeTracks: ManualKeyframeTracks
  /**
   * The Motion timelines that contain this node. Currently this returns the containing top-level frame's timeline.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * if (node) {
   *   for (const timeline of node.timelines) {
   *     console.log(timeline.id, timeline.duration)
   *   }
   * }
   * ```
   */
  readonly timelines: ReadonlyArray<Timeline>

  /**
   * Applies a Motion animation style to this node and returns the applied animation style instance id.
   *
   * @param styleId - The animation style to apply. For a Figma animation style, the `styleId` from {@link MotionAPI.figmaAnimationStyles}. For a custom animation style, the `id` of a {@link CustomAnimationStyle}.
   * @param animationStyleData - Optional values used to configure the applied animation style. Omit `type`, or set it to `"FIGMA"`, for a Figma animation style; set it to `"CUSTOM"` to apply a custom animation style.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * const [style] = figma.motion.figmaAnimationStyles()
   * if (node && style) {
   *   const appliedStyleId = node.applyAnimationStyle(style.styleId, {
   *     duration: 0.4,
   *     timelineOffset: 0,
   *     props: {
   *       direction: 'right',
   *       distance: 120,
   *     },
   *   })
   *   console.log(appliedStyleId)
   * }
   * ```
   */
  applyAnimationStyle(styleId: string, animationStyleData?: AnimationStyleConfiguration): string

  /**
   * Removes an applied Motion animation style from this node.
   *
   * @param id - The applied animation style instance id returned by {@link MotionNodeMixin.applyAnimationStyle} or read from {@link MotionNodeMixin.animationStyles}. The id determines which applied style is removed, whether it is a Figma animation style or a {@link CustomAnimationStyle}.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * const [appliedStyle] = node?.animationStyles ?? []
   * if (node && appliedStyle) {
   *   node.removeAnimationStyle(appliedStyle.id)
   * }
   * ```
   */
  removeAnimationStyle(id: string): void
  /**
   * Applies or replaces the manual Motion keyframe track for a property, paint, or effect field on this node.
   *
   * @param field - The property, paint, or effect field to animate.
   * @param track - The manual keyframe track to write.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * if (node) {
   *   node.applyManualKeyframeTrack(
   *     { type: 'PROPERTY', name: 'TRANSLATION_X' },
   *     {
   *       baseValue: { type: 'FLOAT', value: 0 },
   *       keyframes: [
   *         { timelinePosition: 0, value: { type: 'FLOAT', value: 0 } },
   *         { timelinePosition: 0.3, value: { type: 'FLOAT', value: 120 } },
   *       ],
   *     },
   *   )
   * }
   * ```
   */
  applyManualKeyframeTrack(field: KeyframeField, track: ManualKeyframeTrackInput): void
  /**
   * Removes the manual Motion keyframe track for a property, paint, or effect field on this node.
   *
   * @param field - The property, paint, or effect field to remove.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * if (node) {
   *   node.removeManualKeyframeTrack({
   *     type: 'PROPERTY',
   *     name: 'TRANSLATION_X',
   *   })
   * }
   * ```
   */
  removeManualKeyframeTrack(field: KeyframeField): void
  /**
   * Sets the duration, in seconds, for the timeline with the given id.
   *
   * @param id - A timeline id read from {@link MotionNodeMixin.timelines}.
   * @param duration - The new timeline duration in seconds. Must be greater than zero.
   *
   * @remarks
   * ```ts
   * const node = figma.currentPage.selection[0]
   * const [timeline] = node?.timelines ?? []
   * if (node && timeline) {
   *   node.setTimelineDuration(timeline.id, 1.2)
   * }
   * ```
   */
  setTimelineDuration(id: string, duration: number): void
}
type VariableBindableNodeField =
  | 'height'
  | 'width'
  | 'characters'
  | 'itemSpacing'
  | 'paddingLeft'
  | 'paddingRight'
  | 'paddingTop'
  | 'paddingBottom'
  | 'visible'
  | 'cornerRadius'
  | 'topLeftRadius'
  | 'topRightRadius'
  | 'bottomLeftRadius'
  | 'bottomRightRadius'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'counterAxisSpacing'
  | 'strokeWeight'
  | 'strokeTopWeight'
  | 'strokeRightWeight'
  | 'strokeBottomWeight'
  | 'strokeLeftWeight'
  | 'opacity'
  | 'gridRowGap'
  | 'gridColumnGap'
type VariableBindableTextField =
  | 'fontFamily'
  | 'fontSize'
  | 'fontStyle'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
  | 'paragraphSpacing'
  | 'paragraphIndent'
type VariableBindablePaintField = 'color'
type VariableBindablePaintStyleField = 'paints'
type VariableBindableColorStopField = 'color'
type VariableBindableEffectField = 'color' | 'radius' | 'spread' | 'offsetX' | 'offsetY'
type VariableBindableEffectStyleField = 'effects'
type VariableBindableLayoutGridField = 'sectionSize' | 'count' | 'offset' | 'gutterSize'
type VariableBindableGridStyleField = 'layoutGrids'
type VariableBindableComponentPropertyField = 'value'
type VariableBindableComponentPropertyDefinitionField = 'defaultValue'
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface StickableMixin {
  /**
   * If this node is stuck to another node this property returns that node or null.
   *
   * @remarks
   *
   * This property is only available in FigJam.
   */
  stuckTo: SceneNode | null
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface ChildrenMixin {
  /**
   * The list of children, sorted back-to-front. That is, the first child in the array is the bottommost layer on the screen, and the last child in the array is the topmost layer.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this property.
   *
   * @remarks
   *
   * This array can be read like and iterated like a regular array. However, calling this property always returns a new array, and both the property and the new array are read-only.
   *
   * As such, this property cannot be assigned to, and the array cannot be modified directly (it wouldn't do anything). Instead, use {@link ChildrenMixin.appendChild}, {@link ChildrenMixin.insertChild} or {@link BaseNodeMixin.remove}.
   *
   * Do not recursively walk the entire document tree by repeatedly reading `children` (for example, a manual DFS/BFS over `node.children`). That pattern is often much slower in large files.
   * Prefer {@link ChildrenMixin.findAllWithCriteria} when you know the target node types, and use {@link ChildrenMixin.findAll} when you need callback-based logic.
   *
   * Note: If you are curious, the reason why inserting children has to be done via API calls is because our internal representation for the layer tree uses [fractional indexing](https://www.figma.com/blog/multiplayer-editing-in-figma/) and {@link ChildrenMixin.insertChild} performs that conversion.
   */
  readonly children: ReadonlyArray<SceneNode>
  /**
   * Adds a new child to the end of the {@link ChildrenMixin.children} array. That is, visually on top of all other children.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @remarks
   *
   * Reparenting nodes is subject to many restrictions. For example, some nodes cannot be moved, others would break the document if moved. Below are possible exceptions that can be thrown if the operation is invalid.
   *
   * If this is called on an auto-layout frame, calling this function can cause this layer to be resized and children to be moved.
   */
  appendChild(child: SceneNode): void
  /**
   * Adds a new child at the specified index in the {@link ChildrenMixin.children} array.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param index - Determines where the new layer gets inserted. For example, suppose a group has layers A, B, C, where C is the top-most layer.
   * - `insertChild(0, D)` gives a group with layers **D**, A, B, C
   * - `insertChild(1, D)` gives a group with layers A, **D**, B, C
   * - `insertChild(2, D)` gives a group with layers A, B, **D**, C
   * - `insertChild(3, D)` gives a group with layers A, B, C, **D**
   * - `insertChild(4, D)` throws an error since the group originally only has 3 children
   *
   * @param child - The node to be inserted.
   *
   * @remarks
   *
   * Reparenting nodes is subject to many restrictions. For example, some nodes cannot be moved, others would break the document if moved. Below are possible exceptions that can be thrown if the operation is invalid.
   *
   * If this is called on an auto-layout frame, calling this function can cause this layer to be resized and children to be moved.
   */
  insertChild(index: number, child: SceneNode): void
  /**
   * Searches the immediate children of this node (i.e. not including the children's children). Returns all nodes for which `callback` returns true.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param callback - A function that evaluates whether to return the provided `node`. If this argument is omitted, `findChildren` returns `node.children`.
   *
   * @remarks
   *
   * Example: find all frames that are immediate child of the current page.
   * ```ts
   * const childFrames = figma.currentPage.findChildren(n => n.type === "FRAME")
   * ```
   */
  findChildren(callback?: (node: SceneNode) => boolean): SceneNode[]
  /**
   * Searches the immediate children of this node (i.e. not including the children's children). Returns the first node for which `callback` returns true.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param callback - A function that evaluates whether to return the provided `node`.
   *
   * @remarks
   *
   * This function returns `null` if no matching node is found.
   *
   * Example: find the first frame that is an immediate child of the current page.
   * ```ts
   * const firstChildFrame = figma.currentPage.findChild(n => n.type === "FRAME")
   * ```
   */
  findChild(callback: (node: SceneNode) => boolean): SceneNode | null
  /**
   * Searches this entire subtree (this node's children, its children's children, etc). Returns all nodes for which `callback` returns true.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param callback - A function that evaluates whether to return the provided `node`. If this argument is omitted, `findAll` returns all nodes in the subtree.
   *
   * @remarks
   *
   * Nodes are included in **back-to-front** order. Parents always appear before their children, and children appear in same relative order before their children, and children appear in same relative order as in the {@link ChildrenMixin.children} array.
   *
   * This traversal method is known as ["pre-order traversal"](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order_(NLR)).
   *
   * Note that the node this method is called on is **not included**.
   *
   * Example: find all nodes whose name is "Color":
   * ```ts
   * const colors = figma.currentPage.findAll(n => n.name === "Color")
   * ```
   *
   * Caution: ⚠ Large documents in Figma can have tens of thousands of nodes. Be careful using this function as it could be very slow.
   * If you only need to search immediate children, it is much faster to call `node.children.filter(callback)` or `node.findChildren(callback)`.
   * Please refer to our [recommendations](https://developers.figma.com/docs/plugins/accessing-document#full-document-traversal) for how to optimize document traversals.
   */
  findAll(callback?: (node: SceneNode) => boolean): SceneNode[]
  /**
   * Searches this entire subtree (this node's children, its children's children, etc). Returns the first node for which `callback` returns true.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param callback - A function that evaluates whether to return the provided `node`.
   *
   * @remarks
   * This function returns `null` if no matching node is found. The traversal order is the same as in {@link ChildrenMixin.findAll}.
   *
   * Note that the node this method is called on is **not included**.
   *
   * Example: find one node whose name is "Template":
   * ```ts
   * const template = figma.currentPage.findOne(n => n.name === "Template")
   * ```
   *
   * Caution: ⚠ Large documents in Figma can have tens of thousands of nodes. Be careful using this function as it could be very slow.
   * If you only need to search immediate children, it is much faster to call `node.children.find(callback)` or `node.findChild(callback)`.
   * Please refer to our [recommendations](https://developers.figma.com/docs/plugins/accessing-document#full-document-traversal) for how to optimize document traversals.
   */
  findOne(callback: (node: SceneNode) => boolean): SceneNode | null
  /**
   * Searches this entire subtree (this node's children, its children's children, etc). Returns all nodes that satisfy all of specified criteria.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param criteria - An object of type {@link FindAllCriteria} that specifies the search criteria. The following criterias are currently supported:
   * - Nodes with specific {@link NodeType | types}
   * - Nodes with {@link PluginDataMixin.getSharedPluginData | SharedPluginData } by their namespace and keys.
   * - Nodes with {@link PluginDataMixin.getPluginData | PluginData } by their keys.
   * - A combination of any of the above.
   *
   * @remarks
   *
   * This is a faster but more limited search compared to {@link ChildrenMixin.findAll}, which lets you search nodes based on any logic you can include in a callback.
   *
   * When paired with [`figma.skipInvisibleInstanceChildren = true`](https://developers.figma.com/docs/plugins/api/properties/figma-skipinvisibleinstancechildren), this method can be hundreds of times faster in large documents with tens of thousands of nodes.
   *
   * The return value is narrowly typed to match the provided `types`, which makes it much easier to use node-type-specific properties. For example, `node.findAllWithCriteria({ types: ['TEXT'] })` will return `TextNode[]` instead of the more generic `SceneNode[]` from {@link ChildrenMixin.findAll}.
   *
   * Nodes are included in **back-to-front** order, which is the same order as in {@link ChildrenMixin.findAll}. Parents always appear before their children, and children appear in same relative order before their children, and children appear in same relative order as in the {@link ChildrenMixin.children} array.
   *
   * This traversal method is known as ["pre-order traversal"](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order_(NLR)).
   *
   * Note: The node this method is called on is **not included**.
   *
   * ## Example Usages
   *
   * ### Find by node type
   * ```ts
   * // Find all component and component set nodes in the current
   * // page
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   types: ['COMPONENT', 'COMPONENT_SET']
   * })
   *
   * // Find all text nodes in the current page
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   types: ['TEXT']
   * })
   * ```
   *
   * ### Find by plugin data
   * ```ts
   * // Find all nodes in the current page with plugin data
   * // for the current plugin.
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   pluginData: {}
   * })
   *
   * // Find all nodes in the current page with plugin data
   * // for the current plugin with keys "a" or "b"
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   pluginData: {
   *     keys: ["a", "b"]
   *   }
   * })
   * ```
   *
   * ### Find by shared plugin data
   * ```ts
   * // Find all nodes in the current page with shared plugin data
   * // stored on the "bar" namespace
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   sharedPluginData: {
   *     namespace: "bar"
   *   }
   * })
   *
   * // Find all nodes in the current page with shared plugin data
   * // stored on the "bar" namespace and keys "a" or "b"
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   sharedPluginData: {
   *     namespace: "bar",
   *     keys: ["a", "b"]
   *   }
   * })
   * ```
   *
   * ### Combining criterias
   *
   * You can combine multiple criterias for further narrow your search.
   *
   * ```ts
   * // Find all text nodes in the current page with plugin data
   * // for the current plugin
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   types: ["TEXT"],
   *   pluginData: {}
   * })
   *
   * // Find all text nodes in the current page with shared plugin data
   * // stored on the "bar" namespace
   * const nodes = figma.currentPage.findAllWithCriteria({
   *   types: ["TEXT"],
   *   sharedPluginData: {
   *     namespace: "bar"
   *   }
   * })
   * ```
   */
  findAllWithCriteria<T extends NodeType[]>(
    criteria: FindAllCriteria<T>,
  ): Array<
    {
      type: T[number]
    } & SceneNode
  >
  /**
   * Searches this entire subtree (this node's children, its children's children, etc). Returns all widget nodes that match the provided `widgetId`.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param widgetId - The widget ID to search for, which represents unique identifier for the widget.
   *
   * @remarks
   *
   * `node.widgetId` is not to be confused with `node.id`, which is the unique identifier for the node on the canvas. In other words, if you clone a widget, the cloned widget will have a matching `widgetId` but a different `id`.
   */
  findWidgetNodesByWidgetId(widgetId: string): Array<WidgetNode>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface ConstraintMixin {
  /**
   * Constraints of this node relative to its containing {@link FrameNode}, if any.
   *
   * @remarks
   *
   * Not all node types have a constraint property. In particular, Group and BooleanOperation nodes do not have a constraint property themselves. Instead, resizing a frame applies the constraints on the children of those nodes.
   */
  constraints: Constraints
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface DimensionAndPositionMixin {
  /**
   * The position of the node. Identical to `relativeTransform[0][2]`.
   *
   * @remarks
   *
   * This value is automatically computed in children of auto-layout frames. Setting this property for these auto-layout children will no-op.
   */
  x: number
  /**
   * The position of the node. Identical to `relativeTransform[1][2]`.
   *
   * @remarks
   *
   * This value is automatically computed in children of auto-layout frames. Setting this property for these auto-layout children will no-op.
   */
  y: number
  /**
   * The width of the node. Use a resizing method to change this value.
   */
  readonly width: number
  /**
   * The height of the node. Use a resizing method to change this value.
   */
  readonly height: number
  /**
   * Applicable only to auto-layout frames and their direct children. Value must be positive. Set to `null` to remove `minWidth`.
   */
  minWidth: number | null
  /**
   * Applicable only to auto-layout frames and their direct children. Value must be positive. Set to `null` to remove `maxWidth`.
   */
  maxWidth: number | null
  /**
   * Applicable only to auto-layout frames and their direct children. Value must be positive. Set to null to remove `minHeight`.
   */
  minHeight: number | null
  /**
   * Applicable only to auto-layout frames and their direct children. Value must be positive. Set to `null` to remove `maxHeight`.
   */
  maxHeight: number | null
  /**
   * The position of a node relative to its **containing parent** as a {@link Transform} matrix. Not used for scaling, see `width` and `height` instead. Read the details page to understand the nuances of this property.
   *
   * @remarks
   *
   * ### Scale
   *
   * The `relativeTransform` is **not** used for scaling a node. The transform always has unit axes. That is, `sqrt(m00^2 + m10^2) == sqrt(m01^2 + m11^2) == 1`. In order to set the size of a node, use {@link LayoutMixin.resize} or {@link LayoutMixin.resizeWithoutConstraints}.
   *
   * Note: If you have a background in computer graphics, you may find it odd that we use the transform matrix in such a manner. This is because in 2D UI design, it's rare that you would want to scale the children when resizing a frame. And even if you did, it would be through more nuanced constraint settings that aren't captured by a transformation matrix.
   *
   * Also, if nodes had both a `width` and a separate `m00` scale property, it would be confusing to the users which one they're changing, especially during interactions like dragging.
   *
   * ### Container parent
   *
   * The relative transform of a node is shown relative to its container parent, which includes canvas nodes, frame nodes, component nodes, and instance nodes. Just like in the properties panel, it is **not** relative to its direct parent if the parent is a group or a boolean operation.
   *
   * Example 1: In the following hierarchy, the relative transform of `rectangle` is relative to `page` (which is just its position on the canvas).
   * ```text
   * page
   *   group
   *     rectangle
   * ```
   *
   * Example 2: In the following hierarchy, the relative transform of `rectangle` is relative to `frame`.
   * ```text
   * page
   *   frame
   *     boolean operation
   *       rectangle
   * ```
   *
   * One implication is that to calculate the absolute position of a node, you have to either use the {@link DimensionAndPositionMixin.absoluteTransform} property or multiply relative transform matrices while traversing up the node hierarchy while ignoring groups and boolean operations.
   *
   * Note: Why this complication? We do it this way because groups and boolean operations automatically resize to fit their children. While you _can_ set the relative transform of a group to move it, it's a property derived from the position and size of its children.
   * If the relative transform was always relative to it’s immediate parent, you could get into confusing situations where moving a layer inside a group by setting the relative transform changes the position of the parent, which then requires changing the relative transform of the child in order to preserve its on-screen position!
   *
   * ### Skew
   *
   * While it is possible to skew a layer by setting `m00`, `m01`, `m10`, `m11` to the right values, be aware that the skew will not be surfaced in the properties panel and may be confusing to the user dealing with a skewed node.
   *
   * ### Auto-layout frames
   *
   * The translation components `m02` and `m12` of the transform matrix is automatically computed in children of auto-layout frames. Setting `relativeTransform` on those layers will ignore the translation components, but do keep the rotation components.
   */
  relativeTransform: Transform
  /**
   * The position of a node relative to its **containing page** as a {@link Transform} matrix.
   */
  readonly absoluteTransform: Transform
  /**
   * The bounds of the node that does not include rendered properties like drop shadows or strokes. The `x` and `y` inside this property represent the absolute position of the node on the page.
   */
  readonly absoluteBoundingBox: Rect | null
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface LayoutMixin
  extends DimensionAndPositionMixin, AutoLayoutChildrenMixin, GridChildrenMixin {
  /**
   * The actual bounds of a node accounting for drop shadows, thick strokes, and anything else that may fall outside the node's regular bounding box defined in `x`, `y`, `width`, and `height`. The `x` and `y` inside this property represent the absolute position of the node on the page. This value will be `null` if the node is invisible.
   */
  readonly absoluteRenderBounds: Rect | null
  /**
   * The rotation of the node in degrees. Returns values from -180 to 180. Identical to `Math.atan2(-m10, m00)` in the {@link DimensionAndPositionMixin.relativeTransform} matrix. When setting `rotation`, it will also set `m00`, `m01`, `m10`, `m11`.
   *
   * @remarks
   *
   * The rotation is with respect to the top-left of the object. Therefore, it is independent from the position of the object. If you want to rotate with respect to the center (or any arbitrary point), you can do so via matrix transformations and {@link DimensionAndPositionMixin.relativeTransform}.
   */
  rotation: number
  /**
   * Applicable only on auto-layout frames, their children, and text nodes. This is a shorthand for setting {@link AutoLayoutChildrenMixin.layoutGrow}, {@link AutoLayoutChildrenMixin.layoutAlign}, {@link AutoLayoutMixin.primaryAxisSizingMode}, and {@link AutoLayoutMixin.counterAxisSizingMode}. This field maps directly to the "Horizontal sizing" dropdown in the Figma UI.
   *
   * @remarks
   *
   * `"HUG"` is only valid on auto-layout frames and text nodes. `"FILL"` is only valid on auto-layout children. Setting these values when they don't apply will throw an error.
   *
   * ```ts title="Setting layoutSizingHorizontal on an auto-layout frame"
   * const parentFrame = figma.createFrame()
   * const child2 = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(child2)
   * parentFrame.layoutMode = 'VERTICAL'
   * // Make the second child twice as wide as the first
   * child2.resize(200, 100)
   *
   * // Parent frame (child 2 is clipped)
   * // +-------------+
   * // |+-----------+|
   * // ||           ||
   * // ||  Child 1  ||
   * // ||           ||
   * // |+-----------+|
   * // |+------------|
   * // ||            |
   * // ||  Child 2   |
   * // ||            |
   * // |+------------|
   * // +-------------+
   *
   * parentFrame.layoutSizingHorizontal = 'FIXED'
   *
   * // Parent frame (child 2 is not clipped)
   * // +------------------------+
   * // |+-----------+           |
   * // ||           |           |
   * // ||  Child 1  |           |
   * // ||           |           |
   * // |+-----------+           |
   * // |+----------------------+|
   * // ||                      ||
   * // ||       Child 2        ||
   * // ||                      ||
   * // |+----------------------+|
   * // +------------------------+
   * parentFrame.layoutSizingHorizontal = 'HUG'
   * ```
   *
   * ```ts title="Setting layoutSizingHorizontal on an auto-layout child"
   * const parentFrame = figma.createFrame()
   * const child2 = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(child2)
   * parentFrame.layoutMode = 'HORIZONTAL'
   * parentFrame.resize(300, 100)
   *
   * // Parent frame
   * // +-------------------------------------+
   * // |+-----------++-----------+           |
   * // ||           ||           |           |
   * // ||  Child 1  ||  Child 2  |           |
   * // ||           ||           |           |
   * // |+-----------++-----------+           |
   * // +-------------------------------------+
   * child2.layoutSizingHorizontal = 'FIXED'
   *
   * // Parent frame
   * // +-------------------------------------+
   * // |+-----------++----------------------+|
   * // ||           ||                      ||
   * // ||  Child 1  ||       Child 2        ||
   * // ||           ||                      ||
   * // |+-----------++----------------------+|
   * // +-------------------------------------+
   * child2.layoutSizingHorizontal = 'FILL'
   * ```
   */
  layoutSizingHorizontal: 'FIXED' | 'HUG' | 'FILL'
  /**
   * Applicable only on auto-layout frames, their children, and text nodes. This is a shorthand for setting {@link AutoLayoutChildrenMixin.layoutGrow}, {@link AutoLayoutChildrenMixin.layoutAlign}, {@link AutoLayoutMixin.primaryAxisSizingMode}, and {@link AutoLayoutMixin.counterAxisSizingMode}. This field maps directly to the "Vertical sizing" dropdown in the Figma UI.
   *
   * @remarks
   *
   * `"HUG"` is only valid on auto-layout frames and text nodes. `"FILL"` is only valid on auto-layout children. Setting these values when they don't apply will throw an error.
   */
  layoutSizingVertical: 'FIXED' | 'HUG' | 'FILL'
  /**
   * Resizes the node. If the node contains children with constraints, it applies those constraints during resizing. If the parent has auto-layout, causes the parent to be resized.
   *
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01, except for {@link LineNode} which must always be given a height of exactly 0.
   *
   * @remarks
   *
   * Since this function applies constraints recursively (when there are multiple levels of nested frames with constraints), calls to this function could be expensive. Use {@link LayoutMixin.resizeWithoutConstraints} if you don't need to apply constraints.
   *
   * Caution: ⚠️ If this node is a text node with a missing font or contains a text node with a missing font, the text node will be resized but the text will not re-layout until the next time the text node is opened on a machine that _has_ the font. This can cause the text node to re-layout immediately and be surprising to your user. Consider checking if the document {@link PluginAPI.hasMissingFont} before using this function.
   *
   * Ignores `targetAspectRatio`. If `targetAspectRatio` has been set, it will be updated to correspond to the post-resize value.
   */
  resize(width: number, height: number): void
  /**
   * Resizes the node. Children of the node are never resized, even if those children have constraints. If the parent has auto-layout, causes the parent to be resized (this constraint cannot be ignored).
   *
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01, except for {@link LineNode} which must always be given a height of exactly 0.
   *
   * @remarks
   *
   * This function will not cause its children to resize. Use {@link LayoutMixin.resize} if you need to apply constraints.
   *
   * Caution: ⚠️ If this node is a text node with a missing font, the text node will be resized but the text will not re-layout until the next time the text node is opened on a machine that _has_ the font. This can cause the text node to re-layout immediately and be surprising to your user. Consider checking the text node property [`hasMissingFont`](https://developers.figma.com/docs/plugins/api/TextNode#hasmissingfont) before using this function.
   *
   * Ignores `targetAspectRatio`. If `targetAspectRatio` has been set, it will be updated to correspond to the post-resize value.
   */
  resizeWithoutConstraints(width: number, height: number): void
  /**
   * Rescales the node. This API function is the equivalent of using the Scale Tool from the toolbar.
   *
   * @param scale - The scale by which to resize the node from the top-left corner.
   *
   * @remarks
   *
   * The scale factor must be >= 0.01
   */
  rescale(scale: number): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface AspectRatioLockMixin {
  /**
   * When toggled, causes the layer to keep its proportions when the user resizes it via auto layout, constraints, the properties panel, or on-canvas.
   * If not set, the node does NOT resize toward a specific targetAspectRatio.
   *
   * @remarks
   *
   * Use `lockAspectRatio` and `unlockAspectRatio` to set targetAspectRatio.
   *
   * ```ts
   * const parentFrame = figma.createFrame()
   * const image = await figma.createNodeFromJSXAsync(
   *   <figma.widget.Image
   *     src="https://picsum.photos/200/300"
   *     width={200}
   *     height={300}
   *   />
   * )
   * parentFrame.appendChild(image)
   *
   * image.lockAspectRatio() // set to 2:3 ratio, implicit from the size
   *
   * // Add autolayout to parent, which defaults to Hug x Hug
   * parentFrame.layoutMode = 'HORIZONTAL'
   *
   * // Set child to fill-width
   * image.layoutGrow = 1
   *
   * // Resize parent to be much larger
   * parentFrame.resize(500, 1000)
   *
   * // Since the child is fill-width, it will expand to the available space
   * image.width == 500
   * image.height == 750
   * // Image maintains the 2:3 ratio even as it grew with auto layout!
   * ```
   *
   * Caution: ⚠️ `targetAspectRatio` cannot be used with auto-resizing text (TextNodes where textAutoResize !== NONE).
   */
  readonly targetAspectRatio: Vector | null
  /**
   * Locks the node's `targetAspectRatio` to the current ratio of its width and height.
   */
  lockAspectRatio(): void
  /**
   * Unlocks the node's `targetAspectRatio`.
   */
  unlockAspectRatio(): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface BlendMixin extends MinimalBlendMixin {
  /**
   * Whether this node is a mask. A mask node masks its subsequent siblings.
   *
   * @remarks
   *
   * Since a mask node masks all of its subsequent siblings, enabling `isMask` on a node that is not in a group-like container designed to stop mask propagation can have unintented consequences — that is, it may "mask" (often in practice, hide) more siblings than you intend. When enabling `isMask`, ensure you have contained its propagation propertly. ("Subsequent siblings" are siblings listed _after_ this node in a `children` array in the plugin API; this corresponds to layers shown _above_ this node in the layers panel.)
   *
   * Example:
   * ```ts
   * const rect = figma.createRectangle()
   * const circleToMask = figma.createEllipse()
   * const otherCircle1 = figma.createEllipse()
   * const otherCircle2 = figma.createEllipse()
   *
   * // In the layers panel, this would look something like:
   * // - otherCircle2
   * // - otherCircle1
   * // - circleToMask
   * // - rect
   * //
   * // So if I enable `rect.isMask`, the rect will mask ALL other nodes,
   * // because they are all siblings.
   * //
   * // If I only want `rect` to mask `circleToMask`, I should group
   * // them first.
   * figma.group([rect, circleToMask], figma.currentPage,
   *             figma.currentPage.children.indexOf(circleToMask))
   * rect.isMask = true
   *
   * // Now `rect` only masks its siblings above it in its group
   * // (`circleToMask`) but not the circles outside of the group.
   * // In the layers panel this would look like:
   * // - otherCircle2
   * // - otherCircle1
   * // - Group
   * //   - circleToMask [this is the only node masked by rect]
   * //   - rect (isMask)
   *
   * ```
   */
  isMask: boolean
  /**
   * Type of masking to use if this node is a mask. Defaults to `"ALPHA"`. You must check `isMask` to verify that this is a mask; changing `maskType` does not automatically turn on `isMask`, and a node that is not a mask can still have a `maskType`.
   */
  maskType: MaskType
  /**
   * Array of effects. See {@link Effect} type. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   */
  effects: ReadonlyArray<Effect>
  /**
   * The id of the {@link EffectStyle} object that the properties of this node are linked to.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setEffectStyleIdAsync` to update the style.
   */
  effectStyleId: string
  /**
   * Set the {@link EffectStyle} that the properties of this node are linked to.
   */
  setEffectStyleIdAsync(styleId: string): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface ContainerMixin {
  /**
   * Whether this container is shown as expanded in the layers panel.
   */
  expanded: boolean
}
declare type StrokeCap =
  | 'NONE'
  | 'ROUND'
  | 'SQUARE'
  | 'ARROW_LINES'
  | 'ARROW_EQUILATERAL'
  | 'DIAMOND_FILLED'
  | 'TRIANGLE_FILLED'
  | 'CIRCLE_FILLED'
declare type StrokeJoin = 'MITER' | 'BEVEL' | 'ROUND'
declare type HandleMirroring = 'NONE' | 'ANGLE' | 'ANGLE_AND_LENGTH'
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface AutoLayoutMixin {
  /**
   * Determines whether this layer uses auto-layout to position its children. Defaults to "NONE".
   *
   * @remarks
   *
   * Changing this property will cause the position of the children of this layer to change as a side-effect. It also causes the size of this layer to change, since at least one dimension of auto-layout frames is automatically calculated.
   *
   * As a consequence, note that if a frame has `layoutMode === "NONE"`, calling `layoutMode = "VERTICAL"; layoutMode = "NONE"` does not leave the document unchanged. Removing auto-layout from a frame does not restore the children to their original positions.
   *
   * This property must be set to `"HORIZONTAL"` or `"VERTICAL"` in order for the {@link AutoLayoutMixin.primaryAxisSizingMode}, {@link AutoLayoutMixin.counterAxisSizingMode}, {@link AutoLayoutMixin.layoutWrap}, {@link AutoLayoutMixin.primaryAxisAlignItems}, {@link AutoLayoutMixin.counterAxisAlignItems}, {@link AutoLayoutMixin.counterAxisAlignContent}, {@link AutoLayoutMixin.paddingTop}, {@link AutoLayoutMixin.paddingBottom}, {@link AutoLayoutMixin.paddingLeft}, {@link AutoLayoutMixin.paddingRight}, {@link AutoLayoutMixin.itemSpacing}, {@link AutoLayoutMixin.counterAxisSpacing}, {@link AutoLayoutMixin.itemReverseZIndex}, and {@link AutoLayoutMixin.strokesIncludedInLayout} properties to be applicable.
   *
   * Note: `GRID` is not supported for Slot frames, and setting `GRID` will throw a cannotApplyGridToSlot error.
   *
   * ```ts title="Auto-layout frame with horizontal layout"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   *
   * // Parent frame
   * // +--------------------------+
   * // |+-----------++-----------+|
   * // ||           ||           ||
   * // ||  Child 1  ||  Child 2  ||
   * // ||           ||           ||
   * // |+-----------++-----------+|
   * // +--------------------------+
   * parentFrame.layoutMode = 'HORIZONTAL'
   * ```
   *
   * ```ts title="Auto-layout frame with vertical layout"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   *
   * // Parent frame
   * // +-------------+
   * // |+-----------+|
   * // ||           ||
   * // ||  Child 1  ||
   * // ||           ||
   * // |+-----------+|
   * // |+-----------+|
   * // ||           ||
   * // ||  Child 2  ||
   * // ||           ||
   * // |+-----------+|
   * // +-------------+
   * parentFrame.layoutMode = 'VERTICAL'
   */
  layoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'
  /**
   * Applicable only on auto-layout frames. Determines the left padding between the border of the frame and its children.
   */
  paddingLeft: number
  /**
   * Applicable only on auto-layout frames. Determines the right padding between the border of the frame and its children.
   */
  paddingRight: number
  /**
   * Applicable only on auto-layout frames. Determines the top padding between the border of the frame and its children.
   */
  paddingTop: number
  /**
   * Applicable only on auto-layout frames. Determines the bottom padding between the border of the frame and its children.
   */
  paddingBottom: number
  /**
   * Applicable only on auto-layout frames. Determines whether the primary axis has a fixed length (determined by the user) or an automatic length (determined by the layout engine).
   *
   * @remarks
   *
   * Auto-layout frames have a **primary axis**, which is the axis that resizes when you add new items into the frame. For example, frames with "VERTICAL" {@link AutoLayoutMixin.layoutMode} resize in the y-axis.
   *
   * - `"FIXED"`: The primary axis length is determined by the user or plugins, unless the {@link AutoLayoutChildrenMixin.layoutAlign} is set to “STRETCH” or {@link AutoLayoutChildrenMixin.layoutGrow} is 1.
   * - `"AUTO"`: The primary axis length is determined by the size of the children. If set, the auto-layout frame will automatically resize along the counter axis to fit its children.
   *
   * Note: `“AUTO”` should not be used in any axes where {@link AutoLayoutChildrenMixin.layoutAlign} = “STRETCH” or {@link AutoLayoutChildrenMixin.layoutGrow} = 1. Either use `“FIXED”` or disable {@link AutoLayoutChildrenMixin.layoutAlign}/{@link AutoLayoutChildrenMixin.layoutGrow}.
   */
  primaryAxisSizingMode: 'FIXED' | 'AUTO'
  /**
   * Applicable only on auto-layout frames. Determines whether the counter axis has a fixed length (determined by the user) or an automatic length (determined by the layout engine).
   *
   * @remarks
   *
   * Auto-layout frames have a **primary axis**, which is the axis that resizes when you add new items into the frame. For example, frames with "VERTICAL" {@link AutoLayoutMixin.layoutMode} resize in the y-axis.
   *
   * The other axis is called the **counter axis**.
   * - `"FIXED"`: The counter axis length is determined by the user or plugins, unless the {@link AutoLayoutChildrenMixin.layoutAlign} is set to “STRETCH” or {@link AutoLayoutChildrenMixin.layoutGrow} is 1.
   * - `"AUTO"`: The counter axis length is determined by the size of the children. If set, the auto-layout frame will automatically resize along the counter axis to fit its children.
   *
   * Note: `“AUTO”` cannot be used in any axes where {@link AutoLayoutChildrenMixin.layoutAlign} = “STRETCH” or {@link AutoLayoutChildrenMixin.layoutGrow} = 1. Either use `“FIXED”` or disable {@link AutoLayoutChildrenMixin.layoutAlign}/{@link AutoLayoutChildrenMixin.layoutGrow}.
   *
   * ```ts title="Horizontal auto-layout frame with different counterAxisSizingMode values"
   * const parentFrame = figma.createFrame()
   * const child2 = figma.createFrame()
   * // Make the second child 200px high instead of the default 100px
   * child2.resize(100, 200)
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(child2)
   * parentFrame.layoutMode = 'HORIZONTAL'
   *
   * // Parent frame
   * // +--------------------------+
   * // |+-----------++-----------+|
   * // ||           ||           ||
   * // ||  Child 1  ||  Child 2  ||
   * // ||           ||           ||
   * // |+-----------+|           ||
   * // +--------------------------+
   * parentFrame.counterAxisSizingMode = 'FIXED' // Child 2 is clipped
   *
   * // Parent frame
   * // +--------------------------+
   * // |+-----------++-----------+|
   * // ||           ||           ||
   * // ||  Child 1  ||  Child 2  ||
   * // ||           ||           ||
   * // |+-----------+|           ||
   * // |             |           ||
   * // |             |           ||
   * // |             +-----------+|
   * // +--------------------------+
   * parentFrame.counterAxisSizingMode = 'AUTO'
   * ```
   */
  counterAxisSizingMode: 'FIXED' | 'AUTO'
  /**
   * Applicable only on auto-layout frames. Determines whether strokes are included in [layout calculations](https://help.figma.com/hc/en-us/articles/31289464393751-Use-the-horizontal-and-vertical-flows-in-auto-layout#01JT9NA4HVT02ZPE7BA86SFCD6). When true, auto-layout frames behave like css `box-sizing: border-box`.
   *
   * @remarks
   *
   * ```ts title="Auto-layout frame with strokes included in layout"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.layoutMode = 'HORIZONTAL'
   * // Let the height of the parent frame resize to fit the children
   * parentFrame.counterAxisSizingMode = 'AUTO'
   *
   * // Thick stroke around parent frame to illustrate layout differences
   * parentFrame.strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }}]
   * parentFrame.strokeWeight = 10
   *
   * // Parent frame (strokes overlap with children)
   * // +--------------------------+
   * // |+-----------++-----------+|
   * // ||           ||           ||
   * // ||  Child 1  ||  Child 2  ||
   * // ||           ||           ||
   * // |+-----------++-----------+|
   * // +--------------------------+
   * parentFrame.strokesIncludedInLayout = false
   *
   * // Parent frame (strokes do not overlap with children)
   * // +--------------------------------+
   * // |                                |
   * // |   +-----------++-----------+   |
   * // |   |           ||           |   |
   * // |   |  Child 1  ||  Child 2  |   |
   * // |   |           ||           |   |
   * // |   +-----------++-----------+   |
   * // |                                |
   * // +--------------------------------+
   * parentFrame.strokesIncludedInLayout = true
   * ```
   */
  strokesIncludedInLayout: boolean
  /**
   * Determines whether this layer should use wrapping auto-layout. Defaults to `"NO_WRAP"`.
   *
   * @remarks
   *
   * This property can only be set on layers with `layoutMode === "HORIZONTAL"`. Setting it on layers without this property will throw an Error.
   *
   * This property must be set to `"WRAP"` in order for the {@link AutoLayoutMixin.counterAxisSpacing} and {@link AutoLayoutMixin.counterAxisAlignContent} properties to be applicable.
   */
  layoutWrap: 'NO_WRAP' | 'WRAP'
  /**
   * Applicable only on "HORIZONTAL" or "VERTICAL" auto-layout frames. Determines how the auto-layout frame’s children should be aligned in the primary axis direction.
   *
   * @remarks
   *
   * Changing this property will cause all the children to update their `x` and `y` values.
   *
   * - In horizontal auto-layout frames, `“MIN”` and `“MAX”` correspond to left and right respectively.
   * - In vertical auto-layout frames, `“MIN”` and `“MAX”` correspond to top and bottom respectively.
   * - `“SPACE_BETWEEN”` will space the children evenly along the primary axis, only putting the extra space between the children. The first and last child are flush with the edges of the frame.
   * - `“SPACE_EVENLY”` will space the children evenly along the primary axis, dividing the extra space equally in the spaces before the first child, between each pair of items, and after the last child.
   * - `“SPACE_AROUND”` will space the children evenly along the primary axis such that the spacing between each pair of items is equal, and the empty space before the first and after the last child is equal to half the space between items.
   *
   * The corresponding property for the counter axis direction is {@link AutoLayoutMixin.counterAxisAlignItems}.
   *
   * ```ts title="Horizontal auto-layout frame with different primaryAxisAlignItems values"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.layoutMode = 'HORIZONTAL'
   *
   * // Make the parent frame wider so we can see the effects of
   * // the different primaryAxisAlignItems values
   * parentFrame.resize(300, 100)
   *
   * // Parent frame
   * // +--------------------------------------+
   * // |+-----------++-----------+            |
   * // ||           ||           |            |
   * // ||  Child 1  ||  Child 2  |            |
   * // ||           ||           |            |
   * // |+-----------++-----------+            |
   * // +--------------------------------------+
   * parentFrame.primaryAxisAlignItems = 'MIN'
   *
   * // Parent frame
   * // +--------------------------------------+
   * // |            +-----------++-----------+|
   * // |            |           ||           ||
   * // |            |  Child 1  ||  Child 2  ||
   * // |            |           ||           ||
   * // |            +-----------++-----------+|
   * // +--------------------------------------+
   * parentFrame.primaryAxisAlignItems = 'MAX'
   *
   * // Parent frame
   * // +--------------------------------------+
   * // |      +-----------++-----------+      |
   * // |      |           ||           |      |
   * // |      |  Child 1  ||  Child 2  |      |
   * // |      |           ||           |      |
   * // |      +-----------++-----------+      |
   * // +--------------------------------------+
   * parentFrame.primaryAxisAlignItems = 'CENTER'
   *
   * // Parent frame
   * // +--------------------------------------+
   * // |+-----------+            +-----------+|
   * // ||           |            |           ||
   * // ||  Child 1  |            |  Child 2  ||
   * // ||           |            |           ||
   * // |+-----------+            +-----------+|
   * // +--------------------------------------+
   * parentFrame.primaryAxisAlignItems = 'SPACE_BETWEEN'
   *
   * // Parent frame
   * // +--------------------------------------+
   * // |    +-----------+    +-----------+    |
   * // |    |           |    |           |    |
   * // |----|  Child 1  |----|  Child 2  |----|
   * // |    |           |    |           |    |
   * // |    +-----------+    +-----------+    |
   * // +--------------------------------------+
   * parentFrame.primaryAxisAlignItems = 'SPACE_EVENLY'
   *
   * // Parent frame
   * // +--------------------------------------+
   * // |   +-----------+      +-----------+   |
   * // |   |           |      |           |   |
   * // |---|  Child 1  |------|  Child 2  |---|
   * // |   |           |      |           |   |
   * // |   +-----------+      +-----------+   |
   * // +--------------------------------------+
   * parentFrame.primaryAxisAlignItems = 'SPACE_AROUND'
   * ```
   */
  primaryAxisAlignItems:
    'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN' | 'SPACE_EVENLY' | 'SPACE_AROUND'
  /**
   * Applicable only on "HORIZONTAL" or "VERTICAL" auto-layout frames. Determines how the auto-layout frame’s children should be aligned in the counter axis direction.
   *
   * @remarks
   *
   * Changing this property will cause all the children to update their `x` and `y` values.
   *
   * - In horizontal auto-layout frames, `“MIN”` and `“MAX”` correspond to top and bottom respectively.
   * - In vertical auto-layout frames, `“MIN”` and `“MAX”` correspond to left and right respectively.
   * - `"BASELINE"` can only be set on horizontal auto-layout frames, and aligns all children along the [text baseline](https://help.figma.com/hc/en-us/articles/360040451373-Explore-auto-layout-properties#Text_baseline_alignment).
   *
   * The corresponding property for the primary axis direction is {@link AutoLayoutMixin.primaryAxisAlignItems}.
   *
   * ```ts title="Horizontal auto-layout frame with different counterAxisAlignItems values"
   * (async () => {
   *   const parentFrame = figma.createFrame()
   *   const text = figma.createText()
   *   await figma.loadFontAsync(text.fontName)
   *   text.characters = 'asdf'
   *   // Make the text taller so we can see how text baseline alignment works
   *   text.lineHeight = {unit: 'PERCENT', value: 300}
   *
   *   // Auto-layout frame will have 2 children: a frame and a text node
   *   parentFrame.appendChild(figma.createFrame())
   *   parentFrame.appendChild(text)
   *   parentFrame.layoutMode = 'HORIZONTAL'
   *
   *   // Make the parent frame taller so we can see the effects of
   *   // the different counterAxisAlignItems values
   *   parentFrame.resize(200, 150)
   *
   *   // Parent frame
   *   // +--------------------------+
   *   // |+-----------++----+       |
   *   // ||           ||    |       |
   *   // ||  Child 1  ||asdf|       |
   *   // ||           ||    |       |
   *   // |+-----------++----+       |
   *   // |                          |
   *   // |                          |
   *   // +--------------------------+
   *   parentFrame.counterAxisAlignItems = 'MIN'
   *
   *   // Parent frame
   *   // +--------------------------+
   *   // |                          |
   *   // |                          |
   *   // |+-----------++----+       |
   *   // ||           ||    |       |
   *   // ||  Child 1  ||asdf|       |
   *   // ||           ||    |       |
   *   // |+-----------++----+       |
   *   // +--------------------------+
   *   parentFrame.counterAxisAlignItems = 'MAX'
   *
   *   // Parent frame
   *   // +--------------------------+
   *   // |                          |
   *   // |+-----------++----+       |
   *   // ||           ||    |       |
   *   // ||  Child 1  ||asdf|       |
   *   // ||           ||    |       |
   *   // |+-----------++----+       |
   *   // |                          |
   *   // +--------------------------+
   *   parentFrame.counterAxisAlignItems = 'CENTER'
   *
   *   // Parent frame
   *   // +--------------------------+
   *   // |+-----------+             |
   *   // ||           |+----+       |
   *   // ||  Child 1  ||    |       |
   *   // ||           ||asdf|       |
   *   // |+-----------+|    |       |
   *   // |             +----+       |
   *   // |                          |
   *   // +--------------------------+
   *   parentFrame.counterAxisAlignItems = 'BASELINE'
   * })()
   * ```
   */
  counterAxisAlignItems: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE'
  /**
   * Applicable only on auto-layout frames with {@link AutoLayoutMixin.layoutWrap} set to `"WRAP"`. Determines how the wrapped tracks are spaced out inside of the auto-layout frame.
   *
   * @remarks
   *
   * Changing this property on a non-wrapping auto-layout frame will throw an error.
   *
   * - `"AUTO"`: If all children of this auto-layout frame have {@link AutoLayoutChildrenMixin.layoutAlign} set to `"STRETCH"`, the tracks will stretch to fill the auto-layout frame. This is like flexbox `align-content: stretch`. Otherwise, each track will be as tall as the tallest child of the track, and will align based on the value of {@link AutoLayoutMixin.counterAxisAlignItems}. This is like flexbox `align-content: start | center | end`. {@link AutoLayoutMixin.counterAxisSpacing} is respected when `counterAxisAlignContent` is set to `"AUTO"`.
   * - `"SPACE_BETWEEN"`: Tracks are all sized based on the tallest child in the track. The free space within the auto-layout frame is divided up evenly between each track. If the total height of all tracks is taller than the height of the auto-layout frame, the spacing will be 0.
   */
  counterAxisAlignContent: 'AUTO' | 'SPACE_BETWEEN'
  /**
   * Applicable only on "HORIZONTAL" or "VERTICAL" auto-layout frames. Determines distance between children of the frame.
   *
   * @remarks
   *
   * For auto-layout frames with {@link AutoLayoutMixin.layoutMode} set to `"HORIZONTAL"`, this is the horizontal gap between children. For auto-layout frames with {@link AutoLayoutMixin.layoutMode} set to `"VERTICAL"`, this is the vertical gap between children.
   *
   * ```ts title="Auto-layout frame with a horizontal gap between children"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.layoutMode = 'HORIZONTAL'
   *
   * // Parent frame
   * // +------------------------------------+
   * // |+-----------+          +-----------+|
   * // ||           |          |           ||
   * // ||  Child 1  | -- 20 -- |  Child 2  ||
   * // ||           |          |           ||
   * // |+-----------+          +-----------+|
   * // +------------------------------------+
   * parentFrame.itemSpacing = 20
   * ```
   *
   * ```ts title="Auto-layout frame with a vertical gap between children"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.layoutMode = 'VERTICAL'
   *
   * // Parent frame
   * // +-------------+
   * // |+-----------+|
   * // ||           ||
   * // ||  Child 1  ||
   * // ||           ||
   * // |+-----------+|
   * // |      |      |
   * // |      |      |
   * // |      20     |
   * // |      |      |
   * // |      |      |
   * // |+-----------+|
   * // ||           ||
   * // ||  Child 2  ||
   * // ||           ||
   * // |+-----------+|
   * // +-------------+
   * parentFrame.itemSpacing = 20
   * ```
   */
  itemSpacing: number
  /**
   * Applicable only on "HORIZONTAL" or "VERTICAL" auto-layout frames with {@link AutoLayoutMixin.layoutWrap} set to `"WRAP"`. Determines the distance between wrapped tracks. The value must be positive.
   *
   * @remarks
   *
   * Set this propety to `null` to have it sync with {@link AutoLayoutMixin.itemSpacing}. This will never return `null`. Once set to `null`, it will start returning the value of {@link AutoLayoutMixin.itemSpacing}.
   *
   * ```ts title="Auto-layout frame with children wrapping to the next line"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   * parentFrame.appendChild(figma.createFrame())
   *
   * // Make children flow horizontally and wrap
   * parentFrame.layoutMode = 'HORIZONTAL'
   * parentFrame.layoutWrap = 'WRAP'
   *
   * // Set a fixed width so when we set itemSpacing below, the children will wrap
   * parentFrame.primaryAxisSizingMode = 'FIXED'
   *
   * // Let the height of the parent frame resize to fit the children
   * parentFrame.counterAxisSizingMode = 'AUTO'
   *
   * // Horizontal gap between children
   * parentFrame.itemSpacing = 10
   *
   * // Parent frame
   * // +------------------------------------------+
   * // |+-----------+          +-----------+      |
   * // ||           |          |           |      |
   * // ||  Child 1  | -- 10 -- |  Child 2  |      |
   * // ||           |          |           |      |
   * // |+-----------+          +-----------+      |
   * // |      |                                   |
   * // |      |                                   |
   * // |      20                                  |
   * // |      |                                   |
   * // |      |                                   |
   * // |+-----------+                             |
   * // ||           |                             |
   * // ||  Child 3  |                             |
   * // ||           |                             |
   * // |+-----------+                             |
   * // +------------------------------------------+
   * parentFrame.counterAxisSpacing = 20
   * ```
   */
  counterAxisSpacing: number | null
  /**
   * Applicable only on "HORIZONTAL" or "VERTICAL" auto-layout frames. Determines the [canvas stacking order](https://help.figma.com/hc/en-us/articles/360040451373-Explore-auto-layout-properties#Canvas_stacking_order) of layers in this frame. When true, the first layer will be draw on top.
   *
   * @remarks
   *
   * ```ts title="Auto-layout frame with different canvas stacking"
   * const parentFrame = figma.createFrame()
   * // Create red and green children so we can see the overlap
   * const child1 = figma.createFrame()
   * child1.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }}]
   * const child2 = figma.createFrame()
   * child2.fills = [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 }}]
   * parentFrame.appendChild(child1)
   * parentFrame.appendChild(child2)
   * parentFrame.layoutMode = 'HORIZONTAL'
   * // Negative horizontal gap between children so they overlap
   * parentFrame.itemSpacing = -20
   *
   * // Parent frame (last child on top)
   * // +---------------------+
   * // |+-------+-----------+|
   * // ||       |           ||
   * // ||Child 1|  Child 2  ||
   * // ||       |           ||
   * // |+-------+-----------+|
   * // +---------------------+
   * parentFrame.itemReverseZIndex = false
   *
   * // Parent frame (first child on top)
   * // +---------------------+
   * // |+-----------+-------+|
   * // ||           |       ||
   * // ||  Child 1  |Child 2||
   * // ||           |       ||
   * // |+-----------+-------+|
   * // +---------------------+
   * parentFrame.itemReverseZIndex = true
   * ```
   */
  itemReverseZIndex: boolean
}
/**
 * @see https://developers.figma.com/docs/plugins/api/GridTrackSize
 */
interface GridTrackSize {
  /**
   * Applicable only on FIXED or FLEX grid tracks. In FIXED tracks, the size of the track in pixels. In FLEX tracks, the fractional unit value (equivalent to the [`fr` unit](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout#the_fr_unit) in CSS)
   * Optional for `FLEX` tracks.
   */
  value?: number
  /**
   * The type of the grid track. `FLEX` indicates that the track behaves like the CSS grid [`fr` unit](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout#the_fr_unit).
   * `FIXED` indicates that the track will have a fixed pixel size.
   * `HUG` indicates that the track will size to fit its content, equivalent to a CSS setting of `fit-content(100%)`.
   * It is not a valid state for 'FLEX' tracks to be set on a grid when the container is set to layoutSizingHorizonal/layoutSizingVertical 'HUG'
   **/
  type: 'FLEX' | 'FIXED' | 'HUG'
}
/**
 * Options for {@link GridLayoutMixin.reorderRows} and {@link GridLayoutMixin.reorderColumns}.
 * @see https://developers.figma.com/docs/plugins/api/GridTrackReorderOptions
 */
interface GridTrackReorderOptions {
  /**
   * The indices of the rows or columns (tracks) to move. Does not need to be sorted, contiguous, or deduplicated.
   * All indices must be within bounds for the current number of rows or columns.
   */
  fromIndices: ReadonlyArray<number>
  /**
   * The index to insert the selected rows or columns (tracks) at. This is evaluated against the original
   * row/column order (before the move).
   *
   * As an example, take a grid with 4 columns and 2 rows.
   * fromIndices could be 0 to 3 (inclusive), and insertionIndex could be 0 to 4 (inclusive).
   *
   * ```
   *   0         1         2         3         4 ← possible insertion indices
   * ---- 0 --- --- 1 --- --- 2 --- --- 3 ----   ← track indices
   * +-------------------+---------+---------+
   * |                   |         |         |
   * |                   |         |         |
   * +---------+---------+---------+---------+
   * |         |         |         |         |
   * |         |         |         |         |
   * +---------+---------+---------+---------+
   * ```
   */
  insertionIndex: number
}
/**
 * Describes a single row or column (track)'s movement for a call to {@link GridLayoutMixin.reorderRows}
 *
 * @see https://developers.figma.com/docs/plugins/api/GridTrackReorderEntry
 */
interface GridTrackReorderEntry {
  /** The original index of the track before the reorder. */
  from: number
  /** The new index of the track after the reorder. */
  to: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface GridLayoutMixin {
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`. Determines the number of rows in the grid.
   *
   * @remarks
   *
   * If the setter for this value is called on a grid with a value less than 1, it will throw an error.
   * Users cannot remove rows from a grid if they are occupied by children, so if you try to reduce the count of rows in a grid and some of those rows have children, it will throw an error.
   * By default, when the row count is increased, the new rows will be added as {@link GridTrackSize} objects with type `"FLEX"`. If you want to change the type of the new rows, you can use the setters on GridTrackSize objects returned by {@link GridLayoutMixin.gridRowSizes} or {@link GridLayoutMixin.gridColumnSizes}.
   *
   * Caution: ⚠️ Setting `gridRowCount` will throw an error if {@link GridLayoutMixin.gridAutoTracks} is set to `"ROWS"`, since the row count is managed automatically.
   * Add or remove children to change the number of rows instead, or set `gridAutoTracks` to `NONE` before setting `gridRowCount`.
   *
   * ```ts title="Grid layout with 2 rows and 3 columns"
   * const parentFrame = figma.createFrame()
   * parentFrame.layoutMode = 'GRID'
   * parentFrame.gridRowCount = 2
   * parentFrame.gridColumnCount = 3
   *
   * // Grid frame with 2 rows and 3 columns
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   * ```
   */
  gridRowCount: number
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`. Determines the number of columns in the grid.
   * @remarks
   * If the setter for this value is called on a grid with a value less than 1, it will throw an error.
   * Users cannot remove columns from a grid if they are occupied by children, so if you try to reduce the count of columns in a grid and some of those columns have children, it will throw an error.
   * By default, when the column count is increased, the new columns will be added as {@link GridTrackSize} objects with type `"FLEX"`. If you want to change the type of the new columns, you can use the setters on GridTrackSize objects returned by {@link GridLayoutMixin.gridRowSizes} or {@link GridLayoutMixin.gridColumnSizes}.
   */
  gridColumnCount: number
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`. Determines the gap between rows in the grid.
   * @remarks
   * If the setter for this value is called on a grid with a value less than 0, it will throw an error.
   */
  gridRowGap: number
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`. Determines the gap between columns in the grid.
   * @remarks
   * If the setter for this value is called on a grid with a value less than 0, it will throw an error.
   */
  gridColumnGap: number
  /**
   * Only applicable on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Returns an array of {@link GridTrackSize} objects representing the rows in the grid in order.
   *
   * @remarks
   * The order of the rows is from top to bottom.
   * The {@link GridTrackSize} can be used to change the type of the row (either `"FLEX"` or `"FIXED"`) and the size of the track (if it is a `"FIXED"` track).
   *
   * ```ts title="Grid layout with mixed track sizes and types"
   * const parentFrame = figma.createFrame()
   * parentFrame.layoutMode = 'GRID'
   * parentFrame.gridRowCount = 2
   * parentFrame.gridColumnCount = 3
   *
   * // Change the first row to be a fixed size of 100px
   * parentFrame.gridRowSizes[0].type // 'FLEX'
   * parentFrame.gridRowSizes[0].type = 'FIXED'
   * parentFrame.gridRowSizes[0].value = 100
   * parentFrame.gridRowSizes[0].type // 'FIXED'
   * // Grid with one fixed row and one flexible rows
   * // + --- + --- + --- +
   * // |     |     |     | 100px height
   * // + --- + --- + --- +
   * // |     |     |     |
   * // |     |     |     | 'flex' height
   * // |     |     |     |  occupies remaining height in the container, because there is only one flex row.
   * // |     |     |     |
   * // + --- + --- + --- +
   * ```
   */
  gridRowSizes: Array<GridTrackSize>
  /**
   * Only applicable on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Returns an array of {@link GridTrackSize} objects representing the columns in the grid in order.
   * @remarks
   * The order of the columns is from left to right.
   * The {@link GridTrackSize} can be used to change the type of the column (either `"FLEX"` or `"FIXED"`) and the size of the track (if it is a `"FIXED"` track).
   */
  gridColumnSizes: Array<GridTrackSize>
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Appends a node to the grid at the specified row and column index.
   * @remarks
   * If the specified row or column index is out of bounds, it will throw an error.
   * If the specified row or column index is occupied by another node, it will throw an error.
   * If the node is already a child of the grid, it will be removed from its current position and appended to the new position.
   * ```ts title="Appending a node to a grid at a specific row and column index"
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   * const grid = figma.createFrame()
   * grid.layoutMode = 'GRID'
   * grid.gridRowCount = 3
   * grid.gridColumnCount = 3
   *
   * const child1 = figma.createFrame()
   * const child2 = figma.createFrame()
   * const child2 = figma.createFrame()
   *
   * // + --- + --- + --- +
   * // |  1  |     |     |
   * // + --- + --- + --- +
   * // |  2  |     |     |
   * // + --- + --- + --- +
   * // |  3  |     |     |
   * // + --- + --- + --- +
   * grid.appendChildAt(child1, 0, 0)
   * grid.appendChildAt(child2, 1, 0)
   * grid.appendChildAt(child3, 2, 0)
   * ```
   */
  appendChildAt(node: SceneNode, rowIndex: number, columnIndex: number): void
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Controls how the grid handles automatic row creation.
   *
   * @remarks
   * - `"NONE"` (default): the row count is controlled by {@link GridLayoutMixin.gridRowCount},
   *   but will never go below the number of rows necessary to hold all children in the grid.
   * - `"ROWS"`: new rows are added automatically as children are appended, and removed when
   *   a row becomes empty. Setting {@link GridLayoutMixin.gridRowCount} directly will throw
   *   an error while this is set to `"ROWS"`.
   *
   * ```ts title="Grid with automatic rows"
   * const grid = figma.createFrame()
   * grid.layoutMode = 'GRID'
   * grid.gridColumnCount = 3
   * grid.gridAutoTracks = 'ROWS'
   *
   * // The grid starts with 1 row and 3 columns.
   * // Appending more children than the grid can fit
   * // automatically adds new rows.
   * for (let i = 0; i < 7; i++) {
   *   grid.appendChild(figma.createFrame())
   * }
   * // + --- + --- + --- +
   * // |  1  |  2  |  3  |
   * // + --- + --- + --- +
   * // |  4  |  5  |  6  |
   * // + --- + --- + --- +
   * // |  7  |     |     |
   * // + --- + --- + --- +
   * grid.gridRowCount // 3 (auto-managed)
   * ```
   */
  gridAutoTracks: 'NONE' | 'ROWS'
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Controls how children are positioned within the grid.
   *
   * @remarks
   * - `"MANUAL"` (default): children stay at the grid cell they are placed in. Use
   *   {@link GridChildrenMixin.setGridChildPosition} or {@link GridLayoutMixin.appendChildAt}
   *   to position children explicitly.
   * - `"ROW_AUTO_FLOW"`: children are placed by layer order into the next available cell in
   *   row-major order (left to right, top to bottom), similar to CSS
   *   [`grid-auto-flow: row`](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-auto-flow).
   *   Calling {@link GridChildrenMixin.setGridChildPosition} will throw an error in this mode —
   *   reorder children using {@link ChildrenMixin.insertChild} instead.
   *
   * ```ts title="Grid with automatic item positioning"
   * const grid = figma.createFrame()
   * grid.layoutMode = 'GRID'
   * grid.gridColumnCount = 2
   * grid.gridAutoTracks = 'ROWS'
   * grid.gridItemsPositioning = 'ROW_AUTO_FLOW'
   *
   * const a = figma.createFrame()
   * const b = figma.createFrame()
   * const c = figma.createFrame()
   * grid.appendChild(a)
   * grid.appendChild(b)
   * grid.appendChild(c)
   *
   * // Children flow automatically:
   * // + --- + --- +
   * // |  a  |  b  |
   * // + --- + --- +
   * // |  c  |     |
   * // + --- + --- +
   * ```
   */
  gridItemsPositioning: 'MANUAL' | 'ROW_AUTO_FLOW'
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Moves one or more rows to a new position in the grid, shifting other rows as needed.
   *
   * @remarks
   * If a child in one of the selected rows spans multiple rows, all of those spanned rows
   * are automatically included in the move. The returned array describes both the input tracks and any
   * tracks that were added implicitly due to spanning.
   *
   * All values in `fromIndices` must be in the range `[0, gridRowCount)` and `insertionIndex`
   * must be in the range `[0, gridRowCount]`, otherwise an error will be thrown. If an error
   * is thrown, the grid is left unchanged.
   *
   * ```ts title="Moving the first row to the end of the grid"
   * const grid = figma.createFrame()
   * grid.layoutMode = 'GRID'
   * grid.gridRowCount = 3
   * grid.gridColumnCount = 2
   *
   * // Populate the grid
   * for (let i = 0; i < 6; i++) {
   *   grid.appendChild(figma.createFrame())
   * }
   * // Before:
   * // + --- + --- +
   * // |  1  |  2  |  <- row 0
   * // + --- + --- +
   * // |  3  |  4  |  <- row 1
   * // + --- + --- +
   * // |  5  |  6  |  <- row 2
   * // + --- + --- +
   *
   * const moves = grid.reorderRows({ fromIndices: [0], insertionIndex: 3 })
   * // After:
   * // + --- + --- +
   * // |  3  |  4  |
   * // + --- + --- +
   * // |  5  |  6  |
   * // + --- + --- +
   * // |  1  |  2  |
   * // + --- + --- +
   * // moves => [{ from: 0, to: 2 }, { from: 1, to: 0 }, { from: 2, to: 1 }]
   * ```
   */
  reorderRows(options: GridTrackReorderOptions): ReadonlyArray<GridTrackReorderEntry>
  /**
   * Applicable only on auto-layout frames with `layoutMode` set to `"GRID"`.
   * Moves one or more columns to a new position in the grid, shifting other columns as needed.
   *
   * @remarks
   * If a child in one of the selected columns spans multiple columns, all of those spanned columns
   * are automatically included in the move.  The returned array describes both the input tracks and
   * any tracks that were added implicitly due to spanning.
   *
   * All values in `fromIndices` must be in the range `[0, gridColumnCount)` and `insertionIndex`
   * must be in the range `[0, gridColumnCount]`, otherwise an error will be thrown. If an error
   * is thrown, the grid is left unchanged.
   */
  reorderColumns(options: GridTrackReorderOptions): ReadonlyArray<GridTrackReorderEntry>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface AutoLayoutChildrenMixin {
  /**
   * Applicable only on direct children of auto-layout frames. Determines if the layer should stretch along the parent’s counter axis. Defaults to `“INHERIT”`.
   *
   * @remarks
   *
   * Changing this property will cause the `x`, `y`, `size`, and `relativeTransform` properties on this node to change, if applicable (inside an auto-layout frame).
   *
   * - Setting `"STRETCH"` will make the node "stretch" to fill the width of the parent vertical auto-layout frame, or the height of the parent horizontal auto-layout frame excluding the frame's padding.
   * - If the current node is an auto layout frame (e.g. an auto layout frame inside a parent auto layout frame) if you set layoutAlign to `“STRETCH”` you should set the corresponding axis – either {@link AutoLayoutMixin.primaryAxisSizingMode} or {@link AutoLayoutMixin.counterAxisSizingMode} – to be`“FIXED”`. This is because an auto-layout frame cannot simultaneously stretch to fill its parent and shrink to hug its children.
   * - Setting `"INHERIT"` does not "stretch" the node.
   *
   * Caution: ⚠️ Previously, layoutAlign also determined counter axis alignment of auto-layout frame children. Counter axis alignment is now set on the auto-layout frame itself through {@link AutoLayoutMixin.counterAxisAlignItems}. Note that this means all layers in an auto-layout frame must now have the same counter axis alignment. This means `"MIN"`, `"CENTER"`,  and `"MAX"` are now deprecated values of `layoutAlign`.
   */
  layoutAlign: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT'
  /**
   * This property is applicable only for direct children of auto-layout frames. Determines whether a layer should stretch along the parent’s primary axis. 0 corresponds to a fixed size and 1 corresponds to stretch.
   *
   * @remarks
   *
   * 0 and 1 are currently the only supported values.
   *
   * Note: If the current node is an auto-layout frame (e.g. an auto-layout frame inside a parent auto-layout frame) if you set `layoutGrow` to 1 you should set the corresponding axis – either {@link AutoLayoutMixin.primaryAxisSizingMode} or {@link AutoLayoutMixin.counterAxisSizingMode} – to be `“FIXED”`. This is because an auto-layout frame cannot simultaneously stretch to fill its parent and shrink to hug its children.
   */
  layoutGrow: number
  /**
   * This property is applicable only for direct children of auto-layout frames. Determines whether a layer's size and position should be dermined by auto-layout settings or manually adjustable.
   *
   * @remarks
   *
   * Changing this property may cause the parent layer's size to change, since it will recalculate as if this child did not exist. It will also change this node's `x`, `y`, and `relativeTransform` properties.
   *
   * - The default value of `"AUTO"` will layout this child according to auto-layout rules.
   * - Setting `"ABSOLUTE"` will take this child out of auto-layout flow, while still nesting inside the auto-layout frame. This allows explicitly setting `x`, `y`, `width`, and `height`. `"ABSOLUTE"` positioned nodes respect constraint settings.
   *
   * ```ts title="Auto-layout frame absolutely positioned red circle at the top-right corner"
   * const parentFrame = figma.createFrame()
   * parentFrame.appendChild(figma.createFrame())
   *
   * // Create a small red circle
   * const ellipse = figma.createEllipse()
   * ellipse.resize(20, 20)
   * ellipse.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }}]
   * parentFrame.appendChild(ellipse)
   * parentFrame.clipsContent = false
   * parentFrame.layoutMode = 'HORIZONTAL'
   *
   * // Enable absolute positioning so we can move the circle
   * ellipse.layoutPositioning = 'ABSOLUTE'
   *
   * // Center the circle on the top-right corner of the frame
   * ellipse.x = 90
   * ellipse.y = -10
   *
   * // Make the circle stick to the top-right corner of the frame
   * ellipse.constraints = { horizontal: 'MAX', vertical: 'MIN' }
   * ```
   */
  layoutPositioning: 'AUTO' | 'ABSOLUTE'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface GridChildrenMixin {
  /**
   * Applicable only on direct children of 'GRID' auto-layout frames. Sets the position of the node
   *
   * @remarks
   * This method sets the position of the node within the grid based on the specified row and column indices.
   * The row and column indices are 0-based, where 0 is the top row in the grid, and 0 is the left-most column in the grid.
   * If the specified row or column index is out of bounds, it will throw an error.
   * If the specified row or column index is occupied by another node, it will throw an error.
   *
   * Caution: ⚠️ This method will throw an error if the parent grid has {@link GridLayoutMixin.gridItemsPositioning} set to `"ROW_AUTO_FLOW"`, since child positions are managed automatically. Use {@link ChildrenMixin.insertChild} to change the order of children instead.
   * ```ts title="Setting the position of a node in a grid"
   * const grid = figma.createFrame()
   * grid.layoutMode = 'GRID'
   * grid.gridRowCount = 3
   * grid.gridColumnCount = 3
   * const child1 = figma.createFrame()
   * const child2 = figma.createFrame()
   * const child2 = figma.createFrame()
   * // + --- + --- + --- +
   * // |  1  |  2  |  3  |
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   * // |     |     |     |
   * // + --- + --- + --- +
   *
   * // If calling `appendChild` instead of {@link GridLayoutMixin.appendChildAt}, nodes will be added to the first available position in the grid.
   * grid.appendChild(child1)
   * grid.appendChild(child2)
   * grid.appendChild(child3)
   * // Move the children to specific grid positions
   * child2.setGridPosition(1, 0)
   * child3.setGridPosition(2, 1)
   * // + --- + --- + --- +
   * // |  1  |     |     |
   * // + --- + --- + --- +
   * // |  2  |     |     |
   * // + --- + --- + --- +
   * // |     |  3  |     |
   * // + --- + --- + --- +
   */
  setGridChildPosition(rowIndex: number, columnIndex: number): void
  /**
   * Applicable only on direct children of grid auto-layout frames. Determines the starting row index for this node within the parent grid.
   *
   * @remarks
   * The row index is 0-based, where 0 is the first row in the grid. This property works in conjunction with gridRowSpan to determine the node's row position and size in the grid.
   * If the index provided is greater than the number of rows in the grid, the setter will throw an error.
   * If the index provided results in the node overlapping with another node in the grid, the setter will throw an error.
   */
  readonly gridRowAnchorIndex: number
  /**
   * Applicable only on direct children of grid auto-layout frames. Determines the starting column index for this node within the parent grid.
   *
   * @remarks
   * The column index is 0-based, where 0 is the first column in the grid. This property works in conjunction with gridColumnSpan to determine the node's column position and size in the grid.
   * If the index provided is greater than the number of columns in the grid, the setter will throw an error.
   * If the index provided results in the node overlapping with another node in the grid, the setter will throw an error.
   */
  readonly gridColumnAnchorIndex: number
  /**
   * Applicable only on direct children of grid auto-layout frames. Determines the number of rows this node will span within the parent grid.
   *
   * @remarks
   * Must be a positive integer. This property defines how many rows the node will occupy starting from gridRowAnchorIndex.
   * If the span provided results in the node overlapping with another node in the grid, the setter will throw an error.
   * If the span provided results in the node extending beyond the grid's defined rows, the setter will throw an error.
   */
  gridRowSpan: number
  /**
   * Applicable only on direct children of grid auto-layout frames. Determines the number of columns this node will span within the parent grid.
   *
   * @remarks
   * Must be a positive integer. This property defines how many columns the node will occupy starting from gridColumnAnchorIndex.
   * If the span provided results in the node overlapping with another node in the grid, the setter will throw an error.
   * If the span provided results in the node extending beyond the grid's defined columns, the setter will throw an error.
   */
  gridColumnSpan: number
  /**
   * Applicable only on direct children of grid auto-layout frames. Controls the horizontal alignment of the node within its grid cell.
   *
   * @remarks
   * Possible values are:
   * - `"MIN"`: Aligns to the left of the grid cell
   * - `"CENTER"`: Centers horizontally within the grid cell
   * - `"MAX"`: Aligns to the right of the grid cell
   * - `"AUTO"`: Uses the default alignment
   */
  gridChildHorizontalAlign: 'MIN' | 'CENTER' | 'MAX' | 'AUTO'
  /**
   * Applicable only on direct children of grid auto-layout frames. Controls the vertical alignment of the node within its grid cell.
   *
   * @remarks
   * Possible values are:
   * - `"MIN"`: Aligns to the top of the grid cell
   * - `"CENTER"`: Centers vertically within the grid cell
   * - `"MAX"`: Aligns to the bottom of the grid cell
   * - `"AUTO"`: Uses the default alignment
   */
  gridChildVerticalAlign: 'MIN' | 'CENTER' | 'MAX' | 'AUTO'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/InferredAutoLayoutResult
 */
interface InferredAutoLayoutResult extends AutoLayoutChildrenMixin, AutoLayoutMixin {}
/**
 * @see https://developers.figma.com/docs/plugins/api/DetachedInfo
 */
type DetachedInfo =
  | {
      type: 'local'
      componentId: string
    }
  | {
      type: 'library'
      componentKey: string
    }
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface MinimalStrokesMixin {
  /**
   * The paints used to fill the area of the shape's strokes. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   *
   * @remarks
   *
   * In order to set pattern strokes, you must use the {@link MinimalStrokesMixin.setStrokesAsync} method to ensure that the source node of the pattern is loaded first.
   */
  strokes: ReadonlyArray<Paint>
  /**
   * The id of the {@link PaintStyle} object that the {@link MinimalStrokesMixin.strokes} property of this node is linked to.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setStrokeStyleIdAsync` to update the style.
   */
  strokeStyleId: string
  /**
   * Set the {@link PaintStyle} that the {@link MinimalStrokesMixin.strokes} property of this node is linked to.
   */
  setStrokeStyleIdAsync(styleId: string): Promise<void>
  /**
   * The thickness of the stroke, in pixels. This value must be non-negative and can be fractional.
   *
   * Caution: For rectangle nodes or frame-like nodes using different individual stroke weights, this property will return {@link PluginAPI.mixed}.
   *
   * Note: For rectangle nodes or frame-like nodes, individual stroke weights can be set for each side using the following properties:
   *
   * - {@link IndividualStrokesMixin.strokeTopWeight}
   * - {@link IndividualStrokesMixin.strokeBottomWeight}
   * - {@link IndividualStrokesMixin.strokeLeftWeight}
   * - {@link IndividualStrokesMixin.strokeRightWeight}
   */
  strokeWeight: number | PluginAPI['mixed']
  /**
   * The decoration applied to vertices which have two or more connected segments.
   *
   * @remarks
   *
   * On a vector network, the value is set on the whole vector network. Use the vector network API to set it on individual vertices.
   *
   * This property can return {@link PluginAPI.mixed} if different vertices have different values.properties.
   */
  strokeJoin: StrokeJoin | PluginAPI['mixed']
  /**
   * The alignment of the stroke with respect to the boundaries of the shape.
   *
   * @remarks
   *
   * Center-aligned stroke means the center of the stroke falls exactly on the geometry. Inside-aligned stroke shifts the stroke so it lies completely inside the shape, and outside-aligned stroke is vice versa.
   *
   * Note: Inside and outside stroke are actually implemented by doubling the stroke weight and masking the stroke by the fill. This means inside-aligned stroke will never draw strokes outside the fill and outside-aligned stroke will never draw strokes inside the fill.
   */
  strokeAlign: 'CENTER' | 'INSIDE' | 'OUTSIDE'
  /**
   * A list of numbers specifying alternating dash and gap lengths, in pixels.
   */
  dashPattern: ReadonlyArray<number>
  /**
   * An array of paths representing the object strokes relative to the node.
   * StrokeGeometry is always from the center regardless of the nodes `strokeAlign`.
   */
  readonly strokeGeometry: VectorPaths
  /**
   * Sets the strokes of the node asynchronously. This is the only way to set pattern strokes on a node, since we need to ensure that the source node of the pattern is loaded first. See [Adding Pattern Fills and Strokes](https://developers.figma.com/docs/plugins/adding-pattern-fills-and-strokes) for more information.
   */
  setStrokesAsync(strokes: ReadonlyArray<Paint>): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface IndividualStrokesMixin {
  /** Determines the top stroke weight on a rectangle node or frame-like node. Must be non-negative and can be fractional. */
  strokeTopWeight: number
  /** Determines the bottom stroke weight on a rectangle node or frame-like node. Must be non-negative and can be fractional. */
  strokeBottomWeight: number
  /** Determines the left stroke weight on a rectangle node or frame-like node. Must be non-negative and can be fractional. */
  strokeLeftWeight: number
  /** Determines the right stroke weight on a rectangle node or frame-like node. Must be non-negative and can be fractional. */
  strokeRightWeight: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface MinimalFillsMixin {
  /**
   * The paints used to fill the area of the shape. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   *
   * @remarks
   *
   * This property can return {@link PluginAPI.mixed} if the node has multiple sets of fills. Text nodes can have multiple sets of fills if some characters are colored differently than others.
   *
   * Use {@link UtilAPI.solidPaint} to create solid paint fills with CSS color strings.
   *
   * Page nodes have a [`backgrounds`](https://developers.figma.com/docs/plugins/api/PageNode#backgrounds) property instead of a `fills` property.
   *
   * In order to set pattern fills, you must use the {@link MinimalFillsMixin.setFillsAsync} method to ensure that the source node of the pattern is loaded first.
   */
  fills: ReadonlyArray<Paint> | PluginAPI['mixed']
  /**
   * The id of the {@link PaintStyle} object that the {@link MinimalFillsMixin.fills} property of this node is linked to.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setFillStyleIdAsync` to update the style.
   *
   * @remarks
   *
   * This property can return {@link PluginAPI.mixed} if the node has multiple fills.properties. Text nodes can have multiple fills if some characters are colored differently than others.
   */
  fillStyleId: string | PluginAPI['mixed']
  /**
   * Sets the {@link PaintStyle} that the {@link MinimalFillsMixin.fills} property of this node is linked to.
   */
  setFillStyleIdAsync(styleId: string): Promise<void>
  /**
   * Sets the fills of the node asynchronously. This is the only way to set pattern fills on a node, since we need to ensure that the source node of the pattern is loaded first. See [Adding Pattern Fills and Strokes](https://developers.figma.com/docs/plugins/adding-pattern-fills-and-strokes) for more information.
   */
  setFillsAsync(paints: ReadonlyArray<Paint>): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VariableWidthStrokeProperties
 */
interface VariableWidthPoint {
  /** The position of the variable width point along the stroke, from 0 (the start of the stroke) to 1 (the end of the stroke). */
  position: number
  /** The width of the stroke at this variable width point as a fraction of the stroke weight. */
  width: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VariableWidthStrokeProperties
 */
interface PresetVariableWidthStrokeProperties {
  /** The width profile of the stroke. */
  widthProfile: 'UNIFORM' | 'WEDGE' | 'TAPER' | 'QUARTER_TAPER' | 'EYE' | 'MIRRORED_TAPER'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VariableWidthStrokeProperties
 */
interface CustomVariableWidthStrokeProperties {
  /** The width profile of the stroke. Fixed to 'CUSTOM'. */
  widthProfile: 'CUSTOM'
  /** An array of variable width points defining the custom width profile. */
  variableWidthPoints: ReadonlyArray<VariableWidthPoint>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/VariableWidthStrokeProperties
 */
declare type VariableWidthStrokeProperties =
  PresetVariableWidthStrokeProperties | CustomVariableWidthStrokeProperties
/**
 * @see https://developers.figma.com/docs/plugins/api/ComplexStrokeProperties
 */
declare type ComplexStrokeProperties =
  | {
      type: 'BASIC'
    }
  | DynamicStrokeProperties
  | BrushStrokeProperties
/**
 * @see https://developers.figma.com/docs/plugins/api/ComplexStrokeProperties
 */
interface ScatterBrushProperties {
  type: 'BRUSH'
  brushType: 'SCATTER'
  /**
   * Name of the scatter brush. See the [available brushes](https://developers.figma.com/api/complex-stroke-properties.md#available-brushes) for previews of these brushes.
   * Nodes using custom brushes will have this set to 'CUSTOM'. However, setting this property to 'CUSTOM' is not yet supported.
   */
  brushName:
    | 'BUBBLEGUM'
    | 'WITCH_HOUSE'
    | 'SHOEGAZE'
    | 'HONKY_TONK'
    | 'SCREAMO'
    | 'DRONE'
    | 'DOO_WOP'
    | 'SPOKEN_WORD'
    | 'VAPORWAVE'
    | 'OI'
    | 'CUSTOM'
  /** Gap between brush instances along the stroke path. Minimum value is 0.25 */
  gap: number
  /** The amount of random movement applied to brush instances along the stroke path. The minimum value is 0. */
  wiggle: number
  /** The amount of random size variation applied to brush instances. Ranges from 0 to 3. */
  sizeJitter: number
  /** The amount of random angular variation in degrees applied to brush instances. Ranges from -180 to 180. */
  angularJitter: number
  /** The rotation in degrees applied to brush instances. Ranges from -180 to 180. */
  rotation: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComplexStrokeProperties
 */
interface StretchBrushProperties {
  type: 'BRUSH'
  brushType: 'STRETCH'
  /**
   * Name of the stretch brush. See the [available brushes](https://developers.figma.com/api/complex-stroke-properties.md#available-brushes) for previews of these brushes.
   * Nodes using custom brushes will have this set to 'CUSTOM'. However, setting this property to 'CUSTOM' is not yet supported.
   * */
  brushName:
    | 'HEIST'
    | 'BLOCKBUSTER'
    | 'GRINDHOUSE'
    | 'BIOPIC'
    | 'SPAGHETTI_WESTERN'
    | 'SLASHER'
    | 'HARDBOILED'
    | 'VERITE'
    | 'EPIC'
    | 'SCREWBALL'
    | 'ROM_COM'
    | 'NOIR'
    | 'PROPAGANDA'
    | 'MELODRAMA'
    | 'NEW_WAVE'
    | 'CUSTOM'
  /** The direction of the brush */
  direction: 'FORWARD' | 'BACKWARD'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComplexStrokeProperties
 */
type BrushStrokeProperties = StretchBrushProperties | ScatterBrushProperties
/**
 * @see https://developers.figma.com/docs/plugins/api/ComplexStrokeProperties
 */
interface DynamicStrokeProperties {
  /** The type of complex stroke. Fixed to 'DYNAMIC'. */
  type: 'DYNAMIC'
  /** The frequency of the dynamic stroke. Ranges from 0.01 to 20. */
  frequency: number
  /** The amplitude of the wiggles in the dynamic stroke. Minimum value is 0. */
  wiggle: number
  /** The amount of smoothing applied to the dynamic stroke. Ranges from 0 to 1. */
  smoothen: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface GeometryMixin extends MinimalStrokesMixin, MinimalFillsMixin {
  /**
   * The decoration applied to vertices which have only one connected segment.
   *
   * @remarks
   *
   * On a vector network, the value is set on the whole vector network. Use the vector network API to set it on individual vertices.
   *
   * This property can return {@link PluginAPI.mixed} if different vertices have different values.properties.
   */
  strokeCap: StrokeCap | PluginAPI['mixed']
  /**
   * The miter limit on the stroke. This is the same as the [SVG miter limit](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-miterlimit).
   */
  strokeMiterLimit: number
  /**
   * This method performs an action similar to using the "Outline Stroke" function in the editor from the right-click menu. However, this method creates and returns a new node while leaving the original intact. Returns `null` if the node has no strokes.
   */
  outlineStroke(): VectorNode | null
  /**
   * An array of paths representing the object fills relative to the node.
   */
  readonly fillGeometry: VectorPaths
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface ComplexStrokesMixin {
  /**
   * The variable width stroke properties for the node.
   *
   * @remarks
   * Variable width strokes cannot be applied to complex vector networks (i.e. vector networks with branching paths).
   *
   * Variable width strokes are also not supported in combination with dynamic strokes.
   */
  variableWidthStrokeProperties: VariableWidthStrokeProperties | null
  /**
   * The complex stroke properties for nodes using brush or dynamic strokes.
   *
   * @remarks
   * We do not yet support setting custom brushes via the plugin API, but the API will return the brush properties for nodes that use custom brushes.
   *
   * Setting a dynamic stroke on a stroke with variable width points will remove the variable width points.
   *
   * When setting a brush on a stroke, you must first ensure that the desired brushes are loaded with {@link PluginAPI.loadBrushesAsync}.
   */
  complexStrokeProperties: ComplexStrokeProperties
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface CornerMixin {
  /**
   * The number of pixels to round the corners of the object by.
   *
   * @remarks
   *
   * This value must be non-negative and can be fractional. If an edge length is less than twice the corner radius, the corner radius for each vertex of the edge will be clamped to half the edge length.
   *
   * This property can return {@link PluginAPI.mixed} if different vertices have different values.properties. Vector nodes can have individual corner radii on each vertex. Rectangle nodes can also have different corner radii on each of the four corners.
   */
  cornerRadius: number | PluginAPI['mixed']
  /**
   * A value that lets you control how "smooth" the corners are. Ranges from 0 to 1.
   *
   * @remarks
   *
   * A value of 0 is the default and means that the corner is perfectly circular. A value of 0.6 means the corner matches the iOS 7 "squircle" icon shape. Other values produce various other curves. See [this post](https://www.figma.com/blog/desperately-seeking-squircles/) for the gory details!
   */
  cornerSmoothing: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface RectangleCornerMixin {
  /**
   * The radius of the top left corner, in pixels. This value must be non-negative and can be fractional.
   */
  topLeftRadius: number
  /**
   * The radius of the top right corner, in pixels. This value must be non-negative and can be fractional.
   */
  topRightRadius: number
  /**
   * The radius of the bottom left corner, in pixels. This value must be non-negative and can be fractional.
   */
  bottomLeftRadius: number
  /**
   * The radius of the bottom right corner, in pixels. This value must be non-negative and can be fractional.
   */
  bottomRightRadius: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface ExportMixin {
  /**
   * List of export settings stored on the node. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   */
  exportSettings: ReadonlyArray<ExportSettings>
  /**
   * Exports the node in the format given by `settings`. Image formats (PNG, JPG), PDF, and the video formats (MP4, GIF, WebM) return a `Uint8Array` of the encoded file; `SVG_STRING` returns a string and `JSON_REST_V1` returns an object.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a {@link PageNode}, you must first call {@link PageNode.loadAsync} to access this function.
   *
   * @param settings - When this parameter is absent, this function defaults to exporting as a PNG at 1x resolution.
   *
   * ```ts title="Create a hexagon, export as PNG, and place on canvas"
   * (async () => {
   *   const polygon = figma.createPolygon()
   *   polygon.pointCount = 6
   *   polygon.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   *
   *   // highlight-start
   *   // Export a 2x resolution PNG of the node
   *   const bytes = await polygon.exportAsync({
   *     format: 'PNG',
   *     constraint: { type: 'SCALE', value: 2 },
   *   })
   *   // highlight-end
   *
   *   // Add the image onto the canvas as an image fill in a frame
   *   const image = figma.createImage(bytes)
   *   const frame = figma.createFrame()
   *   frame.x = 200
   *   frame.resize(200, 230)
   *   frame.fills = [{
   *     imageHash: image.hash,
   *     scaleMode: "FILL",
   *     scalingFactor: 1,
   *     type: "IMAGE",
   *   }]
   * })()
   * ```
   *
   * ```ts title="Export a VectorNode as an SVG string"
   *  (async () => {
   *    // Create a triangle using the VectorPath API
   *    const vector = figma.createVector()
   *    vector.vectorPaths = [{
   *      windingRule: "EVENODD",
   *      data: "M 0 100 L 100 100 L 50 0 Z",
   *    }]
   *
   *    // highlight-start
   *    // Export the vector to SVG
   *    const svg = await vector.exportAsync({ format: 'SVG_STRING' })
   *    // highlight-end
   *    console.log(svg);
   *  })()
   * ```
   *
   * ```ts title="Export a node as a JSON object"
   * (async () => {
   *   const json = await figma.currentPage.selection[0].exportAsync({format: 'JSON_REST_V1'})
   *   // Return a JSON object in the same format as the Figma REST API response
   *   console.log(json.document)
   * })()
   * ```
   *
   * Passing an {@link ExportSettingsMP4}, {@link ExportSettingsGIF}, or {@link ExportSettingsWEBM} exports a video (returned as a `Uint8Array`). The exported node must be a top-level frame (a frame placed directly on a page) whose content is animated; the entire frame is encoded across the animation's duration. Calling video export on any other node — including a nested animated frame, or an individual layer that has keyframes but is not itself a top-level frame — rejects with an error. To export the animation a layer participates in, first resolve its enclosing top-level frame with {@link BaseNodeMixin.getTopLevelFrame}. Video export is only available when running in Figma.
   *
   * ```ts title="Export the selected layer's top-level frame as an MP4 and a GIF"
   * (async () => {
   *   const frame = figma.currentPage.selection[0]?.getTopLevelFrame()
   *   if (!frame) {
   *     figma.notify('Select a frame to export')
   *     return
   *   }
   *
   *   try {
   *     // highlight-start
   *     const mp4 = await frame.exportAsync({ format: 'MP4', fps: 30, quality: 'HIGH' })
   *     const gif = await frame.exportAsync({ format: 'GIF', fps: 15, loopCount: 0 })
   *     // highlight-end
   *   } catch (e) {
   *     // exportAsync rejects if the frame has no animated content to encode
   *     figma.notify('This frame has no animation to export')
   *   }
   * })()
   * ```
   */
  exportAsync(settings?: ExportSettings): Promise<Uint8Array>

  exportAsync(settings: ExportSettingsSVGString): Promise<string>

  exportAsync(settings: ExportSettingsREST): Promise<Object>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface FramePrototypingMixin {
  /**
   * Determines whether a frame will scroll in presentation mode when the frame contains content that exceed the frame's bounds. Reflects the value shown in "Overflow Behavior" in the Prototype tab.
   *
   * @remarks
   *
   * Frames directly parented under the canvas don't need this property to be set or for content to exceed the frame's bounds in order to scroll in presentation mode. They just need the frame to be bigger than the device or screen and will scroll automatically.
   */
  overflowDirection: OverflowDirection
  /**
   * Determines which children of the frame are fixed children in a scrolling frame.
   *
   * @remarks
   *
   * In Figma, fixed children are always on top of scrolling (non-fixed) children. Despite the "Fix position when scrolling" checkbox in the UI, fixed layers are not represented as a boolean property on individual layers. Instead, what we really have are two sections of children inside each frame. These section headers are visible in the layers panel when a frame has at least one fixed child.
   */
  numberOfFixedChildren: number
  /**
   * How this frame is positioned when opened as an overlay.
   */
  readonly overlayPositionType: OverlayPositionType
  /**
   * How this frame obscures the content under it when opened as an overlay.
   */
  readonly overlayBackground: OverlayBackground
  /**
   * How the user can interact with the content under this frame when opened as an overlay.
   */
  readonly overlayBackgroundInteraction: OverlayBackgroundInteraction
}
interface VectorLikeMixin {
  /**
   * Exposes a complete, but more complex representation of vectors as a network of edges between vectices. See {@link VectorNetwork}.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setVectorNetworkAsync` to update the value.
   */
  vectorNetwork: VectorNetwork
  /**
   * Updates the vector network.
   */
  setVectorNetworkAsync(vectorNetwork: VectorNetwork): Promise<void>
  /**
   * Exposes a simple, but incomplete representation of vectors as path. See {@link VectorPaths}
   */
  vectorPaths: VectorPaths
  /**
   * Whether the vector handles are mirrored or independent.
   */
  handleMirroring: HandleMirroring | PluginAPI['mixed']
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface ReactionMixin {
  /**
   * List of [Reactions](https://developers.figma.com/docs/plugins/api/Reaction) on this node, which includes both the method of interaction with this node in a prototype, and the behavior of that interaction. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setReactionsAsync` to update the value.
   *
   * @remarks
   *
   * [Prototyping](https://help.figma.com/hc/en-us/articles/360040314193-Guide-to-prototyping-in-Figma) in Figma lets users create connections between nodes that consist of a trigger (click, hover, etc...) and a corresponding list of actions, such as navigating to another frame or setting a variable. The `reactions` property lets you read and modify prototyping reactions on the node.
   *
   * ```ts title="Changing the transition duration in a prototyping action"
   * const node = figma.currentPage.selection[0]
   * console.log(node.reactions)
   *
   * /*
   * Output:
   *
   * [{
   *   action: {
   *     type: 'NODE',
   *     destinationId: '4:1539',
   *     navigation: 'NAVIGATE',
   *     transition: {
   *       type:'SMART_ANIMATE',
   *       easing: { type: 'EASE_OUT' },
   *       duration: 0.20000000298023224
   *     },
   *     preserveScrollPosition: false
   *   },
   *   actions: [{
   *     type: 'NODE',
   *     destinationId: '4:1539',
   *     navigation: 'NAVIGATE',
   *     transition: {
   *       type:'SMART_ANIMATE',
   *       easing: { type: 'EASE_OUT' },
   *       duration: 0.20000000298023224
   *     },
   *     preserveScrollPosition: false
   *   }],
   *   trigger: { type: 'ON_CLICK' }
   * }]
   * *\/
   *
   * // See clone() implementation from the Editing Properties page
   * const newReactions = clone(node.reactions)
   * // highlight-start
   * newReactions[0].actions[0].transition.duration = 0.5
   * // highlight-end
   * await node.setReactionsAsync(newReactions)
   * ```
   *
   * It is also possible to add Advanced Prototyping action types through the Plugin API: [Set Variable](https://help.figma.com/hc/en-us/articles/14506587589399-Use-variables-in-prototypes) and [Conditional](https://help.figma.com/hc/en-us/articles/15253220891799-Multiple-actions-and-conditionals).
   * Moreover, Reactions now include the ability to execute multiple actions by updating the `actions` field on a `Reaction`.
   *
   * ```ts title="Create a button with a Reaction object that updates the visibility of another Frame."
   * (async () => {
   *   // Create collection with "show" variable inside
   *   const collection = figma.variables.createVariableCollection('prototyping')
   *   const modeId = collection.modes[0].modeId
   *   const showVariable = figma.variables.createVariable(
   *     'show',
   *     collection,
   *     'BOOLEAN'
   *   )
   *
   *   // Initialize "show" variable to true
   *   showVariable.setValueForMode(modeId, true)
   *
   *   const parentFrame = figma.createFrame()
   *   parentFrame.resize(350, 200)
   *
   *   // Green "Click me" button
   *   const toggleButton = figma.createFrame()
   *   parentFrame.appendChild(toggleButton)
   *   toggleButton.x = 50
   *   toggleButton.y = 50
   *   toggleButton.layoutMode = 'HORIZONTAL'
   *   toggleButton.layoutSizingHorizontal = 'HUG'
   *   toggleButton.layoutSizingVertical = 'HUG'
   *   toggleButton.fills = [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 } }]
   *   const text = figma.createText()
   *   await figma.loadFontAsync(text.fontName)
   *   text.characters = 'Click me'
   *   toggleButton.appendChild(text)
   *
   *   // Red square
   *   const frame = figma.createFrame()
   *   parentFrame.appendChild(frame)
   *   frame.x = 200
   *   frame.y = 50
   *   frame.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
   *
   *   // The "show" variable will now control the visibility of the frame
   *   frame.setBoundVariable('visible', showVariable)
   *
   *   await toggleButton.setReactionsAsync([
   *   {
   *     trigger: { type: 'ON_CLICK' },
   *     actions: [
   *     {
   *       type: 'CONDITIONAL',
   *       conditionalBlocks: [
   *       {
   *         condition: { // Conditional: if "show" variable == true
   *           type: 'EXPRESSION',
   *           resolvedType: 'BOOLEAN',
   *           value: {
   *             expressionArguments: [
   *               {
   *                 type: 'VARIABLE_ALIAS',
   *                 resolvedType: 'BOOLEAN',
   *                 value: {
   *                   type: 'VARIABLE_ALIAS',
   *                   id: showVariable.id
   *                 }
   *               },
   *               {
   *                 type: 'BOOLEAN',
   *                 resolvedType: 'BOOLEAN',
   *                 value: true
   *               }
   *             ],
   *             expressionFunction: 'EQUALS'
   *           }
   *         },
   *         actions: [ // then set "show" variable to false
   *           {
   *             type: 'SET_VARIABLE',
   *             variableId: showVariable.id,
   *             variableValue: {
   *               resolvedType: 'BOOLEAN',
   *                type: 'BOOLEAN',
   *                value: false
   *             }
   *           }
   *         ]
   *       },
   *       {
   *         actions: [ // else set "show" variable to true
   *           {
   *             type: 'SET_VARIABLE',
   *             variableId: showVariable.id,
   *             variableValue: {
   *               resolvedType: 'BOOLEAN',
   *               type: 'BOOLEAN',
   *               value: true
   *             }
   *           }
   *         ]
   *       }]
   *     }]
   *   }])
   * })()
   * ```
   */
  reactions: ReadonlyArray<Reaction>
  /**
   * Updates the reactions on this node. See {@link ReactionMixin.reactions} for a usage example.
   */
  setReactionsAsync(reactions: Array<Reaction>): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/DocumentationLink
 */
interface DocumentationLink {
  readonly uri: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface PublishableMixin {
  /**
   * The plain-text annotation entered by the user for this style/component.
   *
   * @remarks
   *
   * To set a rich-text description using markdown, see {@link PublishableMixin.descriptionMarkdown}
   *
   * Caution: ⚠️ There is a currently a bug in Figma where the description field will appear to be missing or not up to date. Until this is fixed, the workaround is to re-publish nodes for which the description is missing.
   */
  description: string
  /**
   * The rich-text annotation entered by the user for this style/component.
   *
   * @remarks
   *
   *
   * Caution: ⚠️ There is a currently a bug in Figma where the description field will appear to be missing or not up to date. Until this is fixed, the workaround is to re-publish nodes for which the description is missing.
   */
  descriptionMarkdown: string
  /**
   * The documentation links for this style/component.
   *
   * @remarks
   *
   * This API currently only supports setting a single documentation link.  To clear the documentation links, set to the empty list [].
   *
   * Example:
   *
   * ```ts
   * node.documentationLinks = [{uri: "https://www.figma.com"}]
   *
   * // clear documentation links
   * node.documentationLinks = []
   * ```
   */
  documentationLinks: ReadonlyArray<DocumentationLink>
  /**
   * Whether this style/component is a remote style/component that doesn't live in the file (i.e. is from the team library). Remote components are read-only: attempts to change their properties will throw.
   */
  readonly remote: boolean
  /**
   * The key to use with {@link PluginAPI.importComponentByKeyAsync}, {@link PluginAPI.importComponentSetByKeyAsync} and {@link PluginAPI.importStyleByKeyAsync}. Note that while this key is present on local and published components, you can only import components that are already published.
   */
  readonly key: string
  /**
   * Gets the status of this style/component in the team library.
   *
   */
  getPublishStatusAsync(): Promise<PublishStatus>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface DefaultShapeMixin
  extends
    BaseNodeMixin,
    SceneNodeMixin,
    ReactionMixin,
    BlendMixin,
    GeometryMixin,
    LayoutMixin,
    ExportMixin {}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface BaseFrameMixin
  extends
    BaseNodeMixin,
    SceneNodeMixin,
    ChildrenMixin,
    ContainerMixin,
    GeometryMixin,
    ComplexStrokesMixin,
    CornerMixin,
    RectangleCornerMixin,
    BlendMixin,
    ConstraintMixin,
    LayoutMixin,
    ExportMixin,
    IndividualStrokesMixin,
    AutoLayoutMixin,
    GridLayoutMixin,
    AspectRatioLockMixin,
    AnnotationsMixin {
  /**
   * Includes the id (for local components) or key (for library components) of the component the given node was detached from, if any. If the node isn't a detached instance, it will be null. If the node is a component or instance, it will be null.
   */
  readonly detachedInfo: DetachedInfo | null
  /**
   * Array of {@link LayoutGrid} objects used as layout grids on this node. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   */
  layoutGrids: ReadonlyArray<LayoutGrid>
  /**
   * The id of the {@link GridStyle} object that the {@link BaseFrameMixin.layoutGrids} property of this node is linked to.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setGridStyleIdAsync` to update the style.
   */
  gridStyleId: string
  /**
   * Set the {@link GridStyle} that the {@link BaseFrameMixin.layoutGrids} property of this node is linked to.
   */
  setGridStyleIdAsync(styleId: string): Promise<void>
  /**
   * Whether the frame clips its contents. That is, whether layers inside the frame are visible outside the bounds of the frame.
   */
  clipsContent: boolean
  /**
   * Array of {@link Guide} used inside the frame. Note that each frame has its own guides, separate from the canvas-wide guides. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties).
   */
  guides: ReadonlyArray<Guide>
  /**
   * Returns inferred auto layout properties of a {@link FrameNode} if applicable. Otherwise, returns `null`.
   *
   * This is what Figma uses to power Dev Mode’s [code snippets](https://help.figma.com/hc/en-us/articles/15023124644247#Build_faster_with_customizable_code_snippets) feature, as it makes sure the generated code is more useful.
   *
   * Note: This method uses a heuristic to infer the auto layout properties.
   */
  inferredAutoLayout: InferredAutoLayoutResult | null
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-properties
 */
interface DefaultFrameMixin extends BaseFrameMixin, FramePrototypingMixin, ReactionMixin {}

interface OpaqueNodeMixin
  extends BaseNodeMixin, SceneNodeMixin, ExportMixin, DimensionAndPositionMixin {}

interface MinimalBlendMixin {
  /**
   * Opacity of the node, as shown in the Layer panel. Must be between 0 and 1.
   */
  opacity: number
  /**
   * Blend mode of this node, as shown in the Layer panel. In addition to the blend modes that paints & effects support, the layer blend mode can also have the value PASS_THROUGH.
   */
  blendMode: BlendMode
}
interface Annotation {
  readonly label?: string
  readonly labelMarkdown?: string
  readonly properties?: ReadonlyArray<AnnotationProperty>
  readonly categoryId?: string
}
interface AnnotationProperty {
  readonly type: AnnotationPropertyType
}
type AnnotationPropertyType =
  | 'width'
  | 'height'
  | 'maxWidth'
  | 'minWidth'
  | 'maxHeight'
  | 'minHeight'
  | 'fills'
  | 'strokes'
  | 'effects'
  | 'strokeWeight'
  | 'cornerRadius'
  | 'textStyleId'
  | 'textAlignHorizontal'
  | 'fontFamily'
  | 'fontStyle'
  | 'fontSize'
  | 'fontWeight'
  | 'lineHeight'
  | 'letterSpacing'
  | 'itemSpacing'
  | 'padding'
  | 'layoutMode'
  | 'alignItems'
  | 'opacity'
  | 'mainComponent'
  | 'gridRowGap'
  | 'gridColumnGap'
  | 'gridRowCount'
  | 'gridColumnCount'
  | 'gridRowAnchorIndex'
  | 'gridColumnAnchorIndex'
  | 'gridRowSpan'
  | 'gridColumnSpan'
interface AnnotationsMixin {
  /**
   * Annotations on the node.
   *
   * Learn more about annotations in the [Help Center](https://help.figma.com/hc/en-us/articles/20774752502935) or see the [Annotation type](https://developers.figma.com/docs/plugins/api/Annotation) for usage examples.
   */
  annotations: ReadonlyArray<Annotation>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/Measurement
 */
interface Measurement {
  id: string
  start: {
    node: SceneNode
    side: MeasurementSide
  }
  end: {
    node: SceneNode
    side: MeasurementSide
  }
  offset: MeasurementOffset
  freeText: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/MeasurementSide
 */
type MeasurementSide = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT'
/**
 * @see https://developers.figma.com/docs/plugins/api/MeasurementOffset
 */
type MeasurementOffset =
  | {
      type: 'INNER'
      relative: number
    }
  | {
      type: 'OUTER'
      fixed: number
    }
interface MeasurementsMixin {
  /**
   * Get all measurements in the current page.
   *
   * Learn more about measurements in the [Help Center](https://help.figma.com/hc/en-us/articles/20774752502935).
   */
  getMeasurements(): Measurement[]
  /**
   * Get all measurements pointing to a node in the current page. This includes all measurements whose start _or_ end node is the node passed in.
   */
  getMeasurementsForNode(node: SceneNode): Measurement[]
  /**
   * Adds a measurement between two nodes in the current page.
   *
   * Measurements are always between a start and end node. The side indicates which edge of the node to draw the measurement from.
   *
   * Measurements can only go on the same axis, i.e. from side `"LEFT"` -> `"LEFT"`, `"LEFT"` -> `"RIGHT"`, `"TOP"` -> `"BOTTOM"` etc. But not `"LEFT"` -> `"TOP"`.
   *
   * See the [Measurement type](https://developers.figma.com/docs/plugins/api/Measurement) for usage examples.
   *
   * Note: This method is only available in Dev Mode. You can check the editor type of your plugin to know if the user is in Dev Mode or not:
   *
   * ```ts
   * if (figma.editorType === 'dev') {
   *   // In Figma's Dev Mode
   * }
   * ```
   */
  addMeasurement(
    start: {
      node: SceneNode
      side: MeasurementSide
    },
    end: {
      node: SceneNode
      side: MeasurementSide
    },
    options?: {
      /**
       * @default { type: 'INNER'; relative: 0 }
       */
      offset?: MeasurementOffset
      freeText?: string
    },
  ): Measurement
  /**
   * Edit a measurement’s offset.
   *
   * See the [Measurement type](https://developers.figma.com/docs/plugins/api/Measurement) for usage examples.
   *
   * Note: This method is only available in Dev Mode. You can check the editor type of your plugin to know if the user is in Dev Mode or not:
   *
   * ```ts
   * if (figma.editorType === 'dev') {
   *   // In Figma's Dev Mode
   * }
   * ```
   */
  editMeasurement(
    id: string,
    newValue: {
      offset?: MeasurementOffset
      freeText?: string
    },
  ): Measurement
  /**
   * Delete a measurement.
   *
   * See the [Measurement type](https://developers.figma.com/docs/plugins/api/Measurement) for usage examples.
   *
   * Note: This method is only available in Dev Mode. You can check the editor type of your plugin to know if the user is in Dev Mode or not:
   *
   * ```ts
   * if (figma.editorType === 'dev') {
   *   // In Figma's Dev Mode
   * }
   * ```
   */
  deleteMeasurement(id: string): void
}
interface ComponentPropertiesMixin {
  /**
   * All component properties and their default values that exist on this component set. `'VARIANT'` properties will also have a list of all variant options. `'BOOLEAN'`, `'TEXT'`, and `'INSTANCE_SWAP'` properties will have their names suffixed by a unique identifier starting with `'#'`, which is helpful for quickly distinguishing multiple component properties that have the same name in the Figma UI. The entire property name should be used for all Component property-related API methods and properties.
   *
   * @remarks
   *
   * [Component properties-related properties](https://help.figma.com/hc/en-us/articles/5579474826519-Create-and-use-component-properties) define parts of the component people can change by tying them to specific design properties. You can create component properties for any main component or component set, and apply them to nested layers of the component or variant.
   *
   * ```ts title="Component properties-related properties and methods for component sets, components, and instances"
   * componentSet.componentPropertyDefinitions
   *
   * // Output
   * {
   *   Size: {
   *     type: 'VARIANT',
   *     defaultValue: 'Small',
   *     variantOptions: ['Small', 'Medium', 'Large'],
   *   },
   *   IconVisible#0:0: {
   *     type: 'BOOLEAN',
   *     defaultValue: false,
   *   },
   *   ButtonText#0:1: {
   *     type: 'TEXT',
   *     defaultValue: 'submit',
   *   },
   *   IconInstance#0:2: {
   *     type: 'INSTANCE_SWAP',
   *     defaultValue: '1:1',
   *     preferredValues: [
   *       {type: 'COMPONENT', key: 'ckey1'},
   *       {type: 'COMPONENT_SET', key: 'sgkey1'}
   *     ],
   *   },
   * }
   *
   * // componentProperties on an instance
   * instance.componentProperties
   *
   * // Output
   * {
   *   Size: {
   *     type: 'VARIANT',
   *     value: 'Medium',
   *   },
   *   IconVisible#0:0: {
   *     type: 'BOOLEAN',
   *     value: false,
   *   },
   *   ButtonText#0:1: {
   *     type: 'TEXT',
   *     value: 'cancel',
   *   },
   *   IconInstance#0:2: {
   *     type: 'INSTANCE_SWAP',
   *     defaultValue: '1:1',
   *     preferredValues: [
   *       {type: 'COMPONENT', key: 'ckey1'},
   *       {type: 'COMPONENT_SET', key: 'sgkey1'}
   *     ],
   *   },
   * }
   *
   * // component property definitions can be created, edited, and deleted
   * component.addComponentProperty("ButtonIcon", "INSTANCE_SWAP", "2:22")
   * // returns "ButtonIcon#4:3"
   *
   * component.editComponentProperty(
   *   "ButtonIcon#4:3",
   *   {name: "PrimaryButtonIcon", defaultValue: "1:100"}
   * )
   * // returns "PrimaryButtonIcon#5:5"
   *
   * component.deleteComponentProperty("PrimaryButtonIcon#5:5")
   *
   * // componentPropertyDefinitions and componentProperties work similarly for
   * // main components and their instances but will never have 'VARIANT'
   * // properties.
   * component.componentPropertyDefinitions
   *
   * // Output
   * {
   *   ImageVisible#0:0: {
   *     type: 'BOOLEAN',
   *     defaultValue: true,
   *   },
   *   Icon#0:1: {
   *     type: 'INSTANCE_SWAP',
   *     defaultValue: '7:23',
   *   },
   * }
   *
   * instance.componentProperties
   *
   * // Output
   * {
   *   ImageVisible#0:0: {
   *     type: 'BOOLEAN',
   *     value: true,
   *   },
   *   Icon#0:1: {
   *     type: 'INSTANCE_SWAP',
   *     value: '1:24',
   *   },
   * }
   *
   * // component properties can be applied to node properties of nested layers
   * component.children[0].children[0].componentPropertyReferences = {
   *   'visible': 'IconVisible#0:0'
   * }
   * component.children[0].children[0].visible
   *
   * // Output
   * false // gets value from component property definition
   *
   * // Use setProperties on an instance to configure it
   * instance.setProperties({ Size: 'Large', 'ButtonText#0:1': 'login' })
   * instance.componentProperties
   *
   * // Output
   * {
   *   Size: {
   *     type: 'VARIANT',
   *     value: 'Large',
   *   },
   *   IconVisible#0:0: {
   *     type: 'BOOLEAN',
   *     value: false,
   *   },
   *   ButtonText#0:1: {
   *     type: 'TEXT',
   *     value: 'login',
   *   },
   * }
   *
   * instance.setProperties({ 'IconVisible#0:0': true })
   * instance.componentProperties
   *
   * // Output
   * {
   *   Size: {
   *     type: 'VARIANT',
   *     value: 'Large',
   *   },
   *   IconVisible#0:0: {
   *     type: 'BOOLEAN',
   *     value: true,
   *   },
   *   ButtonText#0:1: {
   *     type: 'TEXT',
   *     value: 'login',
   *   },
   * }
   * ```
   */
  readonly componentPropertyDefinitions: ComponentPropertyDefinitions
  /**
   * Adds a new component property to this node and returns the property name with its unique identifier suffixed. This function supports properties with type `'BOOLEAN'`, `'TEXT'`, `'INSTANCE_SWAP'`, `'VARIANT'`, or `'SLOT'`.
   */
  addComponentProperty(
    propertyName: string,
    type: ComponentPropertyType,
    defaultValue: string | boolean | VariableAlias,
    options?: ComponentPropertyOptions,
  ): string
  /**
   * Modifies the name, default value, or preferred values of an existing component property on this node and returns the property name with its unique identifier suffixed.
   *
   * This function supports properties with type `'BOOLEAN'`, `'TEXT'`, `'INSTANCE_SWAP'`, `'VARIANT'`, or `'SLOT'` with the following restrictions:
   *
   * - `name` is supported for all properties
   * - `defaultValue` is supported for `'BOOLEAN'`, `'TEXT'`, and `'INSTANCE_SWAP'` properties, but not for `'VARIANT'` or `'SLOT'` properties
   * - `preferredValues` is only supported for `'INSTANCE_SWAP'` and `'SLOT'` properties
   * - `description` is only supported for `'SLOT'` properties
   * - `slotSettings` is only supported for `'SLOT'` properties
   */
  editComponentProperty(
    propertyName: string,
    newValue: {
      name?: string
      defaultValue?: string | boolean | VariableAlias
      preferredValues?: InstanceSwapPreferredValue[]
      description?: string
      slotSettings?: SlotSettings
    },
  ): string
  /**
   * Deletes an existing component property on this node. This function only supports properties with type `'BOOLEAN'`, `'TEXT'`, `'INSTANCE_SWAP'` or `'SLOT'`.
   */
  deleteComponentProperty(propertyName: string): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextNode
 */
interface BaseNonResizableTextMixin {
  /**
   * Returns whether the text uses a font currently not available to the document.
   */
  readonly hasMissingFont: boolean
  /**
   * The size of the font. Has minimum value of 1.
   */
  fontSize: number | PluginAPI['mixed']
  /**
   * The font family (e.g. `"Inter"`), font style (e.g. `"Regular"`). For [variable fonts](https://developers.figma.com/docs/plugins/api/FontName), also {@link FontName.variationSettings}. Setting this property to a different value requires the new font to be loaded.
   *
   * @remarks
   *
   * When reading, `variationSettings` is populated only when the font is a variable font, and includes every axis the family defines (not just overrides). Returns `figma.mixed` when the text node has more than one font, or when variation settings differ across character ranges.
   *
   * When writing, pass a {@link FontName} or {@link FontNameInput}. Omit `style` to let Figma pick the named instance closest to `variationSettings`. Supply `variationSettings` to override specific axes; keys must match the family's axis tags (see {@link PluginAPI.getFontFamilyVariationAxes}). An omitted axis keeps the named instance's default.
   *
   * ```ts title="Set a variable font with custom weight"
   * (async () => {
   *   const text = figma.createText()
   *   await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
   *   text.fontName = {
   *     family: 'Inter',
   *     style: 'Regular',
   *     variationSettings: { wght: 650 },
   *   }
   *   text.characters = 'Almost bold'
   * })()
   * ```
   */
  fontName: FontName | PluginAPI['mixed']
  /**
   * The weight of the font (e.g. 400 for "Regular", 700 for "Bold").
   */
  readonly fontWeight: number | PluginAPI['mixed']
  /**
   * Overrides the case of the raw characters in the text node. Requires the font to be loaded.
   */
  textCase: TextCase | PluginAPI['mixed']
  /**
   * [OpenType features](https://help.figma.com/hc/en-us/articles/4913951097367) that have been explicitly enabled or disabled.
   *
   * @remarks
   *
   * The **Details** tab in the [Type settings panel](https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties#type-settings) shows all the OpenType features that are available for the current font.
   *
   * This property gives you a map of four-character OpenType features to booleans indicating whether the features are explicitly enabled or disabled. For example, if the map contains `{ CALT: false }`, then the "Contextual alternates" feature is disabled.
   *
   * Note: This map only contains features that diverge from their default values. Some OpenType features are enabled by default and some are disabled by default. For example `CLIG` and `LIGA` are on by default, whereas `LNUM` and `TNUM` are disabled by default.
   *
   * Here are some useful resources for learning about OpenType features:
   *
   * - [An ode to OpenType [Figma blog]](https://www.figma.com/blog/opentype-font-features/)
   * - [OpenType feature tags [Microsoft]](https://learn.microsoft.com/en-us/typography/opentype/spec/featuretags)
   * - [OpenType font features guide [MDN]](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Fonts/OpenType_fonts_guide)
   * - [OpenType Features in CSS [Sparanoid]](https://sparanoid.com/lab/opentype-features/)
   *
   * ```ts title="Getting OpenType features from the currently-selected text node"
   * // For a node that uses the Inter font with
   * // "Contextual alternates" disabled (shows -> instead of ➔):
   * // { CALT: false }
   * console.log(figma.currentPage.selection[0].openTypeFeatures)
   * ```
   */
  readonly openTypeFeatures:
    | {
        readonly [feature in OpenTypeFeature]: boolean
      }
    | PluginAPI['mixed']
  /**
   * The spacing between the individual characters. Requires the font to be loaded.
   */
  letterSpacing: LetterSpacing | PluginAPI['mixed']
  /**
   * A {@link HyperlinkTarget} if the text node has exactly one hyperlink, or `null` if the node has none.
   */
  hyperlink: HyperlinkTarget | null | PluginAPI['mixed']
  /**
   * The raw characters in the text node. Setting this property requires the font the be loaded.
   *
   * @remarks
   *
   * Setting this property will reset styles applied to character ranges.
   *
   * Setting the `characters` property can change the {@link BaseNodeMixin.name} of the node if `autoRename === true`.
   */
  characters: string
  /**
   * Insert `characters` at index `start` in the text.
   *
   * @remarks
   *
   * This API allows you to insert characters in a text node while preserving the styles of the existing characters. However, you still need to call {@link PluginAPI.loadFontAsync} before using this API.
   *
   * The style of the inserted characters will be copied from the preceding character if `useStyle` is "BEFORE" or not provided. Otherwise, the style of inserted characters will be copied from the following character. If there is no preceding or following character (i.e. `start` is at the boundary of the string), then the style will be copied from the closest existing character.
   *
   * Caution: ⚠ Did you know: not all glyphs that you might think as a "character" are actually stored as a single character in JavaScript string? JavaScript strings are UTF-16 encoded. Some characters like "👍" are stored using two characters! Try it in the JavaScript console: "👍".length is 2! The two characters are called "surrogate pairs". Even more mindblowing: some characters are made of multiple _emojis_. For example, "👨‍👧", which you should see in your browser as a single character, has length 5. "👨‍👧".substring(0, 2) is "👨" and "👨‍👧".substring(3, 5) is "👧".
   */
  insertCharacters(start: number, characters: string, useStyle?: 'BEFORE' | 'AFTER'): void
  /**
   * Remove characters in the text from `start` (inclusive) to `end` (exclusive).
   *
   * @remarks
   *
   * This API allows you to remove characters in a text node while preserving the styles of the existing characters. However, you still need to call {@link PluginAPI.loadFontAsync} before using this API.
   *
   * Caution: ⚠ Did you know: not all glyphs that you might think as a "character" are actually stored as a single character in JavaScript string? JavaScript strings are UTF-16 encoded. Some characters like "👍" are stored using two characters! Try it in the JavaScript console: "👍".length is 2! The two characters are called "surrogate pairs". Even more mindblowing: some characters are made of multiple _emojis_. For example, "👨‍👧", which you should see in your browser as a single character, has length 5. "👨‍👧".substring(0, 2) is "👨" and "👨‍👧".substring(3, 5) is "👧".
   */
  deleteCharacters(start: number, end: number): void
  /**
   * Get the `fontSize` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeFontSize(start: number, end: number): number | PluginAPI['mixed']
  /**
   * Set the `fontSize` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeFontSize(start: number, end: number, value: number): void
  /**
   * Get the `fontName` from characters in range `start` (inclusive) to `end` (exclusive). For [variable fonts](https://developers.figma.com/docs/plugins/api/FontName), the returned {@link FontName} includes {@link FontName.variationSettings}. Returns `figma.mixed` when the range contains more than one font or when variation settings differ.
   */
  getRangeFontName(start: number, end: number): FontName | PluginAPI['mixed']
  /**
   * Set the `fontName` from characters in range `start` (inclusive) to `end` (exclusive). Requires the new font to be loaded.
   *
   * @remarks
   *
   * Accepts a {@link FontNameInput}. Pass `variationSettings` to override specific axes of a [variable font](https://developers.figma.com/docs/plugins/api/FontName). Omit `style` to let Figma pick the named instance closest to `variationSettings`.
   *
   * ```ts title="Override weight on a character range"
   * (async () => {
   *   const text = figma.createText()
   *   await figma.loadFontAsync({ family: 'Inter' })
   *   text.characters = 'Hello world'
   *   text.setRangeFontName(0, 5, {
   *     family: 'Inter',
   *     style: 'Regular',
   *     variationSettings: { wght: 700 },
   *   })
   * })()
   * ```
   */
  setRangeFontName(start: number, end: number, value: FontNameInput): void
  /**
   * Get the `fontWeight` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeFontWeight(start: number, end: number): number | PluginAPI['mixed']
  /**
   * Get the `fontName`s from characters in range `start` (inclusive) to `end` (exclusive). For [variable fonts](https://developers.figma.com/docs/plugins/api/FontName), each entry includes {@link FontName.variationSettings}.
   */
  getRangeAllFontNames(start: number, end: number): FontName[]
  /**
   * Get the `textCase` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextCase(start: number, end: number): TextCase | PluginAPI['mixed']
  /**
   * Set the `textCase` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextCase(start: number, end: number, value: TextCase): void
  /**
   * Get the {@link BaseNonResizableTextMixin.openTypeFeatures} from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeOpenTypeFeatures(
    start: number,
    end: number,
  ):
    | {
        readonly [feature in OpenTypeFeature]: boolean
      }
    | PluginAPI['mixed']
  /**
   * Get the `letterSpacing` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeLetterSpacing(start: number, end: number): LetterSpacing | PluginAPI['mixed']
  /**
   * Set the `letterSpacing` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeLetterSpacing(start: number, end: number, value: LetterSpacing): void
  /**
   * Get the `hyperlink` from characters in range `start` (inclusive) to `end` (exclusive). Returns a {@link HyperlinkTarget} if the range contains exactly one hyperlink, or `null` if the range contains none.
   */
  getRangeHyperlink(start: number, end: number): HyperlinkTarget | null | PluginAPI['mixed']
  /**
   * Set the `hyperlink` from characters in range `start` (inclusive) to `end` (exclusive). Removes the hyperlink in range if `value` is `null`.
   */
  setRangeHyperlink(start: number, end: number, value: HyperlinkTarget | null): void
  /**
   * Get the `fills` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeFills(start: number, end: number): Paint[] | PluginAPI['mixed']
  /**
   * Set the `fills` from characters in range `start` (inclusive) to `end` (exclusive). Requires font to be loaded.
   *
   * Can be bound to color variables by using {@link VariablesAPI.setBoundVariableForPaint} on one or more of the provided `Paint`s
   */
  setRangeFills(start: number, end: number, value: Paint[]): void
  /**
   * Get the `textStyleId` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextStyleId(start: number, end: number): string | PluginAPI['mixed']
  /**
   * Set the provided {@link TextStyle} to characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextStyleIdAsync(start: number, end: number, styleId: string): Promise<void>
  /**
   * Get the `fillStyleId` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeFillStyleId(start: number, end: number): string | PluginAPI['mixed']
  /**
   * Set the provided {@link PaintStyle} as a fill to characters in range `start` (inclusive) to `end` (exclusive).
   */
  setRangeFillStyleIdAsync(start: number, end: number, styleId: string): Promise<void>
  /**
   * Get the `boundVariable` for a given field from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeBoundVariable(
    start: number,
    end: number,
    field: VariableBindableTextField,
  ): VariableAlias | null | PluginAPI['mixed']
  /**
   * Set the `boundVariable` for a given field from characters in range `start` (inclusive) to `end` (exclusive). Requires any new fonts to be loaded.
   */
  setRangeBoundVariable(
    start: number,
    end: number,
    field: VariableBindableTextField,
    variable: Variable | null,
  ): void
  /**
   * Get text segments along with the desired text properties (font size, text case, etc...)
   *
   * @param fields - An array of text properties. Any text property that can apply to specific character ranges is supported:
   * - fontSize
   * - fontName
   * - fontWeight
   * - fontStyle
   * - textDecoration
   * - textDecorationStyle
   * - textDecorationOffset
   * - textDecorationThickness
   * - textDecorationColor
   * - textDecorationSkipInk
   * - textCase
   * - lineHeight
   * - letterSpacing
   * - fills
   * - textStyleId
   * - fillStyleId
   * - listOptions
   * - listSpacing
   * - indentation
   * - paragraphIndent
   * - paragraphSpacing
   * - hyperlink
   * - boundVariables
   * - textStyleOverrides
   * - openTypeFeatures
   *
   * @param start - An optional start index for the characters to retrieve
   * @param end - An optional end index (required if `start` is provided)
   *
   * @remarks
   *
   * This function provides an easy and performant way to get multiple text properties which may have [mixed values](https://developers.figma.com/docs/plugins/working-with-text#mixed-styles), along with which characters these values apply to.
   * It will return an array of {@link StyledTextSegment}s containing the desired fields, along with the characters and their start and end index.
   *
   * To illustrate the behavior of this function, here are a few examples:
   *
   * Node containing "**hello** world":
   * ```js
   * textNode.getStyledTextSegments(['fontName'])
   *
   * // Output: contains 2 segments because the text is no longer bolded after "hello"
   * [
   *   {
   *     characters: "hello",
   *     start: 0,
   *     end: 5,
   *     fontName: { family: 'Inter', style: 'Bold' },
   *   },
   *   {
   *     characters: " world",
   *     start: 5,
   *     end: 11,
   *     fontName: { family: 'Inter', style: 'Regular' },
   *   }
   * ]
   * ```
   *
   * Node containing:
   * - Item 1
   *   - **Item** 1.1
   * ```js
   * textNode.getStyledTextSegments(['fontName', 'indentation'])
   *
   * // Output: contains 3 segments because the font / indentation changes
   * // before and after the second "Item"
   * [
   *   {
   *     characters: 'Item 1\n',
   *     start: 0,
   *     end: 7,
   *     fontName: { family: 'Inter', style: 'Regular' },
   *     indentation: 1
   *   },
   *   {
   *     characters: 'Item',
   *     start: 7,
   *     end: 11,
   *     fontName: { family: 'Inter', style: 'Bold' },
   *     indentation: 2
   *   },
   *   {
   *     characters: ' 1.1',
   *     start: 11,
   *     end: 15,
   *     fontName: { family: 'Inter', style: 'Regular' },
   *     indentation: 2
   *   }
   * ]
   * ```
   *
   * Node containing "😁 😭 😅😂😳😎":
   * ```js
   * textNode.getStyledTextSegments(['letterSpacing'])
   *
   * // Output: many emoji have length 2 in Javascript
   * [
   *   {
   *     characters: '😁😭',
   *     start: 0,
   *     end: 4,
   *     letterSpacing: { unit: 'PERCENT', value: 50 }
   *   },
   *   {
   *     characters: '😅😂😳😎',
   *     start: 4,
   *     end: 12,
   *     letterSpacing: { unit: 'PERCENT', value: 0 }
   *   }
   * ]
   *
   * textNode.getStyledTextSegments(['letterSpacing'], 1, 3)
   *
   * // Output: if the requested range starts or ends in the middle
   * // of surrogate pairs, those pairs will be trimmed and you will
   * // see raw Unicode code points
   * [
   *   {
   *     characters: '\uDE01\uD83D',
   *     start: 1,
   *     end: 3,
   *     letterSpacing: { unit: 'PERCENT', value: 50 }
   *   }
   * ]
   *
   * textNode.getStyledTextSegments(['letterSpacing'], 3, 5)
   *
   * // Output: similar to above, but Unicode code points span
   * // a change in letter spacing
   * [
   *   {
   *     characters: '\uDE2D',
   *     start: 3,
   *     end: 4,
   *     letterSpacing: { unit: 'PERCENT', value: 50 }
   *   },
   *   {
   *     characters: '\uD83D',
   *     start: 4,
   *     end: 5,
   *     letterSpacing: { unit: 'PERCENT', value: 0 }
   *   }
   * ]
   * ```
   *
   * See {@link BaseNonResizableTextMixin.insertCharacters} for more information on surrogate pairs.
   */
  getStyledTextSegments<
    StyledTextSegmentFields extends (keyof Omit<
      StyledTextSegment,
      'characters' | 'start' | 'end'
    >)[],
  >(
    fields: StyledTextSegmentFields,
    start?: number,
    end?: number,
  ): Array<
    Pick<StyledTextSegment, StyledTextSegmentFields[number] | 'characters' | 'start' | 'end'>
  >
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextNode
 */
interface NonResizableTextMixin extends BaseNonResizableTextMixin {
  /**
   * The indentation of paragraphs (offset of the first line from the left). Setting this property requires the font the be loaded.
   */
  paragraphIndent: number | PluginAPI['mixed']
  /**
   * The vertical distance between paragraphs. Setting this property requires the font to be loaded.
   *
   * @remarks
   *
   * **Working with Paragraph Level Fields**
   *
   * ```ts
   * const text = figma.createText()
   * await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
   *
   * // Create text with two paragraphs, separated by \n
   * text.characters = "hello figma, welcome to my plugin!\nI love the Figma Plugin API!"
   * text.resize(120, 30)
   * text.textAutoResize = 'HEIGHT'
   *
   * // Apply 20px paragraph spacing - all paragraphs covered by the provided text range will be
   * // modified, and remaining paragraphs will be untouched.
   * text.setRangeParagraphSpacing(0, 1, 20)
   * // text.paragraphSpacing = Symbol(figma.mixed)
   * // text.getStyledTextSegments(['paragraphSpacing']) =
   * //    [
   * //      {
   * //        "characters": "hello figma, welcome to my plugin!\n",
   * //        "start": 0,
   * //        "end": 35,
   * //        "paragraphSpacing": 20
   * //      },
   * //      {
   * //        "characters": "I love the Figma Plugin API!",
   * //        "start": 35,
   * //        "end": 63,
   * //        "paragraphSpacing": 0
   * //      }
   * //    ]
   *
   * text.setRangeTextWrapStyle(38, 39, 'BALANCE')
   * // text.textWrapStyle = Symbol(figma.mixed)
   * // text.getStyledTextSegments(['textWrapStyle']) =
   * //    [
   * //      {
   * //        "characters": "hello figma, welcome to my plugin!\n",
   * //        "start": 0,
   * //        "end": 35,
   * //        "textWrapStyle": "AUTO"
   * //      },
   * //      {
   * //        "characters": "I love the Figma Plugin API!",
   * //        "start": 35,
   * //        "end": 63,
   * //        "textWrapStyle": "BALANCE"
   * //      }
   * //    ]
   * ```
   *
   */
  paragraphSpacing: number | PluginAPI['mixed']
  /**
   * Controls how text wraps within each paragraph. Setting this property requires the font to be loaded.
   *
   * @remarks
   *
   * **Working with Paragraph Level Fields**
   *
   * ```ts
   * const text = figma.createText()
   * await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
   *
   * // Create text with two paragraphs, separated by \n
   * text.characters = "hello figma, welcome to my plugin!\nI love the Figma Plugin API!"
   * text.resize(120, 30)
   * text.textAutoResize = 'HEIGHT'
   *
   * // Apply 20px paragraph spacing - all paragraphs covered by the provided text range will be
   * // modified, and remaining paragraphs will be untouched.
   * text.setRangeParagraphSpacing(0, 1, 20)
   * // text.paragraphSpacing = Symbol(figma.mixed)
   * // text.getStyledTextSegments(['paragraphSpacing']) =
   * //    [
   * //      {
   * //        "characters": "hello figma, welcome to my plugin!\n",
   * //        "start": 0,
   * //        "end": 35,
   * //        "paragraphSpacing": 20
   * //      },
   * //      {
   * //        "characters": "I love the Figma Plugin API!",
   * //        "start": 35,
   * //        "end": 63,
   * //        "paragraphSpacing": 0
   * //      }
   * //    ]
   *
   * text.setRangeTextWrapStyle(38, 39, 'BALANCE')
   * // text.textWrapStyle = Symbol(figma.mixed)
   * // text.getStyledTextSegments(['textWrapStyle']) =
   * //    [
   * //      {
   * //        "characters": "hello figma, welcome to my plugin!\n",
   * //        "start": 0,
   * //        "end": 35,
   * //        "textWrapStyle": "AUTO"
   * //      },
   * //      {
   * //        "characters": "I love the Figma Plugin API!",
   * //        "start": 35,
   * //        "end": 63,
   * //        "textWrapStyle": "BALANCE"
   * //      }
   * //    ]
   * ```
   *
   */
  textWrapStyle: TextWrapStyle | PluginAPI['mixed']
  /**
   * The vertical distance between lines of a list.
   */
  listSpacing: number | PluginAPI['mixed']
  /**
   * Whether punctuation, like quotation marks, hangs outside the text box.
   */
  hangingPunctuation: boolean
  /**
   * Whether numbered list counters or unordered list bullets hang outside the text box.
   */
  hangingList: boolean
  /**
   * Whether the text is underlined or has a strikethrough. Requires the font to be loaded.
   */
  textDecoration: TextDecoration | PluginAPI['mixed']
  /**
   * The text decoration style (e.g. "SOLID"). If the text is not underlined, this value will be null. Requires the font to be loaded.
   */
  textDecorationStyle: TextDecorationStyle | PluginAPI['mixed'] | null
  /**
   * The text decoration offset. If the text is not underlined, this value will be null. Requires the font to be loaded.
   */
  textDecorationOffset: TextDecorationOffset | PluginAPI['mixed'] | null
  /**
   * The text decoration thickness. If the text is not underlined, this value will be null. Requires the font to be loaded.
   */
  textDecorationThickness: TextDecorationThickness | PluginAPI['mixed'] | null
  /**
   * The text decoration color. If the text is not underlined, this value will be null. Requires the font to be loaded.
   */
  textDecorationColor: TextDecorationColor | PluginAPI['mixed'] | null
  /**
   * Whether the text decoration skips descenders. If the text is not underlined, this value will be null. Requires the font to be loaded.
   */
  textDecorationSkipInk: boolean | PluginAPI['mixed'] | null
  /**
   * The spacing between the lines in a paragraph of text. Requires the font to be loaded.
   */
  lineHeight: LineHeight | PluginAPI['mixed']
  /**
   * The removal of the vertical space above and below text glyphs. Requires the font to be loaded.
   */
  leadingTrim: LeadingTrim | PluginAPI['mixed']
  /**
   * Get the `textDecoration` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextDecoration(start: number, end: number): TextDecoration | PluginAPI['mixed']
  /**
   * Set the `textDecoration` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextDecoration(start: number, end: number, value: TextDecoration): void
  /**
   * Get the `textDecorationStyle` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextDecorationStyle(
    start: number,
    end: number,
  ): TextDecorationStyle | PluginAPI['mixed'] | null
  /**
   * Set the `textDecorationStyle` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextDecorationStyle(start: number, end: number, value: TextDecorationStyle): void
  /**
   * Get the `textDecorationOffset` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextDecorationOffset(
    start: number,
    end: number,
  ): TextDecorationOffset | PluginAPI['mixed'] | null
  /**
   * Set the `textDecorationOffset` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextDecorationOffset(start: number, end: number, value: TextDecorationOffset): void
  /**
   * Get the `textDecorationThickness` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextDecorationThickness(
    start: number,
    end: number,
  ): TextDecorationThickness | PluginAPI['mixed'] | null
  /**
   * Set the `textDecorationThickness` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextDecorationThickness(start: number, end: number, value: TextDecorationThickness): void
  /**
   * Get the `textDecorationColor` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextDecorationColor(
    start: number,
    end: number,
  ): TextDecorationColor | PluginAPI['mixed'] | null
  /**
   * Set the `textDecorationColor` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextDecorationColor(start: number, end: number, value: TextDecorationColor): void
  /**
   * Get the `textDecorationSkipInk` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextDecorationSkipInk(start: number, end: number): boolean | PluginAPI['mixed'] | null
  /**
   * Set the `textDecorationSkipInk` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextDecorationSkipInk(start: number, end: number, value: boolean): void
  /**
   * Get the `lineHeight` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeLineHeight(start: number, end: number): LineHeight | PluginAPI['mixed']
  /**
   * Set the `lineHeight` from characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeLineHeight(start: number, end: number, value: LineHeight): void
  /**
   * Get the `textListOptions` from characters in range `start` (inclusive) to `end` (exclusive). Returns a {@link TextListOptions}
   */
  getRangeListOptions(start: number, end: number): TextListOptions | PluginAPI['mixed']
  /**
   * Set the `textListOptions` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  setRangeListOptions(start: number, end: number, value: TextListOptions): void
  /**
   * Get the `listSpacing` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeListSpacing(start: number, end: number): number | PluginAPI['mixed']
  /**
   * Set the `listSpacing` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  setRangeListSpacing(start: number, end: number, value: number): void
  /**
   * Get the `indentation` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeIndentation(start: number, end: number): number | PluginAPI['mixed']
  /**
   * Set the `indentation` from characters in range `start` (inclusive) to `end` (exclusive).
   */
  setRangeIndentation(start: number, end: number, value: number): void
  /**
   * Get the `paragraphIndent` for a paragraph containing characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeParagraphIndent(start: number, end: number): number | PluginAPI['mixed']
  /**
   * Set the `paragraphIndent` for a paragraph containing characters in range `start` (inclusive) to `end` (exclusive).
   */
  setRangeParagraphIndent(start: number, end: number, value: number): void
  /**
   * Get the `paragraphSpacing` for a paragraph containing characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeParagraphSpacing(start: number, end: number): number | PluginAPI['mixed']
  /**
   * Set the `paragraphSpacing` for a paragraph containing characters in range `start` (inclusive) to `end` (exclusive).
   */
  setRangeParagraphSpacing(start: number, end: number, value: number): void
  /**
   * Get the `textWrapStyle` for a paragraph containing characters in range `start` (inclusive) to `end` (exclusive).
   */
  getRangeTextWrapStyle(start: number, end: number): TextWrapStyle | PluginAPI['mixed']
  /**
   * Set the `textWrapStyle` for a paragraph containing characters in range `start` (inclusive) to `end` (exclusive). Requires the font to be loaded.
   */
  setRangeTextWrapStyle(start: number, end: number, value: TextWrapStyle): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextPathNode
 */
interface NonResizableTextPathMixin extends BaseNonResizableTextMixin {}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextNode
 */
interface TextSublayerNode extends NonResizableTextMixin, MinimalFillsMixin {}
interface DocumentNode extends BaseNodeMixin {
  /**
   * The type of this node, represented by the string literal "DOCUMENT"
   */
  readonly type: 'DOCUMENT'
  /**
   * The list of children. For `DocumentNode`s, children are always {@link PageNode}s.
   */
  readonly children: ReadonlyArray<PageNode>
  /**
   * The color profile of this document. This will be "LEGACY" for documents created before color management was launched.
   */
  readonly documentColorProfile: 'LEGACY' | 'SRGB' | 'DISPLAY_P3'
  /**
   * Adds a new page to the end of the `children` array.
   */
  appendChild(child: PageNode): void
  /**
   * Adds a new page at the specified index in the `children` array.
   */
  insertChild(index: number, child: PageNode): void
  /**
   * Searches the immediate children of this node (i.e. all page nodes, not including their children). Returns all pages for which `callback` returns true.
   *
   * @param callback - A function that evaluates whether to return the provided `node`. If this argument is omitted, `findChildren` returns `node.children`.
   *
   * @remarks
   *
   * Example: find pages matching a certain name scheme
   * ```ts
   * const templates = figma.root.findChildren(n => n.name.includes("template"))
   * ```
   */
  findChildren(callback?: (node: PageNode) => boolean): Array<PageNode>
  /**
   * Searches the immediate children of this node (i.e. all page nodes, not including their children). Returns the first page for which `callback` returns true.
   *
   * @param callback - A function that evaluates whether to return the provided `node`.
   *
   * @remarks
   *
   * This function returns `null` if no matching node is found.
   *
   * Example: find the first page matching a certain name scheme
   * ```ts
   * const firstTemplate = figma.root.findChild(n => n.name.includes("template"))
   * ```
   */
  findChild(callback: (node: PageNode) => boolean): PageNode | null
  /**
   * Searches the entire document tree. Returns all nodes for which `callback` returns true.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, you must first call {@link PluginAPI.loadAllPagesAsync} to access this function.
   *
   * @param callback - A function that evaluates whether to return the provided `node`. If this argument is omitted, `findAll` returns all nodes in the subtree.
   *
   * @remarks
   *
   * Nodes are included in **back-to-front** order. Parents always appear before their children, and children appear in same relative order before their children, and children appear in same relative order as in the {@link ChildrenMixin.children} array.
   *
   * This traversal method is known as ["pre-order traversal"](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order_(NLR)).
   *
   * Note that the root node itself is **not included**.
   *
   * Example: find all nodes whose name is "Color":
   * ```ts
   * await figma.loadAllPagesAsync() // call this once when the plugin runs
   * const colors = figma.root.findAll(n => n.name === "Color")
   * ```
   *
   * Caution: ⚠ Large documents in Figma can have tens of thousands of nodes. Be careful using this function as it could be very slow.
   * Please refer to our [recommendations](https://developers.figma.com/docs/plugins/accessing-document#full-document-traversal) for how to optimize document traversals.
   */
  findAll(callback?: (node: PageNode | SceneNode) => boolean): Array<PageNode | SceneNode>
  /**
   * Searches this entire page (this node's children, its children's children, etc.). Returns the first node for which `callback` returns true.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, you must first call {@link PluginAPI.loadAllPagesAsync} to access this function.
   *
   * @param callback - A function that evaluates whether to return the provided `node`.
   *
   * @remarks
   *
   * This function returns `null` if no matching node is found. The traversal order is the same as in {@link ChildrenMixin.findAll}.
   *
   * Note that the root node itself is **not included**.
   *
   * Example: find one node whose name is "Template":
   * ```ts
   * await figma.loadAllPagesAsync() // call this once when the plugin runs
   * const template = figma.root.findOne(n => n.name === "Template")
   * ```
   *
   * Caution: ⚠ Large documents in Figma can have tens of thousands of nodes. Be careful using this function as it could be very slow.
   * Please refer to our [recommendations](https://developers.figma.com/docs/plugins/accessing-document#full-document-traversal) for how to optimize document traversals.
   */
  findOne(callback: (node: PageNode | SceneNode) => boolean): PageNode | SceneNode | null
  /**
   * Searches the entire document tree. Returns all nodes that satisfy all of specified criteria.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, you must first call {@link PluginAPI.loadAllPagesAsync} to access this function.
   *
   * Similar to {@link ChildrenMixin.findAllWithCriteria} with the main difference being that this searches all the nodes in the document, which also includes {@link PageNode} objects.
   */
  findAllWithCriteria<T extends NodeType[]>(
    criteria: FindAllCriteria<T>,
  ): Array<
    {
      type: T[number]
    } & (PageNode | SceneNode)
  >
  /**
   * Searches the entire document tree. Returns all widget nodes that match the provided `widgetId`.
   *
   * If the manifest contains `"documentAccess": "dynamic-page"`, you must first call {@link PluginAPI.loadAllPagesAsync} to access this function.
   *
   * @param widgetId - The widget ID to search for, which represents unique identifier for the widget.
   *
   * @remarks
   *
   * `node.widgetId` is not to be confused with `node.id`, which is the unique identifier for the node on the canvas. In other words, if you clone a widget, the cloned widget will have a matching `widgetId` but a different `id`.
   */
  findWidgetNodesByWidgetId(widgetId: string): Array<WidgetNode>
}
interface ExplicitVariableModesMixin {
  /**
   * The explicitly set modes for this node.
   * For `SceneNodes`, represents a subset of {@link SceneNodeMixin.resolvedVariableModes }.
   * Note that this does not include [workspace and team-default modes](https://help.figma.com/hc/en-us/articles/12611253730071).
   */
  explicitVariableModes: {
    [collectionId: string]: string
  }
  /**
   * Clears an explicit mode for the given collection on this node
   *
   * @param collection - A variable collection. Make sure to pass a collection object here; passing a variable collection ID is deprecated.
   */
  clearExplicitVariableModeForCollection(collection: VariableCollection): void
  /**
   * Sets an explicit mode for the given collection on this node
   *
   * @param collection - A variable collection. Make sure to pass a collection object here; passing a variable collection ID is deprecated.
   * @param modeId - A variable mode ID.
   */
  setExplicitVariableModeForCollection(collection: VariableCollection, modeId: string): void
}
interface PageNode
  extends BaseNodeMixin, ChildrenMixin, ExportMixin, ExplicitVariableModesMixin, MeasurementsMixin {
  /**
   * The type of this node, represented by the string literal "PAGE"
   */
  readonly type: 'PAGE'
  /**
   * Create a clone of this page, parented under {@link PluginAPI.root}. Prototyping connections will be copied such that they point to their equivalent in the cloned page. Components will be cloned as instances who master is the original component.
   */
  clone(): PageNode
  /**
   * The guides on this page.
   *
   * @remarks
   *
   * Like many of our array properties, `page.guide` creates a new, read-only array every time it is called. To change the guides, you will need to make a copy of the existing array and/or assign a new array.
   *
   * Example:
   * ```ts
   * function addNewGuide(page: PageNode, guide: Guide) {
   *   // .concat() creates a new array
   *   page.guides = page.guides.concat(guide)
   * }
   * ```
   */
  guides: ReadonlyArray<Guide>
  /**
   * The selected nodes on this page. Each page stores its own selection separately. The ordering of nodes in the selection is **unspecified**, you should not be relying on it.
   *
   * @remarks
   *
   * Like many of our array properties, `page.selection` returns a new, read-only array every time it is called (the nodes inside are references to existing nodes, not copies). To change the selection, you will need to make a copy of the existing array and/or assign a new array.
   *
   * Example:
   * ```ts
   * function addNewNodeToSelection(page: PageNode, node: SceneNode) {
   *   // .concat() creates a new array
   *   page.selection = page.selection.concat(node)
   * }
   *
   * function selectFirstChildOfNode(page: PageNode, node: SceneNode) {
   *   if (node.children.length > 0) {
   *     page.selection = [node.children[0]]
   *   }
   * }
   * ```
   *
   * - As the selection is just a node property, the selection is preserved when the user switches between pages.
   * - Nodes in the selection are unique. When setting the selection, the API will de-deduplicate nodes in the selection. This API could have been a `Set<SceneNode>`, but it's generally easier to work with array and to get the first node using just selection[0].
   * - Only **directly selected nodes** are present in this array. A node is directly selected when it is selected and none of its ancestors are selected. That means the array will never contain both a node and one of its descendents.
   */
  selection: ReadonlyArray<SceneNode>
  /**
   * The current text node being edited, if any, and the text currently being selected within that text node.
   *
   * @remarks
   *
   * This property will return `null` if there is no text node being edited. Setting this property to a `node` will enter text edit mode on that `node`. Leaving text edit mode will set this value to `null`.
   *
   * When `start == end`, it means that no characters is currently selected -- i.e., there is just a cursor.
   *
   * Changing `selectedTextRange` will trigger a `selectionchange` message.
   */
  selectedTextRange: {
    node: TextNode
    start: number
    end: number
  } | null
  /**
   * The sorted list of flow starting points used when accessing Presentation view.
   *
   * @remarks
   *
   * The default starting point is the first one (e.g., used when no frames are selected and you click the toolbar's play icon to enter Presentation view).
   */
  flowStartingPoints: ReadonlyArray<{
    nodeId: string
    name: string
  }>
  /**
   * The background color of the canvas (currently only supports a single solid color paint).
   */
  backgrounds: ReadonlyArray<Paint>
  /**
   * The background color of the prototype (currently only supports a single solid color paint).
   */
  prototypeBackgrounds: ReadonlyArray<Paint>
  /**
   * The starting point when launching a prototype. Prototypes with a starting node contain all frames reachable from that node. Prototypes without a starting node contain all frames on the current page. Note that prototypes are per-page.
   */
  readonly prototypeStartNode: FrameNode | GroupNode | ComponentNode | InstanceNode | null
  /**
   * Returns true if the node is a page divider, which is only possible when the page node is empty and has a page divider name. A page divider name consists of all asterisks, all en dashes, all em dashes, or all spaces. To create a page divider, use {@link PluginAPI.createPageDivider} or rename an empty page to a page divider name.
   */
  readonly isPageDivider: boolean
  /**
   * Loads the contents of the page node.
   */
  loadAsync(): Promise<void>
  /**
   *
   * Note: This API is only available in Figma Slides
   *
   * When in single slide view, the Slide that is currently focused is accessible via this property.
   *
   * @remarks
   *
   * You can also set this via:
   *
   * ```ts
   * figma.currentPage.focusedSlide = slideNode
   * ```
   */
  focusedSlide?: SlideNode | null
  /**
   *
   * Note: This API is only available in Figma Slides, Figma Buzz, and Dev Mode.
   *
   * For Figma Slides and Figma Buzz:
   * When in Asset View, this is the focused slide or asset.
   *
   * For Dev Mode:
   * This is the node currently focused in Dev Mode focus view. This property is read-only in Dev Mode.
   *
   * @remarks
   *
   * In Figma Slides and Figma Buzz, you can also set this via:
   *
   * ```ts
   * figma.currentPage.focusedNode = node
   * ```
   */
  focusedNode: SceneNode | null
}
interface FrameNode extends DefaultFrameMixin {
  /**
   * The type of this node, represented by the string literal "FRAME".
   */
  readonly type: 'FRAME'
  /**
   * Duplicates the frame node. By default, the duplicate will be parented under `figma.currentPage`. Nested components will be cloned as instances who master is the original component.
   */
  clone(): FrameNode
}
interface GroupNode
  extends
    BaseNodeMixin,
    SceneNodeMixin,
    ReactionMixin,
    ChildrenMixin,
    ContainerMixin,
    BlendMixin,
    LayoutMixin,
    ExportMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "GROUP".
   */
  readonly type: 'GROUP'
  /**
   * Duplicates the group node. By default, the duplicate will be parented under `figma.currentPage`. Nested components will be cloned as instances who master is the original component.
   */
  clone(): GroupNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TransformGroupNode
 */
interface TransformGroupNode
  extends
    BaseNodeMixin,
    SceneNodeMixin,
    ReactionMixin,
    ChildrenMixin,
    ContainerMixin,
    BlendMixin,
    LayoutMixin,
    ExportMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "TRANSFORM_GROUP".
   */
  readonly type: 'TRANSFORM_GROUP'
  /**
   * Duplicates the transform group node. By default, the duplicate will be parented under `figma.currentPage`. Nested components will be cloned as instances who master is the original component.
   */
  clone(): TransformGroupNode
  /**
   * An array of transform modifiers applied to the child nodes within the group.
   */
  transformModifiers: TransformModifier[]
}
interface SliceNode extends BaseNodeMixin, SceneNodeMixin, LayoutMixin, ExportMixin {
  /**
   * The type of this node, represented by the string literal "SLICE"
   */
  readonly type: 'SLICE'
  /**
   * Duplicates the slice node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): SliceNode
}
interface RectangleNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    ComplexStrokesMixin,
    RectangleCornerMixin,
    IndividualStrokesMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "RECTANGLE"
   */
  readonly type: 'RECTANGLE'
  /**
   * Duplicates the rectangle node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): RectangleNode
}
interface LineNode
  extends DefaultShapeMixin, ConstraintMixin, AnnotationsMixin, ComplexStrokesMixin {
  /**
   * The type of this node, represented by the string literal "LINE"
   */
  readonly type: 'LINE'
  /**
   * Duplicates the line node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): LineNode
}
interface EllipseNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    ComplexStrokesMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "ELLIPSE"
   */
  readonly type: 'ELLIPSE'
  /**
   * Duplicates the ellipse node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): EllipseNode
  /**
   * Exposes the values of the sweep and ratio handles used in our UI to create arcs and donuts. See the {@link ArcData} property.
   */
  arcData: ArcData
}
interface PolygonNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    ComplexStrokesMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "POLYGON"
   */
  readonly type: 'POLYGON'
  /**
   * Duplicates the polygon node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): PolygonNode
  /**
   * Number of sides of the polygon. Must be an integer >= 3.
   */
  pointCount: number
}
interface StarNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    ComplexStrokesMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "STAR"
   */
  readonly type: 'STAR'
  /**
   * Duplicates the star node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): StarNode
  /**
   * Number of "spikes", or outer points of the star. Must be an integer >= 3.
   */
  pointCount: number
  /**
   * The percentage value that defines the acuteness of the star's angles. This value must be between 0.0 and 1.0 inclusive.
   *
   * Contrary to cornerRadius, which controls the outer corners of the star, innerRadius controls the inner rounded corners of the star. A value closer to 0 makes the angles on each point more acute, resulting in a more "spiky" look. A value closer to 1 makes the star closer to a Polygon node. A value equals 1 means that the node is a regular polygon with 2 * pointCount edges.
   */
  innerRadius: number
}
interface VectorNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    ComplexStrokesMixin,
    VectorLikeMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "VECTOR"
   */
  readonly type: 'VECTOR'
  /**
   * Duplicates the vector node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): VectorNode
}
interface TextNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    NonResizableTextMixin,
    ComplexStrokesMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "TEXT"
   */
  readonly type: 'TEXT'
  /**
   * Duplicates the text node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): TextNode
  /**
   * The horizontal alignment of the text with respect to the textbox. Setting this property requires the font the be loaded.
   */
  textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  /**
   * The vertical alignment of the text with respect to the textbox. Setting this property requires the font the be loaded.
   */
  textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM'
  /**
   * The behavior of how the size of the text box adjusts to fit the characters. Setting this property requires the font the be loaded.
   *
   * @remarks
   * - "NONE": The size of the textbox is fixed and is independent of its content.
   * - "HEIGHT": The width of the textbox is fixed. Characters wrap to fit in the textbox. The height of the textbox automatically adjusts to fit its content.
   * - "WIDTH_AND_HEIGHT": Both the width and height of the textbox automatically adjusts to fit its content. Characters do not wrap.
   * - [DEPRECATED] "TRUNCATE": Like "NONE", but text that overflows the bounds of the text node will be truncated with an ellipsis. This value will be removed in the future - prefer reading from {@link TextNode.textTruncation} instead.
   */
  textAutoResize: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE'
  /**
   * Whether this text node will truncate with an ellipsis when the text node size is smaller than the text inside.
   *
   * @remarks
   *
   * When {@link TextNode.textAutoResize} is set to `"NONE"`, the text will truncate when the fixed size is smaller than the text inside. When it is `"HEIGHT"` or `"WIDTH_AND_HEIGHT"`, truncation will only occur if used in conjunction with {@link DimensionAndPositionMixin.maxHeight} or {@link TextNode.maxLines}.
   */
  textTruncation: 'DISABLED' | 'ENDING'
  /**
   * The maximum number of lines a text node can reach before it truncates. Only applicable when {@link TextNode.textTruncation} is set to `"ENDING"`.
   *
   * @remarks
   *
   * The value must be >= 1. To disable truncation at a maximum number of lines, set to `null`.
   */
  maxLines: number | null
  /**
   * Whether updating the characters in the text node should update the name of the node. If this is set to true, `name` will be auto-derived from `characters`.
   *
   * @remarks
   *
   * This is automatically reset to false if `name` is modified in order to allow the node to keep the new name.
   */
  autoRename: boolean
  /**
   * The id of the {@link TextStyle} object that the text properties of this node are linked to. Requires the font to be loaded.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use {@link TextNode.setTextStyleIdAsync} to update the style.
   */
  textStyleId: string | PluginAPI['mixed']
  /**
   * Set the {@link TextStyle} that the text properties of this node are linked to. Requires the font to be loaded.
   */
  setTextStyleIdAsync(styleId: string): Promise<void>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TextPathNode
 */
interface TextPathNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    NonResizableTextPathMixin,
    ComplexStrokesMixin,
    AnnotationsMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "TEXT_PATH"
   */
  readonly type: 'TEXT_PATH'
  /**
   * Duplicates the text path node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): TextPathNode
  /**
   * The horizontal alignment of the text with respect to the textbox. Setting this property requires the font the be loaded.
   */
  textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  /**
   * The vertical alignment of the text with respect to the textbox. Setting this property requires the font the be loaded.
   */
  textAlignVertical: 'TOP' | 'CENTER' | 'BOTTOM'
  /**
   * Whether updating the characters in the text node should update the name of the node. If this is set to true, `name` will be auto-derived from `characters`.
   *
   * @remarks
   *
   * This is automatically reset to false if `name` is modified in order to allow the node to keep the new name.
   */
  autoRename: boolean
  /**
   * The id of the {@link TextStyle} object that the text properties of this node are linked to. Requires the font to be loaded.
   *
   * If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use {@link TextPathNode.setTextStyleIdAsync} to update the style.
   */
  textStyleId: string | PluginAPI['mixed']
  /**
   * Set the {@link TextStyle} that the text properties of this node are linked to. Requires the font to be loaded.
   */
  setTextStyleIdAsync(styleId: string): Promise<void>
  /**
   * The vector paths of the text path node.
   */
  readonly vectorPaths: VectorPaths
  /**
   * The vector network of the text path node.
   */
  readonly vectorNetwork: VectorNetwork
  /**
   * Whether the vector handles are mirrored or independent.
   */
  readonly handleMirroring: HandleMirroring | PluginAPI['mixed']
  /**
   * A data structure defining where the text starts along the path.
   */
  textPathStartData: TextPathStartData
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComponentPropertyType
 */
type ComponentPropertyType = 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'VARIANT' | 'SLOT'
/**
 * @see https://developers.figma.com/docs/plugins/api/InstanceSwapPreferredValue
 */
type InstanceSwapPreferredValue = {
  type: 'COMPONENT' | 'COMPONENT_SET'
  key: string
}
type SlotSettings = {
  stretchChildOnInsert?: boolean
  displayEmptyByDefault?: boolean
  minChildren?: number | null
  maxChildren?: number | null
  allowPreferredValuesOnly?: boolean
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComponentPropertyOptions
 */
type ComponentPropertyOptions = {
  preferredValues?: InstanceSwapPreferredValue[]
  description?: string
  slotSettings?: SlotSettings
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComponentPropertyDefinitions
 */
type ComponentPropertyDefinitions = {
  [propertyName: string]: {
    type: ComponentPropertyType
    defaultValue: string | boolean
    preferredValues?: InstanceSwapPreferredValue[]
    variantOptions?: string[]
    description?: string
    slotSettings?: SlotSettings
    readonly boundVariables?: {
      [field in VariableBindableComponentPropertyDefinitionField]?: VariableAlias
    }
  }
}
interface ComponentSetNode extends BaseFrameMixin, PublishableMixin, ComponentPropertiesMixin {
  /**
   * The type of this node, represented by the string literal "COMPONENT_SET"
   */
  readonly type: 'COMPONENT_SET'
  /**
   * Duplicates the component set as a new component set. Its children will be duplicated as **new** components with no instances of them. By default, the duplicate will be parented under figma.currentPage.
   */
  clone(): ComponentSetNode
  /**
   * The default variant of this component set, which is the top-left-most variant, spatially. This corresponds to the variant that would be inserted when dragging in a component set from the team library in the Figma UI.
   */
  readonly defaultVariant: ComponentNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComponentNode
 */
interface ComponentNode extends DefaultFrameMixin, PublishableMixin, ComponentPropertiesMixin {
  /**
   * The type of this node, represented by the string literal "COMPONENT"
   */
  readonly type: 'COMPONENT'
  /**
   * Duplicates the component node as a **new** component with no instances of it. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): ComponentNode
  /**
   * Creates an instance of this component. By default, the instance will be parented under `figma.currentPage`.
   */
  createInstance(): InstanceNode
  /**
   * Creates a new slot node within this component.
   */
  createSlot(): SlotNode
  /**
   * Returns an array of all of the instances of this component in the document.
   */
  getInstancesAsync(): Promise<InstanceNode[]>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/ComponentProperties
 */
type ComponentProperties = {
  [propertyName: string]: {
    type: ComponentPropertyType
    value: string | boolean
    preferredValues?: InstanceSwapPreferredValue[]
    readonly boundVariables?: {
      [field in VariableBindableComponentPropertyField]?: VariableAlias
    }
  }
}
interface InstanceNode extends DefaultFrameMixin {
  /**
   * The type of this node, represented by the string literal "INSTANCE"
   */
  readonly type: 'INSTANCE'
  /**
   * Duplicates the instance node. The new instance has the same main component. By default, the duplicate's parent is `figma.currentPage`.
   */
  clone(): InstanceNode
  /**
   * The component that this instance reflects. This could be a remote, read-only component. This can be set to turn this instance into a different component. On nested instances (instances inside other instances), setting this value clears all overrides and performs nested instance swapping.
   */
  getMainComponentAsync(): Promise<ComponentNode | null>
  /**
   * The component that this instance reflects. This could be a remote, read-only component. This can be set to turn this instance into a different component. On nested instances (instances inside other instances), setting this value clears all overrides and performs nested instance swapping.
   *
   * If the plugin manifest contains `"documentAccess": "dynamic-page"`, this property is **write-only**. Use {@link InstanceNode.getMainComponentAsync} to read the value.
   */
  mainComponent: ComponentNode | null
  /**
   * Swaps this instance's current main component with `componentNode` and preserves overrides using the same heuristics as instance swap in the Figma editor UI. Note that we may update these override preservation heuristics from time to time.
   *
   * @remarks
   *
   * Learn more about instance swap and override preservation in our <a href="https://help.figma.com/hc/en-us/articles/360039150413-Swap-between-component-instances-in-a-file">help center</a>. If you do not want to preserve overrides when swapping, you should assign to {@link InstanceNode.mainComponent}, which sets the instance's main component directly and clears all overrides.
   */
  swapComponent(componentNode: ComponentNode): void
  /**
   * Sets the component properties and values for this instance. `propertyName` corresponds to the names returned by `componentPropertyDefinitions` and should be suffixed with `'#'` and a unique ID for `'TEXT'`, `'BOOLEAN'`, and `'INSTANCE_SWAP'` properties. Does not support `'SLOT'` properties and will throw `cannotSetSlotProperty`. In the case of name collision, this function prioritizes updating the `'VARIANT'` type properties. Existing properties that are non-specified in the function will maintain their current value.
   */
  setProperties(properties: { [propertyName: string]: string | boolean | VariableAlias }): void
  /**
   * Component properties and values for this instance. If conflicting property names are encountered, prioritizes showing `'VARIANT'` type properties.
   */
  readonly componentProperties: ComponentProperties
  /**
   * Detaches the given instance from its component.  Returns the frame node that results from detaching the instance. For nested instances (instances inside of other instances), also detaches all ancestors nodes that
   * are instances.
   */
  detachInstance(): FrameNode
  /**
   * The scale factor applied to the instance.
   *
   * @remarks
   *
   * Normally, this has value `1`, even if the instance is resized. However, if the instance is resized via the scale tool (shortcut `K`), then the instance is scaled and the scale factor is stored in this property.
   */
  scaleFactor: number
  /**
   * All nested instances that have been exposed to this `InstanceNode`'s level. These nested instances' component properties will be visible at the top level of this `InstanceNode`.
   */
  readonly exposedInstances: InstanceNode[]
  /**
   * Whether this instance has been marked as exposed to its containing `ComponentNode` or `ComponentSetNode`. This property is only writeable on primary `InstanceNode`s contained within a `ComponentNode` or `ComponentSetNode` but is inherited on nested `InstanceNode`s.
   */
  isExposedInstance: boolean
  /**
   * Returns an array of all of the fields directly overridden on this instance. Inherited overrides are not included.
   */
  readonly overrides: {
    id: string
    overriddenFields: NodeChangeProperty[]
  }[]
  /**
   * Removes all direct overrides on this instance.
   */
  removeOverrides(): void
}
interface SlotNode extends DefaultFrameMixin {
  /**
   * The type of this node, represented by the string literal "SLOT"
   */
  readonly type: 'SLOT'
  /**
   * Create a copy of this node. By default, the duplicate will be parented under `figma.currentPage`.
   * The clone is returned as a plain `FrameNode` rather than a `SlotNode`, because slots are
   * defined by a component property reference that only makes sense inside their parent component.
   */
  clone(): FrameNode
  /**
   * Resets a given slot node to the original component slot content.
   */
  resetSlot(): void
  /**
   * The set of limits, configured on the corresponding `'SLOT'` component property's {@link SlotSettings}, that the current contents of this slot violate. Returns an empty array when within limits. Multiple kinds may be present simultaneously (e.g. `['BELOW_MIN', 'HAS_NON_PREFERRED']`), since `HAS_NON_PREFERRED` is independent of the child count. `BELOW_MIN` and `ABOVE_MAX` are mutually exclusive.
   *
   * - `'BELOW_MIN'`: the slot has fewer children than its configured `minChildren`.
   * - `'ABOVE_MAX'`: the slot has more children than its configured `maxChildren`.
   * - `'HAS_NON_PREFERRED'`: the slot contains a child that is not in the property's preferred values, while `allowPreferredValuesOnly` is `true`.
   *
   */
  readonly limitViolations: Array<'BELOW_MIN' | 'ABOVE_MAX' | 'HAS_NON_PREFERRED'>
}
interface BooleanOperationNode
  extends
    DefaultShapeMixin,
    ChildrenMixin,
    CornerMixin,
    ComplexStrokesMixin,
    ContainerMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "BOOLEAN_OPERATION"
   */
  readonly type: 'BOOLEAN_OPERATION'
  /**
   * Duplicates the boolean operation node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): BooleanOperationNode
  /**
   * The type of operation used to combine the children of this node.
   */
  booleanOperation: 'UNION' | 'INTERSECT' | 'SUBTRACT' | 'EXCLUDE'
}
interface StickyNode extends OpaqueNodeMixin, MinimalFillsMixin, MinimalBlendMixin {
  /**
   * The type of this node, represented by the string literal "STICKY"
   */
  readonly type: 'STICKY'
  /**
   * Text sublayer of the StickyNode
   */
  readonly text: TextSublayerNode
  /**
   * Indicates whether the author field is visible
   */
  authorVisible: boolean
  /**
   * Returns the author name.
   */
  authorName: string
  /**
   *  Indicates whether the sticky note has a [wide rectangular shape](https://help.figma.com/hc/en-us/articles/1500004414322-Sticky-notes-in-FigJam#Size), as opposed to a square shape.
   */
  isWideWidth: boolean
  /**
   * Duplicates the node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): StickyNode
}
interface StampNode
  extends DefaultShapeMixin, ConstraintMixin, StickableMixin, AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "STAMP"
   */
  readonly type: 'STAMP'
  /**
   * Duplicates the node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): StampNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TableNode
 */
interface TableNode extends OpaqueNodeMixin, MinimalFillsMixin, MinimalBlendMixin {
  /**
   * The type of this node, represented by the string literal "TABLE"
   */
  readonly type: 'TABLE'
  /**
   * Duplicates the node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): TableNode
  /**
   * The number of rows in the table.
   *
   */
  readonly numRows: number
  /**
   * The number of columns in the table.
   *
   */
  readonly numColumns: number
  /**
   * Returns the table cell node at a specific cell coordinate.
   *
   * @param rowIndex - The index of the row. Must satisfy `0 <= rowIndex < numRows`.
   * @param columnIndex - The index of the column. Must satisfy `0 <= columnInde < numColumns`.
   *
   */
  cellAt(rowIndex: number, columnIndex: number): TableCellNode
  /**
   * Inserts a row before the specified index.
   *
   * @param rowIndex - Index of the new row. Must satisfy `0 <= rowIndex <= numRows`.
   *
   */
  insertRow(rowIndex: number): void
  /**
   * Inserts a column before the specified index.
   *
   * @param columnIndex - Index of the new column. Must satisfy `0 <= columnIndex <= numColumns`.
   *
   */
  insertColumn(columnIndex: number): void
  /**
   * Removes the row at the specified index.
   *
   * @param rowIndex - Index of the row to remove. Must satisfy `0 <= rowIndex < numRows`.
   *
   */
  removeRow(rowIndex: number): void
  /**
   * Removes the column at the specified index.
   *
   * @param columnIndex - Index of the column to remove. Must satisfy `0 <= columnIndex < numColumns`.
   *
   */
  removeColumn(columnIndex: number): void
  /**
   * Moves the row from the start index to the destination index.
   *
   * @param fromIndex - Index of the row to move. Must satisfy `0 <= rowIndex < numRows`.
   * @param toIndex - Index that specifies where the row will be moved before. Must satisfy `0 <= rowIndex < numRows`.
   *
   */
  moveRow(fromIndex: number, toIndex: number): void
  /**
   * Moves the column from the start index to the destination index.
   *
   * @param fromIndex - Index of the column to move. Must satisfy `0 <= columnIndex < numColumns`.
   * @param toIndex - Index that specifies where the column will be moved before. Must satisfy `0 <= columnIndex < numColumns`.
   *
   */
  moveColumn(fromIndex: number, toIndex: number): void
  /**
   * Resizes the row. Rows cannot be resized to be smaller than their minimum size.
   *
   * @param height - New width of the row. Must be `>= 0.01`
   *
   */
  resizeRow(rowIndex: number, height: number): void
  /**
   * Resizes the column. Columns cannot be resized to be smaller than their minimum size.
   *
   * @param width - New width of the column. Must be >= 0.01
   *
   */
  resizeColumn(columnIndex: number, width: number): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TableCellNode
 */
interface TableCellNode extends MinimalFillsMixin {
  /**
   * The type of this node, represented by the string literal "TABLE_CELL"
   */
  readonly type: 'TABLE_CELL'
  /**
   * Text sublayer of the TableCellNode
   */
  readonly text: TextSublayerNode
  /**
   * The row index of this cell relative to its parent table.
   */
  readonly rowIndex: number
  /**
   * The column index of this cell relative to its parent table.
   */
  readonly columnIndex: number

  readonly toString: string

  readonly parent: TableNode

  readonly height: number

  readonly width: number
}
interface HighlightNode
  extends
    DefaultShapeMixin,
    ConstraintMixin,
    CornerMixin,
    VectorLikeMixin,
    StickableMixin,
    AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "HIGHLIGHT"
   */
  readonly type: 'HIGHLIGHT'
  /**
   * Duplicates the highlight node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): HighlightNode
}
interface WashiTapeNode extends DefaultShapeMixin, StickableMixin, AspectRatioLockMixin {
  /**
   * The type of this node, represented by the string literal "WASHI_TAPE"
   */
  readonly type: 'WASHI_TAPE'
  /**
   * Duplicates the washi tape node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): WashiTapeNode
}
interface ShapeWithTextNode
  extends OpaqueNodeMixin, MinimalFillsMixin, MinimalBlendMixin, MinimalStrokesMixin {
  /**
   * The type of this node, represented by the string literal "SHAPE_WITH_TEXT".
   */
  readonly type: 'SHAPE_WITH_TEXT'
  /**
   * The shape of this node.
   *
   * Most shape types have the same name as their tooltip but there are a few exceptions.
   * ENG_DATABASE: Cylinder, ENG_QUEUE: Horizontal cylinder, ENG_FILE: File, ENG_FOLDER: Folder.
   */
  shapeType:
    | 'SQUARE'
    | 'ELLIPSE'
    | 'ROUNDED_RECTANGLE'
    | 'DIAMOND'
    | 'TRIANGLE_UP'
    | 'TRIANGLE_DOWN'
    | 'PARALLELOGRAM_RIGHT'
    | 'PARALLELOGRAM_LEFT'
    | 'ENG_DATABASE'
    | 'ENG_QUEUE'
    | 'ENG_FILE'
    | 'ENG_FOLDER'
    | 'TRAPEZOID'
    | 'PREDEFINED_PROCESS'
    | 'SHIELD'
    | 'DOCUMENT_SINGLE'
    | 'DOCUMENT_MULTIPLE'
    | 'MANUAL_INPUT'
    | 'HEXAGON'
    | 'CHEVRON'
    | 'PENTAGON'
    | 'OCTAGON'
    | 'STAR'
    | 'PLUS'
    | 'ARROW_LEFT'
    | 'ARROW_RIGHT'
    | 'SUMMING_JUNCTION'
    | 'OR'
    | 'SPEECH_BUBBLE'
    | 'INTERNAL_STORAGE'
  /**
   * Text sublayer of the ShapeWithTextNode.
   */
  readonly text: TextSublayerNode
  /**
   * How rounded a shape's corner is.
   */
  readonly cornerRadius?: number
  /**
   * The rotation of the node in degrees. Returns values from -180 to 180. Identical to `Math.atan2(-m10, m00)` in the {@link DimensionAndPositionMixin.relativeTransform} matrix. When setting `rotation`, it will also set `m00`, `m01`, `m10`, `m11`.
   *
   * @remarks
   *
   * The rotation is with respect to the top-left of the object. Therefore, it is independent from the position of the object. If you want to rotate with respect to the center (or any arbitrary point), you can do so via matrix transformations and {@link DimensionAndPositionMixin.relativeTransform}.
   */
  rotation: number
  /**
   * Resize the ShapeWithText.
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01
   */
  resize(width: number, height: number): void
  /**
   * Rescale the ShapeWithText.
   * @param scale - The scale by which to resize the node from the top-left corner.
   */
  rescale(scale: number): void
  /**
   * Duplicates the node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): ShapeWithTextNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/CodeBlockNode
 */
interface CodeBlockNode extends OpaqueNodeMixin, MinimalBlendMixin {
  /**
   * The type of this node, represented by the string literal "CODE_BLOCK"
   */
  readonly type: 'CODE_BLOCK'
  /**
   * The contents of the code block.
   */
  code: string
  /**
   * The language of the code block. New languages will be added to this enum without the major version updating, so be careful not to exhaustively match on this type without a default case.
   */
  codeLanguage:
    | 'TYPESCRIPT'
    | 'CPP'
    | 'RUBY'
    | 'CSS'
    | 'JAVASCRIPT'
    | 'HTML'
    | 'JSON'
    | 'GRAPHQL'
    | 'PYTHON'
    | 'GO'
    | 'SQL'
    | 'SWIFT'
    | 'KOTLIN'
    | 'RUST'
    | 'BASH'
    | 'PLAINTEXT'
    | 'DART'
  /**
   * Duplicates the node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): CodeBlockNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/LabelSublayer
 */
interface LabelSublayerNode {
  fills: Paint[] | PluginAPI['mixed']
}
interface ConnectorNode extends OpaqueNodeMixin, MinimalBlendMixin, MinimalStrokesMixin {
  /**
   * The type of this node, represented by the string literal "CONNECTOR"
   */
  readonly type: 'CONNECTOR'
  /**
   * Text sublayer of the ConnectorNode
   */
  readonly text: TextSublayerNode
  /**
   * Text sublayer of the ConnectorNode
   */
  readonly textBackground: LabelSublayerNode
  /**
   * How rounded a connector's edges are
   */
  readonly cornerRadius?: number
  /**
   * Connector path type
   */
  connectorLineType: 'ELBOWED' | 'STRAIGHT' | 'CURVED'
  /**
   * Connector starting endpoint
   */
  connectorStart: ConnectorEndpoint
  /**
   * Connector ending endpoint
   */
  connectorEnd: ConnectorEndpoint
  /**
   * Connector start stroke cap
   */
  connectorStartStrokeCap: ConnectorStrokeCap
  /**
   * Connector end stroke cap
   */
  connectorEndStrokeCap: ConnectorStrokeCap
  /**
   * The rotation of the node in degrees. Returns values from -180 to 180. Identical to `Math.atan2(-m10, m00)` in the {@link DimensionAndPositionMixin.relativeTransform} matrix. When setting `rotation`, it will also set `m00`, `m01`, `m10`, `m11`.
   *
   * @remarks
   *
   * The rotation is with respect to the top-left of the object. Therefore, it is independent from the position of the object. If you want to rotate with respect to the center (or any arbitrary point), you can do so via matrix transformations and {@link DimensionAndPositionMixin.relativeTransform}.
   */
  rotation: number
  /**
   * Duplicates the node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): ConnectorNode
}
type VariableResolvedDataType = 'BOOLEAN' | 'COLOR' | 'EASING' | 'FLOAT' | 'STRING' | 'TIMING'
interface VariableAlias {
  type: 'VARIABLE_ALIAS'
  id: string
}
type VariableValue = boolean | string | number | RGB | RGBA | MotionEasing | VariableAlias
type VariableScope =
  | 'ALL_SCOPES'
  | 'TEXT_CONTENT'
  | 'CORNER_RADIUS'
  | 'WIDTH_HEIGHT'
  | 'GAP'
  | 'ALL_FILLS'
  | 'FRAME_FILL'
  | 'SHAPE_FILL'
  | 'TEXT_FILL'
  | 'STROKE_COLOR'
  | 'STROKE_FLOAT'
  | 'EFFECT_FLOAT'
  | 'EFFECT_COLOR'
  | 'OPACITY'
  | 'FONT_FAMILY'
  | 'FONT_STYLE'
  | 'FONT_WEIGHT'
  | 'FONT_SIZE'
  | 'LINE_HEIGHT'
  | 'LETTER_SPACING'
  | 'PARAGRAPH_SPACING'
  | 'PARAGRAPH_INDENT'
/**
 * @see https://developers.figma.com/docs/plugins/api/VariableCodeSyntaxPlatform
 */
type CodeSyntaxPlatform = 'WEB' | 'ANDROID' | 'iOS'
interface Variable extends PluginDataMixin {
  /**
   * The unique identifier of this variable.
   */
  readonly id: string
  /** The name of this variable. */
  name: string
  /** Description of this variable. */
  description: string
  /**
   * Whether this variable is hidden when publishing the current file as a library. Can only true if {@link Variable.remote} is false (e.g. this is a local variable).
   *
   * @remarks
   *
   * If the parent {@link VariableCollection} is marked as `hiddenFromPublishing`, then this variable will also be hidden from publishing via the UI.
   * `hiddenFromPublishing` is independently toggled for a variable and collection, however both must be true for a given variable to be publishable.
   */
  hiddenFromPublishing: boolean
  /**
   * Returns the publishing status of this variable in the current file.
   */
  getPublishStatusAsync(): Promise<PublishStatus>
  /** Whether this variable is remote or local. */
  readonly remote: boolean
  /** The ID of the collection that contains this variable. */
  readonly variableCollectionId: string
  /**
   * The key to use with {@link VariablesAPI.importVariableByKeyAsync}. Note that while this key is present on local and published variables, you can only import variables that are already published.
   */
  readonly key: string
  /** The resolved type of the variable. */
  readonly resolvedType: VariableResolvedDataType
  /**
   * Retrieves the resolved value for this variable if it was bound to `consumer`.
   *
   * @remarks
   *
   * The value that a variable resolves to depends on the following:
   *
   * - The node consuming the variable and which of the collection's modes is [currently selected in the node](https://help.figma.com/hc/en-us/articles/15343816063383)
   * - The variable's value for the selected mode
   * - If that value is an alias, then the resolved value is determined using the selected modes of each collection in the alias chain
   *
   * Note: It is not possible to statically determine the resolved value of a variable when there are multiple modes involved (either in the variable itself or in any variables in the alias chain).
   *
   *
   * The consuming node can have any combination of explicit or inherited variable modes per collection assigned to it.
   *
   * Here are some examples illustrating how variables can resolve to different values depending on the consuming node. These examples do not work if the current file is on the Starter plan, which is limited to a single mode.
   *
   * For a variable in a collection with two modes, it can resolve to up to two different values:
   *
   * ```ts title="Simple variable value resolution without aliasing"
   * // Create a collection with two modes and a variable with a different
   * // float value for each mode
   * const collection = figma.variables.createVariableCollection("Collection")
   * const mode1Id = collection.modes[0].modeId
   * const mode2Id = collection.addMode('Mode 2')
   * const variable = figma.variables.createVariable(
   *   "My Variable",
   *   collection,
   *   'FLOAT'
   * )
   * variable.setValueForMode(mode1Id, 1)
   * variable.setValueForMode(mode2Id, 2)
   *
   * const frame = figma.createFrame()
   * frame.setExplicitVariableModeForCollection(collection, mode1Id)
   * // Output: {value: 1, resolvedType: 'FLOAT'}
   * console.log(variable.resolveForConsumer(frame))
   *
   * frame.setExplicitVariableModeForCollection(collection, mode2Id)
   * // Output: {value: 2, resolvedType: 'FLOAT'}
   * console.log(variable.resolveForConsumer(frame))
   * ```
   *
   * For a variable in a collection with two modes with each value aliasing to different variables in another collection with two modes, it can resolve to up to four different values.
   *
   * ```ts title="Variable value resolution with aliasing"
   * // Create two collections:
   * // 1. A collection with two modes and two float variables
   * // 2. A collection with two modes and a variable aliasing to
   * //    different variables in the first collection
   * const collection1 = figma.variables.createVariableCollection("Collection 1")
   * const collection1Mode1Id = collection1.modes[0].modeId
   * const collection1Mode2Id = collection1.addMode('Mode 2')
   * const collection1Var1 = figma.variables.createVariable(
   *   "Variable 1",
   *   collection1,
   *   'FLOAT'
   * )
   * collection1Var1.setValueForMode(collection1Mode1Id, 1)
   * collection1Var1.setValueForMode(collection1Mode2Id, 2)
   * const collection1Var2 = figma.variables.createVariable(
   *   "Variable 2",
   *   collection1,
   *   'FLOAT'
   * )
   * collection1Var2.setValueForMode(collection1Mode1Id, 3)
   * collection1Var2.setValueForMode(collection1Mode2Id, 4)
   *
   * const collection2 = figma.variables.createVariableCollection("Collection 2")
   * const collection2Mode1Id = collection2.modes[0].modeId
   * const collection2Mode2Id = collection2.addMode('Mode 2')
   * const collection2Var = figma.variables.createVariable(
   *   "Variable 1",
   *   collection2,
   *   'FLOAT'
   * )
   * collection2Var.setValueForMode(
   *   collection2Mode1Id,
   *   figma.variables.createVariableAlias(collection1Var1)
   * )
   * collection2Var.setValueForMode(
   *   collection2Mode2Id,
   *   figma.variables.createVariableAlias(collection1Var2)
   * )
   *
   * const frame = figma.createFrame()
   *
   * frame.setExplicitVariableModeForCollection(collection1, collection1Mode1Id)
   * frame.setExplicitVariableModeForCollection(collection2, collection2Mode1Id)
   * // Output: {value: 1, resolvedType: 'FLOAT'}
   * console.log(collection2Var.resolveForConsumer(frame))
   *
   * frame.setExplicitVariableModeForCollection(collection1, collection1Mode2Id)
   * frame.setExplicitVariableModeForCollection(collection2, collection2Mode1Id)
   * // Output: {value: 2, resolvedType: 'FLOAT'}
   * console.log(collection2Var.resolveForConsumer(frame))
   *
   * frame.setExplicitVariableModeForCollection(collection1, collection1Mode1Id)
   * frame.setExplicitVariableModeForCollection(collection2, collection2Mode2Id)
   * // Output: {value: 3, resolvedType: 'FLOAT'}
   * console.log(collection2Var.resolveForConsumer(frame))
   *
   * frame.setExplicitVariableModeForCollection(collection1, collection1Mode2Id)
   * frame.setExplicitVariableModeForCollection(collection2, collection2Mode2Id)
   * // Output: {value: 4, resolvedType: 'FLOAT'}
   * console.log(collection2Var.resolveForConsumer(frame))
   * ```
   */
  resolveForConsumer(consumer: SceneNode): {
    value: VariableValue
    resolvedType: VariableResolvedDataType
  }
  /**
   * Sets the value of this variable for the provided mode. If the modeId belongs to an extended collection, the value will be overridden on the extension.
   */
  setValueForMode(modeId: string, newValue: VariableValue): void
  /**
   * The values for each mode of this variable. Note that this will not resolve any aliases. To return fully resolved values in all cases, consider using {@link Variable.resolveForConsumer}.
   */
  readonly valuesByMode: {
    [modeId: string]: VariableValue
  }
  /** Removes this variable from the document. */
  remove(): void
  /**
   * An array of scopes in the UI where this variable is shown. Setting this property will show/hide this variable in the variable picker UI for different fields.
   *
   * @remarks
   *
   * Setting scopes for a variable does not prevent that variable from being bound in other scopes (for example, via the Plugin API). This only limits the variables that are shown in pickers within the Figma UI.
   */
  scopes: Array<VariableScope>
  /** Code syntax definitions for this variable. Supported platforms are `'WEB'`, `'ANDROID'`, and `'iOS'`. */
  readonly codeSyntax: {
    [platform in CodeSyntaxPlatform]?: string
  }
  /**
   * Add or modify a platform definition on {@link Variable.codeSyntax}. Acceptable platforms are `'WEB'`, `'ANDROID'`, and `'iOS'`.
   * @remarks
   *
   * Here’s an example of adding code syntax definitions to a variable:
   *
   * ```ts
   *  const collection = figma.variables.createVariableCollection(
   *    'Example Collection'
   *  )
   *  const variable = figma.variables.createVariable(
   *    'ExampleVariableName',
   *    collection,
   *    'STRING'
   *  )
   *  variable.setVariableCodeSyntax('WEB', 'example-variable-name')
   *  variable.setVariableCodeSyntax('ANDROID', 'exampleVariableName')
   *  variable.setVariableCodeSyntax('iOS', 'exampleVariableName')
   *
   *  // Output:
   *  // {
   *  //   WEB: 'example-variable-name',
   *  //   ANDROID: 'exampleVariableName',
   *  //   iOS: 'exampleVariableName'
   *  // }
   *
   *  console.log(variable.codeSyntax)
   * ```
   */
  setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void
  /**
   * Remove a platform definition from {@link Variable.codeSyntax}. Acceptable parameters are `'WEB'`, `'ANDROID'`, and `'iOS'` if previously defined.
   */
  removeVariableCodeSyntax(platform: CodeSyntaxPlatform): void
  /**
   * The overridden or inherited values for each mode for the provided collection that inherits this variable. Note that this will not resolve any aliases. To return fully resolved values in all cases, consider using {@link Variable.resolveForConsumer}.
   */
  valuesByModeForCollectionAsync(collection: VariableCollection): Promise<{
    [modeId: string]: VariableValue
  }>
  /**
   * Removes the overridden value for the given mode if it exists and returns to the inherited value.
   */
  removeOverrideForMode(extendedModeId: string): void
}
interface VariableCollection extends PluginDataMixin {
  /**
   * The unique identifier of this variable collection.
   */
  readonly id: string
  /** The name of this variable collection. */
  name: string
  /**
   * Whether this variable collection is hidden when publishing the current file as a library. Can only true if {@link VariableCollection.remote} is false (e.g. this is a local variable collection).
   */
  hiddenFromPublishing: boolean
  /**
   * Returns the publishing status of this variable collection in the current file.
   */
  getPublishStatusAsync(): Promise<PublishStatus>
  /** Whether this variable collection is remote or local. */
  readonly remote: boolean
  /** Whether this variable collection is an extension of another variable collection. */
  readonly isExtension: boolean
  /** The list of modes defined for this variable collection. */
  readonly modes: Array<{
    modeId: string
    name: string
  }>
  /**
   * The list of variables contained in this variable collection.
   *
   * Note that the order of these variables is roughly the same as what is shown in Figma Design,
   * however it does not account for groups. As a result, the order of these variables may not
   * exactly reflect the exact ordering and grouping shown in the authoring UI.
   */
  readonly variableIds: string[]
  /** The default mode ID for this collection. */
  readonly defaultModeId: string
  /**
   * The key to use with {@link TeamLibraryAPI.getVariablesInLibraryCollectionAsync}.
   *
   * Note that while this key is present on local and published variable collections, `TeamLibaryAPI` can only be used to query the variables of variable collections that are already published.
   */
  readonly key: string
  /**
   * Creates an extended variable collection from this variable collection. Returns the newly created extended variable collection. This method is only available on local variable collections.
   *
   * Note: This API is limited to the Enterprise plan.
   * If limited by the current pricing tier, this method will throw an error with the message
   * `in extend: Cannot create extended collections outside of enterprise plan.`
   *
   * See [Figma plans and features](https://help.figma.com/hc/en-us/articles/360040328273) for more information.
   *
   */
  extend(name: string): ExtendedVariableCollection
  /** Removes this variable collection and all of its variables from the document. */
  remove(): void
  /** Removes the given mode by ID. */
  removeMode(modeId: string): void
  /**
   * Adds a new mode with the given name to this collection. Returns the newly created mode ID.
   *
   * Note: This API is limited by the current file's pricing tier.
   * If limited the current pricing tier, this method will throw an error with the message
   * `in addMode: Limited to N modes only`, where N is the mode limit.
   *
   * See [Figma plans and features](https://help.figma.com/hc/en-us/articles/360040328273) for more information.
   *
   */
  addMode(name: string): string
  /** Renames the given mode. */
  renameMode(modeId: string, newName: string): void
}
interface ExtendedVariableCollection extends Omit<VariableCollection, 'addMode'> {
  /** `isExtension` is set to `true` to distinguish an extended collection from base variable collections. */
  readonly isExtension: true
  /**
   * The ID of the parent variable collection.
   */
  readonly parentVariableCollectionId: string
  /**
   * The ID of the root variable collection in the extension chain.
   * This is the collection ID at the top of the parent chain.
   * For example, if Collection C extends B which extends A (root),
   * then `rootVariableCollectionId` is A's ID.
   */
  readonly rootVariableCollectionId: string
  /**
   * The list of variables contained in this extended variable collection including variables that are inherited from its parent collection.
   */
  readonly variableIds: string[]
  /** The overridden variable values in this extended variable collection. */
  readonly variableOverrides: {
    [variableId: string]: {
      [extendedModeId: string]: VariableValue
    }
  }
  /** Removes all overridden values in this extended collection for the given variable. */
  removeOverridesForVariable(variableToClear: Variable): void
  /** The modes inherited from the parent collection. */
  readonly modes: Array<{
    modeId: string
    name: string
    parentModeId: string
  }>
  /** Removes the given mode by ID if its parent mode has been deleted. */
  removeMode(modeId: string): void
}
type AnnotationCategoryColor =
  'yellow' | 'orange' | 'red' | 'pink' | 'violet' | 'blue' | 'teal' | 'green'
interface AnnotationCategory {
  /**
   * The unique identifier of the annotation category.
   */
  readonly id: string
  /**
   * The label of the annotation category.
   */
  readonly label: string
  /**
   * The color of the annotation category.
   */
  readonly color: AnnotationCategoryColor
  /**
   * Whether this annotation category is a preset.
   */
  readonly isPreset: boolean
  /**
   * Removes this annotation category from the document.
   */
  remove(): void
  /** Sets the color of the annotation category. */
  setColor(color: AnnotationCategoryColor): void
  /** Sets the label of the annotation category. */
  setLabel(label: string): void
}
interface WidgetNode extends OpaqueNodeMixin, StickableMixin {
  /**
   * The type of this node, represented by the string literal "WIDGET"
   */
  readonly type: 'WIDGET'
  /**
   * The value specified in widget's `manifest.json` "id" field.
   *
   * If this WidgetNode was created by your widget `WidgetNode.widgetId` will match `figma.widgetId`. This is useful when managing multiple widget nodes that belong to the same `widgetId`.
   */
  readonly widgetId: string
  /**
   *  Returns the synced state stored on the widget. This is only readable by widgets created by the same `manifest.id`.
   *
   * For more information, check out [this page in our widget documentation](https://figma.com/widget-docs/managing-multiple-widgets#widgetnodewidgetsyncedstate).
   */
  readonly widgetSyncedState: {
    [key: string]: any
  }
  /**
   * Create an identical copy of this WidgetNode. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): WidgetNode
}
interface EmbedData {
  /**
   * The srcUrl of an embed is the URL that will be loaded in an iFrame when the embed is activated
   *
   * @example https://www.example.com/embed/items/abcdefg
   */
  srcUrl: string
  /**
   * The canonicalUrl of an embed is the URL that will be navigated to when the embed is opened in an external tab
   *
   * @example https://www.example.com/items/abcdefg
   */
  canonicalUrl: string | null
  /**
   * The title of the embed, as displayed on the canvas
   */
  title: string | null
  /**
   * The description of the embed, as displayed on the canvas
   */
  description: string | null
  /**
   * The name of the provider of an embed.
   *
   * ex. 'Spotify', 'YouTube'
   */
  provider: string | null
}
interface EmbedNode extends OpaqueNodeMixin {
  /**
   * The type of this node, represented by the string literal "EMBED"
   */
  readonly type: 'EMBED'
  /**
   * Readonly metadata about this particular embed
   */
  readonly embedData: EmbedData
  /**
   * Create a copy of this node
   */
  clone(): EmbedNode
}
interface LinkUnfurlData {
  /**
   * The URL of the link being unfurled
   *
   * Example: https://mynewssite.com/stories/abcdefg
   */
  url: string
  /**
   * The title of the link being unfurled
   *
   * Example: "Important News Headline"
   */
  title: string | null
  /**
   * The description of the link being unfurled
   *
   * Example: "An astonishing event happened today in a random part of the world...."
   */
  description: string | null
  /**
   * The provider name of the link being unfurled
   *
   * Example: "CNN" | "The Onion" | "TechCrunch"
   */
  provider: string | null
}
interface LinkUnfurlNode extends OpaqueNodeMixin {
  /**
   * The type of this node, represented by the string literal "LINK_UNFURL"
   */
  readonly type: 'LINK_UNFURL'
  /**
   * Metadata about this link unfurl node
   */
  readonly linkUnfurlData: LinkUnfurlData
  /**
   * Create a copy of this node
   */
  clone(): LinkUnfurlNode
}
interface MediaData {
  /**
   * A unique hash of the contents of the media node
   */
  hash: string
}
interface MediaNode extends OpaqueNodeMixin {
  /**
   * The type of this node, represented by the string literal "MEDIA"
   */
  readonly type: 'MEDIA'
  /**
   * Metadata about this media node
   */
  readonly mediaData: MediaData
  /**
   * Resizes the media node.
   *
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01
   *
   */
  resize(width: number, height: number): void
  /**
   * Resizes the media node without constraints.
   *
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01
   *
   */
  resizeWithoutConstraints(width: number, height: number): void
  /**
   * Create a copy of this node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): MediaNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/SectionNode
 */
interface SectionNode
  extends
    ChildrenMixin,
    MinimalFillsMixin,
    OpaqueNodeMixin,
    AspectRatioLockMixin,
    MinimalStrokesMixin,
    CornerMixin,
    RectangleCornerMixin {
  /**
   * The type of this node, represented by the string literal "SECTION"
   */
  readonly type: 'SECTION'
  /**
   * Whether the section node contents are [marked as hidden](https://help.figma.com/hc/en-us/articles/4939765379351-Organize-your-FigJam-board-with-sections#Hide_section).
   */
  sectionContentsHidden: boolean
  /**
   * Create a copy of this node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): SectionNode
  /**
   * Resizes the section node without constraints.
   *
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01
   *
   */
  resizeWithoutConstraints(width: number, height: number): void
  /**
   * Resizes the section node. Sections do not propagate constraints to their
   * children, so this behaves equivalently to {@link SectionNode.resizeWithoutConstraints}
   * and is provided to match the resize ergonomics of other resizable nodes.
   *
   * @param width - New width of the node. Must be >= 0.01
   * @param height - New height of the node. Must be >= 0.01
   *
   */
  resize(width: number, height: number): void
}
/**
 * @see https://developers.figma.com/docs/plugins/api/SlideNode
 */
interface SlideNode extends BaseFrameMixin {
  /**
   * The type of this node, represented by the string literal "SLIDE"
   */
  readonly type: 'SLIDE'
  /**
   * Create a copy of this node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): SlideNode
  /**
   * Get the {@link SlideTransition} of the slide node.
   */
  getSlideTransition(): SlideTransition
  /**
   * Set the {@link SlideTransition} of the slide node.
   */
  setSlideTransition(transition: SlideTransition): void
  /**
   * Read and set whether or not the slide is skipped in the presentation.
   */
  isSkippedSlide: boolean
  /**
   * Read and set the slide's speaker notes as Markdown. Empty when the slide has
   * no speaker notes.
   */
  speakerNotes: string
}
/**
 * @see https://developers.figma.com/docs/plugins/api/SlideRowNode
 */
interface SlideRowNode extends OpaqueNodeMixin, ChildrenMixin {
  /**
   * The type of this node, represented by the string literal "SLIDE_ROW"
   */
  readonly type: 'SLIDE_ROW'
  /**
   * Create a copy of this node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): SlideRowNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/SlideGridNode
 */
interface SlideGridNode extends OpaqueNodeMixin, ChildrenMixin {
  /**
   * The type of this node, represented by the string literal "SLIDE_GRID"
   */
  readonly type: 'SLIDE_GRID'
  /**
   * You cannot make a copy of a slide grid node and calling this method throw a runtime exception.
   */
  clone(): SlideGridNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode
 */
interface InteractiveSlideElementNode extends OpaqueNodeMixin {
  /**
   * The type of this node, represented by the string literal "INTERACTIVE_SLIDE_ELEMENT"
   */
  readonly type: 'INTERACTIVE_SLIDE_ELEMENT'
  /**
   * The type of interactive slide element this node is.
   */
  readonly interactiveSlideElementType: 'POLL' | 'EMBED' | 'FACEPILE' | 'ALIGNMENT' | 'YOUTUBE'
  /**
   * Create a copy of this node. By default, the duplicate will be parented under `figma.currentPage`.
   */
  clone(): InteractiveSlideElementNode
}
/**
 * @see https://developers.figma.com/docs/plugins/api/SlideTransition
 */
interface SlideTransition {
  /**
   * The type of slide transition.
   */
  readonly style:
    | 'NONE'
    | 'DISSOLVE'
    | 'SLIDE_FROM_LEFT'
    | 'SLIDE_FROM_RIGHT'
    | 'SLIDE_FROM_BOTTOM'
    | 'SLIDE_FROM_TOP'
    | 'PUSH_FROM_LEFT'
    | 'PUSH_FROM_RIGHT'
    | 'PUSH_FROM_BOTTOM'
    | 'PUSH_FROM_TOP'
    | 'MOVE_FROM_LEFT'
    | 'MOVE_FROM_RIGHT'
    | 'MOVE_FROM_TOP'
    | 'MOVE_FROM_BOTTOM'
    | 'SLIDE_OUT_TO_LEFT'
    | 'SLIDE_OUT_TO_RIGHT'
    | 'SLIDE_OUT_TO_TOP'
    | 'SLIDE_OUT_TO_BOTTOM'
    | 'MOVE_OUT_TO_LEFT'
    | 'MOVE_OUT_TO_RIGHT'
    | 'MOVE_OUT_TO_TOP'
    | 'MOVE_OUT_TO_BOTTOM'
    | 'SMART_ANIMATE'
  /**
   * The duration of the slide transition, in seconds.
   */
  readonly duration: number
  /**
   * The easing of the slide transition.
   */
  readonly curve:
    'EASE_IN' | 'EASE_OUT' | 'EASE_IN_AND_OUT' | 'LINEAR' | 'GENTLE' | 'QUICK' | 'BOUNCY' | 'SLOW'
  /**
   * The timing of the slide transition.
   */
  readonly timing: {
    /**
     * The type of timing.
     */
    readonly type: 'ON_CLICK' | 'AFTER_DELAY'
    /**
     * The delay of the timing, in seconds.
     */
    readonly delay?: number
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/node-types
 */
type BaseNode = DocumentNode | PageNode | SceneNode
/**
 * @see https://developers.figma.com/docs/plugins/api/node-types
 */
type SceneNode =
  | SliceNode
  | FrameNode
  | GroupNode
  | ComponentSetNode
  | ComponentNode
  | InstanceNode
  | BooleanOperationNode
  | VectorNode
  | StarNode
  | LineNode
  | EllipseNode
  | PolygonNode
  | RectangleNode
  | TextNode
  | TextPathNode
  | TransformGroupNode
  | StickyNode
  | ConnectorNode
  | ShapeWithTextNode
  | CodeBlockNode
  | StampNode
  | WidgetNode
  | EmbedNode
  | LinkUnfurlNode
  | MediaNode
  | SectionNode
  | HighlightNode
  | WashiTapeNode
  | TableNode
  | SlideNode
  | SlideRowNode
  | SlideGridNode
  | SlotNode
  | InteractiveSlideElementNode
/**
 * @see https://developers.figma.com/docs/plugins/api/node-types
 */
type NodeType = BaseNode['type']
type StyleType = 'PAINT' | 'TEXT' | 'EFFECT' | 'GRID' | 'CUSTOM_ANIMATION'
/**
 * @see https://developers.figma.com/docs/plugins/api/InheritedStyleField
 */
type InheritedStyleField =
  | 'fillStyleId'
  | 'strokeStyleId'
  | 'backgroundStyleId'
  | 'textStyleId'
  | 'effectStyleId'
  | 'gridStyleId'
  | 'strokeStyleId'
/**
 * @see https://developers.figma.com/docs/plugins/api/StyleConsumers
 */
interface StyleConsumers {
  /**
   * Node consuming style. */
  node: SceneNode
  /** Field in which style is applied. */
  fields: InheritedStyleField[]
}
interface BaseStyleMixin extends PublishableMixin, PluginDataMixin {
  /**
   * The unique identifier of the style in the document the plugin is executing from. You can assign this value via `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setTextStyleIdAsync`, etc. to make the node properties reflect that of the style node.
   */
  readonly id: string

  readonly type: StyleType
  /**
   * The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).
   */
  getStyleConsumersAsync(): Promise<StyleConsumers[]>
  /**
   * The name of the style node. Note that setting this also sets "autoRename" to false on {@link TextNode}.
   */
  name: string
  /**
   * Deletes a local style.
   */
  remove(): void
}
interface PaintStyle extends BaseStyleMixin {
  /**
   * The string literal "PAINT" representing the style type. Always check the `type` before reading other properties.
   */
  type: 'PAINT'
  /**
   * List of {@link Paint} to replace the `fills`, `strokes`, or `backgrounds` property with.
   */
  paints: ReadonlyArray<Paint>
  /**
   * The variables bound to a particular field on this paint style.
   */
  readonly boundVariables?: {
    readonly [field in VariableBindablePaintStyleField]?: VariableAlias[]
  }
}
interface TextStyle extends BaseStyleMixin {
  /**
   * The string literal "TEXT" representing the style type. Always check the `type` before reading other properties.
   */
  type: 'TEXT'
  /**
   * Value to replace the text {@link BaseNonResizableTextMixin.fontSize} with.
   */
  fontSize: number
  /**
   * Value to replace the text {@link NonResizableTextMixin.textDecoration} with.
   */
  textDecoration: TextDecoration
  /**
   * Value to replace the text {@link BaseNonResizableTextMixin.fontName} with. For [variable fonts](https://developers.figma.com/docs/plugins/api/FontName), this includes {@link FontName.variationSettings}.
   */
  fontName: FontName
  /**
   * Value to replace the text {@link BaseNonResizableTextMixin.letterSpacing} with.
   */
  letterSpacing: LetterSpacing
  /**
   * Value to replace the text {@link NonResizableTextMixin.lineHeight} with.
   */
  lineHeight: LineHeight
  /**
   * Value to replace the text {@link NonResizableTextMixin.leadingTrim} with.
   */
  leadingTrim: LeadingTrim
  /**
   * Value to replace the text {@link NonResizableTextMixin.paragraphIndent} with.
   */
  paragraphIndent: number
  /**
   * Value to replace the text {@link NonResizableTextMixin.paragraphSpacing} with.
   */
  paragraphSpacing: number
  /**
   * Value to replace the text {@link NonResizableTextMixin.textWrapStyle} with.
   */
  textWrapStyle: TextWrapStyle
  /**
   * Value to replace the text {@link NonResizableTextMixin.listSpacing} with.
   */
  listSpacing: number
  /**
   * Value to replace the text {@link NonResizableTextMixin.hangingPunctuation} with.
   */
  hangingPunctuation: boolean
  /**
   * Value to replace the text {@link NonResizableTextMixin.hangingList} with.
   */
  hangingList: boolean
  /**
   * Value to replace the text {@link BaseNonResizableTextMixin.textCase} with.
   */
  textCase: TextCase
  /**
   * The variables bound to a particular field on this text style.
   */
  boundVariables?: {
    [field in VariableBindableTextField]?: VariableAlias
  }
  /**
   * Binds the provided `field` on this node to the given variable. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables) guide for how to get and set variable bindings.
   *
   * If `null` is provided as the variable, the given `field` will be unbound from any variables.
   *
   * @param field - The field to bind the variable to.
   * @param variable - The variable to bind to the field. If `null` is provided, the field will be unbound from any variables. Make sure to pass a Variable object or null; passing a variable ID is not supported.
   */
  setBoundVariable(field: VariableBindableTextField, variable: Variable | null): void
}
interface EffectStyle extends BaseStyleMixin {
  /**
   * The string literal "EFFECT" representing the style type. Always check the `type` before reading other properties.
   */
  type: 'EFFECT'
  /**
   * List of {@link Effect} to replace the `effects` property with.
   */
  effects: ReadonlyArray<Effect>
  /**
   * The variables bound to a particular field on this effect style.
   */
  readonly boundVariables?: {
    readonly [field in VariableBindableEffectStyleField]?: VariableAlias[]
  }
}
interface GridStyle extends BaseStyleMixin {
  /**
   * The string literal "GRID" representing the style type. Always check the `type` before reading other properties.
   */
  type: 'GRID'
  /**
   * List of {@link LayoutGrid} to replace the `layoutGrids` property with.
   */
  layoutGrids: ReadonlyArray<LayoutGrid>
  /**
   * The variables bound to a particular field on this grid style.
   */
  readonly boundVariables?: {
    readonly [field in VariableBindableGridStyleField]?: VariableAlias[]
  }
}
interface CustomAnimationStyle extends BaseStyleMixin {
  /**
   * The string literal "CUSTOM_ANIMATION" representing the style type. Always check the `type` before reading other properties.
   */
  type: 'CUSTOM_ANIMATION'

  /**
   * The Figma animations contained in this custom animation style, in order.
   *
   * @remarks
   * ```ts
   * const [style] = await figma.getLocalCustomAnimationStylesAsync()
   * for (const entry of style?.animationEntries ?? []) {
   *   console.log(entry.id, entry.name, entry.props)
   * }
   * ```
   */
  readonly animationEntries: AnimationEntry[]

  /**
   * Adds a Figma animation to this custom animation style and resolves with the
   * created entry. Throws if the style is remote, or if the animation cannot be
   * added programmatically.
   *
   * @param styleId - The `styleId` of the Figma animation style to add, from {@link MotionAPI.figmaAnimationStyles}.
   * @param props - Optional property overrides for the new entry.
   *
   * @remarks
   * ```ts
   * const style = figma.createCustomAnimationStyle()
   * const [opacity] = figma.motion.figmaAnimationStyles()
   * if (opacity) {
   *   const entry = await style.addAnimationEntryAsync(opacity.styleId)
   *   console.log(entry.id, entry.name)
   * }
   * ```
   */
  addAnimationEntryAsync(
    styleId: string,
    props?: { readonly [key: string]: AnimationStylePropValue },
  ): Promise<AnimationEntry>

  /**
   * Removes an animation entry from this custom animation style. Throws if the
   * style is remote, or if the style has no entry with that id.
   *
   * @param id - The `id` of the entry to remove, read from {@link CustomAnimationStyle.animationEntries}.
   */
  removeAnimationEntry(id: string): void
}
type BaseStyle = PaintStyle | TextStyle | EffectStyle | GridStyle | CustomAnimationStyle
interface Image {
  /**
   * A unique hash of the contents of the image file.
   */
  readonly hash: string
  /**
   * The contents of the corresponding image file. This returns a promise because the image may still need to be downloaded (images in Figma are loaded separately from the rest of the document).
   */
  getBytesAsync(): Promise<Uint8Array>
  /**
   * The width and height of the image in pixels. This returns a promise because the image may still need to be downloaded (images in Figma are loaded separately from the rest of the document).
   */
  getSizeAsync(): Promise<{
    width: number
    height: number
  }>
}
/**
 * @see https://developers.figma.com/docs/plugins/api/FindAllCriteria
 */
interface FindAllCriteria<T extends NodeType[]> {
  /**
   * If specified, the search will match nodes that have one of the given types.
   *
   * ```ts
   * // Find children of type text or frame.
   * node.findAllWithCriteria({ types: ["TEXT", "FRAME"] })
   * ```
   */
  types?: T
  /**
   * If specified, the search will match nodes that have {@link PluginDataMixin.getPluginData | PluginData} stored for your plugin.
   *
   * ```ts
   * // Find children that have plugin data stored.
   * node.findAllWithCriteria({ pluginData: {} })
   *
   * // Find children that have plugin data stored with keys
   * // "a" or "b"
   * node.findAllWithCriteria({
   *   pluginData: {
   *     keys: ["a", "b"]
   *   }
   * })
   * ```
   */
  pluginData?: {
    keys?: string[]
  }
  /**
   * If specified, the search will match nodes that have {@link PluginDataMixin.getSharedPluginData | SharedPluginData} stored on the given `namespace` and `keys`.
   *
   * ```ts
   * // Find children that have shared plugin data
   * // on the "foo" namespace.
   * node.findAllWithCriteria({
   *   sharedPluginData: {
   *     namespace: "foo"
   *   }
   * })
   *
   * // Find children that have shared plugin data
   * // on the "foo" namespace with keys "a" or "b"
   * node.findAllWithCriteria({
   *   sharedPluginData: {
   *     namespace: "foo",
   *     keys: ["a", "b"]
   *   }
   * })
   * ```
   */
  sharedPluginData?: {
    namespace: string
    keys?: string[]
  }
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TransformModifier
 */
type TransformModifier = LinearRepeatModifier | RadialRepeatModifier
/**
 * @see https://developers.figma.com/docs/plugins/api/TransformModifier
 * Base interface for repeat transform modifiers.
 */
interface RepeatModifier {
  /** Type of transform modifier. Currently, only 'REPEAT' is supported. */
  type: 'REPEAT'
  /** Number of times to repeat the children. */
  count: number
  /** Unit for the offset between each repetition. `RELATIVE` refers to the size of the child node, while `PIXELS` refers to an absolute pixel value. */
  unitType: 'RELATIVE' | 'PIXELS'
  /** Offset between each repetition. For `LINEAR` repeats, this is the distance between each repetition along the specified axis. For `RADIAL` repeats, this is the distance from the center of the group to the repeated nodes. */
  offset: number
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TransformModifier
 * Interface for linear repeat transform modifiers.
 */
interface LinearRepeatModifier extends RepeatModifier {
  /** Type of repeat modifier. */
  repeatType: 'LINEAR'
  /** Axis along which to repeat the children. */
  axis: 'HORIZONTAL' | 'VERTICAL'
}
/**
 * @see https://developers.figma.com/docs/plugins/api/TransformModifier
 * Interface for radial repeat transform modifiers.
 */
interface RadialRepeatModifier extends RepeatModifier {
  /** Type of repeat modifier. */
  repeatType: 'RADIAL'
}
/** Result returned by node.query(). */
interface QueryResult extends Iterable<SceneNode> {
  readonly length: number
  first(): SceneNode | null
  last(): SceneNode | null
  toArray(): SceneNode[]
  each(callback: (node: SceneNode, index: number) => void): QueryResult
  map<T>(callback: (node: SceneNode, index: number) => T): T[]
  filter(callback: (node: SceneNode, index: number) => boolean): QueryResult
  values(keys: string[]): Record<string, unknown>[]
  set(props: Record<string, unknown>): QueryResult
  query(selector: string): QueryResult
}
interface ScreenshotOptions {
  /** Defaults to 0.5 and is capped to a 1024px maximum dimension. */
  scale?: number
  /** Include overlapping content from sibling nodes when false. */
  contentsOnly?: boolean
}
interface BaseNodeMixin {
  /**
   * Set multiple properties and return this node.
   */
  set(props: Record<string, unknown>): this
  /**
   * Query this node's subtree with a CSS-like selector.
   */
  query(selector: string): QueryResult
  /**
   * Test whether this node matches a CSS-like selector.
   */
  matches(selector: string): boolean
}
interface SceneNodeMixin {
  /**
   * Export this node as a PNG and write the result to figma.io for inspection.
   *
   * @param settings Screenshot options, if applicable
   */
  screenshot(settings?: ScreenshotOptions): Promise<void>
  /**
   * Show or hide the in-progress shimmer overlay.
   */
  placeholder: boolean
  /**
   * Generates a pretty-printed string representation of the node tree with
   * indentation for nested children.
   *
   * @param options - The options for the tree. `fields` is an array of fields to include for each node, and supports path projection.
   *
   */
  tree(options?: { maxDepth?: number; maxChildren?: number; fields?: string[] }): string
}
interface PluginAPI {
  /**
   * Write output files to the tool response.
   */
  readonly io: {
    /**
     * Write image or data output to the tool response.
     */
    write(path: string, data: Uint8Array | string): void
  }
}
interface PageNode {
  /**
   * Computes optimal placement bounds for a new top-level node,
   * avoiding collisions with existing nodes on the page.
   *
   * Only callable on the current page — throws if called on a
   * non-active page reference.
   *
   * @param size - The size of the node to be placed
   *
   * @returns The bounds of where the node should be placed if it can be placed
   *   without collision, null otherwise.
   */
  findPlacement(size: { width: number; height: number }): Rect | null
}

// FigQuery-specific builder APIs. The declarations above match production.

/**
 * Picks only non-function writable properties from an object so
 * we can block invalid writes to node properties
 */
type NonFunctionWritableProperties<Type> = {
  [
    Key in keyof Type as Type[Key] extends Function
      ? never
      : (<T>() => T extends { [K in Key]: Type[K] } ? 1 : 2) extends <T>() => T extends Readonly<{
            [K in Key]: Type[K]
          }>
            ? 1
            : 2
        ? never
        : Key
  ]: Type[Key]
}

/**
 * `$fig` creator / `.set` opts for a node `T`. Same shape as
 * `FigCreatorOpts<T>` plus two affordances for binding
 * styles directly off the node's natural property names:
 *
 * - `fills` / `strokes` also accept a `FigPlanPaintStyle`,
 *   `effects` accepts a `FigPlanEffectStyle`,
 *   `layoutGrids` accepts a `FigPlanGridStyle`.
 *   `$fig` reroutes those values through the corresponding `*StyleId` setter
 *   at flush time; plain paint/effect/grid arrays still apply verbatim.
 * - `textStyle?: FigPlanTextStyle` is added as a synthetic property for nodes
 *   that carry a `textStyleId` (i.e. `TextNode`). The underlying scene node
 *   has no `textStyle` field; `$fig` routes this to `textStyleId`.
 *
 * Distributive over `T` so unions like `SceneNode` map to a union of
 * per-member opts (each member keeps its own property keys).
 */
type FigCreatorOpts<T> = T extends unknown
  ? Partial<{
      [K in keyof NonFunctionWritableProperties<T>]: K extends 'fills' | 'strokes'
        ? NonFunctionWritableProperties<T>[K] | FigPlanPaintStyle
        : K extends 'effects'
          ? NonFunctionWritableProperties<T>[K] | FigPlanEffectStyle
          : K extends 'layoutGrids'
            ? NonFunctionWritableProperties<T>[K] | FigPlanGridStyle
            : NonFunctionWritableProperties<T>[K]
    }> &
      (T extends { textStyleId: unknown } ? { textStyle?: FigPlanTextStyle } : {})
  : never

/**
 * The `$fig` builder API.
 *
 * All node-creation and mutation calls are recorded into a plan; call
 * `await $fig.done()` to materialize every queued operation in one batch.
 */
interface FigAPI {
  /**
   * Creates a top-level frame on the current page.
   * @param name Node name shown in Figma.
   * @param opts Frame properties (layoutMode, fills, padding, cornerRadius, etc.).
   * @param children Existing plan nodes to reparent into the new frame.
   */
  frame(opts?: FigCreatorOpts<FrameNode>, children?: FigPlanNode[]): FigPlanNode
  /**
   * Creates a top-level frame with auto-layout pre-configured (both axes
   * hugging content). Default `layoutMode` is `'HORIZONTAL'`; pass
   * `layoutMode: 'VERTICAL'` in `opts` to switch.
   */
  autoLayout(opts?: FigCreatorOpts<FrameNode>, children?: FigPlanNode[]): FigPlanNode
  text(opts?: FigCreatorOpts<TextNode>): FigPlanNode
  rect(opts?: FigCreatorOpts<RectangleNode>, children?: FigPlanNode[]): FigPlanNode
  ellipse(opts?: FigCreatorOpts<EllipseNode>, children?: FigPlanNode[]): FigPlanNode
  component(opts?: FigCreatorOpts<ComponentNode>, children?: FigPlanNode[]): FigPlanNode
  section(opts?: FigCreatorOpts<SectionNode>, children?: FigPlanNode[]): FigPlanNode
  line(opts?: FigCreatorOpts<LineNode>, children?: FigPlanNode[]): FigPlanNode
  star(opts?: FigCreatorOpts<StarNode>, children?: FigPlanNode[]): FigPlanNode
  page(opts?: FigCreatorOpts<PageNode>, children?: FigPlanNode[]): FigPlanNode
  vector(opts?: FigCreatorOpts<VectorNode>, children?: FigPlanNode[]): FigPlanNode
  polygon(opts?: FigCreatorOpts<PolygonNode>, children?: FigPlanNode[]): FigPlanNode
  sticky(opts?: FigCreatorOpts<StickyNode>, children?: FigPlanNode[]): FigPlanNode
  connector(opts?: FigCreatorOpts<ConnectorNode>, children?: FigPlanNode[]): FigPlanNode
  shapeWithText(opts?: FigCreatorOpts<ShapeWithTextNode>, children?: FigPlanNode[]): FigPlanNode
  codeBlock(opts?: FigCreatorOpts<CodeBlockNode>, children?: FigPlanNode[]): FigPlanNode
  table(opts?: FigCreatorOpts<TableNode>, children?: FigPlanNode[]): FigPlanNode
  slide(opts?: FigCreatorOpts<SlideNode>, children?: FigPlanNode[]): FigPlanNode

  /**
   * Creates a top-level node from an SVG string. The SVG is parsed into a frame containing
   * a vector child.
   * @param name Node name shown in Figma.
   * @param svgStr Valid SVG markup to import.
   * @param opts Additional properties applied to the resulting frame.
   */
  svg(svgStr: string, opts?: FigCreatorOpts<FrameNode>): FigPlanNode

  /**
   * Creates a top-level component from an SVG string.
   * Converts the imported SVG's outer frame directly into a component, preserving its children
   * without adding a wrapping frame.
   * Available in Design and Slides.
   * @param svgStr Valid SVG markup to import.
   * @param opts Additional properties applied to the resulting component.
   */
  svgComponent(svgStr: string, opts?: FigCreatorOpts<ComponentNode>): FigPlanNode

  /**
   * Creates a top-level component instance on the current page.
   * @param compRef ID string of the main component, or a plan node representing it.
   * @param opts Instance properties (`props` key is applied via `setProperties`).
   */
  instance(compRef: string | FigPlanNode, opts?: FigCreatorOpts<InstanceNode>): FigPlanNode

  /**
   * Groups component plan nodes into a component set.
   * @param name Name for the resulting component set.
   * @param opts Component set properties
   * @param components Component plan nodes to include as variants.
   */
  variants(opts?: FigCreatorOpts<ComponentSetNode>, children?: FigPlanNode[]): FigPlanNode

  /**
   * Creates a group out of an array of nodes
   * @param name Name for the resulting group.
   * @param opts Group properties
   * @param components Plan nodes to include as group children.
   */
  group(opts?: FigCreatorOpts<GroupNode>, children?: FigPlanNode[]): FigPlanNode
  union(opts?: FigCreatorOpts<BooleanOperationNode>, children?: FigPlanNode[]): FigPlanNode
  intersect(opts?: FigCreatorOpts<BooleanOperationNode>, children?: FigPlanNode[]): FigPlanNode
  subtract(opts?: FigCreatorOpts<BooleanOperationNode>, children?: FigPlanNode[]): FigPlanNode
  exclude(opts?: FigCreatorOpts<BooleanOperationNode>, children?: FigPlanNode[]): FigPlanNode

  /**
   * Looks up a plan node by its plan ID (e.g. `"__plan_0"`), or wraps a real Figma node ID
   * in a lightweight `_existing` plan node so it can be passed to other `$fig` methods.
   * @param id A plan ID returned by a previous creator call, or any real Figma node ID.
   */
  get(id: string): FigPlanNode

  /**
   * Queries the scene for nodes matching `selector`, starting from `scope`
   * (or the current page if omitted).
   * @param selector CSS-like type/attribute selector (e.g. `"RECTANGLE[name=Foo]"`, `"*"`),
   *   or a predicate function `(node) => boolean`.
   * @param scope Optional root node to restrict the search.
   * @returns A `FigQueryResult` wrapping the matched nodes.
   */
  query(selector: string | ((node: SceneNode) => boolean), scope?: FigPlanNode): FigQueryResult

  /**
   * Queues a property update on an existing or plan node, applied when `$fig.done()` is called.
   * Accepts a plain props object or an updater fn `(node) => ({...newProps})`
   * for read-modify-write. The fn runs at flush time against the materialized
   * `SceneNode`, so you can derive values from current state. Returning
   * `undefined` or `null` from the fn makes that node a no-op.
   * @param target The node to update.
   * @param optsOrFn Properties to set, or a fn returning props derived from the live node.
   * @returns The target plan node, for chaining.
   */
  set(
    target: FigPlanNode,
    optsOrFn: FigCreatorOpts<SceneNode> | ((node: SceneNode) => FigCreatorOpts<SceneNode>),
  ): FigPlanNode

  /**
   * Queues one or more nodes for deletion, applied when `$fig.done()` is called.
   * @param targets Nodes to delete.
   */
  delete(...targets: FigPlanNode[]): void

  /**
   * Queues a replacement for the existing target node.
   * @param target The node to replace.
   * @param newPlan The replacement node.
   * @returns The replacement node, for chaining.
   */
  replace(target: FigPlanNode, newPlan: FigPlanNode): FigPlanNode

  /**
   * Creates a new plan node that is a copy of `target`, optionally overriding properties.
   * `target` may be a plan node or the ID string of an existing Figma node.
   * @param target Source plan node or Figma node ID to copy.
   * @param opts Property overrides applied to the clone.
   * @returns The new cloned plan node.
   */
  clone(target: FigPlanNode | string, opts?: FigCreatorOpts<SceneNode>): FigPlanNode

  /**
   * Queues `target` to be moved into `newParent`, applied when `$fig.done()` is called.
   * @param target Node to move.
   * @param newParent Destination parent node.
   * @param index Insertion index within `newParent.children`; appends if omitted.
   */
  move(target: FigPlanNode, newParent: FigPlanNode, index?: number): void

  /**
   * Queues a reorder of `parent`'s children, applied when `$fig.done()` is called.
   * @param parent Node whose children should be reordered.
   * @param children Desired child order as an array of plan nodes.
   */
  reorder(parent: FigPlanNode, children: FigPlanNode[]): void

  /**
   * Appends `child` as a child of `parent` within the plan tree.
   * @returns `parent`, for chaining.
   */
  add(parent: FigPlanNode, child: FigPlanNode): FigPlanNode

  /**
   * Alias for `add()`. Appends `child` as a child of `parent` within the plan tree.
   * @returns `parent`, for chaining.
   */
  append(parent: FigPlanNode, child: FigPlanNode): FigPlanNode

  /**
   * Inserts `child` at `index` within `parent`'s children.
   * @param parent Destination parent node.
   * @param index Zero-based insertion position.
   * @param child Node to insert.
   * @returns `parent`, for chaining.
   */
  addAt(parent: FigPlanNode, index: number, child: FigPlanNode): FigPlanNode

  /**
   * Queues a gradient fill on `node`, applied when `$fig.done()` is called.
   * @param node Target node.
   * @param type Gradient style: `"LINEAR"`, `"RADIAL"`, `"ANGULAR"`, or `"DIAMOND"`.
   * @param stops Color stops defining the gradient.
   * @param transform Optional 2×3 affine transform matrix for the gradient.
   */
  gradient(node: FigPlanNode, type: string, stops: GradientStop[], transform?: unknown): void

  /**
   * Queues an image fill on `node`, applied when `$fig.done()` is called.
   * @param node Target node.
   * @param hash Figma image hash (40-character hex string).
   * @param scaleMode Fill scale mode: `"FILL"`, `"FIT"`, `"CROP"`, or `"TILE"`. Defaults to `"FILL"`.
   */
  image(node: FigPlanNode, hash: string, scaleMode?: string): void

  /**
   * Queues a paint style creation. `opts.name` is required. Returns a
   * `FigPlanPaintStyle` handle that can be passed directly into the `fills` or
   * `strokes` property of any node creator (or `node.set()`) — `$fig` reroutes
   * the property to `fillStyleId` / `strokeStyleId` at flush time.
   */
  paintStyle(
    opts: { name: string } & Partial<NonFunctionWritableProperties<PaintStyle>>,
  ): FigPlanPaintStyle

  /**
   * Queues a text style creation. `opts.name` is required. Fonts referenced via
   * `fontName` are loaded automatically before the style is materialized. Pass the
   * returned handle in a `TextNode`'s `textStyle` property to bind by id.
   */
  textStyle(
    opts: { name: string } & Partial<NonFunctionWritableProperties<TextStyle>>,
  ): FigPlanTextStyle

  /**
   * Queues an effect style creation. `opts.name` is required. Pass the returned
   * handle in a node's `effects` property to bind by id.
   */
  effectStyle(
    opts: { name: string } & Partial<NonFunctionWritableProperties<EffectStyle>>,
  ): FigPlanEffectStyle

  /**
   * Queues a grid style creation. `opts.name` is required. Pass the returned handle
   * in a frame's `layoutGrids` property to bind by id.
   */
  gridStyle(
    opts: { name: string } & Partial<NonFunctionWritableProperties<GridStyle>>,
  ): FigPlanGridStyle

  /**
   * Wrap a local style by ID/name or queue a library import by key.
   * Missing names fail when the plan is flushed. Read `.style` after `done()`.
   */
  getStyle(nameOrIdOrKey: string): FigPlanStyle

  /**
   * Queues a new variable collection creation. `opts.name` and `opts.modes`
   * (non-empty string array of mode names) are required. Returns a
   * `FigPlanVarCollection` handle whose `.colorVar` / `.numVar` / `.boolVar` /
   * `.stringVar` methods create variables inside this collection.
   */
  varCollection(
    opts: { name: string; modes: string[] } & Partial<
      NonFunctionWritableProperties<VariableCollection>
    >,
  ): FigPlanVarCollection

  /**
   * Wraps an existing variable collection as a `FigPlanVarCollection`. Tries
   * the argument as a real collection id first, then falls back to scanning
   * local collections by name. Throws if neither lookup hits.
   * @param idOrName Real collection id or local collection name.
   */
  getVarCollection(idOrName: string): FigPlanVarCollection

  /**
   * Wraps an existing variable as a `FigPlanVariable` handle. Accepts a real
   * Figma variable id (e.g. `"VariableID:123:456"`) or library key; library imports are queued.
   * To look up by name within a specific collection, use `coll.getVar(name)`.
   * @param id Real Figma variable id.
   */
  getVar(idOrKey: string): FigPlanVariable

  /**
   * Materializes all queued operations — node creations, property updates, deletions, moves,
   * page switches, and fills — in a single batch. Resets plan state afterward so
   * the next `done()` starts with a clean slate.
   * @returns A promise resolving to a `FigDoneResult` describing what changed.
   */
  done(): Promise<FigDoneResult>
}

/**
 * A plan node returned by `$fig` creator methods and `$fig.get()`. Plan nodes describe
 * Figma nodes that will be created, mutated, or deleted when `$fig.done()` is awaited.
 *
 * Before `done()` resolves, `.id` returns a temporary `"__plan_N"` string. Afterward it
 * reflects the real Figma node ID, so you can pass it to `figma.getNodeById()`.
 */
interface FigPlanNode {
  /** Logical node type as registered in the plan, e.g. `"FRAME"`, `"TEXT"`, `"_existing"`. */
  readonly _type: string
  /**
   * Figma node ID. Returns the temporary plan ID (e.g. `"__plan_0"`) before `done()` is
   * awaited, and the real Figma node ID afterward.
   */
  readonly id: string
  /** Node name as it will appear in Figma. */
  readonly name?: string
  /** Parent plan node in the plan tree, or `null` for root-level nodes. */
  readonly parent: FigPlanNode | null
  /** Ordered list of child plan nodes added to this node before `done()`. */
  readonly children: FigPlanNode[]

  /**
   * The materialized Figma `SceneNode` for this plan node, or `null` if the plan node
   * has not been built yet (pre-`done()`) or the real node was deleted. Use this to
   * call any `SceneNode` API not exposed as a plan step (`exportAsync`,
   * `setBoundVariable`, `getStyledTextSegments`, etc.). The null return doubles as a
   * materialization probe (`if (!rect.node) await $fig.done()`). `$fig.get(realId)`
   * pre-populates this at construction, so `.node` works without `done()` on wrapped
   * existing nodes.
   */
  readonly node: SceneNode | null

  /**
   * Queues a screenshot of this node, applied when `$fig.done()` is called. Image
   * bytes flow through the `figma.io` side channel into the tool response — unlike
   * `SceneNode.screenshot()`, this does NOT return a Promise (do not `await` — `await`
   * on a non-Promise resolves to the value but is misleading; bytes still arrive at
   * flush time). Take one shot per node: `done()` processes mutations before any
   * screenshot fires, so multiple shots of the same node capture the same post-flush
   * state, and `figma.io.write`'s caption-keyed registry collides identical-caption
   * outputs so only the last one survives.
   * @param opts `scale` defaults to `0.5x` capped so the largest output dimension
   *   stays ≤ 1024 px. `contentsOnly` defaults to `false`.
   * @returns `this`, for chaining.
   */
  screenshot(opts?: { scale?: number; contentsOnly?: boolean }): FigPlanNode

  /**
   * Appends a new child frame to this node.
   * @param name Node name shown in Figma.
   * @param opts Frame properties (layout, fills, padding, etc.).
   * @param children Existing plan nodes to reparent into the new frame.
   */
  frame(opts?: FigCreatorOpts<FrameNode>, children?: FigPlanNode[]): FigPlanNode
  /**
   * Appends a new child frame with auto-layout pre-configured (both axes
   * hugging content). Default `layoutMode` is `'HORIZONTAL'`; pass
   * `layoutMode: 'VERTICAL'` in `opts` to switch.
   */
  autoLayout(opts?: FigCreatorOpts<FrameNode>, children?: FigPlanNode[]): FigPlanNode
  text(opts?: FigCreatorOpts<TextNode>): FigPlanNode
  rect(opts?: FigCreatorOpts<RectangleNode>, children?: FigPlanNode[]): FigPlanNode
  ellipse(opts?: FigCreatorOpts<EllipseNode>, children?: FigPlanNode[]): FigPlanNode
  component(opts?: FigCreatorOpts<ComponentNode>, children?: FigPlanNode[]): FigPlanNode
  section(opts?: FigCreatorOpts<SectionNode>, children?: FigPlanNode[]): FigPlanNode
  line(opts?: FigCreatorOpts<LineNode>, children?: FigPlanNode[]): FigPlanNode
  star(opts?: FigCreatorOpts<StarNode>, children?: FigPlanNode[]): FigPlanNode
  page(opts?: FigCreatorOpts<PageNode>, children?: FigPlanNode[]): FigPlanNode
  vector(opts?: FigCreatorOpts<VectorNode>, children?: FigPlanNode[]): FigPlanNode
  polygon(opts?: FigCreatorOpts<PolygonNode>, children?: FigPlanNode[]): FigPlanNode
  sticky(opts?: FigCreatorOpts<StickyNode>, children?: FigPlanNode[]): FigPlanNode
  connector(opts?: FigCreatorOpts<ConnectorNode>, children?: FigPlanNode[]): FigPlanNode
  shapeWithText(opts?: FigCreatorOpts<ShapeWithTextNode>, children?: FigPlanNode[]): FigPlanNode
  codeBlock(opts?: FigCreatorOpts<CodeBlockNode>, children?: FigPlanNode[]): FigPlanNode
  table(opts?: FigCreatorOpts<TableNode>, children?: FigPlanNode[]): FigPlanNode
  slide(opts?: FigCreatorOpts<SlideNode>, children?: FigPlanNode[]): FigPlanNode

  /**
   * Appends a child node created from an SVG string to this node. The SVG is parsed into a
   * frame containing one or more vector children.
   * @param name Node name shown in Figma.
   * @param svgStr Valid SVG markup to import.
   * @param opts Additional properties applied to the resulting frame.
   */
  svg(svgStr: string, opts?: FigCreatorOpts<FrameNode>): FigPlanNode

  /**
   * Appends a component created from an SVG string to this node.
   * Converts the imported SVG's outer frame directly into a component, preserving its children
   * without adding a wrapping frame.
   * Available in Design and Slides.
   * @param svgStr Valid SVG markup to import.
   * @param opts Additional properties applied to the resulting component.
   */
  svgComponent(svgStr: string, opts?: FigCreatorOpts<ComponentNode>): FigPlanNode

  /**
   * Appends a child component instance to this node.
   * @param compRef ID string of the main component, or a plan node representing it.
   * @param opts Instance properties (`props` key is applied via `setProperties`).
   */
  instance(compRef: string | FigPlanNode, opts?: FigCreatorOpts<InstanceNode>): FigPlanNode

  /**
   * Adds a `TEXT` component property to the component this node belongs to, bound to this
   * layer's `characters` (the current text becomes the default). Must be called on a node
   * inside a `$fig.component(...)` definition (or a variant component) — throws otherwise.
   * If the component is part of a set, the property lands on the set, and the same property
   * name across variants is de-duplicated into one definition.
   * @param name Property name (e.g. `"Label"`).
   * @returns `this`, for chaining.
   */
  textProp(name: string): FigPlanNode
  /**
   * Adds a `BOOLEAN` component property bound to this layer's `visible` (current visibility
   * is the default). Same placement / de-dup rules as {@link textProp}.
   * @param name Property name (e.g. `"Show Icon"`).
   * @returns `this`, for chaining.
   */
  booleanProp(name: string): FigPlanNode
  /**
   * Adds an `INSTANCE_SWAP` component property bound to this layer's `mainComponent` — this
   * node must be an instance; its main component becomes the default. Same placement / de-dup
   * rules as {@link textProp}.
   * @param name Property name (e.g. `"Icon"`).
   * @returns `this`, for chaining.
   */
  instanceSwapProp(name: string): FigPlanNode

  /**
   * Queues a property update on this node, applied when `$fig.done()` is called.
   * Accepts a plain props object or an updater fn `(node) => ({...newProps})`
   * for read-modify-write. The fn runs at flush time against the materialized
   * `SceneNode`. Returning `undefined` or `null` is a no-op for this node.
   * @param optsOrFn Properties to set, or a fn returning props derived from the live node.
   * @returns `this`, for chaining.
   */
  set(
    optsOrFn: FigCreatorOpts<SceneNode> | ((node: SceneNode) => FigCreatorOpts<SceneNode>),
  ): FigPlanNode

  /**
   * Queues this node for deletion, applied when `$fig.done()` is called.
   * @returns `this`, for chaining.
   */
  remove(): FigPlanNode

  /**
   * Creates a new plan node that is a copy of this node, optionally overriding properties.
   * @param opts Property overrides to apply to the clone.
   * @returns The new cloned plan node.
   */
  clone(opts?: FigCreatorOpts<SceneNode>): FigPlanNode

  /**
   * Queues this node to be moved to `newParent`, applied when `$fig.done()` is called.
   * @param newParent Destination parent node.
   * @param index Insertion index within `newParent.children`; appends if omitted.
   * @returns `this`, for chaining.
   */
  moveTo(newParent: FigPlanNode, index?: number): FigPlanNode

  /**
   * Queues a reorder of this node's children by ID, applied when `$fig.done()` is called.
   * @param children Desired child order as an array of plan nodes.
   * @returns `this`, for chaining.
   */
  reorderChildren(children: FigPlanNode[]): FigPlanNode

  /**
   * Queues a replacement of this node with `newPlan` in the scene tree, applied when
   * `$fig.done()` is called. The new node is inserted at the same position.
   * @param newPlan Plan node to substitute in place of this one.
   * @returns The replacement plan node.
   */
  replace(newPlan: FigPlanNode): FigPlanNode

  /**
   * Appends `child` as a child of this node within the plan tree.
   * @returns `this`, for chaining.
   */
  add(child: FigPlanNode): FigPlanNode

  /**
   * Alias for `add()`. Appends `child` as a child of this node within the plan tree.
   * @returns `this`, for chaining.
   */
  append(child: FigPlanNode): FigPlanNode

  /**
   * Inserts `child` at the given `index` within this node's children.
   * @param index Zero-based insertion position.
   * @returns `this`, for chaining.
   */
  addAt(index: number, child: FigPlanNode): FigPlanNode

  /**
   * Queues a gradient fill on this node, applied when `$fig.done()` is called.
   * @param type Gradient style: `"LINEAR"`, `"RADIAL"`, `"ANGULAR"`, or `"DIAMOND"`.
   * @param stops Color stops defining the gradient.
   * @param transform Optional 2×3 affine transform matrix for the gradient.
   * @returns `this`, for chaining.
   */
  gradient(type: string, stops: GradientStop[], transform?: unknown): FigPlanNode

  /**
   * Queues an image fill on this node, applied when `$fig.done()` is called.
   * @param hash Figma image hash (40-character hex string).
   * @param scaleMode Fill scale mode: `"FILL"`, `"FIT"`, `"CROP"`, or `"TILE"`. Defaults to `"FILL"`.
   * @returns `this`, for chaining.
   */
  image(hash: string, scaleMode?: string): FigPlanNode

  /**
   * Queries descendants of this node. Before `done()`, only function selectors are supported
   * (string selectors require a materialized node). After `done()`, all selector forms work.
   * @param selector CSS-like type/attribute selector string, or a predicate function.
   * @returns A `FigQueryResult` wrapping the matched nodes.
   */
  query(selector: string | ((node: FigPlanNode) => boolean)): FigQueryResult
}

/**
 * A plan handle representing a paint, text, effect, or grid style. Returned by
 * `$fig.paintStyle` / `textStyle` / `effectStyle` / `gridStyle` (for new styles)
 * and by `$fig.getStyle()` (for existing styles).
 *
 * The handle can be passed directly into any style-bindable property on a node —
 * `fills`, `strokes`, `effects`, `layoutGrids`, or `textStyle`. `$fig` reroutes
 * the property through the corresponding `*StyleId` setter at flush time, so the
 * node binds by id rather than receiving a literal array. The property names (not
 * the `*StyleId` form) are the canonical entry: plain paint/effect/grid arrays
 * still apply verbatim in the same property, so routing only fires when the value
 * is a `FigPlanStyle`.
 *
 * `FigPlanStyle` is the discriminated union of the per-style subtypes. Each
 * subtype tightens `.style` and the `.set` fn arg to the concrete style type
 * (`PaintStyle` / `TextStyle` / `EffectStyle` / `GridStyle`) so you can read
 * type-specific fields (e.g. `paints`, `fontName`, `effects`, `layoutGrids`)
 * without `as` casts. For handles returned by `$fig.getStyle()`, narrow via
 * `handle.style?.type` to recover the concrete subtype.
 */
type FigPlanStyle = FigPlanPaintStyle | FigPlanTextStyle | FigPlanEffectStyle | FigPlanGridStyle

interface FigPlanPaintStyle {
  /** Real Figma style id once materialized, or the temporary plan id before `done()`. For `$fig.getStyle()` wraps this is the real id immediately. */
  readonly id: string
  /** The live Figma `PaintStyle` once materialized, or `null` before `done()`. */
  readonly style: PaintStyle | null
  /**
   * Queues a property update on this paint style, applied when `$fig.done()` is
   * called. Accepts a plain props object or an updater fn receiving the live
   * Figma `PaintStyle`: `s => ({ paints: invertColors(s.paints) })`.
   * @returns `this`, for chaining.
   */
  set(
    optsOrFn: FigCreatorOpts<PaintStyle> | ((style: PaintStyle) => FigCreatorOpts<PaintStyle>),
  ): FigPlanPaintStyle
  /** Queues deletion of this style. @returns `this`, for chaining. */
  remove(): FigPlanPaintStyle
}

interface FigPlanTextStyle {
  readonly id: string
  readonly style: TextStyle | null
  /**
   * Updater fn receives the live Figma `TextStyle` — read `s.fontName`,
   * `s.fontSize`, `s.lineHeight`, etc. directly.
   */
  set(
    optsOrFn: FigCreatorOpts<TextStyle> | ((style: TextStyle) => FigCreatorOpts<TextStyle>),
  ): FigPlanTextStyle
  remove(): FigPlanTextStyle
}

interface FigPlanEffectStyle {
  readonly id: string
  readonly style: EffectStyle | null
  /** Updater fn receives the live Figma `EffectStyle` — read `s.effects` directly. */
  set(
    optsOrFn: FigCreatorOpts<EffectStyle> | ((style: EffectStyle) => FigCreatorOpts<EffectStyle>),
  ): FigPlanEffectStyle
  remove(): FigPlanEffectStyle
}

interface FigPlanGridStyle {
  readonly id: string
  readonly style: GridStyle | null
  /** Updater fn receives the live Figma `GridStyle` — read `s.layoutGrids` directly. */
  set(
    optsOrFn: FigCreatorOpts<GridStyle> | ((style: GridStyle) => FigCreatorOpts<GridStyle>),
  ): FigPlanGridStyle
  remove(): FigPlanGridStyle
}

/** A single color stop in a gradient fill. */
interface GradientStop {
  /** CSS hex string (e.g. `"#06F"`) or an RGBA object with components in [0, 1]. */
  color: string | { r: number; g: number; b: number; a?: number }
  /** Position of the stop along the gradient axis, in [0, 1]. */
  pos: number
}

/**
 * A plan handle representing a Figma variable. Returned by `coll.colorVar` /
 * `coll.numVar` / `coll.boolVar` / `coll.stringVar` (new variables) and by
 * `$fig.getVar(id)` / `coll.getVar(nameOrId)` (existing variables).
 *
 * Pass a `FigPlanNumVar` directly as any numeric node property (`width`,
 * `height`, `opacity`, `cornerRadius`, `paddingLeft`, `itemSpacing`, etc.) in
 * `$fig` creators, `planNode.set`, `$fig.set`, or `queryResult.set` — `$fig`
 * routes it through `setBoundVariable(field, id)` at flush time.
 *
 * Pass a `FigPlanColorVar` as the `color` field of a paint (in `fills` /
 * `strokes`) or as the `color` field of an effect — `$fig` binds it via
 * `setBoundVariableForPaint` / `setBoundVariableForEffect` at flush.
 *
 * Same-plan variable handles (planId before `done()`) only work through the
 * `$fig` plan path. Handles from `$fig.getVar` / `coll.getVar` (real id
 * already set) also work in raw `node.set`.
 */
type FigPlanVariable =
  | FigPlanColorVar
  | FigPlanNumVar
  | FigPlanBoolVar
  | FigPlanStringVar
  | FigPlanTimingVar
  | FigPlanEasingVar

/** Opts accepted by `variable.set()` — writable Variable properties plus `codeSyntax`. */
type FigPlanVariableSetOpts = Partial<NonFunctionWritableProperties<Variable>> & {
  codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
}

interface FigPlanColorVar {
  /** Real variable id after `done()`, or temporary planId before. */
  readonly id: string
  /** Always `'COLOR'`. */
  readonly resolvedType: 'COLOR'
  /** The live Figma `Variable` after `done()`, `null` before. */
  readonly variable: Variable | null
  /** Update variable properties (name, scopes, description, codeSyntax, etc.). Fn receives the live `Variable`. */
  set(optsOrFn: FigPlanVariableSetOpts | ((v: Variable) => FigPlanVariableSetOpts)): FigPlanColorVar
  /** Set a single mode value. `value` may be a hex string or another `FigPlanColorVar` (alias). */
  value(modeName: string, value: string | FigPlanColorVar): FigPlanColorVar
  /** Set all mode values at once. Fn receives the current mode-ID-keyed values map. */
  setValues(
    mapOrFn:
      | Record<string, string | FigPlanColorVar>
      | ((values: Record<string, VariableValue>) => Record<string, string | FigPlanColorVar>),
  ): FigPlanColorVar
  /** Queue deletion. */
  remove(): FigPlanColorVar
}

interface FigPlanNumVar {
  readonly id: string
  readonly resolvedType: 'FLOAT'
  readonly variable: Variable | null
  set(optsOrFn: FigPlanVariableSetOpts | ((v: Variable) => FigPlanVariableSetOpts)): FigPlanNumVar
  /** Set a single mode value. `value` may be a number or another `FigPlanNumVar` (alias). */
  value(modeName: string, value: number | FigPlanNumVar): FigPlanNumVar
  setValues(
    mapOrFn:
      | Record<string, number | FigPlanNumVar>
      | ((values: Record<string, VariableValue>) => Record<string, number | FigPlanNumVar>),
  ): FigPlanNumVar
  remove(): FigPlanNumVar
}

interface FigPlanTimingVar {
  readonly id: string
  readonly resolvedType: 'TIMING'
  readonly variable: Variable | null
  set(
    optsOrFn: FigPlanVariableSetOpts | ((v: Variable) => FigPlanVariableSetOpts),
  ): FigPlanTimingVar
  /** Set a single mode value. `value` may be a number or another `FigPlanTimingVar` (alias). */
  value(modeName: string, value: number | FigPlanTimingVar): FigPlanTimingVar
  setValues(
    mapOrFn:
      | Record<string, number | FigPlanTimingVar>
      | ((values: Record<string, VariableValue>) => Record<string, number | FigPlanTimingVar>),
  ): FigPlanTimingVar
  remove(): FigPlanTimingVar
}

interface FigPlanEasingVar {
  readonly id: string
  readonly resolvedType: 'EASING'
  readonly variable: Variable | null
  set(
    optsOrFn: FigPlanVariableSetOpts | ((v: Variable) => FigPlanVariableSetOpts),
  ): FigPlanEasingVar
  /** Set a single mode value. `value` may be a MotionEasing or another `FigPlanEasingVar` (alias). */
  value(modeName: string, value: MotionEasing | FigPlanEasingVar): FigPlanEasingVar
  setValues(
    mapOrFn:
      | Record<string, MotionEasing | FigPlanEasingVar>
      | ((
          values: Record<string, VariableValue>,
        ) => Record<string, MotionEasing | FigPlanEasingVar>),
  ): FigPlanEasingVar
  remove(): FigPlanEasingVar
}

interface FigPlanBoolVar {
  readonly id: string
  readonly resolvedType: 'BOOLEAN'
  readonly variable: Variable | null
  set(optsOrFn: FigPlanVariableSetOpts | ((v: Variable) => FigPlanVariableSetOpts)): FigPlanBoolVar
  value(modeName: string, value: boolean | FigPlanBoolVar): FigPlanBoolVar
  setValues(
    mapOrFn:
      | Record<string, boolean | FigPlanBoolVar>
      | ((values: Record<string, VariableValue>) => Record<string, boolean | FigPlanBoolVar>),
  ): FigPlanBoolVar
  remove(): FigPlanBoolVar
}

interface FigPlanStringVar {
  readonly id: string
  readonly resolvedType: 'STRING'
  readonly variable: Variable | null
  set(
    optsOrFn: FigPlanVariableSetOpts | ((v: Variable) => FigPlanVariableSetOpts),
  ): FigPlanStringVar
  value(modeName: string, value: string | FigPlanStringVar): FigPlanStringVar
  setValues(
    mapOrFn:
      | Record<string, string | FigPlanStringVar>
      | ((values: Record<string, VariableValue>) => Record<string, string | FigPlanStringVar>),
  ): FigPlanStringVar
  remove(): FigPlanStringVar
}

/**
 * A plan handle representing a variable collection. Returned by
 * `$fig.varCollection(opts)` (new) and `$fig.getVarCollection(idOrName)` (existing).
 */
interface FigPlanVarCollection {
  /** Real collection id after `done()`, or temporary planId before. */
  readonly id: string
  /** The live Figma `VariableCollection` after `done()`, `null` before. */
  readonly variableCollection: VariableCollection | null
  /** Create a COLOR variable in this collection. `opts.name` required; `opts.values` as `{ modeName: hexString }`. */
  colorVar(
    opts: {
      name: string
      values?: Record<string, string | FigPlanColorVar>
      scopes?: VariableScope[]
      codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
    } & Partial<NonFunctionWritableProperties<Variable>>,
  ): FigPlanColorVar
  /** Create a FLOAT variable. `opts.values` as `{ modeName: number }`. */
  numVar(
    opts: {
      name: string
      values?: Record<string, number | FigPlanNumVar>
      scopes?: VariableScope[]
      codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
    } & Partial<NonFunctionWritableProperties<Variable>>,
  ): FigPlanNumVar
  /** Create a TIMING (duration in seconds) variable. `opts.values` as `{ modeName: number }`. */
  timingVar(
    opts: {
      name: string
      values?: Record<string, number | FigPlanTimingVar>
      scopes?: VariableScope[]
      codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
    } & Partial<NonFunctionWritableProperties<Variable>>,
  ): FigPlanTimingVar
  /** Create a EASING variable. `opts.values` as `{ modeName: MotionEasing }`. */
  easingVar(
    opts: {
      name: string
      values?: Record<string, MotionEasing | FigPlanEasingVar>
      scopes?: VariableScope[]
      codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
    } & Partial<NonFunctionWritableProperties<Variable>>,
  ): FigPlanEasingVar
  /** Create a BOOLEAN variable. `opts.values` as `{ modeName: boolean }`. */
  boolVar(
    opts: {
      name: string
      values?: Record<string, boolean | FigPlanBoolVar>
      scopes?: VariableScope[]
      codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
    } & Partial<NonFunctionWritableProperties<Variable>>,
  ): FigPlanBoolVar
  /** Create a STRING variable. `opts.values` as `{ modeName: string }`. */
  stringVar(
    opts: {
      name: string
      values?: Record<string, string | FigPlanStringVar>
      scopes?: VariableScope[]
      codeSyntax?: Partial<Record<CodeSyntaxPlatform, string>>
    } & Partial<NonFunctionWritableProperties<Variable>>,
  ): FigPlanStringVar
  /** Wrap an existing variable in this collection by name or real id. Throws if not found. */
  getVar(nameOrId: string): FigPlanVariable
  /** Update collection properties (name, etc.). Fn receives the live `VariableCollection`. */
  set(
    optsOrFn:
      | Partial<NonFunctionWritableProperties<VariableCollection>>
      | ((c: VariableCollection) => Partial<NonFunctionWritableProperties<VariableCollection>>),
  ): FigPlanVarCollection
  /** Queue deletion. */
  remove(): FigPlanVarCollection
}

/** Return value of `$fig.done()`. `created`/`updated`/`deleted` map node IDs to names. */
interface FigDoneResult {
  /** Nodes created during this plan cycle — `{ [nodeId]: nodeName }`. */
  created?: Record<string, string>
  /** Nodes whose properties were updated — `{ [nodeId]: nodeName }`. */
  updated?: Record<string, string>
  /** Nodes that were removed — `{ [nodeId]: nodeName }`. */
  deleted?: Record<string, string>
}

/**
 * The result of `$fig.query()` or a plan node's `.query()`. Wraps a collection of matched
 * nodes and provides bulk-mutation helpers.
 *
 * When querying real Figma nodes (post-`done()`), `first()` and `last()` return the
 * underlying Figma node handle, which carries all standard Figma node properties in addition
 * to the `FigPlanNode` interface.
 */
interface FigQueryResult {
  /** Number of nodes matched by the query. */
  readonly length: number

  /**
   * Returns every matched node as a regular array.
   */
  toArray(): SceneNode[]

  /**
   * Projects every matched node into a regular array.
   * @param fn Callback receiving the node and its zero-based index.
   */
  map<T>(fn: (node: SceneNode, index: number) => T): T[]

  /**
   * Project property paths from every matched node into a structured shape.
   * Supports the same dot/index/`*` grammar as `$fig.query()` predicates —
   * `'fills.0.color.r'` projects through array indexing, `'children.*.type'`
   * projects through every element. See `SceneNode.values()`.
   * @param paths Dot/index/`*` paths to project from each node.
   * @returns One record per matched node, shaped to mirror the requested paths.
   */
  values(paths: string[]): Array<Record<string, unknown>>

  /**
   * Queues a property update on every matched node, applied when `$fig.done()` is called.
   * Accepts a plain props object or an updater fn `(node) => ({...newProps})`
   * for read-modify-write — each match runs the fn against itself at flush
   * time. Returning `undefined` or `null` is a no-op for that node.
   * @param optsOrFn Properties to set, or a fn returning props derived from the live node.
   * @returns `this`, for chaining.
   */
  set(
    optsOrFn: FigCreatorOpts<SceneNode> | ((node: SceneNode) => FigCreatorOpts<SceneNode>),
  ): FigQueryResult

  /**
   * Queues a deletion of every matched node, applied when `$fig.done()` is called.
   * @returns `this`, for chaining.
   */
  remove(): FigQueryResult

  /**
   * Queues a move of every matched node into `newParent`, applied when `$fig.done()` is called.
   * @param newParent Destination parent node.
   * @param index Insertion index within `newParent.children`; appends if omitted.
   * @returns `this`, for chaining.
   */
  moveTo(newParent: FigPlanNode, index?: number): FigQueryResult

  /**
   * Calls `fn` for every matched node in order.
   * @param fn Callback receiving the node and its zero-based index.
   * @returns `this`, for chaining.
   */
  each(fn: (node: SceneNode, index: number) => void): FigQueryResult

  /**
   * Returns the first matched node, or `null` if the result set is empty.
   */
  first(): SceneNode | null

  /**
   * Returns the last matched node, or `null` if the result set is empty.
   */
  last(): SceneNode | null

  /**
   * Returns a new `FigQueryResult` containing only the nodes for which `fn` returns `true`.
   * @param fn Predicate receiving the node and its zero-based index.
   */
  filter(fn: (node: SceneNode, index: number) => boolean): FigQueryResult
}

// prettier-ignore
export { PluginAPI, VariablesAPI, LibraryVariableCollection, LibraryVariable, AnnotationsAPI, BuzzTextField, BuzzMediaField, TeamLibraryAPI, MotionAPI, UtilAPI, ViewportAPI, SuggestionResults, ParametersAPI, NodeChangeProperty, Transform, Vector, Rect, RGB, RGBA, FontName, FontVariationSettings, FontNameInput, TextCase, TextDecoration, TextDecorationStyle, FontStyle, TextDecorationOffset, TextDecorationThickness, TextDecorationColor, OpenTypeFeature, ArcData, DropShadowEffect, InnerShadowEffect, BlurEffectBase, BlurEffectNormal, BlurEffectProgressive, BlurEffect, NoiseEffectBase, NoiseEffectMonotone, NoiseEffectDuotone, NoiseEffectMultitone, NoiseEffect, TextureEffect, GlassEffect, ShaderEffect, Effect, ConstraintType, Constraints, ColorStop, ImageFilters, SolidPaint, GradientPaint, ImagePaint, VideoPaint, PatternPaint, ShaderPaint, Paint, ShaderPropertyValue, ShaderPropertyDefinition, Shader, Guide, RowsColsLayoutGrid, GridLayoutGrid, LayoutGrid, ExportSettingsConstraints, ExportSettingsImage, ExportSettingsSVGBase, ExportSettingsSVG, ExportSettingsSVGString, ExportSettingsPDF, ExportSettingsREST, ExportSettings, WindingRule, VectorVertex, VectorSegment, VectorRegion, VectorNetwork, VectorPath, VectorPaths, LetterSpacing, LineHeight, LeadingTrim, TextWrapStyle, HyperlinkTarget, TextListOptions, BlendMode, MaskType, Font, TextStyleOverrideType, StyledTextSegment, TextPathStartData, Reaction, VariableDataType, ExpressionFunction, Expression, VariableValueWithExpression, VariableData, ConditionalBlock, Action, SimpleTransition, DirectionalTransition, Transition, Trigger, Navigation, Easing, EasingFunctionBezier, EasingFunctionSpring, MotionEasing, PhysicalSpring, NormalizedSpring, AnimationStylePropValue, AvailableAnimationStylePropValue, BaseAnimationStyle, AvailableAnimationStyle, FigmaAnimationStyleConfiguration, CustomAnimationStyleConfiguration, AnimationStyleConfiguration, AppliedFigmaAnimationStyle, AppliedCustomAnimationStyle, AppliedAnimationStyle, AnimationEntry, KeyframeValue, ManualKeyframeInput, ManualKeyframeTrackInput, ManualKeyframe, ManualKeyframeBinding, ManualKeyframeTrack, KeyframeBinding, KeyframePropertyFieldName, EffectKeyframeFieldName, KeyframeField, ComponentPropKeyframeTracks, ComponentPropKeyframeBindings, PaintManualKeyframeTrack, PaintKeyframeBinding, EffectManualKeyframeTracks, EffectKeyframeBindings, ManualKeyframeTracks, Animations, Timeline, OverflowDirection, OverlayPositionType, OverlayBackground, OverlayBackgroundInteraction, PublishStatus, ConnectorEndpointPosition, ConnectorEndpointPositionAndEndpointNodeId, ConnectorEndpointEndpointNodeIdAndMagnet, ConnectorEndpoint, ConnectorStrokeCap, BaseNodeMixin, PluginDataMixin, SceneNodeMixin, MotionNodeMixin, VariableBindableNodeField, VariableBindableTextField, VariableBindablePaintField, VariableBindablePaintStyleField, VariableBindableColorStopField, VariableBindableEffectField, VariableBindableEffectStyleField, VariableBindableLayoutGridField, VariableBindableGridStyleField, VariableBindableComponentPropertyField, VariableBindableComponentPropertyDefinitionField, StickableMixin, ChildrenMixin, ConstraintMixin, DimensionAndPositionMixin, LayoutMixin, AspectRatioLockMixin, BlendMixin, ContainerMixin, StrokeCap, StrokeJoin, HandleMirroring, AutoLayoutMixin, GridTrackSize, GridTrackReorderOptions, GridTrackReorderEntry, GridLayoutMixin, AutoLayoutChildrenMixin, GridChildrenMixin, InferredAutoLayoutResult, DetachedInfo, MinimalStrokesMixin, IndividualStrokesMixin, MinimalFillsMixin, VariableWidthPoint, PresetVariableWidthStrokeProperties, CustomVariableWidthStrokeProperties, VariableWidthStrokeProperties, ComplexStrokeProperties, ScatterBrushProperties, StretchBrushProperties, BrushStrokeProperties, DynamicStrokeProperties, GeometryMixin, ComplexStrokesMixin, CornerMixin, RectangleCornerMixin, ExportMixin, FramePrototypingMixin, VectorLikeMixin, ReactionMixin, DocumentationLink, PublishableMixin, DefaultShapeMixin, BaseFrameMixin, DefaultFrameMixin, OpaqueNodeMixin, MinimalBlendMixin, Annotation, AnnotationProperty, AnnotationPropertyType, AnnotationsMixin, Measurement, MeasurementSide, MeasurementOffset, MeasurementsMixin, ComponentPropertiesMixin, BaseNonResizableTextMixin, NonResizableTextMixin, NonResizableTextPathMixin, TextSublayerNode, DocumentNode, ExplicitVariableModesMixin, PageNode, FrameNode, GroupNode, TransformGroupNode, SliceNode, RectangleNode, LineNode, EllipseNode, PolygonNode, StarNode, VectorNode, TextNode, TextPathNode, ComponentPropertyType, InstanceSwapPreferredValue, SlotSettings, ComponentPropertyOptions, ComponentPropertyDefinitions, ComponentSetNode, ComponentNode, ComponentProperties, InstanceNode, SlotNode, BooleanOperationNode, StickyNode, StampNode, TableNode, TableCellNode, HighlightNode, WashiTapeNode, ShapeWithTextNode, CodeBlockNode, LabelSublayerNode, ConnectorNode, VariableResolvedDataType, VariableAlias, VariableValue, VariableScope, CodeSyntaxPlatform, Variable, VariableCollection, ExtendedVariableCollection, AnnotationCategoryColor, AnnotationCategory, WidgetNode, EmbedData, EmbedNode, LinkUnfurlData, LinkUnfurlNode, MediaData, MediaNode, SectionNode, SlideNode, SlideRowNode, SlideGridNode, InteractiveSlideElementNode, SlideTransition, BaseNode, SceneNode, NodeType, StyleType, InheritedStyleField, StyleConsumers, BaseStyleMixin, PaintStyle, TextStyle, EffectStyle, GridStyle, CustomAnimationStyle, BaseStyle, Image, FindAllCriteria, TransformModifier, RepeatModifier, LinearRepeatModifier, RadialRepeatModifier, QueryResult, ScreenshotOptions, NonFunctionWritableProperties, FigCreatorOpts, FigAPI, FigPlanNode, FigPlanStyle, FigPlanPaintStyle, FigPlanTextStyle, FigPlanEffectStyle, FigPlanGridStyle, GradientStop, FigPlanVariable, FigPlanVariableSetOpts, FigPlanColorVar, FigPlanNumVar, FigPlanTimingVar, FigPlanEasingVar, FigPlanBoolVar, FigPlanStringVar, FigPlanVarCollection, FigDoneResult, FigQueryResult }
```

# Loaded workflow file: figma-use/references/plugin-api-standalone.index.md
# Portable Figma Plugin API

Use the pinned symbol map instead of shell grep or sequentially reading all declarations.
The map addresses the exact supplied declarations. Original upstream line numbers do not address this resource.

## Addressed reader

- Symbol map resource: `workflow/figma-use/references/plugin-api-standalone.symbols.json`.
- Read `mode=keys, path=["symbols"]` to discover names. Read `mode=read, path=["symbols","FrameNode"]` for the locations of a selected name.
- Each location provides `offset`, exclusive `end`, line and a first-page `limit` for `workflow/figma-use/references/plugin-api-standalone.d.ts`.
- Read that declaration with `path=[]`, its offset and limit. For a longer declaration follow the actual returned cursor, keeping each limit at most `min(16000, end - cursor)`; stop at its end.
- Read referenced base interfaces and related value types the same way. A symbol summary is navigation, not a replacement for a required signature or normative source.
- `sourceSha256` in the symbol map pins the exact trimmed declaration resource. Offsets use UTF-16 characters, matching the reader; UTF-8 byte offsets must not be substituted.

## API groups

`PluginAPI` supplies file access, published component import, variables, fonts and node factories. Node interfaces and their mixins define properties, slots, text and layout. Read the actual interface before using an uncertain member.
Keep the loaded figma-use operating rules, ownership checks, canonical font recipe and recovery rules. API signatures do not grant permission to mutate library or global definitions.

Source SHA-256: `4553c94dc1a6bdd5cce67b71e14e5205fcfa4b575ed85732727af08117d40c4b`.

# Loaded workflow file: figma-use/references/text-style-patterns.md
Source snapshot SHA256: 6ca1f627692cea335a3145330bf327b6eaa1417a73f849fec9be609ad5bce50f

# Text Style API Patterns

> Part of the [use_figma skill](../SKILL.md). How to create, apply, and inspect text styles using the Plugin API.
>
See [fig-builder.md](fig-builder.md#styles---create-reference-apply) for the full surface (`paintStyle` / `textStyle` / `effectStyle` / `gridStyle` / `getStyle`, the `FigPlanStyle` handle methods, and the `fills` / `strokes` / `effects` / `layoutGrids` / `textStyle` property routing).

Use the raw Plugin API for discovery and `$fig` for creating and binding. Flush pending `$fig` work with `await $fig.done()` before reading live styles or making raw API mutations.

> For design system context (when to create text styles, how they relate to tokens, `use_figma` limitations), see [wwds-text-styles](working-with-design-systems/wwds-text-styles.md).

## Contents

- Listing Text Styles
- Creating a Text Style
- Discovering Available Font Styles
- Creating a Type Ramp (Multi-Step)
- Using Library Text Styles by Key (preferred)
- Applying Text Styles to Nodes

## Listing Text Styles

```javascript
/**
 * Lists all local text styles with their key properties.
 *
 * @returns {Promise<Array<{id: string, name: string, key: string, fontSize: number, fontName: FontName, lineHeight: LineHeight, letterSpacing: LetterSpacing}>>}
 */
async function listTextStyles() {
  const styles = await figma.getLocalTextStylesAsync();
  return styles.map(s => ({
    id: s.id,
    name: s.name,
    key: s.key,
    fontSize: s.fontSize,
    fontName: s.fontName,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing
  }));
}
```

Full runnable script:

```javascript
const results = await listTextStyles();
return results;
```

## Creating a Text Style

`$fig` loads the font automatically when the plan is flushed. `lineHeight` and `letterSpacing` must be `{value, unit}` objects; line height also accepts `{ unit: 'AUTO' }`.

```javascript
const body = $fig.textStyle({
  name: "body/base",
  fontName: { family: "Inter", style: "Regular" },
  fontSize: 16,
  lineHeight: { unit: "AUTO" },
  letterSpacing: { value: 0, unit: "PIXELS" },
  description: "CSS: var(--font-body-base)",
});

$fig.text({ characters: "Body", textStyle: body })
```

## Discovering Available Font Styles

Font style names vary per provider and per file.  Use `figma.listAvailableFontsAsync()` to discover exact style strings — never guess or probe with try/catch:

```javascript
/**
 * Discovers available font styles for a given family using listAvailableFontsAsync.
 *
 * @param {string} family - Font family name, e.g. "Inter"
 * @returns {Promise<string[]>} - All available style names for the family
 */
async function getAvailableFontStyles(family) {
  const allFonts = await figma.listAvailableFontsAsync();
  return allFonts
    .filter(f => f.fontName.family === family)
    .map(f => f.fontName.style);
}
```

## Creating a Type Ramp (Multi-Step)

Handles font loading, deduplication, and idempotency. Each entry: `[name, fontFamily, fontStyle, fontSize_px, lineHeight, cssVar]`.

```javascript
async function createTypeRamp(defs) {
  const existing = new Set(
    (await figma.getLocalTextStylesAsync()).map(s => s.name)
  );
  const created = [];
  const skipped = [];

  for (const [name, family, style, fontSize, lineHeight, cssVar] of defs) {
    if (existing.has(name)) {
      skipped.push(name);
      continue;
    }
    $fig.textStyle({
      name,
      fontName: { family, style },
      fontSize,
      lineHeight: lineHeight ?? { unit: 'AUTO' },
      ...(cssVar ? { description: `CSS: var(${cssVar})` } : {}),
    });
    existing.add(name);
    created.push(name);
  }

  // Fonts are deduplicated and loaded automatically for the plan.
  await $fig.done();
  return { created, skipped };
}
```

Full runnable script:

```javascript
const defs = [
  ['heading/xl', 'Inter', 'Bold',      48, { unit: 'PIXELS', value: 56 }, '--font-heading-xl'],
  ['heading/lg', 'Inter', 'Bold',      36, { unit: 'PIXELS', value: 44 }, '--font-heading-lg'],
  ['body/base',  'Inter', 'Regular',   16, { unit: 'AUTO' },              '--font-body-base'],
  ['body/sm',    'Inter', 'Regular',   14, { unit: 'AUTO' },              '--font-body-sm'],
  ['code/base',  'Roboto Mono', 'Regular', 14, { unit: 'AUTO' },          '--font-code-base'],
];
const result = await createTypeRamp(defs);
return result;
```

## Using Library Text Styles by Key (preferred)

A style found via a `search_design_system` `queries` entry with `entity: "style"` returns a `key`. Pass it directly into `$fig.getStyle(styleKey)` and apply via the `textStyle` property on any `$fig.text(...)` / `$fig.query('TEXT').set(...)` — the plan queues the library import automatically.

```javascript
const heading = $fig.getStyle(HEADING_TEXT_STYLE_KEY)
$fig.text({ characters: 'Title', textStyle: heading })

// Bulk apply to existing text nodes
$fig.query('TEXT[name=Heading]').set({ textStyle: heading })
await $fig.done()
```

Prefer reusing library text styles over creating new ones.

### Raw-API fallback

```javascript
// If you need the imported TextStyle's metadata mid-script
const headingStyle = await figma.importStyleByKeyAsync("TEXT_STYLE_KEY");
await textNode.setTextStyleIdAsync(headingStyle.id);
```

## Applying Text Styles to Nodes

Pass the handle returned by `$fig.textStyle()` or `$fig.getStyle()` as `textStyle`. `$fig` loads fonts and resolves the style when the plan is flushed.

```javascript
// Accepts a local style ID or a library key from search_design_system.
const heading = $fig.getStyle(HEADING_TEXT_STYLE_KEY);

// Apply to every TEXT whose name contains 'Heading' on the current page.
const matching = $fig.query('TEXT[name*=Heading]').set({ textStyle: heading });
await $fig.done();
return { applied: matching.length };
```

Scope the query to a node:

```javascript
const card = $fig.get('1:42').query('TEXT[name*=Heading]').set({ textStyle: heading });
await $fig.done();
```

# Loaded workflow file: figma-use/references/validation-and-recovery.md
Source snapshot SHA256: 95fa6b77b4382c1350fd76aa65ec13f8353e91241cdc5dd6e520c2fd68a85049

# Validation Workflow & Error Recovery

> Part of the [use_figma skill](../SKILL.md). How to debug, validate, and recover from errors.

## Contents

- `get_metadata` vs `get_screenshot`
- Error Recovery After Failed `use_figma`
- Recommended Workflow


## `get_metadata` vs `get_screenshot`

Prefer structural evidence returned by the write itself. Run a separate audit only when required evidence is missing or after a relevant mutation. Do NOT reach for `get_screenshot` every time — it is expensive and should be reserved for visual checks.

### `get_metadata` — Use for intermediate validation (preferred)

`get_metadata` returns an XML tree of node IDs, types, names, positions, and sizes. Use it to confirm:

- **Structure & hierarchy**: correct parent-child relationships, component nesting, section contents
- **Node counts**: expected number of variants created, children present
- **Naming**: variant property names follow the `property=value` convention
- **Positioning & alignment**: x/y coordinates, width/height values match expectations
- **Layout properties**: auto-layout direction, sizing mode, padding, spacing
- **Component set membership**: all expected variants are inside the ComponentSet

```
Example: After creating a ComponentSet with 120 variants, call get_metadata on the
ComponentSet node to verify all 120 children exist with correct names, sizes, and positions
— without waiting for a full render.
```

**When to use `get_metadata`:**
- After creating/modifying nodes — to verify structure, counts, and names
- After layout operations — to verify positions and dimensions
- After combining variants — to confirm all components are in the ComponentSet
- After binding variables — to verify node properties (use use_figma to read bound variables if needed)
- Between multi-step workflows — to confirm step N succeeded before starting step N+1

### `get_screenshot` — Use after composition or a visual fix

`get_screenshot` renders a pixel-accurate image. It is the only way to verify visual correctness (colors, typography rendering, effects, variable mode resolution). Normally take one screenshot after composition. If a visual fix follows, take one post-fix screenshot; the latest passing screenshot is final. Do not add another screenshot when nothing relevant changed.

**When to use `get_screenshot`:**
- **After creating a component set** — verify variants look correct, grid is readable, nothing is collapsed or overlapping
- **After composing a layout** — verify overall structure and spacing
- **After binding variables/modes** — verify colors and tokens resolved correctly
- **After any fix or recovery** — verify the fix didn't introduce new visual issues
- **Before reporting results to the user** — final visual proof

**What to look for in screenshots** — these are the most commonly missed issues:
- **Cropped/clipped text** — line heights or frame sizing cutting off descenders, ascenders, or entire lines
- **Overlapping content** — elements stacking on top of each other due to incorrect sizing or missing auto-layout
- **Placeholder text** still showing ("Title", "Heading", "Button") instead of actual content

## Error Recovery After Failed `use_figma`

**Recovery steps when `use_figma` returns an error:**
- If `safeToRetryWithoutCanvasRead` is `true`, fix the error and retry.
- If `false`, read the canvas, determine what changed, then make changes.

## Recommended Workflow

```
1. use_figma  →  Create/modify nodes
2. get_metadata     →  Verify structure, counts, names, positions (fast, cheap)
3. use_figma  →  Fix any structural issues found
4. get_metadata     →  Re-verify fixes
5. ... repeat as needed ...
6. get_screenshot   →  Visual check after each major milestone

⚠️ ON ERROR at any step:
   a. safeToRetryWithoutCanvasRead=true  →  Fix the error and retry
   b. safeToRetryWithoutCanvasRead=false →  Read the canvas, determine changes, then change
```

# Loaded workflow file: figma-use/references/variable-patterns.md
Source snapshot SHA256: 64c446377c6b88950f203a0a71c768bee4964f47142eaed337b67bb313f149f9

# Variable & Token API Patterns

> Part of the [use_figma skill](../SKILL.md). How to correctly create, bind, scope, and alias variables using the Plugin API.
>
> For design system context (aliasing strategy, mode decisions, code syntax philosophy, grouping conventions), see [wwds-variables](working-with-design-systems/wwds-variables.md).

Use `$fig` for supported operations. Use the raw Plugin API for explicit variable modes, variable discovery, and code-syntax removal.

## Contents

- Creating Variables with `$fig`
- Binding Variables to Node Properties with `$fig`
- Variable Scopes: What They Are and How to Set Them
- Code Syntax
- Using Library Variables by Key (preferred)
- Raw-API fallback — Discovering and Importing Variables manually
- Discovering Existing Variables in the File
- Effect Styles (For Shadows)

---

## Creating Variables with `$fig`

A single plan covers collection creation, variable creation, values, scopes, code syntax, and aliasing. Everything runs in `$fig.done()`.

```javascript
const tokens = $fig.varCollection({ name: 'Tokens', modes: ['Light', 'Dark'] })

// COLOR — hex strings are auto-converted to {r,g,b,a}
const blue = tokens.colorVar({
  name: 'color/brand',
  values: { Light: '#3B82F6', Dark: '#60A5FA' },
  scopes: ['SHAPE_FILL', 'FRAME_FILL', 'TEXT_FILL'],
  codeSyntax: { WEB: 'var(--color-brand)', ANDROID: 'colorBrand', iOS: 'Color.brand' },
})

// FLOAT — spacing, sizing, radius, opacity
const spacing = tokens.numVar({
  name: 'space/lg',
  values: { Light: 16, Dark: 16 },
  scopes: ['GAP', 'WIDTH_HEIGHT'],
})
const radius = tokens.numVar({ name: 'radius/lg', values: { Light: 8, Dark: 8 }, scopes: ['CORNER_RADIUS'] })
const opacity = tokens.numVar({ name: 'opacity/btn', values: { Light: 1, Dark: 0.8 }, scopes: ['OPACITY'] })

// BOOLEAN
const visible = tokens.boolVar({ name: 'flag/show', values: { Light: true, Dark: false } })

// STRING
const font = tokens.stringVar({
  name: 'font/base',
  values: { Light: 'Inter', Dark: 'Inter' },
  scopes: ['FONT_FAMILY'],
})

// TIMING — for motion animation durations (value in seconds)
const timing = tokens.timingVar({
  name: 'motion/duration-fast',
  values: { Light: 0.2, Dark: 0.2 },
})

// EASING — for motion animation easing curves
const easeOut = {
  type: 'CUSTOM_CUBIC_BEZIER',
  easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
}
const easing = tokens.easingVar({
  name: 'motion/ease-out',
  values: { Light: easeOut, Dark: easeOut },
})

// Aliasing — pass a variable handle as a value; $fig resolves the alias at done() time
const prims = $fig.varCollection({ name: 'Primitives', modes: ['Value'] })
const blue500 = prims.colorVar({ name: 'blue/500', values: { Value: '#3B82F6' } })

const semantic = $fig.varCollection({ name: 'Semantic', modes: ['Light', 'Dark'] })
const bgPrimary = semantic.colorVar({
  name: 'bg/primary',
  values: { Light: blue500, Dark: blue500 },  // alias to primitive
  scopes: ['SHAPE_FILL'],
})

await $fig.done()
```

**Note:** Paint colors use `{r, g, b}` (no alpha), but COLOR variable values use `{r, g, b, a}` (with alpha). Don't mix them up.

**Note:** TIMING values are durations in seconds (e.g., `0.2` for 200ms). EASING values use the same shape as keyframe easing objects — see [motion-easing.md](../../figma-use-motion/references/motion-easing.md) for the full easing object shape.

### Updating after creation

```javascript
// Update any property — name, scopes, description, codeSyntax, etc.
myVar.set({ codeSyntax: { WEB: 'var(--size-lg)' } })
myVar.set({ scopes: ['WIDTH_HEIGHT', 'GAP'] })

// Update a single mode value
myVar.value('Dark', '#1E3A5F')

// Update all mode values at once
myVar.setValues({ Light: 16, Dark: 24 })
// Or with an updater fn (receives the current modeId-keyed values map)
myVar.setValues(values => ({ ...values, [darkModeId]: 24 }))
```

## Binding Variables to Node Properties with `$fig`

Pass a variable handle directly as the property value. `$fig` routes it to the correct `setBoundVariable` / `setBoundVariableForPaint` / `setBoundVariableForEffect` call at flush time.

```javascript
const tokens = $fig.varCollection({ name: 'Tokens', modes: ['Light', 'Dark'] })
const blue = tokens.colorVar({ name: 'color/brand', values: { Light: '#3B82F6', Dark: '#60A5FA' }, scopes: ['SHAPE_FILL', 'STROKE_COLOR'] })
const w = tokens.numVar({ name: 'size/lg', values: { Light: 200, Dark: 200 }, scopes: ['WIDTH_HEIGHT'] })
const alpha = tokens.numVar({ name: 'opacity/btn', values: { Light: 1, Dark: 0.8 }, scopes: ['OPACITY'] })
const radius = tokens.numVar({ name: 'radius/lg', values: { Light: 8, Dark: 8 }, scopes: ['CORNER_RADIUS'] })
const tlRadius = tokens.numVar({ name: 'radius/tl', values: { Light: 4, Dark: 4 }, scopes: ['CORNER_RADIUS'] })
const gap = tokens.numVar({ name: 'gap/md', values: { Light: 16, Dark: 16 }, scopes: ['GAP'] })
const shadowColor = tokens.colorVar({ name: 'shadow/color', values: { Light: '#000', Dark: '#1A1A2E' }, scopes: ['EFFECT_COLOR'] })
const shadowBlur = tokens.numVar({ name: 'shadow/blur', values: { Light: 8, Dark: 12 }, scopes: ['EFFECT_FLOAT'] })

// Scalar numeric props
$fig.rectangle({ name: 'Card', width: w, height: w, opacity: alpha })

// cornerRadius shorthand — binds all four individual corners to the same variable
// (there is no boundVariables.cornerRadius slot; Figma exposes per-corner bindings only)
$fig.rectangle({ name: 'Pill', cornerRadius: radius })

// Individual corners override the shorthand when both are present
$fig.rectangle({ name: 'Card', cornerRadius: radius, topLeftRadius: tlRadius })

// Paint color — pass the variable handle as the `color` field of a paint object
$fig.rectangle({
  name: 'Chip',
  fills: [{ type: 'SOLID', color: blue }],
  strokes: [{ type: 'SOLID', color: blue }],
})

// Effects — variable handles in color/radius/spread/offsetX/offsetY fields
$fig.frame({
  name: 'Card',
  effects: [{
    type: 'DROP_SHADOW',
    color: shadowColor,
    radius: shadowBlur,
    offset: { x: 0, y: 4 },
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  }],
})

// Layout grids — sectionSize and count accept numVar handles
$fig.frame({
  name: 'Grid',
  effects: [],
  layoutGrids: [{
    pattern: 'COLUMNS',
    sectionSize: gap,
    count: gap,
    gutterSize: 8,
    alignment: 'CENTER',
    visible: true,
  }],
})

// Padding / gap on auto-layout frames
$fig.frame({
  name: 'AutoLayout',
  layoutMode: 'HORIZONTAL',
  paddingLeft: gap, paddingRight: gap, paddingTop: gap, paddingBottom: gap,
  itemSpacing: gap,
})

await $fig.done()
```

**Not bindable via `$fig` node properties:** `fontSize`, `fontWeight`, `lineHeight` — set these directly on text nodes.

### Applying a mode to a frame (raw API)

`setExplicitVariableModeForCollection` is not supported by `$fig` — use the raw API after `done()`:

```javascript
// All bound children of this frame will resolve to the specified mode's values
frame.setExplicitVariableModeForCollection(collection, modeId);
```

Without this, all nodes use the collection's default (first) mode.

## Variable Scopes: What They Are and How to Set Them

`variable.scopes` controls which Figma property pickers show the variable. The default is `["ALL_SCOPES"]` which shows it everywhere — this is almost never what you want.

```javascript
myVar.set({ scopes: ['FRAME_FILL', 'SHAPE_FILL'] })  // only fill pickers
myVar.set({ scopes: ['TEXT_FILL'] })                 // only text color picker
myVar.set({ scopes: ['GAP'] })                       // only gap/spacing pickers
myVar.set({ scopes: ['CORNER_RADIUS'] })             // only radius pickers
myVar.set({ scopes: [] })                            // hidden from all pickers
```

**All valid scope values:**
`ALL_SCOPES`, `TEXT_CONTENT`, `CORNER_RADIUS`, `WIDTH_HEIGHT`, `GAP`, `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, `STROKE_FLOAT`, `EFFECT_FLOAT`, `EFFECT_COLOR`, `OPACITY`, `FONT_FAMILY`, `FONT_STYLE`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT`

**Always set scopes explicitly** — `ALL_SCOPES` is the default but almost never what you want. For a comprehensive scope-to-use-case mapping table, see [token-creation.md § Variable Scopes — Complete Reference Table](../../figma-generate-library/references/token-creation.md).

**Always check the existing file's scope patterns before creating variables** — match whatever convention is already in use. See "Discovering Existing Variables in the File" below.

## Code Syntax

Links a Figma variable back to its code counterpart. Use the `codeSyntax` property when creating or updating a variable (see "Creating Variables with `$fig`" section above).

`$fig` has no equivalent for removing a platform from a variable's `codeSyntax`. Use the raw API in the file the variable is defined in:

```javascript
const variable = await figma.variables.getVariableByIdAsync(variableId)
variable.removeVariableCodeSyntax('WEB')    // remove one platform
variable.removeVariableCodeSyntax('ANDROID')
variable.removeVariableCodeSyntax('iOS')
```

**When deriving CSS names from Figma names**, replace both slashes AND spaces with hyphens:

```javascript
// WRONG — leaves spaces in CSS variable name
`var(--${figmaName.replace(/\//g, '-').toLowerCase()})`

// CORRECT — replace all whitespace and slashes
`var(--${figmaName.replace(/[\s\/]+/g, '-').toLowerCase()})`

// BEST — use the original CSS variable name from the source, not a derived one
`var(${token.cssVar})`
```

## Using Library Variables by Key (preferred)

A variable found via a `search_design_system` `queries` entry with `entity: "variable"` returns a `key`. Pass it directly into `$fig.getVar(variableKey)` — the plan queues the library import automatically. Same call also accepts a local variable id; one call site, both shapes.

```javascript
const brand = $fig.getVar(BRAND_COLOR_VAR_KEY)
$fig.rectangle({ fills: [{ type: 'SOLID', color: brand }] })

// Scalar variable on any numeric property
const gap = $fig.getVar(SPACING_400_KEY)
$fig.autoLayout({ name: 'Toolbar', layoutMode: 'HORIZONTAL', itemSpacing: gap })
```

## Raw-API fallback — Discovering and Importing Variables manually

Use this when you need to enumerate a library's variables before deciding which to use, or when `$fig` genuinely cannot express the operation:

```javascript
// List available library collections
const libCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()
// Each has: name, key, libraryName

// Get variables in a specific library collection
const libVars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollections[0].key)
// Each has: name, key, resolvedType

// Import via raw plugin API, then use like a local variable
const imported = await figma.variables.importVariableByKeyAsync(libVars[0].key)
const paint = figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', imported
)
node.fills = [paint]
```

**When to import vs. use local:** If `variable.remote === true`, it's from a library — pass the `key` to `$fig.getVar(key)` (or use raw `importVariableByKeyAsync` if you need the variable mid-script for some other decision). If `remote === false`, it's local — use `getVariableByIdAsync` or `$fig.getVar(id)` directly. The `$fig.getVar` call accepts both id and key.

## Discovering Existing Variables in the File

**Always inspect the file's existing variables before creating new ones.** Different files use different naming conventions, scope patterns, and collection structures. Match what's already there.

### List collections with mode info

```javascript
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const results = collections.map(c => ({
  name: c.name,
  id: c.id,
  varCount: c.variableIds.length,
  modes: c.modes.map(m => ({ name: m.name, id: m.modeId }))
}));
return results;
```

### Inspect scope patterns used in existing variables

```javascript
const collections = await figma.variables.getLocalVariableCollectionsAsync();
// Batch every getVariableByIdAsync into a single Promise.all — sequential
// awaits inside the loop would serialize one IPC round-trip per variable.
const allIds = collections.flatMap(c => c.variableIds);
const allVars = await Promise.all(
  allIds.map(id => figma.variables.getVariableByIdAsync(id))
);
const scopeGroups = {};
for (const v of allVars) {
  if (!v) continue;
  const key = JSON.stringify(v.scopes);
  if (!scopeGroups[key]) scopeGroups[key] = [];
  scopeGroups[key].push(v.name);
}
return scopeGroups;
```

### Build a name→variable lookup for reuse

```javascript
const varByName = {};
for (const v of await figma.variables.getLocalVariablesAsync()) {
  varByName[v.name] = v;
}
// Only create new variables for tokens that have no match
```

## Listing Collections with Full Variable Details

The async API returns richer data including code syntax and scopes per variable:

```javascript
/**
 * Lists all local variable collections defined in the current Figma file,
 * including metadata for their modes and variables.
 *
 * @returns {Promise<Array<{
 *   name: string,
 *   id: string,
 *   modes: Array<[name: string, modeId: string]>,
 *   variables: Array<[name: string, id: string, codeSyntax: object, scopes: string[]]>
 * }>>}
 */
async function listVariableCollectionsAndVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  // flatMap every variable ID across all collections into one Promise.all,
  // then look up per-collection from a Map. Avoids nested Promise.all and
  // still issues every lookup in parallel.
  const allIds = collections.flatMap(c => c.variableIds);
  const fetched = await Promise.all(
    allIds.map(id => figma.variables.getVariableByIdAsync(id))
  );
  const byId = new Map(allIds.map((id, i) => [id, fetched[i]]));
  return collections.map(collection => ({
    name: collection.name,
    id: collection.id,
    modes: collection.modes.map(m => [m.name, m.modeId]),
    variables: collection.variableIds
      .map(id => byId.get(id))
      .filter(v => v)
      .map(v => [v.name, v.id, v.codeSyntax, v.scopes])
  }));
}
```

Full runnable script:

```javascript
const results = await listVariableCollectionsAndVariables();
return results;
```


## Effect Styles (For Shadows)

Shadows can't be stored as variables. Use effect styles. For comprehensive patterns, see [effect-style-patterns.md](effect-style-patterns.md).

```javascript
const shadow = $fig.effectStyle({
  name: 'Shadow/Subtle',
  effects: [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.06 },
    offset: { x: 0, y: 2 },
    radius: 8,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  }],
})

// Apply the style handle to an existing frame
$fig.get(frame.id).set({ effects: shadow })
await $fig.done()
```

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-components--creating.md
Source snapshot SHA256: f383ea109e48c335c5855a8c7be15402e0ba72d5313c34cde6cebf550a6443ff

# Working with design systems: Creating Components

When creating Figma components, you need to start by understanding the source and its intent.

If the user is asking you to create a component based on a design or specification, you need to understand the property model before you build anything. What variants are needed? What text, boolean, or instance swap properties exist? Getting the structure right upfront matters because restructuring a component after instances exist is destructive.

If you are given a code component as reference (React props, tokens, etc.), your goal is to reflect the property surface as closely as makes sense in Figma's model. Not all code properties translate directly — hover and focus states are not props in web code, but they are variants in Figma. Understand those gaps and make deliberate decisions about how to represent them.

Variants are the most important thing to get right. Each combination of variant values creates a node on the canvas. Redundant combinations still exist as explicit nodes — there is no way to conditionally exclude them. Define only the axes you actually need.

Non-variant properties (text, boolean, instance swap) should be added after the variant structure is established. These are defined at the component/component set level and referenced by descendant nodes via `componentPropertyReferences`. Always connect them — a property that isn't wired to a descendant is invisible to users of the component.

If the user asks you to make architectural decisions, lean toward fewer variants and more boolean/text properties where possible. Variants multiply combinatorially; the other property types do not. An optional slot property in code might be a combination of instance swap and boolean visibility.

When naming properties, casing is less important since translation layers like Code Connect can do the mapping to represent the code form. Feel free to take a sentence or capitalized case approach for better readability in Figma.

Keep in mind that components often need to be published and connected to Code Connect for the full design-to-code workflow to work. Creating the component is only one part of the system.

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-components--using.md
Source snapshot SHA256: ea7a6d7909deeb2db039e1893301f60f1b65da0e4f6e65726c1516454f03ce4c

# Working with design systems: Using Components

When using Figma components, you need to start by understanding the state of the source and the state of Figma.

For the source, you need to know what component is being referenced. This could come from a component key, a node ID, a name, or a Code Connect mapping. If you have a component key from a design system library, pass it straight into `$fig.get(componentKey)` or `$fig.instance(componentKey, opts)` — preferred over finding by name, since names are not unique. If you only have a name, search the page or use `search_design_system` to find the right match; `search_design_system` returns `componentKey` for components and `componentSetKey` for component sets, which you can hand directly to `$fig`.

For Figma, you need to know whether the component is local or in a library. Local components can be accessed directly by node ID. Published library components are looked up the same way — pass the matching `componentKey` or `componentSetKey` into `$fig.get(...)` or `$fig.instance(...)` and the plan queues the library import automatically; no separate `importComponentByKeyAsync` / `importComponentSetByKeyAsync` step is required. For component sets, pass the variant property values in `props` (`$fig.instance(setKey, { props: { Size: 'md' } })`) — `$fig` resolves the variant via `setProperties` after the instance is created. You do not need to fetch the set, drill into `compSet.children`, or pick a variant child by hand.

Before setting properties on an instance, identify the node that owns its property definitions: use the main component's parent when that parent is a `COMPONENT_SET`; otherwise use the main component itself. Confirm the resolved owner is a `COMPONENT_SET` or a non-variant `COMPONENT` before reading `componentPropertyDefinitions`. Reading it directly from a variant component throws, and optional chaining does not make the getter safe. Property names are not simple strings — TEXT, BOOLEAN, and INSTANCE_SWAP properties have a `#uid` suffix (e.g. `"Label#1234"`). Only VARIANT properties are plain names (e.g. `"Size"`). Using the wrong key in `setProperties` will silently do nothing.

A component might have multiple text properties, which are not possible to derive from text node layer names. Look to the properties to help you understand what values to set, rather than thinking of setting text node characters directly.

When you need to set a nested instance swap (e.g. an icon property), you need the component key of the swap target, not just its name. The simplest path is `$fig.get(swapTargetComponentKey)` and pass that plan node as the swap value — `$fig` resolves the import behind the scenes.

Be aware that instances inside other instances are nested and changes made to a nested instance may be treated as overrides. If the intent is to change the default appearance, you need to modify the main component, not the instance.

When selecting which variant to use, read `componentProperties` on the instance for its current state and `componentPropertyDefinitions` on the property-owning component set or non-variant component for the available options.

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-components.md
Source snapshot SHA256: fe8d988d5ed545410a9536f57b8f7fc6c2acea62e46ee97cb7afca8bebf149fd

# Components

Components overlap a lot with the idea of components in a codebase, but with some gaps and other Figma-specific use cases. Components in Figma can be reusable entities that do not have a comparable library pattern, or they can be published and distributed in a library that is aligned to a code forms.

Properties can vary from code in different ways, but alignment to code can still happen without a direct relationship. For example, an interactive pattern in code (like a button) can have many states. A lot of these states (active, focused etc) would be expressed in Figma as variants, which is a concept more closely aligned to properties in a code library. In the case of web this is confusing since hover is not a prop, it is a pseudo selector. At the same time, a color variant might be perfectly aligned between design and code (a property in both places). These discrepancies are accounted for in translation with Figma's Code Connect (deterministic context mapping), but in the case of these tools, must be understood to be properly used.

Figma has four property types, which can be inspected through `componentPropertyDefinitions` on a component set or a non-variant component. A variant component does not own this property; inspect its parent component set instead. To fully understand the component, its descendants must be traversed. Property types include:

- Variant
  - This is reflected as permutations of the component in a Component Set on the canvas. Each variant is explicitly visualized, including an redundant permutations ("Small + Primary + Disabled" may look the same as "Small Secondary Sisabled"). These permutations create different variants implicitly in Figma and it is handled through layer naming (`Variant=Primary,Size=Small,State=Disabled`).
- Text/String
  - Text properties are stored on the component parent, but can be mapped to Text node descendants.
  - `node.componentPropertyReferences.characters` on a descendant text node are how you determine where the text property is referenced (can be multiple, though unlikely).
- Boolean
  - Boolean properties are stored on the component parent, but can be mapped to any node descendant that can have its visibility toggled.
  - `node.componentPropertyReferences.visible` on a descendant node are how you determine where the boolean property is referenced.
- Instance Swap
  - Instance swap properties are stored on the component parent, but can be mapped to Instance node descendants.
  - `node.componentPropertyReferences.mainComponent` on a descendant instance node are how you determine where the instance property is referenced. A classic example of this is an icon property.

## Descriptions

Components and component sets inherit `PublishableMixin`, which includes a writable `description` string. Frames, instances, and other scene nodes do not. In `use_figma`, reading `description` on those unsupported types returns `undefined`, while assigning it throws a `no such property` TypeError. Always narrow by `node.type` before reading or writing it. Setting a description is important for any component intended to be used by others — it appears in Figma's dev mode and component panel, and is surfaced when reading component metadata.

Descriptions should explain the component's intent and any non-obvious usage constraints. They are not a substitute for Code Connect annotations, but they are always visible without any tooling setup.

```js
component.description =
  "Primary action button. Use for the single most important action on a page.";
```

Variant components (children of a component set) also have a `description` field, but in practice the component set description is what users see. Set it on the component set, not on individual variant nodes.

To read descriptions when auditing:

```js
// Get all component sets and their descriptions
figma.root
  .findAllWithCriteria({ types: ["COMPONENT_SET"] })
  .map((n) => ({ name: n.name, description: n.description }));
```

## Usage guidelines

- [Creating components](wwds-components--creating.md): What you must consider when creating new components.
- [Using components](wwds-components--using.md): What you must consider when trying to use the right components.

## Code patterns

For runnable code examples (creating, importing, discovering, inspecting components), see [component-patterns.md](../component-patterns.md).

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-effect-styles.md
Source snapshot SHA256: fd7f0c19939bb7fa938e161b8e4e9a3ed785c4ae8ee5c035fd644488b3a52210

# Working with design systems: Effect Styles

Effect styles in Figma are named, reusable definitions of one or more visual effects — drop shadows, inner shadows, and blurs. They are the closest equivalent to a shadow or elevation token in a design system.

Effect styles are distinct from variables. There is no single variable type that represents a shadow. However, individual numeric and color properties within an effect _can_ be bound to variables, allowing shadow values to participate in a token system.

## Model

An `EffectStyle` has one core writable property beyond the base style fields:

| Property      | Type                    | Notes                                                 |
| ------------- | ----------------------- | ----------------------------------------------------- |
| `name`        | `string`                | Slash-delimited for grouping (e.g. `"Elevation/200"`) |
| `effects`     | `ReadonlyArray<Effect>` | **Read-only array** — clone, modify, reassign         |
| `description` | `string`                | Inherited from `BaseStyleMixin`                       |

### Effect types

An `Effect` is a discriminated union. The most common types:

| `type`            | Key properties                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `DROP_SHADOW`     | `color: RGBA`, `offset: Vector`, `radius: number`, `spread: number`, `visible: boolean`, `blendMode` |
| `INNER_SHADOW`    | Same as `DROP_SHADOW`                                                                                |
| `LAYER_BLUR`      | `radius: number`, `visible: boolean`                                                                 |
| `BACKGROUND_BLUR` | `radius: number`, `visible: boolean`                                                                 |

All colors are in 0–1 range (`RGBA`), not 0–255.

### Variable bindings on effects

Effect properties that can be bound to variables (via `setBoundVariableForEffect(effect, field, variable)` on a node, or inline when constructing):

`color`, `radius`, `spread`, `offsetX`, `offsetY`

Note: `setBoundVariableForEffect` returns a **new** effect object — you must capture it and reassign the `effects` array.

### Applying an effect style to a node

Assign the style's `id` to the node's `effectStyleId`. The node's `effects` property will then reflect the style's values.

### Looking up a library effect style by key

When an effect style is found via a `search_design_system` `queries` entry with `entity: "style"`, use the returned `key` to reference and apply that library style. Prefer reusing an existing library style over recreating its effects.

For lookup and application examples, see [effect-style-patterns.md](../effect-style-patterns.md).

## Common gotchas

- **`effects` is read-only**: You cannot mutate the array in place. Clone it, modify the clone, then reassign: `style.effects = [...style.effects, newEffect]`.
- **Effects stack in order**: The order of effects in the array matters visually. Drop shadows render bottom-to-top.
- **Colors are RGBA 0–1**: `{ r: 0, g: 0, b: 0, a: 0.15 }` — not hex, not 0–255.
- **`getLocalEffectStyles()` is deprecated**: Always use `getLocalEffectStylesAsync()`.
- **Styles are not automatically applied**: Creating an `EffectStyle` has no effect on any node until you assign its ID to a node.

## Code patterns

For runnable code examples (listing, creating, applying effect styles), see [effect-style-patterns.md](../effect-style-patterns.md).

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-text-styles.md
Source snapshot SHA256: d976a6f7f69a496998a78a1e321132f127479d14831dd33fe7a5f6a9f43069e3

# Working with design systems: Text Styles

Text styles in Figma are named, reusable typography definitions. They are the closest equivalent to a type ramp in a design token library. A text style bundles font family, size, weight, line height, letter spacing, and other typographic properties into a single named entity that can be applied to text nodes.

Text styles are distinct from variables. You cannot put typography into a single variable — there is no composite variable type. However, individual properties on a text style _can_ be bound to variables (e.g. binding `fontSize` to a size variable, or `fontFamily` to a string variable), which allows the style to participate in a token system.

## Model

A `TextStyle` has the following writable properties:

| Property           | Type             | Notes                                                                        |
| ------------------ | ---------------- | ---------------------------------------------------------------------------- |
| `name`             | `string`         | Slash-delimited for grouping (e.g. `"Heading/XL"`)                           |
| `fontSize`         | `number`         | In pixels                                                                    |
| `fontName`         | `FontName`       | `{ family: string, style: string }` — **font must be loaded before setting** |
| `letterSpacing`    | `LetterSpacing`  | `{ value: number, unit: 'PIXELS' \| 'PERCENT' }`                             |
| `lineHeight`       | `LineHeight`     | `{ value: number, unit: 'PIXELS' \| 'PERCENT' }` or `{ unit: 'AUTO' }`       |
| `textCase`         | `TextCase`       | `'ORIGINAL' \| 'UPPER' \| 'LOWER' \| 'TITLE' \| 'SMALL_CAPS'`                |
| `textDecoration`   | `TextDecoration` | `'NONE' \| 'UNDERLINE' \| 'STRIKETHROUGH'`                                   |
| `paragraphSpacing` | `number`         |                                                                              |
| `paragraphIndent`  | `number`         |                                                                              |
| `description`      | `string`         | Inherited from `BaseStyleMixin`                                              |

### lineHeight and letterSpacing format

These properties must be objects — not bare numbers:

```js
// WRONG — bare number throws
style.lineHeight = 1.5;
style.letterSpacing = 0;

// CORRECT
style.lineHeight = { unit: "AUTO" }; // auto line height
style.lineHeight = { value: 24, unit: "PIXELS" }; // fixed pixel height
style.lineHeight = { value: 150, unit: "PERCENT" }; // 150% line height

style.letterSpacing = { value: 0, unit: "PIXELS" }; // zero tracking
style.letterSpacing = { value: -2, unit: "PIXELS" }; // tight tracking
style.letterSpacing = { value: 5, unit: "PERCENT" }; // percent-based tracking
```

When reading a `lineHeight` back, always check `unit` first — `{ unit: 'AUTO' }` has no `value` key.

### Variable bindings on text styles

The following fields can be bound to variables via `style.setBoundVariable(field, variable)`:

`fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `letterSpacing`, `lineHeight`, `paragraphSpacing`, `paragraphIndent`

To unbind: `style.setBoundVariable(field, null)`

**Important: where possible, use `setBoundVariable` instead of raw values**

```js
const ts = figma.createTextStyle();
ts.fontSize = 24; // set directly; not bound to a variable

const ts = figma.createTextStyle();
ts.setBoundVariable("fontSize", fontSizeVariable); // preferred if the variable exists.
```

### Applying a text style to a node

Once you have a `TextStyle`, apply it to a `TextNode` by assigning its `id` to the node's `textStyleId` property. You can also use the async setter `setTextStyleIdAsync(id)`. Setting `textStyleId` on a node does **not** require the font to be loaded — only editing the text content or font properties directly does.

### Looking up a library text style by key

When a text style is found via a `search_design_system` `queries` entry with `entity: "style"`, use the returned `key` to reference and apply that library style. Prefer reusing an existing library style over recreating its typography.

For lookup and application examples, see [text-style-patterns.md](../text-style-patterns.md).

## Common gotchas

- **Font must be loaded before setting `fontName`**: Call `await figma.loadFontAsync({ family, style })` before creating or modifying a text style's font.
- **Font style names are file-dependent**: Font style names vary by font provider and Figma file. Always call `await figma.listAvailableFontsAsync()` to discover exact style strings before loading — never guess or probe with try/catch.
- **Styles are not automatically applied**: Creating a `TextStyle` has no effect on any node until you assign its ID to a text node.
- **`getLocalTextStyles()` is deprecated**: Always use `getLocalTextStylesAsync()`.
- **Names are not unique**: Two text styles can share the same name. Match by ID or `key` when looking up a known style, not by name alone.
- **Slash grouping is visual only**: `"Heading/XL"` and `"HeadingXL"` are different names; the slash is just a UI affordance.
- **`lineHeight` and `letterSpacing` must be objects**: `style.lineHeight = 1.5` throws. Always use `{ value, unit }` format or `{ unit: 'AUTO' }`.

## Code patterns

For runnable code examples (listing, creating, discovering available fonts, type ramps, applying styles), see [text-style-patterns.md](../text-style-patterns.md).

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-variables--creating.md
Source snapshot SHA256: 3a2f9796aac9d419705ca02b9fab29a46282f0921c4c0a01704cec7e43d8ccf2

# Working with design systems: Creating Variables

When creating Figma variables, you need to start by understanding the state of the source data.

If the user is asking you to create variables based on values, they likely want you to indicate the structure. Whether or not you use semantic aliasing primitive will be based on the inputs you are given about the source data.

If you are given code inputs (JSON, CSS, etc) your goal should be to reflect the existing patterns as closely as possible, but also embrace the design context as distinct from code. For example, casing is less important since you have code syntax that can directly represent the code form. Feel free to take a sentence or capitalized case approach for better readability in Figma.

It is important to understand the underlying structure before you create anything. If there is an implied aliased setup, you want to get that right. You may also need to anticipate modes to know how to split things up. Sizes and Colors likely have different mode requirements in complex systems, so you want to consider that as you create the structure.

If someone asks you to just make a decision based on best practices, that answer will be relative to the complexity of the environment. A simple theme is great best practice for simple needs. Similarly, a complex extended collection setup for someone on an enterprise plan might also be best practice as well.

Keep in mind that systems might also require you to handle text and effect styles for some of the things specified in token libraries.

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-variables--using.md
Source snapshot SHA256: 81d8c8446a565acef433f1d031f03ca7ac6e8f84762dab2beb408a42a1ed2b47

# Working with design systems: Using Variables

When using Figma variables, you need to start by understanding the state of the source and the state of Figma.

For the source, you need to know the breadth of variables code representation. CSS, JSON, theme providers etc will all be able to indicate what the user will expect you to cover in Figma. Some beginner users might not even know what does and doesn't exist in Figma, and if you cant discover that on your own, you will need their help making the right decision.

For Figma, you need to know what collections exist, what their modes are, and what values and names and code syntaxes are in them. This will help you make sure you are using the right things. For properties that "should" have variables but don't, you likely will need to ask the user what to do. Your understanding of Figma's current state should come first.

You can use code syntax and your understanding of the environment you are expected to be referencing to know which variable in Figma to use. You can also use Figma's variable scopes as indicators if they are specified. It is best to audit those up front.

When using variables you should also be aware of mode mismatches, the default mode in Figma may not be the mode referenced by the user in their expectations. Similarly, many collections may refer to values, but the most specific collection is what you should be using. For example, a semantic collection that aliases a primitive collection, the semantic collection would be what you reference. A component token collection (eg. button/background/primary) might alias a semantic collection, and it is the component collection you need to reference. In some other examples, there may be no aliasing and you're simply value matching.

Gap and padding values for frames are really important and often have to be interpreted semantically or based on layout component values.

## Looking up variables by key

When a variable is found via `search_design_system`, use the returned `key` to reference that library variable. If the variable is local to the file, use its `id`. Bind the variable to the target property rather than copying its resolved value.

For lookup and binding examples, see [variable-patterns.md](../variable-patterns.md).

# Loaded workflow file: figma-use/references/working-with-design-systems/wwds-variables.md
Source snapshot SHA256: 51e2e13658a80ebd1683890cba656b48caf1da670b53b7945dd3cad6b2796958

# Working with design systems: Variables

Variables overlap a lot with the idea of tokens in a codebase, but with some gaps and other Figma-specific use cases. Variables are single value, number, string, color, boolean.

In Figma you can do conditional logic and use variables to get basic prototyping functionality. String values can also be used as sophisticated placeholder setups that have different modes for different languages. Not everything you use a variable for in Figma would be used exactly the same way in code. However, for design systems, they are often synced to code in some way.

One gap is the lack of composite tokens. You can't put a box shadow behind a single variable. That is an [effect style](wwds-effect-styles.md), but style values can be bound to variables. Similarly for a type ramp, you have to use [Text Styles](wwds-text-styles.md).

## Model

### Collections

Collections can be thought of a groups in Figma. An example Collection would be "Colors" where there might be a light and dark "Mode." Each value would have two definitions.

### Extended Collections

Extended collections allow you to create a colleciton based on another collection and only override _some_ of the values. Just like inheritance and overrides in CSS. This aligns well for scenarios like branded color themes.

### Modes

Modes in Figma can be thought of like light and dark, but users can specify modes for anything, including sizes, languages (string variables exist in Figma too).

### Aliasing

Aliasing in Figma variables is simply when you point a variable to another variable. Common example is pointing a semantic variable to a primitive variable. Some teams also do component level tokens which adds a third component specific layer.

**Decision rule:** If the source data has two tiers (primitives + semantics), create all primitives first, then create semantic variables that alias into them. If the source data is a single flat tier, create flat variables with no aliases. When in doubt, ask.

### Code Syntax

Code syntax is a surface area in Figma for codebase translation context. You can set WEB, iOS, and ANDROID code syntax on any variable, and when that variable is referenced in other places (visually in Figma's dev mode, or as design context when reading component metadata), this codebase form will appear. These are best thought of as "instance" documentation, eg. `var(--the-thing)` instead of `--the-thing` in the case of CSS.

### Scope

`variable.scopes: VariableScope[]` specifies which properties in Figma the variable can be used for. This is important when you create and when you use variables. **Always set specific scopes rather than leaving the default `ALL_SCOPES`** — it pollutes every property picker with irrelevant tokens. The more specific the better. For the canonical scope-to-use-case mapping, see [token-creation.md § Variable Scopes — Complete Reference Table](../../figma-generate-library/references/token-creation.md).

Common scope values:

- `ALL_SCOPES` — unrestricted; **avoid this** — it is the default but almost never the right choice. Only acceptable for very simple files with a handful of variables where the overhead of precise scoping isn't justified
- `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR` — color bindings (use specific fill scopes; `ALL_FILLS` covers all three fill scopes together)
- `TEXT_CONTENT` — string variables for text layers
- `FONT_SIZE`, `FONT_WEIGHT`, `LINE_HEIGHT`, `LETTER_SPACING` — typography
- `CORNER_RADIUS`, `WIDTH_HEIGHT`, `GAP` — layout/spacing
- `OPACITY` — layer opacity

### Grouping

Variable names in Figma are slash delimited and each slash represents a group that is visualized in Figma. When you are doing matching, consider a part of a code prefix might be the name of the collection, not a top level group. Sometimes you will have prefixes in code that aren't in Figma, and that can be ok, just be sure to ask if it is unclear. You can always validate existing variables by referencing the code syntax.

## Common gotchas

- **`createVariableCollection` always creates a default mode** — you will need to rename it (or delete it and add your own) rather than creating from scratch.
- **Duplicate variable names throw silently** — Figma does not error; it creates a second variable with the same name. Always check for existence before creating.
- **Variable aliases require the target to be in the same file** — cross-file aliasing is not supported via the plugin API. If you need to alias to a library variable, import it first.
- **`setValueForMode` with an alias requires the exact shape** — `{ type: 'VARIABLE_ALIAS', id: '<variableId>' }`. Any deviation will silently set the wrong value or throw.

## Usage guidelines

- [Creating variables](wwds-variables--creating.md): What you must consider when creating new variables.
- [Using variables](wwds-variables--using.md): What you must consider when trying to use the right variables.

## Code patterns

For runnable code examples (creating collections, binding variables, scopes, aliasing, discovering existing variables), see [variable-patterns.md](../variable-patterns.md).

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

# Loaded workflow file: figma-use/SKILL.md
Source snapshot SHA256: d650cc01d10513efda419b3988befa8a05008f066409a7956c52e7e97f3c7c60

---
name: figma-use
description: "**MANDATORY prerequisite** — you MUST invoke this skill BEFORE every `use_figma` tool call. NEVER call `use_figma` directly without loading this skill first. Skipping it causes common, hard-to-debug failures. Trigger whenever the user wants to perform a write action or a unique read action that requires JavaScript execution in the Figma file context — e.g. create/edit/delete nodes, set up variables or tokens, build components and variants, modify auto-layout or fills, bind variables to properties, or inspect file structure programmatically."
disable-model-invocation: false
---
# use_figma — Figma Plugin API Skill
Use the `use_figma` tool to execute JavaScript in Figma files via the Plugin API. All detailed reference docs live in `references/`.

When available, call `create_session` with `fileKey` and `description` before file reads or edits (create the file first if needed), then pass the returned `sessionId` unchanged to every call that accepts it, including follow-ups and work across files.

**Always include `figma-use` in the comma-separated `skillNames` parameter when calling `use_figma`. If this skill was loaded via an MCP resource, you MUST prefix the name with `resource:` (e.g. `resource:figma-use`).** This is a logging parameter used to track skill usage — it does not affect execution.

**If Figma MCP tools appear as deferred tools, batch-load all their schemas in a single `ToolSearch` call** using the `select:` syntax — e.g. `ToolSearch query="select:use_figma,get_screenshot,get_metadata,create_new_file"`. One round trip beats six.

**MANDATORY for visible design changes:** Before the first mutating `use_figma` call, load [figma-generate-design](../figma-generate-design/SKILL.md) alongside this skill and include both names in every mutating call’s `skillNames`. This applies from a single visible property or element to a full page, screen, or composed multi-section view—even when the user calls that view a component. `figma-use` provides the Plugin API rules; `figma-generate-design` provides design-system discovery through `search_design_system`, asset importing, and incremental assembly.

**If the task involves creating or building a standalone component or a component library in Figma** (even a single component as the deliverable), also load [figma-generate-library](../figma-generate-library/SKILL.md). It owns the component-creation workflow — variable foundations first, variant sets, then design token bindings — that `figma-use` alone doesn't cover. Build the token/variable foundation before the component, then bind the component's `fills`/`cornerRadius`/spacing to those variables rather than inlining literals where a token exists. For components that exist to be reused **inside a screen you are building**, follow [figma-generate-design → componentization](../figma-generate-design/references/componentization.md) instead.

**3D transforms:** For perspective, depth, X/Y tilt, isometric cubes, or other static 3D poses, load [figma-3d-transforms](../figma-3d-transforms/SKILL.md) when available. It owns the gated `transform3d`, `scene3d`, and `transformOrigin` API guidance, including fields that may be absent from the general typings. Follow this skill's node-creation rules, then apply the 3D poses to the resulting nodes. If the 3D skill or APIs are unavailable, explain that 3D authoring is not enabled in this session. Flat in-plane rotation uses `node.rotation` and does not need the 3D skill.

For other APIs, load [plugin-api-standalone.index.md](references/plugin-api-standalone.index.md) to understand what is possible. When you are asked to write plugin API code, use this context to grep [plugin-api-standalone.d.ts](references/plugin-api-standalone.d.ts) for relevant types, methods, and properties. This is the definitive source of truth for the general API surface. It is a large typings file, so do not load it all at once, grep for relevant sections as needed.

IMPORTANT: Whenever you work with design systems, start with [working-with-design-systems/wwds.md](references/working-with-design-systems/wwds.md) to understand the key concepts, processes, and guidelines for working with design systems in Figma. Then load the more specific references for components, variables, text styles, and effect styles as needed.

## $fig — the plan-based builder API (ALL NODE CREATION MUST USE THIS)

`$fig` is a global that is responsible for all node creation. It auto-flushes at script end (no `$fig.done()` needed), handles font preloading, batches mutations, and orders property assignment correctly. **Use it for all node creation and mutation operations.** Never use `figma.createFrame()`, `figma.createText()` or any `figma.create*` methods. They do not exist in this environment.

**Constructors queue creation, not inert templates.** Every `$fig` node constructor like `$fig.frame(...)` queues a node creation in the plan, even if its returned plan node is never used, returned, or screenshotted. Unattached nodes become top-level nodes at flush. Plan nodes meant to be used as children should be appended or used in `$fig.frame(opts, children)` **before flushing**.

**layoutSizingHorizontal/Vertical = 'FILL' is for auto-layout children only.** Do not set FILL for top-level nodes.

### Plan nodes vs real nodes

`$fig.component(...)`, `$fig.variants(...)`, `$fig.instance(...)`, `$fig.get(...)`, and `$fig.frame(...)` return **plan nodes**, not raw Plugin API nodes. `await $fig.done()` materializes the plan nodes and makes `planNode.node` available for accessing real nodes. Do not use plan nodes like real nodes.

- Use `planNode.set({ name, x, y })` and `planNode.append(childPlanNode)` for queued mutations. Do not make direct assignments like `planNode.x = 100`. Do not mix plan nodes into raw plugin APIs like `node.appendChild(planNode)`.
- Prefer `$fig.instance(componentPlanNode, opts)` or `planNode.instance(componentPlanNode, opts)` to create instances of plan component nodes, with no intermediate flush.
- Use `planNode.node` only when you need raw state or an operation `$fig` or plan nodes do not expose. Flush pending changes first. Do not mix raw plugin code amongst pending changes.

### `$fig` quick reference

This is the full `$fig` surface. Open [references/fig-builder.md](references/fig-builder.md) for worked details: gridding variant sets, style handle semantics, variable aliasing, query screenshots, and mid-script materialization.

| Need | Call |
|---|---|
| Create nodes | `$fig.autoLayout(opts, children?)` (hugs both axes; default `HORIZONTAL`), `$fig.frame`, `$fig.text({ characters, fontName, fontSize, fills })`, `$fig.rectangle`, `$fig.ellipse`, `$fig.polygon`, `$fig.star`, `$fig.line`, `$fig.vector`, `$fig.section`, `$fig.page`: all `(opts?, children?)` |
| Create from SVG | `$fig.svg(svgString, opts?)` builds a vector node tree; `$fig.svgComponent(svgString, opts?)` builds it as a main component (icons). |
| Group and boolean | `$fig.group`, `$fig.union`, `$fig.subtract`, `$fig.intersect`, `$fig.exclude`: all `(opts?, children?)` |
| Add children | `parent.append(a, b)`, `parent.addAt(index, child)`, or call a constructor on the plan node: `card.text({ ... })` |
| Components | `$fig.component(opts, children)`; variant set: `$fig.variants({ name }, [$fig.component({ name: 'State=Default' }, [...]), ...])`. Variants stack at (0,0), so grid them afterward (fig-builder.md). |
| Component properties | On a layer inside the component: `.textProp('Label')`, `.booleanProp('Show Icon')`, `.instanceSwapProp('Icon')`, `.slotProp('Content')` (on a descendant frame) |
| Instances | `$fig.instance(compRef, { props: { Label: 'Save', State: 'Hover' } })`, where `compRef` is a component plan node, a node ID, or a library `componentKey` / `componentSetKey` (import is queued); existing instance: `$fig.get(id).set({ props: { ... } })` |
| Existing nodes | `$fig.get(idOrLibraryKey)`; `$fig.query(selector, scope?)` with CSS-like selectors (`'FRAME[name*=Card] TEXT'`) |
| Query results | `length`, `first()`, `last()`, `at(i)`, `find(fn)`, `filter(fn)`, `slice(start, end?)`, `query(selector)`, `each(fn)` / `forEach(fn)`, `map(fn)`, `values(paths)`, `toArray()`, `set(props)`, `moveTo(parent, index?)`, `replace(newNode)`, `remove()`, `screenshot(opts?)` |
| Edit, move, delete | Plan node: `.set(props)`, `.replace(newNode)`, `.moveTo(parent, index?)`, `.clone(props?)`, `.remove()`, `.reorderChildren(children)`, `.gradient(type, stops, transform?)`, `.image(hash, scaleMode?)`. Global: `$fig.set(target, props)`, `$fig.delete(...nodes)`, `$fig.move(target, parent, index?)`, `$fig.clone(target, props?)`, `$fig.append(parent, child)`, `$fig.addAt(parent, index, child)`, `$fig.replace(old, new)`, `$fig.reorder(parent, children)`, `$fig.gradient(node, type, stops, transform?)`, `$fig.image(node, hash, scaleMode?)` |
| Variables | `const tokens = $fig.varCollection({ name, modes: ['Light', 'Dark'] })`, then `tokens.colorVar({ name, values: { Light: '#FFFFFF', Dark: '#000000' }, scopes })`, `.numVar`, `.stringVar`, `.boolVar`; existing: `$fig.getVar(idOrLibraryKey)` |
| Bind a variable | Pass the handle as the value: `paddingLeft: space`, `cornerRadius: radius` (all four corners), `fills: [{ type: 'SOLID', color: brand }]` |
| Styles | Create with `$fig.paintStyle` / `$fig.textStyle` / `$fig.effectStyle({ name, ... })`; existing: `$fig.getStyle(nameOrIdOrKey)`; apply with `fills: style`, `effects: style`, `textStyle: style` |
| Screenshot | `node.screenshot({ scale?, contentsOnly? })`: queued, no `await`, one per node |
| Real nodes and IDs | `await $fig.done()`, then `planNode.node` (null before the flush). Without it, the script auto-flushes and returns the created IDs. |

Library keys (`componentKey`, `componentSetKey`, and style or variable `key` values) come from `search_design_system`; `$fig.get`, `$fig.instance`, `$fig.getStyle`, and `$fig.getVar` queue their import in the plan.

**Icons:** **Prefer real vector icons:** import the icon's SVG source (inline `<svg>`, the `.svg` asset, or the source icon-library glyph — e.g. lucide/heroicons) via `$fig.svg(...)` rather than approximating an icon with a typed emoji/Unicode glyph (★ ⚙ 🔍 ☰ ▾) or a plain rectangle. A simple glyph or shape is a fine fallback when the real SVG genuinely can't be obtained — just reach for the SVG first. (Don't reconstruct an icon from rotated line/rect primitives, though — that renders broken.) Full recipe (viewBox+width/height sizing, `currentColor`, INSTANCE_SWAP for design-system icons): [figma-generate-design → Icons](../figma-generate-design/SKILL.md#icons-import-the-svg-never-reconstruct-from-rotated-primitives).

### Copy these patterns

**Build an auto-layout frame with children — single call:**
```js
$fig.autoLayout(
  // fixed width; omit height to hug vertically
  { name: 'Todo List', layoutMode: 'VERTICAL', width: 480 },
  ['item 1', 'item 2', 'item 3'].map((item) =>
    $fig.autoLayout(
      // FILL is valid because this item is attached to the auto-layout Todo List
      { name: 'Todo Item', layoutSizingHorizontal: 'FILL' },
      [$fig.text({ characters: item, fontName: { family: 'Inter', style: 'Bold' } })],
    ),
  ),
).screenshot() // Composition check; do not repeat unless a relevant change needs visual verification.
```

**Repeated UI (list items, cards, nav items, table rows, day cells): build ONE component, then place instances.** Do not build N near-identical frames. TEXT/BOOLEAN props carry the per-item differences:
```js
const ITEMS = [
  { title: 'Inbox', count: '12' },
  { title: 'Drafts', count: '' },
  // ...from the source data
]
const item = $fig.component({ name: 'Nav Item', layoutMode: 'HORIZONTAL', itemSpacing: 8 }, [
  $fig.text({ characters: 'Label' }).textProp('Label'),
  $fig.text({ characters: '0' }).textProp('Count').booleanProp('Show Count'),
])
$fig.autoLayout({ name: 'Nav', layoutMode: 'VERTICAL', width: 240 },
  ITEMS.map((v) => $fig.instance(item, {
    layoutSizingHorizontal: 'FILL',
    props: { Label: v.title, Count: v.count, 'Show Count': v.count !== '' },
  })),
).screenshot()
```
When building a screen, keep main components outside the view: in the file's existing component area, or off to the side of the wrapper. Return `item.node.id` (after `await $fig.done()`) when a later call needs more instances: `$fig.instance('ID', { props })`. Only genuinely one-off containers stay plain frames. See [figma-generate-design → componentization](../figma-generate-design/references/componentization.md).

**Source-defined or repeated icons: import the SVG once into a component, then place instances.** Reuse a compatible local or library icon component when one exists. Otherwise, when the source uses an icon component (even once inside the requested component) or repeats an icon, create one local main component with `$fig.svgComponent(svgStr, opts)`. It converts the imported SVG's outer frame into the component, preserving its children without adding a wrapper. Keep that main component in the existing component area, outside the composed view. Insert instances into parent components and their variants so the icon remains a reusable dependency. Direct SVG children are appropriate for genuinely one-off artwork that the source does not define as a reusable component.
```js
// Read this exact SVG from the source asset or icon library first.
const chevronSvg = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m9 6 6 6-6 6" stroke="#111827" stroke-width="2"/></svg>'
const chevron = $fig.svgComponent(chevronSvg, { name: 'ChevronRight', width: 24, height: 24 })
const iconButton = $fig.component({ name: 'IconButton', layoutMode: 'HORIZONTAL' }, [
  $fig.instance(chevron),
])
const preview = $fig.autoLayout({ name: 'Preview', x: 400, layoutMode: 'HORIZONTAL' }, [
  $fig.instance(iconButton),
  $fig.instance(iconButton),
])
await $fig.done()
return { iconId: chevron.node.id, buttonId: iconButton.node.id, previewId: preview.node.id }
```
A later call can reuse the returned icon ID with `$fig.instance(iconId)`. The SVG is imported only in the main icon component, and each button contains an icon instance.

**Update existing nodes — by query or by id:**
```js
$fig.query('FRAME[name=Header] TEXT[name=Title]').set({ characters: 'New Title', fontSize: 24 })
$fig.get('1:42').set({ opacity: 0.8, cornerRadius: 12 })
```

**Add a node inside an existing node**
```js
$fig.get('1:42').append($fig.autoLayout({ name: 'New Frame' }))
```

`parent.append(a, b, c)` and `$fig.append(parent, a, b, c)` append every child in order and return the parent for chaining.

**Create variants and place an instance**
```js
const SIZES = ['Small', 'Medium', 'Large']
const buttonComponentSet = $fig.variants({ name: 'Button' }, SIZES.map((size) => $fig.component({ name: `Size=${size}`, layoutMode: 'HORIZONTAL', /** other props */ })))
const buttonInst = $fig.instance(buttonComponentSet, { props: { Size: 'Medium' } })
$fig.get('DESTINATION_FRAME_ID').append(buttonInst)
// Creation and placement are queued; no intermediate done() is needed.
```
Select variants through `props` on the component set. This also works with published sets when individual variant references are unavailable.
If an earlier measurement required `await $fig.done()`, continue using plan node `.set(...)` and `.append(...)` for changes and placement.

> ⚠️ `$fig.variants` does **not** position the variants — they stack at (0,0) and the set renders as one collapsed, overlapping element. You must grid the variants and resize the set afterward. See [`fig-builder.md`](references/fig-builder.md#required-follow-up--grid-the-variants-fig-build--raw-layout) for the required follow-up recipe.

> **Building a component — even a single one? Binding tokenized values is part of finishing the job, not a preference.** A component is **not complete** while any value that *has* a corresponding design token — one that already exists in the file, or that you created from the source — is still a hardcoded literal. When a token exists for a `fills` color / `cornerRadius` / padding / `itemSpacing`, bind it: build a `$fig.varCollection` (primitive tier + semantic tier aliased to it) and pass the variable **handle straight into the property**. **Anti-pattern to avoid:** do NOT copy resolved token values into local JS constants (e.g. `const VARIANTS = [{ bg: '#2c2c2c' }]`) and paint with resolved literal colors — that silently bypasses variables even though the source defines tokens. This applies to a single component as much as a full design system. **Only bind values that actually have a token** — values with genuinely no token (one-off geometry, icon pixel sizes, static 1px dividers) correctly stay literal; don't invent tokens to bind. **If you create the variables in one `use_figma` call and build the component in a later one, rehydrate the handles first** (`$fig.getVar(id)` or `figma.variables.getVariableByIdAsync` using the IDs you returned) — a handle from a previous call isn't in scope. Worked recipe: [fig-builder.md → Building a component with bound variables](references/fig-builder.md#building-a-component-with-bound-variables-the-default-for-components).

**Create an instance of a component**
```js
// First arg can be a component plan wrapper, a node ID ('1:2'), OR a library asset key
// from `search_design_system` results (the `componentKey` or `componentSetKey` field, according to `assetType`).
$fig.instance('1:2', { name: 'Cancel Btn', props: { label: 'Cancel'}})
```

**Consume styles/variables**
```js
$fig.autoLayout({ name: 'Card', itemSpacing: spacingVar, fills: fillStyle })

// Looked up by asset key from `search_design_system` (the `key` field)
$fig.autoLayout({ fills: $fig.getStyle(BG_STYLE_KEY) })
$fig.rectangle({ fills: [{ type: 'SOLID', color: $fig.getVar(BRAND_VAR_KEY) }] })
```

**Use design-system assets by key (from `search_design_system`)**

`search_design_system` returns `componentKey` for components, `componentSetKey` for component sets, and `key` for styles and variables. Pass these straight into the unified `$fig` lookup — the plan queues the library import automatically, so you don't need a separate `await figma.importComponentByKeyAsync(...)` / `importStyleByKeyAsync(...)` / `importVariableByKeyAsync(...)` step.
```js
// One call site, many input shapes — node IDs, real variable/style ids,
// AND 40-char asset keys (e.g. '49c8754d4b898e176148650df612a47998a8c4a1')
const btn        = $fig.get(BUTTON_KEY)                    // component / component set
const instance   = $fig.instance(BUTTON_SET_KEY, {         // create an instance from a set
  props: { Size: 'md', Variant: 'primary' },
})
const heading    = $fig.getStyle(HEADING_TEXT_STYLE_KEY)   // paint / text / effect / grid style
const brand      = $fig.getVar(BRAND_COLOR_VAR_KEY)        // variable

$fig.text({ characters: 'Hello', textStyle: heading })
$fig.rectangle({ fills: [{ type: 'SOLID', color: brand }] })
```

**Discover a set's variant props from its key** — `search_design_system` returns a set's `componentSetKey`, not its variant properties. This is **two `use_figma` calls**: call 1 `return`s the set's property definitions and its variants so their props come back to you in the tool result; then, knowing the valid props, call 2 instantiates the variant you want.
```js
const setHandle = $fig.get(BUTTON_SET_KEY)
await $fig.done()
const set = setHandle.node
if (!set || set.type !== 'COMPONENT_SET') {
  throw new Error(`Key ${BUTTON_SET_KEY} is not a COMPONENT_SET`)
}
return {
  componentPropertyDefinitions: set.componentPropertyDefinitions,
  variants: set.children
    .filter((c) => c.type === 'COMPONENT')
    .map((c) => ({ name: c.name, variantProperties: c.variantProperties })),
}
```
```js
// Call 2 — instantiate with props you picked from call 1's output
$fig.instance(BUTTON_SET_KEY, { props: { Size: 'Large', Kind: 'Secondary' } })
```

**Bulk component swap — `$fig.query().set()`:**
```js
const chevron = $fig.get('CHEVRON_KEY')
$fig.query('INSTANCE[name=arrow_drop_down]').set({ mainComponent: chevron })
```

**`.query()` and `.values()` for search and projecting child values**
```js
const menuArrows = $fig
  .query('PAGE[name=Menu] INSTANCE[mainComponent.name*=arrow], PAGE[name=Menu] INSTANCE[mainComponent.name*=chevron]')
  .values(['id', 'name', 'mainComponent.name', 'mainComponent.id']);

// Use quotes for multi-word selector values
const expandComponents = $fig
  .query('COMPONENT[name*=expand], COMPONENT[name*=chevron_down], COMPONENT[name*=chevron_up], COMPONENT[name*="multi word name"]')
  .values(['id', 'name']);
```

**Perform operations on another page:**

Page context resets to the first page at the start of each `use_figma` call. When an operation needs another current page, switch with `await figma.setCurrentPageAsync(page)` before queuing the plan; never assign `figma.currentPage` directly. Switch at most once per call. Split work requiring multiple current-page contexts into independent calls, one per page; issue independent calls in parallel. A scoped FigQuery search does not itself require a separate call for every page.
```js
// Switch to a specific page (loads its content)
const targetPage = figma.root.children.find((p) => p.name === "My Page");
await figma.setCurrentPageAsync(targetPage);
$fig.query('INSTANCE[name=arrow_drop_down]').set({ ... })
```

**Gradient via helper — no manual transform matrix needed:**
```js
const node = $fig.rectangle({ width: 240, height: 120 })
$fig.gradient(node, 'LINEAR', [
  { pos: 0, color: figma.util.rgba('#000000') },
  { pos: 1, color: figma.util.rgba('#ffffff') },
])
```

**Literal colors — use the built-in utilities, available in every call:**
```js
$fig.rectangle({ fills: [figma.util.solidPaint('#2563eb80')] }) // alpha becomes paint opacity
const rgb = figma.util.rgb('#2563eb') // { r, g, b }; ignores input alpha
const rgba = figma.util.rgba('#2563eb80') // { r, g, b, a }; for gradient stops/effects
```
Use these utilities directly instead of defining a hex parser or relying on helpers from a previous `use_figma` call. For token-backed properties, keep passing the variable handle directly; converting its resolved color to a paint would lose the binding.

**Chaining on plan nodes — alternative to children array:**
```js
const card = $fig.autoLayout({ name: 'Card', layoutMode: 'VERTICAL' })
card.text({ characters: 'Title', fontSize: 20 })
card.text({ characters: 'Description', fontSize: 14 })
```

### When to use the raw Figma Plugin API

Keep raw Plugin API code that reads or changes document state separate from planned creation and mutations. Run it before `$fig` code, or after an explicit `await $fig.done()` that flushes all pending changes. Do not pass plan nodes to raw methods such as `regularNode.appendChild(planNode)` or `insertChild`; use `$fig.get(regularNode.id).append(planNode)` or `.addAt(index, planNode)` instead. Planned changes are not visible to raw reads such as `regularNode.children` until the plan is flushed. After flushing, use `planNode.node` when a raw API needs the real node. Pure color helpers such as `figma.util.solidPaint`, `.rgb`, and `.rgba` can be used inside `$fig` expressions.

Use the raw API only in these cases:

- **Color conversion:** `figma.util.solidPaint`, `.rgb`, and `.rgba` convert literal colors for `$fig` properties without creating or mutating nodes.
- **Mid-script async result needed:** `await figma.setCurrentPageAsync(...)`, `await figma.loadFontAsync(...)` — must complete before subsequent plan steps can use the result. (Importing library components is NOT one of these cases: pass the matching `componentKey` or `componentSetKey` straight into `$fig.get(...)` / `$fig.instance(...)` and pass variant property values in `props`. `$fig` queues the library import in the plan and resolves the variant for you.)
- **Mid-script real node state read:** measured `width` / `height` after auto-layout, computed colors, getStyledTextSegments — materialize mid-script, then read `.node` on the plan node. See [references/fig-builder.md](references/fig-builder.md) for the mid-script inspection pattern.
- **Things `$fig` genuinely doesn't expose:** `node.setRangeFontName(...)`, etc. — access via `planNode.node` (see [references/fig-builder.md](references/fig-builder.md)).

## Critical Rules

1. **Only use `$fig` for creating / bulk-editing nodes** (`$fig.autoLayout(...)`, `$fig.text(...)`, `$fig.query(...).set(...)`). Raw Plugin API is the fallback — use it only when `$fig` can't express the operation (intermediate node-state reads, non-SceneNode types like Variables). Library components are NOT a reason to leave `$fig`: `$fig.get(componentKey)` / `$fig.instance(componentSetKey, { props })` queue the library import and resolve the variant for you. See [references/fig-builder.md](references/fig-builder.md) and [references/critical-rules-deep.md](references/critical-rules-deep.md) for worked WRONG/RIGHT examples.

2. **Do not use `findOne`, `findAll`, `findAllWithCriteria`, `findChildren`, `findChild` directly for node searching** They are more verbose, error-prone, and less efficient than `query()`.  Additionally, do not use recursion to search.
   `frame.query('[boundVariables.*]')` filters nodes by non-empty bindings: `{ boundVariables: { width: alias } }` matches; `{ boundVariables: {} }` or `{ fills: [paint] }` does not. Selector `*` expands array elements or object values.

3. **Keep automatic result reporting for pure `$fig` scripts.** The runtime auto-flushes and returns a `FigDoneResult` with created/updated node IDs. Use `await $fig.done()` before reading materialized state or deferred query results, and `return` any additional evidence needed. Include IDs for raw mutations in custom results. JS variables and plan handles do not survive between calls: pass returned IDs as string literals and resolve them again with `$fig.get`, `$fig.getVar`, or `$fig.getStyle`. Keep workflow state outside the Figma file.

4. **Size construction calls for safe retry and validate from evidence.** Batch related creation and edits when failures remain recoverable; a complete section or page may be one call. Split for page-context changes, difficult partial recovery, or a targeted retry after failure—not merely to create validation checkpoints. Use returned IDs and relevant counts, names, or bounds as structural evidence; add a separate check only when evidence is missing or a relevant mutation invalidates it. Normally take one screenshot after composition and one after a visual fix. The latest passing screenshot is final; stop when requirements pass. For work spanning calls, the placeholder workflow below remains useful: populate or replace each placeholder and clear `placeholder` when finished.

```js
$fig.autoLayout({ name: 'Screen', layoutMode: 'VERTICAL', width: 390 }, [
  $fig.autoLayout({ name: 'Header', layoutSizingHorizontal: 'FILL', placeholder: true }),
  $fig.autoLayout({ name: 'Content', layoutSizingHorizontal: 'FILL', placeholder: true }),
])
```

5. **Plain JS with top-level `await`.** Code is auto-wrapped in async. Do NOT wrap in `(async () => {})()`.

6. **Use built-in utilities for literal colors.** `figma.util.solidPaint('#2563eb80')` creates a complete solid paint with opacity. For individual color fields, use `figma.util.rgb(...)` for `{r,g,b}` (solid paints; ignores alpha) and `figma.util.rgba(...)` for `{r,g,b,a}` (gradient stops/effects). Channels are 0–1; solid-paint opacity belongs outside `color`. The utilities are available in every call — no custom hex parser needed. Token-backed properties still take variable handles directly. See [references/critical-rules-deep.md](references/critical-rules-deep.md) for WRONG/RIGHT.

7. **No `curl` / `wget` / `Read` of Figma URLs from `Bash`.** Figma file access ONLY via `use_figma` and `mcp__figma__*` tools. After `get_screenshot`, the image is inlined in the tool result — do NOT re-fetch or re-Read it.

8. **Empty / unsupported responses are terminal.** Accept and move on — don't try alternative bypass paths.

9. **Verify node-type before touching a property.** Only `FRAME / COMPONENT / COMPONENT_SET / INSTANCE / GROUP / SECTION / PAGE` have `.children`. `GROUP` has no `fills` / `strokes` / `cornerRadius`. `TEXT` has no `cornerRadius` / `padding*` / `layoutMode`. `layoutPositioning='ABSOLUTE'` needs parent with `layoutMode !== 'NONE'`. Check `'<prop>' in node` or grep [references/plugin-api-standalone.d.ts](references/plugin-api-standalone.d.ts). Full list in [references/critical-rules-deep.md](references/critical-rules-deep.md).

10. **Reuse evidence while it remains valid.** Do not repeat metadata reads or screenshots when nothing relevant changed. Reinspect when a mutation, external change, or recovery requirement invalidates earlier evidence.

11. **Stop once requirements pass.** Gather enough evidence to establish correctness; avoid redundant checks, but do not leave known defects unresolved to meet a call limit.

12. **On any `use_figma` error, obey `safeToRetryWithoutCanvasRead`.** If `true`, correct the identified error and retry without adding a diagnostic canvas read. If `false`, read the canvas, determine what changed, then make changes. If the same API or property error occurs twice, inspect its definition and fix the root cause before retrying; do not keep shrinking batches or changing selectors around the same invalid mutation. A generic error message alone does not establish the cause or prove that nothing changed. See [validation-and-recovery.md](references/validation-and-recovery.md).

13. **NEVER call `mcp__figma__get_design_context`. FORBIDDEN.** This tool requires a selection (no selection exists in this environment), so every call will fail. The error is not recoverable — calling it just burns a tool slot and forces a retry. For structured reads of the file, use `mcp__figma__get_metadata` (for top-level frame discovery) and `use_figma` with `$fig.query()` instead. **Never call `get_design_context` for any reason.**

14. **≤3 codebase `Read` calls when the task references source code.** Beyond that, grep only. The 4th codebase Read is forbidden — write your `use_figma` script with what you have.

15. **Must use auto-layout unless you have a compelling reason not to.** Create auto-layout frames with `$fig.autoLayout(...)` instead of absolutely-positioning nodes.  New auto-layout frames are created with both axes hugging content. Explicitly assign `layoutSizingHorizontal` or `layoutSizingVertical` to `'FILL'` for auto-layout children if you want them to fill the auto-layout container's counter axis.

16. **Gradient paints need ALL fields:** `type`, `gradientStops`, `gradientTransform` (a `[[a,b,tx],[c,d,ty]]` matrix). Missing any throws validation error. See [references/critical-rules-deep.md](references/critical-rules-deep.md).

17. **Discover available fonts, esp. for style variations.** Use `await figma.listAvailableFontsAsync()` to discover available fonts for `$fig.text({ fontName: ... })`.

18. **Set variable `scopes` explicitly when creating variables.** The default `ALL_SCOPES` pollutes every property picker. Use specific scopes — `['FRAME_FILL', 'SHAPE_FILL']` for backgrounds, `['TEXT_FILL']` for text, `['GAP']` for spacing, `['CORNER_RADIUS']` for radii; primitives that shouldn't appear in pickers get `[]`. In `$fig`, pass `scopes` to `colorVar` / `numVar`; in the raw API, set `variable.scopes`. There is no `STROKE` scope (use `STROKE_COLOR` or `STROKE_FLOAT`), and variable names cannot contain `.` (`space/0-5`, not `space/0.5`); [references/fig-builder.md](references/fig-builder.md) lists every scope and naming rule. See [references/variable-patterns.md](references/variable-patterns.md).

19. **Never read `componentPropertyDefinitions`, `componentProperties`, or `valuesByMode` across a collection.** Resolve specific node IDs first, then read the property bundle only for those IDs. Reading one resolved node is safe; mapping these getters over `findAll*` results, `children`, or `getLocalVariables*` is the single largest cause of oversized returns.

20. **Broad reads return `id`, `name`, `type` and counts only.** Fetch details for selected IDs in later calls. Return each file-wide inventory — variables, text styles, effect styles, paint styles, components, pages — in its own call; do not combine them into one return.

21. **When a read may be large, measure the serialized return before returning it.** Bytes, not array length: `.slice()` bounds row count but not per-item size. If over budget, narrow the ID set or split across calls. Never drop required IDs or silently truncate.

### Bulk mutation of existing nodes (swap/update/replace)

For tasks like "swap N icons", "update M colors", "replace K instances":
1. **DISCOVER + MUTATE** together when safe: use scoped `$fig.query()` and planned mutations; return coverage evidence when the automatic result is insufficient.
2. **VERIFY** only what the mutation result does not establish. Check visual results when needed.
3. **FIX** any remaining defects with targeted changes, then report once requirements pass.

Choose call boundaries for recoverability, not a fixed call budget. On failure, follow Rule 12. See [validation-and-recovery.md](references/validation-and-recovery.md).

## Node property gotchas

Do not guess node properties or assume CSS-like properties. Accessing non-existent properties will throw `TypeError: node.foo: no such property 'foo' on TYPE node`. Each throw burns a retry. [plugin-api-standalone.index.md](references/plugin-api-standalone.index.md) contains the list of all symbols in the API. Use that file and grep the full API typings in [plugin-api-standalone.d.ts](references/plugin-api-standalone.d.ts) for the full definitions.

- **Only `FRAME` / `COMPONENT` / `COMPONENT_SET` / `INSTANCE` / `GROUP` / `SECTION` / `PAGE` have `.children`.** `RECTANGLE`, `TEXT`, `ELLIPSE`, `POLYGON`, `STAR`, `VECTOR`, `LINE`, `SLICE`, `STICKY`, `SHAPE_WITH_TEXT`, `STAMP`, `CONNECTOR`, `TABLE`, `WIDGET`, `EMBED`, `MEDIA` do NOT. Check `'children' in node` before accessing a node's children.
- **Narrow before accessing `characters` or `description`.** Use typed query selectors or a capability guard for text-capable nodes. Set component purpose/usage in `description` only on `COMPONENT` or `COMPONENT_SET`. Optional chaining does not protect unsupported property access.
- **`GROUP` has NO `fills` / `strokes` / `cornerRadius`.** Apply paints/radii on the child shapes inside.
- **Figma auto-layout != CSS flexbox.** There is no such thing as margin.
- **`TEXT` DOES NOT HAVE container properties.** Text has font / size / decoration / fills. Do not use container properties like padding, layout mode, item spacing, etc.
- **`INSTANCE` descendants are read-only for structural ops** — you cannot `appendChild` / `insertChild` into an instance child. Edit the source `COMPONENT` or detach first.
- **Never use `primaryAxisSizingMode` or `counterAxisSizingMode` on a node. ** Use `layoutSizingHorizontal` or `layoutSizingVertical` with 'FIXED' | 'HUG' | 'FILL'. Use 'FILL' only when the parent has auto-layout.
- **There is NO `instance.swapMainComponent(...)`.** Use `instance.setProperties({...})` with the component-property variant value, OR `$fig.query(...).set({props: {...}})`. There IS `instance.swapComponent(component)` (different method name).

## References

- [references/fig-builder.md](references/fig-builder.md) — full `$fig` API and worked patterns; start with the quick reference above
- [references/critical-rules-deep.md](references/critical-rules-deep.md) — WRONG/RIGHT examples, full node-type pitfall list, bulk-mutation template, syntax-bug checklist
- [references/gotchas.md](references/gotchas.md) — raw Plugin API edge cases
- [references/plugin-api-standalone.d.ts](references/plugin-api-standalone.d.ts) — type definitions (grep, don't read whole)
- [references/plugin-api-standalone.index.md](references/plugin-api-standalone.index.md) — API navigation
- [references/common-patterns.md](references/common-patterns.md), [component-patterns.md](references/component-patterns.md), [variable-patterns.md](references/variable-patterns.md), [text-style-patterns.md](references/text-style-patterns.md), [effect-style-patterns.md](references/effect-style-patterns.md) — pattern playbooks
- [references/working-with-design-systems/](references/working-with-design-systems/) — design system workflows
- [references/validation-and-recovery.md](references/validation-and-recovery.md) — error recovery patterns

# Loaded workflow file: figma-use/references/plugin-api-standalone.symbols.json
{
  "schemaVersion": "apollo.landing-api-symbols.v1",
  "sourceResource": "workflow/figma-use/references/plugin-api-standalone.d.ts",
  "sourceSha256": "4553c94dc1a6bdd5cce67b71e14e5205fcfa4b575ed85732727af08117d40c4b",
  "offsetUnits": "utf16-characters",
  "symbols": {
    "PluginAPI": [
      {
        "kind": "interface",
        "offset": 172,
        "end": 51326,
        "line": 7,
        "limit": 16000
      },
      {
        "kind": "interface",
        "offset": 396645,
        "end": 396877,
        "line": 10314,
        "limit": 232
      }
    ],
    "VariablesAPI": [
      {
        "kind": "interface",
        "offset": 51326,
        "end": 55736,
        "line": 1144,
        "limit": 4410
      }
    ],
    "LibraryVariableCollection": [
      {
        "kind": "interface",
        "offset": 55736,
        "end": 55991,
        "line": 1255,
        "limit": 255
      }
    ],
    "LibraryVariable": [
      {
        "kind": "interface",
        "offset": 55991,
        "end": 56285,
        "line": 1263,
        "limit": 294
      }
    ],
    "AnnotationsAPI": [
      {
        "kind": "interface",
        "offset": 56285,
        "end": 57258,
        "line": 1274,
        "limit": 973
      }
    ],
    "BuzzTextField": [
      {
        "kind": "interface",
        "offset": 57258,
        "end": 57901,
        "line": 1300,
        "limit": 643
      }
    ],
    "BuzzMediaField": [
      {
        "kind": "interface",
        "offset": 57901,
        "end": 58569,
        "line": 1319,
        "limit": 668
      }
    ],
    "TeamLibraryAPI": [
      {
        "kind": "interface",
        "offset": 58569,
        "end": 60708,
        "line": 1340,
        "limit": 2139
      }
    ],
    "MotionAPI": [
      {
        "kind": "interface",
        "offset": 60708,
        "end": 61868,
        "line": 1384,
        "limit": 1160
      }
    ],
    "UtilAPI": [
      {
        "kind": "interface",
        "offset": 61868,
        "end": 66829,
        "line": 1422,
        "limit": 4961
      }
    ],
    "ViewportAPI": [
      {
        "kind": "interface",
        "offset": 66829,
        "end": 67786,
        "line": 1546,
        "limit": 957
      }
    ],
    "SuggestionResults": [
      {
        "kind": "interface",
        "offset": 67786,
        "end": 72050,
        "line": 1575,
        "limit": 4264
      }
    ],
    "ParametersAPI": [
      {
        "kind": "interface",
        "offset": 72050,
        "end": 72158,
        "line": 1664,
        "limit": 108
      }
    ],
    "NodeChangeProperty": [
      {
        "kind": "type",
        "offset": 72158,
        "end": 74788,
        "line": 1668,
        "limit": 2630
      }
    ],
    "Transform": [
      {
        "kind": "type",
        "offset": 74788,
        "end": 74858,
        "line": 1801,
        "limit": 70
      }
    ],
    "Vector": [
      {
        "kind": "interface",
        "offset": 74858,
        "end": 74921,
        "line": 1802,
        "limit": 63
      }
    ],
    "Rect": [
      {
        "kind": "interface",
        "offset": 74921,
        "end": 75099,
        "line": 1806,
        "limit": 178
      }
    ],
    "RGB": [
      {
        "kind": "interface",
        "offset": 75099,
        "end": 75246,
        "line": 1815,
        "limit": 147
      }
    ],
    "RGBA": [
      {
        "kind": "interface",
        "offset": 75246,
        "end": 76467,
        "line": 1823,
        "limit": 1221
      }
    ],
    "FontName": [
      {
        "kind": "interface",
        "offset": 76467,
        "end": 77403,
        "line": 1853,
        "limit": 936
      }
    ],
    "FontVariationSettings": [
      {
        "kind": "interface",
        "offset": 77403,
        "end": 78783,
        "line": 1868,
        "limit": 1380
      }
    ],
    "FontNameInput": [
      {
        "kind": "interface",
        "offset": 78783,
        "end": 78916,
        "line": 1896,
        "limit": 133
      }
    ],
    "TextCase": [
      {
        "kind": "type",
        "offset": 78916,
        "end": 79010,
        "line": 1901,
        "limit": 94
      }
    ],
    "TextDecoration": [
      {
        "kind": "type",
        "offset": 79010,
        "end": 79071,
        "line": 1902,
        "limit": 61
      }
    ],
    "TextDecorationStyle": [
      {
        "kind": "type",
        "offset": 79071,
        "end": 79126,
        "line": 1903,
        "limit": 55
      }
    ],
    "FontStyle": [
      {
        "kind": "type",
        "offset": 79126,
        "end": 79164,
        "line": 1904,
        "limit": 38
      }
    ],
    "TextDecorationOffset": [
      {
        "kind": "type",
        "offset": 79164,
        "end": 79315,
        "line": 1905,
        "limit": 151
      }
    ],
    "TextDecorationThickness": [
      {
        "kind": "type",
        "offset": 79315,
        "end": 79469,
        "line": 1913,
        "limit": 154
      }
    ],
    "TextDecorationColor": [
      {
        "kind": "type",
        "offset": 79469,
        "end": 79582,
        "line": 1921,
        "limit": 113
      }
    ],
    "OpenTypeFeature": [
      {
        "kind": "type",
        "offset": 79582,
        "end": 82124,
        "line": 1928,
        "limit": 2542
      }
    ],
    "ArcData": [
      {
        "kind": "interface",
        "offset": 82124,
        "end": 82310,
        "line": 2158,
        "limit": 186
      }
    ],
    "DropShadowEffect": [
      {
        "kind": "interface",
        "offset": 82310,
        "end": 84061,
        "line": 2166,
        "limit": 1751
      }
    ],
    "InnerShadowEffect": [
      {
        "kind": "interface",
        "offset": 84061,
        "end": 85629,
        "line": 2209,
        "limit": 1568
      }
    ],
    "BlurEffectBase": [
      {
        "kind": "interface",
        "offset": 85629,
        "end": 86308,
        "line": 2248,
        "limit": 679
      }
    ],
    "BlurEffectNormal": [
      {
        "kind": "interface",
        "offset": 86308,
        "end": 86586,
        "line": 2271,
        "limit": 278
      }
    ],
    "BlurEffectProgressive": [
      {
        "kind": "interface",
        "offset": 86586,
        "end": 87452,
        "line": 2280,
        "limit": 866
      }
    ],
    "BlurEffect": [
      {
        "kind": "type",
        "offset": 87452,
        "end": 87580,
        "line": 2301,
        "limit": 128
      }
    ],
    "NoiseEffectBase": [
      {
        "kind": "interface",
        "offset": 87580,
        "end": 88684,
        "line": 2305,
        "limit": 1104
      }
    ],
    "NoiseEffectMonotone": [
      {
        "kind": "interface",
        "offset": 88684,
        "end": 88987,
        "line": 2344,
        "limit": 303
      }
    ],
    "NoiseEffectDuotone": [
      {
        "kind": "interface",
        "offset": 88987,
        "end": 89378,
        "line": 2354,
        "limit": 391
      }
    ],
    "NoiseEffectMultitone": [
      {
        "kind": "interface",
        "offset": 89378,
        "end": 89760,
        "line": 2368,
        "limit": 382
      }
    ],
    "NoiseEffect": [
      {
        "kind": "type",
        "offset": 89760,
        "end": 89912,
        "line": 2382,
        "limit": 152
      }
    ],
    "TextureEffect": [
      {
        "kind": "interface",
        "offset": 89912,
        "end": 90974,
        "line": 2386,
        "limit": 1062
      }
    ],
    "GlassEffect": [
      {
        "kind": "interface",
        "offset": 90974,
        "end": 92332,
        "line": 2422,
        "limit": 1358
      }
    ],
    "ShaderEffect": [
      {
        "kind": "interface",
        "offset": 92332,
        "end": 93338,
        "line": 2465,
        "limit": 1006
      }
    ],
    "Effect": [
      {
        "kind": "type",
        "offset": 93338,
        "end": 93551,
        "line": 2488,
        "limit": 213
      }
    ],
    "ConstraintType": [
      {
        "kind": "type",
        "offset": 93551,
        "end": 93694,
        "line": 2499,
        "limit": 143
      }
    ],
    "Constraints": [
      {
        "kind": "interface",
        "offset": 93694,
        "end": 93862,
        "line": 2503,
        "limit": 168
      }
    ],
    "ColorStop": [
      {
        "kind": "interface",
        "offset": 93862,
        "end": 94287,
        "line": 2510,
        "limit": 425
      }
    ],
    "ImageFilters": [
      {
        "kind": "interface",
        "offset": 94287,
        "end": 94587,
        "line": 2529,
        "limit": 300
      }
    ],
    "SolidPaint": [
      {
        "kind": "interface",
        "offset": 94587,
        "end": 96304,
        "line": 2541,
        "limit": 1717
      }
    ],
    "GradientPaint": [
      {
        "kind": "interface",
        "offset": 96304,
        "end": 96951,
        "line": 2596,
        "limit": 647
      }
    ],
    "ImagePaint": [
      {
        "kind": "interface",
        "offset": 96951,
        "end": 98429,
        "line": 2616,
        "limit": 1478
      }
    ],
    "VideoPaint": [
      {
        "kind": "interface",
        "offset": 98429,
        "end": 99831,
        "line": 2652,
        "limit": 1402
      }
    ],
    "PatternPaint": [
      {
        "kind": "interface",
        "offset": 99831,
        "end": 100729,
        "line": 2688,
        "limit": 898
      }
    ],
    "ShaderPaint": [
      {
        "kind": "interface",
        "offset": 100729,
        "end": 101737,
        "line": 2722,
        "limit": 1008
      }
    ],
    "Paint": [
      {
        "kind": "type",
        "offset": 101737,
        "end": 102258,
        "line": 2744,
        "limit": 521
      }
    ],
    "ShaderPropertyValue": [
      {
        "kind": "type",
        "offset": 102258,
        "end": 103050,
        "line": 2750,
        "limit": 792
      }
    ],
    "ShaderPropertyDefinition": [
      {
        "kind": "interface",
        "offset": 103050,
        "end": 104018,
        "line": 2794,
        "limit": 968
      }
    ],
    "Shader": [
      {
        "kind": "interface",
        "offset": 104018,
        "end": 104942,
        "line": 2830,
        "limit": 924
      }
    ],
    "Guide": [
      {
        "kind": "interface",
        "offset": 104942,
        "end": 105088,
        "line": 2854,
        "limit": 146
      }
    ],
    "RowsColsLayoutGrid": [
      {
        "kind": "interface",
        "offset": 105088,
        "end": 106557,
        "line": 2861,
        "limit": 1469
      }
    ],
    "GridLayoutGrid": [
      {
        "kind": "interface",
        "offset": 106557,
        "end": 107033,
        "line": 2904,
        "limit": 476
      }
    ],
    "LayoutGrid": [
      {
        "kind": "type",
        "offset": 107033,
        "end": 107164,
        "line": 2922,
        "limit": 131
      }
    ],
    "ExportSettingsConstraints": [
      {
        "kind": "interface",
        "offset": 107164,
        "end": 107352,
        "line": 2926,
        "limit": 188
      }
    ],
    "ExportSettingsImage": [
      {
        "kind": "interface",
        "offset": 107352,
        "end": 109236,
        "line": 2933,
        "limit": 1884
      }
    ],
    "ExportSettingsSVGBase": [
      {
        "kind": "interface",
        "offset": 109236,
        "end": 110782,
        "line": 2981,
        "limit": 1546
      }
    ],
    "ExportSettingsSVG": [
      {
        "kind": "interface",
        "offset": 110782,
        "end": 111134,
        "line": 3006,
        "limit": 352
      }
    ],
    "ExportSettingsSVGString": [
      {
        "kind": "interface",
        "offset": 111134,
        "end": 111392,
        "line": 3016,
        "limit": 258
      }
    ],
    "ExportSettingsPDF": [
      {
        "kind": "interface",
        "offset": 111392,
        "end": 111879,
        "line": 3025,
        "limit": 487
      }
    ],
    "ExportSettingsREST": [
      {
        "kind": "interface",
        "offset": 111879,
        "end": 113067,
        "line": 3039,
        "limit": 1188
      }
    ],
    "ExportSettings": [
      {
        "kind": "type",
        "offset": 113067,
        "end": 113245,
        "line": 3068,
        "limit": 178
      }
    ],
    "WindingRule": [
      {
        "kind": "type",
        "offset": 113245,
        "end": 113362,
        "line": 3072,
        "limit": 117
      }
    ],
    "VectorVertex": [
      {
        "kind": "interface",
        "offset": 113362,
        "end": 114257,
        "line": 3076,
        "limit": 895
      }
    ],
    "VectorSegment": [
      {
        "kind": "interface",
        "offset": 114257,
        "end": 114789,
        "line": 3105,
        "limit": 532
      }
    ],
    "VectorRegion": [
      {
        "kind": "interface",
        "offset": 114789,
        "end": 115323,
        "line": 3126,
        "limit": 534
      }
    ],
    "VectorNetwork": [
      {
        "kind": "interface",
        "offset": 115323,
        "end": 115774,
        "line": 3147,
        "limit": 451
      }
    ],
    "VectorPath": [
      {
        "kind": "interface",
        "offset": 115774,
        "end": 117421,
        "line": 3164,
        "limit": 1647
      }
    ],
    "VectorPaths": [
      {
        "kind": "type",
        "offset": 117421,
        "end": 117466,
        "line": 3197,
        "limit": 45
      }
    ],
    "LetterSpacing": [
      {
        "kind": "interface",
        "offset": 117466,
        "end": 117557,
        "line": 3198,
        "limit": 91
      }
    ],
    "LineHeight": [
      {
        "kind": "type",
        "offset": 117557,
        "end": 117698,
        "line": 3202,
        "limit": 141
      }
    ],
    "LeadingTrim": [
      {
        "kind": "type",
        "offset": 117698,
        "end": 117815,
        "line": 3210,
        "limit": 117
      }
    ],
    "TextWrapStyle": [
      {
        "kind": "type",
        "offset": 117815,
        "end": 117866,
        "line": 3214,
        "limit": 51
      }
    ],
    "HyperlinkTarget": [
      {
        "kind": "type",
        "offset": 117866,
        "end": 118010,
        "line": 3215,
        "limit": 144
      }
    ],
    "TextListOptions": [
      {
        "kind": "type",
        "offset": 118010,
        "end": 118078,
        "line": 3222,
        "limit": 68
      }
    ],
    "BlendMode": [
      {
        "kind": "type",
        "offset": 118078,
        "end": 118391,
        "line": 3225,
        "limit": 313
      }
    ],
    "MaskType": [
      {
        "kind": "type",
        "offset": 118391,
        "end": 118511,
        "line": 3245,
        "limit": 120
      }
    ],
    "Font": [
      {
        "kind": "interface",
        "offset": 118511,
        "end": 118632,
        "line": 3249,
        "limit": 121
      }
    ],
    "TextStyleOverrideType": [
      {
        "kind": "type",
        "offset": 118632,
        "end": 118745,
        "line": 3255,
        "limit": 113
      }
    ],
    "StyledTextSegment": [
      {
        "kind": "interface",
        "offset": 118745,
        "end": 122153,
        "line": 3258,
        "limit": 3408
      }
    ],
    "TextPathStartData": [
      {
        "kind": "interface",
        "offset": 122153,
        "end": 122370,
        "line": 3385,
        "limit": 217
      }
    ],
    "Reaction": [
      {
        "kind": "type",
        "offset": 122370,
        "end": 122437,
        "line": 3395,
        "limit": 67
      }
    ],
    "VariableDataType": [
      {
        "kind": "type",
        "offset": 122437,
        "end": 122560,
        "line": 3399,
        "limit": 123
      }
    ],
    "ExpressionFunction": [
      {
        "kind": "type",
        "offset": 122560,
        "end": 122836,
        "line": 3401,
        "limit": 276
      }
    ],
    "Expression": [
      {
        "kind": "interface",
        "offset": 122836,
        "end": 122940,
        "line": 3417,
        "limit": 104
      }
    ],
    "VariableValueWithExpression": [
      {
        "kind": "type",
        "offset": 122940,
        "end": 123002,
        "line": 3421,
        "limit": 62
      }
    ],
    "VariableData": [
      {
        "kind": "interface",
        "offset": 123002,
        "end": 123135,
        "line": 3422,
        "limit": 133
      }
    ],
    "ConditionalBlock": [
      {
        "kind": "type",
        "offset": 123135,
        "end": 123279,
        "line": 3427,
        "limit": 144
      }
    ],
    "Action": [
      {
        "kind": "type",
        "offset": 123279,
        "end": 124831,
        "line": 3434,
        "limit": 1552
      }
    ],
    "SimpleTransition": [
      {
        "kind": "interface",
        "offset": 124831,
        "end": 125054,
        "line": 3488,
        "limit": 223
      }
    ],
    "DirectionalTransition": [
      {
        "kind": "interface",
        "offset": 125054,
        "end": 125383,
        "line": 3496,
        "limit": 329
      }
    ],
    "Transition": [
      {
        "kind": "type",
        "offset": 125383,
        "end": 125442,
        "line": 3506,
        "limit": 59
      }
    ],
    "Trigger": [
      {
        "kind": "type",
        "offset": 125442,
        "end": 126229,
        "line": 3507,
        "limit": 787
      }
    ],
    "Navigation": [
      {
        "kind": "type",
        "offset": 126229,
        "end": 126380,
        "line": 3539,
        "limit": 151
      }
    ],
    "Easing": [
      {
        "kind": "interface",
        "offset": 126380,
        "end": 126857,
        "line": 3543,
        "limit": 477
      }
    ],
    "EasingFunctionBezier": [
      {
        "kind": "interface",
        "offset": 126857,
        "end": 126944,
        "line": 3564,
        "limit": 87
      }
    ],
    "EasingFunctionSpring": [
      {
        "kind": "interface",
        "offset": 126944,
        "end": 127127,
        "line": 3570,
        "limit": 183
      }
    ],
    "MotionEasing": [
      {
        "kind": "interface",
        "offset": 127127,
        "end": 127615,
        "line": 3579,
        "limit": 488
      }
    ],
    "PhysicalSpring": [
      {
        "kind": "interface",
        "offset": 127615,
        "end": 127793,
        "line": 3601,
        "limit": 178
      }
    ],
    "NormalizedSpring": [
      {
        "kind": "interface",
        "offset": 127793,
        "end": 127975,
        "line": 3609,
        "limit": 182
      }
    ],
    "AnimationStylePropValue": [
      {
        "kind": "type",
        "offset": 127975,
        "end": 128132,
        "line": 3618,
        "limit": 157
      }
    ],
    "AvailableAnimationStylePropValue": [
      {
        "kind": "type",
        "offset": 128132,
        "end": 128248,
        "line": 3622,
        "limit": 116
      }
    ],
    "BaseAnimationStyle": [
      {
        "kind": "interface",
        "offset": 128248,
        "end": 128401,
        "line": 3626,
        "limit": 153
      }
    ],
    "AvailableAnimationStyle": [
      {
        "kind": "interface",
        "offset": 128401,
        "end": 128653,
        "line": 3633,
        "limit": 252
      }
    ],
    "FigmaAnimationStyleConfiguration": [
      {
        "kind": "interface",
        "offset": 128653,
        "end": 129202,
        "line": 3642,
        "limit": 549
      }
    ],
    "CustomAnimationStyleConfiguration": [
      {
        "kind": "interface",
        "offset": 129202,
        "end": 129493,
        "line": 3660,
        "limit": 291
      }
    ],
    "AnimationStyleConfiguration": [
      {
        "kind": "type",
        "offset": 129493,
        "end": 129668,
        "line": 3670,
        "limit": 175
      }
    ],
    "AppliedFigmaAnimationStyle": [
      {
        "kind": "interface",
        "offset": 129668,
        "end": 130043,
        "line": 3675,
        "limit": 375
      }
    ],
    "AppliedCustomAnimationStyle": [
      {
        "kind": "interface",
        "offset": 130043,
        "end": 130240,
        "line": 3687,
        "limit": 197
      }
    ],
    "AppliedAnimationStyle": [
      {
        "kind": "type",
        "offset": 130240,
        "end": 130552,
        "line": 3694,
        "limit": 312
      }
    ],
    "AnimationEntry": [
      {
        "kind": "type",
        "offset": 130552,
        "end": 130670,
        "line": 3701,
        "limit": 118
      }
    ],
    "KeyframeValue": [
      {
        "kind": "type",
        "offset": 130670,
        "end": 131814,
        "line": 3705,
        "limit": 1144
      }
    ],
    "ManualKeyframeInput": [
      {
        "kind": "interface",
        "offset": 131814,
        "end": 132124,
        "line": 3763,
        "limit": 310
      }
    ],
    "ManualKeyframeTrackInput": [
      {
        "kind": "interface",
        "offset": 132124,
        "end": 132349,
        "line": 3775,
        "limit": 225
      }
    ],
    "ManualKeyframe": [
      {
        "kind": "interface",
        "offset": 132349,
        "end": 132545,
        "line": 3783,
        "limit": 196
      }
    ],
    "ManualKeyframeBinding": [
      {
        "kind": "interface",
        "offset": 132545,
        "end": 132760,
        "line": 3790,
        "limit": 215
      }
    ],
    "ManualKeyframeTrack": [
      {
        "kind": "interface",
        "offset": 132760,
        "end": 132994,
        "line": 3798,
        "limit": 234
      }
    ],
    "KeyframeBinding": [
      {
        "kind": "interface",
        "offset": 132994,
        "end": 133219,
        "line": 3806,
        "limit": 225
      }
    ],
    "KeyframePropertyFieldName": [
      {
        "kind": "type",
        "offset": 133219,
        "end": 134018,
        "line": 3814,
        "limit": 799
      }
    ],
    "EffectKeyframeFieldName": [
      {
        "kind": "type",
        "offset": 134018,
        "end": 134436,
        "line": 3848,
        "limit": 418
      }
    ],
    "KeyframeField": [
      {
        "kind": "type",
        "offset": 134436,
        "end": 135207,
        "line": 3869,
        "limit": 771
      }
    ],
    "ComponentPropKeyframeTracks": [
      {
        "kind": "type",
        "offset": 135207,
        "end": 135358,
        "line": 3900,
        "limit": 151
      }
    ],
    "ComponentPropKeyframeBindings": [
      {
        "kind": "type",
        "offset": 135358,
        "end": 135505,
        "line": 3904,
        "limit": 147
      }
    ],
    "PaintManualKeyframeTrack": [
      {
        "kind": "type",
        "offset": 135505,
        "end": 135699,
        "line": 3908,
        "limit": 194
      }
    ],
    "PaintKeyframeBinding": [
      {
        "kind": "type",
        "offset": 135699,
        "end": 135885,
        "line": 3916,
        "limit": 186
      }
    ],
    "EffectManualKeyframeTracks": [
      {
        "kind": "type",
        "offset": 135885,
        "end": 136114,
        "line": 3924,
        "limit": 229
      }
    ],
    "EffectKeyframeBindings": [
      {
        "kind": "type",
        "offset": 136114,
        "end": 136331,
        "line": 3932,
        "limit": 217
      }
    ],
    "ManualKeyframeTracks": [
      {
        "kind": "type",
        "offset": 136331,
        "end": 136713,
        "line": 3938,
        "limit": 382
      }
    ],
    "Animations": [
      {
        "kind": "type",
        "offset": 136713,
        "end": 137067,
        "line": 3946,
        "limit": 354
      }
    ],
    "Timeline": [
      {
        "kind": "interface",
        "offset": 137067,
        "end": 137191,
        "line": 3954,
        "limit": 124
      }
    ],
    "OverflowDirection": [
      {
        "kind": "type",
        "offset": 137191,
        "end": 137330,
        "line": 3961,
        "limit": 139
      }
    ],
    "OverlayPositionType": [
      {
        "kind": "type",
        "offset": 137330,
        "end": 137558,
        "line": 3965,
        "limit": 228
      }
    ],
    "OverlayBackground": [
      {
        "kind": "type",
        "offset": 137558,
        "end": 137767,
        "line": 3977,
        "limit": 209
      }
    ],
    "OverlayBackgroundInteraction": [
      {
        "kind": "type",
        "offset": 137767,
        "end": 137913,
        "line": 3988,
        "limit": 146
      }
    ],
    "PublishStatus": [
      {
        "kind": "type",
        "offset": 137913,
        "end": 137972,
        "line": 3992,
        "limit": 59
      }
    ],
    "ConnectorEndpointPosition": [
      {
        "kind": "interface",
        "offset": 137972,
        "end": 138058,
        "line": 3993,
        "limit": 86
      }
    ],
    "ConnectorEndpointPositionAndEndpointNodeId": [
      {
        "kind": "interface",
        "offset": 138058,
        "end": 138186,
        "line": 3999,
        "limit": 128
      }
    ],
    "ConnectorEndpointEndpointNodeIdAndMagnet": [
      {
        "kind": "interface",
        "offset": 138186,
        "end": 138421,
        "line": 4006,
        "limit": 235
      }
    ],
    "ConnectorEndpoint": [
      {
        "kind": "type",
        "offset": 138421,
        "end": 138649,
        "line": 4013,
        "limit": 228
      }
    ],
    "ConnectorStrokeCap": [
      {
        "kind": "type",
        "offset": 138649,
        "end": 138987,
        "line": 4020,
        "limit": 338
      }
    ],
    "BaseNodeMixin": [
      {
        "kind": "interface",
        "offset": 138987,
        "end": 143767,
        "line": 4036,
        "limit": 4780
      },
      {
        "kind": "interface",
        "offset": 395611,
        "end": 395960,
        "line": 10280,
        "limit": 349
      }
    ],
    "PluginDataMixin": [
      {
        "kind": "interface",
        "offset": 143767,
        "end": 148082,
        "line": 4127,
        "limit": 4315
      }
    ],
    "SceneNodeMixin": [
      {
        "kind": "interface",
        "offset": 148082,
        "end": 155764,
        "line": 4184,
        "limit": 7682
      },
      {
        "kind": "interface",
        "offset": 395960,
        "end": 396645,
        "line": 10294,
        "limit": 685
      }
    ],
    "MotionNodeMixin": [
      {
        "kind": "interface",
        "offset": 155764,
        "end": 161234,
        "line": 4338,
        "limit": 5470
      }
    ],
    "VariableBindableNodeField": [
      {
        "kind": "type",
        "offset": 161234,
        "end": 161773,
        "line": 4500,
        "limit": 539
      }
    ],
    "VariableBindableTextField": [
      {
        "kind": "type",
        "offset": 161773,
        "end": 161953,
        "line": 4528,
        "limit": 180
      }
    ],
    "VariableBindablePaintField": [
      {
        "kind": "type",
        "offset": 161953,
        "end": 161995,
        "line": 4537,
        "limit": 42
      }
    ],
    "VariableBindablePaintStyleField": [
      {
        "kind": "type",
        "offset": 161995,
        "end": 162043,
        "line": 4538,
        "limit": 48
      }
    ],
    "VariableBindableColorStopField": [
      {
        "kind": "type",
        "offset": 162043,
        "end": 162089,
        "line": 4539,
        "limit": 46
      }
    ],
    "VariableBindableEffectField": [
      {
        "kind": "type",
        "offset": 162089,
        "end": 162178,
        "line": 4540,
        "limit": 89
      }
    ],
    "VariableBindableEffectStyleField": [
      {
        "kind": "type",
        "offset": 162178,
        "end": 162228,
        "line": 4541,
        "limit": 50
      }
    ],
    "VariableBindableLayoutGridField": [
      {
        "kind": "type",
        "offset": 162228,
        "end": 162317,
        "line": 4542,
        "limit": 89
      }
    ],
    "VariableBindableGridStyleField": [
      {
        "kind": "type",
        "offset": 162317,
        "end": 162369,
        "line": 4543,
        "limit": 52
      }
    ],
    "VariableBindableComponentPropertyField": [
      {
        "kind": "type",
        "offset": 162369,
        "end": 162423,
        "line": 4544,
        "limit": 54
      }
    ],
    "VariableBindableComponentPropertyDefinitionField": [
      {
        "kind": "type",
        "offset": 162423,
        "end": 162572,
        "line": 4545,
        "limit": 149
      }
    ],
    "StickableMixin": [
      {
        "kind": "interface",
        "offset": 162572,
        "end": 162875,
        "line": 4549,
        "limit": 303
      }
    ],
    "ChildrenMixin": [
      {
        "kind": "interface",
        "offset": 162875,
        "end": 176145,
        "line": 4562,
        "limit": 13270
      }
    ],
    "ConstraintMixin": [
      {
        "kind": "interface",
        "offset": 176145,
        "end": 176628,
        "line": 4815,
        "limit": 483
      }
    ],
    "DimensionAndPositionMixin": [
      {
        "kind": "interface",
        "offset": 176628,
        "end": 181887,
        "line": 4828,
        "limit": 5259
      }
    ],
    "LayoutMixin": [
      {
        "kind": "interface",
        "offset": 181887,
        "end": 189600,
        "line": 4927,
        "limit": 7713
      }
    ],
    "AspectRatioLockMixin": [
      {
        "kind": "interface",
        "offset": 189600,
        "end": 191262,
        "line": 5071,
        "limit": 1662
      }
    ],
    "BlendMixin": [
      {
        "kind": "interface",
        "offset": 191262,
        "end": 194064,
        "line": 5123,
        "limit": 2802
      }
    ],
    "ContainerMixin": [
      {
        "kind": "interface",
        "offset": 194064,
        "end": 194195,
        "line": 5187,
        "limit": 131
      }
    ],
    "StrokeCap": [
      {
        "kind": "type",
        "offset": 194195,
        "end": 194361,
        "line": 5193,
        "limit": 166
      }
    ],
    "StrokeJoin": [
      {
        "kind": "type",
        "offset": 194361,
        "end": 194415,
        "line": 5202,
        "limit": 54
      }
    ],
    "HandleMirroring": [
      {
        "kind": "type",
        "offset": 194415,
        "end": 194562,
        "line": 5203,
        "limit": 147
      }
    ],
    "AutoLayoutMixin": [
      {
        "kind": "interface",
        "offset": 194562,
        "end": 218505,
        "line": 5207,
        "limit": 16000
      }
    ],
    "GridTrackSize": [
      {
        "kind": "interface",
        "offset": 218505,
        "end": 219655,
        "line": 5710,
        "limit": 1150
      }
    ],
    "GridTrackReorderOptions": [
      {
        "kind": "interface",
        "offset": 219655,
        "end": 220968,
        "line": 5728,
        "limit": 1313
      }
    ],
    "GridTrackReorderEntry": [
      {
        "kind": "interface",
        "offset": 220968,
        "end": 221226,
        "line": 5760,
        "limit": 258
      }
    ],
    "GridLayoutMixin": [
      {
        "kind": "interface",
        "offset": 221226,
        "end": 232570,
        "line": 5769,
        "limit": 11344
      }
    ],
    "AutoLayoutChildrenMixin": [
      {
        "kind": "interface",
        "offset": 232570,
        "end": 236675,
        "line": 6027,
        "limit": 4105
      }
    ],
    "GridChildrenMixin": [
      {
        "kind": "interface",
        "offset": 236675,
        "end": 242059,
        "line": 6090,
        "limit": 5384
      }
    ],
    "InferredAutoLayoutResult": [
      {
        "kind": "interface",
        "offset": 242059,
        "end": 242221,
        "line": 6195,
        "limit": 162
      }
    ],
    "DetachedInfo": [
      {
        "kind": "type",
        "offset": 242221,
        "end": 242438,
        "line": 6199,
        "limit": 217
      }
    ],
    "MinimalStrokesMixin": [
      {
        "kind": "interface",
        "offset": 242438,
        "end": 245937,
        "line": 6211,
        "limit": 3499
      }
    ],
    "IndividualStrokesMixin": [
      {
        "kind": "interface",
        "offset": 245937,
        "end": 246672,
        "line": 6280,
        "limit": 735
      }
    ],
    "MinimalFillsMixin": [
      {
        "kind": "interface",
        "offset": 246672,
        "end": 248765,
        "line": 6293,
        "limit": 2093
      }
    ],
    "VariableWidthPoint": [
      {
        "kind": "interface",
        "offset": 248765,
        "end": 249154,
        "line": 6330,
        "limit": 389
      }
    ],
    "PresetVariableWidthStrokeProperties": [
      {
        "kind": "interface",
        "offset": 249154,
        "end": 249429,
        "line": 6339,
        "limit": 275
      }
    ],
    "CustomVariableWidthStrokeProperties": [
      {
        "kind": "interface",
        "offset": 249429,
        "end": 249792,
        "line": 6346,
        "limit": 363
      }
    ],
    "VariableWidthStrokeProperties": [
      {
        "kind": "type",
        "offset": 249792,
        "end": 249999,
        "line": 6355,
        "limit": 207
      }
    ],
    "ComplexStrokeProperties": [
      {
        "kind": "type",
        "offset": 249999,
        "end": 250210,
        "line": 6360,
        "limit": 211
      }
    ],
    "ScatterBrushProperties": [
      {
        "kind": "interface",
        "offset": 250210,
        "end": 251463,
        "line": 6369,
        "limit": 1253
      }
    ],
    "StretchBrushProperties": [
      {
        "kind": "interface",
        "offset": 251463,
        "end": 252298,
        "line": 6402,
        "limit": 835
      }
    ],
    "BrushStrokeProperties": [
      {
        "kind": "type",
        "offset": 252298,
        "end": 252461,
        "line": 6432,
        "limit": 163
      }
    ],
    "DynamicStrokeProperties": [
      {
        "kind": "interface",
        "offset": 252461,
        "end": 252943,
        "line": 6436,
        "limit": 482
      }
    ],
    "GeometryMixin": [
      {
        "kind": "interface",
        "offset": 252943,
        "end": 254126,
        "line": 6449,
        "limit": 1183
      }
    ],
    "ComplexStrokesMixin": [
      {
        "kind": "interface",
        "offset": 254126,
        "end": 255171,
        "line": 6476,
        "limit": 1045
      }
    ],
    "CornerMixin": [
      {
        "kind": "interface",
        "offset": 255171,
        "end": 256324,
        "line": 6501,
        "limit": 1153
      }
    ],
    "RectangleCornerMixin": [
      {
        "kind": "interface",
        "offset": 256324,
        "end": 257021,
        "line": 6524,
        "limit": 697
      }
    ],
    "ExportMixin": [
      {
        "kind": "interface",
        "offset": 257021,
        "end": 261185,
        "line": 6545,
        "limit": 4164
      }
    ],
    "FramePrototypingMixin": [
      {
        "kind": "interface",
        "offset": 261185,
        "end": 262742,
        "line": 6641,
        "limit": 1557
      }
    ],
    "VectorLikeMixin": [
      {
        "kind": "interface",
        "offset": 262742,
        "end": 263554,
        "line": 6671,
        "limit": 812
      }
    ],
    "ReactionMixin": [
      {
        "kind": "interface",
        "offset": 263554,
        "end": 269663,
        "line": 6694,
        "limit": 6109
      }
    ],
    "DocumentationLink": [
      {
        "kind": "interface",
        "offset": 269663,
        "end": 269796,
        "line": 6859,
        "limit": 133
      }
    ],
    "PublishableMixin": [
      {
        "kind": "interface",
        "offset": 269796,
        "end": 271907,
        "line": 6865,
        "limit": 2111
      }
    ],
    "DefaultShapeMixin": [
      {
        "kind": "interface",
        "offset": 271907,
        "end": 272152,
        "line": 6919,
        "limit": 245
      }
    ],
    "BaseFrameMixin": [
      {
        "kind": "interface",
        "offset": 272152,
        "end": 274617,
        "line": 6931,
        "limit": 2465
      }
    ],
    "DefaultFrameMixin": [
      {
        "kind": "interface",
        "offset": 274617,
        "end": 274710,
        "line": 6988,
        "limit": 93
      }
    ],
    "OpaqueNodeMixin": [
      {
        "kind": "interface",
        "offset": 274710,
        "end": 274820,
        "line": 6990,
        "limit": 110
      }
    ],
    "MinimalBlendMixin": [
      {
        "kind": "interface",
        "offset": 274820,
        "end": 275177,
        "line": 6993,
        "limit": 357
      }
    ],
    "Annotation": [
      {
        "kind": "interface",
        "offset": 275177,
        "end": 275351,
        "line": 7003,
        "limit": 174
      }
    ],
    "AnnotationProperty": [
      {
        "kind": "interface",
        "offset": 275351,
        "end": 275424,
        "line": 7009,
        "limit": 73
      }
    ],
    "AnnotationPropertyType": [
      {
        "kind": "type",
        "offset": 275424,
        "end": 276035,
        "line": 7012,
        "limit": 611
      }
    ],
    "AnnotationsMixin": [
      {
        "kind": "interface",
        "offset": 276035,
        "end": 276447,
        "line": 7046,
        "limit": 412
      }
    ],
    "Measurement": [
      {
        "kind": "interface",
        "offset": 276447,
        "end": 276731,
        "line": 7057,
        "limit": 284
      }
    ],
    "MeasurementSide": [
      {
        "kind": "type",
        "offset": 276731,
        "end": 276870,
        "line": 7073,
        "limit": 139
      }
    ],
    "MeasurementOffset": [
      {
        "kind": "type",
        "offset": 276870,
        "end": 277002,
        "line": 7077,
        "limit": 132
      }
    ],
    "MeasurementsMixin": [
      {
        "kind": "interface",
        "offset": 277002,
        "end": 279511,
        "line": 7086,
        "limit": 2509
      }
    ],
    "ComponentPropertiesMixin": [
      {
        "kind": "interface",
        "offset": 279511,
        "end": 285906,
        "line": 7166,
        "limit": 6395
      }
    ],
    "BaseNonResizableTextMixin": [
      {
        "kind": "interface",
        "offset": 285906,
        "end": 302957,
        "line": 7360,
        "limit": 16000
      }
    ],
    "NonResizableTextMixin": [
      {
        "kind": "interface",
        "offset": 302957,
        "end": 314539,
        "line": 7755,
        "limit": 11582
      }
    ],
    "NonResizableTextPathMixin": [
      {
        "kind": "interface",
        "offset": 314539,
        "end": 314683,
        "line": 8038,
        "limit": 144
      }
    ],
    "TextSublayerNode": [
      {
        "kind": "interface",
        "offset": 314683,
        "end": 314762,
        "line": 8042,
        "limit": 79
      }
    ],
    "DocumentNode": [
      {
        "kind": "interface",
        "offset": 314762,
        "end": 320738,
        "line": 8043,
        "limit": 5976
      }
    ],
    "ExplicitVariableModesMixin": [
      {
        "kind": "interface",
        "offset": 320738,
        "end": 321784,
        "line": 8167,
        "limit": 1046
      }
    ],
    "PageNode": [
      {
        "kind": "interface",
        "offset": 321784,
        "end": 327273,
        "line": 8190,
        "limit": 5489
      },
      {
        "kind": "interface",
        "offset": 396877,
        "end": 397591,
        "line": 10325,
        "limit": 714
      }
    ],
    "FrameNode": [
      {
        "kind": "interface",
        "offset": 327273,
        "end": 327650,
        "line": 8324,
        "limit": 377
      }
    ],
    "GroupNode": [
      {
        "kind": "interface",
        "offset": 327650,
        "end": 328264,
        "line": 8334,
        "limit": 614
      }
    ],
    "TransformGroupNode": [
      {
        "kind": "interface",
        "offset": 328264,
        "end": 328981,
        "line": 8357,
        "limit": 717
      }
    ],
    "SliceNode": [
      {
        "kind": "interface",
        "offset": 328981,
        "end": 329311,
        "line": 8381,
        "limit": 330
      }
    ],
    "RectangleNode": [
      {
        "kind": "interface",
        "offset": 329311,
        "end": 329794,
        "line": 8391,
        "limit": 483
      }
    ],
    "LineNode": [
      {
        "kind": "interface",
        "offset": 329794,
        "end": 330139,
        "line": 8410,
        "limit": 345
      }
    ],
    "EllipseNode": [
      {
        "kind": "interface",
        "offset": 330139,
        "end": 330720,
        "line": 8421,
        "limit": 581
      }
    ],
    "PolygonNode": [
      {
        "kind": "interface",
        "offset": 330720,
        "end": 331234,
        "line": 8442,
        "limit": 514
      }
    ],
    "StarNode": [
      {
        "kind": "interface",
        "offset": 331234,
        "end": 332294,
        "line": 8463,
        "limit": 1060
      }
    ],
    "VectorNode": [
      {
        "kind": "interface",
        "offset": 332294,
        "end": 332729,
        "line": 8490,
        "limit": 435
      }
    ],
    "TextNode": [
      {
        "kind": "interface",
        "offset": 332729,
        "end": 336129,
        "line": 8508,
        "limit": 3400
      }
    ],
    "TextPathNode": [
      {
        "kind": "interface",
        "offset": 336129,
        "end": 338354,
        "line": 8580,
        "limit": 2225
      }
    ],
    "ComponentPropertyType": [
      {
        "kind": "type",
        "offset": 338354,
        "end": 338530,
        "line": 8642,
        "limit": 176
      }
    ],
    "InstanceSwapPreferredValue": [
      {
        "kind": "type",
        "offset": 338530,
        "end": 338620,
        "line": 8646,
        "limit": 90
      }
    ],
    "SlotSettings": [
      {
        "kind": "type",
        "offset": 338620,
        "end": 338895,
        "line": 8650,
        "limit": 275
      }
    ],
    "ComponentPropertyOptions": [
      {
        "kind": "type",
        "offset": 338895,
        "end": 339124,
        "line": 8660,
        "limit": 229
      }
    ],
    "ComponentPropertyDefinitions": [
      {
        "kind": "type",
        "offset": 339124,
        "end": 339521,
        "line": 8668,
        "limit": 397
      }
    ],
    "ComponentSetNode": [
      {
        "kind": "interface",
        "offset": 339521,
        "end": 340340,
        "line": 8681,
        "limit": 819
      }
    ],
    "ComponentNode": [
      {
        "kind": "interface",
        "offset": 340340,
        "end": 341212,
        "line": 8698,
        "limit": 872
      }
    ],
    "ComponentProperties": [
      {
        "kind": "type",
        "offset": 341212,
        "end": 341496,
        "line": 8723,
        "limit": 284
      }
    ],
    "InstanceNode": [
      {
        "kind": "interface",
        "offset": 341496,
        "end": 345750,
        "line": 8733,
        "limit": 4254
      }
    ],
    "SlotNode": [
      {
        "kind": "interface",
        "offset": 345750,
        "end": 347160,
        "line": 8801,
        "limit": 1410
      }
    ],
    "BooleanOperationNode": [
      {
        "kind": "interface",
        "offset": 347160,
        "end": 347772,
        "line": 8826,
        "limit": 612
      }
    ],
    "StickyNode": [
      {
        "kind": "interface",
        "offset": 347772,
        "end": 348553,
        "line": 8847,
        "limit": 781
      }
    ],
    "StampNode": [
      {
        "kind": "interface",
        "offset": 348553,
        "end": 348968,
        "line": 8873,
        "limit": 415
      }
    ],
    "TableNode": [
      {
        "kind": "interface",
        "offset": 348968,
        "end": 351849,
        "line": 8887,
        "limit": 2881
      }
    ],
    "TableCellNode": [
      {
        "kind": "interface",
        "offset": 351849,
        "end": 352428,
        "line": 8976,
        "limit": 579
      }
    ],
    "HighlightNode": [
      {
        "kind": "interface",
        "offset": 352428,
        "end": 352851,
        "line": 9002,
        "limit": 423
      }
    ],
    "WashiTapeNode": [
      {
        "kind": "interface",
        "offset": 352851,
        "end": 353204,
        "line": 9019,
        "limit": 353
      }
    ],
    "ShapeWithTextNode": [
      {
        "kind": "interface",
        "offset": 353204,
        "end": 355643,
        "line": 9029,
        "limit": 2439
      }
    ],
    "CodeBlockNode": [
      {
        "kind": "interface",
        "offset": 355643,
        "end": 356564,
        "line": 9107,
        "limit": 921
      }
    ],
    "LabelSublayerNode": [
      {
        "kind": "interface",
        "offset": 356564,
        "end": 356634,
        "line": 9145,
        "limit": 70
      }
    ],
    "ConnectorNode": [
      {
        "kind": "interface",
        "offset": 356634,
        "end": 358273,
        "line": 9148,
        "limit": 1639
      }
    ],
    "VariableResolvedDataType": [
      {
        "kind": "type",
        "offset": 358273,
        "end": 358368,
        "line": 9198,
        "limit": 95
      }
    ],
    "VariableAlias": [
      {
        "kind": "interface",
        "offset": 358368,
        "end": 358434,
        "line": 9199,
        "limit": 66
      }
    ],
    "VariableValue": [
      {
        "kind": "type",
        "offset": 358434,
        "end": 358525,
        "line": 9203,
        "limit": 91
      }
    ],
    "VariableScope": [
      {
        "kind": "type",
        "offset": 358525,
        "end": 359031,
        "line": 9204,
        "limit": 506
      }
    ],
    "CodeSyntaxPlatform": [
      {
        "kind": "type",
        "offset": 359031,
        "end": 359083,
        "line": 9230,
        "limit": 52
      }
    ],
    "Variable": [
      {
        "kind": "interface",
        "offset": 359083,
        "end": 368669,
        "line": 9231,
        "limit": 9586
      }
    ],
    "VariableCollection": [
      {
        "kind": "interface",
        "offset": 368669,
        "end": 371775,
        "line": 9445,
        "limit": 3106
      }
    ],
    "ExtendedVariableCollection": [
      {
        "kind": "interface",
        "offset": 371775,
        "end": 373199,
        "line": 9514,
        "limit": 1424
      }
    ],
    "AnnotationCategoryColor": [
      {
        "kind": "type",
        "offset": 373199,
        "end": 373308,
        "line": 9549,
        "limit": 109
      }
    ],
    "AnnotationCategory": [
      {
        "kind": "interface",
        "offset": 373308,
        "end": 373970,
        "line": 9551,
        "limit": 662
      }
    ],
    "WidgetNode": [
      {
        "kind": "interface",
        "offset": 373970,
        "end": 374957,
        "line": 9577,
        "limit": 987
      }
    ],
    "EmbedData": [
      {
        "kind": "interface",
        "offset": 374957,
        "end": 375697,
        "line": 9601,
        "limit": 740
      }
    ],
    "EmbedNode": [
      {
        "kind": "interface",
        "offset": 375697,
        "end": 376012,
        "line": 9629,
        "limit": 315
      }
    ],
    "LinkUnfurlData": [
      {
        "kind": "interface",
        "offset": 376012,
        "end": 376609,
        "line": 9643,
        "limit": 597
      }
    ],
    "LinkUnfurlNode": [
      {
        "kind": "interface",
        "offset": 376609,
        "end": 376947,
        "line": 9669,
        "limit": 338
      }
    ],
    "MediaData": [
      {
        "kind": "interface",
        "offset": 376947,
        "end": 377051,
        "line": 9683,
        "limit": 104
      }
    ],
    "MediaNode": [
      {
        "kind": "interface",
        "offset": 377051,
        "end": 377968,
        "line": 9689,
        "limit": 917
      }
    ],
    "SectionNode": [
      {
        "kind": "interface",
        "offset": 377968,
        "end": 379392,
        "line": 9722,
        "limit": 1424
      }
    ],
    "SlideNode": [
      {
        "kind": "interface",
        "offset": 379392,
        "end": 380242,
        "line": 9765,
        "limit": 850
      }
    ],
    "SlideRowNode": [
      {
        "kind": "interface",
        "offset": 380242,
        "end": 380638,
        "line": 9795,
        "limit": 396
      }
    ],
    "SlideGridNode": [
      {
        "kind": "interface",
        "offset": 380638,
        "end": 381049,
        "line": 9808,
        "limit": 411
      }
    ],
    "InteractiveSlideElementNode": [
      {
        "kind": "interface",
        "offset": 381049,
        "end": 381659,
        "line": 9821,
        "limit": 610
      }
    ],
    "SlideTransition": [
      {
        "kind": "interface",
        "offset": 381659,
        "end": 382893,
        "line": 9838,
        "limit": 1234
      }
    ],
    "BaseNode": [
      {
        "kind": "type",
        "offset": 382893,
        "end": 383018,
        "line": 9892,
        "limit": 125
      }
    ],
    "SceneNode": [
      {
        "kind": "type",
        "offset": 383018,
        "end": 383684,
        "line": 9896,
        "limit": 666
      }
    ],
    "NodeType": [
      {
        "kind": "type",
        "offset": 383684,
        "end": 383717,
        "line": 9934,
        "limit": 33
      }
    ],
    "StyleType": [
      {
        "kind": "type",
        "offset": 383717,
        "end": 383874,
        "line": 9935,
        "limit": 157
      }
    ],
    "InheritedStyleField": [
      {
        "kind": "type",
        "offset": 383874,
        "end": 384116,
        "line": 9939,
        "limit": 242
      }
    ],
    "StyleConsumers": [
      {
        "kind": "interface",
        "offset": 384116,
        "end": 384273,
        "line": 9950,
        "limit": 157
      }
    ],
    "BaseStyleMixin": [
      {
        "kind": "interface",
        "offset": 384273,
        "end": 385119,
        "line": 9957,
        "limit": 846
      }
    ],
    "PaintStyle": [
      {
        "kind": "interface",
        "offset": 385119,
        "end": 385638,
        "line": 9977,
        "limit": 519
      }
    ],
    "TextStyle": [
      {
        "kind": "interface",
        "offset": 385638,
        "end": 388361,
        "line": 9993,
        "limit": 2723
      }
    ],
    "EffectStyle": [
      {
        "kind": "interface",
        "offset": 388361,
        "end": 388861,
        "line": 10066,
        "limit": 500
      }
    ],
    "GridStyle": [
      {
        "kind": "interface",
        "offset": 388861,
        "end": 389367,
        "line": 10082,
        "limit": 506
      }
    ],
    "CustomAnimationStyle": [
      {
        "kind": "interface",
        "offset": 389367,
        "end": 391097,
        "line": 10098,
        "limit": 1730
      }
    ],
    "BaseStyle": [
      {
        "kind": "type",
        "offset": 391097,
        "end": 391186,
        "line": 10148,
        "limit": 89
      }
    ],
    "Image": [
      {
        "kind": "interface",
        "offset": 391186,
        "end": 391896,
        "line": 10149,
        "limit": 710
      }
    ],
    "FindAllCriteria": [
      {
        "kind": "interface",
        "offset": 391896,
        "end": 393448,
        "line": 10169,
        "limit": 1552
      }
    ],
    "TransformModifier": [
      {
        "kind": "type",
        "offset": 393448,
        "end": 393647,
        "line": 10228,
        "limit": 199
      }
    ],
    "RepeatModifier": [
      {
        "kind": "interface",
        "offset": 393647,
        "end": 394399,
        "line": 10233,
        "limit": 752
      }
    ],
    "LinearRepeatModifier": [
      {
        "kind": "interface",
        "offset": 394399,
        "end": 394730,
        "line": 10247,
        "limit": 331
      }
    ],
    "RadialRepeatModifier": [
      {
        "kind": "interface",
        "offset": 394730,
        "end": 394885,
        "line": 10257,
        "limit": 155
      }
    ],
    "QueryResult": [
      {
        "kind": "interface",
        "offset": 394885,
        "end": 395399,
        "line": 10262,
        "limit": 514
      }
    ],
    "ScreenshotOptions": [
      {
        "kind": "interface",
        "offset": 395399,
        "end": 395611,
        "line": 10274,
        "limit": 212
      }
    ],
    "NonFunctionWritableProperties": [
      {
        "kind": "type",
        "offset": 397591,
        "end": 398783,
        "line": 10347,
        "limit": 1192
      }
    ],
    "FigCreatorOpts": [
      {
        "kind": "type",
        "offset": 398783,
        "end": 399530,
        "line": 10378,
        "limit": 747
      }
    ],
    "FigAPI": [
      {
        "kind": "interface",
        "offset": 399530,
        "end": 411557,
        "line": 10397,
        "limit": 12027
      }
    ],
    "FigPlanNode": [
      {
        "kind": "interface",
        "offset": 411557,
        "end": 422834,
        "line": 10667,
        "limit": 11277
      }
    ],
    "FigPlanStyle": [
      {
        "kind": "type",
        "offset": 422834,
        "end": 422932,
        "line": 10903,
        "limit": 98
      }
    ],
    "FigPlanPaintStyle": [
      {
        "kind": "interface",
        "offset": 422932,
        "end": 423761,
        "line": 10905,
        "limit": 829
      }
    ],
    "FigPlanTextStyle": [
      {
        "kind": "interface",
        "offset": 423761,
        "end": 424136,
        "line": 10923,
        "limit": 375
      }
    ],
    "FigPlanEffectStyle": [
      {
        "kind": "interface",
        "offset": 424136,
        "end": 424477,
        "line": 10936,
        "limit": 341
      }
    ],
    "FigPlanGridStyle": [
      {
        "kind": "interface",
        "offset": 424477,
        "end": 424853,
        "line": 10946,
        "limit": 376
      }
    ],
    "GradientStop": [
      {
        "kind": "interface",
        "offset": 424853,
        "end": 426061,
        "line": 10957,
        "limit": 1208
      }
    ],
    "FigPlanVariable": [
      {
        "kind": "type",
        "offset": 426061,
        "end": 426296,
        "line": 10982,
        "limit": 235
      }
    ],
    "FigPlanVariableSetOpts": [
      {
        "kind": "type",
        "offset": 426296,
        "end": 426441,
        "line": 10991,
        "limit": 145
      }
    ],
    "FigPlanColorVar": [
      {
        "kind": "interface",
        "offset": 426441,
        "end": 427452,
        "line": 10995,
        "limit": 1011
      }
    ],
    "FigPlanNumVar": [
      {
        "kind": "interface",
        "offset": 427452,
        "end": 428049,
        "line": 11016,
        "limit": 597
      }
    ],
    "FigPlanTimingVar": [
      {
        "kind": "interface",
        "offset": 428049,
        "end": 428683,
        "line": 11031,
        "limit": 634
      }
    ],
    "FigPlanEasingVar": [
      {
        "kind": "interface",
        "offset": 428683,
        "end": 429362,
        "line": 11048,
        "limit": 679
      }
    ],
    "FigPlanBoolVar": [
      {
        "kind": "interface",
        "offset": 429362,
        "end": 429878,
        "line": 11067,
        "limit": 516
      }
    ],
    "FigPlanStringVar": [
      {
        "kind": "interface",
        "offset": 429878,
        "end": 430574,
        "line": 11081,
        "limit": 696
      }
    ],
    "FigPlanVarCollection": [
      {
        "kind": "interface",
        "offset": 430574,
        "end": 433598,
        "line": 11101,
        "limit": 3024
      }
    ],
    "FigDoneResult": [
      {
        "kind": "interface",
        "offset": 433598,
        "end": 434301,
        "line": 11173,
        "limit": 703
      }
    ],
    "FigQueryResult": [
      {
        "kind": "interface",
        "offset": 434301,
        "end": 442939,
        "line": 11190,
        "limit": 8638
      }
    ]
  }
}
