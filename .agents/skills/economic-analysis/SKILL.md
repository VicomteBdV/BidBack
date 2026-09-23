---
name: economic-analysis
description: Analyze BidBack economic behavior using the deterministic Python model, Solidity parity evidence, and declared assumptions without changing approved economics.
---

# Economic analysis

Follow the Lead's bounded task and [repository rules](../../../AGENTS.md).
An execution package restricts analysis and allowed outputs. This skill grants no
parameter or Solidity changes, Git operations, deployment, or public transaction.
Continue authorized analysis without re-requesting approval for the same work.

## Authority and current decision

Read [model documentation](../../../economic-model/README.md), the
[specification](../../../docs/ECONOMIC_MODEL_V1_SPEC.md), and the
[decision record](../../../docs/ECONOMIC_MODEL_V1_DECISION.md).
Solidity behavior is authoritative, followed by `test/EconomicModelParity.t.sol`,
the specification, schema-v2 fixtures, and the Python baseline. Scenario,
adversarial, candidate and decision layers are analytical consumers.
Report contradictions to the Lead; do not silently repair economics to fit a report.

Economic Model V1 is closed with `no-current-candidate-acceptable`. No parameter
or contract change was approved. P4/P5 observability is a conditional reopening
topic, not an active implementation plan. Future-state models and candidate
comparisons must remain distinct from deployed behavior and approved decisions.

## Reproduce relevant evidence

Python 3.12 and the standard library suffice; do not add dependencies.
From the repository root, use only the commands needed for the assignment:

```bash
PYTHONPATH=economic-model/src python -m unittest discover -s economic-model/tests -p 'test_*.py' -v
PYTHONPATH=economic-model/src python -m bidback_economics.runner --all --json
PYTHONPATH=economic-model/src python -m bidback_economics.adversarial_runner --all --json
PYTHONPATH=economic-model/src python -m bidback_economics.candidate_runner --all --json
PYTHONPATH=economic-model/src python -m bidback_economics.decision_runner --source-commit <evidence-base-sha> --json
```

Replace the SHA placeholder with the examined evidence base; never copy an old
README example SHA as current provenance. Preserve canonical integer wei,
checked arithmetic, deterministic serialization, and explicit rational ratios.
The runners write stdout; retain outputs only in a location allowed by the task.
For Solidity parity, request/run `forge test --match-path test/EconomicModelParity.t.sol -vv`
when authorized. Current CI does not run the Python economics suite.

## Interpret and report

Base Sepolia fixtures are projection-only; missing timestamps/scoring inputs
cannot be reconstructed as history. Distinguish wallet identities from declared
economic actors, fixed-action deletion from policy rematerialization, and
mechanical price lift from causal contribution. Keep unmatched dimensions visible.
Candidate comparisons and finite scenarios establish neither universal sybil
resistance nor real-world exploitability. Never turn non-comparable or
non-applicable properties into passing evidence.
Return assumptions, inputs, revision, exact commands/results, invariants, economic
tradeoffs, and limitations. Separate diagnostic findings from recommendations
requiring a future approved decision; do not advance product readiness.
