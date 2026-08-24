from __future__ import annotations

import unittest
from dataclasses import replace

from bidback_economics.adversarial_metrics import (
    MatchedControlFailure,
    compute_adversarial_metrics,
    compute_branch_accounting,
)
from bidback_economics.baseline import default_params
from bidback_economics.counterfactuals import (
    ActorDefinition,
    Comparison,
    CounterfactualCase,
    InitialNftEndowment,
    Intervention,
    KnownUnmatchedDimension,
    Selector,
)
from bidback_economics.metrics import Rational
from bidback_economics.runner import run_scenario, serialize_report
from bidback_economics.scenarios import (
    PROFILE_FIXED_CAP_ONCE,
    BidderDefinition,
    Opportunity,
    Scenario,
    load_scenario,
)


START_PRICE = 10_000_000_000_000_000
START_TIME = 1_000
DURATION = 3_600
SELLER = "SELLER"
SELLER_ACTOR = "SELLER_ACTOR"


def _bidder(
    bidder_id: str,
    *,
    valuation: int,
    budget: int,
    fixed_cap: int,
) -> BidderDefinition:
    return BidderDefinition(
        bidder_id,
        valuation,
        budget,
        PROFILE_FIXED_CAP_ONCE,
        fixed_cap,
    )


def _scenario(
    scenario_id: str,
    bidders: tuple[BidderDefinition, ...],
    opportunities: tuple[Opportunity, ...],
) -> Scenario:
    return Scenario(
        schema_version=1,
        catalog_version="adversarial-metric-unit-v1",
        economic_model_version="solidity-baseline-v1",
        id=scenario_id,
        family="D-unit",
        description="Deterministic Lot D accounting unit scenario.",
        start_price=START_PRICE,
        start_time=START_TIME,
        duration=DURATION,
        seller=SELLER,
        params=default_params(),
        bidders=bidders,
        reputations={},
        opportunities=opportunities,
        focal_bidder=None,
    )


def _case(
    reference: Scenario,
    attack: Scenario,
    *,
    actors: tuple[ActorDefinition, ...],
    ownership: dict[str, str],
    coalition: tuple[str, ...],
    matched_controls: tuple[Comparison, ...] = (),
    known_unmatched: tuple[KnownUnmatchedDimension, ...] = (),
    diagnostic_relations: tuple[Comparison, ...] = (),
) -> CounterfactualCase:
    seller = next(actor for actor in actors if actor.actor_id == SELLER_ACTOR)
    return CounterfactualCase(
        case_id="unit-counterfactual",
        threat_class="unit-accounting",
        description="Deterministic actor-accounting unit counterfactual.",
        actors=actors,
        seller_actor_id=SELLER_ACTOR,
        initial_nft_endowment=InitialNftEndowment(
            SELLER_ACTOR,
            seller.nft_valuation,
        ),
        protocol_fee_recipient_actor_id=None,
        identity_ownership=ownership,
        coalition_actor_ids=coalition,
        reference_scenario=reference,
        attack_scenario=attack,
        intervention=Intervention("unit-intervention", ()),
        matched_controls=matched_controls,
        known_unmatched_dimensions=known_unmatched,
        diagnostic_relations=diagnostic_relations,
    )


def _actor(branch, actor_id: str):
    return next(actor for actor in branch.actors if actor.actor_id == actor_id)


class AdversarialActorAccountingTest(unittest.TestCase):
    def _ordinary_pair(self, coalition: tuple[str, ...] = ("LOSER_ACTOR",)):
        loser = _bidder(
            "LOSER",
            valuation=20_000_000_000_000_000,
            budget=12_000_000_000_000_000,
            fixed_cap=12_000_000_000_000_000,
        )
        winner = _bidder(
            "WINNER",
            valuation=40_000_000_000_000_000,
            budget=30_000_000_000_000_000,
            fixed_cap=30_000_000_000_000_000,
        )
        reference = _scenario(
            "ordinary-reference",
            (loser, winner),
            (Opportunity(100, "LOSER"), Opportunity(200, "WINNER")),
        )
        attack = replace(reference, id="ordinary-attack")
        actors = (
            ActorDefinition(SELLER_ACTOR, 8_000_000_000_000_000, 0),
            ActorDefinition("LOSER_ACTOR", loser.valuation, loser.max_bid_cap),
            ActorDefinition("WINNER_ACTOR", winner.valuation, winner.max_bid_cap),
        )
        case = _case(
            reference,
            attack,
            actors=actors,
            ownership={
                SELLER: SELLER_ACTOR,
                "LOSER": "LOSER_ACTOR",
                "WINNER": "WINNER_ACTOR",
            },
            coalition=coalition,
        )
        reference_report = run_scenario(reference)
        attack_report = run_scenario(attack)
        return case, reference, attack, reference_report, attack_report

    def test_actor_cash_flows_external_fee_and_nft_are_consolidated_once(self) -> None:
        case, reference, _, report, _ = self._ordinary_pair()
        branch = compute_branch_accounting(case, reference, report)
        loser = _actor(branch, "LOSER_ACTOR")
        winner = _actor(branch, "WINNER_ACTOR")
        seller = _actor(branch, SELLER_ACTOR)

        self.assertEqual(loser.bidder_cash_flow, loser.rewards)
        self.assertEqual(loser.refunds, loser.deposits)
        self.assertEqual(seller.seller_cash_flow, report.metrics.seller_protocol.seller_revenue)
        self.assertEqual(sum(actor.fee_cash_flow for actor in branch.actors), 0)
        self.assertEqual(winner.terminal_nft_value, winner.nft_valuation)
        self.assertEqual(
            sum(actor.terminal_nft_value for actor in branch.actors),
            winner.nft_valuation,
        )
        self.assertEqual(seller.initial_nft_endowment_value, seller.nft_valuation)
        self.assertEqual(
            sum(actor.actor_economic_change for actor in branch.actors),
            winner.nft_valuation
            - seller.nft_valuation
            - report.metrics.seller_protocol.protocol_fee_revenue,
        )
        self.assertTrue(all(check.passed for check in branch.checks))
        self.assertTrue(branch.actor_level_allocative_efficiency)

    def test_configured_locked_and_capital_time_accounting(self) -> None:
        case, reference, _, report, _ = self._ordinary_pair()
        branch = compute_branch_accounting(case, reference, report)
        loser = _actor(branch, "LOSER_ACTOR")
        winner = _actor(branch, "WINNER_ACTOR")

        self.assertEqual(loser.aggregate_configured_max_bid_cap, 12_000_000_000_000_000)
        self.assertEqual(loser.aggregate_locked_capital, 12_000_000_000_000_000)
        self.assertEqual(winner.aggregate_locked_capital, 30_000_000_000_000_000)
        self.assertEqual(branch.total_locked_capital, report.baseline_result.accounting.total_deposits)
        expected_total = sum(
            event.deposit * (report.baseline_result.state.end_time - event.timestamp)
            for event in report.generated_bid_trace
        )
        self.assertEqual(branch.total_capital_time_exposure_wei_seconds, expected_total)
        self.assertTrue(branch.all_actor_budgets_satisfied)

        underfunded_actors = tuple(
            replace(actor, actor_capital_budget=11_000_000_000_000_000)
            if actor.actor_id == "LOSER_ACTOR"
            else actor
            for actor in case.actors
        )
        underfunded = replace(case, actors=underfunded_actors)
        underfunded_branch = compute_branch_accounting(underfunded, reference, report)
        self.assertFalse(underfunded_branch.all_actor_budgets_satisfied)
        self.assertFalse(_actor(underfunded_branch, "LOSER_ACTOR").configured_cap_within_budget)
        self.assertFalse(_actor(underfunded_branch, "LOSER_ACTOR").locked_capital_within_budget)

    def test_coalition_consolidation_cancels_internal_winner_payment(self) -> None:
        case, reference, _, report, _ = self._ordinary_pair(
            (SELLER_ACTOR, "WINNER_ACTOR")
        )
        branch = compute_branch_accounting(case, reference, report)
        coalition = branch.coalition
        auction = report.metrics.auction
        self.assertEqual(
            coalition.coalition_cash_flow,
            -auction.fee_amount - auction.assigned_distribution,
        )
        self.assertEqual(
            coalition.coalition_economic_change,
            coalition.coalition_cash_flow
            + coalition.coalition_terminal_nft_value
            - coalition.coalition_initial_nft_endowment_value,
        )

    def test_no_bid_seller_change_is_zero_and_actor_efficiency_is_deduplicated(self) -> None:
        bidder = _bidder(
            "BUYER",
            valuation=30_000_000_000_000_000,
            budget=20_000_000_000_000_000,
            fixed_cap=20_000_000_000_000_000,
        )
        reference = _scenario(
            "no-bid-reference",
            (bidder,),
            (Opportunity(4_000, "BUYER"),),
        )
        attack = replace(
            reference,
            id="no-bid-attack",
            opportunities=(Opportunity(100, "BUYER"),),
        )
        case = _case(
            reference,
            attack,
            actors=(
                ActorDefinition(SELLER_ACTOR, 8_000_000_000_000_000, 0),
                ActorDefinition("BUYER_ACTOR", bidder.valuation, bidder.max_bid_cap),
            ),
            ownership={SELLER: SELLER_ACTOR, "BUYER": "BUYER_ACTOR"},
            coalition=(SELLER_ACTOR,),
        )
        report = run_scenario(reference)
        branch = compute_branch_accounting(case, reference, report)
        seller = _actor(branch, SELLER_ACTOR)
        self.assertEqual(branch.winner_identity, None)
        self.assertEqual(branch.terminal_nft_claimant_actor, SELLER_ACTOR)
        self.assertEqual(seller.actor_economic_change, 0)
        self.assertEqual(branch.total_locked_capital, 0)
        self.assertFalse(branch.actor_level_allocative_efficiency)
        paired = compute_adversarial_metrics(
            case,
            reference,
            attack,
            report,
            run_scenario(attack),
        )
        self.assertTrue(paired.attack.actor_level_allocative_efficiency)
        self.assertEqual(paired.deltas.delta_actor_level_allocative_efficiency, 1)

    def test_step_up_deposit_deltas_equal_final_cap_and_drive_capital_time(self) -> None:
        scenario = load_scenario("s06-ii-high")
        actors = [ActorDefinition(SELLER_ACTOR, 8_000_000_000_000_000, 0)]
        ownership = {scenario.seller: SELLER_ACTOR}
        for bidder in scenario.bidders:
            actor_id = f"ACTOR_{bidder.id}"
            actors.append(ActorDefinition(actor_id, bidder.valuation, bidder.max_bid_cap))
            ownership[bidder.id] = actor_id
        attack = replace(scenario, id="step-up-attack")
        case = _case(
            scenario,
            attack,
            actors=tuple(actors),
            ownership=ownership,
            coalition=(f"ACTOR_{scenario.focal_bidder}",),
        )
        report = run_scenario(scenario)
        branch = compute_branch_accounting(case, scenario, report)
        focal_id = scenario.focal_bidder
        self.assertIsNotNone(focal_id)
        focal = _actor(branch, f"ACTOR_{focal_id}")
        focal_events = tuple(
            event for event in report.generated_bid_trace if event.bidder == focal_id
        )
        self.assertGreater(len(focal_events), 1)
        self.assertEqual(sum(event.deposit for event in focal_events), focal.aggregate_locked_capital)
        self.assertEqual(
            focal.capital_time_exposure_wei_seconds,
            sum(
                event.deposit * (report.baseline_result.state.end_time - event.timestamp)
                for event in focal_events
            ),
        )

    def test_scenario_report_is_byte_identical_after_actor_metrics(self) -> None:
        case, reference, attack, reference_report, attack_report = self._ordinary_pair()
        before_reference = serialize_report(reference_report)
        before_attack = serialize_report(attack_report)
        compute_adversarial_metrics(
            case,
            reference,
            attack,
            reference_report,
            attack_report,
        )
        self.assertEqual(serialize_report(reference_report), before_reference)
        self.assertEqual(serialize_report(attack_report), before_attack)


class SellerAndCounterfactualTest(unittest.TestCase):
    def _self_purchase_pair(self):
        seller_bidder = _bidder(
            "SELLER_BID",
            valuation=40_000_000_000_000_000,
            budget=30_000_000_000_000_000,
            fixed_cap=30_000_000_000_000_000,
        )
        reference = _scenario(
            "self-purchase-reference",
            (seller_bidder,),
            (Opportunity(4_000, "SELLER_BID"),),
        )
        attack = _scenario(
            "self-purchase-attack",
            (seller_bidder,),
            (Opportunity(100, "SELLER_BID"),),
        )
        case = _case(
            reference,
            attack,
            actors=(
                ActorDefinition(
                    SELLER_ACTOR,
                    seller_bidder.valuation,
                    seller_bidder.max_bid_cap,
                ),
            ),
            ownership={SELLER: SELLER_ACTOR, "SELLER_BID": SELLER_ACTOR},
            coalition=(SELLER_ACTOR,),
            known_unmatched=(
                KnownUnmatchedDimension(
                    "realized-capital",
                    Selector("coalition.aggregateLockedCapital"),
                    "The self-purchase requires realized seller-controlled capital.",
                ),
            ),
        )
        return case, reference, attack, run_scenario(reference), run_scenario(attack)

    def test_seller_self_purchase_consolidates_to_negative_protocol_fee(self) -> None:
        case, reference, attack, reference_report, attack_report = self._self_purchase_pair()
        metrics = compute_adversarial_metrics(
            case,
            reference,
            attack,
            reference_report,
            attack_report,
        )
        seller_reference = _actor(metrics.reference, SELLER_ACTOR)
        seller_attack = _actor(metrics.attack, SELLER_ACTOR)
        fee = attack_report.metrics.auction.fee_amount

        self.assertEqual(seller_reference.actor_economic_change, 0)
        self.assertEqual(seller_attack.terminal_nft_value, seller_attack.nft_valuation)
        self.assertEqual(
            seller_attack.terminal_nft_value,
            seller_attack.initial_nft_endowment_value,
        )
        self.assertEqual(seller_attack.actor_economic_change, -fee)
        self.assertEqual(metrics.deltas.delta_coalition_utility, -fee)
        self.assertEqual(metrics.reference.winner_identity, None)
        self.assertEqual(metrics.attack.winner_identity, "SELLER_BID")
        self.assertEqual(metrics.attack.winner_actor, SELLER_ACTOR)
        self.assertEqual(metrics.attack.terminal_nft_claimant_actor, SELLER_ACTOR)
        self.assertEqual(attack_report.metrics.auction.participant_count, 1)
        self.assertEqual(attack_report.metrics.auction.candidate_pool, 0)
        self.assertEqual(attack_report.metrics.auction.assigned_distribution, 0)
        self.assertEqual(metrics.deltas.delta_modeled_non_coalition_utility, 0)
        self.assertEqual(metrics.deltas.delta_actor_level_allocative_efficiency, 0)
        self.assertEqual(len(metrics.known_unmatched_dimension_results), 1)
        self.assertTrue(metrics.known_unmatched_dimension_results[0].differs)
        self.assertIsNone(metrics.ratios.reference_coalition_reward_to_locked_capital)
        self.assertIsNone(
            metrics.ratios.reference_coalition_reward_to_mechanical_premium_lift
        )
        self.assertEqual(
            metrics.ratios.attack_coalition_reward_to_mechanical_premium_lift,
            Rational(0, 1),
        )
        self.assertFalse(metrics.flags.coalition_locked_capital_matched)
        self.assertFalse(metrics.flags.coalition_capital_time_exposure_matched)

    def test_seller_shill_gain_equals_external_reward_crowd_out(self) -> None:
        shill = _bidder(
            "SHILL",
            valuation=15_000_000_000_000_000,
            budget=15_000_000_000_000_000,
            fixed_cap=15_000_000_000_000_000,
        )
        external_loser = _bidder(
            "EXTERNAL_LOSER",
            valuation=25_000_000_000_000_000,
            budget=20_000_000_000_000_000,
            fixed_cap=20_000_000_000_000_000,
        )
        winner = _bidder(
            "WINNER",
            valuation=40_000_000_000_000_000,
            budget=30_000_000_000_000_000,
            fixed_cap=30_000_000_000_000_000,
        )
        bidders = (shill, external_loser, winner)
        reference = _scenario(
            "shill-reference",
            bidders,
            (
                Opportunity(100, "EXTERNAL_LOSER"),
                Opportunity(200, "WINNER"),
                Opportunity(4_000, "SHILL"),
            ),
        )
        attack = _scenario(
            "shill-attack",
            bidders,
            (
                Opportunity(50, "SHILL"),
                Opportunity(100, "EXTERNAL_LOSER"),
                Opportunity(200, "WINNER"),
            ),
        )
        case = _case(
            reference,
            attack,
            actors=(
                ActorDefinition(SELLER_ACTOR, shill.valuation, shill.max_bid_cap),
                ActorDefinition(
                    "EXTERNAL_LOSER_ACTOR",
                    external_loser.valuation,
                    external_loser.max_bid_cap,
                ),
                ActorDefinition("WINNER_ACTOR", winner.valuation, winner.max_bid_cap),
            ),
            ownership={
                SELLER: SELLER_ACTOR,
                "SHILL": SELLER_ACTOR,
                "EXTERNAL_LOSER": "EXTERNAL_LOSER_ACTOR",
                "WINNER": "WINNER_ACTOR",
            },
            coalition=(SELLER_ACTOR,),
        )
        reference_report = run_scenario(reference)
        attack_report = run_scenario(attack)
        metrics = compute_adversarial_metrics(
            case,
            reference,
            attack,
            reference_report,
            attack_report,
        )
        reference_external_reward = reference_report.baseline_result.allocation.rewards.get(
            "EXTERNAL_LOSER", 0
        )
        attack_external_reward = attack_report.baseline_result.allocation.rewards.get(
            "EXTERNAL_LOSER", 0
        )

        self.assertEqual(
            reference_report.metrics.auction.final_price,
            attack_report.metrics.auction.final_price,
        )
        self.assertEqual(
            reference_report.metrics.auction.gross_premium,
            attack_report.metrics.auction.gross_premium,
        )
        self.assertEqual(
            reference_report.metrics.auction.fee_amount,
            attack_report.metrics.auction.fee_amount,
        )
        self.assertEqual(
            reference_report.metrics.auction.candidate_pool,
            attack_report.metrics.auction.candidate_pool,
        )
        self.assertEqual(metrics.reference.winner_identity, metrics.attack.winner_identity)
        self.assertEqual(
            metrics.deltas.delta_coalition_utility,
            reference_external_reward - attack_external_reward,
        )
        self.assertEqual(
            metrics.deltas.delta_modeled_non_coalition_utility,
            attack_external_reward - reference_external_reward,
        )

    def test_signed_ratios_and_rational_canonicalization(self) -> None:
        self.assertEqual(Rational(-1, 2), Rational(-2, 4))
        self.assertEqual(Rational(-2, 4).numerator, -1)
        self.assertEqual(Rational(-2, 4).denominator, 2)

        case, reference, attack, reference_report, attack_report = self._self_purchase_pair()
        metrics = compute_adversarial_metrics(
            case,
            reference,
            attack,
            reference_report,
            attack_report,
        )
        expected = Rational(
            metrics.deltas.delta_coalition_utility,
            metrics.deltas.delta_locked_capital,
        )
        self.assertEqual(
            metrics.ratios.incremental_coalition_utility_to_incremental_locked_capital,
            expected,
        )
        self.assertLess(expected.numerator, 0)
        self.assertGreater(expected.denominator, 0)

    def test_matched_controls_gate_and_diagnostic_relations_do_not_gate(self) -> None:
        case, reference, attack, reference_report, attack_report = self._self_purchase_pair()
        diagnostic = Comparison(
            "counterfactual-is-positive",
            Selector("delta.coalitionUtility"),
            "greaterThan",
            0,
        )
        diagnostic_case = replace(case, diagnostic_relations=(diagnostic,))
        metrics = compute_adversarial_metrics(
            diagnostic_case,
            reference,
            attack,
            reference_report,
            attack_report,
        )
        self.assertEqual(len(metrics.diagnostic_relation_results), 1)
        self.assertFalse(metrics.diagnostic_relation_results[0].passed)
        self.assertTrue(metrics.flags.all_matched_controls_pass)

        invalid_control_case = replace(
            case,
            matched_controls=(
                Comparison(
                    "final-price-matched",
                    Selector("auction.finalPrice"),
                    "equal",
                ),
            ),
        )
        with self.assertRaises(MatchedControlFailure) as raised:
            compute_adversarial_metrics(
                invalid_control_case,
                reference,
                attack,
                reference_report,
                attack_report,
            )
        self.assertEqual(raised.exception.code, "MATCHED_CONTROL_FAILED")
        self.assertEqual(raised.exception.context["controls"], ("final-price-matched",))


if __name__ == "__main__":
    unittest.main()
