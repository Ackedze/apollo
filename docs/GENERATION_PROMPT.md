# Планирование ScreenSpec по промпту и контрактам

Панель генерации → `/generation/plan` → текущий Code Connect producer →
authoring manuals с точными зависимостями → настроенный read-only CLI агент →
Draft ScreenSpec → существующий `GenerationController.prepare` → один общий
CompositionPlan → отдельные адаптеры Figma и фронта.

Планирование использует правила `manual.rules`, semantic API, generation profiles
и остальные разделы собственных manuals. Compiled predicates и старый semantic
planner не заменяют авторские нормы. В запросе разрешены только описание,
платформа и viewport; сервер выбирает каталог и producer по существующей
конфигурации Proxy. Сейчас root-компоненты ограничены mappings текущего producer;
зависимость без root mapping не становится самостоятельным доступным компонентом.

До вызова агента проверяются producer, архивы, собственные manual hashes,
revision/dependency closure и текущая сборка. После ответа повторяется проверка
неизменности входов. Агент не задаёт hashes, статус источника или приёмку. Ответ
проверяется существующей схемой ScreenSpec, платформой/viewport запроса и
наличием mapping/semantic port. Недостающие продуктовые решения сохраняются
в `unresolved`. Проверка applicability/domain/cardinality и допуск к записи
остаются в существующем preflight; составление спеки их не заменяет.

В панели есть чат уточнения: исходное описание, ответы Apollo и JSON каждой
успешной версии остаются в истории. Следующее сообщение передаёт
полный исходный запрос, уточнения по порядку и последний черновой ScreenSpec
через прежний bounded prompt API. Последнее уточнение имеет приоритет; текущие
контракты перечитываются при каждом запросе. Если контекст превышает лимит
12 000 символов, отправка отклоняется без скрытого сокращения и потери истории.

Ввод уточнения или изменение viewport сохраняет предыдущий JSON и экспорт,
но сбрасывает прежний допуск к исполнению и блокирует проверку до нового ответа.
Ошибка и отмена также сохраняют историю и последний успешный ScreenSpec.
«Новый экран» явно очищает текущую сессию; переход между разделами её сохраняет.
История, последний Draft, composer и viewport сохраняются в Figma clientStorage
на устройстве: закрытый bounded протокол, максимум 2 МБ / 512 сообщений,
serialized writes и request IDs отдельные для каждой перезагрузки UI. Ошибки
сохранения не очищают текущую историю; доступен экспорт JSON. Старый ответ load
не заменяет новый ввод или импорт. Execution session, receipts, contract
evidence и допуск к записи не восстанавливаются; нужен свежий prepare.
«Составить ScreenSpec»/«Отправить уточнение» не запускает prepare или execute. Для
каждого target требуется прежняя отдельная приёмка source/native/code/profile.
Draft source разрешён только как вход планирования и остаётся Draft в receipt.

Сервис использует существующий структурированный CLI порт Proxy и его текущую
авторизацию/provider. Новый ключ, dependency, skill или доступ к произвольному
URL не добавлен. Запрос агента read-only; private manuals не сохраняются в
tracked source/fixtures и не выдаются в ошибки. Одновременно выполняется одно
планирование. «Отменить ожидание» игнорирует поздний ответ, но агент может ещё
завершаться на сервере; повтор в это время получает bounded busy error.

Для подключения маршрута к уже запущенному ApolloProxyControl необходимо
перезапустить процесс с обновлёнными source bytes. Принятие generated output,
живой вызов модели, запись в Figma и экранная parity — отдельные проверки.

## Проверка подключения 09.10.2026

V4 build/type-check и 576 tests, root 81 regression scripts и 41 Proxy generation
tests прошли. В реальном каталоге прочитаны CC r13, BG r60, Button r31 и Spinner
r8; контекст 174031 bytes сохраняет BG SourceDraft. Панель проверена при
440/360 px без горизонтального overflow. Живой ответ агента был отклонён схемой;
следующий запрос после уточнения формата остановлен до модели на
`STALE_CURRENT_AUTHORITY_REF`: manifest.json и draft-manifest.json каталога
изменились относительно закреплённого producer-handoff. Синхронизация producer
и успешный живой ScreenSpec остаются открыты; запись targets не выполнялась.

Повторная финальная сборка также остановилась в existing native diagnostic input
loader на рассинхронизации этих manifests. Собственная UI правка оставлена на версии последней успешной сборки. При
сверке обнаружены параллельные изменения compiler.ts, text-content-facts.ts и
DocumentAudit.tsx; они не изменялись в этой задаче. Поэтому актуальность общего
source/build snapshot не подтверждена; незавершённая сборка не считается PASS. Требуется новый согласованный producer handoff, затем rebuild
и повторный живой прогон.

## Reader и текущая сборка 09.10.2026

Scoped producer для Editor 0.2.94/core 0.1.13 подключён через точный
handoff path/SHA. Рабочие registry/lock совпадают с закрытым producer digest
00882354399fa4c8e59eb9aa384f7dd549880465f383b91dce3af9fe74ce591f.
Generation type-check/build и 193 tests, normal V4 validate с 582 tests и root
validate с 81 regression scripts прошли. Все 201 build inputs актуальны;
233 остальных source inputs сохранены. Предыдущий STALE_CURRENT_AUTHORITY_REF
в штатной сборке устранён. Эти результаты заменяют незавершённую повторную
сборку, описанную выше, и не принимают source/native/code/profile/live gates.

CC desktop r13/mobile r8 Source Ready subset нормализован. Штатная инспекция
теперь выбирает Ready roots по sourcePredicateStatus=ready и compiledStatus=ready;
BG r60 со Source Draft/scoped compiled Ready проверяется отдельно и остаётся
blocked на normalization gate PRODUCER_VIEW_STALE. Legacy SOURCE_COMPILE также
поддержан; неожиданный successful Draft не принимается. Две регрессии и штатный
inspector receipt подтверждают это разделение без status promotion.
Планировщик прочитал точные authoring контракты и dependency closure:
174031 bytes, BG Draft сохранён. Модель этим read-only context check не вызывалась.
Живой успешный ScreenSpec подтверждён отдельным прогоном ниже.

## Живой Draft ScreenSpec 09.10.2026

Реальный read-only CLI вызов через штатный `/generation/plan` дал HTTP 200:
CorporateContent desktop с текстом в Body, viewport 1600×900 и default state.
Schema, mapping/semantic ports, request/input/context/spec/result hashes проверены;
Draft и executionAllowed=false сохранены. Это временный localhost HTTP экземпляр
существующего Proxy app; рабочий сервис на 3001 не запускался и не перезапускался.
Figma/frontend targets не исполнялись. Проверка UI → штатный service остаётся
отдельной после запуска service владельцем.

Причина прежнего PROMPT_SPEC_INVALID установлена: модель возвращала
states.values как объект вместо массива ID. Planner prompt теперь задаёт явный
формат {"initial":"default","values":["default"]}. Канонический validator
не ослаблен, регрессия отклоняет map states. 42 generation Proxy tests прошли
с разрешённым loopback. В созданной спеке сохранён unresolved о выборе page mode
фона и отсутствии semantic API порта; такой Draft не разрешает target execution.

Подтверждённый specHash:
09ee0d0400def6538545c4d10096e7843b8c29ab9aa12247c9e3013a1fd24de0.


## ScreenSpec v2: no business action и capability gaps (09.10.2026)

Generation consumer поддерживает `apollo.screen-spec.v2-experimental`. В этой
версии `actions.items` содержит либо прежний `eventId`, либо явное
`behavior: "none"` без eventId. Вторая форма не создаёт onClick, событие,
переход или disabled. Это произвольная композиция общего DTO, а не расширение
узкого static-content v1 Draft review. Старый ScreenSpec v1 остаётся строгим.

V2 требует `capabilityGaps: [{code, message, nodeId?}]`; `unresolved` остаётся
списком продуктовых вопросов. Capability gaps показываются отдельно в чате и
блокируют оба target в preflight. Известный stack/gap, количество и подписи
сохраняются даже при отсутствующем target mapping.

Общие adapters поддерживают DTO; синтетические проверки не принимают реальные
source/native/profile рецепты. Текущий legacy Code Connect consumer требует
onClick и получает `PRODUCER_NO_ACTION_UNSUPPORTED` вместо `event_-1`. Его новый
input/profile и planner instructions должен согласовать владелец. Proxy этой
задачей не изменялся. Overflow коллекция и page background всё ещё требуют
точных контрактных портов и обоих target bindings.
