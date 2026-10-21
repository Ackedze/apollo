# Профиль исполнения контрактов Apollo

Профиль 0.4.0 от 01.10.2026 принимает главный авторский manual и read-only факты, компилирует их общим core Editor и исполняет проекцию. Он не заменяет authoring JSON Schema,
не подтверждает публикацию и не разрешает принимать нормативные правила клиента
в будущих endpoints прокси.

## Нормативный источник и совместимость

Публичный вход — `component-contract-source` со схемой `apollo.component-contract-source.v1-experimental`: неизменённый manual `apollo.component-contract.manual.v2-experimental`, compact variant evidence и авторские dependency packages. Importer Editor извлекает анатомию из read-only Athena facts или сохранённых compact facts. Нормы берутся только из manual. Панель также принимает authoring ZIP и manual с JSON-фактами; отдельный compiled не принимается. Без manual каждого child, фактов или reviewed правил аудит не запускается. Импорт v1 с неявной миграцией запрещён.

Проекция генерируется shared `compileManualSource`, проходит runtime gate и сверяется с производным release cache. Source hash фиксирует manual, факты, зависимости и optional historical exporter stamp. Для того же manual stamp проверяет всю проекцию; устаревший кэш другого manual игнорируется и пересобирается из нового источника.

Внутренние документы `component-contract` имеют схему
`apollo.component-contract.v2.1-experimental`, ready-статусом и manualSourceHash.
У каждой исполняемой проверки обязаны быть source anchor на reviewed policy,
совпадающий source checksum, положительная revision, active authority и presentation.
Детерминированные проверки не могут принадлежать policy-only/delegated/context-only
маршрутам. Каждый predicate source должен иметь RuleIR либо явную запись
nonExecutableRules. Coverage counts должны соответствовать содержимому документа.

Snapshot profiles: `component-facts-v2`, `variant-facts-v3`, `variant-facts-v4`,
`dependency-facts-v5`. Поддержанные версии runtime features перечислены в
`src/contract-profile.js` и соответствуют текущему core Editor. Неизвестная
feature или версия отклоняется. И декларации capabilities, и выражения RuleIR
проверяются по каноническому Predicate Engine; текст нормы не превращается
в executable predicate.

`auto` — сохранённый запрос authoring source. Его compiled predicates уже
создаются из manual общим compiler и находятся в `rules`. Allowed auto policy
может оставаться policy-only согласно текущему compiler. Полнота источника
и полнота конкретного snapshot остаются независимыми состояниями.

## Факты и результат

API `auditContractSnapshot` принимает один component snapshot. Плагин обходит видимое поддерево любого выделения, разрешает ключи через Proxy и вызывает этот API для каждого instance, сохраняя независимые snapshots. Компонент
разрешается по canonical/representation/variant keys самого контракта;
отображаемое имя не участвует в routing. Профиль разрешает embedded
ComponentContract dependencies: shared core проверяет fixed bindings и pins;
каждый child отдельно проходит ready/source/runtime gate. Циклы, глубина более
4, closure более 32 вхождений, конфликтующие версии и RuleID разных components
с одинаковым ID отклоняются. Captures ограничены 8 зависимостями и 500 узлами
на snapshot. Keys дочерних компонентов не маршрутизируют родительский контракт.
Независимый child actual сверяется с соответствующим host subtree и modes.
Его оценки сохраняют собственный RuleID, pin provenance и occurrence identity;
focus rebased общим core в host coordinates.

Подготовку фактов и исполнение выполняет общий runtime Editor. Входные объекты
не изменяются. В component result engine evaluations возвращаются без переписывания; area result добавляет scope и глобальный evaluationId, сохраняя исходный ID в componentEvaluationId; внешний
envelope отдельно показывает pending sources, missing rules, uncertainty,
truncated capture и неполные dependency runs. Поле `executionComplete`
имеет scope `compiled-predicate-execution`: все RuleIR получили определённые
результаты, а pending routes явно отсутствуют. Это не отсутствие нарушений
и не эквивалент полного Editor scenarioCoverage. Доказательство границ
policy-only, scope внешнего содержимого и общее покрытие страницы требуют
отдельного coverage adapter на следующем этапе. Область имеет отдельный scope `available-component-contracts-in-selected-area`: полный обход, хотя бы один checked instance, отсутствие notChecked и полное executionComplete компонентов. Лимиты обхода — 10 000 узлов и 1000 компонентов; пустой, усечённый или частичный обход не даёт complete. Скрытые ветки пропускаются. COMPONENT definitions не подменяются instance facts.

Unknown facts сохраняют результат engine и неполное покрытие. `delegated`
не означает automatic pass: такой маршрут остаётся pending даже после объяснения Codex.
Универсальный оператор, отсутствующий в runtime, не подменяется legacy-проверкой.

## Исторический replay

`replayArchivedReport` — отдельный диагностический API. Он воспроизводит ровно
`runtime.evaluatedContract` сохранённого Editor report, включая историческую
authoring activation draft rules. Этот путь не используется `auditContractSnapshot`
и не ослабляет runtime gate, отклоняющий draft.

Для Spinner проверяются bytes checksums всех шести preserved captures,
полное равенство исторического engine output и семантическое равенство r8
результатов. В сравнении r7 → r8 исключаются только `evaluationId` и
`ruleRevision`; traces, classifications, applicability, focus и coverage
сравниваются полностью. Исходные архивы и contract packages не меняются.

## Локальный release и Codex

Новый локальный manifest фиксирует SHA-256 каждого artifact, canonical contract
hash, source package hash, manualSourceHash, generated facts hash, runtime profile 0.4.0, standalone/dependency scope,
полный dependency index и все routing keys. Каждый embedded pin должен
совпадать с отдельно индексируемым child package по revision и обоим hashes.
Ready-статус правил, статус Figma representation и published-статус release
остаются разными состояниями. Пилот разрешает ready contract с draft
representation, сохраняя `local-pilot`, `published=false`; production gate
этим не определяется.

Build использует только code из Apollo repository и фиксирует его hashes.
Editor и Apollo собирают package `component-contract-core` 0.1.0. Proxy
загружает checksum-pinned bundle того же runtime из local release. Client
сохраняет release identity в audit; изменение release вызывает 409 перед Codex.

POST `/v2/contracts/resolve` получает `components: [{componentKey, componentSetKey}]` (не более 1000), разрешает main/set keys по точному индексу, дедуплицирует пары и пакеты. Ответ содержит `releaseId`, `contracts: [{source, release}]` и `resolutions` со статусом `resolved`, `not-found` или `identity-conflict`. Main и set разных packages не выбираются произвольно. Embedded source closure включает все pinned dependencies. Пустой массив с `releaseId` проверяет неизменность release перед завершением аудита; несовпадение даёт 409. Старый GET по package ID сохраняется.

Общий area report сохраняет отдельные component auditId и pins. Объяснение из панели запускается только явно для выбранного проверенного компонента; смена компонента или выделения отбрасывает устаревший ответ.

POST `/v2/contracts/explain` получает frozen snapshot и release pins, заново
вычисляет deterministic result и создаёт data-only packet из compiled contract,
facts и evaluations. Codex не получает legacy knowledge directories.
Перед Codex пакет преобразуется в `apollo.contract-agent-projection.v1-experimental`:
RuleIR, source policies и pins сохранены полностью, variant facts ограничены
ключами выбранных snapshots. Unselected variants, unused structures и asset
catalogs явно обозначены как omitted. Проекция не исполняется и не заменяет
полный compiled contract при повторном аудите. Это позволяет объяснить Button
без передачи каталога всех его вариантов. Лимит prompt остаётся 900 000 символов.
Snapshot projection сохраняет actual facts узлов, в том числе before state;
baseline, reference и child snapshot bodies заменены явными omissions/indexes.
Нарушения и неизвестные оценки сохраняют полный trace. Остальные оценки
представлены таблицей `resolvedEvaluations` с точными IDs, RuleID, revision,
classification, subject/focus IDs и ссылкой на `dependencyEvidence`; reason
сохранён, подробный trace и повторные presentation fields опущены.
Frozen snapshot и полный engine result остаются исходными в Proxy и JSON-отчёте.
Ответ имеет summary и findings с exact RuleID/evaluationId; несовпадающие
references отклоняются. Ответ не изменяет deterministic result и не закрывает
pending coverage. Исполнение delegated rules и production updater/rollback
остаются следующими этапами.
