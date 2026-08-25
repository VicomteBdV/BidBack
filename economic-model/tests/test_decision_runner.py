from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

import bidback_economics.decision_runner as decision_runner
from bidback_economics.candidate_runner import run_all_candidates
from bidback_economics.candidates import load_catalog as load_candidate_catalog
from bidback_economics.counterfactuals import load_adversarial_catalog
from bidback_economics.decision_analysis import analyze_evidence, serialize_analysis
from bidback_economics.decision_runner import main, run_decision_analysis
from bidback_economics.scenarios import load_catalog as load_scenario_catalog


SOURCE_COMMIT = "cf3f447a5632591209f3610e2acff77eec10aaaf"


def _stdout(argv: list[str]) -> str:
    output = io.StringIO()
    with redirect_stdout(output):
        result = main(argv)
    if result != 0:
        raise AssertionError(f"decision runner returned {result}")
    return output.getvalue()


class DecisionRunnerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        evidence = run_all_candidates(
            load_candidate_catalog(),
            load_scenario_catalog(),
            load_adversarial_catalog(),
            source_commit=SOURCE_COMMIT,
        )
        cls.analysis = analyze_evidence(evidence)

    def test_source_commit_is_required_by_api_and_cli(self) -> None:
        with self.assertRaises(ValueError):
            run_decision_analysis("")
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as raised:
            main(["--json"])
        self.assertEqual(raised.exception.code, 2)

    def test_caller_source_commit_is_propagated_without_discovery(self) -> None:
        evidence = object()
        reduced = object()
        with patch.object(decision_runner, "load_candidate_catalog", return_value="candidates"), patch.object(
            decision_runner, "load_scenario_catalog", return_value="scenarios"
        ), patch.object(
            decision_runner, "load_adversarial_catalog", return_value="adversarial"
        ), patch.object(
            decision_runner, "run_all_candidates", return_value=evidence
        ) as run_all, patch.object(
            decision_runner, "analyze_evidence", return_value=reduced
        ) as analyze:
            result = run_decision_analysis("caller-supplied-sha")
        self.assertIs(result, reduced)
        run_all.assert_called_once_with(
            "candidates",
            "scenarios",
            "adversarial",
            source_commit="caller-supplied-sha",
        )
        analyze.assert_called_once_with(evidence)

    def test_json_stdout_is_compact_ascii_sorted_and_deterministic(self) -> None:
        with patch.object(decision_runner, "run_decision_analysis", return_value=self.analysis):
            first = _stdout(["--source-commit", SOURCE_COMMIT, "--json"])
            second = _stdout(["--source-commit", SOURCE_COMMIT, "--json"])
        self.assertEqual(first, second)
        first.encode("ascii")
        self.assertTrue(first.endswith("\n"))
        captured = first.removesuffix("\n")
        payload = json.loads(captured)
        canonical = json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        self.assertEqual(captured, canonical)
        self.assertEqual(captured, serialize_analysis(self.analysis))
        self.assertEqual(payload["metadata"]["source_commit"], SOURCE_COMMIT)
        self.assertEqual(payload["runner_properties"][0]["property_id"], "P16")
        self.assertEqual(payload["runner_properties"][0]["status"], "pass")

    def test_human_output_reports_gates_but_no_final_outcome(self) -> None:
        with patch.object(decision_runner, "run_decision_analysis", return_value=self.analysis):
            output = _stdout(["--source-commit", SOURCE_COMMIT])
        self.assertIn("integrityValid=true", output)
        self.assertIn("selectionEligible=", output)
        self.assertNotIn("selectedModel", output)
        self.assertNotIn("finalOutcome", output)
        self.assertNotIn("recommendation", output.lower())

    def test_runner_uses_stdout_only_and_has_no_subprocess_or_git_discovery(self) -> None:
        parser_destinations = {action.dest for action in decision_runner._parser()._actions}
        self.assertNotIn("subprocess", decision_runner.__dict__)
        self.assertTrue(parser_destinations.isdisjoint({"output", "results", "results_dir"}))
        self.assertNotIn("git", decision_runner.__dict__)

        real_open = Path.open

        def read_only_open(path: Path, mode: str = "r", *args, **kwargs):
            if any(marker in mode for marker in ("w", "a", "x", "+")):
                raise AssertionError(f"unexpected file write: {path}")
            return real_open(path, mode, *args, **kwargs)

        with patch.object(Path, "open", read_only_open), patch.object(
            Path, "write_text", side_effect=AssertionError("unexpected text write")
        ), patch.object(
            Path, "write_bytes", side_effect=AssertionError("unexpected byte write")
        ), patch.object(
            Path, "mkdir", side_effect=AssertionError("unexpected directory creation")
        ), patch.object(
            decision_runner, "run_decision_analysis", return_value=self.analysis
        ):
            payload = json.loads(_stdout(["--source-commit", SOURCE_COMMIT, "--json"]))
        self.assertEqual(payload["metadata"]["source_commit"], SOURCE_COMMIT)

    def test_hidden_catalog_arguments_are_not_advertised(self) -> None:
        help_text = decision_runner._parser().format_help()
        self.assertNotIn("--candidate-catalog", help_text)
        self.assertNotIn("--scenario-catalog", help_text)
        self.assertNotIn("--adversarial-catalog", help_text)


if __name__ == "__main__":
    unittest.main()
