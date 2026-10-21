# Apollo: разбор пользовательской native диагностики v2

06.10.2026 · Apollo 0.4.0 / generation-core 0.1.1 / shared core 0.1.10 /
ComponentContract Editor 0.2.91 / Figma typings 1.141.0.

**Три пользовательских v2 отчёта прошли проверку целостности и точных входов
сборки r59. Этап пользовательского чтения подтверждён.** Генерация и приёмка
native bindings остаются открытыми.

Проверены reportHash, schema, producer/registry/lock/recipe/runtime/build/type/
source pins и актуальная цепочка пяти пакетов. Контракты: ButtonsGroup r59,
CorporateContent desktop r13 / mobile r8, Button r31, Spinner r8. Все 92 входа
built manifest совпадают с текущими исходниками. Исходные пользовательские JSON
читаются без изменений и не включаются в исходники или тестовые fixtures.

| Компонент | Подтверждённое наблюдение | Что остаётся неизвестным |
| --- | --- | --- |
| ButtonsGroup | Ключ варианта соответствует pinned Size56 / Overflow=false; четыре видимых дочерних instance; 12 declared properties прочитаны полностью, типы совпадают | Соответствие четырём authored target occurrences, canonical source identity и symbol recipe |
| CorporateContent desktop | Exact Body property; один direct SLOT с одним FRAME; список полный; limitViolations пуст | Canonical source SLOT receipt, mapping содержимого и соответствие порядку product plan |
| CorporateContent mobile | Exact Body property; один direct SLOT с одним FRAME; список полный; limitViolations пуст | Canonical source SLOT receipt, mapping содержимого и соответствие порядку product plan |

BG rawProperties теперь доступны независимо от canonical match. Отсутствие
нормативных properties при неизвестном targetId не означает, что native API не
прочитал значения. Наблюдаемые подписи, состояния и варианты этих четырёх кнопок
не задают реальные действия для согласованного пилота из двух кнопок.

Во всех отчётах observer доступен: current-page-nodechange,
page-node-events-only, cleanup confirmed. Это snapshot регистрации и отсутствия
зафиксированной ошибки detach на момент чтения. JSON не доказывают последующее
отключение экспорта при смене выделения/страницы или cleanup после закрытия
плагина. Другие страницы и изменения styles не покрываются. Synthetic проверки
invalidation/cleanup остаются отдельным доказательством реализации.

## Почему остаётся incomplete

Сборка успешно прочитала native данные. Для CC не получен канонический receipt
слота и неизвестен mapping FRAME. Для BG не доказана принадлежность observed
instances authored occurrences, отсутствует symbol recipe. Совпадение component
set key или суффикса instance ID не заменяет canonical proof.

Все method executed=false; наличие appendChild/insertChild/resetSlot/setProperties
не подтверждает возможность безопасной записи. Native mutation, readback,
rollback, generation/profile/live/release acceptance не выполнены. Accepted
binding и primitive providers по-прежнему null. BG Source Draft: все 26 rules
Reviewed, но девять context-only nonExecutable остаются открытыми.

## Следующие action points

1. **Native adapter / владелец контракта:** получить и отдельно принять canonical
   SLOT source receipt для CC и exact occurrence correspondence для BG. Связать
   receipt с source/component/property pins; observed candidates сохранить отдельно.
2. **Native adapter / владелец контракта:** определить scoped symbol recipes,
   primitive policy и accepted provider. Проверить mutation/readback/rollback
   отдельным согласованным запуском.
3. **Владелец контракта / compiler:** решить scope девяти context-only правил BG
   или принять явную ограниченную generation authority. Полный Source Draft
   сохраняется до выполнения авторитетных критериев.
4. **Автор ScreenSpec:** задать реальные labels/action IDs/handlers/priority/
   loading/lifecycle/runtime width constraints для desktop CC Body → BG56,
   Overflow=false, двух обычных text actions; scope пилота content-only.
5. **Пользовательский retest:** отдельно подтвердить отключение старого экспорта
   при смене выделения/страницы и cleanup. Повторное чтение тех же raw values
   для уже закрытого доказательства не требуется.
6. **Figma/frontend adapters:** после принятия точных scoped inputs проверить
   target scenarios, parity, profiles, live и release независимо.

Shared schemas/checkers/compiler и нормативные входы не менялись. Agent Figma
API calls, import/page loads, Proxy deployment и target generation не выполнялись.
Ранее проверенные frontend imports/scenarios и browser receipts сохраняют свои
исторические версии; этот разбор не переводит их на новые pins.

Прежние v1 файлы сейчас отсутствуют по исходным путям. Их прошлые verification
receipts сохранены неизменными; текущий разбор не восстанавливает файлы и не
переписывает исторические результаты. Новые v2 доказательства отдельные.

Private assessment и machine handoff:
`/private/tmp/next04-r59-user-v2-review/assessment.json`,
`/private/tmp/next04-r59-user-v2-review/handoff.json`.
Полные приватные IDs/values/hashes находятся только в private assessment и
пользовательских inputs; этот документ содержит итог проверки и action points.

[Сборка и exact vector](GENERATION_R59_CONSUMER_READY.md),
[первый v2 fix](GENERATION_NATIVE_OBSERVATION_REVIEW.md),
[APOLLO-V4-PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
[EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
