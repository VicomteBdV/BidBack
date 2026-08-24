from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from bidback_economics.candidates import (
    BASELINE_ECONOMIC_MODEL_VERSION,
    CANDIDATE_CATALOG_VERSION,
    CANDIDATE_REPORT_SCHEMA_VERSION,
    CANDIDATE_SCHEMA_VERSION,
    AllocationPolicy,
    AllocationSubject,
    CandidateValidationError,
    ContributionPolicy,
    EligibilityPolicy,
    PoolPolicy,
    RewardCapPolicy,
    SecondaryWeightPolicy,
    candidate_ids,
    default_catalog_path,
    load_candidate,
    load_catalog,
)


EXPECTED_CANDIDATE_IDS = (
    "candidate-v1-a",
    "candidate-v1-b",
    "candidate-v1-c",
    "candidate-v1-d",
    "candidate-v1-e",
)


class CandidateCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog_path = default_catalog_path()
        cls.raw = json.loads(cls.catalog_path.read_text(encoding="utf-8"))
        cls.catalog = load_catalog()

    def _load_mutation(self, mutate) -> CandidateValidationError:
        raw = copy.deepcopy(self.raw)
        mutate(raw)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaises(CandidateValidationError) as captured:
                load_catalog(path)
        return captured.exception

    def test_catalog_versions_and_neutral_ids(self) -> None:
        self.assertEqual(self.catalog.schema_version, CANDIDATE_SCHEMA_VERSION)
        self.assertEqual(
            self.catalog.report_schema_version,
            CANDIDATE_REPORT_SCHEMA_VERSION,
        )
        self.assertEqual(self.catalog.catalog_version, CANDIDATE_CATALOG_VERSION)
        self.assertEqual(
            self.catalog.baseline_economic_model_version,
            BASELINE_ECONOMIC_MODEL_VERSION,
        )
        self.assertEqual(candidate_ids(self.catalog), EXPECTED_CANDIDATE_IDS)

    def test_catalog_encodes_the_five_approved_policy_combinations(self) -> None:
        by_id = self.catalog.candidate_by_id
        common = {
            (
                candidate.allocation_subject,
                candidate.pool_policy,
                candidate.eligibility_policy,
            )
            for candidate in self.catalog.candidates
        }
        self.assertEqual(
            common,
            {
                (
                    AllocationSubject.BIDDER_IDENTITY,
                    PoolPolicy.NET_PREMIUM_THRESHOLD,
                    EligibilityPolicy.POSITIVE_CONTRIBUTION,
                )
            },
        )
        self.assertEqual(
            by_id["candidate-v1-a"].policy_signature,
            (
                ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
                AllocationPolicy.NORMALIZED,
                RewardCapPolicy.BASELINE_PER_USER,
                SecondaryWeightPolicy.NONE,
            ),
        )
        self.assertEqual(
            by_id["candidate-v1-b"].policy_signature,
            (
                ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
                AllocationPolicy.GROSS_PREMIUM_DIRECT,
                RewardCapPolicy.NONE,
                SecondaryWeightPolicy.NONE,
            ),
        )
        self.assertEqual(
            by_id["candidate-v1-c"].policy_signature,
            (
                ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
                AllocationPolicy.NORMALIZED,
                RewardCapPolicy.NONE,
                SecondaryWeightPolicy.NONE,
            ),
        )
        self.assertEqual(
            by_id["candidate-v1-d"].policy_signature,
            (
                ContributionPolicy.MECHANICAL_PREMIUM_LIFT,
                AllocationPolicy.NORMALIZED,
                RewardCapPolicy.BASELINE_PER_USER,
                SecondaryWeightPolicy.BASELINE_FINAL_SCORE,
            ),
        )
        self.assertEqual(
            by_id["candidate-v1-e"].policy_signature,
            (
                ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY,
                AllocationPolicy.NORMALIZED,
                RewardCapPolicy.NONE,
                SecondaryWeightPolicy.NONE,
            ),
        )

    def test_candidate_e_is_always_identity_level(self) -> None:
        candidate = load_candidate("candidate-v1-e")
        self.assertEqual(candidate.allocation_subject, AllocationSubject.BIDDER_IDENTITY)
        self.assertEqual(
            candidate.contribution_policy,
            ContributionPolicy.IDENTITY_COUNTERFACTUAL_POLICY_REPLAY,
        )

    def test_only_root_schema_versions_are_json_integers(self) -> None:
        integer_paths: list[str] = []

        def visit(value: object, path: str = "$") -> None:
            if type(value) is int:
                integer_paths.append(path)
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    visit(item, f"{path}[{index}]")
            elif isinstance(value, dict):
                for key, item in value.items():
                    visit(item, f"{path}.{key}")

        visit(self.raw)
        self.assertEqual(
            set(integer_paths),
            {"$.schemaVersion", "$.reportSchemaVersion"},
        )

    def test_root_and_candidate_unknown_fields_are_rejected(self) -> None:
        error = self._load_mutation(lambda raw: raw.update(unexpected="value"))
        self.assertEqual(error.code, "INVALID_CATALOG_FIELDS")

        error = self._load_mutation(
            lambda raw: raw["candidates"][0].update(unexpected="value")
        )
        self.assertEqual(error.code, "INVALID_CANDIDATE_FIELDS")

    def test_missing_candidate_field_is_rejected(self) -> None:
        error = self._load_mutation(
            lambda raw: raw["candidates"][0].pop("eligibilityPolicy")
        )
        self.assertEqual(error.code, "INVALID_CANDIDATE_FIELDS")

    def test_empty_strings_and_unknown_enum_values_are_rejected(self) -> None:
        error = self._load_mutation(lambda raw: raw["candidates"][0].update(id=""))
        self.assertEqual(error.code, "EXPECTED_NON_EMPTY_STRING")

        error = self._load_mutation(
            lambda raw: raw["candidates"][0].update(
                contributionPolicy="unsupported-contribution"
            )
        )
        self.assertEqual(error.code, "UNKNOWN_POLICY_VALUE")

    def test_schema_versions_must_be_json_integers(self) -> None:
        for field, expected in (
            ("schemaVersion", "SCHEMA_VERSION_MUST_BE_JSON_INTEGER"),
            ("reportSchemaVersion", "REPORT_SCHEMA_VERSION_MUST_BE_JSON_INTEGER"),
        ):
            with self.subTest(field=field):
                error = self._load_mutation(lambda raw, name=field: raw.update({name: "1"}))
                self.assertEqual(error.code, expected)

    def test_non_version_json_integer_and_float_are_rejected(self) -> None:
        error = self._load_mutation(
            lambda raw: raw["candidates"][0].update(description=1)
        )
        self.assertEqual(error.code, "JSON_INTEGER_FIELD_FORBIDDEN")

        error = self._load_mutation(
            lambda raw: raw["candidates"][0].update(description=1.5)
        )
        self.assertEqual(error.code, "JSON_FLOAT_FORBIDDEN")

    def test_versions_are_closed(self) -> None:
        mutations = (
            (lambda raw: raw.update(schemaVersion=2), "UNSUPPORTED_SCHEMA_VERSION"),
            (
                lambda raw: raw.update(reportSchemaVersion=2),
                "UNSUPPORTED_REPORT_SCHEMA_VERSION",
            ),
            (
                lambda raw: raw.update(catalogVersion="candidate-catalog-v2"),
                "UNSUPPORTED_CATALOG_VERSION",
            ),
            (
                lambda raw: raw.update(
                    baselineEconomicModelVersion="non-authoritative-baseline"
                ),
                "UNSUPPORTED_BASELINE_ECONOMIC_MODEL_VERSION",
            ),
        )
        for mutate, expected in mutations:
            with self.subTest(expected=expected):
                self.assertEqual(self._load_mutation(mutate).code, expected)

    def test_candidate_ids_and_policy_combinations_are_unique(self) -> None:
        error = self._load_mutation(
            lambda raw: raw["candidates"][1].update(
                id=raw["candidates"][0]["id"]
            )
        )
        self.assertEqual(error.code, "DUPLICATE_CANDIDATE_ID")

        def duplicate_signature(raw) -> None:
            original_id = raw["candidates"][1]["id"]
            raw["candidates"][1] = copy.deepcopy(raw["candidates"][0])
            raw["candidates"][1]["id"] = original_id

        error = self._load_mutation(duplicate_signature)
        self.assertEqual(error.code, "DUPLICATE_CANDIDATE_POLICY_COMBINATION")

    def test_semantic_validation_dispatches_by_policy_not_candidate_id(self) -> None:
        renamed = copy.deepcopy(self.raw)
        renamed["candidates"][0]["id"] = "renamed-candidate"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text(json.dumps(renamed), encoding="utf-8")
            catalog = load_catalog(path)
        self.assertIn("renamed-candidate", catalog.candidate_by_id)

        error = self._load_mutation(
            lambda raw: raw["candidates"][0].update(
                allocationPolicy="gross-premium-direct"
            )
        )
        self.assertEqual(error.code, "UNSUPPORTED_POLICY_COMBINATION")

    def test_load_candidate_and_catalog_are_deterministic(self) -> None:
        self.assertEqual(load_catalog(), load_catalog())
        for candidate_id in EXPECTED_CANDIDATE_IDS:
            self.assertEqual(
                load_candidate(candidate_id),
                self.catalog.candidate_by_id[candidate_id],
            )
        with self.assertRaises(CandidateValidationError) as captured:
            load_candidate("unknown-candidate")
        self.assertEqual(captured.exception.code, "UNKNOWN_CANDIDATE_ID")


if __name__ == "__main__":
    unittest.main()
