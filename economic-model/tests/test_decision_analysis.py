from __future__ import annotations

import json
import unittest
from dataclasses import replace
from unittest.mock import patch

import bidback_economics.decision_analysis as decision_analysis
from bidback_economics.candidate_runner import run_all_candidates, serialize_report
from bidback_economics.candidates import load_catalog as load_candidate_catalog
from bidback_economics.counterfactuals import load_adversarial_catalog
from bidback_economics.decision_analysis import (
    BASELINE_MODEL_ID,
    EXPECTED_MODEL_IDS,
    REPRESENTATIVE_P5_SCENARIOS,
    DecisionAnalysisError,
    analyze_evidence,
    serialize_analysis,
)
from bidback_economics.scenarios import load_catalog as load_scenario_catalog


SOURCE_COMMIT = "cf3f447a5632591209f3610e2acff77eec10aaaf"


def _model(report, model_id):
    return next(item for item in report.models if item.model_id == model_id)


def _property(model, property_id):
    return next(item for item in model.properties if item.property_id == property_id)


def _all_keys(value):
    if isinstance(value, dict):
        return set(value).union(*( _all_keys(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(_all_keys(item) for item in value))
    return set()


class DecisionAnalysisTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.candidate_catalog = load_candidate_catalog()
        cls.scenario_catalog = load_scenario_catalog()
        cls.adversarial_catalog = load_adversarial_catalog()
        cls.evidence = run_all_candidates(
            cls.candidate_catalog,
            cls.scenario_catalog,
            cls.adversarial_catalog,
            source_commit=SOURCE_COMMIT,
        )
        cls.analysis = analyze_evidence(cls.evidence)

    def test_complete_evidence_reduces_to_six_comparable_model_rows(self) -> None:
        self.assertTrue(self.analysis.integrity_valid)
        self.assertTrue(all(item.passed for item in self.analysis.integrity_criteria))
        self.assertEqual(tuple(item.model_id for item in self.analysis.models), EXPECTED_MODEL_IDS)
        self.assertEqual(self.analysis.models[-1].model_id, BASELINE_MODEL_ID)
        self.assertEqual(self.analysis.metadata.source_commit, SOURCE_COMMIT)
        self.assertTrue(all(len(item.normal_scenarios) == 14 for item in self.analysis.models))
        self.assertTrue(all(len(item.adversarial_cases) == 10 for item in self.analysis.models))

    def test_p5_is_existential_and_preserves_every_representative_status(self) -> None:
        candidate_e = _model(self.analysis, "candidate-v1-e")
        coverage = candidate_e.redistribution_coverage
        self.assertEqual(coverage.representative_scenario_ids, REPRESENTATIVE_P5_SCENARIOS)
        self.assertEqual(
            tuple(item.evidence_id for item in coverage.scenario_statuses),
            REPRESENTATIVE_P5_SCENARIOS,
        )
        expected = (
            "non-applicable"
            if not coverage.applicable_scenario_ids
            else "pass"
            if coverage.passing_scenario_ids
            else "fail"
        )
        self.assertEqual(coverage.status, expected)
        self.assertIn("s04-heterogeneous", coverage.failing_scenario_ids)
        p5 = _property(candidate_e, "P5")
        self.assertEqual(p5.status, coverage.status)
        self.assertTrue(any(item.status == "fail" for item in p5.observations))

    def test_p4_is_only_the_bounded_d6_gate_with_identity_caveat(self) -> None:
        candidate_b = _model(self.analysis, "candidate-v1-b")
        p4 = _property(candidate_b, "P4")
        self.assertEqual(tuple(item.evidence_id for item in p4.observations), ("d06-sybil-threshold",))
        self.assertIn("winnerActorIndirectReward == 0", p4.scope)
        self.assertIn("not a universal sybil-resistance proof", p4.scope)
        d6 = next(item for item in candidate_b.adversarial_cases if item.case_id == "d06-sybil-threshold")
        self.assertGreater(d6.attack_winner_actor_indirect_reward, 0)
        self.assertIn("cannot be inferred on-chain", d6.impossibility_caveat)

    def test_reducer_computes_no_final_decision_or_selected_model(self) -> None:
        payload = json.loads(serialize_analysis(self.analysis))
        keys = _all_keys(payload)
        serialized = json.dumps(payload, sort_keys=True)
        self.assertTrue(
            keys.isdisjoint(
                {
                    "selectedModel",
                    "finalOutcome",
                    "selected_model",
                    "final_outcome",
                    "recommendation",
                }
            )
        )
        self.assertNotIn("retain-baseline", serialized)
        self.assertNotIn("parameter-only", serialized)
        self.assertNotIn("no-current-candidate-acceptable", serialized)

    def test_baseline_p2b_calls_existing_allocate_distribution_helper(self) -> None:
        real_allocate = decision_analysis.allocate_distribution
        with patch.object(
            decision_analysis,
            "allocate_distribution",
            wraps=real_allocate,
        ) as helper:
            analysis = analyze_evidence(self.evidence)
        self.assertEqual(helper.call_count, 2)
        baseline = _model(analysis, BASELINE_MODEL_ID)
        self.assertEqual(_property(baseline, "P2b").status, baseline.identity_partition.status)
        self.assertTrue(baseline.identity_partition.weight_matched)

    def test_non_comparable_and_non_applicable_statuses_are_retained(self) -> None:
        candidate_a = _model(self.analysis, "candidate-v1-a")
        p2a = _property(candidate_a, "P2a")
        self.assertEqual(p2a.status, "non-comparable")
        self.assertEqual(p2a.observations[0].status, "non-comparable")
        baseline = _model(self.analysis, BASELINE_MODEL_ID)
        p15 = _property(baseline, "P15")
        self.assertEqual(p15.status, "non-applicable")
        self.assertTrue(all(item.status == "non-applicable" for item in p15.observations))

    def test_incomplete_evidence_is_rejected_fail_closed(self) -> None:
        incomplete = replace(
            self.evidence,
            normal_scenarios=self.evidence.normal_scenarios[:-1],
        )
        with self.assertRaises(DecisionAnalysisError) as raised:
            analyze_evidence(incomplete)
        self.assertEqual(raised.exception.code, "NORMAL_SCENARIO_SET_INVALID")

    def test_failed_mandatory_integrity_property_is_rejected_fail_closed(self) -> None:
        scenario_report = self.evidence.normal_scenarios[0]
        comparison = scenario_report.candidates[0]
        bad_properties = tuple(
            replace(item, status="fail", detail="synthetic integrity failure")
            if item.property_id == "P6"
            else item
            for item in comparison.properties
        )
        bad_comparison = replace(comparison, properties=bad_properties)
        bad_scenario_report = replace(
            scenario_report,
            candidates=(bad_comparison, *scenario_report.candidates[1:]),
        )
        invalid = replace(
            self.evidence,
            normal_scenarios=(bad_scenario_report, *self.evidence.normal_scenarios[1:]),
        )
        with self.assertRaises(DecisionAnalysisError) as raised:
            analyze_evidence(invalid)
        self.assertEqual(raised.exception.code, "CANDIDATE_INTEGRITY_PROPERTY_FAILED")

    def test_all_atomic_properties_and_applicable_p13_are_present(self) -> None:
        expected = {
            "P1", "P2a", "P2b", "P3", "P4", "P5", "P6", "P7", "P8",
            "P9", "P10", "P11", "P12", "P13", "P14", "P15", "P16",
        }
        for model in self.analysis.models:
            with self.subTest(model=model.model_id):
                self.assertEqual({item.property_id for item in model.properties}, expected)
                p13 = _property(model, "P13")
                self.assertEqual(tuple(item.evidence_id for item in p13.observations), ("d08b-seller-self-purchase",))
                self.assertEqual(p13.status, "pass")

    def test_reducer_does_not_change_any_lot_a_e_result(self) -> None:
        before = serialize_report(self.evidence)
        analyze_evidence(self.evidence)
        after = serialize_report(self.evidence)
        self.assertEqual(after, before)

    def test_two_independent_evidence_constructions_are_deterministic(self) -> None:
        first = run_all_candidates(
            self.candidate_catalog,
            self.scenario_catalog,
            self.adversarial_catalog,
            source_commit=SOURCE_COMMIT,
        )
        second = run_all_candidates(
            load_candidate_catalog(),
            load_scenario_catalog(),
            load_adversarial_catalog(),
            source_commit=SOURCE_COMMIT,
        )
        self.assertIsNot(first, second)
        self.assertEqual(
            serialize_analysis(analyze_evidence(first)),
            serialize_analysis(analyze_evidence(second)),
        )

    def test_pareto_relations_are_scenario_local_and_not_a_ranking(self) -> None:
        for relation in self.analysis.scenario_pareto_relations:
            self.assertIn(relation.scenario_id, {item.id for item in self.scenario_catalog.scenarios})
            self.assertIn(relation.dominant_model_id, EXPECTED_MODEL_IDS)
            self.assertIn(relation.dominated_model_id, EXPECTED_MODEL_IDS)
            self.assertTrue(relation.strictly_better_dimensions)
        payload = json.loads(serialize_analysis(self.analysis))
        self.assertNotIn("ranking", payload)
        self.assertNotIn("score", payload)
        self.assertNotIn("winner", payload)


if __name__ == "__main__":
    unittest.main()
