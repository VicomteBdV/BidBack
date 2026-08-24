"""Deterministic actor-level accounting for Lot D counterfactual reports.

This module consumes completed Lot C ``ScenarioReport`` objects.  It does not
re-run, replace, or mutate any Lot B/C economic calculation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .counterfactuals import (
    INPUT_SELECTOR_FIELDS,
    OUTPUT_SELECTOR_FIELDS,
    Comparison,
    CounterfactualCase,
    Selector,
    resolve_scenario_selector,
)
from .metrics import Rational
from .runner import ScenarioReport
from .scenarios import Scenario

class AdversarialMetricsError(ValueError):
    """A Lot D report cannot be accounted for without ambiguity."""

    def __init__(self, code: str, **context: object) -> None:
        self.code = code
        self.context = context
        detail = code if not context else f"{code}: {context}"
        super().__init__(detail)


class MatchedControlFailure(AdversarialMetricsError):
    """A declared experimental control does not match across the pair."""

    def __init__(self, case_id: str, results: tuple[MatchedControlResult, ...]) -> None:
        self.results = results
        failed = tuple(result.comparison_id for result in results if not result.passed)
        super().__init__("MATCHED_CONTROL_FAILED", case_id=case_id, controls=failed)


@dataclass(frozen=True, slots=True)
class ActorAccountingCheck:
    name: str
    passed: bool
    detail: str


@dataclass(frozen=True, slots=True)
class BranchActorAccounting:
    actor_id: str
    nft_valuation: int
    actor_capital_budget: int
    bidder_identities: tuple[str, ...]
    participating_bidder_identities: tuple[str, ...]
    bidder_cash_flow: int
    seller_cash_flow: int
    fee_cash_flow: int
    actor_cash_flow: int
    deposits: int
    refunds: int
    rewards: int
    seller_proceeds: int
    terminal_nft_value: int
    initial_nft_endowment_value: int
    actor_economic_change: int
    aggregate_configured_max_bid_cap: int
    aggregate_locked_capital: int
    capital_time_exposure_wei_seconds: int
    mechanical_premium_lift: int
    configured_cap_within_budget: bool
    locked_capital_within_budget: bool


@dataclass(frozen=True, slots=True)
class BranchCoalitionAccounting:
    actor_ids: tuple[str, ...]
    bidder_identities: tuple[str, ...]
    participating_bidder_identities: tuple[str, ...]
    coalition_economic_change: int
    coalition_cash_flow: int
    coalition_non_reward_cash_flow: int
    coalition_reward: int
    coalition_refund: int
    coalition_deposits: int
    coalition_seller_proceeds: int
    coalition_fee_cash_flow: int
    coalition_terminal_nft_value: int
    coalition_initial_nft_endowment_value: int
    coalition_net_nft_value: int
    aggregate_configured_max_bid_cap: int
    aggregate_locked_capital: int
    capital_time_exposure_wei_seconds: int
    mechanical_premium_lift: int


@dataclass(frozen=True, slots=True)
class BranchAccounting:
    winner_identity: str | None
    winner_actor: str | None
    terminal_nft_claimant_identity: str
    terminal_nft_claimant_actor: str
    actors: tuple[BranchActorAccounting, ...]
    coalition: BranchCoalitionAccounting
    total_configured_max_bid_cap: int
    total_locked_capital: int
    total_deposits: int
    total_capital_time_exposure_wei_seconds: int
    total_mechanical_premium_lift: int
    actor_level_allocative_efficiency: bool | None
    all_actor_budgets_satisfied: bool
    checks: tuple[ActorAccountingCheck, ...]


@dataclass(frozen=True, slots=True)
class ActorUtilityDelta:
    actor_id: str
    reference_actor_economic_change: int
    attack_actor_economic_change: int
    delta_actor_utility: int


@dataclass(frozen=True, slots=True)
class CounterfactualDeltas:
    actor_utilities: tuple[ActorUtilityDelta, ...]
    delta_coalition_utility: int
    delta_coalition_reward: int
    delta_coalition_cash_flow: int
    delta_coalition_non_reward_cash_flow: int
    delta_coalition_terminal_nft_value: int
    delta_coalition_net_nft_value: int
    delta_final_price: int
    delta_gross_premium: int
    delta_seller_revenue: int
    delta_protocol_fee: int
    delta_assigned_distribution: int
    delta_unassigned_remainder: int
    delta_modeled_non_coalition_utility: int
    reference_locked_capital: int
    attack_locked_capital: int
    delta_locked_capital: int
    reference_capital_time_exposure_wei_seconds: int
    attack_capital_time_exposure_wei_seconds: int
    delta_capital_time_exposure_wei_seconds: int
    delta_mechanical_premium_lift: int
    delta_coalition_mechanical_premium_lift: int
    delta_modeled_non_coalition_mechanical_premium_lift: int
    reference_actor_level_allocative_efficiency: bool | None
    attack_actor_level_allocative_efficiency: bool | None
    delta_actor_level_allocative_efficiency: int | None


@dataclass(frozen=True, slots=True)
class AdversarialRatios:
    incremental_coalition_utility_to_incremental_locked_capital: Rational | None
    reference_coalition_reward_to_locked_capital: Rational | None
    attack_coalition_reward_to_locked_capital: Rational | None
    reference_coalition_reward_to_mechanical_premium_lift: Rational | None
    attack_coalition_reward_to_mechanical_premium_lift: Rational | None


@dataclass(frozen=True, slots=True)
class DiagnosticFlags:
    positive_incremental_coalition_utility: bool
    coalition_reward_increased: bool
    final_price_unchanged: bool
    gross_premium_unchanged: bool
    seller_revenue_unchanged: bool
    winner_actor_unchanged: bool
    winner_identity_unchanged: bool
    terminal_nft_claimant_actor_unchanged: bool
    coalition_participating_identities_all_lose: bool
    participating_identity_count_increased: bool
    candidate_pool_unlocked: bool
    participant_identity_threshold_unlocked: bool
    participant_identity_threshold_unlocked_by_same_actor: bool
    reward_only_incremental_gain: bool
    reference_single_identity_reward_capped: bool
    attack_coalition_reward_exceeds_per_identity_cap: bool
    per_user_cap_bypassed_at_coalition_level: bool
    positive_coalition_reward_with_zero_coalition_mechanical_premium_lift: bool
    all_actor_budgets_satisfied: bool
    coalition_configured_max_bid_cap_matched: bool
    coalition_locked_capital_matched: bool
    coalition_capital_time_exposure_matched: bool
    all_actor_accounting_checks_pass: bool
    all_matched_controls_pass: bool


@dataclass(frozen=True, slots=True)
class MatchedControlResult:
    comparison_id: str
    selector_field: str
    selector_subject: str | None
    operator: str
    reference_value: object
    attack_value: object
    passed: bool


@dataclass(frozen=True, slots=True)
class KnownUnmatchedDimensionResult:
    dimension_id: str
    selector_field: str
    selector_subject: str | None
    reference_value: object
    attack_value: object
    reason: str
    differs: bool


@dataclass(frozen=True, slots=True)
class DiagnosticRelationResult:
    comparison_id: str
    selector_field: str
    selector_subject: str | None
    operator: str
    expected_value: int | bool | str | None
    actual_value: int | bool | str | None
    passed: bool


@dataclass(frozen=True, slots=True)
class AdversarialMetrics:
    reference: BranchAccounting
    attack: BranchAccounting
    deltas: CounterfactualDeltas
    ratios: AdversarialRatios
    flags: DiagnosticFlags
    matched_control_results: tuple[MatchedControlResult, ...]
    known_unmatched_dimension_results: tuple[KnownUnmatchedDimensionResult, ...]
    diagnostic_relation_results: tuple[DiagnosticRelationResult, ...]


_FLAG_ATTRIBUTES = {
    "positiveIncrementalCoalitionUtility": "positive_incremental_coalition_utility",
    "coalitionRewardIncreased": "coalition_reward_increased",
    "finalPriceUnchanged": "final_price_unchanged",
    "grossPremiumUnchanged": "gross_premium_unchanged",
    "sellerRevenueUnchanged": "seller_revenue_unchanged",
    "winnerActorUnchanged": "winner_actor_unchanged",
    "winnerIdentityUnchanged": "winner_identity_unchanged",
    "terminalNftClaimantActorUnchanged": "terminal_nft_claimant_actor_unchanged",
    "coalitionParticipatingIdentitiesAllLose": "coalition_participating_identities_all_lose",
    "participatingIdentityCountIncreased": "participating_identity_count_increased",
    "candidatePoolUnlocked": "candidate_pool_unlocked",
    "participantIdentityThresholdUnlocked": "participant_identity_threshold_unlocked",
    "participantIdentityThresholdUnlockedBySameActor": (
        "participant_identity_threshold_unlocked_by_same_actor"
    ),
    "rewardOnlyIncrementalGain": "reward_only_incremental_gain",
    "referenceSingleIdentityRewardCapped": "reference_single_identity_reward_capped",
    "attackCoalitionRewardExceedsPerIdentityCap": (
        "attack_coalition_reward_exceeds_per_identity_cap"
    ),
    "perUserCapBypassedAtCoalitionLevel": "per_user_cap_bypassed_at_coalition_level",
    "positiveCoalitionRewardWithZeroCoalitionMechanicalPremiumLift": (
        "positive_coalition_reward_with_zero_coalition_mechanical_premium_lift"
    ),
    "allActorBudgetsSatisfied": "all_actor_budgets_satisfied",
    "coalitionConfiguredMaxBidCapMatched": "coalition_configured_max_bid_cap_matched",
    "coalitionLockedCapitalMatched": "coalition_locked_capital_matched",
    "coalitionCapitalTimeExposureMatched": "coalition_capital_time_exposure_matched",
    "allActorAccountingChecksPass": "all_actor_accounting_checks_pass",
    "allMatchedControlsPass": "all_matched_controls_pass",
    "participantThresholdUnlocked": "participant_identity_threshold_unlocked",
}


def _actor_by_id(branch: BranchAccounting) -> dict[str, BranchActorAccounting]:
    return {actor.actor_id: actor for actor in branch.actors}


def _bidder_metrics_by_id(report: ScenarioReport) -> dict[str, object]:
    return {bidder.bidder: bidder for bidder in report.metrics.bidders}


def _ratio(numerator: int, denominator: int) -> Rational | None:
    return Rational(numerator, denominator) if denominator > 0 else None


def _check(name: str, passed: bool, detail: str) -> ActorAccountingCheck:
    return ActorAccountingCheck(name, passed, "" if passed else detail)


def compute_branch_accounting(
    case: CounterfactualCase,
    scenario: Scenario,
    report: ScenarioReport,
) -> BranchAccounting:
    """Consolidate a completed branch by economic actor without mutating it."""

    if report.metadata.scenario_id != scenario.id:
        raise AdversarialMetricsError(
            "SCENARIO_REPORT_MISMATCH",
            scenario_id=scenario.id,
            report_scenario_id=report.metadata.scenario_id,
        )
    settlement = report.baseline_result.settlement
    if settlement is None:
        raise AdversarialMetricsError("UNFINALIZED_SCENARIO_REPORT", scenario_id=scenario.id)

    actor_definitions = {actor.actor_id: actor for actor in case.actors}
    ownership = dict(case.identity_ownership)
    if scenario.seller not in ownership:
        raise AdversarialMetricsError("UNOWNED_SELLER_IDENTITY", identity=scenario.seller)
    if ownership[scenario.seller] != case.seller_actor_id:
        raise AdversarialMetricsError(
            "SELLER_ACTOR_MISMATCH",
            identity=scenario.seller,
            expected=case.seller_actor_id,
            actual=ownership[scenario.seller],
        )

    bidder_metrics = _bidder_metrics_by_id(report)
    bidder_definitions = scenario.bidder_by_id
    deposits_by_identity = {bidder_id: 0 for bidder_id in bidder_definitions}
    capital_time_by_identity = {bidder_id: 0 for bidder_id in bidder_definitions}
    finalization_time = report.baseline_result.state.end_time
    for event in report.generated_bid_trace:
        if event.bidder not in deposits_by_identity:
            raise AdversarialMetricsError("UNKNOWN_TRACE_IDENTITY", identity=event.bidder)
        if event.timestamp > finalization_time:
            raise AdversarialMetricsError(
                "BID_AFTER_FINALIZATION_TIME",
                identity=event.bidder,
                bid_timestamp=event.timestamp,
                finalization_time=finalization_time,
            )
        deposits_by_identity[event.bidder] += event.deposit
        capital_time_by_identity[event.bidder] += event.deposit * (
            finalization_time - event.timestamp
        )

    for bidder_id in bidder_definitions:
        if bidder_id not in ownership:
            raise AdversarialMetricsError("UNOWNED_BIDDER_IDENTITY", identity=bidder_id)
        if ownership[bidder_id] not in actor_definitions:
            raise AdversarialMetricsError(
                "UNKNOWN_IDENTITY_OWNER",
                identity=bidder_id,
                actor_id=ownership[bidder_id],
            )

    winner_identity = settlement.winner
    winner_actor = ownership[winner_identity] if winner_identity is not None else None
    terminal_identity = settlement.nft_claimant
    if terminal_identity not in ownership:
        raise AdversarialMetricsError(
            "UNOWNED_TERMINAL_NFT_CLAIMANT",
            identity=terminal_identity,
        )
    terminal_actor = ownership[terminal_identity]

    actors: list[BranchActorAccounting] = []
    for actor_id in sorted(actor_definitions):
        definition = actor_definitions[actor_id]
        identities = tuple(
            sorted(
                bidder_id
                for bidder_id in bidder_definitions
                if ownership[bidder_id] == actor_id
            )
        )
        metrics = tuple(bidder_metrics[bidder_id] for bidder_id in identities)
        participating = tuple(sorted(item.bidder for item in metrics if item.participated))
        bidder_cash_flow = sum(item.net_cash_flow for item in metrics)
        seller_cash_flow = (
            report.metrics.seller_protocol.seller_revenue
            if actor_id == case.seller_actor_id
            else 0
        )
        fee_cash_flow = (
            report.metrics.seller_protocol.protocol_fee_revenue
            if actor_id == case.protocol_fee_recipient_actor_id
            else 0
        )
        actor_cash_flow = bidder_cash_flow + seller_cash_flow + fee_cash_flow
        terminal_nft_value = definition.nft_valuation if actor_id == terminal_actor else 0
        initial_nft_value = (
            case.initial_nft_endowment.value
            if actor_id == case.initial_nft_endowment.owner_actor_id
            else 0
        )
        configured_cap = sum(bidder_definitions[item].max_bid_cap for item in identities)
        locked_capital = sum(item.final_cap for item in metrics)
        actors.append(
            BranchActorAccounting(
                actor_id=actor_id,
                nft_valuation=definition.nft_valuation,
                actor_capital_budget=definition.actor_capital_budget,
                bidder_identities=identities,
                participating_bidder_identities=participating,
                bidder_cash_flow=bidder_cash_flow,
                seller_cash_flow=seller_cash_flow,
                fee_cash_flow=fee_cash_flow,
                actor_cash_flow=actor_cash_flow,
                deposits=sum(item.deposit for item in metrics),
                refunds=sum(item.refund for item in metrics),
                rewards=sum(item.reward for item in metrics),
                seller_proceeds=seller_cash_flow,
                terminal_nft_value=terminal_nft_value,
                initial_nft_endowment_value=initial_nft_value,
                actor_economic_change=(
                    actor_cash_flow + terminal_nft_value - initial_nft_value
                ),
                aggregate_configured_max_bid_cap=configured_cap,
                aggregate_locked_capital=locked_capital,
                capital_time_exposure_wei_seconds=sum(
                    capital_time_by_identity[item] for item in identities
                ),
                mechanical_premium_lift=sum(item.premium_lift for item in metrics),
                configured_cap_within_budget=(
                    configured_cap <= definition.actor_capital_budget
                ),
                locked_capital_within_budget=(
                    locked_capital <= definition.actor_capital_budget
                ),
            )
        )

    actor_tuple = tuple(actors)
    actor_lookup = {actor.actor_id: actor for actor in actor_tuple}
    coalition_actor_ids = tuple(sorted(case.coalition_actor_ids))
    try:
        coalition_members = tuple(actor_lookup[actor_id] for actor_id in coalition_actor_ids)
    except KeyError as exc:
        raise AdversarialMetricsError("UNKNOWN_COALITION_ACTOR", actor_id=str(exc)) from exc

    coalition_terminal = sum(item.terminal_nft_value for item in coalition_members)
    coalition_initial = sum(
        item.initial_nft_endowment_value for item in coalition_members
    )
    coalition_cash_flow = sum(item.actor_cash_flow for item in coalition_members)
    coalition_reward = sum(item.rewards for item in coalition_members)
    coalition = BranchCoalitionAccounting(
        actor_ids=coalition_actor_ids,
        bidder_identities=tuple(
            sorted(identity for item in coalition_members for identity in item.bidder_identities)
        ),
        participating_bidder_identities=tuple(
            sorted(
                identity
                for item in coalition_members
                for identity in item.participating_bidder_identities
            )
        ),
        coalition_economic_change=sum(
            item.actor_economic_change for item in coalition_members
        ),
        coalition_cash_flow=coalition_cash_flow,
        coalition_non_reward_cash_flow=coalition_cash_flow - coalition_reward,
        coalition_reward=coalition_reward,
        coalition_refund=sum(item.refunds for item in coalition_members),
        coalition_deposits=sum(item.deposits for item in coalition_members),
        coalition_seller_proceeds=sum(item.seller_proceeds for item in coalition_members),
        coalition_fee_cash_flow=sum(item.fee_cash_flow for item in coalition_members),
        coalition_terminal_nft_value=coalition_terminal,
        coalition_initial_nft_endowment_value=coalition_initial,
        coalition_net_nft_value=coalition_terminal - coalition_initial,
        aggregate_configured_max_bid_cap=sum(
            item.aggregate_configured_max_bid_cap for item in coalition_members
        ),
        aggregate_locked_capital=sum(
            item.aggregate_locked_capital for item in coalition_members
        ),
        capital_time_exposure_wei_seconds=sum(
            item.capital_time_exposure_wei_seconds for item in coalition_members
        ),
        mechanical_premium_lift=sum(
            item.mechanical_premium_lift for item in coalition_members
        ),
    )

    final_caps = {item.bidder: item.final_cap for item in report.metrics.bidders}
    metric_deposits = {item.bidder: item.deposit for item in report.metrics.bidders}
    deposit_deltas_match_caps = all(
        deposits_by_identity[bidder_id] == final_caps[bidder_id]
        for bidder_id in bidder_definitions
    )
    metric_deposits_match_trace = all(
        deposits_by_identity[bidder_id] == metric_deposits[bidder_id]
        for bidder_id in bidder_definitions
    )
    total_locked = sum(item.aggregate_locked_capital for item in actor_tuple)
    total_configured = sum(
        item.aggregate_configured_max_bid_cap for item in actor_tuple
    )
    all_configured_budgets = all(item.configured_cap_within_budget for item in actor_tuple)
    all_locked_budgets = all(item.locked_capital_within_budget for item in actor_tuple)
    total_actor_rewards = sum(item.rewards for item in actor_tuple)
    total_actor_refunds = sum(item.refunds for item in actor_tuple)
    total_actor_economic_change = sum(
        item.actor_economic_change for item in actor_tuple
    )
    external_fee = (
        report.metrics.seller_protocol.protocol_fee_revenue
        if case.protocol_fee_recipient_actor_id is None
        else 0
    )
    actor_conservation_target = (
        actor_lookup[terminal_actor].nft_valuation
        - case.initial_nft_endowment.value
        - external_fee
    )
    checks = (
        _check(
            "aggregate configured maxBidCap within actor budgets",
            all_configured_budgets,
            "an actor aggregate configured maxBidCap exceeds actorCapitalBudget",
        ),
        _check(
            "aggregate locked capital within actor budgets",
            all_locked_budgets,
            "an actor aggregate locked capital exceeds actorCapitalBudget",
        ),
        _check(
            "identity deposit deltas equal final caps",
            deposit_deltas_match_caps,
            "summed BidEvent deposit deltas differ from an identity final cap",
        ),
        _check(
            "Lot C deposits equal generated trace deposit deltas",
            metric_deposits_match_trace,
            "a Lot C bidder deposit differs from its generated trace deposit deltas",
        ),
        _check(
            "actor locked capital equals baseline total deposits",
            total_locked == report.baseline_result.accounting.total_deposits,
            "summed actor locked capital differs from baseline accounting.total_deposits",
        ),
        _check(
            "actor rewards equal assigned distribution",
            total_actor_rewards == report.baseline_result.allocation.assigned,
            "summed actor rewards differ from baseline allocation.assigned",
        ),
        _check(
            "actor refunds equal baseline refunds",
            total_actor_refunds == sum(report.baseline_result.accounting.refunds.values()),
            "summed actor refunds differ from baseline accounting.refunds",
        ),
        _check(
            "actor economic changes conserve modeled value",
            total_actor_economic_change == actor_conservation_target,
            "summed actor economic changes differ from terminal valuation minus endowment and external fee",
        ),
    )

    efficiency: bool | None = None
    if actor_tuple:
        highest_valuation = max(item.nft_valuation for item in actor_tuple)
        efficiency = actor_lookup[terminal_actor].nft_valuation == highest_valuation

    return BranchAccounting(
        winner_identity=winner_identity,
        winner_actor=winner_actor,
        terminal_nft_claimant_identity=terminal_identity,
        terminal_nft_claimant_actor=terminal_actor,
        actors=actor_tuple,
        coalition=coalition,
        total_configured_max_bid_cap=total_configured,
        total_locked_capital=total_locked,
        total_deposits=report.baseline_result.accounting.total_deposits,
        total_capital_time_exposure_wei_seconds=sum(
            item.capital_time_exposure_wei_seconds for item in actor_tuple
        ),
        total_mechanical_premium_lift=sum(
            item.mechanical_premium_lift for item in actor_tuple
        ),
        actor_level_allocative_efficiency=efficiency,
        all_actor_budgets_satisfied=all_configured_budgets and all_locked_budgets,
        checks=checks,
    )


def compute_counterfactual_deltas(
    reference: BranchAccounting,
    attack: BranchAccounting,
    reference_report: ScenarioReport,
    attack_report: ScenarioReport,
) -> CounterfactualDeltas:
    reference_actors = _actor_by_id(reference)
    attack_actors = _actor_by_id(attack)
    if set(reference_actors) != set(attack_actors):
        raise AdversarialMetricsError(
            "COUNTERFACTUAL_ACTOR_SET_MISMATCH",
            reference=tuple(sorted(reference_actors)),
            attack=tuple(sorted(attack_actors)),
        )

    actor_deltas = tuple(
        ActorUtilityDelta(
            actor_id,
            reference_actors[actor_id].actor_economic_change,
            attack_actors[actor_id].actor_economic_change,
            (
                attack_actors[actor_id].actor_economic_change
                - reference_actors[actor_id].actor_economic_change
            ),
        )
        for actor_id in sorted(reference_actors)
    )
    coalition_ids = set(reference.coalition.actor_ids)
    if coalition_ids != set(attack.coalition.actor_ids):
        raise AdversarialMetricsError("COUNTERFACTUAL_COALITION_SET_MISMATCH")
    non_coalition_ids = set(reference_actors) - coalition_ids

    reference_auction = reference_report.metrics.auction
    attack_auction = attack_report.metrics.auction
    reference_seller = reference_report.metrics.seller_protocol
    attack_seller = attack_report.metrics.seller_protocol
    reference_non_coalition_lift = sum(
        reference_actors[actor_id].mechanical_premium_lift
        for actor_id in non_coalition_ids
    )
    attack_non_coalition_lift = sum(
        attack_actors[actor_id].mechanical_premium_lift
        for actor_id in non_coalition_ids
    )

    reference_efficiency = reference.actor_level_allocative_efficiency
    attack_efficiency = attack.actor_level_allocative_efficiency
    efficiency_delta = (
        None
        if reference_efficiency is None or attack_efficiency is None
        else int(attack_efficiency) - int(reference_efficiency)
    )
    return CounterfactualDeltas(
        actor_utilities=actor_deltas,
        delta_coalition_utility=(
            attack.coalition.coalition_economic_change
            - reference.coalition.coalition_economic_change
        ),
        delta_coalition_reward=(
            attack.coalition.coalition_reward - reference.coalition.coalition_reward
        ),
        delta_coalition_cash_flow=(
            attack.coalition.coalition_cash_flow
            - reference.coalition.coalition_cash_flow
        ),
        delta_coalition_non_reward_cash_flow=(
            attack.coalition.coalition_non_reward_cash_flow
            - reference.coalition.coalition_non_reward_cash_flow
        ),
        delta_coalition_terminal_nft_value=(
            attack.coalition.coalition_terminal_nft_value
            - reference.coalition.coalition_terminal_nft_value
        ),
        delta_coalition_net_nft_value=(
            attack.coalition.coalition_net_nft_value
            - reference.coalition.coalition_net_nft_value
        ),
        delta_final_price=attack_auction.final_price - reference_auction.final_price,
        delta_gross_premium=(
            attack_auction.gross_premium - reference_auction.gross_premium
        ),
        delta_seller_revenue=(
            attack_seller.seller_revenue - reference_seller.seller_revenue
        ),
        delta_protocol_fee=(
            attack_seller.protocol_fee_revenue
            - reference_seller.protocol_fee_revenue
        ),
        delta_assigned_distribution=(
            attack_auction.assigned_distribution
            - reference_auction.assigned_distribution
        ),
        delta_unassigned_remainder=(
            attack_auction.unassigned_remainder
            - reference_auction.unassigned_remainder
        ),
        delta_modeled_non_coalition_utility=sum(
            attack_actors[actor_id].actor_economic_change
            - reference_actors[actor_id].actor_economic_change
            for actor_id in non_coalition_ids
        ),
        reference_locked_capital=reference.coalition.aggregate_locked_capital,
        attack_locked_capital=attack.coalition.aggregate_locked_capital,
        delta_locked_capital=(
            attack.coalition.aggregate_locked_capital
            - reference.coalition.aggregate_locked_capital
        ),
        reference_capital_time_exposure_wei_seconds=(
            reference.coalition.capital_time_exposure_wei_seconds
        ),
        attack_capital_time_exposure_wei_seconds=(
            attack.coalition.capital_time_exposure_wei_seconds
        ),
        delta_capital_time_exposure_wei_seconds=(
            attack.coalition.capital_time_exposure_wei_seconds
            - reference.coalition.capital_time_exposure_wei_seconds
        ),
        delta_mechanical_premium_lift=(
            attack.total_mechanical_premium_lift
            - reference.total_mechanical_premium_lift
        ),
        delta_coalition_mechanical_premium_lift=(
            attack.coalition.mechanical_premium_lift
            - reference.coalition.mechanical_premium_lift
        ),
        delta_modeled_non_coalition_mechanical_premium_lift=(
            attack_non_coalition_lift - reference_non_coalition_lift
        ),
        reference_actor_level_allocative_efficiency=reference_efficiency,
        attack_actor_level_allocative_efficiency=attack_efficiency,
        delta_actor_level_allocative_efficiency=efficiency_delta,
    )


def compute_adversarial_ratios(
    reference: BranchAccounting,
    attack: BranchAccounting,
    deltas: CounterfactualDeltas,
) -> AdversarialRatios:
    return AdversarialRatios(
        incremental_coalition_utility_to_incremental_locked_capital=_ratio(
            deltas.delta_coalition_utility,
            deltas.delta_locked_capital,
        ),
        reference_coalition_reward_to_locked_capital=_ratio(
            reference.coalition.coalition_reward,
            reference.coalition.aggregate_locked_capital,
        ),
        attack_coalition_reward_to_locked_capital=_ratio(
            attack.coalition.coalition_reward,
            attack.coalition.aggregate_locked_capital,
        ),
        reference_coalition_reward_to_mechanical_premium_lift=_ratio(
            reference.coalition.coalition_reward,
            reference.coalition.mechanical_premium_lift,
        ),
        attack_coalition_reward_to_mechanical_premium_lift=_ratio(
            attack.coalition.coalition_reward,
            attack.coalition.mechanical_premium_lift,
        ),
    )


def _single_identity_reward_capped(
    branch: BranchAccounting,
    report: ScenarioReport,
) -> bool:
    identities = branch.coalition.participating_bidder_identities
    if len(identities) != 1 or report.baseline_result.allocation.per_user_cap <= 0:
        return False
    identity = identities[0]
    reward = report.baseline_result.allocation.rewards.get(identity, 0)
    raw_reward = report.baseline_result.allocation.raw_rewards.get(identity, 0)
    return (
        reward == report.baseline_result.allocation.per_user_cap
        and raw_reward >= reward
    )


def _threshold_unlocked_by_same_actor(
    case: CounterfactualCase,
    reference: BranchAccounting,
    attack: BranchAccounting,
    threshold_unlocked: bool,
) -> bool:
    if not threshold_unlocked:
        return False
    reference_ids = set(reference.coalition.participating_bidder_identities)
    attack_ids = set(attack.coalition.participating_bidder_identities)
    added = attack_ids - reference_ids
    if not added:
        return False
    ownership = dict(case.identity_ownership)
    added_owners = {ownership[identity] for identity in added}
    if len(added_owners) != 1:
        return False
    owner = next(iter(added_owners))
    if owner not in case.coalition_actor_ids:
        return False
    return (
        sum(1 for identity in attack_ids if ownership[identity] == owner) >= 2
        and any(ownership[identity] == owner for identity in reference_ids)
    )


def compute_diagnostic_flags(
    case: CounterfactualCase,
    reference_scenario: Scenario,
    attack_scenario: Scenario,
    reference_report: ScenarioReport,
    attack_report: ScenarioReport,
    reference: BranchAccounting,
    attack: BranchAccounting,
    deltas: CounterfactualDeltas,
    *,
    all_matched_controls_pass: bool,
) -> DiagnosticFlags:
    del reference_scenario
    reference_participants = reference_report.metrics.auction.participant_count
    attack_participants = attack_report.metrics.auction.participant_count
    participant_threshold_unlocked = (
        reference_participants < attack_scenario.params.min_participants
        <= attack_participants
    )
    participating_count_increased = (
        len(attack.coalition.participating_bidder_identities)
        > len(reference.coalition.participating_bidder_identities)
    )
    reference_capped = _single_identity_reward_capped(reference, reference_report)
    attack_exceeds_cap = (
        attack.coalition.coalition_reward
        > attack_report.baseline_result.allocation.per_user_cap
    )
    candidate_pool_unchanged = (
        reference_report.metrics.auction.candidate_pool
        == attack_report.metrics.auction.candidate_pool
    )
    configured_cap_matched = (
        reference.coalition.aggregate_configured_max_bid_cap
        == attack.coalition.aggregate_configured_max_bid_cap
    )
    locked_capital_matched = (
        reference.coalition.aggregate_locked_capital
        == attack.coalition.aggregate_locked_capital
    )
    all_checks = all(item.passed for item in (*reference.checks, *attack.checks))
    return DiagnosticFlags(
        positive_incremental_coalition_utility=deltas.delta_coalition_utility > 0,
        coalition_reward_increased=deltas.delta_coalition_reward > 0,
        final_price_unchanged=deltas.delta_final_price == 0,
        gross_premium_unchanged=deltas.delta_gross_premium == 0,
        seller_revenue_unchanged=deltas.delta_seller_revenue == 0,
        winner_actor_unchanged=reference.winner_actor == attack.winner_actor,
        winner_identity_unchanged=reference.winner_identity == attack.winner_identity,
        terminal_nft_claimant_actor_unchanged=(
            reference.terminal_nft_claimant_actor
            == attack.terminal_nft_claimant_actor
        ),
        coalition_participating_identities_all_lose=(
            bool(attack.coalition.participating_bidder_identities)
            and attack.winner_identity
            not in attack.coalition.participating_bidder_identities
        ),
        participating_identity_count_increased=participating_count_increased,
        candidate_pool_unlocked=(
            reference_report.metrics.auction.candidate_pool == 0
            and attack_report.metrics.auction.candidate_pool > 0
        ),
        participant_identity_threshold_unlocked=participant_threshold_unlocked,
        participant_identity_threshold_unlocked_by_same_actor=(
            _threshold_unlocked_by_same_actor(
                case,
                reference,
                attack,
                participant_threshold_unlocked,
            )
        ),
        reward_only_incremental_gain=(
            deltas.delta_coalition_utility > 0
            and deltas.delta_coalition_utility == deltas.delta_coalition_reward
            and deltas.delta_coalition_non_reward_cash_flow == 0
            and deltas.delta_coalition_net_nft_value == 0
        ),
        reference_single_identity_reward_capped=reference_capped,
        attack_coalition_reward_exceeds_per_identity_cap=attack_exceeds_cap,
        per_user_cap_bypassed_at_coalition_level=(
            reference_capped
            and attack_exceeds_cap
            and attack.coalition.coalition_reward
            > reference.coalition.coalition_reward
            and participating_count_increased
            and configured_cap_matched
            and locked_capital_matched
            and deltas.delta_final_price == 0
            and deltas.delta_gross_premium == 0
            and deltas.delta_protocol_fee == 0
            and candidate_pool_unchanged
        ),
        positive_coalition_reward_with_zero_coalition_mechanical_premium_lift=(
            attack.coalition.coalition_reward > 0
            and attack.coalition.mechanical_premium_lift == 0
        ),
        all_actor_budgets_satisfied=(
            reference.all_actor_budgets_satisfied
            and attack.all_actor_budgets_satisfied
        ),
        coalition_configured_max_bid_cap_matched=configured_cap_matched,
        coalition_locked_capital_matched=locked_capital_matched,
        coalition_capital_time_exposure_matched=(
            reference.coalition.capital_time_exposure_wei_seconds
            == attack.coalition.capital_time_exposure_wei_seconds
        ),
        all_actor_accounting_checks_pass=all_checks,
        all_matched_controls_pass=all_matched_controls_pass,
    )


def resolve_branch_selector(
    selector: Selector,
    scenario: Scenario,
    report: ScenarioReport,
    branch: BranchAccounting,
) -> object:
    """Resolve one closed-registry selector for a single paired branch."""

    if selector.field in INPUT_SELECTOR_FIELDS:
        return resolve_scenario_selector(scenario, selector)
    if selector.field not in OUTPUT_SELECTOR_FIELDS:
        raise AdversarialMetricsError(
            "UNKNOWN_BRANCH_SELECTOR",
            field=selector.field,
            subject=selector.subject,
        )

    no_subject = {
        "auction.finalPrice",
        "auction.grossPremium",
        "auction.feeAmount",
        "auction.candidatePool",
        "auction.sellerRevenue",
        "auction.participantCount",
        "auction.extensionsUsed",
        "winner.identity",
        "winner.actor",
        "terminalNftClaimant.actor",
        "coalition.aggregateLockedCapital",
        "coalition.capitalTimeExposureWeiSeconds",
    }
    if selector.field in no_subject and selector.subject is not None:
        raise AdversarialMetricsError(
            "UNEXPECTED_SELECTOR_SUBJECT",
            field=selector.field,
            subject=selector.subject,
        )

    auction = report.metrics.auction
    direct = {
        "auction.finalPrice": auction.final_price,
        "auction.grossPremium": auction.gross_premium,
        "auction.feeAmount": auction.fee_amount,
        "auction.candidatePool": auction.candidate_pool,
        "auction.sellerRevenue": report.metrics.seller_protocol.seller_revenue,
        "auction.participantCount": auction.participant_count,
        "auction.extensionsUsed": auction.extensions_used,
        "winner.identity": branch.winner_identity,
        "winner.actor": branch.winner_actor,
        "terminalNftClaimant.actor": branch.terminal_nft_claimant_actor,
        "coalition.aggregateLockedCapital": branch.coalition.aggregate_locked_capital,
        "coalition.capitalTimeExposureWeiSeconds": (
            branch.coalition.capital_time_exposure_wei_seconds
        ),
    }
    if selector.field in direct:
        return direct[selector.field]

    if selector.subject is None:
        raise AdversarialMetricsError("MISSING_SELECTOR_SUBJECT", field=selector.field)
    subject = selector.subject
    if selector.field.startswith("actor."):
        actor_lookup = _actor_by_id(branch)
        if subject not in actor_lookup:
            raise AdversarialMetricsError(
                "UNKNOWN_SELECTOR_ACTOR",
                field=selector.field,
                subject=subject,
            )
        actor = actor_lookup[subject]
        return {
            "actor.aggregateConfiguredMaxBidCap": actor.aggregate_configured_max_bid_cap,
            "actor.aggregateLockedCapital": actor.aggregate_locked_capital,
            "actor.capitalTimeExposureWeiSeconds": actor.capital_time_exposure_wei_seconds,
        }[selector.field]

    bidder_lookup = _bidder_metrics_by_id(report)
    if subject not in bidder_lookup:
        raise AdversarialMetricsError(
            "UNKNOWN_SELECTOR_BIDDER",
            field=selector.field,
            subject=subject,
        )
    bidder = bidder_lookup[subject]
    bidder_state = report.baseline_result.bidders.get(subject)
    score = report.baseline_result.scores.get(subject)
    return {
        "bidder.firstBidTime": bidder_state.first_bid_time if bidder_state else 0,
        "bidder.finalCap": bidder.final_cap,
        "bidder.ef": score.financial_engagement if score else None,
        "bidder.et": score.time_engagement if score else None,
        "bidder.ii": score.interaction_intensity if score else None,
        "bidder.reputation": bidder.reputation,
        "bidder.participated": bidder.participated,
    }[selector.field]


def resolve_diagnostic_selector(
    selector: Selector,
    deltas: CounterfactualDeltas,
    flags: DiagnosticFlags,
) -> int | bool | str | None:
    if selector.subject is not None:
        raise AdversarialMetricsError(
            "UNEXPECTED_SELECTOR_SUBJECT",
            field=selector.field,
            subject=selector.subject,
        )
    if selector.field == "delta.coalitionUtility":
        return deltas.delta_coalition_utility
    if selector.field.startswith("flag."):
        flag_name = selector.field.removeprefix("flag.")
        if flag_name not in _FLAG_ATTRIBUTES:
            raise AdversarialMetricsError(
                "UNKNOWN_DIAGNOSTIC_SELECTOR",
                field=selector.field,
            )
        return getattr(flags, _FLAG_ATTRIBUTES[flag_name])
    raise AdversarialMetricsError(
        "UNKNOWN_DIAGNOSTIC_SELECTOR",
        field=selector.field,
    )


def _compare(actual: object, operator: str, expected: object) -> bool:
    if operator == "equal":
        return actual == expected
    if operator == "notEqual":
        return actual != expected
    if actual is None or expected is None:
        return False
    if type(actual) is not type(expected):
        raise AdversarialMetricsError(
            "COMPARISON_TYPE_MISMATCH",
            actual_type=type(actual).__name__,
            expected_type=type(expected).__name__,
        )
    if operator == "lessThan":
        return actual < expected
    if operator == "lessThanOrEqual":
        return actual <= expected
    if operator == "greaterThan":
        return actual > expected
    if operator == "greaterThanOrEqual":
        return actual >= expected
    raise AdversarialMetricsError("UNKNOWN_COMPARISON_OPERATOR", operator=operator)


def evaluate_matched_controls(
    case: CounterfactualCase,
    reference_scenario: Scenario,
    attack_scenario: Scenario,
    reference_report: ScenarioReport,
    attack_report: ScenarioReport,
    reference_branch: BranchAccounting,
    attack_branch: BranchAccounting,
) -> tuple[MatchedControlResult, ...]:
    results: list[MatchedControlResult] = []
    for comparison in case.matched_controls:
        reference_value = resolve_branch_selector(
            comparison.selector,
            reference_scenario,
            reference_report,
            reference_branch,
        )
        attack_value = resolve_branch_selector(
            comparison.selector,
            attack_scenario,
            attack_report,
            attack_branch,
        )
        results.append(
            MatchedControlResult(
                comparison_id=comparison.id,
                selector_field=comparison.selector.field,
                selector_subject=comparison.selector.subject,
                operator=comparison.operator,
                reference_value=reference_value,
                attack_value=attack_value,
                passed=_compare(attack_value, comparison.operator, reference_value),
            )
        )
    return tuple(results)


def evaluate_known_unmatched_dimensions(
    case: CounterfactualCase,
    reference_scenario: Scenario,
    attack_scenario: Scenario,
    reference_report: ScenarioReport,
    attack_report: ScenarioReport,
    reference_branch: BranchAccounting,
    attack_branch: BranchAccounting,
) -> tuple[KnownUnmatchedDimensionResult, ...]:
    return tuple(
        KnownUnmatchedDimensionResult(
            dimension_id=dimension.id,
            selector_field=dimension.selector.field,
            selector_subject=dimension.selector.subject,
            reference_value=resolve_branch_selector(
                dimension.selector,
                reference_scenario,
                reference_report,
                reference_branch,
            ),
            attack_value=resolve_branch_selector(
                dimension.selector,
                attack_scenario,
                attack_report,
                attack_branch,
            ),
            reason=dimension.reason,
            differs=(
                resolve_branch_selector(
                    dimension.selector,
                    reference_scenario,
                    reference_report,
                    reference_branch,
                )
                != resolve_branch_selector(
                    dimension.selector,
                    attack_scenario,
                    attack_report,
                    attack_branch,
                )
            ),
        )
        for dimension in case.known_unmatched_dimensions
    )


def evaluate_diagnostic_relations(
    comparisons: Sequence[Comparison],
    deltas: CounterfactualDeltas,
    flags: DiagnosticFlags,
) -> tuple[DiagnosticRelationResult, ...]:
    results: list[DiagnosticRelationResult] = []
    for comparison in comparisons:
        actual = resolve_diagnostic_selector(comparison.selector, deltas, flags)
        results.append(
            DiagnosticRelationResult(
                comparison_id=comparison.id,
                selector_field=comparison.selector.field,
                selector_subject=comparison.selector.subject,
                operator=comparison.operator,
                expected_value=comparison.expected,
                actual_value=actual,
                passed=_compare(actual, comparison.operator, comparison.expected),
            )
        )
    return tuple(results)


def compute_adversarial_metrics(
    case: CounterfactualCase,
    reference_scenario: Scenario,
    attack_scenario: Scenario,
    reference_report: ScenarioReport,
    attack_report: ScenarioReport,
) -> AdversarialMetrics:
    """Compute the complete Lot D accounting and enforce matched controls."""

    reference = compute_branch_accounting(case, reference_scenario, reference_report)
    attack = compute_branch_accounting(case, attack_scenario, attack_report)
    deltas = compute_counterfactual_deltas(
        reference,
        attack,
        reference_report,
        attack_report,
    )
    ratios = compute_adversarial_ratios(reference, attack, deltas)
    matched_controls = evaluate_matched_controls(
        case,
        reference_scenario,
        attack_scenario,
        reference_report,
        attack_report,
        reference,
        attack,
    )
    all_matched_controls_pass = all(result.passed for result in matched_controls)
    flags = compute_diagnostic_flags(
        case,
        reference_scenario,
        attack_scenario,
        reference_report,
        attack_report,
        reference,
        attack,
        deltas,
        all_matched_controls_pass=all_matched_controls_pass,
    )
    if not all_matched_controls_pass:
        raise MatchedControlFailure(case.case_id, matched_controls)
    unmatched = evaluate_known_unmatched_dimensions(
        case,
        reference_scenario,
        attack_scenario,
        reference_report,
        attack_report,
        reference,
        attack,
    )
    diagnostics = evaluate_diagnostic_relations(
        case.diagnostic_relations,
        deltas,
        flags,
    )
    return AdversarialMetrics(
        reference=reference,
        attack=attack,
        deltas=deltas,
        ratios=ratios,
        flags=flags,
        matched_control_results=matched_controls,
        known_unmatched_dimension_results=unmatched,
        diagnostic_relation_results=diagnostics,
    )
