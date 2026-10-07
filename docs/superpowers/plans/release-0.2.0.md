# pi-gh 0.2.0 Release Plan

> **For agentic workers:** Use superpowers:executing-plans for direct execution. Track checked steps below.

**Goal:** Publish the verified generic GitHub composition feature as @papillon6814/pi-gh@0.2.0 and update only the existing Development assignment.
**Architecture:** Keep production behavior unchanged. Bump manifest/lock metadata and package tests, update installation docs, inspect a packed tarball and publish that exact artifact. Preserve common Pi packages, authentication and local permission configuration.
**Tech Stack:** npm, TypeScript, Pi 1.0.4, pi-profile launcher.
**Spec:** Existing generic-operation spec plus this release scope. User explicitly requested npm publication and current Pi environment update; prior direct-execution/no-intermediate-confirmation instruction retained. Authentication/2FA still belongs to the human.

## Global constraints
- Version 0.2.0 (minor bump for additive operations and changed tool exposure); npm identity papillon6814, GitHub KendrickMalar/pi-gh.
- Dedicated feature worktree, no production-code edits, no destructive commands or auth changes.
- Public artifact must exclude docs/tests/local fixtures/auth/settings/node_modules; host Pi packages remain peers.
- Existing Development id developer retains dedicated assignment; do not add pi-gh to common settings.
- Running processes keep their startup source set; environment deployment does not silently reload the active session.

## Review focus
- Manifest/lock/tarball version mismatch; packaged extension imports missing dist modules.
- Secret/private artifact leakage or unintended host dependencies.
- Duplicate publication after uncertain browser authentication.
- Replacing common/profile settings unrelated to pi-gh.
- Registry metadata/tarball and installed runtime disagree.

## Steps
- [ ] Change package regression expectation to 0.2.0 and require new dist modules; observe RED at 0.1.1.
- [ ] Bump package.json and only root/own package-lock versions; update README installation and restart guidance.
- [ ] Run typecheck, all 204 tests and synthetic real-Pi acceptance. Inspect packed file list and tarball manifest/hash.
- [ ] Verify packaged-source loading against real Pi using the unpacked exact tarball and synthetic HOME/fake gh.
- [ ] Commit/push/PR/merge source metadata; publish inspected tarball public/latest. If auth is needed, keep outcome explicit and do not retry blindly.
- [ ] Verify exact registry metadata, latest, public access and downloaded tarball hash.
- [ ] Replace developer assignment 0.1.1 -> 0.2.0, install dedicated package; verify installed manifest/20 registered tools and preserve common settings/auth.
- [ ] Tag source only after publication succeeds, read GitHub/npm/profile state back, close release Issue, report restart requirement.
