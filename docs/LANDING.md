# Лендинг Альфа-Бизнеса

В разделе «Генерация» сразу доступна строка ввода. На одной строке с «Новым чатом»
находятся выбор «Лендинг» и «Настройки экрана». Опишите предложение, аудиторию и задачу;
Apollo задаёт существенные вопросы и продолжает тот же чат после ответа.
Страница берётся из Figma native API. Для локальной и приватной поставки manifest включает
`enablePrivatePluginApi`, чтобы автоматически получить `figma.fileKey`. Если этот API
недоступен, добавьте ссылку на текущий файл в сообщение с брифом. Отдельного поля URL нет;
бриф сохраняется, модель не запускается до получения ключа. Привязка живёт только в
текущем сеансе и сбрасывается при смене страницы, без переноса между файлами. В настройках
выберите создание новой секции или одну из существующих, включая вложенные.
По умолчанию используется выбранная секция, иначе создаётся новая. Apollo добавляет
в неё собственный frame и сохраняет содержимое секции. Первый сценарий — Desktop и Codex.

## Подключение

Нужны совместимые версии плагина, Proxy/runtime и пакета данных. Канонический навык:
`design-system_ab/apollo/skills/ab-generate-custom-landing`, версия 0.3.2. В пакет входят
его manifest и четыре Markdown-файла. Нормы и технические каталоги читаются адресно из
того же установленного пакета, включая обязательный `ds-ai-hub/AGENTS.md`. Код не исполняется из данных. Официальный Figma workflow
поставляется в runtime. У каждого пользователя — свой вход Codex/Figma MCP.

Проверка доступности: `GET /landing/status`. Нет навыка — обновить данные;
нет workflow — нужен совместимый Proxy. Локальная сборка не обновляет установленное
приложение и не публикует канал. Установку и ручную приёмку выполняет владелец.

## Продолжение и сохранность

История и spec сохраняются в собственном state root Proxy (`landing/`). Каждая правка
имеет revision и request ID. Ответ модели не равен фактическому результату: плагин
перечитывает созданные секции, component keys и текст, а Proxy сверяет IDs и fingerprints.
Правка объявляет изменяемые секции; остальные сохраняются. Результат остаётся Draft,
`Ready=false`; проверки модели помечены `agent-report`. Нет независимого доказательства — UNKNOWN.

«Остановить» отзывает lease области и прерывает CLI. Частичный макет и предыдущий результат
сохраняются; поздний ответ не возобновляет работу. После перезапуска Proxy незавершённый чат
помечается прерванным. Продолжение сначала читает фактический макет. Внешний контур сравнивает
состав и геометрию соседних корней страницы; это не доказательство неизменности всех их потомков.
При существующей секции отдельно защищаются её содержимое и геометрия соседей.
Контейнер расширяется host-ом при росте лендинга; его внешнее изменение прерывает подтверждение.
MCP выполняет код агента: граница записи дополнительно задана инструкцией владельца области,
поэтому реальная приёмка Figma требуется перед заявлением эксплуатационной готовности.

Старые `/generation`, `/v1/generation`, `/agent/drafts`, `/agent/runs`, `/agent/figma`, `/agent/mcp`
и `/agent/artifacts` возвращают 410. Прежняя история доступна только для чтения; файлы
пользователей не удаляются. Frontend execution удалён, данные frontend mapping сохранены.

## Проверки разработчика

`npm run validate` — type-check, сборка и unit tests. `test:ui` включает синтетическую проверку
landing UI/service/native bridge и P0 audit browser regressions. Они не запускают реальную
модель или Figma. Для browser gate нужны установленные Playwright/Chrome; укажите
`PLAYWRIGHT_MODULE`, `CHROME_PATH`, `LANDING_QA_ROOT` и `DOCUMENT_AUDIT_QA_ROOT`.


## Контекст, уточнение и доказательства (0.3.2)

Новый generation profile хранит полный pinned read ledger на Proxy. Exact list одной
компонентной папки читает Figma инструкции/adapter/keys/cookbook за один host step;
технические workflow откладываются до записи. В prompt идут metadata старых поисков
и sourceIds активной секции; availableReads возвращает адреса удержанных материалов.
Успешное повторное открытие скрытого чтения допускается один раз, а неизменные видимые
повторы по-прежнему останавливает no-progress guard. Legacy v1 сохраняет прежний профиль.

Лимиты24model /96MCP не увеличены. Подготовка резервирует N+5model calls для Nсекций:
bootstrap, Nсекций, verify, два recovery. Для пяти секций подготовке отведены14вызовов,
включая build. Нехватка источников — LANDING_PREPARATION_BUDGET с openSelections и
сохранёнными чтениями. AGENT_ROUTING_TIMEOUT отличает наблюдаемый routing timeout
от общего process failure, но не исправляет неизвестную причину сети/CLI и не включает
слепой replay.

Tool-free continue может нести resultJson.technicalPatch: sectionId, baseRevision,
sources [{id,sha256,path,offset,observation}], decision. Только активная секция,
checkpoint.partial, sectionPatch:null, фактически прочитанные ranges и неизменный
независимый readback. Это append-only technicalDecisions, а не замена полного плана,
props, текстов или бизнес-фактов. Общую историю/CTA перепланируют отдельно.
resultJson.apiObservations сохраняет до8кратких findings с origin=agent-report.

Для профиля лендинга source.nativeEvidenceVersion=1 включает согласованный open.evidenceVersion=1.
Новый Proxy принимает legacy readback для старых навыков; новый профиль требует
совместимый native-плагин до начала MCP. Readback.native содержит полное bounded дерево
с parents, roles, keys/set keys, props, modes, bindings, image hashes и fonts.
После bootstrap неизменность нетронутых native узлов проверяется дополнительно к
section fingerprints, исключая автоматическую геометрию контейнеров.

Для structural finish нужны подтверждённый CorporateContent key из spec.host, один
role=host instance, один role=body SLOT и все секции в нём в порядке spec. Это проверка
заявленной identity/containment, а не полная сертификация CorporateContent. Все keys
и вложенные значения остаются evidence для проверки по источникам.

Успешный get_screenshot без image payload не доказывает доставку изображения.
execution.screenshots хранит call/modelStep, nodeId, image digest и fingerprint;
бинарные изображения остаются в MCP trace. finish.visualReviews связывает просмотр
каждой секции и root с этими deliveries. При отсутствии совпадающего изображения,
critical UNKNOWN/FAIL или missing font сохраняются result и needs-verification.
Ready=false, ownerAcceptance=PENDING. Host-native структура, agent-report норм и
agent-visual-report показываются раздельно. Unsupported CLI image envelope остаётся
UNKNOWN; реальный delivery/font/image route проверяет владелец в пилоте.

Эти source changes не обновляют установленные runtime/data или плагин. Нужен отдельный
совместимый выпуск и его ручная установка владельцем. Synthetic tests не являются
успешным лендингом в Figma; полный прогон и затем follow-up/Stop остаются отдельной приёмкой.
