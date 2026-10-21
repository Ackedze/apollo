# Apollo: r59 consumer refresh и готовность к read-only retest

06.10.2026 · Apollo 0.4.0 / generation-core 0.1.1 / shared core 0.1.10 /
ComponentContract Editor 0.2.91 / installed Figma typings 1.141.0.

**Штатный final gate прошёл. Сборка готова к user reload и read-only retest.**
Последний empty-declaration guard включён в main; все **92 inputs** built manifest
совпадают с latest source. Прежний STALE_CONTRACT_PIN/source↔dist mismatch устранён
согласованным consumer refresh. Figma генерация и приёмка пяти целей остаются
отдельными этапами.

## Короткий пользовательский запуск

1. Перезагрузить локальный Apollo по
   [manifest](../manifest.json), открыть «Генерация Figma и фронта · эксперимент».
   Proxy должен быть запущен. ScreenSpec необязателен для этой диагностики.
2. Выделить **один существующий ButtonsGroup Size56 / Overflow=false INSTANCE**.
   Нажать **«Снять диагностику выделения»**, затем **«Сохранить диагностику JSON»**.
   Сохранить private/untracked, отдельно от прежних r58 reports.
3. Повторить read для existing CorporateContent desktop и mobile. После сохранения
   сменить только выделение или страницу: старый экспорт должен отключиться.

Новые JSON должны иметь schema `apollo.native-diagnostic-report.v2`, актуальные
pins этого handoff и `changeObserver.scope: current-page-nodechange`. Для BG
ожидается **source revision 59**. Canonical target/source/symbol при remote main
могут оставаться unknown — это ожидаемое ограничение read-only proof.

Этот run закрывает отсутствующие **actual v2 наблюдения**: raw declared
Label/DisabledState/View с query/value/type statuses независимо от canonical
match, доступность observer именно текущей страницы и работу export invalidation.
Для CC он даёт свежий bounded SLOT/content/limits read на новой сборке. Report
не принимает native recipe/profile; mutation/readback/rollback не выполняются.
Другие страницы и style changes этим observer не покрываются.

## Принятые producer inputs

Read-only authority:
`arui-private/tools/code-connect/reports/NEXT-02-r59-producer-refresh.2026-10-06.json`,
SHA256 `8182fe68ca815b666f4af66293079cec97e3c9d013009ca1e1e28bd1baa53ad6`.
General перепроверил 52 actual file hashes и пять ZIP/main-manual/compiled/
embedded dependency scopes; Generation reader повторно проверил current closure,
representation refs, exact source/recipe/lock/context pins.

| Pin | Значение |
| --- | --- |
| Registry version/current digest | 1.1.0 / `4540c8e955a24f7be6ce70dc43e1729a887d4fa4b065ad24ba91ef0f5ef874eb` |
| currentInputsDigest | `cf9cc8c43198f40d34998aabc1b7a368385705e5bd48ca355cc8c03e218616a2` |
| Canonical lock digest | `8dfe66f872d266a66949f9a56d2f1a2d092fc84af04ac72699919403d2a0eae1` |
| Immutable passport basis | `bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0` |
| Registry bytes SHA256 | `349073c8922f8c4437451a086714f08d63dbfd1164218d600610afdfb9eec1a8` |
| Lock bytes SHA256 | `31304cb886f5371cf8200179911352685a1a4889a8c3e31490383b46771fcd2e` |
| Proposed recipe hash | `a9b5936621cd810511176724afa04716a90909fc35c3ef898044b8ebf344213f` |

BG r59 archive SHA256 `d7112c61163bdbd4b2979c18b75bbf9c1a2980abb37a7f7724a4a0251fa1f95e`,
manualSourceHash `ab69dff747b8d6b6f35618563203e44b6ba2134dc32ca66854b6431df6f3d98f`,
compiledHash `7de13ae7567ada098ddd6960011b5bc576bf00f037d776d44e98cc6365566404`.
Full authoring facts hash прежний; representation scope обновлён exact producer.
CC desktop r13, mobile r8, Button r31 и Spinner r8 сохраняют свои authoritative pins.

arui-private **80.7.1**, commit `c037d0c322ea9774a9c251400d76d41222819b87`, public
imports/prepare/emit implementation прежние. Existing Generation 1.1.0 format
принимает полный новый lock; shared schemas/checkers/compiler не менялись.
Native diagnostic inputs автоматически пересозданы из verified canonical inputs,
а не из пользовательских reports.

## Source и scope остаются раздельными

Все **26 BG rules Reviewed**, но **9 context-only nonExecutable**; BG **Source
Draft**. Actual BG context endpoint сохраняет SOURCE_COMPILE. Fresh CC technical
context даёт source Ready / Code API confirmed, Figma/frontend preflight blocked.
Это scoped source/API observation, а не принятый product plan.

Owner-approved pilot: desktop CC Body → BG Size56/Overflow=false, две обычные
text actions, content-only. Real labels/action IDs/handlers/priority/loading/
lifecycle/runtime widths этим решением не заданы. Accepted binding/primitive
providers остаются `null`, profiles не приняты, scoped authority proposal-only.
Geometry parity, native mutation/scenario/live/release proof не добавлены.

## Что проверено на этой сборке

- Standard v4 type/build/test gate **212/212**, root full gate **81/81**.
  Runtime reproducibility regression и 19 diagnostic/observer cases входят в v4.
- Fresh actual consumer closure/representation evidence/Ready subset normalized;
  полный BG Source gate остаётся SOURCE_COMPILE. Новые producer/recipe/runtime/
  build/type pins и full currentInputs content совпадают с authority.
- Actual installed localhost Proxy: CC technical context/API/source/preflight,
  отдельно BG negative. Figma/frontend execute не запускались, artifacts отсутствуют.
- **Built main → built UI → actual HTTP Proxy twice** на synthetic existing BG nodes:
  v2 report/export, raw properties при remote unknown identity, observer invalidation,
  exact on/off cleanup и no overflow на 440/360. Correlated synthetic v1 envelope
  accepted; stale/invalidation rejected. Mutation/import/page-load traps не вызваны.
- Chrome **154.0.8037.98**, binary SHA256
  `ccffd5c5fe77ba3212e07c2c69091f8048b73c396b4647ecaa150e1e01a04954`
  одинаков до/после проверки. Это current read-only browser observation; installation
  отсутствует. Старые browser receipts остаются при их собственных versions/bytes.

Agent Figma API reads/writes/use_figma, actual v2 native user read и live acceptance
**not-run**. Исходные три actual r58 user v1 reports остаются user-observed только
на исторических pins; они не переименованы, не переписаны и не repinned на r59.
Private synthetic v2 report не является actual native capture.

## Actual targets / imports / coverage vector

| Контур | Статус этого этапа |
| --- | --- |
| Source/API/context transport | Fresh actual current-source/code/lock checks, installed Proxy transport verified |
| Figma/native read | v2 implementation + synthetic node/actual transport verified; actual user v2 read pending |
| Figma mutation/generation | Host plumbing имеется; accepted native recipes/provider/primitive отсутствуют, execution not-run |
| Frontend | Existing host/route и previous real arui imports/TS/Vite/Chrome synthetic scenarios сохранены на исторических exact receipts; новых imports/scenarios здесь не запускали |
| Coverage | CC scoped source Ready; BG Draft с 9 context-only; raw values/observer не дают canonical/payload/profile parity |
| Profile/live/release | not-accepted / not-run / not-run |

## Final consumer pins

| Artifact | SHA256 |
| --- | --- |
| dist/runtime.cjs | `a58531593b0a5231caad78e3284957780e2980e22e1c059400ba2bba0836d3c5` |
| dist/build-inputs.json | `55318f476899d87eb19c07b78e68052e8687c2edda6b253a9e87fca8b4a689d2` |
| dist/code.js | `962a39566c4f4a292f6a705d2ff9e7842f9d42626c5b7f97b1295649a0adf655` |
| dist/ui.html | `64510003df5d9c7435fce546ad61ac65e84a8b028e17e868115a4089cc9495d0` |
| packages/generation-core/dist/index.cjs | `6d4559e2e7c9b7cd6ecabb2386986971e9f27a212a283cd63c5521c3f8d053b9` |
| packages/generation-core/dist/planning.cjs | `dc51ff1ebab900d4b1ff17aac933ccb8b26474eb44b2b949e10aabfc7da70bba` |
| packages/adapter-frontend/dist/index.cjs | `5f468ee19a6b5fd7dbbc89bef87bd5c3bbbc9c32ae48f573236f19e5b6c43137` |
| packages/adapter-frontend/host/frontend-host.cjs | `3b82fc57fa17ec66e0ebf4e7db9c86a4a1503c530565114c2c94918ac01150dd` |
| packages/adapter-frontend/host/frontend-toolchain.cjs | `d0294aa43a3d5bbcdea99ba2cd6d67564169fa5a9143aff748de0e5dae17d1cc` |
| scripts/generation-current-producer.js | `b9770d050c995440ff22dfe5c209a3619566638a23c10f5d47b5c688b06053ab` |
| scripts/generation-code-connect-inputs.js | `bcdf1349ed116240319efd2a00644e96195cab88795839e3e465fc4dc2317778` |
| scripts/inspect-current-generation-inputs.cjs | `2c91a1ec9a472d30682296b13eb1f9c4b16ee8829899e551577ded4c8899b755` |
| proxy/src/generation-agent/service.js | `e839c032d5841813995147469808adff9e3cefcd88794eca9a4fe0d4b11f7749` |

От предыдущего v2 snapshot unchanged **11/13**: обновлены только main/build inputs,
UI и canonical runtime прежние. Diagnostic inputs/recipe/producer обновлены до
r59. Source↔built manifest **matches=true**, 92 inputs, 0 mismatches.

Toolchain: Node v22.14.0 / darwin arm64, esbuild 0.28.1, TypeScript 5.9.3,
Playwright 1.62.1, typings 1.141.0. Exact installed type/package/index, source,
package-lock, implementation/build/UI/recipe/registry/lock и code-file vector:
`/private/tmp/next04-r59-consumer/vector.json`.

Private machine handoff: `/private/tmp/next04-r59-consumer/handoff.json`.
Evidence рядом: v4/root validate logs, current-inputs-proof.json, context-probe.json,
bg-context-negative.json, main-ui-transport-proof.json и synthetic-ui-report.json.
Последний имеет synthetic nodes/values; actual HTTP context не делает их native
acceptance evidence. Полные bytes/hashes и final post-doc standard build comparison
перечислены в handoff. Producer/DS/registry принадлежат другим sole writers;
Generation не изменял эти файлы, providers или нормативные decisions.

Historical scope:
[Observation v2 fix / старый build blocker](GENERATION_NATIVE_OBSERVATION_REVIEW.md),
[installed types/первый reader](GENERATION_NATIVE_DIAGNOSTICS.md).
Consumer item [APOLLO-V4-PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
owner fields [EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
