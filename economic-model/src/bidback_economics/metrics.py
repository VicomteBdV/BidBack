"""Read-only deterministic economic metrics for Lot C scenario reports."""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd

from .baseline import DEFAULT_REPUTATION_BPS
from .scenarios import Scenario
from .types import SimulationResult


@dataclass(frozen=True, slots=True)
class Rational:
    numerator: int
    denominator: int

    def __post_init__(self) -> None:
        if self.denominator <= 0:
            raise ValueError("rational denominator must be positive")
        divisor = gcd(self.numerator, self.denominator)
        numerator = self.numerator // divisor
        denominator = self.denominator // divisor
        if numerator == 0:
            denominator = 1
        object.__setattr__(self, "numerator", numerator)
        object.__setattr__(self, "denominator", denominator)


@dataclass(frozen=True, slots=True)
class AuctionMetrics:
    final_price: int
    gross_premium: int
    fee_amount: int
    candidate_pool: int
    assigned_distribution: int
    unassigned_remainder: int
    seller_proceeds: int
    participant_count: int
    bid_count: int
    extensions_used: int


@dataclass(frozen=True, slots=True)
class BidderMetrics:
    bidder: str
    valuation: int
    budget: int | None
    max_bid_cap: int
    final_cap: int
    participated: bool
    winner: bool
    deposit: int
    refund: int
    reward: int
    net_cash_flow: int
    utility: int
    reputation: int
    observed_price_lift: int
    premium_lift: int
    reward_to_final_cap: Rational | None
    reward_to_premium_lift: Rational | None


@dataclass(frozen=True, slots=True)
class SellerProtocolMetrics:
    seller_revenue: int
    seller_premium_capture: int
    protocol_fee_revenue: int
    unassigned_remainder: int
    seller_capture_ratio: Rational | None
    protocol_fee_share: Rational | None
    redistribution_share: Rational | None


@dataclass(frozen=True, slots=True)
class EfficiencyMetrics:
    winner_valuation: int | None
    highest_valuation: int
    second_highest_valuation: int | None
    allocative_efficiency: bool | None
    price_to_winner_valuation: Rational | None
    price_to_second_highest_valuation: Rational | None


@dataclass(frozen=True, slots=True)
class EconomicMetrics:
    auction: AuctionMetrics
    bidders: tuple[BidderMetrics, ...]
    seller_protocol: SellerProtocolMetrics
    efficiency: EfficiencyMetrics


@dataclass(frozen=True, slots=True)
class AnalyticalCheck:
    category: str
    name: str
    passed: bool
    detail: str


def _ratio(numerator: int, denominator: int | None) -> Rational | None:
    if denominator is None or denominator <= 0:
        return None
    return Rational(numerator, denominator)


def compute_metrics(scenario: Scenario, result: SimulationResult) -> EconomicMetrics:
    """Derive metrics without changing or re-running any Lot B economic formula."""

    settlement = result.settlement
    if settlement is None:
        raise ValueError("scenario metrics require a finalized Lot B result")
    has_bids = settlement.winner is not None
    seller_proceeds = settlement.seller_proceeds if settlement.seller_proceeds is not None else 0
    unassigned = settlement.candidate_pool - settlement.assigned_distribution
    auction = AuctionMetrics(
        settlement.final_price,
        settlement.gross_premium,
        settlement.fee_amount,
        settlement.candidate_pool,
        settlement.assigned_distribution,
        unassigned,
        seller_proceeds,
        result.state.participant_count,
        result.state.bid_count,
        result.state.extensions_used,
    )

    deposits = {bidder.id: 0 for bidder in scenario.bidders}
    observed_lifts = {bidder.id: 0 for bidder in scenario.bidders}
    premium_lifts = {bidder.id: 0 for bidder in scenario.bidders}
    for audit in result.bid_audit:
        deposits[audit.bidder] += audit.deposit
        observed_lifts[audit.bidder] += audit.observed_price_lift
        premium_lifts[audit.bidder] += audit.premium_lift

    bidder_metrics: list[BidderMetrics] = []
    for bidder in scenario.bidders:
        final_cap = result.bidders[bidder.id].max_cap if bidder.id in result.bidders else 0
        refund = result.accounting.refunds.get(bidder.id, 0)
        reward = result.allocation.rewards.get(bidder.id, 0)
        net_cash_flow = refund + reward - deposits[bidder.id]
        winner = bidder.id == settlement.winner
        utility = net_cash_flow + bidder.valuation if winner else net_cash_flow
        bidder_metrics.append(
            BidderMetrics(
                bidder.id,
                bidder.valuation,
                bidder.budget,
                bidder.max_bid_cap,
                final_cap,
                bidder.id in result.bidders,
                winner,
                deposits[bidder.id],
                refund,
                reward,
                net_cash_flow,
                utility,
                scenario.reputations.get(bidder.id, DEFAULT_REPUTATION_BPS),
                observed_lifts[bidder.id],
                premium_lifts[bidder.id],
                _ratio(reward, final_cap) if not winner else None,
                _ratio(reward, premium_lifts[bidder.id]) if not winner else None,
            )
        )

    seller_premium_capture = seller_proceeds - scenario.start_price if has_bids else 0
    gross = settlement.gross_premium
    seller_protocol = SellerProtocolMetrics(
        seller_proceeds,
        seller_premium_capture,
        settlement.fee_amount,
        unassigned,
        _ratio(seller_premium_capture, gross),
        _ratio(settlement.fee_amount, gross),
        _ratio(settlement.assigned_distribution, gross),
    )

    valuations = sorted((bidder.valuation for bidder in scenario.bidders), reverse=True)
    highest_valuation = valuations[0]
    second_highest = valuations[1] if len(valuations) >= 2 else None
    bidder_definitions = scenario.bidder_by_id
    winner_valuation = (
        bidder_definitions[settlement.winner].valuation if settlement.winner is not None else None
    )
    efficiency = EfficiencyMetrics(
        winner_valuation,
        highest_valuation,
        second_highest,
        winner_valuation == highest_valuation if winner_valuation is not None else None,
        _ratio(settlement.final_price, winner_valuation),
        _ratio(settlement.final_price, second_highest),
    )
    return EconomicMetrics(auction, tuple(bidder_metrics), seller_protocol, efficiency)


def evaluate_analytical_checks(
    scenario: Scenario,
    result: SimulationResult,
    metrics: EconomicMetrics,
    *,
    baseline_unchanged: bool,
) -> tuple[AnalyticalCheck, ...]:
    """Evaluate Lot C checks separately from Lot B Solidity invariants."""

    settlement = result.settlement
    if settlement is None:
        raise ValueError("analytical checks require a finalized Lot B result")

    def check(name: str, condition: bool, detail: str) -> AnalyticalCheck:
        return AnalyticalCheck("lot-c-analytics", name, condition, "" if condition else detail)

    max_bid_caps = {bidder.id: bidder.max_bid_cap for bidder in scenario.bidders}
    caps_within_bounds = all(
        audit.new_cap <= max_bid_caps[audit.bidder] for audit in result.bid_audit
    )
    winner_rational = all(
        not bidder.winner or bidder.valuation >= bidder.final_cap for bidder in metrics.bidders
    )
    non_negative_claims = all(
        bidder.refund >= 0 and bidder.reward >= 0 for bidder in metrics.bidders
    )
    cash_flows = all(
        bidder.net_cash_flow == bidder.refund + bidder.reward - bidder.deposit
        for bidder in metrics.bidders
    )
    utilities = all(
        bidder.utility
        == bidder.net_cash_flow + (bidder.valuation if bidder.winner else 0)
        for bidder in metrics.bidders
    )
    observed_total = sum(bidder.observed_price_lift for bidder in metrics.bidders)
    premium_total = sum(bidder.premium_lift for bidder in metrics.bidders)
    seller_identity = (
        settlement.winner is None
        or metrics.seller_protocol.seller_premium_capture
        + settlement.fee_amount
        + settlement.assigned_distribution
        == settlement.gross_premium
    )
    positive_ratio_denominators = all(
        ratio is None or ratio.denominator > 0
        for bidder in metrics.bidders
        for ratio in (bidder.reward_to_final_cap, bidder.reward_to_premium_lift)
    ) and all(
        ratio is None or ratio.denominator > 0
        for ratio in (
            metrics.seller_protocol.seller_capture_ratio,
            metrics.seller_protocol.protocol_fee_share,
            metrics.seller_protocol.redistribution_share,
            metrics.efficiency.price_to_winner_valuation,
            metrics.efficiency.price_to_second_highest_valuation,
        )
    )

    return (
        check("generated caps within maxBidCap", caps_within_bounds, "a generated final cap exceeds maxBidCap"),
        check("winner valuation covers final cap", winner_rational, "winner valuation is below its final cap"),
        check("non-negative rewards and refunds", non_negative_claims, "a reward or refund is negative"),
        check("net cash flow identity", cash_flows, "a bidder cash flow differs from refund + reward - deposit"),
        check("utility identity", utilities, "a bidder utility differs from the documented Lot C convention"),
        check(
            "mechanical observed price lift",
            observed_total == settlement.final_price,
            "summed observedPriceLift differs from final price",
        ),
        check(
            "mechanical premium lift",
            premium_total == settlement.gross_premium,
            "summed premiumLift differs from gross premium",
        ),
        check(
            "seller premium identity",
            seller_identity,
            "seller premium capture + fee + assigned distribution differs from gross premium",
        ),
        check("positive ratio denominators", positive_ratio_denominators, "a defined ratio has a non-positive denominator"),
        check("metrics preserve baseline result", baseline_unchanged, "metric calculation changed the Lot B result"),
    )
