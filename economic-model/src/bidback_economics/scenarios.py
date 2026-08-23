"""Deterministic Lot C scenario loading and bid-trace materialization."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any, Mapping, Sequence

from .baseline import cap_delta, minimum_next_bid, reputation_bps, simulate_auction, validate_params
from .solidity_math import checked_add, validate_typed_uint
from .types import AuctionConfig, AuctionSimulationRevert, BidEvent, ParamsSnapshot

SCENARIO_SCHEMA_VERSION = 1
REPORT_SCHEMA_VERSION = 1
PROFILE_VALUE_CAPPED_ONCE = "value-capped-once"
PROFILE_PERSISTENT_VALUE_CAPPED = "persistent-value-capped"
PROFILE_FIXED_CAP_ONCE = "fixed-cap-once"
PROFILE_KINDS = {
    PROFILE_VALUE_CAPPED_ONCE,
    PROFILE_PERSISTENT_VALUE_CAPPED,
    PROFILE_FIXED_CAP_ONCE,
}
_DECIMAL = re.compile(r"0|[1-9][0-9]*\Z")
_INTEGER_LIKE = re.compile(r"-?[0-9]+\Z")


class ScenarioValidationError(ValueError):
    """Structured validation failure for Lot C inputs or generated actions."""

    def __init__(self, code: str, path: str, **context: object) -> None:
        self.code = code
        self.path = path
        self.context = context
        detail = f"{code} at {path}"
        if context:
            detail = f"{detail}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class BidderDefinition:
    id: str
    valuation: int
    budget: int | None
    profile: str
    fixed_cap: int | None = None

    @property
    def max_bid_cap(self) -> int:
        return self.valuation if self.budget is None else min(self.valuation, self.budget)


@dataclass(frozen=True, slots=True)
class Opportunity:
    offset_seconds: int
    bidder: str


@dataclass(frozen=True, slots=True)
class Scenario:
    schema_version: int
    catalog_version: str
    economic_model_version: str
    id: str
    family: str
    description: str
    start_price: int
    start_time: int
    duration: int
    seller: str
    params: ParamsSnapshot
    bidders: tuple[BidderDefinition, ...]
    reputations: Mapping[str, int]
    opportunities: tuple[Opportunity, ...]
    focal_bidder: str | None = None

    @property
    def bidder_by_id(self) -> dict[str, BidderDefinition]:
        return {bidder.id: bidder for bidder in self.bidders}


@dataclass(frozen=True, slots=True)
class ScenarioCatalog:
    schema_version: int
    catalog_version: str
    economic_model_version: str
    params: ParamsSnapshot
    scenarios: tuple[Scenario, ...]


@dataclass(frozen=True, slots=True)
class BidDecision:
    opportunity_index: int
    bidder: str
    profile: str
    timestamp: int
    outcome: str
    reason: str
    minimum_bid: int | None
    selected_cap: int | None
    deposit: int | None


@dataclass(frozen=True, slots=True)
class TraceMaterialization:
    decisions: tuple[BidDecision, ...]
    bid_trace: tuple[BidEvent, ...]
    end_time: int


def default_catalog_path() -> Path:
    return Path(__file__).resolve().parents[2] / "scenarios" / "catalog-v1.json"


def _error(code: str, path: str, **context: object) -> ScenarioValidationError:
    return ScenarioValidationError(code, path, **context)


def _reject_float(value: str) -> None:
    raise _error("JSON_FLOAT_FORBIDDEN", "$", value=value)


def _validate_json_integer_encoding(value: Any, path: str = "$") -> None:
    if type(value) is int and path != "$.schemaVersion":
        raise _error("JSON_INTEGER_MUST_BE_DECIMAL_STRING", path, value=value)
    if isinstance(value, list):
        for index, item in enumerate(value):
            _validate_json_integer_encoding(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            _validate_json_integer_encoding(item, f"{path}.{key}")


def _convert_decimal_strings(value: Any, path: str = "$") -> Any:
    if isinstance(value, float):
        raise _error("JSON_FLOAT_FORBIDDEN", path, value=value)
    if isinstance(value, str) and _DECIMAL.fullmatch(value):
        return int(value)
    if isinstance(value, str) and _INTEGER_LIKE.fullmatch(value):
        raise _error("NON_CANONICAL_UINT_STRING", path, value=value)
    if isinstance(value, list):
        return [_convert_decimal_strings(item, f"{path}[{index}]") for index, item in enumerate(value)]
    if isinstance(value, dict):
        return {key: _convert_decimal_strings(item, f"{path}.{key}") for key, item in value.items()}
    return value


def _mapping(value: Any, path: str) -> Mapping[str, Any]:
    if not isinstance(value, dict):
        raise _error("EXPECTED_OBJECT", path)
    return value


def _list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise _error("EXPECTED_ARRAY", path)
    return value


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value:
        raise _error("EXPECTED_NON_EMPTY_STRING", path)
    return value


def _uint(value: Any, bits: int, path: str) -> int:
    try:
        return validate_typed_uint(value, bits, operation=path)
    except Exception as exc:
        raise _error("INVALID_UINT", path, value=value) from exc


def _parse_bidder(raw_value: Any, path: str) -> BidderDefinition:
    raw = _mapping(raw_value, path)
    required = {"id", "valuation", "budget", "profile"}
    allowed = required | {"fixedCap"}
    if set(raw) - allowed or required - set(raw):
        raise _error("INVALID_BIDDER_FIELDS", path, keys=sorted(raw))
    bidder_id = _string(raw["id"], f"{path}.id")
    valuation = _uint(raw["valuation"], 256, f"{path}.valuation")
    if valuation == 0:
        raise _error("ZERO_VALUATION", f"{path}.valuation")
    budget = None if raw["budget"] is None else _uint(raw["budget"], 256, f"{path}.budget")
    if budget == 0:
        raise _error("ZERO_BUDGET", f"{path}.budget")
    profile = _string(raw["profile"], f"{path}.profile")
    if profile not in PROFILE_KINDS:
        raise _error("UNKNOWN_PROFILE", f"{path}.profile", profile=profile)
    fixed_cap = None if raw.get("fixedCap") is None else _uint(raw["fixedCap"], 256, f"{path}.fixedCap")
    bidder = BidderDefinition(bidder_id, valuation, budget, profile, fixed_cap)
    if profile == PROFILE_FIXED_CAP_ONCE:
        if fixed_cap is None or fixed_cap == 0:
            raise _error("MISSING_FIXED_CAP", f"{path}.fixedCap")
        if fixed_cap > bidder.max_bid_cap:
            raise _error(
                "FIXED_CAP_ABOVE_MAX_BID_CAP",
                f"{path}.fixedCap",
                fixed_cap=fixed_cap,
                max_bid_cap=bidder.max_bid_cap,
            )
    elif fixed_cap is not None:
        raise _error("UNEXPECTED_FIXED_CAP", f"{path}.fixedCap")
    return bidder


def _parse_scenario(
    raw_value: Any,
    path: str,
    *,
    schema_version: int,
    catalog_version: str,
    economic_model_version: str,
    params: ParamsSnapshot,
) -> Scenario:
    raw = _mapping(raw_value, path)
    required = {
        "id",
        "family",
        "description",
        "startPrice",
        "startTime",
        "duration",
        "seller",
        "bidders",
        "reputations",
        "opportunities",
    }
    allowed = required | {"focalBidder"}
    if set(raw) - allowed or required - set(raw):
        raise _error("INVALID_SCENARIO_FIELDS", path, keys=sorted(raw))

    scenario_id = _string(raw["id"], f"{path}.id")
    family = _string(raw["family"], f"{path}.family")
    description = _string(raw["description"], f"{path}.description")
    start_price = _uint(raw["startPrice"], 256, f"{path}.startPrice")
    start_time = _uint(raw["startTime"], 64, f"{path}.startTime")
    duration = _uint(raw["duration"], 64, f"{path}.duration")
    if duration == 0:
        raise _error("ZERO_DURATION", f"{path}.duration")
    if duration < params.min_auction_duration:
        raise _error(
            "DURATION_BELOW_MINIMUM",
            f"{path}.duration",
            duration=duration,
            minimum=params.min_auction_duration,
        )
    try:
        checked_add(start_time, duration, bits=64, operation=f"{path}.initialEndTime")
    except Exception as exc:
        raise _error("INVALID_INITIAL_END_TIME", path) from exc
    seller = _string(raw["seller"], f"{path}.seller")

    bidders = tuple(
        _parse_bidder(item, f"{path}.bidders[{index}]")
        for index, item in enumerate(_list(raw["bidders"], f"{path}.bidders"))
    )
    if not bidders:
        raise _error("EMPTY_BIDDER_LIST", f"{path}.bidders")
    bidder_ids = [bidder.id for bidder in bidders]
    if len(bidder_ids) != len(set(bidder_ids)):
        raise _error("DUPLICATE_BIDDER_ID", f"{path}.bidders")
    if len(bidders) > params.max_participants:
        raise _error("TOO_MANY_CONFIGURED_BIDDERS", f"{path}.bidders")

    reputation_values = _mapping(raw["reputations"], f"{path}.reputations")
    if set(reputation_values) - set(bidder_ids):
        raise _error("UNKNOWN_REPUTATION_BIDDER", f"{path}.reputations")
    reputations = {
        bidder: _uint(value, 256, f"{path}.reputations.{bidder}")
        for bidder, value in reputation_values.items()
    }
    for bidder_id in bidder_ids:
        try:
            reputation_bps(reputations, bidder_id)
        except Exception as exc:
            raise _error("INVALID_REPUTATION", f"{path}.reputations", bidder=bidder_id) from exc

    opportunities: list[Opportunity] = []
    previous_offset = 0
    for index, item_value in enumerate(_list(raw["opportunities"], f"{path}.opportunities")):
        item_path = f"{path}.opportunities[{index}]"
        item = _mapping(item_value, item_path)
        if set(item) != {"offsetSeconds", "bidder"}:
            raise _error("INVALID_OPPORTUNITY_FIELDS", item_path, keys=sorted(item))
        offset = _uint(item["offsetSeconds"], 64, f"{item_path}.offsetSeconds")
        bidder_id = _string(item["bidder"], f"{item_path}.bidder")
        if bidder_id not in bidder_ids:
            raise _error("UNKNOWN_OPPORTUNITY_BIDDER", f"{item_path}.bidder", bidder=bidder_id)
        if index > 0 and offset < previous_offset:
            raise _error("UNORDERED_OPPORTUNITIES", item_path)
        try:
            checked_add(start_time, offset, bits=64, operation=f"{item_path}.timestamp")
        except Exception as exc:
            raise _error("INVALID_OPPORTUNITY_TIMESTAMP", item_path) from exc
        opportunities.append(Opportunity(offset, bidder_id))
        previous_offset = offset

    counts = {bidder_id: 0 for bidder_id in bidder_ids}
    for opportunity in opportunities:
        counts[opportunity.bidder] += 1
    for bidder in bidders:
        if bidder.profile == PROFILE_PERSISTENT_VALUE_CAPPED and counts[bidder.id] < 2:
            raise _error("PERSISTENT_PROFILE_NEEDS_MULTIPLE_OPPORTUNITIES", path, bidder=bidder.id)
        if bidder.profile != PROFILE_PERSISTENT_VALUE_CAPPED and counts[bidder.id] != 1:
            raise _error("ONCE_PROFILE_NEEDS_ONE_OPPORTUNITY", path, bidder=bidder.id)

    focal_bidder = raw.get("focalBidder")
    if focal_bidder is not None:
        focal_bidder = _string(focal_bidder, f"{path}.focalBidder")
        if focal_bidder not in bidder_ids:
            raise _error("UNKNOWN_FOCAL_BIDDER", f"{path}.focalBidder", bidder=focal_bidder)

    return Scenario(
        schema_version,
        catalog_version,
        economic_model_version,
        scenario_id,
        family,
        description,
        start_price,
        start_time,
        duration,
        seller,
        params,
        bidders,
        reputations,
        tuple(opportunities),
        focal_bidder,
    )


def load_catalog(path: Path | None = None) -> ScenarioCatalog:
    catalog_path = path or default_catalog_path()
    with catalog_path.open("r", encoding="utf-8") as handle:
        raw_root = json.load(handle, parse_float=_reject_float)
    _validate_json_integer_encoding(raw_root)
    root = _mapping(_convert_decimal_strings(raw_root), "$")
    if set(root) != {"schemaVersion", "catalogVersion", "economicModelVersion", "params", "scenarios"}:
        raise _error("INVALID_CATALOG_FIELDS", "$", keys=sorted(root))
    schema_version = root["schemaVersion"]
    if type(schema_version) is not int or schema_version != SCENARIO_SCHEMA_VERSION:
        raise _error("UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion", value=schema_version)
    catalog_version = _string(root["catalogVersion"], "$.catalogVersion")
    economic_model_version = _string(root["economicModelVersion"], "$.economicModelVersion")

    raw_params = _mapping(root["params"], "$.params")
    param_names = {field.name for field in fields(ParamsSnapshot)}
    if set(raw_params) != param_names:
        raise _error("INCOMPLETE_PARAM_SNAPSHOT", "$.params", keys=sorted(raw_params))
    try:
        params = ParamsSnapshot(**raw_params)
        validate_params(params)
    except Exception as exc:
        raise _error("INVALID_PARAM_SNAPSHOT", "$.params") from exc

    scenarios = tuple(
        _parse_scenario(
            item,
            f"$.scenarios[{index}]",
            schema_version=schema_version,
            catalog_version=catalog_version,
            economic_model_version=economic_model_version,
            params=params,
        )
        for index, item in enumerate(_list(root["scenarios"], "$.scenarios"))
    )
    if not scenarios:
        raise _error("EMPTY_SCENARIO_CATALOG", "$.scenarios")
    scenario_ids = [scenario.id for scenario in scenarios]
    if len(scenario_ids) != len(set(scenario_ids)):
        raise _error("DUPLICATE_SCENARIO_ID", "$.scenarios")
    return ScenarioCatalog(schema_version, catalog_version, economic_model_version, params, scenarios)


def load_scenario(scenario_id: str, path: Path | None = None) -> Scenario:
    catalog = load_catalog(path)
    for scenario in catalog.scenarios:
        if scenario.id == scenario_id:
            return scenario
    raise _error("UNKNOWN_SCENARIO_ID", "$.scenarios", scenario_id=scenario_id)


def materialize_bid_trace(
    scenario: Scenario,
    *,
    source_commit: str | None = None,
) -> TraceMaterialization:
    """Use Lot B prefix replay to turn deterministic opportunities into valid bids."""

    config = AuctionConfig(
        start_price=scenario.start_price,
        start_time=scenario.start_time,
        duration=scenario.duration,
        params=scenario.params,
        finalization_time=None,
        source_commit=source_commit,
        seller=scenario.seller,
    )
    bidders = scenario.bidder_by_id
    accepted: list[BidEvent] = []
    decisions: list[BidDecision] = []
    consumed_once: set[str] = set()

    for index, opportunity in enumerate(scenario.opportunities):
        current = simulate_auction(config, tuple(accepted), scenario.reputations)
        bidder = bidders[opportunity.bidder]
        timestamp = checked_add(
            scenario.start_time,
            opportunity.offset_seconds,
            bits=64,
            operation="scenario-opportunity-timestamp",
        )
        if timestamp >= current.state.end_time:
            decisions.append(
                BidDecision(index, bidder.id, bidder.profile, timestamp, "no-bid", "auction-ended", None, None, None)
            )
            continue
        minimum = minimum_next_bid(
            scenario.start_price,
            current.state.highest_bid,
            scenario.params.min_bid_increment_bps,
        )
        if bidder.profile != PROFILE_PERSISTENT_VALUE_CAPPED and bidder.id in consumed_once:
            decisions.append(
                BidDecision(
                    index,
                    bidder.id,
                    bidder.profile,
                    timestamp,
                    "no-bid",
                    "profile-already-used",
                    minimum,
                    None,
                    None,
                )
            )
            continue
        if bidder.profile != PROFILE_PERSISTENT_VALUE_CAPPED:
            consumed_once.add(bidder.id)
        if bidder.profile == PROFILE_PERSISTENT_VALUE_CAPPED and current.state.highest_bidder == bidder.id:
            decisions.append(
                BidDecision(index, bidder.id, bidder.profile, timestamp, "no-bid", "already-leader", minimum, None, None)
            )
            continue

        selected_cap = bidder.fixed_cap if bidder.profile == PROFILE_FIXED_CAP_ONCE else minimum
        if selected_cap is None:
            raise _error("MISSING_SELECTED_CAP", scenario.id, bidder=bidder.id)
        if selected_cap > bidder.max_bid_cap:
            decisions.append(
                BidDecision(index, bidder.id, bidder.profile, timestamp, "no-bid", "max-bid-cap", minimum, None, None)
            )
            continue
        if selected_cap < minimum:
            decisions.append(
                BidDecision(
                    index,
                    bidder.id,
                    bidder.profile,
                    timestamp,
                    "no-bid",
                    "fixed-cap-below-minimum",
                    minimum,
                    selected_cap,
                    None,
                )
            )
            continue

        previous_cap = current.bidders[bidder.id].max_cap if bidder.id in current.bidders else 0
        if selected_cap <= previous_cap:
            decisions.append(
                BidDecision(
                    index,
                    bidder.id,
                    bidder.profile,
                    timestamp,
                    "no-bid",
                    "cap-not-increased",
                    minimum,
                    selected_cap,
                    None,
                )
            )
            continue
        deposit = cap_delta(previous_cap, selected_cap)
        event = BidEvent(bidder.id, selected_cap, deposit, timestamp)
        try:
            simulate_auction(config, tuple((*accepted, event)), scenario.reputations)
        except AuctionSimulationRevert as exc:
            raise _error(
                "BASELINE_REJECTED_GENERATED_BID",
                scenario.id,
                bidder=bidder.id,
                baseline_code=exc.code,
            ) from exc
        accepted.append(event)
        decisions.append(
            BidDecision(index, bidder.id, bidder.profile, timestamp, "bid", "accepted", minimum, selected_cap, deposit)
        )

    final_prefix = simulate_auction(config, tuple(accepted), scenario.reputations)
    return TraceMaterialization(tuple(decisions), tuple(accepted), final_prefix.state.end_time)


def scenario_ids(catalog: ScenarioCatalog) -> tuple[str, ...]:
    return tuple(sorted(scenario.id for scenario in catalog.scenarios))


def configured_max_bid_caps(bidders: Sequence[BidderDefinition]) -> dict[str, int]:
    return {bidder.id: bidder.max_bid_cap for bidder in bidders}
