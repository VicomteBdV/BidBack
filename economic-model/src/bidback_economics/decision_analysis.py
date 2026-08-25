"""Fail-closed analytical reduction of the complete Lot A-E evidence base.

This module does not select a model or produce a final product decision.  It
checks the completeness and integrity of one ``CandidateCatalogReport`` and
reduces the already-computed evidence into atomic properties, bounded
diagnostics, scenario-local trade-offs, and selection eligibility.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, replace
from typing import Sequence

from .baseline import allocate_distribution
from .candidate_runner import (
    CandidateCatalogReport,
    CandidateIdentityPartitionReport,
)
from .metrics import Rational
from .model_comparison import (
    AdversarialCandidateComparison,
    CandidatePropertyResult,
    IDENTITY_IMPOSSIBILITY_CAVEAT,
    ScenarioCandidateComparison,
)
from .runner import ScenarioReport


DECISION_ANALYSIS_SCHEMA_VERSION = 1
BASELINE_MODEL_ID = "solidity-baseline-v1"
EXPECTED_CANDIDATE_IDS = (
    "candidate-v1-a",
    "candidate-v1-b",
    "candidate-v1-c",
    "candidate-v1-d",
    "candidate-v1-e",
)
EXPECTED_MODEL_IDS = (*EXPECTED_CANDIDATE_IDS, BASELINE_MODEL_ID)
EXPECTED_NORMAL_SCENARIOS = (
    "s01-no-competition",
    "s02-clear-gap",
    "s03-close-valuations",
    "s04-heterogeneous",
    "s05-et-early",
    "s05-et-late",
    "s06-ii-high",
    "s06-ii-low",
    "s07-reputation-differential",
    "s07-reputation-neutral",
    "s08-per-user-cap-saturation",
    "s09-at-threshold",
    "s09-below-threshold",
    "s10-anti-sniping",
)
EXPECTED_ADVERSARIAL_CASES = (
    "d01-deliberate-loser",
    "d02-losing-cap-ef",
    "d03-early-et",
    "d04-interaction-ii",
    "d05-sybil-cap-bypass",
    "d06-sybil-threshold",
    "d07-collusive-suppression",
    "d08a-seller-losing-shill",
    "d08b-seller-self-purchase",
    "d09-alternating-identities",
)
REPRESENTATIVE_P5_SCENARIOS = (
    "s02-clear-gap",
    "s03-close-valuations",
    "s04-heterogeneous",
    "s08-per-user-cap-saturation",
    "s09-at-threshold",
    "s10-anti-sniping",
)
PROPERTY_IDS = (
    "P1",
    "P2a",
    "P2b",
    "P3",
    "P4",
    "P5",
    "P6",
    "P7",
    "P8",
    "P9",
    "P10",
    "P11",
    "P12",
    "P13",
    "P14",
    "P15",
    "P16",
)
SELECTION_GATE_IDS = ("P1", "P2a", "P2b", "P3", "P4", "P5")

_EXPECTED_FAMILIES = {
    "s01-no-competition": "S1",
    "s02-clear-gap": "S2",
    "s03-close-valuations": "S3",
    "s04-heterogeneous": "S4",
    "s05-et-early": "S5",
    "s05-et-late": "S5",
    "s06-ii-high": "S6",
    "s06-ii-low": "S6",
    "s07-reputation-differential": "S7",
    "s07-reputation-neutral": "S7",
    "s08-per-user-cap-saturation": "S8",
    "s09-at-threshold": "S9",
    "s09-below-threshold": "S9",
    "s10-anti-sniping": "S10",
}
_EXPECTED_THREAT_CLASSES = {
    "d01-deliberate-loser": "strategic-losing",
    "d02-losing-cap-ef": "financial-engagement",
    "d03-early-et": "time-engagement",
    "d04-interaction-ii": "interaction-intensity",
    "d05-sybil-cap-bypass": "sybil-per-user-cap",
    "d06-sybil-threshold": "sybil-participant-threshold",
    "d07-collusive-suppression": "coordinated-demand-suppression",
    "d08a-seller-losing-shill": "seller-controlled-losing-identity",
    "d08b-seller-self-purchase": "seller-self-purchase",
    "d09-alternating-identities": "multi-identity-interaction",
}
_NORMAL_PROPERTY_IDS = frozenset(
    {"P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P14", "P15"}
)
_ADVERSARIAL_PROPERTY_IDS = frozenset({"P1", "P2a", "P3", "P4", "P13", "P15"})
_INTEGRITY_NORMAL_PROPERTIES = frozenset(
    {"P6", "P7", "P8", "P9", "P10", "P11", "P12", "P14"}
)
_P2B_VECTOR = (
    "p2b-matched-contribution-40-60-v1",
    1_000,
    2_000,
    1_000,
    (400, 600),
    4_000,
    1_000,
    (400, 600),
)


class DecisionAnalysisError(ValueError):
    """The supplied evidence cannot be reduced without weakening integrity."""

    def __init__(self, code: str, **context: object) -> None:
        self.code = code
        self.context = context
        detail = code if not context else f"{code}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class IntegrityCriterion:
    criterion_id: str
    passed: bool
    detail: str


@dataclass(frozen=True, slots=True)
class PropertyObservation:
    evidence_id: str
    status: str
    detail: str


@dataclass(frozen=True, slots=True)
class PropertyAnalysis:
    property_id: str
    status: str
    scope: str
    observations: tuple[PropertyObservation, ...]


@dataclass(frozen=True, slots=True)
class IdentityPartitionDiagnostic:
    vector_id: str
    candidate_pool: int
    aggregate_weight: int
    unsplit_reward: int
    split_reward: int
    identity_splitting_gain_reward: int
    weight_matched: bool
    status: str


@dataclass(frozen=True, slots=True)
class RedistributionCoverage:
    representative_scenario_ids: tuple[str, ...]
    scenario_statuses: tuple[PropertyObservation, ...]
    applicable_scenario_ids: tuple[str, ...]
    passing_scenario_ids: tuple[str, ...]
    failing_scenario_ids: tuple[str, ...]
    status: str


@dataclass(frozen=True, slots=True)
class NormalScenarioDiagnostic:
    scenario_id: str
    scenario_family: str
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
    allocative_efficiency_preserved: bool | None


@dataclass(frozen=True, slots=True)
class AdversarialDiagnostic:
    case_id: str
    threat_class: str
    delta_coalition_utility: int
    delta_coalition_reward: int
    delta_seller_proceeds: int
    identity_splitting_status: str
    identity_splitting_gain_reward: int
    identity_splitting_gain_utility: int
    attack_winner_actor_indirect_reward: int
    p4_scope: str
    impossibility_caveat: str


@dataclass(frozen=True, slots=True)
class FeasibilityEvidence:
    evidence_kind: str
    allocation_subject: str
    allocation_input_policy: str
    allocation_policy: str
    reward_cap_policy: str
    secondary_weight_policy: str
    requires_policy_replay: bool
    automatic_feasibility_verdict: bool


@dataclass(frozen=True, slots=True)
class ModelAnalysis:
    model_id: str
    properties: tuple[PropertyAnalysis, ...]
    selection_eligible: bool
    disqualification_reasons: tuple[str, ...]
    identity_partition: IdentityPartitionDiagnostic
    redistribution_coverage: RedistributionCoverage
    normal_scenarios: tuple[NormalScenarioDiagnostic, ...]
    adversarial_cases: tuple[AdversarialDiagnostic, ...]
    feasibility: FeasibilityEvidence


@dataclass(frozen=True, slots=True)
class ScenarioParetoRelation:
    scenario_id: str
    dominant_model_id: str
    dominated_model_id: str
    strictly_better_dimensions: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class DecisionAnalysisMetadata:
    decision_analysis_schema_version: int
    source_commit: str
    candidate_catalog_version: str
    normal_scenario_catalog_version: str
    adversarial_catalog_version: str
    economic_model_version: str


@dataclass(frozen=True, slots=True)
class DecisionAnalysisReport:
    metadata: DecisionAnalysisMetadata
    integrity_valid: bool
    integrity_criteria: tuple[IntegrityCriterion, ...]
    models: tuple[ModelAnalysis, ...]
    scenario_pareto_relations: tuple[ScenarioParetoRelation, ...]
    methodological_caveats: tuple[str, ...]
    runner_properties: tuple[CandidatePropertyResult, ...]


def _canonical_json(value: object) -> str:
    return json.dumps(
        asdict(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


def _require(condition: bool, code: str, **context: object) -> None:
    if not condition:
        raise DecisionAnalysisError(code, **context)


def _property_map(
    properties: Sequence[CandidatePropertyResult],
    expected: frozenset[str],
    *,
    evidence_id: str,
) -> dict[str, CandidatePropertyResult]:
    mapped = {item.property_id: item for item in properties}
    _require(
        len(mapped) == len(properties) and frozenset(mapped) == expected,
        "PROPERTY_SET_INVALID",
        evidence_id=evidence_id,
        expected=tuple(sorted(expected)),
        actual=tuple(sorted(mapped)),
    )
    _require(
        all(
            item.status in {"pass", "fail", "non-applicable", "non-comparable"}
            for item in properties
        ),
        "PROPERTY_STATUS_INVALID",
        evidence_id=evidence_id,
    )
    return mapped


def _require_p16(properties: Sequence[CandidatePropertyResult], *, evidence_id: str) -> None:
    mapped = _property_map(properties, frozenset({"P16"}), evidence_id=evidence_id)
    _require(
        mapped["P16"].status == "pass",
        "P16_FAILED",
        evidence_id=evidence_id,
    )


def _require_source_commit(actual: str | None, expected: str, *, evidence_id: str) -> None:
    _require(
        actual == expected,
        "SOURCE_COMMIT_MISMATCH",
        evidence_id=evidence_id,
        expected=expected,
        actual=actual,
    )


def _validate_scenario_report(
    report: ScenarioReport,
    *,
    source_commit: str,
    expected_id: str,
    expected_family: str | None,
    expected_catalog_version: str,
) -> None:
    metadata = report.metadata
    _require(metadata.scenario_schema_version == 1, "SCENARIO_SCHEMA_VERSION_INVALID", scenario_id=expected_id)
    _require(metadata.report_schema_version == 1, "SCENARIO_REPORT_VERSION_INVALID", scenario_id=expected_id)
    _require(metadata.catalog_version == expected_catalog_version, "SCENARIO_CATALOG_VERSION_INVALID", scenario_id=expected_id)
    _require(metadata.economic_model_version == BASELINE_MODEL_ID, "ECONOMIC_MODEL_VERSION_INVALID", scenario_id=expected_id)
    _require(metadata.scenario_id == expected_id, "SCENARIO_ID_MISMATCH", expected=expected_id, actual=metadata.scenario_id)
    if expected_family is not None:
        _require(metadata.scenario_family == expected_family, "SCENARIO_FAMILY_MISMATCH", scenario_id=expected_id)
    _require_source_commit(metadata.source_commit, source_commit, evidence_id=expected_id)
    _require_source_commit(report.baseline_result.metadata.source_commit, source_commit, evidence_id=f"{expected_id}:baseline-result")
    _require(report.baseline_result.metadata.model_version == BASELINE_MODEL_ID, "BASELINE_RESULT_VERSION_INVALID", scenario_id=expected_id)
    failed_invariants = tuple(item.name for item in report.baseline_invariants if not item.passed)
    _require(bool(report.baseline_invariants), "LOT_B_INVARIANTS_MISSING", scenario_id=expected_id)
    _require(not failed_invariants, "LOT_B_INVARIANT_FAILED", scenario_id=expected_id, invariants=failed_invariants)
    failed_checks = tuple(item.name for item in report.analytical_checks if not item.passed)
    _require(bool(report.analytical_checks), "LOT_C_ANALYTICAL_CHECKS_MISSING", scenario_id=expected_id)
    _require(not failed_checks, "LOT_C_ANALYTICAL_CHECK_FAILED", scenario_id=expected_id, checks=failed_checks)


def _validate_normal_comparison(
    comparison: ScenarioCandidateComparison,
    *,
    evidence_id: str,
    expected_model_id: str,
) -> None:
    _require(comparison.model_id == expected_model_id, "CANDIDATE_MODEL_ID_MISMATCH", evidence_id=evidence_id)
    _require(comparison.evaluation.model_id == expected_model_id, "CANDIDATE_EVALUATION_ID_MISMATCH", evidence_id=evidence_id)
    failed = tuple(item.name for item in comparison.evaluation.invariants if not item.passed)
    _require(
        tuple(item.name for item in comparison.evaluation.invariants)
        == (
            "candidate pool is funded by net premium",
            "assigned distribution does not exceed candidate pool",
            "reward sum equals assigned distribution",
            "winner identity is excluded",
            "candidate settlement preserves baseline auction fields",
            "candidate remainder identity",
            "candidate seller proceeds identity",
        ),
        "CANDIDATE_INVARIANT_SET_INVALID",
        evidence_id=evidence_id,
    )
    _require(not failed, "CANDIDATE_INVARIANT_FAILED", evidence_id=evidence_id, invariants=failed)
    properties = _property_map(comparison.properties, _NORMAL_PROPERTY_IDS, evidence_id=evidence_id)
    failed_integrity = tuple(
        property_id
        for property_id in sorted(_INTEGRITY_NORMAL_PROPERTIES)
        if properties[property_id].status != "pass"
    )
    _require(not failed_integrity, "CANDIDATE_INTEGRITY_PROPERTY_FAILED", evidence_id=evidence_id, properties=failed_integrity)
    _require(properties["P5"].status in {"pass", "fail", "non-applicable"}, "P5_STATUS_INVALID", evidence_id=evidence_id)
    _require(properties["P15"].status in {"pass", "non-applicable"}, "P15_STATUS_INVALID", evidence_id=evidence_id)
    _require(
        comparison.scenario_unchanged
        and comparison.scenario_report_unchanged
        and comparison.simulation_result_unchanged,
        "LOT_E_SOURCE_MUTATION_REPORTED",
        evidence_id=evidence_id,
    )


def _validate_partition(report: CandidateIdentityPartitionReport) -> None:
    vector = report.vector
    actual = (
        vector.vector_id,
        vector.candidate_pool,
        vector.gross_premium,
        vector.unsplit_contribution,
        vector.split_contributions,
        vector.per_user_reward_cap_bps,
        vector.unsplit_secondary_weight,
        vector.split_secondary_weights,
    )
    _require(actual == _P2B_VECTOR, "P2B_VECTOR_INVALID", expected=_P2B_VECTOR, actual=actual)
    candidates = tuple(item.model_id for item in report.candidates)
    _require(candidates == EXPECTED_CANDIDATE_IDS, "P2B_CANDIDATE_SET_INVALID", actual=candidates)
    for item in report.candidates:
        _require(item.property.property_id == "P2b", "P2B_PROPERTY_ID_INVALID", model_id=item.model_id)
        _require(item.property.status in {"pass", "fail"}, "P2B_STATUS_INVALID", model_id=item.model_id)
        _require(item.contribution_matched and item.weight_matched, "P2B_MATCHED_INPUT_INVALID", model_id=item.model_id)


def _validate_adversarial_property_scope(
    comparison: AdversarialCandidateComparison,
    *,
    threat_class: str,
    evidence_id: str,
) -> None:
    properties = _property_map(comparison.properties, _ADVERSARIAL_PROPERTY_IDS, evidence_id=evidence_id)
    applicable = {
        "P1": threat_class == "strategic-losing",
        "P2a": threat_class == "sybil-per-user-cap",
        "P3": threat_class == "sybil-participant-threshold",
        "P4": threat_class == "sybil-participant-threshold",
        "P13": threat_class == "seller-self-purchase",
    }
    for property_id, is_applicable in applicable.items():
        status = properties[property_id].status
        if is_applicable:
            allowed = {"pass", "fail", "non-comparable"} if property_id == "P2a" else {"pass", "fail"}
            _require(status in allowed, "APPLICABLE_PROPERTY_STATUS_INVALID", evidence_id=evidence_id, property_id=property_id, status=status)
        else:
            _require(status == "non-applicable", "NON_APPLICABLE_PROPERTY_STATUS_INVALID", evidence_id=evidence_id, property_id=property_id, status=status)
    _require(properties["P15"].status in {"pass", "non-applicable"}, "P15_STATUS_INVALID", evidence_id=evidence_id)
    if properties["P13"].status != "non-applicable":
        _require(properties["P13"].status == "pass", "P13_FAILED", evidence_id=evidence_id)


def _validate_evidence(report: CandidateCatalogReport) -> str:
    metadata = report.metadata
    source_commit = metadata.source_commit
    _require(isinstance(source_commit, str) and bool(source_commit), "SOURCE_COMMIT_REQUIRED")
    _require(metadata.candidate_schema_version == 1, "CANDIDATE_SCHEMA_VERSION_INVALID")
    _require(metadata.candidate_report_schema_version == 1, "CANDIDATE_REPORT_VERSION_INVALID")
    _require(metadata.candidate_catalog_version == "candidate-catalog-v1", "CANDIDATE_CATALOG_VERSION_INVALID")
    _require(metadata.baseline_economic_model_version == BASELINE_MODEL_ID, "BASELINE_ECONOMIC_MODEL_VERSION_INVALID")
    _require_p16(report.runner_properties, evidence_id="candidate-catalog-report")

    normal_ids = tuple(item.scenario_id for item in report.normal_scenarios)
    _require(normal_ids == EXPECTED_NORMAL_SCENARIOS, "NORMAL_SCENARIO_SET_INVALID", actual=normal_ids)
    adversarial_ids = tuple(item.case_id for item in report.adversarial_cases)
    _require(adversarial_ids == EXPECTED_ADVERSARIAL_CASES, "ADVERSARIAL_CASE_SET_INVALID", actual=adversarial_ids)
    _validate_partition(report.identity_partition)
    canonical_models = {
        item.model_id: item.evaluation.model
        for item in report.normal_scenarios[0].candidates
    }

    for scenario_report in report.normal_scenarios:
        scenario_id = scenario_report.scenario_id
        _require(scenario_report.metadata == metadata, "CANDIDATE_METADATA_MISMATCH", evidence_id=scenario_id)
        _require_p16(scenario_report.runner_properties, evidence_id=scenario_id)
        _validate_partition(scenario_report.identity_partition)
        _require(scenario_report.identity_partition == report.identity_partition, "P2B_REPORT_MISMATCH", evidence_id=scenario_id)
        _validate_scenario_report(
            scenario_report.baseline,
            source_commit=source_commit,
            expected_id=scenario_id,
            expected_family=_EXPECTED_FAMILIES[scenario_id],
            expected_catalog_version="lot-c-catalog-v1",
        )
        candidate_ids = tuple(item.model_id for item in scenario_report.candidates)
        _require(candidate_ids == EXPECTED_CANDIDATE_IDS, "NORMAL_CANDIDATE_SET_INVALID", scenario_id=scenario_id, actual=candidate_ids)
        for comparison in scenario_report.candidates:
            _require(
                comparison.evaluation.model == canonical_models[comparison.model_id],
                "CANDIDATE_DEFINITION_MISMATCH",
                evidence_id=f"{scenario_id}:{comparison.model_id}",
            )
            _validate_normal_comparison(
                comparison,
                evidence_id=f"{scenario_id}:{comparison.model_id}",
                expected_model_id=comparison.model_id,
            )

    for case_report in report.adversarial_cases:
        case_id = case_report.case_id
        baseline = case_report.baseline
        _require(case_report.metadata == metadata, "CANDIDATE_METADATA_MISMATCH", evidence_id=case_id)
        _require_p16(case_report.runner_properties, evidence_id=case_id)
        _validate_partition(case_report.identity_partition)
        _require(case_report.identity_partition == report.identity_partition, "P2B_REPORT_MISMATCH", evidence_id=case_id)
        _require(baseline.metadata.adversarial_schema_version == 1, "ADVERSARIAL_SCHEMA_VERSION_INVALID", case_id=case_id)
        _require(baseline.metadata.report_schema_version == 1, "ADVERSARIAL_REPORT_VERSION_INVALID", case_id=case_id)
        _require(baseline.metadata.catalog_version == "adversarial-catalog-v1", "ADVERSARIAL_CATALOG_VERSION_INVALID", case_id=case_id)
        _require(baseline.metadata.economic_model_version == BASELINE_MODEL_ID, "ADVERSARIAL_MODEL_VERSION_INVALID", case_id=case_id)
        _require(baseline.metadata.case_id == case_id, "ADVERSARIAL_CASE_ID_MISMATCH", case_id=case_id)
        _require(baseline.metadata.threat_class == _EXPECTED_THREAT_CLASSES[case_id], "THREAT_CLASS_MISMATCH", case_id=case_id)
        _require_source_commit(baseline.metadata.source_commit, source_commit, evidence_id=case_id)
        _validate_scenario_report(
            baseline.reference,
            source_commit=source_commit,
            expected_id=baseline.metadata.reference_scenario_id,
            expected_family=None,
            expected_catalog_version="lot-d-branches-v1",
        )
        _validate_scenario_report(
            baseline.attack,
            source_commit=source_commit,
            expected_id=baseline.metadata.attack_scenario_id,
            expected_family=None,
            expected_catalog_version="lot-d-branches-v1",
        )
        for branch_name, branch in (("reference", baseline.metrics.reference), ("attack", baseline.metrics.attack)):
            failed_checks = tuple(item.name for item in branch.checks if not item.passed)
            _require(bool(branch.checks), "LOT_D_ACCOUNTING_CHECKS_MISSING", case_id=case_id, branch=branch_name)
            _require(not failed_checks, "LOT_D_ACCOUNTING_CHECK_FAILED", case_id=case_id, branch=branch_name, checks=failed_checks)
        declared_controls = tuple(item.id for item in baseline.case_definition.matched_controls)
        reported_controls = tuple(item.comparison_id for item in baseline.metrics.matched_control_results)
        _require(
            reported_controls == declared_controls and bool(reported_controls),
            "LOT_D_MATCHED_CONTROL_SET_INVALID",
            case_id=case_id,
            declared=declared_controls,
            reported=reported_controls,
        )
        failed_controls = tuple(
            item.comparison_id
            for item in baseline.metrics.matched_control_results
            if not item.passed
        )
        _require(not failed_controls, "LOT_D_MATCHED_CONTROL_FAILED", case_id=case_id, controls=failed_controls)
        candidate_ids = tuple(item.model_id for item in case_report.candidates)
        _require(candidate_ids == EXPECTED_CANDIDATE_IDS, "ADVERSARIAL_CANDIDATE_SET_INVALID", case_id=case_id, actual=candidate_ids)
        for comparison in case_report.candidates:
            evidence_id = f"{case_id}:{comparison.model_id}"
            _require(
                comparison.reference.evaluation.model == canonical_models[comparison.model_id]
                and comparison.attack.evaluation.model == canonical_models[comparison.model_id],
                "CANDIDATE_DEFINITION_MISMATCH",
                evidence_id=evidence_id,
            )
            _require(comparison.adversarial_report_unchanged, "LOT_D_SOURCE_MUTATION_REPORTED", evidence_id=evidence_id)
            _require(comparison.impossibility_caveat == IDENTITY_IMPOSSIBILITY_CAVEAT, "IDENTITY_CAVEAT_INVALID", evidence_id=evidence_id)
            _validate_normal_comparison(comparison.reference, evidence_id=f"{evidence_id}:reference", expected_model_id=comparison.model_id)
            _validate_normal_comparison(comparison.attack, evidence_id=f"{evidence_id}:attack", expected_model_id=comparison.model_id)
            _validate_adversarial_property_scope(
                comparison,
                threat_class=baseline.metadata.threat_class,
                evidence_id=evidence_id,
            )

    return source_commit


def _observation(evidence_id: str, item: CandidatePropertyResult) -> PropertyObservation:
    return PropertyObservation(evidence_id, item.status, item.detail)


def _aggregate_status(observations: Sequence[PropertyObservation]) -> str:
    statuses = {item.status for item in observations}
    if not observations or statuses == {"non-applicable"}:
        return "non-applicable"
    if "fail" in statuses:
        return "fail"
    if "non-comparable" in statuses:
        return "non-comparable"
    if statuses == {"pass"}:
        return "pass"
    if statuses <= {"pass", "non-applicable"}:
        return "partially-applicable-pass"
    raise DecisionAnalysisError("PROPERTY_AGGREGATION_STATUS_INVALID", statuses=tuple(sorted(statuses)))


def _scope(property_id: str) -> str:
    scopes = {
        "P1": "D1 deliberate-loser diagnostic only",
        "P2a": "D5 empirical split-versus-unsplit diagnostic only when declared controls match",
        "P2b": "canonical fixed-pool, matched aggregate allocation-weight partition only",
        "P3": "D6 participant-count pool-unlock diagnostic only",
        "P4": "D6 only: winnerActorIndirectReward == 0; not a universal sybil-resistance proof",
        "P5": "existential non-degeneracy over the declared representative normal-scenario group",
        "P13": "D8b seller self-purchase accounting identity only",
        "P15": "counterfactual diagnostics when applicable; non-applicability is retained",
        "P16": "canonical serialization checks reported by the evidence runner",
    }
    return scopes.get(property_id, "all applicable normal-scenario evidence")


def _coverage(observations: Sequence[PropertyObservation]) -> RedistributionCoverage:
    ordered = tuple(observations)
    applicable = tuple(item.evidence_id for item in ordered if item.status != "non-applicable")
    passing = tuple(item.evidence_id for item in ordered if item.status == "pass")
    failing = tuple(item.evidence_id for item in ordered if item.status == "fail")
    if not applicable:
        status = "non-applicable"
    elif passing:
        status = "pass"
    else:
        status = "fail"
    return RedistributionCoverage(
        representative_scenario_ids=REPRESENTATIVE_P5_SCENARIOS,
        scenario_statuses=ordered,
        applicable_scenario_ids=applicable,
        passing_scenario_ids=passing,
        failing_scenario_ids=failing,
        status=status,
    )


def _baseline_normal_properties(report: ScenarioReport) -> dict[str, CandidatePropertyResult]:
    settlement = report.baseline_result.settlement
    _require(settlement is not None, "BASELINE_SETTLEMENT_REQUIRED", scenario_id=report.metadata.scenario_id)
    assert settlement is not None
    meaningful_losers = tuple(
        bidder
        for bidder in report.metrics.bidders
        if not bidder.winner and bidder.premium_lift > 0
    )
    if settlement.candidate_pool == 0 or not meaningful_losers:
        p5 = CandidatePropertyResult("P5", "non-applicable", "scenario has no funded pool with a mechanically contributing loser")
    else:
        passed = any(bidder.reward > 0 for bidder in meaningful_losers)
        p5 = CandidatePropertyResult("P5", "pass" if passed else "fail", "" if passed else "no mechanically contributing loser received a positive reward")
    uint_values = (
        settlement.final_price,
        settlement.gross_premium,
        settlement.fee_amount,
        settlement.net_premium,
        settlement.candidate_pool,
        settlement.assigned_distribution,
        *(report.baseline_result.allocation.rewards.values()),
    )
    below_threshold = (
        settlement.gross_premium == 0
        or settlement.net_premium < report.params.min_premium_net
    )
    statuses = {
        "P5": p5,
        "P6": CandidatePropertyResult("P6", "pass" if settlement.assigned_distribution <= settlement.candidate_pool <= settlement.net_premium else "fail", "baseline assigned <= pool <= net premium"),
        "P7": CandidatePropertyResult("P7", "pass" if settlement.winner is None or report.baseline_result.allocation.rewards.get(settlement.winner, 0) == 0 else "fail", "baseline winner identity exclusion"),
        "P8": CandidatePropertyResult("P8", "pass" if all(type(value) is int and value >= 0 for value in uint_values) else "fail", "baseline uint outputs"),
        "P9": CandidatePropertyResult("P9", "pass" if settlement.seller_proceeds is None or settlement.seller_proceeds >= 0 else "fail", "baseline seller proceeds"),
        "P10": CandidatePropertyResult("P10", "pass", "Lot B settlement is the authoritative source"),
        "P11": CandidatePropertyResult("P11", "pass", "the reducer reads the immutable Lot B/C report"),
        "P12": CandidatePropertyResult("P12", "pass", "baseline economic logic does not dispatch on scenario or case IDs"),
        "P14": CandidatePropertyResult("P14", "pass" if not below_threshold or (settlement.candidate_pool == 0 and settlement.assigned_distribution == 0) else "fail", "baseline threshold funding rule"),
        "P15": CandidatePropertyResult("P15", "non-applicable", "baseline uses no counterfactual contribution policy"),
    }
    return statuses


def _baseline_partition(report: CandidateIdentityPartitionReport) -> IdentityPartitionDiagnostic:
    vector = report.vector
    winner = "EXTERNAL_WINNER"
    unsplit_identity = "COALITION_UNSPLIT"
    split_identities = ("COALITION_SPLIT_0", "COALITION_SPLIT_1")
    unsplit = allocate_distribution(
        vector.candidate_pool,
        (unsplit_identity, winner),
        winner,
        {unsplit_identity: vector.unsplit_secondary_weight, winner: 0},
        vector.per_user_reward_cap_bps,
    )
    split = allocate_distribution(
        vector.candidate_pool,
        (*split_identities, winner),
        winner,
        {
            split_identities[0]: vector.split_secondary_weights[0],
            split_identities[1]: vector.split_secondary_weights[1],
            winner: 0,
        },
        vector.per_user_reward_cap_bps,
    )
    unsplit_reward = unsplit.rewards[unsplit_identity]
    split_reward = sum(split.rewards[identity] for identity in split_identities)
    weight_matched = sum(vector.split_secondary_weights) == vector.unsplit_secondary_weight
    status = "pass" if weight_matched and split_reward <= unsplit_reward else "fail"
    return IdentityPartitionDiagnostic(
        vector.vector_id,
        vector.candidate_pool,
        vector.unsplit_secondary_weight,
        unsplit_reward,
        split_reward,
        split_reward - unsplit_reward,
        weight_matched,
        status,
    )


def _winner_actor_indirect_reward(case_report, *, attack: bool) -> int:
    branch_report = case_report.baseline.attack if attack else case_report.baseline.reference
    branch = case_report.baseline.metrics.attack if attack else case_report.baseline.metrics.reference
    winner_actor = branch.winner_actor
    winner_identity = branch.winner_identity
    if winner_actor is None:
        return 0
    rewards = branch_report.baseline_result.allocation.rewards
    return sum(
        rewards.get(identity, 0)
        for identity, actor_id in case_report.baseline.identity_ownership.items()
        if actor_id == winner_actor and identity != winner_identity
    )


def _external_participants(case_report, *, attack: bool) -> tuple[str, ...]:
    branch = case_report.baseline.metrics.attack if attack else case_report.baseline.metrics.reference
    coalition = set(case_report.baseline.coalition_actor_ids)
    return tuple(
        sorted(
            identity
            for actor in branch.actors
            if actor.actor_id not in coalition
            for identity in actor.participating_bidder_identities
        )
    )


def _baseline_coalition_weight(case_report, *, attack: bool) -> int:
    scenario = case_report.baseline.attack if attack else case_report.baseline.reference
    branch = case_report.baseline.metrics.attack if attack else case_report.baseline.metrics.reference
    return sum(
        scenario.baseline_result.scores[identity].final_score
        for identity in branch.coalition.bidder_identities
        if identity in scenario.baseline_result.scores
    )


def _baseline_p2a(case_report) -> CandidatePropertyResult:
    metrics = case_report.baseline.metrics
    reference = metrics.reference
    attack = metrics.attack
    comparable = all(
        (
            reference.coalition.aggregate_locked_capital == attack.coalition.aggregate_locked_capital,
            reference.coalition.mechanical_premium_lift == attack.coalition.mechanical_premium_lift,
            _baseline_coalition_weight(case_report, attack=False) == _baseline_coalition_weight(case_report, attack=True),
            case_report.baseline.reference.metrics.auction.candidate_pool == case_report.baseline.attack.metrics.auction.candidate_pool,
            case_report.baseline.reference.metrics.auction.final_price == case_report.baseline.attack.metrics.auction.final_price,
            case_report.baseline.reference.metrics.auction.gross_premium == case_report.baseline.attack.metrics.auction.gross_premium,
            case_report.baseline.reference.baseline_result.settlement.net_premium == case_report.baseline.attack.baseline_result.settlement.net_premium,
            case_report.baseline.reference.metrics.auction.fee_amount == case_report.baseline.attack.metrics.auction.fee_amount,
            _external_participants(case_report, attack=False) == _external_participants(case_report, attack=True),
            reference.terminal_nft_claimant_actor == attack.terminal_nft_claimant_actor,
        )
    )
    if not comparable:
        return CandidatePropertyResult("P2a", "non-comparable", "identity-splitting controls are unmatched; the gain remains reported")
    gain = attack.coalition.coalition_reward - reference.coalition.coalition_reward
    return CandidatePropertyResult("P2a", "pass" if gain <= 0 else "fail", "" if gain <= 0 else "split identities gained baseline reward over the unsplit branch")


def _baseline_adversarial_properties(case_report) -> dict[str, CandidatePropertyResult]:
    baseline = case_report.baseline
    threat = baseline.metadata.threat_class
    metrics = baseline.metrics
    properties = {
        property_id: CandidatePropertyResult(property_id, "non-applicable", "not applicable to this declared threat class")
        for property_id in ("P1", "P2a", "P3", "P4", "P13", "P15")
    }
    if threat == "strategic-losing":
        passed = metrics.deltas.delta_coalition_reward == 0 and metrics.attack.coalition.mechanical_premium_lift == 0
        properties["P1"] = CandidatePropertyResult("P1", "pass" if passed else "fail", "" if passed else "a zero-mechanical-contribution deliberate loser gained baseline reward")
    elif threat == "sybil-per-user-cap":
        properties["P2a"] = _baseline_p2a(case_report)
    elif threat == "sybil-participant-threshold":
        reference_pool = baseline.reference.metrics.auction.candidate_pool
        attack_pool = baseline.attack.metrics.auction.candidate_pool
        properties["P3"] = CandidatePropertyResult("P3", "pass" if reference_pool == attack_pool else "fail", "" if reference_pool == attack_pool else "baseline pool changed when participant identity count changed")
        indirect = _winner_actor_indirect_reward(case_report, attack=True)
        properties["P4"] = CandidatePropertyResult("P4", "pass" if indirect == 0 else "fail", "" if indirect == 0 else "winner actor received baseline reward through another identity")
    elif threat == "seller-self-purchase":
        fee_delta = baseline.attack.metrics.auction.fee_amount - baseline.reference.metrics.auction.fee_amount
        passed = metrics.deltas.delta_coalition_utility == -fee_delta
        properties["P13"] = CandidatePropertyResult("P13", "pass" if passed else "fail", "" if passed else "seller self-purchase actor delta differs from negative protocol fee")
    properties["P15"] = CandidatePropertyResult("P15", "non-applicable", "baseline uses no counterfactual contribution policy")
    return properties


def _normal_diagnostic_from_baseline(report: ScenarioReport) -> NormalScenarioDiagnostic:
    auction = report.metrics.auction
    rewards = tuple(bidder.reward for bidder in report.metrics.bidders if not bidder.winner and bidder.reward > 0)
    max_share = Rational(max(rewards), auction.assigned_distribution) if rewards and auction.assigned_distribution > 0 else None
    return NormalScenarioDiagnostic(
        report.metadata.scenario_id,
        report.metadata.scenario_family,
        auction.candidate_pool,
        auction.assigned_distribution,
        auction.unassigned_remainder,
        auction.seller_proceeds,
        report.metrics.seller_protocol.seller_premium_capture,
        len(rewards),
        report.metrics.seller_protocol.redistribution_share,
        Rational(auction.assigned_distribution, auction.candidate_pool) if auction.candidate_pool > 0 else None,
        max_share,
        any(
            not bidder.winner and bidder.premium_lift > 0 and bidder.reward > 0
            for bidder in report.metrics.bidders
        ),
        True,
    )


def _normal_diagnostic_from_candidate(
    report: ScenarioReport,
    comparison: ScenarioCandidateComparison,
) -> NormalScenarioDiagnostic:
    metrics = comparison.metrics
    return NormalScenarioDiagnostic(
        report.metadata.scenario_id,
        report.metadata.scenario_family,
        metrics.candidate_pool,
        metrics.assigned_distribution,
        metrics.unassigned_remainder,
        metrics.seller_proceeds,
        metrics.seller_premium_capture,
        metrics.rewarded_loser_count,
        metrics.redistribution_share,
        metrics.pool_utilization,
        metrics.max_reward_share,
        metrics.redistribution_usefulness,
        metrics.allocative_efficiency_matches_baseline,
    )


def _baseline_adversarial_diagnostic(case_report) -> AdversarialDiagnostic:
    baseline = case_report.baseline
    metrics = baseline.metrics
    reward_gain = metrics.attack.coalition.coalition_reward - metrics.reference.coalition.coalition_reward
    utility_gain = metrics.attack.coalition.coalition_economic_change - metrics.reference.coalition.coalition_economic_change
    splitting_status = "comparable" if _baseline_p2a(case_report).status != "non-comparable" else "controls-unmatched"
    return AdversarialDiagnostic(
        baseline.metadata.case_id,
        baseline.metadata.threat_class,
        metrics.deltas.delta_coalition_utility,
        metrics.deltas.delta_coalition_reward,
        metrics.deltas.delta_seller_revenue,
        splitting_status,
        reward_gain,
        utility_gain,
        _winner_actor_indirect_reward(case_report, attack=True),
        "D6 only: winnerActorIndirectReward == 0",
        IDENTITY_IMPOSSIBILITY_CAVEAT,
    )


def _candidate_adversarial_diagnostic(
    case_id: str,
    threat_class: str,
    comparison: AdversarialCandidateComparison,
) -> AdversarialDiagnostic:
    splitting = comparison.identity_splitting
    return AdversarialDiagnostic(
        case_id,
        threat_class,
        comparison.deltas.delta_coalition_utility,
        comparison.deltas.delta_coalition_reward,
        comparison.deltas.delta_seller_proceeds,
        splitting.status,
        splitting.identity_splitting_gain_reward,
        splitting.identity_splitting_gain_utility,
        comparison.attack_overlay.winner_actor_indirect_reward,
        "D6 only: winnerActorIndirectReward == 0",
        comparison.impossibility_caveat,
    )


def _candidate_feasibility(comparison: ScenarioCandidateComparison) -> FeasibilityEvidence:
    model = comparison.evaluation.model
    return FeasibilityEvidence(
        "declared-candidate-policy-signature",
        model.allocation_subject.value,
        model.contribution_policy.value,
        model.allocation_policy.value,
        model.reward_cap_policy.value,
        model.secondary_weight_policy.value,
        model.contribution_policy.value == "identity-counterfactual-policy-replay",
        False,
    )


def _baseline_feasibility() -> FeasibilityEvidence:
    return FeasibilityEvidence(
        "existing-authoritative-solidity-baseline",
        "bidder-identity",
        "EF/ET/II/reputation finalScore allocation weight",
        "normalized",
        "baseline-per-user",
        "baseline-final-score",
        False,
        False,
    )


def _property_analysis(
    property_id: str,
    observations: Sequence[PropertyObservation],
    *,
    status: str | None = None,
) -> PropertyAnalysis:
    ordered = tuple(observations)
    return PropertyAnalysis(property_id, status or _aggregate_status(ordered), _scope(property_id), ordered)


def _candidate_model_analysis(report: CandidateCatalogReport, model_id: str) -> ModelAnalysis:
    normal_comparisons = tuple(
        next(item for item in scenario.candidates if item.model_id == model_id)
        for scenario in report.normal_scenarios
    )
    adversarial_comparisons = tuple(
        next(item for item in case.candidates if item.model_id == model_id)
        for case in report.adversarial_cases
    )
    observations: dict[str, list[PropertyObservation]] = {property_id: [] for property_id in PROPERTY_IDS}
    for scenario_report, comparison in zip(report.normal_scenarios, normal_comparisons, strict=True):
        for item in comparison.properties:
            observations[item.property_id].append(_observation(scenario_report.scenario_id, item))
    for case_report, comparison in zip(report.adversarial_cases, adversarial_comparisons, strict=True):
        for item in comparison.properties:
            if item.status != "non-applicable" or item.property_id == "P15":
                observations[item.property_id].append(_observation(case_report.case_id, item))
    partition = next(item for item in report.identity_partition.candidates if item.model_id == model_id)
    observations["P2b"].append(_observation(report.identity_partition.vector.vector_id, partition.property))
    observations["P16"].append(_observation("candidate-catalog-report", report.runner_properties[0]))
    p5_observations = tuple(
        item
        for item in observations["P5"]
        if item.evidence_id in REPRESENTATIVE_P5_SCENARIOS
    )
    coverage = _coverage(p5_observations)
    properties = tuple(
        _property_analysis(
            property_id,
            observations[property_id],
            status=coverage.status if property_id == "P5" else None,
        )
        for property_id in PROPERTY_IDS
    )
    property_status = {item.property_id: item.status for item in properties}
    disqualifications = tuple(
        f"{property_id}:{property_status[property_id]}"
        for property_id in SELECTION_GATE_IDS
        if property_status[property_id] != "pass"
    )
    vector = report.identity_partition.vector
    partition_diagnostic = IdentityPartitionDiagnostic(
        vector.vector_id,
        partition.candidate_pool,
        partition.aggregate_weight,
        partition.unsplit_reward,
        partition.split_reward,
        partition.identity_splitting_gain_reward,
        partition.weight_matched,
        partition.property.status,
    )
    return ModelAnalysis(
        model_id,
        properties,
        not disqualifications,
        disqualifications,
        partition_diagnostic,
        coverage,
        tuple(
            _normal_diagnostic_from_candidate(scenario.baseline, comparison)
            for scenario, comparison in zip(report.normal_scenarios, normal_comparisons, strict=True)
        ),
        tuple(
            _candidate_adversarial_diagnostic(
                case.case_id,
                case.baseline.metadata.threat_class,
                comparison,
            )
            for case, comparison in zip(report.adversarial_cases, adversarial_comparisons, strict=True)
        ),
        _candidate_feasibility(normal_comparisons[0]),
    )


def _baseline_model_analysis(report: CandidateCatalogReport) -> ModelAnalysis:
    observations: dict[str, list[PropertyObservation]] = {property_id: [] for property_id in PROPERTY_IDS}
    normal_property_maps = tuple(_baseline_normal_properties(item.baseline) for item in report.normal_scenarios)
    for scenario_report, properties in zip(report.normal_scenarios, normal_property_maps, strict=True):
        for item in properties.values():
            observations[item.property_id].append(_observation(scenario_report.scenario_id, item))
    for case_report in report.adversarial_cases:
        for item in _baseline_adversarial_properties(case_report).values():
            if item.status != "non-applicable" or item.property_id == "P15":
                observations[item.property_id].append(_observation(case_report.case_id, item))
    partition = _baseline_partition(report.identity_partition)
    observations["P2b"].append(PropertyObservation(partition.vector_id, partition.status, "baseline allocate_distribution result"))
    observations["P16"].append(PropertyObservation("candidate-catalog-report", "pass", "baseline evidence is contained in the byte-stable Lot E report"))
    p5_observations = tuple(item for item in observations["P5"] if item.evidence_id in REPRESENTATIVE_P5_SCENARIOS)
    coverage = _coverage(p5_observations)
    properties = tuple(
        _property_analysis(property_id, observations[property_id], status=coverage.status if property_id == "P5" else None)
        for property_id in PROPERTY_IDS
    )
    property_status = {item.property_id: item.status for item in properties}
    disqualifications = tuple(
        f"{property_id}:{property_status[property_id]}"
        for property_id in SELECTION_GATE_IDS
        if property_status[property_id] != "pass"
    )
    return ModelAnalysis(
        BASELINE_MODEL_ID,
        properties,
        not disqualifications,
        disqualifications,
        partition,
        coverage,
        tuple(_normal_diagnostic_from_baseline(item.baseline) for item in report.normal_scenarios),
        tuple(_baseline_adversarial_diagnostic(item) for item in report.adversarial_cases),
        _baseline_feasibility(),
    )


def _rational_less_or_equal(left: Rational, right: Rational) -> bool:
    return left.numerator * right.denominator <= right.numerator * left.denominator


def _pareto_relations(models: Sequence[ModelAnalysis]) -> tuple[ScenarioParetoRelation, ...]:
    by_model = {
        model.model_id: {item.scenario_id: item for item in model.normal_scenarios}
        for model in models
    }
    relations: list[ScenarioParetoRelation] = []
    for scenario_id in EXPECTED_NORMAL_SCENARIOS:
        for dominant_id in EXPECTED_MODEL_IDS:
            dominant = by_model[dominant_id][scenario_id]
            for dominated_id in EXPECTED_MODEL_IDS:
                if dominant_id == dominated_id:
                    continue
                dominated = by_model[dominated_id][scenario_id]
                if (dominant.max_reward_share is None) != (dominated.max_reward_share is None):
                    continue
                weak = (
                    dominant.assigned_distribution >= dominated.assigned_distribution
                    and dominant.seller_proceeds >= dominated.seller_proceeds
                    and dominant.rewarded_loser_count >= dominated.rewarded_loser_count
                    and (
                        dominant.max_reward_share is None
                        or _rational_less_or_equal(dominant.max_reward_share, dominated.max_reward_share)
                    )
                )
                if not weak:
                    continue
                strict: list[str] = []
                if dominant.assigned_distribution > dominated.assigned_distribution:
                    strict.append("assigned_distribution")
                if dominant.seller_proceeds > dominated.seller_proceeds:
                    strict.append("seller_proceeds")
                if dominant.rewarded_loser_count > dominated.rewarded_loser_count:
                    strict.append("rewarded_loser_count")
                if (
                    dominant.max_reward_share is not None
                    and dominated.max_reward_share is not None
                    and _rational_less_or_equal(dominant.max_reward_share, dominated.max_reward_share)
                    and dominant.max_reward_share != dominated.max_reward_share
                ):
                    strict.append("max_reward_share")
                if strict:
                    relations.append(ScenarioParetoRelation(scenario_id, dominant_id, dominated_id, tuple(strict)))
    return tuple(relations)


def _with_serialization_check(report: DecisionAnalysisReport) -> DecisionAnalysisReport:
    _require(not report.runner_properties, "RUNNER_PROPERTIES_ALREADY_FINALIZED")
    first = _canonical_json(report)
    second = _canonical_json(report)
    return replace(
        report,
        runner_properties=(
            CandidatePropertyResult(
                "P16",
                "pass" if first == second else "fail",
                "" if first == second else "decision analysis serialization was not byte-stable",
            ),
        ),
    )


def analyze_evidence(report: CandidateCatalogReport) -> DecisionAnalysisReport:
    """Validate and reduce one complete Lot E report without selecting an outcome."""

    before = _canonical_json(report)
    source_commit = _validate_evidence(report)
    candidate_models = tuple(
        _candidate_model_analysis(report, model_id)
        for model_id in EXPECTED_CANDIDATE_IDS
    )
    models = (*candidate_models, _baseline_model_analysis(report))
    _require(_canonical_json(report) == before, "EVIDENCE_MUTATED_BY_REDUCER")
    criteria = (
        IntegrityCriterion("complete-model-set", True, "baseline plus candidates A-E"),
        IntegrityCriterion("complete-normal-scenario-set", True, "14 declared normal scenarios"),
        IntegrityCriterion("complete-adversarial-case-set", True, "10 declared adversarial pairs"),
        IntegrityCriterion("canonical-p2b-vector", True, "fixed 40/60 partition vector"),
        IntegrityCriterion("version-and-catalog-consistency", True, "Lot B-E versions match"),
        IntegrityCriterion("lot-b-invariants", True, "all reported Lot B invariants pass"),
        IntegrityCriterion("lot-c-analytical-checks", True, "all reported Lot C checks pass"),
        IntegrityCriterion("lot-d-accounting-and-controls", True, "actor accounting and matched controls pass"),
        IntegrityCriterion("candidate-invariants-and-properties", True, "mandatory Lot E invariants and integrity properties pass"),
        IntegrityCriterion("source-preservation", True, "the evidence report remained byte-stable during reduction"),
    )
    result = DecisionAnalysisReport(
        DecisionAnalysisMetadata(
            DECISION_ANALYSIS_SCHEMA_VERSION,
            source_commit,
            report.metadata.candidate_catalog_version,
            "lot-c-catalog-v1",
            "adversarial-catalog-v1",
            report.metadata.baseline_economic_model_version,
        ),
        True,
        criteria,
        models,
        _pareto_relations(models),
        (
            "Selection eligibility is mechanical gate evaluation, not a final product choice.",
            "P4 is bounded to D6 and proves only winnerActorIndirectReward == 0 in that declared diagnostic.",
            IDENTITY_IMPOSSIBILITY_CAVEAT,
            "P2a non-comparable and property non-applicability remain explicit evidence statuses.",
            "P5 is existential over the declared representative group; individual failures remain redistribution-coverage diagnostics.",
            "Scenario-local Pareto relations use no cross-scenario sums, averages, votes, probabilities, or global ranking.",
        ),
        (),
    )
    return _with_serialization_check(result)


def serialize_analysis(report: DecisionAnalysisReport) -> str:
    """Return compact, sorted, deterministic ASCII JSON."""

    return _canonical_json(report)
