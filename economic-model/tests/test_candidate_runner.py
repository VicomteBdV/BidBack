from __future__ import annotations

import io
import json
import subprocess
import unittest
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

import bidback_economics.candidate_runner as candidate_runner
from bidback_economics.candidate_runner import (
    CandidateCatalogReport,
    compare_candidate_case,
    compare_candidate_scenario,
    evaluate_candidate_partitions,
    list_candidate_models,
    main,
    run_all_candidates,
    run_candidate_case,
    run_candidate_scenario,
    serialize_report,
)
from bidback_economics.candidates import load_candidate, load_catalog as load_candidate_catalog
from bidback_economics.counterfactuals import load_adversarial_catalog
from bidback_economics.scenarios import load_catalog as load_scenario_catalog, load_scenario


def _stdout(argv: list[str]) -> str:
    output = io.StringIO()
    with redirect_stdout(output):
        result = main(argv)
    if result != 0:
        raise AssertionError(f"candidate runner returned {result}")
    return output.getvalue()


class CandidateRunnerReportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.candidate_catalog = load_candidate_catalog()
        cls.scenario = load_scenario("s01-no-competition")
        cls.model = load_candidate("candidate-v1-b")
        cls.adversarial_catalog = load_adversarial_catalog()
        cls.case = cls.adversarial_catalog.case_by_id["d01-deliberate-loser"]

    def test_single_scenario_report_has_complete_version_metadata(self) -> None:
        report = run_candidate_scenario(
            self.model,
            self.scenario,
            candidate_catalog=self.candidate_catalog,
            source_commit="manual-sha",
        )

        self.assertEqual(report.scenario_id, self.scenario.id)
        self.assertEqual(len(report.candidates), 1)
        self.assertEqual(report.candidates[0].model_id, self.model.id)
        self.assertEqual(
            report.metadata.candidate_schema_version,
            self.candidate_catalog.schema_version,
        )
        self.assertEqual(
            report.metadata.candidate_report_schema_version,
            self.candidate_catalog.report_schema_version,
        )
        self.assertEqual(
            report.metadata.candidate_catalog_version,
            self.candidate_catalog.catalog_version,
        )
        self.assertEqual(
            report.metadata.baseline_economic_model_version,
            self.candidate_catalog.baseline_economic_model_version,
        )
        self.assertEqual(report.metadata.source_commit, "manual-sha")
        self.assertEqual(report.baseline.metadata.source_commit, "manual-sha")
        self.assertEqual(
            [item.model_id for item in report.identity_partition.candidates],
            [self.model.id],
        )
        self.assertEqual(
            report.identity_partition.candidates[0].property.property_id,
            "P2b",
        )
        self.assertEqual(report.runner_properties[0].property_id, "P16")
        self.assertEqual(report.runner_properties[0].status, "pass")

    def test_single_and_multi_scenario_helpers_use_stable_model_order(self) -> None:
        reversed_models = tuple(reversed(self.candidate_catalog.candidates))
        compared = compare_candidate_scenario(
            reversed_models,
            self.scenario,
            candidate_catalog=self.candidate_catalog,
        )
        self.assertEqual(
            [item.model_id for item in compared.candidates],
            sorted(item.id for item in self.candidate_catalog.candidates),
        )
        partition_statuses = {
            item.model_id: item.property.status
            for item in compared.identity_partition.candidates
        }
        vector = compared.identity_partition.vector
        self.assertEqual(sum(vector.split_contributions), vector.unsplit_contribution)
        self.assertEqual(
            sum(vector.split_secondary_weights),
            vector.unsplit_secondary_weight,
        )
        self.assertTrue(
            all(
                item.contribution_matched and item.weight_matched
                for item in compared.identity_partition.candidates
            )
        )
        self.assertEqual(
            partition_statuses,
            {
                "candidate-v1-a": "fail",
                "candidate-v1-b": "pass",
                "candidate-v1-c": "pass",
                "candidate-v1-d": "fail",
                "candidate-v1-e": "pass",
            },
        )

    def test_single_and_multi_adversarial_helpers_use_matching_case(self) -> None:
        single = run_candidate_case(
            self.model,
            self.case,
            candidate_catalog=self.candidate_catalog,
            adversarial_catalog=self.adversarial_catalog,
        )
        self.assertEqual(single.case_id, self.case.case_id)
        self.assertEqual(single.baseline.metadata.case_id, self.case.case_id)
        self.assertEqual([item.model_id for item in single.candidates], [self.model.id])

        compared = compare_candidate_case(
            tuple(reversed(self.candidate_catalog.candidates)),
            self.case,
            candidate_catalog=self.candidate_catalog,
            adversarial_catalog=self.adversarial_catalog,
        )
        self.assertEqual(
            [item.model_id for item in compared.candidates],
            sorted(item.id for item in self.candidate_catalog.candidates),
        )
        self.assertEqual(
            [item.model_id for item in compared.identity_partition.candidates],
            sorted(item.id for item in self.candidate_catalog.candidates),
        )

    def test_serialization_is_exact_compact_ascii_and_deterministic(self) -> None:
        listing = list_candidate_models(
            self.candidate_catalog,
            source_commit="caller-supplied",
        )
        first = serialize_report(listing)
        second = serialize_report(listing)
        expected = json.dumps(
            asdict(listing),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )

        self.assertEqual(first, second)
        self.assertEqual(first, expected)
        self.assertNotIn(": ", first)
        first.encode("ascii")
        self.assertEqual(first.count('"property_id":"P16"'), 1)
        self.assertEqual(listing.runner_properties[0].property_id, "P16")
        self.assertEqual(listing.runner_properties[0].status, "pass")

    def test_all_orchestration_sorts_models_scenarios_and_cases(self) -> None:
        scenario_catalog = load_scenario_catalog()
        scenario_calls: list[tuple[str, tuple[str, ...]]] = []
        case_calls: list[tuple[str, tuple[str, ...]]] = []

        def record_scenario(models, scenario, **kwargs):
            _ = kwargs
            scenario_calls.append((scenario.id, tuple(model.id for model in models)))
            return scenario.id

        def record_case(models, case, **kwargs):
            _ = kwargs
            case_calls.append((case.case_id, tuple(model.id for model in models)))
            return case.case_id

        with patch.object(
            candidate_runner,
            "compare_candidate_scenario",
            side_effect=record_scenario,
        ), patch.object(
            candidate_runner,
            "compare_candidate_case",
            side_effect=record_case,
        ):
            report = run_all_candidates(
                self.candidate_catalog,
                scenario_catalog,
                self.adversarial_catalog,
                source_commit="manual-sha",
            )

        expected_models = tuple(sorted(model.id for model in self.candidate_catalog.candidates))
        expected_scenarios = tuple(sorted(item.id for item in scenario_catalog.scenarios))
        expected_cases = tuple(sorted(item.case_id for item in self.adversarial_catalog.cases))
        self.assertEqual(len(expected_scenarios), 14)
        self.assertEqual(len(expected_cases), 10)
        self.assertEqual(report.normal_scenarios, expected_scenarios)
        self.assertEqual(report.adversarial_cases, expected_cases)
        self.assertEqual(tuple(item[0] for item in scenario_calls), expected_scenarios)
        self.assertEqual(tuple(item[0] for item in case_calls), expected_cases)
        self.assertTrue(all(item[1] == expected_models for item in scenario_calls))
        self.assertTrue(all(item[1] == expected_models for item in case_calls))
        self.assertEqual(report.metadata.source_commit, "manual-sha")


class CandidateRunnerCliTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.candidate_catalog = load_candidate_catalog()

    def test_list_models_mode_has_stable_human_and_json_order(self) -> None:
        human = _stdout(["--list-models"])
        human_ids = [line.split("\t", 1)[0] for line in human.splitlines()]
        expected = sorted(model.id for model in self.candidate_catalog.candidates)
        self.assertEqual(human_ids, expected)

        payload = json.loads(_stdout(["--list-models", "--json"]))
        self.assertEqual([model["id"] for model in payload["models"]], expected)
        self.assertEqual(payload["metadata"]["candidate_schema_version"], 1)
        self.assertEqual(payload["metadata"]["candidate_report_schema_version"], 1)
        self.assertEqual(
            payload["metadata"]["baseline_economic_model_version"],
            "solidity-baseline-v1",
        )
        self.assertEqual(payload["runner_properties"][0]["property_id"], "P16")
        self.assertEqual(payload["runner_properties"][0]["status"], "pass")

    def test_model_mode_emits_one_candidate_and_preserves_source_commit(self) -> None:
        argv = [
            "--model",
            "candidate-v1-e",
            "--scenario",
            "s01-no-competition",
            "--source-commit",
            "caller-sha",
            "--json",
        ]
        first = _stdout(argv)
        second = _stdout(argv)
        payload = json.loads(first)

        self.assertEqual(first, second)
        self.assertEqual(payload["scenario_id"], "s01-no-competition")
        self.assertEqual(
            [item["model_id"] for item in payload["candidates"]],
            ["candidate-v1-e"],
        )
        self.assertEqual(payload["metadata"]["source_commit"], "caller-sha")
        self.assertEqual(
            payload["baseline"]["metadata"]["source_commit"],
            "caller-sha",
        )
        self.assertEqual(
            payload["identity_partition"]["candidates"][0]["property"]["property_id"],
            "P2b",
        )
        self.assertEqual(payload["runner_properties"][0]["property_id"], "P16")
        self.assertEqual(payload["runner_properties"][0]["status"], "pass")

    def test_compare_mode_emits_every_candidate_in_sorted_order(self) -> None:
        payload = json.loads(
            _stdout(
                [
                    "--compare",
                    "--scenario",
                    "s01-no-competition",
                    "--json",
                ]
            )
        )
        ids = [item["model_id"] for item in payload["candidates"]]
        self.assertEqual(ids, sorted(model.id for model in self.candidate_catalog.candidates))
        self.assertEqual(
            [
                item["property"]["property_id"]
                for item in payload["identity_partition"]["candidates"]
            ],
            ["P2b"] * len(self.candidate_catalog.candidates),
        )
        self.assertEqual(payload["runner_properties"][0]["property_id"], "P16")

    def test_adversarial_mode_emits_every_candidate_for_matching_case(self) -> None:
        payload = json.loads(
            _stdout(
                [
                    "--adversarial",
                    "d01-deliberate-loser",
                    "--json",
                ]
            )
        )
        ids = [item["model_id"] for item in payload["candidates"]]
        self.assertEqual(payload["case_id"], "d01-deliberate-loser")
        self.assertEqual(
            payload["baseline"]["metadata"]["case_id"],
            "d01-deliberate-loser",
        )
        self.assertEqual(ids, sorted(model.id for model in self.candidate_catalog.candidates))
        self.assertEqual(
            [item["model_id"] for item in payload["identity_partition"]["candidates"]],
            sorted(model.id for model in self.candidate_catalog.candidates),
        )
        self.assertEqual(payload["runner_properties"][0]["status"], "pass")

    def test_all_mode_dispatches_catalog_report(self) -> None:
        empty = candidate_runner._with_serialization_check(
            CandidateCatalogReport(
                metadata=list_candidate_models(self.candidate_catalog).metadata,
                normal_scenarios=(),
                adversarial_cases=(),
                identity_partition=evaluate_candidate_partitions(
                    self.candidate_catalog.candidates
                ),
                runner_properties=(),
            )
        )
        with patch.object(
            candidate_runner,
            "run_all_candidates",
            return_value=empty,
        ) as run_all:
            payload = json.loads(_stdout(["--all", "--json"]))

        run_all.assert_called_once()
        self.assertEqual(payload["normal_scenarios"], [])
        self.assertEqual(payload["adversarial_cases"], [])
        self.assertEqual(
            [
                item["property"]["property_id"]
                for item in payload["identity_partition"]["candidates"]
            ],
            ["P2b"] * len(self.candidate_catalog.candidates),
        )
        self.assertEqual(payload["runner_properties"][0]["property_id"], "P16")

    def test_invalid_mode_combinations_fail_through_argparse(self) -> None:
        invalid = (
            [],
            ["--model", "candidate-v1-b"],
            ["--compare"],
            ["--list-models", "--scenario", "s01-no-competition"],
            ["--adversarial", "d01-deliberate-loser", "--scenario", "s01-no-competition"],
            ["--all", "--scenario", "s01-no-competition"],
            [
                "--model",
                "candidate-v1-b",
                "--compare",
                "--scenario",
                "s01-no-competition",
            ],
        )
        for argv in invalid:
            with self.subTest(argv=argv), redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    main(argv)
                self.assertEqual(raised.exception.code, 2)

    def test_hidden_catalog_arguments_are_not_advertised(self) -> None:
        help_text = candidate_runner._parser().format_help()
        self.assertNotIn("--candidate-catalog", help_text)
        self.assertNotIn("--scenario-catalog", help_text)
        self.assertNotIn("--adversarial-catalog", help_text)

    def test_runner_uses_stdout_only_and_never_discovers_a_commit(self) -> None:
        real_open = Path.open
        parser_destinations = {
            action.dest for action in candidate_runner._parser()._actions
        }
        self.assertNotIn("subprocess", candidate_runner.__dict__)
        self.assertTrue(
            parser_destinations.isdisjoint({"output", "results", "results_dir"})
        )

        def read_only_open(path: Path, mode: str = "r", *args, **kwargs):
            if any(marker in mode for marker in ("w", "a", "x", "+")):
                raise AssertionError(f"unexpected file write: {path}")
            return real_open(path, mode, *args, **kwargs)

        with patch.object(Path, "open", read_only_open), patch.object(
            Path,
            "write_text",
            side_effect=AssertionError("unexpected text write"),
        ), patch.object(
            Path,
            "write_bytes",
            side_effect=AssertionError("unexpected byte write"),
        ), patch.object(
            Path,
            "mkdir",
            side_effect=AssertionError("unexpected directory creation"),
        ), patch.object(
            subprocess,
            "run",
            side_effect=AssertionError("unexpected subprocess"),
        ):
            payload = json.loads(
                _stdout(
                    [
                        "--model",
                        "candidate-v1-b",
                        "--scenario",
                        "s01-no-competition",
                        "--json",
                    ]
                )
            )

        self.assertIsNone(payload["metadata"]["source_commit"])
        self.assertIsNone(payload["baseline"]["metadata"]["source_commit"])


if __name__ == "__main__":
    unittest.main()
