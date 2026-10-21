# NEXT-06 · Apollo · передача чернового framework

Дата: 05.10.2026. Ответственный: Apollo CB :: Patterns.
Результат: независимый framework и пилот готовы к ревью; подключение к
Apollo, продуктовая/live-приёмка и release остаются отдельными этапами.

## Checkout и область изменений

- Изолированный checkout:
  `/Users/alexkukhta/Desktop/DS-AB-Plugin/pattern-core-workspace/projects/Apollo`.
- Ветка: `agent/pattern-core-next-06`.
- Base HEAD: `824eb12554bcdc3264856d9095af7d3e3811c6e4`.
- Изменения: только `packages/pattern-core/**`.
- Целевой consumer: `projects/Apollo` через общий план/
  preflight Generation. Пакет ещё не подключён к приложению; legacy v3
  поведение не изменено.
- Общие core/schemas/backlogs/README, `generation-core`, адаптеры,
  компонентные manual/ZIP и нормативные правила не редактировались.
- Коммита, PR, публикации или установки пакетов не выполнялось.

Основной checkout содержит текущую работу других направлений, поэтому пакет
не переносился в него напрямую. General может назначить интеграцию этой
области отдельному исполнителю после согласования порта. Изолированный
checkout использует существующие зависимости и read-only ссылки на источник
DS для обязательных проверок; эти ссылки не входят в изменения пакета.

## Артефакты

| Путь внутри пакета | Результат |
| --- | --- |
| `src/schema.ts`, `schemas/pattern-contract.v1-draft.schema.json` | Закрытая схема: outcome/context, typed decisions, semantic roles и activeStates, states/events/transitions, evidence, checks, gaps |
| `src/validator.ts`, `src/decisions.ts` | Структура, reference closure, полный конечный выбор, пересечения/пропуски, DAG и переходы; отсутствующий контекст не получает default |
| `src/sources.ts` | Точные source/rule IDs вне примеров, immutable commit/bytes, receipt с привязкой к pattern hash |
| `src/requirements.ts` | Предлагаемый порт требований для v4 CompositionPlan; отдельные source/availability и readiness states |
| `docs/AUTHORING.md`, `docs/PATTERN_TEMPLATE.md`, `docs/template.synthetic.json` | Авторский workflow, Markdown и структурный шаблон |
| `docs/COMPOSITION_PLAN_PORT.md` | Граница с Generation / Code Connect и вопросы согласования |
| `pilots/interruption.draft.json`, `pilots/README.md` | Draft прерывания сценария со ссылками на существующие нормы |
| `tests/`, `scripts/check-schema.cjs`, `scripts/check-pilot.cjs` | Synthetic positive/negative tests, независимая QA схемы и read-only проверка пилота |

## Версии и pins

- Package/framework: `@apollo/pattern-core@0.1.0-draft.1`.
- Pattern schema: `apollo.pattern-contract.v1-draft`, JSON Schema draft-07.
- Requirements port: `apollo.pattern-requirements.v1-draft` — **proposed**.
- Source receipt: `apollo.pattern-source-receipt.v1-draft`.
- Node: `22.14.0`; структурный validator: Zod `3.25.58`.
- Независимая schema QA: существующий Ajv `6.15.0`, передан явным локальным
  путём; fresh install этим прогоном не подтверждается.

Пилот `ptrn:flow.interruption-scenario`, revision 1, Draft:

- Канонический hash JSON:
  `1c3b340927414bb532aec4ec384da29d3890c25ecda9e9f4dff31f2546ff329c`.
- Schema file SHA-256:
  `395ae50594eea58e9d5e933a6a31f4579cb9826079fb945731ede625890ed7ad`.
- Локальный runtime bundle SHA-256:
  `f48da46410afc10df4a5fe40fee7fc8b4361a26fcdc55d432d51ee0b24633a70`.
- Source receipt SHA-256:
  `29d5dea8947ef1dea334e98f2f264beb649155bc01765bc2a11cd0f8bb680d66`.
- Source: `design-system_ab/patterns/p_interruption-scenario.md`.
- Source commit: `7f523fcf38127f275f81f171391dfd648b8541d3`.
- Source file SHA-256:
  `e9f2e9a82aef916fabec515a10ffdd4e0b4d53fe693af2115c8236fdd4c126f2`.

Bundle hash относится к наблюдаемой локальной сборке, не обещает идентичности
артефакта в другом окружении и не является release pin.

Наблюдаемый вход NEXT-01: registry schema `apollo.arui-private-mappings.v1`,
version `1.0.0`, digest
`bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0`;
`arui-private` 80.7.1 / `c037d0c322ea9774a9c251400d76d41222819b87`.
Прочитаны registry/consumer и NEXT-01 handoff. Данные каталога не копировались
в fixtures; реальные UI bindings пилота не подтверждены.

## Выполненные проверки

1. `npm --prefix packages/pattern-core run validate`: type-check + build +
   **60/60** synthetic tests PASS. Проверяются missing/typed context,
   overlap/coverage, state/evidence closure, failure gaps, byte/pin drift,
   stale mappings/locks, unsupported export/role/prop/slot/platform/target,
   сохранение независимых acceptance states и запрет promotion.
2. `node packages/pattern-core/scripts/check-schema.cjs /Users/alexkukhta/node_modules/ajv`:
   draft-07 metaschema PASS, **12/12** synthetic структурных случаев согласованы
   между независимым Ajv и Zod.
3. `npm --prefix packages/pattern-core run pilot:check -- --source-root design-system_ab=/Users/alexkukhta/Desktop/workplace/shared/design-system_ab`:
   structure/source pins/exact IDs PASS; **18/18** контекстов, 6 ветвей,
   4 состояния, 10 переходов. Save failure и UI availability — unresolved.
4. В базовом checkout выполнены root type-check, production build и
   Figma runtime compatibility check — PASS.
5. Полный root `npm run validate` **не PASS**: существующий
   `scripts/test-card-image-customizations.js` требует отсутствующий внешний
   файл `JSONS/experiments/component-contract-v2/web-corp/CardImage/compiled/component-contract.v2.json`
   в `design-system_ab`. Тест остановился до полного regression suite.
   Этот скрипт не изменялся и `pattern-core` не потребляет. Общий gate нельзя
   считать выполненным до восстановления/согласования этого входа.

Эти проверки относятся к локальному framework и базовому checkout. Они не
являются тестом установленного приложения Apollo или живого UI. Private
manual/capture не используется как новый tracked fixture; реальные источники
проверяются read-only через их pins.

## Gaps и следующий необходимый вход

1. **Product owner:** поведение при ошибке автоматического/ручного сохранения.
   `save-failed` ведёт к blocking gap без действий или назначения нового state.
   Не определены retry/exit/stay/notification/recovery.
2. **Product owner:** optional remembered choices и обратимость; этот вариант
   исходного материала вне пилота. Нужна приёмка самой семантической проекции.
3. **Code Connect / General:** подтверждённые mappings для surface/content/
   actions/notification. NEXT-01 сейчас покрывает три маршрута ButtonsGroup /
   CorporateContent. Внутренний Core Button не становится самостоятельным
   импортом генератора. Нужна согласованная агрегация action roles/occurrences.
4. **General + Generation:** согласовать requirements port с CompositionPlan,
   source/registry freshness, точные значения archive/manual/compiled hashes,
   разные Figma/code representation IDs, diagnostic transport и сохранение
   независимых API/source/coverage/live/release статусов. Будущий adapter должен
   использовать NEXT-01 `preflight`, а не только `prepare`.
5. **Назначенный интегратор v4:** подключить принятый порт через generation
   plan/preflight и внешние Node filesystem/git проверки. Изменения приложения
   и shared схем этим независимым framework не выполнялись.
6. **General:** разрешить недостающий внешний вход root regression suite;
   отдельно назначить product/live acceptance и release.

Нормы компонентов остаются в component contracts. Schema v1 принимает только
Draft, а требования всегда содержат `executionAllowed: false`. Локальный PASS
не добавляет нормативного правила и не повышает его статус. Изменения норм
или promotion требуют отдельного handoff с Contract Creation по процессу DS.
