"""Deterministic Lot E comparison and actor-accounting overlays.

Candidate allocation is always performed by bidder identity.  Lot D actor data
is used only after allocation: the authoritative actor accounting is retained
and the candidate reward/seller cash flows are overlaid with ``replace``.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from typing import Iterator, Mapping, Sequence

from .adversarial_metrics import (
    ActorUtilityDelta,
    BranchAccounting,
    BranchActorAccounting,
)
from .adversarial_runner import AdversarialReport
from .baseline import simulate_auction
from .candidate_models import (
    CandidateEvaluation,
    allocate_candidate_rewards,
    evaluate_candidate,
)
from .candidates import CandidateDefinition, ContributionPolicy
from .counterfactuals import CounterfactualCase
from .metrics import Rational
from .runner import ScenarioReport, serialize_report
from .scenarios import (
    BidderDefinition,
    Opportunity,
    Scenario,
    materialize_bid_trace,
)
from .types import (
    AuctionConfig,
    BidBackEconomicError,
    BidEvent,
    ParamsSnapshot,
    SimulationResult,
    serialize_result,
)
from .solidity_math import checked_add, validate_typed_uint


IDENTITY_POLICY_REPLAY = "identity-level-policy-rematerialization"
FIXED_ACTION_DELETION = "identity-level-fixed-action-deletion"
ACTOR_POLICY_REPLAY = "actor-aware-policy-rematerialization-diagnostic"
IDENTITY_IMPOSSIBILITY_CAVEAT = (
    "Wallet ownership cannot be inferred on-chain without an external identity, "
    "cost, or reputation assumption; actor mappings are analytical inputs only."
)


class ModelComparisonError(ValueError):
    """A comparison cannot be completed without changing its declared semantics."""

    def __init__(self, code: str, **context: object) -> None:
        self.code = code
        self.context = context
        detail = code if not context else f"{code}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class CounterfactualDiagnostic:
    convention: str
    subject_kind: str
    subject_id: str
    removed_identities: tuple[str, ...]
    status: str
    observed_final_price: int
    counterfactual_final_price: int | None
    signed_contribution: int | None
    eligible_contribution: int | None
    changed_dimensions: tuple[str, ...]
    error_code: str | None


@dataclass(frozen=True, slots=True)
class IdentityCounterfactualAnalysis:
    contribution_by_identity: Mapping[str, int]
    policy_replay: tuple[CounterfactualDiagnostic, ...]
    fixed_action_deletion: tuple[CounterfactualDiagnostic, ...]


@dataclass(frozen=True, slots=True)
class CandidateSubjectMetrics:
    subject_id: str
    contribution: int
    mechanical_contribution: int
    reward: int
    participated: bool
    winner: bool


@dataclass(frozen=True, slots=True)
class CandidateNormalMetrics:
    final_price: int
    gross_premium: int
    net_premium: int
    fee_amount: int
    candidate_pool: int
    assigned_distribution: int
    unassigned_remainder: int
    seller_proceeds: int
    seller_premium_capture: int
    rewarded_loser_count: int
    redistribution_share: Rational | None
    pool_utilization: Rational | None
    max_reward_share: Rational | None
    redistribution_usefulness: bool
    subject_metrics: tuple[CandidateSubjectMetrics, ...]
    winner_matches_baseline: bool
    final_price_matches_baseline: bool
    gross_premium_matches_baseline: bool
    net_premium_matches_baseline: bool
    fee_matches_baseline: bool
    nft_claimant_matches_baseline: bool
    allocative_efficiency_matches_baseline: bool


@dataclass(frozen=True, slots=True)
class CandidatePropertyResult:
    property_id: str
    status: str
    detail: str


@dataclass(frozen=True, slots=True)
class IdentityPartitionEvaluation:
    model_id: str
    candidate_pool: int
    aggregate_contribution: int
    aggregate_weight: int
    unsplit_reward: int
    split_reward: int
    identity_splitting_gain_reward: int
    contribution_matched: bool
    weight_matched: bool
    property: CandidatePropertyResult


@dataclass(frozen=True, slots=True)
class ScenarioCandidateComparison:
    model_id: str
    allocation_semantics: str
    actor_context_used_for_allocation: bool
    evaluation: CandidateEvaluation
    metrics: CandidateNormalMetrics
    identity_counterfactuals: IdentityCounterfactualAnalysis | None
    properties: tuple[CandidatePropertyResult, ...]
    scenario_unchanged: bool
    scenario_report_unchanged: bool
    simulation_result_unchanged: bool


@dataclass(frozen=True, slots=True)
class CandidateBranchOverlay:
    authoritative: BranchAccounting
    candidate: BranchAccounting
    baseline_candidate_pool: int
    candidate_pool: int
    baseline_assigned_distribution: int
    candidate_assigned_distribution: int
    baseline_unassigned_remainder: int
    candidate_unassigned_remainder: int
    baseline_seller_proceeds: int
    candidate_seller_proceeds: int
    candidate_minus_baseline_assigned_distribution: int
    candidate_minus_baseline_unassigned_remainder: int
    candidate_minus_baseline_seller_proceeds: int
    candidate_minus_baseline_coalition_reward: int
    candidate_minus_baseline_coalition_utility: int
    wallet_max_reward_share: Rational | None
    actor_max_reward_share: Rational | None
    winner_actor_indirect_reward: int


@dataclass(frozen=True, slots=True)
class CandidateAdversarialDeltas:
    actor_utilities: tuple[ActorUtilityDelta, ...]
    delta_coalition_utility: int
    delta_coalition_reward: int
    delta_coalition_cash_flow: int
    delta_coalition_non_reward_cash_flow: int
    delta_seller_proceeds: int
    delta_assigned_distribution: int
    delta_unassigned_remainder: int
    delta_candidate_pool: int
    delta_coalition_mechanical_contribution: int
    delta_coalition_candidate_contribution: int
    reference_locked_capital: int
    attack_locked_capital: int
    delta_locked_capital: int
    reference_capital_time_exposure_wei_seconds: int
    attack_capital_time_exposure_wei_seconds: int
    delta_capital_time_exposure_wei_seconds: int
    candidate_pool_unlock_gain: int
    candidate_assigned_unlock_gain: int
    deliberate_losing_gain: int | None
    interaction_farming_gain: int | None
    reference_winner_actor_indirect_reward: int
    attack_winner_actor_indirect_reward: int
    delta_winner_actor_indirect_reward: int


@dataclass(frozen=True, slots=True)
class IdentitySplittingMetrics:
    reference_identity_count: int
    attack_identity_count: int
    reference_coalition_reward: int
    attack_coalition_reward: int
    identity_splitting_gain_reward: int
    reference_coalition_utility: int
    attack_coalition_utility: int
    identity_splitting_gain_utility: int
    reference_coalition_contribution: int
    attack_coalition_contribution: int
    reference_coalition_weight: int
    attack_coalition_weight: int
    reference_coalition_mechanical_contribution: int
    attack_coalition_mechanical_contribution: int
    locked_capital_matched: bool
    contribution_matched: bool
    candidate_contribution_matched: bool
    mechanical_contribution_matched: bool
    weight_matched: bool
    candidate_pool_matched: bool
    final_price_matched: bool
    gross_premium_matched: bool
    net_premium_matched: bool
    fee_matched: bool
    external_bidders_matched: bool
    terminal_nft_owner_matched: bool
    comparable: bool
    status: str


@dataclass(frozen=True, slots=True)
class AdversarialCandidateComparison:
    model_id: str
    actor_aware_counterfactual_is_diagnostic_only: bool
    impossibility_caveat: str
    reference: ScenarioCandidateComparison
    attack: ScenarioCandidateComparison
    reference_overlay: CandidateBranchOverlay
    attack_overlay: CandidateBranchOverlay
    deltas: CandidateAdversarialDeltas
    identity_splitting: IdentitySplittingMetrics
    reference_actor_aware_counterfactuals: tuple[CounterfactualDiagnostic, ...]
    attack_actor_aware_counterfactuals: tuple[CounterfactualDiagnostic, ...]
    properties: tuple[CandidatePropertyResult, ...]
    adversarial_report_unchanged: bool


def _snapshot_scenario(scenario: Scenario) -> str:
    return json.dumps(
        asdict(scenario),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


@contextmanager
def _source_guard(
    scenario: Scenario,
    report: ScenarioReport,
) -> Iterator[dict[str, bool]]:
    before_scenario = _snapshot_scenario(scenario)
    before_report = serialize_report(report)
    before_result = serialize_result(report.baseline_result)
    status = {
        "scenario": True,
        "report": True,
        "result": True,
    }
    try:
        yield status
    finally:
        status["scenario"] = _snapshot_scenario(scenario) == before_scenario
        status["report"] = serialize_report(report) == before_report
        status["result"] = serialize_result(report.baseline_result) == before_result
        changed = tuple(name for name, unchanged in status.items() if not unchanged)
        if changed:
            raise ModelComparisonError("SOURCE_MUTATION_DETECTED", sources=changed)


def _clone_params(params: ParamsSnapshot) -> ParamsSnapshot:
    return ParamsSnapshot(
        bidback_fee_bps=params.bidback_fee_bps,
        redistribution_bps=params.redistribution_bps,
        min_participants=params.min_participants,
        alpha_bps=params.alpha_bps,
        beta_bps=params.beta_bps,
        gamma_bps=params.gamma_bps,
        min_bid_increment_bps=params.min_bid_increment_bps,
        per_user_reward_cap_bps=params.per_user_reward_cap_bps,
        max_participants=params.max_participants,
        max_interaction_count=params.max_interaction_count,
        min_auction_duration=params.min_auction_duration,
        anti_snipe_window=params.anti_snipe_window,
        anti_snipe_extension=params.anti_snipe_extension,
        max_anti_snipe_extensions=params.max_anti_snipe_extensions,
        min_exposure=params.min_exposure,
        min_premium_net=params.min_premium_net,
        ef_cap=params.ef_cap,
        et_cap=params.et_cap,
        ii_cap=params.ii_cap,
    )


def _clone_bidder(bidder: BidderDefinition) -> BidderDefinition:
    return BidderDefinition(
        id=bidder.id,
        valuation=bidder.valuation,
        budget=bidder.budget,
        profile=bidder.profile,
        fixed_cap=bidder.fixed_cap,
    )


def _clone_opportunity(opportunity: Opportunity) -> Opportunity:
    return Opportunity(
        offset_seconds=opportunity.offset_seconds,
        bidder=opportunity.bidder,
    )


def _clone_bid_event(event: BidEvent) -> BidEvent:
    return BidEvent(
        bidder=event.bidder,
        new_cap=event.new_cap,
        deposit=event.deposit,
        timestamp=event.timestamp,
    )


def clone_scenario_without_identities(
    scenario: Scenario,
    removed_identities: Sequence[str],
) -> Scenario:
    """Build an independent policy-rematerialization input."""

    removed = frozenset(removed_identities)
    return Scenario(
        schema_version=scenario.schema_version,
        catalog_version=scenario.catalog_version,
        economic_model_version=scenario.economic_model_version,
        id=scenario.id,
        family=scenario.family,
        description=scenario.description,
        start_price=scenario.start_price,
        start_time=scenario.start_time,
        duration=scenario.duration,
        seller=scenario.seller,
        params=_clone_params(scenario.params),
        bidders=tuple(
            _clone_bidder(bidder)
            for bidder in scenario.bidders
            if bidder.id not in removed
        ),
        reputations={
            identity: value
            for identity, value in sorted(scenario.reputations.items())
            if identity not in removed
        },
        opportunities=tuple(
            _clone_opportunity(opportunity)
            for opportunity in scenario.opportunities
            if opportunity.bidder not in removed
        ),
        focal_bidder=(
            None if scenario.focal_bidder in removed else scenario.focal_bidder
        ),
    )


def clone_bid_trace_without_identities(
    bid_trace: Sequence[BidEvent],
    removed_identities: Sequence[str],
) -> tuple[BidEvent, ...]:
    """Build an independent fixed-action deletion input."""

    removed = frozenset(removed_identities)
    return tuple(
        _clone_bid_event(event)
        for event in bid_trace
        if event.bidder not in removed
    )


def _auction_config(
    scenario: Scenario,
    *,
    finalization_time: int | None,
    source_commit: str | None,
) -> AuctionConfig:
    return AuctionConfig(
        start_price=scenario.start_price,
        start_time=scenario.start_time,
        duration=scenario.duration,
        params=_clone_params(scenario.params),
        finalization_time=finalization_time,
        source_commit=source_commit,
        seller=scenario.seller,
    )


def _finalized_replay(
    scenario: Scenario,
    bid_trace: Sequence[BidEvent],
    *,
    source_commit: str | None,
) -> SimulationResult:
    first_trace = tuple(_clone_bid_event(event) for event in bid_trace)
    prefix = simulate_auction(
        _auction_config(
            scenario,
            finalization_time=None,
            source_commit=source_commit,
        ),
        first_trace,
        dict(scenario.reputations),
    )
    finalized_trace = tuple(_clone_bid_event(event) for event in bid_trace)
    return simulate_auction(
        _auction_config(
            scenario,
            finalization_time=prefix.state.end_time,
            source_commit=source_commit,
        ),
        finalized_trace,
        dict(scenario.reputations),
    )


def _final_price(result: SimulationResult) -> int:
    if result.settlement is None:
        raise ModelComparisonError("COUNTERFACTUAL_NOT_FINALIZED")
    return result.settlement.final_price


def _diagnostic_error_code(exc: BaseException) -> str:
    code = getattr(exc, "code", None)
    return str(code) if code is not None else type(exc).__name__


def _policy_replay_diagnostic(
    scenario: Scenario,
    report: ScenarioReport,
    *,
    subject_kind: str,
    subject_id: str,
    removed_identities: Sequence[str],
    convention: str,
) -> CounterfactualDiagnostic:
    baseline = report.baseline_result.settlement
    if baseline is None:
        raise ModelComparisonError("UNFINALIZED_SCENARIO_REPORT", scenario_id=scenario.id)
    removed = tuple(sorted(frozenset(removed_identities)))
    counterfactual = clone_scenario_without_identities(scenario, removed)
    materialized = materialize_bid_trace(
        counterfactual,
        source_commit=report.metadata.source_commit,
    )
    result = _finalized_replay(
        counterfactual,
        tuple(_clone_bid_event(event) for event in materialized.bid_trace),
        source_commit=report.metadata.source_commit,
    )
    price = _final_price(result)
    signed = baseline.final_price - price
    changed_dimensions = ["scenario.bidders"]
    if any(identity in scenario.reputations for identity in removed):
        changed_dimensions.append("scenario.reputations")
    if any(
        opportunity.bidder in removed for opportunity in scenario.opportunities
    ):
        changed_dimensions.append("scenario.opportunities")
    if scenario.focal_bidder in removed:
        changed_dimensions.append("scenario.focalBidder")
    if materialized.bid_trace != report.generated_bid_trace:
        changed_dimensions.append("generatedBidTrace")
    return CounterfactualDiagnostic(
        convention=convention,
        subject_kind=subject_kind,
        subject_id=subject_id,
        removed_identities=removed,
        status="valid",
        observed_final_price=baseline.final_price,
        counterfactual_final_price=price,
        signed_contribution=signed,
        eligible_contribution=max(signed, 0),
        changed_dimensions=tuple(changed_dimensions),
        error_code=None,
    )


def _fixed_action_deletion_diagnostic(
    scenario: Scenario,
    report: ScenarioReport,
    *,
    subject_id: str,
    removed_identities: Sequence[str],
) -> CounterfactualDiagnostic:
    baseline = report.baseline_result.settlement
    if baseline is None:
        raise ModelComparisonError("UNFINALIZED_SCENARIO_REPORT", scenario_id=scenario.id)
    removed = tuple(sorted(frozenset(removed_identities)))
    trace = clone_bid_trace_without_identities(report.generated_bid_trace, removed)
    changed_dimensions = (
        ("generatedBidTrace",)
        if trace != report.generated_bid_trace
        else ()
    )
    try:
        result = _finalized_replay(
            clone_scenario_without_identities(scenario, ()),
            trace,
            source_commit=report.metadata.source_commit,
        )
    except BidBackEconomicError as exc:
        return CounterfactualDiagnostic(
            convention=FIXED_ACTION_DELETION,
            subject_kind="identity",
            subject_id=subject_id,
            removed_identities=removed,
            status="error",
            observed_final_price=baseline.final_price,
            counterfactual_final_price=None,
            signed_contribution=None,
            eligible_contribution=None,
            changed_dimensions=changed_dimensions,
            error_code=_diagnostic_error_code(exc),
        )
    price = _final_price(result)
    signed = baseline.final_price - price
    return CounterfactualDiagnostic(
        convention=FIXED_ACTION_DELETION,
        subject_kind="identity",
        subject_id=subject_id,
        removed_identities=removed,
        status="valid",
        observed_final_price=baseline.final_price,
        counterfactual_final_price=price,
        signed_contribution=signed,
        eligible_contribution=max(signed, 0),
        changed_dimensions=changed_dimensions,
        error_code=None,
    )


def compute_identity_counterfactuals(
    scenario: Scenario,
    report: ScenarioReport,
) -> IdentityCounterfactualAnalysis:
    """Compute Candidate E inputs by identity and a separate deletion diagnostic."""

    with _source_guard(scenario, report):
        policy: list[CounterfactualDiagnostic] = []
        deletion: list[CounterfactualDiagnostic] = []
        contributions: dict[str, int] = {}
        for identity in sorted(bidder.id for bidder in scenario.bidders):
            policy_item = _policy_replay_diagnostic(
                scenario,
                report,
                subject_kind="identity",
                subject_id=identity,
                removed_identities=(identity,),
                convention=IDENTITY_POLICY_REPLAY,
            )
            if policy_item.eligible_contribution is None:
                raise ModelComparisonError(
                    "IDENTITY_POLICY_REPLAY_FAILED",
                    scenario_id=scenario.id,
                    identity=identity,
                )
            policy.append(policy_item)
            contributions[identity] = policy_item.eligible_contribution
            deletion.append(
                _fixed_action_deletion_diagnostic(
                    scenario,
                    report,
                    subject_id=identity,
                    removed_identities=(identity,),
                )
            )
        return IdentityCounterfactualAnalysis(
            contribution_by_identity=dict(sorted(contributions.items())),
            policy_replay=tuple(policy),
            fixed_action_deletion=tuple(deletion),
        )


def compute_actor_aware_counterfactuals(
    scenario: Scenario,
    report: ScenarioReport,
    identity_ownership: Mapping[str, str],
) -> tuple[CounterfactualDiagnostic, ...]:
    """Return actor-removal diagnostics that never feed Candidate E allocation."""

    with _source_guard(scenario, report):
        configured = {bidder.id for bidder in scenario.bidders}
        unknown = configured - set(identity_ownership)
        if unknown:
            raise ModelComparisonError(
                "ACTOR_CONTEXT_MISSING_IDENTITIES",
                identities=tuple(sorted(unknown)),
            )
        actor_identities: dict[str, list[str]] = {}
        for identity in sorted(configured):
            actor_identities.setdefault(identity_ownership[identity], []).append(identity)
        return tuple(
            _policy_replay_diagnostic(
                scenario,
                report,
                subject_kind="economic-actor",
                subject_id=actor_id,
                removed_identities=tuple(identities),
                convention=ACTOR_POLICY_REPLAY,
            )
            for actor_id, identities in sorted(actor_identities.items())
        )


def _ratio(numerator: int, denominator: int) -> Rational | None:
    return Rational(numerator, denominator) if denominator > 0 else None


def _normal_metrics(
    scenario: Scenario,
    report: ScenarioReport,
    evaluation: CandidateEvaluation,
) -> CandidateNormalMetrics:
    baseline = evaluation.baseline_settlement
    candidate = evaluation.settlement
    participant_set = set(report.baseline_result.state.participants)
    rewards = evaluation.allocation.rewards
    subjects = tuple(
        CandidateSubjectMetrics(
            subject_id=bidder.id,
            contribution=evaluation.contribution_by_subject.get(bidder.id, 0),
            mechanical_contribution=(
                evaluation.mechanical_contribution_by_subject.get(bidder.id, 0)
            ),
            reward=rewards.get(bidder.id, 0),
            participated=bidder.id in participant_set,
            winner=bidder.id == candidate.winner,
        )
        for bidder in sorted(scenario.bidders, key=lambda item: item.id)
    )
    rewarded_losers = sum(item.reward > 0 and not item.winner for item in subjects)
    max_reward = max((item.reward for item in subjects), default=0)
    return CandidateNormalMetrics(
        final_price=candidate.final_price,
        gross_premium=candidate.gross_premium,
        net_premium=candidate.net_premium,
        fee_amount=candidate.fee_amount,
        candidate_pool=candidate.candidate_pool,
        assigned_distribution=candidate.assigned_distribution,
        unassigned_remainder=candidate.unassigned_remainder,
        seller_proceeds=candidate.seller_proceeds,
        seller_premium_capture=candidate.seller_premium_capture,
        rewarded_loser_count=rewarded_losers,
        redistribution_share=_ratio(
            candidate.assigned_distribution,
            candidate.gross_premium,
        ),
        pool_utilization=_ratio(
            candidate.assigned_distribution,
            candidate.candidate_pool,
        ),
        max_reward_share=_ratio(max_reward, candidate.assigned_distribution),
        redistribution_usefulness=(
            candidate.assigned_distribution > 0 and rewarded_losers > 0
        ),
        subject_metrics=subjects,
        winner_matches_baseline=candidate.winner == baseline.winner,
        final_price_matches_baseline=candidate.final_price == baseline.final_price,
        gross_premium_matches_baseline=(
            candidate.gross_premium == baseline.gross_premium
        ),
        net_premium_matches_baseline=candidate.net_premium == baseline.net_premium,
        fee_matches_baseline=candidate.fee_amount == baseline.fee_amount,
        nft_claimant_matches_baseline=candidate.nft_claimant == baseline.nft_claimant,
        allocative_efficiency_matches_baseline=(
            candidate.winner == baseline.winner
            and candidate.nft_claimant == baseline.nft_claimant
        ),
    )


def _property(
    property_id: str,
    passed: bool,
    failure_detail: str,
) -> CandidatePropertyResult:
    return CandidatePropertyResult(
        property_id,
        "pass" if passed else "fail",
        "" if passed else failure_detail,
    )


def _not_applicable(property_id: str, detail: str) -> CandidatePropertyResult:
    return CandidatePropertyResult(property_id, "non-applicable", detail)


def _non_comparable(property_id: str, detail: str) -> CandidatePropertyResult:
    return CandidatePropertyResult(property_id, "non-comparable", detail)


def evaluate_identity_partition(
    model: CandidateDefinition,
    *,
    candidate_pool: int,
    gross_premium: int,
    unsplit_contribution: int,
    split_contributions: Sequence[int],
    per_user_reward_cap_bps: int,
    unsplit_secondary_weight: int | None = None,
    split_secondary_weights: Sequence[int] | None = None,
) -> IdentityPartitionEvaluation:
    """Evaluate the pure P2b diagnostic under matched aggregate inputs.

    The pool, aggregate contribution, aggregate allocation weight, gross
    premium, winner endpoint, and all external inputs are held constant; only
    the partition of the coalition input across bidder identities changes.  A
    failing result is an observed candidate property, not a runner failure.
    """

    pool = validate_typed_uint(
        candidate_pool,
        256,
        operation="identity-partition-candidate-pool",
    )
    gross = validate_typed_uint(
        gross_premium,
        256,
        operation="identity-partition-gross-premium",
    )
    unsplit_value = validate_typed_uint(
        unsplit_contribution,
        256,
        operation="identity-partition-unsplit-contribution",
    )
    cap_bps = validate_typed_uint(
        per_user_reward_cap_bps,
        16,
        operation="identity-partition-per-user-cap-bps",
    )
    split_values = tuple(
        validate_typed_uint(
            value,
            256,
            operation="identity-partition-split-contribution",
        )
        for value in split_contributions
    )
    if len(split_values) < 2:
        raise ModelComparisonError("IDENTITY_PARTITION_REQUIRES_SPLIT")
    split_contribution_total = 0
    for value in split_values:
        split_contribution_total = checked_add(
            split_contribution_total,
            value,
            operation="identity-partition-contribution-sum",
        )
    if split_contribution_total != unsplit_value:
        raise ModelComparisonError(
            "IDENTITY_PARTITION_CONTRIBUTION_UNMATCHED",
            unsplit=unsplit_value,
            split=split_contribution_total,
        )
    unsplit_weight = (
        unsplit_value
        if unsplit_secondary_weight is None
        else validate_typed_uint(
            unsplit_secondary_weight,
            256,
            operation="identity-partition-unsplit-weight",
        )
    )
    split_weights = (
        split_values
        if split_secondary_weights is None
        else tuple(
            validate_typed_uint(
                value,
                256,
                operation="identity-partition-split-weight",
            )
            for value in split_secondary_weights
        )
    )
    if len(split_weights) != len(split_values):
        raise ModelComparisonError("IDENTITY_PARTITION_WEIGHT_LENGTH_MISMATCH")
    split_weight_total = 0
    for weight in split_weights:
        split_weight_total = checked_add(
            split_weight_total,
            weight,
            operation="identity-partition-weight-sum",
        )
    if split_weight_total != unsplit_weight:
        raise ModelComparisonError(
            "IDENTITY_PARTITION_WEIGHT_UNMATCHED",
            unsplit=unsplit_weight,
            split=split_weight_total,
        )

    winner = "EXTERNAL_WINNER"
    unsplit_identity = "COALITION_UNSPLIT"
    split_identities = tuple(
        f"COALITION_SPLIT_{index}" for index in range(len(split_values))
    )
    unsplit = allocate_candidate_rewards(
        model,
        pool,
        {unsplit_identity: unsplit_value, winner: 0},
        participants=(unsplit_identity, winner),
        winner=winner,
        gross_premium=gross,
        per_user_reward_cap_bps=cap_bps,
        secondary_score_by_subject={
            unsplit_identity: unsplit_weight,
            winner: 0,
        },
    )
    split = allocate_candidate_rewards(
        model,
        pool,
        {
            **dict(zip(split_identities, split_values, strict=True)),
            winner: 0,
        },
        participants=(*split_identities, winner),
        winner=winner,
        gross_premium=gross,
        per_user_reward_cap_bps=cap_bps,
        secondary_score_by_subject={
            **dict(zip(split_identities, split_weights, strict=True)),
            winner: 0,
        },
    )
    unsplit_reward = validate_typed_uint(
        unsplit.rewards[unsplit_identity],
        256,
        operation="identity-partition-unsplit-reward",
    )
    split_reward = 0
    for identity in split_identities:
        split_reward = checked_add(
            split_reward,
            split.rewards[identity],
            operation="identity-partition-reward-sum",
        )
    unsplit_actual_weight = validate_typed_uint(
        unsplit.weight_by_subject[unsplit_identity],
        256,
        operation="identity-partition-unsplit-actual-weight",
    )
    split_actual_weight = 0
    for identity in split_identities:
        split_actual_weight = checked_add(
            split_actual_weight,
            split.weight_by_subject[identity],
            operation="identity-partition-actual-weight-sum",
        )
    allocated_split_contribution_total = 0
    for identity in split_identities:
        allocated_split_contribution_total = checked_add(
            allocated_split_contribution_total,
            split.contribution_by_subject[identity],
            operation="identity-partition-allocated-contribution-sum",
        )
    contribution_matched = (
        unsplit.contribution_by_subject[unsplit_identity]
        == allocated_split_contribution_total
    )
    weight_matched = unsplit_actual_weight == split_actual_weight
    passed = contribution_matched and weight_matched and split_reward <= unsplit_reward
    return IdentityPartitionEvaluation(
        model_id=model.id,
        candidate_pool=pool,
        aggregate_contribution=unsplit_value,
        aggregate_weight=unsplit_actual_weight,
        unsplit_reward=unsplit_reward,
        split_reward=split_reward,
        identity_splitting_gain_reward=split_reward - unsplit_reward,
        contribution_matched=contribution_matched,
        weight_matched=weight_matched,
        property=_property(
            "P2b",
            passed,
            "matched aggregate contribution/weight gained reward after identity splitting",
        ),
    )


def _counterfactual_diagnostic_complete(
    item: CounterfactualDiagnostic,
    *,
    allowed_conventions: frozenset[str],
) -> bool:
    if (
        item.convention not in allowed_conventions
        or item.status not in {"valid", "error"}
        or not isinstance(item.changed_dimensions, tuple)
        or not item.removed_identities
    ):
        return False
    if item.status == "valid":
        return (
            item.error_code is None
            and item.counterfactual_final_price is not None
            and item.signed_contribution is not None
            and item.eligible_contribution is not None
        )
    return (
        item.error_code is not None
        and item.counterfactual_final_price is None
        and item.signed_contribution is None
        and item.eligible_contribution is None
    )


def _normal_properties(
    scenario: Scenario,
    scenario_report: ScenarioReport,
    evaluation: CandidateEvaluation,
    *,
    identity_analysis: IdentityCounterfactualAnalysis | None,
    identifier_independent: bool,
    sources_unchanged: bool,
) -> tuple[CandidatePropertyResult, ...]:
    settlement = evaluation.settlement
    rewards = evaluation.allocation.rewards
    uint_values = (
        settlement.candidate_pool,
        settlement.assigned_distribution,
        settlement.unassigned_remainder,
        settlement.seller_proceeds,
        *rewards.values(),
    )
    no_reward_below_threshold = (
        (
            settlement.candidate_pool == 0
            and settlement.assigned_distribution == 0
            and all(reward == 0 for reward in rewards.values())
        )
        if (
            settlement.gross_premium == 0
            or settlement.net_premium < scenario.params.min_premium_net
        )
        else True
    )
    meaningful_losers = tuple(
        identity
        for identity, contribution in (
            evaluation.mechanical_contribution_by_subject.items()
        )
        if identity != settlement.winner and contribution > 0
    )
    if settlement.candidate_pool == 0 or not meaningful_losers:
        p5 = _not_applicable(
            "P5",
            "scenario has no funded pool with a mechanically contributing loser",
        )
    else:
        p5 = _property(
            "P5",
            any(rewards.get(identity, 0) > 0 for identity in meaningful_losers),
            "no mechanically contributing loser received a positive reward",
        )

    if identity_analysis is None:
        p15 = _not_applicable(
            "P15",
            "candidate does not use a counterfactual contribution policy",
        )
    else:
        diagnostics = (
            *identity_analysis.policy_replay,
            *identity_analysis.fixed_action_deletion,
        )
        p15 = _property(
            "P15",
            bool(diagnostics)
            and all(
                _counterfactual_diagnostic_complete(
                    item,
                    allowed_conventions=frozenset(
                        {IDENTITY_POLICY_REPLAY, FIXED_ACTION_DELETION}
                    ),
                )
                for item in diagnostics
            ),
            "a counterfactual omits its convention, validity, or changed dimensions",
        )
    return (
        p5,
        _property(
            "P6",
            settlement.assigned_distribution
            <= settlement.candidate_pool
            <= settlement.net_premium,
            "assigned <= pool <= net premium does not hold",
        ),
        _property(
            "P7",
            settlement.winner is None or rewards.get(settlement.winner, 0) == 0,
            "winner identity received a candidate reward",
        ),
        _property(
            "P8",
            all(type(value) is int and value >= 0 for value in uint_values),
            "a candidate uint output is non-integer or negative",
        ),
        _property(
            "P9",
            settlement.seller_proceeds >= 0
            and settlement.final_price == evaluation.baseline_settlement.final_price,
            "seller proceeds are negative or final price changed",
        ),
        _property(
            "P10",
            settlement.winner == evaluation.baseline_settlement.winner
            and settlement.final_price
            == evaluation.baseline_settlement.final_price
            and settlement.gross_premium
            == evaluation.baseline_settlement.gross_premium
            and settlement.fee_amount == evaluation.baseline_settlement.fee_amount
            and settlement.net_premium == evaluation.baseline_settlement.net_premium
            and settlement.nft_claimant == evaluation.baseline_settlement.nft_claimant
            and evaluation.baseline_settlement
            is scenario_report.baseline_result.settlement
            and sources_unchanged,
            "a baseline-authoritative settlement field changed",
        ),
        _property("P11", sources_unchanged, "a source input was mutated"),
        _property(
            "P12",
            identifier_independent,
            "candidate comparison dispatched on a scenario or case identifier",
        ),
        _property(
            "P14",
            no_reward_below_threshold,
            "candidate pool is non-zero without an eligible net premium",
        ),
        p15,
    )


def _identifier_independence_probe(
    model: CandidateDefinition,
    scenario: Scenario,
    scenario_report: ScenarioReport,
    evaluation: CandidateEvaluation,
    identity_analysis: IdentityCounterfactualAnalysis | None,
) -> bool:
    probe_id = (
        "__lot_e_policy_dispatch_probe__"
        if scenario.id != "__lot_e_policy_dispatch_probe__"
        else "__lot_e_policy_dispatch_probe_alternate__"
    )
    probe_scenario = replace(scenario, id=probe_id)
    probe_report = replace(
        scenario_report,
        metadata=replace(scenario_report.metadata, scenario_id=probe_id),
    )
    try:
        probe_analysis = None
        counterfactual_contributions = None
        if identity_analysis is not None:
            probe_analysis = compute_identity_counterfactuals(
                probe_scenario,
                probe_report,
            )
            counterfactual_contributions = probe_analysis.contribution_by_identity
        probe_evaluation = evaluate_candidate(
            model,
            probe_scenario,
            probe_report,
            counterfactual_contributions=counterfactual_contributions,
            actor_context=None,
        )
    except (BidBackEconomicError, ValueError):
        return False
    return probe_evaluation == evaluation and probe_analysis == identity_analysis


def evaluate_scenario_candidate(
    model: CandidateDefinition,
    scenario: Scenario,
    scenario_report: ScenarioReport,
    *,
    actor_context: object | None = None,
) -> ScenarioCandidateComparison:
    """Compare one model with one completed baseline scenario.

    ``actor_context`` is accepted for a stable public interface but cannot alter
    the allocation.  Actor-aware counterfactuals are exposed only by the paired
    Lot D comparison functions below.
    """

    _ = actor_context
    status: dict[str, bool]
    with _source_guard(scenario, scenario_report) as status:
        identity_analysis = None
        counterfactual_contributions = None
        if (
            model.contribution_policy
            == ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY
        ):
            identity_analysis = compute_identity_counterfactuals(
                scenario,
                scenario_report,
            )
            counterfactual_contributions = identity_analysis.contribution_by_identity
        evaluation = evaluate_candidate(
            model,
            scenario,
            scenario_report,
            counterfactual_contributions=counterfactual_contributions,
            actor_context=None,
        )
        metrics = _normal_metrics(scenario, scenario_report, evaluation)
        identifier_independent = _identifier_independence_probe(
            model,
            scenario,
            scenario_report,
            evaluation,
            identity_analysis,
        )
    sources_unchanged = all(status.values())
    return ScenarioCandidateComparison(
        model_id=model.id,
        allocation_semantics=model.allocation_subject.value,
        actor_context_used_for_allocation=False,
        evaluation=evaluation,
        metrics=metrics,
        identity_counterfactuals=identity_analysis,
        properties=_normal_properties(
            scenario,
            scenario_report,
            evaluation,
            identity_analysis=identity_analysis,
            identifier_independent=identifier_independent,
            sources_unchanged=sources_unchanged,
        ),
        scenario_unchanged=status["scenario"],
        scenario_report_unchanged=status["report"],
        simulation_result_unchanged=status["result"],
    )


def compare_scenario_candidates(
    models: Sequence[CandidateDefinition],
    scenario: Scenario,
    scenario_report: ScenarioReport,
    *,
    actor_context: object | None = None,
) -> tuple[ScenarioCandidateComparison, ...]:
    return tuple(
        evaluate_scenario_candidate(
            model,
            scenario,
            scenario_report,
            actor_context=actor_context,
        )
        for model in sorted(models, key=lambda item: item.id)
    )


def _actor_lookup(branch: BranchAccounting) -> dict[str, BranchActorAccounting]:
    return {actor.actor_id: actor for actor in branch.actors}


def _candidate_rewards(comparison: ScenarioCandidateComparison) -> dict[str, int]:
    return dict(comparison.evaluation.allocation.rewards)


def overlay_branch_accounting(
    case: CounterfactualCase,
    report: ScenarioReport,
    authoritative: BranchAccounting,
    comparison: ScenarioCandidateComparison,
) -> CandidateBranchOverlay:
    """Apply only candidate reward and seller cash flows to Lot D accounting."""

    rewards = _candidate_rewards(comparison)
    candidate_seller_proceeds = comparison.evaluation.settlement.seller_proceeds
    baseline_seller_proceeds = report.metrics.seller_protocol.seller_revenue
    ownership = dict(case.identity_ownership)
    unknown_rewards = set(rewards) - set(ownership)
    if unknown_rewards:
        raise ModelComparisonError(
            "CANDIDATE_REWARD_IDENTITY_NOT_OWNED",
            identities=tuple(sorted(unknown_rewards)),
        )

    overlaid_actors: list[BranchActorAccounting] = []
    for actor in authoritative.actors:
        candidate_actor_reward = sum(
            rewards.get(identity, 0) for identity in actor.bidder_identities
        )
        reward_delta = candidate_actor_reward - actor.rewards
        candidate_actor_seller = (
            candidate_seller_proceeds
            if actor.actor_id == case.seller_actor_id
            else actor.seller_cash_flow
        )
        seller_delta = candidate_actor_seller - actor.seller_cash_flow
        cash_delta = reward_delta + seller_delta
        overlaid_actors.append(
            replace(
                actor,
                bidder_cash_flow=actor.bidder_cash_flow + reward_delta,
                seller_cash_flow=candidate_actor_seller,
                actor_cash_flow=actor.actor_cash_flow + cash_delta,
                rewards=candidate_actor_reward,
                seller_proceeds=candidate_actor_seller,
                actor_economic_change=actor.actor_economic_change + cash_delta,
            )
        )

    actor_tuple = tuple(overlaid_actors)
    actor_by_id = {actor.actor_id: actor for actor in actor_tuple}
    coalition_members = tuple(
        actor_by_id[actor_id] for actor_id in authoritative.coalition.actor_ids
    )
    coalition_reward = sum(actor.rewards for actor in coalition_members)
    coalition_cash_flow = sum(actor.actor_cash_flow for actor in coalition_members)
    coalition = replace(
        authoritative.coalition,
        coalition_economic_change=sum(
            actor.actor_economic_change for actor in coalition_members
        ),
        coalition_cash_flow=coalition_cash_flow,
        coalition_non_reward_cash_flow=coalition_cash_flow - coalition_reward,
        coalition_reward=coalition_reward,
        coalition_seller_proceeds=sum(
            actor.seller_proceeds for actor in coalition_members
        ),
    )
    candidate_branch = replace(
        authoritative,
        actors=actor_tuple,
        coalition=coalition,
    )

    assigned = comparison.evaluation.settlement.assigned_distribution
    reward_sum = sum(rewards.values())
    if reward_sum != assigned:
        raise ModelComparisonError(
            "CANDIDATE_REWARD_SUM_MISMATCH",
            assigned=assigned,
            rewards=reward_sum,
        )
    actor_reward_sum = sum(actor.rewards for actor in actor_tuple)
    if actor_reward_sum != assigned:
        raise ModelComparisonError(
            "CANDIDATE_ACTOR_REWARD_SUM_MISMATCH",
            assigned=assigned,
            actor_rewards=actor_reward_sum,
        )

    actor_rewards = tuple(actor.rewards for actor in actor_tuple if actor.rewards > 0)
    winner_actor = authoritative.winner_actor
    winner_actor_indirect_reward = (
        0
        if winner_actor is None
        else sum(
            reward
            for identity, reward in rewards.items()
            if identity != authoritative.winner_identity
            and ownership[identity] == winner_actor
        )
    )
    baseline_assigned = report.metrics.auction.assigned_distribution
    baseline_unassigned = report.metrics.auction.unassigned_remainder
    candidate_unassigned = comparison.evaluation.settlement.unassigned_remainder
    return CandidateBranchOverlay(
        authoritative=authoritative,
        candidate=candidate_branch,
        baseline_candidate_pool=report.metrics.auction.candidate_pool,
        candidate_pool=comparison.evaluation.settlement.candidate_pool,
        baseline_assigned_distribution=baseline_assigned,
        candidate_assigned_distribution=assigned,
        baseline_unassigned_remainder=baseline_unassigned,
        candidate_unassigned_remainder=candidate_unassigned,
        baseline_seller_proceeds=baseline_seller_proceeds,
        candidate_seller_proceeds=candidate_seller_proceeds,
        candidate_minus_baseline_assigned_distribution=assigned - baseline_assigned,
        candidate_minus_baseline_unassigned_remainder=(
            candidate_unassigned - baseline_unassigned
        ),
        candidate_minus_baseline_seller_proceeds=(
            candidate_seller_proceeds - baseline_seller_proceeds
        ),
        candidate_minus_baseline_coalition_reward=(
            candidate_branch.coalition.coalition_reward
            - authoritative.coalition.coalition_reward
        ),
        candidate_minus_baseline_coalition_utility=(
            candidate_branch.coalition.coalition_economic_change
            - authoritative.coalition.coalition_economic_change
        ),
        wallet_max_reward_share=_ratio(
            max(rewards.values(), default=0),
            assigned,
        ),
        actor_max_reward_share=_ratio(
            max(actor_rewards, default=0),
            assigned,
        ),
        winner_actor_indirect_reward=winner_actor_indirect_reward,
    )


def _coalition_contribution(
    comparison: ScenarioCandidateComparison,
    coalition_identities: Sequence[str],
) -> int:
    contributions = comparison.evaluation.contribution_by_subject
    return sum(contributions.get(identity, 0) for identity in coalition_identities)


def _coalition_weight(
    comparison: ScenarioCandidateComparison,
    coalition_identities: Sequence[str],
) -> int:
    weights = comparison.evaluation.allocation.weight_by_subject
    return sum(weights.get(identity, 0) for identity in coalition_identities)


def _candidate_adversarial_deltas(
    case: CounterfactualCase,
    reference: ScenarioCandidateComparison,
    attack: ScenarioCandidateComparison,
    reference_overlay: CandidateBranchOverlay,
    attack_overlay: CandidateBranchOverlay,
) -> CandidateAdversarialDeltas:
    reference_actors = _actor_lookup(reference_overlay.candidate)
    attack_actors = _actor_lookup(attack_overlay.candidate)
    if set(reference_actors) != set(attack_actors):
        raise ModelComparisonError("COUNTERFACTUAL_ACTOR_SET_MISMATCH")
    actor_utilities = tuple(
        ActorUtilityDelta(
            actor_id=actor_id,
            reference_actor_economic_change=(
                reference_actors[actor_id].actor_economic_change
            ),
            attack_actor_economic_change=(
                attack_actors[actor_id].actor_economic_change
            ),
            delta_actor_utility=(
                attack_actors[actor_id].actor_economic_change
                - reference_actors[actor_id].actor_economic_change
            ),
        )
        for actor_id in sorted(reference_actors)
    )
    reference_coalition = reference_overlay.candidate.coalition
    attack_coalition = attack_overlay.candidate.coalition
    reference_candidate_contribution = _coalition_contribution(
        reference,
        reference_coalition.bidder_identities,
    )
    attack_candidate_contribution = _coalition_contribution(
        attack,
        attack_coalition.bidder_identities,
    )
    delta_utility = (
        attack_coalition.coalition_economic_change
        - reference_coalition.coalition_economic_change
    )
    contribution_zero_attack = attack_candidate_contribution == 0
    all_attack_identities_lose = (
        bool(attack_coalition.participating_bidder_identities)
        and attack_overlay.candidate.winner_identity
        not in attack_coalition.participating_bidder_identities
    )
    identity_count_increased = (
        len(attack_coalition.participating_bidder_identities)
        > len(reference_coalition.participating_bidder_identities)
    )
    return CandidateAdversarialDeltas(
        actor_utilities=actor_utilities,
        delta_coalition_utility=delta_utility,
        delta_coalition_reward=(
            attack_coalition.coalition_reward
            - reference_coalition.coalition_reward
        ),
        delta_coalition_cash_flow=(
            attack_coalition.coalition_cash_flow
            - reference_coalition.coalition_cash_flow
        ),
        delta_coalition_non_reward_cash_flow=(
            attack_coalition.coalition_non_reward_cash_flow
            - reference_coalition.coalition_non_reward_cash_flow
        ),
        delta_seller_proceeds=(
            attack_overlay.candidate_seller_proceeds
            - reference_overlay.candidate_seller_proceeds
        ),
        delta_assigned_distribution=(
            attack_overlay.candidate_assigned_distribution
            - reference_overlay.candidate_assigned_distribution
        ),
        delta_unassigned_remainder=(
            attack_overlay.candidate_unassigned_remainder
            - reference_overlay.candidate_unassigned_remainder
        ),
        delta_candidate_pool=(
            attack_overlay.candidate_pool - reference_overlay.candidate_pool
        ),
        delta_coalition_mechanical_contribution=(
            attack_coalition.mechanical_premium_lift
            - reference_coalition.mechanical_premium_lift
        ),
        delta_coalition_candidate_contribution=(
            attack_candidate_contribution - reference_candidate_contribution
        ),
        reference_locked_capital=reference_coalition.aggregate_locked_capital,
        attack_locked_capital=attack_coalition.aggregate_locked_capital,
        delta_locked_capital=(
            attack_coalition.aggregate_locked_capital
            - reference_coalition.aggregate_locked_capital
        ),
        reference_capital_time_exposure_wei_seconds=(
            reference_coalition.capital_time_exposure_wei_seconds
        ),
        attack_capital_time_exposure_wei_seconds=(
            attack_coalition.capital_time_exposure_wei_seconds
        ),
        delta_capital_time_exposure_wei_seconds=(
            attack_coalition.capital_time_exposure_wei_seconds
            - reference_coalition.capital_time_exposure_wei_seconds
        ),
        candidate_pool_unlock_gain=(
            attack_overlay.candidate_pool - reference_overlay.candidate_pool
            if case.threat_class == "sybil-participant-threshold"
            and identity_count_increased
            else 0
        ),
        candidate_assigned_unlock_gain=(
            attack_overlay.candidate_assigned_distribution
            - reference_overlay.candidate_assigned_distribution
            if case.threat_class == "sybil-participant-threshold"
            and identity_count_increased
            else 0
        ),
        deliberate_losing_gain=(
            delta_utility
            if case.threat_class == "strategic-losing"
            and contribution_zero_attack
            and all_attack_identities_lose
            else None
        ),
        interaction_farming_gain=(
            delta_utility
            if case.threat_class
            in {"interaction-intensity", "multi-identity-interaction"}
            else None
        ),
        reference_winner_actor_indirect_reward=(
            reference_overlay.winner_actor_indirect_reward
        ),
        attack_winner_actor_indirect_reward=(
            attack_overlay.winner_actor_indirect_reward
        ),
        delta_winner_actor_indirect_reward=(
            attack_overlay.winner_actor_indirect_reward
            - reference_overlay.winner_actor_indirect_reward
        ),
    )


def _external_participating_identities(
    case: CounterfactualCase,
    branch: BranchAccounting,
) -> tuple[str, ...]:
    coalition = set(case.coalition_actor_ids)
    return tuple(
        sorted(
            identity
            for actor in branch.actors
            if actor.actor_id not in coalition
            for identity in actor.participating_bidder_identities
        )
    )


def _identity_splitting_metrics(
    case: CounterfactualCase,
    reference: ScenarioCandidateComparison,
    attack: ScenarioCandidateComparison,
    reference_overlay: CandidateBranchOverlay,
    attack_overlay: CandidateBranchOverlay,
) -> IdentitySplittingMetrics:
    reference_coalition = reference_overlay.candidate.coalition
    attack_coalition = attack_overlay.candidate.coalition
    reference_contribution = _coalition_contribution(
        reference,
        reference_coalition.bidder_identities,
    )
    attack_contribution = _coalition_contribution(
        attack,
        attack_coalition.bidder_identities,
    )
    reference_weight = _coalition_weight(
        reference,
        reference_coalition.bidder_identities,
    )
    attack_weight = _coalition_weight(
        attack,
        attack_coalition.bidder_identities,
    )
    locked_matched = (
        reference_coalition.aggregate_locked_capital
        == attack_coalition.aggregate_locked_capital
    )
    candidate_contribution_matched = reference_contribution == attack_contribution
    mechanical_contribution_matched = (
        reference_coalition.mechanical_premium_lift
        == attack_coalition.mechanical_premium_lift
    )
    contribution_matched = (
        candidate_contribution_matched and mechanical_contribution_matched
    )
    weight_matched = reference_weight == attack_weight
    candidate_pool_matched = (
        reference_overlay.candidate_pool == attack_overlay.candidate_pool
    )
    final_price_matched = (
        reference.metrics.final_price == attack.metrics.final_price
    )
    gross_matched = reference.metrics.gross_premium == attack.metrics.gross_premium
    net_matched = reference.metrics.net_premium == attack.metrics.net_premium
    fee_matched = reference.metrics.fee_amount == attack.metrics.fee_amount
    external_matched = _external_participating_identities(
        case,
        reference_overlay.candidate,
    ) == _external_participating_identities(case, attack_overlay.candidate)
    terminal_matched = (
        reference_overlay.candidate.terminal_nft_claimant_actor
        == attack_overlay.candidate.terminal_nft_claimant_actor
    )
    comparable = all(
        (
            locked_matched,
            contribution_matched,
            candidate_pool_matched,
            final_price_matched,
            gross_matched,
            net_matched,
            fee_matched,
            external_matched,
            terminal_matched,
        )
    )
    return IdentitySplittingMetrics(
        reference_identity_count=len(
            reference_coalition.participating_bidder_identities
        ),
        attack_identity_count=len(attack_coalition.participating_bidder_identities),
        reference_coalition_reward=reference_coalition.coalition_reward,
        attack_coalition_reward=attack_coalition.coalition_reward,
        identity_splitting_gain_reward=(
            attack_coalition.coalition_reward
            - reference_coalition.coalition_reward
        ),
        reference_coalition_utility=(
            reference_coalition.coalition_economic_change
        ),
        attack_coalition_utility=attack_coalition.coalition_economic_change,
        identity_splitting_gain_utility=(
            attack_coalition.coalition_economic_change
            - reference_coalition.coalition_economic_change
        ),
        reference_coalition_contribution=reference_contribution,
        attack_coalition_contribution=attack_contribution,
        reference_coalition_weight=reference_weight,
        attack_coalition_weight=attack_weight,
        reference_coalition_mechanical_contribution=(
            reference_coalition.mechanical_premium_lift
        ),
        attack_coalition_mechanical_contribution=(
            attack_coalition.mechanical_premium_lift
        ),
        locked_capital_matched=locked_matched,
        contribution_matched=contribution_matched,
        candidate_contribution_matched=candidate_contribution_matched,
        mechanical_contribution_matched=mechanical_contribution_matched,
        weight_matched=weight_matched,
        candidate_pool_matched=candidate_pool_matched,
        final_price_matched=final_price_matched,
        gross_premium_matched=gross_matched,
        net_premium_matched=net_matched,
        fee_matched=fee_matched,
        external_bidders_matched=external_matched,
        terminal_nft_owner_matched=terminal_matched,
        comparable=comparable,
        status="comparable" if comparable else "controls-unmatched",
    )


def _adversarial_properties(
    case: CounterfactualCase,
    adversarial_report: AdversarialReport,
    reference_overlay: CandidateBranchOverlay,
    attack_overlay: CandidateBranchOverlay,
    deltas: CandidateAdversarialDeltas,
    splitting: IdentitySplittingMetrics,
    reference_actor_diagnostics: tuple[CounterfactualDiagnostic, ...],
    attack_actor_diagnostics: tuple[CounterfactualDiagnostic, ...],
) -> tuple[CandidatePropertyResult, ...]:
    properties: list[CandidatePropertyResult] = []

    if case.threat_class == "strategic-losing":
        properties.append(
            _property(
                "P1",
                deltas.delta_coalition_reward == 0
                and attack_overlay.candidate.coalition.mechanical_premium_lift == 0,
                "a zero-mechanical-contribution deliberate loser gained candidate reward",
            )
        )
    else:
        properties.append(_not_applicable("P1", "not a strategic-losing pair"))

    if case.threat_class == "sybil-per-user-cap":
        if splitting.comparable:
            properties.append(
                _property(
                    "P2a",
                    splitting.identity_splitting_gain_reward <= 0,
                    "split identities gained candidate reward over the unsplit branch",
                )
            )
        else:
            properties.append(
                _non_comparable(
                    "P2a",
                    "identity-splitting controls are unmatched; the gain remains reported",
                )
            )
    else:
        properties.append(_not_applicable("P2a", "not a per-user-cap sybil pair"))

    if case.threat_class == "sybil-participant-threshold":
        properties.append(
            _property(
                "P3",
                reference_overlay.candidate_pool == attack_overlay.candidate_pool,
                "candidate pool changed when participant identity count changed",
            )
        )
        properties.append(
            _property(
                "P4",
                attack_overlay.winner_actor_indirect_reward == 0,
                "winner actor received candidate reward through another identity",
            )
        )
    else:
        properties.append(
            _not_applicable("P3", "not a participant-threshold sybil pair")
        )
        properties.append(
            _not_applicable("P4", "not a participant-threshold sybil pair")
        )

    if case.threat_class == "seller-self-purchase":
        reference_fee = adversarial_report.reference.metrics.auction.fee_amount
        attack_fee = adversarial_report.attack.metrics.auction.fee_amount
        properties.append(
            _property(
                "P13",
                deltas.delta_coalition_utility == -(attack_fee - reference_fee),
                "seller self-purchase actor delta differs from negative protocol fee",
            )
        )
    else:
        properties.append(_not_applicable("P13", "not a seller-self-purchase pair"))

    actor_diagnostics = (
        *reference_actor_diagnostics,
        *attack_actor_diagnostics,
    )
    if actor_diagnostics:
        properties.append(
            _property(
                "P15",
                all(
                    item.subject_kind == "economic-actor"
                    and _counterfactual_diagnostic_complete(
                        item,
                        allowed_conventions=frozenset({ACTOR_POLICY_REPLAY}),
                    )
                    for item in actor_diagnostics
                ),
                "an actor-aware counterfactual omits required diagnostic metadata",
            )
        )
    else:
        properties.append(
            _not_applicable(
                "P15",
                "candidate has no actor-aware counterfactual diagnostics",
            )
        )

    return tuple(properties)


def evaluate_adversarial_candidate(
    model: CandidateDefinition,
    case: CounterfactualCase,
    adversarial_report: AdversarialReport,
) -> AdversarialCandidateComparison:
    """Evaluate a candidate over one authoritative Lot D reference/attack pair."""

    if adversarial_report.metadata.case_id != case.case_id:
        raise ModelComparisonError(
            "ADVERSARIAL_CASE_REPORT_MISMATCH",
            case_id=case.case_id,
            report_case_id=adversarial_report.metadata.case_id,
        )
    if (
        adversarial_report.metadata.reference_scenario_id
        != case.reference_scenario.id
        or adversarial_report.metadata.attack_scenario_id
        != case.attack_scenario.id
    ):
        raise ModelComparisonError(
            "ADVERSARIAL_BRANCH_REPORT_MISMATCH",
            case_id=case.case_id,
        )
    before = json.dumps(
        asdict(adversarial_report),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    reference = evaluate_scenario_candidate(
        model,
        case.reference_scenario,
        adversarial_report.reference,
        actor_context=None,
    )
    attack = evaluate_scenario_candidate(
        model,
        case.attack_scenario,
        adversarial_report.attack,
        actor_context=None,
    )
    reference_overlay = overlay_branch_accounting(
        case,
        adversarial_report.reference,
        adversarial_report.metrics.reference,
        reference,
    )
    attack_overlay = overlay_branch_accounting(
        case,
        adversarial_report.attack,
        adversarial_report.metrics.attack,
        attack,
    )
    # These actor-removal values are diagnostics only.  The evaluations above
    # were already completed from identity-level contributions.
    reference_actor_diagnostics: tuple[CounterfactualDiagnostic, ...] = ()
    attack_actor_diagnostics: tuple[CounterfactualDiagnostic, ...] = ()
    if (
        model.contribution_policy
        == ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY
    ):
        reference_actor_diagnostics = compute_actor_aware_counterfactuals(
            case.reference_scenario,
            adversarial_report.reference,
            case.identity_ownership,
        )
        attack_actor_diagnostics = compute_actor_aware_counterfactuals(
            case.attack_scenario,
            adversarial_report.attack,
            case.identity_ownership,
        )
    after = json.dumps(
        asdict(adversarial_report),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    unchanged = before == after
    if not unchanged:
        raise ModelComparisonError("ADVERSARIAL_REPORT_MUTATION_DETECTED")
    deltas = _candidate_adversarial_deltas(
        case,
        reference,
        attack,
        reference_overlay,
        attack_overlay,
    )
    splitting = _identity_splitting_metrics(
        case,
        reference,
        attack,
        reference_overlay,
        attack_overlay,
    )
    return AdversarialCandidateComparison(
        model_id=model.id,
        actor_aware_counterfactual_is_diagnostic_only=True,
        impossibility_caveat=IDENTITY_IMPOSSIBILITY_CAVEAT,
        reference=reference,
        attack=attack,
        reference_overlay=reference_overlay,
        attack_overlay=attack_overlay,
        deltas=deltas,
        identity_splitting=splitting,
        reference_actor_aware_counterfactuals=reference_actor_diagnostics,
        attack_actor_aware_counterfactuals=attack_actor_diagnostics,
        properties=_adversarial_properties(
            case,
            adversarial_report,
            reference_overlay,
            attack_overlay,
            deltas,
            splitting,
            reference_actor_diagnostics,
            attack_actor_diagnostics,
        ),
        adversarial_report_unchanged=unchanged,
    )


def compare_adversarial_candidates(
    models: Sequence[CandidateDefinition],
    case: CounterfactualCase,
    adversarial_report: AdversarialReport,
) -> tuple[AdversarialCandidateComparison, ...]:
    return tuple(
        evaluate_adversarial_candidate(model, case, adversarial_report)
        for model in sorted(models, key=lambda item: item.id)
    )
