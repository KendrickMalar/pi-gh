# pi-gh 0.4.0 Release Plan

**Goal:** Publish `gh_issue_list labels filter (#10) as @papillon6814/pi-gh@0.4.0. Release issue #12.
**Scope:** Version metadata, package test and installation docs only. No production-code change in this release branch.

## Steps
- [x] Package regression expects 0.4.0 (RED at 0.2.0), then bump package.json and the root/own package-lock versions; README install lines to 0.4.0.
- [x] Typecheck, 218 tests, synthetic real-Pi acceptance (11) on the source.
- [x] Pack, inspect file list (62 files, no tests/docs/auth/settings), record tarball sha256, run real-Pi acceptance against the exact unpacked tarball (11 OK, 21 tools).
- [ ] Merge, then publish the inspected tarball public/latest after explicit confirmation; npm login/2FA by the human. Do not retry blindly on an uncertain outcome.
- [ ] Verify registry metadata, latest tag, downloaded tarball hash; tag v0.4.0 only after publication; close #8.
- [ ] Development Profile assignment update is a separate, explicitly confirmed step.
