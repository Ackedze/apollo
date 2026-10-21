# Native Figma host · NEXT-04 · 05.10.2026

## Реализовано

`src/generation/figma/host.ts` подключён к GenerationController. Host использует
установленные официальные `@figma/plugin-typings@1.121.0`: импорт точного
ComponentNode по key, createInstance/setProperties, загрузку source fonts,
transparent layout frames и text primitives только с accepted TextStyle policy.
Общий append доступен только новым layout frames, не содержимому instances.
Native SLOT и owned actions имеют отдельные reviewed operation ports.

До begin проверяются common preflight, exact mapping/representation/component
identity, полный contract pin, accepted recipe/review hashes, slot/action/scenario
handlers, canonical capture scope и шрифты. Отсутствующие recipes выдаются одним
пакетом конкретных diagnostics до imports и создания canvas. Native SLOT writer
не реализуется через имя Body, generic append, detach или нарисованный substitute.
В установленных typings 1.121.0 нет SlotNode/SLOT write declarations. Текущая
официальная документация уже описывает эти операции; type/runtime/identity
ограничения и version proposal зафиксированы в
[GENERATION_NATIVE_RECIPE_PROPOSAL](GENERATION_NATIVE_RECIPE_PROPOSAL.md).
Новый writer и accepted recipe в этом этапе не подключены.

`src/generation/figma/capture.ts` получает authoring source через существующий
`/v2/contracts/resolve`, повторно выполняет source loading и проверяет release,
sourceHash, canonical compiledHash, manualSourceHash, revision, component/contract
IDs и key. Захват использует existing captureInstanceAudit/collectNodes,
allowedComponentPropertyNames/nativeSlotCapturePlan и auditContractSnapshot.
Verdicts, dependency component IDs, hashes и неполная coverage сохраняются.
После каждого capture и после последующих async операций сравнивается anatomy.

Каждая mutation окружена fresh trusted context/preflight и проверкой native
component definition/recipe pins. Host фиксирует created IDs до setProperties,
возвращает partial provenance и чистит только new roots. Сбой чтения partial
provenance не отменяет rollback. С 06.10.2026 foreign content с неизвестным original relationship или внешним
async drift сохраняется на месте; generated ancestors/order/layout anchors
удерживаются. Exact parent/order/local + absolute transform restoration допускается
только из bounded pre-mutation journal и проверяется после cleanup. Retained roots,
failed remove/restore и неизвестная исходная связь дают rollback incomplete;
повтор сохраняет transaction state. [Current rollback protocol](GENERATION_ROLLBACK_SAFETY.md).

Результат source capture не подтверждает исполнение UI-сценария. Checks
state/event/action остаются unknown до владельческого live acceptance; host
возвращает incomplete, а не synthetic PASS. Отрицательный canonical verdict
даёт failed и rollback. Никакой публикации или frontend route здесь нет.

## Exact missing inputs / handoff

`src/generation/native/bindings.ts` — closed local executable provider boundary;
`readAcceptedNativeBinding` пока возвращает null, acceptedPrimitivePolicy = null.
Imported ScreenSpec никогда не содержит recipes или capture verdicts. Это отдельная
executable boundary; typed source fields реализованы в NEXT-02, scoped authority не добавлена.

| Field / operation | Source identity / required evidence | Gate |
| --- | --- | --- |
| `mapping.figma.handlerId` → `NativeBinding.id` | NEXT-02 reviewed recipe for exact mappingId, representationId, componentKey and full canonical pin; recipeHash + acceptanceEvidenceHash | FIGMA_NATIVE_BINDING_MISSING / STALE |
| Body `NativeSlotBinding.targetId/property/sourceNodeId/operationId` | Accepted CorporateContent target.body, native SLOT identity `[D] Body#135096:3` or `[M] Body#135096:2`, exact source node and capture receipt. Supported native SLOT write + assertDefinition/assertFilled; children preserve order/identity, including empty content | FIGMA_SLOT_BINDING_MISSING |
| `NativeActionBinding.id/occurrences` | `figma.batch.buttonsGroupBinding`: visibleOccurrenceIds, handlersByOccurrenceId, identityByOccurrenceId. Correlate four declared owned targets to exact Size56 false/true source addresses, symbol IDs, direct dependency binding and Button componentSet identity. Index derives from captured effective visibility/source order; hidden middle children change index | FIGMA_OWNED_ACTION_BINDING_MISSING |
| `fill` + `assertOccurrences` | Per-action exact owner/source occurrence; explicit label/disabled/view mappings and declared event handler. Action ID maps to a distinct newly created owned INSTANCE; no label/ordinal/name inference | ACTION_PROVENANCE_INCOMPLETE / FIGMA_ACTION_IDENTITY |
| `NativeScenarioBinding.assertPlan/bind` | Accepted state/property/action/prototype recipe and explicit external product handlers for each declared transition. Owner plan node is passed explicitly for repeated mapping instances | FIGMA_SCENARIO_BINDING_MISSING |
| `NativeCapturePort.loadScope` | Ready authoring source from /v2/contracts/resolve matching all common pins, representation/source boundaries and dependency closure. No historical projection injection or reconstruction from RuleIR | FIGMA_CAPTURE_SCOPE_UNAVAILABLE / STALE |
| Text primitive policy | Accepted TextStyle ID, font family/style, evidenceHash and loaded installed style; default typography is not a DS decision | FIGMA_PRIMITIVE_STYLE_MISSING / STALE |
| live state/event/action receipts | Owner's actual positive/negative/reset run on the same accepted source/code/plan and native IDs | FIGMA_LIVE_SCENARIOS_NOT_RUN |

Primary NEXT-02 handoff:
`shared/design-system_ab/experiments/web-corp/ButtonsGroup/authoring/reports/NEXT-02.code-passport-handoff.2026-10-05.md`
and its `next-02.code-passport-handoff.2026-10-05.json`. These are proposals, not
accepted binding records. На этапе NEXT-04 editable r11/r6 отличался от ZIP r12/r7;
это историческое состояние. В NEXT-02 Contract Creation согласовал primary source
и экспортировал typed passports: текущие CC r13/r8 и BG r58. Authoritative
Button/Spinner re-export закрывает COMPONENT_DEPENDENCY_LINK; текущий actual
BG source отдельно блокируется SOURCE_COMPILE. Ранние диагностические проверки
использовали отдельную historical projection.
That projection is never a production fallback. Source predicate readiness,
source API availability, code parity, live acceptance and publication stay apart.

## Историческая проверка NEXT-04

- Apollo 0.4.0 / shared core 0.1.9 / adapter-figma 0.1.0, versions unchanged.
- Installed typings compile; v4 **180/180**, adapter **8/8**, root **81/81** pass.
- Native new tests cover missing exact inputs before imports, partial property
  failure/provenance, fresh pin/recipe/definition drift, font preflight, actual
  closed primitives, canonical capture parity/staleness, foreign-content
  preservation and rollback after failed verification/provenance read.
- Chrome panel 440/360 passes. Built main/UI → running Proxy → current pinned
  packages returns SOURCE_COMPILE, disabled Create, zero native writes. This is
  transport/source-gate evidence; actual target execution and live remain not-run.
- Figma host plumbing **connected**, accepted native bindings **missing**,
  native target **not-run**, live **not-run**, release/publication **not-run**.
- Specific ScreenSpec API remains unverified until real all-state producer
  preflight. Separate source-export API evidence does not accept the screen.
- Frontend service/host unchanged; Code Connect owns current real build/browser
  work. Its row-flex width/hidden onClick gaps remain unaccepted.

Build SHA256: runtime `c5e3e64b8fa8db6738f12a95a2ffc251ec50505245fd199abbc86d13193b9734`,
inputs `d0fb088ddb9b13e3f0522dad9593993e756940b8e11b612e82a95852df92e0f2`,
main `42cdad28eb8498c88103a2e749284ee53967c8d75a3f9642c87f2a7212259287`,
UI `b3ce5644cf1068efc269bf6baaf224669e8ec829ce1367b60997b9794df2a4a4`.

## Owner live checklist (not run)

1. Accept source/passport/recipe/native API inputs above and product labels,
   priority, handlers, transitions and viewport. Keep PATTERN_DRAFT/whole-package
   Draft blocked; no scoped authority bypass is enabled.
2. For every normative PASS/FAIL/ALLOW/WARNING/UNKNOWN canvas case display the
   complete source rule text and stable RuleID from the executable package.
   Transport gates use their machine codes; do not invent normative RuleIDs.
3. Create the accepted CC Body → group pilot with source-bound instances. Record
   actual source/property/slot/occurrence identities and plan provenance. Check
   empty/ordered Body content and unmapped nested content rejection.
4. Exercise 1–4 normal actions, first priority, label/disabled bindings, hidden
   middle occurrence, declared events/state changes, width fit and reset. Keep
   source gaps and any non-executable/context-only checks visible as incomplete.
5. Change a native definition, accepted receipt, source pin or page during
   generation; verify that it stops and clears partial new nodes. Existing canvas
   content must survive, including content reparented into a new root.
6. Preserve fresh capture/evaluator and real scenario receipts separately. Submit
   positive/negative/reset evidence to the owner before live/release acceptance.

NEXT-02 update: core 0.1.10 / Editor 0.2.91, v4 182/182; legacy standalone
manualRevision omission is now checked against authoritative manual revision
in the capture loader and unique RuleIR revisions in the host. Current fields,
packaging verification and remaining gates: [handoff](GENERATION_CODE_EVIDENCE.md).
The preceding 180-test build hashes record the NEXT-04 milestone only.

Current NEXT-02 final build: runtime `980ad3288b2b707b9b3bacefccee06736bf578f7e2e53f60b48b9bd7ad5997a4`,
inputs `ebefc13209102e2f8578f96e989bace3e87a01d7745ea5665c4630f5472d444d`,
main `5bd9a5be5e5c49e3e96a640306d7e43c3e175610d202167ae125671f3f30b034`,
UI `5276890c506b60b040b5be0deae731d31235cf9405ce017d3294f6cc29fda552`. Actual transport/source block was rechecked; no native writes.

Текущий frontend/source/build status см. [GENERATION_FRONTEND_HOST](GENERATION_FRONTEND_HOST.md). Native recipes/capability/live ещё не приняты; приведённые NEXT-04 hashes и core 0.1.9 описывают прошлый этап. Сейчас core 0.1.10 / Editor 0.2.91.

Fresh current registry/closure и installed consumer status 06.10.2026:
[GENERATION_CURRENT_INPUTS](GENERATION_CURRENT_INPUTS.md). Native accepted ports/scoped authority не расширены.
