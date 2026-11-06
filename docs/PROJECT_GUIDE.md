# Карта Apollo для разработчика

Apollo — Figma-плагин. Он читает документ через native API, показывает результаты
проверок, общается с Apollo Proxy и применяет разрешённые изменения в Figma.
Общий старт: [AGENT_START_PROMPT.md](AGENT_START_PROMPT.md).
Установка и данные: [DESIGNER_START.md](DESIGNER_START.md).

## Функции и границы

| Функция | Что выполняет | Ограничение |
| --- | --- | --- |
| Дизайн | Native-сбор, сравнение и правила V3; компоненты, стили, токены, findings и JSON | Неполное покрытие не означает отсутствие нарушений |
| Спросить | Вопрос и история → Proxy → выбранный агент → ответ | Выделение и весь audit report не передаются автоматически |
| Генерация | Навык лендинга: диалог, MCP, независимое чтение результата и правки секций | Созданный Draft не становится Ready |
| Тулзы | Отдельные сценарии; переименование слоёв с предложениями и выбранным применением | Навык не даёт агенту произвольную запись в Figma |
| Данные Apollo | Метаданные контрактов и статусы подключения по адаптерам | Наличие manual не доказывает готовность mapping |

Обычная проверка и чтение индекса данных не запускают модель. AI-пояснения,
диалог, агентская генерация и анализ навыка — отдельные запросы. Проверку V3
выполняет native runtime плагина; Proxy поставляет каталоги и правила из
установленного пакета. Legacy `rules.json` / `composition-contract.json`
используют существующие исполнители V3; это не `contract.manual.json` пилота V4.
Точный набор определяется активной поставкой, а не списком в README.

Генерация лендингов использует канонический навык DS AB и собственный Codex/Figma MCP.
Прежние исполнители генерации, включая frontend, отключены. Модули чтения контрактов
и mapping сохранены. Условия подключения и диагностика: [LANDING.md](LANDING.md).

## Путь выполнения

1. UI принимает действие пользователя и создаёт request/correlation ID.
2. Для native-чтения UI передаёт типизированное сообщение в Figma main.
3. Main собирает факты и проверяет актуальность/владение. UI получает результат.
4. Данные V3 читаются через `/v1/audit-data`; диалог, тексты и навыки обращаются к своим API Proxy.
5. UI принимает ответ текущего запроса; native-изменение проходит свои guards.

У диалога, навыков и генерации разные маршруты и правила отмены. Не переносите
результат между запусками и не объявляйте client-only отмену остановкой сервера.

## Где искать код

| Задача | Точка входа |
| --- | --- |
| Native bridge и сообщения | [`src/code.ts`](../src/code.ts) |
| HTTP-клиенты, связь вкладок и main | [`src/ui.js`](../src/ui.js) |
| Интерфейс и состояние | [`src/design-check/`](../src/design-check) |
| Активная проверка V3 | [`src/v3-audit/native-port.ts`](../src/v3-audit/native-port.ts), [`entry.ts`](../src/v3-audit/entry.ts), [`ui-client.js`](../src/v3-audit/ui-client.js) |
| Сохранённый исторический обход | [`src/document-audit/`](../src/document-audit), [`src/area-scan.ts`](../src/area-scan.ts); не fallback V3 |
| Контрактный runtime | [`src/runtime.js`](../src/runtime.js), [`packages/component-contract-core/`](../packages/component-contract-core) |
| Текущие findings/JSON/тексты | [`src/v3-audit/ui-model.js`](../src/v3-audit/ui-model.js), [`V3Findings.tsx`](../src/v3-audit/V3Findings.tsx), [`TextAudit.tsx`](../src/v3-audit/TextAudit.tsx) |
| Диалог и Markdown | [`src/design-check/dialogue-port.js`](../src/design-check/dialogue-port.js), [`src/design-check/markdown.js`](../src/design-check/markdown.js) |
| Генерация лендингов | [`src/landing/`](../src/landing), [`instructions/landing/`](../instructions/landing) |
| Исторические форматы и чтение mapping | [`src/generation/`](../src/generation), [`packages/generation-core/`](../packages/generation-core) |
| Тулзы | [`src/skills/`](../src/skills), [`skills/`](../skills) |
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
