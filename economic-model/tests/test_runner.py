from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from dataclasses import asdict, replace

from bidback_economics.runner import main, run_scenario, serialize_report
from bidback_economics.scenarios import load_catalog, load_scenario


class CatalogRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.reports = {scenario.id: run_scenario(scenario) for scenario in cls.catalog.scenarios}

    def test_all_fourteen_scenarios_execute_with_passing_invariants(self) -> None:
        self.assertEqual(len(self.reports), 14)
        for scenario_id, report in self.reports.items():
            with self.subTest(scenario=scenario_id):
                self.assertTrue(all(item.passed for item in report.baseline_invariants))
                self.assertTrue(all(item.passed for item in report.analytical_checks))

    def test_report_serialization_is_byte_for_byte_deterministic(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        self.assertEqual(serialize_report(run_scenario(scenario)), serialize_report(run_scenario(scenario)))

    def test_report_carries_reproducibility_inputs_and_manual_source_commit(self) -> None:
        scenario = load_scenario("s01-no-competition")
        report = run_scenario(scenario, source_commit="manual-sha")
        self.assertEqual(report.metadata.scenario_schema_version, 1)
        self.assertEqual(report.metadata.report_schema_version, 1)
        self.assertEqual(report.metadata.catalog_version, scenario.catalog_version)
        self.assertEqual(report.metadata.source_commit, "manual-sha")
        self.assertEqual(report.baseline_result.metadata.source_commit, "manual-sha")
        self.assertEqual(report.scenario.start_price, scenario.start_price)
        self.assertEqual(report.opportunities, scenario.opportunities)
        self.assertEqual(len(report.decisions), len(scenario.opportunities))

    def test_runner_rejects_catalog_and_baseline_model_version_mismatch(self) -> None:
        scenario = replace(load_scenario("s01-no-competition"), economic_model_version="other-model")
        with self.assertRaises(ValueError):
            run_scenario(scenario)

    def test_s4_has_discriminating_multi_loser_scores(self) -> None:
        result = self.reports["s04-heterogeneous"].baseline_result
        loser_scores = {
            bidder: components.final_score
            for bidder, components in result.scores.items()
            if bidder != result.settlement.winner
        }
        self.assertGreaterEqual(len(loser_scores), 3)
        self.assertGreater(len(set(loser_scores.values())), 1)
        self.assertGreater(len(set(result.allocation.raw_rewards.values())), 1)

    def test_s5_is_a_controlled_et_pair(self) -> None:
        early = self.reports["s05-et-early"]
        late = self.reports["s05-et-late"]
        focal = "BIDDER_F"
        self.assertEqual(early.bidders, late.bidders)
        self.assertEqual(
            [(bid.bidder, bid.new_cap, bid.deposit) for bid in early.generated_bid_trace],
            [(bid.bidder, bid.new_cap, bid.deposit) for bid in late.generated_bid_trace],
        )
        self.assertNotEqual(early.generated_bid_trace[0].timestamp, late.generated_bid_trace[0].timestamp)
        self.assertEqual(
            [bid.timestamp for bid in early.generated_bid_trace[1:]],
            [bid.timestamp for bid in late.generated_bid_trace[1:]],
        )
        self.assertEqual(early.metrics.auction.final_price, late.metrics.auction.final_price)
        self.assertEqual(early.metrics.auction.extensions_used, 0)
        self.assertEqual(late.metrics.auction.extensions_used, 0)
        early_score = early.baseline_result.scores[focal]
        late_score = late.baseline_result.scores[focal]
        self.assertEqual(early_score.financial_engagement, late_score.financial_engagement)
        self.assertEqual(early_score.interaction_intensity, late_score.interaction_intensity)
        self.assertNotEqual(early_score.time_engagement, late_score.time_engagement)
        for report in (early, late):
            self.assertNotEqual(report.baseline_result.settlement.winner, focal)
            self.assertEqual(
                report.baseline_result.allocation.rewards[focal],
                report.baseline_result.allocation.raw_rewards[focal],
            )
            self.assertLess(
                report.baseline_result.allocation.rewards[focal],
                report.baseline_result.allocation.per_user_cap,
            )

    def test_s6_controls_the_focal_ii_component(self) -> None:
        low = self.reports["s06-ii-low"]
        high = self.reports["s06-ii-high"]
        focal = "BIDDER_F"
        low_state = low.baseline_result.bidders[focal]
        high_state = high.baseline_result.bidders[focal]
        low_score = low.baseline_result.scores[focal]
        high_score = high.baseline_result.scores[focal]
        low_definition = next(item for item in low.bidders if item.id == focal)
        high_definition = next(item for item in high.bidders if item.id == focal)
        self.assertEqual(low_definition, high_definition)
        self.assertEqual(low_state.first_bid_time, high_state.first_bid_time)
        self.assertEqual(low_state.max_cap, high_state.max_cap)
        self.assertEqual(low.metrics.auction.final_price, high.metrics.auction.final_price)
        self.assertEqual(low_score.financial_engagement, high_score.financial_engagement)
        self.assertEqual(low_score.time_engagement, high_score.time_engagement)
        self.assertEqual(low_score.reputation_bps, high_score.reputation_bps)
        self.assertNotEqual(low_state.significant_overbids, high_state.significant_overbids)
        self.assertNotEqual(low_score.interaction_intensity, high_score.interaction_intensity)
        for report in (low, high):
            self.assertEqual(
                report.baseline_result.allocation.rewards[focal],
                report.baseline_result.allocation.raw_rewards[focal],
            )
            self.assertLess(
                report.baseline_result.allocation.rewards[focal],
                report.baseline_result.allocation.per_user_cap,
            )

    def test_s7_changes_only_target_reputation_after_identical_trace(self) -> None:
        neutral = self.reports["s07-reputation-neutral"]
        differential = self.reports["s07-reputation-differential"]
        focal = "BIDDER_A"
        neutral_trace = json.dumps(
            [asdict(bid) for bid in neutral.generated_bid_trace], sort_keys=True, separators=(",", ":")
        )
        differential_trace = json.dumps(
            [asdict(bid) for bid in differential.generated_bid_trace], sort_keys=True, separators=(",", ":")
        )
        self.assertEqual(neutral_trace, differential_trace)
        self.assertEqual(neutral.metrics.auction.final_price, differential.metrics.auction.final_price)
        for bidder in ("BIDDER_A", "BIDDER_B", "BIDDER_C"):
            left = neutral.baseline_result.scores[bidder]
            right = differential.baseline_result.scores[bidder]
            self.assertEqual(left.financial_engagement, right.financial_engagement)
            self.assertEqual(left.time_engagement, right.time_engagement)
            self.assertEqual(left.interaction_intensity, right.interaction_intensity)
            self.assertEqual(left.weighted_score, right.weighted_score)
        self.assertNotEqual(
            neutral.baseline_result.scores[focal].reputation_bps,
            differential.baseline_result.scores[focal].reputation_bps,
        )
        for report in (neutral, differential):
            self.assertEqual(
                report.baseline_result.allocation.rewards[focal],
                report.baseline_result.allocation.raw_rewards[focal],
            )
            self.assertLess(
                report.baseline_result.allocation.rewards[focal],
                report.baseline_result.allocation.per_user_cap,
            )

    def test_s8_exposes_cap_without_reallocation(self) -> None:
        result = self.reports["s08-per-user-cap-saturation"].baseline_result
        capped = "BIDDER_A"
        uncapped = "BIDDER_B"
        self.assertGreater(result.allocation.raw_rewards[capped], result.allocation.per_user_cap)
        self.assertEqual(result.allocation.rewards[capped], result.allocation.per_user_cap)
        self.assertGreater(result.allocation.rewards[uncapped], 0)
        self.assertEqual(result.allocation.rewards[uncapped], result.allocation.raw_rewards[uncapped])
        self.assertLess(result.allocation.assigned, result.settlement.candidate_pool)
        self.assertEqual(
            result.allocation.assigned,
            result.allocation.rewards[capped] + result.allocation.rewards[uncapped],
        )
        self.assertEqual(
            result.settlement.seller_proceeds,
            result.settlement.final_price - result.settlement.fee_amount - result.allocation.assigned,
        )

    def test_s9_hits_the_threshold_exactly(self) -> None:
        below_report = self.reports["s09-below-threshold"]
        at_report = self.reports["s09-at-threshold"]
        below = below_report.baseline_result.settlement
        at = at_report.baseline_result.settlement
        threshold = self.reports["s09-at-threshold"].params.min_premium_net
        self.assertEqual(
            [(bid.bidder, bid.timestamp) for bid in below_report.generated_bid_trace],
            [(bid.bidder, bid.timestamp) for bid in at_report.generated_bid_trace],
        )
        self.assertEqual(below_report.generated_bid_trace[0], at_report.generated_bid_trace[0])
        self.assertEqual(
            at_report.generated_bid_trace[1].new_cap,
            below_report.generated_bid_trace[1].new_cap + 1,
        )
        self.assertEqual(below.net_premium, threshold - 1)
        self.assertEqual(at.net_premium, threshold)
        self.assertEqual(below.candidate_pool, 0)
        self.assertGreater(at.candidate_pool, 0)

    def test_s10_extends_and_accepts_post_initial_end_bids(self) -> None:
        report = self.reports["s10-anti-sniping"]
        state = report.baseline_result.state
        self.assertGreater(state.extensions_used, 0)
        self.assertGreater(state.end_time, state.initial_end_time)
        self.assertTrue(any(bid.timestamp > state.initial_end_time for bid in report.generated_bid_trace))


class RunnerCliTest(unittest.TestCase):
    def test_cli_main_without_subprocess(self) -> None:
        listed = io.StringIO()
        with redirect_stdout(listed):
            self.assertEqual(main(["--list"]), 0)
        self.assertIn("s10-anti-sniping", listed.getvalue())

        payload = io.StringIO()
        with redirect_stdout(payload):
            self.assertEqual(main(["--scenario", "s01-no-competition", "--json"]), 0)
        self.assertIn('"scenario_id":"s01-no-competition"', payload.getvalue())


if __name__ == "__main__":
    unittest.main()
