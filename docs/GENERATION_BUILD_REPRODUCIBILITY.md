# Runtime reproducibility + published native types · NEXT-03/04 · 06.10.2026

Статус: build reproducibility исправлена и проверена локально; types proposal
подготовлен. **Native providers null, normative/profile/live acceptance прежние.**
Новый runtime не получает старые host receipts по совпадению source pins.
Previous accepted [native proposal](GENERATION_NATIVE_RECIPE_PROPOSAL.md) и
[current consumer handoff](GENERATION_CURRENT_INPUTS.md) сохранены как historical
exact-byte receipts своих этапов. Этот документ дополняет их новым proof scope.

## Причина drift и evidence

Исходный custom onResolve возвращал абсолютные canonical paths, а те же shared
файлы также импортировались обычными relative imports. При восьми read-only
сборках из одного build recipe получены оба ранее записанных runtime hashes:

| Runtime SHA256 | Bytes | Pre-fix runs |
| --- | --- | --- |
| `2823427b6f8652e4b5ed5098c09badf632a057383e5c9536f3f3ca13d28d3b7c` | 538215 | 3 |
| `980ad3288b2b707b9b3bacefccee06736bf578f7e2e53f60b48b9bd7ad5997a4` | 538251 | 5 |

Исторический файл 282… в проверенных saved locations не найден. Оба byte content
**реально воспроизведены заново** старым штатным recipe и совпали с историческими
SHA256; сохранён diff этих fresh outputs. Installed Proxy runtime 29ff… и старый
G02 d447… имеют другой размер/closure и не использованы как подмена сравнения.
Никакой snapshot не скопирован поверх dist.

Diff 282… → 980… содержит исключительно две строки `"use strict"` в initializers
`representation-evidence.ts` и `member-collections.ts`. Sorted actual runtime
source input paths/byte pins одинаковы во всех восьми runs, input-pins digest
`9ad25c3f01e3aa527b480c90343f55814dce24973c9b6f5caa43b61b7d60a437`.
Entry `src/runtime.js`, common core 0.1.10, compiler/engine/vendor
closure и schema не изменились. Source/compiled package pins не переписывались.

Локализованная причина — применение strict configuration к canonical modules
при смешении custom onResolve и штатного filesystem resolver. Механизм зависимости
от того, какой import/resolution обрабатывается первым, является выводом из
контролируемого A/B результата; конкретный внутренний scheduler/cache race esbuild
не исследован и не объявлен upstream-confirmed bug. Source module order или
изменение нормативного compiler не являются содержимым найденного diff.

Esbuild документирует применение `strict`/`alwaysStrict` из tsconfig и штатный
alias resolver. [Strict configuration](https://esbuild.github.io/content-types/#tsconfig-json),
[aliases](https://esbuild.github.io/api/#alias).

## Исправление штатного build

`build.js` использует один existing canonical aliases map для
runtime/main/UI. Custom path-only onResolve удалён. `runtimeBuildOptions(write)`
позволяет тестировать те же реальные options без записи dist. Import build module
не запускает build; CLI сохраняет штатный запуск через require.main.

Все canonical modules теперь проходят обычное разрешение путей и nearest
configuration. Alias-only A/B дал один hash в восьми runs. После изменения
штатного build **восемь отдельных холодных Node/esbuild processes** тоже дали:

- Runtime: `a58531593b0a5231caad78e3284957780e2980e22e1c059400ba2bba0836d3c5`, 538341 bytes.
- Runtime source input-pins digest: прежний `9ad25c3f01e3aa527b480c90343f55814dce24973c9b6f5caa43b61b7d60a437`.
- Actual `npm run validate` build записал именно этот новый runtime в dist.

По сравнению с 980… добавились пять strict directives: predicate engine,
component-dependencies, runtime, compiler, importer. Остальные bytes совпали.
Это техническое исправление применения существующей конфигурации, не попытка
сохранить старый hash. Strict execution может выявлять ошибки, которые sloppy
mode скрывал; поэтому прошли actual fresh-source probe и полный consumer gate.

Новый regression `tests/build-reproducibility.test.js` запускает два холодных
read-only builds, сравнивает runtime bytes/input pins и проверяет strict directives
в шести canonical TS initializers, импортируемых через alias/relative paths.
Не привязывает тест к историческому runtime hash и не записывает dist.

Воспроизводимость проверена в текущем окружении: Node v22.14.0, esbuild 0.28.1,
darwin/arm64. Другие OS/toolchain не проверялись. Build recipe/config/environment
pins сохранены отдельно в machine evidence; существующий build-inputs source
manifest не объявляется полным описанием toolchain.

## Current source probe и предел receipt

`inspect-current-generation-inputs.cjs` на новом фактическом dist проверил full
current five-package producer closure, canonical facts/scope/basis/current/refs.
CC desktop r13 и mobile r8 Ready subset нормализован вместе с Button r31 и
Spinner r8. BG r58 сохраняет `SOURCE_COMPILE`, Draft. Accepted profile IDs пусты,
frontend profile not-accepted, native bindings missing. Ни новый Figma/frontend
artifact, ни scoped Draft bypass из этого probe не следуют.

Пройдены v4 type-check/build/**193 tests**, включая новый cold-build regression,
и root type-check/build/**81 tests**. Shared core/Editor/Generation версии прежние:
0.1.10 / 0.2.91 / 0.1.1, v4 0.4.0. Main/UI unchanged; browser scenarios не повторялись.
Installed Proxy не обновлялся и не перезапускался. Source-input offline receipt
не является actual host/runtime/live acceptance; этот следующий run ещё not-run.

## Published exact Figma typings candidate

Read-only запрос официального npm registry подтвердил опубликованный exact
**@figma/plugin-typings@1.141.0**, publication `2026-10-05T20:21:47.648Z`;
registry latest на момент проверки также 1.141.0. Cached web npm pages показывали
1.140.0, поэтому для exact release использован registry response.
[Official exact registry metadata](https://registry.npmjs.org/@figma%2Fplugin-typings/1.141.0).

- gitHead: `07157d96c58add71d234b13bfd55b53abdce76b8`.
- Annotated tag `refs/tags/v1.141.0`: `9b6457762e7b167afa139bd96b11302c58539639`.
- Dereferenced tag commit: тот же `07157d96c58add71d234b13bfd55b53abdce76b8`.
- [Official tag](https://github.com/figma/plugin-typings/tree/v1.141.0).
- Tarball SHA256: `420d8a8168c16d3a710eaa80c59d16414d0431d3f75bdc91e565112cd5143f81`.
- npm shasum: `d04a03369fb81c235431ab988638667a57a11187`.
- npm integrity: `sha512-i+6AsBmiwGNpH4I6sgIvj5RX1dMWExzS7h33HGrU++//wPKotlIzJuGhG15woCQY1V1ctG/k5uW9HgfkTyTaWg==`.

Tarball bytes проверены против SHA512 SRI и SHA1 shasum. package.json и
plugin-api.d.ts побайтно совпадают с ранее исследованным master snapshot на этом
commit. Теперь publication доказана независимо от master. Подписи registry
сохранены как metadata; cryptographic signature verification не выполнялась.

| Published file | SHA256 |
| --- | --- |
| package.json | `e32e1a3a2a1f2c8c18e1a2c19d923dc73db810dc6565eeb0ac400729e39fc9de` |
| plugin-api.d.ts | `7102bde6771033114711975b1184210fbd9164c4616ebbaf6f11a7c281858bea` |
| index.d.ts | `0efecf9d563eba206312e3e24a9cc02e6da42b051018f2ab65c37b9705e23db6` |

Это конкретный reviewed candidate, а не утверждение о минимальной поддерживающей
SLOT версии. Пакет извлечён только в `/private/tmp/next04-published-types`;
установленная dependency и package-lock сохраняют **1.121.0**, root manifest
сохраняет range `^1.82.0`. npm install/system installation не выполнены.

Isolated noEmit typecheck использовал официальный package entry index.d.ts,
включая PluginAPI global declarations. Type-reference resolver направлял все
`@figma/plugin-typings`, включая triple-slash refs, на candidate; проверено
отсутствие installed typings fallback. Результаты:

| Existing project config | Candidate 1.141.0 |
| --- | --- |
| legacy Apollo tsconfig.json | type-compatible, 0 errors |
| Apollo tsconfig.json | type-compatible, 0 errors |
| shared core tsconfig.json | type-compatible, 0 errors |

Это compatibility исходников с декларациями при существующих config options,
не install/build/release acceptance новой dependency или native runtime capability.

Точные API probes: SlotNode append/insert/reset/limitViolations и SLOT property
type — type-supported; scalar setProperties — type-supported;
`slot.componentPropertyReferences?.slotContentId` — **TS2339**. Официальный guide
показывает slotContentId, published declaration оставляет references keys
visible/characters/mainComponent. [Official declarations](https://github.com/figma/plugin-typings/blob/07157d96c58add71d234b13bfd55b53abdce76b8/plugin-api.d.ts),
[guide](https://developers.figma.com/docs/plugins/working-with-component-properties/).

Минимальный официальный typed compatibility gap:

```ts
declare const slot: SlotNode;
const propertyIdentity = slot.componentPropertyReferences?.slotContentId;
// TS2339 on the verified published 1.141.0 declarations.
```

Конкретный dependency proposal для отдельного review:

```diff
- "@figma/plugin-typings": "^1.82.0",
+ "@figma/plugin-typings": "1.141.0",
```

Согласованное lock update должно закрепить exact 1.141.0 tarball/integrity выше.
Этот diff не применён. Следующий технический вход — официальное исправление или
подтверждение typed slotContentId signature/nullable behavior, либо официально
документированный и типизированный эквивалент identity read. Нельзя превращать
index/name lookup, ambient declaration или any writer в accepted binding.

После dependency/type review требуется полный штатный Apollo build/validate на
установленном candidate и отдельный owner capability run на exact CC/BG source.
Body native sourceNodeId, BG fresh symbol/main-component correspondence и runtime
insert/remove/reset/rollback receipts всё ещё missing. Accepted providers null;
product norms/profile/actions/first scenario не приняты этим техническим этапом.

## Final pins и machine evidence

Сравнение предыдущих 13 consumer pins: **12 unchanged**, единственная замена —
новый runtime hash a585… вместо historical 282…/980…. Existing host receipts
остаются при своих прежних bytes и не repinned задним числом.

| Consumer artifact | Current SHA256 |
| --- | --- |
| dist/runtime.cjs | `a58531593b0a5231caad78e3284957780e2980e22e1c059400ba2bba0836d3c5` |
| dist/build-inputs.json | `b801022055d736dc9e0397716caf50171ed779867dd27ee13f3e967129d77a31` |
| dist/code.js | `53c56ba599675594af29431a31afb5cdd73dd7bb7f980e7182106a5e1c57cea0` |
| dist/ui.html | `7301e11d34de90708aea13e99dafbb5da9b4b08a7060d6a6f83abde4b8ad7f03` |
| packages/generation-core/dist/index.cjs | `6d4559e2e7c9b7cd6ecabb2386986971e9f27a212a283cd63c5521c3f8d053b9` |
| packages/generation-core/dist/planning.cjs | `dc51ff1ebab900d4b1ff17aac933ccb8b26474eb44b2b949e10aabfc7da70bba` |
| packages/adapter-frontend/dist/index.cjs | `5f468ee19a6b5fd7dbbc89bef87bd5c3bbbc9c32ae48f573236f19e5b6c43137` |
| packages/adapter-frontend/host/frontend-host.cjs | `3b82fc57fa17ec66e0ebf4e7db9c86a4a1503c530565114c2c94918ac01150dd` |
| packages/adapter-frontend/host/frontend-toolchain.cjs | `d0294aa43a3d5bbcdea99ba2cd6d67564169fa5a9143aff748de0e5dae17d1cc` |
| scripts/generation-current-producer.js | `b9770d050c995440ff22dfe5c209a3619566638a23c10f5d47b5c688b06053ab` |
| scripts/generation-code-connect-inputs.js | `bcdf1349ed116240319efd2a00644e96195cab88795839e3e465fc4dc2317778` |
| scripts/inspect-current-generation-inputs.cjs | `2c91a1ec9a472d30682296b13eb1f9c4b16ee8829899e551577ded4c8899b755` |
| proxy/src/generation-agent/service.js | `e839c032d5841813995147469808adff9e3cefcd88794eca9a4fe0d4b11f7749` |

Build recipe SHA256: `16eb446ffac3891f00ca7b425b3083ab945591cf1658290db26d49de93819329`.
Regression file SHA256: `56ed9a8063714af1650ae4d6f6eef66757399ef00dbc70e4492049c94952c10c`.

Machine handoff: `/private/tmp/next03-repro/handoff.json` содержит source/config/
build/toolchain/package-lock pins, final consumer pins, all evidence hashes,
npm observation и isolated compatibility. Raw read-only artifacts:

- `pre-fix-runs.json`, `historical-hash-reproduced.diff`: реальные два old-recipe outputs.
- `post-fix-runs.json`, `alias-runtime.diff`: eight cold fixed builds и strict-only diff.
- `v4-validate.log`, `root-validate.log`: passed gates.
- `current-consumer-proof.json`: actual new-runtime source-input proof, не host acceptance.
- `/private/tmp/next04-published-types/registry-observation.json`, `package.tgz`,
  `snapshot.json`, `type-evidence.json`, `compatibility.json`: exact published candidate evidence.

Все live Figma reads/captures/tests/writes/use_figma и target artifacts в этом
этапе отсутствуют. Normative producer/DS/registry/main authoring inputs read-only.
Следующий исполнимый шаг: review exact dependency/type identity proposal, затем
разрешённая runtime/host capability проверка с новыми exact receipts; до её
результата генерация сохраняет существующие Draft/profile/native gates.
