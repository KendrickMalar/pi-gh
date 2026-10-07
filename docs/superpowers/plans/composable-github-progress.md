# SDD ledger — plan: docs/superpowers/plans/composable-github.md

Issue: https://github.com/KendrickMalar/pi-gh/issues/1

## Intent and authorization
Direct parent implementation requested, speed prioritized. User explicitly allowed proceeding without intermediate approval, including push and main integration for this feature. Existing safety defaults and all unrelated repositories/configuration are preserved.

## Pre-flight
Task 1 -> Task 2: shared OperationContext, PermissionLease, approval helper and result envelope; exact interfaces aligned. Task 2 -> Task 3: callable tools return schema-backed results; Pi executeTool returns a nested envelope, not a tool result directly.

## Evidence
- Baseline: npm test -> 163 pass, 0 fail.
- Task 1 RED: model-only versus expected direct; missing permission loader. GREEN: npm run typecheck successful; npm test -> 168 pass, 0 fail. Commit 9a2a04e.
- Task 2 RED: generic service absent; async permission guard not enforced; missing policy parents incorrectly failed; unsupported unrelated Project field incorrectly failed. GREEN: npm run typecheck successful; npm test -> 199 pass, 0 fail.
- Task 3: real-Pi synthetic acceptance -> 11 pass. Includes nested read/default write denial, permission-backed headless child mutation, hook rejection, existing TUI approval/cancel, RPC/print default refusal, reload/new/tree/shutdown and masking.

## Rulings
- No direct-import SDK promised; supported composition is ctx.executeTool with gh_capabilities contractVersion 1. Reason: preserves Pi validation/hooks/lifecycle. Cost if wrong: add a separately reviewed SDK later.
- Project create/delete/view/field definition, cross-repo relationship changes and assignee/comment operations are not required for the immediate composition seam and remain out of scope. Cost if wrong: add dedicated generic tools before dependent workflow features.
- Source delivery only: no npm publication or real Profile activation. Cost if wrong: users must explicitly load the built source checkout until a release.

## Review/delivery
Independent read-only review of 98f75d8..2c153c7 found two Important blockers and no Critical/Minor findings. Both reproduced: FIFO permission open timed out; unrelated Project secret/drift rejected writes. Parent fixed both in one pass: pre-open regular/owner/mode validation, O_NONBLOCK|O_NOFOLLOW and bounded descriptor reads; Project digests contain only selected identity/item/field/current value. Three regression tests observed RED then GREEN; additional target-drift/type/option checks remain green.

Final pre-integration verification: npm run typecheck exit 0; npm test 204 pass/0 fail; real-Pi synthetic acceptance 11 pass; git diff --check clean. Parent performed the post-fix gate; no second independent review was requested. Live read-only checks through the new service succeeded for Issue get/list/subissues/dependencies, and GraphQL introspection confirmed the field input types. No live test mutation was performed.

Declined-to-judge rulings: live mutation interoperability is an explicitly unmeasured residual risk; source-only delivery and existing same-user/remote TOCTOU limits stand as documented. Cost if wrong: investigate against a separately authorized live test target before wider rollout. Deferred minors: none.

Merged-tree native acceptance exposed a test readiness race: the model label renders before Pi enables editor submission. The first native run had 10/11 passes and one startup-probe timeout; main was not pushed. Traced Pi interactive initialization and changed the synthetic probe to wait for its session_start readiness marker, not a rendered model label. Missing-marker RED reproduced; focused GREEN and full native suite 11/11 confirmed. This changes only the test harness, not production operations.

Push/PR/main integration and remote readback follow the verified source gate. Validation artifacts remain local, outside the package/public source.
