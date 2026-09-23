---
name: release-verification
description: Independently verify a BidBack change before commit or delivery using its actual diff, required green checks, scope compliance, and revision-specific evidence.
---

# Release verification

Use the Lead's assignment, [repository rules](../../../AGENTS.md), and
[workflow](../../../docs/CODEX_WORKFLOW.md). An explicit execution package limits
scope and operations. This skill authorizes no Git mutation, merge, deployment,
public transaction, parameter change, or readiness advancement.
QA reviews independently; an implementer cannot approve their own work as QA.

## Examine the deliverable

Confirm directory, source/base revisions, actual changed files, and unrelated
worktree changes using permitted read-only inspection. Include authorized new
files, which ordinary `git diff` omits until tracked. Check the task/package,
approved plan, docs, tests, and actual behavior for agreement; report mismatches.
Ensure no generated deployment/build output or secrets enter the proposed commit.
Do not delete, skip, weaken, or change tests simply to produce green results.

## Precommit evidence gate

Require green evidence for these checks before an authorized commit:

```bash
forge test -vv
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

Use existing CI where it reliably covers the same revision/configuration; record
what it covers rather than demanding duplicate execution. Missing required checks
remain blockers, with exact commands and reasons. Report explicit package limits
that prevent checks; never bypass them or label unrun checks as successful.
A read-only QA reviewer asks the Lead to run artifact-writing checks as needed,
then independently inspects logs, commands, revision and diff. Reviews must cover
new changes and refreshed evidence after edits; changed bases need compatibility review.

## Coverage beyond CI

Current CI covers Foundry, frontend Vitest, typecheck and build. Vitest includes
`src/**/*.test.{ts,tsx}` only. Relevant `.mjs` suites and Python economics tests
need separate evidence; consult [testnet readiness](../../../docs/TESTNET_READINESS.md)
and [economic analysis](../economic-analysis/SKILL.md) for commands and limits.
Standalone verifier/collector tests use mocks and do not establish live wallet or
RPC behavior. Deployment validation needs a manifest; on-chain verification needs
an authorized RPC. Local lifecycle smoke deploys and transacts on Anvil, so its
availability is not permission to execute it during a read-only review.

## Verdict and handoff

Return PASS only when scope, required evidence, independent reviews and blockers
are resolved for the examined revision; otherwise return FAIL with one consolidated
correction list. Record checks actually performed, evidence reused, missing checks,
and residual limits. A PASS never authorizes commit, push, PR, merge or deployment.
Report which of those operations occurred only from direct evidence. Preserve
manual wallet, repeatability and production readiness gates until separately met.
