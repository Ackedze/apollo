Проверка области не экспортирует PNG: независимые эталоны и проверки актуальности сохраняются. В сохранённом JSON поле `timings` содержит миллисекунды этапов и захвата отдельных scope. Это диагностика main runtime до отправки результата; передача сообщения и рендер UI не измеряются. У частичной перепроверки scope отмечен `scoped-contract-audit-before-merge`; её замеры не описывают всю область и последующее слияние. Editor и другие вызовы capture по умолчанию продолжают получать preview.

# Apollo · Contract pilot

Сравнение происхождения узлов использует локальные индексы дерева и source ports;
source collector нормализует независимый pristine source один раз за свой вызов.
Pin дочернего контракта проверяется один раз на зависимость, каждый binding и
child capture остаётся отдельной проверкой. Native факты и freshness читаются
как прежде; индексы не сохраняются между вызовами или запусками проверки.

Поиск вложенных native экземпляров использует внутреннюю identity projection:
структура, SLOT frontier, main/source correspondence и актуальность сохраняются;
повторный сбор оформления для самого поиска не выполняется. Полные нормативные
снимки и freshness reads сохраняют все факты. Ускорение подтверждается отдельным
повторным замером Figma, а не числом синтетических API reads.

Общий SHA-256 оптимизирован без изменения UTF-8, canonical serialization и
идентификаторов. Точная совместимость проверяется replay; фактическое ускорение
в Figma оценивается по `timings` нового прогона, отдельно от offline benchmark.

В окне «Данные Apollo» действие «Обновить список» повторно получает метаданные от Proxy. Таблица сохраняется при загрузке и ошибке, а результат сообщает, изменился ли список. Статус «Данные устарели» означает несовпадение установленного подключения с текущими входами: оператор завершает обновление source/build и нового consumer/config, затем перезапускает Proxy. Перечитывание списка не устанавливает новые контракты и не перепривязывает старые seals. Перед передачей source/build обновления оператор закрывает consumer/runtime и проверяет оба адаптера и фактический endpoint данных; промежуточный HOLD не считается работающим подключением.

IconView r8 подключается к Figma generation через общий typed mapping: 11 библиотечных размеров, корневые BOOLEAN/TEXT/VARIANT свойства и проверка фактического readback. Доступность свойства проверяется для выбранного native-варианта: отсутствующие текст, аддоны или индикатор не могут считаться применёнными.

Локальный пакет проверки может явно включить `evaluationMode: "authoring-preview"` для Draft-контракта. Общий core исполняет его predicates в этом режиме; исходные manual, статусы, checksums и compiled projection сохраняются. Обычный режим продолжает требовать Ready. Draft-preview отмечается `Ready=false`; непокрытые context-правила и отсутствующие native-факты сохраняют UNKNOWN. Корень Draft может использовать закреплённые Ready-зависимости; Draft-зависимости требуют отдельной поддержки preview closure.

Локальная база 09.10.2026: Editor **0.2.94**, core **0.1.13**. Новый native card facts profile и открытые consumer/live gates описаны в CC-COMPAT-NATIVE-CARD-FACTS-03; общий runtime проверен, публикация и полная приёмка BenefitCard r4 остаются открыты.
Отдельный плагин в существующем `Ackedze/apollo-v3`: собственные manifest,
сборка и панель в `.`. Общий core Editor/Apollo находится в
`packages/component-contract-core`. Новый Git-репозиторий не создаётся;
изменения локального Codex gateway находятся в `Ackedze/apollo-proxy`.

Реализован локальный пилот CorporateContent r11, Spinner r8, Button r31, Amount r5 и AmountStyles r10 с закреплёнными зависимостями. Основной вход — главный `contract.manual.json` со схемой `apollo.component-contract.manual.v2-experimental` и его read-only факты. Общий compiler Editor получает исполнимую проекцию внутри Apollo. Отдельный compiled JSON через панель больше не загружается. Доступны загрузка авторского пакета,
обход любой выбранной области и нескольких корней, захват каждого instance с независимым library reference, исполнение
контракта, переход к узлу по evaluation ID, сохранение JSON и отдельное
объяснение Codex через ApolloProxyControl.

В верхней панели находятся «Дизайн», «Тексты», «Генерация», «Спросить» и настройки.
По умолчанию открыт «Дизайн». Обзор группирует результаты по компонентам,
стилям и токенам, темизации и паттернам. Внутри группы категории и их счётчики
находятся в верхней закреплённой строке. Тип страницы и проверка доступны
в нижней плавающей области. Проверка текстов и паттернов остаётся отдельным
неподключённым направлением; отсутствие проверки не считается отсутствием нарушений.

Карточка нарушения показывает причину, значения и объект. Если библиотека
подтверждена контрактом, рядом с объектом показано её название. Клик на карточку
или название объекта фокусирует его в макете; кнопки исправления и сведений
работают отдельно. Устаревшие результаты сохраняют сведения, но не разрешают
переходы и исправления. Выделение текста в карточке не меняет фокус макета.

Переключение разделов сохраняет отчёт, категорию, ScreenSpec, выбранную цель,
историю и черновик чата. Чат занимает основную область страницы; ожидающий запрос
продолжается после ухода в другой раздел. Красный бейдж на входе «Спросить»
сообщает о непрочитанном ответе. Escape возвращает предыдущий рабочий экран.
Панель сохраняет существующие gates проверки и исполнения.

Вкладка «Генерация» — диалог с Apollo: компактное поле отправляет описание и
последующие уточнения; Enter отправляет сообщение, Shift+Enter добавляет строку.
Вопросы, ошибки, действие «Создать экран» и результат агентской сборки находятся
в области диалога. Кнопка рядом с полем открывает параметры платформы, размеров и
среды сборки, новый диалог и экспорт. JSON-импорт, ручной review/preflight и
диагностика выделения доступны в закрытом разделе «Служебные инструменты».
По умолчанию выбрано «Figma · новый макет»: создание экрана через MCP или
встроенный исполнитель. «Figma · чтение лаборатории» остаётся отдельным
диагностическим режимом без создания макета. Прежние guards версий и gates
исполнения сохранены. Кнопка выбора среды сборки показывает текущий выбор.
История, черновик и параметры экрана
сохраняются прежним механизмом. UI проверяется в размере плагина 800 × 860.


## Структура текущего runtime

- `src/design-check/` — интерфейс и протокол проверки; `code.ts` связывает их с Figma.
- `src/generation/agent/{figma,mcp}/` — агентские транспорты; соседние модули — UI, протокол и хранение.
- `src/generation/{figma,native,frontend}/` — адаптеры и native операции.
- `src/generation/{context,prompt,session,chat,proxy,static}/` — управление контекстом, запросами, сессией и отображением.
- `scripts/contract-catalog.cjs` — единое чтение текущих ZIP по `manifest.json`; подпапки компонентов поддерживаются, history не выбирается.

Рабочие ZIP находятся в `shared/design-system_ab/experiments/current-contract-packages/<Component>/`, mobile web — в `<Component>/mobile-web/`. Runtime proxy хранит установленный снимок отдельно. Перенос путей не меняет нормы, версии контрактов или Draft/Ready. Старые записи ниже описывают историю этапов; текущие paths берутся из manifest.

## Запуск

Совместимость с изменениями Editor 0.2.71–0.2.73, будущий процесс учёта и
подключение принятого mobile CorporateContent отслеживаются в
[каноническом бэклоге](../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-совместимость-с-componentcontract-editor).
Общий capture core обновлён; текущий release по-прежнему содержит пять пакетов.

Локальное исправление PARITY-014 на текущей базе core **0.1.9** / Editor
**0.2.90** ограничивает сравнение host modes/catalog коллекциями, подтверждёнными
наблюдаемыми bindings окружения, включая selected-mode alias chains. Fresh capture отмечен
`hostContextVariableModesVersion=1`; raw modes/catalog и reference сохраняются.
Смена варианта больше не блокируется из-за исчезновения неиспользуемой metadata.
Изменение используемых modes/bindings и недоступное evidence сохраняют gap;
старые отчёты воспроизводят прежний результат. Gates: core **68/68**, Editor
**819/819**, Apollo **144/144**. Fresh Figma и release/Proxy acceptance открыты;
версии приложений и опубликованный release этим локальным исправлением не менялись.

Core **0.1.9** / Editor **0.2.90**: локальный consumer поддерживает
`instanceMainComponentAliasesVersion=1`. Исходная иконка после reset проходит
при различных local main IDs только с доказанной canonical key/set/source
identity на независимых сторонах. Missing/ambiguous proof остаётся incomplete;
подмена иконки по-прежнему нарушает identity lock. Parent profile наследуется
в exact pinned child checks без изменения pins. Recompile source с active lock
требует producer 0.2.90; historical compiled replay остаётся прежним.
Local validate **136/136** и in-memory parity на original/reset и negative swap
пройдены. Версия пилота/release прежние; fresh Figma и published acceptance —
[APOLLO-V4-PARITY-018](../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-018--локальные-main-id-после-восстановления-иконки).

Core **0.1.8** / Editor **0.2.88**: локальный consumer читает exact icon lock
`dependencyDomain.field=changed`, фиксированный boolean false и помеченные
bindings при `assetIdentityLockVersion=1`. Несовпадение с независимым библиотечным
портом текущего host variant даёт violation; missing evidence — incomplete.
Неподдержанная версия и отсутствующий/повреждённый marker отклоняются явно.
Reexported synthetic source проверяется тем же engine, что Editor; source r52
и child pins не меняются. Pilot plugin version/release не повышены: fresh Figma
и published consumer/Proxy acceptance отслеживаются в APOLLO-V4-PARITY-017.

Editor **0.2.82** заменяет ручной ввод finite Component Property values выбором
из matching API, с multiselect и точным JSON type/регистром. Формат контракта,
core **0.1.5** и producer minimum **0.2.80** прежние. Apollo validate **108/108**
подтверждает VARIANT/BOOLEAN/case-sensitive execution и incomplete при неверном
типе; live authoring и release/Proxy acceptance отмечены в APOLLO-V4-PARITY-012.

Core 0.1.5 / Editor 0.2.80: local consumer выполняет collections с разными Figma
provenance/local graph IDs и обе доказанные aliases одного root. Compatibility
profile принимает `rootTargetAliasesVersion=1` только вместе с occurrence version 1;
неподдержанный или не объявленный alias формат отклоняется явно. Derived packages
требуют producer 0.2.80; исходные manual и child pins сохраняются. Нерелевантная
mode catalog inventory не блокирует direct child, а actual modes, required
metadata, bindings/styles и stale/identity guards проверяются строго.
v4 validate: 107/107, включая shared parity, точный focus View violation, reset
и negative evidence. Published release/Proxy и fresh live D/M остаются в PARITY-011;
версия плагина и pilot release не менялись.

Core 0.1.4 / Editor 0.2.79: source compiler принимает memberCollection на явном
root alias, например `buttons-group`, включая host anchor dependencyDomain;
nested/unknown/conflicting anchors
отклоняются. Schema/runtime flags прежние, independent source/identity proof
сохранён. v4 validate: 104/104, включая source compile → membership/reset и
rejection неверного anchor. Release/Proxy/live acceptance остаётся в PARITY-010.

Core 0.1.3 / Editor 0.2.77: локальная сборка читает direct-child bindings и
typed member collections. Compatibility profile проверяет новые optional
runtime versions, representations, typed values и source-rule linkage; shared
compiler/capture/runtime дают те же evaluation/focus/coverage, что Editor.
Hidden membership отделён от child execution; известные findings сохраняются
рядом с missing evidence. Показаны фактические count/property/position причины.
v4 validate: 103/103. Новый ButtonsGroup manual, published pins и Proxy runtime
этим изменением не выпущены; acceptance остаётся в PARITY-006/007/008/010.

Core 0.1.1 / Editor 0.2.75 добавляет отдельные occurrence addresses и
per-variant `variantHints`. Новый compiled пакет объявляет
`runtimePolicy.occurrenceAddressVersion=1`; compatibility profile принимает эту
версию и отклоняет unknown version или повреждённые bindings. Local capture и
normalized catalog IDs не доказывают correspondence. Shared core regressions
и v4 consumer tests пройдены; release/Proxy и live ButtonsGroup остаются в
APOLLO-V4-PARITY-007. Остальные этапы группы ещё не реализованы.

Используются Node.js 22 и зависимости корневого Apollo:

```sh
npm ci
npm run core:validate
npm run v4:validate
npm run v4:replay:spinner
npm run v4:replay:button
npm run v4:release:pilot
npm run v4:verify:authoring
```

Импортируйте `manifest.json` через Figma → Plugins → Development
→ Import plugin from manifest. Выделите фрейм, секцию, группу, instance или несколько слоёв,
затем нажмите «Проверить выделение». Контракты автоматически запрашиваются
у ApolloProxyControl по componentKey/componentSetKey. Ручной выбор пакета не нужен.
После импорта файлов кнопка «Использовать прокси» возвращает автоматический режим.

«Из файлов / ZIP» принимает authoring ZIP Editor, source-package JSON или один manual вместе с JSON-фактами. Для зависимостей добавьте отдельные authoring ZIP с их manual; одного embedded compiled child недостаточно. Голый manual без анатомии отклоняется с объяснением, какие файлы нужны. Факты не становятся дополнительными нормами.

После пересборки уже импортированный плагин достаточно закрыть и запустить
снова через Plugins → Development → Apollo · Contract pilot. Исправлен
приём сообщений из внешнего окна редактора через вложенные iframe Figma;
диагностические `[Apollo bridge]` логи удалены. Пользовательский live-аудит
масштабированного Spinner завершился и экспортировал корректный результат.
Остальные живые кейсы пользователь выполняет самостоятельно.

Для локального прокси запустите актуальный `services/apollo-proxy/server.js`
на localhost:3001. Старый уже работающий процесс потребуется перезапустить.
При сборке ApolloProxyControl его build script включает проверенный pilot release
в embedded proxy, если пакет собран. Установленная старая `.app` автоматически
новые маршруты не получит. Локальная новая сборка уже создана в
`services/apollo-proxy/macos-app/dist/ApolloProxyControl.app`; её подпись проверена,
пакет всех пяти компонентов встроен и прошёл checksum verification. Приложение подписано
ad-hoc для локальной проверки; установка и публикация не выполнялись.

`release:pilot` читает главные manual Button, Spinner, CorporateContent, Amount и AmountStyles из соседнего `shared/design-system_ab`, затем факты из их authoring пакетов. Для CorporateContent это `experiments/web-corp/CorporateContent/authoring/contract.manual.json` и `authoring/src/*.json`. Исторический `CorporateContent/compiled` не используется. В игнорируемый `dist/pilot-release` входят неизменённые manual с компактными фактами и авторскими зависимостями, производные compiled caches и общий compiler/runtime. После изменений источников нужен повторный `release:pilot`: прокси раздаёт закреплённый снимок источника из этого пакета.
`release:spinner` сохраняет отдельную сборку только Spinner.
Можно передать иной источник и destination скрипту `scripts/build-pilot-release.js`.
`APOLLO_V4_RELEASE_ROOT` задаёт путь пакета для Proxy или сборки `.app`.
Release фиксирует bytes SHA-256, source package hash, manualSourceHash, generated facts hash, derived contract hash, compiler/runtime profile 0.4.0, scope, полную цепочку dependency pins и все 1097 routing keys (1060 Button, 13 Spinner, 1 CorporateContent, 1 Amount, 22 AmountStyles). Прокси заново компилирует источник и проверяет кэш; GET возвращает авторский пакет. Вложенный источник Spinner в Button
совпадает по canonical hash с отдельным пакетом. Он `local-pilot`,
`published=false`; normative sources и runtime index не изменяются.

В отчёте можно выбрать проверенный компонент. Кнопка «Объяснить результат» отправляет его frozen snapshot
и собственную release identity локальному Codex. Объяснение области целиком не запускается; каждому компоненту соответствует отдельный явный запрос. Proxy заново вычисляет deterministic result,
проверяет pins и references ответа. Агент запускается в отдельной временной
папке, без legacy knowledge directories. Ответ показывается отдельно от verdict.
При загрузке из файла объяснение отключено: такой пакет не закреплён в Proxy.
Снимок не отправляется агенту автоматически и не записывается в telemetry.
Для объяснения передаётся неисполняемая проекция того же контракта: все RuleIR,
source policies и dependency pins сохранены; каталог фактов ограничен выбранными
вариантами. Полный контракт используется при повторном исполнении в Proxy.
Агентская проекция содержит actual facts, полные traces замечаний и таблицу
успешных/неприменимых оценок с исходными IDs и provenance. Повторные reference
bodies и baselines опущены явно; JSON-отчёт аудита сохраняет полный снимок.

## Проверка выделенной области

Обход соответствует принципу v3: DFS всех выбранных корней с пропуском скрытых веток. Перекрывающиеся корни и повторные node IDs учитываются один раз. Apollo собирает уникальные пары библиотечных ключей и вызывает `POST /v2/contracts/resolve`; ответ содержит нужные авторские пакеты с полным embedded dependency closure, pins и явный статус каждого ключа. Названия используются только для вывода. Перед публикацией отчёта пустой запрос с releaseId проверяет, что пакет не сменился; затем заново проверяются захваченные факты, состав области и выделение.

Каждый видимый instance получает собственную проверку или явный статус. Fixed child, уже исполненный родительским контрактом, не получает повторную standalone-проверку. Внутренняя часть без собственного контракта учитывается по контракту владельца только при совпадении с объявленным target и независимым эталоном текущего варианта: topology, availability, component identity и property-reference evidence должны подтверждать соответствие. Ledger `governedComponents` сохраняет scope/узел владельца, contract ID, manualSourceHash и target ID/role. Это attribution, а не отдельное исполнение правил; нарушения и неполнота владельца сохраняются.

Самостоятельный public child с собственным контрактом проверяется отдельно. Внешние control paths, native SLOT, INSTANCE_SWAP, неизвестные identity/reference и необъявленные части не получают implicit ownership. Содержимое открытого native slot обходится независимо и проверяется по собственному контракту, если он доступен. Панель подписывает общий счётчик `governedComponents` как «по контракту владельца», включая исполненные pinned dependencies и подтверждённые внутренние части. BUG-002 проверен локально (v4 gate 136/136); пользовательская живая приёмка ещё открыта.

Отчёт `apollo.area-audit.v1-experimental` содержит `selection`, `components[]` с отдельными frozen snapshots и release pins, `governedComponents`, `notChecked`, общий результат и warnings. Глобальный evaluationId включает scope экземпляра; исходный ID сохраняется как componentEvaluationId, classifications и traces не меняются. Rule labels разрешаются по scope + RuleID; focus ведёт к исходному узлу. Компоненты без контракта, конфликтующие ключи, недоступные identity/reference и определения COMPONENT видны как непроверенные. Пустая область не считается успешной проверкой.

Лимиты: 10 000 посещённых узлов области, 1000 компонентов, 500 узлов на отдельный snapshot. Превышение оставляет покрытие неполным. `executionComplete` области требует полного обхода, хотя бы одного проверенного instance, отсутствия gaps и полного исполнения каждого компонента. Это покрытие доступными контрактами, а не все проверки v3, отдельных слоёв, detached frames или всех сценариев Editor. Проверка определения COMPONENT по независимому эталону экземпляра пока не выполняется.

В карточке замечания теперь видны конкретный узел, свойство и сравнение: например, «Отступ справа — ожидается 20 px, фактически 24 px». При сравнении с независимым эталоном он подписан «Эталон компонента»; история изменения не выдумывается. Сохраняются текст правила, RuleID и переход к узлу. Цвета показываются с token identity, сложные значения можно раскрыть через «Все параметры». Для допустимых наборов и диапазонов сохраняется смысл ограничения; составные правила показывают участвующие в результате ветки и альтернативы. Если значения неизвестны, карточка явно сообщает, каких данных не хватает. Вывод берётся из trace того же engine evaluation, без вызова Codex и повторной классификации.

## Исполнение и проверки

Входной manual обязан иметь актуальную authoring-схему; миграции v1 и восстановление норм из compiled запрещены. Факты и каждый dependency manual должны присутствовать. Внутренняя проекция принимается только со схемой `apollo.component-contract.v2.1-experimental`, status ready. Устаревший кэш другого manual пересобирается и не влияет на новые нормы. Для проекции того же manual проверяется точное совпадение; исторический номер экспортёра Spinner r8 сохраняется только как metadata.
Проверяются source-rule closure, активность RuleIR, presentation, source hashes,
capture controls, snapshot profile и runtime compatibility. Legacy, draft и
неизвестные capabilities отклоняются до исполнения. Нормативные правила
не копируются в source или fixtures и не выбираются по названиям компонентов.
У всей цепочки dependencies проверяются статус ready, revision, source/canonical
hashes, fixed bindings, отсутствие циклов и конфликтующих версий. Общий capture
создаёт независимый эталон каждого вложенного instance. Результаты сохраняют
его собственные RuleID и occurrence evidence; focus ведёт к узлу внутри host.
Недоступный эталон или несовпадающий дочерний снимок оставляет покрытие неполным.

`executionComplete` означает завершение compiled predicates для данного снимка.
Это не отсутствие нарушений и не полнота всех сценариев Editor или страницы.
Unknown facts и неисполненные delegated/context-only routes дают неполное покрытие.
Объяснение Codex не исполняет delegated rules и не закрывает их coverage.

Проверено 01.10.2026:

- Core: type-check, build, 2 hash/repeatability tests.
- Editor после переноса: type-check, build, все 699 regression tests.
- V4: type-check, build, 98 тестов, включая authoring-source gates и main bundle в Plugin API
  simulation, две dependency occurrences, pin/depth/cycle/version gates,
  independent references, PASS/FAIL, stale capture, focus, cleanup и release closure.
  Область: несколько корней, перекрывающееся выделение, скрытые ветки, дедупликация ключей и dependency occurrences, отсутствующие контракты, частичный capture, stale response и смена release.
  Карточки: 13 проверок форматирования реальных synthetic traces — значения/единицы, zero/unknown, baseline, составные условия и запреты, диапазоны, измеренное расстояние, токены и структурный порядок.
- Spinner: шесть архивных captures, 1008 evaluations; exact historical replay
  и semantic parity принятого r8. Приватные captures остаются в design-system_ab.
- Button: 115 архивных отчётов, точный replay всех 33 937 historical evaluations.
  Принятый r31 исполнил 32 062 evaluations: 67 dependency runs executed,
  154 not-applicable, 1 incomplete и 8 not-executed. В 99 снимках сохранилось
  неполное покрытие из-за исходных фактов/сценариев; inputs не перепривязывались.
  Это совместимость исполнения, не новая приёмка сценариев r31.
- Authoring: пять главных manual воспроизводят принятые проекции полностью. CorporateContent: exact replay пяти архивных отчётов (88 evaluations), включая обе проверки r11 (34 evaluations). Исторические результаты r10 сохранены; внешнее содержимое native Body slot не объявляется проверенным.
- Proxy: 23 package/protocol/HTTP tests и тест CLI launcher с busy/auth failures,
  isolated working directory и cleanup. Codex в этих тестах имитируется.
- Размер агентского пакета: все 115 архивных Button snapshots укладываются
  в прежний лимит 900 000 символов (максимум 842 813). Source rules, actual facts,
  evaluation identities/provenance и полные traces замечаний сохранены.
  В этой проверке агент не вызывается.
- Настоящий Codex на предыдущем профиле 0.1.0: запрос к серверу из `.app` на синтетическом
  one-node snapshot прошёл, ссылки на RuleID/evaluation проверены. Legacy
  directories намеренно отсутствовали; private .env не использовался.
- Панель: браузерная проверка 440/360 px, сравнения 20/24 и 20/28 при одинаковом RuleID, цвета/токены/полные параметры, отсутствующий эталон, автоматический key request, scoped findings, gaps, per-component explanation и его stale guard, focus/invalidation, nested findings,
  dependency coverage и скриншоты;
  сообщения из верхнего и промежуточного editor iframe принимаются,
  сообщения от постороннего iframe отклоняются.
- Пользовательский live FAIL: Spinner Size=48, Static=True, Inverted=False,
  фактический размер 72×72 вместо 48×48. Ровно два нарушения intrinsic size,
  98 compliant и 68 not-applicable evaluations; полный захват шести узлов,
  без unknown и warnings. Offline replay отчёта совпал целиком, release,
  contract hash и manualSourceHash совпали с пилотным пакетом.
- Изолированная копия Apollo source собрана без Editor, Proxy и DS sources;
  использовались уже установленные зависимости. Чистая сетевая npm ci не проверялась.

`dist/build-inputs.json` фиксирует исходники и hashes; сборка отказывает при чтении
кода за пределами Apollo repository. `dist/spinner-parity.json` содержит только
hashes и агрегаты; `dist/button-replay.json` — агрегаты исторического replay;
`dist/authoring-parity.json` — hashes и агрегаты воспроизведения главных manual.
Runtime, snapshots и пакеты в Git не добавляются.
Приватные пользовательские отчёты в `live-tests/` исключены из Git.

Полные legacy gates тоже запускались. V3 проходит type-check/build/runtime check,
но его suite останавливается на прежнем пути CardImage в
`JSONS/experiments/component-contract-v2`. Proxy suite имеет прежние ошибки
knowledge paths, migration-wave и crosswalk; sandbox HTTP test отдельно повторён
с разрешённым loopback и прошёл. Эти gates не объявляются зелёными.

## Границы текущего этапа

Подтверждён один пользовательский live FAIL-кейс масштабированного Spinner.
Полная матрица PASS/FAIL/UNKNOWN, focus и вызов Codex из панели ещё требуют
пользовательских живых тестов. Авторизованный
Codex через встроенный сервер проверен на синтетическом снимке.
Routing остаётся unpublished. Текущий scope — видимые компоненты внутри любой выбранной области, для которых есть один из пяти главных контрактов; fixed dependencies сохраняют pins и собственные правила. Новые живые прогоны выполняет пользователь. Подтверждено исполнение сохранённых снимков, а не новый live-прогон.
Проверки сценариев с before snapshot и дополнительными expectations могут
оставаться неполными. Pattern contracts,
редполитика, updater/rollback нового release и отмена агентского subprocess
остаются отдельными этапами. Новая версия не публиковалась.

Подробности — [runtime profile](docs/CONTRACT_RUNTIME_PROFILE.md)
и [план](../../docs/APOLLO_V4_PLAN.md).

## Единая генерация: G02

В этом репозитории начат [контур общей генерации](../../docs/GENERATION.md): `packages/generation-core` и отдельные границы Figma/frontend адаптеров. Локальный `scripts/load-generation-packages.js` читает authoring ZIP из явно указанного каталога, использует существующий source loader/profile V4 и сохраняет exact source/dependency/runtime lock. Из корня: `npm run generation:validate`, затем `npm run generation:packages -- <ZIP directory> <new lock.json>`. Нормы и private catalogs не включаются в исходники Apollo. Генерация экранов, prompt planner, release/Proxy и UI подключаются отдельными задачами.


## ScreenSpec import in Generation

The experimental Generation panel accepts one `.json` ScreenSpec by drag and
drop or the keyboard-accessible file picker, up to 1 MiB. Both routes share
parsing, invalidate previous preparation and retain the common schema/source/API
preflight. Invalid input clears the prior plan; file drops during another
operation are ignored. Dropping a file outside the import area does not navigate
the plugin iframe. No generation or target write starts automatically.


Generation consumes NEXT-01 through the external trusted
`scripts/generation-code-connect-inputs.js` provider. It reuses producer preflight
and canonical contract gates for the exact imported spec/all states. Draft
pattern-core is integrated as source-verified semantic attachments to the common
plan and always blocks execution. The provider and target protocols are ready
for General's [native/Proxy port integration](docs/GENERATION_HOST_PORTS.md);
the plugin's default provider/hosts remain unavailable. Private toolchain and
real target verification are separate required inputs.


## Generation: локальное подключение Proxy (05.10.2026)

`Подготовить план` отправляет ScreenSpec через коррелированный UI bridge в
`POST http://localhost:3001/generation/context`. Proxy читает текущие ZIP,
registry/lock Code Connect и checkout через `generation-code-connect-inputs.js`.
JSON спеки не задаёт пути, source, Ready, hashes или результаты проверок.
Проверяются spec/context hashes, ответы чужих/отменённых запросов игнорируются,
таймаут ограничен. `SOURCE_COMPILE` сохраняется и показывается как блокировка
Ready-компиляции; отсутствие нового маршрута отличено от недоступного Proxy.

Этот маршрут только читает входы; создание результата остаётся выключенным,
пока нет принятых native SLOT/occurrence/capture handlers для Figma и внешнего
frontend workspace с собранным arui-private и реальным browser verifier.
Draft и неподтверждённые representation/API bindings сохраняют блокировку.
API mapping, source acceptance и исполнение не заменяют друг друга.
Инструкция подключения и проверок: [GENERATION_PROXY.md](docs/GENERATION_PROXY.md).

Legacy CardImage fixture path исправлен отдельно 05.10.2026; полный root
`npm run validate` прошёл все 81 regression scripts. Упоминания прежней ошибки
выше относятся к историческому снимку проверки.


## NEXT-04: native Figma host

`generation-figma-host.ts` подключён к GenerationController; capture использует
existing canonical evaluator и authoring source через existing contracts route.
Typed Plugin API operations, fresh reads around each mutation, exact owned IDs,
partial provenance и rollback покрыты offline tests. Source/native SLOT/action
recipes остаются отдельным accepted input, их пустые ID не заполняются догадкой.
Сценарии state/event/action и публикация не принимаются offline тестами.
[Exact inputs и live checklist](docs/GENERATION_NATIVE_HOST.md).

Текущие gates: v4 180/180, adapter-figma 8/8, root 81/81. Panel/Proxy current-input
проверка показывает SOURCE_COMPILE и 0 native writes; Figma plumbing available,
native execution/live not-run, frontend host unavailable. Более ранние замечания
о disconnected reader, native implementation missing и CardImage failure выше —
исторические снимки, не текущий статус.

NEXT-02 shared fields/consumer proof/exporter готовы локально: **core 0.1.10 /
Editor 0.2.91**, v4 **182/182**, Generation **49/49**. Отдельные Code API/parity/
acceptance/publication gates, exact owned occurrences и Body SLOT association:
[поля, exporter workflow и owner handoff](docs/GENERATION_CODE_EVIDENCE.md).
Production ZIP/registry/locks, scoped authority, live/frontend/release не изменены.

## Native recipes proposal · 06.10.2026

Подготовлены source-derived recipes для CC desktop/mobile Body SLOT и BG Size56
owned Button: exact source/typed bindings, API/types evidence, capture/order/empty
и rollback requirements. Семь synthetic cases; полный v4 gate 192/192, root 81/81.
Installed typings 1.121.0 не поддерживают SlotNode; официальный 1.141.0 snapshot
поддерживает SLOT operations, но slotContentId отсутствует в декларации.
Version update, definition-set boundary и owner capability checks остаются
proposal; accepted providers null, live not-run.
[Конкретные action points, source/API pins и handoff](docs/GENERATION_NATIVE_RECIPE_PROPOSAL.md).

## Runtime build reproducibility · 06.10.2026

Runtime переведён с custom path-only onResolve на existing canonical aliases.
Два прежних hashes воспроизведены из той же closure; diff содержит только strict
mode directives. Восемь cold fixed builds побайтно одинаковы, v4 gate 193/193,
root 81/81; new-runtime current source probe сохраняет CC Ready/BG Draft и missing
profiles/native bindings. Main/UI unchanged; старые host receipts не repinned.
Published exact Figma typings 1.141.0 проверены по npm integrity/Git tag и isolated
project type-check, но slotContentId declaration missing. Dependency/lock/provider
не изменены. [Причина drift, final pins и конкретный types proposal](docs/GENERATION_BUILD_REPRODUCIBILITY.md).

## Native selection diagnostics · 06.10.2026

Exact project-local Figma typings **1.141.0** установлены с минимальным lock update.
В Generation panel доступны **«Снять диагностику выделения»** и **«Сохранить
диагностику JSON»** для existing CC desktop/mobile Body и BG Size56 variants.
Reader проверяет свежие source/registry/runtime/build pins, exact slot/owned
identity и bounded content; неизвестное остаётся явно неполным. Main/UI rebuild
required; saved report имеет provenance observed-not-accepted.

Installed type/build gates: v4 **204/204**, root **81/81**, targeted built UI
440/360, built main/synthetic nodes → actual Proxy context и three identical
standard builds. Runtime a585… unchanged, main/UI/build inputs обновлены.
Пользовательский read в Figma, mutation capability/native recipes/profile/live
acceptance ещё не выполнены; accepted providers null. Предыдущие разделы содержат
historical evidence этапов. [Запуск действия, JSON scope и current handoff](docs/GENERATION_NATIVE_DIAGNOSTICS.md).

## Native observation review / v2 · 06.10.2026

Три user v1 reports verified offline: native-read observed, mutation/live
acceptance not-run. Reader v2 выдаёт declared raw BG properties независимо от
canonical match, с completeness/type/omission statuses; remote identity остаётся
unknown. Current-page nodechange observer заменяет global documentchange без
page loads. UI поддерживает v1/v2, receipts не repinned.

Latest source type-check / 212 synthetic tests / root81 и UI440/360 passed.
Final standard build повторно проверен 09.10.2026 после exact producer refresh:
обычный working `npm run validate` — **565 PASS**; семь сценариев actual built
main/UI на штатной ширине **800 px** — PASS. Текущий dist пересобран из рабочих
исходников без private wrapper или обхода source gates; UI/native API harness —
synthetic-only proof. Norm review/pilot scope approved in General; real action
facts/native recipes/profile/live still missing.
[Review, exact snapshot/source pins и условный retest handoff](docs/GENERATION_NATIVE_OBSERVATION_REVIEW.md).

## BG r59 consumer refresh · 06.10.2026

Current registry/lock/source/recipe/build observations обновлены по exact verified
producer handoff. Standard v4 **212/212** и root **81/81** passed; все **92** built
source inputs совпадают с latest files, последний empty-declaration guard в main.
Сборка готова к **reload/read-only retest**. Прежний stale/source mismatch устранён;
старые разделы выше сохраняют historical evidence.

Built main/UI → actual localhost Proxy на synthetic nodes подтвердили v2 export,
raw properties/observer invalidation/cleanup и correlated v1 support, 440/360 на
pinned Chrome154.0.8037.98. Actual agent Figma/native read/mutation и новые frontend
imports/scenarios не запускались. BG r59 Reviewed26, context-only9, Source Draft;
profiles/native/scoped authority/live/release не приняты. [Current pins и короткий
user retest](docs/GENERATION_R59_CONSUMER_READY.md).

## Пользовательские native v2 наблюдения · 06.10.2026

Три private user reports проверены на exact r59 producer/recipe/build/type/source
pins и reportHash. BG: 12 declared typed values доступны независимо от canonical
match; CC desktop/mobile: полное bounded Body SLOT/content/limits чтение. Observer
current-page available; последующая export invalidation и close cleanup этими
JSON не доказаны. User native-read observed; canonical recipes/providers/profile/
mutation/live/release остаются открытыми. [Результат и следующие action points](docs/GENERATION_NATIVE_V2_USER_REVIEW.md).

## Rollback safety / static pilot inputs · 06.10.2026

Foreign content без исходного снимка или с внешним drift сохраняется на месте;
неуспешный перенос/cleanup больше не превращается в complete. Bounded журнал
восстанавливает только известные parent/order/transforms и удерживает нужные
generated anchors, с финальной проверкой после удаления. Adapter receipt сохраняет
incomplete и diagnostics; retained transaction можно безопасно повторить.
Gates: v4 **231/231**, root **81/81**, adapter-figma **8/8** passed;
28 targeted synthetic tests passed; actual native mutation/readback/rollback ещё
не выполнены. [Rollback protocol](docs/GENERATION_ROLLBACK_SAFETY.md).

В пилоте CC desktop Body → BG56/Overflow=false подтверждены viewport width1600
и single default state. Бизнес-обработчики/events не нужны; текущий обязательный
OwnedAction.eventId — CONTENT-ONLY-OWNED-PORT gap. [Review draft, точные входы и
следующие action points](docs/GENERATION_STATIC_PILOT_INPUT.md). Статический режим
и scoped authority не активированы; BG Draft, accepted providers null.

## NEXT-03 · Draft static-content port · 06.10.2026

Generation-core имеет separate versioned closed static ScreenSpec/CompositionPlan
и deterministic content projection без eventId/onClick. Explicit displayOrder и
independent priorityOrder, View/disabled/Loading=false не выводятся из default.
Draft fact candidates не являются trusted receipts. Interactive v1 unchanged;
current v4 import/producer/adapters reject static execution before host calls.
«Сохранить», затем «Назад», Size56, local plan IDs save/back и width1600/default
зафиксированы; остальные product fields в current draft остаются null, профиль
отдельно proposal until owner review. [Current protocol/draft/Code Connect request](docs/GENERATION_STATIC_CONTENT_PROTOCOL.md).

NEXT-03 local gates: generation-core **75/75**, v4 **233/233**, Figma adapter
**9/9**, frontend adapter **13/13**, root **81/81**, type-check/build/runtime parser
passed. Static schema/content planning implemented Draft; producers/targets и
scoped/native/profile/live authority остаются unsupported/unaccepted.

## NEXT-03 · Separate Draft review reader · 06.10.2026

Node-only authoring metadata reader и typed producer JSON inspection реализованы
отдельно от GenerationController/execution inventory. Standard main/facts/compiler
issues, Draft coverage и exact source/build pins сохраняются; accepted=false,
executionAllowed=false и generationPlanHash=null. После consumer edits прежние
producer observations доступны только как stale historical review; exact rebind
запрашивается отдельно после final build. BG59: Draft/nonExecutable9, обычный
loader по-прежнему SOURCE_COMPILE. Gates Generation127, v4 239, adapters9/13,
root81 passed. [API, freshness и remaining limits](docs/GENERATION_DRAFT_SOURCE_REVIEW.md).

## NEXT-03/07 · Panel static review / Proxy

The separate read-only review action uses server-owned Proxy pins and shows missing
product fields, source/API/coverage/freshness/live/release independently. No private
manuals/compiled authority cross the wire. Create stays blocked; BG59 Draft9 and
Generation hash null remain. Browser/HTTP harness and private real Node HTTP probes
passed; the full Proxy gate retains seven independently reproduced legacy failures.
[Route and verified limits](docs/GENERATION_STATIC_REVIEW_ROUTE.md).

## Проверки документа — native stage 1

Кнопка «Проверить» запускает независимые native-проверки локальности, опубликованной
версии библиотечных экземпляров и явного режима Theme/Corp текущей страницы. Они
не требуют Proxy, Ready контрактов или успешного contract audit. Контрактный
результат и проверки документа остаются отдельными: native-подмножество не
доказывает соответствие всей категории правилам дизайн-системы.

Локальность определяется по native definition и remote, включая bounded source
dependencies с owner/occurrence и явными missing-main gaps. Freshness проверяет
точный ключ и identity через опубликованный importer с cache одного запуска;
instance sublayers исключены, SLOT projection и source dependencies указаны
отдельно. Темизация применяется к Desktop/MobileWeb. Native mobile —
not-applicable; пустое выделение не считается чистым local/freshness результатом,
но current-page theme остаётся доступной.

Карточки в существующих категориях показывают причину, область и проверяемый
переход к экземпляру/определению. Смена страницы/выделения/контекста и native
изменения инвалидируют данные; focus дополнительно перечитывает evidence.
Недоступные данные и лимиты дают unknown/incomplete. Исправления, swap, запись
режима и token/style rebind не выполняются. Импорты опубликованных определений
служат только чтению версии; реальная Figma/API-приёмка остаётся отдельным шагом.

Определение библиотечных ключей области ожидает native sources в пределах общего
бюджета 15 секунд на scan; очереди чтения делят этот бюджет, а не получают его
заново на каждый компонент. Поздние ответы после истечения бюджета не заполняют
факты. Таймаут (`AREA_IDENTITY_READ_TIMEOUT`), отказ API
(`AREA_IDENTITY_READ_FAILED`) и отсутствие источника
(`AREA_IDENTITY_UNAVAILABLE`) различаются в отчёте по node ID с `identityRead`.
Лимит числа узлов/компонентов сообщается отдельно от ошибки native чтения.

Подробные границы: [document audit](docs/document-audit-native-01.md).


### Сохранение результатов проверки документа

Результаты доступны в штатных категориях «Локальные компоненты», «Актуальные
компоненты», «Пора обновить» и «Темизация». Запуск проверки и ответы контрактного
маршрута не переключают выбранную категорию. При изменении исходных данных
сохраняется видимый предыдущий снимок с предупреждением; переходы к слоям
отключены до нового подтверждённого результата. Повторная загрузка/ошибка не
стирает снимок. Темизация страницы читается через PAGE explicit modes, с
типобезопасными SceneNode-полями и native key reconciliation коллекций Theme.
Живой пользовательский прогон исправления остаётся отдельной приёмкой.

В узком окне список категорий и результаты имеют отдельные области прокрутки: длинный список больше не выталкивает карточки за нижнюю границу окна. Компактный режим сохраняет отдельный список категорий.

### Проверка исходной области и детачи · AREA-LIFECYCLE-DETACH-02

Снятие и смена выделения больше не отменяют запущенную проверку и не стирают
её результаты. Native и contract ветки привязаны к roots, захваченным при запуске;
переходы перечитывают факты этих roots, а текущая selection служит входом следующего
запуска. Смена страницы, настроек или доказанное изменение исходных данных дают
явное устаревание. Состояние кнопки объединяет занятость обеих веток; timeout
в UI запрашивает остановку и ждёт коррелированного acknowledgement. Поздние
progress/result отменённой ветки не восстанавливают её результат.

Native обход проверяет видимые COMPONENT, COMPONENT_SET и INSTANCE. Чтения
identity выполняются ограниченным пулом, main/опубликованные ключи кэшируются в
пределах запуска; recheck объединяет чтения одного native node ID. Theme читает
явный режим owning PAGE, независимо от Corp на ребёнке. Подтверждённая PAGE Theme
не требует полного повторного обхода страницы; unrelated lookup gap не заменяет
известный Default на unknown. Локальность, Theme и стили передают проверенные
промежуточные результаты независимо от freshness; таймаут оставшейся ветки
сохраняет их с честными пробелами покрытия.

«Детач» использует только FRAME/GROUP native detachedInfo с library componentKey.
Plain frames, local provenance, имена и отсутствие styleId не доказывают библиотечный
детач. «Кастомные стили и токены» показывают текущее отсутствие связи для SOLID
заливок/обводок, видимых effects и text ranges. IMAGE, invisible и SECTION исключены;
сохранены применимые technical icon fills v3. Недоступные/mixed linked ресурсы дают
unknown/incomplete, resolved native alias остаётся связанным. Native binding state
не доказывает принадлежность DS или историю отвязки. Catalog/library и raw-typography
policy исключения v3 требуют отдельных нормативных источников: эта часть покрытия
пока явно неполная, keys/имена библиотек не угадываются.

Реальный пользовательский прогон предыдущей версии FAILED. Этот ремонт проверяется
на синтетических данных; повторный live Figma test, Ready и release acceptance
этими результатами не подтверждаются.

### Точные переходы и действия по результату Design Check

В «Кастомизациях» кнопки «Найти в макете» и «Найти объект N» используют отдельный реестр подтверждённых слоёв: run, finding и target проверяет main. Вложенный слой с составным Figma ID разрешается через его точного владельца INSTANCE. Переход сверяет ревизию исходного запуска после каждого ожидания и перед selection/viewport: изменение слоя, настроек, страницы, новый запуск, отмена и таймаут пресекают поздний переход; простая смена выделения остаётся разрешённой. Все доступные подтверждённые объекты нарушения доступны отдельно; неполная связь явно указана. Этот реестр не меняет контрактные оценки, нормы и их хеши. «Кастомные стили и токены» сохраняют собственный native маршрут перехода.

В «Пора обновить» доступно действие **Обновить** для одного проверенного независимого INSTANCE или корня проекции SLOT. Main повторно читает область и требует тот же ключ опубликованного компонента и точный наблюдавшийся ID новой версии. Применяется `swapComponent`, затем восстанавливаются совместимые TEXT, BOOLEAN, INSTANCE_SWAP и VARIANT свойства по правилу v3; перенос внутренних overrides выполняет штатная операция Figma. Для зависимости внутри локального определения замена внешнего экземпляра не предлагается.

В «Темизации» действие **Сменить** выбирает Corp у подтверждённой библиотечной коллекции Theme текущей PAGE. Оно не заменяет Corporate-компоненты и не сбрасывает режимы дочерних слоёв. Область действия видна перед нажатием.

UI ожидает согласованный ответ main; при таймауте запрашивает отмену и снимает busy только после подтверждения. Отмена до записи блокирует позднюю запись. После выполненного изменения, включая частичную ошибку подтверждения/восстановления, предыдущие результаты остаются видны как устаревший снимок, а переходы отключаются до повторной проверки. Привязка стилей/токенов и выбор норм из каталогов в эти действия не входят.

Подробности: [focus-actions.md](docs/focus-actions.md). Синтетическая проверка собранных UI/main: `tests/focus-actions.browser.cjs`, только 800 px. Наличие этих тестов не подтверждает применение в рабочую сборку или успешную live-проверку в Figma.

### Перепроверка после действий в макете

После «Обновить» и «Сменить» Apollo автоматически перепроверяет затронутый
исходно проверенный объект, его потомков и доказанных владельцев зависимостей
по всем подключённым native и контрактным категориям. Текущее выделение не
меняет область этой перепроверки. Результаты соседних объектов сохраняются;
их наблюдавшиеся факты повторно сверяются перед объединением. Новый registry
действий получает новый run ID, поэтому прежнее действие повторить нельзя.

Пока чтение продолжается, прежние нарушения остаются видны, действия отключены.
Нарушение исчезает только при свежем подтверждении исправления. Неполное чтение
сохраняет прежние нарушения с отметкой о неподтверждённой актуальности и без
действий для этих находок. Неудавшаяся контрактная область не предоставляет
актуальный PASS на основании прежнего снимка. При отмене, таймауте или смене
контекста поздний результат отбрасывается; повторного автоматического запуска
нет.

Влияние PAGE Theme определяется по исходно наблюдавшимся коллекциям,
resolved modes и явным режимам объектов и их предков. Дочерние overrides не
меняются. Если влияние нельзя доказать, это указано явно и перепроверка
ограничена исходной наблюдавшейся областью; автоматического обхода всей
страницы нет. Неподключённые проверки не становятся подключёнными из-за
повторного чтения. Bind не входит в этот этап.

Отложенный `nodechange` сам по себе не делает отчёт устаревшим. Оба обработчика
проверяют наблюдавшиеся свойства, структуру, native identities/resources и
контрактные захваты с сохранением guards контекста. Неизменившиеся уведомления
объединяются в одну ожидающую проверку; публикация свежего отчёта ждёт её
завершения. Реальное изменение во время чтения прерывает перепроверку, а поздний
результат не получает доступа к действиям. Синтетические проверки такого
поведения не заменяют пользовательскую проверку таймингов Figma.

При автоматической перепроверке проверки контекста отдельного native-чтения
не сканируют всю наблюдённую область заново. Полное сравнение свойств выполняется
на границах стадий, при уведомлениях и перед публикацией; изменения во время
ожидания всё ещё отвергают результат. Это устраняет квадратичные повторные чтения
на больших областях. Исчерпание общего лимита перепроверки обозначается как
таймаут, а не как смена страницы или платформы.

Автоматическая перепроверка после «Сменить» и «Обновить» имеет отдельный бюджет
60 секунд: она включает native-чтение, захват контрактов и проверку версии через
Proxy. UI ожидает подтверждение до 65 секунд; обычные native-чтения и запись
сохраняют прежние таймауты. Текущий этап виден в статусе действия. Названия
токенов и стилей читаются один раз для объединённого результата с общим бюджетом
1 секунда; недоступные названия остаются неразрешёнными и не влияют на оценки.
Поздний ответ после отмены, таймаута или изменения контекста не публикуется;
счётчики обновляются только после подтверждённой перепроверки.

После «Обновить» Auto Layout-родители расширяют перепроверку только на слои,
которые наблюдались в исходной проверке. Родитель за пределами этой области
не запускает обход остального макета. Исходно наблюдавшиеся соседи, которые
могли сдвинуться или изменить размер, и весь затронутый контрактный scope
перечитываются. При замене вложенных слоёв старое членство определяется по
сохранённой топологии, а новые потомки проверяются по живым native-узлам.


### Привязка токенов и стилей по алгоритму v3

В категории «Кастомные стили и токены» Apollo предлагает библиотечные привязки без автоматического выбора. Для заливок и обводок первым идёт единственный ожидаемый токен из уже выполненной контрактной проверки, затем точные совпадения цвета и прозрачности по всем конкретным значениям и режимам каталога v3. Сравнение сохраняет округление v3 до четырёх знаков и его ограничения scopes; стили заливки/обводки используются, когда кандидатов токенов нет. Для текста переиспользуется отпечаток типографики v3.

Вариант показывает название, коллекцию или библиотеку, режимы совпадения и опубликованный ключ в раскрываемых сведениях. Режим совпадения описывает значение в каталоге; действие привязывает выбранный ключ. Перед записью и после асинхронных импортов проверяются исходный объект, стиль, отпечаток, страница и текущий запуск. После записи подтверждается фактический ключ, затем существующая перепроверка затронутой области обновляет нарушения и счётчики. Недоступный стиль или токен в другом свойстве или слое не удерживает уже исправленную привязку: она убирается после свежего native-подтверждения. Непрочитанные нарушения сохраняются с отметкой о неполной перепроверке; соседние результаты и выбранная категория остаются на месте.

Привязка использует тот же расчёт затронутой области, что и обновление компонента: учитываются исходно проверенные контейнеры и соседние слои Auto Layout. Непроверенные соседние ветки не добавляются. Даже при перепроверке отдельного текста без контрактных экземпляров сохраняется и подтверждается исходная версия пакета через Proxy. После привязки Prefix оставшиеся варианты Title доступны без ручного запуска проверки; реальная смена версии пакета блокирует публикацию нового результата.

Неподключённые дополнительные правила и исключения обозначаются нейтральным пояснением покрытия. Предупреждение о недоступных данных, таймауте или лимите показывается только при соответствующем gap проверки.

Каталог индексируется один раз на снимок для всех находок. Ошибка загрузки отображается отдельно от отсутствия точного совпадения. Названия actual/expected читаются по native ID и опубликованному ключу; при недоступности имени сохраняется исходный ID. Подбор эффектов по значению не добавлен: в v3 замена устаревшего стиля, включая эффект, задаётся конфигурацией. В текущем каноническом JSONS/apollo/remediations.json разделы components и styles пусты, поэтому действующих пар замены нет. Новые пары не создаются; существующий native исполнитель сохранён и проверяется отдельно.

## Portable target support / current packages · 09.10.2026

Shared core **0.1.12** / Editor **0.2.93** adds explicit declared target policy v2; the local v4 profile accepts v1/v2 and rejects unsupported stamps/versions. Cross-document reference pins preserve published keys, source addresses, topology and properties while excluding only file-local owner/main IDs. Missing reference node properties remain inconclusive rather than throwing. Compact imports restore the selected initial variant Anatomy without manufacturing runtime facts.

Current authoring packages: BenefitCard r3, ButtonsGroup desktop r60 and mobile-web r3. V4 ordinary working `npm run validate` passes type-check, standard build and **570 synthetic tests**, including binding-counter refresh regressions; ten actual built main/UI scenarios at the fixed **800 px** width also pass. General independently verified the producer/registry/lock/compiled reader before the mapping-port rebuild; the current dist matches the working source. Installed consumer and release acceptance remain open; no source gate was bypassed. Native Figma validation remains user-only. Paired tracking: **CC-COMPAT-PORTABLE-DECLARED-TARGET-02** in `../../docs/ARCHITECTURE_BACKLOG.md` and Editor backlog. Local exact package handoff: `shared/design-system_ab/experiments/current-contract-packages/reports/producer-handoff.2026-10-09.json` (workspace-relative; private data stays outside source fixtures).


## ScreenSpec из промпта и текущих контрактов

В панели генерации задайте описание, платформу и viewport, затем нажмите
«Составить ScreenSpec». Локальный Proxy читает текущие authoring manuals и точные
зависимости из закреплённого Code Connect producer до вызова настроенного CLI
агента. Исходный запрос и уточнения ведутся в чате; каждая успешная версия
ScreenSpec остаётся в истории и доступна как JSON. Ввод сообщения,
ошибка или отмена сохраняют последнюю спецификацию; прежний execution gate
сбрасывается. «Новый экран» явно начинает новый диалог. История, черновик,
незавершённое сообщение и viewport сохраняются в Figma clientStorage на этом
устройстве (до 2 МБ / 512 сообщений). Ошибка сохранения оставляет данные в панели
и предлагает экспорт. Восстановление возвращает только Draft; план проверяется
заново, execution session и receipts не сохраняются.
«Проверить план» передаёт его существующему GenerationController; Figma и фронт
исполняют один план через прежние адаптеры и проверки допуска.

Draft можно читать для планирования, но это не делает source/representation
Ready и не разрешает запись. Изменение входов во время запроса отклоняет ответ.
Отмена ожидания исключает поздний ответ из панели; read-only вызов агента может
завершиться на сервере. Подробности: [GENERATION_PROMPT.md](docs/GENERATION_PROMPT.md).

## Agent generation engineering MVP

The existing prompt chat now preserves a separate immutable ScreenVersion. The agent execution action admits each untrusted draft through server-owned current contract/workflow context, then starts `/agent/runs`. Frontend uses an assigned project and ordinary agent files/build/browser tools; actual diagnostics feed repair. Fixed adapters and readonly `/plan` retain their prior behavior. Restored content requires fresh admission; Draft/UNKNOWN and Ready remain distinct. Figma v1 broker reads only an admitted laboratory node/document identity with nonce/epoch guards. Set `APOLLO_AGENT_NATIVE_SCOPE_PATH` only to the General-reviewed private read-scope config when building that callback; absent config returns UNKNOWN. No native writes or live acceptance are included.

Перед UI-пересборкой работающего плагина проверьте `agentNativeScopeInput` в
`dist/build-inputs.json` и действующий принятый receipt: сохраните путь и SHA-256
конфигурации. Если callback был собран с принятой конфигурацией, передайте тот же
путь через `APOLLO_AGENT_NATIVE_SCOPE_PATH` при `npm run validate`, затем сравните
путь и hash в новой inventory. Отсутствие переменной в текущем shell не доказывает,
что предыдущая сборка не использовала конфигурацию. Конфигурацию и права callback
UI-правка не расширяет.

## Agent Figma: отдельный инженерный execution-профиль

«Figma · новый макет» использует отдельный `/agent/figma` маршрут: агент выбирает ограниченные операции, Apollo исполняет их в новом собственном корне и возвращает фактический readback. Прежнее чтение лаборатории и фронтовый режим сохраняются. В текущем private-кандидате подключена конечная политика MAP-02 для CC Body, BG56 и OptionList/Cell; в Figma проверяется композиция overflow, без выдуманных прототипов клика.

Перед open main ждёт сохранения DraftStorage и связывает exact versionHash/revision/specHash. `check_scope` возвращает typed semantic evidence текущей замороженной версии. Отдельный `dist/agent-figma-postconditions.cjs` предоставляет read-only `validatePostconditions({version,observation,request})`; `agent-figma-provider-descriptor.json` задаёт sourceHash и текущую wire revision. Callback v3 и cleanup/retain v5 поддерживают реальные вложенные I…;… ID, а аргументы операций сохраняют только локальные handles.

История хранит успешные корни и позволяет показать предыдущую версию. Отмена сначала отзывает исполнение; HTTP-подтверждение ограничено пятью секундами. UNKNOWN/неполная очистка сохраняются как такие. Engineering Draft остаётся Ready=false: полная проверка контрактов, Header/Footer и live native-приёмка отдельно. До независимого review и разрешённого применения этот профиль является private-кандидатом. Перед reload необходимо выполнить полный `npm run validate` в разрешённом рабочем consumer и закрепить свежие physical build inputs.

Новый owned SDK читает полный `figma-owned.md` и `figma-owned-mapping.json`; прежний readonly workflow сохраняется отдельно. В `packet.skills[].text` передаётся полный текст, в `context.targetMapping.semanticMapping` — связь mappingId/semantic ports с native choices/keys/properties/SLOT, в `context.ruleLinks` — неизменённые полные manual rules с RuleID, архивным/manual/object hash и JSON pointer. Source mapping реализует норму, но не заменяет manual. Явные противоречивые или неподдержанные props отклоняются до записи; native capture и pure checker сравнивают поддержанные props с замороженной версией, включая группы без actions. Proxy должен читать эти поля при actual CLI вызове.

`scripts/agent-figma-current-consumer.cjs` создаёт свежий consumer через `prepareCurrentConsumer({apolloRepository,providerPacketFile,approvalReceiptFile,validationReceiptFile,outputFile})` только после General exact review, approved apply и полного validate. Review должен содержать `status=ACCEPTED` и `acceptedWorkingSources` с точными path/sha256/bytes рабочих файлов; validate receipt — `status=PASS`, `command="npm run validate"` и фактический `buildInputsSha256`. Новый outputFile не перезаписывает старые artifacts. Loader проверяет полный физический inventory, новые compiled protocol/checker и source pins. Исторические MAP seals не меняются. Legacy SDK читает и закрепляет только mapping/skill выбранной среды; новый readonly current-input artifact после рабочего build — отдельная зависимость, которую маршрутизирует General.


### Target-aware prompt planning

The prompt chat sends the selected `target: frontend | figma` to `/generation/plan` outside the common input and ScreenSpec. Proxy reads the exact server-configured mapping, bindings and full skill for that target; the target context is included in `contextHash`. Frontend planning uses the confirmed host/code bindings and library overflow without requiring Figma native profiles. Legacy requests remain compatible. Planning grants no execution permission; current source/skill admission, Draft/UNKNOWN and Ready gates remain required. After a source/build update, use fresh reviewed inputs and an idle Proxy restart; historical consumers and seals are preserved.

Generation skills are pinned independently: frontend 0.1.1 and Figma 0.1.3 (profile/schema 0.1.1). The current Figma profile requires a final check_scope after export/focus and all other operations; finish needs matching passed native-readback and version postconditions from the latest observation. Current physical consumer admission, Draft/UNKNOWN and Ready gates remain required.


### Native property readback diagnostics (Generation28)

`FIGMA_PROPERTY_READ_BUDGET` keeps the existing scalar-only read limits (32 properties, 160 characters per name, 8192 per string value). A bounded secondary code now distinguishes count, name, value type, or value length refusal without exposing property names or values. A refusal cancels and rolls back the current run; repair requires a new admitted run. This is diagnostics only: the actual native failure subtype remains unknown until a fresh user-run readback. The old consumer must fail freshness after this build; consumer/runtime refresh requires separate acceptance.

Own LOCAL parent changes for a newly registered owned node are expected only when its captured birth parent differs from the parent after the broker write. Remote, foreign, malformed and unexpected changes still cancel the run; rollback ownership is unchanged. This addresses a synthetic own-parent false refusal; the actual native36 cause remains UNKNOWN and native/live acceptance is separate.

SLOT properties with absent scalar value use existing structural facts only when one exact live owned SLOT corresponds to the property under its nearest INSTANCE owner, with a record-shaped slotContentId reference. Scalar SLOT properties stay scalar; all original entries count toward32 and existing limits remain. Malformed or ambiguous correspondence still refuses and rolls back. This engineering read projection grants no write/domain allowance and does not establish normative API legality or native-live acceptance.

Variant component property definitions are read from the parent component set. Raw snapshots avoid the illegal variant getter while retaining separate ownerDefinitions freshness; nonvariant/set definitions remain captured. definitionCheck and beforeAppend never fall back from missing owner definitions to a variant getter. Existing source/domain/SLOT/write/cleanup and postcondition gates remain required; live correction needs separate validation.

### Native topology and callback diagnostics (Generation54)

`FIGMA_SOURCE_TOPOLOGY_UNKNOWN` remains a refusing/cancelling result. Bounded secondary diagnostics preserve capture stage, node count, limit and first issue kind, plus the last 32 native callback records observed before rollback. Callback data is delivery-only and always incomplete; truncation or no callbacks never grants ownership. These diagnostics do not repair SLOT identity invalidation. Shared source/build changes require a freshly accepted consumer/config before any dependent retry.


### Embedded Figma execution (current main runtime)

Apollo embeds the native Plugin API operations; Figma Console MCP and its Desktop Bridge are not installation requirements. The reference implementation is pinned and credited in THIRD_PARTY_NOTICES.md. `code.ts` uses generation-agent-figma-embedded.js and generation-agent-figma-embedded-policy.js. The previous native/provider files remain regression controls for historical failures and are not imported by the main bundle.

Execution checks the exact published component key, admitted typed properties and unique native TEXT/SLOT references. Instances are appended to their final parent before descendant bindings are read; addresses are captured after native insertion. This avoids caching descendants under a temporary parent and repeating a structural move. Imported choice properties and native SLOT declarations are checked; catalog-only properties that are not used by the recipe do not gate execution. Actual owner definitions remain part of source freshness. Final capture checks every constructed instance and nested action/content against its actual main component in one batch. It no longer creates pristine instances, tags every descendant or compares entire instance/source trees after every operation. Structural changes refresh addresses from the own root; rematerialized known nodes require the old ID to be absent and their binding to be preserved. Fonts load exactly, without fallback. Required property writes have actual readback; the default OptionList subtree is preserved.

The frozen ScreenVersion, request/lease correlation, semantic postconditions and source freshness remain required. Foreign content or uncertain cleanup retains the root. A delayed import/font load cannot resume writes after cancellation. The current finite mapping and incomplete normative coverage remain Draft/Ready=false; changing the executor does not add frontend parity or new component contracts. Shared source/build updates invalidate prior consumers and require a fresh accepted config before a run.

Before an awaited post-write refresh, the broker freezes the synchronous native result fingerprint. A local or remote edit during that wait cannot be adopted into ownership; a changed result refuses the run and preserves unknown content during cleanup.

Native broker учитывает собственные изменения всех layout-свойств set_layout, включая отложенные nodechange events. Снимок состояния проверяет те же поля, поэтому внешняя правка ранее использованного layout-свойства всё равно останавливает запись. При отказе broker сохраняет первую проверку, стадию, номер операции, node/property, expected/actual или origin/properties события и короткий native stack в JSON apollo.figma-native-failure.v1 внутри существующего bounded gap message. Correlated observation/eval сохраняет этот отчёт до rollback; cleanup не заменяет первый failure. Это диагностика фактического отказа, а не разрешение продолжать cancelled run.


Native event admission compares the complete owned subtree before and after an
admitted mutation. New nested nodes admit only their captured fields, including
name/text/style effects of creation and variant replacement. Delayed echoes
remain subject to the exact actual-tree fingerprint; external value changes,
unobserved main-component swaps and foreign descendants still block execution.
This mechanism does not depend on component names or contract-specific exceptions.


Generation interruption preservation (owner decision 13.10.2026): errors,
timeouts, cancel and the next run leave the partial Figma result on the canvas.
The native preservation receipt is separate from successful artifact retain and
Ready. UI offers “Показать сохранённый черновик” and a Figma link when the actual
fileKey is available; no file key is guessed. Unwanted drafts are deleted
manually by the user in Figma.

Start screen (13.10.2026): Apollo waits with an animated two-eye character and
shows checking motion only during an active audit; no cursor tracking. Motion
pauses when hidden and respects reduced motion. A completed result keeps its
checked area name; the current selection appears separately above it. A failed
repeat never relabels the old result. Empty category/count addons are omitted.
Confirmed current Corp hides the theming notice; unknown/stale evidence does not.
Proxy health and raw Proxy diagnostics live in settings with a red unavailable
indicator and retry. This changes presentation only: incomplete coverage, raw
errors, audit ownership and stale focus/mutation guards remain intact.


UI r12: нижние кнопки «Проверка» и «Тексты» используют единый исходный Texts размер16/20, padding4×24 и height48. Названия верхних вкладок остаются в DOM; раскрытие и смена панели используют короткие CSS transitions/animation с reduced-motion fallback. Navigation handlers, фокус и native/model gates сохранены.


### Cards / report UI — 14 October 2026 (source164)

The overview context pill overlays the screen without consuming layout height. Markdown tables use intrinsic column sizing; code in the first column stays on one line and wide tables can scroll horizontally. Solid paint comparisons show the token name or HEX, with non-default opacity retained. Colour equality never filters or reclassifies engine findings: otherwise identical summaries direct the reader to the exact captured values in the detail modal.

Information opens in a native modal dialog above the shell, with Escape, a close button, backdrop dismissal and focus restoration. Contract detail content contains the rule ID, fact path and expected/actual evidence; repeated prose, inline accordions and duplicate raw blocks are removed. Read-only mode/collection labels come only from captured `variable.modeCatalog` or the initialized source-pinned catalog reader; missing or conflicting labels remain unresolved, and no missing mode facts are supplied. Report coverage, warnings, gaps and export controls are retained under «Источники проверки». The old «Объяснение Codex» section stays hidden; no per-finding chat is introduced.

The reported Button #EF3124 → #EF3124 case remains unconfirmed until a correlated raw audit/evaluation is available. Screenshot equality alone cannot prove token identity equality or justify changing contracts/core. Verification uses Node/JSDOM at the fixed 800×860 size; the prior local-preview browser policy rejection is preserved without workaround. Native visual acceptance remains with the owner.


### Quality mascot — 14 October 2026 (r14)

The mascot stays visible for both waiting and completed audits. Its circular 144px body has no shadow: grey before/during a check or for stale results, green with a happy face for a complete current result without findings, yellow with a neutral face for warning-only/incomplete results, and red with a sad face when at least one confirmed red finding exists. Existing evaluation classifications and counters stay unchanged; the accessible description retains the total and states the result's limits.

Eyes follow the pointer inside the plugin with at most one update per animation frame and bounded 8px horizontal / 6px vertical motion. Pointer leave and window blur recenter the gaze; hidden panes, document visibility, unmount and reduced-motion preferences stop tracking or animation. No new dependencies, model calls or Figma mutations are involved. QA stays Node/JSDOM at 800×860; the existing local-preview browser refusal is not bypassed.


Mascot refinement r15: the mouth and its extra face wrapper are removed. Colour and eyes carry quality: neutral pill eyes for grey/yellow, happy arches for green, and mirrored drooping eyelids with raised inner corners for red. Eyes are centred in the existing circle; tracking, blink, reduced-motion/visibility cleanup and all audit state/counter semantics remain unchanged.

## ASA-023: declared staging и установка audit data

Assembler принимает один список принятых источников и явно выбранные runtime/core. В список входят полный retained набор и dependency closure. Principal ZIP либо полный authoring-source JSON сохраняет manual/facts и exporter stamp; новые compiled hashes не нормализуются молча. Общий normative passport связывает audit и generation source references, но не расширяет generation mappings и не даёт Ready/native admission.

```sh
node scripts/build-pilot-release.js --inputs accepted-inputs.json /absolute/path/to/new-staging
```

Локальный `accepted-inputs.json` имеет schemaVersion `apollo.declared-contract-release.v1`, `sources` (absolute path/sha256/bytes), `sourceAcceptance`, `runtime` и `core`. Runtime содержит `file`, `acceptedPin`, `acceptance`, `version`; core содержит `file`, `acceptedPin`, `acceptance`. Acceptance — точный pin закрытого документа со status `ACCEPTED_*`, `writesClosed:true` и явным `inputs` whitelist. Материализованные runtime/core должны совпадать с принятыми bytes. Bare manual без полного pinned пакета в declared mode отвергается. Staging должен быть новым; файлы адресуются плоскими hash-именами, `manifest.json` появляется после проверки closure и входов.

`release:pilot` и `release:spinner` по-прежнему запускают общий build и не являются изолированным updater. Не повторяйте их поверх действующего root: assembler требует новый staging. Generic knowledge sync не устанавливает этот общий v4 release.

После отдельной приёмки staging, runtime и обеих consumer projections General согласует установку. Только для audit классаA при неизменных прежних entries/runtime:

```sh
node scripts/install-pilot-release.js install /absolute/staging /absolute/active-audit-root EXPECTED_RAW_MANIFEST_SHA256
node scripts/install-pilot-release.js rollback /absolute/active-audit-root EXPECTED_CURRENT_RAW_MANIFEST_SHA256 PREVIOUS_RAW_MANIFEST_SHA256
```

Installer проверяет exclusive writer, expected manifest hash и checksum каждого файла. Полные новые bytes публикуются без перезаписи, затем `manifest.json` атомарно заменяется на том же filesystem после fsync. Предыдущий manifest и адресуемые им файлы сохраняются. Release crossing даёт retry409. SIGKILL до commit оставляет старый набор читаемым, но stale lock удерживает следующую установку до отдельного согласованного recovery; автоматического удаления данных или чужого lock нет.

Изменение retained норм/revision либо runtime (включая первую миграцию0.4.0→0.4.1) требует отдельного coordinated activation окна и не допускается этой classA командой. Audit manifest atomicity не означает atomicity двух конфигураций. При изменении используемых generation pins нужны существующий fresh consumer и actual saved/current-root selection proof; исторические seals не перепривязываются, generated results не удаляются. Если generation projection byte-exact, её нельзя перепривязывать лишь ради нового названия этапа.


### Base checks — 14 October 2026 (r16)

The overview uses the approved grey “База” entry with the same issue counter as the other groups. Clicking it opens the Base result page; it does not change page modes. Correct `Theme = Corp` and `Font = AlfaSans` findings are excluded from its error list and count even when another native collection has incomplete coverage. Gaps and stale guards remain visible; incomplete data never becomes a clean mascot result.

A separate bounded native Font check reads current-page explicit modes or the collection default (`Auto (AlfaSans)`), without reading SceneNode-only properties on PAGE. `System (SF)` is a confirmed font violation; unavailable/conflicting native identities remain unknown. Duplicate published aliases use exact remote/key identity; independent Font collections are checked individually and summarized as one font finding. Theme and Font give at most two domain findings on Base. Existing guarded Theme correction remains inside the nested result card; no automatic font write is added. Font mode/default facts participate in recheck, and scoped refresh preserves unrelated findings.

API basis: [Figma VariableCollection.defaultModeId](https://developers.figma.com/docs/plugins/api/VariableCollection/). Existing Desktop/MobileWeb applicability, contracts/core/generation, native target/action guards, the mouthless mascot and approved UI styling remain unchanged. Node/JSDOM checks use800×860; native visual acceptance remains with the owner and the existing browser-policy restriction is preserved.

Сбои генерации показывают постоянный код типа ошибки и отдельный `errorId` случая.
В чате видны этап, шаг модели или native-вызов, индекс операции с нуля, handle и
фактический node ID, когда он установлен. Полный JSON остаётся в подробностях
сборки; stderr и приватные traces доступны только на proxy. Неизвестный node ID
отображается явно, без подстановки корневого frame. Формат и поиск evidence
описаны в разделе «Идентификаторы сбоев генерации» README Apollo Proxy.

Общий Reader различает повторяющиеся вложенные варианты по native source
identity цепочки владельцев до root. Неоднозначные, неизвестные, подменённые
и stale цели сохраняют отказ. После изменения shared core нужен свежий
source/build consumer/config/runtime; generation mapping и Draft/Ready имеют
прежние границы. Tracking: V4-ICONVIEW-ADDON-PART-IDENTITY-001 в architecture backlog.

### Native variant content and stack bounds

A typed variant write applies static text from the independently resolved selected library main, after checking subtree topology and loading source/current fonts. Text linked to an explicit component property remains controlled by that property. Context typography is retained; no resetOverrides or arbitrary text port is introduced. Independent postconditions compare unbound static text against the selected part variant and reject visible stack children outside the owned stack bounds. The model can repair owned frame dimensions through the existing set_layout operation. Incomplete layouts remain preserved.

### Derived text events during native generation

The owned-state fingerprint includes styled text ranges read through getStyledTextSegments. A delayed LOCAL styledTextSegments event is accepted only when its property was changed by an admitted native mutation and the complete current fingerprint still matches; changed range styling, characters and REMOTE events remain failures. This event name is not read as a TextNode property. Public error diagnostics accept bounded compound native node IDs (including semicolon-separated nested instance IDs); unknown or malformed IDs remain unresolved.

### Выбор исполнителя Figma и контекст MCP

В настройках генерации для «Figma · новый макет» доступен выбор «MCP» (по умолчанию) или «Встроенный». Для фронта и чтения лаборатории этот выбор скрыт. Недоступный MCP показывает причину и не переключается на другой метод автоматически. Выбор сохраняется в сессии и черновике; исторические результаты без поля метода относятся к встроенному исполнителю. Во время сборки метод менять нельзя.

MCP использует отдельный экспериментальный Draft-корень. Независимый collector проверяет фактический источник, typed ports, native SLOT, порядок/видимость действий и структуру. Переполнение действий с отдельными контейнерами пока отклоняется до создания корня; ёмкость inline-действий берётся из принятого источника. Generic JavaScript MCP не имеет гарантий конечного встроенного prewrite broker. При ошибке/отмене корень сохраняется, а неподтверждённое завершение удалённой записи остаётся UNKNOWN. Успех сборки не означает Ready или полное нормативное/live покрытие.

До SDK/recorder тяжёлый контекст становится набором неизменных зарегистрированных ресурсов. Каждый новый model exec получает полный обязательный набор норм, условий, исключений, зависимостей и semantic API; дополнительные ресурсы запрашиваются только по проверенным ID. Текущий evidence ledger передаётся модели в компактном обратимом виде, полная история остаётся у сервера. Размер проверяется для полного CLI-промпта со схемой и резервом ответа; символы/байты и эвристическая оценка токенов отделены от фактического provider usage. Для установки после изменения source/build нужны принятые новые consumer/config и отдельное согласованное окно.

MCP shared PluginData uses the canonical `apollomcp` namespace exported by the Node-compatible target module. The fixed collector and worker prompt use that same value; hyphenated namespaces are rejected by the native API. Scope failures keep the existing string error envelope with a safe structured diagnostic (error ID, run/request/stage, source and actual root/node when known). A partial root is retained, never deleted or silently adopted. A scope-open failure precedes worker start and is not a completed model run.


### Данные в настройках Apollo

В настройках скрыты переключатели «Компактный вид», «Тестировать Contract v2»,
«Показывать Expected» и «Скрыть кастомизации». Сохранённые параметры проверки
продолжают действовать; канал, платформа и остальные действия доступны.
Состояние Proxy показано компактной плашкой с текущей версией: зелёный индикатор
при подключении, красный при недоступности, серый до проверки. Нажатие повторяет
проверку подключения; состояние и причина ошибки доступны в подсказке.

«Посмотреть данные» открывает таблицу текущих версий контрактов: проверка,
генерация Figma, генерация Front и дата из metadata.updatedAt. Данные заново
читаются при открытии и обновлении. Статусы различают самостоятельный mapping,
зависимость другого компонента, отсутствие подключения и недоступный/устаревший
источник. Наличие архива не считается подключением; разные закреплённые версии
не склеиваются. Локальный режим проверки отображает фактически загруженные
в текущий плагин контракты. Таблица описывает подключение данных и не меняет
статус Ready или допуск к исполнению.
Загрузка данных ограничена 30 секундами. Истечение ожидания, HTTP-ошибка Proxy
и отсутствие связи показываются разными сообщениями; таймаут не означает,
что Proxy выключен. Финальное чтение заново сверяет байты проверенного пакета
без повторной компиляции того же набора.

Сообщение генерационного чата очищается из строки сразу после принятия в историю,
до ответа планировщика. При ошибке планировщика оно остаётся в истории.
Отклонённый валидацией текст сохраняется в строке.


### MCP: генерация без проверки (16.10.2026)

По прямому решению владельца MCP сейчас только собирает ScreenSpec. RuleIR,
сравнение компонентов/стилей с эталонами и автоматическое исправление нормативных
FAIL/UNKNOWN отключены. История подписана «MCP · Черновик · без проверки»,
Ready=false. Design Check и встроенный исполнитель не менялись.

Scope transport вызывает capture — квитанцию актуального owned root, без обхода
компонентов и нормативных checks. Owner/page/outside/current/hash/sequence guards
остаются. Пустой root не объявляется экраном; сбой не удаляет частичный макет.
Полные workflow skills/API references поставляет proxy inline из figma-mcp.md;
локальные skills/workspace не нужны. После установки сборки плагин нужно
переоткрыть, чтобы transport использовал capture.

Карточки нарушений используют названия реально захваченных стилей и токенов. Компактные строки коллекций показывают подтверждённые изменения свойств, а иконок — проверенную замену на связанном порту; технические счётчики и флаги остаются в сведениях правила. Проекция не меняет RuleID, исходные trace, классификацию или покрытие и не объединяет пересекающиеся правила.

## Canonical contract sources

Manuals and full reproducible facts live in the main component folders under shared/design-system_ab/JSONS/web/components. JSONS/indexes/component-contracts.index.json pins current sources and exact dependency versions; ZIPs remain derived installation artifacts. The common Node catalog verifies source/archive identity and the exporter stamp. Proxy preserves a parent's frozen inline dependency when the standalone child advances. BackgroundPlate r7 therefore coexists with BenefitCard r12 pinned to BackgroundPlate r6. Compact Figma manual references require exact manual correspondence; the retained older authority stays complete.
