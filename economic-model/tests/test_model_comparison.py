from __future__ import annotations

import json
import unittest
from dataclasses import asdict

from bidback_economics.adversarial_runner import run_case
from bidback_economics.candidates import load_candidate
from bidback_economics.counterfactuals import load_adversarial_catalog
from bidback_economics.metrics import Rational
from bidback_economics.model_comparison import (
    compute_identity_counterfactuals,
    clone_bid_trace_without_identities,
    clone_scenario_without_identities,
    evaluate_adversarial_candidate,
    evaluate_identity_partition,
    evaluate_scenario_candidate,
)
from bidback_economics.runner import run_scenario, serialize_report
from bidback_economics.scenarios import load_scenario
from bidback_economics.solidity_math import UINT256_MAX
from bidback_economics.types import SolidityOverflow, serialize_result


def _scenario_snapshot(scenario) -> str:
    return json.dumps(
        asdict(scenario),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


def _property_by_id(comparison, property_id: str):
    return next(
        item for item in comparison.properties if item.property_id == property_id
    )


AUTHORITATIVE_ACTOR_FIELDS = (
    "actor_id",
    "nft_valuation",
    "actor_capital_budget",
    "bidder_identities",
    "participating_bidder_identities",
    "fee_cash_flow",
    "deposits",
    "refunds",
    "terminal_nft_value",
    "initial_nft_endowment_value",
    "aggregate_configured_max_bid_cap",
    "aggregate_locked_capital",
    "capital_time_exposure_wei_seconds",
    "mechanical_premium_lift",
    "configured_cap_within_budget",
    "locked_capital_within_budget",
)


AUTHORITATIVE_BRANCH_FIELDS = (
    "winner_identity",
    "winner_actor",
    "terminal_nft_claimant_identity",
    "terminal_nft_claimant_actor",
    "total_configured_max_bid_cap",
    "total_locked_capital",
    "total_deposits",
    "total_capital_time_exposure_wei_seconds",
    "total_mechanical_premium_lift",
    "actor_level_allocative_efficiency",
    "all_actor_budgets_satisfied",
    "checks",
)


AUTHORITATIVE_COALITION_FIELDS = (
    "actor_ids",
    "bidder_identities",
    "participating_bidder_identities",
    "coalition_refund",
    "coalition_deposits",
    "coalition_fee_cash_flow",
    "coalition_terminal_nft_value",
    "coalition_initial_nft_endowment_value",
    "coalition_net_nft_value",
    "aggregate_configured_max_bid_cap",
    "aggregate_locked_capital",
    "capital_time_exposure_wei_seconds",
    "mechanical_premium_lift",
)


class CandidateCounterfactualSemanticsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.scenario = load_scenario("s04-heterogeneous")
        cls.report = run_scenario(cls.scenario)
        cls.candidate_e = load_candidate("candidate-v1-e")

    def test_candidate_e_allocation_is_invariant_to_actor_context(self) -> None:
        without_context = evaluate_scenario_candidate(
            self.candidate_e,
            self.scenario,
            self.report,
        )
        with_context = evaluate_scenario_candidate(
            self.candidate_e,
            self.scenario,
            self.report,
            actor_context={
                "BIDDER_A": "SHARED_ACTOR",
                "BIDDER_B": "SHARED_ACTOR",
                "BIDDER_C": "OTHER_ACTOR",
                "BIDDER_W": "WINNER_ACTOR",
            },
        )

        self.assertEqual(without_context.evaluation, with_context.evaluation)
        self.assertEqual(
            without_context.identity_counterfactuals,
            with_context.identity_counterfactuals,
        )
        self.assertEqual(
            without_context.evaluation.allocation.contribution_by_subject,
            with_context.evaluation.allocation.contribution_by_subject,
        )
        self.assertEqual(with_context.allocation_semantics, "bidder-identity")
        self.assertFalse(with_context.actor_context_used_for_allocation)
        self.assertTrue(with_context.scenario_unchanged)
        self.assertTrue(with_context.scenario_report_unchanged)
        self.assertTrue(with_context.simulation_result_unchanged)
        self.assertEqual(_property_by_id(with_context, "P12").status, "pass")
        self.assertEqual(_property_by_id(with_context, "P15").status, "pass")
        self.assertEqual(_property_by_id(with_context, "P5").status, "fail")

    def test_counterfactual_inputs_are_independent_clones(self) -> None:
        removed = ("BIDDER_A",)
        cloned = clone_scenario_without_identities(self.scenario, removed)
        self.assertIsNot(cloned, self.scenario)
        self.assertIsNot(cloned.params, self.scenario.params)
        self.assertIsNot(cloned.reputations, self.scenario.reputations)
        self.assertNotIn("BIDDER_A", cloned.bidder_by_id)
        self.assertTrue(
            all(
                cloned_bidder is not self.scenario.bidder_by_id[cloned_bidder.id]
                for cloned_bidder in cloned.bidders
            )
        )
        original_opportunities = {
            (item.offset_seconds, item.bidder): item
            for item in self.scenario.opportunities
        }
        self.assertTrue(
            all(
                opportunity
                is not original_opportunities[
                    (opportunity.offset_seconds, opportunity.bidder)
                ]
                for opportunity in cloned.opportunities
            )
        )

        trace = clone_bid_trace_without_identities(
            self.report.generated_bid_trace,
            removed,
        )
        original_events = {
            (item.bidder, item.new_cap, item.deposit, item.timestamp): item
            for item in self.report.generated_bid_trace
        }
        self.assertTrue(
            all(
                event
                is not original_events[
                    (event.bidder, event.new_cap, event.deposit, event.timestamp)
                ]
                for event in trace
            )
        )

    def test_candidate_e_counterfactuals_do_not_mutate_any_source_layer(self) -> None:
        scenario_before = _scenario_snapshot(self.scenario)
        report_before = serialize_report(self.report)
        result_before = serialize_result(self.report.baseline_result)

        analysis = compute_identity_counterfactuals(self.scenario, self.report)

        self.assertEqual(_scenario_snapshot(self.scenario), scenario_before)
        self.assertEqual(serialize_report(self.report), report_before)
        self.assertEqual(serialize_result(self.report.baseline_result), result_before)
        self.assertEqual(
            tuple(sorted(analysis.contribution_by_identity)),
            tuple(sorted(bidder.id for bidder in self.scenario.bidders)),
        )
        self.assertTrue(all(item.status == "valid" for item in analysis.policy_replay))
        self.assertTrue(
            all(
                item.status in {"valid", "error"}
                and (item.error_code is None) == (item.status == "valid")
                for item in analysis.fixed_action_deletion
            )
        )

    def test_exact_wallet_concentration_uses_reduced_rational(self) -> None:
        model = load_candidate("candidate-v1-c")
        comparison = evaluate_scenario_candidate(model, self.scenario, self.report)
        rewards = comparison.evaluation.allocation.rewards
        assigned = comparison.metrics.assigned_distribution
        self.assertGreater(assigned, 0)
        self.assertEqual(
            comparison.metrics.max_reward_share,
            Rational(max(rewards.values()), assigned),
        )
        self.assertEqual(_property_by_id(comparison, "P5").status, "pass")

    def test_p2b_matched_identity_partitions_report_each_model_outcome(self) -> None:
        expected = {
            "candidate-v1-a": "fail",
            "candidate-v1-b": "pass",
            "candidate-v1-c": "pass",
            "candidate-v1-d": "fail",
            "candidate-v1-e": "pass",
        }
        for candidate_id, expected_status in expected.items():
            with self.subTest(candidate=candidate_id):
                result = evaluate_identity_partition(
                    load_candidate(candidate_id),
                    candidate_pool=1_000,
                    gross_premium=2_000,
                    unsplit_contribution=1_000,
                    split_contributions=(400, 600),
                    per_user_reward_cap_bps=4_000,
                )
                self.assertTrue(result.contribution_matched)
                self.assertTrue(result.weight_matched)
                self.assertEqual(result.property.property_id, "P2b")
                self.assertEqual(result.property.status, expected_status)
                self.assertEqual(
                    result.identity_splitting_gain_reward,
                    result.split_reward - result.unsplit_reward,
                )
                if candidate_id in {"candidate-v1-a", "candidate-v1-d"}:
                    self.assertGreater(result.identity_splitting_gain_reward, 0)
                else:
                    self.assertLessEqual(result.identity_splitting_gain_reward, 0)

    def test_p2b_checked_uint_aggregation_rejects_split_overflow(self) -> None:
        with self.assertRaises(SolidityOverflow):
            evaluate_identity_partition(
                load_candidate("candidate-v1-b"),
                candidate_pool=1_000,
                gross_premium=UINT256_MAX,
                unsplit_contribution=UINT256_MAX,
                split_contributions=(UINT256_MAX, 1),
                per_user_reward_cap_bps=4_000,
            )

    def test_fixed_action_deletion_reports_invalid_anti_sniping_trace(self) -> None:
        scenario = load_scenario("s10-anti-sniping")
        report = run_scenario(scenario)
        analysis = compute_identity_counterfactuals(scenario, report)
        policy = next(
            item for item in analysis.policy_replay if item.subject_id == "BIDDER_A"
        )
        deletion = next(
            item
            for item in analysis.fixed_action_deletion
            if item.subject_id == "BIDDER_A"
        )
        self.assertEqual(policy.status, "valid")
        self.assertEqual(deletion.status, "error")
        self.assertEqual(deletion.error_code, "AuctionNotOpen")
        self.assertIsNone(deletion.counterfactual_final_price)
        self.assertEqual(deletion.changed_dimensions, ("generatedBidTrace",))


class CandidateActorOverlayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_adversarial_catalog()
        cls.cases = cls.catalog.case_by_id
        cls.reports = {
            case_id: run_case(cls.cases[case_id], catalog=cls.catalog)
            for case_id in (
                "d01-deliberate-loser",
                "d04-interaction-ii",
                "d05-sybil-cap-bypass",
                "d06-sybil-threshold",
                "d08b-seller-self-purchase",
                "d09-alternating-identities",
            )
        }

    def _comparison(self, candidate_id: str, case_id: str):
        return evaluate_adversarial_candidate(
            load_candidate(candidate_id),
            self.cases[case_id],
            self.reports[case_id],
        )

    def test_d1_zero_mechanical_contribution_gets_no_candidate_reward(self) -> None:
        comparison = self._comparison(
            "candidate-v1-b",
            "d01-deliberate-loser",
        )
        attack = comparison.attack_overlay.candidate.coalition
        self.assertEqual(attack.mechanical_premium_lift, 0)
        self.assertEqual(attack.coalition_reward, 0)
        self.assertEqual(comparison.deltas.deliberate_losing_gain, 0)
        self.assertEqual(_property_by_id(comparison, "P1").status, "pass")

    def test_d5_is_reported_unmatched_when_mechanical_contribution_differs(self) -> None:
        comparison = self._comparison(
            "candidate-v1-a",
            "d05-sybil-cap-bypass",
        )
        splitting = comparison.identity_splitting
        self.assertTrue(splitting.locked_capital_matched)
        self.assertFalse(splitting.contribution_matched)
        self.assertFalse(splitting.mechanical_contribution_matched)
        self.assertFalse(splitting.weight_matched)
        self.assertFalse(splitting.comparable)
        self.assertEqual(splitting.status, "controls-unmatched")
        self.assertEqual(
            _property_by_id(comparison, "P2a").status,
            "non-comparable",
        )
        self.assertEqual(
            splitting.identity_splitting_gain_reward,
            splitting.attack_coalition_reward - splitting.reference_coalition_reward,
        )
        assigned = comparison.attack_overlay.candidate_assigned_distribution
        actor_rewards = [
            actor.rewards
            for actor in comparison.attack_overlay.candidate.actors
            if actor.rewards > 0
        ]
        self.assertEqual(
            comparison.attack_overlay.actor_max_reward_share,
            Rational(max(actor_rewards), assigned) if assigned > 0 else None,
        )

    def test_d4_and_d9_interaction_gains_remain_observable_with_mechanical_delta(self) -> None:
        for case_id in ("d04-interaction-ii", "d09-alternating-identities"):
            with self.subTest(case=case_id):
                comparison = self._comparison("candidate-v1-b", case_id)
                self.assertEqual(
                    comparison.deltas.interaction_farming_gain,
                    comparison.deltas.delta_coalition_utility,
                )
                self.assertEqual(
                    comparison.deltas.delta_coalition_mechanical_contribution,
                    comparison.attack_overlay.candidate.coalition.mechanical_premium_lift
                    - comparison.reference_overlay.candidate.coalition.mechanical_premium_lift,
                )

    def test_d6_separates_pool_unlock_from_assignment_and_indirect_reward(self) -> None:
        comparison = self._comparison(
            "candidate-v1-b",
            "d06-sybil-threshold",
        )
        self.assertGreater(
            comparison.identity_splitting.attack_identity_count,
            comparison.identity_splitting.reference_identity_count,
        )
        self.assertEqual(comparison.deltas.candidate_pool_unlock_gain, 0)
        self.assertGreater(comparison.deltas.candidate_assigned_unlock_gain, 0)
        self.assertGreater(comparison.attack_overlay.winner_actor_indirect_reward, 0)
        self.assertEqual(
            comparison.attack_overlay.winner_actor_indirect_reward,
            comparison.attack_overlay.candidate.coalition.coalition_reward,
        )
        self.assertEqual(_property_by_id(comparison, "P3").status, "pass")
        self.assertEqual(_property_by_id(comparison, "P4").status, "fail")
        self.assertEqual(
            comparison.deltas.reference_locked_capital,
            comparison.reference_overlay.authoritative.coalition.aggregate_locked_capital,
        )
        self.assertEqual(
            comparison.deltas.attack_locked_capital,
            comparison.attack_overlay.authoritative.coalition.aggregate_locked_capital,
        )
        self.assertEqual(
            comparison.deltas.delta_capital_time_exposure_wei_seconds,
            comparison.deltas.attack_capital_time_exposure_wei_seconds
            - comparison.deltas.reference_capital_time_exposure_wei_seconds,
        )

    def test_d8b_no_bid_convention_and_self_purchase_overlay_equal_negative_fee(self) -> None:
        comparison = self._comparison(
            "candidate-v1-b",
            "d08b-seller-self-purchase",
        )
        reference = comparison.reference.evaluation.settlement
        attack = comparison.attack.evaluation.settlement
        self.assertIsNone(reference.winner)
        self.assertEqual(reference.seller_proceeds, 0)
        self.assertEqual(reference.seller_premium_capture, 0)
        self.assertEqual(
            attack.seller_proceeds,
            attack.final_price - attack.fee_amount - attack.assigned_distribution,
        )
        self.assertEqual(
            comparison.reference_overlay.candidate.coalition.coalition_economic_change,
            0,
        )
        self.assertEqual(
            comparison.deltas.delta_coalition_utility,
            -attack.fee_amount,
        )
        self.assertEqual(_property_by_id(comparison, "P13").status, "pass")

    def test_overlay_preserves_lot_d_authoritative_fields(self) -> None:
        comparison = self._comparison(
            "candidate-v1-c",
            "d06-sybil-threshold",
        )
        for overlay in (
            comparison.reference_overlay,
            comparison.attack_overlay,
        ):
            for field in AUTHORITATIVE_BRANCH_FIELDS:
                self.assertEqual(
                    getattr(overlay.candidate, field),
                    getattr(overlay.authoritative, field),
                    field,
                )
            for field in AUTHORITATIVE_COALITION_FIELDS:
                self.assertEqual(
                    getattr(overlay.candidate.coalition, field),
                    getattr(overlay.authoritative.coalition, field),
                    f"coalition.{field}",
                )
            authoritative_actors = {
                actor.actor_id: actor for actor in overlay.authoritative.actors
            }
            for candidate_actor in overlay.candidate.actors:
                authoritative_actor = authoritative_actors[candidate_actor.actor_id]
                for field in AUTHORITATIVE_ACTOR_FIELDS:
                    self.assertEqual(
                        getattr(candidate_actor, field),
                        getattr(authoritative_actor, field),
                        f"{candidate_actor.actor_id}.{field}",
                    )
                reward_delta = (
                    candidate_actor.rewards - authoritative_actor.rewards
                )
                seller_delta = (
                    candidate_actor.seller_proceeds
                    - authoritative_actor.seller_proceeds
                )
                self.assertEqual(
                    candidate_actor.actor_cash_flow
                    - authoritative_actor.actor_cash_flow,
                    reward_delta + seller_delta,
                )
                self.assertEqual(
                    candidate_actor.actor_economic_change
                    - authoritative_actor.actor_economic_change,
                    reward_delta + seller_delta,
                )
            self.assertEqual(
                sum(actor.actor_economic_change for actor in overlay.candidate.actors),
                sum(
                    actor.actor_economic_change
                    for actor in overlay.authoritative.actors
                ),
            )
            self.assertEqual(
                overlay.candidate_minus_baseline_seller_proceeds,
                -overlay.candidate_minus_baseline_assigned_distribution,
            )
        self.assertIs(
            comparison.reference_overlay.authoritative,
            self.reports["d06-sybil-threshold"].metrics.reference,
        )
        self.assertIs(
            comparison.attack_overlay.authoritative,
            self.reports["d06-sybil-threshold"].metrics.attack,
        )

    def test_candidate_e_actor_aware_replay_is_separate_from_identity_allocation(self) -> None:
        comparison = self._comparison(
            "candidate-v1-e",
            "d06-sybil-threshold",
        )
        self.assertTrue(comparison.adversarial_report_unchanged)
        self.assertTrue(comparison.reference_actor_aware_counterfactuals)
        self.assertTrue(comparison.attack_actor_aware_counterfactuals)
        self.assertTrue(comparison.actor_aware_counterfactual_is_diagnostic_only)
        self.assertEqual(_property_by_id(comparison, "P15").status, "pass")
        identity_contributions = (
            comparison.attack.identity_counterfactuals.contribution_by_identity
        )
        self.assertEqual(
            comparison.attack.evaluation.contribution_by_subject,
            {
                identity: identity_contributions.get(identity, 0)
                for identity in comparison.attack.evaluation.contribution_by_subject
            },
        )
        self.assertTrue(
            all(
                item.subject_kind == "economic-actor"
                for item in comparison.attack_actor_aware_counterfactuals
            )
        )
        actor_removed_identities = {
            identity
            for item in comparison.attack_actor_aware_counterfactuals
            if item.subject_id == "BUYER_ACTOR"
            for identity in item.removed_identities
        }
        self.assertEqual(actor_removed_identities, {"SIBLING_ID", "WINNER_ID"})
        buyer_actor_diagnostic = next(
            item
            for item in comparison.attack_actor_aware_counterfactuals
            if item.subject_id == "BUYER_ACTOR"
        )
        self.assertIn("scenario.focalBidder", buyer_actor_diagnostic.changed_dimensions)


if __name__ == "__main__":
    unittest.main()
