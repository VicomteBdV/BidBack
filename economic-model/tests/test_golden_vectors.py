from __future__ import annotations

import unittest

from bidback_economics.baseline import financial_engagement, simulate_auction
from bidback_economics.fixtures import (
    assert_recomputable_matches,
    load_fixtures,
    pure_function_projection,
    settlement_projection,
    simulation_projection,
    state_case,
)
from bidback_economics.types import SolidityOverflow


class GoldenVectorParityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.vectors = load_fixtures()

    def test_schema_v2_contains_all_authoritative_vectors(self) -> None:
        self.assertEqual(len(self.vectors), 19)
        self.assertEqual(len({vector.id for vector in self.vectors}), 19)
        self.assertEqual(
            {vector.fixture_kind for vector in self.vectors},
            {"pure-function", "state-machine", "settlement-projection", "revert"},
        )

    def test_every_recomputable_golden_value_matches_exactly(self) -> None:
        consumed: dict[str, frozenset[str]] = {}
        for vector in self.vectors:
            with self.subTest(vector=vector.id):
                if vector.fixture_kind == "pure-function":
                    actual = pure_function_projection(vector)
                elif vector.fixture_kind == "state-machine":
                    config, bids, reputations = state_case(vector)
                    result = simulate_auction(config, bids, reputations)
                    self.assertEqual(result.state.participants, vector.participants)
                    for fixture_bid, audit in zip(vector.bid_trace, result.bid_audit, strict=True):
                        if "observedPriceLift" in fixture_bid:
                            self.assertEqual(audit.observed_price_lift, fixture_bid["observedPriceLift"])
                        if "premiumLift" in fixture_bid:
                            self.assertEqual(audit.premium_lift, fixture_bid["premiumLift"])
                    self.assertTrue(all(item.passed for item in result.invariants))
                    actual = simulation_projection(vector, result)
                elif vector.fixture_kind == "settlement-projection":
                    actual = settlement_projection(vector)
                else:
                    self.assertEqual(vector.fixture_function, "financial_engagement")
                    with self.assertRaises(SolidityOverflow) as raised:
                        financial_engagement(
                            vector.inputs["maxCap"],
                            vector.inputs["finalPrice"],
                            vector.params["efCap"],
                        )
                    actual = {
                        "revert": True,
                        "revertClass": raised.exception.code,
                    }
                consumed[vector.id] = assert_recomputable_matches(vector, actual)
        self.assertEqual(set(consumed), {vector.id for vector in self.vectors})

    def test_null_values_are_never_in_verification_scope(self) -> None:
        for vector in self.vectors:
            with self.subTest(vector=vector.id):
                null_fields = {key for key, value in vector.expected.items() if value is None}
                self.assertTrue(null_fields.isdisjoint(vector.recomputable_fields))
                self.assertTrue(null_fields.isdisjoint(vector.retained_fields))

    def test_base_sepolia_remains_projection_only(self) -> None:
        vector = next(item for item in self.vectors if item.fixture_kind == "settlement-projection")
        self.assertEqual(vector.inputs["exactBidTimestamps"], None)
        self.assertIsNone(vector.reputations)
        for field in ("EF", "ET", "II", "weightedScore", "finalScore", "totalScore"):
            self.assertIsNone(vector.expected[field])
            self.assertNotIn(field, vector.recomputable_fields)
        self.assertEqual(
            vector.retained_fields,
            {
                "reputation",
                "rawReward",
                "reward",
                "assignedDistribution",
                "finalEscrowAfterAllClaims",
            },
        )

    def test_base_sepolia_retained_facts_are_accounting_consistent(self) -> None:
        vector = next(item for item in self.vectors if item.fixture_kind == "settlement-projection")
        actual = settlement_projection(vector)
        self.assertEqual(sum(vector.expected["reward"].values()), vector.expected["assignedDistribution"])
        self.assertEqual(vector.expected["rawReward"], vector.expected["candidatePool"])
        self.assertEqual(vector.expected["reward"]["W_A"], 0)
        self.assertLessEqual(vector.expected["reward"]["W_B"], actual["perUserCap"])
        self.assertEqual(
            vector.expected["sellerProceeds"]
            + vector.expected["feeAmount"]
            + vector.expected["assignedDistribution"],
            vector.expected["finalPrice"],
        )
        self.assertEqual(actual["totalDeposits"], vector.expected["finalLiabilities"])
        self.assertEqual(
            actual["totalDeposits"] - vector.expected["finalLiabilities"],
            vector.expected["finalEscrowAfterAllClaims"],
        )


if __name__ == "__main__":
    unittest.main()
