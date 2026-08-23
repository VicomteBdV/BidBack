"""Strict schema-v2 golden-vector loading and parity projection."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Mapping

from .baseline import (
    candidate_distribution_pool,
    cap_delta,
    default_params,
    final_score,
    financial_engagement,
    gross_premium,
    interaction_intensity,
    minimum_next_bid,
    net_premium,
    protocol_fee,
    refundable_amount,
    seller_proceeds,
    time_engagement,
    weighted_score,
)
from .solidity_math import checked_add, checked_div, checked_mul, checked_sub
from .types import (
    AuctionConfig,
    BidEvent,
    FixtureValidationError,
    ParamsSnapshot,
    SimulationResult,
)

SCHEMA_VERSION = 2
FIXTURE_FILENAMES = (
    "golden-v1.json",
    "canonical-anvil.json",
    "canonical-base-sepolia.json",
    "edge-cases.json",
)
FIXTURE_KINDS = {"pure-function", "state-machine", "settlement-projection", "revert"}
FIXTURE_FUNCTIONS = {
    "financial_engagement",
    "time_engagement",
    "interaction_intensity",
    "score_with_reputation",
}
PARAM_FIELDS = {
    "bidbackFeeBps": "bidback_fee_bps",
    "redistributionBps": "redistribution_bps",
    "minParticipants": "min_participants",
    "alphaBps": "alpha_bps",
    "betaBps": "beta_bps",
    "gammaBps": "gamma_bps",
    "minBidIncrementBps": "min_bid_increment_bps",
    "perUserRewardCapBps": "per_user_reward_cap_bps",
    "maxParticipants": "max_participants",
    "maxInteractionCount": "max_interaction_count",
    "minAuctionDuration": "min_auction_duration",
    "antiSnipeWindow": "anti_snipe_window",
    "antiSnipeExtension": "anti_snipe_extension",
    "maxAntiSnipeExtensions": "max_anti_snipe_extensions",
    "minExposure": "min_exposure",
    "minPremiumNet": "min_premium_net",
    "efCap": "ef_cap",
    "etCap": "et_cap",
    "iiCap": "ii_cap",
}
EXPECTED_FIELDS = {
    "minimumBid",
    "capDelta",
    "finalPrice",
    "grossPremium",
    "feeAmount",
    "netPremium",
    "candidatePool",
    "EF",
    "ET",
    "II",
    "weightedScore",
    "reputation",
    "finalScore",
    "totalScore",
    "rawReward",
    "perUserCap",
    "reward",
    "assignedDistribution",
    "refunds",
    "sellerProceeds",
    "finalLiabilities",
    "finalEscrowAfterAllClaims",
    "escrowSettlementOpened",
    "distributionOpened",
    "nftClaimant",
    "initialEndTimeOffsetSeconds",
    "endTimeAfterFirstExtensionOffsetSeconds",
    "revert",
    "revertClass",
}
_DECIMAL = re.compile(r"0|[1-9][0-9]*\Z")
_SOURCE_TEST = re.compile(r"EconomicModelParityTest\.(test[A-Za-z0-9_]+)\Z")


@dataclass(frozen=True, slots=True)
class FixtureVector:
    id: str
    description: str
    source_test: str
    fixture_kind: str
    fixture_function: str | None
    verification: Mapping[str, Any]
    inputs: Mapping[str, Any]
    params: Mapping[str, Any]
    reputations: Mapping[str, int] | None
    participants: tuple[Any, ...]
    bid_trace: tuple[Mapping[str, Any], ...]
    expected: Mapping[str, Any]
    source_file: Path

    @property
    def recomputable_fields(self) -> frozenset[str]:
        configured = self.verification["recompute"]
        if configured == "all-non-null":
            return frozenset(key for key, value in self.expected.items() if value is not None)
        return frozenset(configured)

    @property
    def retained_fields(self) -> frozenset[str]:
        return frozenset(self.verification["retained"])


def _error(code: str, path: str, **context: Any) -> FixtureValidationError:
    return FixtureValidationError(code, phase="fixture-load", operation=path, context=context)


def _reject_float(value: str) -> None:
    raise _error("JSON_FLOAT_FORBIDDEN", "json", value=value)


def _validate_json_integer_encoding(value: Any, path: str = "$") -> None:
    if type(value) is int and path != "$.schemaVersion":
        raise _error("JSON_INTEGER_MUST_BE_DECIMAL_STRING", path, value=value)
    if isinstance(value, list):
        for index, item in enumerate(value):
            _validate_json_integer_encoding(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            _validate_json_integer_encoding(item, f"{path}.{key}")


def _convert(value: Any, path: str = "$") -> Any:
    if isinstance(value, float):
        raise _error("JSON_FLOAT_FORBIDDEN", path, value=value)
    if isinstance(value, str) and _DECIMAL.fullmatch(value):
        return int(value)
    if isinstance(value, str) and re.fullmatch(r"-?[0-9]+", value):
        raise _error("NON_CANONICAL_UINT_STRING", path, value=value)
    if isinstance(value, list):
        return [_convert(item, f"{path}[{index}]") for index, item in enumerate(value)]
    if isinstance(value, dict):
        return {key: _convert(item, f"{path}.{key}") for key, item in value.items()}
    return value


def _solidity_tests(path: Path) -> set[str]:
    source = path.read_text(encoding="utf-8")
    return set(re.findall(r"\bfunction\s+(test[A-Za-z0-9_]+)\s*\(", source))


def _validate_verification(vector: Mapping[str, Any], path: str) -> None:
    verification = vector.get("verification")
    expected = vector.get("expected")
    if not isinstance(verification, dict) or not isinstance(expected, dict):
        raise _error("INVALID_VERIFICATION", path)
    if set(verification) != {"recompute", "retained", "nullPolicy"}:
        raise _error("INVALID_VERIFICATION_KEYS", path, keys=sorted(verification))
    if verification["nullPolicy"] != "preserve":
        raise _error("INVALID_NULL_POLICY", path)
    recompute = verification["recompute"]
    if recompute != "all-non-null" and not (
        isinstance(recompute, list) and all(isinstance(item, str) for item in recompute)
    ):
        raise _error("INVALID_RECOMPUTE_SCOPE", path)
    retained = verification["retained"]
    if not isinstance(retained, list) or not all(isinstance(item, str) for item in retained):
        raise _error("INVALID_RETAINED_SCOPE", path)
    non_null = {key for key, value in expected.items() if value is not None}
    recomputed = non_null if recompute == "all-non-null" else set(recompute)
    retained_set = set(retained)
    if recomputed & retained_set or recomputed | retained_set != non_null:
        raise _error(
            "INCOMPLETE_VERIFICATION_SCOPE",
            path,
            non_null=sorted(non_null),
            recompute=sorted(recomputed),
            retained=sorted(retained_set),
        )


def _validate_vector(
    raw: Mapping[str, Any],
    source_file: Path,
    index: int,
    known_tests: set[str],
) -> FixtureVector:
    path = f"{source_file.name}.vectors[{index}]"
    required = {"id", "description", "sourceTest", "fixtureKind", "verification", "inputs", "params", "participants", "bidTrace", "expected"}
    missing = required - set(raw)
    if missing:
        raise _error("MISSING_VECTOR_FIELDS", path, missing=sorted(missing))
    kind = raw["fixtureKind"]
    if kind not in FIXTURE_KINDS:
        raise _error("UNKNOWN_FIXTURE_KIND", path, fixture_kind=kind)
    source_match = _SOURCE_TEST.fullmatch(raw["sourceTest"])
    if source_match is None or source_match.group(1) not in known_tests:
        raise _error("UNKNOWN_SOURCE_TEST", path, source_test=raw["sourceTest"])
    if not isinstance(raw["expected"], dict) or set(raw["expected"]) - EXPECTED_FIELDS:
        raise _error("UNKNOWN_EXPECTED_FIELD", path)
    _validate_verification(raw, path)
    function_name = raw.get("fixtureFunction")
    if kind in {"pure-function", "revert"} and function_name not in FIXTURE_FUNCTIONS:
        raise _error("MISSING_FIXTURE_FUNCTION", path)
    if kind == "pure-function":
        expected_output = {
            "financial_engagement": "EF",
            "time_engagement": "ET",
            "interaction_intensity": "II",
            "score_with_reputation": "finalScore",
        }[function_name]
        if expected_output not in raw["expected"]:
            raise _error("MISSING_FUNCTION_EXPECTED", path, field=expected_output)
    if kind == "revert" and not {"revert", "revertClass"}.issubset(raw["expected"]):
        raise _error("MISSING_REVERT_EXPECTED", path)
    if kind == "state-machine":
        inputs = raw["inputs"]
        needed = {"startPrice", "startTime", "initialDurationSeconds", "finalizationOffsetSeconds"}
        if not isinstance(inputs, dict) or needed - set(inputs):
            raise _error("INCOMPLETE_STATE_INPUTS", path, missing=sorted(needed - set(inputs)))
        if not isinstance(raw["params"], dict) or set(raw["params"]) != set(PARAM_FIELDS):
            raise _error("INCOMPLETE_PARAM_SNAPSHOT", path)
        if "reputations" not in raw or not isinstance(raw["reputations"], dict):
            raise _error("INCOMPLETE_REPUTATIONS", path)
        if not isinstance(raw["participants"], list) or not all(
            isinstance(item, str) for item in raw["participants"]
        ):
            raise _error("INVALID_STATE_PARTICIPANTS", path)
        for bid_index, bid in enumerate(raw["bidTrace"]):
            bid_required = {"bidder", "newCap", "capDelta", "timestampOffsetSeconds"}
            if not isinstance(bid, dict) or bid_required - set(bid):
                raise _error("INCOMPLETE_BID_TRACE", f"{path}.bidTrace[{bid_index}]")
        if "finalPrice" not in raw["expected"]:
            raise _error("MISSING_STATE_EXPECTED", path, field="finalPrice")
    if kind == "settlement-projection":
        inputs = raw["inputs"]
        if not isinstance(inputs, dict) or {"startPrice", "initialDurationSeconds"} - set(inputs):
            raise _error("INCOMPLETE_PROJECTION_INPUTS", path)
        if not isinstance(raw["params"], dict) or set(raw["params"]) != set(PARAM_FIELDS):
            raise _error("INCOMPLETE_PARAM_SNAPSHOT", path)
        if raw.get("reputations", "missing") is not None:
            raise _error("PROJECTED_REPUTATION_MUST_BE_NULL", path)
        for bid_index, bid in enumerate(raw["bidTrace"]):
            if not isinstance(bid, dict) or {"bidder", "newCap", "capDelta", "timestampUtc"} - set(bid):
                raise _error("INCOMPLETE_PROJECTED_BID", f"{path}.bidTrace[{bid_index}]")
        required_projection = {
            "capDelta",
            "finalPrice",
            "grossPremium",
            "feeAmount",
            "netPremium",
            "candidatePool",
            "assignedDistribution",
            "refunds",
            "sellerProceeds",
            "finalLiabilities",
        }
        if required_projection - set(raw["expected"]):
            raise _error("MISSING_PROJECTION_EXPECTED", path)
    return FixtureVector(
        raw["id"],
        raw["description"],
        raw["sourceTest"],
        kind,
        function_name,
        raw["verification"],
        raw["inputs"],
        raw["params"],
        raw.get("reputations"),
        tuple(raw["participants"]),
        tuple(raw["bidTrace"]),
        raw["expected"],
        source_file,
    )


def load_fixtures(
    fixture_directory: Path | None = None,
    solidity_test_path: Path | None = None,
) -> tuple[FixtureVector, ...]:
    model_root = Path(__file__).resolve().parents[2]
    fixture_directory = fixture_directory or model_root / "fixtures"
    solidity_test_path = solidity_test_path or model_root.parent / "test" / "EconomicModelParity.t.sol"
    known_tests = _solidity_tests(solidity_test_path)
    vectors: list[FixtureVector] = []
    seen: set[str] = set()
    seen_sources: set[str] = set()
    for filename in FIXTURE_FILENAMES:
        path = fixture_directory / filename
        with path.open("r", encoding="utf-8") as handle:
            raw_root = json.load(handle, parse_float=_reject_float)
        _validate_json_integer_encoding(raw_root)
        root = _convert(raw_root)
        if root.get("schemaVersion") != SCHEMA_VERSION:
            raise _error("UNSUPPORTED_SCHEMA_VERSION", filename, value=root.get("schemaVersion"))
        if not isinstance(root.get("vectors"), list):
            raise _error("INVALID_VECTOR_COLLECTION", filename)
        for index, raw in enumerate(root["vectors"]):
            vector = _validate_vector(raw, path, index, known_tests)
            if vector.id in seen:
                raise _error("DUPLICATE_VECTOR_ID", filename, vector_id=vector.id)
            if vector.source_test in seen_sources:
                raise _error("DUPLICATE_SOURCE_TEST", filename, source_test=vector.source_test)
            seen.add(vector.id)
            seen_sources.add(vector.source_test)
            vectors.append(vector)
    expected_sources = {f"EconomicModelParityTest.{name}" for name in known_tests}
    if seen_sources != expected_sources:
        raise _error(
            "SOURCE_TEST_COVERAGE_MISMATCH",
            "fixtures",
            missing=sorted(expected_sources - seen_sources),
            unknown=sorted(seen_sources - expected_sources),
        )
    return tuple(vectors)


def params_from_fixture(values: Mapping[str, int]) -> ParamsSnapshot:
    if set(values) != set(PARAM_FIELDS):
        raise _error("INCOMPLETE_PARAM_SNAPSHOT", "params")
    return ParamsSnapshot(**{attribute: values[key] for key, attribute in PARAM_FIELDS.items()})


def state_case(vector: FixtureVector) -> tuple[AuctionConfig, tuple[BidEvent, ...], Mapping[str, int]]:
    if vector.fixture_kind != "state-machine":
        raise _error("NOT_STATE_MACHINE", vector.id)
    start = vector.inputs["startTime"]
    finalization_offset = vector.inputs["finalizationOffsetSeconds"]
    finalization = None if finalization_offset is None else checked_add(start, finalization_offset)
    config = AuctionConfig(
        start_price=vector.inputs["startPrice"],
        start_time=start,
        duration=vector.inputs["initialDurationSeconds"],
        params=params_from_fixture(vector.params),
        finalization_time=finalization,
        seller=vector.inputs.get("seller", "SELLER"),
    )
    bids = tuple(
        BidEvent(
            bidder=bid["bidder"],
            new_cap=bid["newCap"],
            deposit=bid["capDelta"],
            timestamp=checked_add(start, bid["timestampOffsetSeconds"]),
        )
        for bid in vector.bid_trace
    )
    return config, bids, vector.reputations or {}


def _shape(value: Any, expected: Any, *, winner: str | None = None) -> Any:
    if expected is None:
        return None
    if isinstance(expected, dict) and isinstance(value, Mapping):
        return {key: _shape(value.get(key), item, winner=winner) for key, item in expected.items()}
    if isinstance(expected, list):
        return list(value)
    if not isinstance(expected, (dict, list)) and isinstance(value, (list, tuple)) and len(value) == 1:
        return value[0]
    if not isinstance(expected, (dict, list)) and isinstance(value, Mapping):
        candidates = [item for key, item in value.items() if key != winner]
        if not candidates:
            candidates = list(value.values())
        if len(set(candidates)) == 1:
            return candidates[0]
    return value


def _partial_params(values: Mapping[str, int]) -> ParamsSnapshot:
    updates = {PARAM_FIELDS[key]: value for key, value in values.items() if key in PARAM_FIELDS}
    return replace(default_params(), **updates)


def pure_function_projection(vector: FixtureVector) -> dict[str, Any]:
    function_name = vector.fixture_function
    if function_name == "financial_engagement":
        values = [
            financial_engagement(case["maxCap"], case["finalPrice"], case["efCap"])
            for case in vector.inputs["cases"]
        ]
        return {"EF": values}
    if function_name == "time_engagement":
        values = [
            time_engagement(
                first_bid,
                vector.inputs["startTime"],
                vector.inputs["initialEndTime"],
                vector.params["minExposure"],
                vector.params["etCap"],
            )
            for first_bid in vector.inputs["firstBidTimes"]
        ]
        return {"ET": values}
    if function_name == "interaction_intensity":
        values = [
            interaction_intensity(
                count,
                vector.params["maxInteractionCount"],
                vector.params["iiCap"],
            )
            for count in vector.inputs["significantOverbids"]
        ]
        return {"II": values}
    if function_name == "score_with_reputation":
        bidder = vector.inputs["bidder"]
        p = _partial_params(vector.params)
        ef = financial_engagement(vector.inputs["losingCap"], vector.inputs["finalPrice"], p.ef_cap)
        weighted = weighted_score(ef, 0, 0, p)
        reputations = vector.inputs["reputationCases"]
        return {
            "EF": {bidder: ef},
            "weightedScore": {bidder: weighted},
            "reputation": reputations,
            "finalScore": [final_score(weighted, value) for value in reputations],
        }
    raise _error("UNKNOWN_FIXTURE_FUNCTION", vector.id, fixture_function=function_name)


def settlement_projection(vector: FixtureVector) -> dict[str, Any]:
    """Recompute only time-independent Base Sepolia accounting fields."""

    if vector.fixture_kind != "settlement-projection":
        raise _error("NOT_SETTLEMENT_PROJECTION", vector.id)
    params = params_from_fixture(vector.params)
    caps: dict[str, int] = {}
    deltas: list[int] = []
    total_deposits = 0
    highest_before = 0
    for bid in vector.bid_trace:
        previous = caps.get(bid["bidder"], 0)
        delta = cap_delta(previous, bid["newCap"])
        if delta != bid["capDelta"]:
            raise _error("CAP_DELTA_DIVERGENCE", vector.id, bidder=bid["bidder"])
        caps[bid["bidder"]] = bid["newCap"]
        deltas.append(delta)
        total_deposits = checked_add(total_deposits, delta)
        observed = checked_sub(bid["newCap"], highest_before, operation="projected-observed-lift")
        premium_floor = max(highest_before, vector.inputs["startPrice"])
        premium_lift = (
            checked_sub(bid["newCap"], premium_floor, operation="projected-premium-lift")
            if bid["newCap"] > premium_floor
            else 0
        )
        if "observedPriceLift" in bid and bid["observedPriceLift"] != observed:
            raise _error("OBSERVED_LIFT_DIVERGENCE", vector.id, bidder=bid["bidder"])
        if "premiumLift" in bid and bid["premiumLift"] != premium_lift:
            raise _error("PREMIUM_LIFT_DIVERGENCE", vector.id, bidder=bid["bidder"])
        highest_before = bid["newCap"]
    winners = [item["role"] for item in vector.participants if item.get("outcome") == "winner"]
    if len(winners) != 1:
        raise _error("INVALID_PROJECTED_WINNER", vector.id)
    winner = winners[0]
    final_price = caps[winner]
    premium_gross = gross_premium(final_price, vector.inputs["startPrice"])
    fee = protocol_fee(premium_gross, params.bidback_fee_bps)
    premium_net = net_premium(premium_gross, fee)
    pool = candidate_distribution_pool(
        premium_net,
        len(vector.participants),
        vector.inputs["initialDurationSeconds"],
        params,
    )
    per_user_cap = checked_div(
        checked_mul(pool, params.per_user_reward_cap_bps),
        10_000,
    )
    assigned = vector.expected["assignedDistribution"]
    refunds = {
        role: refundable_amount(caps[role], role, winner, final_price)
        for role in caps
    }
    seller = seller_proceeds(final_price, fee, assigned)
    liabilities = 0
    for amount in refunds.values():
        liabilities = checked_add(liabilities, amount, operation="projected-refunds")
    liabilities = checked_add(liabilities, seller, operation="projected-liabilities")
    liabilities = checked_add(liabilities, fee, operation="projected-liabilities")
    liabilities = checked_add(liabilities, assigned, operation="projected-liabilities")
    return {
        "capDelta": deltas,
        "finalPrice": final_price,
        "grossPremium": premium_gross,
        "feeAmount": fee,
        "netPremium": premium_net,
        "candidatePool": pool,
        "perUserCap": per_user_cap,
        "refunds": refunds,
        "sellerProceeds": seller,
        "finalLiabilities": liabilities,
        "totalDeposits": total_deposits,
    }


def simulation_projection(vector: FixtureVector, result: SimulationResult) -> dict[str, Any]:
    """Produce fixture-shaped values without consulting a vector ID."""

    settlement = result.settlement
    winner = result.state.highest_bidder
    minimums = [item.minimum_bid for item in result.bid_audit]
    deltas = [item.new_cap - item.previous_cap for item in result.bid_audit]
    components = result.scores
    final_price = settlement.final_price if settlement is not None else result.state.highest_bid
    projected_per_user_cap = (
        checked_div(
            checked_mul(settlement.candidate_pool, result.state.params.per_user_reward_cap_bps),
            10_000,
        )
        if settlement is not None and settlement.escrow_opened
        else result.allocation.per_user_cap
    )
    projection: dict[str, Any] = {
        "minimumBid": minimums or minimum_next_bid(
            result.state.start_price, result.state.highest_bid, result.state.params.min_bid_increment_bps
        ),
        "capDelta": deltas,
        "finalPrice": final_price,
        "grossPremium": settlement.gross_premium if settlement else gross_premium(final_price, result.state.start_price),
        "feeAmount": settlement.fee_amount if settlement else None,
        "netPremium": settlement.net_premium if settlement else None,
        "candidatePool": settlement.candidate_pool if settlement else None,
        "EF": {key: value.financial_engagement for key, value in components.items()},
        "ET": {key: value.time_engagement for key, value in components.items()},
        "II": {key: value.interaction_intensity for key, value in components.items()},
        "weightedScore": {key: value.weighted_score for key, value in components.items()},
        "reputation": {key: value.reputation_bps for key, value in components.items()},
        "finalScore": {key: value.final_score for key, value in components.items()},
        "totalScore": result.allocation.total_score,
        "rawReward": result.allocation.raw_rewards,
        "perUserCap": projected_per_user_cap,
        "reward": result.allocation.rewards,
        "assignedDistribution": result.allocation.assigned,
        "refunds": result.accounting.refunds,
        "sellerProceeds": settlement.seller_proceeds if settlement else None,
        "finalLiabilities": result.accounting.total_liabilities,
        "finalEscrowAfterAllClaims": result.accounting.remaining_after_all_claims,
        "escrowSettlementOpened": settlement.escrow_opened if settlement else False,
        "distributionOpened": settlement.distribution_opened if settlement else False,
        "nftClaimant": settlement.nft_claimant if settlement else None,
        "initialEndTimeOffsetSeconds": result.state.initial_end_time - result.state.start_time,
        "endTimeAfterFirstExtensionOffsetSeconds": next(
            (
                audit.end_time_after - result.state.start_time
                for audit in result.bid_audit
                if audit.end_time_after != audit.end_time_before
            ),
            None,
        ),
    }
    return {
        key: _shape(projection.get(key), expected, winner=winner)
        for key, expected in vector.expected.items()
    }


def assert_recomputable_matches(vector: FixtureVector, actual: Mapping[str, Any]) -> frozenset[str]:
    consumed: set[str] = set()
    for field in vector.recomputable_fields:
        if field not in actual:
            raise _error("UNCONSUMED_EXPECTED_FIELD", vector.id, field=field)
        if actual[field] != vector.expected[field]:
            raise _error(
                "GOLDEN_VECTOR_DIVERGENCE",
                vector.id,
                field=field,
                expected=vector.expected[field],
                actual=actual[field],
            )
        consumed.add(field)
    if consumed != set(vector.recomputable_fields):
        raise _error("UNCONSUMED_EXPECTED_FIELD", vector.id)
    return frozenset(consumed)
