---
name: protocol-change
description: Implement an authorized BidBack contract or protocol behavior change with economic invariants, focused regression evidence, and independent security review.
---

# Protocol change

Use the Lead's bounded task and [repository rules](../../../AGENTS.md).
An explicit execution package restricts files, operations, and stopping points.
This skill grants no Git mutation, deployment, public transaction, parameter change,
or permission to expand an approved decision. Continue already approved work
without asking again; surface a new scope or sensitive decision to the Lead.

## Establish the change

- Identify the affected behavior, source commit, files, callers, and existing tests.
- Read the [economic specification](../../../docs/ECONOMIC_MODEL_V1_SPEC.md)
  and [decision](../../../docs/ECONOMIC_MODEL_V1_DECISION.md) when economics is affected.
- Separate an approved decision from current code and dated evidence. Economic
  Model V1 is closed with `no-current-candidate-acceptable`; this is no mandate
  to implement a candidate or reopen parameter selection.
- Give the Lead a file-level plan and identify the required intermediate approval
  before substantive contract, custody, accounting, security, or governance edits.

## Implement within the approved plan

Preserve the six modules under `src/`; do not merge custody, accounting, scoring,
and parameter responsibilities. Inspect interfaces and frontend ABIs when a
contract surface changes, and report any required change outside the task scope.

Preserve highest-valid-bid price, full losing-cap refunds, winner surplus refunds,
and redistribution funded only from actual net premium. Zero premium creates
neither fees nor redistribution. Keep claim reserves solvent and separately tracked.
Preserve pull ETH/NFT claims, bounded participants, reentrancy protections, and
claim availability during pause. Do not infer production governance approval.

## Evidence and independent review

- Add meaningful regression cases for the changed behavior and failure paths;
  never delete or weaken tests merely to obtain green checks.
- Use `forge test -vv`; focus diagnosis with the relevant suite under `test/`.
  Snapshot suites cover parameters and fee recipients; `EconomicModelParity.t.sol`
  checks deterministic arithmetic/allocation vectors. Their presence is not proof
  of fuzz coverage, complete invariant coverage, or an external security audit.
- Include affected frontend/economic checks using their existing commands.
  Do not claim tests ran when only their source was inspected.
- Request independent Security review through the Lead before acceptance. The
  implementer cannot approve their own change as its independent reviewer.
- Deliver actual diff, commands/results, examined revision, invariant impacts,
  remaining risks, and documentation changes. Follow
  [release verification](../release-verification/SKILL.md) for the final check gate.
