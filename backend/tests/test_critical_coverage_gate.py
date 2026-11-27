import unittest

from scripts.check_critical_coverage import evaluate_coverage


def coverage_for(files, global_totals=None):
    summaries = {
        path: {"summary": {"covered_lines": covered, "num_statements": statements}}
        for path, (covered, statements) in files.items()
    }
    totals = global_totals or {
        "covered_lines": sum(covered for covered, _ in files.values()),
        "num_statements": sum(statements for _, statements in files.values()),
    }
    return {"files": summaries, "totals": totals}


def minimal_config(groups, expected=None, group_floor=70, global_floor=70):
    all_paths = {path for paths in groups.values() for path in paths}
    return {
        "global_min_percent": global_floor,
        "group_min_percent": group_floor,
        "expected_unique_files": len(all_paths) if expected is None else expected,
        "groups": groups,
    }


class CriticalCoverageGateTests(unittest.TestCase):
    def test_passes_global_and_group_floors_without_rounding(self):
        groups = {"Carga": ["app/a.py", "app/b.py"]}
        report = evaluate_coverage(coverage_for({"app/a.py": (70, 100), "app/b.py": (100, 100)}), minimal_config(groups))
        self.assertTrue(report["ok"])
        self.assertEqual((170, 200), (report["groups"][0]["covered"], report["groups"][0]["statements"]))

    def test_group_below_floor_fails(self):
        groups = {"Modelo": ["app/model.py"]}
        report = evaluate_coverage(coverage_for({"app/model.py": (69, 100)}), minimal_config(groups, global_floor=60))
        self.assertFalse(report["ok"])
        self.assertTrue(any("Modelo" in failure for failure in report["failures"]))

    def test_missing_mapped_path_fails(self):
        groups = {"Historial": ["app/history.py"]}
        report = evaluate_coverage(coverage_for({}), minimal_config(groups))
        self.assertFalse(report["ok"])
        self.assertTrue(any("Falta cobertura" in failure for failure in report["failures"]))

    def test_zero_executable_statements_fails(self):
        groups = {"Resultados": ["app/results.py"]}
        report = evaluate_coverage(coverage_for({"app/results.py": (0, 0)}), minimal_config(groups))
        self.assertFalse(report["ok"])
        self.assertTrue(any("conteos ejecutables" in failure for failure in report["failures"]))

    def test_low_file_is_reported_but_group_can_pass(self):
        groups = {"Auth": ["app/low.py", "app/high.py"]}
        report = evaluate_coverage(coverage_for({"app/low.py": (0, 10), "app/high.py": (100, 100)}), minimal_config(groups))
        self.assertTrue(report["ok"])
        self.assertEqual(1, len(report["warnings"]))

    def test_overlapping_file_is_counted_in_each_relevant_group(self):
        groups = {"Pipeline": ["app/shared.py"], "Historial": ["app/shared.py"]}
        report = evaluate_coverage(coverage_for({"app/shared.py": (9, 10)}), minimal_config(groups))
        self.assertTrue(report["ok"])
        self.assertEqual(["Pipeline", "Historial"], [row["name"] for row in report["groups"]])

    def test_global_floor_fails_even_if_groups_pass(self):
        groups = {"Aviso": ["app/notice.py"]}
        coverage = coverage_for({"app/notice.py": (100, 100)}, global_totals={"covered_lines": 69, "num_statements": 100})
        report = evaluate_coverage(coverage, minimal_config(groups))
        self.assertFalse(report["ok"])
        self.assertTrue(any("global" in failure.lower() for failure in report["failures"]))


if __name__ == "__main__":
    unittest.main()
