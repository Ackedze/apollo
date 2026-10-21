# NEXT-04 · входы статического пилота · 06.10.2026

Согласован desktop CorporateContent Body → ButtonsGroup Size56 / Overflow=false:
две обычные текстовые кнопки, только содержимое. Владелец подтвердил viewport
width **1600** и одно состояние **default**. Повторное согласование scope не нужно.
Business/backend/navigation handlers, события и переходы для этого пилота не нужны.
Прежний запрос обработчиков в v2 review superseded этим уточнением.

## Продуктовые поля

| Поле | Сейчас | Для review и исполнения |
| --- | --- | --- |
| Viewport | width=1600; default | Точная height; width остаётся 1600 |
| Две кнопки | Не заполнены | Для каждой стабильный ActionID, настоящая надпись, View Primary/Secondary, disabled boolean |
| Priority | Не заполнен | Независимый `priorityOrder` из двух ActionID; не выводить из View, label или source occurrence order |
| Loading | Статическая ветка | Явное `Loading=false` для каждой кнопки; слово default само по себе не подтверждает это свойство |
| Body / BG width | Не подтверждена | Доступная ширина группы и измеренные button widths/gaps/padding при source fonts; точная ширина или ограниченный набор/диапазон |
| Events / transitions | Не нужны | Статическая проекция без фиктивных handlers/no-op events |

Четыре наблюдённые source кнопки не являются продуктовыми ActionID, надписями или
приоритетами. View в текущем ScreenSpec кодируется `primary`/`secondary`; Size —
строковый enum `"56"`. Typed semantic routes: CC slot `body`, BG action port
`button-label`. Overflow=false закреплён producer/profile route, а не новым props
ключом. `priorityOrder` и Loading не добавляются в закрытый OwnedAction самовольно.

[ScreenSpec input draft](desktop-content-actions-pilot.input-draft.json) сохраняет
подтверждённые поля и null для отсутствующих. Это валидный JSON, **не валидный
ScreenSpec и не файл для запуска**. [Review projection](desktop-content-actions-pilot.review.json)
— технический дизайн, не поддерживаемый импорт/receipt. Оба accepted=false/executable=false
по смыслу; наличие review JSON не включает ни один execution gate.

## CONTENT-ONLY-OWNED-PORT: отдельное техническое изменение

Сейчас `OwnedAction.eventId` обязателен, schema требует объявленный event, producer
строит `onClick.handlerRef`, а native host требует scenario binding для events.
Поэтому две статические кнопки с пустыми events импортировать этим протоколом нельзя.
Реальные business handlers не являются недостающим продуктовым входом.

Следующий review должен определить версию/совместимость статического режима,
отдельный content DTO для двух действий и независимый priority/loading fact
contour. Для Figma он связывает ActionID с accepted occurrence/symbol recipes;
для фронта выдаёт content projection без no-op onClick и без claimed event coverage.
UI default-state observation остаётся проверкой фактического содержимого/геометрии,
а не fake scenario PASS. Старый interactive OwnedAction protocol сохраняется для
реальных интерактивных сценариев. Schema/planner/producer/adapters/checker изменение
требует отдельной реализации и review; в этом этапе оно не активировано.

## Каноническая проекция и проверки

Сохраняются все четыре штатные BG occurrences; две имеют visible product mapping,
две остаются скрытыми без удаления. Полный ActionID→occurrence→symbol provenance
задаётся accepted native recipe, а не индексом, именем или remote ID suffix.
CC Body требует independent source SLOT owner/property/address crosswalk.
Component-set/selected-variant native capability и writer support отдельно от
одного read-only наблюдения. Labels требуют source font и фактический readback;
отдельного text primitive в этом плане нет. Primitive policy понадобится лишь
при его добавлении.

Три применимых context-only RuleID:

| RuleID | Fresh facts / проверка |
| --- | --- |
| `component:buttons-group.desktop.buttons-group.actions-descend-by-priority` | Независимый priorityOrder и фактический canonical visible ActionID order |
| `component:buttons-group.desktop.buttons-group.visible-and-overflow-actions-are-unique` | Disjoint visible/overflow ActionID sets, полная membership/provenance и наблюдённое отсутствие overflow; label uniqueness не подходит |
| `component:buttons-group.desktop.buttons-group.visible-button-loading-follows-button` | Явный Loading=false, Button r31 checks и actual Addon/Spinner evidence с pinned Spinner r8 |

Остальные шесть RuleID получают **NotApplicable** только после fresh
Overflow=false + complete membership/absence + actual runtime width-fit:

- `component:buttons-group.desktop.buttons-group.overflow-moves-nearest-action-first`
- `component:buttons-group.desktop.buttons-group.single-icon-opens-overflow-list`
- `component:buttons-group.desktop.buttons-group.overflow-container-follows-platform`
- `component:buttons-group.desktop.buttons-group.overflow-items-preserve-action-content`
- `component:buttons-group.desktop.buttons-group.disabled-state-is-preserved-in-overflow`
- `component:buttons-group.desktop.buttons-group.overflow-list-closes-after-action`

Это критерии review будущего trusted fact producer/checker для девяти правил,
не текущие verdicts. Любой computed overflow, Loading transition, неизвестная
membership или неподтверждённый width прекращает статическую ветку. Выполняются
также все существующие 30 BG predicates и полная pinned dependency проверка.
Fresh receipts должны быть привязаны к source/registry/provider/plan/build,
width basis и двум adapter outputs; они не заменяют native mutation/readback/
rollback, target/parity и live acceptance.

## Открытые action points

1. Заполнить продуктовые поля выше; width1600/default уже сохранены.
2. Source owner/exporter: CC SLOT и все четыре BG canonical source/occurrence/
   symbol correspondence с independent evidence.
3. Generation core/adapters: принять CONTENT-ONLY-OWNED-PORT и scoped fact/checker
   contour для всех девяти правил, сохранив существующие interactive semantics.
4. Native adapter: accepted CC SLOT writer и BG component-set/selected-variant
   recipe с четырьмя occurrences и двумя видимыми; capability/readback/rollback.
5. Оба adapter: width-fit, exact pilot profile acceptance, actual target/parity/live.

Ни один шаг здесь не обходится заполнением fake event или объявлением BG Ready.
Full BG source **r59 Draft**, code profiles Draft/not-accepted, accepted native
provider/primitive policy null. Core **0.1.10**, Editor **0.2.91** и generation-core
**0.1.1** неизменны. Source readiness handoff 06.10.2026 — coordination evidence,
не accepted receipt; его historical consumer pins не относятся к новой rollback
сборке. Original user v2 reports также остаются в своих exact historical snapshots.

Source review: [NEXT-02 generation readiness](../../../../../shared/design-system_ab/experiments/web-corp/ButtonsGroup/authoring/reports/NEXT-02.generation-readiness-review.2026-10-06.md).
Compatibility: [PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
Editor [EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
