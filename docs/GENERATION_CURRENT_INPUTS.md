# Current producer → Generation consumer · 06.10.2026

Apollo и установленный локальный Proxy читают Code Connect registry **1.1.0**
с authoritative ZIPs BG r58, CC desktop r13/mobile r8, Button r31/Spinner r8.
`STALE_CONTRACT_PIN` и `PRODUCER_SCHEMA` для этих текущих входов устранены.
BG останавливается на независимом `SOURCE_COMPILE`: Runtime requires an accepted
ready contract. CC проходит actual source/API gate, но не получает target acceptance.

Consumer: **generation-core 0.1.1 / adapter-frontend 0.1.1 / v4 0.4.0**.
Общий contract core **0.1.10**, Editor **0.2.91**, adapter-figma **0.1.0** сохранены.
Новая normative contract schema не создавалась. Все producer/DS inputs, historical
reports, authority versions, release/manifests и publication остаются у владельцев.

## Совместимость и проверка входов

- `planning.verifyCodeConnectInputs` явно поддерживает registry 1.0.0 и 1.1.0;
  неизвестная версия отклоняется. Старый exact lock protocol сохранён.
- Для 1.1.0 проверяются все поля lock, включая `basisRegistryDigest`,
  `currentInputsDigest` и `inputPackages`. Данные сохраняются в
  `MappingRegistry.source.producerInputs`, а не удаляются при normalization.
- Exactly three mapped roots plus two transitive inputs: BG → Button → Spinner
  и оба CC. Проверяются archive/main manual/ZIP manual/semantic source/compiled
  entry/full facts hashes, direct and embedded dependency pins, runtime markers,
  source/coverage metadata, typed bindings и code representation scope/passport.
- Node-only `generation-current-producer.js` вызывает настоящий producer
  `verifyLock`/`verifySource`: actual filesystem, main-vs-ZIP, embedded closure,
  authorities и immutable basis history. Узкий reload producer modules исключает
  старый cached reader при обновлении registry. Повторное чтение bytes перед
  trusted return и после async host стадий отклоняет drift.
- `generation-code-connect-inputs.js` по-прежнему строит GenerationView только
  через canonical authoring loader с Ready gate. Whole-package Draft bypass и
  scoped generation authority отсутствуют. Producer inputObservation подтверждает
  свежесть API/source inputs; plan/profile acceptance из него не следует.

## Authority и pins

Producer handoff: [NEXT-02 registry refresh](../../../../../arui-private/tools/code-connect/reports/NEXT-02-registry-refresh.2026-10-05.md),
JSON SHA `86cb0cad5f20a9e5723956815b3856df7456b0f5c1303339c389c5daa94239c1`.
Authoring handoff: [typed passport](../../../../../shared/design-system_ab/experiments/web-corp/ButtonsGroup/authoring/reports/NEXT-02.typed-passport-packaging-handoff.2026-10-05.md).

| Pin | Значение |
| --- | --- |
| Current registry digest | `129d129ea3b5b3e4bb112b2cccd1414f59ff8d22cde00721dd58a3dea978fa90` |
| Immutable basis digest | `bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0` |
| Current inputs digest | `a3c49ed715fd95a83ebd4bc46f11a124aee13258cf2bf696980f5983bdfd3ed6` |
| Registry bytes SHA | `c9d12596b43d1051992fa5e624f8e0aab533ebd97f45f0d6ac3586632c28290e` |
| Lock bytes SHA | `adaaf649a6767882d5d797047eb094bb7098965a008acc804ec2608c65e1dd00` |
| Canonical lock hash | `b1e65e9068623e997184d99ce60cff018c45a17a8e487bfead72661a4af3d99c` |
| Typed authority JSON SHA | `872953dbf59b20c823ec187d3db694344a51d5bebb8893837555968284c8679d` |
| Packaging authority JSON SHA | `79fb6dd85a5288794b78dd3cf62cd4e5e5d0e6d087bf7aa7616c333a7a434087` |

Actual archive bytes verified by the fresh provider:

| Вход | Revision | Archive SHA256 |
| --- | --- | --- |
| ButtonsGroup | 58 | `c681b49ce0357d70644eed275c7b0e79c4ffc4d80419438cc9453ce859813d32` |
| CorporateContent desktop | 13 | `5848372939d4758635b41d92b4cee94815386507040002f7c2807fd1957955be` |
| CorporateContent mobile-web | 8 | `78a0352a0a2a208f725c94d14ec7f1f4390417d6deaece8edc31592df553727e` |
| Button | 31 | `cd363081f2c8f5cf53d05fa674490e6ba719d46faebc4a7f513130a0f1676330` |
| Spinner | 8 | `8c38d4d3faa9014d7d2ed16e745b0150e9996d576ede807bd87019f441bdbc0f` |

Fresh representation observations for all three roots verify full source scope,
immutable basis/current digest separately, current codeHash and each evidenceRef.
`acceptedProfileIds=[]`. The all-roots read-only proof is observational; it cannot
supply a BG Ready GenerationView or accepted plan receipt. The selected CC actual
context has its own exact codeHash and producer state receipt, independent of the
broader observational codeHash.

## Frontend host и historical evidence

Host сверяет current plan registry с fresh current producer snapshot. NEXT-05
source-build/API recipe/environment reports остаются immutable historical evidence;
сохранённые старые registry/template/example bytes читаются из producer-owned
history с exact SHA. Исторические PASS не объявляются проверкой нового плана.
Current contract/archive/authority freshness проверяется новым producer bridge.
Selective genuine distribution, implementation/API/build pins и environment gaps
сохранены. React peer/full library gap не закрыт; новых installs не было.

Новый synthetic-local host run обоснован изменением producer-derived bridge:
real TypeScript/Vite и Chrome снова проверили baseline, opt-in equal-label Picker,
width failure, command drift и cancel cleanup. Receipt compile.toolchain содержит
currentProducer и отдельно historicalBehavior. Нормативные RuleID checks остаются
unknown, aggregate incomplete. Эти результаты не принимают авторские профили.

## Actual consumer результаты

| Область | Текущее доказательство | Оставшийся gate |
| --- | --- | --- |
| Producer API/current inputs | Actual 1.1.0, full five-package closure, full lock/meta/facts/pins | API freshness не означает parity |
| CC source | Canonical r13/r8 Ready; 6 existing source rules и 17 checks каждый | Code representations Draft; broader layout/profile не принят |
| Button/Spinner source | Canonical Ready subset, exact Spinner direct/embedded link | Independent live/release acceptance |
| BG source | r58 Draft; 17 predicate/Reviewed + 9 context-only Draft, 30 checks | `SOURCE_COMPILE`, full Ready source требуется |
| Code profile/parity | API available; representations Draft, profiles not accepted | Exact owner source/profile/parity/receipt acceptance |
| Native Figma | Port connected, accepted binding/capability policy отсутствует | Fresh recipes/native SLOT capability/live acceptance |
| Frontend normative execution | Port connected; current HTTP gate проверен, no artifact | Accepted source and profile/presentation/width/commands |
| Synthetic local frontend | Real compile/browser, fresh current producer; incomplete | Не является нормативной приёмкой |
| Live / release / publication | not-run / not-run / not-run | General и владельцы, отдельные receipts |

Installed Proxy обновлён только в isolated Generation service. Built main → built
UI → installed Proxy с текущим BG возвращает `SOURCE_COMPILE`; CC-only diagnostic
возвращает confirmed API / Ready source с `CODE_PROFILE_UNACCEPTED` и native
blockers. Create disabled, zero native writes. Actual frontend execute BG → 422
SOURCE_COMPILE; CC с exact plan/pins → GENERATION_PREFLIGHT_BLOCKED, no receipt or
artifact; cancel → 200. Synthetic factory недоступна через HTTP/ScreenSpec.

Gates: Generation **55/55**, v4 **185/185**, frontend **12/12**, root **81/81**,
related Proxy **38/38**; typecheck/build/Figma parser и Chrome UI 440/360 passed.
Отрицательные cases покрывают old/new/unknown producer, missing/forged metadata,
extra lock fields, repacked/transitive pins, basis/current/code/scope/ref/facts
mismatch, unsupported runtime markers и independent Draft/profile block.
Первый browser запуск без PLAYWRIGHT_MODULE и Proxy test без loopback permission
не прошли из-за среды; повторные запуски с existing runtime/permission прошли.
React output logic не менялась; повторный Doctor этого этапа не требовался.

## Артефакты проверки

Private temporary evidence не скопировано в tracked fixtures:

- `/private/tmp/next03-current-consumer-proof.json`: actual five-input snapshot,
  all-root fresh representation observations, four-Ready subset lock и BG source gate.
- `/private/tmp/next03-ready-context-proof.json`: selected CC canonical context,
  exact producer/representation codeHash, actual plan/preflight without acceptance.
- `/private/tmp/next03-installed-proxy-proof.json`: actual context/execute/cancel.
- `/private/tmp/next03-built-source-gate.json`, `next03-built-ready-gate.json`,
  `next03-source-gate.png`, `next03-ready-gate.png`: actual built main/UI evidence.
- `/private/tmp/next03-baseline-evidence.json`, `next03-overflow-evidence.json`,
  `next03-real-host.log`: fresh synthetic-local real compile/browser and cleanup.
- `/private/tmp/next03-*-final.log`, `next03-proxy-related.log`,
  `next03-build-pins.json`: successful local gates and build bytes.

Temporary Ready subset lock covers CC desktop/mobile, Button, Spinner; full
BG+CC Generation source lock не выдан. Producer lock 1.1.0 принят как input pin
protocol отдельно от Ready generation package lock. Current producer observations
не регистрируют accepted target profile и не меняют saved basis digest.

Повторяемая readonly проверка:

```sh
node scripts/inspect-current-generation-inputs.cjs \
  /Users/alexkukhta/Desktop/workplace/arui-private \
  /Users/alexkukhta/Desktop/workplace/shared/design-system_ab/experiments/current-contract-packages \
  /private/tmp/next03-current-consumer-proof.json
```

## Consumer build pins

Compiler source/build inputs не дрейфовали при последней сборке; exact runtime
bytes приведены ниже. Hashes main/planning/adapter отражают новый
consumer. Historical NEXT-02/NEXT-04/NEXT-05 hashes остаются historical snapshots.

| Файл | SHA256 |
| --- | --- |
| `dist/runtime.cjs` | `2823427b6f8652e4b5ed5098c09badf632a057383e5c9536f3f3ca13d28d3b7c` |
| `dist/build-inputs.json` | `b801022055d736dc9e0397716caf50171ed779867dd27ee13f3e967129d77a31` |
| `dist/code.js` | `53c56ba599675594af29431a31afb5cdd73dd7bb7f980e7182106a5e1c57cea0` |
| `dist/ui.html` | `7301e11d34de90708aea13e99dafbb5da9b4b08a7060d6a6f83abde4b8ad7f03` |
| `packages/generation-core/dist/index.cjs` | `6d4559e2e7c9b7cd6ecabb2386986971e9f27a212a283cd63c5521c3f8d053b9` |
| `packages/generation-core/dist/planning.cjs` | `dc51ff1ebab900d4b1ff17aac933ccb8b26474eb44b2b949e10aabfc7da70bba` |
| `packages/adapter-frontend/dist/index.cjs` | `5f468ee19a6b5fd7dbbc89bef87bd5c3bbbc9c32ae48f573236f19e5b6c43137` |
| `packages/adapter-frontend/host/frontend-host.cjs` | `3b82fc57fa17ec66e0ebf4e7db9c86a4a1503c530565114c2c94918ac01150dd` |
| `packages/adapter-frontend/host/frontend-toolchain.cjs` | `d0294aa43a3d5bbcdea99ba2cd6d67564169fa5a9143aff748de0e5dae17d1cc` |
| `scripts/generation-current-producer.js` | `b9770d050c995440ff22dfe5c209a3619566638a23c10f5d47b5c688b06053ab` |
| `scripts/generation-code-connect-inputs.js` | `bcdf1349ed116240319efd2a00644e96195cab88795839e3e465fc4dc2317778` |
| `scripts/inspect-current-generation-inputs.cjs` | `2c91a1ec9a472d30682296b13eb1f9c4b16ee8829899e551577ded4c8899b755` |
| `proxy/src/generation-agent/service.js` | `e839c032d5841813995147469808adff9e3cefcd88794eca9a4fe0d4b11f7749` |

Совместимость: [APOLLO-V4-PARITY-019](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-019--next-02-representation-evidence-и-typed-code-bindings),
[EDITOR-CODE-PASSPORT-001](../../../../ComponentContractEditor/docs/BACKLOG.ru.md#editor-code-passport-001--next-02-typed-code-evidence-и-bindings).
Следующий шаг — owner source/profile/native acceptance; refresh registry/consumer
для текущих входов больше не является блокировкой. Release routing/manifests и
полная live matrix остаются отдельной очередью.
