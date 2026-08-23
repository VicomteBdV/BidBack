from __future__ import annotations

import unittest
from dataclasses import replace

from bidback_economics.metrics import Rational, compute_metrics
from bidback_economics.runner import run_scenario
from bidback_economics.scenarios import Opportunity, load_scenario
from bidback_economics.types import serialize_result


class RationalTest(unittest.TestCase):
    def test_ratio_is_reduced_and_zero_is_normalized(self) -> None:
        self.assertEqual(Rational(6, 8), Rational(3, 4))
        self.assertEqual(Rational(0, 99), Rational(0, 1))

    def test_ratio_requires_positive_denominator(self) -> None:
        with self.assertRaises(ValueError):
            Rational(1, 0)


class EconomicMetricTest(unittest.TestCase):
    def test_cash_flow_utility_and_seller_identities(self) -> None:
        report = run_scenario(load_scenario("s02-clear-gap"))
        by_id = {bidder.bidder: bidder for bidder in report.metrics.bidders}
        loser = by_id["BIDDER_A"]
        winner = by_id["BIDDER_W"]
        self.assertEqual(loser.net_cash_flow, loser.refund + loser.reward - loser.deposit)
        self.assertEqual(loser.utility, loser.reward)
        self.assertEqual(winner.utility, winner.valuation - report.metrics.auction.final_price)
        seller = report.metrics.seller_protocol
        self.assertEqual(
            seller.seller_premium_capture
            + seller.protocol_fee_revenue
            + report.metrics.auction.assigned_distribution,
            report.metrics.auction.gross_premium,
        )
        self.assertEqual(
            report.metrics.auction.unassigned_remainder,
            report.metrics.auction.candidate_pool - report.metrics.auction.assigned_distribution,
        )

    def test_efficiency_uses_all_configured_bidders_and_statistical_ties(self) -> None:
        scenario = load_scenario("s02-clear-gap")
        tied_bidders = tuple(replace(bidder, valuation=40_000_000_000_000_000) for bidder in scenario.bidders)
        tied_scenario = replace(scenario, bidders=tied_bidders)
        report = run_scenario(tied_scenario)
        efficiency = report.metrics.efficiency
        self.assertEqual(efficiency.highest_valuation, 40_000_000_000_000_000)
        self.assertEqual(efficiency.second_highest_valuation, 40_000_000_000_000_000)
        self.assertTrue(efficiency.allocative_efficiency)

    def test_no_bid_efficiency_and_undefined_ratios_are_null(self) -> None:
        scenario = load_scenario("s01-no-competition")
        no_bid = replace(scenario, opportunities=(Opportunity(4_000, "BIDDER_A"),))
        report = run_scenario(no_bid)
        self.assertIsNone(report.metrics.efficiency.allocative_efficiency)
        self.assertIsNone(report.metrics.efficiency.winner_valuation)
        self.assertIsNone(report.metrics.seller_protocol.seller_capture_ratio)
        self.assertIsNone(report.metrics.seller_protocol.protocol_fee_share)
        self.assertIsNone(report.metrics.seller_protocol.redistribution_share)

    def test_mechanical_lifts_are_aggregated_from_bid_audit(self) -> None:
        report = run_scenario(load_scenario("s04-heterogeneous"))
        observed = sum(item.observed_price_lift for item in report.metrics.bidders)
        premium = sum(item.premium_lift for item in report.metrics.bidders)
        self.assertEqual(observed, report.metrics.auction.final_price)
        self.assertEqual(premium, report.metrics.auction.gross_premium)

    def test_descriptive_loser_ratios_and_winner_nulls(self) -> None:
        report = run_scenario(load_scenario("s02-clear-gap"))
        by_id = {bidder.bidder: bidder for bidder in report.metrics.bidders}
        loser = by_id["BIDDER_A"]
        winner = by_id["BIDDER_W"]
        self.assertEqual(
            loser.reward_to_final_cap,
            Rational(loser.reward, loser.final_cap),
        )
        self.assertEqual(
            loser.reward_to_premium_lift,
            Rational(loser.reward, loser.premium_lift),
        )
        self.assertIsNone(winner.reward_to_final_cap)
        self.assertIsNone(winner.reward_to_premium_lift)

    def test_metric_calculation_does_not_change_simulation_result(self) -> None:
        scenario = load_scenario("s04-heterogeneous")
        result = run_scenario(scenario).baseline_result
        before = serialize_result(result)
        compute_metrics(scenario, result)
        self.assertEqual(serialize_result(result), before)


if __name__ == "__main__":
    unittest.main()
