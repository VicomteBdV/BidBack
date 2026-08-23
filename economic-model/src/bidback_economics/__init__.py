"""Public API for BidBack Economic Model V1."""

from .baseline import simulate_auction
from .types import AuctionConfig, BidEvent, ParamsSnapshot, SimulationResult, serialize_result

__all__ = [
    "AuctionConfig",
    "BidEvent",
    "ParamsSnapshot",
    "SimulationResult",
    "serialize_result",
    "simulate_auction",
]
