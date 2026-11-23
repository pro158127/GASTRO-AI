"""Carga el reporte de evaluación del modelo (RM-06) que entrega el equipo de ML.

Uso (desde backend/, con la base migrada y la carga inicial hecha):
    python -m scripts.cargar_metricas reporte.json
    python -m scripts.cargar_metricas reporte.json --revisar     # solo valida, no guarda
    docker compose exec -T api python -m scripts.cargar_metricas - < reporte.json

El formato está en app/schemas/reporte_evaluacion.py. Volver a cargar el mismo modelo y
conjunto de prueba reemplaza el reporte anterior. Si algo no cuadra no se guarda nada.
"""

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from app.core.database import SessionLocal
from app.repositories.carga_metricas_repository import RepositorioCargaMetricas
from app.schemas.reporte_evaluacion import ReporteEvaluacion
from app.services.carga_metricas import ErrorCargaMetricas, ServicioCargaMetricas


def leer(ruta: str) -> ReporteEvaluacion:
    texto = sys.stdin.read() if ruta == "-" else Path(ruta).read_text(encoding="utf-8")
    return ReporteEvaluacion.model_validate_json(texto)


def _campo(error: dict) -> str:
    return ".".join(str(parte) for parte in error["loc"]) or "(reporte)"


def main(argumentos: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Carga las métricas del modelo (RM-06).")
    parser.add_argument("ruta", help="archivo JSON del reporte, o - para leerlo de la entrada")
    parser.add_argument("--revisar", action="store_true", help="valida sin guardar nada")
    args = parser.parse_args(argumentos)

    try:
        reporte = leer(args.ruta)
    except OSError as error:
        print(f"No se pudo leer {args.ruta}: {error.strerror}", file=sys.stderr)
        return 1
    except ValidationError as error:
        print("El reporte no tiene el formato esperado:", file=sys.stderr)
        for e in error.errors(include_input=False):
            print(f"  - {_campo(e)}: {e['msg']}", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        try:
            resultado = ServicioCargaMetricas(RepositorioCargaMetricas(db)).cargar(reporte)
        except ErrorCargaMetricas as error:
            db.rollback()
            print("No se cargó nada:", file=sys.stderr)
            for e in error.errores:
                print(f"  - {e}", file=sys.stderr)
            return 1
        if args.revisar:
            db.rollback()
            print(f"Reporte válido: {resultado.metricas} métricas. No se guardó (--revisar).")
        else:
            db.commit()
            print(
                f"Listo: {resultado.metricas} métricas del {reporte.fecha_reporte} "
                f"({resultado.reemplazadas} del reporte anterior reemplazadas)."
            )
    for aviso in resultado.avisos:
        print(f"Aviso: {aviso}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
