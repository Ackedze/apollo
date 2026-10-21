# Перенос интерфейса Apollo v3 в v4

## DCHK-UI-06: новый интерфейс Apollo · 13.10.2026

Прямое поручение владельца: применить принятый UI r1–r9 и сделать всю карточку
нарушения входом в фокус объекта. Оболочка использует верхнюю навигацию,
обзор групп, закреплённые категории и нижнюю плавающую область проверки.
«Тексты» переиспользует нижние controls с прежним gate неподключённого evaluator.
«Другие проверки» скрыты. Generation и Ask остаются диалогами в теле страницы;
параметры поколения открываются поверх контента, сохраняя старые native handlers.

Карточки используют общие FindingCard, ContractFindings и DocumentAuditCards.
Hover — black/4 без рамки, прежняя рамка возвращается при уходе. Клик на фон
или текст карточки вызывает её существующую кнопку фокуса; нативная кнопка
сохраняет клавиатурный доступ. Кнопки действий, ссылки, формы, disclosure и
выделение текста не запускают дополнительный фокус. Disabled/stale target
блокирует и клик карточки. Raw evidence, неполное покрытие и неизвестные данные
сохраняются; автоматическое исправление без action descriptor не добавляется.

Название библиотеки приходит из проверенного contract.package.library как
additive area-audit.components[].library. Root scope/key связываются точно;
имя слоя не используется для сопоставления. Библиотека рекомендуемой привязки
подписывается отдельно и не устанавливает происхождение компонента.

Ширина и высота плагина для этой приёмки — 800 × 860. Новые интерфейсные файлы,
документация и Node/DOM regressions входят в единое окно Design Check;
core/compiler/registry/контракты/Proxy не меняются. Пересборка выполняется
configured npm run validate с закреплённым scope input. Исторические consumer
и seals не перепривязываются; fresh consumer/config relay выполняет General.
User-only Figma reload/приёмка и Ready/release остаются отдельными статусами.


## DCHK-UI-05: чат в теле страницы · 06.10.2026

Новое прямое поручение владельца: чат этой же панели открывается в теле
страницы. Рабочая область показывает проверку, генерацию или чат; левая
панель и настройки доступны во время разговора. Убраны модальная подложка,
inert, aria-modal, focus trap и кнопка закрытия модалки. Чат обозначен как
region; активный вход в панели имеет aria-pressed. Escape при открытом чате
возвращает предыдущий рабочий экран и focus на вход в чат. Escape в настройках
закрывает только настройки. Клавиатурный порядок позволяет выйти в панель.

Переключение в проверку или генерацию скрывает чат, сохраняя React draft,
историю, выбранный источник и pending reply. Запрос не отменяется. Ответ,
пришедший после перехода, увеличивает unread; открытие чата очищает бейдж.
Снимок макета по-прежнему не передаётся в свободный dialogue. Проверка,
генерация, Markdown, read-only resource names и capability gates сохранены.
Порядок Proxy → агент → цель и высота 40 px сохранены, на узкой ширине
прокручивается только строка параметров. Main/router/core/Editor/Proxy не меняются.

Предыдущий UI04 sealed handoff сохранён. UI05 имеет отдельный private inventory,
before/after и отчёт проверок; пользовательский Figma reload и независимый
General review остаются отдельными шагами. Producer/V0/repin не выполняются.

## DCHK-UI-04: вертикальная навигация · 06.10.2026

По прямому поручению владельца добавлена левая панель шириной 56 px с входами
в проверку, генерацию, чат и настройки. По умолчанию открыта «Проверка».
Иконки имеют доступные названия, подсказки, видимый keyboard focus и состояние
выбранного режима. Настройки находятся внизу панели и переиспользуют popover
TopSection v3 через React portal, с прежними capability guards.

Генерация и native diagnostics используют прежние DOM nodes и handlers на
отдельном экране. Nodes монтируются один раз: ScreenSpec, выбранная цель,
результат и disclosure сохраняются. Аудит, категория, тип страницы и вкладки
компонентов/паттернов/текстов также сохраняются. Запущенные аудит и чат
завершаются независимо от выбранного режима. Режим экрана остаётся session-only
и не меняет контекст проверки. Compact применяется к экрану проверки.

На этапе UI04 чат открывался поверх любого режима; draft, история, pending reply и красный
unread badge сохраняют прежний lifecycle. Закрытие возвращает focus на вход
в чат. Escape закрывает настройки и возвращает focus; смена режима или открытие
чата закрывает прежние меню.

General передал UI/build ownership после проверки shared application
core 0.1.11 / Editor 0.2.92 / profile 0.4.1. Новый этап ограничен UI и тестами;
main/router, shared core, Editor, Proxy и нормативные данные не меняются.
Новая сборка получает новый source hash. Прежние sealed handoff и producer/V0/
config pins сохраняются. Локальные gates и новый inventory фиксируются в
private handoff; проверка текущей панели в Figma остаётся пользовательским шагом.

Задание владельца, переданное General 06.10.2026: перенести существующие UI,
табы, тип страницы, общие настройки и возможность открыть чат с агентом.
Цель — `.`. Источники v3 используются только для чтения.

Изолированный этап 1 и repair завершены отдельными immutable handoff.
После передачи General sole-writer ownership выполнен **DCHK-UI-02**:
оболочка подключена к рабочим `src/ui.js` / `src/ui.html` и фактической сборке v4.
`src/code.ts` меняется только для UI storage/resize; core, Proxy и контракты
не менялись. Ниже сохранено основание первого этапа; актуальное подключение
и проверенные границы описаны в разделе DCHK-UI-02.

Версии v4/core/Editor и нормативные пакеты не повышались. Локальная интеграция
не является нормативной, live Figma, native или release приёмкой.

## Источник и перенос

Подтверждены переданные исходные SHA-256:

| Источник | SHA-256 |
| --- | --- |
| `src/ui.html` | `dc43742de28e06022f3794a2d6a41ccac9837876faded8492f0fbe8dfcbe96f1` |
| `src/config/tabs.ts` | `eb6659d5eebd82ce00e091ffd9f51234b8ac9220627f2ce325b97c6d1c9fabe9` |

`src/design-check/source-pins.json` фиксирует все 28 файлов UI dependency closure,
source CSS, message router, plugin dialogue implementation и наблюдаемый Proxy
contract. Копии компонентов находятся в `src/design-check/v3/`: TopSection,
LeftSection, CategoryCard, CounterBadge, Picker/OptionList, кнопки, иконки,
GenerationExampleModal, types/pageContext и конфигурация табов. Стили shell/chat
взяты из первого style block v3 `ui.html`; launcher SVG — из того же источника.
Новая визуальная концепция не вводится.

Адаптации копий: capability guards неподключённых controls; `null` count → «—»
с доступным именем «Не проверено»; `aria-pressed` для кнопок выбора; ограничение
длинной подписи типа страницы на узкой ширине. На 800 px сохранён верхний
переключатель «Компоненты / Паттерны / Тексты», на узкой ширине он помещается
снизу, чтобы не перекрывать действия. Режим compact сохраняет v3 ширину 400 px
и список категорий; выбор категории раскрывает полный вид.

## Control / settings / message mapping

| Control | v3 источник/сообщение | Изолированный v4 модуль | Подключение к текущему v4 |
| --- | --- | --- | --- |
| Проверить | `scan-selection`, payload channelId/pickerLabel/pageType/shellAuditEnabled/experimentalContractV2Enabled | `controller.startAudit()` → `onAudit({requestId, uiPreferences})` | Текущий main принимает `audit` + requestId. Новый callback должен вызывать этот маршрут; UI preferences не являются принятыми facts |
| Остановить аудит | `cancel-scan` | Кнопка заблокирована на время проверки | У текущего v4 нет такого UI contract. Не отправлять v3 сообщение без отдельного main change request |
| Тип страницы | TopSection: form/details/data-list/landing/dashboard/other; начальное null | Реальные шесть вариантов, nullable preference | Выбор локальный. `audit()` v4 его не читает; применение к контекстным правилам требует отдельного versioned protocol |
| Канал | b2b/b2c/site/invest | Локальный picker, callback изменения | Main v3 фактически использует picker для AuditChannel; текущий v4 не принимает channelId. Не объявлять новый фильтр действующим |
| Платформа | Desktop/MobileWeb/iOS/Android; `prepare-catalog-channel` | Локальный picker; темизация скрывается для iOS/Android по v3 | Не вызывать загрузку legacy каталогов. v4 разрешает контракты по identity |
| Проверять шаред | `shellAuditEnabled` в scan-selection | Перенесён, по умолчанию disabled | Shared/shell route текущего v4 отсутствует; нужен consumer/runtime contract |
| Компактный вид | `set-ui-compact` → resize 400/800 × 860 | Действует в оболочке и preferences | Для окна Figma нужен небольшой явный main resize adapter после handoff; HTML width не меняет окно Figma |
| Тестировать Contract v2 | ephemeral v3 toggle | Перенесён, disabled | v4 уже работает на новых контрактах; legacy engine toggle переносить в main нельзя |
| Показывать Expected | v3 visible customization filter | Перенесён, disabled без capability | `allowed` в v4 не доказывает v3 Expected baseline. Capability разрешать только после принятого display mapping; synthetic tests используют явный adapter |
| Скрыть кастомизации | v3 UI filter | Действует: скрывает changes/changesWip, выбирает видимый таб | Только отображение; не удаляет evaluations/coverage/отчёт |
| Подготовить пример | `capture-generation-example` | Исходный modal перенесён, disabled без `onCaptureExample` | Не вызывать v3 capture автоматически. Существующая native diagnostic action v4 сохраняется отдельно |
| Источник агента | `set-apollo-agent-source`; clientStorage `apollo-agent-source` | Langflow/Codex picker; независимая история/session при смене | Новый UI preference adapter. Не объявлять route подключённым только из-за выбора |
| Открыть/закрыть чат | v3 launcher, close, Escape, backdrop | В UI05 чат — экран в теле страницы; вход из панели, выход через рабочий режим или Escape, без focus trap и inert | UI mount не запускает send; наличие callback отмечается отдельно |
| Виды | audit/report/texts; v3 agent report requests | Существующие названия и переключение, independent DOM slots | Pattern/text evaluator не добавляется. Отсутствующий route показан явно |

В v3 общие настройки и тип страницы были session-only: их начальные значения
находятся в `ui.html`; clientStorage сохранял только agentSource. Изолированный
модуль предлагает versioned **UI-only** preferences adapter с load/save: тип,
канал/платформа, compact, display flags и agentSource. Реальное сохранение в v4
ещё не подключено. `shellAuditEnabled` и experimental toggle не сохраняются.
Invalid schema/value явно даёт ошибку; отсутствующий тип остаётся null, не other.
Restore не активирует правила и не выдаёт acceptance audit context. Записи
сериализованы; поздний load не перетирает более свежий выбор пользователя.
Источник диалога фиксируется также при отправке сообщения. AgentSource из
preferences применяется только до начала диалога и при отсутствии истории:
позднее восстановление не переключает ни активный, ни уже завершённый диалог,
не сбрасывает session и не смешивает history. Остальные UI preferences могут
восстанавливаться независимо.
Preview использует отдельный localStorage key, не clientStorage Figma.

## Категории

Порядок и Rule-free labels полностью скопированы из `src/config/tabs.ts`.
Начальный таб — `current`, как в v3. Два разделителя сохранены.

| TabID | v3 data route | v4 status этапа 1 |
| --- | --- | --- |
| themization | visibleViews.themization | UI реализован, evaluator не подключён |
| wrongChannel | visibleViews.wrongChannel | UI реализован, evaluator не подключён |
| deprecated | visibleViews.relevance.deprecated | UI реализован, evaluator не подключён |
| deprecatedStyles | visibleViews.deprecatedStyles | UI реализован, evaluator не подключён |
| customStyles | visibleViews.customStyles | UI реализован, evaluator не подключён |
| update | visibleViews.relevance.update | UI реализован, evaluator не подключён |
| changesWip | visibleViews.changesWip, baseline diff | UI реализован, baseline route не подключён |
| changes | visible customization items | `setAudit()` читает существующие v4 evaluations: violations/unknown/allowed. Это ограниченная component-contract область, не весь v3 audit |
| local | visibleViews.local | UI реализован, evaluator не подключён |
| detached | visibleViews.detached | UI реализован, evaluator не подключён |
| presets | visibleViews.presets | UI реализован, evaluator не подключён |
| technical | visibleViews.relevance.technical | UI реализован, evaluator не подключён |
| current | visibleViews.relevance.current | UI реализован, relevance classifier не подключён |

Неподключённые категории имеют count=null, не успешный zero. `setTabData()`
требует явные scope и executionComplete для доступных данных. `setAudit()`
сохраняет исходные classification/evaluation IDs и coverage; не исполняет норм.
Controller не формирует самостоятельных правил для паттернов/context-only/
delegated и не меняет source/manual/dependency/code/runtime pins.

## Реальный dialogue contract и пределы

В v3 `send-apollo-agent-report` с userMessage вызывает main
`sendApolloAgentReport()`: requestKind=question; не нужен завершённый аудит.
Main отправляет `POST http://localhost:3001/analyze`:

```json
{
  "component": "apollo-agent-report",
  "action": "user-question",
  "session_id": "opaque-session-identity",
  "source": "codex",
  "dialogue": [{ "role": "user", "text": "предыдущий вопрос" }],
  "text": "JSON со schemaVersion=1, mode=design-dialogue, question и null context"
}
```

Context содержит selection/finding/auditReport/componentContext=null.
Нормализованный Proxy `/analyze` передаёт codex в `callCodexDialogue()`, Langflow
в `callApolloAgentForFinalText()`. Ответ: HTTP success и
`{success:true,result:string,source,knowledgeRelease}`; error не становится
assistant message. История ограничена 12 messages × 8000 characters.
Сессия остаётся стабильной до explicit reset; адаптер требует opaque identity
от caller и не добавляет имена/ID пользователя. `GET /health` сообщает endpoint
availability и proxy version, не rule coverage или готовность модели.

`dialogue-port.js` реализует этот наблюдаемый contract через явно переданные
request/endpoint/session ports. Он **не сконфигурирован в штатном v4**, и preview
не обращается к Proxy. Legacy wire support не означает принятую v4 knowledge
policy или snapshot authority. Для free knowledge chat новый backend route не
требуется; при shared UI подключении явно зафиксировать этот scope и текущую
knowledge policy вместе с остальными consumer inputs.
Для диалога по frozen audit нужен отдельный минимальный v4 protocol: точные
audit/release/source pins, context identity, ответ с provenance и stale guard.
Текущий adapter такой context отклоняет.

Текущий v4 `POST /v2/contracts/explain` — отдельная операция: release + frozen
snapshot + auditId, повторное deterministic execution в Proxy, response
explanation/references. Она сохраняется вместе с исходным scope picker; не
заменяется свободным чатом и не выдаётся за conversation endpoint.

v3 cancel message только обнуляет active request ID; HTTP/agent не отменяет.
У `/analyze` нет cancel endpoint. Новый adapter использует AbortSignal для
клиентского ожидания и suppresses late response. UI пишет, что серверная работа
может продолжаться. Close не отменяет pending dialogue; повторное открытие
сохраняет историю. Смена context/source создаёт новую session и не смешивает
ответы. Локальный chat текст не добавляется к audit findings или telemetry.

## Минимальный integration diff map после handoff

1. **`src/ui.html`**: создать shell mount container, сохранить существующие
   узлы с ID и listeners; передать slots.setup (source/selection/status),
   slots.audit (results, findings/focus, export, coverage, pinned explanation),
   slots.generation (все актуальные Generation review/targets/diagnostics).
   Pattern/text slots подключаются только при реальном route. Audit DOM slot
   показывается для changes; другие категории остаются explicit unsupported.
   Legacy v4 styles для body/main/button ограничить результатами и generation
   slots, чтобы они не меняли перенесённый chrome. Визуально проверить оба слоя
   вместе; текущий изолированный preview не подтверждает их CSS integration.
2. **`src/ui.js`**: импортировать `mountDesignCheck` и controller; вынести текущий
   audit click handler в `startExistingAudit(requestId)`. Top CTA и старый ID
   используют один callback/activeRequest, без дублирующей отправки. Существующий
   ancestor-chain check и message handler остаются владельцами transport.
   `audit-result` → существующий render + `acceptAuditResult(requestId,audit)`;
   `error` → `acceptAuditError`; selection/source invalidation → invalidateAudit
   и setContext. `setAuditReady` получает реальный current validSelection/busy/
   source state. UI preferences не добавлять в snapshot без отдельного protocol.
3. **`src/ui.js`, approved free-chat scope**: создать opt-in existing dialogue
   port через нынешний fetch, явный `/analyze` endpoint и opaque session identity.
   `explain` продолжает использовать прежний pinned route. Не отправлять старые
   `send-apollo-agent-report`/cancel сообщения main v4, который их не принимает.
4. **`src/code.ts`, минимальный отдельный request**: UI preference load/save и
   explicit resize 400/800 × 860, versioned request/response IDs и storage key
   v4. Без изменения compiler/capture/evaluator. Если preferences session-only
   на первом integration этапе, это явно подписать; preview storage не является
   доказательством clientStorage persistence. Runtime page-context/shell audit
   и server cancellation — самостоятельные interface requests, не перенос вслепую.
5. **`build.js`**: UI-only CSS module loader; в итоговый `ui.html` включить CSS
   output нового UI entry. Собрать main/UI в единственной выделенной writer фазе
   и заново вычислить existing build-inputs seal. React/CSS в plugin main не
   импортировать. Existing runtime/core/release invariants сохраняются.
6. **Тесты/gates/docs**: включить nested `tests/design-check/*.test.js` в общий
   runner, UI browser gate и новые build inputs; обновить README/бэклог одним
   назначенным writer. Только после общей type-check/build/validate и актуальной
   проверки Generation regressions выдать user Figma reload сценарий. Local,
   connected, checked, live и release states учитывать раздельно.

`ExistingSlot` перемещает тот же DOM node, сохраняя IDs/handlers и возвращая
исходному parent при unmount. Не клонировать существующий v4 result DOM и не
переписывать mutable Generation endpoints по старому snapshot.

## Изолированные проверки и handoff

Команды из `.`:

```sh
node ../../node_modules/typescript/bin/tsc --noEmit -p src/design-check/tsconfig.json
node --test tests/design-check/*.test.js
node src/design-check/build-preview.cjs /private/tmp/apollo-design-check-ui-migration-2026-10-06/preview
```

Browser runner: `tests/design-check/ui.browser.cjs`, существующие Playwright и
Chrome, explicit `DESIGN_CHECK_QA_ROOT`, `PLAYWRIGHT_MODULE`, `CHROME_PATH`.
Нет новой зависимости или изменения package/lock. Прогон блокирует внешние
HTTP requests. Изолированный build никогда не пишет в shared `dist`.

Type-check, 29 unit tests и 36 browser checks прошли. Browser QA проверяет исходные categories,
тип страницы, восстановление UI settings, compact/hidden tabs, все три вида,
chat open/close/focus, pending/cancel/stale/error state, сохранность существующих
DOM actions, отсутствие переполнения и обрезанных header controls на 800/440/360.
Финальный browser счётчик и hashes — в private handoff.

Private handoff: `/private/tmp/apollo-design-check-ui-migration-2026-10-06/`:
`typecheck.log`, `unit-tests.log`, `browser-tests.log`, `browser-summary.json`,
`screenshots/`, `preview/preview.html`, `inventory.json`, `handoff.json`.
Synthetic browser dialogue не является вызовом реального агента.
React Doctor command выполнен, но npm registry недоступен (`ENOTFOUND`);
React Doctor score не подтверждён. Зависимость не устанавливалась.

Полный shared build/validate, реальное подключение к main/Proxy, clientStorage
Figma, живые макеты и release этим этапом не проверялись. Следующий input —
завершённый Generation handoff и передача единственного владения общими
UI entrypoints от General. Требований изменить нормы или новый evaluator нет.

## Repair: restorePreferences → agentSource · 06.10.2026

General подтвердил synthetic гонку: delayed preferences load возвращал Codex
после отправки Langflow question; label переключался, а history/ответ/session
оставались от Langflow. Прежняя ревизия защищала только ручной source selection.

Исправление в isolated controller: valid send фиксирует ревизию источника;
restore применяет agentSource только при неизменной ревизии, отсутствии active
request и пустой history. Это сохраняет источник и после завершения первого
ответа до окончания load, а также при новом restore уже существующего диалога.
Другие UI preferences восстанавливаются как раньше. Нормы, wire schema и
shared UI/main/Proxy/core не изменены.

Три regression cases падают до исправления и проходят после него. Два используют
существующий transport с synthetic request port и проверяют actual request
source, стабильный session_id и history следующего сообщения для pending и
completed first dialogue. Третий проверяет restore после существующего диалога.
Полный изолированный набор — 32/32; type-check и новый isolated build пройдены.

Первоначальные `handoff.json` и `inventory.json` в
`/private/tmp/apollo-design-check-ui-migration-2026-10-06/` остаются immutable.
Новый repair handoff, updated source hashes, expected-failure log и результаты:
`/private/tmp/apollo-design-check-ui-migration-2026-10-06-repair-source-restore/`.
Runtime repin/V0 и обращений к реальному агенту нет. После repair General передал ownership для отдельного DCHK-UI-02, описанного ниже.

## DCHK-UI-02: подключение рабочего UI · 06.10.2026

TopSection, настройки, 13 категорий, тип страницы и три вида взяты из сохранённой
v3 dependency closure. Контрактные/result/Generation узлы перемещены React-slot
адаптером с сохранением DOM identity, ID и listeners. Старые CSS-селекторы v4
ограничены `.v4-legacy`. Оболочка начинает с 800 × 860; compact запрашивает
400 × 860. На 440/360 px длинный page label обрезается, меню помещается в окно,
нижняя навигация и launcher имеют зарезервированное место в прокрутке.

### Подключённые маршруты и границы

| Control | Фактическое подключение | Граница |
| --- | --- | --- |
| Проверить | Тот же v4 `audit` + requestId, один dispatch; результат относится к «Кастомизации» | UI page/channel/platform не входят в payload и не стали facts |
| Findings / gaps | Существующие render, focus, focus-scope, export, coverage | Повторный terminal reply, смена selection/source и старые request IDs не заменяют текущий результат |
| Объяснить результат | Существующий `/v2/contracts/explain` с release/snapshot/auditId | Отдельный pinned маршрут; свободный чат не подменяет его |
| General / page settings | Состояние текущей UI-сессии, v3 choices и исходные defaults | После reload возвращаются defaults; неподключённые evaluators показываются как «—» |
| Компактный вид / выбор категории | Версионный UI-only resize 400/800 × 860 | Размеры замкнуты; произвольные width/height и extra fields отклоняются |
| Источник чата | Versioned storage `apollo-v4-agent-source` через отдельный UI bridge | Сохраняется только source; delayed restore не переключает уже начатый/завершённый диалог |
| Открыть чат / отправить | Существующий `http://localhost:3001/analyze`, только по действию пользователя | selection/finding/auditReport/componentContext строго null, session opaque, history ≤12 ×8000 символов; Proxy дополнительно ограничивает history |
| Остановить ожидание | AbortSignal + stale guard UI | Серверная отмена не заявляется; запрос на сервере может продолжаться |
| Generation / native diagnostic | Прежние Figma/frontend/prepare/review/execute/export обработчики | Source, API, native, coverage, freshness и release gates сохраняются |

UI bridge: `apollo.design-check-ui-bridge.v1`, request/result с requestId,
operation и замкнутым payload. Операции: `agent-source-get`, `agent-source-set`,
`resize`. Source value: `apollo.design-check-agent-source.v1`; разрешены только
Langflow/Codex. Записи последовательны; UI проверяет response operation/schema,
ожидаемые размеры, timeout и отдельную identity каждой загрузки UI. Main code
и итоговый bundle остаются без object spread. Сообщения legacy scan/capture/cancel
не отправляются.

Источник запроса, возвращённый source и knowledgeRelease показаны как provenance
ответа. Отсутствующее поле явно отмечается. Ответ агента не меняет deterministic
вердикт или authoring-manual authority. Source/context change сбрасывает session
и history; старый ответ после отмены или смены контекста игнорируется. Closing
чата сохраняет диалог. На этапе UI02 проверены Escape/focus trap/возврат к
launcher; в UI05 модальность и focus trap убраны, Escape возвращает рабочий экран.

### Проверки и статус

| Область | Локально проверено / подключено | Открыто |
| --- | --- | --- |
| Фактическая сборка main/UI | Type-check, общий runner с nested tests, no-object-spread; все прежние 109 build paths +53 фактических UI/CSS/React inputs (включая 8 resolver/config metadata файлов) | General review нового inventory |
| Оболочка / аудит / Generation | Браузер собранного `dist/ui.html`: 800/440/360, settings, compact, counts, finding/focus/download, scroll, stale replies; прежние browser regressions | Пользовательский live Figma |
| Свободный чат | Actual mounted Proxy `/analyze` → отдельный loopback HTTP provider и безопасный synthetic Codex executable; source/history/provenance/cancel/error | Реальные Langflow/Codex connectivity и содержательная приёмка ответов не проверены |
| Static review v1/v2 | Существующие synthetic HTTP regressions и read-only фактический C0 provider; Draft/9 gaps/SOURCE_COMPILE остаются | Consumer binding/producer freshness/Ready/live/release не повышаются |
| Полный Proxy gate | 445/446; остаётся прежний failing crosswalk test | Полный gate не принят; ошибка вне этого UI diff |
| React Doctor | Запуск выполнен; registry.npmjs.org ENOTFOUND | Score не получен и не заявляется |

Required gates: `npm run validate` (81 root regressions),
`npm run generation:validate` (core 76, v4 351, Generation 179),
`npm run generation:build`. Browser runner:
`npm --prefix . run test:ui` с существующим Playwright/Chrome и
`DESIGN_CHECK_QA_ROOT` на новый private output directory.

Immutable input/repair документы не переписывались. Final source/build inventory,
before/after delta от reviewed Generation418 observation, точные runtime pins,
проверки freshness с полным списком расхождений, логи и screenshots находятся в
`/private/tmp/apollo-design-check-ui-integration-2026-10-06/`.
Исходные 16 producer mismatches остаются исторической базой; разрешённый UI diff
добавляет новые несовпадения, которые reader честно показывает. C0, producer
snapshots, registry/lock/manual пины не переустанавливаются. V0/production receipt,
генерация результата, install/publish и Ready promotion не выполнялись.

После успешных required local gates пользовательская проверка: reload именно
manifest `manifest.json`; проверить тип страницы/настройки/compact;
выделить компонент и нажать «Проверить»; проверить focus/export и открыть чат.
Реальная отправка вопроса требует запущенного ApolloProxyControl с выбранным
источником. Такой пользовательский live запуск остаётся отдельным наблюдением.


## Исправление чата после DCHK-UI-02 · 06.10.2026

Пользовательский iframe Figma показал `crypto.randomUUID is not a function` до
отправки `/analyze`. Новый общий helper создаёт opaque session/UI correlation IDs
через `getRandomValues`, а при отсутствующем или недоступном Web Crypto — через
время, локальный счётчик и случайный суффикс. Это идентификаторы диалога и запросов,
не credentials; стабильность сессии и reset при смене источника сохранены.

Шапка чата теперь в обычном flex flow: тег Proxy → выбор агента → выбор цели,
все контейнеры высотой 40px. На узкой ширине прокручивается только строка
параметров; Close остаётся доступным, Tab прокручивает выбранную цель в видимую
область. Старый абсолютный отступ 158px убран. Generation остаётся отдельной
панелью v4, её отключённый сегмент в чате не получил нового поведения.

Регрессия built UI отключает `randomUUID` до загрузки скрипта на 800/440/360px,
а на 360px также отключает `getRandomValues`. Запросы идут через actual `/analyze`
route только к owned synthetic provider/executable; source/history/provenance,
cancel/error и прежние audit/focus/export/Generation проверки сохраняются.
Это не подтверждение подключения реального агента или live Figma. Новый private
repair inventory, source/build delta, логи и screenshots:
`/private/tmp/apollo-design-check-chat-fix-2026-10-06/`. Исторические handoffs,
C0/producer pins и статусы freshness сохраняются; V0/repin не выполняются.

Repair local gates: root validate — 81 regressions; generation validate — core 76,
v4 354, Generation 179; generation build — passed. Built UI browser — 108 checks
on 800/440/360px, 12 synthetic `/analyze` requests; isolated preview — 37 checks,
no external requests. React Doctor повторно недоступен (npm DNS ENOTFOUND),
score не заявляется. Старый bundle воспроизводит ошибку до `/analyze`; исправленный
проходит оба варианта crypto capability.

## Markdown, непрочитанный ответ и display names · 06.10.2026

Владелец подтвердил получение ответа в Figma и дал новое прямое задание.
General уведомлён о старте; Generation передал build-output ownership до сборки.
Прежние repair/571-source pins относятся к историческому этапу.

17 чистых block-parser helpers скопированы из `src/ui.html` v3. React renderer
использует существующие `.md-*` стили для заголовков, списков, таблиц, цитат,
кода, bold/italic и сворачиваемого раздела допустимых кастомизаций. Raw HTML
не исполняется. Работают HTTP(S) ссылки; относительные paths показываются под
human label с исходным path в tooltip, без выдуманного URL. Report finding
actions и преобразования нормативных verdict в свободный чат не перенесены.

`chat.unreadCount` — состояние текущей UI-сессии: ответ в закрытом чате поднимает
красный счётчик на launcher; открытие снимает его. Ответ в открытом чате,
cancelled/stale reply не создают unread. Source switch и явный dialogue reset
очищают соответствующее состояние. Смена выделения/source аудита больше не
вызывает `setContext` свободного диалога: его `/analyze` context всегда null.
Явные context/cancel/destroy guards controller и requestId/selection guards
независимого аудита сохраняются.

v3 сопоставляет VariableID aliases и `S:` style IDs со стабильными ресурсными
ключами, затем берёт human label из metadata catalogs; style reader также
использует Figma ID → key fallback. Paint fingerprints служат отдельно для
поиска кандидатов и не доказывают привязку. v4 переносит отображение по
идентичности ресурса, сохраняя contracts-only evaluation: read-only Figma API
читает только referenced variables/styles, их имена и имя коллекции. Нет
importVariable/importStyle, catalog fetch или подбора по похожему цвету.

Lookup ограничен 256 references, 8 workers и deadline 300ms на read. Недоступные
имена остаются unresolved. Lookup выполняется ДО окончательного повторного
capture/freshness check, чтобы async metadata read не скрывал изменение макета.
`displayMetadata` приходит рядом с `audit` в UI response и не добавляется к
snapshot/evaluation/audit hash/export. Основной comparison показывает имя,
HEX и проценты; exact IDs, FLOAT, прежний paint diagnostic и полный JSON
доступны во «Всех параметрах». Разные токены с одним цветом остаются разными
фактами. Неизвестное имя показывается как «название недоступно».

Новый private handoff, полный source/build inventory, delta, screenshots и логи:
`/private/tmp/apollo-design-check-chat-markdown-token-labels-2026-10-06/`.
Core/schema/evaluation/Proxy и нормативные source/registry/producer pins не
редактируются. Прежние consumer observations исторические; V0/rebind/repin/
Ready/live/release этим этапом не повышаются. Одно получение реального ответа
не считается содержательной или нормативной приёмкой.

13.10.2026 — старт и предыдущая проверка. Узлы Figma 13600:79446 и
13596:73474 разделяют текущее выделение (верхняя плавающая зона) и проверенную
область (под счётчиком). Название результата фиксируется при новом результате,
а не при попытке запуска. Персонаж вместо пустого счётчика ждёт и показывает
проверку без pointer tracking; фоновые и reduced-motion состояния учтены.
По 13626:94756 пустые tab addons удалены. Плашка Corp скрыта только при свежем,
полном подтверждении Theme. Proxy health, повтор подключения и raw диагностика
перенесены в настройки; технические stale/selection уведомления overview убраны.
Данные и mutation/focus freshness gates остаются прежними. Применение выполняется
в согласованном UI149/source150 окне с точным configured native scope.


### Cards / report UI — 14 October 2026 (source164)

The overview context pill overlays the screen without consuming layout height. Markdown tables use intrinsic column sizing; code in the first column stays on one line and wide tables can scroll horizontally. Solid paint comparisons show the token name or HEX, with non-default opacity retained. Colour equality never filters or reclassifies engine findings: otherwise identical summaries direct the reader to the exact captured values in the detail modal.

Information opens in a native modal dialog above the shell, with Escape, a close button, backdrop dismissal and focus restoration. Contract detail content contains the rule ID, fact path and expected/actual evidence; repeated prose, inline accordions and duplicate raw blocks are removed. Read-only mode/collection labels come only from captured `variable.modeCatalog` or the initialized source-pinned catalog reader; missing or conflicting labels remain unresolved, and no missing mode facts are supplied. Report coverage, warnings, gaps and export controls are retained under «Источники проверки». The old «Объяснение Codex» section stays hidden; no per-finding chat is introduced.

The reported Button #EF3124 → #EF3124 case remains unconfirmed until a correlated raw audit/evaluation is available. Screenshot equality alone cannot prove token identity equality or justify changing contracts/core. Verification uses Node/JSDOM at the fixed 800×860 size; the prior local-preview browser policy rejection is preserved without workaround. Native visual acceptance remains with the owner.


### Quality mascot — 14 October 2026 (r14)

The mascot stays visible for both waiting and completed audits. Its circular 144px body has no shadow: grey before/during a check or for stale results, green with a happy face for a complete current result without findings, yellow with a neutral face for warning-only/incomplete results, and red with a sad face when at least one confirmed red finding exists. Existing evaluation classifications and counters stay unchanged; the accessible description retains the total and states the result's limits.

Eyes follow the pointer inside the plugin with at most one update per animation frame and bounded 8px horizontal / 6px vertical motion. Pointer leave and window blur recenter the gaze; hidden panes, document visibility, unmount and reduced-motion preferences stop tracking or animation. No new dependencies, model calls or Figma mutations are involved. QA stays Node/JSDOM at 800×860; the existing local-preview browser refusal is not bypassed.


Mascot refinement r15: the mouth and its extra face wrapper are removed. Colour and eyes carry quality: neutral pill eyes for grey/yellow, happy arches for green, and mirrored drooping eyelids with raised inner corners for red. Eyes are centred in the existing circle; tracking, blink, reduced-motion/visibility cleanup and all audit state/counter semantics remain unchanged.


### Base checks — 14 October 2026 (r16)

The overview uses the approved grey “База” entry with the same issue counter as the other groups. Clicking it opens the Base result page; it does not change page modes. Correct `Theme = Corp` and `Font = AlfaSans` findings are excluded from its error list and count even when another native collection has incomplete coverage. Gaps and stale guards remain visible; incomplete data never becomes a clean mascot result.

A separate bounded native Font check reads current-page explicit modes or the collection default (`Auto (AlfaSans)`), without reading SceneNode-only properties on PAGE. `System (SF)` is a confirmed font violation; unavailable/conflicting native identities remain unknown. Duplicate published aliases use exact remote/key identity; independent Font collections are checked individually and summarized as one font finding. Theme and Font give at most two domain findings on Base. Existing guarded Theme correction remains inside the nested result card; no automatic font write is added. Font mode/default facts participate in recheck, and scoped refresh preserves unrelated findings.

API basis: [Figma VariableCollection.defaultModeId](https://developers.figma.com/docs/plugins/api/VariableCollection/). Existing Desktop/MobileWeb applicability, contracts/core/generation, native target/action guards, the mouthless mascot and approved UI styling remain unchanged. Node/JSDOM checks use800×860; native visual acceptance remains with the owner and the existing browser-policy restriction is preserved.
