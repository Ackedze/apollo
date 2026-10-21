# ComponentContract core 0.1.21

Core **0.1.21** переносит общий opt-in `editorDependencyUsages.version=1`
из Editor: parent-owned text metrics читаются только из доказанного fixed child.
Сохранены producer `0.2.104`, exact source/cache hashes и UNKNOWN при неполных
capture/identity/text-port данных. Лимиты задаёт manual родителя; глобальные
нормы Link не меняются. Draft dependency admission и Ready остаются отдельными
гейтами. Совместимость: `CC-COMPAT-DEPENDENCY-USAGE-01`.

Общий SHA-256 использует постоянные константы и скалярный round state.
UTF-8, canonical serialization, хеши и идентификаторы прежние; новых кэшей нет.
Совместимость: `CC-COMPAT-SHA256-PERFORMANCE-01`.

Core **0.1.20** / Editor **0.2.107** сохраняют независимо доказанный baseline
вложенного owner и точную идентичность разрешённого public swap root и объявленных
configured targets. RESET пересчитывает только производную неопределённость;
неизвестные actual facts, native owner/source и independent-reference guards
сохраняются. Нормы и контрактные hashes не меняются; native/Ready приёмка отдельная.
Совместимость: `CC-COMPAT-NESTED-OWNER-TARGETS-01`.

Core 0.1.16 / Editor 0.2.100: `buildEditorValidationReport` поддерживает явную
пятую опцию `{hiddenTargetCoverageVersion:1}`. Только заново доказанный
present/resolved скрытый дочерний target в scope self исключается из ложной
missing-target диагностики. Неизвестные/подменённые/неполные цели, structural
assertions и скрытый visibility override с отсутствующим/отличным baseline
сохраняют прежние результаты. Raw Predicate Engine и compiled artifacts не
меняются. Без опции historical Editor reports воспроизводятся по старым правилам;
новый отчёт сохраняет версию в `scenarioCoverage` и downloadable summary.

Core **0.1.15 / Editor 0.2.99** добавляет явный opt-in
`declaredTargetConfigurationVersion=1` к identity policy v3. Каждая привязка
содержит `configurationReferenceHash` и прежние точные reference/portable pins.
Новый hash исключает только значения объявленных корневых TEXT/BOOLEAN при
совпадении типов и обоих root maps; имена, presence/type, source/owner,
структура, nested properties, VARIANT и INSTANCE_SWAP остаются закреплены.
Значение конфигурации проверяется собственными правилами и independent effective
baseline; identity hash не выдаёт разрешение на изменение. Без нового marker
историческая семантика hash сохраняется. Неизвестный marker, неполные pins и
неподходящий exporter отклоняются. Вложенные Line/icon ports требуют отдельной
проверки; этот opt-in их значения не исключает.

Core 0.1.12 / Editor 0.2.93 поддерживают `declaredTargetIdentityVersion=2` и
явный `portableReferenceHash` в declared binding. Hash исключает только два
типизированных file-local main IDs. Остальные reference facts и published source
addresses закреплены; actual и independent reference отдельно подтверждают
ближайшего текущего owner. Policy v1 и bindings без portable pin сохраняют exact
поведение. Новая версия не меняет нормы, permissions или Draft/live/release gates.

Общее ядро ComponentContract Editor и Apollo. Пакет находится в том же
репозитории, что Apollo; код не читает исходники Editor, Proxy или нормативные
каталоги. Используются зависимости и lockfile корневого Apollo.

Локальный PARITY-014 добавляет versioned сравнение host variable modes:
fresh `instanceContentReferences` v4 содержит `hostContextVariableModesVersion=1`,
а `hostVariableUsageV1` каждого узла фиксирует bindings → collection identity,
наблюдённую отдельно в каждом independent stage. Сравнение использует только
modes/catalog коллекций с подтверждённым локальным binding; raw facts не меняются.
Selected-mode alias chains включают косвенно используемые collections; циклы,
missing references и required mode остаются incomplete. Без marker прежние reports
сохраняют точный replay; неизвестная версия отклоняется. Default mode не является
resolved evidence. Нормы, compiler/producer и pins сохранены. Gate 68/68;
Editor 819/819 и bundled Apollo 144/144 пройдены, fresh Figma/release открыты.

```sh
npm ci
npm run core:validate
```

В `dist` собираются `core.cjs`, `runtime.cjs`, `predicate.cjs`, `capture.cjs`.
`runtime` подготавливает факты и исполняет compiled contracts. `capture` содержит
общий захват Figma instance: actual, независимый library reference, modes,
вариантное evidence, вложенные reference и ограниченный native SLOT scope.
Функции capture вызываются только внутри Plugin API.

Core 0.1.9 / Editor 0.2.90 добавляет opt-in
`instanceMainComponentAliasesVersion=1` для active identity locks; compiler
требует producer 0.2.90. Разные local main IDs сопоставляются только через
одинаковые canonical component key/set и уникальный owner-relative source node.
Source identity каждой стороны обязана совпадать с её собственным local owner;
foreign, unknown и ambiguous proof остаются gap. Baseline восстанавливается
только из независимого host capture, который воспроизводит исходный
variantReference и modes. Имена, sibling order и глобальный поиск key не служат
доказательством. Consumer пересчитывает marker, игнорируя stored source flag.
Parent profile наследуется при выполнении exact pinned children без изменения
их contracts/hashes. Historical unmarked replay прежний; recompile активного
lock меняет compiled wire, сохраняя manual source hash и child pins.
Локальные gates и consumer parity пройдены; fresh Figma/release — PARITY-018.

Core 0.1.8 / Editor 0.2.88 добавляет opt-in exact icon identity lock:
`dependencyDomain.field=changed`, только `values=[false]`, явные swap ports и
`require-domain`; mappings, catalog exemptions и fixed child pins запрещены.
Bindings помечены `identityLock=true`, policy `assetIdentityLockVersion=1`,
minimum producer 0.2.88. Actual asset сравнивается с independent library port
текущего host variant; proven ancestor variant stage поддерживается, собственный
reference заменённого asset не меняет нормативный эталон. Typed subject condition
остаётся на semantic цели. Missing/ambiguous evidence даёт human-review.
Новый профиль разрешает восстановить только independently proven boundary root
при partial child coverage, сохраняя неполную проверку потомков. Historical
contracts/replay и pins сохраняются. Приёмка — APOLLO-V4-PARITY-017.

Core 0.1.5 / Editor 0.2.80 исправляет production capture collections: Figma
provenance root ID не сравнивается с local graph ID. Две доказанные root aliases
исполняются через opt-in `rootTargetAliasesVersion=1` при
`occurrenceAddressVersion=1`; compiler требует producer 0.2.80. Selectors и
списки ролей используют пересчитываемые alias facts; один root считается один раз.
Неподдержанный формат отклоняется явно, legacy IR/replay сохраняется.
Child capture сравнивает mode catalog только для фактически используемых
collections; actual modes, required catalog metadata, bindings, styles, identity
и graph остаются строгими. Source manual и exact dependency pins не меняются.
Editor 786/786, core 5/5, v4 107/107; свежий live и release/Proxy — PARITY-011.

Core 0.1.4 / Editor 0.2.79 исправляет authoring scope `memberCollection` и host
anchor `dependencyDomain`:
resolved root alias с пустой lineage и root-only hints допускается без literal
role `root`. Nested/unknown/conflicting aliases отклоняются; historical reserved
role сохраняет прежний маршрут. Runtime независимо доказывает owner/source/
reference identity. Schema/runtime versions и compiled producer minimum прежние;
v4 source compile/execution проверен. Release/Proxy/live — PARITY-010.

Core 0.1.2 / Editor 0.2.76 вводит `kind=direct-child` и
`directChildDependenciesVersion=1`: owner/member/representation bindings,
identity до visibility, exact child pin/capture и защита повторного исполнения.
Новый capture budget 16 допускает 4 children + 8 транзитивных captures;
legacy fixed-nested budget 8 и семантика сохраняются.

Core 0.1.3 / Editor 0.2.77 добавляет typed `memberCollection` и
`memberCollectionsVersion=1`: закрытый состав включая hidden, visible count,
typed filters/conditions, first/last, property domain, host mapping/requirement.
Состав проверяется по полному ID graph и independent source/reference proof;
duplicate source обнаруживается даже при коллизии occurrence paths. Потеря
evidence одного sibling не подавляет отдельно доказанный child finding.
Known violation сохраняется вместе с missing evidence и неполным coverage.
`dependency.subjectCondition` / `dependencySubjectConditionsVersion=1` сужает
asset/child check по typed свойству доказанной semantic цели. VARIANT значения
остаются строками; transforms объявляются явно. Старые unmarked отчёты не
получают новый evidence задним числом. Локальные Editor/v4 gates пройдены;
PARITY-006/007/008/010 сохраняют отдельную release/Proxy/live приёмку.

Core 0.1.1 / Editor 0.2.75 вводит opt-in `occurrenceAddressVersion=1`:
одноимённые siblings сохраняются отдельно в snapshot/reference/catalog.
Source identity расширена на owned FRAME/TEXT/SLOT; imported owners проверяются
независимым pristine capture независимо от имён. `@source` — owner-relative
capture address, `@local` и нормализованный Athena `@catalog` — только хранение.
Они не подменяют proof of correspondence. Generated evidence хранит diagnostic
names; structural agreement не назначает роли неоднозначным siblings.
Reviewed `variantHints` связывает semantic target с одним library variant и
representation, без переноса по child index. Старые unmarked captures и уникальные
catalog shapes сохраняют прежний формат. Compiled runtime policy объявляет новую
версию; v4 consumer принимает version=1 и отклоняет неподдерживаемые bindings.
Release/Proxy и live ButtonsGroup acceptance отслеживаются в PARITY-007.

С 01.10.2026 общий capture записывает `instanceSourceIdentityVersion=1` и
проверенную связь вложенного instance с source layer ближайшего main component.
Inherited ID проверяется по полной цепочке родителей; обход source останавливается
на nested instance и SLOT. Correspondence различает повторяющиеся равные keys
только по уникальному свидетельству на обеих независимых сторонах. Foreign,
duplicate, unknown и противоречивые ports не получают baseline. Matching не
разрешает overrides и не переписывает actual names/values. Старые снимки без
нового marker сохраняют прежний результат, включая неполную проверку.
Для remote main локальные child IDs не считаются библиотечными source IDs:
используемые imported owners запрашивают отдельный pristine instance того же main
в capture 0.1.1; прежний 0.1.0 запрашивал его для ambiguous sibling groups.
Его полная bounded topology и identity подтверждают namespace; reference всегда
удаляется. Actual instance не может выступать собственным source reference.
Editor consumer: 0.2.73. Полный capture в мастерской дал 6/6 matches и 17
определённых проверок, включая clipping/modal violations. Контроль/reset ещё
требуют свежих Editor reports; нормы mobile CorporateContent не изменены.

Editor использует тонкие source reexports в своём `src/core`; Apollo
собирает эти же исходники. Формирование Editor ZIP с версией приложения
остаётся в Editor `validation-export.ts`. Полный Editor regression gate:
699 тестов прошли после переноса. SHA исходных модулей и версия Editor
зафиксированы в `source-migration.json`, включая сохранённый app-specific export.

Predicate interpreter перенесён из существующего Proxy без изменения алгоритмов;
Node bootstrap заменён статическим capability registry и общим browser-safe
SHA-256. Legacy Proxy продолжает использовать свой прежний interpreter.
Новый маршрут Proxy получает собранный runtime из локального v4 release.
Независимые нормативные проверки для Apollo здесь не создаются.

Исторический Spinner replay выполняется в приложении v4: шесть сохранённых
снимков и 1008 evaluations совпадают. Hash-тесты проверяют Node/браузерную
эквивалентность, Unicode и отсутствие TextEncoder. Main bundle v4 отдельно
проверяется на отсутствие object spread.

Это private workspace package. Публикация в registry, декларации типов для
внешних потребителей и независимый release lifecycle пока не вводились.

NEXT-02 добавляет closed v1 representation evidence, typed owned/SLOT code bindings
и verified historical projection/lossless authoring export. Legacy schema/predicate
wire без opt-in полей прежний; core 76/76, Editor 820/820, v4 182/182.
Подробности и owner gates: [handoff](../../docs/GENERATION_CODE_EVIDENCE.md).

Объявленные вложенные targets identity v1/v2/v3 подтверждаются по native source
identity всей цепочки владельцев до root. Равные варианты в разных ветках
различаются по native occurrence каждого владельца. Дубликаты одной occurrence
остаются ambiguous; отсутствующая, чужая или неизвестная identity даёт UNKNOWN.
Имена, порядок соседей и visibility не подменяют identity/cardinality.
