# Apollo

## Что это
`Apollo` — Figma-плагин для аудита выделения относительно reference-справочников дизайн-системы. Он обходит выбранные узлы, находит компоненты и инстансы, сопоставляет их с каталогами и раскладывает результаты по диагностическим вкладкам.

Плагин полезен для быстрой проверки:
- актуальности компонентов;
- локальных и несвязанных элементов;
- detachd-узлов;
- кастомизаций относительно эталонной структуры;
- ошибок темизации;
- кастомных заливок, обводок и эффектов.

## Что реально умеет сейчас
После нажатия `Проверить` плагин:
1. Загружает список reference-каталогов с GitHub Pages.
2. Загружает базовые token- и style-справочники.
3. Обходит всё видимое поддерево внутри текущего выделения и собирает `componentKey`.
4. По component indexes определяет только нужные component-каталоги и скачивает их лениво.
5. Классифицирует найденные `COMPONENT` и `INSTANCE`.
6. Для связанных компонентов собирает snapshot структуры и считает diff относительно reference.
7. Отправляет в UI готовые списки для табов и позволяет перейти к нужному слою через `focus-node`.

Если запрос списка reference-источников целиком не удался, Apollo останавливает загрузку справочников и показывает ошибку. Bundled fallback больше не используется, чтобы не скрывать рассинхрон runtime-данных и component indexes.

Важно: Apollo работает с component-каталогами через index-only lazy loading. После первой проверки он не должен скачивать все component-каталоги подряд. Reference manifest schema v2 обязан явно содержать `source.indexPath` для каждого component-каталога; отсутствующий или недоступный index останавливает проверку, а не включает inferred fallback.

Component contracts загружаются только через `componentContractIndex.json` schema v2. Индекс задаёт явную политику покрытия `required | optional | none`; обязательные пакеты должны объявлять `rules` и `composition`, а поиск пакета выполняется в порядке Figma key, source catalog path, уникальный alias. Дубликаты и двусмысленные alias считаются ошибкой данных. Текущий архитектурный бэклог зафиксирован в [`docs/ARCHITECTURE_BACKLOG.md`](./docs/ARCHITECTURE_BACKLOG.md).

## Табы аудита
Конфигурация табов хранится в [`src/config/tabs.ts`](./src/config/tabs.ts).

- `Темизация` — page-level mode `Theme / Corp` и случаи использования `[Corporate]`-компонентов.
- `Не тот канал` — компоненты, не соответствующие каналу, выбранному в channel picker (`Desktop`, `MobileWeb`, `iOS`, `Android`).
- `Технические` — helper-компоненты из технических библиотек, которые Apollo помечает без deep-аудита.
- `Устаревшие` — компоненты со статусом `deprecated`.
- `Устаревшие стили` — style findings, собранные отдельно от component relevance.
- `Кастомные стили` — узлы с локальными fill/stroke/effect без корректной токенизации или style-binding.
- `Пора обновить` — компоненты со статусом `update`/`changed` и независимо размещённые remote instances, для которых Figma отдаёт более свежую опубликованную версию. Нативная свежесть определяется read-only: Apollo повторно импортирует компонент по стабильному `componentKey` и сравнивает id текущего `mainComponent` с id последней опубликованной версии; импорт кэшируется по ключу на время проверки. Instance-sublayer внутри другого экземпляра не считается самостоятельной точкой обновления и не попадает в эту категорию.
- `Кастомизации` — инстансы со значимыми diff-ами относительно reference.
- `Локальные компоненты` — components без official reference Apollo. Сюда входят нативные локальные components (`mainComponent.remote === false`) и экземпляры из пользовательских/неофициальных remote libraries, ключи которых отсутствуют в reference-каталогах. Наличие стабильного Figma key само по себе не делает компонент официальным библиотечным.
- `Детач` — `FRAME`/`GROUP`, у которых есть `detachedInfo` из библиотеки.
- `Пресеты` — инстансы компонентов, помеченных через `🔒`.
- `Актуальные компоненты` — компоненты со статусом `current`.

Важно: если компонент попал в `Не тот канал`, он не показывается в `Актуальных компонентах`, даже если его reference-статус сам по себе `current`.
Важно: карточка с подписью `Доступна новая версия` означает нативный Figma library update независимо размещённого экземпляра, а не lifecycle-статус Athena. Вложенные instance-sublayer обновляются через владеющий ими экземпляр и не создают отдельные карточки. Ошибка импорта или отсутствие доступа дают диагностическое состояние `unknown` и не переводят компонент в `Пора обновить`. Apollo не применяет обновление автоматически и не изменяет макет во время проверки.
Важно: если выбранный макет использует локальный или незарегистрированный пользовательский компонент, Apollo добавляет его в локальную инвентаризацию до shell/forced-category фильтров, один раз открывает исходный `ComponentNode` и проверяет самостоятельно размещённые library instances внутри определения. Remote source разрешается обходить только для такого незарегистрированного корневого owner; найденные внутри официальные remote instances остаются границами и повторно не обходятся. Поддерживается выбор как instance, так и самого `ComponentNode`. Для Slot/flattened-содержимого исходный owner восстанавливается по instance-sublayer ID только после проверки фактического ancestor `COMPONENT`. Карточки обновлений содержат подпись `внутри <компонент-владелец>` и ведут к source-узлу; повторные экземпляры owner не дублируют findings.
Source-аудит дедуплицирует owner definitions по стабильному component key и проверяет собранные dependency boundaries пулом из четырёх workers. Вложенные локальные и незарегистрированные owners сохраняются в аудите, чтобы не терять их реальные устаревшие зависимости; повторные occurrences одного owner не создают повторный source-обход. Порядок findings сохраняется исходным. Метрика `local-component-dependency-audit` содержит длительность фазы, количество owners/source nodes/dependencies, уникальные ключи и cache hit/miss импорта.
Для source update finding Apollo хранит отдельный navigable `focusNodeId`: каждая source dependency остаётся отдельной карточкой и фокусирует собственный rendered instance-sublayer внутри первого найденного owner occurrence, а при отсутствии соответствия — сам owner instance. Variant name отличает одноимённые компоненты с разными ключами. После source-аудита provisional instance-sublayer с подтверждённым component key удаляются из `Актуальных компонентов` только внутри occurrences соответствующего локального owner; независимый свежий экземпляр с тем же key остаётся актуальным.
Важно: для `iOS` и `Android` таб `Темизация` скрывается полностью, а сама themization-проверка не запускается даже в фоне.
Важно: компоненты из `Web :: Core Helpers` и `Web :: Corp Helpers` принудительно попадают в `Технические`, а компоненты из `Web :: Old Core Default Components` и `❌ Web :: DEPRECATED CORP (не подключать)` — в `Устаревшие`.

## Как устроен аудит

### Основной поток
- [`src/code.ts`](./src/code.ts) показывает UI, слушает сообщения UI и запускает `runAudit`.
- `runAudit` подгружает каталоги, затем собирает состояние проверки через `collectTargets`.
- `classifyNode` ищет `componentKey`, находит reference через `findComponent`, при необходимости строит snapshot (`snapshotTree`) и считает diff (`diffStructures`).
- Для preload и основного diff-phase Apollo пишет служебные метрики в консоль с префиксом `[Apollo][metrics]`.
- Для отладки reference-resolution есть штатный trace mode с префиксом `[Apollo][trace]`.
- при загрузке style catalogs Apollo пересобирает lookup-карты заново, поэтому новые или только что добавленные paint/effect styles корректно участвуют и в `Кастомизации`, и в `Кастомных стилях`.
- Результаты складываются в `CheckState`, после чего UI получает компактный `scan-result` только с актуальными `visibleViews` и кратким `summary`; legacy-дубли payload из старого bridge-контракта удалены.

### Сервисы и модели
- [`src/services/auditViewBuilder.ts`](./src/services/auditViewBuilder.ts) собирает detached-элементы, кастомные стили и текстовые узлы.
- [`src/structure/snapshot.ts`](./src/structure/snapshot.ts) сериализует дерево нод в нормализованный плоский список.
- [`src/structure/diff.ts`](./src/structure/diff.ts) сравнивает layout, padding, стили, fill/stroke, radius и opacity и строит нормализованный `DiffContext` для каждого diff.
- [`src/reference/library.ts`](./src/reference/library.ts) загружает и нормализует каталоги компонентов, токенов и стилей, а также строит policy-карты host-controlled nested property paths по самим reference-каталогам.
- [`src/policies/componentAuditPolicy.ts`](./src/policies/componentAuditPolicy.ts) задаёт forced audit categories и platform-aware visibility для табов вроде `Темизация`.
- [`src/filters/allowedCustomizationRules.ts`](./src/filters/allowedCustomizationRules.ts) содержит декларативный allowlist разрешённых кастомизаций и context-specific override-правила.
- [`src/filters/suppressionPolicy.ts`](./src/filters/suppressionPolicy.ts) содержит единый policy-слой suppression для nested host-controlled overrides и root-level nested variant switch.
- [`src/types/audit.ts`](./src/types/audit.ts) описывает `AuditItem`, `DetachedEntry`, `CustomStyleEntry` и связанные типы.
- [`src/utils/variantProperties.ts`](./src/utils/variantProperties.ts) даёт единый парсер и matcher variant properties для themization и nested reference expansion.
- [`src/utils/auditInstrumentation.ts`](./src/utils/auditInstrumentation.ts) управляет audit trace mode и метриками preload/diff-phase.
- [`src/utils/componentKeyCache.ts`](./src/utils/componentKeyCache.ts) даёт retryable cache для `componentKey`, чтобы nested instances не застревали в `unknown/local`, если первый `getMainComponentAsync()` временно вернул `null`.
- [`src/filters/customStyleFilters.ts`](./src/filters/customStyleFilters.ts), [`src/filters/customizationFilters.ts`](./src/filters/customizationFilters.ts) и [`src/filters/ignoredComponentFilters.ts`](./src/filters/ignoredComponentFilters.ts) содержат управляемые исключения для известных технических кейсов DS. Для `Кастомизации` основной suppression-слой теперь не regex-based, а policy-based: он подавляет host-controlled nested property diff-ы, вычисленные из каталогов, а не из ручного списка path-паттернов, а также гасит root-level diff у вложенного инстанса, если на том же path фактически произошёл variant switch внутри одной component family.
- Контракт [`src/filters/customizationFilters.ts`](./src/filters/customizationFilters.ts) упрощён: фильтры кастомизации больше не получают `node`, так как фактическая фильтрация выполняется только по `diff`-записям и их metadata.

### Что считается в diff
Сравнение учитывает:
- layout и padding;
- `itemSpacing`;
- стили заливки, обводки и текста;
- `typographyToken` и text style overrides;
- fill/stroke, включая variable token alias, style-binding и raw color values;
- радиусы;
- opacity.

Важно: style-binding для `fill` и `stroke` сравнивается отдельно через `styles.fill.styleKey` и `styles.stroke.styleKey`. В paint-канал больше не попадают `fillStyleId` и `strokeStyleId`, чтобы styled fills/strokes не отображались в UI как ложные `token: S:...` diff-ы.
Важно: identity text/fill/stroke style определяется по опубликованному Figma style key, то есть без document-local suffix после запятой. Если `S:<key>,<local-id>` отличается только локальным хвостом либо оба id резолвятся в один label, такая пара не считается кастомизацией. Допустимость стиля проверяется независимо: неизвестный библиотечным каталогам style key по-прежнему попадает в `Кастомные стили`.
Важно: в `paint-diff` Apollo не гадает по совпадению цвета. Если у слоя есть явная привязка к токену или стилю, в UI показывается label по id, а если label не найден — сам id. Только при отсутствии привязки показывается фактический цвет: непрозрачный как `#RRGGBB`, полупрозрачный как `rgba(...)`.
Важно: скрытые и полностью прозрачные `fill`-paints игнорируются в actual snapshot так же, как и в reference-нормализации. Это убирает ложные кастомизации, когда в компонентных каталогах есть технические `fills` с `"visible": false`.
Важно: strict comparison не создаёт warning для отсутствующего `radius`, если reference содержит эффективное значение `0`, и не считает actual-радиус кастомизацией, если поле полностью отсутствует в reference-каталоге. Также отсутствие paint или padding у корня actual `INSTANCE`, сопоставленного с reference `COMPONENT`, считается ограничением Figma snapshot, а не ошибкой данных; доступное и реально изменённое свойство по-прежнему попадает в `Кастомизации`.
Для nested instances используется variant-aware reference expansion: Apollo сначала пытается взять nested reference по текущему `componentKey`, а если этого недостаточно, добирает нужный variant по `variantProperties`, чтобы stateful nested-компоненты вроде `Radio_24` не сравнивались с неправильным reference-state.
Важно: при раскрытии nested instances host reference имеет приоритет над standalone reference вложенного компонента. Standalone-структура nested-компонента используется только для дозаполнения отсутствующих путей.
Важно: свойства, явно заданные patch-операциями выбранного parent variant, сохраняют property-level provenance. При более глубокой materialization standalone-компонент может дозаполнить только свойства, которыми parent variant не владеет. Например, `StatusPreset Type=Approved, Style=Muted, Size=20` сохраняет `decorative-text/green` на вложенном Label вместо default baseline `text/info`; реальная ручная перекраска этого Label по-прежнему считается кастомизацией.
Важно: nested instance paths выравниваются с actual snapshot сначала по цепочке component keys, а при отсутствии ключа в raw variant patch — по нормализованной цепочке имён и occurrence. Поэтому техническое имя из каталога вроде `🔩 Label` может корректно сопоставляться с переименованным actual instance `Label`, не теряя host-variant baseline его descendants.
Важно: explicit variant properties вложенных instances всегда сверяются с effective host chain после identity/name alignment. Свойство, явно заданное выбранным parent variant, имеет приоритет над stale descendant baseline более общего host-компонента и над standalone-каталогом. Например, `StatusPreset` сохраняет принадлежащее его варианту `Label.Uppercase=True`, даже если структура `Table Wide` содержит более общий Label baseline `False`. Lazy-loaded component catalogs сначала загружаются всем batch, затем Apollo детерминированно пересчитывает inferred nested component keys и host-controlled policies; ранее выведенный по имени key удаляется, если после догрузки имя стало неоднозначным. Поэтому повторный аудит неизменного selection не должен менять набор `variant.*` findings.
Важно: если host reference уже содержит явный paint descriptor на descendant-узле, Apollo не заменяет его standalone paint descriptor вложенного компонента. Это сохраняет корректный expected-token для variant-controlled слоёв вроде `Button / Addon / PaintMe`, `FilterTag / Addon|Arrow / PaintMe`, `Tag / Icon|Addon / PaintMe`, `IconButton / Icon / PaintMe`, `ActionButton / Bg / PaintMe` и `CompactTag / Arrow / PaintMe`.
Важно: suppression для host-controlled nested properties применяется только к diff-ам, построенным от standalone nested reference. Если diff построен от host reference, ручное изменение остаётся видимым как кастомизация.
Важно: `Button / Addon / PaintMe`, `FilterTag / PaintMe`, `Tag / PaintMe`, `IconButton / PaintMe`, `ActionButton / PaintMe` и `CompactTag / PaintMe` не входят в allowlist разрешённых recolor-кастомизаций. Цвет задаётся variant-controlled host reference и ручное изменение должно попадать в `Кастомизации`.
Важно: если parent nested materialization уже несёт host-controlled paint, более глубокий standalone nested reference не затирает это значение. Например, `TitleView → FilterCompanySelect → CompactTag → Arrow / PaintMe` сравнивается с expected из `TitleView/FilterCompanySelect`, а не со standalone `FilterTag / Arrow`.
Важно: если policy-карта ещё не знает inner variant key, Apollo дополнительно сохраняет parent-reference для component-qualified путей вида `[D] CompactTag / Arrow / Fixer / PaintMe`. Это не allowlist: ручная перекраска всё равно остаётся кастомизацией, но expected берётся из более специфичной сборки.
Важно: ложные кастомизации для nested overrides теперь подавляются универсально, если reference-каталоги показывают, что хост-компонент управляет свойством вложенного компонента. Сейчас policy покрывает не только `fill/stroke`, `BgColor` и `Border`, но и nested `typographyToken`/`text style`.
Важно: отдельный suppression введён и для root-level nested variant switch. Если на одном и том же path actual и reference указывают на разные variant keys одной и той же component family, Apollo больше не считает это кастомизацией layout/paint/property самого вложенного узла.
Важно: если в host reference у nested instance есть `variantProperties`, но нет `componentKey`, Apollo восстанавливает family key по уникальному имени компонента из загруженного каталога. Это нужно для кейсов вроде `BackgroundPlate → Style Level 1`, где разрешённый switch `Type=Secondary` не должен превращаться в ложный diff заливки.
Важно: current linked instances внутри `instance` локального компонента теперь тоже форсируются в diff, даже если у самого внутреннего инстанса нет direct `overrides`. Это устраняет пропуски кастомизаций, которые раньше были видны только в оригинале локального компонента, но терялись в его инстансах.
Важно: старые path-based regex-исключения для `PaintMe`, `IconView` и похожих nested color-кейсов удалены; работоспособность suppression теперь определяется именно catalog-derived policy-слоем.
Важно: у каждого diff теперь есть явный `DiffContext`, а не набор постепенно наращённых служебных полей. Это снижает риск регрессий в suppression/filter-слое и делает trace-вывод стабильнее.
Важно: поверх suppression-policy есть второй слой `allowedCustomizationRules`: Apollo может обнаружить diff, распознать его как допустимый override и убрать из проблемной категории, не теряя trace о сработавшем правиле.
Важно: для nested instances Apollo теперь умеет повторно получать `componentKey`, если на раннем обходе Figma временно вернула `null`. Это критично для частей вроде `BorderLine`, которые раньше могли ошибочно застревать вне `Актуальных`.

## Известные классы ложных срабатываний
- Nested host-controlled `fill/stroke/BgColor/Border` внутри хоста не считаются кастомизацией, если это подтверждается reference-каталогами.
- Для host-controlled nested overrides Apollo регистрирует path ownership и по variant key, и по family component key вложенного компонента, чтобы runtime Figma и JSON-каталоги не расходились по ключу одного и того же nested-instance.
- Имена nested-компонентов в allowlist нормализуются из catalog source paths вида `Web _ Core -- IconView.json`, потому что runtime может резолвить owner через index-only данные до полной загрузки каталога.
- Nested host-controlled `typographyToken` и `text style` тоже гасятся policy-слоем, но реальные изменения текста остаются видимыми.
- Root-level nested variant switch внутри одной component family не считается кастомизацией layout/paint самого вложенного инстанса.
- Для stateful nested-компонентов reference теперь резолвится по `variantProperties`, чтобы `SelectedState/Type/View/Preset` не подменялись дефолтным variant.
- `itemSpacing` сравнивается только для контейнеров, где spacing реально влияет на layout.
- Linked instances внутри local-component context не пропускаются даже без direct overrides на внутреннем инстансе.
- Системные allowlist-правила покрывают семейства nested override-кейсов вроде `Status`, `Amount`, `PaymentMaskedNumber`, `Link`, `StatusBadge`, `TopAddon` и `ProgressBar`, где допустимое переопределение должно задаваться на уровне вложенного компонента, а не отдельным host-specific хаком.

## Источники данных
Плагин работает с удалёнными JSON-справочниками и в рантайме берёт список источников с GitHub Pages:

- основной URL: `https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json`;
- декларативные правила кастомизаций: путь `apollo.patternRulesPath` из основного списка, сейчас `JSONS/apollo/patternRules.json`;
- token/style каталоги: пути из этого списка;
- component catalogs: загружаются только по component indexes для ключей, найденных в проверяемом выделении;
- разрешённые домены описаны в [`manifest.json`](./manifest.json).

При старте Apollo загружает и список источников, и pattern rules с cache-busting query-параметрами, затем валидирует `schemaVersion` и структуру каждого правила. Это исключает чтение предыдущей версии GitHub Pages из десятиминутного CDN-кеша. После публикации изменённого JSON достаточно перезапустить плагин: пересборка Apollo не требуется. Отсутствующий или некорректный конфиг считается ошибкой reference bootstrap; встроенного fallback с устаревшими правилами нет.

Важно: текущий runtime-аудит зависит от доступности и актуальности опубликованного содержимого `ackedze.github.io/design-system_ab`. `npm run build` не публикует JSON-каталоги, indexes или pattern rules и не скачивает их автоматически, а только собирает плагин.

История и шаги миграции собраны в [`APOLLO_MIGRATION.md`](./APOLLO_MIGRATION.md).

## Component contract artifacts

Apollo постепенно расширяется от одного Figma-плагина до небольшой экосистемы вокруг raw-каталогов, contract artifacts, агентских отчётов и прокси к корпоративному агенту. Сейчас рабочие JSON-файлы публикуются в `Ackedze/design-system_ab` и подхватываются Apollo через reference source list и component indexes.

Для экспериментальных component kits используется такой набор файлов:

- `contract.generated.json` — компактный контракт, сгенерированный из raw Figma catalog. Не редактируется руками и не отправляется агенту целиком.
- `contract.overrides.json` — ручной semantic layer: public API компонента, anatomy semantics, reset model и dependency policy. Его место в pipeline — до diff/classification, когда Apollo строит effective модель компонента.
- `composition-contract.json` — optional-файл для wrapper/composite компонентов. Он нужен, когда родительский компонент владеет настройками вложенных компонентов и должен объявить effective baseline для nested layers. У standalone core-компонентов вроде Button такого файла может не быть.
- `rules.json` — source of truth для component rules, design-rule violations и ссылок на pattern rules. Matched rules добавляются в `*_agent.json` рядом с конкретным change.
- `audit-mapping.json` — декларативная карта группировки, порядка и reset-action для diff-ов. Сейчас часть этого поведения ещё зашита в Apollo, но целевая модель — переносить такую классификацию сюда.
- `agent-context.json` — компактный explanatory context для агента. Он может ссылаться на rule ids, но не должен дублировать `ruleText`, `severity` и `matchKind` из `rules.json`. Утверждённое назначение конкретных Figma-компонентов хранится в `manual.componentSemantics[]`; записи связываются по published component key и имеют приоритет над Figma-description.
- `examples.json` — fixtures и примеры интерпретации. Их стоит подключать к агенту on demand, а не класть в каждый отчёт.

Текущий runtime Apollo использует `composition-contract.json` для contract-aware diff/rebase и `rules.json` для обогащения agent report. Для component packages, найденных в проверяемом выделении, runtime также загружает `agent-context.json`, компактно добавляет его в `*_agent.json`, читает из `audit-mapping.json` presentation metadata для changes и прикладывает релевантные части `contract.overrides.json` (`publicApi`, `resetModel`) к агентскому контексту. В `componentSemantics` попадают только Figma-description или ручные записи со статусом `approved`; `runtime.semanticDescriptionCandidates` не считается нормативным источником. Перед сохранением отчёта Apollo оставляет только semantic entries для компонентов, фактически найденных в макете. Запись связывается по published component key, а для finding с variant key восстанавливается по каноническому имени компонента; поэтому семантика выбранного `TitleView` сохраняется, но описания соседних компонентов пакета не протекают в контекст. `examples.json` не загружается во время обычного аудита: до 12 примеров на пакет подгружаются только для прямого вопроса Apollo Agent и явно маркируются как контекст, а не правила.

Component rules сопоставляются прежде всего по явным ключам actual/reference и владельца вложенного diff. Runtime понимает опубликованные селекторы `target.component`, `components`, `componentKeys`, `componentNames`, `layer`, `layers`, `slot` и `slots`. Для обычного layer/root-правила приоритет имеет непосредственно изменённый component instance; владелец-предок участвует только в явном slot-scope. `layer: "root"` относится только к корню выбранного компонента, а layer/slot-селектор должен завершаться на изменённом узле. Каноническое имя компонента восстанавливается из каталога по Figma key, поэтому переименование instance в макете не ломает scope. Неизвестные или некорректные поля `target` логируются один раз как `unsupported rule target`, и такое правило не прикладывается как unconstrained. Одинаковые правила в отчёте схлопываются по `ruleId`. Правило с `requiredTokenSource` считается нарушенным только при наличии фактических binding-данных, которые явно показывают отсутствие токена; Apollo не выводит token violation из одного raw-значения diff.

Прямой вложенный instance под корнем проверяемого компонента сохраняет host ownership и относительный slot path. Это позволяет правилам композиции `TitleView` оценивать изменения `StatusPreset`, даже когда finding несёт variant key самого статуса. Для variant-правил runtime поддерживает `conditions.backgroundSurface`, `requiredVariant`, `forbiddenVariant`, `requiredVariantByContext` и `classification.allPublicApiValuesAllowed`. Ближайшая распознаваемая поверхность определяется по bound fill variable, а при отсутствии токена — по SOLID-цвету; evidence сохраняется в `change.context.surfaceContext`. При `kind=unknown` Apollo не делает предположение о фоне. Например, `StatusPreset.Style=Muted` становится разрешённым на белой поверхности и нарушением на серой, а опубликованное значение `StatusPreset.Type` остаётся допустимым public API, если это прямо объявлено правилом TitleView.

Targetless rules имеют отдельную scope-политику. `matchKind=composition_rule`, `screen.*`, `component.composition`, а также явные `changeScope=component-context|screen-context|package-context` остаются контекстом component package/agent и не прикрепляются к atomic diff. Для намеренно component-wide atomic rules поддерживается `changeScope=atomic`; legacy deterministic и `exact_component_rule` без target сохраняют совместимость. Поэтому screen relation вроде `header-adjacency` и explanatory `gutter-horizontal-composition` не могут повысить severity конкретного `Section.itemSpacing`, пока отчёт не содержит соответствующего composition evidence.

В `*_agent.json` сохраняется `DiffContext` каждого change, включая компактное evidence о поверхности, а compact component context собирается не только для корневого finding, но и для actual/reference владельцев вложенных изменений. Канонический `componentKey` берётся из contract index; несовпадающий key внутри отдельного artifact не создаёт второй контекст.

`contract.generated.json` пока не догружается поверх raw-каталога: крупные packages могут занимать много мегабайт, поэтому двойная загрузка ухудшила бы время старта и память. Его подключение выполняется как отдельная миграция baseline-loader, в которой generated contract заменит raw structure для runtime-проверки.

При нескольких вложенных компонентах с одинаковым path contract-aware слой сопоставляет их по occurrence (`path`, `path@@2`, `path@@3`). Простой `path` всегда относится к первому видимому occurrence, поэтому baseline первой кнопки в `TitleView` не может быть подменён состоянием следующей кнопки.

`composition-contract.json` сейчас есть у:

- `web-core/navigation/Tabs`;
- `web-corp/TabsView`;
- `web-corp/TitleView`;
- `web-corp/ButtonGroup [D]`;
- `web-corp/BackgroundPlate`.

У `web-core/core/button` `composition-contract.json` отсутствует осознанно: Button описывается как standalone core component через generated contract, overrides и rules.

## Публикационный пайплайн Apollo ecosystem

Рабочая модель не должна полагаться на ручное обновление связанных JSON-файлов. При публикации raw-каталогов и indexes Athena CLI или отдельный publish job должен детерминированно пересобирать и проверять весь комплект:

1. raw component catalogs;
2. component indexes и `referenceSourcesMVP.json`;
3. `contract.generated.json`;
4. `contract.overrides.json` validation;
5. `composition-contract.json` для composite/wrapper компонентов;
6. `rules.json`;
7. `audit-mapping.json`;
8. `agent-context.json`;
9. `examples.json` fixtures, если они есть;
10. consistency checks между agent-context rule references и `rules.json`.

Публикация на GitHub Pages должна быть атомарной относительно этого комплекта: Apollo не должен получать новый raw-каталог со старым index, старые rules с новым agent-context или composition contract без соответствующего component catalog.

## Правило публикации

При публикации изменений Apollo обновляйте этот README вместе с кодом, если меняется runtime-поведение, источники данных, сборка, контракты UI/backend или workflow проверки. Если изменение влияет на общий workspace-процесс, дополнительно обновляйте root `README.md` и `WORKSPACE.md`.

## Правило проверки

После любых изменений в Apollo перед завершением работы обязательно:
- запустить `npm run validate`, который выполняет type-check, production build, Figma runtime check и все `scripts/test-*.js` regression-тесты.

Изменение не считается завершённым, пока эти шаги не выполнены или пока явно не зафиксировано, почему какой-то из них нельзя выполнить.

## UI и поведение
- [`src/ui.html`](./src/ui.html) теперь служит HTML-shell и bridge-слоем: в нём остались message-handlers, placeholder-сценарии и маршрутизация табов в React results bridge.
- Внутренний контракт между runtime и [`src/ui.html`](./src/ui.html) упрощён: правый bridge больше не держит legacy-fallback на дублирующее поле `views`, а читает только актуальные `visibleViews`.
- React-хром UI вынесен в [`src/ui-app`](./src/ui-app): на первом этапе туда перенесены `topSection`, `leftSection` и базовые компоненты (`Button`, `CategoryCard`, `CounterBadge`).
- В шапке [`TopSection`](./src/ui-app/components/TopSection.tsx) появился channel picker на базе [`PickerButton`](./src/ui-app/components/PickerButton.tsx), [`OptionList`](./src/ui-app/components/OptionList.tsx), [`OptionListCell`](./src/ui-app/components/OptionListCell.tsx) и [`OptionListHeader`](./src/ui-app/components/OptionListHeader.tsx).
- Channel picker поддерживает `Desktop`, `MobileWeb`, `iOS`, `Android`, а выбранное значение уходит в backend через `scan-selection` и влияет на аудит `Не тот канал`.
- В библиотеку React-компонентов также добавлен [`SmallButton`](./src/ui-app/components/SmallButton.tsx) по Figma-компоненту `smallButton`: он поддерживает компактный `singleIcon`-вариант и текстовый вариант с hover-state.
- Для единообразной интеграции иконок в React UI добавлен [`IconSlot`](./src/ui-app/components/IconSlot.tsx) с фиксированными размерами `24 | 20 | 16`; picker-иконки рендерятся как inline SVG-компоненты из [`PickerIcons.tsx`](./src/ui-app/components/PickerIcons.tsx).
- Для пустых экранов правой колонки добавлен отдельный [`Placeholder`](./src/ui-app/components/Placeholder.tsx): он используется для загрузки каталогов и для стартового состояния до первого нажатия `Проверить`.
- Для правой колонки подготовлены базовые React-компоненты карточек результата: [`ResultCard`](./src/ui-app/components/ResultCard.tsx), [`ResultSubCard`](./src/ui-app/components/ResultSubCard.tsx) и preset-обёртки в [`ResultCardPresets.tsx`](./src/ui-app/components/ResultCardPresets.tsx).
- Интеграция правой колонки начата для audit-like категорий: `Актуальные компоненты`, `Устаревшие`, `Пора обновить`, `Пресеты`, `Локальные`, `Детач`, `Темизация`, `Кастомные стили` и `Кастомизация` уже используют React-bridge и React-карточки.
- В `Кастомизации` diff-ы теперь группируются по узлу: один [`ResultSubCard`](./src/ui-app/components/ResultSubCard.tsx) соответствует одному узлу, а внутри него рендерится одна или несколько property-строк.
- Перед отображением кастомизаций [`CustomizationAssessment`](./src/assessment/customizationAssessment.ts) проверяет diff против materialized host и выбранных variant-структур всех вложенных ancestor-компонентов. Значение получает `Expected`, только если конкретный node/property совпадает хотя бы с одним точным contextual reference; ручное значение, отсутствующее в выбранной конфигурации, не становится Expected.
- Декларативные composition rules хранятся вне plugin bundle в `Ackedze/design-system_ab/JSONS/apollo/patternRules.json`. [`patternRules.ts`](./src/assessment/patternRules.ts) содержит только типы, строгую валидацию и evaluator, поэтому изменение набора правил не требует пересборки Apollo.
- Строки со статусами `expected` и `allowed` показываются в UI с маркером `Expected`, сохраняются в статистике вместе с причиной assessment и не предлагают действие `Сбросить`.
- Для pattern violation с variant constraint действие `Сбросить` восстанавливает variant property через `InstanceNode.setProperties(...)`, а не копирует визуальные значения другого варианта в текущий instance.
- Производные paint/layout diff-ы запрещённого variant switch сворачиваются в одну семантическую строку вида `view: primary → accent`; независимые ручные изменения внутри того же subtree сохраняются отдельными строками.
- Contextual reference сопоставляет переименованные nested layers по component family key, поэтому пары вроде `Icon` и `🔩 Icon` не теряют host-defined overrides из-за различия display name/path.
- Для штатных nested variant switch декларативное правило может задать `presentation: suppress-derived`. Первое такое правило применяется к `[D]/[M] TagGroup`: визуальные последствия разрешённых `Tag Size/Shape` не выводятся как отдельные Expected-кастомизации, но ручные значения без подтверждения выбранной variant-структурой остаются видимыми.
- Режим `presentation: semantic-variant` сохраняет Expected-настройку, но заменяет производные visual diff-ы одной строкой variant property. Для `[D][Promo] BackgroundPlate` заливка `base-bg-alt/secondary → neutral-translucent/100` отображается как `type: primary → secondary`.
- `Кастомные стили` тоже переведены на React-карточку: в этом табе `caption` заполняется названием стиля или эффекта из `formatCustomStyleReason(...)`.
- React-карточки результатов в `Актуальных компонентах` закреплены как `hug` по содержимому (`flex: 0 0 auto`), чтобы при длинной выдаче контейнер скроллился, а карточки не схлопывались по высоте.
- Layout token-изменения, включая `itemSpacingToken`, `paddingTokens`, `radiusToken` и `opacityToken`, в diff-выводе проходят через token label resolver и показываются по имени токена, а не как сырые `VariableID`; для padding скрывается технический namespace `Vertical/Horizontal Paddings`, а token-diff подавляется, если после резолва видимые значения совпадают.
- Карточка кастомизации берёт reference/actual из структурированных `DiffDetails`, а не разбирает человекочитаемую строку как источник истины. Поэтому token/style labels, регистр variant values и признак `different-binding` не теряются после contract-aware обработки; строка `message` остаётся только fallback для legacy findings.
- Variable-bound свойства сравниваются binding-first: если actual и reference ссылаются на одну canonical variable, различие resolved values из-за другого mode не считается ручной кастомизацией. Для реальных `unbound`/`different-binding` изменений full и agent reports сохраняют `bindingStatus`, имя variable/collection, resolved/explicit mode и узел-владельца mode. Агенту запрещено называть значение ручным только по числовой паре `referenceValue -> actualValue`; `unresolved-binding` и `missing-reference-binding` требуют ручной проверки.
- Потеря binding является самостоятельной ошибкой даже тогда, когда сохранённое raw-значение совпадает с эталоном или корректным значением текущего mode. В UI такие изменения выводятся в секции `Переменные` как `Переменная ... → Отвязана`, а не как значение из другого mode. Сброс восстанавливает не только число, но и reference variable binding для padding, itemSpacing, radius и opacity.
- Reset variable-binding сначала разрешает переменную как уже доступную local variable по `VariableID`, затем через canonical published variable key из token-каталога. Для binding-ошибки числовой fallback не применяется: если переменную не удалось найти или импортировать, Apollo сообщает об ошибке и не заменяет корректное mode-driven значение числом из mode экспортированного каталога.
- Стили React-компонентов вынесены из [`src/ui.html`](./src/ui.html) в отдельные `*.module.css` рядом с компонентами; при сборке `ui-app.css` автоматически инлайнится в `dist/ui.html`.
- Внутренние отступы [`TopSection`](./src/ui-app/components/TopSection.tsx) задаются самим компонентом, а `.header` в [`src/ui.html`](./src/ui.html) отвечает только за разделитель и оболочку.
- Базовый [`Button`](./src/ui-app/components/Button.tsx) выровнен по Figma component set `Button`: поддерживает `type="primary" | "secondary"` и отдельные состояния `hover`/`disabled` через CSS, включая загрузочные варианты с addon-spinner.
- [`CategoryCard`](./src/ui-app/components/CategoryCard.tsx) соответствует `categoryCard` из Figma, учитывает состояния `selected`, `non-empty` и `empty`, а при переполнении заголовок уходит в ellipsis.
- [`LeftSection`](./src/ui-app/components/LeftSection.tsx) следует актуальному Figma-порядку категорий, вставляет `Divider` между логическими группами и использует типизированные counters: `general`, `warning`, `error`, `empty`. Источник истины для порядка категорий один: [`src/config/tabs.ts`](./src/config/tabs.ts).
- Старый DOM-пайплайн карточек удалён из [`src/ui.html`](./src/ui.html): активные табы правой колонки рендерятся через React results bridge, а `ui.html` оставляет только placeholder-состояния.
- В UI таб `Темизация` проверяет page-level mode `Theme / Corp` и использование `[Corporate]`-компонентов.
- В табе `Темизация` кнопка `Сменить` теперь выполняет действие: для page-level finding переключает mode `Theme -> Corp`, а для `[Corporate]`-инстанса делает `swapComponent(...)` на базовую версию без `[Corporate]`.
- Подбор пары для `[Corporate]`-компонента теперь учитывает платформу (`[D]` / `[M]`) и не схлопывает desktop/mobile-версии в один counterpart. Это устраняет кейсы вроде `🔄 [D][Corporate] Button -> [M] Button`.
- Сброс кастомизаций распознаёт русские token-сообщения layout diff-ов (`Паддинг ... (токен)`, `Скругления (токен)`, `Прозрачность (токен)`) и не роняет reset, если Figma пересоздала instance sublayer до `setBoundVariable`: Apollo повторно получает node по id и пропускает binding для stale sublayer.
- Для slot-инстансов variant structure теперь выбирается по актуальным `variantProperties`, даже если Figma отдаёт stale direct variant key исходного slot-компонента. Это предотвращает ложные кастомизации во вложенных компонентах вроде `[D] Tag` внутри `[D] TagGroup`.
- Для corporate/base-компонентов с разными schema variant properties, как у `Tag`, замена теперь сначала пытается найти exact variant, а затем использует детерминированный match по общим variant props с учётом default extra-props target-компонента. Это устраняет кейсы, где `🔄 [D][Corporate] Tag` заменялся на `[D] Tag` с неверными параметрами.
- Action `Сменить` для `[Corporate]`-инстанса использует сохранённый `replacementComponentKey` из результата аудита и не пересчитывает target-компонент заново по имени в момент клика.
- В табе `Темизация` page-level finding создаётся только тогда, когда collection `Theme` найдена через `resolvedVariableModes` в дереве текущей страницы и её текущий mode на странице отличается от `Corp`; action `Сменить` использует сохранённые `collectionId/modeId` из результата аудита и не пытается ничего заново искать в момент клика.
- Поиск `Theme` теперь кэширует `nodeId` якорного узла на страницу: если `Theme` уже была найдена на этой странице, следующая проверка сначала смотрит в этот узел и только при промахе снова обходит дерево страницы.
- Для collection `Theme` действует простое page-level правило: если текущий явно выбранный mode не `Corp`, Apollo показывает карточку ошибки; отсутствие explicit mode трактуется как `Auto (Default)` и тоже считается ошибкой до тех пор, пока пользователь явно не переключит `Theme` в `Corp`.
- Таб `Не тот канал` проверяет reference-компоненты относительно выбранного channel picker:
  - `Desktop`: ошибкой считаются `abm/*` и web-компоненты с `platform = mobile-web`;
  - `MobileWeb`: ошибкой считаются `abm/*` и web-компоненты с `platform = desktop`;
  - `iOS`: ошибкой считаются `web/*` и `abm/android/*`;
  - `Android`: ошибкой считаются `web/*` и `abm/ios/*`.
- Старый text-node pipeline и таб `textAll` удалены из runtime: аудит больше не собирает неиспользуемые текстовые представления, а `tabDefinitions` больше не хранят legacy `builder`-ключи.
- После сканирования в карточках доступна кнопка перехода к ноде.
- UI показывает тосты о загрузке каталогов и завершении сканирования.
- В верхнем segmented control доступны три независимых режима: результаты проверки, read-only отчёт агента и диалог с агентом. Автоматический ответ по проверке хранится отдельно от истории пользовательского диалога.
- В режиме `Отчёт` поле ввода отсутствует; composer с placeholder `Введи или выбери текст` отображается только в режиме `Диалог`.
- Запрос из режима `Диалог` отправляет только `design-dialogue` envelope и никогда автоматически не прикладывает последний `apollo-agent-report`, component examples или audit evidence. Диалог использует отдельную session текущего запуска плагина; отчёт отправляется только из режима `Отчёт` и сохраняет собственный report session.
- Свёрнутый интерфейс имеет размер `400 × 860`, соответствующий компактным Figma-макетам; категории проверки занимают всю ширину панели.
- Состояние основной кнопки задаётся через явную фазу UI (`catalog-loading` / `scanning` / `idle`), чтобы не возникали смешанные состояния вроде `Остановить` с неправильным цветом или `disabled`.
- В React-хроме верхняя action-кнопка переключается между variant-инстансами `Button[type=primary]` и `Button[type=secondary]`, а не только меняет цвет у одного и того же узла.
- При нажатии `Проверить` UI сначала переводит кнопку в фазу `scanning`, и только на следующем animation frame отправляет `scan-selection` в backend, чтобы визуальный переход происходил до старта проверки.
- Во время сканирования кнопка `Проверить` переключается в `Отменить` и прерывает текущую проверку.
- В шапке отображается число найденных `COMPONENT`/`INSTANCE` в выделении.

### Подготовка примеров для генерации

В меню `Настройки` доступно отдельное действие `Подготовить пример`. Оно не запускает аудит и не меняет состояние вкладок или текущий отчёт. После нажатия Apollo открывает модальное окно со следующими настройками:

- название и стабильный `exampleId`;
- общий `exampleSetId` для responsive-вариантов одной страницы и подпись breakpoint, например `alfa-komandirovki` + `768` / `1600`;
- тип страницы: форма, лендинг, список данных, детальная страница, статусный экран, дашборд или другое;
- платформа `Desktop`, `Mobile Web`, `iOS` или `Android`;
- роль примера: эталонный, допустимый вариант или антипример;
- ссылка на исходник Figma. Apollo пытается подставить её из окружения, но поле можно заполнить вручную, если Figma runtime не сообщает `fileKey`;
- явное согласие на включение текстового содержимого. По умолчанию тексты исключены, чтобы не экспортировать продуктовые данные.

Перед запуском нужно выделить ровно один корневой `FRAME` или `SECTION`. Apollo скачивает файл `<exampleId>.generation-example-candidate.json` со статусом `runtime-candidate`. В него входят:

- источник и deep link на выделенный узел; при отсутствии runtime `fileKey` он восстанавливается из указанной Figma-ссылки;
- `runtime.dimensions` с размерами корня, viewport/content-семантикой и компактная композиция структурных слоёв и component instances;
- component keys и явный `referenceKind`: `contract-package`, `catalog-resource` или `unresolved`. Иконки, логотипы и изображения из известных каталогов не считаются отсутствующими contract packages;
- variant properties, layout, variable bindings и читаемые названия variable collections/modes. Повторяющиеся mode-контексты дедуплицируются в `resources.variableModeContexts`, а ноды хранят только ссылки на них;
- опциональные текстовые примеры;
- компактное evidence последнего аудита только при совпадении identity выделенных узлов и платформы; basis явно сохраняется как `selection-node-ids+platform`, а `categoryCounts` показывает состав проблем по категориям.

Текущая схема кандидата — `apollo.generation-example-candidate.v2`. Если подходящей проверки не было, `runtime.validation.status` равен `not-run`; Apollo не запускает проверку скрыто. Даже результат со статусом `passed` остаётся кандидатом и требует ручного review. Плагин владеет только разделом `runtime`: он не пишет в `manual`, не объявляет пример approved и не изменяет agent artifacts. Promotion в публичный генерационный контракт остаётся отдельным процессом авторов дизайн-системы и Athena CLI.

## Ограничения и известные проблемы
- Плагин сканирует только видимые узлы: скрытые ветки отбрасываются ещё на этапе обхода.
- Если remote reference list с GitHub Pages недоступен, Apollo не использует bundled fallback и показывает ошибку загрузки справочников.
- Если внутри remote reference list есть устаревшие или битые пути до token/style каталогов, Apollo сейчас логирует ошибку каталога и продолжает с доступными данными; component-каталоги подгружаются строго через indexes.
- Репозиторий `Ackedze/design-system_ab` и опубликованный GitHub Pages слой могут быть временно рассинхронизированы после push.
- В проекте есть штатный `type-check`, но нет полноценного интеграционного test-suite для Figma runtime.
- Для themization-flow есть точечный regression-check `npm run test:themization`, который проверяет platform-aware counterpart lookup и variant matching на JSON-каталогах `Button` и `Tag`, но он не заменяет интеграционные проверки в Figma.
- Для forced categories, allowlist-кастомизаций, nested reference-resolution, variable binding evidence и retryable `componentKey` cache есть набор точечных regression-check’ов: `npm run test:audit-policies`, `npm run test:allowed-customizations`, `npm run test:component-key-cache`, `npm run test:customization-filters`, `npm run test:nested-variants`, `npm run test:item-spacing-diff`, `npm run test:variable-binding-evidence`, `npm run test:variant-structure-paths`, `npm run test:snapshot-tree`. Они проверяют forced audit categories, platform-aware themization visibility, declarative allowlist, binding-first layout diff, inherited mode ownership, nested variant-switch suppression, variant-aware reference resolution и кейсы с повторным key-resolve для nested instances, но не заменяют интеграционные проверки в Figma.

Подробный технический отчёт по найденным рискам хранится в [`AUDIT.md`](./AUDIT.md), но перед использованием стоит учитывать, что этот файл частично устарел и не полностью отражает текущее состояние проекта.

## Локальная статистика проверок

После каждой успешно завершённой проверки Apollo формирует полный JSON-отчёт и компактный агентский JSON-отчёт, затем автоматически отправляет оба файла в production Edge Function:

```text
POST https://dwjnndpxzqizrcwpasrs.supabase.co/functions/v1/apollo-stats
```

Отчёты сохраняются в:

```text
Ackedze/design-system_stats/apollo/stats/<figma-user>/dd-mm-yyyy/
```

Полный отчёт содержит все категории аудита, включая устаревшие компоненты и стили, кастомные стили, обновления, кастомизации, локальные и detached-компоненты, пресеты, технические и актуальные компоненты, ошибки канала и темизации. Актуальные компоненты используются как инвентаризация и не входят в общий счётчик проблем. Агентский отчёт получает суффикс `_agent.json`, не включает `currentComponents.items`, фильтрует `expected`/`allowed` кастомизации и предназначен для ручной передачи корпоративному агенту.

Пользователю плагина не нужны GitHub token, Supabase-аккаунт, локальный сервис или дополнительная настройка. GitHub token хранится только в Supabase secret и запрещён в `src`, `manifest.json`, build-конфиге и собранном plugin bundle. Ошибка загрузки статистики не прерывает аудит.

Локальный `services/apollo-stats-collector` сохранён только как инструмент разработки и не используется production-сборкой Apollo.

Каталоги и indexes загружаются только из `Ackedze/design-system_ab`. Локальный каталог `JSONS` в репозитории Apollo не используется.

## Внешний контрибьютинг

Apollo принимает внешние изменения через fork и pull request. Прямые изменения `main` не являются штатным способом разработки.

- Полный процесс подготовки изменения описан в [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Уровни риска, требуемые approvals и критерии code review заданы в [`docs/REVIEW_POLICY.md`](./docs/REVIEW_POLICY.md).
- Автоматические и ручные Figma-проверки описаны в [`docs/TESTING.md`](./docs/TESTING.md).
- Уязвимости передаются приватно по правилам [`SECURITY.md`](./SECURITY.md).
- `CODEOWNERS` требует участия владельца Apollo, а workflow `Review policy` требует один approval для R0/R1 и два актуальных approvals для R2/R3.
- Каждый PR обязан пройти `npm run validate`, содержать regression coverage для исправлений и раскрывать использование AI.
- Плановые Dependabot version updates отключены, чтобы не создавать массовые PR без продуктового контекста. Автоматически создаются только security updates; обычное обновление зависимостей выполняется отдельной согласованной задачей.

Внешним контрибьюторам не нужны release credentials и доступ к пользовательской статистике. Изменения каталогов и cross-repo contracts оформляются отдельно в Athena/design-system_ab и связываются с Apollo PR.

## Структура проекта
- [`src/code.ts`](./src/code.ts) — основной runtime плагина.
- [`src/ui.html`](./src/ui.html) — интерфейс и клиентская логика панели.
- [`src/ui-app`](./src/ui-app) — React-компоненты и bridge для нового UI-хрома.
- [`src/reference`](./src/reference) — загрузка и нормализация reference-каталогов.
- [`src/structure`](./src/structure) — snapshot и diff.
- [`src/services`](./src/services) — подготовка представлений для UI.
- [`src/stats`](./src/stats) — формирование и отправка локальных отчётов проверок.
- [`src/utils`](./src/utils) — вспомогательные утилиты.
- [`scripts/fixtures`](./scripts/fixtures) — компактные JSON-fixtures для regression-checks.
- [`scripts`](./scripts) — точечные regression-checks и отчётные скрипты.

## Сборка и запуск

### Установка
```bash
cd Apollo
npm install
```

`node_modules` не хранится в git и игнорируется репозиторием. Если зависимости отсутствуют, `npm run build` автоматически выполнит `npm install` перед сборкой. Первый запуск после clone, cleanup или ручного удаления `node_modules` может занять дольше обычного.

### Сборка
```bash
npm run build
```

Команда:
- при необходимости автоматически восстанавливает зависимости через `npm install`;
- собирает `dist/code.js` через `esbuild`;
- копирует [`src/ui.html`](./src/ui.html) в `dist/ui.html`.

### Watch-режим
```bash
npm run watch
```

### Type-check
```bash
npm run type-check
```

### Точечная проверка themization
```bash
npm run test:themization
```

Скрипт проверяет:
- что `[D][Corporate]` и `[M][Corporate]` резолвятся в base-компоненты своей платформы;
- что corporate/base-замена для `Tag` использует корректный base-variant при различии variant schema;
- что `Button` по-прежнему матчится по exact variant name.

### Точечные проверки кастомизаций и diff
```bash
npm run test:audit-policies
npm run test:allowed-customizations
npm run test:component-key-cache
npm run test:customization-filters
npm run test:nested-variants
npm run test:item-spacing-diff
npm run test:variable-collection-id
npm run test:variant-structure-paths
npm run test:snapshot-tree
npm run test:stats-report
npm run test:surface-context
npm run test:generation-example-candidate
```

Скрипты проверяют:
- forced audit categories для technical/deprecated-библиотек и скрытие `Темизации` для `iOS`/`Android`;
- декларативные allowlist-правила для разрешённых nested и direct override-сценариев;
- retry cached-missing `componentKey` для nested instances, если первый lookup временно вернул `null`;
- policy-based suppression для host-controlled nested color и typography overrides;
- variant-aware nested reference resolution по `SelectedState`, `Type`, `View` и `Preset`;
- suppression для root-level nested variant switch внутри одной component family;
- отсутствие ложных `itemSpacing` diff-ов для проблемных variant-комбинаций;
- корректную привязку reference-структуры к выбранному variant path;
- сохранение `id/parentId/visible` в actual snapshot, от которых зависит корректный layout diff.
- формирование статистического отчёта, обязательные категории, resource metadata и исключение актуальных компонентов из счётчика проблем.
- определение ближайшей white/gray surface по variable token или SOLID-цвету и безопасный `unknown` без догадок.
- разбор remote/local variable collection id и восстановление читаемых collection/mode labels из token-каталогов;
- формирование изолированного `generation-example-candidate.v2`, компактизацию composition tree, responsive metadata, source-link fallback, классификацию contract/catalog/unresolved ресурсов, дедупликацию variable mode contexts, privacy-default для текста и точное сопоставление audit evidence.

### Отладка аудита
Trace mode включается через `pluginData`-флаг `apollo.debug.audit`.

Если нужно включить его из UI/bridge, backend поддерживает сообщения:
- `get-debug-audit`
- `set-debug-audit` с payload `{ enabled: true | false }`

При активном trace mode Apollo пишет structured-логи `[Apollo][trace] ...` по reference-resolution и nested expansion. Метрики preload и audit-phase всегда пишутся как `[Apollo][metrics] ...`.
Trace также покрывает решения `allowed-customization`, `skipped-check`, `forced-category` и `category-subtree-skipped`, чтобы было видно, почему компонент попал в `Технические`/`Устаревшие`, почему diff был разрешён или почему конкретная проверка вообще не запускалась.
Временные targeted trace-блоки для отдельных компонентных кейсов в runtime не используются: диагностика идёт через общий trace mode.

### Поиск подозрительных nested overrides
```bash
npm run report:nested-overrides
```

Скрипт делает грубый локальный проход по component-каталогам из `shared/design-system_ab/JSONS` и печатает кандидатов на host-controlled nested overrides. Альтернативный путь задаётся через `APOLLO_JSONS_ROOT`. Это не финальный source of truth, а быстрый способ находить новые семейства кейсов до ручной проверки в Figma.

## Как подключить в Figma
1. Соберите проект через `npm run build`.
2. В Figma откройте `Plugins` → `Development` → `Import plugin from manifest...`.
3. Укажите [`manifest.json`](./manifest.json) из текущей папки проекта.

## Полезные команды
```bash
npm run build
npm run watch
npm run type-check
npm run test:themization
npm run test:customization-filters
npm run test:nested-variants
npm run test:item-spacing-diff
npm run test:variant-structure-paths
npm run test:snapshot-tree
npm run test:stats-report
npm run report:nested-overrides
```
