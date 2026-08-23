from __future__ import annotations

import unittest
from dataclasses import replace

from bidback_economics.baseline import default_params, simulate_auction
from bidback_economics.invariants import evaluate_invariants
from bidback_economics.types import AccountingResult, AuctionConfig, BidEvent


class InvariantTest(unittest.TestCase):
    def test_settled_trace_satisfies_all_invariant_categories(self) -> None:
        config = AuctionConfig(1_000, 1_000, 3_600, default_params(), 8_201)
        bids = (
            BidEvent("A", 1_000, 1_000, 1_000),
            BidEvent("B", 1_100, 1_100, 1_001),
            BidEvent("A", 1_200, 200, 1_002),
        )
        result = simulate_auction(config, bids, {})
        self.assertEqual(
            {item.category for item in result.invariants},
            {"state-machine", "settlement", "scoring-allocation"},
        )
        self.assertTrue(all(item.passed for item in result.invariants))

    def test_no_bid_path_has_no_liability(self) -> None:
        result = simulate_auction(
            AuctionConfig(1_000, 1_000, 3_600, default_params(), 4_601),
            (),
            {},
        )
        self.assertEqual(result.accounting.total_deposits, 0)
        self.assertEqual(result.accounting.total_liabilities, 0)
        self.assertFalse(result.settlement.escrow_opened)
        self.assertTrue(all(item.passed for item in result.invariants))

    def test_invariant_diagnostic_detects_broken_deposit_conservation(self) -> None:
        result = simulate_auction(
            AuctionConfig(1_000, 1_000, 3_600, default_params(), 4_601),
            (BidEvent("A", 1_000, 1_000, 1_000),),
            {},
        )
        broken_accounting = AccountingResult(
            result.accounting.total_deposits + 1,
            result.accounting.refunds,
            result.accounting.winner_surplus,
            result.accounting.total_liabilities,
            result.accounting.remaining_after_all_claims,
        )
        broken = replace(result, accounting=broken_accounting, invariants=())
        checks = evaluate_invariants(broken)
        failed_names = {item.name for item in checks if not item.passed}
        self.assertIn("deposits equal sum of caps", failed_names)
        self.assertIn("deposit conservation", failed_names)


if __name__ == "__main__":
    unittest.main()
