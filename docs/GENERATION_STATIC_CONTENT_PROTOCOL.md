# NEXT-03 · CONTENT-ONLY-OWNED-PORT · 06.10.2026

Реализован отдельный Draft API для статического CC desktop Body → BG56 /
Overflow=false с двумя обычными текстовыми действиями. Он валидирует данные и
строит детерминированный content plan без событий, callbacks и no-op handlers.
Ни producer, ни Figma/frontend execution не включены. Source Draft/profile/
canonical/width/scoped authority gates сохраняются.

## Версии и совместимость

- `apollo.screen-spec.static-content.v1-draft`: `StaticScreenSpec`.
- `apollo.composition-plan.static-content.v1-draft`: `StaticCompositionPlan`.
- `apollo.static-content-fact-input.v1-draft`: `StaticFactInputDraft`.
- `apollo.static-content-preflight.v1-draft`: всегда Draft / targets blocked.

Экспорты generation-core: `validateStaticScreenSpec`,
`createStaticCompositionPlan`, `createStaticFactInputDraft`,
`validateStaticFactInputDraft`, `preflightStaticPlan`. Existing `ScreenSpec`,
`OwnedAction`, `CompositionPlan` и interactive v1 schema/producer/handlers не
мигрированы и не расширены union. Package versions прежние: generation-core
**0.1.1**, v4 **0.4.0**, shared core **0.1.10**, Editor **0.2.91**; новая Draft
wire version и exact source/build hashes отделяют этот API от прежнего snapshot.

Apollo panel пока принимает interactive v1. Static Draft import выдаёт
`STATIC_PROTOCOL_UNSUPPORTED` до readContext. Оба adapter execution entry points
отклоняют неизвестную/static plan version до trusted context, Proxy, native import,
mutation, file creation и rollback. Existing producer emit также отклоняет static
ScreenSpec. Verification проверяет version и closed v1 schema; подделка static
fields под v1 discriminants не получает interaction PASS. Browser code/control
flow не менялись; существующие browser receipts остаются историческими.

## Closed shape / content plan

Схема ограничена уже согласованным пилотом: desktop, viewport width1600 с точной
height, одна default state, две component nodes, `body`→`button-label`, Size string
`"56"`. Нет stack/text primitives, Overflow props, events/transitions или imported
authority/recipes. Root/tree/ports/cardinality заданы явно. Каждое действие требует
уникальный ActionID, непустой label, View primary/secondary, disabled boolean,
**явный loading:false**. Unknown/null/missing поля блокируются.

`displayOrder` и `priorityOrder` — две отдельно заданные перестановки тех же IDs.
priorityOrder перечисляет действия от большего к меньшему бизнес-приоритету.
Ни label, ни View, ни порядок хранения items не задают бизнес-приоритет. Проекция
сохраняет displayOrder, а priorityOrder переносит отдельно; противоречие выдаёт
`STATIC_PRIORITY_ORDER_MISMATCH`, без скрытой перестановки действий. Одинаковые
labels допустимы: identity/membership сравнивается по ActionID.

Plan frozen и не заимствует mutable input. `contentHash` относится к явной
проекции; source/spec/view/registry/code pins отдельно связаны с plan. Перестановка
хранения items не меняет content projection, но original specHash сохраняет факт
изменения входа. Каждый ActionID имеет semantic owner/port provenance; canonical
occurrence/symbol IDs остаются null. Requirements сохраняют четыре source
occurrences, две visible actions, две hidden без удаления, девять exact context
RuleIDs и полную coverage source dependency closure. Это требования, не verdicts.

## Draft fact input и preflight

`createStaticFactInputDraft` выдаёт отдельный review DTO с planHash/buildHash,
width slots Figma/frontend=null, canonical crosswalk=null и targetSupport
`not-supported`. Его нельзя вложить в ScreenSpec. Candidate width требует exact
ActionID membership, available width≤1600, две button widths, gap/padding,
measurementHash/fontHash. Candidate canonical input содержит CC source owner/
property/SLOT и четыре distinct BG occurrences/symbol IDs: две visible product
ActionIDs, две hidden с actionId=null. Даже полностью заполненный DTO обязан иметь
`accepted:false`; hashes не доказывают actual measurement/canonical acceptance.

Строгая validator отвергает новые поля/versions, acceptance=true, чужой planHash,
неполную/дублированную membership и неизвестные capability claims. Candidate
width-fit или порядок проверяются для review: отрицательный результат блокирует;
положительный не выдаёт PASS или NotApplicable. `STATIC_FACT_INPUT_UNACCEPTED`
остаётся даже при заполненных candidate slots. BuildHash здесь — заявленный
candidate pin; trusted actual build/provider receipt validation не реализована.

Static preflight сохраняет Source Draft/errors, exact contract/dependency lock,
source mapping pins, representation/source API checks и coverage; отдельный
static Code profile/native recipe/scoped receipt/producer/target gate всегда
blocked. Missing fields получают closed diagnostics `STATIC_PRODUCT_INPUT_REQUIRED`,
`STATIC_PRIORITY_REQUIRED`, `STATIC_DISPLAY_ORDER_REQUIRED`,
`STATIC_CANONICAL_CROSSWALK_MISSING`, `STATIC_WIDTH_FACTS_MISSING`;
unknown shapes/version/acceptance отвергаются. Full BG59 остаётся Draft с девятью
context-only nonExecutable rules. Current accepted native provider и primitive
policy null; отдельного text primitive в этом пилоте нет.

Применимые priority/membership/loading rules и шесть conditional NotApplicable
требуют будущих trusted facts/checkers, fresh Overflow=false, полную absence/
membership и actual width-fit. Existing 30 BG predicates + Button31/Spinner8
checks, Addon/font/content readback, preserved four occurrences, native capability/
mutation/rollback и actual target/profile/parity/live остаются отдельной приёмкой.
Никакой Source Ready/compiler bypass здесь нет.

## Реальные продуктовые входы

Владелец подтвердил «Сохранить», затем «Назад», обе кнопки 56; width1600/default.
General назначил plan IDs `save`/`back` по этим действиям. Это локальные product
identities, не canonical Figma/node/symbol адреса. [Новый input draft](desktop-content-actions-pilot.static-v1.input-draft.json)
сохранён с null для ещё не заданных View/disabled/Loading/priority/height. Он
**schema-invalid до заполнения**, и даже затем executionAllowed=false.
Предыдущие pinned drafts/handoffs сохранены как исторические snapshots.

[Конкретный профиль для review](desktop-content-actions-pilot.static-v1.review.json):
Save Primary / Back Secondary, обе enabled, Loading=false, save выше back по
бизнес-приоритету. Это **proposal until owner review**; текущий input draft не
подставляет эти значения. Height и allocated width также не придуманы. Product
уточнения ведутся в General, повторный запрос scope/technical ID не нужен.

## Producer / adapters следующий этап

[Exact Code Connect request](GENERATION_STATIC_CODE_CONNECT_REQUEST.md) описывает
будущий emit без onClick и новые consumer/version/proof obligations. Запрос
подготовлен, не отправлен через messaging tool и не меняет producer/registry.
Adapter static verification slots нужны для semantic ActionID→artifact/source
provenance, сохранения four/two-hidden membership, priority/disabled/loading/font/
width readback и полного pinned source+dependency verdict coverage. Их наличие в
requirements не создаёт accepted receipt format или executable handler.

Synthetic fixtures используют собственные labels/source IDs/contexts, а не
user captures или manuals. Standard compatibility/schema/priority/source/profile/
producer/target negative gates сохраняются в private final handoff с exact hashes.
Actual Figma tools/imports/mutations/page loads, target artifacts, new browser runs,
profile/live/release acceptance не выполнялись.

Backlog: [PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
Editor [EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).

Local final gates: generation-core **75/75**, v4 **233/233**, adapter-figma **9/9**,
adapter-frontend **13/13**, root **81/81**; corresponding type-check/build passed,
root Figma runtime parser passed. Actual target/live/profile release не приняты.
