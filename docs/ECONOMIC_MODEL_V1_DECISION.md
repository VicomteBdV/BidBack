# Economic Model V1 Decision Record

**Status: DECISION RECORDED — NO CURRENT CANDIDATE ACCEPTABLE**

```yaml
finalOutcome: no-current-candidate-acceptable
sourceCommit: cf3f447a5632591209f3610e2acff77eec10aaaf
```

No candidate is selected. This record finalizes Lot F2 from the manually validated Lot F1
evidence. It does not introduce a new candidate, formula, parameter recommendation, identity
primitive, or empirical result.

## Decision question

Which, if any, of the current Solidity baseline and bounded Candidates A-E should be carried
forward for Economic Model V1, given the declared integrity checks, hard gates, adversarial
diagnostics, normal-scenario trade-offs, implementation feasibility, and product constraints?

## Evidence base and validation

The evaluated evidence base is Lots A-E at source commit
`cf3f447a5632591209f3610e2acff77eec10aaaf`. The caller supplied this commit to the reducer; the
runner propagated it unchanged and did not discover it through Git or a subprocess.

Manual validation established:

- the Lot F1 reducer completed successfully;
- `integrityValid=true`;
- the complete deterministic JSON report was produced with exit code 0;
- the evidence contained the five declared candidates, the authoritative
  `solidity-baseline-v1` row, 14 normal scenarios, 10 adversarial pairs, and the canonical P2b
  partition vector.

The validated consolidated gate matrix is:

| Model | P1 | P2a | P2b | P3 | P4 | P5 | Selection eligibility |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `candidate-v1-a` | pass | non-comparable | fail | pass | fail | pass | false |
| `candidate-v1-b` | pass | non-comparable | pass | pass | fail | pass | false |
| `candidate-v1-c` | pass | non-comparable | pass | pass | fail | pass | false |
| `candidate-v1-d` | pass | non-comparable | fail | pass | fail | pass | false |
| `candidate-v1-e` | pass | non-comparable | pass | pass | pass | pass | false |
| `solidity-baseline-v1` | fail | non-comparable | fail | fail | fail | pass | false |

## Methodology and integrity discipline

Lot F1 performed deterministic analytical reduction only. It preserved the atomic A-E property
statuses and reported integrity, selection eligibility, disqualification reasons, adversarial
diagnostics, redistribution coverage, seller economics, concentration, policy-signature
feasibility evidence, and scenario-local Pareto relations.

The reducer rejected incomplete or invalid evidence and checked the complete model, scenario,
adversarial-case, version, catalogue, invariant, analytical-check, actor-accounting,
matched-control, candidate-property, source-commit, and serialization boundaries declared for
Lots A-F1. `non-comparable` and `non-applicable` remained distinct evidence statuses and were not
treated as passes.

No weighted score, cross-scenario wei total, average, scenario vote, ranking, probability,
expectation, optimizer, or winner-selection algorithm was used. The S5, S6, and S7 variants
remained controlled comparisons rather than independent votes. Scenario-local Pareto relations
did not constitute an overall ranking.

The analytical terms remain distinct:

- mechanical contribution is trace-level price-lift attribution;
- a counterfactual benchmark depends on its declared replay convention and behavioral
  assumptions;
- an actor-aware diagnostic uses declared analytical ownership mappings;
- on-chain observability is limited to information available to the current protocol.

No counterfactual or actor-aware result is presented as a causal fact about unobserved real-world
ownership or replacement bidding behavior.

## Hard gates and P2a comparability

The decision uses P1, P2b, P3, P4, and P5 as the reported analytical hard-gate facts. P2a remains
an explicit empirical comparability control:

- P1 is the bounded D1 deliberate-loser diagnostic;
- P2a is the bounded D5 empirical split-versus-unsplit diagnostic;
- P2b is the canonical fixed-pool, matched aggregate allocation-weight partition control;
- P3 is the bounded D6 participant-count pool-unlock diagnostic;
- P4 is the bounded D6 condition `winnerActorIndirectReward == 0`;
- P5 is existential non-degeneracy over S2, S3, S4, S8, S9-at-threshold, and S10.

P2a is `non-comparable` for every model on D5. D5 is therefore neither positive nor negative
universal evidence of splitting invariance. Its unmatched dimensions remain part of the
diagnostic. P2b, not D5, is the matched formula-partition control.

## Final outcome

The final outcome is exactly:

```text
no-current-candidate-acceptable
```

The current baseline fails multiple structural gates. Candidates A-D retain the blocking D6
winner-actor sibling channel. Candidate E passes the reported P1/P2b/P3/P4/P5 analytical facts
but is an off-chain counterfactual benchmark that is impractical on the current architecture and
is not a current Solidity option. No current candidate can therefore be selected.

This outcome is not a claim that positive redistribution is impossible. P5 passes for every
consolidated model. The unresolved issue is whether an actor-blind protocol can distinguish a
genuine losing bidder from a losing wallet controlled by the actor that already won.

## Model-by-model reasoning

### `solidity-baseline-v1`

The baseline is not selectable:

- P1: fail;
- P2a: non-comparable;
- P2b: fail;
- P3: fail;
- P4: fail;
- P5: pass.

The baseline retains useful redistribution, but the validated evidence demonstrates several
structural weaknesses. It cannot be retained unchanged.

### `candidate-v1-a`

Candidate A is not selectable:

- P1: pass;
- P2a: non-comparable;
- P2b: fail;
- P3: pass;
- P4: fail;
- P5: pass.

It corrects the deliberate-losing and participant-count-gate properties, but retains an
identity-splittable cap under the matched P2b formula control and the winner-actor sibling reward
channel in D6.

### `candidate-v1-b`

Candidate B is not selectable:

- P1: pass;
- P2a: non-comparable;
- P2b: pass;
- P3: pass;
- P4: fail;
- P5: pass.

It has the stronger matched formula-partition property among the simple on-chain candidates, but
it does not prevent the winner actor from receiving an indirect reward through a sibling losing
identity in D6. This evidence does not qualify Candidate B as sybil-proof or sybil-resistant.

### `candidate-v1-c`

Candidate C is not selectable:

- P1: pass;
- P2a: non-comparable;
- P2b: pass;
- P3: pass;
- P4: fail;
- P5: pass.

It matches Candidate B on the reported hard-gate facts while using a different normalization
policy. P4 remains blocking.

### `candidate-v1-d`

Candidate D is not selectable:

- P1: pass;
- P2a: non-comparable;
- P2b: fail;
- P3: pass;
- P4: fail;
- P5: pass.

It retains too many identity-sensitive properties of the baseline, including failure of the
matched P2b partition control and the D6 P4 gate, to be an acceptable V1 direction.

### `candidate-v1-e`

Candidate E has the following validated analytical facts:

- P1: pass;
- P2a: non-comparable;
- P2b: pass;
- P3: pass;
- P4: pass;
- P5: pass.

Candidate E is not selected. It is an analytical, behavioral-assumption counterfactual benchmark,
not a current Solidity option. Its policy rematerialization is impractical on the current
architecture, and its actor-aware diagnostics depend on analytical ownership mappings that are
not an on-chain primitive. Its P4 pass on the declared D6 instance does not demonstrate that an
equivalent actor-blind on-chain allocation is available.

## P4/P5 conclusion

P4 is the principal residual reason for `no-current-candidate-acceptable` among the feasible
on-chain candidates. Candidates A-D can improve wallet-level allocation properties, but the
current protocol has no information that determines whether a losing identity and the winning
identity belong to the same economic actor. In D6, that observability limit allows the winner
actor to recover redistribution indirectly through a sibling wallet.

Candidate E is the only candidate that passes P4 in this evidence set, but its pass relies on an
analytical counterfactual benchmark and actor mappings unavailable to the current on-chain
architecture. It does not establish an implementable actor-blind equivalent.

P5 passes for all six consolidated models, so non-degeneracy is preserved. The current problem is
not the total absence of useful redistribution. It is the unobservable distinction between:

- a genuine loser; and
- a wallet controlled by an economic actor that already won.

No model in this record is classified as sybil-proof or sybil-resistant.

## Parameter-only decision

`parameter-only` is rejected.

The existing parameters cannot simultaneously resolve the baseline failures on P1, P2b, P3, and
P4:

- `minParticipants` counts wallets, not economic actors;
- the per-user cap remains identity-level;
- EF, ET, and II provide no economic-ownership information;
- reducing redistribution until the D6 channel is unattractive would suppress the mechanism, not
  provide the required structural distinction while preserving P5.

A parameter adjustment therefore cannot substitute for resolving the P4/P5 observability
boundary.

## Pareto relations and secondary diagnostics

No global ranking is created. The validated evidence supports the following bounded comparison:

- Candidates B and C substantially improve P1, P2b, and P3 relative to the baseline;
- Candidates A and D still fail P2b;
- Candidate E is the only candidate to pass P4 in this evidence set, but it is not implementable
  on the current architecture.

Seller economics, concentration, interaction sensitivity, redistribution coverage, and
scenario-local Pareto relations remain useful secondary diagnostics. They cannot compensate for
P4 because no feasible on-chain model first satisfies all required hard gates. A better seller or
concentration metric does not override the P4 failure.

## Normal scenarios and adversarial cases

The normal evidence comprises the 14 declared S1-S10 scenario instances. S5, S6, and S7 remain
paired controlled comparisons. The representative P5 group is S2, S3, S4, S8,
S9-at-threshold, and S10. The consolidated P5 result is pass for every model.

The adversarial evidence comprises the 10 declared D1-D9 pairs, including both D8 variants. Each
finding remains bounded by its declared experimental design, controls, unmatched dimensions,
mechanical-accounting convention, and actor mappings. D5 remains non-comparable; D6 supplies the
central bounded P4 result.

## Parameter-only vs structural distinction

A parameter-only change modifies existing governed values while retaining the current allocation
and observability structure. A structural change modifies allocation, eligibility, input policy,
pool logic, identity assumptions, or required state/history. The current outcome selects neither:
parameter-only is rejected, and no current structural candidate is acceptable.

Any future work must preserve this distinction and must not present an actor-observability change
as a routine parameter adjustment.

## Economic Model V1 workstream status

**Economic Model V1 evaluation is complete.**

Lots A-F provided:

- an executable specification;
- an exact baseline twin;
- normal scenarios;
- adversarial counterfactuals;
- bounded candidate models;
- deterministic comparison and analytical reduction;
- an explicit economic decision.

The current Economic Model V1 evaluation workstream should close after this decision record is
integrated. It should not continue by generating additional Candidate V1 variants.

The next product-governance step is to reconnect this economic conclusion to the global product
roadmap. This record does not modify or pre-empt `docs/PRODUCT_STATUS.md`, `docs/ROADMAP.md`, or
`docs/ARCHITECTURE_DECISIONS.md`.

## Targeted economic reopening condition

A future economic workstream is justified only as the targeted **P4/P5 observability boundary**
problem:

> With only the currently observable wallet-level inputs and fully refundable deposits, can a
> winner actor be prevented from receiving redistribution through a losing sibling identity while
> positive redistribution is preserved for an observably equivalent genuine loser?

The falsifiable hypothesis is:

> Under the current actor-blind primitives, two wallet sets that produce an equivalent observable
> trace but have different economic ownership cannot receive actor-dependent treatment without
> additional information, cost, or another primitive that distinguishes them.

A reopened workstream must do one of two things:

1. show that a bounded actor-blind rule can satisfy P1, P2b, P3, P4, and P5 on a strengthened
   evidence set; or
2. demonstrate the observability limit and identify the minimal missing primitive.

Lot F2 does not design or recommend that primitive. Any candidate primitive requires separate
scope, evidence, product review, and explicit approval.

## Reproduction record

The validated Lot F1 commands were based on the following caller-supplied evidence commit:

```powershell
$lotFSourceCommit = 'cf3f447a5632591209f3610e2acff77eec10aaaf'
$env:PYTHONPATH = (Resolve-Path 'economic-model\src').Path
python -m compileall economic-model\src economic-model\tests
python -m unittest discover -s economic-model\tests -p "test_decision_analysis.py" -v
python -m unittest discover -s economic-model\tests -p "test_decision_runner.py" -v
python -m unittest discover -s economic-model\tests -p "test_*.py" -v
python -m bidback_economics.decision_runner --source-commit $lotFSourceCommit
python -m bidback_economics.decision_runner --source-commit $lotFSourceCommit --json
```

Lot F2 did not rerun these commands. This decision uses the manually validated result supplied for
the declared evidence base.

## General reopening discipline

Outside the targeted P4/P5 question, reopen this decision only if a material input changes:

- Solidity auction, settlement, scoring, custody, or accounting behavior;
- a relevant governed economic parameter;
- a fixture, scenario, adversarial pair, catalogue, candidate, or property definition;
- an actor-ownership, utility, counterfactual, or comparability convention;
- the canonical P2b vector or representative P5 group;
- the available on-chain observability or governance assumptions;
- a validation failure, integrity rejection, or material implementation constraint;
- new evidence that changes an explicit limitation or trade-off.

Any reopened analysis must identify a new evidence-base commit and repeat validation before a new
decision is recorded.
