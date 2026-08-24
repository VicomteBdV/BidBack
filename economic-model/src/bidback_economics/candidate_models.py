"""Pure, deterministic Lot E candidate reward calculations.

The Solidity baseline remains authoritative for auction execution and settlement.
This module changes only bidder rewards and the seller/distribution cash-flow
overlay described by a :class:`CandidateDefinition`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

from .baseline import (
    BPS,
    DEFAULT_REPUTATION_BPS,
    final_score,
    financial_engagement,
    interaction_intensity,
    reputation_bps,
    time_engagement,
    weighted_score,
)
from .candidates import (
    AllocationPolicy,
    AllocationSubject,
    CandidateDefinition,
    ContributionPolicy,
    EligibilityPolicy,
    PoolPolicy,
    RewardCapPolicy,
    SecondaryWeightPolicy,
    SUPPORTED_POLICY_COMBINATIONS,
)
from .runner import ScenarioReport
from .scenarios import Scenario
from .solidity_math import checked_add, checked_div, checked_mul, checked_sub, validate_typed_uint
from .types import SettlementResult


@dataclass(frozen=True, slots=True)
class CandidateInvariant:
    """One integrity property of a candidate cash-flow overlay."""

    name: str
    passed: bool
    detail: str = ""


@dataclass(frozen=True, slots=True)
class CandidateAllocation:
    """Identity-level candidate allocation without post-cap reallocation."""

    contribution_by_subject: Mapping[str, int]
    weight_by_subject: Mapping[str, int]
    raw_rewards: Mapping[str, int]
    rewards: Mapping[str, int]
    recipients: tuple[str, ...]
    total_weight: int
    per_user_cap: int | None
    assigned: int
    unassigned_remainder: int

    @property
    def assigned_distribution(self) -> int:
        return self.assigned


@dataclass(frozen=True, slots=True)
class CandidateSettlement:
    """Hypothetical settlement fields affected by a candidate allocation."""

    winner: str | None
    final_price: int
    gross_premium: int
    fee_amount: int
    net_premium: int
    candidate_pool: int
    assigned_distribution: int
    unassigned_remainder: int
    seller_proceeds: int
    seller_premium_capture: int
    nft_claimant: str


@dataclass(frozen=True, slots=True)
class CandidateEvaluation:
    """A candidate overlay paired with the unchanged authoritative settlement."""

    model: CandidateDefinition
    candidate_pool: int
    mechanical_contribution_by_subject: Mapping[str, int]
    contribution_by_subject: Mapping[str, int]
    secondary_score_by_subject: Mapping[str, int]
    allocation: CandidateAllocation
    baseline_settlement: SettlementResult
    settlement: CandidateSettlement
    invariants: tuple[CandidateInvariant, ...]

    @property
    def model_id(self) -> str:
        return self.model.id


def candidate_distribution_pool(
    premium_net: int,
    redistribution_bps: int,
    min_premium_net: int,
) -> int:
    """Return the Lot E pool, independent of duration and identity count.

    Multiplication intentionally precedes division so an on-chain-relevant
    uint256 overflow is observable instead of being hidden by Python integers.
    """

    validate_typed_uint(premium_net, 256, operation="candidate-premium-net")
    validate_typed_uint(redistribution_bps, 16, operation="candidate-redistribution-bps")
    validate_typed_uint(min_premium_net, 256, operation="candidate-min-premium-net")
    if premium_net < min_premium_net:
        return 0
    product = checked_mul(
        premium_net,
        redistribution_bps,
        operation="candidate-pool-multiply",
    )
    candidate = checked_div(product, BPS, operation="candidate-pool-divide")
    return premium_net if candidate > premium_net else candidate


def mechanical_premium_lift_by_identity(report: ScenarioReport) -> dict[str, int]:
    """Aggregate authoritative ``BidAudit.premium_lift`` by bidder identity."""

    participants = report.baseline_result.state.participants
    contributions = {participant: 0 for participant in participants}
    for audit in report.baseline_result.bid_audit:
        if audit.bidder not in contributions:
            raise ValueError(f"bid audit contains non-participant identity: {audit.bidder}")
        contributions[audit.bidder] = checked_add(
            contributions[audit.bidder],
            audit.premium_lift,
            operation="candidate-mechanical-contribution",
        )
    return contributions


def _validated_identity_contributions(
    configured_identities: Sequence[str],
    participants: Sequence[str],
    supplied: Mapping[str, int] | None,
) -> dict[str, int]:
    if supplied is None:
        raise ValueError("identity counterfactual contributions are required for this candidate")
    configured_identity_set = set(configured_identities)
    unknown = set(supplied) - configured_identity_set
    if unknown:
        raise ValueError(
            "counterfactual contribution keys must be configured bidder identities: "
            + ", ".join(sorted(unknown))
        )
    validated = {
        identity: validate_typed_uint(
            value,
            256,
            operation="identity-counterfactual-contribution",
        )
        for identity, value in supplied.items()
    }
    return {participant: validated.get(participant, 0) for participant in participants}


def _baseline_final_scores(
    report: ScenarioReport,
    contributions: Mapping[str, int],
) -> dict[str, int]:
    """Read finalized scores or rebuild them exclusively through baseline helpers."""

    result = report.baseline_result
    winner = result.settlement.winner if result.settlement is not None else None
    reputations = {bidder.id: bidder.reputation for bidder in report.bidders}
    scores: dict[str, int] = {}
    for participant in result.state.participants:
        if participant == winner or contributions.get(participant, 0) == 0:
            scores[participant] = 0
            continue
        existing = result.scores.get(participant)
        if existing is not None:
            scores[participant] = validate_typed_uint(
                existing.final_score,
                256,
                operation="candidate-baseline-final-score",
            )
            continue
        bidder_state = result.bidders.get(participant)
        if bidder_state is None:
            raise ValueError(f"missing bidder state for participant: {participant}")
        params = result.state.params
        ef = financial_engagement(bidder_state.max_cap, result.state.highest_bid, params.ef_cap)
        et = time_engagement(
            bidder_state.first_bid_time,
            result.state.start_time,
            result.state.initial_end_time,
            params.min_exposure,
            params.et_cap,
        )
        ii = interaction_intensity(
            bidder_state.significant_overbids,
            params.max_interaction_count,
            params.ii_cap,
        )
        weighted = weighted_score(ef, et, ii, params)
        reputation = reputation_bps(reputations, participant)
        scores[participant] = final_score(weighted, reputation)
    return scores


def _validate_policy_combination(model: CandidateDefinition) -> None:
    if model.allocation_subject != AllocationSubject.BIDDER_IDENTITY:
        raise ValueError(f"unsupported allocation subject: {model.allocation_subject}")
    if model.pool_policy != PoolPolicy.NET_PREMIUM_THRESHOLD:
        raise ValueError(f"unsupported pool policy: {model.pool_policy}")
    if model.eligibility_policy != EligibilityPolicy.POSITIVE_CONTRIBUTION:
        raise ValueError(f"unsupported eligibility policy: {model.eligibility_policy}")
    if model.policy_signature not in SUPPORTED_POLICY_COMBINATIONS:
        raise ValueError(f"unsupported candidate policy combination: {model.policy_signature}")


def allocate_candidate_rewards(
    model: CandidateDefinition,
    candidate_pool: int,
    contribution_by_subject: Mapping[str, int],
    *,
    participants: Sequence[str],
    winner: str | None,
    gross_premium: int,
    per_user_reward_cap_bps: int,
    secondary_score_by_subject: Mapping[str, int] | None = None,
) -> CandidateAllocation:
    """Allocate one candidate pool using explicit identity-level inputs.

    The order is deliberate: weights are summed with checked addition, each raw
    reward multiplies before flooring division, the optional baseline cap is
    calculated once, and capped dust is never reallocated.
    """

    _validate_policy_combination(model)
    pool = validate_typed_uint(candidate_pool, 256, operation="candidate-pool")
    gross = validate_typed_uint(gross_premium, 256, operation="candidate-gross-premium")
    cap_bps = validate_typed_uint(
        per_user_reward_cap_bps,
        16,
        operation="candidate-per-user-reward-cap-bps",
    )
    ordered_participants = tuple(participants)
    if len(ordered_participants) != len(set(ordered_participants)):
        raise ValueError("candidate participants must be unique")
    participant_set = set(ordered_participants)
    if winner is not None and winner not in participant_set:
        raise ValueError("candidate winner must be a participant identity")
    unknown_contributions = set(contribution_by_subject) - participant_set
    if unknown_contributions:
        raise ValueError(
            "candidate contributions contain non-participants: "
            + ", ".join(sorted(unknown_contributions))
        )
    supplied_scores = secondary_score_by_subject or {}
    unknown_scores = set(supplied_scores) - participant_set
    if unknown_scores:
        raise ValueError(
            "candidate secondary scores contain non-participants: "
            + ", ".join(sorted(unknown_scores))
        )

    contributions = {
        participant: validate_typed_uint(
            contribution_by_subject.get(participant, 0),
            256,
            operation="candidate-contribution",
        )
        for participant in ordered_participants
    }
    secondary_scores = {
        participant: validate_typed_uint(
            supplied_scores.get(participant, 0),
            256,
            operation="candidate-secondary-score",
        )
        for participant in ordered_participants
    }
    weights: dict[str, int] = {}
    total_weight = 0
    for participant in ordered_participants:
        contribution = contributions[participant]
        if participant == winner or contribution == 0:
            weight = 0
        elif model.secondary_weight_policy == SecondaryWeightPolicy.NONE:
            weight = contribution
        elif model.secondary_weight_policy == SecondaryWeightPolicy.BASELINE_FINAL_SCORE:
            weight = secondary_scores[participant]
        else:
            raise ValueError(f"unsupported secondary weight policy: {model.secondary_weight_policy}")
        weights[participant] = weight
        total_weight = checked_add(
            total_weight,
            weight,
            operation="candidate-total-weight",
        )

    rewards = {participant: 0 for participant in ordered_participants}
    if pool == 0 or total_weight == 0:
        return CandidateAllocation(
            contributions,
            weights,
            {},
            rewards,
            tuple(),
            total_weight,
            None,
            0,
            pool,
        )

    per_user_cap: int | None = None
    if model.reward_cap_policy == RewardCapPolicy.BASELINE_PER_USER:
        cap_product = checked_mul(pool, cap_bps, operation="candidate-cap-multiply")
        per_user_cap = checked_div(cap_product, BPS, operation="candidate-cap-divide")
    elif model.reward_cap_policy != RewardCapPolicy.NONE:
        raise ValueError(f"unsupported reward cap policy: {model.reward_cap_policy}")

    raw_rewards: dict[str, int] = {}
    recipients: list[str] = []
    assigned = 0
    for participant in ordered_participants:
        weight = weights[participant]
        if weight == 0:
            continue
        product = checked_mul(pool, weight, operation="candidate-raw-reward-multiply")
        if model.allocation_policy == AllocationPolicy.NORMALIZED:
            raw = checked_div(product, total_weight, operation="candidate-normalized-reward-divide")
        elif model.allocation_policy == AllocationPolicy.GROSS_PREMIUM_DIRECT:
            raw = checked_div(product, gross, operation="candidate-direct-reward-divide")
        else:
            raise ValueError(f"unsupported allocation policy: {model.allocation_policy}")
        raw_rewards[participant] = raw
        reward = raw if per_user_cap is None else min(raw, per_user_cap)
        if reward == 0:
            continue
        rewards[participant] = reward
        recipients.append(participant)
        assigned = checked_add(assigned, reward, operation="candidate-assigned-distribution")

    unassigned = checked_sub(pool, assigned, operation="candidate-unassigned-remainder")
    return CandidateAllocation(
        contributions,
        weights,
        raw_rewards,
        rewards,
        tuple(recipients),
        total_weight,
        per_user_cap,
        assigned,
        unassigned,
    )


def _candidate_settlement(
    baseline: SettlementResult,
    start_price: int,
    pool: int,
    allocation: CandidateAllocation,
) -> CandidateSettlement:
    after_fee = checked_sub(
        baseline.final_price,
        baseline.fee_amount,
        operation="candidate-seller-after-fee",
    )
    seller_proceeds = checked_sub(
        after_fee,
        allocation.assigned,
        operation="candidate-seller-after-distribution",
    )
    seller_premium_capture = (
        0
        if baseline.winner is None
        else checked_sub(
            seller_proceeds,
            start_price,
            operation="candidate-seller-premium-capture",
        )
    )
    return CandidateSettlement(
        baseline.winner,
        baseline.final_price,
        baseline.gross_premium,
        baseline.fee_amount,
        baseline.net_premium,
        pool,
        allocation.assigned,
        allocation.unassigned_remainder,
        seller_proceeds,
        seller_premium_capture,
        baseline.nft_claimant,
    )


def _validate_scenario_report_pair(
    scenario: Scenario,
    report: ScenarioReport,
) -> None:
    metadata_matches = (
        report.metadata.scenario_schema_version == scenario.schema_version
        and report.metadata.catalog_version == scenario.catalog_version
        and report.metadata.scenario_id == scenario.id
        and report.metadata.scenario_family == scenario.family
        and report.metadata.scenario_description == scenario.description
        and report.metadata.economic_model_version == scenario.economic_model_version
    )
    scenario_definition_matches = (
        report.scenario.start_price == scenario.start_price
        and report.scenario.start_time == scenario.start_time
        and report.scenario.duration == scenario.duration
        and report.scenario.seller == scenario.seller
        and report.scenario.focal_bidder == scenario.focal_bidder
    )
    expected_bidders = tuple(
        (
            bidder.id,
            bidder.valuation,
            bidder.budget,
            bidder.max_bid_cap,
            bidder.profile,
            bidder.fixed_cap,
            scenario.reputations.get(bidder.id, DEFAULT_REPUTATION_BPS),
        )
        for bidder in scenario.bidders
    )
    reported_bidders = tuple(
        (
            bidder.id,
            bidder.valuation,
            bidder.budget,
            bidder.max_bid_cap,
            bidder.profile,
            bidder.fixed_cap,
            bidder.reputation,
        )
        for bidder in report.bidders
    )
    baseline_matches_report = (
        report.baseline_result.state.params == report.params
        and report.baseline_result.state.start_price == report.scenario.start_price
        and report.baseline_result.metadata.model_version
        == report.metadata.economic_model_version
        and set(report.baseline_result.state.participants)
        <= {bidder.id for bidder in report.bidders}
    )
    if not all(
        (
            metadata_matches,
            scenario_definition_matches,
            scenario.params == report.params,
            scenario.opportunities == report.opportunities,
            expected_bidders == reported_bidders,
            baseline_matches_report,
        )
    ):
        raise ValueError("scenario and scenario report inputs do not match")


def _candidate_invariants(
    baseline: SettlementResult,
    settlement: CandidateSettlement,
    allocation: CandidateAllocation,
) -> tuple[CandidateInvariant, ...]:
    reward_sum = 0
    for reward in allocation.rewards.values():
        reward_sum = checked_add(reward_sum, reward, operation="candidate-invariant-reward-sum")
    winner_reward = allocation.rewards.get(settlement.winner, 0) if settlement.winner is not None else 0
    preserved = (
        settlement.winner == baseline.winner
        and settlement.final_price == baseline.final_price
        and settlement.gross_premium == baseline.gross_premium
        and settlement.fee_amount == baseline.fee_amount
        and settlement.net_premium == baseline.net_premium
        and settlement.nft_claimant == baseline.nft_claimant
    )

    def invariant(name: str, condition: bool, failure: str) -> CandidateInvariant:
        return CandidateInvariant(name, condition, "" if condition else failure)

    return (
        invariant(
            "candidate pool is funded by net premium",
            settlement.candidate_pool <= settlement.net_premium,
            "candidate pool exceeds net premium",
        ),
        invariant(
            "assigned distribution does not exceed candidate pool",
            allocation.assigned <= settlement.candidate_pool,
            "assigned distribution exceeds candidate pool",
        ),
        invariant(
            "reward sum equals assigned distribution",
            reward_sum == allocation.assigned,
            "sum of candidate rewards differs from assigned distribution",
        ),
        invariant(
            "winner identity is excluded",
            winner_reward == 0,
            "winner identity received a candidate reward",
        ),
        invariant(
            "candidate settlement preserves baseline auction fields",
            preserved,
            "a baseline-authoritative settlement field changed",
        ),
        invariant(
            "candidate remainder identity",
            allocation.unassigned_remainder
            == settlement.candidate_pool - allocation.assigned,
            "candidate pool does not equal assigned plus unassigned remainder",
        ),
        invariant(
            "candidate seller proceeds identity",
            settlement.seller_proceeds
            == settlement.final_price - settlement.fee_amount - allocation.assigned,
            "seller proceeds differ from final price minus fee and assigned distribution",
        ),
    )


def evaluate_candidate(
    model: CandidateDefinition,
    scenario: Scenario,
    scenario_report: ScenarioReport,
    *,
    counterfactual_contributions: Mapping[str, int] | None = None,
    actor_context: object | None = None,
) -> CandidateEvaluation:
    """Evaluate one candidate without mutating or replaying the baseline inputs.

    ``actor_context`` is deliberately not inspected.  Candidate E always uses
    the explicit identity-level counterfactual map; actor-aware removal belongs
    to a separate analytical diagnostic in ``model_comparison``.
    """

    _ = actor_context
    _validate_policy_combination(model)
    _validate_scenario_report_pair(scenario, scenario_report)
    baseline_result = scenario_report.baseline_result
    baseline_settlement = baseline_result.settlement
    if baseline_settlement is None:
        raise ValueError("candidate evaluation requires a finalized baseline settlement")

    pool = candidate_distribution_pool(
        baseline_settlement.net_premium,
        scenario_report.params.redistribution_bps,
        scenario_report.params.min_premium_net,
    )
    mechanical = mechanical_premium_lift_by_identity(scenario_report)
    participants = baseline_result.state.participants
    if model.contribution_policy == ContributionPolicy.MECHANICAL_PREMIUM_LIFT:
        contributions = dict(mechanical)
    elif model.contribution_policy == ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY:
        contributions = _validated_identity_contributions(
            tuple(bidder.id for bidder in scenario_report.bidders),
            participants,
            counterfactual_contributions,
        )
    else:
        raise ValueError(f"unsupported contribution policy: {model.contribution_policy}")

    if model.secondary_weight_policy == SecondaryWeightPolicy.BASELINE_FINAL_SCORE:
        secondary_scores = _baseline_final_scores(scenario_report, contributions)
    elif model.secondary_weight_policy == SecondaryWeightPolicy.NONE:
        secondary_scores = {}
    else:
        raise ValueError(f"unsupported secondary weight policy: {model.secondary_weight_policy}")

    allocation = allocate_candidate_rewards(
        model,
        pool,
        contributions,
        participants=participants,
        winner=baseline_settlement.winner,
        gross_premium=baseline_settlement.gross_premium,
        per_user_reward_cap_bps=scenario_report.params.per_user_reward_cap_bps,
        secondary_score_by_subject=secondary_scores,
    )
    settlement = _candidate_settlement(
        baseline_settlement,
        scenario_report.scenario.start_price,
        pool,
        allocation,
    )
    invariants = _candidate_invariants(baseline_settlement, settlement, allocation)
    return CandidateEvaluation(
        model,
        pool,
        mechanical,
        contributions,
        secondary_scores,
        allocation,
        baseline_settlement,
        settlement,
        invariants,
    )
