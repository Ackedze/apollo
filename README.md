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
- `Ошибки темизации` — случаи, когда для компонента найден корпоративный counterpart.
- `Пресеты` — инстансы компонентов, помеченных через `🔒`.
- `Локальные` — узлы, которые не удалось связать с reference-каталогом.
- `Кастомные стили` — узлы с локальными fill/stroke/effect без корректной токенизации или style-binding.

## Как устроен аудит

### Основной поток
- [`src/code.ts`](./src/code.ts) показывает UI, слушает сообщения UI и запускает `runAudit`.
- `runAudit` подгружает каталоги, затем собирает состояние проверки через `collectTargets`.
- `classifyNode` ищет `componentKey`, находит reference через `findComponent`, при необходимости строит snapshot (`snapshotTree`) и считает diff (`diffStructures`).
- Результаты складываются в `CheckState`, после чего UI получает `scan-result`.

### Сервисы и модели
- [`src/services/auditViewBuilder.ts`](./src/services/auditViewBuilder.ts) собирает detached-элементы, кастомные стили и текстовые узлы.
- [`src/structure/snapshot.ts`](./src/structure/snapshot.ts) сериализует дерево нод в нормализованный плоский список.
- [`src/structure/diff.ts`](./src/structure/diff.ts) сравнивает layout, padding, стили, fill/stroke, radius и opacity.
- [`src/reference/library.ts`](./src/reference/library.ts) загружает и нормализует каталоги компонентов, токенов и стилей.
- [`src/types/audit.ts`](./src/types/audit.ts) описывает `AuditItem`, `DetachedEntry`, `CustomStyleEntry` и связанные типы.

### Что считается в diff
Сравнение учитывает:
- layout и padding;
- `itemSpacing`;
- стили заливки, обводки и текста;
- fill/stroke, включая variable token alias и цветовые fallback-метки;
- радиусы;
- opacity.

Важно: style-binding для `fill` и `stroke` сравнивается отдельно через `styles.fill.styleKey` и `styles.stroke.styleKey`. В paint-канал больше не попадают `fillStyleId` и `strokeStyleId`, чтобы styled fills/strokes не отображались в UI как ложные `token: S:...` diff-ы.

Для nested instances используется сравнение по собственному `componentKey`, чтобы не сравнивать вложенные компоненты с placeholder-структурой родителя.

## Источники данных
Плагин работает с JSON-справочниками в [`JSONS`](./JSONS), а в рантайме берёт список источников с GitHub Pages:

- основной URL: `https://ackedze.github.io/apollo/JSONS/referenceSourcesMVP.json`;
- component/style/token каталоги: пути из этого списка;
- разрешённые домены описаны в [`manifest.json`](./manifest.json).

Важно: текущий runtime-аудит зависит от доступности GitHub Pages. `npm run build` не скачивает каталоги автоматически, а только собирает плагин.

История и шаги миграции собраны в [`APOLLO_MIGRATION.md`](./APOLLO_MIGRATION.md).

## UI и поведение
- Основной UI находится в [`src/ui.html`](./src/ui.html).
- После сканирования в карточках доступна кнопка перехода к ноде.
- UI показывает тосты о загрузке каталогов и завершении сканирования.
- Во время сканирования кнопка `Проверить` переключается в `Отменить` и прерывает текущую проверку.
- В шапке отображается число найденных `COMPONENT`/`INSTANCE` в выделении.

## Ограничения и известные проблемы
- Плагин сканирует только видимые узлы: скрытые ветки отбрасываются ещё на этапе обхода.
- UI ожидает `normalized-snapshot-ready`, но `code.ts` это сообщение не отправляет, поэтому выгрузка snapshot из заголовка не активируется.
- В проекте нет автоматических тестов и нет штатного `type-check`/`lint` скрипта.

Подробный технический отчёт по найденным рискам хранится в [`AUDIT.md`](./AUDIT.md), но перед использованием стоит учитывать, что этот файл частично устарел и не полностью отражает текущее состояние проекта.

## Структура проекта
- [`src/code.ts`](./src/code.ts) — основной runtime плагина.
- [`src/ui.html`](./src/ui.html) — интерфейс и клиентская логика панели.
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
npm run find-dead-code
node scripts/prepareReferences.js
```
