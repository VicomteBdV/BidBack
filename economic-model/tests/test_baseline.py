from __future__ import annotations

import unittest

from bidback_economics.baseline import (
    BPS,
    SCALE,
    AuctionSimulationRevert,
    cap_delta,
    default_params,
    financial_engagement,
    increment_significant_overbids,
    minimum_next_bid,
    reputation_bps,
    simulate_auction,
)
from bidback_economics.solidity_math import (
    UINT256_MAX,
    checked_mul,
    explicit_unsigned_cast,
    validate_typed_uint,
)
from bidback_economics.types import AuctionConfig, BidEvent, SolidityOverflow, serialize_result


class SolidityArithmeticTest(unittest.TestCase):
    def test_typed_input_rejects_out_of_range_value(self) -> None:
        with self.assertRaises(SolidityOverflow):
            validate_typed_uint(2**64, 64)
        for bits in (8, 16, 256):
            with self.subTest(bits=bits), self.assertRaises(SolidityOverflow):
                validate_typed_uint(2**bits, bits)

    def test_explicit_unsigned_narrowing_cast_truncates(self) -> None:
        self.assertEqual(explicit_unsigned_cast(2**64 + 7, 64), 7)

    def test_bool_is_not_accepted_as_uint(self) -> None:
        with self.assertRaises(SolidityOverflow):
            validate_typed_uint(True, 256)
        with self.assertRaises(SolidityOverflow):
            validate_typed_uint(1.0, 256)

    def test_checked_overflow_happens_before_division(self) -> None:
        with self.assertRaises(SolidityOverflow):
            checked_mul(UINT256_MAX, SCALE)

    def test_financial_engagement_preserves_two_floors(self) -> None:
        self.assertEqual(financial_engagement(1, 4, SCALE), 62_500_000_000_000_000)
        self.assertEqual(financial_engagement(1, 2, SCALE), 250_000_000_000_000_000)

    def test_significant_overbids_saturates_at_uint16_max(self) -> None:
        self.assertEqual(increment_significant_overbids(2**16 - 2), 2**16 - 1)
        self.assertEqual(increment_significant_overbids(2**16 - 1), 2**16 - 1)


class BaselineStateMachineTest(unittest.TestCase):
    def _config(self, *, finalization_time: int | None = 7_201) -> AuctionConfig:
        return AuctionConfig(
            start_price=1_000,
            start_time=0,
            duration=3_600,
            params=default_params(),
            finalization_time=finalization_time,
        )

    def test_minimum_bid_ceil_and_delta(self) -> None:
        self.assertEqual(minimum_next_bid(10_000, 10_001, 500), 10_502)
        self.assertEqual(cap_delta(10_001, 11_028), 1_027)

    def test_missing_reputation_uses_default(self) -> None:
        self.assertEqual(reputation_bps({}, "BIDDER_A"), BPS)

    def test_invalid_reputation_uses_real_custom_error_name(self) -> None:
        with self.assertRaises(AuctionSimulationRevert) as raised:
            reputation_bps({"BIDDER_A": 4_999}, "BIDDER_A")
        self.assertEqual(raised.exception.code, "ReputationOutOfBounds")

    def test_state_machine_derives_unique_participants_and_takeovers(self) -> None:
        bids = (
            BidEvent("A", 1_000, 1_000, 0),
            BidEvent("B", 1_100, 1_100, 1),
            BidEvent("A", 1_200, 200, 2),
        )
        result = simulate_auction(self._config(), bids, {})
        self.assertEqual(result.state.participants, ("A", "B"))
        self.assertEqual(result.bidders["A"].significant_overbids, 1)
        self.assertEqual(result.bidders["B"].significant_overbids, 1)
        self.assertEqual(result.state.highest_bidder, "A")
        self.assertEqual(result.state.highest_bid, 1_200)
        self.assertEqual(result.accounting.total_deposits, 2_300)

    def test_step_up_must_deposit_only_delta(self) -> None:
        bids = (
            BidEvent("A", 1_000, 1_000, 0),
            BidEvent("B", 1_100, 1_100, 1),
            BidEvent("A", 1_200, 1_200, 2),
        )
        with self.assertRaises(AuctionSimulationRevert) as raised:
            simulate_auction(self._config(), bids, {})
        self.assertEqual(raised.exception.code, "InvalidDeposit")

    def test_zero_pool_short_circuits_scoring_and_reputation_read(self) -> None:
        result = simulate_auction(
            self._config(),
            (BidEvent("A", 1_000, 1_000, 0),),
            {"A": 4_999},
        )
        self.assertEqual(result.settlement.candidate_pool, 0)
        self.assertEqual(result.scores, {})

    def test_bid_at_or_after_current_end_reverts(self) -> None:
        with self.assertRaises(AuctionSimulationRevert) as raised:
            simulate_auction(
                self._config(finalization_time=None),
                (BidEvent("A", 1_000, 1_000, 3_600),),
                {},
            )
        self.assertEqual(raised.exception.code, "AuctionNotOpen")

    def test_start_timestamp_uses_explicit_uint64_cast(self) -> None:
        wrapped_start = 2**64 + 100
        config = AuctionConfig(1, wrapped_start, 3_600, default_params(), None)
        result = simulate_auction(config, (), {})
        self.assertEqual(result.state.start_time, 100)
        self.assertEqual(result.state.initial_end_time, 3_700)

    def test_result_serialization_is_deterministic(self) -> None:
        result = simulate_auction(self._config(), (BidEvent("A", 1_000, 1_000, 0),), {})
        self.assertEqual(serialize_result(result), serialize_result(result))
        self.assertIn('"model_version":"solidity-baseline-v1"', serialize_result(result))


if __name__ == "__main__":
    unittest.main()
