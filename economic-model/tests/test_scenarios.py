from __future__ import annotations

import copy
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from bidback_economics.baseline import default_params
from bidback_economics.scenarios import (
    PROFILE_KINDS,
    Opportunity,
    ScenarioValidationError,
    load_catalog,
    load_scenario,
    materialize_bid_trace,
)


class ScenarioCatalogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = load_catalog()
        cls.catalog_path = Path(__file__).resolve().parents[1] / "scenarios" / "catalog-v1.json"
        cls.raw = json.loads(cls.catalog_path.read_text(encoding="utf-8"))

    def _load_mutation(self, mutate) -> ScenarioValidationError:
        raw = copy.deepcopy(self.raw)
        mutate(raw)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaises(ScenarioValidationError) as raised:
                load_catalog(path)
        return raised.exception

    def test_catalog_schema_ids_and_complete_params(self) -> None:
        self.assertEqual(self.catalog.schema_version, 1)
        self.assertEqual(self.catalog.economic_model_version, "solidity-baseline-v1")
        self.assertEqual(len(self.catalog.scenarios), 14)
        self.assertEqual(len({scenario.id for scenario in self.catalog.scenarios}), 14)
        self.assertEqual({scenario.family for scenario in self.catalog.scenarios}, {f"S{i}" for i in range(1, 11)})
        self.assertEqual(len(self.raw["params"]), 19)
        self.assertEqual(self.catalog.params, default_params())
        self.assertTrue(all(scenario.params == self.catalog.params for scenario in self.catalog.scenarios))

    def test_all_uint_inputs_are_decimal_strings(self) -> None:
        def visit(value, path: str = "$") -> None:
            if type(value) is int:
                self.assertEqual(path, "$.schemaVersion")
            elif isinstance(value, list):
                for index, item in enumerate(value):
                    visit(item, f"{path}[{index}]")
            elif isinstance(value, dict):
                for key, item in value.items():
                    visit(item, f"{path}.{key}")

        visit(self.raw)

    def test_duplicate_scenario_id_is_rejected(self) -> None:
        error = self._load_mutation(lambda raw: raw["scenarios"][1].update(id=raw["scenarios"][0]["id"]))
        self.assertEqual(error.code, "DUPLICATE_SCENARIO_ID")

    def test_numeric_json_uint_is_rejected(self) -> None:
        error = self._load_mutation(lambda raw: raw["scenarios"][0].update(startPrice=1))
        self.assertEqual(error.code, "JSON_INTEGER_MUST_BE_DECIMAL_STRING")

    def test_incomplete_params_are_rejected(self) -> None:
        error = self._load_mutation(lambda raw: raw["params"].pop("ef_cap"))
        self.assertEqual(error.code, "INCOMPLETE_PARAM_SNAPSHOT")

    def test_duplicate_bidder_is_rejected(self) -> None:
        def mutate(raw) -> None:
            raw["scenarios"][1]["bidders"][1]["id"] = raw["scenarios"][1]["bidders"][0]["id"]

        error = self._load_mutation(mutate)
        self.assertEqual(error.code, "DUPLICATE_BIDDER_ID")

    def test_fixed_cap_must_respect_valuation_and_budget(self) -> None:
        def mutate(raw) -> None:
            raw["scenarios"][1]["bidders"][0]["fixedCap"] = "16000000000000000"

        error = self._load_mutation(mutate)
        self.assertEqual(error.code, "FIXED_CAP_ABOVE_MAX_BID_CAP")

    def test_opportunities_must_be_ordered(self) -> None:
        def mutate(raw) -> None:
            raw["scenarios"][1]["opportunities"][1]["offsetSeconds"] = "50"

        error = self._load_mutation(mutate)
        self.assertEqual(error.code, "UNORDERED_OPPORTUNITIES")

    def test_unknown_profile_is_rejected(self) -> None:
        def mutate(raw) -> None:
            raw["scenarios"][0]["bidders"][0]["profile"] = "opaque-agent"

        error = self._load_mutation(mutate)
        self.assertEqual(error.code, "UNKNOWN_PROFILE")
        self.assertEqual(
            PROFILE_KINDS,
            {"value-capped-once", "persistent-value-capped", "fixed-cap-once"},
        )


class TraceMaterializationTest(unittest.TestCase):
    def test_value_capped_once_submits_authoritative_minimum(self) -> None:
        scenario = load_scenario("s01-no-competition")
        materialized = materialize_bid_trace(scenario)
        self.assertEqual(materialized.bid_trace[0].new_cap, scenario.start_price)
        self.assertEqual(materialized.decisions[0].minimum_bid, scenario.start_price)

    def test_decisions_and_trace_are_deterministic(self) -> None:
        scenario = load_scenario("s06-ii-high")
        first = materialize_bid_trace(scenario)
        second = materialize_bid_trace(scenario)
        self.assertEqual(first, second)

    def test_every_generated_cap_respects_max_bid_cap(self) -> None:
        for scenario in load_catalog().scenarios:
            with self.subTest(scenario=scenario.id):
                materialized = materialize_bid_trace(scenario)
                limits = scenario.bidder_by_id
                for event in materialized.bid_trace:
                    self.assertLessEqual(event.new_cap, limits[event.bidder].max_bid_cap)

    def test_persistent_bidder_skips_when_already_leader(self) -> None:
        scenario = load_scenario("s06-ii-high")
        extra = Opportunity(150, "BIDDER_F")
        opportunities = (scenario.opportunities[0], extra, *scenario.opportunities[1:])
        materialized = materialize_bid_trace(replace(scenario, opportunities=opportunities))
        decision = materialized.decisions[1]
        self.assertEqual(decision.outcome, "no-bid")
        self.assertEqual(decision.reason, "already-leader")

    def test_fixed_cap_below_authoritative_minimum_produces_no_bid(self) -> None:
        scenario = load_scenario("s03-close-valuations")
        winner = scenario.bidders[1]
        bidders = (scenario.bidders[0], replace(winner, fixed_cap=28_500_000_000_000_000))
        materialized = materialize_bid_trace(replace(scenario, bidders=bidders))
        self.assertEqual(materialized.decisions[-1].outcome, "no-bid")
        self.assertEqual(materialized.decisions[-1].reason, "fixed-cap-below-minimum")

    def test_post_end_opportunity_is_retained_as_no_bid(self) -> None:
        scenario = load_scenario("s01-no-competition")
        opportunities = (*scenario.opportunities, Opportunity(4_000, "BIDDER_A"))
        materialized = materialize_bid_trace(replace(scenario, opportunities=opportunities))
        self.assertEqual(materialized.decisions[-1].outcome, "no-bid")
        self.assertEqual(materialized.decisions[-1].reason, "auction-ended")
        self.assertEqual(len(materialized.bid_trace), 1)

    def test_extension_makes_post_initial_end_opportunities_valid(self) -> None:
        scenario = load_scenario("s10-anti-sniping")
        materialized = materialize_bid_trace(scenario)
        initial_end = scenario.start_time + scenario.duration
        self.assertTrue(any(event.timestamp > initial_end for event in materialized.bid_trace))
        self.assertTrue(all(decision.outcome == "bid" for decision in materialized.decisions))
        self.assertGreater(materialized.end_time, initial_end)


if __name__ == "__main__":
    unittest.main()
