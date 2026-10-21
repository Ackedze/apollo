# Frontend execution host · NEXT-05 · 05.10.2026

Frontend port подключён в Apollo и в текущем локальном ApolloProxyControl.
Общий CompositionPlan исполняется вне Figma sandbox: main → UI → Proxy → private
workspace → реальные TypeScript/import build → Chrome → plan-bound receipt.
Это независимый implementation milestone; normative screen/live acceptance не выполнена.

## Граница и протокол

- `src/generation/frontend/port.ts` / `generation-frontend-ui.js`: correlated
  request IDs, immutable plan pins, envelope/receipt hashes, timeout и cancel.
- Proxy `src/generation-agent/frontend-service.js`: POST
  `/generation/frontend/execute` принимает только `requestId/spec/planHash/pins`.
  Сервер заново строит план из trusted reader и сверяет pins. POST
  `/generation/frontend/cancel` принимает только `requestId/planHash`.
  Отмена до старта, replay, busy, disconnect и ограниченное время жизни закрыты.
- `packages/adapter-frontend/host/frontend-host.cjs` создаёт только новую private
  tmp directory. Fresh context/common preflight, profile, command bytes, host
  modules и toolchain проверяются до/после async стадий. Drift/failure/cancel
  возвращают cleanup receipt; partial provenance сохраняется.
- GET `/generation/frontend/artifacts/:id/*` отдаёт только известные
  manifest-пути и вновь проверяет SHA/bytes. Opaque ID, без произвольных путей.
  Через 15 минут или cancel private artifact удаляется. UI даёт probe preview.
- `TargetReceipt.artifact` — optional closed v1 metadata: id, fixed entryPath,
  profileId, authority scope, files with SHA/bytes и manifestHash. Remote PASS
  повторно проходит общий completeness gate; hash сам по себе не доказывает норму.

## Профиль и команды

`assertFrontendProfile` проверяет closed v1 DTO из отдельного server-owned port.
`readAcceptedFrontendProfile` по умолчанию возвращает null:
`FRONTEND_PROFILE_NOT_ACCEPTED` до создания файлов. ScreenSpec не может передать
profile, code, HTML, verdict, arbitrary URL, output path или syntheticLocal.

Поддержаны только proposed recipe IDs:
`desktop-size56.baseline-no-overflow.v1` (ровно два текстовых действия) и
`desktop-size56.opt-in-overflow-commands.v1` (явный opt-in, 1–4 стабильных IDs).
Принимаемый port должен подтвердить точный plan/context, presentation,
inlineSize, labels/views/event IDs, commandRefs и command module SHA.
Композиция ограничена CorporateContent → единственный Body → ButtonGroup;
Size=56, extra props/nodes/slots блокируются. Автоматической регистрации профиля нет.

Command module version 1 должен экспортировать typed `createCommandBank()` и
`createProbeCommandBank(record)`: обе возвращают readonly commandRef→callback bank.
Probe bank отдельно принят как non-mutating; браузерная проверка не вызывает
business commands. Button callback получает настоящий MouseEvent; Picker —
только `{groupId,actionId,source:'picker'}`. Выдуманного MouseEvent нет.
Сценарии и disabled берутся из плана, command identity — из trusted profile.

## Реальные imports и собственные доказательства

Использована существующая genuine selective distribution arui-private 80.7.1,
commit `c037d0c322ea9774a9c251400d76d41222819b87`, только публичные subpaths
button-group/corporate-content. NEXT-05 report SHA:
`dce4d24a90e7ad8baf34f840d74b7488ea7124599633bb2986e0c923b1a57b34`;
recipe report SHA:
`7db2310da5d6684d79f21da519edd08cfe929df8578f2b5d287793f58e5f9f8f`.
115 distribution pins, original source refs, recipe files/artifacts,
installed package manifests/locks, Node/Chrome executable pins проверяются.
Новых installs, изменений arui-private или копирования private reports в fixtures нет.
Полная private distribution, root Yarn topology и React peer gap остаются вне proof.

Каждый новый план получает fresh GeneratedScreen/recipe/application/commands,
`tsc --noEmit` и Vite build. Chrome проверяет каждое объявленное состояние,
действия/disabled, переходы, actual width/height/clipping/primary visibility,
font environment через CDP и callbacks со стабильными IDs, включая одинаковые
подписи Picker. Пишутся новые execution-evidence.json, browser.png и artifact
manifest. Исторические harness PASS receipts используются только как input pins;
они не принимают новый ScreenSpec.

DOM rule evaluator/semantic Figma parity не принят. Checks source RuleIDs
сохраняются unknown; aggregate всегда incomplete, даже если compilation и
interaction probes прошли. Нет fabricated Ready, parity или live acceptance.

## Проверки и текущие gates

- Adapter-frontend **0.1.1**: typecheck/build, 12 regression cases.
- Generation core: 49; Apollo 0.4.0: 185; root Apollo: 81; related Proxy: 38.
- Отдельный `npm --prefix packages/adapter-frontend run test:host` использует
  явно synthetic-local norms/profile port с реальными imports/toolchain/Chrome.
  Baseline и opt-in equal-label Picker дают created/incomplete; width 64,
  command-bank drift во время compile и cancel после compile дают failed + cleanup.
- React Doctor changed/full: no issues found. Score API недоступен; 100 не заявляется.
- Built main/UI → installed Proxy: frontend port available, Create disabled,
  NEXT-05 request reached STALE_CONTRACT_PIN; fresh 06.10.2026 current consumer
  now reaches BG SOURCE_COMPILE / CC source/API Ready, targets blocked.
  Zero native writes/no normative artifact. [Current handoff](GENERATION_CURRENT_INPUTS.md).

Contract Creation выполнил authoritative re-export: BG r58, CC desktop r13 /
mobile r8, Button r31 / Spinner r8 с новыми archive bytes и прежними dependency
semantic/compiled pins. COMPONENT_DEPENDENCY_LINK пройден. Read-only consumer
проверил actual Button/Spinner/оба CC ZIP и обновил отдельный temporary Ready
subset lock; полный BG→Button→Spinner + CC source lock не выдан: SOURCE_COMPILE,
Runtime requires an accepted ready contract. Source BG остаётся Draft, code
representations Draft, parity not-confirmed/acceptance not-run/publication not-confirmed.

Registry/lock обновлены Code Connect до 1.1.0. 06.10.2026 consumer Generation
0.1.1 проверил все five current inputs, metadata, immutable basis/current и fresh
representation observations. Host bridge использует current freshness отдельно от
старых immutable behavioral reports; fresh synthetic real compile/browser run
пройден. Current нормативный BG gate — SOURCE_COMPILE, CC source/API Ready,
profiles/native acceptance missing. [Exact pins и consumer receipts](GENERATION_CURRENT_INPUTS.md).
`codeEvidence.sourcePin.registryDigest` остаётся immutable basis
`bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0`.
Scoped authority не добавлена.

Shared core **0.1.10**, Editor **0.2.91**, adapter-figma **0.1.0**; contract-reading
schema и producer markers не расширены этим frontend этапом. Typed codeEvidence,
closed transforms/owned/native SLOT associations сохранены через existing reader.
Паритетная запись: [APOLLO-V4-PARITY-021](../../../docs/ARCHITECTURE_BACKLOG.md#apollo-v4-parity-021--frontend-execution-host-и-next-05-profile-boundary).

Private verification receipts находятся в /private/tmp/next05-*.json/log/png;
они не являются normative fixtures, release или опубликованным результатом.

## Исторические NEXT-05 build pins

| Файл | SHA256 |
| --- | --- |
| `dist/runtime.cjs` | `980ad3288b2b707b9b3bacefccee06736bf578f7e2e53f60b48b9bd7ad5997a4` |
| `dist/build-inputs.json` | `698ff531be03e80887aa1db81be61653c3f7e8bbc00c93fdcbbea51e6d092e0e` |
| `dist/code.js` | `2537aaad741a06053c5d7a744c9c9adbafe3d51c3c9c1525f3c7f18660b67b12` |
| `dist/ui.html` | `7301e11d34de90708aea13e99dafbb5da9b4b08a7060d6a6f83abde4b8ad7f03` |
| `packages/adapter-frontend/dist/index.cjs` | `e7cf0264a593428c52420cc9654009eac2f6e86f421a88caba6c4eea1c2509f4` |
| `packages/adapter-frontend/host/frontend-host.cjs` | `53e2cee7f25044e9fc166c4c506d8bffe5fac21973557417533a61a714a13559` |

Это локальная consumer сборка после NEXT-05; предыдущие NEXT-02/NEXT-04 main/UI/build-input hashes сохраняют историческое значение. Runtime compiler bytes прежние. Installed/source Generation services проверены byte-identical.

Последняя consumer сборка и проверки: [06.10.2026 current inputs](GENERATION_CURRENT_INPUTS.md).
