# Единая генерация в Apollo

Решение от 05.10.2026: развивать генерацию в существующем репозитории Apollo,
рядом с `.` и `packages/component-contract-core`. Общий план экрана
создаётся один раз и исполняется отдельными адаптерами Figma и фронта.
Исходные компонентные нормы остаются в design-system_ab.

```text
prompt + context
  → generation-core: ScreenSpec → CompositionPlan + package lock
      → adapter-figma → Apollo Plugin API transport → Figma
      → adapter-frontend → Node/React toolchain → frontend
  → captures + applicable checks → separate target results + semantic parity
```

Apollo предоставляет уже существующие загрузку авторского источника,
compatibility profile, shared compiler, dependency checks, capture и deterministic
predicate runtime. Generation-core получает их через явный порт с identity
сборки; он не импортирует приложение плагина. Адаптеры не импортируют друг друга.
React/browser toolchain исполняется вне Figma sandbox. Prompt planner и frontend
transport не добавлены в G02. Объяснение аудита Codex не становится генератором
или исполнителем delegated rules автоматически.

## Реализованный G02

- `packages/generation-core`: TypeScript загрузчик authoring ZIP и run lock.
- `scripts/load-generation-packages.js`: локальный read-only вход
  с существующим runtime V4; проверяет исходники сборки и неизменность ZIP.
- `packages/adapter-figma` и `packages/adapter-frontend`: закреплённые границы
  будущих пакетов. Здесь пока README, исполнение относится к G05/F01/W01.
- Источник выбирается аргументом CLI. Для текущего пилота он находится в
  `shared/design-system_ab/experiments/current-contract-packages` workspace.
  Старые authoring пути существующего `release:pilot` остаются его отдельным
  входом; этот этап не обновляет release, Proxy или панель V4.

Каждый child требует собственного manual и facts из отдельного ZIP. Embedded
compiled предоставляет доказательство anatomy/исторического export stamp;
shared compiler обязан воспроизвести его точный hash из собственного manual и
facts. Predicate cache никогда не заменяет нормы. Отсутствующий host compiled
собирается общим compiler. Проверяются revision/manual/compiled pins, схема,
closure, конфликт источников, stale host cache и совпадение с lock повторного run.

Lock `apollo.generation-package-lock.v1-experimental` хранит ZIP SHA256,
component/contract identity и revision, source/facts/compiled hashes, pins,
provenance projection stamp, core/profile версии и SHA256 runtime/build-inputs.
Полный inventory дополнительно содержит declared representations и область
checks; файл lock не включает private manuals, facts или продуктовые тексты.
Даже lock следует хранить вне tracked fixtures: `/tmp` или игнорируемый
`generation-runs/`. CLI не перезаписывает существующий output и запрещает
помещать его в исходный каталог.

## Команды

Из корня Apollo, Node.js 22 и уже установленные корневые зависимости:

```sh
npm run generation:validate
npm run generation:packages -- /absolute/path/to/current-contract-packages /tmp/generation-lock.json
npm run generation:packages -- /absolute/path/to/current-contract-packages /tmp/generation-lock-repeat.json /tmp/generation-lock.json
```

`generation:build` пересобирает shared core, V4 runtime и generation-core.
`generation:validate` делает сборку и проверки. `generation:packages` использует
уже закреплённую сборку; для повторного run по lock её сохраняют. Пересборка
может изменить runtime bytes SHA256 даже при прежних версиях и source inputs;
такой drift явно требует нового lock, а не молчаливого обновления run.
Загрузка не изменяет ZIP, manual, нормы, приёмку компонентов или опубликованный
runtime. Успешная компиляция означает доступность compiled-predicate consumer,
а не готовность рецепта генерации или полную проверку экрана.

## Последующие action points

| ID | Результат | Статус |
| --- | --- | --- |
| G01 | Сценарий суммы/подтверждения desktop + mobile и размещение | Выполнено в плановых документах DS |
| G02 | ZIP inventory, compiler reuse, exact pins и run lock | Реализовано локально |
| G03 | ScreenSpec/CompositionPlan, typed states/events и ручной план пилота | Следующий шаг |
| G04 | Read-only GenerationView и resolver представлений | Запланировано |
| G05 | Один adapter protocol и preflight без записи | Запланировано |
| F01–F03 | Instances/native slots, capture и применимые проверки Figma | Запланировано |
| W01–W03 | Подтверждённые library mappings, React generation и browser facts | Запланировано |
| P01–P02 | Паттерны/редполитика и prompt → общий план | Запланировано |
| I01–I03 | Оба target, receipts/parity, приёмка и расширение | Запланировано |

Каноническая подробная декомпозиция остаётся в
`design-system_ab/experiments/current-contract-packages/GENERATION-ACTIONS.md`.
Сначала принимается ручной общий план в обоих адаптерах, затем planner промптов.
Figma generation, frontend generation, scenario coverage, published release и
live consumer acceptance имеют отдельные статусы. Открытые PARITY задачи V4
не закрываются фактом успешной загрузки ZIP.

## Локальная проверка G02 от 05.10.2026

`npm run generation:validate` прошёл: shared core 39/39, Apollo 115/115,
loader 12/12; typecheck и сборки успешны. Из фактического каталога загружены
все семь ZIP: Amount r5, Button r31, Spinner r8, AmountStyles r10,
CorporateContent desktop r12/mobile r7 и ButtonsGroup r56. Own manual/facts
воспроизводят точные child pins, включая исторический exporter stamp.
Повтор без пересборки даёт тот же lock; смена bundle обнаружена как STALE_LOCK.
Private captures и каталоги в Apollo source/fixtures не записаны.

Полный корневой `npm run validate`: typecheck/build/Figma runtime parser прошли,
legacy test gate остановился на ранее зафиксированном ENOENT для
`web-corp/CardImage/compiled/component-contract.v2.json` в старом каталоге DS.
Это ограничение полного gate, а не успешная полная проверка Apollo.
Live Figma/frontend execution, Proxy/release publication и экранная parity
не выполнялись в G02.

NEXT-05 local frontend host выполнен: [реальный route/adapter, проверки и gates](../docs/GENERATION_FRONTEND_HOST.md). Ранние CardImage/full-gate ограничения выше относятся к G02; root gate теперь 81/81. Нормативный plan всё ещё требует accepted source/profile и fresh producer pins.
