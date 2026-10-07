# Composable GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a separate Pi extension safely compose generic GitHub operations without embedding Scaffold in pi-gh.
**Architecture:** Individually registered tools call shared services. A generic REST/GraphQL adapter supplies bounded reads and snapshot-based writes; local exact grants augment, never replace, the existing human-confirmation path.
**Tech Stack:** TypeScript, Node >=22.19.0, Pi Extension API, gh CLI, node:test.
**Spec:** docs/superpowers/specs/composable-github.md

## Global Constraints
- No any types, no arbitrary API/query inputs, github.com fixed, no real GitHub test writes.
- Existing tool args and human approval stay compatible; permission config defaults absent.
- Read-before-edit, feature worktree, synthetic HOME/fake gh tests.
- No Scaffold/Herdr workflow code, package release, real profile changes, remote deletions.

## Review Focus
- Wrong repository, PR-as-Issue, issue-number vs database-ID confusion.
- Changed policy or remote snapshot while approval is pending.
- Project item/field/option from a different project/repository.
- Pagination truncation or GraphQL errors returned with HTTP success.
- Nested calls bypassing hooks, masking or cancellation.

### Task 1: Callable contract and scoped authorization
**Files:** src/permissions.ts, src/service-types.ts, src/service.ts, extensions/tools.ts, test/composable.test.mjs, test/permissions.test.mjs.
**Interfaces:** loadPermissions(path, actor) -> PermissionLease | undefined; lease.allows(operation, repo, projectId?), lease.isCurrent() -> Promise<boolean>. Tool results have outputSchema + structuredContent.
- [x] Add failing tests for nested-call exposure, capability tool, policy absence, exact grants, insecure/symlink config, policy invalidation.
- [x] Run `npm run build && node --test test/composable.test.mjs test/permissions.test.mjs`; Expected RED for missing behavior.
- [x] Implement private policy loading and permission lease; preserve UI defaults and cancellation; expose changes through normal callable tool pipeline.
- [x] Run targeted tests and `npm test`; Expected all green.
- [x] Commit implementation and evidence ledger.

### Task 2: Generic GitHub operations
**Files:** src/github-api.ts, src/operations.ts, src/operation-input.ts, extensions/tools.ts, test/operations.test.mjs.
**Interfaces:** runGithubOperation(name, args, context) -> OperationResult, shared OperationContext and PermissionLease; read tools take repo/issue/projectId, writes take changePath.
- [x] Add fake-gh tests for issue read/list/edit/close, native subissues/dependencies, Projects get/items/add/update and exact API requests.
- [x] Add rejection tests for invalid args/PR/self-link, secret/drift, pagination/GraphQL error, field/option/item ownership and uncertain outcome.
- [x] Run targeted tests; Expected RED for unsupported operations.
- [x] Implement input validation, API adapter, preview/approval/recheck, per-runtime serialized mutation tools.
- [x] Run targeted tests and full suite/typecheck; Expected GREEN.
- [x] Commit implementation and evidence ledger.

### Task 3: Composition acceptance, docs and delivery
**Files:** README.md, test/composable.test.mjs, scripts/test-pi-gh-cli.py (if required), docs/superpowers/plans/composable-github-progress.md.
**Interfaces:** contractVersion:1, gh_capabilities, supported operation registry, owner-only policy example.
- [x] Add acceptance assertions for wrapper -> registered pi-gh tool, schema-backed masked result, policy-backed child and default denial.
- [x] Run real Pi synthetic tests with fake gh, no real credentials.
- [x] Document exact tool args/change formats/policy and limits; self-review and independent whole-branch review if available.
- [x] Run `npm run typecheck`, `npm test`, real-Pi acceptance and diff/secret review; Expected all green with actual logs.
- [x] Push feature and create PR #2. Final merged-tree verification, main push and Issue readback are recorded in Issue #1; no npm publication or profile activation.
