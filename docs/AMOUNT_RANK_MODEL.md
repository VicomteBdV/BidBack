# Amount and chronological rank redistribution

This document describes the `amount-rank-v1` source implementation. It has not
been deployed by this change. Existing deployments, auctions and claims retain
their existing contracts and rules. The historical Economic Model V1 evaluation
and its recorded decision remain unchanged.

## Bid score

For each accepted bid at global chronological rank `r`, starting at 1:

```text
delta = new cap - this bidder's previous cap
weight = h / (h + r - 1)
score increment = floor(delta * Q * h / (h + r - 1))
Q = 2^136
```

The score accumulates these increments for each bidder. Rank counts all accepted
bids, including bids by the eventual winner. The winner's entire accumulated
score is excluded at finalization. Rebids keep their bidder's original position
in the participant list.

`rankSoftness` is captured in the existing auction parameter snapshot. Its
default is 4, giving weights `1`, `4/5`, `4/6`, `4/7`, and so on. It accepts
integers from 1 to 65,535; larger values flatten the curve. Later global parameter
updates affect future auctions only. This is a selected rule, not a claim of a
universally optimal model or of resistance to coordinated wallets.

## Funding and whole-wei allocation

The existing settlement conditions still determine whether a pool is available:
minimum participants, initial duration, and a positive net premium meeting the
configured threshold. The funding equations remain:

```text
gross premium = final price - starting price
protocol fee = floor(gross premium * bidbackFeeBps / 10,000)
net premium = gross premium - protocol fee
available pool = floor(net premium * redistributionBps / 10,000)
```

Defaults remain 500 bps of gross premium for the protocol fee and 5,000 bps of
net premium for the pool. There is no additional fee or configured-cost
deduction in this implementation. A zero premium creates neither a protocol fee
nor a funded reward. Refundable bidder caps never fund redistribution.

When a positive pool and losing scores exist, each losing bidder first receives
the floor of its proportional share. Remaining wei go to the largest fractional
remainders, with ties resolved by first-participation order. Each selected
recipient receives at most one residual wei. The assigned amounts sum to the
whole available pool. With no losers, the pool remains unassigned in seller
proceeds. A small individual reward can round to zero.

The legacy per-user reward cap, EF/ET/II weights and reputation multiplier do not
participate in this rule. Their parameter fields and module are retained for
compatibility. Losing caps remain fully refundable; rewards and network fees
are separate. Seller proceeds are final price minus the protocol fee and
assigned distribution. Existing pull claims and pause-safe exits are preserved.

## Arithmetic and implementation identity

Starting prices and bid caps must not exceed `2^112 - 1` wei. Full-precision
512-bit multiplication/division is used for score increments and proportional
quotients; `mulmod` calculates exact integer-allocation remainders. With the
enforced bid-increment and participant bounds, scores fit `uint256`, and the
error of an ideal fractional quota before whole-wei allocation is below
`1/8` wei. This does not guarantee the same final-wei recipient as exact rational
Hamilton allocation at ties or near ties.

The implementation reports:

| Getter | Value |
| --- | --- |
| `FORMULA_ID` | `amount-rank-v1` |
| `ARITHMETIC_ID` | `floor-delta-q136-muldiv512-v1` |
| `ROUNDING_ID` | `hamilton-first-participation-v1` |
| `SCORE_SCALE` | `2^136` |
| `MAX_AMOUNT` | `2^112 - 1` |

The frontend reads these getters at one address and block before using the
20-field parameter ABI. Historical 19-field reads remain available; missing or
unknown metadata is explicitly unavailable. A captured `h` is never replaced
with an assumed default. Score reads are optional and do not block refunds or
claims. Reported identifiers alone do not verify deployed bytecode: deployment
address, verified source/runtime and the auction snapshot must establish the
executed rule. There is no proxy, generic formula registry or vault migration.

## Validation and operational limits

The source has Foundry allocation, snapshot, claim, arithmetic, fuzz and stateful
accounting checks. The JSON fixture contains 28 synthetic arithmetic vectors
needed by the Solidity parity test. Some allocator boundary cases use supplied
pools independently of a funded auction; integration tests separately cover
funding. Frontend tests cover supported/unknown metadata, captured parameters,
monetary bounds and wallet review/recovery with mocks.

The participant count defaults to 64 and remains configurable up to 256. Gas
measurements are examples, not a worst-case capacity certificate. In particular,
the measured 256-participant finalization exceeds a transaction ceiling of
16,777,216 gas. A deployment must validate and enforce a safe configuration for
its actual chain before accepting bids. This change approves no production
capacity, governance, wallet support matrix or real-value launch.

Lifecycle tools distinguish explicit `legacy-capped-v1` and `amount-rank-v1`
profiles before validating phases. Exact static tuple widths are checked to
prevent an ABI19 decoder from hiding a twentieth field; the new profile also
checks the five reported constants, captured softness and scores at pinned
blocks. Unknown identities, mismatched shapes or failed reads do not select a
legacy fallback. The helper's bigint allocation is checked against the existing
28 synthetic vectors with lossless integer parsing.

Schema1 sessions keep their historical legacy shape and amounts. Schema2
sessions carry `profile` and `expectedFormula`; snapshots and assembled evidence
also retain observed model metadata. Source/manifest identity, historical reads,
block/reorg checks and create-only output rules remain required. Neither the
source commit nor getters prove deployed bytecode equivalence.

The current full local wrapper deploys only the amount-rank sources and rejects
a legacy full-run request before deployment. Its network-only preflight is a
separate, non-certifying operation. Tooling tests use mocks and a fake-npm
boundary; earlier local/testnet records do not validate a new deployment. No
operational lifecycle, deployment address or live manifest is changed here.
