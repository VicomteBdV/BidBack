"""Lot C scenario runner and standard-library command-line interface."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

from .baseline import DEFAULT_REPUTATION_BPS, simulate_auction
from .metrics import AnalyticalCheck, EconomicMetrics, compute_metrics, evaluate_analytical_checks
from .scenarios import (
    REPORT_SCHEMA_VERSION,
    BidDecision,
    Opportunity,
    Scenario,
    load_catalog,
    load_scenario,
    materialize_bid_trace,
)
from .types import AuctionConfig, BidEvent, InvariantResult, ParamsSnapshot, SimulationResult, serialize_result


@dataclass(frozen=True, slots=True)
class ReportMetadata:
    scenario_schema_version: int
    report_schema_version: int
    catalog_version: str
    scenario_id: str
    scenario_family: str
    scenario_description: str
    economic_model_version: str
    source_commit: str | None


@dataclass(frozen=True, slots=True)
class ExpandedBidderDefinition:
    id: str
    valuation: int
    budget: int | None
    max_bid_cap: int
    profile: str
    fixed_cap: int | None
    reputation: int


@dataclass(frozen=True, slots=True)
class ExpandedScenarioDefinition:
    start_price: int
    start_time: int
    duration: int
    seller: str
    focal_bidder: str | None


@dataclass(frozen=True, slots=True)
class ScenarioReport:
    metadata: ReportMetadata
    scenario: ExpandedScenarioDefinition
    params: ParamsSnapshot
    bidders: tuple[ExpandedBidderDefinition, ...]
    opportunities: tuple[Opportunity, ...]
    decisions: tuple[BidDecision, ...]
    generated_bid_trace: tuple[BidEvent, ...]
    baseline_result: SimulationResult
    metrics: EconomicMetrics
    baseline_invariants: tuple[InvariantResult, ...]
    analytical_checks: tuple[AnalyticalCheck, ...]


def run_scenario(scenario: Scenario, source_commit: str | None = None) -> ScenarioReport:
    materialized = materialize_bid_trace(scenario, source_commit=source_commit)
    config = AuctionConfig(
        start_price=scenario.start_price,
        start_time=scenario.start_time,
        duration=scenario.duration,
        params=scenario.params,
        finalization_time=materialized.end_time,
        source_commit=source_commit,
        seller=scenario.seller,
    )
    result = simulate_auction(config, materialized.bid_trace, scenario.reputations)
    if result.metadata.model_version != scenario.economic_model_version:
        raise ValueError(
            "economic model version mismatch: "
            f"catalog={scenario.economic_model_version} baseline={result.metadata.model_version}"
        )
    baseline_before_metrics = serialize_result(result)
    metrics = compute_metrics(scenario, result)
    baseline_after_metrics = serialize_result(result)
    checks = evaluate_analytical_checks(
        scenario,
        result,
        metrics,
        baseline_unchanged=baseline_before_metrics == baseline_after_metrics,
    )
    expanded_bidders = tuple(
        ExpandedBidderDefinition(
            bidder.id,
            bidder.valuation,
            bidder.budget,
            bidder.max_bid_cap,
            bidder.profile,
            bidder.fixed_cap,
            scenario.reputations.get(bidder.id, DEFAULT_REPUTATION_BPS),
        )
        for bidder in scenario.bidders
    )
    metadata = ReportMetadata(
        scenario.schema_version,
        REPORT_SCHEMA_VERSION,
        scenario.catalog_version,
        scenario.id,
        scenario.family,
        scenario.description,
        result.metadata.model_version,
        source_commit,
    )
    scenario_definition = ExpandedScenarioDefinition(
        scenario.start_price,
        scenario.start_time,
        scenario.duration,
        scenario.seller,
        scenario.focal_bidder,
    )
    return ScenarioReport(
        metadata,
        scenario_definition,
        scenario.params,
        expanded_bidders,
        scenario.opportunities,
        materialized.decisions,
        materialized.bid_trace,
        result,
        metrics,
        result.invariants,
        checks,
    )


def serialize_report(report: ScenarioReport) -> str:
    return json.dumps(asdict(report), sort_keys=True, separators=(",", ":"))


def serialize_reports(reports: Sequence[ScenarioReport]) -> str:
    return json.dumps([asdict(report) for report in reports], sort_keys=True, separators=(",", ":"))


def _human_summary(report: ScenarioReport) -> str:
    auction = report.metrics.auction
    winner = report.baseline_result.settlement.winner if report.baseline_result.settlement else None
    return (
        f"{report.metadata.scenario_id}: winner={winner or 'none'} "
        f"finalPrice={auction.final_price} grossPremium={auction.gross_premium} "
        f"assignedDistribution={auction.assigned_distribution} extensions={auction.extensions_used}"
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run deterministic BidBack Lot C scenarios")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--list", action="store_true", help="list scenario IDs")
    selection.add_argument("--scenario", metavar="ID", help="run one scenario")
    selection.add_argument("--all", action="store_true", help="run every scenario")
    parser.add_argument("--json", action="store_true", help="emit deterministic machine-readable JSON")
    parser.add_argument("--source-commit", help="caller-supplied source commit; no Git discovery")
    parser.add_argument("--catalog", type=Path, help=argparse.SUPPRESS)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    catalog = load_catalog(args.catalog)
    ordered = tuple(sorted(catalog.scenarios, key=lambda item: item.id))

    if args.list:
        if args.json:
            print(
                json.dumps(
                    [
                        {"description": scenario.description, "family": scenario.family, "id": scenario.id}
                        for scenario in ordered
                    ],
                    sort_keys=True,
                    separators=(",", ":"),
                )
            )
        else:
            for scenario in ordered:
                print(f"{scenario.id}\t{scenario.family}\t{scenario.description}")
        return 0

    if args.scenario:
        scenario = load_scenario(args.scenario, args.catalog)
        report = run_scenario(scenario, source_commit=args.source_commit)
        print(serialize_report(report) if args.json else _human_summary(report))
        return 0

    reports = tuple(run_scenario(scenario, source_commit=args.source_commit) for scenario in ordered)
    if args.json:
        print(serialize_reports(reports))
    else:
        for report in reports:
            print(_human_summary(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
