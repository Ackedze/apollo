# Design Check: точный переход, обновление и Theme

Интерфейс сохраняет действующую визуальную систему и фиксированную ширину 800 px.

| Действие | Данные UI | Проверка main | Native операция |
| --- | --- | --- | --- |
| Кастомизации: найти | requestId, auditId, evaluationId, targetId | Только реестр текущего снимка; повторный захват исходной области; неизменная ревизия запуска после каждого ожидания и перед native записью; точный ID и текущая видимая PAGE | selection + scrollAndZoomIntoView |
| Кастомные стили: найти | requestId, runId, findingId, targetId | Собственный native реестр и повторная проверка фактов | selection + scrollAndZoomIntoView |
| Обновить | requestId, runId, findingId, targetId, actionId, context | Независимый INSTANCE / SLOT root; current main ID/key/remote, published ID/key/remote; неизменившиеся свойства непосредственно перед записью | swapComponent + setProperties; проверка полученного main |
| Сменить | Тот же закрытый action payload | Текущая PAGE, зарегистрированный anchor, exact collection ID/key/remote и Corp mode ID; повторная проверка области | PAGE.setExplicitVariableModeForCollection; проверка explicitVariableModes |

Параметры компонента, коллекции и режима принадлежат main. UI не передаёт ключ замены или произвольный режим. Операции не объединяются в массовое исправление. Занятое действие блокирует новую проверку, генерацию, смену источника и переходы до ответа. Результат сопоставляется по requestId и runId; неподтверждённый success не снимает busy.

## Связь с v3

Точное разрешение составных ID повторяет принцип `src/actions/sceneNodeResolver.ts`: сначала native lookup, затем поиск **того же полного ID** внутри точного INSTANCE владельца. Имена слоёв и похожие суффиксы не используются.

Опубликованное обновление повторяет native same-key swap из `findingActionResolver.ts` / `corporateComponentAction.ts`. Совместимые свойства восстанавливаются по точному ключу или единственному каноническому имени без `#…` и тому же типу. При неоднозначном соответствии кандидат не угадывает. Динамические внутренние overrides сохраняет Figma своим алгоритмом swap; синтетический тест не доказывает сохранение всех реальных overrides. Состояние после частичной ошибки сообщается как `applied: true`, `verified: false`, а снимок инвалидируется.

Theme соответствует PAGE операции `pageThemizationAction.ts`, не переносу Corporate replacement. Подтверждение Page Theme остаётся узким native подмножеством, а не нормативным подтверждением всей темизации.

## Неподтверждённые случаи

- Для зависимости локального определения найденные внешние occurrences не являются целью замены. Возможные продолжения: открыть исходное определение и проверить его экземпляр отдельно; отдельно согласовать обслуживание определения со своей проверкой overrides; оставить диагностику.
- Если нет точной карты dependency → captured anatomy, дополнительный объект не угадывается. Реестр сообщает gap. Переходы ограничены 1000 подтверждёнными целями одного finding; достижение лимита явно отмечено.
- Если изменился published ID/key или Theme collection/mode, действие не выполняется. Нужен новый результат проверки.
- Смена PAGE Theme не удаляет явно заданные режимы дочерних узлов.
- Кнопка «Привязать», каталоги токенов/стилей, Proxy, нормы, Editor/core и генерация не меняются.

## Проверка

`npm run validate` в корне и `npm --prefix . run validate` используют штатные скрипты. `tests/focus-actions.test.js` покрывает подделку и устаревание identity, отмену, частичную запись и сопоставление ACK. `tests/focus-revision.test.js` воспроизводит source/context/cancel/page/timeout/new-run race на последнем async чтении точного ID и разрешённую смену выделения. `tests/plugin.test.js` проверяет составной focus и отмену через фактический main bundle. `tests/focus-actions.browser.cjs` соединяет фактические dist UI/main с выдуманной native сценой при 800 px; проверяет отдельные категории, single-instance swap, свойства, PAGE mode, busy и отсутствие поздней записи. Native Figma live-проверка остаётся отдельной приёмкой.
