# Native recipe proposal · NEXT-04 · 06.10.2026

Статус: **proposed, executable=false, acceptance=not-run, live=not-run**.
Подготовлены три source-derived DTO: CorporateContent desktop/mobile Body и
ButtonsGroup desktop owned Button. Это отдельный технический handoff для будущего
Figma adapter. Code/source/profile acceptance и продуктовый сценарий остаются
самостоятельными входами. Решение владельца по девяти нормативным вопросам и
первому сценарию в этот этап не входит.

## Что добавлено в Apollo

- `scripts/inspect-native-slot-api.cjs`: read-only TypeScript probes установленной
  декларации и явно переданного официального snapshot; no emit/install/Figma calls.
- `scripts/generation-native-proposal.cjs`: closed versioned DTO, проверка полного
  повторного вывода из source, observational SLOT content assertion. Unknown
  version, altered operation/property/pin/acceptance и extra fields отклоняются.
- `scripts/prepare-native-recipe-proposals.cjs`: явный Node CLI; читает только
  canonical ZIP closure и существующий current producer, проверяет bytes, full
  facts/scope/typed bindings и freshness. Producer cache не заменяет fresh read.
- `tests/generation-native-proposal.test.js`: семь synthetic offline tests;
  ни catalog, ни реальные capture/report fixtures не скопированы в tests.

Эти scripts не импортированы main/UI, не добавлены в HTTP route, provider или
ScreenSpec. `readAcceptedNativeBinding` и `acceptedPrimitivePolicy` остаются null.
DTO не содержит исполняемый JavaScript и не является accepted NativeBinding.
`requireExecutableSlotCapability` всегда отклоняет исполнение: unsupported types
либо отсутствующий accepted capability receipt. Whole-package Draft/scoped bypass
не добавлен; NEXT02-SCOPED-GENERATION-AUTHORITY остаётся proposal-only.

## API: документировано, type-supported и проверено в runtime — разные факты

Официальный changelog объявляет Slots GA **10.06.2026** и добавление SlotNode,
resetSlot, limitViolations и SLOT property type. Ранее API был доступен в beta.
Эта дата не устанавливает минимальную npm-версию и не подтверждает capability
конкретной Figma среды. [Official changelog](https://developers.figma.com/docs/plugins/updates/2026/06/10/update/).

| Операция / точная сигнатура | Installed 1.121.0 | Official snapshot 1.141.0 | Применение |
| --- | --- | --- | --- |
| `importComponentByKeyAsync(key: string): Promise<ComponentNode>` | есть | есть | CC exact component definition |
| `importComponentSetByKeyAsync(key: string): Promise<ComponentSetNode>` | есть | есть | BG exact set, затем exact child variant |
| `InstanceNode.setProperties(properties: { [propertyName: string]: string \| boolean \| VariableAlias }): void` | есть | есть | owned Button TEXT/VARIANT; SLOT этим API не заполняется |
| `SlotNode.appendChild(child: SceneNode): void` | нет SlotNode | type-supported | добавление только в source-bound native SLOT |
| `SlotNode.insertChild(index: number, child: SceneNode): void` | нет SlotNode | type-supported | индексное размещение; capability ещё не принят |
| `SlotNode.resetSlot(): void` | нет | type-supported | возврат библиотечного default content |
| `SlotNode.limitViolations: Array<'BELOW_MIN' \| 'ABOVE_MAX' \| 'HAS_NON_PREFERRED'>` | нет | type-supported | отдельная проверка после mutation |
| `componentPropertyReferences.slotContentId` | нет | **нет в декларации** | guide описывает identity reference; type probe TS2339 |
| `SceneNode.remove(): void`, `SceneNode.visible: boolean` | есть | есть | только доказанное содержимое нового owner / explicit visibility |

[SlotNode API](https://developers.figma.com/docs/plugins/api/SlotNode/) описывает
append/insert/reset для native SLOT. Guide отдельно говорит, что setProperties
не заполняет SLOT, и показывает slotContentId. Пример `children[0]` в guide
не является resolver для Apollo. [Component Properties guide](https://developers.figma.com/docs/plugins/working-with-component-properties/).

SlotSettings не гарантирует исключение при нарушении count/preferred constraints:
после операции требуется фактический limitViolations. Пустой payload допустим
только при exact empty readback и допустимых текущих settings. resetSlot возвращает
library default, который может быть непустым. SlotNode.clone возвращает FrameNode;
он не сохраняет native SLOT identity. [SlotSettings](https://developers.figma.com/docs/plugins/api/SlotSettings/), [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/).

Зафиксированные bytes:

| Evidence | Version / pin | SHA256 |
| --- | --- | --- |
| installed package.json | 1.121.0 | `e06e1c59417d807d93a8b3038c3248fef52b91b8f233802389fd5b0d8fe6d480` |
| installed plugin-api.d.ts | 1.121.0 | `423f3fe96dda27854dda764fe4eb84201fde62cf0ae349dadd83a8d15e1d4653` |
| official snapshot package.json | 1.141.0 | `e32e1a3a2a1f2c8c18e1a2c19d923dc73db810dc6565eeb0ac400729e39fc9de` |
| official snapshot plugin-api.d.ts | 1.141.0 | `7102bde6771033114711975b1184210fbd9164c4616ebbaf6f11a7c281858bea` |

Snapshot — официальный master, наблюдённый 06.10.2026, commit
`07157d96c58add71d234b13bfd55b53abdce76b8`.
[Immutable declarations](https://github.com/figma/plugin-typings/blob/07157d96c58add71d234b13bfd55b53abdce76b8/plugin-api.d.ts),
[immutable package](https://github.com/figma/plugin-typings/blob/07157d96c58add71d234b13bfd55b53abdce76b8/package.json).
Это проверенный branch snapshot, не доказательство опубликованной npm-версии
или самого раннего поддерживающего релиза. Копия лежит в
`/private/tmp/next04-native-api`; зависимости и lockfile не изменены.

Installed probes: SLOT TS2304/TS2322, scalar properties PASS. Candidate probes:
SLOT PASS, scalar properties PASS, slotContentId TS2339. Runtime unknown.
**Version proposal:** отдельным review выбрать официально опубликованную exact
версию с нужным API, проверить полную совместимость Apollo и закрыть typed
slotContentId gap официальным исправлением/подтверждением. Затем отдельный
runtime capability run на exact source. Обновление зависимости не выполнено.
Ambient declaration, any-cast или придуманный метод не добавлены для writer.
Existing capture читает reference через Record; это не новый accepted typed writer.

## Source и закрытый recipe envelope

Текущие source/producer pins взяты из canonical five-package closure registry
1.1.0; все Code representations Draft. Полные pins сохранены в
[GENERATION_CURRENT_INPUTS](GENERATION_CURRENT_INPUTS.md) и private JSON ниже.

- Current registry digest: `129d129ea3b5b3e4bb112b2cccd1414f59ff8d22cde00721dd58a3dea978fa90`.
- Immutable authoring basis: `bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0`.
- Current inputs: `a3c49ed715fd95a83ebd4bc46f11a124aee13258cf2bf696980f5983bdfd3ed6`.
- Current lock hash: `b1e65e9068623e997184d99ce60cff018c45a17a8e487bfead72661a4af3d99c`.

`apollo.native-recipe-proposal.v1` фиксирует mapping/component/platform,
representation status/key/set key, revision/archive/source/compiled/full-facts/
scope/basis/current pins, definition operation, typed slot/occurrence bindings,
source addresses, capability evidence hash, mutation/capture requirements,
rollback scope и explicit missing inputs. Acceptance not-run, receiptHash null.
`assertProposal` повторно строит весь DTO по verified input и сравнивает hash;
произвольный handler и подмена статуса не принимаются. Current freshness не
переписывает immutable authoring basis.

## CorporateContent Body: exact property и недостающий native source address

| Source | Predicate | Figma representation | Key / native property |
| --- | --- | --- | --- |
| desktop r13 | Ready | `web-corp.corporate-content.figma.desktop`, Draft | `a8d13cb6e1ae67a7296709f669238f41971c7197` / `[D] Body#135096:3` |
| mobile-web r8 | Ready | `corporate-content.mobile-web.figma.mobile-web`, Draft | `11ae074b596a6b3dfb6696f51531439723c0225b` / `[M] Body#135096:2` |

Оба typed nativeSlotBinding.v1 задают `target.body`, SLOT,
`props.children`, preserve-ordered-content и trusted-native-capture.
Reviewed external control path привязан к exact property. Target pathHint
`[D]/[M] CorporateContent / [D]/[M] Body` и preview nodeIdHint — informational
metadata; **native sourceNodeId в авторском входе отсутствует**, proposal сохраняет
null. Превращать preview hint в native ID или искать слой по имени нельзя.

Полный текст source rationale для будущих cases:
«Body — открытый слот CorporateContent для произвольного содержимого и
композиций. Внутренние элементы содержимого принадлежат собственным
компонентам и паттернам. CorporateContent владеет границей слота, но не
навязывает содержимому структуру библиотечного placeholder».
Desktop RuleID: `component:corporate-content.desktop.body.composition-content`.
Mobile RuleID: `component:corporate-content.mobile-web.body.composition-content`.
На будущем canvas каждый нормативный case должен отдельно содержать полный
этот текст и соответствующий RuleID. Сейчас cases и canvas не создавались.

Будущий accepted fill contour:

1. До imports/mutation подтвердить source/profile/recipe receipt, independent
   canonical reference, exact sourceNodeId и support самого runtime. У imported
   definition и нового instance должен быть единственный подтверждённый direct
   native SLOT с exact property/ref/owner/source identity и SLOT definition.
2. Сохранить baseline owner, defaults, page, created/owned IDs и provenance всех
   mapped child nodes. Ничего чужого не удалять. Default children можно remove
   только внутри нового доказанного owner после принятой capability проверки.
3. Заполнить конкретный SlotNode через документированные append/insert в порядке
   общего плана. Для empty снять verified defaults и прочитать реальные children;
   успешный вызов API или отсутствие exception не доказывают пустой результат.
4. Прочитать полный direct child list без omissions, exact IDs/order, mapped plan
   provenance и limitViolations. Отдельно выполнить canonical source/dependency
   capture, сравнить baseline за пределами external payload и fresh pins.
5. При failure вернуть failed/incomplete и очистить только new roots. resetSlot
   проверять как default reset, а rollback — как отдельную transaction operation.

Existing bounded canonical capture намеренно опускает external payload. Его
`omissions.childIds=[]` не доказывает пустоту и не проверяет порядок. Нужен
отдельный complete SLOT content readback при прежней границе canonical audit.
Текущий host rollback сохраняет foreign content на исходной page с absolute
transform, но не хранит исходные parent/order. Это не receipt полного restoration:
для принятия recipe нужны pre-mutation provenance этих полей и отдельная проверка
restoration либо explicit incomplete. Такое расширение host не реализовано здесь.

Observational DTO checker проверяет exact owner/slot/property/reference, closed
v1, nonempty identity fields, SHA256 shape, complete=true/omittedContent=false,
unique ordered mapped IDs и empty limits. Он не удостоверяет происхождение
runtime read и не выдаёт native receipt. Unmapped/foreign/reordered/duplicate
members отклоняются; автоматически расширять список допустимых children нельзя.

## ButtonsGroup: set definition, owned occurrence и три typed свойства

Source BG desktop r58 — Predicate Draft; Figma representation
`web-corp.buttons-group.figma.desktop` verified. Mapping key
`f05915599f71e822fd8b46a2b2509a2e395005cf` — **ComponentSet**, а текущий host
импортирует каждый mapping как ComponentNode. Для будущего принятого BG recipe
нужно явно расширить definition boundary; один importComponentByKey этого key
не является корректным выбором variant.

| Exact selected variant | Source component key | Owned source IDs: button / button-2 / button-3 / button-4 |
| --- | --- | --- |
| Size=56, Overflow=false | `a9277df1027c31dc94cd15bd70a45af22ecbf48e` | `62786:48895` / `62786:48896` / `62786:48897` / `62786:48898` |
| Size=56, Overflow=true | `580dd1eb8a889ea04774fb0a92a1a588716babd8` | `62786:48900` / `62786:48901` / `62786:48902` / `62786:48903` |

Future reviewable host change, **не применённый runtime diff**:

```ts
// acceptedDefinition is a separately reviewed exact input, never ScreenSpec JS.
const set = await api.importComponentSetByKeyAsync(acceptedDefinition.setKey);
if (set.removed || set.type !== 'COMPONENT_SET' || set.key !== acceptedDefinition.setKey) failIdentity();
const matches = set.children.filter(node =>
  node.type === 'COMPONENT' && node.key === acceptedDefinition.variantKey);
if (matches.length !== 1) failIdentity();
const definition = matches[0];
// Assert parent set + complete variantProperties against the accepted recipe.
// Pin both set identity and selected component identity before createInstance.
```

Definition DTO содержит оба available source variants; plan/profile acceptance
должен выбрать один явно. Первый/default variant, имя и совпадение Size по одному
полю не являются identity proof. SingleIcon/Overflow/product choices не приняты
этим proposal; чужая замена вложенной кнопки и рисование substitute недопустимы.

У четырёх targets `target.button`, `target.button-2`, `target.button-3`,
`target.button-4` — owner `target.buttons-group`, exact direct-child bindings
`buttons-group-button` … `-4`, dependency `core-web-button` → Button r31:
source `0177a9b6cd3fc60c8ebafbf962ec7da74538e13fd18b6b22cf77ac663feebc22`,
compiled `6136013045fbcab513f8e7cbcd0ce968903ef81851c927dd7426e218438f5f8b`.
Button desktop componentSet key: `f9979d6cc8598aec25f721e0a45b7eef2eeb0088`.
Button→Spinner r8 closure также проверена producer CLI.

Source addresses декодированы из exact per-variant `@source:` path segments;
preview `1/17/33/49` не используются. `symbolId=null`: требуется новый canonical
main component key/id и occurrence reference proof. symbolId — metadata host,
не выдуманный Plugin API getter. Source address alone не подтверждает текущий
runtime node или accepted source equivalence.

| Typed source property | Type / values | Existing transform / code path |
| --- | --- | --- |
| `✎ Label#16:294` | TEXT / explicit label | owned-button-label.v1 → props.elements[].children |
| `DisabledState` | VARIANT / False, True | owned-button-disabled.v1 → props.elements[].disabled |
| `View` | VARIANT / Primary, Secondary | owned-button-primary-first.v1 → props.primaryFirst |

До изменения Label загрузить фактические source fonts. Каждое setProperties
обращается только к доказанному owned InstanceNode и exact typed property;
readback должен подтвердить result и dependency identity после VARIANT change.
Visibility задаётся explicit occurrence intent, а effective visibility и итоговый
index берутся canonical capture из настоящего source order. Hidden middle
меняет индекс. Повторно использовать existing `resolveDirectChildBinding` /
`projectOwnedCodeCollection`, без второго нормативного resolver по name/ordinal.

Labels, disabled, View не задают бизнес-приоритет, переходы и event handlers.
ActionID→target/source occurrence, visibility, handlers и state/transition recipe
нужны как отдельные accepted inputs. Primary/Secondary должны соответствовать
принятому сценарию, а не выводиться из текста кнопок.

## Остаточные action points и будущая проверка владельцем

| Action point | Конкретный вход / результат |
| --- | --- |
| API/types review | published exact version + lock review; официальный typed slotContentId; весь Apollo type/build gate |
| CC source identity | independent source-bound SLOT node IDs/property references для desktop/mobile; full content reader capability |
| BG definition/identity | set-vs-variant host DTO, exact variant selection, canonical source/symbol/main-component correspondence всех four owned children |
| Accepted recipes | recipeHash, acceptanceEvidenceHash, source/profile/current pins; accepted provider остаётся null до review |
| Scenario inputs | first explicit product scenario, ActionIDs/labels/disabled/View/visibility/handlers/state/transition; отдельное решение по pending нормам |
| Primitive policy | exact TextStyle/font receipt, если общий план включает text primitives |
| Capture/rollback receipt | full mapped order/empty proof, baseline outside slot, foreign parent/order/transform preservation или rollback incomplete |
| Release | separate actual/live/parity/frontend/release acceptance после перечисленных входов |

Короткий future capability run владельца (в этом этапе **весь not-run**):

1. Temporary new instance для каждого CC key: exact owner/SLOT/property/source
   reference, исходные defaults/settings; записать runtime/platform/API version.
2. Empty и ordered payload из явно mapped newly-created nodes: remove defaults,
   append/insert, complete child IDs/order и limits. Negative cases: unmapped,
   reordered, wrong owner/ref и partial/omitted readback должны остановить run.
3. resetSlot должен вернуть exact defaults; отдельно failure/cancel rollback
   должен удалить только created roots и сохранить foreign content с исходными
   parent/order/absoluteTransform, либо явно сообщить incomplete.
4. BG оба exact Size56 variants: 1–4 explicit visible occurrences, hidden middle,
   Label/DisabledState/View readback, unchanged Button identity, canonical
   projection/order. SingleIcon, overflow interaction и бизнес-переходы требуют
   собственного принятого scenario и receipts.
5. Смена source/definition/receipt/page/plan во время run должна остановить
   mutation; cleanup проверяется отдельно. Каждый normative canvas case содержит
   полный source rule text и RuleID. API capability diagnostics не являются RuleID.

## Воспроизводимость и verification

Сохранённые локальные evidence:

- `/private/tmp/next04-native-api-evidence.json` — installed/candidate probes и immutable snapshot.
- `/private/tmp/next04-native-proposals.json` — три DTO + fresh five-package producer pins; proposed only.
- `/private/tmp/next04-native-verification.json` — final gates/tooling hashes и сравнение предыдущих 13 consumer pins.
- `/private/tmp/next04-v4-validate.log`, `/private/tmp/next04-root-validate.log` — full gate logs.

Запуск read-only proposal CLI (candidate directory содержит pinned package,
declarations и snapshot.json из официального repository):

```sh
node scripts/prepare-native-recipe-proposals.cjs \
  /Users/alexkukhta/Desktop/workplace/arui-private \
  /Users/alexkukhta/Desktop/workplace/shared/design-system_ab/experiments/current-contract-packages \
  /private/tmp/next04-native-api \
  /private/tmp/next04-native-proposals.json
```

Verification status и hashes дописаны после фактического final gate ниже.

Фактически прошли `npm run validate` в v4 (**192/192**, включая **7 новых
synthetic cases**) и root (**81/81**): type-check, build и tests. Fresh CLI вывел
все три proposals с current five-package pins. Live Figma calls/captures/tests/
writes, frontend artifacts, Proxy deployment и зависимые live receipts в этом
этапе отсутствуют. Core 0.1.10 / Editor 0.2.91 / generation-core 0.1.1 / v4 0.4.0
не менялись; актуальная типовая зависимость по-прежнему 1.121.0.

После сборки сравнение прошлых 13 consumer pins: **12 совпали**, включая main,
UI, build-inputs, Generation и frontend modules/Proxy service. Runtime bundle
bytes изменились с `2823427b6f8652e4b5ed5098c09badf632a057383e5c9536f3f3ca13d28d3b7c`
на `980ad3288b2b707b9b3bacefccee06736bf578f7e2e53f60b48b9bd7ad5997a4`.
Причина byte drift этим proposal не установлена; source/build-input pins не
изменились. Старый acceptance handoff не переписан и не объявлен exact receipt
нового runtime. Этот этап удостоверяет offline proposal tooling, не повторную
actual host/live acceptance. Полное сравнение — private verification JSON выше.

Current private proposal JSON SHA256:
`548b644fbb4e72ac06414402b04a8ab3ac16f51a30009e576afdf60ac019ae9e`.
API probe evidence bytes SHA256:
`42e62824820fb7ee7b4b803fbf928ffe594567e5965fbe88def714798f8b2bce`.
JSON не переносится в normative contract, registry, catalog или tracked fixture.
