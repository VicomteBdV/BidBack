# BidBack Economic Model V1 — Python baseline and deterministic scenarios

This directory contains two deliberately separate layers. Lot B is a deterministic Python twin
of the current Solidity auction economics. Lot C uses that baseline to materialize small,
interpretable bidder scenarios and calculate descriptive economic reports. Solidity remains
authoritative; Lot C is neither an alternative model nor a recommendation of production
parameters.

## Authority and boundaries

The authority order is:

1. production Solidity under `src/`;
2. `test/EconomicModelParity.t.sol`;
3. `docs/ECONOMIC_MODEL_V1_SPEC.md`;
4. schema-v2 transport fixtures under `fixtures/`;
5. the Lot B Python baseline;
6. Lot C scenarios, decisions, and descriptive metrics.

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

## Explicit exclusions

Lot C contains no random or stochastic engine, parameter sweep, Monte Carlo, alternative scoring,
sybil, collusion, farming, deliberate-loser optimizer, causal counterfactual engine, plotting, or
claim that a candidate model is better. Adversarial work belongs to Lot D.

## Manual validation

From the repository root on Windows PowerShell:

```powershell
python --version
$env:PYTHONPATH = (Resolve-Path 'economic-model\src').Path
python -m compileall economic-model\src economic-model\tests
python -m unittest discover -s economic-model\tests -v
python -m bidback_economics.runner --list
python -m bidback_economics.runner --scenario s10-anti-sniping --json
python -m bidback_economics.runner --all --json
```

Python 3.12 standard library is sufficient. No package installation or external runtime dependency
is required.
