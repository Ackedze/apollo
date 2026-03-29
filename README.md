# Apollo Plugin

## Что это
`Apollo` — Figma-плагин для аудита выделения относительно reference-справочников дизайн-системы. Он обходит выбранные узлы, находит компоненты и инстансы, сопоставляет их с каталогами и раскладывает результаты по диагностическим табам.

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
2. Скачивает component-, token- и style-справочники.
3. Обходит всё видимое поддерево внутри текущего выделения.
4. Классифицирует найденные `COMPONENT` и `INSTANCE`.
5. Для связанных компонентов собирает snapshot структуры и считает diff относительно reference.
6. Отправляет в UI готовые списки для табов и позволяет перейти к нужному слою через `focus-node`.

## Табы аудита
Конфигурация табов хранится в [`src/config/tabs.ts`](./src/config/tabs.ts).

- `Актуальные компоненты` — компоненты со статусом `current`.
- `Детач` — `FRAME`/`GROUP`, у которых есть `detachedInfo` из библиотеки.
- `Кастомизация` — инстансы с meaningful diff-ами относительно reference.
- `Устаревшие` — компоненты со статусом `deprecated`.
- `Пора обновить` — компоненты со статусом `update`/`changed`.
- `Темизация` — page-level mode `Theme / Corp` и случаи использования `[Corporate]`-компонентов.
- `Пресеты` — инстансы компонентов, помеченных через `🔒`.
- `Локальные` — узлы, которые не удалось связать с reference-каталогом.
- `Кастомные стили` — узлы с локальными fill/stroke/effect без корректной токенизации или style-binding.

## Как устроен аудит

### Основной поток
- [`src/code.ts`](./src/code.ts) показывает UI, слушает сообщения UI и запускает `runAudit`.
- `runAudit` подгружает каталоги, затем собирает состояние проверки через `collectTargets`.
- `classifyNode` ищет `componentKey`, находит reference через `findComponent`, при необходимости строит snapshot (`snapshotTree`) и считает diff (`diffStructures`).
- при загрузке style catalogs Apollo пересобирает lookup-карты заново, поэтому новые или только что добавленные paint/effect styles корректно участвуют и в `Кастомизации`, и в `Кастомных стилях`.
- Результаты складываются в `CheckState`, после чего UI получает `scan-result`.

### Сервисы и модели
- [`src/services/auditViewBuilder.ts`](./src/services/auditViewBuilder.ts) собирает detached-элементы, кастомные стили и текстовые узлы.
- [`src/structure/snapshot.ts`](./src/structure/snapshot.ts) сериализует дерево нод в нормализованный плоский список.
- [`src/structure/diff.ts`](./src/structure/diff.ts) сравнивает layout, padding, стили, fill/stroke, radius и opacity.
- [`src/reference/library.ts`](./src/reference/library.ts) загружает и нормализует каталоги компонентов, токенов и стилей.
- [`src/types/audit.ts`](./src/types/audit.ts) описывает `AuditItem`, `DetachedEntry`, `CustomStyleEntry` и связанные типы.
- [`src/filters/customStyleFilters.ts`](./src/filters/customStyleFilters.ts), [`src/filters/customizationFilters.ts`](./src/filters/customizationFilters.ts) и [`src/filters/ignoredComponentFilters.ts`](./src/filters/ignoredComponentFilters.ts) содержат управляемые исключения для известных технических кейсов DS, включая технические `PaintMe`-узлы в `IconView` и его вложенном `🔩 Content`, а также `BgColor` и `Border` в `IconView`, sandbox-компоненты, `❌template` и `.Grid`, которые не должны шуметь в `Локальных`, `Кастомных стилях` и `Кастомизации`.

### Что считается в diff
Сравнение учитывает:
- layout и padding;
- `itemSpacing`;
- стили заливки, обводки и текста;
- fill/stroke, включая variable token alias, style-binding и raw color values;
- радиусы;
- opacity.

Важно: style-binding для `fill` и `stroke` сравнивается отдельно через `styles.fill.styleKey` и `styles.stroke.styleKey`. В paint-канал больше не попадают `fillStyleId` и `strokeStyleId`, чтобы styled fills/strokes не отображались в UI как ложные `token: S:...` diff-ы.
Важно: для text/fill/stroke style diff в UI используется нормализованный label стиля. Если raw `styleKey` отличаются, но после резолва дают одно и то же имя стиля, такая пара больше не считается кастомизацией.
Важно: в `paint-diff` Apollo не гадает по совпадению цвета. Если у слоя есть явная привязка к токену или стилю, в UI показывается label по id, а если label не найден — сам id. Только при отсутствии привязки показывается фактический цвет: непрозрачный как `#RRGGBB`, полупрозрачный как `rgba(...)`.
Важно: скрытые и полностью прозрачные `fill`-paints игнорируются в actual snapshot так же, как и в reference-нормализации. Это убирает ложные кастомизации, когда в компонентных каталогах есть технические `fills` с `"visible": false`.
Важно: known technical nodes можно исключать из `Кастомизации` и `Кастомных стилей` отдельными фильтрами, не меняя базовую логику diff.

Для nested instances используется сравнение по собственному `componentKey`, чтобы не сравнивать вложенные компоненты с placeholder-структурой родителя.

## Источники данных
Плагин работает с JSON-справочниками в [`JSONS`](./JSONS), а в рантайме берёт список источников с GitHub Pages:

- основной URL: `https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json`;
- component/style/token каталоги: пути из этого списка;
- разрешённые домены описаны в [`manifest.json`](./manifest.json).

Важно: текущий runtime-аудит зависит от доступности GitHub Pages. `npm run build` не скачивает каталоги автоматически, а только собирает плагин.

История и шаги миграции собраны в [`APOLLO_MIGRATION.md`](./APOLLO_MIGRATION.md).

## UI и поведение
- [`src/ui.html`](./src/ui.html) теперь служит HTML-shell и bridge-слоем: в нём остались message-handlers, placeholder/fallback-сценарии и маршрутизация табов в React results bridge.
- React-хром UI вынесен в [`src/ui-app`](./src/ui-app): на первом этапе туда перенесены `topSection`, `leftSection` и базовые компоненты (`Button`, `CategoryCard`, `CounterBadge`).
- В библиотеку React-компонентов также добавлен [`SmallButton`](./src/ui-app/components/SmallButton.tsx) по Figma-компоненту `smallButton`: он поддерживает компактный `singleIcon`-вариант и текстовый вариант с hover-state.
- Для пустых экранов правой колонки добавлен отдельный [`Placeholder`](./src/ui-app/components/Placeholder.tsx): он используется для загрузки каталогов и для стартового состояния до первого нажатия `Проверить`.
- Для правой колонки подготовлены базовые React-компоненты карточек результата: [`ResultCard`](./src/ui-app/components/ResultCard.tsx), [`ResultSubCard`](./src/ui-app/components/ResultSubCard.tsx) и preset-обёртки в [`ResultCardPresets.tsx`](./src/ui-app/components/ResultCardPresets.tsx).
- Интеграция правой колонки начата для audit-like категорий: `Актуальные компоненты`, `Устаревшие`, `Пора обновить`, `Пресеты`, `Локальные`, `Детач`, `Ошибка темизации`, `Кастомные стили` и `Кастомизация` уже используют React-bridge и React-карточки.
- В `Кастомизации` diff-ы теперь группируются по узлу: один [`ResultSubCard`](./src/ui-app/components/ResultSubCard.tsx) соответствует одному узлу, а внутри него рендерится одна или несколько property-строк.
- `Кастомные стили` тоже переведены на React-карточку: в этом табе `caption` заполняется названием стиля или эффекта из `formatCustomStyleReason(...)`.
- React-карточки результатов в `Актуальных компонентах` закреплены как `hug` по содержимому (`flex: 0 0 auto`), чтобы при длинной выдаче контейнер скроллился, а карточки не схлопывались по высоте.
- Layout token-изменения, включая `itemSpacingToken`, в diff-выводе тоже проходят через token label resolver и показываются по имени токена, а не как сырые `VariableID`.
- Стили React-компонентов вынесены из [`src/ui.html`](./src/ui.html) в отдельные `*.module.css` рядом с компонентами; при сборке `ui-app.css` автоматически инлайнится в `dist/ui.html`.
- Внутренние отступы [`TopSection`](./src/ui-app/components/TopSection.tsx) задаются самим компонентом, а `.header` в [`src/ui.html`](./src/ui.html) отвечает только за разделитель и оболочку.
- Базовый [`Button`](./src/ui-app/components/Button.tsx) выровнен по Figma component set `Button`: поддерживает `type="primary" | "secondary"` и отдельные состояния `hover`/`disabled` через CSS, включая загрузочные варианты с addon-spinner.
- [`CategoryCard`](./src/ui-app/components/CategoryCard.tsx) соответствует `categoryCard` из Figma, учитывает состояния `selected`, `non-empty` и `empty`, а при переполнении заголовок уходит в ellipsis; DOM fallback использует те же class-based состояния, что и React-версия.
- Старый DOM-пайплайн карточек удалён из [`src/ui.html`](./src/ui.html): активные табы правой колонки рендерятся через React results bridge, а `ui.html` оставляет только placeholder/fallback при сбое bridge.
- В UI таб `Темизация` проверяет page-level mode `Theme / Corp` и использование `[Corporate]`-компонентов.
- В табе `Темизация` кнопка `Сменить` теперь выполняет действие: для page-level finding переключает mode `Theme -> Corp`, а для `[Corporate]`-инстанса делает `swapComponent(...)` на базовую версию без `[Corporate]`; при подборе пары игнорируется и технический префикс `🔄`, так что `🔄 [D][Corporate] Tag` заменяется на `[D] Tag`.
- В табе `Темизация` page-level finding создаётся только тогда, когда collection `Theme` найдена через `resolvedVariableModes` в дереве текущей страницы и её текущий mode на странице отличается от `Corp`; action `Сменить` использует сохранённые `collectionId/modeId` из результата аудита и не пытается ничего заново искать в момент клика.
- Поиск `Theme` теперь кэширует `nodeId` якорного узла на страницу: если `Theme` уже была найдена на этой странице, следующая проверка сначала смотрит в этот узел и только при промахе снова обходит дерево страницы.
- Для collection `Theme` действует простое page-level правило: если текущий явно выбранный mode не `Corp`, Apollo показывает карточку ошибки; отсутствие explicit mode трактуется как `Auto (Default)` и тоже считается ошибкой до тех пор, пока пользователь явно не переключит `Theme` в `Corp`.
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
- В проекте нет автоматических тестов и нет штатного `type-check`/`lint` скрипта.

Подробный технический отчёт по найденным рискам хранится в [`AUDIT.md`](./AUDIT.md), но перед использованием стоит учитывать, что этот файл частично устарел и не полностью отражает текущее состояние проекта.

## Структура проекта
- [`src/code.ts`](./src/code.ts) — основной runtime плагина.
- [`src/ui.html`](./src/ui.html) — интерфейс и клиентская логика панели.
- [`src/ui-app`](./src/ui-app) — React-компоненты и bridge для нового UI-хрома.
- [`src/reference`](./src/reference) — загрузка и нормализация reference-каталогов.
- [`src/structure`](./src/structure) — snapshot и diff.
- [`src/services`](./src/services) — подготовка представлений для UI.
- [`src/utils`](./src/utils) — вспомогательные утилиты.
- [`JSONS`](./JSONS) — локальные JSON-артефакты справочников.
- [`scripts`](./scripts) — служебные скрипты подготовки reference-списка и экспортов.

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
- копирует [`src/ui.html`](./src/ui.html) в `dist/ui.html`;
- запускает [`scripts/exportComponentTree.js`](./scripts/exportComponentTree.js).

### Watch-режим
```bash
npm run watch
```

### Подготовка списка reference-источников вручную
```bash
node scripts/prepareReferences.js
```

Дополнительные переменные:
- `REFERENCE_SOURCES_URL` — переопределяет URL списка каталогов;
- `NEMESIS_OFFLINE=1` — заставляет скрипт брать локальный cache;
- `NEMESIS_FETCH_TIMEOUT_MS` — таймаут загрузки.

## Как подключить в Figma
1. Соберите проект через `npm run build`.
2. В Figma откройте `Plugins` → `Development` → `Import plugin from manifest...`.
3. Укажите [`manifest.json`](./manifest.json) из текущей папки проекта.

## Полезные команды
```bash
npm run build
npm run watch
node scripts/prepareReferences.js
```
