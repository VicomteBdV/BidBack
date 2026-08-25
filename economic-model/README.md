# BidBack Economic Model V1 — Python baseline and deterministic scenarios

This directory contains several deliberately separate layers. Lot B is a deterministic Python twin
of the current Solidity auction economics. Lot C uses that baseline to materialize small,
interpretable bidder scenarios and calculate descriptive economic reports. Lot D pairs two
complete Lot C reports and adds economic-actor, coalition, capital, and counterfactual accounting.
Lot E overlays five bounded candidate allocation models. Lot F1 validates and reduces the complete
A-E evidence into an analytical matrix without selecting an outcome. Solidity remains
authoritative; none of these layers is a recommendation of production parameters.

## Authority and boundaries

The authority order is:

1. production Solidity under `src/`;
2. `test/EconomicModelParity.t.sol`;
3. `docs/ECONOMIC_MODEL_V1_SPEC.md`;
4. schema-v2 transport fixtures under `fixtures/`;
5. the Lot B Python baseline;
6. Lot C scenarios, decisions, and descriptive metrics;
7. Lot D actor-aware paired diagnostics.
8. Lot E candidate overlays and atomic property reports;
9. Lot F1 fail-closed analytical reduction.

Lot B remains the only Python authority for checked arithmetic, bidding rules, participant and
takeover state, anti-sniping, scoring, allocation, settlement, and Solidity-parity invariants.
Lot C calls the real Lot B functions and never reproduces those formulas.

The Base Sepolia fixture remains projection-only. Missing timestamps and null EF/ET/II/scoring
fields are never reconstructed or presented as historical evidence.

## Lot B baseline

The baseline reproduces:

- checked unsigned arithmetic and Solidity integer rounding;
- bid caps, exact deposit deltas, participant uniqueness, takeover counts, and anti-sniping;
- premium, fee, candidate pool, EF, ET, II, reputation, and allocation;
- refunds, seller proceeds, reserves, and settlement conservation;
- schema-v2 golden-vector loading and evidence-projection boundaries.

Its public API remains unchanged:

```python
from bidback_economics import AuctionConfig, BidEvent, ParamsSnapshot, simulate_auction

result = simulate_auction(config, bid_trace, reputations)
```

## Lot C scenario schema

The versioned input is `scenarios/catalog-v1.json`. It contains one complete current parameter
snapshot and 14 deterministic cases grouped into families S1–S10. Every uint input is a canonical
decimal string; JSON floats are forbidden.

The catalogue root declares `schemaVersion`, `catalogVersion`, `economicModelVersion`, the full
`params` snapshot, and `scenarios`. Each scenario declares its ID/family/description, auction
configuration, bidder definitions, reputation mapping, ordered opportunities, and an optional
focal bidder for controlled comparisons.

A scenario defines the auction start price, fixed start time, duration, configured bidders,
valuations, optional budgets, finalization-time reputations, and an ordered list of relative bid
opportunities. For each bidder:

```text
maxBidCap = valuation                    when budget is null
maxBidCap = min(valuation, budget)       otherwise
```

`valuation`, `budget`, effective `maxBidCap`, and caps actually submitted are distinct report
fields.

## Bidder policies and prefix replay

Lot C implements only three transparent policies:

- `value-capped-once`: uses its single opportunity and submits the authoritative current minimum
  when that minimum does not exceed `maxBidCap`;
- `persistent-value-capped`: may use several opportunities, never bids while already leader, and
  retakes the lead at the authoritative minimum within `maxBidCap`;
- `fixed-cap-once`: submits its configured cap once when it is at least the authoritative minimum
  and no greater than `maxBidCap`.

Timing belongs to scenario opportunities, not bidder policy names. For every opportunity the
materializer replays the accepted prefix through `simulate_auction(finalization_time=None)`, reads
the authoritative leader and end time, uses Lot B `minimum_next_bid()` and `cap_delta()`, and asks
Lot B to accept the enriched prefix. Opportunities producing no bid remain in the decision log
with a deterministic reason. This permits a post-initial-end bid only when Lot B has extended the
current end time.

## Controlled catalogue

The catalogue covers no competition, clear and close valuation gaps, heterogeneous multi-loser
allocation, controlled ET and II comparisons, a reputation-only comparison, per-user-cap
saturation, the exact `minPremiumNet - 1`/`minPremiumNet` boundary, and anti-sniping.

- S5 keeps bidders, valuations, budgets, policies, reputations, accepted cap order, final price,
  focal EF, and focal II fixed; only the focal loser's relevant timing changes. Neither variant
  enters the anti-sniping window.
- S6 is a **focal II component controlled comparison**: focal valuation, budget, first bid time,
  final cap, final price, EF, ET, and reputation are fixed while focal takeover count changes.
  Other bidder scores may change, so reward differences are not presented as a pure causal II
  effect.
- S7 produces byte-for-byte identical bid traces and changes only the focal final reputation.
- S8 has a winner and two losers: one raw reward exceeds the per-user cap, the other reward is
  positive and uncapped, and removed allocation is not reallocated.
- S9 places net premium exactly one wei below and exactly at the configured threshold.

## Metrics and utility

Lot C metrics read only the scenario, generated trace, Lot B `BidAudit`, and `SimulationResult`.
They do not recalculate scoring or settlement. Monetary quantities remain integer wei.

For bidder `i`:

```text
deposit_i = sum(BidAudit.deposit for bidder i)
netCashFlow_i = refund_i + reward_i - deposit_i
utility_i = netCashFlow_i + valuation_i    when i wins
utility_i = netCashFlow_i                  otherwise
```

On the normal current path, loser utility is its reward and winner utility is valuation minus
final price. This convention excludes gas, capital opportunity cost, time preference, risk,
external costs, and resale-value uncertainty.

Seller and protocol metrics include seller revenue, seller premium capture, fee revenue,
unassigned candidate remainder, and exact shares of gross premium. Efficiency uses all configured
valuations. The second-highest valuation is the second statistical order value, including ties,
not the second distinct value.

Analytical ratios are reduced integer numerator/denominator pairs. Zero is normalized to `0/1`,
undefined ratios are `null`, and no float is produced.

## Mechanical trace attribution

Per-bidder `observedPriceLift` and `premiumLift` are summed exclusively from Lot B `BidAudit`.
They are **mechanical trace attribution** and carry no causal interpretation.
`rewardToFinalCap` and `rewardToPremiumLift` are descriptive loser-only ratios; Lot C defines no
alert threshold or exploitation classification.

## Runner and CLI

```python
from bidback_economics.runner import run_scenario, serialize_report
from bidback_economics.scenarios import load_scenario

scenario = load_scenario("s04-heterogeneous")
report = run_scenario(scenario, source_commit=None)
payload = serialize_report(report)
```

`source_commit` is optional caller input. The runner never invokes Git and never uses system time
or randomness. Sorted JSON keys and canonical ratios make repeated reports byte-for-byte stable.

From the repository root after setting `PYTHONPATH`:

```powershell
python -m bidback_economics.runner --list
python -m bidback_economics.runner --scenario s10-anti-sniping
python -m bidback_economics.runner --scenario s10-anti-sniping --json
python -m bidback_economics.runner --all --json
python -m bidback_economics.runner --scenario s10-anti-sniping --json --source-commit <sha>
```

The CLI writes only to stdout. Lot C creates no results archive.

## Lot D adversarial and counterfactual diagnostics

Lot D is a deterministic analytical layer over Lot C. It does not change bidder policy, scoring,
allocation, settlement, parameters, or Solidity behavior. Each diagnostic compares two complete
and independently auditable Lot C scenarios:

```text
reference ScenarioReport
vs
attack ScenarioReport
-> economic-actor accounting
-> coalition accounting
-> capital accounting
-> matched controls
-> counterfactual deltas
-> factual diagnostic flags
```

The two catalogues under `adversarial/` have distinct responsibilities:

- `scenarios-v1.json` is an autonomous Lot C catalogue containing 20 full scenarios: one
  reference and one attack branch for each of 10 paired cases;
- `catalog-v1.json` contains only pairing, actor ownership, seller and endowment data, coalition
  membership, intervention metadata, matched controls, known unmatched dimensions, and
  diagnostic relations.

`scenarioCatalog` is resolved strictly relative to the adversarial catalogue file. Attack
branches are never generated by patching reference branches, and no economic behavior depends on
a case ID.

### Economic actors and bidder identities

A bidder identity is an auction endpoint. An economic actor is the person or coordinated entity
that owns one or more seller or bidder identities. Every identity occurring in either branch has
exactly one owner, while one actor may own several identities. All bidder identities owned by an
actor carry that actor's single underlying NFT valuation; per-identity Lot C budgets may still
limit their bidding capacity.

An actor's NFT valuation is counted once, for the terminal NFT claimant actor. It is never summed
once per controlled bidder identity. Coalition values are sums over distinct member actors, not
sums of Lot C bidder utilities.

### Seller, endowment, and terminal claimant

Every pair declares the seller actor and the initial NFT endowment. In V1 the initial owner is the
seller actor, and the endowment value equals that actor's NFT valuation. The terminal claimant is
the claim right returned by the Lot B settlement: the winner after a bid, or the seller on the
no-bid path. Reports distinguish winner identity, winner actor, terminal claimant identity, and
terminal claimant actor.

For actor `a` in one branch:

```text
bidderCashFlow_a
= sum(Lot C netCashFlow for identities owned by a)

actorCashFlow_a
= bidderCashFlow_a
 + sellerRevenue when a is the seller actor
 + protocolFee when a is the modeled fee-recipient actor

actorEconomicChange_a
= actorCashFlow_a
 + terminalNftValue_a
 - initialNftEndowmentValue_a
```

Lot D deliberately starts from Lot C net cash flows and does not sum Lot C bidder utilities. This
prevents duplicate NFT value and correctly consolidates a seller-controlled bid or self-purchase.
In the V1 catalogue `protocolFeeRecipientActorId` is `null`, so protocol fees are economically
external to the declared actors.

### Coalition accounting

Coalition economic change is the sum of member actor economic changes. Reports retain coalition
cash flow, rewards, refunds, deposits, seller proceeds, and terminal NFT value separately for
audit. Seller/bidder transfers between members cancel through consolidation; Lot D assumes no
additional side payment or post-auction NFT transfer.

### Capital and capital-time

For each actor:

```text
aggregateConfiguredMaxBidCap
= sum(maxBidCap for all controlled bidder identities)

aggregateLockedCapital
= sum(realized final cap for all participating controlled identities)
```

Both must be no greater than `actorCapitalBudget`. Non-participating identities have zero realized
locked capital. In the current single-auction model, caps only increase and remain locked through
settlement, so aggregate realized final caps equal peak pre-settlement locked capital. Their sum
over actors must equal Lot B total deposits.

Lot D also reports the descriptive exposure:

```text
capitalTimeExposureWeiSeconds
= sum(depositDelta * (finalizationTime - bidTimestamp))
```

This quantity is not assigned an interest rate, monetary cost, or utility adjustment. Strict
locked-capital matching does **not** imply capital-time or opportunity-cost matching.

### Matched controls and known unmatched dimensions

`matchedControls` are experimental-design constraints. They use a closed, typed selector registry
and compare reference with attack. A declared matched control that fails invalidates the paired
report and causes the runner to fail explicitly.

`knownUnmatchedDimensions` record dimensions that cannot or intentionally do not match. Each
result exposes its reference value, attack value, and reason. Declaring such a dimension never
turns it into a match.

Every direct input difference must be listed in `intervention.changedInputs`; derived output
differences do not need separate declarations. Undeclared input differences are catalogue
validation errors. The loader evaluates no Python expression from JSON and has no case-specific
business branch.

### Diagnostic relations, deltas, and flags

`diagnosticRelations` are hypotheses to measure, not acceptance gates. Each is reported as passed
or failed, and either result leaves an otherwise valid case report usable. For example, the D5
pair may confirm or refute a coalition-level per-user-cap bypass without being rewritten to obtain
a desired result.

Counterfactual values are signed attack-minus-reference integers. They include actor and coalition
utility, rewards and cash flow; final price, gross premium, seller revenue, protocol fee,
distribution, and unassigned remainder; modeled non-coalition utility; realized locked capital;
capital-time exposure; and mechanical premium lifts. "Modeled non-coalition" covers only declared
actors outside the coalition, not every real economic participant.

Allocative efficiency is also reported at actor level. It compares the terminal claimant actor's
valuation with the maximum valuation among declared actors, seller included, and therefore
deduplicates sybil identities. It does not replace Lot C's identity-level metric.

Factual flags are direct predicates over these values, including budget satisfaction, locked
capital matching, capital-time matching, unchanged winner/price/premium, candidate-pool threshold
activation, all-losing coalition participation, reward-only incremental gain, and observed
coalition-level per-user-cap bypass. They are not severity ratings or exploit classifications.

All ratios reuse Lot C `Rational`; undefined denominators serialize as `null`. Mechanical premium
lifts remain **mechanical trace attribution**, not causal contribution.

### Deterministic diagnostic catalogue

The catalogue covers:

- D1: deliberate losing participation against the same external winner;
- D2: losing-cap variation for the EF component with unchanged ex-ante bidder capacity;
- D3: first-bid timing variation for ET, with capital-time shown separately;
- D4: an additional takeover for II under declared controls;
- D5: one identity versus multiple identities of one actor under the per-user cap;
- D6: the same actor using sibling identities to test the participant-identity threshold;
- D7: deterministic coordinated participation suppression, without an optimizer or equilibrium;
- D8a: a seller-controlled losing shill with seller proceeds consolidated;
- D8b: seller self-purchase with initial and terminal NFT value consolidated;
- D9: altered interaction between the same identities under the same actor.

D10 anti-sniping griefing remains outside the diagnostic catalogue. Extensions and capital-time
can be measured, but the model defines no monetary value of delay or griefing utility.

The utility convention continues to exclude gas, capital opportunity cost, time preference, risk,
external execution costs, resale uncertainty, and ownership-identification uncertainty. Therefore:

```text
positive modeled incremental utility
!= proof of real-world profitability
```

### Lot D runner and CLI

The Lot D runner executes both complete Lot C branches, requires their Lot B invariants and Lot C
analytical checks to pass, gates on matched controls, and reports diagnostic relations without
gating on them. It never discovers Git state, invokes a subprocess, writes a results directory,
uses system time, or uses randomness.

```powershell
python -m bidback_economics.adversarial_runner --list
python -m bidback_economics.adversarial_runner --case d01-deliberate-loser
python -m bidback_economics.adversarial_runner --case d05-sybil-cap-bypass --json
python -m bidback_economics.adversarial_runner --all --json
python -m bidback_economics.adversarial_runner --case d08b-seller-self-purchase --json --source-commit <sha>
```

JSON reports use sorted keys, compact separators, ASCII escaping, caller-supplied source commits,
and no ambient timestamp. Repeated runs with the same inputs are byte-for-byte deterministic. The
CLI writes only to stdout.

## Lot E candidate economic models

Lot E is a separate, hypothetical allocation layer over authoritative Lot B/C traces and Lot D
actor declarations. It does not change bidding, caps, anti-sniping, the winner, final price,
premium, fee, refunds, NFT ownership, or either baseline settlement branch. The baseline version
remains `solidity-baseline-v1`; neutral candidate IDs do not imply that a model is secure,
production-ready, or recommended.

Candidate definitions live in `candidates/catalog-v1.json`. Every candidate uses bidder identity
as its allocation subject. The five initial models are:

| ID | Contribution and allocation | EF / ET / II |
| --- | --- | --- |
| `candidate-v1-a` | positive mechanical premium lift, normalized among eligible losers, then the baseline per-identity cap | removed |
| `candidate-v1-b` | positive mechanical premium lift allocated directly against gross premium, without an identity cap | removed |
| `candidate-v1-c` | positive mechanical premium lift normalized among eligible losers, without an identity cap | removed |
| `candidate-v1-d` | positive mechanical premium lift as an eligibility gate, then the current final score and per-identity cap | retained only as secondary weights |
| `candidate-v1-e` | positive identity-level policy-rematerialization counterfactual price contribution, normalized without an identity cap | removed |

Candidate D calls the existing Lot B EF, ET, II, weighted-score, reputation, and final-score
helpers. This matters when its hypothetical pool is positive but the baseline pool was zero:
finalized baseline results intentionally omit scores when baseline pool eligibility short-circuits.
Lot E does not copy those formulas or change Lot B.

### Pool size and allocation are separate

Every candidate removes participant-identity count from the economic pool gate. At the current
duration-valid scenarios, its pool is:

```text
candidatePool = 0                                      when netPremium < minPremiumNet
candidatePool = min(
    floor(netPremium * redistributionBps / 10_000),
    netPremium
)                                                       otherwise
```

The pool may be positive while assignment is zero. That unused amount is not reserved and remains
in seller proceeds. Raising `minParticipants` from two wallets to N wallets would only raise the
number of identities needed to cross the gate; it would not create actor-level sybil resistance.
An identity count may still have a future UX or safety role, but the Lot E candidates do not let it
unlock economic value.

For a losing identity `i`, mechanical contribution is:

```text
mechanicalContribution_i = sum(BidAudit.premium_lift for bids by i)
```

Candidates A and C normalize this quantity over eligible losers. Candidate A then applies the
current per-identity cap; Candidate C does not. Candidate B deliberately uses a global denominator:

```text
reward_i = floor(candidatePool * mechanicalContribution_i / grossPremium)
```

It does not redistribute the portion mechanically attributed to the winner, cap remainder, or
integer dust. For a fixed total contribution and fixed external contributions, direct linear
allocation and floor division are additive or subadditive under identity splitting. This formula
property does not show that sybils cannot change the observed trace or manufacture additional
mechanical attribution.

### Baseline and hypothetical settlement

Candidate output keeps baseline and hypothetical settlement explicitly separate. For every
candidate branch:

```text
candidateAssignedDistribution = sum(candidate rewards)
candidateUnassignedRemainder = candidatePool - candidateAssignedDistribution
candidateSellerProceeds = finalPrice - fee - candidateAssignedDistribution

candidateSellerPremiumCapture = 0                       when winner is null
candidateSellerPremiumCapture = candidateSellerProceeds - startPrice
                                                        otherwise
```

Only rewards, assigned distribution, seller proceeds, and unassigned remainder differ. Deposits,
refunds, fee, terminal NFT claimant, endowment, ownership, locked capital, capital-time exposure,
and valuations remain authoritative baseline/Lot D values.

Lot D actor accounting is reused through a cash-flow overlay rather than reimplemented. For each
authoritative baseline actor or coalition, Lot E applies only:

```text
economicChangeDelta = candidateRewardDelta + candidateSellerProceedsDelta
```

All other actor and coalition fields are retained from Lot D. This preserves seller/shill
consolidation and the D8b self-purchase convention instead of treating internal transfers as gains.

### Counterfactual contribution

Candidate E always allocates at bidder-identity level, whether or not Lot D actor declarations are
available. For identity `i`, it builds a new independent scenario without that identity and its
opportunities, rematerializes the remaining declared Lot C policies through the existing Lot B/C
machinery, and measures:

```text
signedContribution_i = observedFinalPrice - finalPriceWithoutIdentity_i
eligibleContribution_i = max(signedContribution_i, 0)
```

The source `Scenario`, `ScenarioReport`, and `SimulationResult` are snapshotted and must remain
byte-for-byte unchanged. A second fixed-action diagnostic removes the identity's accepted bids and
replays the remaining recorded actions. It is reported as invalid rather than repaired if removal
invalidates later timing, anti-sniping, minimum-bid, or deposit conditions.

For Lot D only, the comparison report may additionally remove all bidder identities declared for
one economic actor. This actor-aware counterfactual is a separate analytical diagnostic and never
changes Candidate E allocation. Actor ownership is declared experimental input, not an on-chain
identity capability.

Both counterfactual conventions have limitations. Fixed-action deletion omits replacement bids;
policy rematerialization assumes the small declared Lot C policies remain behaviorally valid. In
the current first-price, fixed-cap scenarios, removing a loser can leave the later winner's cap
unchanged and assign that loser zero counterfactual price contribution. Final price alone can
therefore be too narrow a definition of useful support.

### Identity-splitting standard and limitations

Lot E reports both reward and modeled-utility splitting gains:

```text
identitySplittingGainReward = coalitionReward_split - actorReward_unsplit
identitySplittingGainUtility = coalitionUtility_split - actorUtility_unsplit
```

Interpretation requires matched pool, aggregate contribution, terminal NFT ownership, external
bidders, and final price/premium where attainable. D5 matches aggregate locked capital but does
not match coalition mechanical premium lift, so it remains an empirical cap-bypass test rather
than a universal contribution-invariance proof. Deterministic pure partition vectors separately
test formula behavior at exactly matched aggregate contribution.

Without external identity, a non-refundable identity cost, strong anti-sybil reputation, or a
similar constraint, the protocol cannot determine whether two wallets share one economic actor.
Lot E therefore targets invariant or subadditive allocation for economically equivalent traces;
it does not implement or claim a sybil-proof identity layer. In particular, removing the
participant-count gate does not by itself prevent a winner actor from receiving value through a
losing sibling identity. Lot D reports that indirect reward explicitly.

### Metrics and feasibility

Normal comparisons report loser rewards, assigned distribution, seller proceeds and premium
capture, redistribution and pool-utilization ratios, rewarded-loser count, exact maximum reward
share, unassigned remainder, and confirmation that allocation efficiency and all underlying
auction outputs are unchanged. Concentration uses a reduced integer `Rational`; it is `null` when
nothing is assigned. Lot D comparisons additionally report candidate actor/coalition utility,
reward and seller deltas, identity-splitting gain, participant-threshold effects, indirect
winner-actor rewards, interaction sensitivity, locked capital, and capital-time.

No composite score selects a winner. Reports keep adversarial resistance, normal redistribution,
seller economics, and concentration separate. Implementation complexity and known weaknesses are
documented per candidate rather than folded into a weighted score:

| Candidate | Future state and per-bid work | Finalization and history | Classification and principal limitation |
| --- | --- | --- | --- |
| A | additive mechanical contribution per bounded participant | bounded normalization loop; no full-history replay | moderate on-chain; the per-identity cap is profitable to split in the pure partition test |
| B | additive mechanical contribution per bounded participant | bounded direct-allocation loop; no full-history replay | simple on-chain; formula-level splitting is subadditive, but sybils may still alter the trace and attribution |
| C | additive mechanical contribution per bounded participant | bounded normalization loop; no full-history replay | moderate on-chain; no cap-splitting gain, but reward concentration can increase |
| D | mechanical contribution plus the existing EF/ET/II/reputation scoring state | bounded normalization/cap loop; no full-history replay | moderate on-chain; retains identity-level cap and interaction/reputation assumptions |
| E | complete declared scenario/policy input for each removed identity | one policy rematerialization per identity; actor removal also needs declared ownership | impractical on the current architecture; behavioral validity and real-world identity remain external assumptions |

None of A-D needs an oracle or external identity provider for its formula. That fact does not make
wallets actor-neutral. Candidate E's actor-aware diagnostic consumes declared Lot D ownership only
off-chain and never changes its identity-level allocation.

The comparison properties are intentionally atomic:

| Property | Meaning |
| --- | --- |
| P1 | a D1-like deliberate loser with zero mechanical contribution gains no incremental reward |
| P2a | empirical D5 split-versus-unsplit reward, evaluated only when the declared controls match |
| P2b | pure formula partition with fixed pool and matched aggregate contribution/weight is non-profitable |
| P3 | participant identity count does not unlock a larger pool in D6 |
| P4 | the winner actor receives no redistribution through a sibling identity |
| P5 | a funded representative auction can reward a mechanically contributing loser |
| P6 | `assignedDistribution <= candidatePool <= netPremium` |
| P7 | the winner identity is excluded |
| P8 | candidate uint outputs are non-negative integers |
| P9 | seller proceeds stay non-negative and final price stays authoritative |
| P10 | winner, price, premium, fee, net premium, and NFT claimant remain baseline-authoritative |
| P11 | source `Scenario`, `ScenarioReport`, and `SimulationResult` remain unchanged |
| P12 | behavior is independent of scenario and adversarial case IDs |
| P13 | D8b seller self-purchase changes consolidated actor utility only by the protocol fee |
| P14 | zero or below-threshold premium cannot fund candidate rewards |
| P15 | counterfactual convention, changed dimensions, validity, and errors are explicit |
| P16 | canonical JSON serialization is byte-stable |

P2a can be `non-comparable`, and scenario-specific properties can be `non-applicable`; neither
status is silently converted into a pass. P2b is the separate formula-only control. In its declared
40/60 partition vector, A and D expose a cap-splitting gain while B, C, and E are subadditive or
invariant. This is not a universal sybil-resistance proof for any model.

### Lot E runner and CLI

```powershell
python -m bidback_economics.candidate_runner --list-models
python -m bidback_economics.candidate_runner --model candidate-v1-b --scenario s04-heterogeneous
python -m bidback_economics.candidate_runner --compare --scenario s04-heterogeneous --json
python -m bidback_economics.candidate_runner --adversarial d05-sybil-cap-bypass --json
python -m bidback_economics.candidate_runner --all --json
```

The runner uses exact integers, checked unsigned arithmetic for candidate formulas intended as
on-chain feasible, sorted compact JSON, caller-supplied source commits, and explicit deterministic
ordering. Signed counterfactual and attack-minus-reference deltas remain analytical signed
integers. It writes only to stdout and uses no system time, randomness, Git subprocess, or results
directory.

## Lot F1 analytical decision reduction

Lot F1 consumes the complete Lot E catalogue report and fails closed before reducing it. The
integrity boundary requires the baseline plus Candidates A-E, all 14 normal scenarios, all 10
adversarial pairs, the canonical P2b vector, coherent versions and catalogues, passing Lot B/C/D
integrity checks, mandatory candidate invariants, and the required P6-P16 evidence. A missing,
duplicated, mismatched, mutated, or invalid input raises a structured `DecisionAnalysisError`.

The output contains six comparable rows in stable Candidate A-E then baseline order. It reports
atomic property observations, selection eligibility and disqualification reasons, normal and
adversarial diagnostics, exact rational concentration, seller economics, policy-signature
feasibility evidence, and scenario-local Pareto relations. It contains no selected model, final
outcome, recommendation, global score, ranking, cross-scenario wei sum, average, or scenario vote.

P5 retains every representative scenario status and uses the declared existential aggregation:

- `pass` when at least one applicable funded representative scenario rewards a mechanically
  contributing loser;
- `fail` when applicable representative scenarios exist but none passes;
- `non-applicable` when no representative scenario is applicable.

The representative group is S2, S3, S4, S8, S9-at-threshold, and S10. Individual P5 failures stay
visible as redistribution-coverage diagnostics.

P4 is a hard gate only for the declared D6 diagnostic and means exactly
`winnerActorIndirectReward == 0`. It is not a universal sybil-resistance result. Wallet ownership
cannot be inferred on-chain without an identity primitive; declared actor mappings remain
analytical inputs. P2b baseline evidence calls the existing Lot B `allocate_distribution` helper;
the reducer does not reimplement the baseline allocation formula and does not rename EF, ET, II,
or `finalScore` as contribution.

The CLI requires a caller-supplied evidence-base commit and propagates it unchanged:

```powershell
$lotFSourceCommit = 'cf3f447a5632591209f3610e2acff77eec10aaaf'
python -m bidback_economics.decision_runner --source-commit $lotFSourceCommit
python -m bidback_economics.decision_runner --source-commit $lotFSourceCommit --json
```

Both modes write only to stdout. JSON is compact, sorted, ASCII, and deterministic. The decision
record scaffold is `docs/ECONOMIC_MODEL_V1_DECISION.md` and remains `PENDING VALIDATED EVIDENCE`
until Lot F2 manually reviews validated output.

## Explicit exclusions

Lot D contains no random or stochastic engine, parameter sweep, Monte Carlo, optimizer,
alternative scoring, mitigation, parameter recommendation, plotting, or production exploitability
classification. Its matched pairs are bounded diagnostics, not causal claims about behavior beyond
their declared assumptions and controls.

Lot E adds bounded mitigation candidates and comparisons only. It contains no Solidity candidate,
production parameter recommendation, optimizer, Monte Carlo process, random strategy, dashboard,
deployment, external identity system, entry fee, slashing, non-refundable deposit, KYC, or
proof-of-personhood.

## Manual validation

From the repository root on Windows PowerShell:

```powershell
python --version
$env:PYTHONPATH = (Resolve-Path 'economic-model\src').Path
python -m compileall economic-model\src economic-model\tests
python -m unittest discover -s economic-model\tests -p "test_counterfactuals.py" -v
python -m unittest discover -s economic-model\tests -p "test_adversarial_metrics.py" -v
python -m unittest discover -s economic-model\tests -p "test_adversarial_runner.py" -v
python -m unittest discover -s economic-model\tests -p "test_candidates.py" -v
python -m unittest discover -s economic-model\tests -p "test_candidate_models.py" -v
python -m unittest discover -s economic-model\tests -p "test_model_comparison.py" -v
python -m unittest discover -s economic-model\tests -p "test_candidate_runner.py" -v
python -m unittest discover -s economic-model\tests -p "test_*.py" -v
python -m bidback_economics.runner --list
python -m bidback_economics.runner --scenario s10-anti-sniping --json
python -m bidback_economics.runner --all --json
python -m bidback_economics.adversarial_runner --list
python -m bidback_economics.adversarial_runner --case d01-deliberate-loser
python -m bidback_economics.adversarial_runner --case d05-sybil-cap-bypass --json
python -m bidback_economics.adversarial_runner --all --json
python -m bidback_economics.candidate_runner --list-models
python -m bidback_economics.candidate_runner --compare --scenario s04-heterogeneous --json
python -m bidback_economics.candidate_runner --adversarial d01-deliberate-loser --json
python -m bidback_economics.candidate_runner --adversarial d05-sybil-cap-bypass --json
python -m bidback_economics.candidate_runner --adversarial d06-sybil-threshold --json
python -m bidback_economics.candidate_runner --adversarial d08b-seller-self-purchase --json
python -m bidback_economics.candidate_runner --adversarial d09-alternating-identities --json
python -m bidback_economics.candidate_runner --all --json
$lotFSourceCommit = 'cf3f447a5632591209f3610e2acff77eec10aaaf'
python -m unittest discover -s economic-model\tests -p "test_decision_analysis.py" -v
python -m unittest discover -s economic-model\tests -p "test_decision_runner.py" -v
python -m bidback_economics.decision_runner --source-commit $lotFSourceCommit
python -m bidback_economics.decision_runner --source-commit $lotFSourceCommit --json
```

Python 3.12 standard library is sufficient. No package installation or external runtime dependency
is required.
