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
1. Загружает основной manifest reference-каталогов и подключённые им catalog manifests с GitHub Pages.
2. Загружает базовые token- и style-справочники.
3. Обходит всё видимое поддерево внутри текущего выделения и собирает `componentKey`.
4. По component indexes определяет только нужные component-каталоги и скачивает их лениво.
5. Классифицирует найденные `COMPONENT` и `INSTANCE`.
6. Для связанных компонентов собирает snapshot структуры и считает diff относительно reference.
7. Отправляет в UI готовые списки для табов, позволяет перейти к нужному слою через `focus-node` и показывает безопасные действия для findings с однозначной целью.

Если запрос списка reference-источников целиком не удался, Apollo останавливает загрузку справочников и показывает ошибку. Bundled fallback больше не используется, чтобы не скрывать рассинхрон runtime-данных и component indexes.

Основной bootstrap остаётся в `Ackedze/design-system_ab`, а тяжёлые Android/iOS ABM-каталоги и их indexes публикуются из `Ackedze/desing-system_abm`. Bootstrap подключает ABM через `catalogManifests`; каждый дочерний manifest задаёт собственный абсолютный `baseUrl`. Apollo объединяет источники только после строгой проверки всех manifest-файлов и блокирует загрузку при дубликате catalog path или недоступном обязательном дочернем manifest.

Важно: Apollo работает с component-каталогами через index-only lazy loading. После первой проверки он не должен скачивать все component-каталоги подряд. Reference manifest schema v2 обязан явно содержать `source.indexPath` для каждого component-каталога; отсутствующий или недоступный index останавливает проверку, а не включает inferred fallback.

Component contracts загружаются только через `componentContractIndex.json` schema v2. Индекс задаёт явную политику покрытия `required | optional | none`; обязательные пакеты должны объявлять `generatedContract`, `rules` и `composition`, а поиск пакета выполняется в порядке Figma key, source catalog path, уникальный alias. Дубликаты и двусмысленные alias считаются ошибкой данных. Текущий архитектурный бэклог зафиксирован в [`docs/ARCHITECTURE_BACKLOG.md`](./docs/ARCHITECTURE_BACKLOG.md).

Runtime contract pipeline разделён на независимые слои. [`src/contracts/contractTransport.ts`](./src/contracts/contractTransport.ts) отвечает только за fetch, JSON parse, URL resolution и cache-busting. [`src/contracts/contractIndexResolver.ts`](./src/contracts/contractIndexResolver.ts) детерминированно разрешает package по Figma key, source catalog path или уникальному alias и строит безопасные artifact paths. [`src/contracts/contractArtifactCompiler.ts`](./src/contracts/contractArtifactCompiler.ts) компилирует public rules, composition, overrides, agent context, audit mapping и examples. [`src/contracts/runtimeContractRegistry.ts`](./src/contracts/runtimeContractRegistry.ts) остаётся совместимым фасадом, а lifecycle загрузок управляется общим автоматом состояний.

[`src/contracts/componentApiContracts.ts`](./src/contracts/componentApiContracts.ts) компилирует `contract.generated.json` в целевой Component API и детерминированно проверяет public variant properties, их значения и разрешённые комбинации. Нарушения проходят через обычный `DiffEntry`/`CustomizationAssessment`, поэтому одинаково отображаются в UI, полном отчёте и agent report. Runtime принимает целевую схему `apollo.ds-contracts.v1` и один явно описанный migration-format `component-contract-generated` schema 1; к сырым каталогам при ошибке компиляции не откатывается. Регрессия компилирует все пакеты текущего `componentContractIndex`.

`AmountStyles` использует общий `sharedValueConstraint`: Apollo сравнивает фактические значения видимых leaf-слоёв одного instance, не создавая дублирующие findings. Единая ручная перекраска `Operation/Minus/Major/Minor/Currency` остаётся `Expected`, а частичная перекраска становится нарушением; `Addon` не входит в группу. Ручные text style, opacity `Minor/Currency` и геометрия внутренних частей оцениваются как точные component-contract violations относительно effective baseline выбранного `Style`.

Полная совместимость артефактов релиза проверяется локальным snapshot в [`scripts/fixtures/release-snapshot.json`](./scripts/fixtures/release-snapshot.json). Интеграционный тест [`scripts/test-release-snapshot.js`](./scripts/test-release-snapshot.js) прогоняет fixture через реальные reference и contract runtime API: bootstrap manifest, pattern rules, composition contracts, token/style catalogs, component index, lazy component catalog, contract index, required package artifacts и examples. Тест требует, чтобы каждый файл snapshot был достижим из bootstrap manifest.

## Табы аудита
Конфигурация табов хранится в [`src/config/tabs.ts`](./src/config/tabs.ts).

- `Темизация` — page-level mode `Theme / Corp` и случаи использования `[Corporate]`-компонентов.
- `Не тот канал` — компоненты, не соответствующие каналу, выбранному в channel picker (`Desktop`, `MobileWeb`, `iOS`, `Android`).
- `Технические` — helper-компоненты из технических библиотек, которые Apollo помечает без deep-аудита.
- `Устаревшие` — компоненты со статусом `deprecated`.
- `Устаревшие стили` — style findings, собранные отдельно от component relevance.
- `Кастомные стили и токены` — узлы с локальными fill/stroke/effect и однородной отвязанной типографикой без корректной токенизации или style-binding.
- `Пора обновить` — компоненты со статусом `update`/`changed` и независимо размещённые remote instances, для которых Figma отдаёт более свежую опубликованную версию. Нативная свежесть определяется read-only: Apollo повторно импортирует компонент по стабильному `componentKey` и сравнивает id текущего `mainComponent` с id последней опубликованной версии; импорт кэшируется по ключу на время проверки. Instance-sublayer внутри другого экземпляра не считается самостоятельной точкой обновления и не попадает в эту категорию.
- `Кастомизации` — инстансы со значимыми diff-ами относительно reference.
- `Локальные компоненты` — components без official reference Apollo. Сюда входят нативные локальные components (`mainComponent.remote === false`) и экземпляры из пользовательских/неофициальных remote libraries, ключи которых отсутствуют в reference-каталогах. Наличие стабильного Figma key само по себе не делает компонент официальным библиотечным.
- `Детач` — `FRAME`/`GROUP`, у которых есть `detachedInfo` из библиотеки.
- `Пресеты` — инстансы компонентов, помеченных через `🔒`.
- `Актуальные компоненты` — компоненты со статусом `current`.

Важно: если компонент попал в `Не тот канал`, он не показывается в `Актуальных компонентах`, даже если его reference-статус сам по себе `current`.
Важно: карточка с подписью `Доступна новая версия` означает нативный Figma library update независимо размещённого экземпляра, а не lifecycle-статус Athena. Вложенные instance-sublayer обновляются через владеющий ими экземпляр и не создают отдельные карточки. Ошибка импорта или отсутствие доступа дают диагностическое состояние `unknown` и не переводят компонент в `Пора обновить`. Apollo не изменяет макет во время проверки; обновление выполняется только после явного нажатия `Обновить`.
Важно: если выбранный макет использует локальный или незарегистрированный пользовательский компонент, Apollo добавляет его в локальную инвентаризацию до shell/forced-category фильтров, один раз открывает исходный `ComponentNode` и проверяет самостоятельно размещённые library instances внутри определения. Remote source разрешается обходить только для такого незарегистрированного корневого owner; найденные внутри официальные remote instances остаются границами и повторно не обходятся. Поддерживается выбор как instance, так и самого `ComponentNode`. Для Slot/flattened-содержимого исходный owner восстанавливается по instance-sublayer ID только после проверки фактического ancestor `COMPONENT`. Карточки обновлений содержат подпись `внутри <компонент-владелец>` и ведут к source-узлу; повторные экземпляры owner не дублируют findings.
Source-аудит дедуплицирует owner definitions по стабильному component key и проверяет собранные dependency boundaries пулом из четырёх workers. Вложенные локальные и незарегистрированные owners сохраняются в аудите, чтобы не терять их реальные устаревшие зависимости; повторные occurrences одного owner не создают повторный source-обход. Порядок findings сохраняется исходным. Метрика `local-component-dependency-audit` содержит длительность фазы, количество owners/source nodes/dependencies, уникальные ключи и cache hit/miss импорта.
Для source update finding Apollo хранит отдельный navigable `focusNodeId`: каждая source dependency остаётся отдельной карточкой и фокусирует собственный rendered instance-sublayer внутри первого найденного owner occurrence, а при отсутствии соответствия — сам owner instance. Variant name отличает одноимённые компоненты с разными ключами. Source findings и уже найденные update findings сводятся атомарно: detached и local-instance пути сохраняют одинаковое количество occurrences, каждому finding назначается отдельная цель фокуса, а итоговые категории `Пора обновить` и `Актуальные компоненты` проверяются на взаимное исключение. Provisional instance-sublayer с подтверждённым component key удаляются из `Актуальных компонентов` только внутри occurrences соответствующего локального owner; независимый свежий экземпляр с тем же key остаётся актуальным.
Важно: для `iOS` и `Android` таб `Темизация` скрывается полностью, а сама themization-проверка не запускается даже в фоне.
Важно: компоненты из `Web :: Core Helpers` и `Web :: Corp Helpers` принудительно попадают в `Технические`, а компоненты из `Web :: Old Core Default Components` и `❌ Web :: DEPRECATED CORP (не подключать)` — в `Устаревшие`.

## Как устроен аудит

### Основной поток
- [`src/code.ts`](./src/code.ts) служит composition root: показывает UI, связывает runtime-зависимости и запускает `runAudit`.
- [`src/plugin/messageRouter.ts`](./src/plugin/messageRouter.ts) владеет протоколом сообщений между UI и plugin runtime, но не зависит от глобального Figma API.
- [`src/actions/focusNode.ts`](./src/actions/focusNode.ts) отвечает за поиск фактической страницы слоя, переключение страницы и фокус viewport.
- [`src/actions/pageThemizationAction.ts`](./src/actions/pageThemizationAction.ts) валидирует и применяет явный `Corp` mode коллекции `Theme` на странице. Если пользователь нажал `Сменить`, пока предыдущий аудит ещё завершает подготовку статистики, повторная проверка ждёт idle-state через [`src/services/auditLifecycle.ts`](./src/services/auditLifecycle.ts), поэтому finding не остаётся в UI из-за отклонённого параллельного `runAudit`.
- [`src/actions/corporateComponentAction.ts`](./src/actions/corporateComponentAction.ts) заменяет `[Corporate]`-инстанс на базовый counterpart, подбирает совместимый variant и восстанавливает одноимённые component properties после swap.
- [`src/remediation/findingActionRegistry.ts`](./src/remediation/findingActionRegistry.ts) хранит исполняемые действия и runtime-ссылки на посещённые instance-sublayers только до следующей проверки. UI получает непрозрачный `actionId`, сами Figma nodes не сериализуются, а plugin runtime перед мутацией повторно проверяет source component/style identity.
- [`src/remediation/findingActionResolver.ts`](./src/remediation/findingActionResolver.ts) добавляет действия только для проверенных целей: native library update, опубликованный `[D]/[M]` counterpart, явная component/style migration или точное совпадение solid paint style. Если одному raw fill/stroke соответствуют несколько активных library styles, UI показывает каждый вариант вместе с библиотекой и ничего не выбирает автоматически. Для каждого action сохраняется fingerprint исходного paint; перед binding Apollo повторно проверяет и слой, и импортированный library style, поэтому устаревшая карточка не может перезаписать изменённый цвет.
- Если component diff однозначно содержит `unbound` raw paint и reference binding на COLOR variable, custom-style карточка предлагает привязать актуальный reference token. Reverse index сравнивает полный RGBA: `paint.opacity` отвязанного solid paint сопоставляется с `a` фактического значения токена, поэтому прозрачные и непрозрачные цвета не смешиваются. При binding ручная paint opacity нормализуется до `1`, так как альфа уже принадлежит токену и не должна применяться повторно. Deprecated paint-style catalogs не используются как target; токен импортируется по стабильному key, а node/style/fingerprint повторно проверяются перед мутацией.
- Для `TEXT` с `figma.mixed` Apollo сравнивает fingerprints отдельных styled ranges. Токен предлагается и применяется ко всем диапазонам только при единственном одинаковом paint fingerprint; разноцветный rich text остаётся без массового действия.
- Однородный `TextNode` без известного библиотечного text style создаёт один finding `Типографика`. Apollo сопоставляет `fontSize + fontName.style + lineHeight + numbers style` с опубликованными text styles из style-каталогов. Tabular numbers определяются по OpenType feature `TNUM` на слое и нормативной группе `Mono`/признаку `monospaceNumbers={true}` в каталоге. Один кандидат получает прямое действие, несколько — общий candidate dropdown. Перед применением повторно проверяются текущий style id и полный typography fingerprint; rich text с разными значениями остаётся fail-closed.
- При назначении typography style Apollo сначала создаёт whole-node binding, а при отказе или no-op Figma использует full-range fallback. После мутации фактический `textStyleId` обязательно проверяется; уведомление об успехе невозможно без подтверждённого node- или range-binding. Совпадающий с целевым стилем `textCase`/capslock не записывается повторно, иначе Figma снимает binding. Если явный регистр слоя отличается от target style, действие блокируется до мутации: Figma не поддерживает `textCase` как text-style override. Отличающийся `textDecoration` восстанавливается как поддерживаемый override. Список шрифтов из Figma API всегда копируется перед добавлением target font, так как runtime может вернуть frozen array.
- Текст внутри официального `Web _ Core / Status` исключён только из проверки отвязанной типографики. Компонент намеренно управляет регистром через nested `🔩 Label` variant `Uppercase=True/False`, поэтому отсутствие `textStyleId` там является частью реализации, а не нарушением. Scope задаётся удалённым `JSONS/apollo/auditPolicies.json`: правило использует стабильные component keys и строгую ancestry-последовательность `Status → 🔩 Label → Label` для схлопнутых instance sublayers. Одноимённые пользовательские слои не исключаются, проверки цвета и кастомизаций продолжают работать. Изменение policy после публикации не требует пересборки Apollo.
- Для `[D]/[M]` действия instance variant заменяется только на variant противоположного канала с точно совпадающими properties; общий ключ component set не используется как swap target.
- [`src/actions/findingAction.ts`](./src/actions/findingAction.ts) исполняет зарегистрированное действие и запускает idle-safe повторный аудит. Component swap использует Figma override-preserving `swapComponent`, style binding использует async style setters.
- [`src/actions/customizationResetAction.ts`](./src/actions/customizationResetAction.ts) валидирует reset payload, применяет variant remediations и координирует idle-safe повторный аудит. Низкоуровневые операции со styles, paints, layout, radius, opacity и variable bindings изолированы в [`src/actions/customizationResetMutations.ts`](./src/actions/customizationResetMutations.ts); перед binding узел повторно разрешается по id, поэтому удалённый instance-sublayer не приводит к необработанному Figma API exception.
- [`src/services/auditLifecycle.ts`](./src/services/auditLifecycle.ts) владеет состояниями `idle/running/cancelling`, атомарно отклоняет параллельный запуск, передаёт cooperative cancellation в traversal и освобождает ожидающие повторные проверки только после finalize.
- [`src/services/asyncResourceLifecycle.ts`](./src/services/asyncResourceLifecycle.ts) задаёт единый автомат `idle → loading → ready | failed` для reference bootstrap, component indexes, contract index и package artifacts. Он дедуплицирует параллельные загрузки, задаёт явную retry policy и блокирует commit устаревшего результата после reset/reconfigure через generation guard.
- [`src/remediation/remediationConfig.ts`](./src/remediation/remediationConfig.ts) загружает `JSONS/apollo/remediations.json`. Явные replacement keys можно менять и публиковать без пересборки Apollo. Для безопасного поэтапного rollout отсутствие `apollo.remediationConfigPath` отключает только declarative actions; объявленный, но недоступный или невалидный конфиг блокирует bootstrap.
- [`src/policies/auditPolicyConfig.ts`](./src/policies/auditPolicyConfig.ts) загружает `JSONS/apollo/auditPolicies.json`. Raw-typography исключения обязаны иметь точное имя text node и scope по component keys или ancestry path; неограниченные и дублирующиеся правила отклоняются валидатором.
- [`src/services/auditTraversalContext.ts`](./src/services/auditTraversalContext.ts) создаёт изолированный контекст одного запуска: component/reference/local-context caches, множество уже проверенных узлов, freshness checker и options для style-аудита. Между аудитами mutable state не переиспользуется.
- [`src/services/auditTreeTraversal.ts`](./src/services/auditTreeTraversal.ts) выполняет Figma-independent depth-first обход с едиными правилами visibility, pruning поддеревьев и cooperative cancellation; предметный visitor остаётся отдельным от механики рекурсии.
- [`src/services/auditTargetCollector.ts`](./src/services/auditTargetCollector.ts) владеет предметным Figma visitor, агрегацией категорий, регистрацией локальных owner definitions и запуском source dependency audit. Правила категорий вынесены в чистую функцию и отдельно проверяют взаимное исключение `Пора обновить`/`Актуальные компоненты`, forced-category routing и отсутствие дублей между каналами.
- [`src/services/auditResults.ts`](./src/services/auditResults.ts) преобразует `CheckState` в единый набор UI/stats views и готовит full/agent reports. UI и статистика используют одни и те же отфильтрованные категории, поэтому локальные исключения и список кастомизаций не расходятся между отображением и выгрузкой.
- [`src/services/localComponentDependencyAudit.ts`](./src/services/localComponentDependencyAudit.ts) владеет source-обходом локальных owner definitions, классификацией remote dependency boundaries, concurrency, shell-фильтрацией, reconciliation `Пора обновить`/`Актуальные компоненты` и итоговой метрикой. Composition root передаёт только Figma-доступ и текущие occurrence IDs.
- [`src/services/componentClassifier.ts`](./src/services/componentClassifier.ts) владеет основным pipeline одного компонента: reference resolution, freshness, snapshot/diff, suppression, assessment, semantic collapse, contract-aware filtering и итоговым relevance decision. Component-key, token metadata и diagnostics передаются через явный dependency contract.
- [`src/services/nestedReferencePreparation.ts`](./src/services/nestedReferencePreparation.ts) выравнивает snapshot paths и материализует reference вложенных instance с host-controlled baseline и occurrence-aware merge; этот алгоритм больше не связан с plugin composition root.
- `runAudit` подгружает каталоги, создаёт изолированный traversal context, передаёт runtime-зависимости в `collectAuditTargets` и публикует результат через единый result service.
- `classifyComponentNode` ищет `componentKey`, находит reference, при необходимости строит snapshot (`snapshotTree`) и считает diff (`diffStructures`); composition root не содержит логики классификации компонента.
- Для preload и основного diff-phase Apollo пишет служебные метрики в консоль с префиксом `[Apollo][metrics]`.
- Для отладки reference-resolution есть штатный trace mode с префиксом `[Apollo][trace]`.
- при загрузке style catalogs Apollo пересобирает lookup-карты заново, поэтому новые или только что добавленные paint/effect styles корректно участвуют и в `Кастомизации`, и в `Кастомных стилях`.
- Результаты складываются в `CheckState`, после чего UI получает компактный `scan-result` только с актуальными `visibleViews` и кратким `summary`; legacy-дубли payload из старого bridge-контракта удалены.

### Сервисы и модели
- [`src/services/auditViewBuilder.ts`](./src/services/auditViewBuilder.ts) собирает detached-элементы, кастомные стили и текстовые узлы.
- [`src/contracts/runtimeContractRegistry.ts`](./src/contracts/runtimeContractRegistry.ts) координирует загрузку contract index и package artifacts через отдельные transport, index-resolution и compilation модули; reconfigure сбрасывает lifecycle generation, поэтому завершившийся позже запрос от прежнего source не может перезаписать актуальный registry.
- [`scripts/test-release-snapshot.js`](./scripts/test-release-snapshot.js) служит release-level regression gate: manifest, indexes, catalogs и contract package проверяются одной связной runtime-загрузкой, а не изолированными schema-тестами.
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
Важно: identity text/fill/stroke style определяется по опубликованному Figma style key, то есть без document-local suffix после запятой. Если `S:<key>,<local-id>` отличается только локальным хвостом либо оба id резолвятся в один label, такая пара не считается кастомизацией. Допустимость стиля проверяется независимо: неизвестный библиотечным каталогам style key по-прежнему попадает в `Кастомные стили и токены`.
Важно: в `paint-diff` Apollo не гадает по совпадению цвета. Если у слоя есть явная привязка к токену или стилю, в UI показывается label по id, а если label не найден — сам id. Только при отсутствии привязки показывается фактический цвет: непрозрачный как `#RRGGBB`, полупрозрачный как `rgba(...)`.
Важно: скрытые и полностью прозрачные `fill`-paints игнорируются в actual snapshot так же, как и в reference-нормализации. Это убирает ложные кастомизации, когда в компонентных каталогах есть технические `fills` с `"visible": false`.
Важно: strict comparison не создаёт warning для отсутствующего `radius`, если reference содержит эффективное значение `0`, и не считает actual-радиус кастомизацией, если поле полностью отсутствует в reference-каталоге. Также отсутствие paint или padding у корня actual `INSTANCE`, сопоставленного с reference `COMPONENT`, считается ограничением Figma snapshot, а не ошибкой данных; доступное и реально изменённое свойство по-прежнему попадает в `Кастомизации`.
Для nested instances используется variant-aware reference expansion: Apollo сначала пытается взять nested reference по текущему `componentKey`, а если этого недостаточно, добирает нужный variant по `variantProperties`, чтобы stateful nested-компоненты вроде `Radio_24` не сравнивались с неправильным reference-state.
Важно: при раскрытии nested instances host reference имеет приоритет над standalone reference вложенного компонента. Standalone-структура nested-компонента используется только для дозаполнения отсутствующих путей. Приоритет распространяется и на корень materialized nested instance: если host-каталог явно переопределяет его layout/radius, standalone baseline не может вернуть собственную геометрию. Например, `Button / RightAddon` сохраняет radius `0` из варианта Button вместо radius `4` standalone-компонента Addon.
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
Плагин работает с удалёнными JSON-справочниками напрямую из веток `main` через `raw.githubusercontent.com`. GitHub Pages больше не участвует в runtime-цепочке и может использоваться только как необязательное зеркало:

- bootstrap URL: `https://raw.githubusercontent.com/Ackedze/design-system_ab/main/JSONS/referenceSourcesMVP.json`;
- Web, token/style, contract catalogs и indexes: `https://raw.githubusercontent.com/Ackedze/design-system_ab/main/JSONS/`;
- Android/iOS ABM catalogs и indexes: `https://raw.githubusercontent.com/Ackedze/desing-system_abm/main/JSONS/` через дочерний manifest;
- декларативные правила кастомизаций: путь `apollo.patternRulesPath` из основного списка, сейчас `JSONS/apollo/patternRules.json`;
- token/style каталоги: пути из этого списка;
- component catalogs: загружаются только по component indexes для ключей, найденных в проверяемом выделении;
- разрешённые домены описаны в [`manifest.json`](./manifest.json).

При старте Apollo загружает manifest, catalogs, indexes, contracts и pattern rules с process-scoped cache-busting query-параметрами, затем валидирует `schemaVersion` и структуру каждого правила. Это исключает чтение предыдущей версии raw CDN после публикации. После публикации изменённого JSON достаточно перезапустить плагин: пересборка Apollo не требуется. Отсутствующий или некорректный конфиг считается ошибкой reference bootstrap; встроенного fallback с устаревшими правилами нет.

Такое разделение позволяет Apollo получать новую маршрутизацию и каталоги сразу после появления commit в `main`, независимо от очереди GitHub Pages deployment. Runtime-аудит зависит от доступности raw catalog/index URL из manifest. `npm run build` не публикует JSON-каталоги, indexes или pattern rules и не скачивает их автоматически, а только собирает плагин.

Компонент с Figma key, отсутствующим в текущих indexes, получает статус `unknown`, но не считается локальным автоматически. В категорию `Локальные компоненты` попадают только узлы, для которых Figma API вернул локальный `ComponentNode` с `remote=false`.

Для COLOR variables Apollo не требует отдельного удалённого value index. Обязательные token-каталоги Athena содержат `actualValuesByMode`; после bootstrap Apollo один раз строит компактный reverse index `RGB -> token candidates` в памяти. Для отвязанного однородного solid fill/stroke предлагаются только опубликованные COLOR variables с подходящим scope. Один кандидат отображается сразу с кнопкой `Привязать`, несколько кандидатов выбираются через общий dropdown Apollo на компонентах `PickerButton`, `OptionList` и `OptionListCell`; reference token компонента имеет приоритет. Dropdown рендерится поверх результатов и не меняет геометрию карточки. Перед binding Apollo повторно проверяет fingerprint слоя и импортирует variable по стабильному key. Каталоги старого формата поддерживают только direct COLOR values, поэтому semantic alias-кандидаты появляются после повторной публикации новой Athena.

Если для действительно кастомного значения подходящих токенов нет, карточка `Кастомные стили и токены` остаётся компактной: Apollo не рисует пустой разделитель и не резервирует место под отсутствующие действия.

Dropdown кандидатов цвета и типографики использует общий `OptionListCell`, но варианты отображаются без декоративной leading icon: в этом контексте значимы название токена/стиля и библиотека.

Все finding actions используют компактную высоту 20 px. Dropdown-кнопка является compact-вариантом `PickerButton`, а подпись результата в `ResultSubCard` вертикально центрируется относительно action-кнопки.

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

Публикация в `main` должна быть атомарной относительно этого комплекта: Athena создаёт один scoped commit, выполняет push и сверяет SHA-256 manifest и изменённых файлов через raw URL. Apollo не должен получать новый каталог со старым index, старые rules с новым agent-context или composition contract без соответствующего component catalog.

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
- Интеграция правой колонки начата для audit-like категорий: `Актуальные компоненты`, `Устаревшие`, `Пора обновить`, `Пресеты`, `Локальные`, `Детач`, `Темизация`, `Кастомные стили и токены` и `Кастомизация` уже используют React-bridge и React-карточки.
- В `Кастомизации` diff-ы теперь группируются по узлу: один [`ResultSubCard`](./src/ui-app/components/ResultSubCard.tsx) соответствует одному узлу, а внутри него рендерится одна или несколько property-строк.
- Перед отображением кастомизаций [`CustomizationAssessment`](./src/assessment/customizationAssessment.ts) проверяет diff против materialized host и выбранных variant-структур всех вложенных ancestor-компонентов. Значение получает `Expected`, только если конкретный node/property совпадает хотя бы с одним точным contextual reference; ручное значение, отсутствующее в выбранной конфигурации, не становится Expected.
- Производное изменение descendant-компонента подавляется, если выбранная variant-структура ближайшего ancestor-компонента уже подтверждает фактическое значение. Например, `StatusPreset Size=20` остаётся самостоятельным contextual violation внутри TitleView, а совпадающий с ним nested diff `Status Size=24 → 20` не дублирует нарушение. Если одноимённое свойство родителя транслируется во вложенный компонент, но вложенное значение изменено отдельно (`StatusPreset Size=24`, `Status Size=32`), Apollo показывает нарушение относительно selected-reference родителя. Самостоятельный public variant вложенного компонента не считается host-controlled только из-за совпадения имени свойства: например, `IsleBlock Type=Static` не запрещает выбранный `IsleContent Type=TableContent`.
- Декларативные правила оценки конкретного nested override хранятся вне plugin bundle в `Ackedze/design-system_ab/JSONS/apollo/patternRules.json`. Набор schema v1 содержит 18 правил для ContentCardWrapper, Onboarding Hint/Tooltip, ButtonStack, Status/Property и secondary TabsView. [`patternRules.ts`](./src/assessment/patternRules.ts) содержит только типы, строгую валидацию и evaluator, поэтому изменение набора правил не требует пересборки Apollo.
- Доверенные composition contracts загружаются только из component packages через `componentContractIndex.json`. ButtonsGroup, TitleView и BackgroundPlate хранят исполняемую декларацию в `manual.contracts` собственного `composition-contract.json`; Athena сохраняет ручной слой при синхронизации и публикует его в `apollo-composition-registry.json`. Общий `JSONS/apollo/compositionContracts.json`, bootstrap-path и runtime fallback удалены. Удалённые JSON содержат только декларативные данные; исполняемые функции остаются в доверенном registry Apollo. Schema v1 поддерживает `countBetween`, `propertyDomain`, `valuePosition`, `propertyEqualsHost`, `propertyEqualsFirst` и `subtreePropertyPolicies`. Связь с хостом проверяет `Button.Size` относительно `ButtonsGroup.Size`, а связь с первым участником проверяет совпадение `TitleStatus.Type` с видимым `StatusPreset.Type`. Отсутствующее свойство или источник не создаёт нарушение. Engine учитывает только прямые видимые composition members в document order и формирует `Expected` либо нарушение с безопасной variant-remediation. Matching contract принудительно запускает deep snapshot даже при пустом `InstanceNode.overrides`, потому что Figma не всегда отмечает slot-swap как override родительского instance. Для BackgroundPlate ручные fill/stroke запрещены в Primary и Secondary; Colored разрешает только fill, Border разрешает только stroke. Изменение значений и selectors существующих операций не требует пересборки Apollo; новый тип операции требует кода, теста и новой сборки. Границы пилота зафиксированы в [`docs/DETERMINISTIC_COMPONENT_PILOT.md`](./docs/DETERMINISTIC_COMPONENT_PILOT.md).
- Regression tests composition engine используют локальный ownership-v2 fixture [`scripts/fixtures/composition-contracts.json`](./scripts/fixtures/composition-contracts.json) и не зависят от соседнего checkout `design-system_ab`. Проверку фактических package-файлов и агрегированного registry выполняет Athena через targeted `contracts:check-apollo`.
- Точный runtime assessment имеет приоритет над общим generated component rule. Generated rules сохраняются в статистике как evidence, но не могут заменить `Expected` на violation после проверки выбранного nested variant и `subtreePropertyPolicies`; это защищает разрешённые `Colored/fill` и `Border/stroke` от ложных срабатываний.
- Структурированное error-правило с `requiredPaintState` или `requiredTokenBinding` имеет более высокий приоритет, чем ранее вычисленный generic `Expected`. Поэтому фактический видимый fill у `BackgroundPlate Type=Border` не исчезает из результатов после host-derived оценки, а разрешённый stroke остаётся `Expected`.
- Component-rule evaluator учитывает семантику `requiredTokenBinding` и `requiredPaintState`, а не только severity правила. Поэтому tokenized `Colored/fill` и `Border/stroke` разрешены даже при смене конкретного токена; raw required paint, `Border/fill`, `Colored/stroke` и отклонение от fixed paint baseline `Primary/Secondary` остаются нарушениями. Это работает и при прямой проверке вложенного `Style Level`, когда composition root `BackgroundPlate` не попал в selection.
- Запрет `none-or-not-visible` проверяется по actual snapshot независимо от materialized host diff. Это защищает `BackgroundPlate Type=Border` от ошибочного наследования fill default-варианта в старом каталоге: любой фактически видимый fill создаёт нарушение с baseline `—`. Сброс paint finding с baseline `—` явно очищает `fills`/`strokes` и для stroke обнуляет `strokeWeight`.
- Точное deterministic error-rule имеет приоритет над generic `Expected` из standalone nested catalog. Поэтому внутри `TitleView` значение `StatusPreset Size≠24` и несовместимый с поверхностью `Style` остаются нарушениями, тогда как разрешённый public `Type` продолжает отображаться как `Expected`.
- Строки со статусами `expected` и `allowed` показываются в UI с маркером `Expected`, сохраняются в статистике вместе с причиной assessment и не предлагают действие `Сбросить`.
- Для pattern violation с variant constraint действие `Сбросить` восстанавливает variant property через `InstanceNode.setProperties(...)`, а не копирует визуальные значения другого варианта в текущий instance.
- Производные paint/layout diff-ы запрещённого variant switch сворачиваются в одну семантическую строку вида `view: primary → accent`; независимые ручные изменения внутри того же subtree сохраняются отдельными строками.
- Contextual reference сопоставляет переименованные nested layers по component family key, поэтому пары вроде `Icon` и `🔩 Icon` не теряют host-defined overrides из-за различия display name/path.
- Для штатных nested variant switch декларативное правило может задать `presentation: suppress-derived`. Первое такое правило применяется к `[D]/[M] TagGroup`: визуальные последствия разрешённых `Tag Size/Shape` не выводятся как отдельные Expected-кастомизации, но ручные значения без подтверждения выбранной variant-структурой остаются видимыми.
- Режим `presentation: semantic-variant` сохраняет Expected-настройку, но заменяет производные visual diff-ы одной строкой variant property. Для `[D][Promo] BackgroundPlate` заливка `base-bg-alt/secondary → neutral-translucent/100` отображается как `type: primary → secondary`.
- `Кастомные стили и токены` тоже переведены на React-карточку: в этом табе `caption` заполняется названием стиля, токена или эффекта из `formatCustomStyleReason(...)`.
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
- `CODEOWNERS` требует участия владельца Apollo, а workflow `Review policy` в текущем single-maintainer mode требует один актуальный trusted approval от code owner для любого уровня риска. После назначения второго maintainer порог R2/R3 должен быть возвращён к двум approvals.
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
- сохранение `id/parentId/visible` в actual snapshot, от которых зависит корректный layout diff;
- сохранение видимого non-solid paint (`gradient`, `image` и другие Figma paint-типы), чтобы правила `none-or-not-visible` не пропускали запрещённую заливку.
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
Trace также покрывает решения `allowed-customization`, `allowed-customization-miss`, `paintme-diff-pipeline`, `skipped-check`, `forced-category` и `category-subtree-skipped`, чтобы было видно, почему компонент попал в `Технические`/`Устаревшие`, почему diff был разрешён или почему конкретная проверка вообще не запускалась. Детальные логи `allowed-customization-miss` и `paintme-diff-pipeline` никогда не пишутся по умолчанию и появляются только при включённом `apollo.debug.audit`.
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
