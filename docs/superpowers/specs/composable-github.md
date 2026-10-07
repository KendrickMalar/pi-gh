# Composable GitHub operations for Pi

## Scope
pi-gh remains a generic GitHub operation layer. A separate extension owns Scaffold templates, waves, stage requirements, and Herdr handoffs. Add a versioned tool contract, issue retrieval/list/edit/close, native sub-issue/dependency reads and additions, and Projects V2 retrieval/items/add-issue/field update. No remote deletion, dependency removal, project creation/view editing, auth changes, force operations, or release publication in this implementation.

## Contract
All tools are individually named, callable through Pi's normal nested-tool pipeline, and report a schema-backed result with status, optional data/problems/message. Existing tool names and argument paths remain compatible. `gh_capabilities` returns contract version 1 and supported operations. No supported public direct-import SDK is promised.

New reads accept repo/issue or projectId with bounded pagination. New changes accept changePath pointing to strict version:1 JSON, including repo and operation. Allowed change operations: issue-edit, issue-close, subissue-add, dependency-add, project-add-issue, project-field-update. API IDs are resolved from the specified issue number and repo, never inferred by AI. Project writes include repo and projectId, and verify the content's repository. PRs are rejected for issue operations.

## Permissions
Default writes retain local human TUI approval. Child and headless writes require an owner-maintained private regular file `~/.pi/agent/pi-gh-permissions.json`, version:1, with exact repo/operation grants, optional exact projectIds, and explicit allowChild/allowHeadless. No wildcards. The file must be owned by the current OS user, mode 0600 (or stricter), and not a symlink. Parents must not be symlinks. A grant is local configuration, not a model-supplied approval argument. Granting arbitrary shell or file access is outside this layer's security guarantees.

Capture input bytes, identity, policy, and relevant remote before-state. After approval, re-read/re-preview and compare digest; revalidate policy before write. Cancellation and session change invalidate authority. Deny secret candidates. Mutations are serialized per extension runtime. Unknown write outcomes are never auto-retried. Noninteractive policy absence rejects before reading the mutation input. Label delete is never eligible for machine permission. Existing defaults remain safe.

## GitHub and API behavior
Use shell-free gh, fixed github.com destination, bounded stdio and timeouts. REST uses explicit methods and 2026-03-10 version header (documented endpoints verified); GraphQL uses fixed query strings and JSON variables. Read list pagination is bounded to 100 pages and 1 MiB combined data. Snapshot previews include only relevant issue/project state. Native subissue and blocked_by endpoints use numeric issue database IDs, not numbers. Reject self-links and cross-owner native subissues. Projects field update initially supports text, number, date, and single-select fields only; verify field belongs to project, option belongs to field, and item belongs to repo. No arbitrary GraphQL from tool inputs.

## Acceptance
Existing 163 tests stay green except intentional registration assertions updated for the new contract/exposure. New tests cover all operation routes, invalid args, PR rejection, secret rejection, snapshot drift, absent/invalid/stale permissions, unauthorized repo/project/child/headless, policy invalidation, API errors, pagination, and schema-backed nested invocation. Tests use fake gh and synthetic HOME only. Build/typecheck/full suite and real-Pi synthetic acceptance run before merge. New package release and profile activation are not required to finish source implementation.

## Delivery
Implement directly in feat/composable-github worktree. User expressly authorized planning without review pauses, local installs/commits, issue changes, push, PR and main integration for this feature. Keep runtime fixtures and validation logs local, never publish company data or credentials.
