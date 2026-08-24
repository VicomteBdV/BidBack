"""Lot D paired counterfactual runner and standard-library CLI.

The runner composes two complete Lot C ``ScenarioReport`` objects.  It does not
change either scenario or recompute any Lot B/C economic formula.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping, Sequence

from .adversarial_metrics import AdversarialMetrics, compute_adversarial_metrics
from .counterfactuals import (
    ActorDefinition,
    AdversarialCatalog,
    Comparison,
    CounterfactualCase,
    InitialNftEndowment,
    Intervention,
    KnownUnmatchedDimension,
    load_adversarial_catalog,
)
from .runner import ScenarioReport, run_scenario


class AdversarialRunnerError(ValueError):
    """A branch cannot support a valid Lot D paired report."""

    def __init__(self, code: str, **context: object) -> None:
        self.code = code
        self.context = context
        detail = code if not context else f"{code}: {context}"
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class AdversarialReportMetadata:
    adversarial_schema_version: int
    report_schema_version: int
    catalog_version: str
    economic_model_version: str
    case_id: str
    threat_class: str
    case_description: str
    reference_scenario_id: str
    attack_scenario_id: str
    source_commit: str | None


@dataclass(frozen=True, slots=True)
class ExpandedCaseDefinition:
    seller_actor_id: str
    initial_nft_endowment: InitialNftEndowment
    protocol_fee_recipient_actor_id: str | None
    intervention: Intervention
    matched_controls: tuple[Comparison, ...]
    known_unmatched_dimensions: tuple[KnownUnmatchedDimension, ...]
    diagnostic_relations: tuple[Comparison, ...]


@dataclass(frozen=True, slots=True)
class AdversarialReport:
    metadata: AdversarialReportMetadata
    case_definition: ExpandedCaseDefinition
    actors: tuple[ActorDefinition, ...]
    identity_ownership: Mapping[str, str]
    coalition_actor_ids: tuple[str, ...]
    reference: ScenarioReport
    attack: ScenarioReport
    metrics: AdversarialMetrics
    assumptions: tuple[str, ...]
    exclusions: tuple[str, ...]


_ASSUMPTIONS = (
    "Actor ownership, NFT valuations, coalitions, and capital budgets are declared model inputs.",
    "The terminal NFT claimant is the Lot B claim right; the report does not assert that a claim was executed.",
    "The V1 protocol fee recipient is external to the declared economic actors.",
    "Mechanical premium lift is mechanical trace attribution, not causal contribution.",
)

_EXCLUSIONS = (
    "Gas, capital opportunity cost, time preference, risk, execution costs, and resale uncertainty are excluded.",
    "No alternative scoring, mitigation, parameter sweep, optimizer, random process, or Monte Carlo is modeled.",
    "Positive modeled incremental utility is not proof of real-world profitability or production exploitability.",
    "Anti-sniping griefing utility and a monetary value of capital-time are not defined in Lot D.",
)


def _require_branch_checks(
    case: CounterfactualCase,
    branch_name: str,
    report: ScenarioReport,
) -> None:
    failed_invariants = tuple(
        item.name for item in report.baseline_invariants if not item.passed
    )
    if failed_invariants:
        raise AdversarialRunnerError(
            "LOT_B_INVARIANT_FAILED",
            case_id=case.case_id,
            branch=branch_name,
            invariants=failed_invariants,
        )
    failed_checks = tuple(
        item.name for item in report.analytical_checks if not item.passed
    )
    if failed_checks:
        raise AdversarialRunnerError(
            "LOT_C_ANALYTICAL_CHECK_FAILED",
            case_id=case.case_id,
            branch=branch_name,
            checks=failed_checks,
        )


def _require_actor_accounting_checks(
    case: CounterfactualCase,
    metrics: AdversarialMetrics,
) -> None:
    for branch_name, branch in (("reference", metrics.reference), ("attack", metrics.attack)):
        failed = tuple(item.name for item in branch.checks if not item.passed)
        if failed:
            raise AdversarialRunnerError(
                "LOT_D_ACCOUNTING_CHECK_FAILED",
                case_id=case.case_id,
                branch=branch_name,
                checks=failed,
            )


def run_case(
    case: CounterfactualCase,
    *,
    catalog: AdversarialCatalog | None = None,
    source_commit: str | None = None,
) -> AdversarialReport:
    """Run one complete reference/attack pair and enforce non-diagnostic gates."""

    resolved_catalog = catalog or load_adversarial_catalog()
    if case.reference_scenario.economic_model_version != resolved_catalog.economic_model_version:
        raise AdversarialRunnerError(
            "REFERENCE_ECONOMIC_MODEL_VERSION_MISMATCH",
            case_id=case.case_id,
        )
    if case.attack_scenario.economic_model_version != resolved_catalog.economic_model_version:
        raise AdversarialRunnerError(
            "ATTACK_ECONOMIC_MODEL_VERSION_MISMATCH",
            case_id=case.case_id,
        )

    reference = run_scenario(case.reference_scenario, source_commit=source_commit)
    attack = run_scenario(case.attack_scenario, source_commit=source_commit)
    _require_branch_checks(case, "reference", reference)
    _require_branch_checks(case, "attack", attack)

    # compute_adversarial_metrics raises MatchedControlFailure when an experimental
    # design control fails. Diagnostic relation failures remain data in ``metrics``.
    metrics = compute_adversarial_metrics(
        case,
        case.reference_scenario,
        case.attack_scenario,
        reference,
        attack,
    )
    _require_actor_accounting_checks(case, metrics)

    metadata = AdversarialReportMetadata(
        adversarial_schema_version=resolved_catalog.schema_version,
        report_schema_version=resolved_catalog.report_schema_version,
        catalog_version=resolved_catalog.catalog_version,
        economic_model_version=resolved_catalog.economic_model_version,
        case_id=case.case_id,
        threat_class=case.threat_class,
        case_description=case.description,
        reference_scenario_id=case.reference_scenario.id,
        attack_scenario_id=case.attack_scenario.id,
        source_commit=source_commit,
    )
    case_definition = ExpandedCaseDefinition(
        seller_actor_id=case.seller_actor_id,
        initial_nft_endowment=case.initial_nft_endowment,
        protocol_fee_recipient_actor_id=case.protocol_fee_recipient_actor_id,
        intervention=case.intervention,
        matched_controls=case.matched_controls,
        known_unmatched_dimensions=case.known_unmatched_dimensions,
        diagnostic_relations=case.diagnostic_relations,
    )
    return AdversarialReport(
        metadata=metadata,
        case_definition=case_definition,
        actors=tuple(sorted(case.actors, key=lambda item: item.actor_id)),
        identity_ownership=dict(sorted(case.identity_ownership.items())),
        coalition_actor_ids=tuple(sorted(case.coalition_actor_ids)),
        reference=reference,
        attack=attack,
        metrics=metrics,
        assumptions=_ASSUMPTIONS,
        exclusions=_EXCLUSIONS,
    )


def run_catalog(
    catalog: AdversarialCatalog,
    *,
    source_commit: str | None = None,
) -> tuple[AdversarialReport, ...]:
    """Run every pair in stable case-ID order."""

    return tuple(
        run_case(case, catalog=catalog, source_commit=source_commit)
        for case in sorted(catalog.cases, key=lambda item: item.case_id)
    )


def serialize_report(report: AdversarialReport) -> str:
    return json.dumps(
        asdict(report),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


def serialize_reports(reports: Sequence[AdversarialReport]) -> str:
    return json.dumps(
        [asdict(report) for report in reports],
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )


def _human_summary(report: AdversarialReport) -> str:
    reference = report.reference.metrics.auction
    attack = report.attack.metrics.auction
    deltas = report.metrics.deltas
    controls = report.metrics.matched_control_results
    diagnostics = report.metrics.diagnostic_relation_results
    passed_controls = sum(item.passed for item in controls)
    passed_diagnostics = sum(item.passed for item in diagnostics)
    return (
        f"{report.metadata.case_id}: "
        f"referencePrice={reference.final_price} attackPrice={attack.final_price} "
        f"deltaCoalitionUtility={deltas.delta_coalition_utility} "
        f"referenceLockedCapital={deltas.reference_locked_capital} "
        f"attackLockedCapital={deltas.attack_locked_capital} "
        f"deltaCapitalTimeWeiSeconds={deltas.delta_capital_time_exposure_wei_seconds} "
        f"matchedControls={passed_controls}/{len(controls)} "
        f"diagnosticRelations={passed_diagnostics}/{len(diagnostics)} "
        "interpretation=modeled-only"
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run deterministic BidBack Lot D paired diagnostics"
    )
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--list", action="store_true", help="list paired case IDs")
    selection.add_argument("--case", metavar="ID", help="run one paired case")
    selection.add_argument("--all", action="store_true", help="run every paired case")
    parser.add_argument("--json", action="store_true", help="emit deterministic machine-readable JSON")
    parser.add_argument("--source-commit", help="caller-supplied source commit; no Git discovery")
    parser.add_argument("--catalog", type=Path, help=argparse.SUPPRESS)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    catalog = load_adversarial_catalog(args.catalog)
    ordered = tuple(sorted(catalog.cases, key=lambda item: item.case_id))

    if args.list:
        if args.json:
            print(
                json.dumps(
                    [
                        {
                            "description": case.description,
                            "id": case.case_id,
                            "threat_class": case.threat_class,
                        }
                        for case in ordered
                    ],
                    sort_keys=True,
                    separators=(",", ":"),
                    ensure_ascii=True,
                )
            )
        else:
            for case in ordered:
                print(f"{case.case_id}\t{case.threat_class}\t{case.description}")
        return 0

    if args.case:
        try:
            case = catalog.case_by_id[args.case]
        except KeyError as exc:
            raise AdversarialRunnerError("UNKNOWN_CASE_ID", case_id=args.case) from exc
        report = run_case(case, catalog=catalog, source_commit=args.source_commit)
        print(serialize_report(report) if args.json else _human_summary(report))
        return 0

    reports = run_catalog(catalog, source_commit=args.source_commit)
    if args.json:
        print(serialize_reports(reports))
    else:
        for report in reports:
            print(_human_summary(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
