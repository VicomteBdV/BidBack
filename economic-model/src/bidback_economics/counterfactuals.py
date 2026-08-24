"""Strict Lot D counterfactual catalogue loading and input matching."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from .scenarios import BidderDefinition, Scenario, ScenarioCatalog, load_catalog
from .solidity_math import validate_typed_uint

ADVERSARIAL_SCHEMA_VERSION = 1
ADVERSARIAL_REPORT_SCHEMA_VERSION = 1
ADVERSARIAL_CATALOG_VERSION = "adversarial-catalog-v1"

_DECIMAL = re.compile(r"0|[1-9][0-9]*\Z")
_INTEGER_LIKE = re.compile(r"-?[0-9]+\Z")

INPUT_SELECTOR_FIELDS = frozenset(
    {
        "scenario.startPrice",
        "scenario.startTime",
        "scenario.duration",
        "scenario.seller",
        "scenario.params",
        "scenario.focalBidder",
        "scenario.bidderOrder",
        "bidder.present",
        "bidder.valuation",
        "bidder.budget",
        "bidder.maxBidCap",
        "bidder.profile",
        "bidder.fixedCap",
        "bidder.reputationOverride",
        "bidder.opportunities",
    }
)

DIRECT_INPUT_SELECTOR_FIELDS = INPUT_SELECTOR_FIELDS - {"bidder.maxBidCap"}

OUTPUT_SELECTOR_FIELDS = frozenset(
    {
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
        "bidder.firstBidTime",
        "bidder.finalCap",
        "bidder.ef",
        "bidder.et",
        "bidder.ii",
        "bidder.reputation",
        "bidder.participated",
        "actor.aggregateConfiguredMaxBidCap",
        "actor.aggregateLockedCapital",
        "actor.capitalTimeExposureWeiSeconds",
        "coalition.aggregateLockedCapital",
        "coalition.capitalTimeExposureWeiSeconds",
    }
)

MATCHED_SELECTOR_FIELDS = INPUT_SELECTOR_FIELDS | OUTPUT_SELECTOR_FIELDS

DIAGNOSTIC_SELECTOR_FIELDS = frozenset(
    {
        "delta.coalitionUtility",
        "flag.candidatePoolUnlocked",
        "flag.perUserCapBypassedAtCoalitionLevel",
        "flag.positiveIncrementalCoalitionUtility",
        "flag.participantThresholdUnlocked",
    }
)

COMPARISON_OPERATORS = frozenset(
    {
        "equal",
        "notEqual",
        "lessThan",
        "lessThanOrEqual",
        "greaterThan",
        "greaterThanOrEqual",
    }
)

_SUBJECT_SELECTOR_FIELDS = frozenset(
    field
    for field in MATCHED_SELECTOR_FIELDS
    if field.startswith("bidder.") or field.startswith("actor.")
)


class CounterfactualValidationError(ValueError):
    """Structured failure for a Lot D catalogue or selector."""

    def __init__(self, code: str, path: str, **context: object) -> None:
        self.code = code
        self.path = path
        self.context = context
        detail = f"{code} at {path}"
        if context:
            detail = f"{detail}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class ActorDefinition:
    actor_id: str
    nft_valuation: int
    actor_capital_budget: int


@dataclass(frozen=True, slots=True)
class InitialNftEndowment:
    owner_actor_id: str
    value: int


@dataclass(frozen=True, slots=True)
class Selector:
    field: str
    subject: str | None = None


@dataclass(frozen=True, slots=True)
class Comparison:
    id: str
    selector: Selector
    operator: str
    expected: int | bool | str | None = None


@dataclass(frozen=True, slots=True)
class Intervention:
    kind: str
    changed_inputs: tuple[Selector, ...]


@dataclass(frozen=True, slots=True)
class KnownUnmatchedDimension:
    id: str
    selector: Selector
    reason: str


@dataclass(frozen=True, slots=True)
class CounterfactualCase:
    case_id: str
    threat_class: str
    description: str
    actors: tuple[ActorDefinition, ...]
    seller_actor_id: str
    initial_nft_endowment: InitialNftEndowment
    protocol_fee_recipient_actor_id: str | None
    identity_ownership: Mapping[str, str]
    coalition_actor_ids: tuple[str, ...]
    reference_scenario: Scenario
    attack_scenario: Scenario
    intervention: Intervention
    matched_controls: tuple[Comparison, ...]
    known_unmatched_dimensions: tuple[KnownUnmatchedDimension, ...]
    diagnostic_relations: tuple[Comparison, ...]

    @property
    def actor_by_id(self) -> dict[str, ActorDefinition]:
        return {actor.actor_id: actor for actor in self.actors}


@dataclass(frozen=True, slots=True)
class AdversarialCatalog:
    schema_version: int
    report_schema_version: int
    catalog_version: str
    economic_model_version: str
    scenario_catalog_path: Path
    scenario_catalog: ScenarioCatalog
    cases: tuple[CounterfactualCase, ...]

    @property
    def case_by_id(self) -> dict[str, CounterfactualCase]:
        return {case.case_id: case for case in self.cases}


def default_catalog_path() -> Path:
    return Path(__file__).resolve().parents[2] / "adversarial" / "catalog-v1.json"


def _error(code: str, path: str, **context: object) -> CounterfactualValidationError:
    return CounterfactualValidationError(code, path, **context)


def _reject_float(value: str) -> None:
    raise _error("JSON_FLOAT_FORBIDDEN", "$", value=value)


def _validate_json_integer_encoding(value: Any, path: str = "$") -> None:
    if type(value) is int and path not in {"$.schemaVersion", "$.reportSchemaVersion"}:
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


def _uint(value: Any, path: str) -> int:
    try:
        return validate_typed_uint(value, 256, operation=path)
    except Exception as exc:
        raise _error("INVALID_UINT", path, value=value) from exc


def _parse_selector(value: Any, path: str, *, allowed_fields: frozenset[str]) -> Selector:
    raw = _mapping(value, path)
    if set(raw) not in ({"field"}, {"field", "subject"}):
        raise _error("INVALID_SELECTOR_FIELDS", path, keys=sorted(raw))
    field = _string(raw["field"], f"{path}.field")
    if field not in allowed_fields:
        raise _error("UNKNOWN_SELECTOR_FIELD", f"{path}.field", field=field)
    subject = raw.get("subject")
    if subject is not None:
        subject = _string(subject, f"{path}.subject")
    requires_subject = field in _SUBJECT_SELECTOR_FIELDS
    if requires_subject and subject is None:
        raise _error("SELECTOR_SUBJECT_REQUIRED", path, field=field)
    if not requires_subject and subject is not None:
        raise _error("SELECTOR_SUBJECT_FORBIDDEN", path, field=field)
    return Selector(field, subject)


def _parse_comparison(value: Any, path: str, *, diagnostic: bool) -> Comparison:
    raw = _mapping(value, path)
    required = {"id", "selector", "operator", "expected"} if diagnostic else {"id", "selector", "operator"}
    if set(raw) != required:
        raise _error("INVALID_COMPARISON_FIELDS", path, keys=sorted(raw))
    comparison_id = _string(raw["id"], f"{path}.id")
    allowed_fields = DIAGNOSTIC_SELECTOR_FIELDS if diagnostic else MATCHED_SELECTOR_FIELDS
    selector = _parse_selector(raw["selector"], f"{path}.selector", allowed_fields=allowed_fields)
    operator = _string(raw["operator"], f"{path}.operator")
    if diagnostic:
        if operator not in COMPARISON_OPERATORS:
            raise _error("UNKNOWN_COMPARISON_OPERATOR", f"{path}.operator", operator=operator)
        expected = raw["expected"]
        if selector.field.startswith("delta.") and type(expected) is not int:
            raise _error("DIAGNOSTIC_EXPECTED_INTEGER", f"{path}.expected")
        if selector.field.startswith("flag."):
            if type(expected) is not bool:
                raise _error("DIAGNOSTIC_EXPECTED_BOOLEAN", f"{path}.expected")
            if operator not in {"equal", "notEqual"}:
                raise _error("BOOLEAN_COMPARISON_OPERATOR", f"{path}.operator", operator=operator)
        return Comparison(comparison_id, selector, operator, expected)
    if operator != "equal":
        raise _error("MATCHED_CONTROL_MUST_REQUIRE_EQUALITY", f"{path}.operator", operator=operator)
    return Comparison(comparison_id, selector, operator)


def _parse_actor(value: Any, path: str) -> ActorDefinition:
    raw = _mapping(value, path)
    if set(raw) != {"actorId", "nftValuation", "actorCapitalBudget"}:
        raise _error("INVALID_ACTOR_FIELDS", path, keys=sorted(raw))
    actor_id = _string(raw["actorId"], f"{path}.actorId")
    valuation = _uint(raw["nftValuation"], f"{path}.nftValuation")
    if valuation == 0:
        raise _error("ZERO_NFT_VALUATION", f"{path}.nftValuation")
    budget = _uint(raw["actorCapitalBudget"], f"{path}.actorCapitalBudget")
    return ActorDefinition(actor_id, valuation, budget)


def _parse_branch_scenario_id(value: Any, path: str) -> str:
    raw = _mapping(value, path)
    if set(raw) != {"scenarioId"}:
        raise _error("INVALID_BRANCH_FIELDS", path, keys=sorted(raw))
    return _string(raw["scenarioId"], f"{path}.scenarioId")


def _parse_intervention(value: Any, path: str) -> Intervention:
    raw = _mapping(value, path)
    if set(raw) != {"kind", "changedInputs"}:
        raise _error("INVALID_INTERVENTION_FIELDS", path, keys=sorted(raw))
    kind = _string(raw["kind"], f"{path}.kind")
    changed = tuple(
        _parse_selector(
            item,
            f"{path}.changedInputs[{index}]",
            allowed_fields=DIRECT_INPUT_SELECTOR_FIELDS,
        )
        for index, item in enumerate(_list(raw["changedInputs"], f"{path}.changedInputs"))
    )
    if not changed:
        raise _error("EMPTY_CHANGED_INPUTS", f"{path}.changedInputs")
    if len(changed) != len(set(changed)):
        raise _error("DUPLICATE_CHANGED_INPUT", f"{path}.changedInputs")
    return Intervention(kind, changed)


def _parse_known_unmatched(value: Any, path: str) -> KnownUnmatchedDimension:
    raw = _mapping(value, path)
    if set(raw) != {"id", "selector", "reason"}:
        raise _error("INVALID_UNMATCHED_FIELDS", path, keys=sorted(raw))
    return KnownUnmatchedDimension(
        _string(raw["id"], f"{path}.id"),
        _parse_selector(raw["selector"], f"{path}.selector", allowed_fields=MATCHED_SELECTOR_FIELDS),
        _string(raw["reason"], f"{path}.reason"),
    )


def _bidder_definition(scenario: Scenario, bidder_id: str) -> BidderDefinition | None:
    return scenario.bidder_by_id.get(bidder_id)


def resolve_scenario_selector(scenario: Scenario, selector: Selector) -> object:
    """Resolve a closed-registry input selector without expressions or case-specific logic."""

    field = selector.field
    if field not in INPUT_SELECTOR_FIELDS:
        raise _error("NOT_AN_INPUT_SELECTOR", "$selector", field=field)
    if field == "scenario.startPrice":
        return scenario.start_price
    if field == "scenario.startTime":
        return scenario.start_time
    if field == "scenario.duration":
        return scenario.duration
    if field == "scenario.seller":
        return scenario.seller
    if field == "scenario.params":
        return scenario.params
    if field == "scenario.focalBidder":
        return scenario.focal_bidder
    if field == "scenario.bidderOrder":
        return tuple(bidder.id for bidder in scenario.bidders)

    bidder_id = selector.subject
    if bidder_id is None:
        raise _error("SELECTOR_SUBJECT_REQUIRED", "$selector", field=field)
    bidder = _bidder_definition(scenario, bidder_id)
    if field == "bidder.present":
        return bidder is not None
    if field == "bidder.valuation":
        return None if bidder is None else bidder.valuation
    if field == "bidder.budget":
        return None if bidder is None else bidder.budget
    if field == "bidder.maxBidCap":
        return None if bidder is None else bidder.max_bid_cap
    if field == "bidder.profile":
        return None if bidder is None else bidder.profile
    if field == "bidder.fixedCap":
        return None if bidder is None else bidder.fixed_cap
    if field == "bidder.reputationOverride":
        return scenario.reputations.get(bidder_id)
    if field == "bidder.opportunities":
        return tuple(
            opportunity.offset_seconds
            for opportunity in scenario.opportunities
            if opportunity.bidder == bidder_id
        )
    raise _error("UNKNOWN_SELECTOR_FIELD", "$selector.field", field=field)


def scenario_input_differences(reference: Scenario, attack: Scenario) -> tuple[Selector, ...]:
    """Return every direct economic-input difference in deterministic selector order."""

    selectors = [
        Selector("scenario.startPrice"),
        Selector("scenario.startTime"),
        Selector("scenario.duration"),
        Selector("scenario.seller"),
        Selector("scenario.params"),
        Selector("scenario.focalBidder"),
    ]
    reference_bidder_ids = set(reference.bidder_by_id)
    attack_bidder_ids = set(attack.bidder_by_id)
    if reference_bidder_ids == attack_bidder_ids:
        selectors.append(Selector("scenario.bidderOrder"))
    bidder_ids = sorted(reference_bidder_ids | attack_bidder_ids)
    for bidder_id in bidder_ids:
        presence = Selector("bidder.present", bidder_id)
        selectors.append(presence)
        if resolve_scenario_selector(reference, presence) != resolve_scenario_selector(attack, presence):
            continue
        selectors.extend(
            Selector(field, bidder_id)
            for field in (
                "bidder.valuation",
                "bidder.budget",
                "bidder.profile",
                "bidder.fixedCap",
                "bidder.reputationOverride",
                "bidder.opportunities",
            )
        )
    differences = [
        selector
        for selector in selectors
        if resolve_scenario_selector(reference, selector) != resolve_scenario_selector(attack, selector)
    ]
    return tuple(sorted(differences, key=lambda item: (item.field, item.subject or "")))


def _selector_label(selector: Selector) -> str:
    return selector.field if selector.subject is None else f"{selector.field}:{selector.subject}"


def _validate_actor_case(
    *,
    path: str,
    actors: tuple[ActorDefinition, ...],
    seller_actor_id: str,
    endowment: InitialNftEndowment,
    fee_recipient_actor_id: str | None,
    ownership: Mapping[str, str],
    coalition_actor_ids: tuple[str, ...],
    reference: Scenario,
    attack: Scenario,
) -> None:
    actor_by_id = {actor.actor_id: actor for actor in actors}
    actor_ids = [actor.actor_id for actor in actors]
    if len(actor_ids) != len(set(actor_ids)):
        raise _error("DUPLICATE_ACTOR_ID", f"{path}.actors")
    if seller_actor_id not in actor_by_id:
        raise _error("UNKNOWN_SELLER_ACTOR", f"{path}.sellerActorId", actor=seller_actor_id)
    if fee_recipient_actor_id is not None:
        raise _error("V1_FEE_RECIPIENT_MUST_BE_EXTERNAL", f"{path}.protocolFeeRecipientActorId")
    if endowment.owner_actor_id != seller_actor_id:
        raise _error("ENDOWMENT_OWNER_NOT_SELLER", f"{path}.initialNftEndowment.ownerActorId")
    if endowment.value != actor_by_id[seller_actor_id].nft_valuation:
        raise _error("ENDOWMENT_VALUE_MISMATCH", f"{path}.initialNftEndowment.value")
    if not coalition_actor_ids or len(coalition_actor_ids) != len(set(coalition_actor_ids)):
        raise _error("INVALID_COALITION", f"{path}.coalitionActorIds")
    unknown_coalition = sorted(set(coalition_actor_ids) - set(actor_by_id))
    if unknown_coalition:
        raise _error("UNKNOWN_COALITION_ACTOR", f"{path}.coalitionActorIds", actors=unknown_coalition)

    branch_identities = {
        reference.seller,
        attack.seller,
        *(bidder.id for bidder in reference.bidders),
        *(bidder.id for bidder in attack.bidders),
    }
    if set(ownership) != branch_identities:
        raise _error(
            "IDENTITY_OWNERSHIP_NOT_TOTAL",
            f"{path}.identityOwnership",
            missing=sorted(branch_identities - set(ownership)),
            extra=sorted(set(ownership) - branch_identities),
        )
    unknown_owners = sorted(set(ownership.values()) - set(actor_by_id))
    if unknown_owners:
        raise _error("UNKNOWN_IDENTITY_OWNER", f"{path}.identityOwnership", actors=unknown_owners)
    for scenario, branch_name in ((reference, "reference"), (attack, "attack")):
        offsets = [item.offset_seconds for item in scenario.opportunities]
        if len(offsets) != len(set(offsets)):
            raise _error(
                "ADVERSARIAL_OPPORTUNITY_OFFSETS_MUST_BE_UNIQUE",
                f"{path}.{branch_name}",
            )
        if ownership[scenario.seller] != seller_actor_id:
            raise _error("SELLER_ENDPOINT_OWNER_MISMATCH", f"{path}.{branch_name}", seller=scenario.seller)
        configured_by_actor = {actor_id: 0 for actor_id in actor_by_id}
        for bidder in scenario.bidders:
            owner = ownership[bidder.id]
            if bidder.valuation != actor_by_id[owner].nft_valuation:
                raise _error(
                    "BIDDER_ACTOR_VALUATION_MISMATCH",
                    f"{path}.{branch_name}",
                    bidder=bidder.id,
                    actor=owner,
                )
            configured_by_actor[owner] += bidder.max_bid_cap
        for actor_id, configured_cap in configured_by_actor.items():
            if configured_cap > actor_by_id[actor_id].actor_capital_budget:
                raise _error(
                    "CONFIGURED_CAP_ABOVE_ACTOR_BUDGET",
                    f"{path}.{branch_name}",
                    actor=actor_id,
                    configured_cap=configured_cap,
                    budget=actor_by_id[actor_id].actor_capital_budget,
                )


def _validate_declaration_subjects(
    *,
    path: str,
    actors: tuple[ActorDefinition, ...],
    reference: Scenario,
    attack: Scenario,
    matched_controls: tuple[Comparison, ...],
    known_unmatched: tuple[KnownUnmatchedDimension, ...],
) -> None:
    actor_ids = {actor.actor_id for actor in actors}
    reference_bidders = set(reference.bidder_by_id)
    attack_bidders = set(attack.bidder_by_id)
    bidder_ids = reference_bidders | attack_bidders
    declarations = (
        *(item.selector for item in matched_controls),
        *(item.selector for item in known_unmatched),
    )
    for selector in declarations:
        subject = selector.subject
        if selector.field.startswith("actor.") and subject not in actor_ids:
            raise _error(
                "UNKNOWN_SELECTOR_ACTOR",
                path,
                field=selector.field,
                subject=subject,
            )
        if selector.field.startswith("bidder."):
            if subject not in bidder_ids:
                raise _error(
                    "UNKNOWN_SELECTOR_BIDDER",
                    path,
                    field=selector.field,
                    subject=subject,
                )
            if (
                selector.field in OUTPUT_SELECTOR_FIELDS
                and subject not in reference_bidders & attack_bidders
            ):
                raise _error(
                    "OUTPUT_SELECTOR_BIDDER_NOT_IN_BOTH_BRANCHES",
                    path,
                    field=selector.field,
                    subject=subject,
                )


def _parse_case(value: Any, path: str, scenarios: Mapping[str, Scenario]) -> CounterfactualCase:
    raw = _mapping(value, path)
    required = {
        "caseId",
        "threatClass",
        "description",
        "actors",
        "sellerActorId",
        "initialNftEndowment",
        "protocolFeeRecipientActorId",
        "identityOwnership",
        "coalitionActorIds",
        "reference",
        "attack",
        "intervention",
        "matchedControls",
        "knownUnmatchedDimensions",
        "diagnosticRelations",
    }
    if set(raw) != required:
        raise _error("INVALID_CASE_FIELDS", path, keys=sorted(raw))

    case_id = _string(raw["caseId"], f"{path}.caseId")
    actors = tuple(
        _parse_actor(item, f"{path}.actors[{index}]")
        for index, item in enumerate(_list(raw["actors"], f"{path}.actors"))
    )
    if not actors:
        raise _error("EMPTY_ACTOR_LIST", f"{path}.actors")
    seller_actor_id = _string(raw["sellerActorId"], f"{path}.sellerActorId")
    raw_endowment = _mapping(raw["initialNftEndowment"], f"{path}.initialNftEndowment")
    if set(raw_endowment) != {"ownerActorId", "value"}:
        raise _error("INVALID_ENDOWMENT_FIELDS", f"{path}.initialNftEndowment", keys=sorted(raw_endowment))
    endowment = InitialNftEndowment(
        _string(raw_endowment["ownerActorId"], f"{path}.initialNftEndowment.ownerActorId"),
        _uint(raw_endowment["value"], f"{path}.initialNftEndowment.value"),
    )
    fee_recipient = raw["protocolFeeRecipientActorId"]
    if fee_recipient is not None:
        fee_recipient = _string(fee_recipient, f"{path}.protocolFeeRecipientActorId")

    raw_ownership = _mapping(raw["identityOwnership"], f"{path}.identityOwnership")
    ownership = {
        _string(identity, f"{path}.identityOwnership.key"): _string(
            owner, f"{path}.identityOwnership.{identity}"
        )
        for identity, owner in raw_ownership.items()
    }
    coalition_actor_ids = tuple(
        _string(item, f"{path}.coalitionActorIds[{index}]")
        for index, item in enumerate(_list(raw["coalitionActorIds"], f"{path}.coalitionActorIds"))
    )
    reference_id = _parse_branch_scenario_id(raw["reference"], f"{path}.reference")
    attack_id = _parse_branch_scenario_id(raw["attack"], f"{path}.attack")
    if reference_id == attack_id:
        raise _error("IDENTICAL_BRANCH_SCENARIOS", path, scenario_id=reference_id)
    try:
        reference = scenarios[reference_id]
    except KeyError as exc:
        raise _error("UNKNOWN_REFERENCE_SCENARIO", f"{path}.reference", scenario_id=reference_id) from exc
    try:
        attack = scenarios[attack_id]
    except KeyError as exc:
        raise _error("UNKNOWN_ATTACK_SCENARIO", f"{path}.attack", scenario_id=attack_id) from exc

    intervention = _parse_intervention(raw["intervention"], f"{path}.intervention")
    actual_differences = scenario_input_differences(reference, attack)
    if set(intervention.changed_inputs) != set(actual_differences):
        declared = set(intervention.changed_inputs)
        actual = set(actual_differences)
        raise _error(
            "INPUT_DIFFERENCE_DECLARATION_MISMATCH",
            f"{path}.intervention.changedInputs",
            undeclared=sorted(_selector_label(item) for item in actual - declared),
            unchanged=sorted(_selector_label(item) for item in declared - actual),
        )

    matched_controls = tuple(
        _parse_comparison(item, f"{path}.matchedControls[{index}]", diagnostic=False)
        for index, item in enumerate(_list(raw["matchedControls"], f"{path}.matchedControls"))
    )
    known_unmatched = tuple(
        _parse_known_unmatched(item, f"{path}.knownUnmatchedDimensions[{index}]")
        for index, item in enumerate(
            _list(raw["knownUnmatchedDimensions"], f"{path}.knownUnmatchedDimensions")
        )
    )
    diagnostic_relations = tuple(
        _parse_comparison(item, f"{path}.diagnosticRelations[{index}]", diagnostic=True)
        for index, item in enumerate(_list(raw["diagnosticRelations"], f"{path}.diagnosticRelations"))
    )
    for label, identifiers in (
        ("matchedControls", [item.id for item in matched_controls]),
        ("knownUnmatchedDimensions", [item.id for item in known_unmatched]),
        ("diagnosticRelations", [item.id for item in diagnostic_relations]),
    ):
        if len(identifiers) != len(set(identifiers)):
            raise _error("DUPLICATE_DECLARATION_ID", f"{path}.{label}")

    _validate_actor_case(
        path=path,
        actors=actors,
        seller_actor_id=seller_actor_id,
        endowment=endowment,
        fee_recipient_actor_id=fee_recipient,
        ownership=ownership,
        coalition_actor_ids=coalition_actor_ids,
        reference=reference,
        attack=attack,
    )
    _validate_declaration_subjects(
        path=path,
        actors=actors,
        reference=reference,
        attack=attack,
        matched_controls=matched_controls,
        known_unmatched=known_unmatched,
    )
    return CounterfactualCase(
        case_id,
        _string(raw["threatClass"], f"{path}.threatClass"),
        _string(raw["description"], f"{path}.description"),
        actors,
        seller_actor_id,
        endowment,
        fee_recipient,
        ownership,
        coalition_actor_ids,
        reference,
        attack,
        intervention,
        matched_controls,
        known_unmatched,
        diagnostic_relations,
    )


def load_adversarial_catalog(path: Path | None = None) -> AdversarialCatalog:
    catalog_path = (path or default_catalog_path()).resolve()
    with catalog_path.open("r", encoding="utf-8") as handle:
        raw_root = json.load(handle, parse_float=_reject_float)
    raw_mapping = _mapping(raw_root, "$")
    if type(raw_mapping.get("schemaVersion")) is not int:
        raise _error("SCHEMA_VERSION_MUST_BE_JSON_INTEGER", "$.schemaVersion")
    if type(raw_mapping.get("reportSchemaVersion")) is not int:
        raise _error("REPORT_SCHEMA_VERSION_MUST_BE_JSON_INTEGER", "$.reportSchemaVersion")
    _validate_json_integer_encoding(raw_root)
    root = _mapping(_convert_decimal_strings(raw_root), "$")
    required = {
        "schemaVersion",
        "reportSchemaVersion",
        "catalogVersion",
        "economicModelVersion",
        "scenarioCatalog",
        "cases",
    }
    if set(root) != required:
        raise _error("INVALID_CATALOG_FIELDS", "$", keys=sorted(root))
    if root["schemaVersion"] != ADVERSARIAL_SCHEMA_VERSION:
        raise _error("UNSUPPORTED_SCHEMA_VERSION", "$.schemaVersion", value=root["schemaVersion"])
    if root["reportSchemaVersion"] != ADVERSARIAL_REPORT_SCHEMA_VERSION:
        raise _error(
            "UNSUPPORTED_REPORT_SCHEMA_VERSION",
            "$.reportSchemaVersion",
            value=root["reportSchemaVersion"],
        )
    catalog_version = _string(root["catalogVersion"], "$.catalogVersion")
    if catalog_version != ADVERSARIAL_CATALOG_VERSION:
        raise _error("UNSUPPORTED_CATALOG_VERSION", "$.catalogVersion", value=catalog_version)
    economic_model_version = _string(root["economicModelVersion"], "$.economicModelVersion")
    relative_catalog_text = _string(root["scenarioCatalog"], "$.scenarioCatalog")
    relative_catalog = Path(relative_catalog_text)
    if (
        relative_catalog.is_absolute()
        or relative_catalog.anchor
        or re.match(r"^[A-Za-z]:", relative_catalog_text)
        or "\\" in relative_catalog_text
        or ".." in relative_catalog.parts
    ):
        raise _error("INVALID_SCENARIO_CATALOG_PATH", "$.scenarioCatalog")
    scenario_catalog_path = (catalog_path.parent / relative_catalog).resolve()
    scenario_catalog = load_catalog(scenario_catalog_path)
    if scenario_catalog.economic_model_version != economic_model_version:
        raise _error("ECONOMIC_MODEL_VERSION_MISMATCH", "$.economicModelVersion")
    if len(scenario_catalog.scenarios) != 20:
        raise _error("ADVERSARIAL_SCENARIO_COUNT", "$.scenarioCatalog", count=len(scenario_catalog.scenarios))
    scenarios = {scenario.id: scenario for scenario in scenario_catalog.scenarios}
    cases = tuple(
        _parse_case(item, f"$.cases[{index}]", scenarios)
        for index, item in enumerate(_list(root["cases"], "$.cases"))
    )
    if len(cases) != 10:
        raise _error("ADVERSARIAL_CASE_COUNT", "$.cases", count=len(cases))
    case_ids_value = [case.case_id for case in cases]
    if len(case_ids_value) != len(set(case_ids_value)):
        raise _error("DUPLICATE_CASE_ID", "$.cases")
    used_scenarios = [
        scenario.id
        for case in cases
        for scenario in (case.reference_scenario, case.attack_scenario)
    ]
    if len(used_scenarios) != len(set(used_scenarios)) or set(used_scenarios) != set(scenarios):
        raise _error(
            "SCENARIOS_NOT_USED_EXACTLY_ONCE",
            "$.cases",
            used=sorted(used_scenarios),
            available=sorted(scenarios),
        )
    return AdversarialCatalog(
        root["schemaVersion"],
        root["reportSchemaVersion"],
        catalog_version,
        economic_model_version,
        scenario_catalog_path,
        scenario_catalog,
        cases,
    )


def load_case(case_id: str, path: Path | None = None) -> CounterfactualCase:
    catalog = load_adversarial_catalog(path)
    try:
        return catalog.case_by_id[case_id]
    except KeyError as exc:
        raise _error("UNKNOWN_CASE_ID", "$.cases", case_id=case_id) from exc


def case_ids(catalog: AdversarialCatalog) -> tuple[str, ...]:
    return tuple(sorted(case.case_id for case in catalog.cases))
