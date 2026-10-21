# Apollo: установленный Slots API и диагностика выделения

06.10.2026 · Apollo **0.4.0**, generation-core **0.1.1**, shared core
**0.1.10**, ComponentContract Editor **0.2.91**.

Локально установлен exact `@figma/plugin-typings@1.141.0`. В собранном v4 есть
действие **«Снять диагностику выделения»** и отдельное сохранение JSON. Действие
читает существующий компонент; результат — observation с provenance
`observed-not-accepted`. Принятие native recipe, профиля и исполнения остаётся
отдельным этапом. Accepted binding reader и primitive policy возвращают `null`.

## Как пользователь получает отчёт

1. Перезагрузить локальный Apollo с manifest `manifest.json`
   и текущими `dist/code.js` / `dist/ui.html`. Локальный Proxy должен быть доступен.
2. Выделить **один существующий INSTANCE или COMPONENT**: CorporateContent
   desktop, CorporateContent mobile либо точный вариант ButtonsGroup Size56
   с Overflow=false или Overflow=true. Для component set выбрать вариант.
3. Открыть «Генерация Figma и фронта · эксперимент» и нажать
   **«Снять диагностику выделения»**. ScreenSpec необязателен для чтения;
   загруженный spec связывается с отчётом своим hash.
4. Нажать **«Сохранить диагностику JSON»** и сохранить файл в private/untracked
   место. При смене выделения, страницы, ScreenSpec или наблюдаемом изменении
   документа экспорт старого отчёта сбрасывается; повторить чтение.

Имя файла: `apollo-native-diagnostic-<reportHash prefix>.json`. Private отчёт
не добавляется в source/fixtures. Пользовательский runtime read в Figma в этом
этапе **не выполнен**; действие подготовлено и проверено на synthetic nodes/UI.
`live: not-run` в отчёте обозначает непройденную live acceptance, даже когда
пользователь уже получил read-only observation.

## Какие данные читаются

| Область | Фактическое чтение | Ограничение доказательства |
| --- | --- | --- |
| Выделение | Текущая страница, один existing node, removed/parent, existing `getMainComponentAsync()`, component/set key и variant properties | Чужой key/set, неизвестный main или вариант дают unknown; import отсутствует |
| CC Body desktop/mobile | Уникальный прямой SLOT в owner и main definition, exact source property identity, тип SLOT, parent owner и `componentPropertyReferences.slotContentId` | Name, pathHint, preview и sibling index не определяют identity; observed definition ID не заполняет отсутствующий authored source ID |
| Body content | Весь прямой список children до 128: actual IDs/types/order, total/complete/omitted, limits | Omission, нечитаемый список или duplicate не доказывают empty/order. Payload mapping и plan order остаются unknown |
| Методы SLOT | Только наличие appendChild/insertChild/resetSlot как функции | Presence не подтверждает runtime mutation capability; методы не вызываются |
| BG owned Button | Прямые existing instances, их main/set key, canonical local owner/source correspondence, source variant address, exact typed Label / DisabledState / View, effective visibility | Для remote main без независимого pristine proof correspondence unknown; экземпляр для proof не создаётся |
| BG membership | Все наблюдённые прямые instances и отдельно полнота четырёх expected source occurrences | Missing/duplicate/foreign child остаётся unknown; symbol IDs не изобретаются, action/handler/business intent не выводятся |

Read-only topology использует общий core: actual owner ограничен 128 entries,
local source correspondence — существующим core limit 500. Nested INSTANCE/SLOT
payload не обходится этим topology reader; прямое содержимое выбранного SLOT
наблюдается отдельно. Canonical external SLOT audit boundary остаётся прежней:
содержимое Body не становится contract-owned anatomy и не получает фиктивные
component predicate facts из этого JSON.

Published declarations описывают `SlotNode`, SLOT property type и operations.
Typed `slotContentId` по-прежнему отсутствует (TS2339); для диагностического чтения
используется narrow `unknown` record guard документированного поля. Official
`.d.ts`, ambient declarations и writer capability не расширены.
[SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/),
[component properties](https://developers.figma.com/docs/plugins/working-with-component-properties/).

## Свежесть и защита от неполного чтения

Build читает canonical producer и full five-package source closure; генерирует
три compact source-derived recipes в **ignored** `dist/native-diagnostic-inputs.json`.
Authoring manual/facts/catalog не копируются в tracked fixtures. Изменённый,
неполный или недоступный producer/catalog останавливает подготовку manifest.
Этот local build предполагает установленный sibling workspace arui-private / DS.

Main содержит trusted diagnostic inputs и exact build-inputs SHA. После runtime
build main сначала собирается без записи для source-input manifest, затем с его
окончательным hash. Native manifest hash входит в build inputs; единственный
virtual define input исключён из filesystem read. Source/build/provider pins
сохранены в private machine handoff.

Действие дважды запрашивает existing Proxy context и сравнивает current registry,
lock, immutable basis, full currentInputs digest/content, producer observation,
runtime и build inputs. Используется отдельный технический CC desktop spec
`native-readonly-context`: source/API freshness для полного producer, с явным
unresolved и blocked target gates. Это не принятый product plan. Загруженный
пользователем spec записывается как `productSpecHash`, `productPlanAcceptance: not-run`.
BG r58 остаётся Draft; CC r13/r8 и Ready API не разрешают его generation.

Selection/page/revision guards действуют после async reads; owner baseline,
main identity и owned child main проверяются повторно. Изменившийся read
отбрасывает actual observations. Если dynamic-page document observer недоступен
без loadAllPages, отчёт содержит `NATIVE_DIAGNOSTIC_CHANGE_OBSERVER_UNAVAILABLE`
и остаётся incomplete. Все страницы не загружаются.

Bridge принимает закрытый request DTO и коррелированный requestId; imported
handler/recipe не исполняется. UI блокирует конкурентные действия, отклоняет
stale/forged-acceptance responses, сбрасывает export при invalidation/spec change.
Диагностика не выполняет import/createInstance/create node, append/insert/remove/
reset/setProperties/visibility/font operations и не запускает adapter execution.

## Поля JSON

Schema: `apollo.native-diagnostic-report.v1`.

- `read`: `observed` либо `not-run`; `status`: `incomplete` при unknown/missing proof.
- `provenance`: `observed-not-accepted`; `mutation`, `live`, `acceptance`: `not-run`;
  `runtimeCapability`: `unknown`, `acceptedBindings` / `primitivePolicy`: `missing`.
- `pins`: producer, recipe/runtime/build/type pins, contextPlanHash/blocked targets,
  optional productSpecHash. Данные context подтверждают только source/API freshness.
- `selection`, `changeObserver`, `observations`: actual bounded CC slot или BG owned
  observations, complete/omitted/unknown flags, source address и typed values.
- `diagnostics`: missing/stale/identity/membership/omission причины; `reportHash`
  вычисляется по report без собственного поля hash.

Даже complete empty Body read сохраняет missing canonical binding receipt.
BG symbol proof/canonical projection не принимаются; mapping/property presence
не является mutation, scenario или Code profile receipt. Error JSON также можно
сохранить для разбора; absent observations не изображают пустой Body.

## Проверено локально

- Installed official 1.141.0 bytes совпадают с ранее проверенным published tarball
  и dereferenced tag `07157d96c58add71d234b13bfd55b53abdce76b8`. Package exact pin,
  lock меняет только root devDependency и один node_modules package; других
  dependency changes, force/bypass, lifecycle scripts и system install нет.
- Installed SLOT/properties type probes passed; reference probe остаётся TS2339.
  v4 type/build/test **204/204**, root штатный gate **81/81**.
- 11 synthetic диагностических tests: exact identity/ambiguity, full/omitted/
  duplicate/empty/order, registry/build/source drift, removed/page/selection,
  canonical BG/hidden member/remote/foreign/missing/duplicate/child-main drift,
  method non-execution и bridge correlation. Mutation traps не вызваны.
- Built UI Chrome **440/360 px**: callable action, busy/drop isolation, stale/
  forged-result guards, spec invalidation, synthetic JSON download, no overflow.
- Built main dispatcher на synthetic nodes дважды прошёл actual installed Proxy
  context bridge и выдал hashed observed-not-accepted report; native API не
  вызывался. Отдельный technical context probe подтвердил full fresh inputs,
  CC API/source Ready и blocked Figma/frontend targets.
- Runtime reproducibility regression прошёл; три отдельные штатные сборки дали
  побайтно одинаковые runtime/main/UI/build inputs/native inputs. Прежний accepted
  canonical runtime hash сохранён; main/UI/build manifest имеют новые hashes.

## Exact pins и handoff

| Consumer artifact | SHA256 |
| --- | --- |
| dist/runtime.cjs | `a58531593b0a5231caad78e3284957780e2980e22e1c059400ba2bba0836d3c5` |
| dist/build-inputs.json | `1b3565b9d6af2af21634d22c567769e09d748dffd8f6b15193e08f64313071b0` |
| dist/code.js | `f6d0371ee027e608752e9e66b27783e0ec23d94850b25ce6d52ffff4dd6ecbdd` |
| dist/ui.html | `860470d9f9f3ebf3ea8a0debd1bcf9ad176f1fc84e4b89946c21b6fe87d1d487` |
| packages/generation-core/dist/index.cjs | `6d4559e2e7c9b7cd6ecabb2386986971e9f27a212a283cd63c5521c3f8d053b9` |
| packages/generation-core/dist/planning.cjs | `dc51ff1ebab900d4b1ff17aac933ccb8b26474eb44b2b949e10aabfc7da70bba` |
| packages/adapter-frontend/dist/index.cjs | `5f468ee19a6b5fd7dbbc89bef87bd5c3bbbc9c32ae48f573236f19e5b6c43137` |
| packages/adapter-frontend/host/frontend-host.cjs | `3b82fc57fa17ec66e0ebf4e7db9c86a4a1503c530565114c2c94918ac01150dd` |
| packages/adapter-frontend/host/frontend-toolchain.cjs | `d0294aa43a3d5bbcdea99ba2cd6d67564169fa5a9143aff748de0e5dae17d1cc` |
| scripts/generation-current-producer.js | `b9770d050c995440ff22dfe5c209a3619566638a23c10f5d47b5c688b06053ab` |
| scripts/generation-code-connect-inputs.js | `bcdf1349ed116240319efd2a00644e96195cab88795839e3e465fc4dc2317778` |
| scripts/inspect-current-generation-inputs.cjs | `2c91a1ec9a472d30682296b13eb1f9c4b16ee8829899e551577ded4c8899b755` |
| proxy/src/generation-agent/service.js | `e839c032d5841813995147469808adff9e3cefcd88794eca9a4fe0d4b11f7749` |

Root package-lock SHA256: `5f65a788bf2ee2c3b66402677a0f57afd2c53465673d9d5bb73e9a10963b4c3c`.
Build recipe SHA256: `fbe4f611d8add13803a1725d9361ba6fdd4b0d7849c1b5bdca6ca90b26967948`.
Native diagnostic inputs SHA256: `39d6f90c767b5f156c608f4f2ef4d9f7650071d03087c716bb7a6904d5cbf9f6`.
Native inputs content hash: `df613342b1ed2381ad2aa3dd1ca80df60413b491b6c9d1fc5b855acfe822f45a`.

Private machine handoff: `/private/tmp/next04-installed/handoff.json`.
Evidence: dependency-proof.json, full-build-repro.json, current-pins.json,
v4-validate.log, root-validate.log, native-ui.log, context-probe.json и
built-main-probe.json. Последний содержит synthetic nodes и actual source pins,
**не фактический native capture**. Все evidence bytes и changed-source pins
перечислены в machine handoff.

Сравнение прежних 13 consumer pins: 10 unchanged, изменены только main/UI/build
manifest. Old host receipts остаются при прежних bytes. Authoritative DS/arui
source/ZIP/registry/locks не изменены; ранние native proposal/host/reproducibility
handoffs сохранены. Proxy deployment/restart и target artifacts отсутствуют.

Для следующего этапа нужны пользовательские observation JSON, reviewed exact
Body source identity / BG occurrence+symbol proof, accepted native recipes,
отдельные runtime mutation/readback/rollback receipts и exact profile/scenario
acceptance. Scoped authority остаётся proposal-only; generation сохраняет
Draft/profile/binding gates. Related owner item:
[EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings),
consumer item [APOLLO-V4-PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings).
