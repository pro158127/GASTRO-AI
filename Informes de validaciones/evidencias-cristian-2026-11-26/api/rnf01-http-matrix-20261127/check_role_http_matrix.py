"""HTTP authorization sweep for every admin-only and doctor-only OpenAPI operation."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from types import SimpleNamespace as NS

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "backend"))

from fastapi.testclient import TestClient

from app.api import deps
from app.main import app
from app.models import CodigoRol


role = [CodigoRol.DOCTOR]


class SyntheticAuth:
    def validar_sesion(self, *_args, **_kwargs):
        return NS(usuario=NS(rol=NS(codigo=role[0])))


# The real router/dependency graph remains active; only the authenticated session is synthetic.
app.dependency_overrides[deps.get_servicio_autenticacion] = lambda: SyntheticAuth()
client = TestClient(app, raise_server_exceptions=False)
client.cookies.set("gastro_sesion", "synthetic-role-matrix")
spec = app.openapi()

admin_prefix = "/api/v1/admin/"
doctor_prefixes = (
    "/api/v1/pacientes",
    "/api/v1/imagenes",
    "/api/v1/analisis",
    "/api/v1/casos-recibidos",
    "/api/v1/traslados/",
    "/api/v1/reportes",
    "/api/v1/dashboard/doctor",
)
checks: list[tuple[str, str, str, int, str]] = []

for path, operations in spec["paths"].items():
    required = "admin" if path.startswith(admin_prefix) else "doctor" if path.startswith(doctor_prefixes) else None
    if required is None:
        continue  # shared active-session and public routes are outside cross-role denial cases
    for method, operation in operations.items():
        if method not in {"get", "post", "put", "patch", "delete"}:
            continue
        role[0] = CodigoRol.DOCTOR if required == "admin" else CodigoRol.ADMINISTRADOR
        url = re.sub(r"{([^}]+)}", "00000000-0000-0000-0000-000000000000", path)
        query = {
            param["name"]: "1"
            for param in operation.get("parameters", [])
            if param.get("in") == "query" and param.get("required")
        }
        content = operation.get("requestBody", {}).get("content", {})
        if "multipart/form-data" in content:
            response = client.request(
                method.upper(), url, params=query,
                files={"archivo": ("synthetic.png", b"synthetic", "image/png")},
            )
        elif path.endswith("/pacientes/consulta"):
            response = client.post(
                url, json={"tipo_documento": "CC", "numero_documento": "0000000000"}
            )
        elif content:
            response = client.request(method.upper(), url, params=query, json={})
        else:
            response = client.request(method.upper(), url, params=query)
        body = response.json() if "application/json" in response.headers.get("content-type", "") else {}
        error = body.get("error", {}) if isinstance(body, dict) else {}
        checks.append((required, method.upper(), path, response.status_code, error.get("codigo", "")))

app.dependency_overrides.clear()
failed = [check for check in checks if check[3] != 403 or check[4] != "PERMISO_DENEGADO"]
for failed_check in failed:
    print("FAIL", *failed_check)
print(f"ROLE_MISMATCH_HTTP_CHECKS={len(checks)} EXPECTED_403={len(checks) - len(failed)} FAIL={len(failed)}")
for expected in ("admin", "doctor"):
    subset = [check for check in checks if check[0] == expected]
    print(f"{expected.upper()}_ONLY_CHECKS={len(subset)} HTTP_403={sum(check[3] == 403 for check in subset)}")
if failed:
    raise SystemExit(1)
