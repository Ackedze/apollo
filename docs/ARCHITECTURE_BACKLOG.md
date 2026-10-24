# Apollo Architecture Backlog

## Apollo: совместимость с ComponentContract Editor

### CC-COMPAT-NATIVE-SOURCE-CONTINUITY-01 — явные native targets после смены варианта

23.10.2026, nested-area correction (Core 0.1.23 / Editor 0.2.108): manual
metadata can opt into existing canonical-key main aliases without adding an
unrelated asset rule. Area audits pass exact physical-node correspondence to
`validatedDependencyCapture`; only proven internal parts inherit the enclosing
independent baseline. Native target resolution preserves that configuration
for the same canonical identity, while changed variants retain their own
independent reference. SLOT/foreign/missing/ambiguous contexts fail closed.
Norms, Draft/Ready and generation scope are unchanged. Acceptance: synthetic
owner/alias/actual-mutation regressions and retained report replay; installation
and native field result are recorded separately. No Editor UI change.

23.10.2026. Core **0.1.23**: opt-in `nativeSourceContinuityVersion=1`
восстанавливает INSTANCE/TEXT по объявленным source addresses, ближайшему
native owner и независимому matched lineage. Имена слоёв не доказывают identity;
foreign swap, SLOT, missing/ambiguous proof остаются UNKNOWN. Сочетание с
declared identity ledger в v1 отклоняется. Старый reader отвергает новый flag.
Editor **0.2.108** не изменялся; CLI ZIP roundtrip проверен. Переносимая
synthetic regression и retained replay подтверждают локальный scope;
Editor UI/integration, парная установка portable runtime + данных и native
приёмка ещё pending. Обычный Git data update runtime не заменяет.
Парная область: [Editor nested owner targets](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-nested-owner-targets-01--owner-baseline-и-точные-configured-targets-во-вложенных-проверках).

### CC-COMPAT-MANUAL-EDIT-DATES-01 — дата реального изменения manual

22.10.2026. Editor **0.2.108**, Core **0.1.23** без изменений. В Editor удаление
существующего правила и изменившийся quick policy «Защитить внутреннее устройство»
записывают `metadata.updatedAt` в UTC вместе с повышением revision. Создание,
повторный no-op, импорт/экспорт и перенос не получают выдуманной новой даты.
Три регрессии исполняют реальные UI handlers с настоящим core: до исправления
0/3, после 3/3. Полный configured gate и source/build pins фиксируются в final handoff
общего writer window ASA-028; публикация/установка Editor не заявлены.

Consumer impact: новая реальная правка меняет manual/hash обычным способом;
исторические manual dates, revision, ZIP и receipts не пересчитываются.
Apollo/Proxy уже читают `metadata.updatedAt`; новое поле или schema не нужны.
Collection reader допускает явный `archivePathBase: design-system_ab` для ZIP
рядом с canonical manual, сохраняя legacy входы и проверки paths/SHA/stale.

Парная запись: [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-manual-edit-dates-01--дата-реального-изменения-manual).
Проверено: Editor `npm run validate` **859/859**, Apollo configured
`APOLLO_PROJECT_ROOT=<accepted-main> npm run validate` **1188/1188**, без старого
native scope. Canonical15+3 и prepared delivery12 проверяются в закрытии
переноса. Runtime adoption и Ready отдельно.

ASA-028: точный перенос существующих standalone inputs и ссылки на один общий
accepted seed закрывают текущую раскладку. Выделение legacy BG/CC и всех
component-owned записей в самостоятельные редактируемые fragments потребует
отдельного producer decomposition/reassembly; этот будущий этап не реализован
и не является новой возможностью текущего runtime.

### CC-COMPAT-INSTANCE-PATH-PROJECTION-01 — облегчённый поиск native экземпляров

19.10.2026. **IMPLEMENTED / CONFIGURED_GATES_PASS / PLUGIN_BUILT / NATIVE_TIMING_PENDING**.
Core **0.1.20**, Editor **0.2.107**. General — единственный shared writer;
Contract Creation, Mapping, Generation, DesignCheck подтвердили HOLD.

`instanceAtPath` использовал полный `collectSceneNodes` только ради paths и
component/source identity. Новый внутренний projection `identity` сохраняет
тот же bounded topology, native SLOT frontier, main identity, pristine source
correspondence и финальный topology/handle readback, пропуская visual, TEXT,
variable/style facts. Этот projection не экспортируется как нормативный capture;
полные capture и anatomy freshness по-прежнему читают все факты. Общий механизм
не содержит веток по компонентам. Кеш эталонов и валидации не добавлялся.

Consumer impact: общая capture-реализация, Editor и Apollo main bundles; публичная
схема, source/compiled contracts, authority, UNKNOWN/coverage, baseline и cleanup
сохраняются. Новые регрессии запрещают повторное чтение unrelated actual facts
при поиске; на прежнем capture они воспроизводят дефект. Exact before/after
synthetic capture matrix **16/16** совпала целиком, включая failures, references,
mode context и cleanup. В базовом случае измеренные getter reads **74→38**;
это synthetic API count, не native latency. Нужны configured Core/Editor/V4/root
gates и новый пользовательский timing на той же области. Предыдущий замер
**31.693с** остаётся baseline; неизвестное ускорение не объявляется.
Evidence: `.local/apollo-general-2026-10-19/instance-path-resolution-optimization`.

Configured gates: Core **435**, Editor **877**, Apollo **1111**, root **81**
PASS. Три новые regression cases воспроизводятся на прежнем bundled capture и
проходят на новом; полная16-case before/after matrix совпала. Main/UI parser и
stale/cancel/focus/scoped recheck регрессии включены в V4 gate. Серверный runtime
побайтно прежний, Proxy PID65819 сохранён без restart; фактические11 metadata /
10 checking contracts и979 history files прочитаны. Новый native timing pending.

Парная запись: [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-instance-path-projection-01--облегчённый-поиск-native-экземпляров).

### CC-COMPAT-AUDIT-PERFORMANCE-01 — индексы, capture и компактный отчёт

Продолжение: локальные индексы происхождения и проверка pin.

19.10.2026. **IMPLEMENTED / CONFIGURED_GATES_PASS / INSTALLED / NATIVE_TIMING_PENDING**. Core **0.1.20**,
Editor **0.2.107**; общий writer General, четыре роли подтвердили HOLD.
CPU profile сохранённого audit показал повторный обход родителей/source ports
и одинаковый SHA-256 дочернего контракта для каждой его привязки.

В одном `compareInstanceCorrespondence` индексы parent/children/owner и source
ports переиспользуют только неизменные аргументы этого вызова. Source collector
один раз нормализует независимо захваченное remote pristine дерево и индексирует
точный `(source ID, type, parent index)` с прежним first-match. Runtime проверяет
pin один раз перед bindings той же зависимости; каждый child capture, identity,
owner baseline, binding, cycle/depth и coverage по-прежнему проверяются.
Между вызовами ничего не кешируется. Native reads, independent references,
SLOT/frontier, final freshness, source/cache guards и нормы не менялись.

Consumer impact: общий Core/Editor capture и evaluation, Apollo main/runtime
требуют пересборки; Proxy — проверки текущих runtime bytes и renewal процесса.
UI/data/контракты/Ready вне scope. Критерии закрытия: full configured
Core/Editor/V4/root gates, exact replay 12 retained components / 3181 evaluations,
полные before/after captures и отрицательные случаи, новая сводка native timings
для фактического ускорения Figma. Offline benchmark не подменяет этот замер.
Evidence: `.local/apollo-general-2026-10-19/audit-fact-rule-optimization`.
Парная запись: [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-audit-performance-01--индексы-capture-и-компактный-отчёт).

Configured gates: Core **438**, Editor **877**, V4 **1111**, root **81**;
Proxy data-package tests **12** PASS. Exact before/after capture16, retained
replay12/3181: все facts/hashes/traces/coverage прежние. Offline evaluation
в двух проходах **9.875→5.970с** (−39.5%); native Figma timing ещё не измерен.


19.10.2026. **IMPLEMENTED / CONFIGURED_GATES_PASS / INSTALLED / NATIVE_TIMING_PENDING**.
Core **0.1.20**, Editor **0.2.107**. General — единственный shared writer;
Contract Creation, Mapping, Generation и DesignCheck подтвердили HOLD.

Индекс узлов predicate живёт только в одном исполнении; runtime использует
индексы правил/узлов с прежним first-match. Capture читает все факты, сохраняет
независимый baseline и freshness, но anatomy-only перепроверка не строит полный
snapshot. Поиск путей индексирован; независимые TEXT reads ограничены 6 workers,
создание/удаление references остаётся последовательным. Подэтапы capture доступны
в timings вне нормативных hashes. Proxy повторно использует принятую компиляцию
по точным data/runtime hashes, перепроверяя index и bytes всех source/cache files
на каждом чтении; кеш ограничен и не разделяет изменяемые объекты с callers.

V4 передаёт UI `apollo.audit-summary.v1`: findings/allowed, полные counts,
coverage/UNKNOWN и данные переходов. Полный audit остаётся в main и доступен
отдельным коррелированным запросом; объяснение получает только выбранный снимок.
Экспорт по умолчанию — сводка; полная диагностика — отдельная кнопка и компактный
JSON прежнего полного формата. Stale/cancel/page/recheck guards сохраняются.
Bridge/render-to-frame timing выводится отдельно в console.

Consumer impact: Core/Editor/V4 bundles и Proxy runtime; нормы, data index,
contract archives, authority, Ready и набор проверок не изменяются. Новый каталог
правил и зависимости не добавлены. Требуются full configured gates, exact replay
12 frozen components и сохранность истории при разрешённом restart. Скорость
нативной проверки должна быть измерена следующим пользовательским прогоном.
Evidence: `.local/apollo-general-2026-10-19/audit-performance-implementation`.

Configured gates: Core **432**, Editor **877**, V4 **1111**, root **81**,
Proxy **50** PASS. Browser QA текущей панели **800/1024** PASS: сводка/full JSON
roundtrip, selected explain без автоматического agent call, stale reply,
keyboard focus и отсутствие нового горизонтального скролла. Фиксированная ширина
панели800 — прежнее ограничение;360px не принимается этим изменением. Старый
optional UI browser harness с прежней навигацией не является прошедшим gate.
Новый целевой harness: `tests/audit-report.browser.cjs`.
Exact replay12/3181 PASS. Размер обычной сводки **71,578B** вместо **77,096,687B**;
полный прежний формат доступен явно, без pretty whitespace. Один offline replay
evaluate **8.622→8.441с**, не native ускорение. Повторный reader Proxy
**1.225с→87.5мс** с hash guards. Proxy **PID65819**, dataId и все979 history files
сохранены. Runtime source writes закрыты; новый native timing ожидается.

### CC-COMPAT-SHA256-PERFORMANCE-01 — общий SHA-256 без сдвигов массивов

19.10.2026. **IMPLEMENTED / CONFIGURED_GATES_PASS / INSTALLED / NATIVE_TIMING_PENDING**. Core **0.1.20** /
Editor **0.2.107**. После native timing проверки области обнаружена высокая
стоимость общего SHA-256. Константы подготовлены один раз, round state обновляется
скалярными присваиваниями вместо unshift/pop; UTF-8 и canonicalization прежние.
Оптимизация общая, без веток для конкретных контрактов и без новых кэшей.

Consumer impact: меняются Core, Editor, Apollo bundles и исполняемый runtime
Proxy. Это runtime-обновление; data index, нормативные pins, evaluation IDs и
архивы не меняются. Нужны полный configured validate, exact replay сохранённого
отчёта, независимые SHA-256 vectors/Unicode/block boundaries, readback actual
runtime и сохранность истории при разрешённом restart. До свежего native замера
offline ускорение не является измерением скорости Figma. Ready не повышается.
General проверил 248 прямых SHA vectors против Node crypto и точный replay
12 компонентов до/после, включая хеши, evaluations, coverage и immutable inputs.
Один offline прогон evaluation: **14.112 → 9.345 с**; это не native latency.
Полные gates: Core **430**, Editor **877**, Apollo **1107**, root **81** PASS.
Первый V4 run получил OOM в UI test, повторный runner завис после завершения
children; точная причина инфраструктурного сбоя неизвестна. Isolated test PASS;
полный bounded run и затем обычный `npm run validate` с test-concurrency=4 PASS.
Состав тестов, heap и таймауты прежние. Обновлённый Proxy PID **45911** независимо
читает прежний dataId, 11 metadata rows и 10 checking contracts; все **979** history
files и .env сохранены. SOURCE_HASH прежний, Ready=false.
Парная запись: [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-sha256-performance-01--общий-sha-256).

### CC-COMPAT-AREA-CAPTURE-TIMINGS-01 — отключение лишнего PNG и замеры проверки

19.10.2026. **IMPLEMENTED / CONFIGURED_GATES_PASS / NATIVE_TIMING_RECORDED**. Core **0.1.20** /
Editor **0.2.107**. Общий capture принимает `includePreview=false`; только area
audit Apollo отключает PNG. По умолчанию Editor и остальные callers сохраняют
preview и прежнее поведение ошибок экспорта. Факты, независимые эталоны,
актуальность, cleanup и нормативные хеши сохраняются. `report.timings` отдельно
измеряет scan, resolve/compile, capture, freshness, evaluate, metadata, aggregation
и focus до доставки результата. Частичный refresh содержит только свежие замеры
с границей `scoped-contract-audit-before-merge`, без старого полного времени.

Consumer impact: меняются общий capture и сборка main плагина; это обновление
runtime, а не данных контрактов. Старые receipts не перепривязываются. Требуются
Core/Editor/Apollo gates и проверка реально используемых runtime файлов после
сборки. Нормы, authority, coverage, таймауты и generation behavior не меняются.
Критерий закрытия: ноль PNG exports в area audit, прежний Editor default,
тождественные факты/оценки/IDs, stale/cancel/cleanup regressions и свежие scoped
timings. Native ускорение объявляется только после повторного измерения.
Проверено General: полные gates Core **429**, Editor **877**, Apollo **1107**
и root **81** PASS; все **246** текущих build inputs совпадают. Регрессии
подтвердили ноль PNG exports, равенство остальных capture facts и audit IDs,
прежние ошибки Editor preview и свежие scoped timings. Серверные runtime/protocol/
postconditions bundles не изменились; текущий Proxy PID 32637 прочитал тот же
индекс и 10 checking contracts, все 979 history files сохранены без перезапуска.
Замеры относятся к завершённому audit до доставки; latency UI, прерванные
проверки и ускорение на Canvas этим gate не измерялись.
Получен отдельный native отчёт: 54.929 с до доставки, capture 18.583 с,
evaluate 15.769 с, resolve/verify-release 7.859 с. Это baseline до SHA-256
оптимизации; предыдущий отчёт не имел замеров, поэтому ускорение PNG не вычислялось.
Парная запись: [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-area-capture-timings-01--замеры-area-audit-и-необязательный-preview).

19.10.2026: runtime/data pilot на Core 0.1.20 / Editor 0.2.107 отделяет импорт
ZIP/mapping от runtime consumer. BenefitCard r11 устанавливается как Draft data
и допускается для стандартной Figma MCP композиции D/M. Проверка остаётся
неподключённой: source loader не воспроизводит `editorDependencyUsages` из cache
Editor 0.2.104; после этого сохраняется gate Ready у зависимостей. Это конкретные
runtime capability gaps, не повод менять нормы или повышать статусы пакетов.
Frontend блокируется отдельно отсутствующим mapping/API выбранной distribution.
Приёмка проверки: воспроизводимая source/cache проекция, явная поддержка допустимого
режима зависимостей и положительный/отрицательный replay; до этого cache не
используется для аудита. См. `docs/APOLLO_DATA_PACKAGES.md` workspace.

### CC-COMPAT-NESTED-OWNER-TARGETS-01 — owner baseline и точные configured targets во вложенных проверках

19.10.2026. **SHARED_IMPLEMENTATION / CONSUMER_AND_NATIVE_PENDING**.
Core **0.1.20** / Editor **0.2.107**; точный согласованный patch применён.
Общий reader сохраняет независимо доказанный effective baseline вложенного owner
через child preparation и alias restore; более локальные child references имеют
приоритет. Для baseline-dependent IR объявленная отсутствующая/устаревшая/чужая/unknown
owner evidence не превращается в standalone HUG или expected из actual.
При unadvertised отсутствии owner payload сохраняется прежняя независимая проверка;
actual-only IR не требует owner baseline. Historical captures сохраняют семантику.
Typed public swap сохраняет только корень явно разрешённого слота и его независимо
известные native VARIANT поля. Потомки не наследуют идентичность. Для configured
variant descendant требуется уже объявленная exact native alternative того же
semantic target, representation/family и выбранная owner occurrence с полным
independent native ancestry proof. Имена и componentSet сами по себе не доказательство.

При reprepare/RESET очищаются только старые derived baseline.effective UNKNOWN
markers; actual uncertainty сохраняется, более локальный independent proof приоритетен.

Private generic regressions и bounded 18-child replay проверяют child baseline,
public swap root/foreign descendants, missing/stale/forged/unknown evidence,
physical ambiguity, native Size domain и RGB negative. Parent Size negatives
r11 [1,0,0,1,1,0,1,0] сохраняются; 4 canonical compiled hashes не меняются;
standalone Link RESET HUG/HUG и BackgroundPlate сохраняют прежние результаты.
Нормы, authority, ZIP/manifest/Sheets не меняются. Numeric FIXED20→33 остаётся
NOT_COVERED: существующий Link r5 не содержит root bounds.height IR.

Consumer impact: Editor и Apollo используют общий reader; explicit owner context
передаётся только internal typed аргументом/результатом, нового serialized capture
protocol или opt-in нет. Это меняет source/build pins при применении и требует
согласованного sole-writer окна, полного configured validate и consumer проверки.
Private PASS не означает shared apply/install, native acceptance или Ready.
Пилот генерации и его пауза не меняются. Shared apply/full validate PASS;
consumer/native acceptance ещё не выполнены.
Финальная совместимость: 71/71 generic, 212/212 тестов всех ранее упавших групп;
Core 427/427, Editor 877/877, Apollo root и V4 1102/1102 — full validate PASS.
Golden reports и нормы не менялись. 18 сохранённых child runs: 0 violation/human-review;
родительские Size negatives [1,0,0,1,1,0,1,0] и четыре ZIP/manual/compiled pins сохранены.
Exact source/build/config inventory и первый failed Editor log сохранены в
`.local/apollo-contract-creation-2026-10-19/benefitcard-residual-reader-working-apply`.
Это не приёмка runtime consumer или Ready.

Критерий закрытия: независимое private review, согласованное применение точного
patch, full configured validate, actual Editor/consumer acceptance и новые pins.
Парная запись: [CC-COMPAT-NESTED-OWNER-TARGETS-01](../../ComponentContractEditor/docs/BACKLOG.ru.md).

### CC-COMPAT-DEPENDENCY-REPRESENTATION-CONTEXT-01 — контекст независимых references дочернего контракта

19.10.2026. **SHARED_IMPLEMENTATION / CONSUMER_AND_NATIVE_PENDING**.
Применён общий fix `validatedDependencyCapture`: Core **0.1.20** / Editor **0.2.107**.
для единственной доказанной universal representation согласован собственный
bundle base/attempts; nested captures клонируются и сохраняют собственный канал.
Проекция references включается только при существующем `occurrenceAddressVersion=1`;
unversioned historical путь сохраняет прежний root-only rebase и точные replay hashes. Missing/foreign channel, modes, identity, reference и topology остаются
строгими отказами. Исходные snapshots не мутируют; новых opt-in/stamp/норм нет.

Private proof: 28 generic regressions PASS, 3 существующих singleton/Spinner tests
PASS, noEmit typecheck PASS. На двух сохранённых D/M Link materializations Underline
восстановлен; paired 18 child cases сократили human-review 158→8, r2 сохранил результат.
Все 4 canonical compiled hashes, standalone Link HUG/HUG и 8 BackgroundPlate runs
неизменны. FIXED/HUG и оставшиеся Link/IconView UNKNOWN не закрыты этой правкой;
приоритет host baseline не менялся. Source authority и Ready не повышаются.

20.10.2026 — **LINK-SIZING-01 / OPEN, нормативное уточнение Link r7**.
Владелец подтвердил: HUG разрешён; пересмотреть жёсткое сравнение режима высоты
Link с baseline в `component:web-core.link.layer-properties-use-effective-baseline.1.10`.
Свежий Apollo-отчёт `apollo-v4-5c2fff1f93ee.json` содержит 53 compliant,
25 not-applicable, 0 human-review и одно нарушение: `layout.sizingVertical`
actual=FIXED, expected=HUG. Следовательно, этот прогон не запрещает HUG;
допустимость FIXED требует отдельного уточнения, автоматически её не расширять.
Задача: уточнить допустимый режим высоты и формулировку диагностики, затем
скорректировать соответствующее authoring-правило и проверить только его дельту.
Нормы/пакет/код этим добавлением в бэклог не изменены. Evidence:
`shared/design-system_ab/experiments/current-contract-packages/Link/apollo-v4-5c2fff1f93ee.json`.

21.10.2026 — **LINK-SIZING-01 / исправлено в Link r8, native-подтверждение ожидается**.
Владелец явно разрешил оба режима: FIXED и HUG. Root-domain выделен из recursive
baseline; высота внутренних слоёв по-прежнему защищена. Retained owner report
3812dc больше не даёт ложного FIXED/HUG, synthetic FILL и мутация внутренней
высоты дают нарушение. Core0.1.23/Editor0.2.108 не менялись. BenefitCard r16
закрепляет Link8; CardPlacement/Hug удалён из component scope как правило рецепта.
Apollo передаёт явную настройку Платформа в существующий validation intent, включая
scoped recheck; домен и subject/hash guards остаются прежними. UI использует
существующий compiled dependency presentation для подписи «Размер ссылки»;
технический trace не меняется. Отдельная установка Editor не заявляется.
Evidence: `shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/apollo-corrections-r16-2026-10-21/EVAL.json`.

Consumer impact: общий reader используется Editor и Apollo; применение меняет
source/build pins и требует sole-writer окна, configured validate и отдельной
совместимости фактического consumer. Private PASS не означает установку в Editor,
приёмку Apollo/Proxy или снятие паузы генерации. Shared apply и полный configured validate **PASS**; consumer/native acceptance
ещё не выполнены. Pilot scope не расширяется.

Финальная совместимость: 71/71 generic, 212/212 тестов всех ранее упавших групп;
Core 427/427, Editor 877/877, Apollo root и V4 1102/1102 — full validate PASS.
Golden reports и нормы не менялись. 18 сохранённых child runs: 0 violation/human-review;
родительские Size negatives [1,0,0,1,1,0,1,0] и четыре ZIP/manual/compiled pins сохранены.
Exact source/build/config inventory и первый failed Editor log сохранены в
`.local/apollo-contract-creation-2026-10-19/benefitcard-residual-reader-working-apply`.
Это не приёмка runtime consumer или Ready.

Критерий закрытия: независимая приёмка private diff; согласованное применение общего
fix и регрессий; полный configured validate и точные новые pins; проверка actual
Editor/consumer с сохранением negative guards. Оставшаяся высота и capability gaps
принимаются отдельно. Парная запись: [CC-COMPAT-DEPENDENCY-REPRESENTATION-CONTEXT-01](../../ComponentContractEditor/docs/BACKLOG.ru.md).

### CC-COMPAT-SCOPED-FIXED-DEPENDENCY-01 — зависимости по Figma representation и authoring admission

Review313 / private repair314: optional edit facts не блокируют исправление Draft;
owned-code collection принимает совместимые mixed capabilities по canonical
derived bindingVersion. Runtime guards, closed producer/registry profiles и
граница совместной установки UI/Core сохранены; shared adoption ожидает приёмки.

Core 0.1.19 / Editor 0.2.106 candidate. Новый opt-in `fixed-nested-scoped` требует
непустые уникальные `representationIds` и `crossRepresentationBindingsVersion=2`.
Один точный child pin может иметь непересекающиеся D/M bindings через FRAME.
Off-scope становится notApplicable только после независимого доказательства
единственного actual host representation; stale/foreign/ambiguous/missing capture
сохраняют UNKNOWN. Старый unscoped route и direct-child не расширяются.

Editor проверяет compiler errors до preview/capture, повторного запроса и evaluation.
Неизвестная manual schema отклоняется при импорте. Compiled-only evidence остаётся
read-only; запуск и экспорт восстановленного без исходного manual пакета запрещены.
Ошибочный авторский Draft можно сохранить с validation=false без исторического
projection stamp, но после reopen он по-прежнему не допускается к исполнению.

Совместимость: старый compiled Core/Editor/V4 reader отклоняет feature version2;
старый Editor может повторно скомпилировать ошибочный источник, поэтому universal
old-authoring refusal не заявляется. Поддержка scoped-пакета требует установки
проверенной пары нового UI + core Editor 0.2.106; одиночная замена core недостаточна.

Private проверки: actual bundled UI/controller с controlled mocks, ZIP/reopen,
legacy compiler/runtime equality и fail-closed cases. Shared integration, полный
validate, текущие V4 consumers/config/runtime и native acceptance имеют отдельные
гейты; статус — **PRIVATE_VERIFIED / SHARED_ACCEPTANCE_PENDING**.
Generation pilot и Ready не расширяются. Закрытие: точная совместная сборка UI/core,
полный validate и paired consumer verification; затем отдельный native тест пакета.
Парная запись: [CC-COMPAT-SCOPED-FIXED-DEPENDENCY-01](../../ComponentContractEditor/docs/BACKLOG.ru.md).


### CC-BLEND-MODE-001 — blend mode и effective baseline

16.10.2026. **SHARED_IMPLEMENTATION / CONSUMER_AND_NATIVE_PENDING**. Editor **0.2.105**, core **0.1.18**.
Общий capture сохраняет `appearance.blendMode` проверяемого узла и независимо
созданного effective baseline. `propertyForbidden` использует существующий
`matches-effective-baseline`; отсутствие actual или baseline даёт UNKNOWN /
human-review, без пустого selector и ложного compliant. Специальных условий
по имени BackgroundPlate, новых predicates и UI controls нет.
Изменение общих source/build pins переводит прежние зависимые receipts в historical.
Configured core/Editor/Apollo gates фиксируются в отдельной закрытой передаче;
они не заменяют свежую consumer/runtime приёмку General и native проверку Editor.
Критерий закрытия: принятые source/build/config pins, свежий actual consumer/reader,
native нарушения blend mode корня и вложенной поверхности, missing facts → UNKNOWN.
Границы generation pilot, нормы, schema/API и Draft/Ready gates сохранены.
Влияние на Apollo/Proxy: пересобрать использующие общий core bundles и принять
новый consumer/config/runtime; прохождение Editor tests эту приёмку не закрывает.
Парная запись: [CC-BLEND-MODE-001 в Editor](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-blend-mode-001--blend-mode-и-effective-baseline).


### V4-ICONVIEW-ADDON-PART-IDENTITY-001 — цепочка владельцев повторяющихся вложенных целей

15.10.2026. **GENERIC_READER_FIX / NATIVE_ACCEPTANCE_PENDING**, Editor **0.2.104**, core **0.1.17**.
В общем Reader sourceMatches подтверждает native source identity всех владельцев
до root. Одинаковые вложенные варианты в разных ветках различимы; duplicate
одной occurrence, foreign/missing/unknown owner, caller SLOT, type/cardinality
и stale reference по-прежнему не дают resolved. Общая реализация используется
также native target-property materializer; специальных имён IconView нет.

Это corrective guard в прежнем API/schema/producer policy, версии пакетов
сохранены. Нормы, manual/IR, generation mappings и Draft/Ready не расширяются.
Независимая private проверка текущих 87 core inputs: 345 synthetic tests,
включая 12 новых; baseline воспроизводит дефект в 7 из этих 12 cases.
Техническая приёмка требует shared core/Editor/Apollo configured gates,
нового source/build набора, consumer/config и runtime; прежние seals исторические.
Отдельные три raw r6 отчёта отсутствуют: повтор retained-native replay —
NOT_RUN_MISSING_RAW_INPUT. Прежние native receipts и 15 Engine-only решений
сохраняются как historical; fresh native, normative/pilot/release/Ready не приняты.
Парная запись: [EDITOR-ICONVIEW-ADDON-PART-IDENTITY-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-iconview-addon-part-identity-001--цепочка-владельцев-повторяющихся-вложенных-целей).


### CC-COMPAT-HIDDEN-TARGET-COVERAGE-05 — диагностика скрытых целей

10.10.2026. **GENERAL_TECHNICAL_ACCEPTED / LINK_INSTALLED_SCOPED / BENEFITCARD_PENDING**, Editor **0.2.100**, core **0.1.16**.
Повтор family `button-hidden-label-coverage`: Link r3 Addon=false давал четыре
ложных missing-target diagnostics, BenefitCard r5 hidden Title D/M — ещё один.

`buildEditorValidationReport` получает явную пятую опцию
`{hiddenTargetCoverageVersion:1}`, которую Editor передаёт при selected-instance
проверке и сохраняет в coverage/download. Только заново доказанный resolved/present
скрытый child в scope self получает not-applicable вместо missing; visibility
с отсутствующим/отличным baseline не исключается. Structural/required assertions,
missing/stale/foreign/duplicate/incomplete proof и scope descendants сохранены.
Без опции historical Editor report семантика прежняя; raw Engine неизменён.

Core 309/309, Editor 828/828, Apollo 611/611, root 81 files PASS. 12 retained
actual snapshots: exact Engine и legacy Editor replay; новая опция даёт Link
7→3 not-executed и hidden Title D/M 4→3, required violation и RESET сохранены.
Это offline проверка; subsequent Link installed confirmation записана ниже.
BenefitCard hidden Title D/M в Editor 0.2.100 ещё NOT_RUN_USER_ONLY.
Независимая техническая проверка General принята в ограниченной области.
Link r3 / BenefitCard r5 и нормы не менялись; полный Ready/release не заявлен.

Apollo runtime bytes и 216 dependency source pins неизменны: эти report modules
в inventory не входят. Только runtimeVersion metadata 0.1.15→0.1.16 и embedded
build seal main/UI обновлены обычной сборкой. Consumer adoption/freshness отдельно.
Evidence: [reading fix](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/reading-fixes/hidden-target-coverage-2026-10-10/replay.json).
Парная запись: [EDITOR-HIDDEN-TARGET-COVERAGE-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-hidden-target-coverage-001--доказанная-скрытая-цель-ошибочно-считается-потерянной).


Независимая техническая приёмка General 10.10.2026: root configuration и bounded hidden-target diagnostics приняты как совместимый общий вход пилота. Сверены final pins до/после, 12 exact historical report replays, 16 hidden-target guards и 216 входов v4. Runtime bytes/source inventory v4 сохранены; report-only модули отсутствуют в inventory. Это не normative/native-live/Ready приёмка; installed Editor 0.2.100, consumer adoption и остальные scope остаются открыты. Evidence: [General technical review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/reading-fixes/hidden-target-coverage-general-review-2026-10-10/review.json).


Installed Link r3, Editor 0.2.100 / core 0.1.16, 10.10.2026 17:47–17:48 MSK: **3/3** submitted captures exact Engine/Editor/details replay, 8 resolved, violations/inconclusive=0, 3 context-only. Addon=false исключает четыре proven hidden targets без ложных missing diagnostics; RESET на том же INSTANCE `13666:67948` восстанавливает visibility с сохранением native source identities/root layout/text/context. Custom Label «Открыть подробные условия» и эталонная типографика проходят. Hidden Addon fix принят для Link; BenefitCard hidden Title D/M и его RESET в новой версии, nested Line/icon, configured Label negative/preserving RESET, consumer adoption и полный Ready остаются открыты. Нормы/ZIP/manual/compiled/Draft сохранены. Evidence: [installed review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T14-47-17Z/review.json).


### CC-COMPAT-DECLARED-TARGET-CONFIGURATION-04 — конфигурация и native identity

11.10.2026 — **PUBLIC_SWAP_SHARED_FIX_AND_LOCAL_CONSUMER_PASS**. Core **0.1.17**,
Editor **0.2.103**, Link **r4** добавляют configuration v2 / producer 0.2.103.
V4 profile 0.4.1 принимает v1/v2; неизвестные версии, несовместимый producer
и missing pins отклоняются. V1 replay сохранён. Allowed/external ownership и
exact typed root port/source occurrence ограничивают reference projection asset;
slot/host constraints и stale/type/owner/cardinality/UNKNOWN guards сохранены.

Core 333, Editor 829, v4 655 и root 81 regression files PASS обычным validate.
27 historical r3 engine/editor replays exact; candidate r4 retained swap/RESET
имеют 8 resolved / 0 inconclusive / 0 violations и 8 guarded counterfactual checks.
Synthetic consumer/Editor ZIP tests и Draft admission rejection PASS.
Private captures остались в contract reports, product fixtures синтетические.

Final v4 build выполнен с прежней readonly callback config SHA
`1b15b9285b9ebf9eee6cef82fb5bfe5f367dfa8ff3fed3ff5c278c6a3869fd96`;
промежуточный сброс исправлен и записан как повтор AP-PROC-009. Новые source/build
bytes требуют свежей проверки working consumers; прежние consumer seals не
изменены. Independent General/adoption/release и installed native cycle остаются
открытыми; full Ready=false.
Evidence: [fix handoff](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/reading-fixes/public-instance-swap-2026-10-11/HANDOFF.json).
Editor: [EDITOR-DECLARED-TARGET-CONFIGURATION-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-declared-target-configuration-001--публичная-настройка-обнуляет-declared-targets).


11.10.2026, 10:00 MSK — **PUBLIC_INSTANCE_SWAP_READING_FAIL / RESET_PASS_SCOPED**.
Link r3, installed Editor **0.2.101**, shared core **0.1.16**: два actual capture
на INSTANCE `13666:68129`. Разрешённые Left/Right icon 24 swaps на rocket/flag
дают 0 violations, но **32 human-review / 0 resolved**; RESET diamonds —
0 violations/inconclusive и 8 resolved. Capture complete, 17 nodes, source
addresses/host owner/typed public ports и размеры 24×24 сохранены. Whole
configuration pin всё ещё включает INSTANCE_SWAP values и выбранный subtree;
все восемь targets получают reference-pin-stale. Из 32 UNKNOWN — 31 selector
и 1 absent configured Size. Engine/Editor/details replay exact через frozen
core 0.1.16 и совместимые API Editor 0.2.100; actual capture 0.2.101 отдельно
не пересобирался. Нормы/ZIP/manual/compiled не менялись, product fix не внесён.

Необходимый bounded fix: доказанная native occurrence/port identity и
correspondence при разрешённом внешнем asset; исключать только declared
external swap contents, сохраняя source/owner/type/cardinality/stale-host и
visual baseline guards. Простого удаления swap value из root hash недостаточно.
Критерий: retained swap/RESET 8 resolved/0 inconclusive, положительные публичные
порты и отрицательные foreign/duplicate/missing/stale/visual cases; historical
policies и TEXT/BOOLEAN/Line replays сохранены. Editor/Apollo consumers и
fresh native cycle проверяются отдельно; Ready/adoption/release открыты.
Evidence: [public icon review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-11T07-00-25Z/review.json), [fix plan](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-11T07-00-25Z/FIX_PLAN.ru.md).


10.10.2026. **P0, ROOT_CONFIGURATION_AND_LINE_DOMAIN_INSTALLED_SCOPED / GAPS_OPEN**.
Shared core **0.1.15**, Editor **0.2.99**, local Apollo **0.4.1** profile
поддерживают explicit `declaredTargetConfigurationVersion=1` только вместе с
identity v3, точными configuration/portable pins и producer 0.2.99. Неизвестная
версия, отсутствующий marker/pin и неверный producer отклоняются. Прежняя
семантика identity policies сохраняется без opt-in; Ready/Draft gates неизменны.

Hash отделяет declared root TEXT/BOOLEAN values от source identity. Public
permission/configuration и baseline проверяются собственным контуром; nested
Line, VARIANT и INSTANCE_SWAP остаются в pin. Source/owner/topology guards,
неполные/неоднозначные факты и визуальные overrides продолжают проверяться.

Обычный core validate 293/293, Editor 826/826, Apollo 611/611 и root 81 files
PASS. Пять unchanged installed r2 captures replay на r3: 8 targets resolved,
0 violations / 0 human-review. Local fontSize negative+RESET PASS; exact old
r2 replay и шесть CC/BG/Button/Spinner import/compile outputs сохранены.
ButtonsGroup.mobile-web и Link остаются Draft и отклоняются runtime admission.

Открыто: installed r3 cycle, nested Line/icon scope, independent General review,
подключение к свежим SDK/Proxy consumer seals. Текущие generation consumers не
перепривязаны автоматически; их freshness guard должен принять отдельный
закрытый handoff перед adoption. Whole Ready/release не заявлены.

Evidence: [r3 eval](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/skill-evals/link-r3-root-configuration-2026-10-10/eval.json). Парная задача:
[EDITOR-DECLARED-TARGET-CONFIGURATION-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-declared-target-configuration-001--публичная-настройка-обнуляет-declared-targets).

Installed Link r3 review 10.10.2026 09:52 UTC: четыре exact Engine/Editor replay,
все восемь targets resolved и inconclusive=0. Длинный Label в отрицательном
typography кейсе сохраняет identity; два нарушения fontSize/tracking обнаружены,
полный сброс того же INSTANCE возвращает default Label и чистую типографику.
Оба Addon=false сохраняют identity, но Editor добавляет четыре ложных missing
target diagnostics для скрытых Addon/icon — повтор `button-hidden-label-coverage`.
Это scoped identity PASS; clean long Label и RESET с его сохранением ещё NOT_RUN.
Nested Line/icon, Source/context, independent General и consumer adoption открыты.
Нормы, ZIP и Draft статусы сохранены. Evidence: [r3 live review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T09-52-35Z/review.json).

Installed Link r3 / Editor 0.2.100, 10.10.2026 20:56 MSK: **2/2** Line=`Pseudo` → `Solid` RESET на том же INSTANCE `13666:67968`. Exact Engine/Editor/details replay совпал, 8 resolved / violations=0 / inconclusive=0 / 3 context-only. `component:web-core.link.underline-domain.1.1` actual=Pseudo/Solid, applicable/compliant; native Underline variant key меняется, component set и source port сохраняются. Root properties/layout/appearance, context и прочие native identities/типографика сохранены. Этот nested Line Pseudo/Solid scope принят; Line=None/context, icon ports, configured Label preserving cycle, consumer adoption и полный Ready открыты. Нормы/ZIP/manual/compiled/Draft не менялись. Evidence: [Line cycle review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T17-56-33Z/review.json).

Installed Link r3 / Editor 0.2.100, 10.10.2026 21:27–21:28 MSK: **2/2** Line=None → Solid RESET на том же INSTANCE `13666:67989`. Exact Engine/Editor/details replay совпал; 8 resolved, violations/inconclusive=0, 3 context-only. `underline-domain.1.1` applicable/compliant с actual=None/Solid. Native None/Solid topology 16→17 nodes, Underline children 0→1; exact source port/component set, host properties/layout/appearance/context и другие declared sources сохранены. Вместе с предыдущим Pseudo/Solid receipt все три значения Line подтверждены. None usage color/context не принят автоматически; public icon ports, остальные baseline cycles, configured Label preserving cycle и full Ready открыты. Evidence: [None cycle review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T18-27-30Z/review.json).

Installed Link r3 / Editor 0.2.100, 10.10.2026 21:36 MSK: **4/4** root padding left 7→0 и opacity 0.5→1 negative/RESET. Exact Engine/Editor/details replay совпал; exact root RuleID .1.5/.1.12, violations 1/0/1/0 без дополнительных нарушений. 8 resolved, inconclusive=0, 3 context-only в каждом capture. Same-instance RESET сохраняет native identity/context/text и unrelated поля; pristine baseline не заменён actual override. Нормы/ZIP/manual/compiled/Draft/код не менялись. Root fill/tracking, public icons и full Ready открыты. Evidence: [baseline cycles review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T18-36-23Z/review.json).

Installed Link r3 / Editor 0.2.100, 10.10.2026 22:06–22:07 MSK: **4/4** root fill и Label tracking negative/RESET. Exact Engine/Editor/details replay совпал, violations 1/0/1/0, 8 targets resolved, inconclusive=0, 3 context-only. Доказаны точные RuleID root-fill-baseline.1.1 / label-typography.1.4 и RESET на тех же экземплярах, без лишних нарушений. Tracking RESET восстановил native style/variable bindings и добавил два captured context modes 1:0; общие modes сохранены, byte-идентичность context не заявляется. Нормы/пакет/код/Draft не менялись. Configured Label preserving cycle, public icon и другие scope/Ready проверки открыты. Evidence: [fill/tracking review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T19-06-57Z/review.json).

Installed Link r3 / Editor 0.2.100, 10.10.2026 22:13 MSK: четыре exact Engine/Editor/details replay, violations **0/2/0/0**, 8 targets resolved, inconclusive=0, 3 context-only. Custom Label (24 символа) проходит и сохраняется в отрицательном snapshot; два фактически изменённых typography поля дают точные .1.2/.1.4. Третий capture вернул default Label, четвёртый повторно задал custom text: **RESET_PRESERVING_TEXT_NOT_PROVEN**. 38-character запрос не выполнен, actual text допустим. Planned/actual inputs сохранены; нет подтверждённого runtime defect. Нормы/пакет/код/Draft не менялись. Evidence: [configured Label review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-10T19-13-14Z/review.json).

Installed Link r3 / Editor 0.2.100, 11.10.2026 09:07 MSK: **CONFIGURED_LABEL_PRESERVING_RESET_PASS_SCOPED**. Два exact Engine/Editor/details replay, violations 2→0; одинаковый INSTANCE/public Label (24 символа)/native identities/context, 8 targets resolved, inconclusive=0, 3 context-only. FontSize 18 и actual tracking −0.36 корректно нарушают .1.2/.1.4, native RESET 16/−0.24 сохраняет текст непосредственно. Запрошенный tracking 0 не вводился, actual evidence retained. Предыдущий historical gap не переписан; новый цикл закрывает preserving-text scope. Нормы/пакет/код/Draft не менялись. Public icons, >32-character sample, остальные full-contract/Apollo adoption gates открыты. Evidence: [preserving RESET review](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/live-review-r3-2026-10-11T06-07-06Z/review.json).

11.10.2026, решение о reuse текстовых проверок: общий механизм core и BenefitCard matrix не повторяются вручную в Link. Native public Label + negative/preserving RESET Link r3 уже PASS_SCOPED; дополнительный 38-character sample снят как NOT_RUN_NOT_REQUIRED_OPTIONAL_REPEAT. Его live PASS и full Ready не заявляются; public icon scope открыт. Metadata correction: фактический custom Label содержит 25 символов, а не ранее вручную записанные 24; per-capture computed values и engine results правильны, закрытые receipts сохранены. [Decision/correction](../../../shared/design-system_ab/experiments/current-contract-packages/Link/reports/text-evidence-reuse-2026-10-11/decision.json).

### CC-COMPAT-NATIVE-CARD-FACTS-03 — текст, native properties и исключение instance swap

24.10.2026, Status & Property r4: word count компилируется в существующий
`matches` над уже захваченным `text.characters`. Новый runtime/capture fact не вводится:
это позволяет текущему Figma evaluator исполнять полученный IR без замены plugin bundle.
Граница — слова, разделённые whitespace; standalone punctuation не считается словом,
слово с дефисом остаётся одним. Missing/unknown исходник остаётся UNKNOWN.
Владелец упростил вторую норму: исходный текст не длиннее20 code points, без проверки
обрезки/ellipsis; используется existing characterCount. Собственный compiler и Proxy
checking runtime получают private bundles; installed adoption фиксируется отдельно.
Evidence: `.local/apollo-contract-creation-2026-10-24/status-property-r4-final` в workspace.

09.10.2026. **Editor 0.2.94 / core 0.1.13**. Общая реализация готова; локальный Apollo profile принимает только версии 1 для `textContentFactsVersion` и `nativeTargetPropertyFactsVersion`, проверяет markers до чтения контракта и использует тот же runtime. Compiler stamp 0.2.94 включается при новых facts. Historical unmarked semantics не меняются.

Новые факты: Unicode character count; консервативный line count равномерного auto-height TEXT; typed properties точного declared native occurrence; счётчик instance swap с одним exact exception. Foreign/missing/ambiguous owner proof или непрослеживаемая разрешённая смена дочернего variant остаются unknown. Applicability поддерживает declared finite expectedInput для root; видимый TEXT отдельно отбирается для LEFT assertion. Cached text/native facts пересчитываются.

Local acceptance: core **251**, Editor **823**, root **81 regression files** — стандартные validate прошли. Первоначальный v4 validate **571** прошёл до обновления рабочего manifest. После выпуска r4 финальный build остановлен: `STALE_CURRENT_AUTHORITY_REF` на current-contract-packages/manifest.json. Свежие native profile regressions **5/5** прошли на заново собранном Node runtime; это не подтверждает свежий main/UI bundle. Нужна перепривязка current authority receipt владельцем registry/consumer контура, затем полный validate. Pins/закрытые seals не обходились. Synthetic tests подтверждают parity metrics, missing/unsupported markers, actual forbidden swap и allowed exact occurrence. Private BenefitCard r4 содержит 32 native variants/256 bindings и 46 counterfactual кейсов; они не являются consumer live/release receipt.

Открытые критерии закрытия: свежий installed consumer cycle нового r4 с реальными PASS/FAIL/UNKNOWN; сохранённый historical ZIP replay; verified child contracts/pins Link, IconView, BackgroundPlate; полный token-library allowlist; отдельный admission gate внутренних standalone частей; cross-component icon runtime и авторская приёмка. Библиотечные Compact=True/Title=Primary и FIXED single height не исправляются ослаблением нормы. Generation/Proxy/registry locks этой задачей не переназначаются. [Парная запись Editor](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-native-card-facts-03--текст-native-properties-и-исключение-instance-swap).

#### Исправление чтения BenefitCard r5 · 09.10.2026

- [x] **Editor 0.2.95 / core 0.1.14:** opt-in `declaredTargetIdentityVersion=3`, exact producer `component-contract-editor@0.2.95`. Policies 1/2 сохраняют прежнюю семантику; marker/stamp mismatch и неизвестная версия отклоняются.
- [x] Корень configured native occurrence сохраняет declared identity только при точном source/owner/reference pin и независимо пересчитанном v4 host continuity proof. Исходный baseline запрещённых properties не заменяется новым child variant baseline. Descendants не получают identity по наследству; missing/foreign/stale/duplicate/incomplete/cached claims остаются UNKNOWN.
- [x] Graphic=Icon делает три ImageView rules not-applicable при доказанном preset. Доказанный false component-root guard исключает child rule без утверждения, что отсутствующая child target разрешена. Unknown root/guard продолжает давать UNKNOWN.
- [x] Локальные стандартные gates: **core 273/273**, **Editor 825/825**, **Apollo 590/590**, **Apollo root 81 regression files**. Main/UI Apollo пересобраны после обновления текущего пакета. Consumer v3 tests подтверждают native key switch, Icon/false guard parity и exact producer/Draft rejection. Существующий mapped BG/CC closure не менялся; новый Code Connect mapping не добавлен.
- [x] Исторические **12 retained r4 context reports** воспроизводятся exact на новом core. Offline повтор этих snapshots с теми же explicit inputs, заново закреплёнными за r5, сохраняет классификации. Старый input pin r4 не переносится автоматически. Исходные 52 first-column files сейчас отсутствуют; их прежний review receipt сохранён, новый exact replay всех 52 не заявляется.
- [x] BenefitCard **r5 Draft**, **21 неизменённое source rule / 37 IR / 4 nonExecutable**, **9 targets / 256 bindings / 32 variants**. Изменены только technical metadata и compiled projection; исходные нормы, разрешения, bindings и факты сохранены. r4 ZIP и manifests сохранены в history; новый ZIP и оба manifests согласованы.
- [x] **Fresh installed Editor r5, 09.10.2026 16:11–16:14 UTC:** BC4-307–312, BC4-319/320, BC4-V02/V25 и BC4-317/318 — **12/12 целевых результатов совпали**. Exact current ZIP/manual/compiled/runtime/snapshot hashes и engine/Editor replay проверены; Editor 0.2.95, explicit ViewportClass/CardPlacement, Figma parameters и HUG совпадают с планом. Capture complete, warnings=0. В 54 целевых оценках: **6 violation, 32 compliant, 16 not-applicable**; неожиданных violations нет. Это scoped Editor acceptance, source/ZIP/status/pins не изменены. [Live review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/reading-fix-live-review.r5.2026-10-09.json).
- [x] **Position negative/reset, installed Editor r5, 09.10.2026 16:46–16:58 UTC:** шесть свежих отчётов BC4-311/312 прошли exact ZIP/manual/compiled/runtime/snapshot hashes и engine/Editor replay на core 0.1.14; capture complete, warnings=0. При сбросе Position=Level 1 на D/M пять surface checks compliant и все девять targets resolved. В desktop reset 16:48 поля контекста пусты, поэтому два контекстных UNKNOWN сохранены; свежий reset 16:58:20 с ViewportClass=desktop / CardPlacement=single даёт ноль violations/UNKNOWN. Повторный Level 2 в 16:58:51 снова обнаружен. В 30 plate оценках: 3 violation, 15 compliant, 12 UNKNOWN по открытому Style gap; в 12 context оценках: 10 compliant и 2 missing-input UNKNOWN. Scoped reset принят на обеих платформах; пакет, нормы и Draft-статусы не менялись. [Negative/reset review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/position-reset-live-review.r5.2026-10-09.json).
- [ ] **Position descendant gap, BC4-311/312:** при запрещённом Position=Level 2 прежний Style Level 1 заменён Style Level 2 с другими native source/owner и componentSet. Independent host content matched не предоставляет новой declared target identity: `target.surface` — `native-cardinality-unresolved`. В каждом таком прогоне сохраняются 4 UNKNOWN (Color/Skeleton и два paint binding checks). Reset уже доказан и закрывает исчезновение этих UNKNOWN при возврате исходной конфигурации, но не разрешает identity нового Style. Не превращать их в PASS и не подставлять identity по name/order. Scope новой внутренней подложки требует отдельного BackgroundPlate contract/точного binding.
- [x] **Title 60/61, installed Editor 0.2.96 / core 0.1.14, r5, 09.10.2026 17:32 UTC:** BC4-211/212 и BC4-201/202 — 4/4 целевых character outcomes совпали; exact ZIP/manual/compiled/runtime/snapshot hashes и engine/Editor replay проверены. Capture complete, warnings=0, все девять targets resolved, explicit viewport/single/Hug совпадает с условиями. Title=60 проходит D/M; Title=61 нарушает character limit D/M. Desktop BC4-201 дополнительно занимает три строки и нарушает line limit; mobile BC4-202 занимает две строки и проходит его. В 16 целевых оценках: 13 compliant / 3 violation, UNKNOWN=0, неожиданных violations нет. Приёмка ограничена границей символов Title; isolated line limits, Subtitle, alignment, insufficient-fact cases и same-occurrence resets открыты. Нормы, ZIP, policy/producer и Draft-статусы не менялись; runtime импортированного r5 совпал, новый consumer format не создавался. [Title boundary review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/title-character-boundaries-live-review.r5.2026-10-09.json).
- [x] **Title 3 строки / Subtitle 121 символ, installed Editor 0.2.96 / core 0.1.14, r5, 09.10.2026 17:37–17:38 UTC:** BC4-203–206 — 4/4 целевых outcomes совпали; exact source/runtime/snapshot hashes и engine/Editor replay проверены, текущий ZIP совпал. Capture complete, warnings=0, все девять targets resolved, explicit viewport/single/Hug задан корректно. Title содержит 20 символов / 3 строки и нарушает только line limit D/M. Subtitle содержит 121 символ: desktop 4 строки нарушает оба лимита, mobile 3 строки нарушает только character limit. В 16 целевых оценках: 11 compliant / 5 violation, UNKNOWN=0, неожиданных violations нет. Открыты Subtitle=120, isolated Subtitle 4 строки, alignment, insufficient-fact cases и same-occurrence resets. Нормы, ZIP, policy/producer и Draft-статусы не менялись; installed Apollo и full text/component acceptance не заявляются. [Text negative review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/text-limits-negative-live-review.r5.2026-10-09.json).
- [x] **Subtitle 120 символов / 4 строки, installed Editor 0.2.96 / core 0.1.14, r5, 09.10.2026 17:51–17:52 UTC:** BC4-213/214 и BC4-207/208 — 4/4 целевых outcomes совпали; exact current ZIP/manual/compiled/runtime/snapshot hashes и engine/Editor replay проверены. Capture complete, warnings=0, все девять targets resolved, explicit viewport/single/Hug соответствует условиям. Subtitle=120 / 2 строки проходит оба лимита D/M; Subtitle=27 / 4 строки нарушает только line limit D/M. В 16 целевых оценках: 14 compliant / 2 violation, UNKNOWN=0, неожиданных violations нет. Следующие кейсы — alignment BC4-209/210 и Fixed TEXT / unknown line count BC4-215/216; same-occurrence text resets и отдельная положительная граница трёх строк Subtitle также открыты. Нормы, ZIP и Draft-статусы не менялись; full text/component и installed Apollo acceptance не заявляются. [Subtitle boundary review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/subtitle-boundaries-live-review.r5.2026-10-09.json).
- [x] **Alignment / Fixed TEXT guard, installed Editor 0.2.96 / core 0.1.14, r5, 09.10.2026 18:12–18:13 UTC:** BC4-209/210 и BC4-215/216 — 4/4 целевых outcomes совпали; exact current ZIP/manual/compiled/runtime/snapshot hashes и engine/Editor replay проверены. Capture complete, warnings=0, все девять targets resolved, explicit viewport/single/Hug соответствует условиям. CENTER нарушает LEFT у изменённого Title, Subtitle остаётся compliant. Fixed TEXT оставляет line count UNKNOWN; character count=11 остаётся известным и compliant. В 24 целевых оценках: 20 compliant / 2 violation / 2 ожидаемых human-review; неожиданных violations/UNKNOWN нет. Все 16 подготовленных текстовых кейсов имеют ожидаемые результаты по текущим четырём и прежним receipts; raw JSON предыдущих 12 сейчас отсутствуют, новый exact replay этих 12 не заявляется. Копии текущих четырёх сохранены в private component reports/live-captures с проверенным SHA, не в source fixtures. Открыты 12 same-occurrence resets: alignment/Auto height, две/три строки и 60/120 символов. Нормы, ZIP и Draft-статусы не менялись; full text/component и installed Apollo acceptance не заявляются. [Alignment/UNKNOWN review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/text-alignment-unknown-live-review.r5.2026-10-09.json).
- [x] **Alignment / Auto height reset, installed Editor 0.2.97 / core 0.1.14, r5, 09.10.2026 18:31–18:33 UTC:** четыре reset BC4-209/210 и BC4-215/216 и четыре сохранённых исходных captures Editor 0.2.96 прошли exact engine/Editor replay; текущий ZIP/manual/compiled/runtime/snapshot hashes совпали. Те же physical roots, native Title source, 11 символов и explicit scenario pins. Center→Left убирает два violations; Fixed size→Auto height доказывает одну строку и убирает два UNKNOWN. Все девять targets resolved, capture complete, warnings=0; в 24 целевых reset оценках — compliant, violations/UNKNOWN=0. Raw before/after копии с проверенным SHA сохранены в private component reports/live-captures. Открыты восемь content resets BC4-201–208: две строки Title, три строки Subtitle и границы 60/120 символов. Нормы, ZIP и Draft-статусы не менялись; полный текстовый контур, карточка и installed Apollo не приняты. [Style resets review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/text-style-resets-live-review.r5.2026-10-09.json).
- [x] **Title / Subtitle line resets, installed Editor 0.2.98 / core 0.1.14, r5, 09.10.2026 19:00–19:01 UTC:** BC4-203/204 (Title=2 строки, 13 символов) и BC4-207/208 (Subtitle=3 строки, 20 символов) — **4/4** ожидаемых сброса. Exact engine/Editor replay четырёх свежих отчётов и ZIP/manual/compiled/runtime/snapshot hashes совпали; capture complete, warnings=0, все девять targets resolved. В 24 целевых оценках — compliant, violations/UNKNOWN=0. Physical roots, explicit context, параметры и Hug совпали с прежними отрицательными review receipts; их raw captures отсутствуют, поэтому fresh negative replay и before/after native source continuity не заявляются. Новые raw captures сохранены с SHA в private component reports/live-captures. Открыты четыре character resets BC4-201/202 и BC4-205/206 на границах 60/120. Нормы, ZIP и Draft-статусы не менялись; полный текстовый контур, карточка и installed Apollo не приняты. [Line resets review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/text-line-resets-live-review.r5.2026-10-09.json).
- [x] **Title / Subtitle character resets, installed Editor 0.2.98 / core 0.1.14, r5, 09.10.2026 19:08–19:10 UTC:** Title=60 и Subtitle=120 латинских `i` проходят оба текстовых лимита на D/M — **4/4** text outcomes. Exact engine/Editor replay четырёх свежих отчётов и ZIP/manual/compiled/runtime/snapshot hashes совпали; complete capture, warnings=0, девять targets resolved, violations=0. Из 24 целевых оценок 22 compliant и два context human-review: у BC4-201 values пусты, отсутствуют ViewportClass и CardPlacement; platform/Hug остаются UNKNOWN, Title=60 / 2 строки проходит. **3/4** сценария приняты, открыт только BC4-201 context retest с desktop / single без изменения текста. Negative raw captures отсутствуют, fresh negative replay и before/after native source continuity не заявляются. Четыре новых raw captures сохранены с SHA в private component reports/live-captures. Нормы, ZIP и Draft-статусы не менялись; полный текстовый цикл, карточка и installed Apollo не приняты. [Character resets review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/text-character-resets-live-review.r5.2026-10-09.json).
- [x] **BC4-201 context retest / закрытие текстовой матрицы, installed Editor 0.2.98 / core 0.1.14, r5, 09.10.2026 19:43 UTC:** explicit desktop / single убрал два platform/Hug UNKNOWN. Title=60 / 2 строки, Left/Auto height, native source, физический корень, root layout и параметры совпали с сохранённым capture 19:08 UTC. Exact engine/Editor replay обоих captures и ZIP/manual/compiled/runtime/snapshot hashes совпали; complete capture, warnings=0, девять targets resolved. В новом отчёте violations/UNKNOWN=0, шесть целевых оценок compliant. Подготовленная текстовая матрица закрыта: **16/16** ожидаемых результатов и **12/12** сбросов; все 72 целевые reset оценки compliant, SHA всех 12 retained reset captures проверены. Предыдущие boundary/negative results учтены по pinned receipts; отсутствующие raw не проигрывались заново. Pending text reset/context retest списки пусты. Нормы, ZIP и Draft-статусы сохранены; остальные конфигурации, полная карточка, Position=Level2 source gap, зависимости и installed Apollo остаются открыты. [Text cycle review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/text-context-retest-live-review.r5.2026-10-09.json).
- [x] **Title / Graphic hidden negatives, installed Editor 0.2.98 / core 0.1.14, r5, 09.10.2026 20:01–20:02 UTC:** BC4-101–104 — **4/4** целевых нарушения обязательной видимости D/M. Quantity count=0 для скрытого элемента; второй обязательный элемент, platform и Hug проходят. В 16 целевых оценках 12 compliant / 4 violation; ровно одно violation на capture, неожиданных violations/human-review нет. Exact engine/Editor replay четырёх отчётов и hashes совпали; capture complete, warnings=0, девять targets resolved, raw copies сохранены с SHA. Отрицательная часть принята; четыре visibility RESET ещё ожидаются. Нормы, ZIP и Draft-статусы сохранены. [Visibility negative review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/composition-visibility-negative-live-review.r5.2026-10-09.json).
- [x] **Title / Graphic visibility RESET, installed Editor 0.2.98 / core 0.1.14, r5, 10.10.2026 01:06–01:07 MSK (09.10.2026 22:06–22:07 UTC):** BC4-101–104 — **4/4** сброса. Восемь fresh exact engine/Editor replays новых и сохранённых отрицательных captures совпали; ZIP/manual/compiled/runtime/snapshot hashes проверены. Те же physical roots, explicit context, native source/component identities Title и Graphic, текст/типографика Title, root layout и параметры. Required count=0→1; оба обязательных элемента, platform и Hug compliant, все 16 целевых reset оценок compliant, violations/human-review=0. Capture complete, warnings=0, девять targets resolved. Raw из корня current-contract-packages сохранены копиями с SHA в private BenefitCard reports/live-captures. Цикл обязательной видимости D/M закрыт, pending reset список пуст. Hidden Title diagnostic gap отсутствует в видимых resets, но его кодовое исправление не принято; full component и installed Apollo открыты. Нормы, ZIP и Draft-статусы сохранены. [Visibility reset review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/composition-visibility-resets-live-review.r5.2026-10-10.json).
- [ ] **Hidden declared target coverage, повтор family `button-hidden-label-coverage`:** BC4-101/102 доказывают exact resolved/present Title с effectiveVisible=false. Engine исключает оба лимита Title как not-applicable, но Editor coverage добавляет not-executed/unknown «Целевой слой не найден» (четыре notExecuted вместо трёх). Причина в общих validation-report/validation-coverage: пустой visible selector трактуется как missing target без различения доказанного скрытого target. Разделить hidden/inapplicable и missing/unresolved по независимому identity/visibility proof; required visibility продолжает давать violation. Отсутствующий, stale, foreign, ambiguous или incomplete proof сохраняет coverage gap. Нужны D/M hidden→visible RESET и missing-proof regressions, затем отдельная installed Editor/Apollo приёмка. Current negative review фиксирует дефект, не его исправление. Локальное исправление 10.10.2026 сохранено в EDITOR-HIDDEN-TARGET-COVERAGE-001 / CC-COMPAT-HIDDEN-TARGET-COVERAGE-05 выше; installed 0.2.100 ещё не принят.
- [ ] Установленный Apollo, остальные группы борда, Source Reviewed/Ready, child contracts Link/IconView/BackgroundPlate и release/publication остаются открыты. Число notExecuted зависит от сценария: три context-only gap в обычных captures и дополнительный hidden Title coverage gap в BC4-101/102. Три целевых reading gaps r4 закрыты live в указанной области Editor; полная карточка не принята.
- Evidence: [r5 package checks](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/r5-package-checks.2026-10-09.json), [retest plan](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/reading-fix-retest.r5.md). Парная запись **CC-COMPAT-NATIVE-CARD-FACTS-03** сохранена в обоих проектах.

#### Живой цикл BenefitCard r4 · первый столбец · 09.10.2026

- [x] **52 отчёта installed Editor 0.2.94 / core 0.1.13**, BC4-V01–V32 и BC4-301–320: exact source/runtime/snapshot hashes и engine/Editor replay совпали, capture complete, warnings=0. ZIP SHA256 `9854199f6be6335efc9849d4eeca3712015f561beed2ef9ae78824ec79e33ca0`; manual hash `eb25ad722d2f8316fdfcc5dd559d64450923a2f3a418d0e2ca582e6001665082`. **18/24** ожидаемых отрицательных кейсов обнаружены: 8 Compact library drift, 6 ImageView Size/Crop/Grid, 4 token binding. Допустимый Segment D/M проходит три целевые проверки. Все сценарии incomplete; это Editor scoped Draft preview, не installed Apollo acceptance.
- [ ] **BC4-307–312:** forbidden BackgroundColor/Skeleton/Position native variant switches дают unknown independent correspondence вместо нарушения. Shared runtime должен сохранять исходный pinned baseline и доказывать continuity occurrence по независимому host/source. Новый child baseline не легализует запрещённое изменение. Foreign/stale/incomplete/ambiguous proof остаётся fail-closed; name/order fallback запрещён.
- [ ] **BC4-319/320:** при доказанном Graphic=Icon три ImageView rules должны стать not-applicable, обязательность Graphic — проверяемой. Сейчас Graphic/image identity и semantic preset unknown. Consumer regressions должны воспроизвести настоящий native key switch, reset и чужой/неподтверждённый preset; scalar mutation при прежнем key не покрывает дефект.
- [ ] **Background=False D/M:** в 16 baseline кейсах пять surface-checks unknown из-за `selected-binding-unavailable`. Доказанный root guard False должен обеспечить неприменимость, даже если child отсутствует в варианте. При True проверки выполняются; неизвестный Background/source proof сохраняет unknown. Blanket missing-target → not-applicable запрещён.
- [x] **Editor finite context live acceptance D/M:** 09.10.2026 13:55–13:58 UTC, BC4-V01/V17 и BC4-109–118, **12/12** ожидаемых результатов. Exact manual/compiled/runtime/snapshot hashes и engine/Editor replay совпали; capture complete, warnings=0, declared targets resolved. Из 24 целевых оценок: 14 compliant, 4 violation (Fixed single / viewport mismatch), 2 not-applicable (group), 4 ожидаемых UNKNOWN (missing context). Свежий live receipt заменяет необходимость повторять эти Editor проверки; старые 52 captures без inputs сохраняют своё historical состояние. Все полные сценарии incomplete с тремя nonExecutable rules, source/ZIP/Draft activation/status/pins не изменены. [Receipt](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/context-live-review.r4.2026-10-09.json), [кейсы](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/context-live-review.r4.2026-10-09.md).
- [ ] **Installed Apollo finite context acceptance:** контекст отдельно от observed facts, exact contract/subject proof, отсутствие card-width/single defaults; повторить тот же D/M positive/Fixed/group/mismatch/missing cycle. Shared replay и Editor receipt не подтверждают installed Apollo. Публикация, source/code/native readiness и оставшиеся три reading gaps не закрыты.
- [ ] После shared исправления: exact bundle rebuild, поддержка policy/producer с сохранением исторических guards, local consumer replay и fresh installed Apollo negative/reset/Background=False/allowed Segment/token controls. Source/code/native/release gates не повышаются replay. Stale-authority build выше — историческое состояние; последующий reader 0.2.94/0.1.13 и полный validate 582 описаны в PARITY-019, но не закрывают найденные live gaps.
- Evidence: [52-case review](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/first-column-live-review.r4.2026-10-09.md), [hashes/replay/диагностика](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/first-column-live-review.r4.2026-10-09.json). Private reports не перенесены в source fixtures; нормы, ZIP и registry/Generation/Proxy locks не изменены. Связь с Editor — **CC-COMPAT-NATIVE-CARD-FACTS-03**.


### CC-COMPAT-PORTABLE-DECLARED-TARGET-02 — переносимые привязки целей

09.10.2026. Shared core **0.1.12**, Editor **0.2.93**, локальный Apollo profile поддерживает `declaredTargetIdentityVersion=2`. В `identityBindingsV1` добавлен явный `portableReferenceHash`: из независимого reference hash исключаются только file-local `identity.mainComponentId` и `sourceIdentity.ownerMainComponentId`. Published component keys, sourceNodeId, тип, структура, свойства и остальные поля закреплены. Actual/source/reference обязаны совпадать с ближайшим текущим native owner; неизвестные факты, SLOT, подмена и дубликаты дают unknown. Старый policy v1 и bindings без portable hash сохраняют exact pin semantics. Новый compiled producer: `component-contract-editor@0.2.93`; неизвестные версии/неверный stamp отклоняются. В compact ZIP с несколькими вариантами importer восстанавливает диагностическое Anatomy первого варианта, который выбирается UI по умолчанию. Hash/полнота структуры проверяются; дерево помечено compact-structure-only и не создаёт runtime identity/permissions. Старые каталоги в current facts не подмешиваются.

Реализовано локально: compiler, runtime, Editor roundtrip и Apollo profile. Synthetic regressions проверяют import между документами, скрытую цель, stale reference, foreign source/owner, неоднозначность и incomplete capture. Полные gates core228, Editor823 и Apollo root81 regression files прошли. Apollo: type-check и 565 synthetic tests прошли в текущем совместном source (параллельно добавлен mapping port); финальный стандартный build после exact BG r60 registry/lock и observational reader refresh прошёл обычный V4 validate (565/565 tests). Main/UI пересобраны из актуальных source; семь browser сценариев mapping port проверены. Consumer reload и живые действия Apollo в Figma выполняет владелец; source gates не обходились. Пакет BenefitCard r3: независимо сверены 32 native variants / 96 bindings; replay десяти пользовательских отчётов даёт четыре ожидаемых violation и 16 compliant, без unknown в двух quantity checks. Private captures остаются в current-contract-packages, не в source fixtures. **Полный live coverage и release/publication открыты**; свежий user cycle Title/Graphic зафиксирован ниже; 29 context-only норм BenefitCard этим изменением не закрыты.

ButtonsGroup data handoff: desktop r60 сохраняет 17 Reviewed Figma norms / 30 неизменённых predicate bodies, mobile-web r3 — 19 Draft Figma norms / 29 bodies. Девять mixed context/recipe/interactive норм с исходными RuleID и текстами перенесены в `context/recipe-rules.json` каждого пакета. Loading уже проверяется direct-child Button r31 (Spinner r8); width требует двух последовательных снимков. Group Loading и фиктивные handlers/action IDs не вводятся. Source/code parity, актуальные Generation/registry lock pins и frontend/live/release приёмка отдельно открыты. Закрытие consumer rollout: прочитать точные новые ZIP/source hashes, подтвердить fail-closed старого/неподдерживаемого policy и получить свежий положительный/отрицательный прогон в установленном Editor/Apollo. Парные записи: Editor `docs/BACKLOG.ru.md` и Apollo `docs/ARCHITECTURE_BACKLOG.md` под этим stable ID.

Решение владельца от 01.10.2026: изменения Editor, влияющие на чтение
контрактов, фиксируются здесь в той же задаче. Сюда входят schema/import/export,
compiler/policy, facts/capture/correspondence, applicability, dependencies,
ownership, scenario inputs, coverage и hashes/pins. Обновляем существующий ID,
если задача уже заведена; связываем с `ComponentContractEditor/docs/BACKLOG.ru.md`.
Реализация в общем core, consumer integration, release и live acceptance —
разные состояния. Запись закрывается доказательством для Apollo, даже если
перенос кода не требуется. Чистые визуальные изменения Editor сюда не входят.

База этого среза: Editor 0.2.71–0.2.73 / shared core 0.1.0.
Editor 736/736, core validation и Apollo 98/98 прошли при исправлении capture.
Это проверка общего кода и существующих regressions; новые сценарии consumer
не объявляются принятыми. Пилот Apollo/Proxy профиля 0.4.0 содержит пять пакетов,
а принятая авторская подборка теперь содержит шесть. Private evidence остаётся
в `design-system_ab/experiments`, здесь сохраняются только ссылки и критерии.

09.10.2026: fresh installed Editor 0.2.93 / BenefitCard r3 scope verified by 8 user reports: desktop/mobile baseline, hidden Title, reset and hidden Graphic. Exact source/runtime/snapshot hashes and engine/editor replay match. Four expected violations, 12 compliant, zero inconclusive; Root/Title/Graphic all resolved. Scope is Vertical/Left/Background=True/Compact=False on two captured published variants, in authoring preview with Draft rules activated. All32-variant live acceptance, remaining29 norms, manual Reviewed/source/code/release gates remain open. Evidence: shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/r3-user-runs-review.2026-10-09.json; private reports stay outside source fixtures. Google Rules/ledger/Predicate comments read back; full Predicate remains Draft.

### Сверка с Editor · 05.10.2026

Свежая consumer проверка 06.10.2026: registry 1.1.0 / Generation 0.1.1,
55 Generation, 185 v4, 12 frontend, 81 root, 38 related Proxy; Chrome 440/360.
Полные current pins/closure подтверждены в PARITY-019. BG r58 по-прежнему Draft;
Code/native/profile/live/release приёмка независима. [Fresh handoff](../docs/GENERATION_CURRENT_INPUTS.md).

Текущая локальная база: **Editor 0.2.91 / core 0.1.10 / Apollo 0.4.0**.
NEXT-02 local gates: core **76/76**, Editor **820/820**, Generation **49/49**,
v4 **182/182**, root **81/81**; browser passport и панели пройдены.
PARITY-019/020 реализованы локально; authoring/registry/live/release остаются отдельно.
Последние gates после PARITY-014: Editor **819/819**, core **68/68**, Apollo **144/144**;
Chrome authoring regression пройдена. Числа и версии внутри записей ниже
относятся к историческим этапам, если не отмечено иное. Реализация в общем
core не требует повторного переноса в Apollo; открытые consumer/live/release
проверки сохраняют собственные критерии.

| ID | Текущее состояние | Что остаётся |
| --- | --- | --- |
| PARITY-001 | Shared identity/capture; локальные occurrence и bundled capture проверки есть | Полная целевая матрица local/imported main в живом Apollo |
| PARITY-002 | Bounded native SLOT capture реализован в core | Целевая проверка scope/coverage в component и area audit |
| PARITY-003 | Общие stale guards и отрицательные bundled tests есть | Воспроизвести BUG-001 на исходном узле; подтвердить independent-reference rerun |
| PARITY-004 | Доработка не реализована | Adapter полного Editor scenario/policy/transition coverage |
| PARITY-005 | Canonical mobile source принят; в pilot manifest его нет | Новый source release, routing, hashes/pins и Proxy/plugin acceptance |
| PARITY-006 | Conditional collections реализованы, local parity проверена | Live D/M/variants и published release |
| PARITY-007 | Occurrence addressing и local parity готовы | Остальная live матрица и release; перенос кода повторно не нужен |
| PARITY-008 | Direct-child dependencies/source closure и local parity готовы | Свежий consumer audit и release exact closure |
| PARITY-009 | Закрыта совместимость внешних ZIP filenames | Новая реализация не требуется |
| PARITY-010 | Closed membership/root alias и local parity готовы | Live состав/hidden/replace cases и release |
| PARITY-011 | Production IDs/aliases/relevant child modes исправлены | Оставшиеся variants/D/M, live Apollo и release |
| PARITY-012 | Typed values/multiselect совместимы, local parity пройдена | Authoring/live и published acceptance |
| PARITY-013 | Native occurrence reference исправлен; часть Editor Size=56 cases принята | Другие variants, live Apollo и release |
| PARITY-014 | Shared fix и bundled consumer negative/reset/guards пройдены локально | Fresh Figma Primary-second/reset, live Apollo и release/Proxy |
| PARITY-015 | Диагностика capture реализована, local parity пройдена | При повторении native failure получить stage/error; live/release |
| PARITY-016 | Offline edit готов; целевая ZIP → Apollo проверка закрыта этой сверкой | Published consumer acceptance |
| PARITY-017 | All-size icon lock готов; local parity и один Editor negative case есть | Fresh all-size original/swap/reset и release |
| PARITY-019 | Typed evidence и fresh current registry 1.1.0/full closure consumer proof готовы | BG source Ready/native recipes/accepted Code profile/live/release |
| PARITY-020 | Authoritative reexport выполнен владельцем; свежие пять ZIP/registry/lock прочитаны consumer | BG source Ready и independent live/release acceptance |
| PARITY-018 | Local main aliases исправлены; source ZIP/runtime parity и fresh Editor reset/negative Size=56 приняты | Live Apollo и release |

Дополнительно проверен состав входов: в `current-contract-packages` **7 ZIP**;
collection manifest перечисляет **6 canonical packages**, существующий
`dist/pilot-release/manifest.json` — **5**, `published=false`.
ButtonsGroup r56/17 Reviewed не добавлен в collection/pilot manifest этой
сверкой. Ready source не доказывает полную live acceptance; manifest/release
обновляются явно после соответствующих gates. Основной вход v4/Proxy — главный
manual с bound facts и authoring dependency closure, compiled — проверяемая
проекция. Формулировки о compiled-only consumer в старых этапах — история.

Практическая очередь:

1. Fresh Editor reset/negative PARITY-018 Size=56 приняты 05.10.2026,
   12:12:48 / 12:33:21 UTC. Продолжить remaining variant и live Apollo matrix;
   эти captures не закрывают all-size или published consumer acceptance.
2. Принять fresh capture PARITY-014 и отдельно воспроизвести PARITY-003 / BUG-001.
   Shared fix и локальная bundled consumer проверка PARITY-014 готовы.
3. Реализовать PARITY-004, сохраняя явные gaps при отсутствии scenario inputs.
4. Подготовить единый source/runtime release для PARITY-005 и готовых
   PARITY-006–018; обновить Proxy/plugin совместно, проверить hashes/pins,
   routing и повторные captures.
5. Пройти живую consumer матрицу и отображение BUG-002/003. Локальная
   реализация BUG-002/003 уже готова; повторная разработка без нового дефекта не нужна.

Историческая остановка legacy gate на отсутствующем CardImage fixture устранена:
current root typecheck/build/Figma parser и все 81 regression проходят.
Эти локальные проверки не являются live/release acceptance. Генерация ведётся отдельно в
APOLLO-V4-GEN-001 и не закрывает contract-reading/coverage acceptance.


### APOLLO-V4-PARITY-019 — NEXT-02 representation evidence и typed code bindings

- Дата: 05.10.2026. Реализовано локально: **Editor 0.2.91 / core 0.1.10 / v4 0.4.0**.
  Requests NEXT02-REPRESENTATION-EVIDENCE, NEXT02-OWNED-OCCURRENCE-CODE-BINDING,
  NEXT02-NATIVE-SLOT-CODE-BINDING. Нормативные source/ZIP/registry/locks не изменены.
- [x] Optional closed v1 codeEvidence отделяет API, parity для declared profile,
  acceptance receipt и publication; typed scalar enum-map, exact direct-owned
  occurrence resolver и native SLOT association не разрешают произвольный handler.
  Opt-in runtime flags/producer 0.2.91; historical unmarked wire остаётся прежним.
- [x] Editor/schema/compiler/runtime и v4 используют один core. Predicate Ready
  независимо от Code Draft. Fresh Node proof связывает basis registry digest с
  текущим checkout/registry и scope; API/build proof не принимает layout/профиль.
  Code scope исключает receipt claims и audit timestamps/revision, сохраняя нормы,
  identities/profiles/facts/dependency pins; фактический source отдельно exact pinned.
- [x] Generation сохраняет поля в projection, проверяет trusted receipts, declared
  profile/input states и closed transforms. Owned projector проверяет canonical
  native identity/visibility/order; hidden middle меняет индекс. Native write/slot
  operation/scenario acceptance не возникают из schema declaration.
- [x] Gates: core 76, Editor 820, Generation 49, v4 182, root 81; Chrome passport
  save/ZIP/stale-cache rejection и v4 440/360. Unknown versions, lost identity,
  foreign owner/child, bad receipt/ref/scope и прежний Draft block покрыты.
- [ ] Критерий полного закрытия: владелец принимает authored fields/passport/native
  recipes и exact Code profile receipts, обновляет registry/locks после exports;
  отдельный live consumer/Proxy/release acceptance. NEXT02-SCOPED-GENERATION-AUTHORITY
  остаётся proposal-only; whole-package Draft bypass не реализован.
- [x] 09.10.2026, APV4-MAPPING-BUILD-PRODUCER-READER-COMPAT: минимальный
  observational reader применён для current BG r60. Прежние пары Source/compiled
  `ready/ready` и `draft/draft` сохранены; новый split `draft/ready` принимается
  как scoped compiled observation. Обратная пара `ready/draft` отклоняется;
  Source Draft остаётся generation blocker. Reader сохраняет Code Draft,
  dependency/freshness/native/profile/live/release gates.
  Прежняя пара **Editor 0.2.91 / core 0.1.10** поддерживается. Новая точная пара
  **0.2.93 / 0.1.12** допускается только при authority
  `shared/design-system_ab/experiments/current-contract-packages/reports/producer-handoff.2026-10-09.json`
  с SHA256 `c02b28ffe4c44e15487f7c60a0a1d0927941630d3ef99260804371c46f50a380`.
  Unknown/mixed/malformed versions и изменённый authority pin отклоняются;
  metadata/lock digest и trusted provider filesystem freshness обязательны.
  Связанный Editor item: [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
  Приёмка: General reviewed sole-writer apply согласованного producer/reader
  пакета, actual working filesystem pins, Generation: 190 тестов, и штатный V4 validate: 565 тестов
  прошли. Семь браузерных сценариев подтверждают только mapping UI; Figma live выполняет владелец. Reader tests не принимают source/code/native
  execution или scoped authority; size40/five actions остаются вне задачи.
  Дополнение 09.10.2026, CURRENT-CATALOG-READER-0.2.94: после BenefitCard r4
  новый scoped Code Connect handoff допускается только для **0.2.94 / 0.1.13**,
  authority `arui-private/tools/code-connect/reports/current-catalog-producer-handoff.editor-0.2.94-core-0.1.13.2026-10-09.json`,
  SHA256 `b271a238126649645111bdad22779fcfde67237c8a91b7deea2835a4e21869f8`.
  Reader сохраняет прежние exact branches и Source Draft/code/native/profile/live
  gates; BenefitCard не добавляется в mappings. Добавлены regression cases для
  exact tuple/pin и запрета status promotion. Интеграция reader подтверждена:
  normal Generation type-check/build **193/193**, actual working registry/lock
  digest `00882354399fa4c8e59eb9aa384f7dd549880465f383b91dce3af9fe74ce591f`,
  normal V4 validate **582/582**, root validate **81/81**. Все 201 build inputs
  совпали; 233 остальных source inputs сохранены. CC desktop r13/mobile r8
  Source Ready subset нормализован без допусков исполнения. BG r60 остаётся
  Source Draft при scoped compiled Ready. Штатный inspector исправлен:
  Ready roots требуют одновременно sourcePredicateStatus=ready и compiledStatus=ready;
  BG проверяется отдельно и отклоняется normalization gate `PRODUCER_VIEW_STALE`.
  Legacy `SOURCE_COMPILE` поддержан, неожиданный successful Draft не принимается.
  Две регрессии закрывают ошибочный выбор scoped-Ready и missing/unknown status.
  Штатный inspector receipt создан; Source/code/native/profile/live gates сохранены.
  Prompt context читается из текущих authoring contracts. Отдельный реальный
  read-only CLI/HTTP прогон planner дал schema-valid Draft ScreenSpec (HTTP 200),
  executionAllowed=false, один unresolved; 42 generation Proxy tests PASS.
  Working Proxy на 3001 не запускался; source/code/native/profile/live target
  acceptance не повышен, targets не исполнялись.
- [x] 06.10.2026, NEXT-02 producer refresh consumer: **generation-core 0.1.1**
  явно принимает registry 1.0.0/1.1.0; full lock/currentInputs metadata и exact
  five-package root/transitive closure не отбрасываются. Общая schema/core/Editor
  остаются 0.1.10/0.2.91. Fresh basis/current/full-scope/code/ref observations
  не принимают профиль. Current host bridge использует immutable historical
  behavioral evidence отдельно от current input freshness. Producer/DS read-only.
- [x] Actual canonical CC r13/r8 и Button/Spinner Ready subset; BG r58 Draft
  SOURCE_COMPILE. Built main/UI → installed Proxy context и frontend gate прошли:
  CC API confirmed/source Ready/profile blocked, BG SOURCE_COMPILE; no artifact,
  zero native writes. All current pins в [GENERATION_CURRENT_INPUTS](../docs/GENERATION_CURRENT_INPUTS.md).
- [x] Fresh gates 55 Generation, 185 v4, 12 frontend, 81 root, 38 related Proxy,
  UI 440/360; changed producer bridge real synthetic tsc/Vite/Chrome run passed.
  Missing/forged metadata, wrong basis/current/scope/code/facts/ref, unknown
  versions, repacked/transitive pins и Draft/profile negatives covered.
- [ ] Осталось принять BG source scope, exact source/code/frontend profiles,
  commands/presentation/width/native recipes, затем actual/live/release receipts.
  Producer refresh уже выполнен владельцем; current consumer compatibility закрыта.
- [x] 06.10.2026, native recipe/capability research: core **0.1.10** / Editor
  **0.2.91** без изменений; [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings)
  остаётся соответствующим typed-field owner item. Consumer impact: offline
  source-derived proposed DTO для CC Body desktop/mobile и BG owned Button,
  exact property/source/dependency pins и closed observational SLOT proof.
- [x] Official SlotNode append/insert/reset API документировано; installed
  1.121.0 unsupported, pinned official 1.141.0 snapshot type-supported для SLOT,
  но slotContentId declaration отсутствует (TS2339). BG mapping key — set;
  нужен отдельный reviewed set→exact variant definition boundary. Dependencies,
  runtime host/providers, нормативные inputs и scoped authority не изменены.
- [x] v4 type/build/test **192/192**, root **81/81**, семь новых offline cases;
  actual producer CLI вывел три proposed recipes. Capture omission не доказывает
  empty/order. Exact missing inputs и future owner capability checks:
  [GENERATION_NATIVE_RECIPE_PROPOSAL](../docs/GENERATION_NATIVE_RECIPE_PROPOSAL.md).
- [ ] Acceptance: authoritative SLOT source address/reference typing, BG native
  main-component/occurrence proof, accepted recipe/profile/scenario/API runtime
  receipts, complete payload readback и rollback. Live not-run; accepted
  binding/primitive providers null, production execution не разрешено.
- [x] 06.10.2026, NEXT-03/04 runtime reproducibility: прежние 282…/980…
  reproduced из одной source closure; diff — strict directives. Custom
  onResolve заменён existing canonical aliases; eight cold fixed builds stable,
  новый byte/strict regression, v4 **193/193**, root **81/81**. Core/Editor
  **0.1.10/0.2.91** прежние. Actual new-runtime current-input probe сохраняет
  CC Ready subset / BG SOURCE_COMPILE / profiles not-accepted / native missing.
- [x] Published exact @figma/plugin-typings **1.141.0** verified по npm SHA512
  integrity, shasum и dereferenced official tag/gitHead. Isolated root/v4/core
  type-check passed, но typed slotContentId TS2339 остаётся. Concrete exact
  dependency/type proposal подготовлен; installed 1.121.0/lock/providers прежние.
- [ ] New runtime actual host/live acceptance и official typed identity input
  ещё required; old receipts не перенесены. [Reproducibility/types handoff и final pins](../docs/GENERATION_BUILD_REPRODUCIBILITY.md).
- [x] 06.10.2026, NEXT-04 installed types/read-only action: project-local exact
  **@figma/plugin-typings 1.141.0**, only one lock package + root devDependency;
  official bytes/SRI matched. Shared **core 0.1.10 / Editor 0.2.91** unchanged.
  SLOT types supported, official slotContentId TS2339 остаётся; narrow documented
  unknown read guard не создаёт writer/accepted binding.
- [x] Callable main/UI diagnostic и private JSON export: existing CC Body
  desktop/mobile и BG exact Size56 variant/owned children, fresh full producer /
  runtime / build / technical context-plan pins, canonical local correspondence,
  bounded payload with omissions/unknown. Selection/page/spec/child-main drift,
  missing/duplicate/remote identity не превращаются в accepted recipes.
- [x] v4 **204/204**, root **81/81**, 11 synthetic read-only cases, built UI
  **440/360**, built main/synthetic nodes → actual installed Proxy context;
  no native calls. Three full builds identical; runtime a585… unchanged,
  main/UI/build manifest new pins. Prior host receipts не repinned.
- [ ] Acceptance: user performs existing-selection read and saves private JSON;
  owner reviews authoritative source/SLOT/BG symbol recipes, runtime mutation/
  readback/rollback and exact profile/scenario/live receipts. Providers null,
  scoped authority proposal-only, BG Draft/profile gates прежние. No normative
  writes, Figma capture/write, target artifact or Proxy deployment. [Current
  diagnostic handoff](../docs/GENERATION_NATIVE_DIAGNOSTICS.md);
  [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
- [x] 06.10.2026, NEXT-04 actual user observations/review: three immutable
  private v1 reports hash/historical pins checked; user native-read observed,
  mutation/live acceptance not-run. Shared core **0.1.10** / Editor **0.2.91**
  unchanged. Remote suffix не принят как canonical source identity.
- [x] v2 declared raw BG properties независимо от canonical matching; explicit
  query/value/type/omission statuses. Official current-page nodechange on/off
  subscription/rebinding/close вместо global documentchange; bounded current-page
  coverage, unavailable/detach/late callback negatives, no page loads/mutations.
- [x] Latest type-check + synthetic **212/212**, root **81/81**, built v2 UI
  **440/360**, private latest-source VM readonly/invalidation/stale-build guards.
  UI retains v1 compatibility; original reports/accepted providers untouched.
- [ ] Final standard build blocked **STALE_CONTRACT_PIN buttons-group.desktop**
  during approved BG authoring refresh. Existing v2 dist snapshot predates final
  empty-declaration guard; latest source/private VM verified separately. Exact
  Contract Creation → Code Connect handoff, one agreed consumer rebuild/verify
  then user retest; no freshness/gate bypass. Owner Reviewed/pilot scope approved,
  real action/runtime/native/profile/live inputs still separate. [Diagnostic v2
  review/handoff](../docs/GENERATION_NATIVE_OBSERVATION_REVIEW.md).
- [x] 06.10.2026, NEXT-03/04 r59 consumer refresh: exact Code Connect handoff
  8182fe… verified; registry1.1.0 digest4540c8… / inputs cf9cc8… / lock8dfe66…,
  immutable basis bf7834… сохранён. Shared core **0.1.10** / Editor **0.2.91** /
  generation-core **0.1.1** прежние; schema/checker/compiler changes не требуются.
  Source/recipe/build/context/lock observations обновлены; old r58 receipts unchanged.
- [x] Final standard v4 **212/212**, root **81/81**, all92 built source inputs
  match latest files, empty-declaration guard включён. Stale/source↔dist mismatch
  устранён, reload/read-only retest ready. Actual localhost CC source/API/context
  pass + BG SOURCE_COMPILE; both technical targets blocked, no artifact.
- [x] Built main/UI → actual HTTP Proxy на synthetic BG nodes: v2 envelope/export,
  raw values independent of remote canonical unknown, current-page observer
  invalidation/exact cleanup, v1 correlation; zero writes/imports/page loads.
  440/360 Chrome154.0.8037.98 exact binary pinned; old browser receipts historical.
- [x] 06.10.2026, actual user native v2 reads: три private reports проверены по
  reportHash и exact r59 source/producer/lock/recipe/runtime/build/type pins; all92
  source inputs совпадают. Shared core **0.1.10** / Editor **0.2.91** прежние.
  BG 12 raw typed fields fully observed; CC desktop/mobile bounded SLOT/FRAME/limits
  observed; current-page observer available. Inputs не становятся tracked fixtures
  или accepted recipes. [Review и action points](../docs/GENERATION_NATIVE_V2_USER_REVIEW.md).
- [ ] Actual export invalidation after selection/page change и close cleanup
  отдельно: три JSON содержат observer snapshot, последующий lifecycle не записан.
- [ ] Canonical SLOT/owned/symbol/native recipes/profile/scoped authority/mutation/
  live/release acceptance remain separate. BG59 Reviewed26, context-only9
  nonExecutable, Source Draft; owner content-only pilot approved, real action/
  loading/width facts not supplied. [Current build/vector](../docs/GENERATION_R59_CONSUMER_READY.md).
- [x] 06.10.2026, NEXT-04 rollback safety: bounded pre-mutation journal вместо
  speculative page rehome; unknown/async drift preserved in place, known parent/
  order/local+absolute transform checked after cleanup. Necessary generated
  ancestors/sibling/layout anchors retained; nested/mixed subtree deletion re-fenced
  after every failed removal. Partial restore/remove, missing parent, bounds,
  active write и retry explicit incomplete, diagnostics propagated to receipt.
- [x] **28/28** targeted synthetic host/journal/adapter tests; no actual native
  calls/capability/mutation/readback/rollback proof. Shared **core 0.1.10 / Editor
  0.2.91 / Generation 0.1.1** unchanged; no source/compiler/ZIP/registry changes.
  [Rollback scope и guarantees](../docs/GENERATION_ROLLBACK_SAFETY.md).
- [x] Final local gates: v4 **231/231**, root **81/81**, adapter-figma **8/8**,
  type-check/build и Figma runtime parser passed. Exact latest-source build vector
  сохранён отдельно; unchanged browser suites не повторялись.
- [x] Static pilot review inputs: owner width **1600**, single **default** state;
  handlers/events/transitions не нужны. Null product fields и current mandatory
  eventId retained as explicit CONTENT-ONLY-OWNED-PORT gap; no fake events or
  authority bypass. [Reviewable input/projection design](../docs/GENERATION_STATIC_PILOT_INPUT.md).
- [ ] Two product ActionIDs/labels/View/disabled/explicit Loading=false,
  independent priorityOrder, viewport height и actual BG width-fit; accepted static
  protocol/scoped nine-rule receipts/native recipes/target/profile/live/release.
  Current three applicable + six conditional NotApplicable не являются verdicts;
  BG59 remains Draft. Prior private user/browser receipts not repinned.
- [x] 06.10.2026, NEXT-03 / CONTENT-ONLY-OWNED-PORT — Draft реализация локально
  после General review bounded rollback (208 hashes / 93 inputs / 28 targeted PASS).
  Sole writer Generation: отдельные versioned Draft static ScreenSpec/plan DTO,
  closed schema, deterministic content projection, explicit ActionID/label/View/
  disabled/Loading=false и independent priorityOrder, без eventId/onClick/no-op.
  Прежний v1 interactive wire/event semantics сохраняется. Shared core **0.1.10** /
  Editor **0.2.91** unchanged; generation-core baseline **0.1.1**, v4 **0.4.0**.
- [ ] Acceptance этого технического этапа: synthetic compatibility/negative tests,
  source/profile/canonical/width/target gates остаются blocked, adapters не исполняют
  неподдержанную static version; отдельный exact Code Connect static emit request.
  No arui producer/registry/DS/compiler edits, scoped authority/provider activation,
  native calls/target/live/release. Product fields запрошены в General; draft до
  ответа неполон, width1600/default уже подтверждены. NEXT-03 protocol review не
  является source/profile/native acceptance. Editor compatibility item:
  [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
- [x] Closed static v1-draft DTO/schema + deterministic frozen content plan,
  distinct displayOrder/independent priorityOrder и explicit Loading=false;
  null canonical provenance, four/two-hidden requirements, bounded Draft fact shape
  accepted=false. Legacy interactive v1 preserved; producer/v4/adapters reject
  unsupported static version before host calls; forged v1 shape cannot receive PASS.
- [x] Owner labels «Сохранить», «Назад» и display order, обе Size56 подтверждены;
  General assigned local save/back IDs. Current new draft retains unknown View/
  disabled/Loading/priority/height/width; SavePrimary/BackSecondary enabled,
  Loading=false/save higher — separate owner-review proposal. Historical pinned
  drafts/handoffs untouched. [Protocol/current inputs](../docs/GENERATION_STATIC_CONTENT_PROTOCOL.md),
  [Code Connect request](../docs/GENERATION_STATIC_CODE_CONNECT_REQUEST.md).
- [x] NEXT-03 final local gates: generation-core **75/75**, v4 **233/233**,
  Figma adapter **9/9**, frontend adapter **13/13**, root **81/81**, type-check/build
  и runtime parser passed. Final standard v4 manifest/pins after doc edits сохраняются
  отдельно; no browser rerun or actual native/target calls. Existing rollback code,
  installed typings/lock/null providers and historical pinned drafts unchanged.
- [ ] General technical review / owner product proposal acceptance, будущий static
  producer emit + static target support/canonical/actual-width/profile/scoped receipts;
  source Draft/compiler policy/providers unchanged, no actual target/live/release.
- [x] 06.10.2026, NEXT-03 / DRAFT-AUTHORING-STATIC-REVIEW — новый consumer
  request принят после General review producer 74c3e0… / artifact b73d5c…;
  отдельный versioned accepted=false/executionAllowed=false authoring source
  metadata reader и typed producer-owned static JSON inspection/import.
  Штатные main/facts/compiler issues и Draft/nonExecutable coverage сохраняются;
  runtime assertRuntimeContract/Ready execution gates не меняются. **Core 0.1.10 /
  Editor 0.2.91 / generation-core 0.1.1 / v4 0.4.0** baseline.
- [x] Local acceptance checks: exact main/archive/source/dependency/build/provenance;
  unknown/authority/interaction/stale source-content-consumer negatives; standard
  compiler errors and nine nonExecutable context rules preserved. Separate source
  metadata / producer inspection DTO accepted=false/executionAllowed=false;
  producerPlanHash distinct, generationPlanHash=null. Node review port does not
  enter controller/adapters or runtime inventory. Source Ready gates unchanged.
- [x] Gates: Generation **127/127**, v4 **239/239**, adapters **9/9 + 13/13**,
  root **81/81**, type-check/build/runtime parser passed; **58** new synthetic checks.
  Actual five-package read-only probe retained BG59 Draft/nonExecutable9 and strict
  SOURCE_COMPILE. All three frozen producer examples are historical/stale after
  consumer edits; final exact mismatch/vector/rebind request prepared privately.
  Historical drafts/observations preserved, no private captures/norms in fixtures.
- [ ] General technical review and sequential Code Connect consumer rebind;
  current owner product proposal, source/profile/canonical/width/scoped/native/
  target/live/release remain open. Producer/registry/DS/compiler/primitive policy/
  accepted providers unchanged; no actual Figma/browser/frontend operation.
  [Review APIs, separate versions and limits](../docs/GENERATION_DRAFT_SOURCE_REVIEW.md).
  **Core 0.1.10 / Editor 0.2.91 / generation-core 0.1.1 / v4 0.4.0** unchanged.
  [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
- [x] 06.10.2026, NEXT-03/07 STATIC-REVIEW-V4-PROXY — General accepted prior
  local Draft reader and exact producer rebind (inspected/mismatch0). Sole writer
  Generation: separate read-only panel review/check → existing Proxy → verified
  authoring/producer review port, with independent schema/source/API/coverage/
  freshness/live/release diagnostics. Invalid product fields remain explicit;
  client cannot supply filesystem paths/trusted pins. accepted=false,
  executionAllowed=false/generationPlanHash=null; execution gates unchanged.
  Core0.1.10/Editor0.2.91/Generation0.1.1/v4 0.4.0 baseline, linked
  [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
- [ ] Acceptance: bounded version/hash/shape transport, server-owned local config,
  missing/unsupported/tamper/path/pin/stale/build/readfail/nohost negatives,
  synthetic controller/HTTP/UI harness and browser smoke if locally available;
  full existing gates, final exact consumer vector + subsequent producer rebind.
  No producer/DS/scoped/profile/native edits, actual Figma tests, publishing,
  installation or installed Proxy lifecycle changes; all five goals remain open.
- [x] Local route/DTO/UI implementation: fixed endpoint, server-owned trusted
  config, bounded sanitized source/hash/count metadata, explicit missing fields,
  producer content/hash correspondence and historical freshness. No source norms
  or compiled authority in transport; no prepare/emit/execute or hosts.
- [x] Gates Generation152/v4 248/adapters9+13/root81 passed; targeted synthetic
  core25/UI9/HTTP16 plus existing HTTP7 passed. Four browser harnesses at440/360
  passed; actual UI→mounted Proxy route→synthetic reader and two private real
  pinned Node HTTP probes verified separately. No installed process/app changes.
- [ ] Full Proxy acceptance:391 pass/7 pre-existing legacy catalog/crosswalk
  failures, exact same seven with pre-stage service SHA restored in memory.
  Knowledge check passes. No normative data fabrication, DS edits or silent skip.
- [ ] General review, subsequent sequential producer rebind/current observations,
  installed/runtime retest and product/source/profile/scoped/native/canonical/
  width/target/live/release acceptance remain open. Prior producer/handoffs immutable;
  current consumer changes explicitly stale. [Route/evidence/limits](../docs/GENERATION_STATIC_REVIEW_ROUTE.md).
- [x] 06.10.2026, NEXT-03/07 detached consumer binding stage1: producer v1
  preserved; explicit closed v2 transport keeps original producer freshness and
  adds independently trusted local receipt status. Full vector/config/archive,
  source/API/package/dependency and standard build/UI/read-port closure checked;
  before/after async drift and authority forgeries covered by synthetic tests.
  Core0.1.10 / Editor0.2.91 / Generation0.1.1 / v4 0.4.0 compatibility versions
  remain unchanged; this is additive review transport, not Editor/source Ready.
  Linked [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
- [ ] Stage1 independent General review, Design Check UI integration, full
  combined source/build review, then V0 freeze and the separately assigned finite
  P/O/B/C1/V1/R/D/G sequence. Preparation does not create those snapshots or
  accept source/API/coverage/native/profile/scoped/live/release. C0 remains
  unchanged. NEXT07 root/migration repairs preserved; normative crosswalk gate
  remains failed pending the two CCW owner decisions. Full gate cannot be called
  green. [Generic receipt contract](../docs/GENERATION_STATIC_REVIEW_ROUTE.md#detached-consumer-binding-stage1-preparation).
- Подробный handoff: [GENERATION_CODE_EVIDENCE](../docs/GENERATION_CODE_EVIDENCE.md).
  Editor: [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).

### APOLLO-V4-PARITY-020 — Lossless authoring export и historical dependency stamp

- Дата: 05.10.2026. NEXT02-DEPENDENCY-PROJECTION-PACKAGING; **core 0.1.10 / Editor 0.2.91**.
- [x] Explicit own projection supplies only sourceExportVersion after recompilation
  matches its whole hash; predicates never become compiler input. Invalid source,
  stale cache/facts/stamp and unsafe evidence path fail closed. UI export catches
  the error; changed sources require fresh compile and deliberate repin.
- [x] Actual JSON inventory переносится независимо от descriptive importedFiles.
  Exact duplicate inputs дедуплицируются, linked dependency projections сохраняются,
  reopen проверяет full facts. Reduced anatomy из compiled API не вытесняет полные
  saved facts. Legacy filenames и normative source остаются прежними.
- [x] Real read-only Button r31 / Spinner r8: temporary exported ZIPs сохраняют
  прежние manual/facts и compiled hashes, exact Spinner link; v4 загружает оба Ready.
  Tampered projection отклонён. ButtonsGroup доходит до своего Draft gate без
  dependency-link bypass. Production архива не заменялось, private fixtures нет.
- [x] Synthetic compiler/ZIP/stale source/consumer parity и Chrome reopen/export;
  полный local gate указан в PARITY-019.
- [x] Contract Creation выполнил authoritative reexport; Code Connect обновил
  registry/lock 1.1.0. 06.10.2026 Generation проверил all-five actual bytes/meta/pins
  и canonical four-Ready subset. Подробные receipts связаны в PARITY-019.
- [ ] Full BG source Ready и independent live/release acceptance остаются;
  producer input lock не является whole-source Ready generation lock.
- Editor: [EDITOR-LOSSLESS-EXPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-lossless-export-001--historical-projection-и-full-authoring-evidence).

### APOLLO-V4-PARITY-021 — Frontend execution host и NEXT-05 profile boundary

- Дата: 05.10.2026. Локально реализован **adapter-frontend 0.1.1 / v4 0.4.0**;
  shared **core 0.1.10 / Editor 0.2.91** unchanged. Contract-reading compatibility
  PARITY-019 / [EDITOR-CODE-PASSPORT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
- [x] Реальный main/UI→Proxy execute/cancel/artifact route; server-owned closed
  profile/command DTO, private artifact, actual tsc/Vite + Chrome plan receipts,
  freshness/replay/cancel/partial rollback. Spec не принимает code/HTML/receipts.
- [x] Genuine selective imports ButtonGroup/CorporateContent; два proposed recipes
  не зарегистрированы как accepted. Default profile port null, synthetic-local
  capability только в отдельном test factory. Native event не выдумывается для Picker.
- [x] Gates: frontend 12, Generation 49, v4 185, root 81, related Proxy 38;
  UI 440/360 и actual installed stale-pin gate/no writes. Synthetic actual host
  проверяет baseline/opt-in equal-label IDs, disabled/states/transitions/width guard,
  bank drift/cancel cleanup. Doctor changed/full: no issues; numeric API unavailable.
- [x] Authoritative current ZIPs прочитаны: Button/Spinner exact retained compiled
  pins, CC r13/r8 Ready прежней Figma области; временный Ready subset lock обновлён.
  Полный Generation source lock не выдан: BG r58 independent Draft SOURCE_COMPILE.
  Packaging PARITY-020 и Code Connect producer refresh выполнены владельцами;
  fresh consumer compatibility 06.10.2026 зафиксирована в PARITY-019.
- [x] 06.10.2026 registry/lock 1.1.0/current observations и actual installed bridge
  проверены; historical behavior/current freshness раздельны. См. [fresh handoff](../docs/GENERATION_CURRENT_INPUTS.md).
- [ ] Критерий полной приёмки: принятый source scope, profiles/width/presentation/commands,
  native recipes и отдельные actual plan/live/parity/release receipts.
  Immutable basis digest не заменяется current digest; scoped Draft bypass отсутствует.
- Handoff: [GENERATION_FRONTEND_HOST](../docs/GENERATION_FRONTEND_HOST.md).

### APOLLO-V4-PARITY-001 — Topology и source identity вложенных instances

- [ ] Проверить новый capture/correspondence через настоящий consumer v4.
- Приоритет: P1. Статус: механизм реализован в общем core; отдельная приёмка
  Apollo открыта. Источник: Editor 0.2.71, 0.2.72 и 0.2.73.
- Capture сохраняет occurrence IDs и parent/child edges один раз; duplicate IDs,
  циклы и противоречивое дерево отличаются от реального лимита 500 узлов.
  Ошибка topology не превращается в пустой selector, обычную truncation или PASS.
- Для одинаковых соседних library keys используется доказанная source identity
  в owner scope с полной inherited ancestry, без выбора по имени или индексу.
  Local main и imported main проверяются разными source routes: remapped IDs
  импортированного main подтверждает отдельный pristine instance того же main
  с проверенными id/key и полной bounded topology. Actual не служит своим
  reference. Временные экземпляры удаляются при успехе и ошибке.
- Учесть markers `instanceSourceIdentityVersion=1`, nested `component.sourceIdentity`
  и capture diagnostics `instanceSourceIdentityCapture`. Identity связывает
  слои; разрешённые значения и variant/swap boundaries определяет контракт.
- Критерий закрытия: v4 capture и frozen-snapshot replay совпадают с общим
  core/Editor для local/imported main, одинаковых siblings, rename/hide и
  отрицательных foreign/duplicate/unknown/port-conflict сценариев. Старые captures
  без evidence воспроизводят прежнюю неполноту. Library/actual неизменны,
  cleanup доказан; в выбранной области occurrences и focus остаются раздельными.
- Private evidence: `design-system_ab/experiments/web-corp/CorporateContent/mobile-web/authoring/reports/`.
  Встроенные повторяющиеся Button в ButtonsGroup — следующий consumer сценарий,
  после ручного authoring нового контракта.

### APOLLO-V4-PARITY-002 — Безопасный bounded capture внешнего native SLOT

- [ ] Подтвердить границы захвата и coverage в component/area audit v4.
- Приоритет: P1. Статус: capture plan реализован в shared core (Editor 0.2.71);
  consumer verification открыта.
- Пропускать payload только доказанного уникального direct-root native SLOT
  по reviewed unconditional external `composition.content`. Сам SLOT проверяется.
  План закреплён manual hash; после изменения manual пересчитывается.
- Если правила затрагивают content/descendants/dependencies или структура SLOT
  не доказана, нужен полный capture. Не распространять эту оптимизацию на
  вложенные SLOT или встроенные Button instances по сходству названий.
- Критерий закрытия: большой внешний Body не исчерпывает лимит host capture;
  host rules исполняются, исключённый payload остаётся вне ответственности host.
  Payload в area audit получает свой маршрут при наличии контракта, а реальные
  gaps видны. Изменённый manual, неизвестный SLOT и правило содержимого не дают
  ложного пропуска/PASS. Первичный и повторный capture используют одинаковый план.
- Связанные задачи: BUG-001 (состав повторного захвата), BUG-002 (ownership).

### APOLLO-V4-PARITY-003 — Stale guard после новых independent references

- [ ] Проверить сравнение фактов при повторном захвате в v4.
- Приоритет: P1. Статус: открыто; это проверка риска, причина BUG-001 не установлена.
- `checkCapture` повторно вызывает shared `collectNodes`. Сравнивать наблюдаемые
  факты и topology одинаковой области; ephemeral IDs временных pristine/source
  references и diagnostics не должны выглядеть как изменение actual instance.
  Stable source identity и реальные изменения actual остаются значимыми.
- Критерий закрытия: два захвата неизменного local/imported instance с новыми
  references не прерывают audit; изменение selection/property/visibility/topology
  во время capture по-прежнему блокирует публикацию устаревшего результата.
  Проверить тот же scope и native SLOT omissions во всех повторных captures.
- BUG-001 сохраняет собственный критерий: успешная проверка исходного узла
  `11717:41799` пользователем. Приёмка другого узла его не закрывает.

### APOLLO-V4-PARITY-004 — Полное Editor coverage поверх compiled predicates

- [ ] Добавить consumer adapter scenario/policy coverage из общего ядра.
- Приоритет: P1. Статус: открыто; уже предусмотрено этапом 2 `APOLLO_V4_PLAN.md`.
- Сейчас `auditContractSnapshot` исполняет `evaluateCompiledContract` и сообщает
  scope `compiled-predicate-execution`. PASS исполнимых predicates не равен
  полноте Editor authoring/validation, особенно для policy-only external Body.
- Перенести учёт сценарных ожиданий, policy-only boundaries, before/after
  transition evidence, неисполненных delegated/context-only маршрутов и
  dependency ownership. Использовать общий evaluator/report semantics;
  не писать второй движок и не выводить нормы из rationale.
- Критерий закрытия: для одинакового frozen snapshot/manual/pins совпадают
  RuleID, applicability, compliant/violation/unknown/notExecuted и причины
  неполноты в Editor, Apollo и Proxy replay. Нет inputs — явная неполнота;
  объяснение Codex не закрывает маршрут проверки. Component и aggregate coverage
  сохраняют реальные gaps; внутренние части не создают standalone gap без основания
  (BUG-002). Scope приёмки и исключённое внешнее содержимое видны в отчёте.

### APOLLO-V4-PARITY-005 — Принятый [M] CorporateContent в release Apollo/Proxy

- [ ] Подключить canonical mobile manual r6 как шестой пакет consumer release.
- Приоритет: P1. Статус: authoring принят владельцем 01.10.2026; Apollo/Proxy
  каталог и release ещё не расширены.
- Source: `design-system_ab/experiments/web-corp/CorporateContent/mobile-web/authoring/contract.manual.json`
  с собственными bound facts, runtime index и `reports/acceptance.json`.
  Приёмка охватывает 6 source rules / 17 RuleIR; Body external, root layout без
  height lock, clipping, grid baseline, page colour modes и root visuals.
- Canonical r6 и owner export r7 сохранены отдельно: metadata-only revision alias
  не должен стать вторым нормативным источником или молча заменить pins.
  `current-contract-packages/manifest.json` содержит canonical шестой пакет.
- Критерий закрытия: source closure и manual/facts/compiled/dependency hashes
  проверены общим compiler; ключи mobile разрешаются в правильный пакет отдельно
  от desktop. Новый runtime/release явно закрепляет новые capture возможности;
  версию профиля и compatibility policy выбрать по фактическому изменению.
  Proxy из `.app` и plugin используют один release, существующие пять пакетов
  сохраняют pins и replay. Повторить пользовательские negative/reset сценарии:
  6/6 matches, 17 determinate; negative — ровно clipping/modal violations,
  reset — 17 compliant. Coverage закрывается только в заявленном scope.
- Private review scripts: `review_corporate_content_mobile_live.js` и
  `review_corporate_content_mobile_acceptance.js` в `design-system_ab/scripts`.

### APOLLO-V4-PARITY-006 — Условные ограничения коллекции для ButtonsGroup

- [x] Shared authoring/runtime и локальное чтение в Apollo проверены.
- [ ] Release/Proxy integration и live acceptance авторского manual.
- Приоритет: P1. Editor 0.2.77 / shared core 0.1.3 (02.10.2026):
  `memberCollection`, `memberCollectionsVersion=1`, typed host/member filters,
  count/first-last/domain/mapping/host requirement. `dependency.subjectCondition`
  объявляет `dependencySubjectConditionsVersion=1` для узкого asset scope.
  Gates отклоняют missing/unsupported versions и malformed types. Missing
  evidence сохраняется в evaluation/coverage; известное нарушение не скрывается.
  v4 validate 103/103; Editor 774/774, core 5/5. Равенство shared/consumer
  engine, structural focus и неполное coverage проверены synthetic fixtures.
  UI сохраняет тот же source model и hashes; child contract остаётся read-only.
- План подготовлен 01.10.2026 на базе Editor 0.2.74 / core 0.1.0:
  [BUTTONSGROUP_EDITOR_PLAN.ru.md](../../ComponentContractEditor/docs/BUTTONSGROUP_EDITOR_PLAN.ru.md),
  этап 4, задача BUTTONSGROUP-AUTHORING-001; формы/приёмка — 005/006.
  Typed formats/capability versions перечислены выше; published pins не заменены.
- Источник: `ComponentContractEditor/docs/BACKLOG.ru.md`,
  `BUTTONSGROUP-AUTHORING-001`; анализ в
  `design-system_ab/experiments/web-corp/ButtonsGroup/authoring/ANALYSIS.ru.md`.
- Количество fixed dependencies и nested VARIANT domain/mapping уже поддержаны.
  Для необязательного Primary первым/единственным и SingleIcon последним при
  скрытии средней кнопки добавлен общий контур conditional collections.
  Exact sequence `positionOrder` сам по себе запрещает разрешённые скрытия;
  legacy `valuePosition` нельзя импортировать как новый manual constraint.
- Критерий закрытия: принят новый ручной контракт и generic authoring выражает
  count-by-value/first-visible/last-visible/host conditions без runtime веток по
  названию ButtonsGroup. Shared compile/capture/evaluation и Apollo/Proxy дают
  одинаковые результаты для hidden middle, no Primary, duplicate/late Primary,
  SingleIcon middle и Overflow=false. Неизвестная identity/order оставляет unknown.
  Отсутствующий identity/order/property/reference даёт явное pending coverage.
- Host/member условия должны сохранять VARIANT types (`Overflow=true` — строка,
  `SingleIcon=True` — другая строка). SingleIcon при Overflow=false даёт violation,
  а не not-applicable за when gate. Учитывать optional Primary/SingleIcon,
  conditional count≥2 и отдельное host asset narrowing активного SingleIcon.
  Root sizing/Hug/Hug остаётся retired; baseline narrowing не возвращает эту норму.

### APOLLO-V4-PARITY-007 — Одноимённые siblings в snapshot/reference paths

- [x] Устранить зависимость идентичности occurrences от уникального имени пути в общем коде.
- Приоритет: P0 для нового ButtonsGroup. Статус: shared implementation готова
  в core 0.1.1 / Editor 0.2.75; Apollo consumer gate и regressions пройдены.
  Release/Proxy integration и полноценный live audit нового manual открыты.
- План на базе Editor 0.2.74 / core 0.1.0: этап 1,
  BUTTONSGROUP-AUTHORING-003 (выделен из identity-подзадачи 001) в
  [плане Editor](../../ComponentContractEditor/docs/BUTTONSGROUP_EDITOR_PLAN.ru.md).
  Consumer impact включает новые occurrence/reference/target formats и явный
  compatibility route; старые captures не получают недостающее evidence задним числом.
- Все 4 desktop / 2 mobile встроенные кнопки имеют одинаковое имя и пустые
  group-level property references. `snapshotPaths` отвергает повторный путь,
  `extractVariantEvidence` пропускает такую variant structure. Этот gate
  срабатывает до source identity, добавленной в 0.2.73. Нормальное дерево
  с уникальными node IDs не должно терять reference только из-за одинаковых имён.
- Нужна общая occurrence адресация по проверенным parent/child edges и source
  identity для snapshot shape, variant evidence, reference node properties,
  nested boundaries, target resolution и fixed dependency bindings/captures.
  Имена остаются диагностикой; не менять library/user layers ради проверки и
  не выдавать sibling index за доказательство соответствия.
- Критерий закрытия: неизменённые одинаково названные Button определяются
  раздельно на desktop/mobile, включая одинаковые Secondary keys. Различия
  View/Size/SingleIcon и hidden middle адресуются своей occurrence, без
  схлопывания данных или нарушения у соседа. Rename/reorder, duplicate source
  и заменённый child покрыты контролями. Historical captures сохраняют exact
  replay через явную совместимость. Editor/Apollo/Proxy используют одно решение.
- Источник: BUTTONSGROUP-AUTHORING-003 / историческая подзадача 001 и
  `design-system_ab/experiments/web-corp/ButtonsGroup/authoring/figma-readback.2026-10-01.json`.
- Изменение чтения: opt-in `occurrenceAddressVersion=1` в source/reference,
  generated evidence и compiled runtime policy; `variantHints` в semantic
  targets. Source/local/catalog addresses отделены от diagnostic names.
  Нормализованный Athena nodeId не считается Figma source ID. Anonymous
  diagnostic topology agreement не назначает роли одинаковым siblings.
- Apollo использует тот же capture/runtime/compiler. Compatibility profile
  принимает version=1 и отклоняет missing/unsupported marker, malformed и
  duplicate bindings. Source identity/explicit ports доказывают correspondence;
  coincident local addresses не дают baseline или разрешения overrides.
- Проверено: core validate 4/4, Editor 753/753, v4 validate 100/100; отдельный
  consumer negative/reset после rename/reorder и отсутствие source proof.
  Historical replay в Editor сохранён; Chromium подтвердил functional remap/ZIP
  round-trip и 18 layouts/dialogs. Legacy typecheck/build/runtime прошли;
  общий test runner остановлен ранее отсутствующим CardImage compiled fixture.
- Обновление core 0.1.3 / Editor 0.2.77: partial source correspondence независимо
  доказывает остальные siblings, не повышая completeness. Missing одного child
  не скрывает violation следующего; targeted Editor/v4 consumer cases пройдены.
- [ ] Передать core 0.1.3 и capability profile в release/Proxy runtime, проверить
  новый manual/capture/coverage end-to-end. Текущие выпущенные пакеты не заменены.
- [ ] Свежие reports D/M всех variants и direct child execution после PARITY-008.
  Полное закрытие требует consumer release acceptance, не только общей сборки.

- Editor 0.2.78 / core 0.1.3 (core не менялся): новая UI-регистрация target
  без создания правила переиспользует existing `planTargetRemap`/`applyTargetRemap`.
  Сохраняются unknown до подтверждения, independent source proof, selected
  representation/variantHints и историческая schema. Consumer принимает тот же
  opt-in occurrence format; aliases корня не превращаются в child bindings.
  Связь: EDITOR-DEPENDENCY-IMPORT-001 в
  [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md).
  Browser new-target → confirm → ZIP проверяет authoring; live D/M и release
  gates выше остаются открытыми. Локальные gates 0.2.78: Editor 780/780,
  core 5/5, v4 103/103; runtime формат не менялся.
- 02.10.2026 чтение пользовательского ButtonsGroup manual r16 после экспорта
  подтвердило четыре уникальных resolved occurrence targets с variantHints
  для одного D варианта (`Size=56, Overflow=false`). Остальные варианты,
  M occurrences и live/release gates выше остаются открытыми. Подробности
  приёмки сохранения — EDITOR-DEPENDENCY-IMPORT-001 в Editor backlog.

### APOLLO-V4-PARITY-008 — Прямые component dependencies у одного host

Direct route введён в Editor 0.2.76 / core 0.1.2; локальная интеграция и формы
проверены в Editor 0.2.77 / core 0.1.3. Typed `direct-child` рядом с historical
fixed-nested, `directChildDependenciesVersion=1`, membership до visibility,
representation scope и dedup actual children. Capture/v4 cap 16, legacy cap 8.

- Editor 0.2.78 / core 0.1.3: dependency import поддерживает reviewed source-only
  authoring ZIP с компиляцией общим core и проверкой transitive exact pins.
  Compiled JSON сохраняет прежний маршрут. Если ZIP уже содержит compiled,
  exact recompilation match обязателен; Draft, invalid source и missing/stale
  closure отклоняются. Ошибки видны в паспорте, а не за его модальным окном.
  Consumer schema/runtime versions не расширены; manual/dependency hashes
  исходников не меняются, compiled hash фиксируется по проверенному результату.
  На этапе 0.2.78 source-only ZIP был authoring input Editor. Текущий v4/Proxy
  читает главный manual с bound facts и authoring dependency closure; compiled
  остаётся проверяемой проекцией. Проверка нового exported binding в live/release
  входит в открытый gate ниже. Связь: EDITOR-DEPENDENCY-IMPORT-001 в
  [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md).

- [x] Shared direct-child binding и v4 profile/compiler/capture/runtime integration.
- [x] Gates Editor 0.2.78: 780/780, core 5/5, v4 103/103; browser подтвердил
  source ZIP import с exact closure и сохранением host rules/targets. Это локальная
  authoring/consumer проверка; release/Proxy и live execution остаются ниже.
- [x] 02.10.2026 пользователь подтвердил загрузку Button r31 source ZIP и полный
  closure в Editor 0.2.78. Это приёмка import UI; реальное child execution
  и consumer release не объявляются принятыми. Evidence в
  EDITOR-DEPENDENCY-IMPORT-001, private screenshot остаётся вне Apollo.
- [x] 02.10.2026 экспорт ButtonsGroup manual r16 содержит четыре direct-child
  bindings одного D варианта, закреплённые Button r31 / Spinner r8 с exact pins.
  Shared compiler читает ZIP без ошибок, ready compiled точно совпадает с
  recompilation. Подтверждено сохранение/чтение пакета; свежий runtime report
  с выполнением дочерних правил и consumer release acceptance ещё требуются.
- Приоритет: P0. Synthetic 4/2 execution, focused child negative/reset, pin/
  platform/stale/unknown, disjoint representations, ZIP/replay и новый capture
  budget проверены. Editor 774/774, core 5/5, v4 103/103.
- [ ] Новый Button r31 / Spinner r8 authored closure в live D/M reports,
  publication/release pins и Proxy capability/source-closure acceptance.
- План на базе Editor 0.2.74 / core 0.1.0: этап 2,
  BUTTONSGROUP-AUTHORING-002 в
  [плане Editor](../../ComponentContractEditor/docs/BUTTONSGROUP_EDITOR_PLAN.ru.md).
  Direct-child binding различим со старым fixed-nested route; legacy пустой путь
  не переосмысливается. Hidden member identity проверяется отдельно от inactive
  child execution; один actual child не аудируется повторными bindings.
- `FixedNestedBinding` требует непустой `childPath` внутри owner INSTANCE и
  уникальную пару `(targetRole, relativePath)`. Это проверенный маршрут
  Button → Addon → Spinner; нельзя объявить target Button самим child или
  несколько прямых children одного root без фиктивных wrappers/путей.
- Требуется общий occurrence binding к прямому child, в связке с PARITY-007,
  с прежними hashes, source lineage, active/hidden/unknown и cycle/depth guards.
  Не добавлять ButtonsGroup-specific исключения.
- Критерий закрытия: group manual закрепляет Button r31 один раз и связывает
  четыре/две occurrences раздельно; его Spinner r8 входит в полный closure.
  Apollo/Proxy исполняют child manual в правильном platform/context, дают
  собственные child RuleID и host focus, сохраняют permission boundaries.
  View/Size narrowing host проверяется отдельно от широкой нормы Button;
  двойного аудита и подавления реальных gaps нет. Старый wrapper route и replay
  не меняют результаты. Источник: BUTTONSGROUP-AUTHORING-002 в backlog Editor.

### APOLLO-V4-PARITY-009 — Имена экспортируемых ZIP по платформе

- Источник: Editor 0.2.74 / shared core 0.1.0, задача
  [EDITOR-EXPORT-NAME-001](../../ComponentContractEditor/docs/BACKLOG.ru.md).
- Изменяется только download filename в Editor: family сохраняет регистр,
  mobile-web получает суффикс; multi-platform имя отражает весь package scope.
  Active preview не определяет имя общего manual-пакета.
- Consumer impact: schemas, ZIP entries, compiler/runtime policy, pins и hashes
  сохраняют прежнее поведение. Перенос кода в Apollo/Proxy не требуется;
  старые имена архивов остаются допустимыми для импорта.
- Критерий закрытия: фактические desktop/mobile загрузки имеют разные имена;
  ZIP import/export сохраняет manual и compiler payload. Проверить общий importer,
  который получает внутренние JSON entries, без зависимости от внешнего имени.
- [x] Статус: совместимость имён закрыта в заявленной области. Editor validate
  740/740; Chromium импортирует прежние desktop/mobile ZIP, скачивает разные
  корректные имена и повторно импортирует точные manual/compiled JSON общим
  importer. Внешнее имя архива не передаётся в compiler/runtime.
- Apollo legacy validate: typecheck/build/Figma-runtime прошли; test runner
  остановлен отсутствующей CardImage compiled fixture, как в предыдущих gates.
  Это не приёмка остальных задач PARITY и не заявление полного Apollo PASS.

### APOLLO-V4-PARITY-010 — Закрытый состав component-owned children

- Editor **0.2.79** / shared core **0.1.4**: исправлена валидация source
  memberCollection и dependencyDomain на корневой роли, отличной от literal `root`. Resolved alias
  требует пустой lineage и явных root-only hints; nested/unknown/conflicting
  anchors отклоняются. Historical reserved-role route и independent runtime
  topology/identity checks сохранены. Schema/runtime flags и producer minimum
  не меняются; consumer компиляции manual должен использовать исправленный core.
  Связь: EDITOR-MEMBER-COLLECTION-ROOT-001 в
  [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md).
- [x] Локальный core 0.1.4 consumer: Editor 783/783, core 5/5, v4 104/104.
  Source с root alias компилируется без мутации manual; membership PASS,
  hidden duplicate FAIL, reset PASS, nested rule anchor rejected. Legacy Apollo
  typecheck/build/Figma-runtime прошли; общий test runner по-прежнему остановлен
  отсутствующей CardImage compiled fixture. Полный legacy PASS не заявляется.
  Browser проверил alias-root и historical-root collection/nested-subject forms, scope error,
  save/ZIP/session round-trip; текущий пользовательский source не переписывался.
- [x] 02.10.2026 пользователь сохранил root-alias membership в manual r18;
  exported source и compiled читаются общим compiler без ошибок и с exact
  recompilation match. Подтверждено live authoring/export; actual execution
  и полнота остальных D/M variants этим не подтверждаются.
- [ ] Принять live D/M runtime reports; включить core 0.1.4 в release/Proxy и подтвердить чтение
  source manual с alias. Выпущенные пакеты/Proxy в этой задаче не заменялись.

- [x] Shared declared-membership contour и локальный Apollo consumer.
- Приоритет: P0. Editor 0.2.77 / shared core 0.1.3: `memberCollection` assertion
  `membership`, `memberCollectionsVersion=1`; независимые catalog/reference,
  owner/source lineage и полный actual graph. Hidden children входят в состав,
  duplicate source не скрывается за ошибкой пути, same-family variants допустимы.
  Focus и missing evidence входят в evaluation; coverage не объявляет полную
  проверку при известном нарушении с дополнительным missing evidence.
  Gate version/type/source linkage и shared ↔ consumer parity проверены;
  v4 103/103, Editor 774/774, core 5/5.
- [ ] Передать capability/runtime в release/Proxy и принять live D/M reports;
  прохождение локальных тестов не закрывает эту приёмку.
- Источник: BUTTONSGROUP-AUTHORING-004, этап 3 в
  [плане Editor](../../ComponentContractEditor/docs/BUTTONSGROUP_EDITOR_PLAN.ru.md).
  Зависит от occurrence identity PARITY-007 и интегрируется с direct bindings
  PARITY-008; authoring forms/приёмка — задачи Editor 005/006.
- Quantity и exact order не доказывают запрет добавления/дублирования/подмены.
  Новая typed policy/facts должна сравнивать объявленный direct-child состав
  с доказанными occurrences независимо от видимости. Hide/show допустимы;
  property variant switch внутри разрешённого Button не равен instance swap.
- Consumer impact: schema/capability version, compilation, capture membership
  evidence, ownership, source coverage и structural focus в Apollo/Proxy.
  Shared реализация требует отдельной consumer/release verification.
- Критерий закрытия: hidden middle проходит; hidden extra/duplicate, foreign
  replacement при прежнем visible count и доказанное исчезновение member не
  получают PASS по count. Неполный capture/reference остаётся unknown.
  Внутренности Button/Addon/Spinner не становятся членами группы; child manual
  и root composition имеют свои scopes. Старые пакеты/replay сохраняют результаты,
  новый неподдержанный формат сообщает явную несовместимость.
- Проверки выполняются на обезличенных synthetic fixtures и локальном DS
  evidence; private Figma каталоги и пользовательские reports в Apollo не копируются.

### APOLLO-V4-PARITY-011 — Production capture: root IDs, aliases и dependency mode catalogs

- Приоритет: P0. Статус: shared implementation в core **0.1.5** / Editor
  **0.2.80** готова; локальная Apollo consumer verification пройдена.
  Fresh live D/M и published release/Proxy acceptance остаются открытыми.
  Исходные defects подтверждены в core 0.1.4 / Editor 0.2.79.
  Связь: EDITOR-BUTTONSGROUP-LIVE-001 в
  [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md).
- Actual negative тест коллекции не дошёл до проверки typed View domain.
  Существующие synthetic gates не покрыли сочетание production Figma/local IDs,
  двух authored root aliases и capture-dependent variable catalog.
- [x] Collection graph: `source.rootNodeId` — Figma provenance/tracking ID,
  `selection[0]` — локальный snapshot ID. Проверять локальный root/edges без
  ошибочного сравнения этих разных адресов; independent source/reference,
  complete topology и identity requirements сохраняются.
- [x] Root targets: две доказанные aliases одного root path не должны отключать
  root checks как случайная nested collision. Нужны согласованные authoring,
  compiler/selector и runtime semantics, явная совместимость persisted packages
  и historical replay. Реальные неоднозначные nested anchors остаются unknown.
- [x] Direct child capture: различие в нерелевантном `variable.modeCatalog`
  host/child не означает изменение actual Button. Проверять релевантные
  collections, actual modes/bindings и обязательное metadata; не ослаблять
  intrinsic facts, styles, graph, identity и stale capture guards.
- Consumer impact: новый compiled package с несколькими root aliases объявляет
  `rootTargetAliasesVersion=1`, требует `occurrenceAddressVersion=1` и producer
  minimum 0.2.80. Apollo compatibility profile принимает version 1 и явно
  отклоняет unsupported/missing flag. Alias facts пересчитываются по независимому
  root identity/reference proof; nested collisions и injected facts не дают PASS.
  Root selectors и списки ролей поддерживают aliases без двойного подсчёта слоя.
  Manual source и закреплённые child contracts/hashes не переписываются.
- [x] Локальные gates: Editor 786/786, shared core 5/5, Apollo 107/107;
  accepted historical replay сохраняется. Production-shaped synthetic regression
  выявляет typed View violation на точном member, root checks выполняются,
  direct children исполняются; reset проходит, incomplete/stale/foreign evidence
  не становится PASS. Core сборка завершена до consumer parity gate.
- [ ] Принять свежие Figma negative/reset reports для D/M и оставшихся variants.
- [ ] Включить core 0.1.5 в published consumer/Proxy и принять release совместимость.
  Связанные открытые contours: PARITY-007/008/010.
- Критерий закрытия: обезличенный production-shaped fixture выявляет запрещённый
  typed View на точной occurrence; root checks выполняются; два активных direct
  child contracts исполняются, скрытые исключаются только после identity proof;
  reset PASS, missing/stale/foreign/duplicate evidence сохраняет incomplete.
  Проверить shared ↔ Editor ↔ Apollo parity, historical replay и свежие live
  D/M reports; затем отдельно принять published consumer/Proxy. Private
  reports/catalogs не копировать. В legacy Apollo полном gate остаётся прежний
  отсутствующий CardImage compiled fixture; typecheck/build/runtime-check проходят.

### APOLLO-V4-PARITY-012 — Typed values из Editor property pickers

- Приоритет: P1. Статус: Editor **0.2.82** реализован; локальная consumer
  verification Apollo пройдена. Общий core **0.1.5** не изменён.
  Связь: [EDITOR-PROPERTY-VALUES-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-property-values-001--выбор-параметров-и-множественные-значения--02102026).
- Изменение: конечные domains Figma properties выбираются из matching catalog /
  semantic API и exact direct child pin. Множественный выбор заменяет comma input
  в property domains, typed collection filters/assertions/conditions и dependency
  variant property/subject conditions. Тип и регистр JSON values сохраняются;
  source API choices не становятся authored permissions автоматически.
- Consumer impact: raw VARIANT value, включая строковое `true`, больше не
  преобразуется Editor универсальным comma parser в BOOLEAN. Настоящий BOOLEAN
  остаётся JSON boolean. Consumer должен сохранить строгий declared propertyType,
  точный регистр и массив значений при source compile/runtime execution.
  Неверный сохранённый enum автор исправляет явно; Editor не переписывает manual
  или child pins автоматически. Missing API не обогащается чужим каталогом.
- Новый schema/runtime flag или producer minimum не требуется: existing formats,
  core **0.1.5**, minimum producer **0.2.80**. Доработка consumer runtime не нужна:
  строгая typed/case-sensitive семантика уже реализована в общем core.
- [x] Apollo validate **108/108**. Synthetic consumer regression принимает
  корректную VARIANT строку, выявляет другой регистр/запрещённое значение,
  reset проходит; BOOLEAN не подменяет VARIANT и наоборот, неправильный тип
  сохраняет incomplete. Result совпадает с shared core. Multi-value View domain
  и focus запрещённого member покрываются существующим consumer regression.
- [x] Editor validate **790/790**, Chromium Save/edit/ZIP/exact-pin roundtrip и
  legacy-value correction. Private reports/catalogs в consumer fixtures не
  копировались; accepted historical tests сохранены.
- Legacy Apollo full gate: typecheck/build/runtime-check прошли; прежний
  отсутствующий CardImage compiled fixture блокирует legacy tests. Это отдельный
  existing gate, не свидетельство успешной полной legacy приёмки.
- [ ] Live authoring acceptance нового picker; release/Proxy consumer acceptance
  при публикации соответствующей сборки отдельно. Версия Apollo **0.4.0**
  и состав pilot release не изменялись.
- Критерий закрытия: точные typed/case-sensitive values сохраняются в source
  compile и execution без coercion; enum multiselect/negative/reset и mismatch
  types покрыты consumer tests; подтвердить live authoring. Published consumer
  не принимает unsupported formats и не меняет закреплённые dependencies.

### APOLLO-V4-PARITY-013 — Native reference capture и occurrence addresses

- Актуализация 05.10.2026: последующий desktop authoring source **r56** содержит
  **17 Reviewed**; review r41 больше не является текущим authoring блокером.
  Исторические Draft reports ниже сохраняют прежнюю authority и exact replay.
  Другие Size/D/M bindings, новый reset PARITY-018 и live Apollo/release открыты.
- Приоритет: P0. Статус: shared implementation **core 0.1.6 / Editor 0.2.83**
  реализована; локальная Apollo consumer verification пройдена. Fresh Figma
  Size/View negative и отдельный чистый PASS подтверждены в Editor;
  live Apollo acceptance и published consumer/Proxy release открыты.
- Связь: [EDITOR-INSTANCE-REFERENCE-ADDRESS-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-instance-reference-address-001--capture-не-разрешает-occurrence-paths--03102026),
  смежный evidence workflow — EDITOR-VARIANT-CATALOG-DRIFT-001.
- Consumer impact: Apollo использует тот же shared capture. Native occurrence
  разрешается через свежую verified source/owner цепочку и capture-local Figma
  locator в actual и cloned independent stage. Legacy name route, вложенные
  variant-properties → swaps и временная очистка сохранены; никакого sibling
  index/name/order proof, actual clone baseline или suppression incomplete gaps.
- [x] Core **19/19**, Editor **802/802**, Apollo **111/111**. Новый bundled
  consumer regression доказывает второй одноимённый instance, сохранение parent
  Size violation, reset и незакрытый reference gap при отсутствующем source.
  Synthetic core guards включают rename/reorder, escaped IDs, imported local main,
  missing/foreign/duplicate/stale/cycle. Private reports/catalogs в Apollo не копировались.
- [x] Schema/reference/occurrence formats, source hashes/pins semantics и minimum
  producer **0.2.80** не меняются. Исторический replay не обогащается свежими facts;
  только новый native capture получает доказанный reference.
- [x] Каталог текущего authoring кейса восстановлен offline из raw source отдельно
  от consumer: known legacy add namespace repair имеет строгие guards. Только
  desktop Size=56 / Overflow=true facts заменены; manual и exact dependency pins
  сохранены. Другие legacy variants и explicit per-variant bindings требуют нового
  evidence, strict catalog/reference drift guard не ослаблен. Apollo compiled/source
  loader формат не меняется; новые hashes потребуют обычной публикации source.
- [x] Editor diagnostics различают catalog drift / missing binding / nested reference
  failure; это UI guidance, runtime/report semantics прежние.
- [x] Fresh Editor Figma 03.10.2026: Size mismatch и запрещённый View на второй
  одноимённой Button дают по одному parent violation, independent host reference
  доказан, оба видимых child contracts исполняются. По 202 evaluations,
  `complete=true`, `notExecuted=0`, `inconclusive=0`. Это Editor acceptance двух
  negative cases; live consumer Apollo этим не подтверждён.
  В Primary-second обнаружен отдельный host metadata gap, см. PARITY-014.
- [x] Fresh Editor Figma 03.10.2026, 07:03:39 UTC: отдельный чистый Size=56 /
  Overflow=false с двумя видимыми Button даёт 202 evaluations, 0 violations,
  `complete=true`, 0 not-executed/inconclusive. Это clean control PASS;
  возврат того же negative instance не отслеживался. Overflow=true anatomy
  подтверждена 56/56 matched nodes; новый SingleIcon stage также matched.
  В r37 правила коллекции и exact child contracts в этом варианте были неполны
  из-за отсутствующих authored per-variant bindings. Native capture не подменяет их.
  Три fresh reports точно воспроизводятся; private evidence в Apollo не копировалось.
- [x] Последующий authoring пакет **r41** явно закрепляет четыре Overflow=true
  occurrences, сохраняя Overflow=false hints, target IDs/roles и exact Button /
  Spinner pins. ZIP import/recompile точен, новый manual hash подтверждён;
  schema и consumer binding semantics не меняются. Новая офлайн-оценка r41
  в authoring mode на сохранённых captures: PASS false (202 evaluations),
  PASS true (448), две SingleIcon — два ожидаемых violations (518), все полные.
  Исходные reports/ZIP не изменялись. Это не fresh live consumer acceptance;
  11 source rules остаются Draft после remap, временная активация для authoring
  не переводит published authority в active. Review остаётся открытым.
- [x] Fresh Editor Figma r41 Overflow=true PASS подтверждён 03.10.2026,
  07:45:23 UTC: Size=56, четыре видимые Button, одна последняя SingleIcon.
  448 evaluations, 0 violations/not-executed/inconclusive, 56/56 matched nodes,
  все четыре child runs executed. Engine/Editor/details replay точен, исходный
  snapshot сохранён. Authoring activation 11 Draft checks подтверждена;
  published readiness всё ещё draft. Live Apollo/Proxy этим не принимаются.
- [x] Fresh Editor Figma r41 03.10.2026: 07:51:29 UTC — одна SingleIcon на
  второй позиции даёт ровно один position violation (448 evaluations);
  07:51:56 UTC — две SingleIcon дают ровно два violations count + position
  (518). Один тестовый instance, оба прогона полные, четыре child runs executed,
  нет not-executed/inconclusive. Два одновременных independent variant stages
  в изолированном position case успешно matched; это не закрывает отдельный
  Interface Static host-context gap PARITY-014. Replay точен, private evidence
  не копировалось. Live Apollo и published acceptance остаются открытыми.
- [x] Fresh Editor Figma r41 reset того же отрицательного экземпляра принят
  03.10.2026, 08:01:54 UTC: одна последняя SingleIcon, 448 evaluations,
  полный PASS, 0 violations/not-executed/inconclusive, 56/56 matched nodes,
  четыре child runs executed. Manual hash не менялся; exact engine/Editor/details
  replay и сохранность snapshot подтверждены. Это закрывает Editor count/position
  negative/reset; review, другие варианты, live Apollo и published release открыты.
- [x] Fresh Editor isolated SingleIcon → Overflow host gate принят 03.10.2026.
  Предыдущий r41 08:09:55 UTC: SingleIcon при Overflow=false
  правильно даёт один hostRequirement violation; independent stage matched,
  три child runs executed. Первая Button не исполняется из-за общего
  `dependency-reference-capture-failed` без child snapshot (360 evaluations,
  `complete=false`, один infrastructure not-executed). Исключение native
  dependency capture не содержит стадии, точная причина и воспроизводимость
  не установлены; это не доказательство mode-catalog defect PARITY-014.
  Повтор 12:54:36 UTC на том же r41/instance: все четыре child captures failed,
  26 parent evaluations, один правильный host violation и четыре not-executed.
  Exact engine/Editor/details replay сохраняет gap и snapshot. Диагностика стадии
  добавлена в Editor 0.2.84 / core 0.1.7 (PARITY-015); точная native причина и
  исправление остаются открытыми. Private evidence остаётся вне Apollo.
  Fresh 0.2.84 r41 18:30:17 UTC на том же instance/manual hash: ровно один
  ожидаемый host violation, 448 evaluations (26 + 422 child), полный coverage,
  0 not-executed/inconclusive, 56/56 matched nodes, все четыре child runs executed.
  Independent fourth boundary matched с доказанной lineage. Exact
  engine/Editor/details replay и неизменность snapshot подтверждены. Capture сбой
  в этом прогоне не повторился; его причина не установлена.
- [x] Fresh Editor 0.2.84 reset r41 19:14:00 UTC принят: тот же instance/manual
  hash, Overflow=true и только последняя SingleIcon=True. Полный PASS,
  448 evaluations, 0 violations/not-executed/inconclusive, 56/56 matched nodes,
  все четыре child runs executed (88/88/88/158), без capture warnings и compiler
  issues. Exact engine/Editor/details replay совпадает; snapshot сохранён.
  Это закрывает isolated Editor host gate negative/reset; source review,
  другие Size variants, live Apollo и published consumer acceptance открыты.
- [ ] Fresh Figma negative/reset во всех consumers; проверить host-context proof и
  child execution вместе. Полный legacy `npm run validate`: typecheck/build/parser
  проходят, test gate блокирует существующий отсутствующий CardImage compiled fixture.
- [ ] Published consumer/Proxy с core 0.1.6: build/release и consumer acceptance
  принимаются отдельно. Локальные тесты не объявляют опубликованный consumer готовым.

### APOLLO-V4-PARITY-014 — Variable mode catalog в независимых host stages

- Приоритет: P1. Статус: исправлено и проверено локально 05.10.2026;
  fresh Figma и published acceptance открыты. Исходный дефект подтверждён
  в **Editor 0.2.83 / core 0.1.6**.
- Связь: [EDITOR-HOST-CONTEXT-MODE-CATALOG-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-host-context-mode-catalog-001--ложный-host-context-gap-при-смене-view--03102026).
  PARITY-011 покрывает direct child capture; новая задача касается сравнения
  enclosing host context в `nested-instance-content-reference.ts`.
- Consumer impact: тот же shared capture собирает mode catalog по union
  `resolvedVariableModes` всего дерева. При Primary → Secondary изменяемая boundary
  перестаёт использовать Interface Static; каталог меняется и у
  нетронутых соседей, а root теряет неиспользуемый resolved mode. Host guard
  трактует это как `host-context-changed`, хотя переданный context, topology
  и внешние visual/binding/identity facts совпадают. Parent position violation
  сохраняется; direct child execution не закрывает infrastructure gap.
- Требуется shared нормализация релевантных host collections/modes без
  подстановки defaults и без actual-as-reference. Реальные изменения используемых
  bindings/modes, visual facts, identity/topology и missing required evidence
  должны сохранять incomplete. Historical reports не обогащать при replay.
- Критерий закрытия: synthetic negative/reset и guards проходят в core,
  bundled Editor и bundled Apollo; повторный fresh Figma Primary-second
  сохраняет violation и даёт полный capture. Отдельно проверить published
  consumer/Proxy. Private reports остаются вне Apollo source/fixtures/logs.
- Исторический анализ до исправления: четыре fresh Editor reports точно воспроизводятся по engine,
  Editor coverage и presentation details; исходные snapshots не изменены.
  Новых реализаций и release gates в этой проверке не заявлено.
- [x] Shared capture/comparison реализован локально 05.10.2026 на текущей базе
  **core 0.1.9 / Editor 0.2.90 / Apollo 0.4.0**. Версии приложений и release
  не повышались; это состояние локального кода, не опубликованного Proxy.
- Свежий capture v4 добавляет `hostContextVariableModesVersion=1` и
  `hostVariableUsageV1`: наблюдённые bindings связываются с collections через
  Figma variable API отдельно в каждом independent stage, включая paints,
  effects и смешанные text ranges. Selected-mode alias chains обходятся
  независимо и bounded (16 уровней, 128 обращений); referenced collections
  сохраняют собственное required mode evidence. Циклы, missing variables или
  нечитабельный selected value дают incomplete; default не подставляется.
  Host guard сравнивает modes/catalog только
  для коллекций, используемых самим узлом окружения. Raw facts, переданный
  context и независимые reference facts сохраняются; default mode не служит
  resolved evidence и actual не копируется в reference.
- Missing/ambiguous collection proof или required mode/catalog остаются gap.
  Реальные mode/binding, paint/layout/style, identity/topology и supplied context
  изменения блокируют lineage. Неподдержанный marker отклоняется, unmarked v4
  и старые версии сохраняют прежний replay, включая прежний ложный gap.
  Normative manual, compiler policy/producer, compiled hashes и exact pins не менялись.
- [x] Локальные gates: **core 68/68, Editor 819/819, Apollo 144/144**.
  Production-shaped API simulation воспроизводил collection removal/addition
  с `host-context-changed` и 7/9 matches до исправления; теперь 9/9, parent
  position violation сохраняется, reset проходит. Bundled Editor/Apollo дают
  точный shared engine; Editor export сохраняет marker и повторный результат.
  4 доступных сохранённых ButtonsGroup reports точно воспроизводят persisted
  engine/Editor/details без изменения snapshots или файлов. Private evidence
  в репозитории и test fixtures не копировалось.
- [ ] Fresh Figma: повторить Primary-second negative и чистый reset в новой
  локальной сборке; подтвердить полный capture и ожидаемый position violation.
- [ ] Published consumer/Proxy: совместный source/runtime release и consumer
  acceptance отдельно. Legacy typecheck/build/Figma parser прошли; полный
  legacy test gate остановлен прежним отсутствующим CardImage compiled fixture.
- Связь этого дефекта с исходным BUG-001 / PARITY-003 не установлена;
  исправление reference host guard не закрывает воспроизведение stale capture.

### APOLLO-V4-PARITY-015 — Диагностика native dependency capture

- Приоритет: P1. Shared диагностика реализована в **core 0.1.7 / Editor 0.2.84**.
  Причина прежнего Figma сбоя остаётся открытой; fresh Editor capture успешен.
- Связь: [EDITOR-DEPENDENCY-CAPTURE-DIAGNOSTICS-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-dependency-capture-diagnostics-001--диагностика-исключений-захвата-button--03102026).
  Повтор r41 12:54:36 UTC: parent SingleIcon → Overflow violation корректен,
  все четыре child references отсутствуют с общим native capture failure.
- Consumer impact: общий Figma capture добавляет optional `failureDetails`
  version 1 (stage, ограниченные errorName/message) только к failed attempt.
  Editor coverage explanation показывает эти данные для уникального соответствия.
  Runtime/Predicate не использует metadata как evidence: failure codes, verdicts,
  child eligibility, schema, pins и producer minimum 0.2.80 не изменены.
- [x] Реализован shared capture и report presentation; missing references остаются
  incomplete, старые reports без metadata воспроизводятся без обогащения.
- [x] Локальные gates: core 27/27, Editor 805/805, Apollo 112/112.
  Шесть synthetic native fault stages, продолжение остальных captures и cleanup
  проверены в core; bundled Editor сохраняет diagnostic metadata. Apollo runtime
  consumer сохраняет not-executed/incomplete и прежние verdicts с metadata или
  без неё. Diagnostic JSON export/replay и exact latest private report
  engine/coverage/details replay проходят без изменения исходного snapshot.
  Hash нового snapshot и связанные evaluation IDs учитывают metadata; contract
  hashes/pins не меняются. Legacy Apollo typecheck/build/runtime parser проходят;
  full test gate остановлен прежним отсутствующим CardImage compiled fixture.
- [x] Fresh Editor capture 18:30:17 UTC: полный host gate, ровно один ожидаемый
  Overflow violation, 448 evaluations, четыре child runs executed, без capture
  ошибок и diagnostic metadata. Exact replay подтверждён; прежние gaps не
  переписаны. Это приёмка Editor negative case, не установленное исправление
  прежнего native сбоя и не live Apollo acceptance.
- [x] Fresh Editor reset 0.2.84 r41 19:14:00 UTC: полный PASS, 448 evaluations,
  четыре child runs executed, 0 violations/not-executed/inconclusive, 56/56 matches.
  Тот же instance/manual hash; exact replay подтверждён, snapshot не изменён.
- [ ] При повторении исключения получить native stage/error evidence для разбора
  причины. Успешные fresh negative/reset не доказывают исправление прежнего сбоя;
  связь с PARITY-014 не установлена. Live Apollo acceptance остаётся отдельной.
- [ ] Published consumer/Proxy: сборка/release и consumer acceptance отдельно.
  Критерий закрытия диагностики: точный этап/ошибка в свежем отчёте и сохранение
  incomplete/verdict при отсутствии reference. Private reports/catalogs остаются
  вне Apollo source, fixtures и logs.

### APOLLO-V4-PARITY-016 — Редактирование правила без live anatomy

- Приоритет: P1. Реализовано в UI **Editor 0.2.87**, общий core **0.1.7** прежний.
- Связь: [EDITOR-EXISTING-RULE-OFFLINE-EDIT-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-existing-rule-offline-edit-001--сохранение-правила-после-импорта--04102026).
- Изменение: существующее правило сохраняется через объявленный targetId без
  требования live node. Preview/test capture во время редактирования не меняет
  цель на корень и не создаёт новый semantic target. Missing target блокирует
  сохранение; выбор слоя остаётся обязательным для нового правила.
- Consumer impact: экспортируется прежний manual формат с явно изменёнными
  автором полями и обычной новой revision/manualSourceHash. Targets, bindings,
  constraints и exact dependency pins при статусном review сохраняются.
  Runtime, producer minimum, capture evidence и resolver не менялись;
  успешное authoring-сохранение не подтверждает live resolution.
- [x] Editor browser regression: offline review/save, missing/new guards,
  async preview, target/pin/closure preservation, ZIP export/import.
  Текущий авторский пакет проверен только локально в памяти; private package
  не копируется в Apollo, synthetic fixture независим от авторских данных.
- [x] Локальные gates: Editor **805/805**, Apollo **112/112**.
  Legacy Apollo typecheck/build/runtime parser проходят; full test gate
  остановлен прежним отсутствующим CardImage compiled fixture. Новая
  consumer verification ниже не считается выполненной только из-за этих gates.
- [x] Apollo consumer verification 05.10.2026: статусный Draft → Reviewed
  synthetic source переэкспортирован `buildAuthoringZip` Editor 0.2.90,
  прочитан `sourceFromFiles` и скомпилирован локальным v4. targetIds, constraints
  и exact child pins сохранились; compiled projection совпала. Без child capture
  два dependency runs остаются incomplete; engine совпадает с Editor core.
  Проверка выполнена в памяти, private files не использовались. Новая runtime
  реализация или migration не требуется.
- [ ] Published consumer/release acceptance отдельно. Критерий закрытия:
  status-only review читается в consumer без изменения нормативных bindings/pins;
  отсутствие фактов остаётся явной неполнотой. Editor UI gate не заменяет
  приёмку опубликованного Apollo/Proxy.

### APOLLO-V4-PARITY-017 — Сохранение исходной иконки по независимому эталону

- Уточнение source 05.10.2026, mobile ButtonsGroup r2: icon lock имеет typed
  `SingleIcon=True` и root `Overflow=true`; Overflow=false даёт ошибку режима,
  без дополнительного группового lock. Норма всех Size сохраняется. Existing
  compiler/runtime поддерживают такой applicability gate: Editor 0.2.90 /
  core 0.1.9, новый wire/producer flag не нужен. 13 private historical replays,
  shared compiler parity и 24 collection controls прошли. Source остаётся Draft;
  свежая r2 live и published consumer приёмка открыты. Применимость desktop
  source требует отдельной сверки, прежняя revision автоматически не изменена.
- [ ] Mobile swap 15:13:24 UTC: пять unknown в самостоятельных проверках
  pinned Button (asset provenance и связанные размеры) сохраняют неполное
  dependency coverage. Проверить capture/source enrichment в consumer и
  понятную диагностику; не считать отсутствующие факты compliant и не подавлять
  child checks при ошибке host композиции. Private evidence остаётся в
  `design-system_ab/experiments/web-corp/ButtonsGroup/mobile-web/authoring/reports/overflow-icon-applicability.2026-10-05.json`.
- Приоритет: P1. Общая реализация **core 0.1.8 / Editor 0.2.89** и локальный
  Apollo profile реализованы; pilot version 0.4.0 и published release прежние.
- Связь: [EDITOR-SINGLEICON-ASSET-LOCK-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-singleicon-asset-lock-001--запрет-замены-исходной-иконки--05102026).
- Source: dependencyDomain `field=changed`, только boolean `values=[false]`,
  explicit portNames и require-domain. Typed subjectCondition ограничивает
  semantic цель (например SingleIcon VARIANT True), relativePath выбирает
  владельца INSTANCE_SWAP. UI выбирает порты/API; keys не записываются как норма.
- Editor 0.2.89: SingleIcon запрещает замену иконки **во всех размерах**;
  UI предлагает полный объявленный port domain из exact pinned child contract
  по совпадающему nested owner path и совместимой Figma platform (для Button:
  Icon-16/20/24). Декларации подписаны отдельно, не выбраны автоматически и не
  превращаются в observed evidence. Формат и core прежние; producer minimum
  остаётся 0.2.88. Consumer должен сохранить all-variant scope и все выбранные
  portNames, проверяя фактический активный порт по независимому эталону.
- Consumer impact: binding `identityLock=true`, runtime
  `assetIdentityLockVersion=1`, producer minimum **Editor 0.2.88**.
  Exact asset key сравнивается с независимым портом текущего host variant,
  включая proven ancestor same-family variant. Собственный reference замены
  не допускает её автоматически. Missing/unknown/ambiguous evidence → gap.
  В новом профиле proven variant boundary root сохраняет semantic role при
  partial child coverage; descendants и coverage не объявляются доказанными.
- [x] Shared compiler/source validation/runtime и v4 compatibility gate:
  unsupported version, missing/malformed marker/ports и exemptions отклоняются.
  Unmarked historical contracts сохраняют прежний wire/replay; r52 authoring
  source, его exact child pins и архив не менялись, recompile wire совпадает.
- [x] Независимые synthetic regressions: original/swap/same-family variant,
  normal/hidden/inactive subjects, ancestor variant port, occurrence rename,
  missing evidence, source/compiled roundtrip и replay. Browser authoring:
  finite ports/True, fixed false, save/edit/offline, ZIP и сохранение pins.
  Synthetic all-size/port matrix проверяет все шесть Size × три порта, включая
  original, swap и неполное доказательство; это не приёмка реальной Figma-библиотеки.
- [x] Local consumer verification: переэкспортированный synthetic source
  импортируется, компилируется идентично и даёт те же evaluations, что Editor;
  unknown reference сохраняет incomplete coverage. Private данные не копируются
  в Apollo source/fixtures/logs; source fixture синтетический.
- [x] Локальные gates после all-size correction: Editor **810/810**, shared
  core **39/39**, Apollo **115/115**; browser all-size scope, полный выбор
  портов, ZIP/offline regression и bundled Editor smoke.
  Legacy Apollo typecheck/build/runtime parser проходят; полный test gate
  останавливается на отсутствующем CardImage compiled fixture из прежнего
  legacy набора. Это ограничение не заменяется фиктивным fixture и не считается
  successful full gate либо release acceptance.
- [x] Authoring package verification 05.10.2026: пользовательский ButtonsGroup
  **r56**, 17 Reviewed, новое правило all-variant / четыре subjects / Icon-16/20/24
  / SingleIcon VARIANT True. Compiler issues отсутствуют, readiness ready;
  exported compiled и recompile совпадают. Button r31 / Spinner r8 exact closure
  подтверждён; локальный v4 profile принимает пакет. In-memory ZIP roundtrip
  сохраняет manual, compiled и pins; private исходники не копировались в Apollo.
  Это проверка пакета и профиля, не live runtime verdict или release acceptance.
- [x] Fresh Figma negative case 05.10.2026, 11:28:53 UTC: ButtonsGroup r56,
  desktop Size=56 / Overflow=true, последняя SingleIcon=True; dots-three-horizontal
  заменена на eagle-coins. Ровно один parent identity-lock violation, остальные
  три subjects not-applicable, остальные checks без нарушений. Scenario complete,
  notExecuted=0 / inconclusive=0; in-memory core replay совпадает с отчётом,
  локальный v4 audit даёт тот же engine result и executionComplete=true. Private
  отчёт/каталог не копировались в Apollo; это не published release acceptance.
- [ ] Fresh Figma: пользователь проверяет original/swap/reset во всех размерах
  и SingleIcon на другом допустимом Button. Отсутствие привязки/эталона в
  каком-либо размере остаётся неполнотой, не исключением из нормы.
  Reset в Editor 0.2.89 выявил local main ID bug; новый consumer profile и
  повторная приёмка отслеживаются в [APOLLO-V4-PARITY-018](#apollo-v4-parity-018--локальные-main-id-после-восстановления-иконки).
  Fresh Editor 0.2.90 reset Size=56 / Overflow=true принят 05.10.2026,
  12:12:48 UTC: полный PASS, 452 evaluations, 56/56 matches, четыре child runs.
  Fresh negative 12:33:21 UTC: замена на dots-bracket даёт ровно один icon-lock
  violation при полном coverage, том же instance/r56 и четырёх child runs.
- [ ] Published consumer/Proxy: сборка/release и приёмка отдельно. Критерий
  закрытия: свежий authoring package и consumer дают одинаковые identity
  verdicts; partial proof остаётся incomplete, historical replay/pins прежние.

### APOLLO-V4-PARITY-018 — Локальные main ID после восстановления иконки

- Приоритет: P1. Shared **core 0.1.9 / Editor 0.2.90** и локальный Apollo
  profile/capture реализованы. Pilot version **0.4.0**, published release прежние.
- Связь: [EDITOR-INSTANCE-MAIN-ALIASES-001](../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-instance-main-aliases-001--локальные-main-id-после-восстановления-иконки).
- Проблема: после reset исходной иконки Figma local main ID отличается от
  независимого библиотечного эталона при совпадающих canonical key/set/source.
  Прежний correspondence выключает baseline и часть child checks. Fresh report
  05.10.2026, 11:44:36 UTC / Editor 0.2.89 остаётся incomplete: 0 violations,
  3 human-review и 5 not-executed; его verdict не переписывается.
- Consumer impact: новая runtime policy `instanceMainComponentAliasesVersion=1`
  и producer **Editor 0.2.90** у recompiled active identity locks. Capture передаёт
  профиль actual/independent reference; runtime пересчитывает source marker.
  Разные local IDs допускаются только при одинаковых canonical owner key/set,
  локально подтверждённом source owner и уникальном owner-relative source node.
  Missing/foreign/unknown/ambiguous evidence остаётся gap; matching по имени,
  sibling order либо global key lookup не добавлен. Независимый baseline должен
  воспроизводить original variantReference, platform и modes.
- [x] Local v4 compatibility gate принимает version 1, отклоняет version 2;
  capture и runtime используют общий core. Parent profile наследуется в exact
  pinned child checks без изменения contracts/hashes. Recompile меняет compiled
  wire, сохраняя manual hash и точные child pins; unmarked historical artifacts
  сохраняют прежний строгий replay. Это не разрешающее правило и не новая норма.
- [x] Synthetic regressions: restored original/swap, owner/source guards,
  missing/duplicate proof, invalid independent baseline, inherited child profile,
  stored marker rejection и historical replay. Final local gates: core **44/44**,
  Editor **811/811**, Apollo **136/136**. Chrome regression: all-size scope,
  полный finite port picker, offline/save и ZIP/pin preservation.
- [x] In-memory consumer verification на двух исходных private reports:
  old evaluatedContract replay совпадает с archived engine result. Тот же manual,
  recompiled новым профилем, даёт reset **298 compliant / 154 not-applicable /
  0 violation**, negative swap **297 / 154 / 1 violation**. Local v4 и core
  идентичны, executionComplete=true, uncertain=0, incompleteDependencies=0.
  Manual source hash и exact Button r31 / Spinner r8 pins прежние; source ZIP
  и reports не изменены и не копировались в Apollo source/fixtures.
- [x] Source route проверен отдельно 05.10.2026: synthetic authoring ZIP из
  Editor 0.2.90 проходит `sourceFromFiles` → `loadAuthoringSource` в Apollo,
  воспроизводит новую compiled projection точно, сохраняет manual и полный
  original verdict. Cache активного lock с прежним профилем не проходит exact
  projection gate после recompile; требуется явный reexport в 0.2.90. Старый
  compiled artifact при historical replay сохраняет прежнюю неполноту.
- [x] Fresh Editor Figma reset принят владельцем 05.10.2026, **12:12:48 UTC**:
  Editor/producer **0.2.90**, ButtonsGroup r56, Size=56 / Overflow=true,
  одна последняя SingleIcon=True с исходной dots-three-horizontal. Actual
  instance и manual hash совпадают с incomplete reset 0.2.89; 17 Reviewed,
  без временной Draft activation. **452 evaluations: 298 compliant /
  154 not-applicable / 0 violations**; complete=true, notExecuted=0,
  inconclusive=0, warnings=0, **56/56 baseline matches**, четыре child runs
  executed. Активный lock compliant, прочие три subjects not-applicable.
  Exact archived engine replay и local v4 audit идентичны,
  executionComplete=true / uncertain=0. Source/manual/pins и snapshot/report
  сохранены; private данные не копировались в Apollo source/fixtures.
  Это свежая Editor acceptance и offline consumer parity, не live Apollo audit.
- [x] Fresh Editor negative swap 0.2.90 проверен 05.10.2026,
  **12:33:21 UTC**: тот же instance/r56/manual hash, Size=56 / Overflow=true,
  последняя SingleIcon=True, замена исходной иконки на **dots-bracket**.
  **452 evaluations: 297 compliant / 154 not-applicable / ровно 1 violation**
  `single-icon-icon-is-fixed` для четвёртой Button. complete=true,
  notExecuted=0, inconclusive=0, warnings=0, **56/56 matches**, четыре child
  runs executed. Все 17 Reviewed, activatedDraftRuleIds пуст. Exact archived
  engine replay и local v4 audit совпадают, executionComplete=true /
  uncertain=0 / incompleteDependencies=0; source/manual/pins и raw report/snapshot
  сохранены. Private данные не копировались в Apollo. Это завершает целевую
  Editor reset/negative пару и offline consumer parity Size=56; live Apollo
  audit и published release ещё не приняты.
- [ ] All-size real-library acceptance остаётся в PARITY-017;
  старый negative 0.2.89 сохраняет прежний replay.
- [ ] Published Apollo/Proxy build/release и consumer acceptance. Критерий
  закрытия: fresh source/capture в Editor и consumer дают одинаковые полные
  reset/negative verdicts, а missing proof остаётся incomplete; historical
  replay и pins неизменны. Локальные tests/replay не закрывают release acceptance.
- Legacy Apollo typecheck/build/runtime parser проходят; full test gate
  остановлен отсутствующим CardImage compiled fixture прежнего набора. Ограничение
  сохранено без фиктивного fixture и утверждения об успешном полном gate.

### CC-COMPAT-DECLARED-TARGET-IDENTITY-01 — local shared application

Opt-in `declaredTargetIdentityVersion: 1` and closed `identityBindingsV1` declarations separate exact native membership from diagnostic roles. Shared core adds guarded resolver, compiler membership selectors and complete-chain presence/visibility facts; unmarked contracts keep the original compiler/evaluation route. Paired local technical versions: core 0.1.11, Editor 0.2.92, Apollo profile 0.4.1. The new compiled opt-in stamp is `component-contract-editor@0.2.92`. Reviewed repair applied locally to shared source; no release publication.

Consumer impact: explicit support and malformed/unknown policy rejection in Apollo profile; Editor export/import through the same candidate core. Normative rules/permissions, Draft/source/coverage and native/live/release acceptance remain unchanged. Verified privately: legacy38 exact replay 38/38, core 115/115, Apollo 357/357, generation-core 179/179, Editor 822/822, Apollo root 81 regression files, paired consumer proof 3/3 and final builds. The scoped NATIVE-12 opt-in revisions are conclusive; CORRESPONDENCE-3 remains UNKNOWN. Private candidate independently reviewed by General. Status: local shared application and current UI03 paired compatibility verified: core115, Apollo 374 (all UI03 tests retained), generation-core179, Editor822 and root81 PASS; final generation build uses SDK0.1.11/profile0.4.1 with171 inputs. Current built chat/browser153 checks and declared-target UI76 checks/9cases passed, plus existing audit/generation/native/static-review browser gates. Original38 replay remains deep-exact and three unmarked authoring families compile identically. General stage2 independent review is pending. Native/source/coverage/live/release acceptance remains separate. BC-D06/PC-D04/PC-M06 native correspondence and BenefitsBlock current26 source remain separate inputs.

Paired records: Editor `docs/BACKLOG.ru.md#cc-compat-declared-target-identity-01--local-shared-application`; Apollo `docs/ARCHITECTURE_BACKLOG.md#cc-compat-declared-target-identity-01--local-shared-application`. No private captures/catalogs are checked into source fixtures.


#### 07.10.2026 · Cycle52 · configured-native и BC-D06: этапы разделены

Точный opt-in configured-native@1 source delta принят General:6 core source/test
files,54 focused regressions на identical private bundle, independent rebuild
из actual shared source. Shared implementation accepted; shared core dist0.1.11,
Editor0.2.92 и Apollo profile0.4.1 остаются прежними. API: root/self typed BOOLEAN/
VARIANT configuration conformance; unmarked/visual guards сохранены. SourceReady,
consumer integration, live/release и main norm activation не приняты.
Generation реализует только private paired runtime/Editor/v4 consumer candidate:
version mismatch fail-closed, missing-root diagnostics UNKNOWN в ledger/coverage/report,
без false pass/complete/Ready. Критерий consumer закрытия: concrete reviewed diff,
полный actual private source/build inventory и focused consumer boundaries;
последующий shared rollout получает отдельный exact sole-writer handoff.

BC-D06: independently replayed3 reports/5 probes. Текущий V1 не объявляет связь
Title с независимой Secondary native branch; data-only замена/duplicate/stale
reference отвергнуты. Contract готовит private closed declaration/schema data,
без core implementation и нормативного изменения. Отдельный библиотечный
Compact default расходится с main нормой; Figma repair не назначен. HiddenTitle,
ambiguous/foreign/stale/SLOT guards остаются обязательными. Сопоставление identity
и соблюдение Compact-нормы проверяются раздельно.

General source review: /private/tmp/apollo-pc-configured-property-source-general-review-2026-10-07/general-source-review.json.
General BC review: /private/tmp/benefitcard-BC-D06-general-review-2026-10-07/general-review.json.
Парная запись: ComponentContractEditor/docs/BACKLOG.ru.md и Apollo/docs/ARCHITECTURE_BACKLOG.md,
existing CC-COMPAT-DECLARED-TARGET-IDENTITY-01. Private captures не добавлены в tracked fixtures.

### CC-COMPAT-NATIVE-INSTANCE-REPLACEMENT-01 — допустимая замена вложенного экземпляра

General, 20.10.2026: исправляется actual runtime admission. Core0.1.22 выделяет
существующую проверку replacement policy в общий export; materializer и Apollo
используют одну реализацию. Нормы, схема, hash algorithm и runtime feature version
не меняются; Editor0.2.108 сохраняет прежний контракт (парная запись:
`ComponentContractEditor/docs/BACKLOG.ru.md`). Синтетический integration regression
воспроизводит прежний отказ `loadRuntimeContract`; итоговый build/import результат
записывается после проверки. До него установка Icon10 не объявляется успешной.

Core **0.1.22**, Editor **0.2.108**: явный `instanceReplacementDomain` проверяет
семейство и native VARIANT-параметры замены по root-owned source address без
выдуманного публичного INSTANCE_SWAP порта. Неизвестная/неоднозначная identity
остаётся UNKNOWN. Доказанный чужой subtree исключается только из собственного
recursive baseline родителя; остальные проверки родителя сохраняются. Старые
контракты без opt-in сохраняют поведение. Дубликаты ограничений и неверный shape
`properties` отклоняются до Ready.

Editor сохраняет ограничение при открытии, изменении описания и ZIP roundtrip;
набор замен показан из пакета без ручного редактирования component keys.
Влияние на Apollo/Proxy: нужен общий Core reader со stamp0.2.108; пересборка,
проверка admission и установка имеют отдельные статусы. Passing Editor tests
не означает release/adoption или native Ready. Generation pilot не расширяется.

Статус на 20.10.2026: shared implementation применён; Core469/469,
Editor856/856 и Apollo1134/1134 configured checks PASS. Private21
retained-native/guard checks и Editor typed replacement UI roundtrip PASS.
Новая installed-native приёмка IconView не выполнена: действующий контракт r9
остаётся Draft; владелец поручил сначала завершить Link. Proxy adoption и
установка отдельно, без расширения пилота генерации.
Закрытие: согласованный shared apply и validate, consumer проверка compatible
legacy contracts и нового opt-in, scoped native acceptance Indicator24/16;
установка Proxy отдельно по принятому runtime/data scope.

20.10.2026, IconView r10: фактический `loadAuthoringSource` остановил установку
до изменения canonical/index/manifest: `Unsupported runtime feature
nativeInstanceReplacementsVersion=1`. В `src/contract-profile.js` отсутствует
допуск версии; массив дескрипторов `nativeInstanceReplacements` также требует
отдельной проверки формы и ссылок, поскольку общий цикл ожидает номер версии.
Core/Editor PASS не подтверждает этот вход Apollo. Исправление admission —
отдельная минимальная задача General; ослаблять guard или объявлять установку
успешной нельзя. Контракт r10 сохранён как candidate. Три неизменённых owner
captures дали через Core0.1.22 0/0/1 нарушений для исходного TopAddon,
Indicator24 и Indicator16; повторная ручная матрица не нужна. Это retained-native
replay, а не новая установленная Apollo-проверка. Evidence:
`shared/design-system_ab/experiments/current-contract-packages/IconView/reports/final-r10-2026-10-20/EVAL.json`.

Позднее 20.10.2026: General согласовал facade с общим Core validator, сохранив
отказы неизвестной версии и неверных дескрипторов. Реальный loader и установленный
reader приняли exact IconView r10, replay дал полное покрытие 0/0/1.
Standalone IconView r10 установлен штатным CLI, checkingAvailable=true;
dataId `9550e8eb04f21e8781e3d0edaaa8e402adc620ac9bab0172fa105fbde99d41d0`.
Ready принят только для локальной проверки Figma. Свежий native запуск не
заявлен. Совместный импорт BenefitCard r14 отдельно остановлен
`DATA_MAPPING_CONTRACT_STALE`: его существующий mapping ещё закрепляет r13.
Установленный BenefitCard r13 сохраняет прежние точные зависимости; это не
блокирует самостоятельную проверку IconView и не требует новых его тесткейсов.

20.10.2026, следующий owner report выявил modern gap в обходе области: отдельный
вложенный IconView24 без TopAddon получил75 UNKNOWN из-за ALL applicability
нового replacement opt-in. Root/reference/catalog совпали; это не stale binding.
Core **0.1.23** учитывает явную variant applicability только после доказанной
root identity, независимого capture и совпадения VARIANT с опубликованным
variantEvidence. Доказанно неактивный opt-in не блокирует локальный baseline;
неизвестная identity/тип/вариант остаётся UNKNOWN, прежний ALL не меняется.
IconView r11 ограничивает это право замены семью опубликованными вариантами
с TopAddon. Нормативное право swap и существующие81 RuleID сохраняются.
Focused regression19/19 PASS; retained owner report даёт0/0/1 по корням,
вложенный24 —93 compliant/151 notApplicable/0 UNKNOWN. Схема Editor0.2.108
не меняется; новая материализация в его установленной сборке отдельно не принята.
Финальный Apollo build/import/readback фиксируется в
`IconView/reports/size24-eligibility-r11-2026-10-20/EVAL.json` рабочей коллекции.

Парная запись: [Editor backlog](../../ComponentContractEditor/docs/BACKLOG.ru.md#cc-compat-native-instance-replacement-01--допустимая-замена-вложенного-экземпляра).

## Apollo: единая генерация

### APOLLO-V4-GEN-001 — Общие ZIP inputs и отдельные адаптеры генерации

- Решение владельца от 05.10.2026: вести генерацию в Apollo; общий план
  исполняется адаптерами Figma/frontend. Архитектура: [GENERATION.md](GENERATION.md).
- [x] G02: `packages/generation-core`, локальный V4 entry point, exact ZIP/source/
  facts/compiled/dependency/runtime lock, synthetic regression coverage.
  Используются существующие V4 source loader/profile 0.4.0 и shared core 0.1.8.
  Shared core/Editor, исходные ZIP и нормативные правила не изменялись.
- [x] Локальная загрузка семи текущих ZIP, ButtonsGroup r56; Button → Spinner,
  AmountStyles → Amount, ButtonsGroup → Button воспроизводят exact pins.
  Повтор по lock и финальные gates зафиксированы в GENERATION.md.
- [ ] G03/G04/G05: спецификация, общий план, GenerationView, adapter protocol.
- [ ] F01–F03/W01–W03: исполнение и capture в обеих средах.
- [ ] P01/P02/I01/I02: prompt planner, orchestration и сквозная приёмка.
  09.10.2026: локальный P01 port подключён — UI description/platform/viewport →
  `/v4/generation/plan` → текущие pinned authoring manuals/dependencies → существующий
  read-only CLI agent → Draft ScreenSpec → прежний GenerationController. Проверены
  source-before-agent, stale/invalid input rejection, immutable receipt и отсутствие
  автоматического target execute. V4 576/576, root81 и Proxy generation41/41 PASS.
  Живой контроль пока не принят: первый ответ агента отклонён схемой; после
  уточнения формата повтор остановлен до агента на `STALE_CURRENT_AUTHORITY_REF`
  (manifest.json/draft-manifest.json расходятся с producer-handoff 09.10).
  Повторный финальный build заблокирован теми же manifests; общий source/build
  snapshot также меняется параллельно (compiler/text-content-facts/DocumentAudit).
  Source/native/code/profile/parity/live/release gates остаются отдельными.
- ZIP compilation не закрывает PARITY-004/full scenario coverage или другие
  live/Proxy/published consumer задачи. Generation readiness отдельных
  representations проверяется независимо от compiled readiness.
- Legacy full gate имеет прежний ENOENT CardImage compiled fixture;
  typecheck/build/runtime parser проходят. Ограничение сохранено явно,
  без фиктивного fixture и утверждения об успешном полном gate.

### APOLLO-V4-GEN-002 — Чат уточнения без потери ScreenSpec

- Владелец: Generation. Приоритет: P1. Запрос владельца от 09.10.2026.
- [x] Исходное описание, уточнения, ответы и JSON каждой успешной версии остаются
  в UI текущей сессии. Переход между разделами сохраняет историю и draft сообщения.
- [x] Следующий prompt содержит исходную задачу, последовательные уточнения и
  последний ScreenSpec; актуальные контракты читает прежний planner endpoint.
- [x] Ввод, сеть, отмена и late reply не удаляют последнюю спеку. Старый execution
  gate сбрасывается, проверка блокируется до ответа. Экспорт остаётся доступен.
- [x] Новый экран — явный сброс. Лимит существующего prompt API не обходится;
  oversized context отклоняется без скрытого усечения.
- Проверка реализации: conversation regression и built UI browser на 800/440/360;
  фактический результат записывается в receipt. Live Figma/real agent отдельно.
- [x] 09.10.2026: восстановление между перезапусками через отдельный закрытый
  Figma clientStorage bridge: история, Draft, composer и viewport, 2 МБ / 512
  сообщений; ошибки не удаляют текущий диалог. Late load сохраняет новый ввод,
  импорт имеет приоритет. Execution session/receipts/evidence не сохраняются.
  Synthetic storage/client regressions и built UI на 800/440/360 PASS.
  Installed Figma user cycle остаётся отдельной проверкой.

### APOLLO-V4-GEN-003 — Пользовательские вопросы отдельно от технических пробелов

- Владелец: Generation + Proxy planner. Приоритет: P1. Статус: открыт.
- Отсутствующая подпись не блокирует черновую композицию, когда пользователь
  разрешил текст-заглушку. Использовать явно обозначенные нейтральные подписи,
  сохранять число/порядок элементов; не выдумывать бизнес-команды или приоритеты.
- Заданный вертикальный интервал представлять через имеющийся stack/gap.
  Если линия заблокирована mapping, отдельно назвать эту причину; сам известный
  интервал не превращать в вопрос пользователю.
- Не задавать вопросы, которые ответ пользователя не может закрыть: отсутствующий
  порт/handler representation/mapping — backlog capability, а не product decision.
- Приёмка: synthetic cases с разрешёнными placeholder labels, явным gap, известным
  фоном и техническим missing port. Повторное уточнение меняет только открытые
  пользовательские решения. Исполнение по-прежнему требует реального preflight.
- [x] 09.10.2026: общий ScreenSpec v2 разделяет `unresolved` (product questions)
  и required `capabilityGaps` с code/message/optional declared nodeId. Чат
  показывает их отдельно; технический gap блокирует preflight обоих targets.
  Synthetic 5+2 и stack/gap 24 сохраняются; отсутствие overflow — отдельный gap.
- [ ] Planner классификация/placeholder policy и fresh capability context:
  задача Proxy owner. Proxy самостоятельно не изменялся.

### APOLLO-V4-GEN-004 — Коллекция кнопок без бизнес-действий

- Владелец: Generation + Code Connect; Proxy — consumer после согласования DTO.
  Приоритет: P1. Статус: открыт.
- Interactive ScreenSpec v1 требует eventId для каждого owned action;
  producer projection формирует onClick/handlerRef по этому event. Это ограничение
  протокола, а не недостаточно уточнённая команда пользователя.
- Переиспользовать отдельный versioned static-content контур либо согласовать
  новую версию общего DTO для произвольных статичных коллекций/нескольких линий.
  Отсутствие бизнес-действий задаётся явно: без событий/переходов/handlerRef.
- Не генерировать фиктивные события, event_-1, команды или forced disabled.
  Presentational interaction, например раскрытие overflow, проверяется отдельно.
- [x] 09.10.2026: общий versioned ScreenSpec v2 явно разрешает behavior=none без
  eventId. Mixed eventful/static collections валидируются без ослабления v1.
  Frontend emitter не создаёт onClick/forced disabled; Figma adapter передаёт
  неизменённую коллекцию native handler. Source/native/profile gates сохранены.
  Legacy producer выдаёт явный PRODUCER_NO_ACTION_UNSUPPORTED; фиктивного
  event_-1 нет. Общие/adapter synthetic regressions PASS.
- [ ] Producer input/profile, accepted native static recipe и Proxy planner:
  отдельный owner handoff; установленное исполнение пока не принято.
- Приёмка: две статичные кнопки с заданными подписями/порядком сохраняются в общей
  спеке; Figma и фронт отображают их без бизнес-handler. Старые eventful fixtures
  остаются совместимыми; неподдерживаемый protocol получает явный capability gap.

### APOLLO-V4-GEN-005 — ButtonsGroup overflow и OptionList

- Владелец: Contract Creation + Code Connect; Generation подключает producer,
  Proxy обновляет контрактный planner context после точных pins. P1, открыт.
- Runtime/fixture возможность раскрыть OptionList не доказывает наличие полного
  source-confirmed mapping для prompt → ScreenSpec → обоих адаптеров.
- Добавить/подтвердить semanticApi overflow collection, OptionList mapping,
  binding source политики elements/maxVisibleButtons и допустимую cardinality.
  В публичном code API нет Boolean Overflow prop; не добавлять его по догадке.
  PickerButton/menu — owned реализация; необходимость отдельного root OptionList
  mapping определяется реальной структурой и контрактом.
  Не менять текущий предел видимых действий предположением planner.
- Приёмка: группа из пяти элементов сохраняет все подписи/порядок и при
  подтверждённой политике сворачивает дополнительные элементы; список открывается
  в Figma/фронте. Проверить fit, keyboard/focus, отсутствие потери item и parity.
- До приёмки это технический gap; не просить пользователя сократить согласованное
  количество только для обхода отсутствующего порта.

### APOLLO-V4-GEN-006 — Page mode CorporateContent и белый фон

- Владелец: Contract Creation + Code Connect; Generation — общий plan/адаптеры.
  Приоритет: P1. Статус: открыт.
- Зафиксировать, кто владеет page background context, и выразить разрешённые
  base-bg (white)/base-bg-alt (grey) через контрактный порт и source-confirmed
  mapping в обоих targets. Не подменять режим произвольной ручной заливкой.
- Явно запрошенный белый фон уже является пользовательским решением. Отсутствие
  semanticApi порта — технический gap; повторный вопрос «какой фон?» его не закрывает.
- Приёмка: white/grey выбираются из запроса, сохраняются в спеке и воспроизводятся
  в Figma/фронте с theme context; malformed/unsupported mode отклоняется явно.

## Apollo: бэклог исправлений


### APOLLO-V4-BUG-001 — CorporateContent: аудит прерывается сообщением об изменении выделения

- [ ] Исправить или установить причину остановки захвата CorporateContent.
- Статус: открыт; сообщён пользователем 01.10.2026, агентом не воспроизводился.
- Приоритет: P1 — блокирует получение результата аудита указанного экземпляра.
- Объект: [Figma, узел 11717:41799](https://www.figma.com/design/I3MsagXR8Tz2eZcGtIgUk8/?node-id=11717-41799).
- Контекст со скриншота: Apollo · Contract pilot (Developer VM), выбран `[D] CorporateContent`, главный авторский контракт CorporateContent r11 загружен из ApolloProxyControl. Нажата кнопка «Проверить компонент».
- Фактический результат: «Выделение или свойства изменились во время захвата. Повторите проверку.» Отчёт аудита не получен.
- Ожидаемый результат: при неизменном выделении и свойствах захват завершается и возвращает результат; сообщение об устаревшем захвате появляется только при подтверждённом изменении исходных данных.
- Доказательство: пользовательский скриншот сохранён локально в `live-tests/issues/APOLLO-V4-BUG-001.png`; каталог исключён из Git.
- Версия запущенной сборки не установлена. На скриншоте интерфейс проверки одного компонента с ручным выбором пакета; сначала сверить сборку с профилем 0.4.0 и проверить, сохраняется ли ошибка в текущем потоке проверки выделения. Это наблюдение, а не установленная причина.
- При разборе: сравнить первичный и повторный захват, включая границы native slot и пропущенное внешнее содержимое; отличить реальное изменение от расхождения состава фактов. Причина пока не подтверждена.
- Критерий закрытия: пользователь подтверждает завершение аудита этого узла при неизменных данных; синтетический regression покрывает установленную причину и сохраняет защиту от реального изменения выделения/свойств. Живые проверки выполняет пользователь.
- Последующая проверка 01.10.2026: пользователь подтвердил работоспособность текущего потока и предоставил локальный отчёт `live-tests/apollo-v4-18d83c88d35e.json`. В нём аудит CorporateContent r11 на профиле 0.4.0 завершён; release identity и source/manual/compiled pins трёх проверенных пакетов совпадают с текущим локальным release. Это другой корневой узел (`13228:55031`), поэтому исходную ошибку на `11717:41799` этот отчёт не закрывает.

### APOLLO-V4-BUG-002 — Лишние предупреждения о внутренних вложенностях AmountStyles

- [x] Различать внутреннюю структуру компонента и самостоятельные компоненты, которым нужен отдельный контракт.
- [ ] Пользовательская приёмка нового живого прогона AmountStyles в Apollo.
- Статус: реализовано локально 05.10.2026; автоматические проверки пройдены, живая приёмка открыта.
- Приоритет: P1 — создаёт лишние предупреждения и искажает покрытие области.
- Контекст: локальный отчёт `live-tests/apollo-v4-18d83c88d35e.json`. Пользователь подтвердил, что все 4 записи `contract-not-found` относятся к внутренним вложенностям AmountStyles.
- Фактический результат: внутренние вложенности попадают в `notChecked` как самостоятельные компоненты без контрактов, выводятся в панели и увеличивают число непроверенных компонентов.
- Ожидаемый результат: внутренние части AmountStyles не требуют отдельных контрактов только из-за наличия библиотечного ключа. Их принадлежность и границы проверки определяются контрактом владельца; отсутствие standalone-контракта не создаёт предупреждение и отдельный gap для такой части.
- Исправление должно быть общим: определять ownership по данным контракта и фактам структуры, без исключения по названию AmountStyles и без подавления всех вложенных компонентов. Самостоятельные public components, pinned dependencies и внешнее содержимое открытых slots сохраняют свои маршруты проверки. Настоящие нарушения и неполнота родительского контракта остаются видимыми.
- Критерий закрытия: указанные 4 внутренние вложенности перестают создавать `contract-not-found` в панели и aggregate coverage; результат явно сохраняет их владельца и область ответственности. Синтетические проверки различают внутреннюю часть, самостоятельный child и внешний slot payload; пользователь подтверждает результат живого прогона.
- Реализация: `collectContractOwnedParts` сопоставляет только явно объявленные targets с независимым эталоном текущего варианта и фактической component identity. Полная topology, подтверждённая availability и property-reference evidence обязательны. В `governedComponents` сохраняются scope и узел владельца, contract ID, manualSourceHash, target ID/role и reference path; отдельные evaluations для внутренних частей не выдумываются.
- Собственный public contract сохраняет standalone-проверку; исполненные pinned dependencies сохраняют прежний маршрут. Внешние control paths, native SLOT, INSTANCE_SWAP, неизвестные identity/reference и необъявленные части не присваиваются владельцу. Нарушения и неполное исполнение родительского контракта остаются видимыми. Нормы, shared core, версии пакетов и Proxy release этим исправлением не менялись.
- Проверка: Apollo type-check/build и 136/136 tests; regression воспроизводил четыре лишних gaps до исправления. Синтетические cases покрывают public child, внешнее содержимое, swap, отсутствующее evidence, нарушение и неполноту владельца. Offline-проверка сохранённого отчёта подтверждает ownership четырёх внутренних частей по operation/major/minor/currency; это проверка доказательств, а не новый живой результат. Исторический отчёт не изменён.
- Панель: headless Chrome / установленный Playwright, 440 и 360 px — замечания и scoped focus, gaps области, child coverage, stale guards и вложенный editor bridge прошли. Это синтетический browser gate; живая проверка Figma не запускалась.
- Ограничение общего gate: `npm run validate` проходит legacy type-check/build/parser, затем останавливается на прежнем отсутствующем compiled fixture CardImage. Полный gate и пользовательская живая приёмка не объявлены пройденными.

### APOLLO-V4-BUG-003 — В замечании не показано конкретное отклонение

- [x] Показывать фактическое нарушение вместе с правилом, ожидаемым значением и значением из снимка.
- Статус: реализовано 01.10.2026; автоматические проверки пройдены, ожидается пользовательская приёмка отображения в Figma.
- Приоритет: P1 — по одному тексту правила трудно понять, что именно исправлять.
- Исходный результат: панель показывала правило и идентификаторы без понятного сравнения значений нарушенного свойства.
- Ожидаемый результат: замечание называет узел, свойство, ожидаемое/допустимое значение и фактическое значение с единицами. Пример пользователя: «Отступ: 20 → 24 px». Для сравнения с нормой — «Ожидается 20 px, фактически 24 px»; формулировка «было» используется только при наличии подтверждённого baseline или before snapshot.
- Источник отображаемых значений — deterministic evaluation trace и факты того же frozen snapshot; renderer не придумывает норму и не требует объяснения Codex. RuleID, текст правила и переход к конкретному узлу сохраняются рядом с отклонением.
- Сравнение должно поддерживать число/размер, допустимый набор значений, токен/привязку и структурное нарушение. Если ожидаемое или фактическое значение неизвестно, показывать, какого факта не хватает; не подставлять выдуманные значения ради формата сравнения.
- Критерий закрытия: на синтетическом отклонении 20 → 24 панель показывает правильное свойство, обе величины, единицы и исходный узел. Несколько экземпляров с одинаковым RuleID показывают собственные значения; unknown остаётся явным. Пользователь подтверждает понятность замечаний в живом отчёте.
- Реализация: карточка показывает узел, свойство, ожидаемое/эталонное и фактическое значения; ниже остаются правило, RuleID и focus. Числа выводятся с единицами, заливки — общим paint formatter Editor с цветом и token identity; сложные значения раскрываются полностью. Составные условия показывают только участвующие в результате ветки, допустимые альтернативы и отрицание сохраняют смысл. Неизвестные значения остаются явными; engine, coverage и JSON-отчёт не переписываются.
- Проверка: v4 type-check/build и 98 tests, включая 13 проверок форматирования на настоящих synthetic engine traces; headless Chrome 440/360 px проверил 20/24 и 20/28 при одинаковом RuleID, цвета, отсутствующий эталон и scoped focus. Offline-проверка пользовательского отчёта дала сравнения для всех 9 нарушений без изменения отчёта. Новый живой прогон не выполнялся; Proxy/runtime release не изменён.

### APOLLO-V4-BUG-004 — Счётчик токенов повторно учитывает расход продолженной сессии Codex

- [x] Исправить учёт расхода отдельных обращений и общий итог проверки при `codex exec resume`.
- Статус: **FIXED_LOCAL / USER_RETEST_PENDING**; добавлено 22.10.2026, исправлено и установлено локально 23.10.2026.
- Приоритет: P1 — завышенные показатели мешают оценивать расход и сравнивать варианты оптимизации.
- Владелец: Apollo Proxy, адаптер учёта Codex; отображение читает исправленные показатели существующего журнала.
- Подтверждённая причина: `turn.completed.usage` установленного CLI при `resume` содержит накопительный расход сессии. Существующий `src/token-journal.js` принимает его за расход отдельного обращения. Переход на общую сессию в Proxy `a78392a` не сопровождался адаптацией этой границы.
- Пример пользовательского прогона: строки `20 560 / 47 515 / 79 034` — накопительные итоги. Фактический расход пачек `20 560 / 26 955 / 31 519`, всей проверки — `79 034`; сумма текущих строк `147 109` повторно учитывает прошлые обращения.
- Evidence сохранён локально в `accounting-finding.json` задачи naming session и исходном rollout `01a1654b-fc1e-7092-918e-ee798befe820`. Содержимое макета и raw rollout не включаются в Git.
- Ожидаемое поведение: сохранять приращения входящих, исходящих и кэшированных токенов относительно начала каждого обращения, с привязкой к точной сессии. Общий итог проверки равен сумме её обращений без повторного учёта.
- Критерий приёмки: накопительные `20 560 / 47 515 / 79 034` дают три расхода `20 560 / 26 955 / 31 519` и общий итог `79 034`. Первый вызов, новая сессия и независимые сессии учитываются отдельно.
- Сохранять расход всех внутренних итераций, повторных попыток и отменённых обращений, если он известен; нельзя заменять расход всего обращения только `last_token_usage` последней итерации. Неизвестные показатели остаются неизвестными, а не нулевыми. Повторное чтение события или результата не создаёт новый расход.
- Кэшированные входящие остаются подмножеством входящих, reasoning — подмножеством исходящих; их нельзя повторно прибавлять к total. Число токенов не подменяет стоимость в кредитах или процент лимита подписки.
- Исторические записи пересчитывать только при наличии исходных накопительных показателей и доказанной связи сессии/обращения; первоначальные данные сохранять. Без evidence не выдумывать исправленные значения.
- Исправление Proxy `5b6d7e3`: журнал считает приращения по точному `thread_id` и исходному ID продолжения CLI; повторные события не добавляют расход. Неизвестная база, отсутствующий расход, отмена, несовпадение сессии и сброс счётчиков сохраняют неизвестный итог и не переносят неучтённый промежуток на следующую пачку. Кэш и reasoning сохраняются отдельно как подмножества.
- Регрессии журнала и подставного CLI покрыты 17 успешными тестами: основной локальный прогон дал 16 PASS; единственный отказ из-за незаданного `APOLLO_PROJECT_ROOT` закрыт повтором этого теста с явным корнем Apollo (1 PASS). Первые sandbox-отказы `listen EPERM` сохранены; guards и skip не менялись. Реальные модель и Figma не вызывались.
- Локальный пакет кода `1.4.2-local.1` установлен через существующий code-release API; предыдущая версия `1.4.1` доступна для отката. Все 21 файла журнала расхода сохранены без изменений, настройки и состояние данных также сохранены. Модель, логика сессии и сжатие prompt не менялись. Исторические накопительные строки автоматически не пересчитывались; пользовательский повторный прогон ожидается.

### Подтверждение текущего потока: пользовательский аудит области, 01.10.2026

- Отчёт `apollo-v4-18d83c88d35e.json`: `apollo.area-audit.v1-experimental`, режим `selected-area`, текущий release профиля 0.4.0.
- Обход завершён: обнаружено 8 компонентов; самостоятельно проверены CorporateContent r11, AmountStyles r10 и Button r31, ещё 1 экземпляр учтён через pinned dependency; для 4 компонентов контракт не найден.
- Получено 280 evaluations: 156 compliant, 115 not-applicable, 9 violation. Это успешное завершение аудита, а не отсутствие нарушений.
- Общее `executionComplete=false`: 4 явных `contract-not-found` и неполное покрытие AmountStyles. CorporateContent и Button имеют `executionComplete=true`; в отчёте 1 warning. Ограничения сохранены, полный PASS области не объявляется.
- Уточнение пользователя: 4 записи без контрактов — внутренние вложенности AmountStyles; корректировка ownership и лишних предупреждений отслеживается в APOLLO-V4-BUG-002, отображение конкретного отклонения — в APOLLO-V4-BUG-003.
- Это пользовательский живой прогон; агент проверил сохранённые метаданные и pins, новый живой прогон и вызов Codex не выполнял. Сам отчёт остаётся в игнорируемом `live-tests/`.

## 1. Supporting package field verification (2026-08-29)

- [x] Complete the Apollo v3 field checks for the three supporting packages:
  - `Amount`, section `12606:59315` — exactly two deterministic violations;
  - `TagGroup`, report `22-03-52_predicates.json` — exactly one nested Tag
    `Size 40 != 56` violation; the `RightAddon` icon replacement remains
    allowed;
  - `PaymentMaskedNumber`, report `22-03-31_predicates.json` — exactly two
    text-fill violations on `Major` and `Minor`.
- All three report sets have complete classifications, no unexpected findings
  and stable deterministic output. The supporting-package field gate is closed.

## Architecture reset: deterministic Predicate Engine MVP (2026-08-22)

The current Semantic Fact Model / faceted-agent verdict path is frozen as a
comparison baseline. New component and pattern verdict behavior is implemented
only in the replacement predicate engine described in
`docs/PREDICATE_ENGINE_MVP.md`. The old path is removed after the replacement
passes deterministic cutover gates; do not add more component-specific proxy
normalizers or agent prompt rules.

### P0: closed contract

- [x] Define the MVP boundary, stable truth/applicability semantics and cutover gates.
- [x] Publish a machine-readable closed registry of selectors, fact families, predicates and authority gates.
- [x] Draft JSON Schemas for snapshot v2, RuleIR v1, predicate trace, coverage ledger and final result.
- [x] Ratify the drafted schemas after the plugin-to-engine field contour and
  ten-run repeatability gate passed in Figma on 2026-08-24.
- [ ] Publish a source-field-to-RuleIR mapping for every structured field used by the pilot component and form rules. Four production waves are published in `docs/PREDICATE_SOURCE_TO_RULE_IR.md`: ButtonsGroup composition, TitleView slot order, required effective baseline and generic token-binding sets now compile without component-specific runtime rule construction; the remaining component and form source shapes are still pending.
- [ ] Reject unknown predicates, unknown fact readers, ambiguous identities and incomplete active rules at compile time.

### P0: pure predicate engine

- [x] Create the isolated engine module with ordered initial selectors and typed literal/fact resolution without Figma or agent dependencies.
- [x] Implement three-valued predicate logic and applicability independently for the first vertical slice.
- [x] Implement `exists`, `equals` and `one-of` with all four test outcomes and stable traces.
- [x] Implement every predicate in `apollo-predicate-capabilities.v1.json` with PASS, FAIL, UNKNOWN and NOT-APPLICABLE fixtures.
- [x] Add the universal P21–P28 contour compiler, graph queries, closed
  arithmetic derivations and approximate numeric comparison; keep all
  component identities in rule data rather than runtime branches.
- [x] Discover active component contours from package `rules.json` and active
  pattern contours from fenced machine-readable blocks in Markdown patterns;
  pin both to their exact source checksums before compilation.
- [x] Generate stable evaluation ids, deterministic ordering, exact focus targets and a complete predicate trace.
- [x] Require exactly one terminal coverage classification per evaluation target.

### P0: canonical snapshot v2

- [x] Audit the current plugin snapshot against the fact-family requirements and add only missing evidence. See `docs/SNAPSHOT_V2_GAP_AUDIT.md`.
- [x] Exclude hidden layers from selection and aggregates.
- [ ] Preserve exact effective-baseline value, origin, selected variant and release revision per auditable property. P04 proves `styles.text`; P26 adds observable `appearance.opacity` and `appearance.radius`, uses exact WIP baseline/actual pairs for changed properties, and derives an unchanged baseline only when no matching direct Figma override exists. Paint, layout, effects and complete release-origin metadata remain.
- [x] Materialize nested effective baseline with property-level ownership. The
  runtime now merges canonical host and selected nested baselines per property,
  records `referencePropertyOwners`, prefers exact variant-patch provenance and
  does not infer ownership from component names or decorated layer paths.
- [x] Preserve the selected root width as `context.viewportWidth`; ambiguous
  multi-root selection and missing bounds are explicit `unknown` evidence.
- [ ] Preserve component/slot ownership, ordered structure, bounds, auto-layout, styles, bindings and explicit overrides. Nearest component owner properties, Figma file/page identity and normalized platform are now preserved; P05 adds resolved padding binding metadata, while slot identity and remaining binding families remain.
- [x] Validate and hash the immutable snapshot before proxy evaluation; unresolved component metadata becomes `unknown` instead of a guessed identity. Per-node collection error production remains part of the next evidence wave.

### P0: predicate-by-predicate Figma contour

- [x] Prepare `12161:122197` as the canonical predicate test section; P01/P02 PASS/FAIL use published components, while UNKNOWN/NOT-APPLICABLE remain sanitized fixtures where a broken live component would be unstable.
- [x] Test the first value predicates on component properties and variants (`one-of`, `equals`).
- [x] Test `matches-effective-baseline` for TitleView fixed typography with published PASS/FAIL cases, exact nested focus and fail-closed unknown evidence.
- [x] Test the first token binding predicate on BackgroundPlate padding.
- [x] Test collection predicates on ButtonsGroup. P03 covers `value-position`; P09 compiles the active `button-count` constraint to `count-between`, focuses the ButtonsGroup owner and has PASS/FAIL/UNKNOWN/NOT-APPLICABLE fixtures.
- [x] Prove the first cross-component contour beyond the original pilot:
  P10 validates Benefits Capacity, P11 validates the Horizontal TableView
  Header, and P12 validates every direct Row against root Compact plus the
  canonical nested SpacingVertical instances. The 2026-08-23 P12 field run
  produced 24 evaluations, one exact violation and exact nested Row focus.
- [x] Field-prove P13 `Benefits` nested-card setting uniformity. The compiled
  rule checks `Background`, `CardAxis`, `Compact` and `GraphicPosition` in one
  owner-level evaluation; published PASS `12238:47999` and FAIL `12238:48065`
  fixtures are ready.
- [x] Field-prove P14 `Horizontal TableView / Compact=True` one-column usage.
  Published PASS `12242:17323` resolves every Body Row to one data Column;
  FAIL `12242:17647` exposes two Columns in the exact overridden Body Row
  `I12242:17647;60668:82232`. The 2026-08-23 field report records `actual=1`
  for PASS, `actual=2` for FAIL and focuses that Row rather than the TableView
  owner or test section.
- [x] Test parent/ancestor/slot/order predicates on BackgroundPlate and TitleView. P06 compiles the generic `co-located-underlay` contour from BackgroundPlate `rules.json`; its adapter and runtime contain no BackgroundPlate-specific facts or rule registration, and the 2026-08-25 field run proved one exact PASS plus one exact FAIL with stable ten-run output. P07 compiles the generic `owned-peer-property-equality` contour from TitleView `rules.json`, has no TitleView-specific runtime facts or rule registration, and passes the complete four-state matrix; P08 compiles TitleView `slotOrderPolicy` into exact slot ownership plus `after`, and its pure PASS/FAIL/UNKNOWN/NOT-APPLICABLE contour passes. A live P08 FAIL is intentionally unavailable because published instance children cannot be reordered without detaching the component.
- [x] Test geometry predicates on form paddings, block gaps, alignment and 8/4
  layout through P15–P19 with exact field focus.
- [x] Field-test universal contours P21–P28 using the canonical fixtures. P21
  `public-root`, P22 `context-map`, P23 `uniform-allowed-collection`, P24
  `breakpoint-map`, P25 `sizing` and P26 `baseline` are field-proven. P25 evaluated two live
  PASS plus two live FAIL Benefits roots in one stable ten-run audit and
  returned exactly two violations. P26 evaluated published TitleView opacity
  roots as `1 == 1` and `0.5 != 1`, returned one exact-root violation and
  passed the ten-run repeatability gate. P27 is active from
  `p_title-view.md`, passes the complete pure tri-state matrix and is field-proven
  with exact resolved-root counting. P28 is compiled from the active form
  pattern as one atomic multi-formula `derived-geometry` evaluation and is
  field-proven on PASS `12276:48914` and FAIL `12276:51033`. The 2026-08-25
  report classified PASS as compliant, produced one page-specific violation
  for FAIL, focused the exact grid owner and passed the ten-run repeatability
  gate. The complete fixture matrix is specified in
  `docs/PREDICATE_FIELD_CASES.md`.
- [x] Repeat each real predicate request ten times over the same Snapshot v2 and
  rule release; fail closed unless all normalized result hashes are identical.

### P1: pilot cutover

- [ ] Compile all observable active deterministic BackgroundPlate, TitleView and ButtonsGroup rules to RuleIR.
  - [x] Complete the first production package migration on TitleView. All 42
    source rules are closed exactly once across direct predicates, composition,
    delegation, policy and context-only routes. The release loader rejects a
    missing/duplicate route, incomplete authority or an absent composition
    constraint. Generic `baseline-set`, `fact-assertion` and declared
    composition facts cover the new executable rules without TitleView runtime
    branches. PASS/FAIL/UNKNOWN and exact-focus integration tests are included;
    `design-system_ab` commit `61f32718` is the published source. Reuse
    `docs/EXECUTABLE_RULE_PACKAGE_MIGRATION.md` for every next package.
  - [x] Compile the complete ButtonsGroup composition contract (`countBetween`, `propertyDomain`, `propertyEqualsHost`, `valuePosition` and typed host conditions) from source data. Unknown operations and inactive/incomplete authority fail closed before evaluation; the legacy hardcoded runtime registration is removed.
  - [x] Compile TitleView slot order from a generic `apollo.slot-order-policy.v1` source contract. Owner identity, content container and ordered roles now enter the snapshot adapter as policy data; both the former TitleView-specific fact builder and hand-written RuleIR rule are removed.
  - [x] Compile TitleView fixed typography through the generic `baseline` contour with required-value semantics. The source `rules.json` owns selector, fact pairs, authority, presentation and scope; the former hand-written P04 runtime rule is removed.
  - [x] Compile BackgroundPlateSlot padding token requirements through the generic `binding-set` contour. The source `rules.json` emits four independent RuleIR rules, restricts applicability to public BackgroundPlateSlot roots and owns the UI copy; the former hand-written P05 runtime rules are removed.
  - [x] Close the complete BackgroundPlate source package. All 27 source rules
    now have exactly one execution route: 9 direct predicates, 1 delegated
    rule, 8 explicit policy rules and 9 context-only rules. The direct release
    adds source-owned contours for nested level legality, the Level-2 Type
    domain, conditional Colored/Border paint bindings, Border/Colored paint
    state, Primary/Secondary paint baseline and opacity baseline. The generic
    `binding-set` compiler now supports independent per-path selectors, so one
    source rule can atomically route Colored fill and Border stroke without a
    BackgroundPlate runtime branch.
  - [x] Field-prove the complete BackgroundPlate package. The 27 August 2026
    run produced the six intended violations, one honest `not-evaluable` for a
    Level-2 instance whose `Type` fact was absent, zero duplicate/unclassified
    evaluations and stable ten-run hash
    `73bb1802999cef9959817900adc09e24efaee4329e7d8b17e4d4fc4bdbaedd72`.
    Removed BackgroundPlateSlot padding/sizing policies did not reappear.
  - [x] Close FilterCompanySelect as the next source package. All 32 rules are
    routed exactly once: 4 direct predicates, 5 delegated rules, 4 policies
    and 19 context-only rules. Contract tests cover public roots, desktop-only
    use, legacy `ShowFirstCompany=False` and effective-baseline visuals without
    FilterCompanySelect-specific runtime branches.
  - [x] Field-prove FilterCompanySelect_Single with isolated PASS/FAIL fixtures
    for the four executable contours and exact focus. The 27 August 2026
    desktop run passed the root, legacy-property and baseline gates: it produced
    exactly the intended `ShowFirstCompany`, opacity, internal-root and radius
    violations; canonical and width controls remained compliant. Coverage had
    zero duplicate/unclassified evaluations and the ten-run hash was stable at
    `2c5ebd196e236060c3613954a080a48bad08a1430524ce30aaa73848de31ea1e`.
    The separate mobile-web run produced one exact `desktop-only` violation for
    each of the five public FilterCompanySelect roots in the selected fixture
    frame, zero duplicate/unclassified evaluations and stable ten-run hash
    `cd3f7c2e99b4fffbb48e721eab21080af08e04d87286d299c990d892a7b2eeea`.
    C21 is closed.
  - [x] Close AccountSelect as CUTOVER C22. All 41 source rules are now routed
    exactly once: 4 direct predicates, 5 delegations, 9 policy effects and 23
    context-only rules. Existing generic `public-root` and
    `uniform-allowed-collection` contours cover public ownership and AccountItem
    Type uniformity; generic `baseline-set` and `platform-match` contours cover
    row overrides and the concrete published variant's platform. The release
    loader transports `contract.platform` into `component.platform`; the engine
    contains no AccountSelect identity/key branch. Unit coverage proves the
    four-case D/M × Desktop/MobileWeb matrix. Field runs confirmed five exact
    mobile-root violations under Desktop and five compliant evaluations under
    MobileWeb, with no nested duplicates, complete classification and stable
    ten-run hashes. Removing the wrong-channel conflict also restored the exact
    AccountItem radius `0 → 20` baseline finding. C22 is closed.
  - [x] Field-prove CUTOVER C02: compile ButtonsGroup `HUG/HUG` and
    BackgroundPlateSlot `FILL/HUG` from their own `rules.json` files through
    the same generic `sizing` contour. The four live fixtures produced exactly
    two violations on the two FAIL roots, exact focus, zero unclassified or
    duplicate evaluations and a stable ten-run result.
  - [x] Field-prove CUTOVER C03: compile BackgroundPlate radius through the
    same generic `baseline` contour already used for TitleView opacity. Suite
    `12389:54001` produced one exact `16 → 24` FAIL-root finding, PASS remained
    compliant, all 32 evaluations were classified and the ten-run result hash
    was stable.
  - [x] Field-prove CUTOVER C04: apply the generic `binding-set` compiler to
    `[D] Section.itemSpacing → Grid/Gutter` from CorporateContent
    `rules.json`. The live PASS/FAIL suite produced one exact FAIL-root
    violation, PASS remained compliant, all 21 evaluations were classified,
    there were no duplicates and the ten-run result hash was stable.
  - [x] Compile form rule 4 through the generic `distance` contour published
    by `p_form-construction-rules.md`. The source owns applicability, selector,
    fact references, expected distance, axis, tolerance and presentation; the
    former hand-written runtime registration is removed.
  - [x] Field-prove CUTOVER C05 on suite `12395:54015`: PASS gap `24 px`, FAIL
    gap `12 px`, exactly one page-specific finding focused on the second FAIL
    BackgroundPlate `12395:54025`, zero duplicate/unclassified evaluations and
    one stable ten-run result hash. The UI now resolves the source presentation
    placeholder to `12 px` and routes the row only to `Раздел`.
  - [x] Compile form Rule 5 through source-owned `distance` and
    `derived-geometry` contours. The former hand-written title/content and
    content-insets RuleIR factories are removed; the normalized snapshot keeps
    only measured geometry and ownership.
  - [x] Field-prove CUTOVER C06 on the existing P17 and P18 PASS/FAIL fixtures:
    exact content/root focus, page-specific routing, source presentation,
    complete coverage and stable ten-run hashes. P17 preserved `24 px` as
    compliant and classified `40 px` as a violation; P18 preserved four
    `32 px` insets as compliant and classified the `48 px` right inset as a
    violation. Both reports had zero unclassified/duplicate evaluations and
    stable ten-run hashes.
  - [ ] Clean the P17/P18 fixture roots so the C06 golden reports contain no
    unrelated `База` findings from raw Spacing bindings or non-canonical
    BackgroundPlateSlot sizing.
  - [x] Compile form Rule 9 through the generic source-owned `fact-domain`
    contour. The pattern owns the exact selector, position fact, allowed
    values, authority and UI copy; the former hand-written RuleIR factory and
    runtime registration are removed without changing Snapshot v2.
  - [x] Field-prove CUTOVER C07 on the existing P16 PASS/FAIL fixtures. The
    source-driven rule preserved `single` and `first` as compliant, classified
    only the second TitleView with position `last`, focused that exact node,
    routed the row to `Раздел`, matched the published source checksum/revision,
    had zero unclassified/duplicate evaluations and passed the ten-run gate.
  - [x] Compile P20 through the generic source-owned `distance` contour. Form
    Rule 4 now owns the second-level relation, expected `32 px`, axis,
    tolerance, authority and UI copy; the hand-written RuleIR factory, export
    and runtime registration are removed without changing Snapshot v2.
  - [x] Field-prove CUTOVER C08 on canonical `32 px` and existing `48 px`
    primary-action boundaries with exact action focus, `Раздел` routing,
    published checksum/revision, complete coverage and stable ten-run hashes.
    The FAIL control emitted exactly one P20 row at `48 px`; the PASS control
    measured `32 px` and emitted none while preserving the same action focus.
  - [x] Compile P10 through the generic source-owned `context-map` contour.
    Benefits now owns the typed `3 -> 3` and `4 -> 4` Capacity mappings,
    authority and UI copy; the hand-written `benefitsCapacityRule` factory and
    runtime registration are removed without changing Snapshot v2.
  - [x] Field-prove CUTOVER C09 on the existing Benefits PASS/FAIL fixtures:
    exact Benefits-root focus, `База` routing, published checksum/revision,
    complete coverage and stable ten-run hashes. The PASS root preserved the
    typed `3 -> 3` mapping, the FAIL root exposed `4 -> 3`, coverage had zero
    gaps or duplicates, and the ten-run result hash was stable. The fixtures'
    unrelated sizing findings remain cleanup work.
  - [x] Compile P13 through the generic source-owned
    `uniform-collection-properties` contour. The Benefits rule now owns the
    member identity, direct-child collection boundary and four uniform
    property paths; the shared graph query and `all-equal` predicates contain
    no Benefits-specific branch. The composition boundary includes renamed
    members without traversing unrelated unresolved deep content. The former
    manual factory and runtime registration are removed.
  - [x] Field-prove CUTOVER C10 on the existing P13 PASS/FAIL fixtures. The
    direct-child boundary preserved the renamed failing BenefitCard, emitted
    one owner-level violation for `Vertical / Horizontal / Vertical`, focused
    the exact Benefits root, stayed in `База`, used published revision `4`,
    kept coverage complete and produced one stable ten-run result hash. The
    fixtures' unrelated Benefits sizing findings remain cleanup work.
  - [x] Compile P11 through the generic source-owned `fact-domain` contour.
    TableView now owns the Horizontal/Compact selector, the exact allowed
    Header count, platform scope and UI copy; the snapshot adapter keeps only
    direct Header-row collection, and the former manual factory/runtime
    registration are removed.
  - [x] Field-prove CUTOVER C11 on the existing P11 PASS/FAIL TableView roots.
    Report `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_13-05-07_predicates.json`
    confirms exact owner focus, `База` routing, revision `2`, complete coverage
    and stable ten-run hash.
  - [x] Compile CUTOVER C12 through generic `fact-domain`: source-owned
    `TitleStatus=true -> Status=true` dependency for public TitleView roots,
    with the contradictory standalone allowance removed from all mirrors.
  - [x] Field-prove CUTOVER C12 with PASS/FAIL TitleView roots. Report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_13-25-01_predicates.json`
    confirms the boolean dependency, exact TitleView-root focus, `База`
    routing, published revision `1`, complete coverage and a stable ten-run
    hash.
  - [x] Compile CUTOVER C13 through generic `fact-domain`: source-owned
    Horizontal Compact TableView Body Row selector and exact one-column domain,
    with the former P14 manual factory/runtime registration removed.
  - [ ] Field-prove CUTOVER C13 on the existing P14 PASS/FAIL TableView roots:
    exact failing Row focus, `База` routing, published revision `2`, complete
    coverage and a stable ten-run hash.
  - [x] Field-prove generic `fact-domain` portability beyond TableView with
    independent PASS/FAIL fixtures for `TabsSecondary.SingleIcon` inside
    TabsView and `TitleStatus -> Status` on TitleView. Report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_15-28-34_predicates.json`
    loaded the corrected TabsView source revision `2`, evaluated all eight
    nested Tag instances, classified the sole `SingleIcon=True` Tag as a
    violation with exact nested focus, and preserved the independent
    TitleStatus FAIL verdict. The shared engine contains no TabsView- or
    TitleView-specific runtime registration.
  - [x] Compile CUTOVER C14 through generic `query-unique`: the active TabsView
    rule owns the Primary/Secondary level selectors, visible Label query,
    projected `text.characters`, authority and presentation. The runtime adds
    only a reusable query-to-`unique` contour and contains no TabsView branch.
  - [x] Field-prove CUTOVER C14 on one TabsView PASS/FAIL pair. Report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_15-54-38_predicates.json`
    classified every unique Primary/Secondary level as compliant. Report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_15-55-42_predicates.json`
    produced exactly one C14 owner-level violation for duplicate Secondary
    labels `Обзор`, routed it to `База`, focused the exact TabsSecondary owner,
    loaded source revision `2` with checksum
    `0ba15eaae89e9158f7fc31126aea4b43671cff7f7a5a7a7eb4245560a3bc968d`,
    retained zero unclassified/duplicate evaluations and passed the ten-run
    repeatability gate with result hash
    `ba3c9d88601a12813df03e89e966b6a1b855d048832f9d6fbde70070f21993b1`.
    Presentation follow-up revision `3` replaces the full `{{actual}}`
    collection in the observed message with the generic `{{duplicates}}`
    projection. Source checksum
    `9b7ea79b7aae5ccd8c5ec2dbd533e802e1c741dc8c8a61d0ae4d991b474e0de0`
    is published. UI smoke report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_16-18-11_predicates.json`
    rendered exactly `На одном уровне повторяются названия табов: Обзор,
    Обзор.`, focused the exact TabsSecondary owner, retained zero
    unclassified/duplicate evaluations and passed the ten-run gate with result
    hash `621a4d6bac768ae76ad20639c03635569e6fcace6c0bae7211b620b6e4382699`.
  - [x] Compile CUTOVER C15 — generic component-property validation. Compile allowed
    public component-property domains and conditional property relations from
    authoritative component data into existing `fact-domain`/`context-map`
    predicates. The first source-driven portability case is CardImage:
    `Size=24x16 -> State=Active` compiles from the active CardImage `rules.json`
    through generic `fact-domain`; PASS, FAIL and not-applicable service fixtures
    pass without CardImage-specific runtime code.
  - [x] Field-prove CUTOVER C15 on published CardImage instances: PASS
    `Size=24x16, State=Active`, FAIL `Size=24x16, State=Inactive` and control
    `Size=44x28, State=Inactive`. Expect exactly one C15 violation on the FAIL
    root, exact root focus, `База` routing, complete coverage and stable ten-run
    output. Field report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_16-43-14_predicates.json`
    produced one violation on FAIL node `12429:92281`, one compliant evaluation
    on PASS node `12429:92261`, excluded control node `12429:92433` from the
    conditional selector, retained zero unclassified/duplicate evaluations and
    passed the ten-run gate with result hash
    `f34110361a87a7cac238c30299635e6da99956319ca87ecf96219f9cabd756e2`.
  - [x] Compile CUTOVER C16 — generic paint baseline. Snapshot v2 now preserves
    canonical fill actual/baseline pairs, token/style identity, owner and variant
    origin. The active Onboarding Tooltip rule compiles through the existing
    generic `baseline` contour; PASS, FAIL and UNKNOWN service fixtures pass
    without Onboarding Tooltip-specific runtime code.
  - [x] Field-prove CUTOVER C16 on published Onboarding Tooltip instances:
    unchanged PASS plus one exact nested fill override as FAIL. Expect one error
    on the modified layer, exact focus, `База` routing, complete coverage and a
    stable ten-run output. Field report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_17-19-43_predicates.json`
    produced ten compliant fill evaluations on the unchanged instance and two
    exact violations for the two intentionally changed FAIL layers: Content
    `base-bg/primary -> base-bg/secondary` and Title
    `text/primary -> text/positive`. Both findings focus their exact layers,
    stay in `База`, retain revision `2`, have zero unclassified/duplicates and
    pass the ten-run gate with result hash
    `24ac1290f9a57eccaa55786885f5aceab6dd9762e06385d913874e4d486e0835`.
  - [x] CUTOVER C17 — generic stroke baseline and binding. Snapshot v2 now
    preserves visible uniform and per-side stroke geometry, including Figma's
    `MIXED` aggregate weight, paint value and token/style binding. Field report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_21-02-23_predicates.json`
    produced exactly two violations: the TabsView FAIL stroke differed from
    its effective baseline and the BackgroundPlate Border FAIL stroke was raw
    and unbound. Both PASS controls remained compliant, focus targets were
    exact, coverage had zero unclassified/duplicate evaluations and the
    ten-run result hash was stable at
    `c39e70d4d8521512b1d34e68de209bd0f3266efa8cbeb0e7b49638097d541aa1`.
  - [x] CUTOVER C18 — radius portability. The generic `baseline` contour was
    reused on Onboarding Tooltip without a radius-specific runtime branch.
    The moved Figma suite `12449:95182` contains PASS radius `12` and FAIL
    radius `20`. Field report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_22-48-38_predicates.json`
    produced one exact violation on `I12449:95188;31961:32482`; the PASS layer
    remained compliant, coverage had zero unclassified/duplicate evaluations
    and the ten-run output was stable at
    `a9f2827cebe710f614608d10efb6d4effc659a2545cc737a155c164ccdcabba8`.
  - [x] CUTOVER C19 — typography baseline and binding. Keep the already proven
    TitleView text-style baseline as the control, then prove the same contour on
    another component and add a separate binding check for missing/wrong
    typography style or token identity. Raw typography and wrong canonical
    style are distinct failure facts. The generic Snapshot v2 and `binding-set`
    implementation now expose Figma Text Style binding independently of the
    scalar style value, and active Onboarding Tooltip contours cover both
    checks. The moved Figma suite `12449:105503` contains canonical PASS,
    wrong-style FAIL and raw-typography FAIL. Field report
    `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_23-12-51_predicates.json`
    produced exactly two violations on two different text nodes: the assigned
    wrong style failed the effective baseline and the raw text failed the
    binding requirement. The PASS control remained compliant, coverage had
    zero unclassified/duplicate evaluations and the ten-run output was stable.
  - [x] Add a source-rule balancer before release compilation. It must compare
    rule contours by collection boundary, member selector, property paths and
    predicate semantics rather than component name, then propose reuse of an
    existing generic contour when a new rule has the same shape. First
    acceptance case: TabsView must be able to declare the same
    `uniform-collection-properties` invariant already used by Benefits, so one
    Tag with a different `SingleIcon` value is detected as collection
    non-uniformity without a TabsView-specific evaluator. The source
    `rules.json` remains authoritative: the balancer may propose or compile a
    contour, but must not invent a normative rule or verdict. Persist the
    selected contour id, matched precedent rule ids and compatibility trace in
    the predicate release for debugging.
    - [x] Implement the pure compatibility pass and persist
      `apollo.source-rule-compatibility.v1` traces separately from RuleIR. The
      pass compares collection boundary shape, member selector shape, property
      fact families and predicate semantics while preserving exact source
      configuration. The first compiler acceptance maps TabsView
      `SingleIcon` uniformity to the existing Benefits
      `uniform-collection-properties` precedent without component-specific
      evaluator code. Field report
      `Alexey-Kukhta-CORP-Lead-Designer_26-08-2026_23-46-34_predicates.json`
      passed the live gate: the mismatched collection and the exact
      `SingleIcon=True` Tag are separate violations, the compatibility trace
      records `reuse` with the Benefits precedent, coverage has no unclassified
      or duplicate evaluations, and the ten-run result hash is stable.
    - [x] Close the release-compilation gate. `loadPredicateRelease` runs the
      balancer before `compileContourRule`, preserves each authoritative source
      definition, and publishes the selected contour id, compatibility
      signature, matched precedent rule ids and exact configured selector in
      `sourceRuleBalance.traces`. The focused release, balancer and pilot suite
      passes 71/71, including the Benefits -> TabsView cross-family acceptance
      case.
  - [ ] Add causal finding prioritization after deterministic evaluation and
    before UI sorting. Preserve every predicate verdict in the debug report,
    but group findings with the same failing object when one violated rule
    explains another observed violation. Render the root cause first and mark
    downstream findings as consequences; never suppress an independent
    violation. Store `rootFindingId`, `derivedFindingIds` and the deterministic
    grouping reason. An agent may explain or rank the group, but must not create,
    remove or change predicate verdicts.
    - [x] Add the generic RuleIR/result capability. An authoritative source rule
      may declare explicit `same-subject`, `same-focus` or
      `descendant-subject` causal edges. The engine preserves both verdicts,
      adds `rootFindingId`, `derivedFindingIds` and
      `causalGroupingReason`, and the Apollo UI orders the root first while
      marking downstream rows as consequences. Invalid or implicit relations
      fail closed. Proxy tests pass 255/255 and Apollo validation passes all 80
      regression suites.
    - [ ] Add the first real source-authored causal edge and field-prove it on a
      component where an invalid nested identity deterministically causes a
      downstream structural violation. Confirm exact focus, unchanged coverage,
      stable ten-run output and visible root-before-consequence ordering.
    - [ ] Add universal applicability suppression for dependent slot predicates.
      When a public-root / ownership predicate proves that an internal component
      is used standalone, predicates that require its valid owner or slot
      context must be classified `not-applicable` and omitted from the UI. Keep
      their raw traces for debugging with `suppressedBy`, `suppressionReason`
      and the root finding id. Do not hide independent violations. First field
      proof: standalone `PaymentMaskedNumber.RightAddon` must render only
      `public-root-only`, while `addon-uses-final-component` and both
      `addon-geometry` checks are suppressed. This is a generic dependency /
      applicability capability, not a PaymentMaskedNumber-specific exception.
- [ ] Compile deterministic form rules 1, 4, 5, 6, 7, 9, 12, 13 and 18 to RuleIR.
- [x] Pass the P01–P19 mixed canonical-section regression. Public-instance-root
  ownership gates removed 239 inherited implementation evaluations while all
  five page-specific findings and exact report routing remained stable.
- [ ] Run a curated real-screen regression corpus covering clean, component-error,
  form-pattern-error and mixed pages; record expected finding ids and focus nodes.
- [ ] Keep prose-only, interaction, red-policy and business-context rules outside the MVP as explicit `not-evaluable` coverage.
- [ ] Route agent usage to optional explanation only; forbid agent-created or agent-modified verdicts.
- [ ] Remove the old SFM/faceted-agent verdict path after all cutover gates pass.

## Current execution order

The Predicate model is the target architecture. Engine readiness and migrated
knowledge coverage are tracked separately. The detailed ratification plan,
package Definition of Done and current inventory baseline are in
`docs/PREDICATE_SCALE_PLAN.md`.

Current order:

1. S0 — merge useful Contract v2 packaging/compiler behaviour into the one
   canonical Predicate release and prove Benefits, BackgroundPlate and
   ButtonStack parity without an experimental toggle.
2. S1 — migrate the 215 currently executable rules in dependency-aware
   batches, starting with reusable Core boundaries.
3. S2 — obtain reviewed typed authoring for 126 deterministic source gaps.
4. S3 — review seven genuine capability gaps as versioned, portable engine
   proposals rather than component-specific branches.
5. S4 — route the 138 agent-required, 202 human-review and 162 unresolved
   rules explicitly without allowing either route to alter deterministic
   verdicts.
6. S5 — pass the curated real-screen regression corpus and only then remove
   duplicate legacy, experimental and faceted-agent verdict paths.

Do not expand the experimental Contract v2 verdict runtime as a second product
architecture. It remains a shadow/parity workbench until its package compiler
and fixtures are represented in the canonical Predicate pipeline.

## P0: runtime integrity

- [x] Run every `scripts/test-*.js` regression from one `npm test` command and from CI.
- [x] Fail closed when the reference manifest, required token/style catalogs or component indexes are incomplete.
- [x] Require `componentContractIndex.json` schema v2 with explicit `required | optional | none` coverage.
- [x] Resolve contract packages deterministically by Figma key, source catalog path and then unique alias.
- [x] Reject duplicate catalog paths, component keys, Figma keys and source catalog paths before publication.
- [x] Publish component indexes before the bootstrap manifest and validate the complete release snapshot.
- [x] Preserve contextual reference labels when suppression evidence explains a diff.
- [x] Reconcile source-library updates atomically and assert that `Пора обновить` and `Актуальные компоненты` are mutually exclusive.
- [x] Preserve every source dependency occurrence as a separate update finding with its own navigable focus target.
- [x] Cover detached/local-instance parity with a sanitized fixture: both paths return 8 updates and 24 current components.
- [x] Keep detailed customization diagnostics behind the opt-in `apollo.debug.audit` trace flag.
- [ ] Isolate broken Figma component sets during snapshot collection: guard every `InstanceNode.variantProperties` read, continue the audit with variant evidence marked unknown, emit one deduplicated technical finding with node/component identity, and prove that one `Component set for node has existing errors` instance cannot abort a multi-frame audit.
- [ ] Field-verify the same local component as detached content and as an instance: 8 updates, 24 current components and valid focus for every update card.

## P0: finding remediation actions

- [x] Introduce a per-audit action registry so the UI executes opaque action ids instead of supplying mutation targets.
- [x] Revalidate source component/style identity immediately before every mutation and rerun the audit after success.
- [x] Apply native Figma library updates through import-by-stable-key plus override-preserving instance swap.
- [x] Generate unambiguous same-catalog Desktop/MobileWeb counterpart metadata in Athena component indexes.
- [x] Load explicit deprecated component/style replacement mappings from remote `apollo/remediations.json`.
- [x] Offer every exact custom solid fill/stroke match as an explicit user choice with its library; reject the selected action if either the node paint or imported library style changed after the audit.
- [x] Bind an unbound custom solid paint to the unique COLOR variable required by its component reference diff instead of offering a deprecated paint style with the same RGBA.
- [ ] Populate reviewed deprecated component/style mappings in `apollo/remediations.json`.
- [ ] Republish component catalogs with Athena so existing indexes receive Desktop/MobileWeb counterpart metadata.
- [ ] Extend exact custom style binding to effect styles and mixed text ranges after canonical multi-value style serialization is published.
- [x] Add typography style remediation MVP: emit one finding for a uniform unbound text layer, resolve published text styles by `fontSize + fontName.style + lineHeight + numbers style`, show an explicit candidate picker, revalidate the fingerprint, assign the style through the full text range, preserve explicit non-default `textCase`/`textDecoration` overrides and then rerun the audit.
- [x] Load scoped raw-typography exceptions from remote `apollo/auditPolicies.json`; cover canonical Web Core `Status` by stable component keys and a strict collapsed-sublayer ancestry path.
- [ ] Field-verify that `Status / 🔩 Label / Label` is absent from custom typography findings after remote policy publication.
- [ ] Extend typography remediation with component-reference priority and deliberate mixed rich-text range selection; keep non-uniform rich text fail-closed.
- [ ] Field-verify override preservation, local-owner dependency updates and stale-action rejection in Figma.

## P0: Contract v2 schema and authoring closure

- [ ] Ratify one versioned Contract v2 schema shared by package authors, Athena and Apollo: package identity, selectors, facts, `when`, assertions, evidence requirements, verdict policy and remediation metadata.
- [ ] Stabilize capability identifiers and unknown-evidence semantics for the 25-package Ready experiment: 9 selectors, 47 facts, 37 operators and 5 remediations; candidate capabilities are not executable until their exact inputs and outputs are specified.
- [ ] Normalize the observed 129 structured assertion fields into a compact versioned vocabulary instead of implementing one runtime branch per source field; record aliases and reject ambiguous mappings.
- [ ] Triage all 315 unsupported deterministic rules across the 25 Ready packages: re-author recurring rule families as typed assertions or explicitly downgrade them to `manual`/`llm`; never infer runtime behavior from `ruleText`.
- [x] Re-audit the original 315 unsupported rules by source shape: 124 already contained structured assertion fields that the compiler did not normalize, while 191 were prose-only. Do not classify runtime gaps from rule-id substrings: the original discovery heuristic confused `border` with `order` and generic `*-required` rules with `requiredChild`.
- [x] Normalize the first evidence-safe field wave in the isolated compiler: `requiredVariant`, direct variant-only `requiredState`, direct `requiredLayout`, `requiredOrder`, `forbiddenWidthOverride` and `*-component-property`. This promotes 14 deterministic rules without new runtime operators, raising coverage from 161/476 (33.82%) to 175/476 (36.76%) and reducing unsupported rules from 315 to 301.
- [x] Replace the proposed bulk normalization step with a source-authority
  classification pass. The current Ready inventory contains 839 rules: 337
  are confirmed deterministic, 138 explicitly require an agent, 201 require
  human review, 1 is policy-only and 162 remain unresolved. Of the deterministic
  rules, 204 compile now, 126 require typed authoring and 7 require a
  versioned capability. See `docs/CONTRACT_V2_READY_RULE_CLASSIFICATION.md`;
  no prose-only rule was promoted from its text and `authority` metadata alone
  is not treated as an executable assertion.
- [ ] Re-author the 20 prose-only rules that conservatively map to existing operators; require explicit selectors, facts, assertion parameters, unknown-evidence behavior and source-rule traceability.
- [ ] Specify the 15 currently identifiable runtime-operator gaps as versioned contracts and fixtures before implementation: 7 already have structured fields and 8 remain prose-only. Define exact inputs, pass/fail/unknown semantics, evidence requirements and remediation boundaries for `statePolicy`, `numericFormat` and `visibilityPolicy`.
- [ ] Add generic conditional RuleIR composition (`when -> assert`) rather than component-specific state branches; conditions must support fact-to-value and fact-to-fact comparison with three-valued unknown propagation.
- [ ] Extend selectors with typed `where` predicates and ancestry constraints, then add filtered aggregates such as `countWhere`; use them for rules including one active sorting column and at least one visible table column.
- [ ] Classify the remaining 160 unclassified prose-only deterministic rules as `typed-authoring`, `missing-capability`, `manual` or `llm`; prohibit `checkType=deterministic` when no executable assertion can be authored.
- [ ] Use `ready-package-rule-profile.json` saturation data to define operator fixtures; require explicit coverage for state, structure/order, content, responsive context, token/paint, numeric formatting and interaction families before schema ratification.
- [ ] Require every `checkType=deterministic` rule to compile as `executable` or publish as `unsupported`; unknown selector, condition, assertion or remediation fields must fail closed instead of broadening a match.
- [ ] Prevent unsupported component rules from promoting an atomic customization diff to `violation`.
- [ ] Add schema fixtures for conditional variants, structure/count/order, token binding, paint state, layout/baseline, text/numeric formatting and unsupported-rule behavior.

## P0: Athena and Athena CLI executable package generation

- [ ] Re-audit the complete Athena CLI and Athena pipeline from raw Figma
  catalog to published component package. Document which fields are generated,
  copied, merged, validated and indexed; remove any implicit policy inference
  from display names, prose or rule-id substrings.
- [ ] Ratify a structural boundary between generated evidence and authored
  `manual` policy. Catalog rebuilds may replace generated anatomy and baseline
  data, but must preserve manual rules, predicate contours, composition
  contracts, execution routing, authority, presentation and explicit evidence
  gaps.
- [ ] Implement a deterministic manual-layer merge in Athena CLI and Athena.
  Fail the build on an orphaned manual rule, duplicate rule id, stale source
  anchor, unknown component identity, unsupported contour/operator or manual
  content loss; never silently drop or rewrite authored policy.
- [ ] Generate and validate `manual.executionPolicy` closure for every migrated
  package. Every source rule must be exactly one of `predicate`, `composition`,
  `delegated`, `policy` or `context-only`; deterministic rules without an
  executable route or explicit non-executable classification block
  publication.
- [ ] Generate a per-package coverage artifact containing source-rule totals,
  execution route, required facts, missing capabilities, authority revision and
  compiled RuleIR ids. Use the TitleView 42/42 closure as the reference fixture.
- [ ] Publish generated artifacts, preserved manual layer, compiled coverage,
  component indexes, manifests, capability versions and checksums atomically.
  A partial or stale package must not become visible to Apollo.
- [ ] Add regeneration fixtures proving that repeated Athena/Athena CLI runs are
  byte-stable for generated output and do not modify manual policy. Include
  source/generated/manual drift detection and a reviewable diff gate.
- [ ] Revisit existing raw-package enrichment so stable identities, desktop/
  mobile counterparts, effective baseline provenance, semantic anatomy,
  declared component properties and ownership boundaries are available before
  Apollo compilation. Missing evidence must be published explicitly as unknown,
  not synthesized from names.
- [ ] Preserve compatible package semantics across `design-system_ab`,
  `ds-ai-hub` and split repositories; source routing may differ, predicate
  meaning and capability versions may not.
- [ ] Introduce stable descendant identity for the `ds-ai-hub -> Athena ->
  Apollo` conversion pipeline. This is the canonical solution for renamed
  Figma layers; do not accumulate component-specific name aliases in runtime:
  - Athena must publish an authored `semanticRole` or generated
    `contractNodeKey` for every descendant that can be selected by an
    executable rule. The identifier must be independent of the visible Figma
    layer name, emoji/decorated prefixes and localization;
  - the generated release mapping binds that stable identity to the current
    Figma evidence (`componentKey`, owner/ancestry, relative node path and
    property reference). Display names remain diagnostics only;
  - Ready RuleIR selectors use component identity plus stable descendant
    identity and explicit ownership/ancestry. A literal layer name must never
    be the sole selector for an enforcing rule;
  - the converter rejects name-only deterministic rules or publishes the
    package as `unsupported`/Draft. Temporary rename aliases belong to a
    versioned generated migration map, not to authored rule predicates;
  - an active required selector resolving zero targets is an explicit coverage
    failure (`not_evaluable` during audit and a blocking error in release
    checks), never silent `not_applicable` or success;
  - preserve source traceability from human-readable `ds-ai-hub` guidance to
    the stable role, compiled RuleIR id and exact executable source revision;
  - add rename regressions using `PaymentMaskedNumber` and `TagGroup`: changing
    only the visible layer name must not change the verdict; removing the role
    mapping must fail compilation/publication rather than suppress a finding.

## P0: Contract v2 compiler and publication

- [ ] Promote the isolated Contract v2 experiment into one production compiler; generated output must consume the complete component package while keeping raw/generated anatomy as evidence rather than implicit policy.
- [ ] Compile `contract.generated.json`, structured `rules.json`, `composition-contract.json` and enforceable ownership from `contract.overrides.json` into one deterministic RuleIR artifact with source-rule traceability.
- [ ] Generate a per-package coverage report with `executable | unsupported | manual | llm` status and block publication when an executable rule is invalid, ambiguous or references an undeclared capability.
- [ ] Make Athena publish Contract v2 artifacts, schemas, coverage, capability versions and checksums atomically with `componentContractIndex.json` and the catalog manifest.
- [ ] Add CI gates for deterministic output, source-copy integrity, source/compiled drift, duplicate identities, unsupported-capability regressions and release-snapshot completeness.
- [ ] Preserve split-repository routing so `design-system_ab` and `desing-system_abm` can publish compatible Contract v2 packages without changing Apollo semantics.

## P0: Apollo Contract v2 runtime and parity

- [x] Add a default-off, non-persistent Contract v2 test-contour toggle and lazy-load only experimental packages required by the selected component keys.
- [x] Implement the first fail-closed generic selector/fact/operator evaluator driven only by trusted versioned capabilities; component packages provide data, never executable code.
- [x] Exclude legacy component-contract verdicts from customization output while the test contour is enabled; keep the default production path unchanged while the toggle is off.
- [x] Classify non-executable, unsupported and evidence-incomplete rules as diagnostic `unknown`; never promote them to violations or infer semantics from prose.
- [ ] Stop computing discarded schema-v1 customization decisions inside the v2 contour after parity instrumentation no longer needs them.
- [ ] Complete runtime support for the ratified selector/fact/operator vocabulary; each added capability requires pass/fail/unknown fixtures before activation.
- [ ] Extend the audit snapshot only with facts required by ratified contracts, including non-variant component properties, ancestry/order, token bindings, prototype reactions and explicit page/frame/viewport context.
- [ ] Emit every result through `CustomizationAssessment` as `expected | allowed | violation | unknown`, with evidence-complete messages and stale-safe remediation actions.
- [ ] Store machine-comparable Contract v2 versus schema-v1 verdict, evidence and remediation deltas without exposing discarded legacy findings in the test-contour UI.
- [ ] Require release fixtures and field reports to reach category, verdict, baseline-label and reset-action parity before enabling Contract v2 enforcement package by package.
- [ ] Separate Contract v2 runtime into explicit raw baseline, variant baseline, effective host baseline, user mutation and UI presentation/remediation stages. Every violation must retain typed source evidence and its baseline origin; relational operators must not replace paint/style bindings with display-only values, exact component assertions must override raw baseline defaults, and reset actions must restore the contract target rather than a visually equivalent RGBA or stale catalog value. Cover this boundary with real report fixtures for BodyCell padding, Amount token reset/alignment and nested PaintMe overrides.
- [x] Fix the `Benefits` aggregate parity regression: evaluate `GraphicPosition` independently from root sizing and nested `Title`, compare every visible direct `BenefitCard`, and report the exact outlier card when values differ. Acceptance fixture: `[Right, Left, Right, Right]` produces one `GraphicPosition` violation for the second card while the existing `FILL -> FIXED` and `Title Secondary -> Primary` findings remain unchanged in UI, full statistics and agent report.
- [ ] Reject unknown capability versions and incomplete required packages without falling back to component-specific or prose-derived behavior.

## P1: module boundaries

- [x] Split audit orchestration, Figma traversal and action handlers out of `src/code.ts`.
- [x] Move the UI/plugin message protocol into a Figma-independent router with exhaustive regression coverage.
- [x] Move `focus-node` page resolution and viewport navigation into a dedicated action module.
- [x] Move page Theme-mode mutation into a dedicated action and queue its audit rerun until the current audit is idle.
- [x] Move corporate-component replacement, variant resolution and compatible property restoration into a dedicated action module.
- [x] Move customization reset orchestration and mutations into dedicated action modules with stale-node regression coverage.
- [x] Move audit run/cancel/idle-wait lifecycle into an explicit state machine with parallel-start and cancellation coverage.
- [x] Move per-run traversal cache and service construction into an isolated `AuditTraversalContext`.
- [x] Move UI/stats view construction and full/agent report preparation into one result orchestration service.
- [x] Move depth-first tree walking, subtree pruning and cancellation checks into a Figma-independent traversal engine.
- [x] Move local-component source traversal, dependency classification, reconciliation and metrics out of `src/code.ts`.
- [x] Move primary component classification and nested-reference diff preparation out of `src/code.ts`.
- [x] Move category aggregation and the remaining Figma node visitor out of `src/code.ts`.
- [x] Split contract transport, index resolution and artifact compilation out of `runtimeContractRegistry.ts`.
- [x] Introduce one explicit lifecycle state machine for reference and contract caches.
- [x] Add release-fixture integration tests covering manifest, indexes and contract packages as one snapshot.

## P1: Contract v2 component migration

- [x] Load package `contract.generated.json` as the target Component API, validate all published packages and emit deterministic violations for unknown variant properties, invalid values and invalid allowed combinations through the standard assessment/report pipeline.
- [x] Move all executable composition rules to package-level `manual.contracts`, migrate ButtonsGroup, and remove the global `compositionContracts.json` bootstrap/runtime fallback.
- [x] Add a trusted composition contract engine with remote declarative config and a pure function registry instead of component-specific runtime branches. Schema v1 covers count, property domain, value position, member-to-host equality, first-member equality and subtree paint policies; additional operators remain explicit code changes.
- [x] Add the first evidence-safe relational predicates: ButtonsGroup member Size follows host Size and TitleStatus Type follows visible StatusPreset Type. Missing source evidence remains non-enforcing.
- [x] Migrate and regression-test the schema-v1-safe packages: ButtonsGroup, BackgroundPlate and TitleView.
- [ ] Complete the Contract v2 pilot wave for TitleView, BackgroundPlate, ButtonsGroup and AmountStyles after the P0 parity gate; preserve their existing Figma-visible behavior and agent-report evidence.
- [x] Select the first migration wave by computed capability coverage, not
  component popularity. `migration-wave-1.json` contains Ready packages with
  100% deterministic compilation and zero unsupported rules: Benefits,
  BackgroundPlate and ButtonStack. Core Amount, TagGroup and
  PaymentMaskedNumber are tracked separately as supporting packages. The wave
  remains default-off and `ready-for-shadow-parity`, not production-enforcing.
- [ ] Migrate Button, CardImage, FAQ and TableBulkActions only when their host-dependent selectors and evidence are represented exactly; advisory guidance must not become a hard violation.
- [ ] Publish a migration dashboard with package schema version, deterministic coverage, unsupported rules, last parity result and legacy dependency count.
- [ ] Forbid new component-name conditionals in Apollo runtime; a missing capability becomes an explicit engine task or leaves the rule `unsupported`.

## P1: reusable Core boundary contracts

- [ ] Publish Contract v2 packages for reusable Core component boundaries before encoding more host-specific nested-component heuristics. Prioritize `IconView`, `Button`, `Text`, `StatusPreset`/`Status`, then inventory the remaining Core components that expose Slot, instance-swap or nested component properties.
  - [x] Core `Button`: source-rule closure and field parity published.
  - [x] Core `IconView`: package, release compilation, synthetic
    PASS/FAIL/UNKNOWN and Figma field parity are complete as C23. The final
    field run preserved public paint permissions, detected root layout,
    internal Shape radius and Content opacity overrides with exact focus, and
    passed zero-duplicate/unclassified plus ten-run repeatability gates.
  - [ ] Core `Text`.
  - [ ] `StatusPreset`/`Status` boundary extraction from the proven host-baseline implementation.
- [ ] Require every Core boundary contract to describe stable component families and keys, semantic slot anatomy, public variant/component properties, effective baseline by selected variant, allowed instance replacements and ownership of nested visual/text/layout evidence.
- [ ] Let host contracts express contextual policy against nested semantic facts instead of Figma storage details. Example: `CorporateSystemMessage` owns the rule “`Graphic.icon` may be replaced only when `View=Base`”, while `IconView` owns how the icon slot and its `component.identity` are resolved.
- [ ] Keep native `directOverrides`/`componentProperties` interpretation as a fail-closed transitional fallback for a nested component without a contract. Once its Core contract is published and parity-proven, route evaluation through that contract and remove the corresponding heuristic path.
- [ ] Add cross-boundary parity fixtures. Minimum acceptance: TC-11 reports an icon replacement in `CorporateSystemMessage View=Error`, permits the same replacement in `View=Base`, invalid Button views are evaluated through the Button contract, parent-authored variant propagation remains clean, and every finding retains the nested contract, host rule and native override evidence without component-name runtime branches.

## P1: reference index performance

- [ ] Replace startup loading of every per-catalog component index with one versioned aggregate routing index per catalog manifest; keep individual indexes as publication/debug artifacts rather than mandatory runtime requests.
- [ ] Make Athena publish the aggregate index atomically with catalog indexes and the manifest, including component key, catalog path, source repository/base URL and release checksum coverage.
- [ ] Make Apollo load the main and nested aggregate indexes first, resolve selected component keys from them, and fetch only the required component catalogs; fail closed on duplicate keys or a release/checksum mismatch.
- [ ] Add release-snapshot and split-repository regression coverage for aggregate index routing, duplicate detection, cache invalidation and a temporary backward-compatible migration path.
- [ ] Acceptance baseline: reduce the observed index phase from 770 requests and 28.3 seconds within a 42.4-second audit to O(number of manifests) index requests, without increasing loaded component catalogs or changing audit categories.

## P2: maintenance

- [ ] Introduce a cross-repository knowledge-link contract for every
  authoritative rule: stable `ruleId` -> executable `rules.json` source ->
  human-readable instructions -> cookbook/recipe -> PASS/FAIL fixtures.
  Store links as typed references with repository, path, anchor, revision and
  checksum; validate reciprocal links and semantic drift in CI. Apollo must
  use the executable source for verdicts, while agents and documentation UIs
  may follow the same identity to explanations and examples. First acceptance
  package: `web-corp.title-view`, including the TitleStatus/Status rule whose
  current human-readable mirrors have already demonstrated drift from the
  executable contract.

- [ ] Generate runtime/publisher schema fixtures from the shared executable-rule definition and verify backward-compatible migrations.
- [ ] Add bundle-size and module-size budgets to CI.
- [ ] Remove schema-v1 composition compilation, compatibility fields and obsolete registries after all required packages publish Contract v2 and the migration dashboard reports zero legacy dependencies.
- [ ] Remove overlapping `patternRules.json`/package-rule runtime paths once every enforced rule has one canonical source and source-rule traceability.
- [ ] Archive experimental Contract v2 packages after their fixtures and compiler behavior are represented in production tests.

Existing schema-v1 integrity gates remain active during migration. Contract v2 is not production-enforcing
until authoring coverage, compiler publication and shadow-parity P0 gates are complete. Runtime rollout of
library-update parity remains gated by field verification in Figma; catalog rollout remains owned by
Athena's atomic publication process.

## Frozen history: Pattern and agent audit roadmap

Superseded by `PREDICATE_ENGINE_MVP.md`. Keep for migration evidence only; do
not start new runtime work from the unchecked items below.

### P0: evidence-complete pattern decisions

- [x] Preserve the explicit UI page type through audit runtime, reruns, full statistics, WIP statistics and the agent payload. Unknown or unselected values serialize as `null`; specialized page patterns must not infer a page type from the layout.
- [ ] Normalize rule-level authority for component rules: `status`, `ruleKind`, approval provenance and revision. Document-level readiness alone must not promote a rule.
  - [x] Athena schema, validator and safe component-rule migration revision 1.
  - [x] Apollo/proxy consumer gate: only active `design-rule` may confirm a verdict.
- [ ] Add a versioned structured applicability contract covering `scope`, `when`, `target` and required evidence. Prose must not be interpreted as an executable predicate.
  - [x] Pilot revision 1 for `rule:forms.construction-rules.title-medium-one-per-plate`: explicit page type/channel applicability, container scope, target component/variant, aggregate assertion and required evidence.
  - [ ] Migrate the remaining form rules only after their required facts and pass/fail/unknown semantics are specified.
- [ ] Send a compact pattern-audit structure with component hierarchy, semantic roles, document order, cardinality, viewport and relevant layout facts; do not send an unrestricted raw snapshot.
  - [x] Pilot component hierarchy and structured variant facts for the first form rule; hidden nodes are excluded and no screenshot/raw snapshot is sent.
  - [ ] Add semantic roles, true sibling/document order, viewport and relevant layout facts as independently versioned fields.
- [ ] Add the explicit `not_evaluable` result for missing required facts. Follow it with clarification when user context can resolve the gap, then human review if it cannot.
- [ ] Encode exceptions and conflict handling. A conflict between active sources must require design-system review until a source-precedence policy is ratified.

### P1: actionable and debuggable pattern findings

- [ ] Normalize remediation kinds and parameters: reset to baseline, bind variable, set variant, replace/remove component, move node, change page type, open source, human review or no action.
- [ ] Publish semantic roles, sibling order and cardinality as stable evidence fields for composition and screen patterns.
- [ ] Add stable source anchors per rule so Apollo can open the exact normative section instead of only the containing file.
- [ ] Return coverage for every requested pattern audit: evaluated, skipped, not evaluable and the exact reason.

### P2: governance and evaluation

- [ ] Promote reviewed examples and anti-examples into regression fixtures for each page type and platform.
- [ ] Record the effective-baseline revision and artifact checksums used by every audit.
- [ ] Add rule ownership and the escalation route used by `Нужна помощь дизайн-системы`.
- [ ] Maintain separate evaluation sets for form, landing, data-list, details, dashboard and overlay scenarios.

## Frozen history: Semantic Fact Model v1 roadmap

Superseded by canonical snapshot v2 plus the deterministic predicate coverage
ledger. Keep for migration evidence only.

Semantic Fact Model is the canonical evidence layer between Figma collection,
design-system knowledge and the agent decision. It must describe facts and their
provenance without silently turning measurements into verdicts. Existing
`generalAudit`, `architectureAudit` and legacy `resolution` fields remain
compatibility projections only until parity is proven.

### P0: contract and identity

- [ ] Ratify the v1 fact identity as `kind + subject.nodeId + factPath + target.nodeId + context`; preserve stable ids across equivalent reruns and do not collapse facts from different slots, owners or relation targets.
- [ ] Ratify the five fact kinds: `property_state`, `role_assignment`, `relation`, `text_content` and `interaction`.
- [ ] Keep rule authority, exceptions and agent decisions outside snapshot facts. A Figma fact may reference candidate rule ids but must not declare itself valid or invalid.
- [ ] Validate every emitted semantic model against the published JSON Schema and fail closed on duplicate identities, missing subjects, unsafe targets or unbounded collections.
- [ ] Introduce a coverage ledger for every in-scope atomic fact: `evaluated_violation`, `evaluated_allowed`, `human_review`, `not_applicable`, `missing_rule` or `not_evaluable`, with exactly one terminal classification per fact.

### P0: source parity and normalized rules

- [ ] Normalize `design-system_ab` and `ds-ai-hub` documents into one rule envelope: `ruleId`, `ruleKind`, `effect`, `scope`, `applicability`, `conditions`, `assertion`, `severity`, `authority` and `source`.
- [ ] Preserve one canonical rule identity across repositories. A mirrored `ds-ai-hub` rule must carry the exact canonical component/pattern `ruleId` or an explicit checked alias mapping; document similarity and rewritten ids must not authorize a verdict.
- [ ] Publish rule-level authority in `ds-ai-hub` (`status`, `provenance`, integer `revision`) and normalize verified documents into `semanticModel.rules`. Document-level `status: verified` alone must not promote all contained guidance.
- [ ] Require an exact Figma key mapping before component evidence can become authoritative. A report-name alias may discover candidate documents for review, but it must not confirm component identity or an error.
- [ ] Add a dual-source parity evaluation for the same Apollo report. Compare fact identities, semantic roles and relations, rule coverage, authority, final statuses, prompt size and latency.
- [ ] Record source revisions, effective-baseline revision and checksums in every resolved packet and final audit trace.
- [ ] Treat conflicting equally authoritative rules as `human_review`; do not encode an implicit repository precedence before governance is ratified.

### P1: relation and interaction coverage

- [ ] Extend `relation` beyond measured sibling gaps with typed containment, alignment, width, order, ownership and visibility/state relations. Proxy may derive and measure structure but must not supply the normative expectation or verdict.
- [ ] Emit `interaction` facts from Figma prototype/reaction evidence: trigger, action, source state, destination or target, transition and missing-target quality. Unknown interaction evidence remains `not_evaluable`.
- [ ] Preserve derivation provenance for semantic roles and relations: exact Figma evidence, derived signals, source node ids and confidence.
- [ ] Add fixtures for component slots, form sections, page columns, overlays, repeated groups, responsive variants and hidden-node exclusion.

### P1: agent cutover

- [ ] Make `semanticModel` the sole fact input for component, pattern and text agent audits after parity gates pass.
- [ ] Remove duplicate `generalAudit`, `architectureAudit` and compatible `resolution` projections from the agent packet without moving verdict logic into proxy.
- [ ] Require every finding and allowed assessment to reference one canonical semantic fact id and one verified normative rule or an explicit review reason.
- [ ] Add prompt and transport budgets for fact count, rule count, semantic-model size and total request size.

### P2: evaluation and observability

- [ ] Maintain sanitized golden cases for baseline, relative fact, token binding, slot, exception, composition, text, page relation, interaction and authority.
- [ ] Publish per-run semantic diagnostics for local debugging: fact counts by kind, rule counts by authority, classification coverage, unused rules, missing-rule facts and source parity deltas.
- [ ] Track precision, recall, human-review rate, duplicate rate, missing-classification rate, prompt size and end-to-end latency separately for components, patterns and texts.


### DCHK-UI-02 — Оболочка v3 в рабочем v4 UI · 06.10.2026

- [x] После immutable isolated/repair handoff General передал sole-writer UI integration.
  TopSection/settings/page type, 13 категорий и launcher/chat подключены к built v4.
  Session-only general/page preferences; только source сохраняется в namespaced
  UI protocol. Main diff ограничен storage и bounded 400/800 ×860 resize.
- [x] Прежние audit/focus/export/coverage/pinned explain и Generation/native controls
  сохранены; source/context/stale guards, null-context `/analyze`, opaque sessions,
  source/knowledgeRelease provenance и явная client-only cancellation проверены.
  Неподключённые evaluators/counts/settings не считаются успешными.
- [x] Required root/generation validate/build и built browser 800/440/360 выполнены;
  actual `/analyze` HTTP route использует только owned synthetic provider/executable.
  Все 109 прежних build paths сохранены, добавлено 53 UI/CSS/React inputs, включая resolver/config metadata.
- [ ] General independent review полного нового inventory/delta; real agent и
  пользовательский Figma reload. Нормы/source/registry/lock/C0/producer snapshots
  не переписывались; Draft/9 gaps/SOURCE_COMPILE и фактические freshness mismatches
  сохраняются. V0/receipt/rebind/Ready/live/release отдельно. Полный Proxy gate:
  прежняя crosswalk ошибка, 445/446; React Doctor score недоступен из-за npm DNS.

См. [control/message/capability map](../docs/DESIGN_CHECK_UI_MIGRATION.md).
Версии прежние: Editor 0.2.91, core 0.1.10, v4 0.4.0, Generation 0.1.1.


#### DCHK-UI-02: repair пользовательского чата · 06.10.2026

- [x] Прямое исправление владельца: opaque ID без обязательного
  `crypto.randomUUID`; общий helper для session/UI correlation, fallback при
  недоступном Web Crypto. Proxy → агент → цель в одну строку, высота 40px,
  горизонтальная прокрутка параметров на узкой ширине и доступный Close.
- [ ] Independent review нового repair inventory и пользовательский Figma reload/
  real agent. Исторический integration handoff и producer snapshots сохранены;
  runtime V0/receipt/rebind/repin/Ready/live/release не повышаются.
- [x] Новые local gates: root 81, core 76, v4 354, Generation 179; built browser
  108 checks на 800/440/360 при отсутствующем randomUUID, preview 37. Actual C0
  reader остаётся Draft/stale/unverified, accepted=false/executionAllowed=false.

#### DCHK-UI-02: Markdown, unread и читаемые resource names · 06.10.2026

- [x] Новое прямое задание владельца после полученного ответа: v3 Markdown,
  красный unread badge, фоновый свободный диалог при смене выделения/аудите.
  Closed/open/source/cancel/stale lifecycle проверяется отдельно.
- [x] Read-only display metadata по token/style identity и стабильным v3 keys.
  Имена/коллекции/HEX/проценты показаны в comparison; exact IDs/FLOAT/JSON
  доступны в disclosure. Sidecar вне snapshot/hash/evaluation/export;
  final capture guards проверяют изменения после async metadata lookup.
- [ ] General review нового полного source/build inventory и ручной reload
  текущего UI в Figma. Предыдущая basis историческая; V0/producer rebind/repin/
  Ready/release не выполняются этим этапом.

#### DCHK-UI-04: левая панель навигации · 06.10.2026

- [x] Прямое поручение владельца после выбора концепции: узкая вертикальная
  панель с входами Проверка/Генерация/Чат/Настройки. General передал UI/build
  после review shared core 0.1.11 / Editor 0.2.92 / Apollo profile 0.4.1.
- [x] Панель 56 px, default Проверка и отдельный экран Генерация. Сохранены
  audit/category/subview/page type, generation DOM/ScreenSpec/target/disclosure,
  chat draft/history/pending/unread/Markdown и прежние capability gates.
  Настройки v3 переиспользованы через portal; keyboard/Escape/focus доступны.
- [x] Root 81, core 115, v4 376, Generation 179 и required builds PASS.
  Built UI: прежние audit/generation/native/static-review suites, chat165 и
  navigation88 на 800/440/360 PASS; только owned synthetic data/providers.
  React Doctor score недоступен: npm registry ENOTFOUND.
- [ ] General review нового source/build/tool inventory и пользовательский
  reload Figma. Main handlers/core/Editor/Proxy/DS authority не меняются;
  producer/V0/repin/Ready/live/release сохраняют прежние отдельные gates.

#### DCHK-UI-05: чат в теле страницы · 06.10.2026

- [x] Прямое поручение владельца: чат открывается в основной области страницы.
  Панель Проверка/Генерация/Чат/Настройки доступна во время разговора; выбранный
  экран отмечен. Модальная подложка, inert, aria-modal и focus trap убраны.
- [x] Переключение экрана сохраняет историю, черновик, источник и pending reply.
  Фоновый ответ включает unread badge; открытие чата снимает бейдж. Escape
  возвращает предыдущий рабочий экран; Escape в настройках закрывает их отдельно.
  Markdown и строка Proxy → агент → цель высотой 40 px сохранены.
- [x] Root 81, core 115, v4 377, Generation 179 и required builds PASS.
  Built UI: прежние audit/generation/native/static-review suites, chat165 и
  navigation106 на 800/440/360 PASS; preview37 PASS. Только owned synthetic
  data/providers. React Doctor score недоступен: npm registry ENOTFOUND.
- [ ] General review нового отдельного source/build/tool inventory и Figma reload.
  Исторический UI04 handoff сохранён. Main handlers/core/Editor/Proxy, нормативные
  данные, producer/V0/repin/Ready/live/release не меняются этим UI этапом.


## CC-COMPAT-DEPENDENCY-USAGE-01 — parent usage rules на fixed child (12.10.2026)

**20.10.2026 — перенос в общий Core 0.1.21 / Editor 0.2.107.**
Общая реализация компилирует и материализует opt-in `editorDependencyUsages`
version1 с прежними prefix/producer0.2.104. Editor использует re-exports;
32 символа и одна строка остаются нормами manual BenefitCard, не глобального Link.
Exact dependency pins, child TEXT identity, root TEXT control и независимый
baseline проверяются прежним способом. Missing/foreign/stale/неполные факты
остаются UNKNOWN; producer/baseProducer и неизвестные метрики fail closed.

Consumer impact: Apollo source compilation теперь может воспроизвести весь
сохранённый usage projection. Source/cache/stamp guards не обходятся. Отдельный
существующий gate `authoring-preview requires ready dependencies` сохраняется:
Link6/IconView9/BackgroundPlate6 остаются Draft. Подключение BenefitCard к
checking требует самостоятельного решения этого admission gate и последующей
приёмки данных; перенос сам по себе не делает компонент Ready.

Private evidence:22 generic tests, exact compiled caches всех11 current data
contracts и10 retained native captures/3222 evaluations совпали. Это offline
reuse, не fresh native PASS. Shared configured validate и независимая приёмка
ожидаются в согласованном sole-writer окне General.
Evidence: `.local/apollo-contract-creation-2026-10-20/shared-dependency-usage/`.
Парная запись: `CC-COMPAT-DEPENDENCY-USAGE-01` в соседнем бэклоге Editor/Apollo.


**Исторический план r6 (до локальной реализации Editor ниже).** BenefitCard r6 candidate закрепляет Link r5
через exact pin/closure. Parent reference BottomContent=SwapMe не содержит
Link/Label; current core проверяет child отдельно и не переносит доказанную
child target identity в parent constraints. Нужна explicit opt-in привязка
`dependencyId + bindingId + childTargetId` для parent-owned правил: только текст,
≤32 символа, ≤1 строки. Не переносить эти лимиты в глобальный Link.

Использовать fixed-nested resolver, validated independent child capture/nodeMap
и child target ledger; сравнение запрета настроек — с pristine BottomContent.Link,
без принятия actual overrides. Missing/foreign/stale/ambiguous proof, отсутствующий
closure или line evidence → UNKNOWN; Bottom=false → notApplicable. Child Draft
authority не повышается parent preview. Нужны D/M positive/negative/RESET, hidden,
unknown и 37 прежних IR regressions. Exact pins и план: [BenefitCard r6](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/authoring/candidates/link-r5-integration-r6-2026-10-12/READER_FIX_PLAN.ru.md).

Парная запись Editor/Apollo. Общие core/compiler/runtime/build/config не менять
до sole-writer окна General по docs/APOLLO_SYNC_WORKFLOW.md. Generation pilot
не расширяется; native r6 и Ready не приняты.


**Уточнение владельца / Editor 0.2.104, 12.10.2026:** локальная реализация Editor
готова; перенос reader в Apollo **HELD_UNTIL_CONTRACT_ACCEPTANCE**. Shared core
остаётся 0.1.17. Подтверждено отсутствие Editor в 347 наблюдаемых физических входах
consumer/descriptor пилота; общий source/build/config и canvas не записывались.

Manual и compiled содержат явный Editor-only `editorDependencyUsages.version=1`
с exact dependency/binding/child TEXT target/host TEXT port. Derived факты root:
`editorDependencyUsageV1.<id>.nonTextChanged`, `characterCount`, `lineCount`.
Parent source limits не переносятся в глобальный Link. Конфигурация, layout, стили
и устройство сверяются с независимым BottomContent.Link; bounds/позиции, меняющиеся
при text reflow, остаются в собственных geometry нормах child. Child Draft authority
не повышается. Missing/foreign/stale proof остаётся UNKNOWN, hidden Bottom —
notApplicable. Projection пересчитывается после каждого capture, cached факты
не заменяют proof. Producer 0.2.104 opt-in отклоняется прежним общим reader.

Проверки Editor: typecheck, 852 regressions PASS (включая 23 целевых); ZIP/reopen,
37 прежних IR и 57 retained captures с новым synthetic scenario PASS. Native r7
D/M ещё NOT_RUN_USER_ONLY; полный контракт Draft. Изолированный пакет:
[BenefitCard r7](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard.r7.editor-candidate.component-contract.zip);
[final evidence](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/reading-fixes/editor-parent-usage-2026-10-12/HANDOFF.json).

Для v4: после приёмки native positive/violation/RESET принять совместимый producer
и explicit projection в общем reader в sole-writer окне General, проверить точные
pins/closure, historical replay, report/export semantics, UNKNOWN и child authority;
собрать и принять свежий consumer отдельной передачей. Тесты Editor не закрывают
Apollo consumer verification. Generation pilot scope не расширяется.


**Native r7 readback, 13.10.2026:** оба пользовательских baseline D/M от
12.10 (21:20:33Z / 21:21:00Z) дают UNKNOWN по трём parent Link usage нормам.
Validated child capture/nodeMap проходит; declared target.label остаётся
`reference-pin-stale`. API независимого эталона Link r5 содержит 10 полей и
4 Size, опубликованный вложенный Link — 8 полей и 3 Size; отсутствуют точные
`Left icon 20#145985:35` и `Right icon 20#145985:40`. Причина различия источников
пока не установлена; нормативный источник зависимости согласуется с владельцем.
Guard не ослаблен, Editor/shared core/v4 не менялись. Карточка и Link остаются
Draft; v4 перенос HELD. Отдельно в обоих сценариях отсутствует CardPlacement.
[Receipt](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/live-review-r7-2026-10-12T21-20-33Z/review.json)
содержит точные pins и byte-equivalent engine replay обоих исходных отчётов.


**Source choice и черновик библиотеки, 13.10.2026:** владелец выбрал точный Link r5: 4 Size и порты20px. В исходной Corp Promo библиотеке обновлены только Link instances17:12838/17:12843 внутри D/M BottomContent; восемь прежних typed настроек, layout и Label typography сохранены. Native readback подтверждает10 полей/4 Size. Независимый pristine reference в Workshop совпал с configurationReferenceHash r5 `03e123c8e49794fafbd515175a102a28409297f46bd948087909ab7a111ce444`. Публикация не выполнялась; fresh parent native D/M baseline/negative/RESET ещё NOT_RUN_USER_ONLY. Сравнение этого pin в другом file context расходится по локальным ID неактивных INSTANCE_SWAP портов; переносимость в другие файлы не принята, guard не обходится. Editor0.2.104/core0.1.17 и ZIP r7/r5 неизменны; v4 HELD_UNTIL_CONTRACT_ACCEPTANCE. Evidence: `shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/source-upgrade-r5-2026-10-13/HANDOFF.json`.

## APV4-GENERATION-CONTEXT-001 — bounded execution context and physical result checks

15.10.2026: confirmed native run reached step5 with912495 characters against900000. General implementation scopes unused sibling profiles from the model view, shares exact duplicate checks and keeps PNG bytes in original evidence; full6manuals/112rules, native policy, all failure/unknown statuses and the CLI bound remain. Separate confirmed defects: Type=$ retained a stale static RUB text override, and a136px stack clipped144px content. Generic variant effects now follow the selected published main without resetting typography or exposing raw text writes; independent static-text and child-bounds checks reject both defects. Synthetic regression and read-only historical receipt replay are required; actual installed native generation remains pending until the owner new run. Token accounting, provider usage display and incremental context loading/batching remain follow-up work; character count is not labelled as tokens. No contract/manual/RuleIR/ZIP/registry/version admission change.

## BenefitCard r10: фронтовый маппинг

18.10.2026. Решение владельца: сейчас готовить Figma-маппинг; фронтовые блокеры
сохранить в бэклоге. Статус всех пунктов ниже — **OPEN / IMPLEMENTATION_NOT_STARTED**.
Это детализация APV4-012, без запуска фронтовой реализации и изменения границ
текущего пилота. Нормативный вход — BenefitCard r10, зависимости Link r5 /
IconView r8 / BackgroundPlate r6. Source API arui-private 80.7.1, commit
`c037d0c322ea9774a9c251400d76d41222819b87`: десять файлов BenefitCard совпали
с ранее принятым source evidence. Готовность API, текущая distribution,
нормативное соответствие и browser/live acceptance учитываются раздельно.
[Анализ и точные входы](../../../shared/design-system_ab/experiments/current-contract-packages/BenefitCard/reports/mapping-readiness-r10-2026-10-18.json).

### BC-FRONTEND-COMPACT-TITLE — Title при Compact

- [ ] Владелец исправления: сопровождающий BenefitCard в arui-private; соответствие
  проверяет Mapping.
- Подтверждённый конфликт: desktop wrapper после `...props` принудительно задаёт
  `titleView='primary'`. Переданный `titleView` не действует. Контракт требует
  Secondary при Compact=True и допускает Primary/Secondary при Compact=False.
- Evidence: [desktop wrapper](../../../arui-private/src/benefit-card/benefit-card-desktop.tsx:8),
  [mobile wrapper](../../../arui-private/src/benefit-card/benefit-card-mobile.tsx:8);
  RuleID `component:web.benefit-card.compact-uses-secondary-title.compact-true`.
- Закрытие: публичные D/M exports соблюдают Compact/Title норму и подтверждённые
  разрешённые настройки без обращения к внутреннему BenefitCardBase. Проверены
  Compact on/off, выбранный Title, производная типографика Subtitle и прежние
  platform defaults в точной новой source/distribution паре. Маппинг не скрывает
  конфликт принудительной подстановкой prop, который wrapper перезаписывает.

### BC-FRONTEND-LINK-SIZE-BRIDGE — размер Link через типографику

- [ ] Владелец: Mapping, с подтверждением библиотечного typography/token API.
- У фактически разрешённого Core Link есть `view`, `underline`, `leftAddons`,
  `rightAddons`; `size` отсутствует, CSS использует `font: inherit`.
  BenefitCard передаёт `bottomSlot.props` в Link. Нельзя выдумывать `props.size`.
- RuleID mobile-web: `component:web.benefit-card-bottom-link-size-14-20` —
  `S (14-20)` и `S (14-20) (Size-20 icons)`; desktop:
  `component:web.benefit-card-bottom-link-size-16-24` — `M (16-24)`.
  Исправление владельца от 19.10.2026, r11; остальные настройки регулирует Link r5.
- Закрытие: оба mobile-web варианта S и desktop вариант M имеют доказанное
  соответствие библиотечной типографике и размеру иконок; остальные размеры
  отклоняются для соответствующей платформы. Текст <=32 символов
  и <=1 строки проверяется отдельно в DOM при согласованной ширине. Разрешённые
  Link-настройки сохраняются, raw font/RGB не подменяют токены.

### BC-FRONTEND-ICONVIEW-CODE-REPRESENTATION — IconView и SuperEllipse

- [ ] Владелец: Mapping совместно с автором контракта для декларации code representation.
- IconView r8 объявляет только Figma representation. В BenefitCard
  [renderGraphic](../../../arui-private/src/benefit-card/benefit-card-base/utils/render-graphic.tsx:24)
  используется Core SuperEllipse с platform-controlled `size/mainSize`.
  Одинаковый смысл названия не доказывает соответствие всех настроек.
- Закрытие: сопоставлены exact public export, props/domain/transforms, разрешённые
  настройки и assets; явно указаны неподдержанные нормы. Child pin r8 и размеры
  владельца сохраняются. Широкая возможность передать ReactNode не трактуется
  как разрешение произвольной подмены Graphic. Code evidence и нормативная
  приёмка фиксируются отдельно; ложный parity PASS запрещён.

### BC-FRONTEND-SELECTED-DISTRIBUTION — BenefitCard в тестовой сборке

- [ ] Владелец: Mapping / frontend toolchain writer.
- В текущем выбранном selective package
  `backgroundplate-mapping299/frontend-toolchain` импорт
  `arui-private/benefit-card` не разрешается: отсутствует
  `cjs/benefit-card/index.js`. Исходный public export и прежний source API review
  существуют; они не доказывают доступность в текущей подключённой distribution.
- Закрытие: подготовлен новый изолированный минимальный пакет BenefitCard с
  необходимыми JS/d.ts/CSS и зависимостями. Подтверждены source/distribution pins,
  public D/M imports, strict type probes и целевые browser состояния. Текущий
  pilot toolchain/config не заменяется побочным эффектом. Прежние проверки
  неизменных файлов переиспользуются с точными pins.

Figma-маппинг может готовиться независимо. Эти пункты не повышают Draft до Ready;
восемь финальных Editor отчётов и открытые дочерние диагностические gates
остаются отдельной приёмкой. Запрет push arui-private сохраняется.


## APOLLO-MAIN-REPOSITORY-001 — перенос основного consumer

20.10.2026: Apollo0.4.1 перенесён в корень основного репозитория с publication ID1616850453760090547. Core0.1.21 и Editor0.2.107 сохраняют семантику; изменены только пути import Core у Editor. Совместимость source/hash, явные facts и Ready gates сохраняются. Проверки Apollo/Proxy/Editor фиксируются в final migration handoff; новый native прогон и публикация не выполняются. Парная запись — ComponentContractEditor/docs/BACKLOG.ru.md.
