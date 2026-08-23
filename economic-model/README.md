# BidBack Economic Model V1 — Python Baseline

This directory contains a deterministic Python twin of the current Solidity auction economics.
Solidity remains authoritative. The Python package is a parity and invariant harness, not an
alternative economic model.

## Scope

The baseline reproduces:

- checked unsigned arithmetic and Solidity integer rounding;
- typed uint inputs and explicit unsigned narrowing casts as distinct operations;
- bid caps, exact deposit deltas, participant uniqueness, takeover counts, and anti-sniping;
- premium, protocol fee, candidate distribution pool, EF, ET, II, reputation, and allocation;
- full losing refunds, seller proceeds, reserves, and settlement conservation;
- schema-v2 golden-vector loading and explicit evidence-projection boundaries.

It contains no bidder behavior, randomness, Monte Carlo engine, parameter sweep, adversarial
engine, alternative scoring model, plotting, or result-report generator. Operational claim flows
are also outside Lot B.

## Authority and fixture roles

The authority order is:

1. production Solidity under `src/`;
2. `test/EconomicModelParity.t.sol`;
3. `docs/ECONOMIC_MODEL_V1_SPEC.md`;
4. schema-v2 transport fixtures under `fixtures/`;
5. this Python implementation.

`state-machine` fixtures are self-contained and are replayed by `simulate_auction`. A
`pure-function` fixture supplies only the operands of its declared function. A `revert` fixture
must raise the structured arithmetic error it names. A `settlement-projection` recomputes only its
declared time-independent fields.

The Base Sepolia fixture is projection-only. Its missing timestamps and null EF/ET/II/scoring
fields are never reconstructed or presented as historical evidence. Retained distribution facts
are used only to check accounting identities that depend on them.

## Public API

```python
from bidback_economics import AuctionConfig, BidEvent, ParamsSnapshot, simulate_auction

result = simulate_auction(config, bid_trace, reputations)
```

The reputation mapping represents values read at finalization. Missing addresses use the Solidity
default of `10000`; explicit values must be within `5000..15000`.

All wei, timestamps, basis points, scores, caps, and counters are Python integers. Floats are not
accepted in the economic path. Result ordering follows participant insertion order and serialized
metadata carries schema and model versions; a source commit may be supplied by the caller.

## Manual validation

From the repository root on Windows PowerShell:

```powershell
python --version
$env:PYTHONPATH = (Resolve-Path 'economic-model\src').Path
python -m compileall economic-model\src economic-model\tests
python -m unittest discover -s economic-model\tests -v
```

No package installation or external runtime dependency is required.
