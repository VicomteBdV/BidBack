# BidBack Economic Model V1 — Python baseline and deterministic scenarios

This directory contains three deliberately separate layers. Lot B is a deterministic Python twin
of the current Solidity auction economics. Lot C uses that baseline to materialize small,
interpretable bidder scenarios and calculate descriptive economic reports. Lot D pairs two
complete Lot C reports and adds economic-actor, coalition, capital, and counterfactual accounting.
Solidity remains authoritative; none of these layers is an alternative model or a recommendation
of production parameters.

## Authority and boundaries

The authority order is:

1. production Solidity under `src/`;
2. `test/EconomicModelParity.t.sol`;
3. `docs/ECONOMIC_MODEL_V1_SPEC.md`;
4. schema-v2 transport fixtures under `fixtures/`;
5. the Lot B Python baseline;
6. Lot C scenarios, decisions, and descriptive metrics;
7. Lot D actor-aware paired diagnostics.

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

## Explicit exclusions

Lot D contains no random or stochastic engine, parameter sweep, Monte Carlo, optimizer,
alternative scoring, mitigation, parameter recommendation, plotting, or production exploitability
classification. Its matched pairs are bounded diagnostics, not causal claims about behavior beyond
their declared assumptions and controls.

## Manual validation

From the repository root on Windows PowerShell:

```powershell
python --version
$env:PYTHONPATH = (Resolve-Path 'economic-model\src').Path
python -m compileall economic-model\src economic-model\tests
python -m unittest discover -s economic-model\tests -p "test_counterfactuals.py" -v
python -m unittest discover -s economic-model\tests -p "test_adversarial_metrics.py" -v
python -m unittest discover -s economic-model\tests -p "test_adversarial_runner.py" -v
python -m unittest discover -s economic-model\tests -p "test_*.py" -v
python -m bidback_economics.runner --list
python -m bidback_economics.runner --scenario s10-anti-sniping --json
python -m bidback_economics.runner --all --json
python -m bidback_economics.adversarial_runner --list
python -m bidback_economics.adversarial_runner --case d01-deliberate-loser
python -m bidback_economics.adversarial_runner --case d05-sybil-cap-bypass --json
python -m bidback_economics.adversarial_runner --all --json
```

Python 3.12 standard library is sufficient. No package installation or external runtime dependency
is required.
