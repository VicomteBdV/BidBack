---
name: security-review
description: Independently review BidBack custody, accounting, permissions, wallet boundaries, or security-sensitive changes and report reproducible findings without editing code.
---

# Security review

Work read-only within the Lead's assignment and [repository rules](../../../AGENTS.md).
An explicit execution package limits inspection, tool use, and reporting scope.
This skill grants no fixes, Git mutations, deployments, public transactions,
parameter changes, secret access, or readiness approval.
Review actual source and diff independently of the implementer's conclusions.
Do not serve as the independent reviewer of your own implementation.

## Review surfaces

Trace the affected trust boundary through callers, authorization checks, state
updates, external calls, and accounting effects. Prioritize reachable problems
with concrete impact rather than speculative checklists.

- Contracts: `AuctionHouse`, `EscrowVault`, `NFTVault`, `DistributionVault`,
  `ReputationAdapter`, `ParamsController`, their interfaces, and `src/utils/`.
- Custody: reserve conservation, cap refunds, winner surplus, fee/proceeds
  attribution, repeated claims, reentrancy, pull release and pause behavior.
- Bounded execution: participant limits and allocation loops, including vault
  loops; do not assume a bound survives every authorized entry point.
- Frontend: selected connector/provider consistency, stale accounts/chains,
  receipt versus display refresh, local-route guards, server metadata fetching,
  and private/public environment separation when relevant to the change.

Read the [economic specification](../../../docs/ECONOMIC_MODEL_V1_SPEC.md)
for funding invariants and [testnet limits](../../../docs/TESTNET_READINESS.md)
when interpreting deployment or wallet evidence. Do not reopen economic choices.

## Verify evidence without taking ownership of fixes

Inspect relevant tests and CI at the examined revision. Distinguish test presence,
recorded execution, reproduction, and unverified hypotheses. Existing contract
vectors and mocked wallet tests do not prove adversarial completeness or real
MetaMask/Rabby behavior. An owner-address check does not verify multisig/timelock
operation; bytecode existence does not prove source equivalence.

Read-only reviewers can ask the Lead to execute tests that write artifacts or
require permissions unavailable to the reviewer. Independently inspect the exact
commands, logs, revision and diff; do not accept a summary as sufficient evidence.
Do not obtain private keys, inspect secret environment files, or send transactions
for a reproduction. Describe a safe isolated reproduction if execution is blocked.

## Findings

For each finding provide severity, file/location, trigger and prerequisites,
reproduction or evidence, affected invariant and impact, and a concrete recommended
fix. Mark uncertainty and missing evidence explicitly; avoid unsupported severity.
Return blockers separately from non-blocking observations and note coverage limits.
Send findings to the Lead for authorized implementation; never silently fix them.
