from __future__ import annotations

import copy
import unittest
from dataclasses import replace

from bidback_economics.candidate_models import (
    allocate_candidate_rewards,
    candidate_distribution_pool,
    evaluate_candidate,
)
from bidback_economics.candidates import (
    AllocationPolicy,
    AllocationSubject,
    CandidateDefinition,
    ContributionPolicy,
    EligibilityPolicy,
    PoolPolicy,
    RewardCapPolicy,
    SecondaryWeightPolicy,
)
from bidback_economics.runner import run_scenario, serialize_report
from bidback_economics.scenarios import Opportunity, load_scenario
from bidback_economics.solidity_math import UINT256_MAX
from bidback_economics.types import SolidityOverflow, serialize_result


def _candidate(
    candidate_id: str,
    *,
    contribution: ContributionPolicy = ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
    allocation: AllocationPolicy = AllocationPolicy.NORMALIZED,
    cap: RewardCapPolicy = RewardCapPolicy.NONE,
    secondary: SecondaryWeightPolicy = SecondaryWeightPolicy.NONE,
) -> CandidateDefinition:
    return CandidateDefinition(
        id=candidate_id,
        description=candidate_id,
        allocation_subject=AllocationSubject.BIDDER_IDENTITY,
        pool_policy=PoolPolicy.NET_PREMIUM_THRESHOLD,
        eligibility_policy=EligibilityPolicy.POSITIVE_CONTRIBUTION,
        contribution_policy=contribution,
        allocation_policy=allocation,
        reward_cap_policy=cap,
        secondary_weight_policy=secondary,
    )


CANDIDATE_A = _candidate("candidate-v1-a", cap=RewardCapPolicy.BASELINE_PER_USER)
CANDIDATE_B = _candidate(
    "candidate-v1-b",
    allocation=AllocationPolicy.GROSS_PREMIUM_DIRECT,
)
CANDIDATE_C = _candidate("candidate-v1-c")
CANDIDATE_D = _candidate(
    "candidate-v1-d",
    cap=RewardCapPolicy.BASELINE_PER_USER,
    secondary=SecondaryWeightPolicy.BASELINE_FINAL_SCORE,
)
CANDIDATE_E = _candidate(
    "candidate-v1-e",
    contribution=ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY,
)


class CandidatePoolTest(unittest.TestCase):
    def test_pool_is_thresholded_only_by_net_premium(self) -> None:
        self.assertEqual(candidate_distribution_pool(99, 5_000, 100), 0)
        self.assertEqual(candidate_distribution_pool(100, 5_000, 100), 50)
        self.assertEqual(candidate_distribution_pool(100, 20_000, 100), 100)

    def test_pool_api_has_no_participant_count_gate(self) -> None:
        scenario = load_scenario("s02-clear-gap")
        winner = next(bidder for bidder in scenario.bidders if bidder.id == "BIDDER_W")
        one_identity = replace(
            scenario,
            bidders=(winner,),
            reputations={},
            opportunities=(Opportunity(500, winner.id),),
        )
        report = run_scenario(one_identity)
        self.assertEqual(report.baseline_result.state.participant_count, 1)
        self.assertEqual(report.baseline_result.settlement.candidate_pool, 0)
        evaluation = evaluate_candidate(CANDIDATE_C, one_identity, report)
        self.assertGreater(evaluation.candidate_pool, 0)
        self.assertEqual(evaluation.allocation.assigned, 0)
        self.assertEqual(evaluation.allocation.unassigned_remainder, evaluation.candidate_pool)

    def test_pool_multiplication_overflow_is_not_hidden_by_floor(self) -> None:
        with self.assertRaises(SolidityOverflow):
            candidate_distribution_pool(UINT256_MAX, 10_000, 0)


class CandidateAllocationFormulaTest(unittest.TestCase):
    PARTICIPANTS = ("A", "B", "W")
    CONTRIBUTIONS = {"A": 2, "B": 1, "W": 7}

    def _allocate(
        self,
        model: CandidateDefinition,
        *,
        secondary_scores: dict[str, int] | None = None,
    ):
        return allocate_candidate_rewards(
            model,
            10,
            self.CONTRIBUTIONS,
            participants=self.PARTICIPANTS,
            winner="W",
            gross_premium=10,
            per_user_reward_cap_bps=4_000,
            secondary_score_by_subject=secondary_scores,
        )

    def test_candidate_a_normalizes_contribution_then_applies_baseline_cap(self) -> None:
        allocation = self._allocate(CANDIDATE_A)
        self.assertEqual(allocation.raw_rewards, {"A": 6, "B": 3})
        self.assertEqual(allocation.rewards, {"A": 4, "B": 3, "W": 0})
        self.assertEqual(allocation.per_user_cap, 4)
        self.assertEqual(allocation.assigned, 7)
        self.assertEqual(allocation.unassigned_remainder, 3)

    def test_candidate_b_uses_gross_premium_denominator_without_renormalizing(self) -> None:
        allocation = self._allocate(CANDIDATE_B)
        self.assertEqual(allocation.raw_rewards, {"A": 2, "B": 1})
        self.assertEqual(allocation.rewards, {"A": 2, "B": 1, "W": 0})
        self.assertEqual(allocation.assigned, 3)
        self.assertEqual(allocation.unassigned_remainder, 7)

    def test_candidate_c_normalizes_and_preserves_floor_dust(self) -> None:
        allocation = self._allocate(CANDIDATE_C)
        self.assertEqual(allocation.raw_rewards, {"A": 6, "B": 3})
        self.assertEqual(allocation.rewards, {"A": 6, "B": 3, "W": 0})
        self.assertEqual(allocation.assigned, 9)
        self.assertEqual(allocation.unassigned_remainder, 1)

    def test_candidate_d_gates_on_contribution_and_weights_by_baseline_score(self) -> None:
        allocation = self._allocate(CANDIDATE_D, secondary_scores={"A": 3, "B": 1, "W": 100})
        self.assertEqual(allocation.weight_by_subject, {"A": 3, "B": 1, "W": 0})
        self.assertEqual(allocation.raw_rewards, {"A": 7, "B": 2})
        self.assertEqual(allocation.rewards, {"A": 4, "B": 2, "W": 0})
        self.assertEqual(allocation.assigned, 6)
        self.assertEqual(allocation.unassigned_remainder, 4)

    def test_candidate_e_keeps_identity_level_normalized_allocation(self) -> None:
        allocation = self._allocate(CANDIDATE_E)
        self.assertEqual(allocation.contribution_by_subject, self.CONTRIBUTIONS)
        self.assertEqual(allocation.raw_rewards, {"A": 6, "B": 3})
        self.assertEqual(allocation.rewards["W"], 0)

    def test_zero_contribution_is_ineligible_and_winner_is_always_excluded(self) -> None:
        allocation = allocate_candidate_rewards(
            CANDIDATE_C,
            10,
            {"ZERO": 0, "LOSER": 1, "WINNER": UINT256_MAX},
            participants=("ZERO", "LOSER", "WINNER"),
            winner="WINNER",
            gross_premium=UINT256_MAX,
            per_user_reward_cap_bps=4_000,
        )
        self.assertEqual(allocation.weight_by_subject["ZERO"], 0)
        self.assertEqual(allocation.weight_by_subject["WINNER"], 0)
        self.assertEqual(allocation.rewards, {"ZERO": 0, "LOSER": 10, "WINNER": 0})

    def test_raw_reward_multiplication_overflow_precedes_division(self) -> None:
        with self.assertRaises(SolidityOverflow):
            allocate_candidate_rewards(
                CANDIDATE_C,
                UINT256_MAX,
                {"A": 2, "W": 0},
                participants=("A", "W"),
                winner="W",
                gross_premium=2,
                per_user_reward_cap_bps=4_000,
            )


class CandidateEvaluationTest(unittest.TestCase):
    def test_mismatched_scenario_and_report_are_rejected(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        report = run_scenario(scenario)
        mismatched = replace(scenario, start_price=scenario.start_price + 1)
        with self.assertRaises(ValueError):
            evaluate_candidate(CANDIDATE_C, mismatched, report)

    def test_mechanical_contribution_and_overlay_conservation(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        report = run_scenario(scenario)
        evaluation = evaluate_candidate(CANDIDATE_C, scenario, report)
        baseline = report.baseline_result.settlement
        self.assertEqual(
            sum(evaluation.mechanical_contribution_by_subject.values()),
            baseline.gross_premium,
        )
        self.assertEqual(evaluation.baseline_settlement, baseline)
        self.assertEqual(evaluation.settlement.winner, baseline.winner)
        self.assertEqual(evaluation.settlement.final_price, baseline.final_price)
        self.assertEqual(evaluation.settlement.fee_amount, baseline.fee_amount)
        self.assertEqual(evaluation.settlement.nft_claimant, baseline.nft_claimant)
        self.assertEqual(
            evaluation.candidate_pool,
            evaluation.allocation.assigned + evaluation.allocation.unassigned_remainder,
        )
        self.assertEqual(
            evaluation.settlement.seller_proceeds,
            baseline.final_price - baseline.fee_amount - evaluation.allocation.assigned,
        )
        self.assertTrue(all(invariant.passed for invariant in evaluation.invariants))

    def test_no_bid_seller_premium_capture_uses_lot_c_zero_convention(self) -> None:
        scenario = load_scenario("s01-no-competition")
        no_bid = replace(scenario, opportunities=(Opportunity(4_000, "BIDDER_A"),))
        report = run_scenario(no_bid)
        evaluation = evaluate_candidate(CANDIDATE_A, no_bid, report)
        self.assertIsNone(evaluation.settlement.winner)
        self.assertEqual(evaluation.settlement.seller_proceeds, 0)
        self.assertEqual(evaluation.settlement.seller_premium_capture, 0)

    def test_candidate_d_rebuilds_missing_final_scores_with_baseline_helpers(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        report = run_scenario(scenario)
        expected = evaluate_candidate(CANDIDATE_D, scenario, report)
        scoreless_result = replace(report.baseline_result, scores={})
        scoreless_report = replace(report, baseline_result=scoreless_result)
        rebuilt = evaluate_candidate(CANDIDATE_D, scenario, scoreless_report)
        self.assertEqual(rebuilt.secondary_score_by_subject, expected.secondary_score_by_subject)
        self.assertEqual(rebuilt.allocation, expected.allocation)

    def test_candidate_e_requires_explicit_nonnegative_identity_contributions(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        report = run_scenario(scenario)
        with self.assertRaises(ValueError):
            evaluate_candidate(CANDIDATE_E, scenario, report)
        with self.assertRaises(SolidityOverflow):
            evaluate_candidate(
                CANDIDATE_E,
                scenario,
                report,
                counterfactual_contributions={"BIDDER_A": -1},
            )
        with self.assertRaises(ValueError):
            evaluate_candidate(
                CANDIDATE_E,
                scenario,
                report,
                counterfactual_contributions={"ECONOMIC_ACTOR": 1},
            )

    def test_actor_context_never_changes_candidate_e_identity_semantics(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        report = run_scenario(scenario)
        contributions = {
            bidder.id: index + 1
            for index, bidder in enumerate(scenario.bidders)
        }
        identity_only = evaluate_candidate(
            CANDIDATE_E,
            scenario,
            report,
            counterfactual_contributions=contributions,
        )
        with_actor_context = evaluate_candidate(
            CANDIDATE_E,
            scenario,
            report,
            counterfactual_contributions=contributions,
            actor_context={"BIDDER_A": "ACTOR_1", "BIDDER_B": "ACTOR_1"},
        )
        self.assertEqual(with_actor_context, identity_only)

    def test_evaluation_does_not_mutate_scenario_report_result_or_input_map(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        report = run_scenario(scenario)
        contributions = {bidder.id: index for index, bidder in enumerate(scenario.bidders)}
        scenario_before = copy.deepcopy(scenario)
        report_before = serialize_report(report)
        result_before = serialize_result(report.baseline_result)
        contributions_before = dict(contributions)

        evaluate_candidate(
            CANDIDATE_E,
            scenario,
            report,
            counterfactual_contributions=contributions,
        )

        self.assertEqual(scenario, scenario_before)
        self.assertEqual(serialize_report(report), report_before)
        self.assertEqual(serialize_result(report.baseline_result), result_before)
        self.assertEqual(contributions, contributions_before)


if __name__ == "__main__":
    unittest.main()
