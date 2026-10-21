# Apollo

Основной плагин Figma: [manifest.json](manifest.json), ID публикации **1616850453760090547**. Приложение находится непосредственно в корне репозитория.

```sh
npm ci
npm run validate
```

Импортируй корневой manifest в Figma. Сборка создаёт `dist/code.js`, `dist/ui.html` и серверный `dist/runtime.cjs`.

- `src/` — проверка макетов, интерфейс и генерация.
- `packages/` — общий ComponentContract Core, планирование и адаптеры.
- `scripts/`, `tests/` — сборка, проверки и инструменты.
- Apollo Proxy расположен в `services/apollo-proxy` workspace и выбирает этот checkout через `APOLLO_PROJECT_ROOT`.
- Контракты и история Proxy хранятся отдельно от кода. Подключение mapping не повышает Draft до Ready.

При проверке контрактов выбранная настройка «Платформа» передаётся как явный
`ViewportClass`, если контракт объявляет такой вход. Она не меняет платформу
захваченного компонента; несовпадение Desktop/MobileWeb остаётся нарушением.
Диагностика свойств зависимостей показывает имя свойства и компонента вместо
служебного пути; исходный trace сохраняется в отчёте.

[Правила переноса и совместимость](MIGRATION.md) · [Архитектурный бэклог](docs/ARCHITECTURE_BACKLOG.md) · [История разработки](docs/DEVELOPMENT_HISTORY.md)

Команды сборки не публикуют плагин и не выполняют push. Текущий интерфейс сохраняет проверки, вопросы и генерацию из прежнего пилота.

«Спросить» использует локального агента, выбранного в окне «О прокси»: Codex или Claude.
Старая скрытая настройка чата Langflow автоматически переводится на локальный маршрут
при открытии плагина. История текущего диалога и сессия сохраняются; отдельный
HTTP API Langflow остаётся доступен для клиентов, которые выбирают его явно.

`npm run build` также собирает внутренние Core, Generation Core, оба адаптера и Pattern Core. Обычная
сборка не требует соседних checkout дизайн-системы или `arui-private`.
Версии инструкций генерации хранятся в `skills/` и сверяются с существующим
`skill-profile.json`; личная папка установленных навыков разработчика не нужна.
Для cross-repository release-тестов полного `npm run validate` нужен checkout
Proxy по структуре из [инструкции разработчику](docs/AGENT_START_ASK.md).
Read-only native diagnostics включаются отдельно через `APOLLO_NATIVE_DIAGNOSTICS=1`;
для этого режима явно задаются `APOLLO_CODE_CONNECT_REPO` и
`APOLLO_CONTRACT_CATALOG_PATH` (абсолютные пути или пути относительно Apollo).
Без opt-in диагностический инструмент сообщает, что его входы недоступны;
обычная проверка, чат и генерация используют свои штатные подключения.

### Native nested instance replacement

Core0.1.23 supports the explicit `instanceReplacementDomain` opt-in for a root-owned native instance; the Editor0.2.108 authoring format is unchanged. Family/VARIANT domains remain predicates; missing source proof stays UNKNOWN. A foreign component body does not inherit the parent baseline. The Editor preserves imported replacement domains during rule edits. This support does not grant library membership, generation acceptance or runtime installation.

Apollo's runtime profile accepts version 1 of this feature and validates its binding descriptors through the same Core validator used during evaluation. Unsupported versions and malformed or unversioned descriptors are rejected before loading a contract.

An explicitly scoped replacement becomes inactive only when the published variant, captured root and reference prove the selector value. A variant without that opt-in keeps its ordinary baseline checks; an editable value or missing binding alone never establishes inactivity.
