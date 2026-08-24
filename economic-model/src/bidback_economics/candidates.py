"""Strict Lot E candidate-model catalogue loading."""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Mapping, TypeVar

CANDIDATE_SCHEMA_VERSION = 1
CANDIDATE_REPORT_SCHEMA_VERSION = 1
CANDIDATE_CATALOG_VERSION = "candidate-catalog-v1"
BASELINE_ECONOMIC_MODEL_VERSION = "solidity-baseline-v1"


class AllocationSubject(str, Enum):
    BIDDER_IDENTITY = "bidder-identity"


class PoolPolicy(str, Enum):
    NET_PREMIUM_THRESHOLD = "net-premium-threshold"


class EligibilityPolicy(str, Enum):
    POSITIVE_CONTRIBUTION = "positive-contribution"


class ContributionPolicy(str, Enum):
    MECHANICAL_PREMIUM_LIFT = "mechanical-premium-lift"
    IDENTITY_COUNTERFACTUAL_POLICY_REPLAY = "identity-counterfactual-policy-replay"


class AllocationPolicy(str, Enum):
    NORMALIZED = "normalized"
    GROSS_PREMIUM_DIRECT = "gross-premium-direct"


class RewardCapPolicy(str, Enum):
    BASELINE_PER_USER = "baseline-per-user"
    NONE = "none"


class SecondaryWeightPolicy(str, Enum):
    BASELINE_FINAL_SCORE = "baseline-final-score"
    NONE = "none"


PolicySignature = tuple[
    ContributionPolicy,
    AllocationPolicy,
    RewardCapPolicy,
    SecondaryWeightPolicy,
]

SUPPORTED_POLICY_COMBINATIONS: frozenset[PolicySignature] = frozenset(
    {
        (
            ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
            AllocationPolicy.NORMALIZED,
            RewardCapPolicy.BASELINE_PER_USER,
            SecondaryWeightPolicy.NONE,
        ),
        (
            ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
            AllocationPolicy.GROSS_PREMIUM_DIRECT,
            RewardCapPolicy.NONE,
            SecondaryWeightPolicy.NONE,
        ),
        (
            ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
            AllocationPolicy.NORMALIZED,
            RewardCapPolicy.NONE,
            SecondaryWeightPolicy.NONE,
        ),
        (
            ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
            AllocationPolicy.NORMALIZED,
            RewardCapPolicy.BASELINE_PER_USER,
            SecondaryWeightPolicy.BASELINE_FINAL_SCORE,
        ),
        (
            ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY,
            AllocationPolicy.NORMALIZED,
            RewardCapPolicy.NONE,
            SecondaryWeightPolicy.NONE,
        ),
    }
)


class CandidateValidationError(ValueError):
    """Structured failure for a Lot E candidate catalogue."""

    def __init__(self, code: str, path: str, **context: object) -> None:
        self.code = code
        self.path = path
        self.context = context
        detail = f"{code} at {path}"
        if context:
            detail = f"{detail}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class CandidateDefinition:
    id: str
    description: str
    allocation_subject: AllocationSubject
    pool_policy: PoolPolicy
    eligibility_policy: EligibilityPolicy
    contribution_policy: ContributionPolicy
    allocation_policy: AllocationPolicy
    reward_cap_policy: RewardCapPolicy
    secondary_weight_policy: SecondaryWeightPolicy

    @property
    def policy_signature(self) -> PolicySignature:
        return (
            self.contribution_policy,
            self.allocation_policy,
            self.reward_cap_policy,
            self.secondary_weight_policy,
        )


@dataclass(frozen=True, slots=True)
class CandidateCatalog:
    schema_version: int
    report_schema_version: int
    catalog_version: str
    baseline_economic_model_version: str
    candidates: tuple[CandidateDefinition, ...]

    @property
    def candidate_by_id(self) -> dict[str, CandidateDefinition]:
        return {candidate.id: candidate for candidate in self.candidates}


def default_catalog_path() -> Path:
    return Path(__file__).resolve().parents[2] / "candidates" / "catalog-v1.json"


def _error(code: str, path: str, **context: object) -> CandidateValidationError:
    return CandidateValidationError(code, path, **context)


def _reject_float(value: str) -> None:
    raise _error("JSON_FLOAT_FORBIDDEN", "$", value=value)


def _reject_constant(value: str) -> None:
    raise _error("JSON_NONFINITE_NUMBER_FORBIDDEN", "$", value=value)


def _validate_json_integer_encoding(value: Any, path: str = "$") -> None:
    if type(value) is int and path not in {"$.schemaVersion", "$.reportSchemaVersion"}:
        raise _error("JSON_INTEGER_FIELD_FORBIDDEN", path, value=value)
    if isinstance(value, list):
        for index, item in enumerate(value):
            _validate_json_integer_encoding(item, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            _validate_json_integer_encoding(item, f"{path}.{key}")


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


EnumType = TypeVar("EnumType", bound=Enum)


def _enum(enum_type: type[EnumType], value: Any, path: str) -> EnumType:
    text = _string(value, path)
    try:
        return enum_type(text)
    except ValueError as exc:
        raise _error(
            "UNKNOWN_POLICY_VALUE",
            path,
            value=text,
            supported=sorted(member.value for member in enum_type),
        ) from exc


def _parse_candidate(value: Any, path: str) -> CandidateDefinition:
    raw = _mapping(value, path)
    required = {
        "id",
        "description",
        "allocationSubject",
        "poolPolicy",
        "eligibilityPolicy",
        "contributionPolicy",
        "allocationPolicy",
        "rewardCapPolicy",
        "secondaryWeightPolicy",
    }
    if set(raw) != required:
        raise _error("INVALID_CANDIDATE_FIELDS", path, keys=sorted(raw))
    candidate = CandidateDefinition(
        id=_string(raw["id"], f"{path}.id"),
        description=_string(raw["description"], f"{path}.description"),
        allocation_subject=_enum(
            AllocationSubject,
            raw["allocationSubject"],
            f"{path}.allocationSubject",
        ),
        pool_policy=_enum(PoolPolicy, raw["poolPolicy"], f"{path}.poolPolicy"),
        eligibility_policy=_enum(
            EligibilityPolicy,
            raw["eligibilityPolicy"],
            f"{path}.eligibilityPolicy",
        ),
        contribution_policy=_enum(
            ContributionPolicy,
            raw["contributionPolicy"],
            f"{path}.contributionPolicy",
        ),
        allocation_policy=_enum(
            AllocationPolicy,
            raw["allocationPolicy"],
            f"{path}.allocationPolicy",
        ),
        reward_cap_policy=_enum(
            RewardCapPolicy,
            raw["rewardCapPolicy"],
            f"{path}.rewardCapPolicy",
        ),
        secondary_weight_policy=_enum(
            SecondaryWeightPolicy,
            raw["secondaryWeightPolicy"],
            f"{path}.secondaryWeightPolicy",
        ),
    )
    if candidate.policy_signature not in SUPPORTED_POLICY_COMBINATIONS:
        raise _error(
            "UNSUPPORTED_POLICY_COMBINATION",
            path,
            contribution_policy=candidate.contribution_policy.value,
            allocation_policy=candidate.allocation_policy.value,
            reward_cap_policy=candidate.reward_cap_policy.value,
            secondary_weight_policy=candidate.secondary_weight_policy.value,
        )
    return candidate


def load_catalog(path: Path | None = None) -> CandidateCatalog:
    catalog_path = path or default_catalog_path()
    with catalog_path.open("r", encoding="utf-8") as handle:
        raw_root = json.load(
            handle,
            parse_float=_reject_float,
            parse_constant=_reject_constant,
        )
    root = _mapping(raw_root, "$")
    if type(root.get("schemaVersion")) is not int:
        raise _error("SCHEMA_VERSION_MUST_BE_JSON_INTEGER", "$.schemaVersion")
    if type(root.get("reportSchemaVersion")) is not int:
        raise _error("REPORT_SCHEMA_VERSION_MUST_BE_JSON_INTEGER", "$.reportSchemaVersion")
    _validate_json_integer_encoding(root)
    required = {
        "schemaVersion",
        "reportSchemaVersion",
        "catalogVersion",
        "baselineEconomicModelVersion",
        "candidates",
    }
    if set(root) != required:
        raise _error("INVALID_CATALOG_FIELDS", "$", keys=sorted(root))
    if root["schemaVersion"] != CANDIDATE_SCHEMA_VERSION:
        raise _error(
            "UNSUPPORTED_SCHEMA_VERSION",
            "$.schemaVersion",
            value=root["schemaVersion"],
        )
    if root["reportSchemaVersion"] != CANDIDATE_REPORT_SCHEMA_VERSION:
        raise _error(
            "UNSUPPORTED_REPORT_SCHEMA_VERSION",
            "$.reportSchemaVersion",
            value=root["reportSchemaVersion"],
        )
    catalog_version = _string(root["catalogVersion"], "$.catalogVersion")
    if catalog_version != CANDIDATE_CATALOG_VERSION:
        raise _error(
            "UNSUPPORTED_CATALOG_VERSION",
            "$.catalogVersion",
            value=catalog_version,
        )
    baseline_version = _string(
        root["baselineEconomicModelVersion"],
        "$.baselineEconomicModelVersion",
    )
    if baseline_version != BASELINE_ECONOMIC_MODEL_VERSION:
        raise _error(
            "UNSUPPORTED_BASELINE_ECONOMIC_MODEL_VERSION",
            "$.baselineEconomicModelVersion",
            value=baseline_version,
        )
    candidates = tuple(
        _parse_candidate(item, f"$.candidates[{index}]")
        for index, item in enumerate(_list(root["candidates"], "$.candidates"))
    )
    if not candidates:
        raise _error("EMPTY_CANDIDATE_CATALOG", "$.candidates")
    ids = [candidate.id for candidate in candidates]
    if len(ids) != len(set(ids)):
        raise _error("DUPLICATE_CANDIDATE_ID", "$.candidates")
    signatures = [candidate.policy_signature for candidate in candidates]
    if len(signatures) != len(set(signatures)):
        raise _error("DUPLICATE_CANDIDATE_POLICY_COMBINATION", "$.candidates")
    return CandidateCatalog(
        schema_version=root["schemaVersion"],
        report_schema_version=root["reportSchemaVersion"],
        catalog_version=catalog_version,
        baseline_economic_model_version=baseline_version,
        candidates=candidates,
    )


def load_candidate(candidate_id: str, path: Path | None = None) -> CandidateDefinition:
    catalog = load_catalog(path)
    try:
        return catalog.candidate_by_id[candidate_id]
    except KeyError as exc:
        raise _error("UNKNOWN_CANDIDATE_ID", "$.candidates", candidate_id=candidate_id) from exc


def candidate_ids(catalog: CandidateCatalog) -> tuple[str, ...]:
    return tuple(sorted(candidate.id for candidate in catalog.candidates))
