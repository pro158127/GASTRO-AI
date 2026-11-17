"""Crea un usuario de prueba con contraseña temporal. SOLO pa desarrollo.

Uso (desde backend/, con la base migrada y la carga inicial hecha):
    python -m scripts.crear_usuario_prueba --correo doctor@gastroia.local
    python -m scripts.crear_usuario_prueba --correo admin2@gastroia.local --rol ADMINISTRADOR
    docker compose exec api python -m scripts.crear_usuario_prueba --correo doctor@gastroia.local

Imprime la contraseña temporal UNA vez (es lo que en producción llegaría por correo,
RF-U05). Con ella se entra y el sistema pide cambiarla y vincular la app autenticadora.
Se niega a correr si ENVIRONMENT no es «development»: en producción las cuentas las crea
el administrador desde la aplicación.
"""

import argparse
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.seguridad import generar_contrasena_temporal, hashear_contrasena
from app.models import CodigoRol, EstadoUsuario, Rol, Usuario

VIGENCIA_TEMPORAL = timedelta(hours=72)  # RNF-27


class ErrorUsuarioPrueba(Exception):
    pass


def crear_usuario_prueba(
    db: Session, correo: str, rol: CodigoRol, nombre: str, apellido: str
) -> str:
    """Crea la cuenta PENDIENTE con temporal y devuelve esa temporal. No hace commit."""
    correo = correo.strip().lower()
    if "@" not in correo:
        raise ErrorUsuarioPrueba("El correo no es válido.")
    if db.scalar(select(Usuario.id).where(Usuario.correo == correo)) is not None:
        raise ErrorUsuarioPrueba(f"Ya existe una cuenta con {correo}.")
    rol_id = db.scalar(select(Rol.id).where(Rol.codigo == rol))
    if rol_id is None:
        raise ErrorUsuarioPrueba("Faltan los roles: corre antes python -m app.seed.")
    temporal = generar_contrasena_temporal()
    db.add(
        Usuario(
            nombre=nombre,
            apellido=apellido,
            correo=correo,
            rol_id=rol_id,
            hash_contrasena=hashear_contrasena(temporal),
            contrasena_temporal=True,
            temporal_expira_en=datetime.now(UTC) + VIGENCIA_TEMPORAL,
            estado=EstadoUsuario.PENDIENTE,
        )
    )
    db.flush()
    return temporal


def main() -> None:
    lector = argparse.ArgumentParser(description="Usuario de prueba (solo desarrollo).")
    lector.add_argument("--correo", required=True)
    lector.add_argument("--rol", choices=[r.value for r in CodigoRol], default="DOCTOR")
    lector.add_argument("--nombre", default="Ana")
    lector.add_argument("--apellido", default="Pérez")
    argumentos = lector.parse_args()

    if get_settings().environment != "development":
        raise SystemExit("Este script solo corre con ENVIRONMENT=development.")
    try:
        with SessionLocal.begin() as db:
            temporal = crear_usuario_prueba(
                db,
                argumentos.correo,
                CodigoRol(argumentos.rol),
                argumentos.nombre,
                argumentos.apellido,
            )
    except ErrorUsuarioPrueba as error:
        raise SystemExit(f"No se creó el usuario: {error}") from None
    print(f"Usuario {argumentos.rol} creado: {argumentos.correo.strip().lower()}")
    print(f"Contraseña temporal (vence en 72 h, no se vuelve a mostrar): {temporal}")


if __name__ == "__main__":
    main()
