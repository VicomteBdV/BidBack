"""Deterministic Python twin of the current Solidity auction economics."""

from __future__ import annotations

from dataclasses import replace
from typing import Mapping, Sequence

from .solidity_math import (
    UINT16_MAX,
    checked_add,
    checked_div,
    checked_mul,
    checked_sub,
    explicit_unsigned_cast,
    validate_typed_uint,
)
from .types import (
    AccountingResult,
    AllocationResult,
    AuctionConfig,
    AuctionSimulationRevert,
    AuctionState,
    AuctionStatus,
    BidAudit,
    BidEvent,
    BidderState,
    ParamsSnapshot,
    ScoreComponents,
    SettlementResult,
    SimulationMetadata,
    SimulationResult,
)

BPS = 10_000
SCALE = 10**18
DEFAULT_REPUTATION_BPS = 10_000
MIN_REPUTATION_BPS = 5_000
MAX_REPUTATION_BPS = 15_000


def default_params() -> ParamsSnapshot:
    return ParamsSnapshot(
        bidback_fee_bps=500,
        redistribution_bps=5_000,
        min_participants=2,
        alpha_bps=6_000,
        beta_bps=3_000,
        gamma_bps=1_000,
        min_bid_increment_bps=500,
        per_user_reward_cap_bps=4_000,
        max_participants=64,
        max_interaction_count=5,
        min_auction_duration=3_600,
        anti_snipe_window=600,
        anti_snipe_extension=600,
        max_anti_snipe_extensions=6,
        min_exposure=300,
        min_premium_net=10**16,
        ef_cap=SCALE,
        et_cap=SCALE,
        ii_cap=SCALE,
    )


def _revert(code: str, phase: str, **context: object) -> AuctionSimulationRevert:
    return AuctionSimulationRevert(code, phase=phase, context=context)


def validate_params(p: ParamsSnapshot) -> None:
    for name in (
        "bidback_fee_bps",
        "redistribution_bps",
        "min_participants",
        "alpha_bps",
        "beta_bps",
        "gamma_bps",
        "min_bid_increment_bps",
        "per_user_reward_cap_bps",
        "max_participants",
        "max_interaction_count",
    ):
        validate_typed_uint(getattr(p, name), 16, operation=name)
    for name in (
        "min_auction_duration",
        "anti_snipe_window",
        "anti_snipe_extension",
        "min_exposure",
    ):
        validate_typed_uint(getattr(p, name), 64, operation=name)
    validate_typed_uint(p.max_anti_snipe_extensions, 8, operation="max_anti_snipe_extensions")
    for name in ("min_premium_net", "ef_cap", "et_cap", "ii_cap"):
        validate_typed_uint(getattr(p, name), 256, operation=name)

    invalid = (
        p.bidback_fee_bps > 2_000
        or p.redistribution_bps > BPS
        or p.min_participants < 2
        or p.max_participants < p.min_participants
        or p.max_participants > 256
        or p.alpha_bps <= p.beta_bps
        or p.beta_bps < p.gamma_bps
        or p.alpha_bps + p.beta_bps + p.gamma_bps != BPS
        or p.min_bid_increment_bps == 0
        or p.min_bid_increment_bps > BPS
        or p.per_user_reward_cap_bps == 0
        or p.per_user_reward_cap_bps > BPS
        or p.max_interaction_count == 0
        or p.min_auction_duration == 0
        or p.anti_snipe_window == 0
        or p.anti_snipe_extension == 0
        or p.max_anti_snipe_extensions > 20
        or p.min_exposure > p.min_auction_duration
        or p.ef_cap == 0
        or p.ef_cap > SCALE
        or p.et_cap == 0
        or p.et_cap > SCALE
        or p.ii_cap == 0
        or p.ii_cap > SCALE
    )
    if invalid:
        raise _revert("InvalidParams", "configuration")


def reputation_bps(reputations: Mapping[str, int], bidder: str) -> int:
    if bidder not in reputations:
        return DEFAULT_REPUTATION_BPS
    value = validate_typed_uint(reputations[bidder], 256, operation="reputationBps")
    if value < MIN_REPUTATION_BPS or value > MAX_REPUTATION_BPS:
        raise _revert("ReputationOutOfBounds", "reputation", bidder=bidder, value=value)
    return value


def minimum_next_bid(start_price: int, highest_bid: int, increment_bps: int) -> int:
    validate_typed_uint(start_price, 256, operation="startPrice")
    validate_typed_uint(highest_bid, 256, operation="highestBid")
    validate_typed_uint(increment_bps, 16, operation="minBidIncrementBps")
    if highest_bid == 0:
        return 1 if start_price == 0 else start_price
    product = checked_mul(highest_bid, increment_bps, operation="minimum-bid-multiply")
    numerator = checked_add(product, BPS - 1, operation="minimum-bid-ceil-add")
    increment = checked_div(numerator, BPS, operation="minimum-bid-divide")
    if increment == 0:
        increment = 1
    return checked_add(highest_bid, increment, operation="minimum-bid-result")


def cap_delta(previous_cap: int, new_cap: int) -> int:
    return checked_sub(new_cap, previous_cap, operation="cap-delta")


def gross_premium(final_price: int, start_price: int) -> int:
    validate_typed_uint(final_price, 256, operation="finalPrice")
    validate_typed_uint(start_price, 256, operation="startPrice")
    return checked_sub(final_price, start_price, operation="gross-premium") if final_price > start_price else 0


def protocol_fee(premium_gross: int, fee_bps: int) -> int:
    validate_typed_uint(premium_gross, 256, operation="premiumGross")
    validate_typed_uint(fee_bps, 16, operation="bidbackFeeBps")
    if premium_gross == 0:
        return 0
    product = checked_mul(premium_gross, fee_bps, operation="fee-multiply")
    return checked_div(product, BPS, operation="fee-divide")


def net_premium(premium_gross: int, fee_amount: int) -> int:
    return checked_sub(premium_gross, fee_amount, operation="net-premium")


def candidate_distribution_pool(
    premium_net: int,
    participant_count: int,
    initial_duration: int,
    p: ParamsSnapshot,
) -> int:
    validate_typed_uint(premium_net, 256, operation="premiumNet")
    validate_typed_uint(participant_count, 256, operation="participantCount")
    validate_typed_uint(initial_duration, 64, operation="initialDuration")
    if premium_net < p.min_premium_net:
        return 0
    if participant_count < p.min_participants:
        return 0
    if initial_duration < p.min_auction_duration:
        return 0
    product = checked_mul(premium_net, p.redistribution_bps, operation="pool-multiply")
    candidate = checked_div(product, BPS, operation="pool-divide")
    return premium_net if candidate > premium_net else candidate


def financial_engagement(max_cap: int, final_price: int, component_cap: int) -> int:
    validate_typed_uint(max_cap, 256, operation="maxCap")
    validate_typed_uint(final_price, 256, operation="finalPrice")
    validate_typed_uint(component_cap, 256, operation="efCap")
    if final_price == 0 or max_cap == 0:
        return 0
    capped_cap = final_price if max_cap > final_price else max_cap
    ratio_product = checked_mul(capped_cap, SCALE, operation="ef-ratio-multiply")
    ratio = checked_div(ratio_product, final_price, operation="ef-ratio-divide")
    square = checked_mul(ratio, ratio, operation="ef-square-multiply")
    value = checked_div(square, SCALE, operation="ef-square-divide")
    return component_cap if value > component_cap else value


def time_engagement(
    first_bid_time: int,
    start_time: int,
    initial_end_time: int,
    min_exposure: int,
    component_cap: int,
) -> int:
    validate_typed_uint(first_bid_time, 64, operation="firstBidTime")
    validate_typed_uint(start_time, 64, operation="startTime")
    validate_typed_uint(initial_end_time, 64, operation="initialEndTime")
    validate_typed_uint(min_exposure, 64, operation="minExposure")
    validate_typed_uint(component_cap, 256, operation="etCap")
    if first_bid_time == 0 or first_bid_time >= initial_end_time:
        return 0
    exposure = checked_sub(initial_end_time, first_bid_time, bits=64, operation="et-exposure")
    if exposure < min_exposure:
        return 0
    duration = checked_sub(initial_end_time, start_time, bits=64, operation="et-duration")
    if duration == 0:
        return 0
    product = checked_mul(exposure, SCALE, operation="et-multiply")
    value = checked_div(product, duration, operation="et-divide")
    return component_cap if value > component_cap else value


def interaction_intensity(
    significant_overbids: int,
    max_interaction_count: int,
    component_cap: int,
) -> int:
    validate_typed_uint(significant_overbids, 16, operation="significantOverbids")
    validate_typed_uint(max_interaction_count, 16, operation="maxInteractionCount")
    validate_typed_uint(component_cap, 256, operation="iiCap")
    if significant_overbids == 0:
        return 0
    capped = min(significant_overbids, max_interaction_count)
    product = checked_mul(capped, SCALE, operation="ii-multiply")
    value = checked_div(product, max_interaction_count, operation="ii-divide")
    return component_cap if value > component_cap else value


def increment_significant_overbids(value: int) -> int:
    validate_typed_uint(value, 16, operation="significantOverbids")
    return value if value == UINT16_MAX else checked_add(value, 1, bits=16, operation="significantOverbids")


def weighted_score(ef: int, et: int, ii: int, p: ParamsSnapshot) -> int:
    alpha = checked_mul(p.alpha_bps, ef, operation="score-alpha")
    beta = checked_mul(p.beta_bps, et, operation="score-beta")
    gamma = checked_mul(p.gamma_bps, ii, operation="score-gamma")
    subtotal = checked_add(alpha, beta, operation="score-add-alpha-beta")
    total = checked_add(subtotal, gamma, operation="score-add-gamma")
    return checked_div(total, BPS, operation="score-divide")


def final_score(weighted: int, reputation: int) -> int:
    product = checked_mul(weighted, reputation, operation="reputation-multiply")
    return checked_div(product, BPS, operation="reputation-divide")


def allocate_distribution(
    pool: int,
    participants: Sequence[str],
    winner: str | None,
    scores: Mapping[str, int],
    per_user_reward_cap_bps: int,
) -> AllocationResult:
    validate_typed_uint(pool, 256, operation="distributionPool")
    rewards = {participant: 0 for participant in participants}
    if pool == 0:
        return AllocationResult({}, rewards, tuple(), 0, 0, 0)
    total_score = 0
    for participant in participants:
        if participant == winner:
            continue
        total_score = checked_add(total_score, scores.get(participant, 0), operation="total-score")
    raw_rewards: dict[str, int] = {}
    recipients: list[str] = []
    assigned = 0
    if total_score == 0:
        return AllocationResult(raw_rewards, rewards, tuple(), total_score, 0, 0)
    cap_product = checked_mul(pool, per_user_reward_cap_bps, operation="per-user-cap-multiply")
    per_user_cap = checked_div(cap_product, BPS, operation="per-user-cap-divide")
    for participant in participants:
        score = 0 if participant == winner else scores.get(participant, 0)
        if score == 0:
            continue
        product = checked_mul(pool, score, operation="raw-reward-multiply")
        raw = checked_div(product, total_score, operation="raw-reward-divide")
        raw_rewards[participant] = raw
        amount = min(raw, per_user_cap)
        if amount == 0:
            continue
        rewards[participant] = amount
        recipients.append(participant)
        assigned = checked_add(assigned, amount, operation="assigned-distribution")
    return AllocationResult(raw_rewards, rewards, tuple(recipients), total_score, per_user_cap, assigned)


def refundable_amount(cap: int, bidder: str, winner: str | None, final_price: int) -> int:
    validate_typed_uint(cap, 256, operation="cap")
    if cap == 0:
        return 0
    if bidder == winner:
        return checked_sub(cap, final_price, operation="winner-surplus") if cap > final_price else 0
    return cap


def seller_proceeds(final_price: int, fee_amount: int, assigned_distribution: int) -> int:
    after_fee = checked_sub(final_price, fee_amount, operation="seller-after-fee")
    return checked_sub(after_fee, assigned_distribution, operation="seller-after-distribution")


def remaining_liabilities(total_deposits: int, paid: int) -> int:
    return checked_sub(total_deposits, paid, operation="remaining-liabilities")


def _components(
    bidder: str,
    state: AuctionState,
    bidder_state: BidderState,
    p: ParamsSnapshot,
    reputations: Mapping[str, int],
) -> ScoreComponents:
    ef = financial_engagement(bidder_state.max_cap, state.highest_bid, p.ef_cap)
    et = time_engagement(
        bidder_state.first_bid_time,
        state.start_time,
        state.initial_end_time,
        p.min_exposure,
        p.et_cap,
    )
    ii = interaction_intensity(
        bidder_state.significant_overbids,
        p.max_interaction_count,
        p.ii_cap,
    )
    weighted = weighted_score(ef, et, ii, p)
    reputation = reputation_bps(reputations, bidder)
    return ScoreComponents(ef, et, ii, weighted, reputation, final_score(weighted, reputation))


def simulate_auction(
    config: AuctionConfig,
    bid_trace: Sequence[BidEvent],
    reputations: Mapping[str, int],
) -> SimulationResult:
    """Replay creation, bidding, timing, scoring, allocation, and settlement."""

    validate_params(config.params)
    validate_typed_uint(config.start_price, 256, operation="startPrice")
    validate_typed_uint(config.start_time, 256, operation="block.timestamp")
    duration = validate_typed_uint(config.duration, 64, operation="duration")
    if duration == 0 or duration < config.params.min_auction_duration:
        raise _revert("InvalidDuration", "createAuction", duration=duration)

    start_time = explicit_unsigned_cast(config.start_time, 64, operation="uint64(block.timestamp)")
    initial_end_time = checked_add(start_time, duration, bits=64, operation="initialEndTime")
    end_time = initial_end_time
    extensions_used = 0
    status = AuctionStatus.OPEN
    highest_bidder: str | None = None
    highest_bid = 0
    participants: list[str] = []
    bidders: dict[str, BidderState] = {}
    audits: list[BidAudit] = []
    total_deposits = 0

    for event in bid_trace:
        if status is not AuctionStatus.OPEN:
            raise _revert("AuctionNotOpen", "placeBid")
        if not event.bidder:
            raise _revert("ZeroAddress", "placeBid")
        now = explicit_unsigned_cast(event.timestamp, 64, operation="uint64(block.timestamp)")
        if now >= end_time:
            raise _revert("AuctionNotOpen", "placeBid", timestamp=now, end_time=end_time)
        new_cap = validate_typed_uint(event.new_cap, 256, operation="newCap")
        deposit = validate_typed_uint(event.deposit, 256, operation="msg.value")
        minimum = minimum_next_bid(config.start_price, highest_bid, config.params.min_bid_increment_bps)
        if new_cap < minimum:
            raise _revert("BidTooLow", "placeBid", new_cap=new_cap, minimum=minimum)
        previous = bidders.get(event.bidder, BidderState())
        if new_cap <= previous.max_cap:
            raise _revert("BidTooLow", "placeBid", new_cap=new_cap, previous_cap=previous.max_cap)
        delta = cap_delta(previous.max_cap, new_cap)
        if deposit != delta:
            raise _revert("InvalidDeposit", "depositCap", deposit=deposit, delta=delta)

        exists = previous.exists
        first_bid_time = previous.first_bid_time
        if not exists:
            if len(participants) >= config.params.max_participants:
                raise _revert("MaxParticipantsReached", "placeBid")
            exists = True
            first_bid_time = now
            participants.append(event.bidder)

        significant = previous.significant_overbids
        if highest_bidder is not None and highest_bidder != event.bidder:
            significant = increment_significant_overbids(significant)

        bidders[event.bidder] = BidderState(new_cap, first_bid_time, significant, exists)
        total_deposits = checked_add(total_deposits, deposit, operation="total-deposits")
        leader_before = highest_bidder
        highest_before = highest_bid
        end_before = end_time
        highest_bidder = event.bidder
        highest_bid = new_cap
        if (
            checked_sub(end_time, now, bits=64, operation="anti-snipe-remaining")
            <= config.params.anti_snipe_window
            and extensions_used < config.params.max_anti_snipe_extensions
        ):
            end_time = checked_add(
                end_time,
                config.params.anti_snipe_extension,
                bits=64,
                operation="anti-snipe-extension",
            )
            extensions_used = checked_add(extensions_used, 1, bits=8, operation="extensionsUsed")
        audits.append(
            BidAudit(
                event.bidder,
                previous.max_cap,
                new_cap,
                deposit,
                minimum,
                leader_before,
                highest_bidder,
                end_before,
                end_time,
                checked_sub(new_cap, highest_before, operation="observed-price-lift"),
                (
                    checked_sub(
                        new_cap,
                        max(highest_before, config.start_price),
                        operation="premium-lift",
                    )
                    if new_cap > max(highest_before, config.start_price)
                    else 0
                ),
            )
        )

    if config.finalization_time is not None:
        finalization_time = validate_typed_uint(
            config.finalization_time, 256, operation="finalization block.timestamp"
        )
        if finalization_time < end_time:
            raise _revert("AuctionNotEnded", "endAuction", timestamp=finalization_time, end_time=end_time)
        status = AuctionStatus.FINALIZED

    state = AuctionState(
        status,
        config.start_price,
        start_time,
        initial_end_time,
        end_time,
        extensions_used,
        highest_bidder,
        highest_bid,
        len(participants),
        len(bid_trace),
        tuple(participants),
        config.params,
    )
    scores: dict[str, ScoreComponents] = {}
    if status is not AuctionStatus.FINALIZED:
        scores = {
            participant: _components(participant, state, bidders[participant], config.params, reputations)
            for participant in participants
        }
    allocation = AllocationResult({}, {participant: 0 for participant in participants}, tuple(), 0, 0, 0)
    settlement: SettlementResult | None = None
    refunds: dict[str, int] = {}
    total_liabilities = 0
    winner_surplus = 0

    if status is AuctionStatus.FINALIZED and highest_bidder is None:
        settlement = SettlementResult(False, False, None, 0, 0, 0, 0, 0, 0, None, 0, config.seller)
    elif status is AuctionStatus.FINALIZED:
        premium_gross = gross_premium(highest_bid, config.start_price)
        fee_amount = protocol_fee(premium_gross, config.params.bidback_fee_bps)
        premium_net = net_premium(premium_gross, fee_amount)
        duration_for_pool = checked_sub(initial_end_time, start_time, bits=64, operation="pool-duration")
        pool = candidate_distribution_pool(premium_net, len(participants), duration_for_pool, config.params)
        if pool > 0:
            scores = {
                participant: _components(participant, state, bidders[participant], config.params, reputations)
                for participant in participants
                if participant != highest_bidder
            }
        score_values = {participant: components.final_score for participant, components in scores.items()}
        allocation = allocate_distribution(
            pool,
            participants,
            highest_bidder,
            score_values,
            config.params.per_user_reward_cap_bps,
        )
        seller_amount = seller_proceeds(highest_bid, fee_amount, allocation.assigned)
        for participant in participants:
            refunds[participant] = refundable_amount(
                bidders[participant].max_cap, participant, highest_bidder, highest_bid
            )
        winner_surplus = refunds.get(highest_bidder, 0)
        refund_total = 0
        for value in refunds.values():
            refund_total = checked_add(refund_total, value, operation="refund-total")
        obligations = checked_add(seller_amount, fee_amount, operation="settlement-obligations")
        obligations = checked_add(obligations, allocation.assigned, operation="settlement-obligations")
        total_liabilities = checked_add(refund_total, obligations, operation="total-liabilities")
        settlement = SettlementResult(
            True,
            True,
            highest_bidder,
            highest_bid,
            premium_gross,
            fee_amount,
            premium_net,
            pool,
            allocation.assigned,
            seller_amount,
            allocation.assigned,
            highest_bidder,
        )

    remaining = remaining_liabilities(total_deposits, total_liabilities) if status is AuctionStatus.FINALIZED else total_deposits
    accounting = AccountingResult(total_deposits, refunds, winner_surplus, total_liabilities, remaining)
    result = SimulationResult(
        SimulationMetadata(source_commit=config.source_commit),
        state,
        bidders,
        tuple(audits),
        scores,
        allocation,
        settlement,
        accounting,
    )
    from .invariants import evaluate_invariants

    return replace(result, invariants=evaluate_invariants(result))
