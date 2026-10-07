# Release ledger — pi-gh 0.2.0

Issue: https://github.com/KendrickMalar/pi-gh/issues/3

## Scope and verification
Production src/ and extensions/ are unchanged from main's verified generic-operation feature. Only release metadata, packaging assertions, documentation and acceptance-harness behavior change.

- Package regression RED: expected 0.2.0, actual 0.1.1. After version bump: typecheck exit 0; Node suite 204 pass/0 fail.
- Source real-Pi synthetic acceptance: 11 pass.
- Exact npm tarball: 62 entries, no docs/tests/local fixtures/auth/settings/node_modules; only yaml as runtime dependency, Pi host packages remain peers.
- Initial packed acceptance: 10/11 pass, process-exit wait race failed. Deterministic unit reproduced exit between predicate and poll; waiter now rechecks the predicate before treating exit as a failure. Python regressions 2 pass, including absent-output still fails. No production behavior was changed.
- Exact packed-artifact acceptance after harness fix: 11 pass.

## Publication
The initial noninteractive npm publish stopped with EOTP. The human completed local npm authentication/publication. Logs showed registry PUT 202 and exit 0; no duplicate publication was attempted. Registry initially returned 404/old latest, then exact version metadata and tarball returned unauthenticated HTTP 200; normal npm view confirmed version/latest 0.2.0.

Public tarball bytes equal the inspected artifact:
- SHA-1: 4ef04be4aef51fd8ba5bfcfef83f2b28995dbe73
- SHA-256: c2865baf3b4ccc4a6e0e4695a08ca0b7aaeeacb969cf41d2ebcc53daa77511f9

GitHub push initially returned server 500 twice; ref was checked, no force/bypass used. Normal push succeeded after publication verification.

## Pi deployment
Existing developer-only assignment changed from npm:@papillon6814/pi-gh@0.1.1 to npm:@papillon6814/pi-gh@0.2.0 and standard pi-profile install succeeded. Installed manifest is 0.2.0. The installed package passed all 11 real-Pi synthetic acceptance cases, including registration of 20 gh tools. Seven settings/auth fingerprints were recorded; only the dedicated packages.json changed. No local automation permission file was enabled, no common package added, and no authentication was changed by the deployment.

Running Pi processes keep the old source set. Restart in Development is required; environment configuration/install verification is not evidence of hot-reloading this conversation.

## Delivery
Source PR/main integration, release tag and final remote state are recorded in Issue #3 after readback. Validation artifacts remain local. Registry publication and dedicated deployment are independently verified above.
