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

Важно: Apollo работает с component-каталогами через index-only lazy loading. После первой проверки он не должен скачивать все component-каталоги подряд; отсутствующий ключ в index логируется как диагностическая проблема данных.

## Табы аудита
Конфигурация табов хранится в [`src/config/tabs.ts`](./src/config/tabs.ts).

- `Темизация` — page-level mode `Theme / Corp` и случаи использования `[Corporate]`-компонентов.
- `Не тот канал` — компоненты, не соответствующие каналу, выбранному в channel picker (`Desktop`, `MobileWeb`, `iOS`, `Android`).
- `Технические` — helper-компоненты из технических библиотек, которые Apollo помечает без deep-аудита.
- `Устаревшие` — компоненты со статусом `deprecated`.
- `Устаревшие стили` — style findings, собранные отдельно от component relevance.
- `Кастомные стили` — узлы с локальными fill/stroke/effect без корректной токенизации или style-binding.
- `Пора обновить` — компоненты со статусом `update`/`changed`.
- `Кастомизации` — инстансы со значимыми diff-ами относительно reference.
- `Локальные компоненты` — узлы, которые не удалось связать с reference-каталогом.
- `Детач` — `FRAME`/`GROUP`, у которых есть `detachedInfo` из библиотеки.
- `Пресеты` — инстансы компонентов, помеченных через `🔒`.
- `Актуальные компоненты` — компоненты со статусом `current`.

Важно: если компонент попал в `Не тот канал`, он не показывается в `Актуальных компонентах`, даже если его reference-статус сам по себе `current`.
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
Важно: для text/fill/stroke style diff в UI используется нормализованный label стиля. Если raw `styleKey` отличаются, но после резолва дают одно и то же имя стиля, такая пара больше не считается кастомизацией.
Важно: в `paint-diff` Apollo не гадает по совпадению цвета. Если у слоя есть явная привязка к токену или стилю, в UI показывается label по id, а если label не найден — сам id. Только при отсутствии привязки показывается фактический цвет: непрозрачный как `#RRGGBB`, полупрозрачный как `rgba(...)`.
Важно: скрытые и полностью прозрачные `fill`-paints игнорируются в actual snapshot так же, как и в reference-нормализации. Это убирает ложные кастомизации, когда в компонентных каталогах есть технические `fills` с `"visible": false`.
Для nested instances используется variant-aware reference expansion: Apollo сначала пытается взять nested reference по текущему `componentKey`, а если этого недостаточно, добирает нужный variant по `variantProperties`, чтобы stateful nested-компоненты вроде `Radio_24` не сравнивались с неправильным reference-state.
Важно: при раскрытии nested instances host reference имеет приоритет над standalone reference вложенного компонента. Standalone-структура nested-компонента используется только для дозаполнения отсутствующих путей.
Важно: если host reference уже содержит явный paint descriptor на descendant-узле, Apollo не заменяет его standalone paint descriptor вложенного компонента. Это сохраняет корректный expected-token для variant-controlled слоёв вроде `Button / Addon / PaintMe`, `FilterTag / Addon|Arrow / PaintMe`, `Tag / Icon|Addon / PaintMe`, `IconButton / Icon / PaintMe`, `ActionButton / Bg / PaintMe` и `CompactTag / Arrow / PaintMe`.
Важно: suppression для host-controlled nested properties применяется только к diff-ам, построенным от standalone nested reference. Если diff построен от host reference, ручное изменение остаётся видимым как кастомизация.
Важно: `Button / Addon / PaintMe`, `FilterTag / PaintMe`, `Tag / PaintMe`, `IconButton / PaintMe`, `ActionButton / PaintMe` и `CompactTag / PaintMe` не входят в allowlist разрешённых recolor-кастомизаций. Цвет задаётся variant-controlled host reference и ручное изменение должно попадать в `Кастомизации`.
Важно: если parent nested materialization уже несёт host-controlled paint, более глубокий standalone nested reference не затирает это значение. Например, `TitleView → FilterCompanySelect → CompactTag → Arrow / PaintMe` сравнивается с expected из `TitleView/FilterCompanySelect`, а не со standalone `FilterTag / Arrow`.
Важно: если policy-карта ещё не знает inner variant key, Apollo дополнительно сохраняет parent-reference для component-qualified путей вида `[D] CompactTag / Arrow / Fixer / PaintMe`. Это не allowlist: ручная перекраска всё равно остаётся кастомизацией, но expected берётся из более специфичной сборки.
Важно: ложные кастомизации для nested overrides теперь подавляются универсально, если reference-каталоги показывают, что хост-компонент управляет свойством вложенного компонента. Сейчас policy покрывает не только `fill/stroke`, `BgColor` и `Border`, но и nested `typographyToken`/`text style`.
Важно: отдельный suppression введён и для root-level nested variant switch. Если на одном и том же path actual и reference указывают на разные variant keys одной и той же component family, Apollo больше не считает это кастомизацией layout/property самого вложенного узла.
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
- Root-level nested variant switch внутри одной component family не считается кастомизацией layout самого вложенного инстанса.
- Для stateful nested-компонентов reference теперь резолвится по `variantProperties`, чтобы `SelectedState/Type/View/Preset` не подменялись дефолтным variant.
- `itemSpacing` сравнивается только для контейнеров, где spacing реально влияет на layout.
- Linked instances внутри local-component context не пропускаются даже без direct overrides на внутреннем инстансе.
- Системные allowlist-правила покрывают семейства nested override-кейсов вроде `Status`, `Amount`, `PaymentMaskedNumber`, `Link`, `StatusBadge`, `TopAddon` и `ProgressBar`, где допустимое переопределение должно задаваться на уровне вложенного компонента, а не отдельным host-specific хаком.

## Источники данных
Плагин работает с JSON-справочниками в [`JSONS`](./JSONS), а в рантайме берёт список источников с GitHub Pages:

- основной URL: `https://ackedze.github.io/design-system_ab/JSONS/referenceSourcesMVP.json`;
- token/style каталоги: пути из этого списка;
- component catalogs: загружаются только по component indexes для ключей, найденных в проверяемом выделении;
- разрешённые домены описаны в [`manifest.json`](./manifest.json).

Важно: текущий runtime-аудит зависит от доступности и актуальности опубликованного содержимого `ackedze.github.io/design-system_ab`. `npm run build` не публикует JSON-каталоги и не скачивает их автоматически, а только собирает плагин.

История и шаги миграции собраны в [`APOLLO_MIGRATION.md`](./APOLLO_MIGRATION.md).

## Правило публикации

При публикации изменений Apollo обновляйте этот README вместе с кодом, если меняется runtime-поведение, источники данных, сборка, контракты UI/backend или workflow проверки. Если изменение влияет на общий workspace-процесс, дополнительно обновляйте root `README.md` и `WORKSPACE.md`.

## Правило проверки

После любых изменений в Apollo перед завершением работы обязательно:
- запустить `npm run type-check`;
- запустить релевантные regression-check’и для затронутого поведения;
- пересобрать проект через `npm run build`.

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
- `Кастомные стили` тоже переведены на React-карточку: в этом табе `caption` заполняется названием стиля или эффекта из `formatCustomStyleReason(...)`.
- React-карточки результатов в `Актуальных компонентах` закреплены как `hug` по содержимому (`flex: 0 0 auto`), чтобы при длинной выдаче контейнер скроллился, а карточки не схлопывались по высоте.
- Layout token-изменения, включая `itemSpacingToken`, `paddingTokens`, `radiusToken` и `opacityToken`, в diff-выводе проходят через token label resolver и показываются по имени токена, а не как сырые `VariableID`; для padding скрывается технический namespace `Vertical/Horizontal Paddings`, а token-diff подавляется, если после резолва видимые значения совпадают.
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
- Состояние основной кнопки задаётся через явную фазу UI (`catalog-loading` / `scanning` / `idle`), чтобы не возникали смешанные состояния вроде `Остановить` с неправильным цветом или `disabled`.
- В React-хроме верхняя action-кнопка переключается между variant-инстансами `Button[type=primary]` и `Button[type=secondary]`, а не только меняет цвет у одного и того же узла.
- При нажатии `Проверить` UI сначала переводит кнопку в фазу `scanning`, и только на следующем animation frame отправляет `scan-selection` в backend, чтобы визуальный переход происходил до старта проверки.
- Во время сканирования кнопка `Проверить` переключается в `Отменить` и прерывает текущую проверку.
- В шапке отображается число найденных `COMPONENT`/`INSTANCE` в выделении.

## Ограничения и известные проблемы
- Плагин сканирует только видимые узлы: скрытые ветки отбрасываются ещё на этапе обхода.
- Если remote reference list с GitHub Pages недоступен, Apollo не использует bundled fallback и показывает ошибку загрузки справочников.
- Если внутри remote reference list есть устаревшие или битые пути до token/style каталогов, Apollo сейчас логирует ошибку каталога и продолжает с доступными данными; component-каталоги подгружаются строго через indexes.
- Репозиторий `Ackedze/apollo` и опубликованный `GitHub Pages`-слой `ackedze.github.io/design-system_ab` могут быть временно рассинхронизированы после push.
- В проекте есть штатный `type-check`, но нет полноценного интеграционного test-suite для Figma runtime.
- Для themization-flow есть точечный regression-check `npm run test:themization`, который проверяет platform-aware counterpart lookup и variant matching на JSON-каталогах `Button` и `Tag`, но он не заменяет интеграционные проверки в Figma.
- Для forced categories, allowlist-кастомизаций, nested reference-resolution и retryable `componentKey` cache есть набор точечных regression-check’ов: `npm run test:audit-policies`, `npm run test:allowed-customizations`, `npm run test:component-key-cache`, `npm run test:customization-filters`, `npm run test:nested-variants`, `npm run test:item-spacing-diff`, `npm run test:variant-structure-paths`, `npm run test:snapshot-tree`. Они проверяют forced audit categories, platform-aware themization visibility, declarative allowlist, nested variant-switch suppression, variant-aware reference resolution и кейсы с повторным key-resolve для nested instances, но не заменяют интеграционные проверки в Figma.

Подробный технический отчёт по найденным рискам хранится в [`AUDIT.md`](./AUDIT.md), но перед использованием стоит учитывать, что этот файл частично устарел и не полностью отражает текущее состояние проекта.

## Локальная статистика проверок

После каждой успешно завершённой проверки Apollo формирует JSON-отчёт и автоматически отправляет его в production Edge Function:

```text
POST https://dwjnndpxzqizrcwpasrs.supabase.co/functions/v1/apollo-stats
```

Отчёты сохраняются в:

```text
Ackedze/design-system_ab/apollo-stats/<figma-user>/<figma-user>_dd-mm-yyyy_hh-mm-ss.json
```

Отчёт содержит все категории аудита, включая устаревшие компоненты и стили, кастомные стили, обновления, кастомизации, локальные и detached-компоненты, пресеты, технические и актуальные компоненты, ошибки канала и темизации. Актуальные компоненты используются как инвентаризация и не входят в общий счётчик проблем.

Пользователю плагина не нужны GitHub token, Supabase-аккаунт, локальный сервис или дополнительная настройка. GitHub token хранится только в Supabase secret и запрещён в `src`, `manifest.json`, build-конфиге и собранном plugin bundle. Ошибка загрузки статистики не прерывает аудит.

Локальный `services/apollo-stats-collector` сохранён только как инструмент разработки и не используется production-сборкой Apollo.

Публичный слой каталогов перед приватизацией `Ackedze/design-system_ab` должен быть перенесён на GitHub Pages репозитория `Ackedze/apollo`. Workflow находится в [`.github/workflows/publish-catalogs-pages.yml`](./.github/workflows/publish-catalogs-pages.yml). До успешной публикации и проверки нового `referenceSourcesMVP.json` текущий репозиторий каталогов нельзя переводить в private.

## Структура проекта
- [`src/code.ts`](./src/code.ts) — основной runtime плагина.
- [`src/ui.html`](./src/ui.html) — интерфейс и клиентская логика панели.
- [`src/ui-app`](./src/ui-app) — React-компоненты и bridge для нового UI-хрома.
- [`src/reference`](./src/reference) — загрузка и нормализация reference-каталогов.
- [`src/structure`](./src/structure) — snapshot и diff.
- [`src/services`](./src/services) — подготовка представлений для UI.
- [`src/stats`](./src/stats) — формирование и отправка локальных отчётов проверок.
- [`src/utils`](./src/utils) — вспомогательные утилиты.
- [`JSONS`](./JSONS) — локальные JSON-артефакты справочников для regression-checks.
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
npm run test:variant-structure-paths
npm run test:snapshot-tree
npm run test:stats-report
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

Скрипт делает грубый локальный проход по component-каталогам внутри `JSONS` и печатает кандидатов на host-controlled nested overrides. Это не финальный source of truth, а быстрый способ находить новые семейства кейсов до ручной проверки в Figma.

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
