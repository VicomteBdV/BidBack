from __future__ import annotations

import unittest

from bidback_economics.fixtures import load_fixtures


class MutationGuardTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.by_id = {vector.id: vector for vector in load_fixtures()}

    def test_floor_to_ceil_is_killed_by_uncapped_normalization(self) -> None:
        vector = self.by_id["multi-loser-uncapped-normalization-v1"]
        pool = vector.expected["candidatePool"]
        total = vector.expected["totalScore"]
        scores = vector.expected["finalScore"]
        mutant = {
            bidder: (pool * score + total - 1) // total
            for bidder, score in scores.items()
            if score is not None
        }
        self.assertNotEqual(mutant, vector.expected["rawReward"])

    def test_wrong_ef_division_order_is_killed_by_ef_boundaries(self) -> None:
        vector = self.by_id["ef-boundaries-v1"]
        case = vector.inputs["cases"][1]
        ratio_mutant = (case["maxCap"] // case["finalPrice"]) * vector.params["SCALE"]
        ef_mutant = ratio_mutant * ratio_mutant // vector.params["SCALE"]
        self.assertNotEqual(ef_mutant, vector.expected["EF"][1])

    def test_end_time_for_et_is_killed_by_extension_vector(self) -> None:
        vector = self.by_id["first-bid-after-initial-end-v1"]
        first_bid = vector.bid_trace[1]["timestampOffsetSeconds"]
        extended_end = vector.expected["endTimeAfterFirstExtensionOffsetSeconds"]
        duration = extended_end
        exposure = extended_end - first_bid
        mutant = exposure * 10**18 // duration if exposure >= vector.params["minExposure"] else 0
        self.assertNotEqual(mutant, vector.expected["ET"]["BIDDER_B"])

    def test_post_cap_renormalization_is_killed_by_cap_active_vector(self) -> None:
        vector = self.by_id["multi-loser-cap-active-v1"]
        capped = dict(vector.expected["reward"])
        remainder = vector.expected["candidatePool"] - sum(capped.values())
        mutant = dict(capped)
        mutant["BIDDER_B"] += remainder
        self.assertNotEqual(mutant, vector.expected["reward"])

    def test_ignored_reputation_is_killed_by_live_normalization(self) -> None:
        vector = self.by_id["reputation-change-normalization-v1"]
        pool = vector.expected["candidatePool"]
        weighted = vector.expected["weightedScore"]
        total = sum(weighted.values())
        mutant_a = pool * weighted["BIDDER_A"] // total
        self.assertNotEqual(mutant_a, vector.expected["rawReward"]["BIDDER_A"])

    def test_redistributed_dust_is_killed_by_uncapped_vector(self) -> None:
        vector = self.by_id["multi-loser-uncapped-normalization-v1"]
        mutant = dict(vector.expected["reward"])
        mutant["BIDDER_C"] += vector.expected["candidatePool"] - vector.expected["assignedDistribution"]
        self.assertNotEqual(sum(mutant.values()), vector.expected["assignedDistribution"])

    def test_full_cap_step_up_deposit_is_killed_by_delta_vector(self) -> None:
        vector = self.by_id["minimum-bid-ceil-and-delta-v1"]
        third_bid = vector.bid_trace[2]
        full_cap_mutant = third_bid["newCap"]
        self.assertNotEqual(full_cap_mutant, vector.expected["capDelta"][2])


if __name__ == "__main__":
    unittest.main()
