"""Apply the global and proposed critical-group coverage gates to coverage.py JSON."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


CONFIG_PATH = Path(__file__).resolve().parents[1] / "coverage-critical-groups.json"


def evaluate_coverage(coverage: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Return a deterministic report; compare integer counts without rounding."""
    failures: list[str] = []
    file_warnings: dict[str, str] = {}
    files = coverage.get("files", {})
    groups = config.get("groups", {})
    expected_files = config.get("expected_unique_files")
    group_floor = config.get("group_min_percent", 70)
    global_floor = config.get("global_min_percent", 70)

    if not isinstance(files, dict):
        return {"ok": False, "failures": ["El JSON de cobertura no contiene un mapa de archivos válido."], "warnings": [], "groups": []}
    if not isinstance(groups, dict) or not groups:
        return {"ok": False, "failures": ["El mapa de grupos críticos está vacío o mal formado."], "warnings": [], "groups": []}
    if not isinstance(group_floor, int) or not 1 <= group_floor <= 100:
        failures.append("El umbral de grupos debe ser un entero entre 1 y 100.")
    if not isinstance(global_floor, int) or not 1 <= global_floor <= 100:
        failures.append("El umbral global debe ser un entero entre 1 y 100.")

    mapped_paths: set[str] = set()
    group_rows: list[dict[str, Any]] = []
    for name, paths in groups.items():
        if not isinstance(paths, list) or not paths:
            failures.append(f"El grupo {name!r} no tiene rutas válidas.")
            continue
        if any(not isinstance(path, str) or not path.startswith("app/") for path in paths):
            failures.append(f"El grupo {name!r} contiene una ruta inválida.")
            continue
        if len(paths) != len(set(paths)):
            failures.append(f"El grupo {name!r} repite una ruta.")
            continue

        covered = 0
        statements = 0
        for path in paths:
            mapped_paths.add(path)
            item = files.get(path)
            if item is None:
                failures.append(f"Falta cobertura para la ruta crítica {path}.")
                continue
            summary = item.get("summary", {})
            file_statements = summary.get("num_statements", 0)
            file_covered = summary.get("covered_lines", 0)
            if not isinstance(file_statements, int) or not isinstance(file_covered, int) or file_statements <= 0 or not 0 <= file_covered <= file_statements:
                failures.append(f"La cobertura de {path} no tiene conteos ejecutables válidos.")
                continue
            covered += file_covered
            statements += file_statements
            if file_covered * 100 < file_statements * group_floor:
                percent = 100 * file_covered / file_statements
                file_warnings[path] = f"{path}: {percent:.2f}% individual; se reporta como hallazgo, el umbral bloqueante es por grupo."

        percent = (100 * covered / statements) if statements else 0.0
        passed = statements > 0 and covered * 100 >= statements * group_floor
        group_rows.append({"name": name, "covered": covered, "statements": statements, "percent": percent, "passed": passed})
        if statements <= 0:
            failures.append(f"El grupo {name!r} no contiene líneas ejecutables medibles.")
        elif not passed:
            failures.append(f"El grupo {name!r} tiene {percent:.6f}%; mínimo {group_floor}%.")

    if expected_files is not None and len(mapped_paths) != expected_files:
        failures.append(f"El mapa debe cubrir {expected_files} rutas únicas; contiene {len(mapped_paths)}.")

    totals = coverage.get("totals", {})
    global_covered = totals.get("covered_lines", 0)
    global_statements = totals.get("num_statements", 0)
    if not isinstance(global_covered, int) or not isinstance(global_statements, int) or global_statements <= 0 or not 0 <= global_covered <= global_statements:
        failures.append("La cobertura global no tiene conteos ejecutables válidos.")
        global_percent = 0.0
    else:
        global_percent = 100 * global_covered / global_statements
        if global_covered * 100 < global_statements * global_floor:
            failures.append(f"La cobertura global tiene {global_percent:.6f}%; mínimo {global_floor}%.")

    return {
        "ok": not failures,
        "failures": failures,
        "warnings": [file_warnings[path] for path in sorted(file_warnings)],
        "global": {"covered": global_covered, "statements": global_statements, "percent": global_percent},
        "groups": group_rows,
        "mapped_unique_files": len(mapped_paths),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Uso: python scripts/check_critical_coverage.py <coverage.json>", file=sys.stderr)
        return 2
    try:
        coverage = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"No se pudo leer cobertura/mapa: {exc}", file=sys.stderr)
        return 2

    report = evaluate_coverage(coverage, config)
    print(f"Cobertura global: {report['global']['percent']:.6f}% ({report['global']['covered']}/{report['global']['statements']})")
    for group in report["groups"]:
        status = "OK" if group["passed"] else "FALLÓ"
        print(f"{status} {group['name']}: {group['percent']:.6f}% ({group['covered']}/{group['statements']})")
    for warning in report["warnings"]:
        print(f"AVISO archivo bajo el umbral grupal: {warning}")
    for failure in report["failures"]:
        print(f"ERROR: {failure}", file=sys.stderr)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
