from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from bidback_economics.counterfactuals import (
    ADVERSARIAL_CATALOG_VERSION,
    ADVERSARIAL_REPORT_SCHEMA_VERSION,
    ADVERSARIAL_SCHEMA_VERSION,
    CounterfactualValidationError,
    Selector,
    case_ids,
    default_catalog_path,
    load_adversarial_catalog,
    load_case,
    resolve_scenario_selector,
    scenario_input_differences,
)


EXPECTED_CASE_IDS = (
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

EXPECTED_SCENARIO_IDS = tuple(
    sorted(
        f"{prefix}-{branch}"
        for prefix in (
            "d01",
            "d02",
            "d03",
            "d04",
            "d05",
            "d06",
            "d07",
            "d08a",
            "d08b",
            "d09",
        )
        for branch in ("reference", "attack")
    )
)


class CounterfactualCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog_path = default_catalog_path()
        self.scenario_path = self.catalog_path.parent / "scenarios-v1.json"

    def _raw_catalog(self) -> dict[str, object]:
        return json.loads(self.catalog_path.read_text(encoding="utf-8"))

    def _raw_scenarios(self) -> dict[str, object]:
        return json.loads(self.scenario_path.read_text(encoding="utf-8"))

    def _write_variant(
        self,
        directory: str,
        *,
        catalog: dict[str, object] | None = None,
        scenarios: dict[str, object] | None = None,
    ) -> Path:
        root = Path(directory)
        target_catalog = root / "catalog-v1.json"
        target_scenarios = root / "scenarios-v1.json"
        target_catalog.write_text(
            json.dumps(catalog or self._raw_catalog(), indent=2),
            encoding="utf-8",
        )
        target_scenarios.write_text(
            json.dumps(scenarios or self._raw_scenarios(), indent=2),
            encoding="utf-8",
        )
        return target_catalog

    def assert_error_code(self, expected: str, path: Path) -> None:
        with self.assertRaises(CounterfactualValidationError) as captured:
            load_adversarial_catalog(path)
        self.assertEqual(captured.exception.code, expected)

    def test_catalog_versions_counts_and_case_ids(self) -> None:
        catalog = load_adversarial_catalog()
        self.assertEqual(catalog.schema_version, ADVERSARIAL_SCHEMA_VERSION)
        self.assertEqual(catalog.report_schema_version, ADVERSARIAL_REPORT_SCHEMA_VERSION)
        self.assertEqual(catalog.catalog_version, ADVERSARIAL_CATALOG_VERSION)
        self.assertEqual(case_ids(catalog), EXPECTED_CASE_IDS)
        self.assertEqual(len(catalog.cases), 10)
        self.assertEqual(len(catalog.scenario_catalog.scenarios), 20)
        self.assertEqual(
            tuple(sorted(scenario.id for scenario in catalog.scenario_catalog.scenarios)),
            EXPECTED_SCENARIO_IDS,
        )

    def test_schema_versions_are_json_integers_and_economic_values_are_strings(self) -> None:
        catalog = self._raw_catalog()
        scenarios = self._raw_scenarios()
        self.assertIs(type(catalog["schemaVersion"]), int)
        self.assertIs(type(catalog["reportSchemaVersion"]), int)
        self.assertIs(type(scenarios["schemaVersion"]), int)
        first_case = catalog["cases"][0]
        self.assertIs(type(first_case["actors"][0]["nftValuation"]), str)
        self.assertIs(type(first_case["actors"][0]["actorCapitalBudget"]), str)
        self.assertIs(type(first_case["initialNftEndowment"]["value"]), str)
        self.assertIs(type(scenarios["scenarios"][0]["startPrice"]), str)
        self.assertIs(type(scenarios["scenarios"][0]["startTime"]), str)

    def test_every_scenario_is_used_exactly_once(self) -> None:
        catalog = load_adversarial_catalog()
        available = {scenario.id for scenario in catalog.scenario_catalog.scenarios}
        used = [
            scenario.id
            for case in catalog.cases
            for scenario in (case.reference_scenario, case.attack_scenario)
        ]
        self.assertEqual(len(used), 20)
        self.assertEqual(len(set(used)), 20)
        self.assertEqual(set(used), available)

    def test_scenario_catalog_path_is_resolved_relative_to_catalog(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            nested = Path(directory) / "nested"
            nested.mkdir()
            target = self._write_variant(str(nested))
            catalog = load_adversarial_catalog(target)
            self.assertEqual(catalog.scenario_catalog_path, (nested / "scenarios-v1.json").resolve())

    def test_absolute_scenario_catalog_path_is_rejected(self) -> None:
        raw = self._raw_catalog()
        raw["scenarioCatalog"] = str(self.scenario_path.resolve())
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("INVALID_SCENARIO_CATALOG_PATH", target)

    def test_machine_dependent_scenario_catalog_paths_are_rejected(self) -> None:
        for scenario_catalog in ("C:scenarios-v1.json", "nested\\scenarios-v1.json"):
            with self.subTest(scenario_catalog=scenario_catalog):
                raw = self._raw_catalog()
                raw["scenarioCatalog"] = scenario_catalog
                with tempfile.TemporaryDirectory() as directory:
                    target = self._write_variant(directory, catalog=raw)
                    self.assert_error_code("INVALID_SCENARIO_CATALOG_PATH", target)

    def test_string_schema_versions_are_rejected(self) -> None:
        for field, expected in (
            ("schemaVersion", "SCHEMA_VERSION_MUST_BE_JSON_INTEGER"),
            ("reportSchemaVersion", "REPORT_SCHEMA_VERSION_MUST_BE_JSON_INTEGER"),
        ):
            with self.subTest(field=field):
                raw = self._raw_catalog()
                raw[field] = "1"
                with tempfile.TemporaryDirectory() as directory:
                    target = self._write_variant(directory, catalog=raw)
                    self.assert_error_code(expected, target)

    def test_non_string_economic_integer_is_rejected(self) -> None:
        raw = self._raw_catalog()
        raw["cases"][0]["actors"][0]["nftValuation"] = 1
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("JSON_INTEGER_MUST_BE_DECIMAL_STRING", target)

    def test_json_float_is_rejected(self) -> None:
        raw = self._raw_catalog()
        raw["cases"][0]["actors"][0]["nftValuation"] = 1.5
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("JSON_FLOAT_FORBIDDEN", target)

    def test_actor_ids_are_unique(self) -> None:
        raw = self._raw_catalog()
        raw["cases"][0]["actors"][1]["actorId"] = "SELLER_ACTOR"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("DUPLICATE_ACTOR_ID", target)

    def test_identity_ownership_is_total_and_common_to_both_branches(self) -> None:
        catalog = load_adversarial_catalog()
        for case in catalog.cases:
            reference_identities = {
                case.reference_scenario.seller,
                *(bidder.id for bidder in case.reference_scenario.bidders),
            }
            attack_identities = {
                case.attack_scenario.seller,
                *(bidder.id for bidder in case.attack_scenario.bidders),
            }
            union = reference_identities | attack_identities
            self.assertEqual(set(case.identity_ownership), union)
            reference_owners = {
                identity: case.identity_ownership[identity] for identity in reference_identities
            }
            attack_owners = {
                identity: case.identity_ownership[identity] for identity in attack_identities
            }
            for identity in reference_identities & attack_identities:
                self.assertEqual(reference_owners[identity], attack_owners[identity])

        raw = self._raw_catalog()
        del raw["cases"][0]["identityOwnership"]["ATTACKER_ID"]
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("IDENTITY_OWNERSHIP_NOT_TOTAL", target)

    def test_seller_endpoint_owner_and_endowment_are_enforced(self) -> None:
        raw_owner = self._raw_catalog()
        raw_owner["cases"][0]["identityOwnership"]["SELLER"] = "ATTACKER_ACTOR"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw_owner)
            self.assert_error_code("SELLER_ENDPOINT_OWNER_MISMATCH", target)

        raw_endowment = self._raw_catalog()
        raw_endowment["cases"][0]["initialNftEndowment"]["value"] = "1"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw_endowment)
            self.assert_error_code("ENDOWMENT_VALUE_MISMATCH", target)

    def test_bidder_valuation_matches_owning_actor(self) -> None:
        catalog = load_adversarial_catalog()
        for case in catalog.cases:
            actors = case.actor_by_id
            for scenario in (case.reference_scenario, case.attack_scenario):
                for bidder in scenario.bidders:
                    owner = case.identity_ownership[bidder.id]
                    self.assertEqual(bidder.valuation, actors[owner].nft_valuation)

        raw = self._raw_catalog()
        raw["cases"][0]["actors"][1]["nftValuation"] = "16000000000000000"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("BIDDER_ACTOR_VALUATION_MISMATCH", target)

    def test_actor_configured_caps_and_coalitions_are_validated(self) -> None:
        raw_budget = self._raw_catalog()
        raw_budget["cases"][0]["actors"][1]["actorCapitalBudget"] = "1"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw_budget)
            self.assert_error_code("CONFIGURED_CAP_ABOVE_ACTOR_BUDGET", target)

        raw_coalition = self._raw_catalog()
        raw_coalition["cases"][0]["coalitionActorIds"] = ["UNKNOWN_ACTOR"]
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw_coalition)
            self.assert_error_code("UNKNOWN_COALITION_ACTOR", target)

    def test_all_direct_input_differences_are_declared_exactly(self) -> None:
        catalog = load_adversarial_catalog()
        for case in catalog.cases:
            self.assertEqual(
                set(case.intervention.changed_inputs),
                set(scenario_input_differences(case.reference_scenario, case.attack_scenario)),
            )

        raw = self._raw_catalog()
        raw["cases"][0]["intervention"]["changedInputs"] = [
            {"field": "bidder.fixedCap", "subject": "ATTACKER_ID"}
        ]
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("INPUT_DIFFERENCE_DECLARATION_MISMATCH", target)

    def test_undeclared_direct_scenario_change_is_rejected(self) -> None:
        scenarios = self._raw_scenarios()
        scenarios["scenarios"][0]["bidders"][0]["fixedCap"] = "9000000000000000"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, scenarios=scenarios)
            self.assert_error_code("INPUT_DIFFERENCE_DECLARATION_MISMATCH", target)

    def test_bidder_order_change_is_a_direct_input_difference(self) -> None:
        scenarios = self._raw_scenarios()
        attack_bidders = scenarios["scenarios"][1]["bidders"]
        attack_bidders[0], attack_bidders[1] = attack_bidders[1], attack_bidders[0]
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, scenarios=scenarios)
            self.assert_error_code("INPUT_DIFFERENCE_DECLARATION_MISMATCH", target)

    def test_equal_opportunity_offsets_are_rejected_to_keep_order_explicit(self) -> None:
        catalog = self._raw_catalog()
        catalog["cases"][0]["intervention"]["changedInputs"].append(
            {"field": "bidder.opportunities", "subject": "EXTERNAL_LOSER_ID"}
        )
        scenarios = self._raw_scenarios()
        scenarios["scenarios"][1]["opportunities"][1]["offsetSeconds"] = "100"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=catalog, scenarios=scenarios)
            self.assert_error_code("ADVERSARIAL_OPPORTUNITY_OFFSETS_MUST_BE_UNIQUE", target)

    def test_d2_diff_is_only_fixed_cap_with_granular_matched_inputs(self) -> None:
        case = load_case("d02-losing-cap-ef")
        self.assertEqual(
            scenario_input_differences(case.reference_scenario, case.attack_scenario),
            (Selector("bidder.fixedCap", "FOCAL_ID"),),
        )
        for field in ("bidder.valuation", "bidder.budget", "bidder.maxBidCap", "bidder.profile"):
            selector = Selector(field, "FOCAL_ID")
            self.assertEqual(
                resolve_scenario_selector(case.reference_scenario, selector),
                resolve_scenario_selector(case.attack_scenario, selector),
            )

    def test_d5_declares_split_cap_and_sibling_activation(self) -> None:
        case = load_case("d05-sybil-cap-bypass")
        self.assertEqual(
            set(scenario_input_differences(case.reference_scenario, case.attack_scenario)),
            {
                Selector("bidder.fixedCap", "SYBIL_A_ID"),
                Selector("bidder.opportunities", "SYBIL_B_ID"),
            },
        )
        self.assertEqual(case.identity_ownership["SYBIL_A_ID"], case.identity_ownership["SYBIL_B_ID"])

    def test_matched_controls_are_equality_gates(self) -> None:
        catalog = load_adversarial_catalog()
        self.assertTrue(
            all(
                control.operator == "equal" and control.expected is None
                for case in catalog.cases
                for control in case.matched_controls
            )
        )
        raw = self._raw_catalog()
        raw["cases"][0]["matchedControls"][0]["operator"] = "greaterThan"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            self.assert_error_code("MATCHED_CONTROL_MUST_REQUIRE_EQUALITY", target)

    def test_declaration_subjects_are_resolved_statically(self) -> None:
        raw_actor = self._raw_catalog()
        raw_actor["cases"][4]["matchedControls"][0]["selector"]["subject"] = "UNKNOWN_ACTOR"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw_actor)
            self.assert_error_code("UNKNOWN_SELECTOR_ACTOR", target)

        raw_bidder = self._raw_catalog()
        raw_bidder["cases"][1]["matchedControls"][0]["selector"]["subject"] = "UNKNOWN_ID"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw_bidder)
            self.assert_error_code("UNKNOWN_SELECTOR_BIDDER", target)

    def test_diagnostic_relations_are_parsed_but_not_catalog_gates(self) -> None:
        raw = self._raw_catalog()
        raw["cases"][0]["diagnosticRelations"][0]["expected"] = "999999999999999999999"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            catalog = load_adversarial_catalog(target)
            relation = catalog.cases[0].diagnostic_relations[0]
            self.assertEqual(relation.expected, 999999999999999999999)

    def test_case_id_has_no_hidden_business_dispatch(self) -> None:
        raw = self._raw_catalog()
        raw["cases"][0]["caseId"] = "renamed-diagnostic-case"
        with tempfile.TemporaryDirectory() as directory:
            target = self._write_variant(directory, catalog=raw)
            catalog = load_adversarial_catalog(target)
            self.assertIn("renamed-diagnostic-case", catalog.case_by_id)

    def test_reference_and_attack_resolution_is_deterministic(self) -> None:
        first = load_adversarial_catalog()
        second = load_adversarial_catalog()
        self.assertEqual(first, second)
        for case_id in EXPECTED_CASE_IDS:
            self.assertEqual(load_case(case_id), first.case_by_id[case_id])


if __name__ == "__main__":
    unittest.main()
