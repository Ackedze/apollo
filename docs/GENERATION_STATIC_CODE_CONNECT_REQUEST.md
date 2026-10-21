# NEXT-03 · запрос будущего Code Connect static emit · 06.10.2026

Status: **request-to-review / not-supported / execution blocked**.
Producer owner — Code Connect; этот этап меняет только Generation consumer DTO.
Нормативный source, meaning rules, compiler Ready policy, arui-private producer,
registry/lock/ZIP здесь не меняются. Запрос не является accepted receipt.

## Exact basis

Consumer Draft ports:
`apollo.screen-spec.static-content.v1-draft` →
`apollo.composition-plan.static-content.v1-draft`.
Generation-core package **0.1.1** с additive Draft API, v4 **0.4.0**, shared core
**0.1.10**, Editor **0.2.91**. Exact source/build hashes — в новом NEXT-03 handoff;
старые rollback/browser/user-v2 snapshots к нему не переносятся.

arui-private **80.7.1**, commit
`c037d0c322ea9774a9c251400d76d41222819b87`.
Producer registry **1.1.0**, digest
`4540c8e955a24f7be6ce70dc43e1729a887d4fa4b065ad24ba91ef0f5ef874eb`;
inputs `cf9cc8c43198f40d34998aabc1b7a368385705e5bd48ca355cc8c03e218616a2`;
lock `8dfe66f872d266a66949f9a56d2f1a2d092fc84af04ac72699919403d2a0eae1`;
immutable authoring basis
`bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0`.
Source basis: CC desktop r13 / BG desktop r59 Draft / Button31 / Spinner8.
Producer/source availability does not accept a static Code profile.

## Требуемый emit, не нынешний interactive путь

1. Явно versioned static content input/output, отвергающий events/eventId/onClick/
   handlers/transitions. Не переиспользовать v1 interactive `stateReceipts` как
   proof новой static semantics. Current `screenSpecForProducer` reject сохраняется
   до реализации producer owner и consumer review.
2. Exact mapping CC `arui-private.corporate-content.desktop` slot `body` →
   `props.children`; BG `arui-private.buttons-group.desktop`, size enum string
   `"56"`, fixed Overflow=false route, owned port `button-label`.
3. Два элемента со stable ActionID/label/View/disabled/explicit Loading=false.
   `displayOrder` и independent `priorityOrder` переносить независимо. Не выводить
   priority из `primaryFirst`, View/label или storage order. Если текущий public
   API не может выразить View/order без потери данных — explicit not-supported.
4. Future frontend content emit без no-op onClick/dispatch/useState scenarios.
   Preserve old interactive emit unchanged. Future native emit не меняет nodes
   до accepted SLOT/component-set selected-variant/owned occurrence recipes.
5. Semantic product identities save/back не являются canonical occurrence IDs.
   Подтвердить source-owned CC SLOT crosswalk и BG четыре source occurrences с
   двумя visible product mappings и двумя hidden без удаления. Рецепты/symbol/
   capability должны иметь independent source evidence, не remote suffix/name/index.
6. Новая bounded source/API freshness observation должна связывать input/plan/
   content hash, exact consumer/provider/build, registry/lock/current inputs,
   mapping/representation/profile и полный pinned dependency closure. API proof
   отдельно от profile/parity/live acceptance; static target support пока absent.
7. Runtime width-fit и fonts/Addon/Spinner/loading readback — отдельные trusted
   facts; Imported ScreenSpec/Draft fact hashes их не подтверждают. Три применимых
   context rules и шесть conditional NotApplicable требуют reviewed scoped checker
   receipts. Не объявлять full BG Ready по этим входам.

## Consumer contract / missing fields

Implemented review projection содержит actions и semantic provenance, без code
handlers. CanonicalOccurrenceId/symbolId=null до accepted native review. Draft
fact-input shape допускает только accepted=false и targetSupport not-supported.
Оба нынешних adapter executor отклоняют static version до host calls.

Сейчас owner подтвердил labels Сохранить/Назад, Size56, displayOrder save/back,
width1600/default; View/disabled/Loading=false/business priority/height/actual BG
allocated width не подтверждены. Concrete proposed product profile лежит отдельно
в [review JSON](desktop-content-actions-pilot.static-v1.review.json), accepted=false.
No producer emit/pin refresh requested until exact static protocol/product/profile
review makes it concrete. Source/registry edits выполняет соответствующий owner;
этот request document сам их не разрешает и не утверждает поддержку.

Acceptance future step: strict static version rejection/positive content emit,
no handler creation, ActionID membership/provenance and independent order tests,
exact fresh source/API/profile observations, both targets + source/profile/width/
canonical/scoped blockers preserved until each accepted proof. Actual target/native/
parity/live/release acceptance отдельны.
