"""Lot F1 analytical decision reducer and standard-library CLI."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Sequence

from .candidate_runner import run_all_candidates
from .candidates import load_catalog as load_candidate_catalog
from .counterfactuals import load_adversarial_catalog
from .decision_analysis import DecisionAnalysisReport, analyze_evidence, serialize_analysis
from .scenarios import load_catalog as load_scenario_catalog


def run_decision_analysis(
    source_commit: str,
    *,
    candidate_catalog_path: Path | None = None,
    scenario_catalog_path: Path | None = None,
    adversarial_catalog_path: Path | None = None,
) -> DecisionAnalysisReport:
    """Build the complete Lot E evidence once and reduce it without Git discovery."""

    if not source_commit:
        raise ValueError("source_commit is required")
    candidate_catalog = load_candidate_catalog(candidate_catalog_path)
    scenario_catalog = load_scenario_catalog(scenario_catalog_path)
    adversarial_catalog = load_adversarial_catalog(adversarial_catalog_path)
    evidence = run_all_candidates(
        candidate_catalog,
        scenario_catalog,
        adversarial_catalog,
        source_commit=source_commit,
    )
    return analyze_evidence(evidence)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Reduce complete BidBack Lot A-E evidence without selecting a final outcome"
    )
    parser.add_argument(
        "--source-commit",
        required=True,
        help="caller-supplied commit of the evaluated Lot A-E evidence base",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit deterministic machine-readable JSON",
    )
    parser.add_argument("--candidate-catalog", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--scenario-catalog", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--adversarial-catalog", type=Path, help=argparse.SUPPRESS)
    return parser


def _human_summary(report: DecisionAnalysisReport) -> tuple[str, ...]:
    lines = [
        f"sourceCommit={report.metadata.source_commit} integrityValid={str(report.integrity_valid).lower()}"
    ]
    for model in report.models:
        gates = ",".join(
            f"{item.property_id}={item.status}"
            for item in model.properties
            if item.property_id in {"P1", "P2a", "P2b", "P3", "P4", "P5"}
        )
        lines.append(
            f"{model.model_id}\tselectionEligible={str(model.selection_eligible).lower()}\t{gates}"
        )
    return tuple(lines)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    report = run_decision_analysis(
        args.source_commit,
        candidate_catalog_path=args.candidate_catalog,
        scenario_catalog_path=args.scenario_catalog,
        adversarial_catalog_path=args.adversarial_catalog,
    )
    if args.json:
        print(serialize_analysis(report))
    else:
        for line in _human_summary(report):
            print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
