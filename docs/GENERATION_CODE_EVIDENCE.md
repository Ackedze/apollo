# NEXT-02 · shared evidence, code bindings and lossless packaging

Fresh current producer consumer 06.10.2026: [registry 1.1.0/full closure handoff](GENERATION_CURRENT_INPUTS.md).
Packaging/registry refresh выполнены владельцами; remaining source/profile/native/live/release gates указаны там. Ниже — historical NEXT-02 implementation milestone.

Local implementation: **Editor 0.2.91 / core 0.1.10 / v4 profile 0.4.0**.
No normative source, working archive, registry, lock, release or published manifest
was edited. NEXT02-SCOPED-GENERATION-AUTHORITY remains proposal-only. A whole
source Draft still blocks both targets. New fields preserve the existing manual
v2 / compiled v2.1 schema through opt-in runtime versions; historical unmarked
contracts retain their producer selection and predicate replay.

## Source fields delivered to Contract Creation

The canonical types and closed validator are in
`packages/component-contract-core/src/types.ts` and `representation-evidence.ts`.
They are reexported by Editor; no parallel schema or copy of rules exists.

| Request | Authoring field | Consumer meaning |
| --- | --- | --- |
| NEXT02-REPRESENTATION-EVIDENCE | code representation `codeEvidence.version=1` | Four independent claims; API availability never accepts parity |
| NEXT02-OWNED-OCCURRENCE-CODE-BINDING | semantic binding `targetId` + `ownedOccurrence.version=1` | Existing declared target/direct dependency, source Figma representation, exact source addresses and trusted native collection resolver |
| NEXT02-NATIVE-SLOT-CODE-BINDING | semantic binding `nativeSlotBinding.version=1` | Exact existing Figma native SLOT property/target → code `props.children`, ordered external content |
| Closed scalar transformation | semantic binding `codeTransform.version=1` | `identity` or total finite `enum-map`; free transform strings cannot enable this profile |
| NEXT02-DEPENDENCY-PROJECTION-PACKAGING | `buildExportBundle(...,{projection})`, then `buildAuthoringZip(bundle,actualFiles)` | Historical stamp only after exact recompile hash; full read-only inventory/facts survive ZIP/reopen |

`codeEvidence` shape:

```json
{
  "version": 1,
  "sourcePin": {
    "packageName": "arui-private", "packageVersion": "<version>",
    "commit": "<40 hex>", "registryDigest": "<64 hex basis digest>",
    "mappingId": "<exact mapping id>"
  },
  "availability": {"status": "confirmed-source-api", "evidenceRefs": [{"path": "src/<source>", "sha256": "<64 hex>"}]},
  "parity": {"status": "not-confirmed", "profileIds": [], "unresolvedGapIds": ["<gap id>"]},
  "acceptance": {"status": "not-run", "receiptRefs": []},
  "publication": {"status": "not-confirmed"}
}
```

The source pin must equal the representation locator's packageName/packageVersion,
sourceCommit/registryDigest/mappingId. Paths are relative, bounded to 64 refs per
section, without traversal. Confirmed availability requires pinned refs. Accepted
parity requires existing platform-matched code generation profiles and zero
unresolved gaps. Accepted acceptance requires receipt refs and accepted parity;
publication is separately declared. These are schema claims, not live proof.
Compiler emits `representationEvidenceVersion=1` and/or
`crossRepresentationBindingsVersion=1` only for new fields, producer minimum
0.2.91. Core runtime, exact dependencies and v4 reject unsupported/missing markers
or malformed opt-in shapes. Predicate Ready remains independent of Code Draft.

Owned binding fields: `dependencyId`, `dependencyBindingId`,
`sourceRepresentationId`, `collectionResolver={version:1,source:"trusted-native-capture",
ownerTargetId,visibility:"captured-effective",ordering:"captured-source-order"}`,
`sourceProperty={property,propertyType}` and a closed `transformId`. Allowed handlers:

- `owned-button-label.v1`: TEXT → `props.elements[].children`, semantic content/string.
- `owned-button-disabled.v1`: VARIANT `False/True` → `props.elements[].disabled`, semantic state/enum.
- `owned-button-primary-first.v1`: VARIANT `Primary/Secondary` → `props.primaryFirst`, semantic appearance/enum; only the first visible occurrence may be Primary.

Targets must be resolved and refer to their existing exact direct-child dependency,
owner and source-address variant hints. The core projector proves exact child pins,
owner/source/main identities and typed properties through canonical capture before
reading values. It derives indices from actual native owner order after effective
visibility filtering. Hidden members still need identity proof; foreign, missing,
duplicate, unmapped native members and unknown visibility fail closed. Handlers and
business priorities/events never come from labels or array position.

Native SLOT binding fields: `figmaRepresentationId`, `targetId`,
`propertyIdentity`, `propertyType:"SLOT"`, `codeRepresentationId`,
`codePath:"props.children"`, `contentPolicy:"preserve-ordered-content"`,
`proof:"trusted-native-capture"`. It must match the existing semantic Figma binding
and external slot-api control path, not a layer name. Empty/ordered payload and
unmapped-child validation still require the accepted executable native host recipe.
The installed official typings expose no SLOT writer; generic append cannot replace
it. See [native host handoff](GENERATION_NATIVE_HOST.md).

## Fresh observations and receipts

The Node-only `scripts/generation-representation-evidence.js` runs inside the
existing read-only Code Connect reader. Availability refs must already occur in
the producer's pinned file manifest. It rechecks actual file bytes, confines real
paths to the configured checkout and rereads every consumed file before returning.
Acceptance refs must be JSON under `tools/code-connect/reports/`, at most 1 MiB.
No paths, receipts, profiles or host callbacks can be supplied through ScreenSpec.

An acceptance receipt uses `schemaVersion="apollo.code-profile-acceptance.v1"`,
`targetProduct="apollo-v4"`, `status="accepted"`, exact componentId/representationId,
`scopeHash`, `sourcePin`, `codeHash`, declared `profileIds`, and
`checks={compile:"passed",browser:"passed",layout:"passed"}`. Build-only,
not-run, stale/mismatched or missing evidence cannot accept a profile. This receipt
format is delivered for owner acceptance; no real receipt was invented.

The saved `registryDigest` is an immutable **basis**, not a claimed fresh digest.
Transient proof binds it to the current observed registry and checkout. This avoids
an archive containing its own archive-registry hash. `representationScopeHash`
covers rules, target/source identities, bindings, profiles, dependency pins and
full generated facts, excluding codeEvidence claims and bookkeeping revision/
timestamps. Actual source revisions/hashes remain pinned independently in the
canonical package lock. Attaching receipt refs does not create a circular hash.

Generation projection retains these fields/profiles/scope; preflight requires a
fresh host observation and the exact declared accepted code profile. Source Ready,
representation verification, source API, per-input producer preflight and native
execution gates all remain active. A unique accepted source profile can be selected;
multiple profiles require an explicit trusted selection. Profile properties must
match all declared input states. Arbitrary generated frontend input still needs
its own pinned compile/browser verification; no frontend route/host was added here.

## Exporter workflow and exact dependency pins

For an unchanged imported manual the Editor uses an own compiled projection when
present and exact-source matched. To preserve an older producer from a ZIP lacking
its own projection, import the canonical own projection together with that ZIP, or
pass it explicitly to `buildExportBundle`'s fourth argument. Its source hash,
component identity, producer stamp and full derived contract hash must reproduce.
A changed manual exports a newly compiled projection; pins must then be reviewed.
The exporter never infers historical versions from names, uses cached predicates,
ignores dependency pins or rolls back the compiler/runtime.

The authoring ZIP carries actual read-only JSON inventory independently of legacy
descriptive source labels, deduplicates identical filenames/content and preserves
linked dependency projections. Reopen verifies full authoring-facts equality.
Importer prefers saved full variantEvidence over a reduced anatomy reconstructed
from compiled componentApi when no real generated source is present. Existing
canonical ZIP naming remains compatible. Stale projection/facts/path conflicts
block export visibly in Editor.

Read-only real verification on 05.10.2026 wrote **temporary ZIPs only**:

| Source | Preserved compiled hash | Producer | Result |
| --- | --- | --- | --- |
| Spinner r8 | `909113967175c1ae618d2857d96855a3d3f53cdfe0b38cf923ce10b56e553221` | 0.2.33 | exact source/facts, v4 Ready |
| Button r31 | `6136013045fbcab513f8e7cbcd0ce968903ef81851c927dd7426e218438f5f8b` | 0.2.52 | exact source/facts and Spinner pin, v4 Ready |

Tampered cached presentation was rejected after recompilation. The temporary exact
closure removes COMPONENT_DEPENDENCY_LINK and reaches ButtonsGroup's remaining
Draft/Ready block. The accepted production ZIPs were unchanged; their packaging
blocker remains until Contract Creation makes an authoritative reexport, then the
registry/Generation lock owner explicitly refreshes archive hashes.

## Local verification and outstanding owner work

Core **76/76**, Editor **820/820**, Generation **49/49**, v4 **182/182** and root
**81/81** passed typecheck/build/test gates. Chrome confirms passport settings/
save/ZIP and visible stale-cache rejection; v4 panel/drag-drop/source guards pass
at 440/360 px. Tests use synthetic norms; private reports/catalogs were not copied.
This is local implementation/consumer parity, not Figma/code/live/release acceptance.

1. Contract Creation applies reviewed new typed fields and authoritatively
   reexports Button/Spinner; no working archive/pin was changed by Generation.
2. Registry/locks owner refreshes new archive bytes and exact source closure.
3. Owners accept exact native recipes, Code parity/profile receipt and product
   ScreenSpec labels/handlers/transitions/viewport; width/overflow gaps stay open.
4. Source Draft/context gates remain closed unless their authority is explicitly
   accepted. Scoped generation authority is still only a proposal.
5. Owner performs native/frontend execution and fresh live cases with complete
   human rule text and stable RuleID on each canvas PASS/FAIL/ALLOW/WARNING/UNKNOWN.
   Common release/manifest/publication remain with General.

NEXT-05 selective build/browser handoff is available at
`arui-private/tools/code-connect/frontend-host/README.md`; it confirms two subpaths,
not full package distribution or layout parity. Its source-build report SHA256
`dce4d24a90e7ad8baf34f840d74b7488ea7124599633bb2986e0c923b1a57b34`
was verified read-only. Body width/hidden actions, overflow onClick/order, differing
padding and legacy peer dependency gap remain unaccepted. That owner work was not
repeated here.

Final NEXT-02 build SHA256 (05.10.2026):

- runtime.cjs: `980ad3288b2b707b9b3bacefccee06736bf578f7e2e53f60b48b9bd7ad5997a4`
- build-inputs.json: `ebefc13209102e2f8578f96e989bace3e87a01d7745ea5665c4630f5472d444d`
- code.js: `5bd9a5be5e5c49e3e96a640306d7e43c3e175610d202167ae125671f3f30b034`
- ui.html: `5276890c506b60b040b5be0deae731d31235cf9405ce017d3294f6cc29fda552`

Actual built main/UI → reloaded healthy local Proxy → current authoritative ZIP/Code Connect
returns SOURCE_COMPILE with creation disabled and zero native writes. The temporary
verified exports are not installed as authoritative sources. Proxy v4 route/launcher
regressions **27/27** pass. Existing env, knowledge, manifest and signed launcher
were unchanged; only the already connected Generation service reload list was updated.

После NEXT-02 локально реализован NEXT-05 frontend host. NEXT-02 hashes выше описывают свой milestone; актуальные main/UI/build-input pins и source/producer gates: [GENERATION_FRONTEND_HOST](GENERATION_FRONTEND_HOST.md). Authoritative exports теперь BG r58 / CC r13/r8 и repackaged Button r31/Spinner r8; producer refresh выполняет Code Connect.
