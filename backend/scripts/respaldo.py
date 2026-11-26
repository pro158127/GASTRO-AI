"""Piezas del respaldo (RNF-26) que corren DENTRO del contenedor de la API.

No se usan a mano: las llaman backend/scripts/respaldar.sh y restaurar.sh. Todo va por la
entrada y la salida estándar, así no hace falta montar carpetas en el contenedor:

    python -m scripts.respaldo manifiesto            > manifiesto.json
    python -m scripts.respaldo exportar-archivos     > archivos.tar
    python -m scripts.respaldo importar-archivos     < archivos.tar
    python -m scripts.respaldo exportar-pesos        > pesos.pth     (código 3 si no aplica)
    python -m scripts.respaldo unir                  < {"manifiesto": …, "archivos": …}
    python -m scripts.respaldo verificar             < manifiesto.json

Los mensajes van por stderr para no ensuciar lo que sale por stdout.
"""

import argparse
import json
import sys
import tarfile

import httpx

from app.adapters.almacen import ErrorAlmacen, crear_almacen
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.repositories.respaldo_repository import RepositorioRespaldo
from app.services import respaldo

SIN_PESOS = 3  # código de salida: no hay HF_PESOS_ARCHIVO, no es un error
PREFIJO_RESUMEN = "RESUMEN "


def _avisar(texto: str) -> None:
    print(texto, file=sys.stderr)


def manifiesto() -> int:
    with SessionLocal() as db:
        json.dump(respaldo.manifiesto(RepositorioRespaldo(db)), sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def exportar_archivos() -> int:
    resumen = respaldo.exportar_archivos(crear_almacen(get_settings()), sys.stdout.buffer)
    _avisar(f"Archivos respaldados: {resumen['cantidad']} ({resumen['bytes']} bytes).")
    # respaldar.sh toma este renglón pa ponerlo en el manifiesto
    _avisar(PREFIJO_RESUMEN + json.dumps(resumen))
    return 0


def unir() -> int:
    """Manifiesto final: la base del momento del pg_dump + el resumen de los archivos."""
    partes = json.load(sys.stdin)
    json.dump({**partes["manifiesto"], "archivos": partes["archivos"]}, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def importar_archivos() -> int:
    resumen = respaldo.importar_archivos(crear_almacen(get_settings()), sys.stdin.buffer)
    _avisar(f"Archivos restaurados: {resumen['cantidad']} ({resumen['bytes']} bytes).")
    return 0


def exportar_pesos() -> int:
    ajustes = get_settings()
    if not ajustes.hf_pesos_archivo.strip():
        _avisar("Sin HF_PESOS_ARCHIVO: no se copian los pesos (quedan en Hugging Face).")
        return SIN_PESOS
    url = respaldo.url_pesos(ajustes.hf_repo, ajustes.hf_revision, ajustes.hf_pesos_archivo)
    cabeceras = {"Authorization": f"Bearer {ajustes.hf_token.get_secret_value()}"}
    with httpx.stream("GET", url, headers=cabeceras, follow_redirects=True, timeout=60) as r:
        if r.status_code != 200:
            _avisar(f"Hugging Face respondió {r.status_code} al bajar los pesos.")
            return 1
        total = respaldo.guardar_pesos(r.iter_bytes(), sys.stdout.buffer, ajustes.hf_sha256)
    _avisar(f"Pesos respaldados: {total} bytes, huella verificada.")
    return 0


def verificar() -> int:
    guardado = json.load(sys.stdin)
    with SessionLocal() as db:
        base = respaldo.estado_base(RepositorioRespaldo(db))
    archivos = respaldo.estado_archivos(crear_almacen(get_settings()))
    diferencias = respaldo.verificar(guardado, base, archivos)
    if diferencias:
        _avisar("La restauración NO coincide con el respaldo:")
        for d in diferencias:
            _avisar(f"  - {d.que}: respaldo={d.respaldo} ahora={d.ahora}")
        return 1
    b = guardado["base"]["bitacora"]
    _avisar(
        f"Restauración verificada: {sum(guardado['base']['conteos'].values())} filas, "
        f"bitácora idéntica ({b['filas']} entradas) y "
        f"{guardado.get('archivos', {}).get('cantidad', 0)} archivos."
    )
    return 0


ACCIONES = {
    "manifiesto": manifiesto,
    "exportar-archivos": exportar_archivos,
    "importar-archivos": importar_archivos,
    "exportar-pesos": exportar_pesos,
    "unir": unir,
    "verificar": verificar,
}


def main(argumentos: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Piezas del respaldo (RNF-26).")
    parser.add_argument("accion", choices=sorted(ACCIONES))
    args = parser.parse_args(argumentos)
    try:
        return ACCIONES[args.accion]()
    except (respaldo.ErrorRespaldo, ErrorAlmacen, httpx.HTTPError, tarfile.TarError) as error:
        _avisar(f"Error: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
