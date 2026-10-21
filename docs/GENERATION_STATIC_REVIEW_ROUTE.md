# NEXT-03/07 · Static review in v4 / Proxy · 06.10.2026

The built Apollo panel now has **«Проверить для review»** beside the existing
plan check. Upload one ScreenSpec or producer review JSON (up to 1 MB). The action
reads sources through a separate fixed Proxy endpoint and shows schema, source,
API, coverage, consumer freshness, live and release status independently.
It clears the previous generation session. Create/Generate stays disabled for
all review results; content/intent is displayed only as text data, with no target
preview, imports, callbacks, backend handlers or writer.

The agreed product draft remains incomplete: «Сохранить» → «Назад», local save/back
IDs, Size56, viewport width1600 and default are confirmed. Height, View/disabled/
explicit Loading=false for both and independent business priority remain missing;
actual BG width is not derived from viewport. The panel lists the exact missing
JSON fields. Neither the separate owner proposal nor synthetic data fills them.

## Trust and transport

`POST /generation/static-review` accepts only version, requestId, input and
buildHash. Request version is `apollo.v4-static-review-request.v1-draft`; result
version is `apollo.v4-static-review-result.v1-draft`, in a separately versioned
response envelope. The panel sends the hash injected by the standard v4 build;
the server compares it with its current build before reading.

Proxy selects paths and manifest/report SHA pins from server-owned
`src/generation-agent/static-review-config.json`, together with existing trusted
local workspace/project configuration. Client filesystem paths, trusted pins,
URLs or host fields are rejected. Server and panel validate the closed bounded
DTO, request/input/build/result hash correspondence, source/coverage consistency,
fixed unaccepted authority and blocked targets. Errors contain machine codes,
not paths, filenames, subprocess details, private manuals or norm bodies.

The Node reader uses the existing separate authoring/producer review boundaries.
For incomplete input it still reads source metadata and preserves missing-field
and unavailable-read diagnostics. Complete specs need a report-pinned matching
producer document; unmatched input is diagnosed, without prepare/emit/execute.
Imported producer JSON must match the independently pinned document and its
reconstructed content/hashes. Source/producer/build drift rejects the read;
consumer drift permits explicitly historical review with freshness **stale**.
No historical observation is relabelled as current proof.

Transport contains compact source status/hash/count metadata, bounded diagnostics,
and optional content plus a non-executable intent summary. Compiled authority,
manual/facts/norm bodies, private filesystem paths and trusted configuration do
not cross into the panel. `accepted=false`, `executionAllowed=false`,
`generationPlanHash=null`, profile/native/scoped unaccepted, targets blocked,
live not-run and release not-accepted apply to every result. Existing interactive
v1, strict runtime Ready gates, native/primitive-null providers and rollback code
are unchanged.

## Earlier route verification (before NEXT07 root/migration repair)

- Generation **152/152**, v4 **248/248**, adapters **9/9 + 13/13**, root **81/81**,
  type-check/build/runtime parser passed. **50 new synthetic targeted tests**:
  core25, UI transport9, Proxy HTTP16. Existing context/frontend HTTP7 also passed.
- All four panel/browser harnesses passed at 440/360 px. The new harness used the
  built UI → actual mounted Proxy HTTP route → synthetic injected reader. It
  verified missing fields, Draft9/stale status, data-only content, response forgery,
  disabled Create, no preview links and no generation/host calls.
- Two private actual HTTP probes used a temporary mounted Proxy route and the
  real current pinned Node reader: the product draft was invalid with eight
  missing fields and no substituted content; the producer document was reviewed
  only as historical/stale. BG59 Draft/nonExecutable9 and SOURCE_COMPILE remain.
- Knowledge check passed. Full Proxy suite has **391 passed / 7 failed**: missing
  legacy pattern/text/migration catalog files and a crosswalk/document mismatch.
  The exact same seven failures reproduced with the pre-stage service SHA restored
  in memory. Those sources were not changed or fabricated by this stage. This
  remains a blocker to claiming a fully green Proxy gate.

No installed Proxy process or macOS app was restarted, rebuilt or installed.
Browser proof concerns the local panel/harness, not actual Figma or the installed
Proxy runtime. If the running Proxy lacks the route, the panel reports that
explicitly. No new arui-private frontend imports/application browser scenarios,
actual Figma/native/target operation, live acceptance, publishing or installation
occurred.

The previously accepted exact producer snapshot remains immutable and becomes
historical/stale after this consumer/Proxy stage. A new exact consumer vector and
separate sequential Code Connect rebind request are prepared privately after the
final standard v4 build. General owns technical review and the next rebind; this
worker does not edit producer/registry/DS/compiler policy or repin observations.
Owner product proposal, source/profile/scoped/native/canonical/width/target/parity/
live/release work and all five overall goals remain open.

Baseline stays shared core0.1.10 / Editor0.2.91 / generation-core0.1.1 / v4 0.4.0 /
Proxy1.3.1. See [PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
[EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).

## Detached consumer binding: stage1 preparation

Producer v1 and the closed v1 request/result/envelope retain their existing
semantics. The panel uses explicitly additive `apollo.v4-static-review-request.v2-draft`,
`apollo.v4-static-review-response.v2-draft` and `apollo.v4-static-review-result.v2-draft`.
The v2 result adds only a closed `consumerBinding` summary: status, receiptHash,
vectorHash, configHash, buildHash, checkedFiles and diagnosticCode. It preserves
original producer freshness and its mismatch count. Full original mismatch rows
remain in the local reader's basis/inspection; no private paths cross the UI wire.
Binding matches never changes Draft, SOURCE_COMPILE, missing product fields,
coverage, native/profile/scoped, blocked execution, live or release gates.

The generic local loader is `scripts/static-review-consumer-binding.cjs`. It
requires an independently supplied receiptPin and a trusted local context
(configPath, manifestPin/reportPin, repository/workspace/producer roots and build
manifest path). Missing trust is unverified. Invalid or drifted bindings fail
closed with bounded `CONSUMER_BINDING_*` codes. Imported JSON and HTTP requests
cannot supply the trust anchor or choose paths. The Node provider accepts
`staticReviewReceiptPin` / `staticReviewArtifactRoots` as local options; operator
environment equivalents are `APOLLO_STATIC_REVIEW_RECEIPT_PATH`,
`APOLLO_STATIC_REVIEW_RECEIPT_SHA256`, and optional
`APOLLO_STATIC_REVIEW_ARTIFACT_ROOT`. These independent startup values must stay
outside all hashed receipt/config/vector/source/build artifacts. No receipt is
embedded in config, source, UI or build.

### Exact generic receipt contract

`apollo.static-review-consumer-binding.v1-draft` is a closed object with these
fields (pins are closed absolute normalized `{path, sha256}` objects):

- schemaVersion, status=`draft`, accepted=false, executionAllowed=false,
  generationPlanHash=null;
- baselineVectorPin: pinned reviewed baseline inventory with `files` and the
  original standardBuildInputs.inputs (or buildManifest.inputs);
- producer: manifestPin, basisPin, artifactDigest, outputs. Each output contains
  path/sha256/inputHash/planHash/contentHash/observationHash;
- preselection: vectorPin, configArchivePin, configPath, configSha256;
- selection: configPin, manifestPin, reportPin;
- final: vectorPin, buildManifestPin, runtimePins;
- closurePins: complete deduplicated producer/API/request/consumer/workspace/build
  pins plus registry/lock and every package ZIP/primary-manual pin;
- additions: exact `{role, pin}` rows, restricted to producer, basis, output,
  request, config-archive and preselection-vector artifacts absent from V0.

Both future vector files use the closed `apollo.static-review-consumer-vector.v1-draft`
object with phase=`preselection` or `final`, files and buildInputs. V0 covers every
baseline path plus all preparation additions. V1 covers all V0 paths, changing
only the exact config selector pin, and precisely the declared downstream
artifacts. Runtime pins must cover runtime.cjs, code.js, ui.html, the Node reader,
generation-core/index.cjs and Proxy static-review-service.js. The standard build
manifest covers the original inputs plus actual UI and local reader inputs;
config is checked fully by the vector and is not a build input.

C0 archive SHA must equal the V0 config pin. C1 bytes must be C0 bytes with only
the four manifest/report selector string values replaced; whitespace and the
closed config schema are preserved. C1 must select the receipt's exact P/B.
All current file hashes, original and added build inputs, source/API/dependency
closure and complete vectors are checked. Registry/lock/source review validation
continues in the existing producer reader. No config mismatch is removed from
original producer freshness: a final binding can match while producer remains
stale-1. Receipt/vector self-pins, preselection producer/output backreferences,
unapproved additions, readback/result fields and future hash literals in their
own hashed inventory are rejected. Actual file paths and bytes are rechecked
before return and after async source reads.

### Transaction boundary

This stage implements and tests generic tooling only. C0 stays byte-identical;
no V0/V1/final receipt, producer/output/basis snapshot, rebind or panel repin is
created. Synthetic fixtures contain only invented bytes, not captures or norms.
The separate Design Check UI migration must be integrated and reviewed before
V0. Then General reviews both stage1 handoffs and schedules the finite sequence:
V0/C0 archive → one additive P/O/B → one C1 selector write → V1/R → detached D/G.
D/G are never inserted back into R/V1. Real Figma acceptance is a separate human
step; installed app restart, installation, publishing and release are outside
this preparation. The known normative crosswalk failure remains separate.

The unchanged producer v1 output keeps `observationHash` inside `observation`,
and null Generation identity inside `plan`/`observation`; it has neither field
at top level. Receipt output rows flatten these identities as metadata only.
The consumer verifies the actual nested wire and canonical plan/content/
observation hashes without extending producer v1. This matches the companion
Code Connect tooling interface; its directory is owned and reviewed separately.
