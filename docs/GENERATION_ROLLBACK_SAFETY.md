# NEXT-04 · безопасный rollback · 06.10.2026

Исправлена потеря чужого содержимого при очистке частично созданного макета.
Прежний host пытался перенести foreign nodes на page, мог скрыть ошибку переноса
и затем удалить их вместе с generated ancestor. Теперь неизвестное содержимое
сохраняется на месте, а результат такого rollback — `incomplete`.

## Граница журнала

`generation-figma-rollback.ts` записывает parent, точный sibling order, local и
absolute transform непосредственно перед синхронной mutation. Это снимок перед
конкретной операцией внутри транзакции, а не предполагаемое положение до начала
генерации. Чужие subtrees непрозрачны: журнал читает только границы внутри
transaction-owned graph и непосредственный список siblings известного parent.
Обходы ограничены 5000 nodes/children/ancestors; unreadable/cyclic scope прекращает
удаление. Page loading и поиск произвольных узлов по всему документу не нужны.

Восстановление разрешено только при известном исходном parent, неизменном
postimage, прежней матрице parent и подтверждённом sibling order. Возвращаются
parent/order/relativeTransform, затем проверяется absoluteTransform. Нужные
generated ancestors и siblings сохраняются, чтобы последующая очистка не изменила
порядок или положение в Auto Layout. Финальная проверка выполняется после cleanup.
Даже подтверждённый `FOREIGN_RESTORED` не означает полную очистку: оставшиеся
generated nodes сохраняют статус `incomplete`.

Foreign content, появившийся без исходного снимка, сохраняется в текущем parent.
Изменения через async boundary и внешние изменения parent/order/transform
считаются drift; журнал не приписывает их host и не переписывает пользовательские
данные. Чужое содержимое не переносится на page по предположению. В случае
ошибки insert/transform сохраняются текущие и исходные ancestors для безопасного
повтора. Удалённый parent не создаётся заново.

## Очистка и результат

Перед каждым `remove()` заново проверяются actual owned children и foreign
boundaries, включая ошибки предыдущего удаления. Mixed subtrees и owned nodes
внутри foreign parent сохраняются; owned orphan на page доступен для очистки.
Неуспешный/no-op remove, unreadable scope и concurrent write не получают complete.
Активный write блокирует rollback без удаления; повтор возможен после его окончания.

Host возвращает `{status, diagnostics}`. Общий Figma adapter сохраняет этот
результат в TargetReceipt и переносит структурированные execution diagnostics.
Старые void rollback hosts совместимы. Некорректный recovery outcome или исключение
дают `incomplete`, а не молчаливый успех. Формат TargetReceipt не менялся.

Пока есть live owned nodes, host сохраняет transaction state и не принимает новый
resolve. После устранения причины можно повторить rollback. Если владелец вынес
unknown foreign content из generated root, оставшееся owned содержимое можно
безопасно удалить; это не превращает неизвестную исходную связь в restored.
Последний incomplete outcome остаётся доступным до явного начала новой транзакции.

## Проверено и остаётся

28 targeted synthetic tests проверяют exact matrices/order, nested roots и mixed
subtrees, opaque foreign children, failed/partial insert и transform, removed или
missing parent, user drift, async write, remove failure с появившимся foreign
content, owned orphans, retries, bounds и adapter receipt. Это fault injection
на synthetic graph, а не native Figma mutation/readback/rollback acceptance.

Shared core **0.1.10**, Editor **0.2.91**, generation-core **0.1.1** прежние;
изменены native host и adapter-figma recovery protocol. Нормативные источники,
контракты, ZIP, registry и authority не менялись. Accepted native binding reader
и primitive policy возвращают null. BG r59 остаётся Draft; profile, canonical
recipes, actual target, live и release acceptance не выполнены. Unchanged browser
suites не повторялись; старые actual user reports и browser receipts не repinned.

Local gates: v4 **231/231** + type-check/build, root **81/81** + type-check/build/
Figma runtime parser, adapter-figma **8/8** + type-check/build passed.
Полные exact final source/runtime/main/UI/build pins сохраняются в
private NEXT-04 handoff отдельно от исторических consumer/read-only receipts.
Compatibility milestone: [PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
Editor: [EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
