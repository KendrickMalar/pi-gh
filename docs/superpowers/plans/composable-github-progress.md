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
Whole-branch independent read-only review and final verification pending. No real GitHub test mutation performed; tests use synthetic HOME/fake gh. Source retains live API interoperability as an unmeasured residual risk.
