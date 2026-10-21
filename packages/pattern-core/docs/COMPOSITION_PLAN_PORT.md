# Proposed semantic port to Apollo Generation

Status: Draft / pending General + Generation agreement. This document does not
change the shared CompositionPlan schema or install an Apollo integration.

## Inputs and ownership

Patterns supplies the validated draft, finite product context, immutable source
receipt and selected decisions. Contract Creation supplies component norms;
Code Connect supplies verified representations/exports/API pins through a
trusted read-only registry adapter. Generation owns the resulting ScreenSpec,
CompositionPlan, package lock, target preflight and execution.

`prepareRequirements(pattern, context, {platform, target, sourceReceipt,
availability})` outputs `apollo.pattern-requirements.v1-draft` with:

- `consumer: apollo-v4`, Draft, `executionAllowed: false`;
- `patternLock`: patternId/revision/content hash, complete source pins and
  matching source receipt hash;
- explicit context and target/platform;
- selected decision table / row / outcome IDs and evidence;
- selected outcomes, their entry states and semantic compositions with
  `activeStates` (state-dependent presence, never unconditional rendering);
- outcome-scoped transitions, states/events and applicable check routes;
- explicit gaps and separate source/availability diagnostics;
- successful availability evidence, including code and component pins.

The output is a semantic request, not a target plan. `actions` are abstract
product requests with source links, not callable save/navigation functions.
The consumer must map them using accepted product behavior and real API data.
The resolver does not own persisted session state; the caller reports the
observed current state. Multiple tables do not authorize simultaneous machines
or an inferred initial-state merge. Agree orchestration explicitly before
using such a draft in a plan.

## Proposed NEXT-01 availability adapter

An `AvailabilityPort` accepts an exact registry entry ID, registry digest,
contract ID/revision/hash/representation, semantic role, platform, target and
required semantic inputs/slots. It returns a confirmed entry or absence. No
name matching, aliases guessed from Figma, package.json dependency inference,
deep private imports or ad hoc replacement components are allowed.

The proposed response includes:

- package exactly `arui-private`, version, commit, public subpath, named export
  and unique relevant file hashes;
- matching contract/representation pins;
- explicit `readiness`: source API, component-rule coverage, full parity,
  code representation acceptance, built-package resolution, live acceptance
  and release; API confirmation cannot replace any of these stages;
- explicit supported platforms/targets and accepted semantic role bindings;
- mapping-confirmed semantic inputs and slots.

`checkAvailability` rejects absence, nonconfirmed/unsupported evidence,
different registry/contract pins, unsupported role/platform/target/input/slot.
Internal implementation dependencies are not standalone generator exports.
Code Connect confirms code/API facts; semantic role suitability requires
pattern review coordinated through General. The final registry response
shape and adapter are not agreed yet and may need a new port version.

Hashes in a trusted port are attestations from its provider. This package does
not scan code, recompute the entire private registry digest or authenticate
receipts. The adapter must verify live checkout/mapping inputs before returning
confirmation. Synthetic test evidence is not accepted real availability.

## Generation responsibilities before either target writes

1. Agree this port and map source-linked semantic roles to exact accepted
   component-contract and registry entries. Resolve required gaps through the
   owner; do not invent component-owned norms.
2. Preserve pattern/decision provenance in the common plan alongside identical
   component/package/code pins. Verify source receipts and registry locks again
   at the plan's execution boundary.
3. Keep Draft/product acceptance separate from API/source/coverage/live/release
   states. Current v1 draft requirements never grant execution. Agree a future
   acceptance protocol through General rather than bypassing that flag.
4. Delegate applicable component checks to the existing engine. The pattern's
   composition/context checks do not replace component validation coverage.
5. Emit target-specific receipts: plan hash and source/registry pins → actual
   Figma nodes or frontend output. Report semantic parity, target failures and
   gaps without treating offline PASS as a live or release acceptance.

## Required handoff

General: approve the port boundary/version and assign the single integration
owner. Generation: confirm required fields and diagnostic transport into the
common v4 plan/preflight. Code Connect: provide the accepted read-only registry
adapter and pins for the pilot's roles. Product owner: settle save failure,
optional remembered choices and scenario review before acceptance.

## Existing NEXT-01 input observed on 2026-10-05

Read-only source: `arui-private/tools/code-connect/registry/consumer.cjs`,
`arui-private-80.7.1.v1.json`, `lock.v1.json` and `NEXT-01.md`.
Registry schema `apollo.arui-private-mappings.v1`, registry version `1.0.0`,
digest `bf7834d4f4b89b187476dc80dd84c93c9130562e88c552073a3343e53e2abad0`.
Code version `80.7.1`, commit `c037d0c322ea9774a9c251400d76d41222819b87`.
Three mappings: ButtonsGroup desktop, CorporateContent desktop and mobile-web.
No catalog content is copied into fixtures.

Reuse NEXT-01's **preflight**, not its offline `prepare`, in the future adapter:
preflight verifies source/build/mapping files, archive pins and the exact lock.
Do not infer semantic role suitability or complete API coverage from the raw
`code.api` list: accepted transformations/props are narrower. Preserve its
confirmed-source-api, not-built-in-checkout, proposed-for-authoring,
fullContractParity/not-confirmed, live and release statuses; none becomes a
blanket acceptance through this port. Archive, manual-source and compiled
hashes are distinct and must not be collapsed into `contractSha256` without an
agreed definition. Figma representation and proposed code representation IDs
are distinct as well. The draft port needs reconciliation with those fields.

These entries do not establish the pilot's unresolved surface/content/actions/
notification mappings. Internal Core Buttons are not standalone UI imports.
Generation must agree how semantic action roles aggregate into a confirmed
public component/occurrence binding rather than guessing `arui-private/button`.
No actual UI binding or v4 consumer adapter is activated by this observation.
