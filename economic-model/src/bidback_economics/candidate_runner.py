"""Lot E candidate comparison orchestration and standard-library CLI.

The runner deliberately contains no allocation, property, actor-accounting, or
counterfactual formula.  It runs the authoritative Lot C/D reports once and
passes those immutable inputs to :mod:`bidback_economics.model_comparison`.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Sequence, TypeAlias, TypeVar

from .adversarial_runner import AdversarialReport, run_case
from .candidates import (
    CandidateCatalog,
    CandidateDefinition,
    load_candidate,
    load_catalog as load_candidate_catalog,
)
from .counterfactuals import (
    AdversarialCatalog,
    CounterfactualCase,
    load_adversarial_catalog,
)
from .model_comparison import (
    AdversarialCandidateComparison,
    CandidatePropertyResult,
    IdentityPartitionEvaluation,
    ScenarioCandidateComparison,
    compare_adversarial_candidates,
    compare_scenario_candidates,
    evaluate_adversarial_candidate,
    evaluate_identity_partition,
    evaluate_scenario_candidate,
)
from .runner import ScenarioReport, run_scenario
from .scenarios import (
    Scenario,
    ScenarioCatalog,
    load_catalog as load_scenario_catalog,
    load_scenario,
)


class CandidateRunnerError(ValueError):
    """A selected catalogue or authoritative report cannot be orchestrated."""

    def __init__(self, code: str, **context: object) -> None:
        self.code = code
        self.context = context
        detail = code if not context else f"{code}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class CandidateReportMetadata:
    candidate_schema_version: int
    candidate_report_schema_version: int
    candidate_catalog_version: str
    baseline_economic_model_version: str
    source_commit: str | None


@dataclass(frozen=True, slots=True)
class CandidateModelCatalogReport:
    metadata: CandidateReportMetadata
    models: tuple[CandidateDefinition, ...]
    runner_properties: tuple[CandidatePropertyResult, ...]


@dataclass(frozen=True, slots=True)
class IdentityPartitionVector:
    vector_id: str
    candidate_pool: int
    gross_premium: int
    unsplit_contribution: int
    split_contributions: tuple[int, ...]
    per_user_reward_cap_bps: int
    unsplit_secondary_weight: int
    split_secondary_weights: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class CandidateIdentityPartitionReport:
    vector: IdentityPartitionVector
    candidates: tuple[IdentityPartitionEvaluation, ...]


@dataclass(frozen=True, slots=True)
class CandidateScenarioReport:
    metadata: CandidateReportMetadata
    scenario_id: str
    baseline: ScenarioReport
    candidates: tuple[ScenarioCandidateComparison, ...]
    identity_partition: CandidateIdentityPartitionReport
    runner_properties: tuple[CandidatePropertyResult, ...]


@dataclass(frozen=True, slots=True)
class CandidateAdversarialReport:
    metadata: CandidateReportMetadata
    case_id: str
    baseline: AdversarialReport
    candidates: tuple[AdversarialCandidateComparison, ...]
    identity_partition: CandidateIdentityPartitionReport
    runner_properties: tuple[CandidatePropertyResult, ...]


@dataclass(frozen=True, slots=True)
class CandidateCatalogReport:
    metadata: CandidateReportMetadata
    normal_scenarios: tuple[CandidateScenarioReport, ...]
    adversarial_cases: tuple[CandidateAdversarialReport, ...]
    identity_partition: CandidateIdentityPartitionReport
    runner_properties: tuple[CandidatePropertyResult, ...]


CandidateReport: TypeAlias = (
    CandidateModelCatalogReport
    | CandidateScenarioReport
    | CandidateAdversarialReport
    | CandidateCatalogReport
)
CandidateReportT = TypeVar(
    "CandidateReportT",
    CandidateModelCatalogReport,
    CandidateScenarioReport,
    CandidateAdversarialReport,
    CandidateCatalogReport,
)


_P2B_VECTOR = IdentityPartitionVector(
    vector_id="p2b-matched-contribution-40-60-v1",
    candidate_pool=1_000,
    gross_premium=2_000,
    unsplit_contribution=1_000,
    split_contributions=(400, 600),
    per_user_reward_cap_bps=4_000,
    unsplit_secondary_weight=1_000,
    split_secondary_weights=(400, 600),
)


def _canonical_json(report: CandidateReport) -> str:
    return json.dumps(
        asdict(report),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


def _with_serialization_check(report: CandidateReportT) -> CandidateReportT:
    """Attach P16 after checking a payload that does not contain P16 itself."""

    if report.runner_properties:
        raise CandidateRunnerError("RUNNER_PROPERTIES_ALREADY_FINALIZED")
    first = _canonical_json(report)
    second = _canonical_json(report)
    passed = first == second
    return replace(
        report,
        runner_properties=(
            CandidatePropertyResult(
                property_id="P16",
                status="pass" if passed else "fail",
                detail="" if passed else "canonical JSON serialization was not byte-stable",
            ),
        ),
    )


def _metadata(
    catalog: CandidateCatalog,
    source_commit: str | None,
) -> CandidateReportMetadata:
    return CandidateReportMetadata(
        candidate_schema_version=catalog.schema_version,
        candidate_report_schema_version=catalog.report_schema_version,
        candidate_catalog_version=catalog.catalog_version,
        baseline_economic_model_version=catalog.baseline_economic_model_version,
        source_commit=source_commit,
    )


def _require_baseline_version(
    *,
    actual: str,
    catalog: CandidateCatalog,
    subject_kind: str,
    subject_id: str,
) -> None:
    expected = catalog.baseline_economic_model_version
    if actual != expected:
        raise CandidateRunnerError(
            "BASELINE_ECONOMIC_MODEL_VERSION_MISMATCH",
            subject_kind=subject_kind,
            subject_id=subject_id,
            candidate_catalog_baseline_version=expected,
            authoritative_report_version=actual,
        )


def list_candidate_models(
    catalog: CandidateCatalog,
    *,
    source_commit: str | None = None,
) -> CandidateModelCatalogReport:
    """Return the candidate catalogue in stable model-ID order."""

    return _with_serialization_check(
        CandidateModelCatalogReport(
            metadata=_metadata(catalog, source_commit),
            models=tuple(sorted(catalog.candidates, key=lambda item: item.id)),
            runner_properties=(),
        )
    )


def evaluate_candidate_partitions(
    models: Sequence[CandidateDefinition],
) -> CandidateIdentityPartitionReport:
    """Run the declared matched-contribution P2b vector through comparison APIs."""

    vector = _P2B_VECTOR
    return CandidateIdentityPartitionReport(
        vector=vector,
        candidates=tuple(
            evaluate_identity_partition(
                model,
                candidate_pool=vector.candidate_pool,
                gross_premium=vector.gross_premium,
                unsplit_contribution=vector.unsplit_contribution,
                split_contributions=vector.split_contributions,
                per_user_reward_cap_bps=vector.per_user_reward_cap_bps,
                unsplit_secondary_weight=vector.unsplit_secondary_weight,
                split_secondary_weights=vector.split_secondary_weights,
            )
            for model in sorted(models, key=lambda item: item.id)
        ),
    )


def run_candidate_scenario(
    model: CandidateDefinition,
    scenario: Scenario,
    *,
    candidate_catalog: CandidateCatalog,
    source_commit: str | None = None,
) -> CandidateScenarioReport:
    """Run one Lot C baseline and overlay one named candidate."""

    baseline = run_scenario(scenario, source_commit=source_commit)
    _require_baseline_version(
        actual=baseline.metadata.economic_model_version,
        catalog=candidate_catalog,
        subject_kind="scenario",
        subject_id=scenario.id,
    )
    comparison = evaluate_scenario_candidate(model, scenario, baseline)
    return _with_serialization_check(
        CandidateScenarioReport(
            metadata=_metadata(candidate_catalog, source_commit),
            scenario_id=scenario.id,
            baseline=baseline,
            candidates=(comparison,),
            identity_partition=evaluate_candidate_partitions((model,)),
            runner_properties=(),
        )
    )


def compare_candidate_scenario(
    models: Sequence[CandidateDefinition],
    scenario: Scenario,
    *,
    candidate_catalog: CandidateCatalog,
    source_commit: str | None = None,
) -> CandidateScenarioReport:
    """Run one Lot C baseline and overlay all supplied candidates."""

    baseline = run_scenario(scenario, source_commit=source_commit)
    _require_baseline_version(
        actual=baseline.metadata.economic_model_version,
        catalog=candidate_catalog,
        subject_kind="scenario",
        subject_id=scenario.id,
    )
    comparisons = compare_scenario_candidates(models, scenario, baseline)
    return _with_serialization_check(
        CandidateScenarioReport(
            metadata=_metadata(candidate_catalog, source_commit),
            scenario_id=scenario.id,
            baseline=baseline,
            candidates=comparisons,
            identity_partition=evaluate_candidate_partitions(models),
            runner_properties=(),
        )
    )


def run_candidate_case(
    model: CandidateDefinition,
    case: CounterfactualCase,
    *,
    candidate_catalog: CandidateCatalog,
    adversarial_catalog: AdversarialCatalog,
    source_commit: str | None = None,
) -> CandidateAdversarialReport:
    """Run one Lot D pair and overlay one named candidate."""

    baseline = run_case(
        case,
        catalog=adversarial_catalog,
        source_commit=source_commit,
    )
    _require_baseline_version(
        actual=baseline.metadata.economic_model_version,
        catalog=candidate_catalog,
        subject_kind="adversarial-case",
        subject_id=case.case_id,
    )
    comparison = evaluate_adversarial_candidate(model, case, baseline)
    return _with_serialization_check(
        CandidateAdversarialReport(
            metadata=_metadata(candidate_catalog, source_commit),
            case_id=case.case_id,
            baseline=baseline,
            candidates=(comparison,),
            identity_partition=evaluate_candidate_partitions((model,)),
            runner_properties=(),
        )
    )


def compare_candidate_case(
    models: Sequence[CandidateDefinition],
    case: CounterfactualCase,
    *,
    candidate_catalog: CandidateCatalog,
    adversarial_catalog: AdversarialCatalog,
    source_commit: str | None = None,
) -> CandidateAdversarialReport:
    """Run one Lot D pair and overlay all supplied candidates."""

    baseline = run_case(
        case,
        catalog=adversarial_catalog,
        source_commit=source_commit,
    )
    _require_baseline_version(
        actual=baseline.metadata.economic_model_version,
        catalog=candidate_catalog,
        subject_kind="adversarial-case",
        subject_id=case.case_id,
    )
    comparisons = compare_adversarial_candidates(models, case, baseline)
    return _with_serialization_check(
        CandidateAdversarialReport(
            metadata=_metadata(candidate_catalog, source_commit),
            case_id=case.case_id,
            baseline=baseline,
            candidates=comparisons,
            identity_partition=evaluate_candidate_partitions(models),
            runner_properties=(),
        )
    )


def run_all_candidates(
    candidate_catalog: CandidateCatalog,
    scenario_catalog: ScenarioCatalog,
    adversarial_catalog: AdversarialCatalog,
    *,
    source_commit: str | None = None,
) -> CandidateCatalogReport:
    """Run every normal scenario and adversarial pair in stable ID order."""

    models = tuple(sorted(candidate_catalog.candidates, key=lambda item: item.id))
    normal = tuple(
        compare_candidate_scenario(
            models,
            scenario,
            candidate_catalog=candidate_catalog,
            source_commit=source_commit,
        )
        for scenario in sorted(scenario_catalog.scenarios, key=lambda item: item.id)
    )
    adversarial = tuple(
        compare_candidate_case(
            models,
            case,
            candidate_catalog=candidate_catalog,
            adversarial_catalog=adversarial_catalog,
            source_commit=source_commit,
        )
        for case in sorted(adversarial_catalog.cases, key=lambda item: item.case_id)
    )
    return _with_serialization_check(
        CandidateCatalogReport(
            metadata=_metadata(candidate_catalog, source_commit),
            normal_scenarios=normal,
            adversarial_cases=adversarial,
            identity_partition=evaluate_candidate_partitions(models),
            runner_properties=(),
        )
    )


def serialize_report(report: CandidateReport) -> str:
    """Serialize one Lot E report with canonical deterministic JSON options."""

    return _canonical_json(report)


def _human_scenario(report: CandidateScenarioReport) -> tuple[str, ...]:
    return tuple(
        f"{report.scenario_id}\t{comparison.model_id}\t"
        f"candidatePool={comparison.metrics.candidate_pool} "
        f"assignedDistribution={comparison.metrics.assigned_distribution} "
        f"unassignedRemainder={comparison.metrics.unassigned_remainder} "
        f"sellerProceeds={comparison.metrics.seller_proceeds}"
        for comparison in report.candidates
    )


def _human_adversarial(report: CandidateAdversarialReport) -> tuple[str, ...]:
    return tuple(
        f"{report.case_id}\t{comparison.model_id}\t"
        f"deltaCoalitionUtility={comparison.deltas.delta_coalition_utility} "
        f"deltaCoalitionReward={comparison.deltas.delta_coalition_reward} "
        f"identitySplitting={comparison.identity_splitting.status}"
        for comparison in report.candidates
    )


def _print_human(report: CandidateReport) -> None:
    if isinstance(report, CandidateModelCatalogReport):
        for model in report.models:
            print(
                f"{model.id}\t{model.contribution_policy.value}\t"
                f"{model.allocation_policy.value}\t{model.description}"
            )
        return
    if isinstance(report, CandidateScenarioReport):
        for line in _human_scenario(report):
            print(line)
        return
    if isinstance(report, CandidateAdversarialReport):
        for line in _human_adversarial(report):
            print(line)
        return
    for scenario_report in report.normal_scenarios:
        for line in _human_scenario(scenario_report):
            print(line)
    for case_report in report.adversarial_cases:
        for line in _human_adversarial(case_report):
            print(line)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compare deterministic BidBack Lot E candidate models"
    )
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument(
        "--list-models",
        action="store_true",
        help="list candidate model IDs",
    )
    selection.add_argument("--model", metavar="ID", help="run one candidate model")
    selection.add_argument(
        "--compare",
        action="store_true",
        help="compare every candidate on one normal scenario",
    )
    selection.add_argument(
        "--adversarial",
        metavar="CASE",
        help="compare every candidate on one Lot D pair",
    )
    selection.add_argument(
        "--all",
        dest="run_all",
        action="store_true",
        help="compare every candidate on all normal and adversarial inputs",
    )
    parser.add_argument(
        "--scenario",
        metavar="ID",
        help="normal scenario selected by --model or --compare",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit deterministic machine-readable JSON",
    )
    parser.add_argument(
        "--source-commit",
        help="caller-supplied source commit; no repository discovery",
    )
    parser.add_argument("--candidate-catalog", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--scenario-catalog", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--adversarial-catalog", type=Path, help=argparse.SUPPRESS)
    return parser


def _validated_args(
    parser: argparse.ArgumentParser,
    argv: Sequence[str] | None,
) -> argparse.Namespace:
    args = parser.parse_args(argv)
    normal_mode = args.model is not None or args.compare
    if normal_mode and args.scenario is None:
        parser.error("--scenario is required with --model or --compare")
    if not normal_mode and args.scenario is not None:
        parser.error("--scenario is only valid with --model or --compare")
    return args


def _case_by_id(catalog: AdversarialCatalog, case_id: str) -> CounterfactualCase:
    try:
        return catalog.case_by_id[case_id]
    except KeyError as exc:
        raise CandidateRunnerError("UNKNOWN_ADVERSARIAL_CASE_ID", case_id=case_id) from exc


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = _validated_args(parser, argv)
    candidate_catalog = load_candidate_catalog(args.candidate_catalog)

    if args.list_models:
        report: CandidateReport = list_candidate_models(
            candidate_catalog,
            source_commit=args.source_commit,
        )
    elif args.model is not None:
        model = load_candidate(args.model, args.candidate_catalog)
        scenario = load_scenario(args.scenario, args.scenario_catalog)
        report = run_candidate_scenario(
            model,
            scenario,
            candidate_catalog=candidate_catalog,
            source_commit=args.source_commit,
        )
    elif args.compare:
        scenario = load_scenario(args.scenario, args.scenario_catalog)
        report = compare_candidate_scenario(
            candidate_catalog.candidates,
            scenario,
            candidate_catalog=candidate_catalog,
            source_commit=args.source_commit,
        )
    elif args.adversarial is not None:
        adversarial_catalog = load_adversarial_catalog(args.adversarial_catalog)
        case = _case_by_id(adversarial_catalog, args.adversarial)
        report = compare_candidate_case(
            candidate_catalog.candidates,
            case,
            candidate_catalog=candidate_catalog,
            adversarial_catalog=adversarial_catalog,
            source_commit=args.source_commit,
        )
    else:
        scenario_catalog = load_scenario_catalog(args.scenario_catalog)
        adversarial_catalog = load_adversarial_catalog(args.adversarial_catalog)
        report = run_all_candidates(
            candidate_catalog,
            scenario_catalog,
            adversarial_catalog,
            source_commit=args.source_commit,
        )

    if args.json:
        print(serialize_report(report))
    else:
        _print_human(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
