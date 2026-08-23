"""Executable invariants for simulation results."""

from __future__ import annotations

from .types import AuctionStatus, InvariantResult, SimulationResult


def _check(category: str, name: str, condition: bool, detail: str = "") -> InvariantResult:
    return InvariantResult(category, name, condition, "" if condition else detail)


def evaluate_invariants(result: SimulationResult) -> tuple[InvariantResult, ...]:
    checks: list[InvariantResult] = []
    state = result.state

    checks.append(
        _check(
            "state-machine",
            "cap monotonicity",
            all(item.new_cap > item.previous_cap for item in result.bid_audit),
            "a bid did not strictly increase its bidder cap",
        )
    )
    checks.append(
        _check(
            "state-machine",
            "deposit equals cap delta",
            all(item.deposit == item.new_cap - item.previous_cap for item in result.bid_audit),
            "a bid deposit differs from its cap delta",
        )
    )
    checks.append(
        _check(
            "state-machine",
            "deposits equal sum of caps",
            result.accounting.total_deposits == sum(item.max_cap for item in result.bidders.values()),
            "total deposits and final caps differ",
        )
    )
    checks.append(
        _check(
            "state-machine",
            "participant uniqueness",
            len(state.participants) == len(set(state.participants)),
            "participant list contains a duplicate",
        )
    )
    checks.append(
        _check(
            "state-machine",
            "participant count",
            state.participant_count == len(state.participants),
            "participantCount differs from the participant list",
        )
    )
    expected_takeovers = {participant: 0 for participant in state.participants}
    for item in result.bid_audit:
        if item.leader_before is not None and item.leader_before != item.bidder:
            expected_takeovers[item.bidder] = min(expected_takeovers[item.bidder] + 1, 2**16 - 1)
    checks.append(
        _check(
            "state-machine",
            "takeover count",
            all(
                result.bidders[participant].significant_overbids == expected_takeovers[participant]
                for participant in state.participants
            ),
            "significantOverbids differs from ordered takeovers",
        )
    )
    expected_leader = result.bid_audit[-1].bidder if result.bid_audit else None
    checks.append(
        _check(
            "state-machine",
            "leader",
            state.highest_bidder == expected_leader,
            "highest bidder is not the final valid bidder",
        )
    )
    expected_highest = result.bid_audit[-1].new_cap if result.bid_audit else 0
    checks.append(
        _check(
            "state-machine",
            "final price",
            state.highest_bid == expected_highest,
            "highest bid is not the final valid cap",
        )
    )
    allowed_end_deltas = {0, state.params.anti_snipe_extension}
    checks.append(
        _check(
            "state-machine",
            "anti-sniping bounds",
            state.extensions_used <= state.params.max_anti_snipe_extensions
            and all(item.end_time_after - item.end_time_before in allowed_end_deltas for item in result.bid_audit),
            "an extension count or duration exceeds the parameter snapshot",
        )
    )

    for participant, components in result.scores.items():
        checks.append(
            _check(
                "scoring-allocation",
                f"component caps:{participant}",
                components.financial_engagement <= state.params.ef_cap
                and components.time_engagement <= state.params.et_cap
                and components.interaction_intensity <= state.params.ii_cap,
                "a scoring component exceeds its snapshotted cap",
            )
        )
    allocation = result.allocation
    loser_score_sum = sum(
        components.final_score
        for participant, components in result.scores.items()
        if participant != state.highest_bidder
    )
    checks.append(
        _check(
            "scoring-allocation",
            "total score",
            allocation.total_score == loser_score_sum if result.settlement else allocation.total_score == 0,
            "allocation totalScore differs from loser scores",
        )
    )
    checks.append(
        _check(
            "scoring-allocation",
            "winner reward",
            state.highest_bidder is None or allocation.rewards.get(state.highest_bidder, 0) == 0,
            "winner has a reward",
        )
    )
    checks.append(
        _check(
            "scoring-allocation",
            "per-user cap",
            all(value <= allocation.per_user_cap for value in allocation.rewards.values()),
            "a reward exceeds the per-user cap",
        )
    )
    checks.append(
        _check(
            "scoring-allocation",
            "zero allocations omitted",
            all(allocation.rewards[recipient] > 0 for recipient in allocation.recipients),
            "a zero allocation appears in recipients",
        )
    )
    checks.append(
        _check(
            "scoring-allocation",
            "assigned equals rewards",
            allocation.assigned == sum(allocation.rewards.values()),
            "assigned distribution differs from reward sum",
        )
    )

    settlement = result.settlement
    if settlement is not None:
        checks.append(
            _check(
                "settlement",
                "fee bounds",
                settlement.fee_amount <= settlement.gross_premium,
                "fee exceeds gross premium",
            )
        )
        checks.append(
            _check(
                "settlement",
                "pool bounds",
                settlement.candidate_pool <= settlement.net_premium,
                "candidate pool exceeds net premium",
            )
        )
        checks.append(
            _check(
                "settlement",
                "assigned below candidate",
                settlement.assigned_distribution <= settlement.candidate_pool,
                "assigned distribution exceeds candidate pool",
            )
        )
        checks.append(
            _check(
                "settlement",
                "distribution reserve",
                settlement.distribution_reserve == settlement.assigned_distribution,
                "reserve differs from assigned distribution",
            )
        )
        if settlement.escrow_opened:
            checks.append(
                _check(
                    "settlement",
                    "seller proceeds non-negative",
                    settlement.seller_proceeds is not None and settlement.seller_proceeds >= 0,
                    "seller proceeds are absent or negative",
                )
            )
            checks.append(
                _check(
                    "settlement",
                    "full losing refunds",
                    all(
                        result.accounting.refunds.get(participant, 0) == bidder.max_cap
                        for participant, bidder in result.bidders.items()
                        if participant != settlement.winner
                    ),
                    "a loser cannot recover its full cap",
                )
            )
            winner_cap = result.bidders[settlement.winner].max_cap if settlement.winner else 0
            expected_surplus = max(winner_cap - settlement.final_price, 0)
            checks.append(
                _check(
                    "settlement",
                    "winner surplus",
                    result.accounting.winner_surplus == expected_surplus,
                    "winner surplus differs from cap minus final price",
                )
            )
            settlement_from_price = (
                (settlement.seller_proceeds or 0)
                + settlement.fee_amount
                + settlement.assigned_distribution
            )
            checks.append(
                _check(
                    "settlement",
                    "rewards not funded by losing caps",
                    settlement_from_price == settlement.final_price,
                    "settlement outputs are not funded solely by final price",
                )
            )
            checks.append(
                _check(
                    "settlement",
                    "deposit conservation",
                    result.accounting.total_liabilities == result.accounting.total_deposits,
                    "liabilities differ from deposits",
                )
            )
            unassigned = settlement.candidate_pool - settlement.assigned_distribution
            checks.append(
                _check(
                    "scoring-allocation",
                    "dust and cap remainder retained",
                    unassigned >= 0
                    and (settlement.seller_proceeds or 0)
                    == settlement.final_price - settlement.fee_amount - settlement.assigned_distribution,
                    "unassigned candidate amount is not retained in seller proceeds",
                )
            )
        else:
            checks.append(
                _check(
                    "settlement",
                    "no-bid liabilities",
                    result.accounting.total_liabilities == 0
                    and result.accounting.total_deposits == 0,
                    "no-bid path has an ETH liability",
                )
            )

    return tuple(checks)
