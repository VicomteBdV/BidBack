from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from dataclasses import replace
from pathlib import Path

from bidback_economics.adversarial_metrics import MatchedControlFailure
from bidback_economics.adversarial_runner import (
    main,
    run_case,
    serialize_report,
    serialize_reports,
)
from bidback_economics.counterfactuals import (
    Comparison,
    Selector,
    load_adversarial_catalog,
)


CATALOG_PATH = (
    Path(__file__).resolve().parents[1] / "adversarial" / "catalog-v1.json"
)


class AdversarialCatalogRunnerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_adversarial_catalog(CATALOG_PATH)
        cls.cases = cls.catalog.case_by_id
        cls.reports = {
            case.case_id: run_case(case, catalog=cls.catalog)
            for case in cls.catalog.cases
        }

    @staticmethod
    def _actor(branch, actor_id: str):
        return next(actor for actor in branch.actors if actor.actor_id == actor_id)

    @staticmethod
    def _bidder(report, bidder_id: str):
        return next(bidder for bidder in report.metrics.bidders if bidder.bidder == bidder_id)

    def test_all_ten_pairs_execute_with_every_non_diagnostic_gate_green(self) -> None:
        self.assertEqual(len(self.reports), 10)
        self.assertEqual(
            tuple(sorted(self.reports)),
            (
                "d01-deliberate-loser",
                "d02-losing-cap-ef",
                "d03-early-et",
                "d04-interaction-ii",
                "d05-sybil-cap-bypass",
                "d06-sybil-threshold",
                "d07-collusive-suppression",
                "d08a-seller-losing-shill",
                "d08b-seller-self-purchase",
                "d09-alternating-identities",
            ),
        )
        for case_id, report in self.reports.items():
            with self.subTest(case=case_id):
                for branch_report in (report.reference, report.attack):
                    self.assertTrue(all(item.passed for item in branch_report.baseline_invariants))
                    self.assertTrue(all(item.passed for item in branch_report.analytical_checks))
                self.assertTrue(
                    all(item.passed for item in report.metrics.reference.checks)
                )
                self.assertTrue(all(item.passed for item in report.metrics.attack.checks))
                self.assertTrue(
                    all(item.passed for item in report.metrics.matched_control_results)
                )
                self.assertTrue(report.metrics.flags.all_matched_controls_pass)
                self.assertTrue(report.metrics.flags.all_actor_budgets_satisfied)
                self.assertTrue(report.metrics.flags.all_actor_accounting_checks_pass)

    def test_matched_controls_gate_but_diagnostic_relations_do_not(self) -> None:
        threshold_case = self.cases["d06-sybil-threshold"]
        impossible_control = Comparison(
            "test-participant-count-must-match",
            Selector("auction.participantCount"),
            "equal",
        )
        invalid_case = replace(
            threshold_case,
            matched_controls=(*threshold_case.matched_controls, impossible_control),
        )
        with self.assertRaises(MatchedControlFailure):
            run_case(invalid_case, catalog=self.catalog)

        diagnostic_case = self.cases["d01-deliberate-loser"]
        original = self.reports[diagnostic_case.case_id].metrics.diagnostic_relation_results[0]
        impossible_expected = (
            not original.actual_value
            if type(original.actual_value) is bool
            else int(original.actual_value) + 1
        )
        failing_relation = replace(
            diagnostic_case.diagnostic_relations[0],
            operator="equal",
            expected=impossible_expected,
        )
        diagnostic_case = replace(
            diagnostic_case,
            diagnostic_relations=(failing_relation, *diagnostic_case.diagnostic_relations[1:]),
        )
        report = run_case(diagnostic_case, catalog=self.catalog)
        self.assertFalse(report.metrics.diagnostic_relation_results[0].passed)
        self.assertTrue(
            all(item.passed for item in report.metrics.matched_control_results)
        )

    def test_d1_adds_a_zero_mechanical_lift_deliberate_loser(self) -> None:
        report = self.reports["d01-deliberate-loser"]
        metrics = report.metrics
        self.assertEqual(metrics.reference.winner_identity, metrics.attack.winner_identity)
        self.assertEqual(metrics.reference.winner_actor, metrics.attack.winner_actor)
        self.assertEqual(
            report.reference.metrics.auction.final_price,
            report.attack.metrics.auction.final_price,
        )
        self.assertEqual(
            report.reference.metrics.auction.gross_premium,
            report.attack.metrics.auction.gross_premium,
        )
        self.assertEqual(
            report.reference.metrics.auction.fee_amount,
            report.attack.metrics.auction.fee_amount,
        )
        self.assertEqual(
            report.reference.metrics.auction.candidate_pool,
            report.attack.metrics.auction.candidate_pool,
        )
        self.assertEqual(metrics.reference.coalition.participating_bidder_identities, ())
        self.assertEqual(len(metrics.attack.coalition.participating_bidder_identities), 1)
        self.assertTrue(metrics.flags.coalition_participating_identities_all_lose)
        self.assertEqual(metrics.attack.coalition.mechanical_premium_lift, 0)
        relation = metrics.diagnostic_relation_results[0]
        self.assertEqual(relation.actual_value, metrics.deltas.delta_coalition_utility)
        self.assertEqual(relation.passed, relation.actual_value > relation.expected_value)

    def test_d2_changes_only_realized_fixed_cap_for_the_focal_identity(self) -> None:
        case = self.cases["d02-losing-cap-ef"]
        report = self.reports[case.case_id]
        focal = case.reference_scenario.focal_bidder
        self.assertIsNotNone(focal)
        reference_definition = case.reference_scenario.bidder_by_id[focal]
        attack_definition = case.attack_scenario.bidder_by_id[focal]
        self.assertEqual(reference_definition.valuation, attack_definition.valuation)
        self.assertEqual(reference_definition.budget, attack_definition.budget)
        self.assertEqual(reference_definition.max_bid_cap, attack_definition.max_bid_cap)
        self.assertEqual(reference_definition.profile, attack_definition.profile)
        self.assertNotEqual(reference_definition.fixed_cap, attack_definition.fixed_cap)
        reference_state = report.reference.baseline_result.bidders[focal]
        attack_state = report.attack.baseline_result.bidders[focal]
        reference_score = report.reference.baseline_result.scores[focal]
        attack_score = report.attack.baseline_result.scores[focal]
        self.assertEqual(reference_state.first_bid_time, attack_state.first_bid_time)
        self.assertNotEqual(reference_state.max_cap, attack_state.max_cap)
        self.assertNotEqual(
            reference_score.financial_engagement,
            attack_score.financial_engagement,
        )
        self.assertEqual(reference_score.time_engagement, attack_score.time_engagement)
        self.assertEqual(reference_score.interaction_intensity, attack_score.interaction_intensity)
        self.assertEqual(reference_score.reputation_bps, attack_score.reputation_bps)
        self.assertEqual(report.metrics.reference.winner_actor, report.metrics.attack.winner_actor)
        self.assertTrue(report.metrics.flags.final_price_unchanged)

    def test_d3_isolates_et_but_exposes_unmatched_capital_time(self) -> None:
        case = self.cases["d03-early-et"]
        report = self.reports[case.case_id]
        focal = case.reference_scenario.focal_bidder
        self.assertIsNotNone(focal)
        reference_trace = [
            (bid.bidder, bid.new_cap, bid.deposit)
            for bid in report.reference.generated_bid_trace
        ]
        attack_trace = [
            (bid.bidder, bid.new_cap, bid.deposit)
            for bid in report.attack.generated_bid_trace
        ]
        self.assertEqual(reference_trace, attack_trace)
        self.assertNotEqual(
            report.reference.baseline_result.bidders[focal].first_bid_time,
            report.attack.baseline_result.bidders[focal].first_bid_time,
        )
        reference_score = report.reference.baseline_result.scores[focal]
        attack_score = report.attack.baseline_result.scores[focal]
        self.assertEqual(reference_score.financial_engagement, attack_score.financial_engagement)
        self.assertNotEqual(reference_score.time_engagement, attack_score.time_engagement)
        self.assertEqual(reference_score.interaction_intensity, attack_score.interaction_intensity)
        self.assertEqual(report.reference.metrics.auction.extensions_used, 0)
        self.assertEqual(report.attack.metrics.auction.extensions_used, 0)
        self.assertTrue(report.metrics.flags.coalition_locked_capital_matched)
        self.assertFalse(report.metrics.flags.coalition_capital_time_exposure_matched)
        self.assertNotEqual(
            report.metrics.deltas.delta_capital_time_exposure_wei_seconds,
            0,
        )

    def test_d4_changes_focal_ii_and_deposit_timing_under_controls(self) -> None:
        case = self.cases["d04-interaction-ii"]
        report = self.reports[case.case_id]
        focal = case.reference_scenario.focal_bidder
        self.assertIsNotNone(focal)
        reference_state = report.reference.baseline_result.bidders[focal]
        attack_state = report.attack.baseline_result.bidders[focal]
        reference_score = report.reference.baseline_result.scores[focal]
        attack_score = report.attack.baseline_result.scores[focal]
        self.assertEqual(reference_state.first_bid_time, attack_state.first_bid_time)
        self.assertEqual(reference_state.max_cap, attack_state.max_cap)
        self.assertNotEqual(
            reference_state.significant_overbids,
            attack_state.significant_overbids,
        )
        self.assertEqual(reference_score.financial_engagement, attack_score.financial_engagement)
        self.assertEqual(reference_score.time_engagement, attack_score.time_engagement)
        self.assertNotEqual(reference_score.interaction_intensity, attack_score.interaction_intensity)
        self.assertEqual(reference_score.reputation_bps, attack_score.reputation_bps)
        self.assertTrue(report.metrics.flags.final_price_unchanged)
        self.assertTrue(report.metrics.flags.coalition_locked_capital_matched)
        self.assertFalse(report.metrics.flags.coalition_capital_time_exposure_matched)

    def test_d5_measures_single_vs_multi_identity_cap_diagnostic(self) -> None:
        report = self.reports["d05-sybil-cap-bypass"]
        reference = report.metrics.reference.coalition
        attack = report.metrics.attack.coalition
        self.assertEqual(len(reference.participating_bidder_identities), 1)
        self.assertGreater(len(attack.participating_bidder_identities), 1)
        self.assertEqual(
            reference.aggregate_configured_max_bid_cap,
            attack.aggregate_configured_max_bid_cap,
        )
        self.assertEqual(reference.aggregate_locked_capital, attack.aggregate_locked_capital)
        self.assertTrue(report.metrics.flags.reference_single_identity_reward_capped)
        self.assertTrue(report.metrics.flags.final_price_unchanged)
        self.assertTrue(report.metrics.flags.gross_premium_unchanged)
        self.assertTrue(report.metrics.flags.coalition_configured_max_bid_cap_matched)
        self.assertTrue(report.metrics.flags.coalition_locked_capital_matched)
        relation = next(
            item
            for item in report.metrics.diagnostic_relation_results
            if item.selector_field == "flag.perUserCapBypassedAtCoalitionLevel"
        )
        self.assertEqual(
            relation.actual_value,
            report.metrics.flags.per_user_cap_bypassed_at_coalition_level,
        )
        self.assertEqual(relation.passed, relation.actual_value == relation.expected_value)

    def test_d6_unlocks_identity_threshold_with_one_actor(self) -> None:
        case = self.cases["d06-sybil-threshold"]
        report = self.reports[case.case_id]
        reference_ids = report.metrics.reference.coalition.participating_bidder_identities
        attack_ids = report.metrics.attack.coalition.participating_bidder_identities
        self.assertEqual(len(reference_ids), 1)
        self.assertEqual(len(attack_ids), 2)
        self.assertEqual(
            {case.identity_ownership[item] for item in attack_ids},
            set(case.coalition_actor_ids),
        )
        self.assertEqual(report.metrics.reference.winner_actor, report.metrics.attack.winner_actor)
        self.assertEqual(report.reference.metrics.auction.candidate_pool, 0)
        self.assertGreater(report.attack.metrics.auction.candidate_pool, 0)
        self.assertTrue(report.metrics.flags.candidate_pool_unlocked)
        self.assertTrue(report.metrics.flags.participant_identity_threshold_unlocked)
        self.assertTrue(
            report.metrics.flags.participant_identity_threshold_unlocked_by_same_actor
        )
        self.assertFalse(report.metrics.flags.coalition_locked_capital_matched)

    def test_d7_uses_consolidated_coalition_utility(self) -> None:
        case = self.cases["d07-collusive-suppression"]
        report = self.reports[case.case_id]
        reference = report.metrics.reference
        attack = report.metrics.attack
        coalition = set(case.coalition_actor_ids)
        self.assertEqual(reference.winner_actor, attack.winner_actor)
        self.assertGreater(
            report.reference.metrics.auction.final_price,
            report.attack.metrics.auction.final_price,
        )
        self.assertEqual(
            reference.coalition.coalition_economic_change,
            sum(
                actor.actor_economic_change
                for actor in reference.actors
                if actor.actor_id in coalition
            ),
        )
        self.assertEqual(
            attack.coalition.coalition_economic_change,
            sum(
                actor.actor_economic_change
                for actor in attack.actors
                if actor.actor_id in coalition
            ),
        )
        self.assertEqual(
            report.metrics.deltas.delta_coalition_utility,
            attack.coalition.coalition_economic_change
            - reference.coalition.coalition_economic_change,
        )

    def test_d8a_consolidates_shill_reward_with_seller_proceeds(self) -> None:
        case = self.cases["d08a-seller-losing-shill"]
        report = self.reports[case.case_id]
        reference = report.metrics.reference
        attack = report.metrics.attack
        self.assertEqual(reference.winner_identity, attack.winner_identity)
        self.assertTrue(report.metrics.flags.final_price_unchanged)
        self.assertTrue(report.metrics.flags.gross_premium_unchanged)
        seller_reference = self._actor(reference, case.seller_actor_id)
        seller_attack = self._actor(attack, case.seller_actor_id)
        for seller in (seller_reference, seller_attack):
            self.assertEqual(
                seller.actor_economic_change,
                seller.actor_cash_flow
                + seller.terminal_nft_value
                - seller.initial_nft_endowment_value,
            )
        reference_external_rewards = sum(
            actor.rewards for actor in reference.actors if actor.actor_id != case.seller_actor_id
        )
        attack_external_rewards = sum(
            actor.rewards for actor in attack.actors if actor.actor_id != case.seller_actor_id
        )
        self.assertEqual(
            seller_attack.actor_economic_change - seller_reference.actor_economic_change,
            reference_external_rewards - attack_external_rewards,
        )

    def test_d8b_self_purchase_cancels_initial_and_terminal_nft_value(self) -> None:
        case = self.cases["d08b-seller-self-purchase"]
        report = self.reports[case.case_id]
        reference_seller = self._actor(report.metrics.reference, case.seller_actor_id)
        attack_seller = self._actor(report.metrics.attack, case.seller_actor_id)
        self.assertIsNone(report.metrics.reference.winner_identity)
        self.assertEqual(
            report.metrics.reference.terminal_nft_claimant_actor,
            case.seller_actor_id,
        )
        self.assertEqual(report.metrics.attack.winner_actor, case.seller_actor_id)
        self.assertEqual(
            report.metrics.attack.terminal_nft_claimant_actor,
            case.seller_actor_id,
        )
        self.assertEqual(reference_seller.actor_economic_change, 0)
        self.assertEqual(
            attack_seller.terminal_nft_value,
            attack_seller.initial_nft_endowment_value,
        )
        self.assertEqual(
            attack_seller.actor_economic_change - reference_seller.actor_economic_change,
            -report.attack.metrics.auction.fee_amount,
        )

    def test_d9_keeps_identities_and_caps_but_changes_interaction(self) -> None:
        case = self.cases["d09-alternating-identities"]
        report = self.reports[case.case_id]
        self.assertEqual(
            set(case.reference_scenario.bidder_by_id),
            set(case.attack_scenario.bidder_by_id),
        )
        self.assertEqual(
            report.metrics.reference.coalition.bidder_identities,
            report.metrics.attack.coalition.bidder_identities,
        )
        for bidder_id in case.reference_scenario.bidder_by_id:
            self.assertEqual(
                self._bidder(report.reference, bidder_id).final_cap,
                self._bidder(report.attack, bidder_id).final_cap,
            )
        changed_interactions = [
            bidder_id
            for bidder_id in report.metrics.reference.coalition.bidder_identities
            if report.reference.baseline_result.scores[bidder_id].interaction_intensity
            != report.attack.baseline_result.scores[bidder_id].interaction_intensity
        ]
        self.assertTrue(changed_interactions)
        self.assertEqual(report.metrics.reference.winner_actor, report.metrics.attack.winner_actor)
        self.assertTrue(report.metrics.flags.final_price_unchanged)
        self.assertTrue(report.metrics.flags.coalition_locked_capital_matched)
        self.assertFalse(report.metrics.flags.coalition_capital_time_exposure_matched)

    def test_report_json_is_byte_for_byte_deterministic_and_complete(self) -> None:
        case = self.cases["d01-deliberate-loser"]
        first = run_case(case, catalog=self.catalog, source_commit="manual-sha")
        second = run_case(case, catalog=self.catalog, source_commit="manual-sha")
        first_payload = serialize_report(first)
        self.assertEqual(first_payload, serialize_report(second))
        decoded = json.loads(first_payload)
        self.assertEqual(decoded["metadata"]["source_commit"], "manual-sha")
        self.assertEqual(
            decoded["reference"]["metadata"]["source_commit"],
            "manual-sha",
        )
        self.assertEqual(decoded["attack"]["metadata"]["source_commit"], "manual-sha")
        self.assertIn("matched_control_results", decoded["metrics"])
        self.assertIn("known_unmatched_dimension_results", decoded["metrics"])
        self.assertIn("diagnostic_relation_results", decoded["metrics"])
        self.assertIn("assumptions", decoded)
        self.assertIn("exclusions", decoded)

        unicode_case = replace(case, description="diagnostic caf\u00e9")
        unicode_payload = serialize_report(run_case(unicode_case, catalog=self.catalog))
        self.assertIn("caf\\u00e9", unicode_payload)

        ordered = tuple(self.reports[case_id] for case_id in sorted(self.reports))
        self.assertEqual(serialize_reports(ordered), serialize_reports(ordered))


class AdversarialRunnerCliTest(unittest.TestCase):
    def test_cli_main_without_subprocess(self) -> None:
        listed = io.StringIO()
        with redirect_stdout(listed):
            self.assertEqual(
                main(["--catalog", str(CATALOG_PATH), "--list"]),
                0,
            )
        listed_ids = [line.split("\t", 1)[0] for line in listed.getvalue().splitlines()]
        self.assertEqual(len(listed_ids), 10)
        self.assertEqual(listed_ids, sorted(listed_ids))

        payload = io.StringIO()
        with redirect_stdout(payload):
            self.assertEqual(
                main(
                    [
                        "--catalog",
                        str(CATALOG_PATH),
                        "--case",
                        "d05-sybil-cap-bypass",
                        "--json",
                        "--source-commit",
                        "manual-sha",
                    ]
                ),
                0,
            )
        decoded = json.loads(payload.getvalue())
        self.assertEqual(decoded["metadata"]["case_id"], "d05-sybil-cap-bypass")
        self.assertEqual(decoded["metadata"]["source_commit"], "manual-sha")

        all_payload = io.StringIO()
        with redirect_stdout(all_payload):
            self.assertEqual(
                main(["--catalog", str(CATALOG_PATH), "--all", "--json"]),
                0,
            )
        decoded_all = json.loads(all_payload.getvalue())
        self.assertEqual(len(decoded_all), 10)
        self.assertEqual(
            [item["metadata"]["case_id"] for item in decoded_all],
            sorted(item["metadata"]["case_id"] for item in decoded_all),
        )


if __name__ == "__main__":
    unittest.main()
