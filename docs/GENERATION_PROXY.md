# Generation context через локальный Proxy

Подключён read-only этап: main → UI → `/generation/context` → trusted Node reader.
Endpoint не вызывает legacy semantic planner, агента, публикацию или запись
в Figma/фронт. Возвращаются canonical context и hashes спеки/контекста.
Проверяются свежесть Code Connect checkout/lock/архивов, сборка Apollo,
канонический Ready source, точные dependency pins и producer preflight каждого
объявленного состояния. При ошибке возвращается bounded code без private source,
путей и деталей исключения. Один активный запрос; stale/cancel/timeouts закрыты.

## Конфигурация сервера

По умолчанию используется workplace рядом с source checkout Proxy либо
`~/Desktop/workplace` для установленного ApolloProxyControl. Только сервер может
изменить конфигурацию переменными окружения:

- `APOLLO_V4_WORKSPACE_ROOT` — workplace;
- `APOLLO_V4_PROJECT_ROOT` — собранный Apollo;
- `APOLLO_V4_CODE_ROOT` — checkout arui-private;
- `APOLLO_V4_CONTRACT_CATALOG` — current-contract-packages.

Frontend/Figma target, arbitrary URL/path/source или prepared context из запроса
не принимаются. Нужно пересобрать Apollo, generation-core и contract-core;
сервер не хранит старые bundled modules после новой сборки.

## Acceptance и дальнейшие action points

1. Reader подключён к реальной панели; JSON/код ошибки проходят через UI bridge.
2. На текущем пакете ожидается `SOURCE_COMPILE`: это реальный source gate,
   исполнения и записи нет. Public API не объявляется подтверждённым для
   конкретной спеки до producer preflight всех её состояний.
3. Внешний frontend host требует собранный приватный пакет, matching peers/lock,
   изолированный workspace, DOM/state/geometry verifier и rollback ledger.
   Установленные Apollo/esbuild/Chrome не заменяют private package.
4. Native Figma host требует принятые slot/occurrence identities, action/state
   bindings и source capture/evaluator recipes. Пустые handler IDs в registry
   не заполняются догадками. Подробности: `GENERATION_HOST_PORTS.md`.
5. После source/passport/native/toolchain handoff выполнить настоящий desktop
   пилот для двух целей. Product labels/actions/transitions/viewport должны быть
   приняты; пример ScreenSpec сохраняет unresolved и не является этим пилотом.

Исторически на read-only этапе оба порта были unavailable. После NEXT-04 native
Figma host подключён; frontend остаётся unavailable. Accepted native recipes и
Ready/source gates не подтверждены, поэтому создание на текущем пакете выключено.
Точный native handoff: `GENERATION_NATIVE_HOST.md`.

NEXT-05 adds separate frontend execute/cancel/artifact routes, connected in the current local ApolloProxyControl. Context endpoint remains read-only. Exact DTOs, accepted profile boundary, validation and current stale/source gates: [GENERATION_FRONTEND_HOST](GENERATION_FRONTEND_HOST.md).
