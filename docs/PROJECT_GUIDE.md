# Карта Apollo для разработчика

Apollo — Figma-плагин. Он читает документ через native API, показывает результаты
проверок, общается с Apollo Proxy и применяет разрешённые изменения в Figma.
Общий старт: [AGENT_START_PROMPT.md](AGENT_START_PROMPT.md).
Установка и данные: [DESIGNER_START.md](DESIGNER_START.md).

## Функции и границы

| Функция | Что выполняет | Ограничение |
| --- | --- | --- |
| Дизайн | Сбор фактов области/документа, проверки стилей, компонентов и контрактов, findings и отчёты | Неполное покрытие не означает отсутствие нарушений |
| Спросить | Вопрос и история → Proxy → выбранный агент → ответ | Выделение и весь audit report не передаются автоматически |
| Генерация | Планирование ScreenSpec, доступный адаптер и ссылка на результат | Созданный Draft не становится Ready |
| Навыки | Отдельные сценарии; переименование слоёв с предложениями и выбранным применением | Навык не даёт агенту произвольную запись в Figma |
| Данные Apollo | Метаданные контрактов и статусы подключения по адаптерам | Наличие manual не доказывает готовность mapping |

Обычная проверка и чтение индекса данных не запускают модель. AI-пояснения,
диалог, агентская генерация и анализ навыка — отдельные запросы. Контрактные
вычисления выполняет локальный runtime; Proxy поставляет необходимые данные.
Проверка контракта, Figma mapping и frontend mapping подключаются отдельно.
Точный набор определяется активной поставкой, а не списком в README.

Figma MCP работает в режиме generation-only: DS-проверки не запускаются,
результат сохраняется как Draft, в том числе при прерывании. Frontend adapter
есть в исходниках, но переносимость frontend с собственным SDK не входит
в первую переносимую поставку. Не включайте `arui-private` для обхода.

## Путь выполнения

1. UI принимает действие пользователя и создаёт request/correlation ID.
2. Для native-чтения UI передаёт типизированное сообщение в Figma main.
3. Main собирает факты и проверяет актуальность/владение. UI получает результат.
4. Если нужны контракты или агент, UI обращается к соответствующему API Proxy.
5. UI принимает ответ текущего запроса; native-изменение проходит свои guards.

У диалога, навыков и генерации разные маршруты и правила отмены. Не переносите
результат между запусками и не объявляйте client-only отмену остановкой сервера.

## Где искать код

| Задача | Точка входа |
| --- | --- |
| Native bridge и сообщения | [`src/code.ts`](../src/code.ts) |
| HTTP-клиенты, связь вкладок и main | [`src/ui.js`](../src/ui.js) |
| Интерфейс и состояние | [`src/design-check/`](../src/design-check) |
| Обход и проверка документа | [`src/document-audit/`](../src/document-audit), [`src/area-scan.ts`](../src/area-scan.ts) |
| Контрактный runtime | [`src/runtime.js`](../src/runtime.js), [`packages/component-contract-core/`](../packages/component-contract-core) |
| Отчёты и findings | [`src/audit-report.js`](../src/audit-report.js), [`src/finding-presentation.js`](../src/finding-presentation.js) |
| Диалог и Markdown | [`src/design-check/dialogue-port.js`](../src/design-check/dialogue-port.js), [`src/design-check/markdown.js`](../src/design-check/markdown.js) |
| Генерация | [`src/generation/`](../src/generation), [`packages/generation-core/`](../packages/generation-core) |
| Адаптеры | [`packages/adapter-figma/`](../packages/adapter-figma), [`packages/adapter-frontend/`](../packages/adapter-frontend) |
| Навыки | [`src/skills/`](../src/skills), [`skills/`](../skills) |
| Проверки и сборка | [`tests/`](../tests), [`build.js`](../build.js), [`package.json`](../package.json) |

`src/v3-binding` и прежние версии в именах протоколов — действующие совместимые
части проекта. Не удаляйте их по имени. В Figma main запрещён object spread;
точные ограничения указаны в [AGENTS.md](../AGENTS.md).

## Запуск и проверка

Для полного gate связанного Proxy отдельно задайте `APOLLO_SKILL_SOURCE_ROOT`.
Это legacy skill input, который не выводится из `APOLLO_PROJECT_ROOT`. Текущий
Apollo checkout не содержит `.agents/skills/apollo-design-validator`; используйте
проверенный tracked root собственного Proxy
`codex-workspace/.agents/skills/apollo-design-validator`, с полным путём и
checksum до/после. Явный missing/invalid override завершается ошибкой до записи.

```bash
npm ci
npm run validate
```

`validate` выполняет type-check → build → тесты. Для полного прогона нужен
соседний checkout Proxy по [структуре старта](AGENT_START_PROMPT.md).
Build создаёт `dist/code.js`, `dist/ui.html` и runtime/adapter bundles.
Плагин импортируется через [`manifest.json`](../manifest.json).
После сборки перезапустите окно плагина: открытый UI сам не обновляется.

Текущий клиент использует `http://localhost:3001`; разрешённый домен закреплён
в manifest. Другой dev-порт требует согласовать клиент и manifest, а не только
сменить PORT у сервера. Сборка плагина не устанавливает данные и знания Proxy.

Проверки по типу изменения: [TESTING.md](TESTING.md). Генерация:
[GENERATION.md](GENERATION.md). Диалог: [AGENT_START_ASK.md](AGENT_START_ASK.md).
Native diagnostics включаются отдельно; они не нужны обычной сборке.

## Текущее состояние и передача

Сверьте SHA исходников, фактическую сборку Figma, `/health`, runtime profile
и `dataId` Proxy. Публичный main, checkout и установленная поставка могут
различаться. Исторические пилоты и фиксированные числа компонентов не заменяют
текущие API и проверку конкретной пары версий.

Изменения runtime/норм и выпуск — отдельные действия. Внешний участник работает
через PR по [CONTRIBUTING.md](../CONTRIBUTING.md); владелец делает итоговое ревью.
