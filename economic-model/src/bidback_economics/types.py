"""Immutable data structures and structured errors for the Solidity baseline."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from typing import Any, Mapping


class BidBackEconomicError(Exception):
    """Base error with stable machine-readable context."""

    def __init__(
        self,
        code: str,
        *,
        phase: str,
        operation: str | None = None,
        context: Mapping[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.phase = phase
        self.operation = operation
        self.context = dict(context or {})
        super().__init__(code)

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "phase": self.phase,
            "operation": self.operation,
            "context": dict(sorted(self.context.items())),
        }


class FixtureValidationError(BidBackEconomicError):
    """A schema-v2 fixture cannot be consumed without ambiguity."""


class SolidityArithmeticError(BidBackEconomicError):
    """Checked Solidity arithmetic failed."""


class SolidityOverflow(SolidityArithmeticError):
    pass


class SolidityUnderflow(SolidityArithmeticError):
    pass


class SolidityDivisionByZero(SolidityArithmeticError):
    pass


class AuctionSimulationRevert(BidBackEconomicError):
    """A simulated call reverted with a real Solidity custom-error name."""


class AuctionStatus(str, Enum):
    OPEN = "OPEN"
    ENDED = "ENDED"
    FINALIZED = "FINALIZED"


@dataclass(frozen=True, slots=True)
class ParamsSnapshot:
    bidback_fee_bps: int
    redistribution_bps: int
    min_participants: int
    alpha_bps: int
    beta_bps: int
    gamma_bps: int
    min_bid_increment_bps: int
    per_user_reward_cap_bps: int
    max_participants: int
    max_interaction_count: int
    min_auction_duration: int
    anti_snipe_window: int
    anti_snipe_extension: int
    max_anti_snipe_extensions: int
    min_exposure: int
    min_premium_net: int
    ef_cap: int
    et_cap: int
    ii_cap: int


@dataclass(frozen=True, slots=True)
class AuctionConfig:
    start_price: int
    start_time: int
    duration: int
    params: ParamsSnapshot
    finalization_time: int | None
    source_commit: str | None = None
    seller: str = "SELLER"


@dataclass(frozen=True, slots=True)
class BidEvent:
    bidder: str
    new_cap: int
    deposit: int
    timestamp: int


@dataclass(frozen=True, slots=True)
class BidderState:
    max_cap: int = 0
    first_bid_time: int = 0
    significant_overbids: int = 0
    exists: bool = False


@dataclass(frozen=True, slots=True)
class BidAudit:
    bidder: str
    previous_cap: int
    new_cap: int
    deposit: int
    minimum_bid: int
    leader_before: str | None
    leader_after: str
    end_time_before: int
    end_time_after: int
    observed_price_lift: int
    premium_lift: int


@dataclass(frozen=True, slots=True)
class AuctionState:
    status: AuctionStatus
    start_price: int
    start_time: int
    initial_end_time: int
    end_time: int
    extensions_used: int
    highest_bidder: str | None
    highest_bid: int
    participant_count: int
    bid_count: int
    participants: tuple[str, ...]
    params: ParamsSnapshot


@dataclass(frozen=True, slots=True)
class ScoreComponents:
    financial_engagement: int
    time_engagement: int
    interaction_intensity: int
    weighted_score: int
    reputation_bps: int
    final_score: int


@dataclass(frozen=True, slots=True)
class AllocationResult:
    raw_rewards: Mapping[str, int]
    rewards: Mapping[str, int]
    recipients: tuple[str, ...]
    total_score: int
    per_user_cap: int
    assigned: int


@dataclass(frozen=True, slots=True)
class SettlementResult:
    escrow_opened: bool
    distribution_opened: bool
    winner: str | None
    final_price: int
    gross_premium: int
    fee_amount: int
    net_premium: int
    candidate_pool: int
    assigned_distribution: int
    seller_proceeds: int | None
    distribution_reserve: int
    nft_claimant: str


@dataclass(frozen=True, slots=True)
class AccountingResult:
    total_deposits: int
    refunds: Mapping[str, int]
    winner_surplus: int
    total_liabilities: int
    remaining_after_all_claims: int


@dataclass(frozen=True, slots=True)
class InvariantResult:
    category: str
    name: str
    passed: bool
    detail: str = ""


@dataclass(frozen=True, slots=True)
class SimulationMetadata:
    schema_version: int = 2
    model_version: str = "solidity-baseline-v1"
    source_commit: str | None = None


@dataclass(frozen=True, slots=True)
class SimulationResult:
    metadata: SimulationMetadata
    state: AuctionState
    bidders: Mapping[str, BidderState]
    bid_audit: tuple[BidAudit, ...]
    scores: Mapping[str, ScoreComponents]
    allocation: AllocationResult
    settlement: SettlementResult | None
    accounting: AccountingResult
    invariants: tuple[InvariantResult, ...] = field(default_factory=tuple)


def _json_value(value: Any) -> Any:
    if is_dataclass(value):
        return {item.name: _json_value(getattr(value, item.name)) for item in fields(value)}
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in sorted(value.items())}
    if isinstance(value, (tuple, list)):
        return [_json_value(item) for item in value]
    return value


def serialize_result(result: SimulationResult) -> str:
    """Return stable, whitespace-independent JSON for an identical result."""

    return json.dumps(_json_value(result), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
