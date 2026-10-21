# NEXT-04: пользовательские observations и диагностика v2

06.10.2026. Apollo 0.4.0 / generation-core 0.1.1 / shared core 0.1.10 /
ComponentContract Editor 0.2.91 / installed Figma typings 1.141.0.

Read-only исправление реализовано в v4. Latest source type-check и **212 synthetic
v4 tests** проходят; root gate **81/81**, built UI 440/360 и private main VM
проверены. Штатная окончательная сборка остановлена на
`STALE_CONTRACT_PIN: buttons-group.desktop`: Contract Creation обновляет
утверждённый BG source, а producer пока закреплён на прежнем пакете. Это ожидаемый
consumer refresh dependency. **Эту стадию нельзя объявлять ready-to-reload**.
Нужен exact source/Code Connect handoff, затем один согласованный rebuild/gate.

## Что подтвердили три пользовательских v1 JSON

Private original reports перечитаны offline; reportHash пересчитан текущей
неизменённой runtime hash function, file hashes и исторические producer/recipe/
runtime/build/type pins совпадают с прежним handoff. General отдельно проверил
пять original ZIP/manual/compiled/dependency byte pins. Это подтверждает связь
reports с **их исторической сборкой**, а не свежесть после нового source review.

- CC desktop/mobile: exact Body SLOT property identity; в каждом наблюдён один
  прямой FRAME, `limitViolations: []`. Mapping и соответствие product order
  остаются unknown; empty/reset/insert capability не проверены.
- BG: exact Size56/Overflow=false variant key, четыре visible direct Button
  instances наблюдены. Remote canonical source/occurrence/symbol proof unknown.
  Суффикс inherited node ID не принимается как canonical identity.
- В BG v1 `properties: []` возникал из условия `matched ? values : []`.
  Это **withheld read**, не proof отсутствующих Label/DisabledState/View.
- Все три v1 reports имеют CHANGE_OBSERVER_UNAVAILABLE. Их `read: observed`
  фиксирует пользовательский native-read; mutation и live acceptance не запускались.

Original JSON и historical receipts не переписаны/repinned; они не использованы
как tracked fixtures. Private assessment:
`/private/tmp/apollo-v4-native-user-diagnostics-2026-10-06/assessment.json`.
Новая bounded offline review:
`/private/tmp/next04-observation-fix/input-review.json`.

## Свойства BG отделены от canonical matching

Reader v2 сохраняет прежние unknown target/source/symbol и дополнительно пишет
`rawProperties` для каждого bounded direct Button instance. Читаются только exact
property names/types, **объявленные source recipes**; generic fallback отсутствует.
Observed значения не становятся action identities, handlers, priority или нормами.

`rawProperties.scope = declared-api-observation-only`, provenance
`observed-not-accepted`. В `fields` для каждого property есть:

- expectedTypes и фактические type/value без преобразования смысла;
- readStatus: observed / missing / unreadable;
- typeStatus: matches / mismatch / unknown / ambiguous;
- valueStatus: observed / unknown / omitted.

`queryComplete` означает, что exact declared fields удалось запросить, включая
явное отсутствие. `valuesComplete` требует наблюдённых scalar values для всех
declared fields; `typesMatch` отделён от полноты values. Пустая декларация не
доказывает полноту. Ограничение — 12 unique declared properties и 8192 characters
для одного string value; overflow даёт omission/total/length, не выдуманный value.
Нечитаемый getter, missing/wrong type, conflicting declarations и omitted values
сохраняют явную неполноту. Before/after baseline также использует эти bounded reads.

Canonical matched `properties` остаются отдельным полем; remote unknown не
превращается в targetId/sourceIdentity/symbolId из-за доступных raw values.
Canonical external SLOT audit boundary и accepted providers не изменены.

## Current-page observer

Глобальный documentchange в dynamic-page требует loadAllPagesAsync. Official
альтернатива — current `PageNode.on('nodechange')`; она объявлена в установленной
1.141.0. Main подписывается на уже доступную текущую страницу, снимает callback
тем же объектом при переключении, инвалидирует active/exportable report и
подписывается на новую текущую страницу. Close снимает subscriptions.
[Dynamic loading guide](https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/),
[PageNode.on](https://developers.figma.com/docs/plugins/api/properties/PageNode-on/),
[PageNode.off](https://developers.figma.com/docs/plugins/api/properties/PageNode-off/).

JSON содержит структурированный `changeObserver`: status, scope
`current-page-nodechange`, pageId, coverage `page-node-events-only`,
otherPages/styles `not-observed`, cleanup confirmed/unknown. Это **локальное
покрытие**, не global revision receipt. Registration/detach failure или пропавшая
page subscription дают unknown; stale queued callbacks прежней страницы
игнорируются. Existing source/build double checks и async selection/baseline
fences сохраняются. Page loading/enumeration, import или node mutation отсутствуют.

## Version и совместимость

New output: `apollo.native-diagnostic-report.v2`. `userNativeRead: observed`
отделён от `mutation: not-run`, `live: not-run` (live acceptance),
`acceptance: not-run`, `runtimeCapability: unknown`.

UI поддерживает correlated v1 и v2 read-only envelopes; stale/forged acceptance
guards прежние. v1 JSON остаётся v1 с историческими pins, без миграции или
переинтерпретации `properties: []`. Original old-build context отвергается новым
expected build pin. Ни один existing host receipt не перенесён на новые bytes.

## Что действительно проверено

- Latest source type-check passed; node tests **212/212** (15 diagnostic + 4
  page-observer cases), root штатный gate **81/81**. Добавлены восемь meaningful
  synthetic cases; реальные IDs/values/JSON не попали в fixtures.
- Unmatched remote raw fields, foreign/missing/type/getter/empty/overflow/ambiguity,
  changed raw property во время async recheck, current-page CREATE/DELETE/property,
  page switch/exact off/close/registration failure/late callback negatives.
- Built v2 UI Chrome 440/360: correlated export, stale/forged-result rejection,
  busy/drop isolation, spec invalidation, JSON download и no overflow.
- Private latest-source main compiled с штатными alias/parser settings и проверен
  в VM: remote raw observations, page event invalidation/discard, stale old-build
  context rejection, zero mutation/page loads/imports. RPC в harness **synthetic**;
  clone исторического context не является новым actual host receipt.
- Первый v2 full gate 212 passed до concurrent BG source update. Последняя
  standard validate прошла type-check и заблокировалась на STALE_CONTRACT_PIN
  до emission нового main/UI. Latest empty-declaration guard отдельно проверен
  в tests/private VM; existing dist остался snapshot предыдущей v2 сборки.

Agent Figma calls/reads/writes/use_figma и real target artifacts отсутствуют.
Новый actual v2 user capture и новая host/live acceptance ещё не выполнены.

## Pins и дальнейшая передача

**Built snapshot до concurrent source refresh**, не current released candidate:

| Artifact | SHA256 |
| --- | --- |
| dist/runtime.cjs | `a58531593b0a5231caad78e3284957780e2980e22e1c059400ba2bba0836d3c5` |
| dist/code.js | `be0250eb4074c1570199c35cd32139f24136784419336430e6a41c706f6a097e` |
| dist/ui.html | `64510003df5d9c7435fce546ad61ac65e84a8b028e17e868115a4089cc9495d0` |
| dist/build-inputs.json | `2a3952e9cf3b066c8af76928ae8b9395db3c19c53297dee20558e39883106db0` |

Runtime и десять из 13 consumer pins прежние; main/UI/build inputs отличаются от
v1 handoff. Native diagnostic inputs/recipe/producer/dependency/provider pins
сохранены. `current-pins.json` отдельно перечисляет latest source hashes и
единственный source↔built manifest mismatch: `generation-native-properties.ts`
(последний empty-declaration guard). Не выдавать snapshot за final source build.

Private machine handoff: `/private/tmp/next04-observation-fix/handoff.json`.
Standard blocked log, standalone passing tests, root gate, UI, private compilation/
VM proof, historical input checks и exact hashes сохранены рядом.

Owner в General подтвердил **26 BG rules Reviewed** и desktop content-only pilot:
CC Body → BG Size56/Overflow=false, две обычные text actions. Norm texts и pilot
scope больше не owner pending. Canonical source/export/ledger и producer refresh
выполняют их sole writers. Real labels/action IDs/handlers/priority/lifecycle и
runtime widths этим решением не заданы. Native recipe/provider/profile/scoped
execution authority, mutation/live/release не приняты.

## Условный user retest handoff

До exact new producer handoff и успешного согласованного standard build/gate
повторную диагностику не просим. После этого:

1. Перезагрузить **именно verified v2 build**; выделить existing BG Size56 /
   Overflow=false instance и нажать «Снять диагностику выделения».
2. Сохранить JSON private/untracked. Проверить v2/schema/current pins,
   changeObserver current page и отдельные rawProperties statuses/values. При
   remote main target/source/symbol по-прежнему могут оставаться unknown.
3. Выполнить такой же read для CC desktop и mobile, без изменения макета.
4. Для проверки invalidation после сохранения сменить только selection/page:
   старый export должен отключиться; новый read относится уже к новому selection.
   Mutation/readback/rollback и generation этим retest не запускаются.

Related consumer item:
[APOLLO-V4-PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
owner fields:
[EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
