"""Crea casos y análisis de prueba para un doctor. SOLO para desarrollo.

Uso (desde backend/, con la base migrada, la carga inicial hecha y el doctor ya ACTIVO):
    python -m scripts.sembrar_casos --correo doctor@gastroia.local
    python -m scripts.sembrar_casos --correo doctor@gastroia.local --casos 5 --analisis-por-caso 2
    docker compose exec api python -m scripts.sembrar_casos --correo doctor@gastroia.local

Sirve para probar lo que necesita un doctor con casos activos: la reasignación (RF-A06,
W-25, el 409 DESTINO_REQUERIDO), «Casos recibidos», el historial y los dashboards.

Hace lo mismo que el doctor en la app, con los mismos servicios de la API: carga una imagen
sintética (POST /imagenes) y pide el análisis (POST /analisis), así que el caso queda ACTIVO
y el análisis entra a la cola. Con el worker arriba y HF_SIMULADO=true, el análisis termina
COMPLETADO con resultados y mapa de calor de prueba; sin worker, se queda PROCESANDO, pero
el caso igual cuenta como activo.

Los documentos son inventados (CC desde 9000000000, al azar) y se imprimen para poder buscar
el historial de esos pacientes. Se niega a correr si ENVIRONMENT no es «development».
"""

import argparse
import io
import random
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import numpy as np
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.almacen import Almacen, crear_almacen
from app.adapters.cola import Cola, ColaCelery
from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.errores import ErrorApi
from app.core.seudonimo import Seudonimizador
from app.models import CodigoRol, EstadoUsuario, Usuario
from app.repositories.analisis_repository import RepositorioAnalisis
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.analisis import ServicioAnalisis, SolicitudAnalisis
from app.services.imagenes import ServicioImagenes
from app.services.verificadores_imagen import construir_cadena

PRIMER_DOCUMENTO = 9_000_000_000  # CC de 10 dígitos que no son de nadie real
LIMITE = 50  # suficiente para paginar; más que eso no aporta a las pruebas


class ErrorSiembra(Exception):
    pass


@dataclass(frozen=True)
class CasoSembrado:
    documento: str
    codigos: list[str]


def imagen_sintetica(semilla: int) -> bytes:
    """JPEG de 512 × 512 que pasa el control de calidad (nítida, ni oscura ni quemada).

    Tono rosado de mucosa con textura de ruido: la textura da la nitidez (varianza del
    Laplaciano alta) y la semilla hace que cada imagen sea distinta (otra huella SHA-256).
    """
    azar = np.random.default_rng(semilla)
    base = np.array([190, 110, 105], dtype=np.float64)
    ruido = azar.normal(0, 28, size=(512, 512, 1))
    pixeles = np.clip(base + ruido, 0, 240).astype(np.uint8)
    salida = io.BytesIO()
    Image.fromarray(pixeles, "RGB").save(salida, "JPEG", quality=92)
    return salida.getvalue()


def servicio_analisis(
    db: Session,
    ajustes: Settings,
    almacen: Almacen,
    cola: Cola,
    reloj: Callable[[], datetime],
) -> tuple[ServicioImagenes, ServicioAnalisis]:
    """Armados igual que deps.get_servicio_imagenes y get_servicio_analisis."""
    imagenes = ServicioImagenes(
        construir_cadena(), almacen, timedelta(minutes=ajustes.imagen_temporal_minutos), reloj
    )
    claves = {v: c.get_secret_value() for v, c in ajustes.hmac_claves.items()}
    seudonimizador = Seudonimizador(claves, ajustes.hmac_version_actual)
    analisis = ServicioAnalisis(
        RepositorioAnalisis(db), imagenes, almacen, seudonimizador, cola, UnidadTrabajo(db), reloj
    )
    return imagenes, analisis


def doctor_activo(db: Session, correo: str) -> Usuario:
    correo = correo.strip().lower()
    doctor = db.scalar(select(Usuario).where(Usuario.correo == correo))
    if doctor is None or doctor.rol.codigo != CodigoRol.DOCTOR:
        raise ErrorSiembra(f"No hay un doctor con el correo {correo}.")
    if doctor.estado != EstadoUsuario.ACTIVO:
        raise ErrorSiembra(
            f"La cuenta está {doctor.estado.value}: entra una vez con ella (cambio de "
            "contraseña y app autenticadora) para que quede ACTIVO."
        )
    return doctor


def sembrar(
    doctor: Usuario,
    imagenes: ServicioImagenes,
    servicio: ServicioAnalisis,
    casos: int,
    analisis_por_caso: int,
    azar: random.Random,
) -> list[CasoSembrado]:
    """Crea `casos` pacientes nuevos para el doctor, cada uno con sus análisis."""
    sembrados = []
    for _ in range(casos):
        documento = str(PRIMER_DOCUMENTO + azar.randrange(999_999_999))
        codigos = []
        for _ in range(analisis_por_caso):
            temporal = imagenes.cargar(doctor.id, imagen_sintetica(azar.randrange(2**32)))
            analisis = servicio.solicitar(
                doctor,
                SolicitudAnalisis(
                    imagen_id=temporal.imagen_id,
                    tipo_documento="CC",
                    numero_documento=documento,
                    # Va siempre: hasta que un análisis quede COMPLETADO el paciente sigue
                    # siendo nuevo y el servidor pide la confirmación (RF-D01, W-06i)
                    confirmacion_documento=documento,
                ),
            )
            codigos.append(analisis.codigo)
        sembrados.append(CasoSembrado(documento, codigos))
    return sembrados


def main(argumentos: list[str] | None = None) -> int:
    lector = argparse.ArgumentParser(description="Casos de prueba (solo desarrollo).")
    lector.add_argument("--correo", required=True, help="correo de un doctor ACTIVO")
    lector.add_argument("--casos", type=int, default=3, help="pacientes nuevos (1 a 50)")
    lector.add_argument("--analisis-por-caso", type=int, default=1, help="por paciente (1 a 5)")
    a = lector.parse_args(argumentos)

    ajustes = get_settings()
    if ajustes.environment != "development":
        raise SystemExit("Este script solo corre con ENVIRONMENT=development.")
    if not 1 <= a.casos <= LIMITE or not 1 <= a.analisis_por_caso <= 5:
        raise SystemExit(f"--casos va de 1 a {LIMITE} y --analisis-por-caso de 1 a 5.")

    from app.workers.celery_app import celery_app  # al final: carga la configuración de Celery

    reloj = lambda: datetime.now(UTC)  # noqa: E731
    try:
        with SessionLocal() as db:
            doctor = doctor_activo(db, a.correo)
            imagenes, servicio = servicio_analisis(
                db, ajustes, crear_almacen(ajustes), ColaCelery(celery_app), reloj
            )
            sembrados = sembrar(
                doctor, imagenes, servicio, a.casos, a.analisis_por_caso, random.Random()
            )
    except ErrorSiembra as error:
        raise SystemExit(f"No se sembraron casos: {error}") from None
    except ErrorApi as error:
        raise SystemExit(f"No se sembraron casos: {error.codigo} · {error.mensaje}") from None

    print(f"{len(sembrados)} casos ACTIVOS para {a.correo.strip().lower()}:")
    for caso in sembrados:
        print(f"  CC {caso.documento} (ficticio) -> {', '.join(caso.codigos)}")
    print("Con el worker arriba y HF_SIMULADO=true, los análisis terminan en unos segundos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
