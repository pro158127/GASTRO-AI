"""Carga inicial: lo mínimo pa que el sistema funcione desde el primer ingreso (diseno_bd §7.2).

Uso: python -m app.seed   (después de `alembic upgrade head`)

Se puede correr las veces que quieras: no duplica nada. Crea los dos roles, las
características, la configuración con umbral del 50 %, el modelo vigente y el primer admin.
Las características son provisionales hasta que el equipo de ML entregue las etiquetas de
la model card (RM-03, RM-08).
"""

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import SessionLocal
from app.core.seguridad import hashear_contrasena
from app.models import (
    Caracteristica,
    CodigoRol,
    ConfiguracionInferencia,
    ModeloDesplegado,
    Rol,
    Usuario,
)

ROLES = [
    {"codigo": CodigoRol.DOCTOR, "nombre": "Doctor/Gastroenterólogo"},
    {"codigo": CodigoRol.ADMINISTRADOR, "nombre": "Administrador"},
]

# Provisionales: se cambian por las etiquetas exactas de la model card cuando exista
CARACTERISTICAS = [
    {"codigo": "ATROFIA", "nombre": "Atrofia gástrica"},
    {"codigo": "GASTRITIS", "nombre": "Gastritis"},
    {"codigo": "HPYLORI", "nombre": "Infección por H. pylori"},
]

UMBRAL_INICIAL = Decimal("0.5")  # RF-A01: se documenta el definitivo tras las pruebas del modelo
VIGENCIA_TEMPORAL = timedelta(hours=72)  # RNF-27

# RNF-29: un commit SHA de 40 hex. «main», «latest» o una rama no pasan
PATRON_REVISION = re.compile(r"^[0-9a-f]{40}$")
PATRON_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ErrorSemilla(Exception):
    """Falta o está mal una variable que la carga inicial necesita."""


def validar(settings: Settings) -> list[str]:
    """Revisa todo antes de tocar la base, pa no dejar la carga a medias. Devuelve los errores."""
    errores = []
    if not settings.hf_repo.strip():
        errores.append("Falta HF_REPO (repositorio del modelo en Hugging Face).")
    if not PATRON_REVISION.fullmatch(settings.hf_revision.strip().lower()):
        errores.append("HF_REVISION debe ser un commit SHA de 40 caracteres hex, nunca una rama.")
    if not PATRON_SHA256.fullmatch(settings.hf_sha256.strip().lower()):
        errores.append("HF_SHA256 debe ser la huella SHA-256 de los pesos (64 caracteres hex).")
    if "@" not in settings.admin_correo:
        errores.append("Falta ADMIN_CORREO o no es un correo.")
    if not settings.admin_temporal.get_secret_value():
        errores.append("Falta ADMIN_TEMPORAL (contraseña temporal del primer administrador).")
    return errores


def sembrar(db: Session, settings: Settings) -> dict[str, bool]:
    """Hace la carga dentro de la sesión que le pasen; el commit lo decide quien llama.

    Devuelve qué se creó en esta corrida (pa avisar sin imprimir datos sensibles).
    """
    errores = validar(settings)
    if errores:
        raise ErrorSemilla(" ".join(errores))

    db.execute(insert(Rol).values(ROLES).on_conflict_do_nothing(index_elements=["codigo"]))
    db.execute(
        insert(Caracteristica)
        .values(CARACTERISTICAS)
        .on_conflict_do_nothing(index_elements=["codigo"])
    )
    db.execute(
        insert(ConfiguracionInferencia)
        .values(id=1, umbral_global=UMBRAL_INICIAL, usar_umbral_por_caracteristica=False)
        .on_conflict_do_nothing(index_elements=["id"])
    )

    # Modelo vigente (RNF-29). Primero se apaga cualquier otro vigente, si no el trigger
    # modelo_un_vigente truena; después se re-enciende el configurado o se crea.
    # OJO: nada de INSERT ... ON CONFLICT aquí. El trigger BEFORE INSERT corre antes de que
    # Postgres vea el conflicto, con un id nuevo, y confunde al modelo existente con «otro
    # vigente». Ese bug venía en el seed de diseno_bd §7.2 y tumbaba la segunda corrida.
    repo = settings.hf_repo.strip()
    revision = settings.hf_revision.strip().lower()
    db.execute(
        update(ModeloDesplegado)
        .where(
            ModeloDesplegado.es_vigente,
            (ModeloDesplegado.repositorio_hf != repo) | (ModeloDesplegado.revision_sha != revision),
        )
        .values(es_vigente=False)
    )
    modelo = db.scalar(
        select(ModeloDesplegado).where(
            ModeloDesplegado.repositorio_hf == repo, ModeloDesplegado.revision_sha == revision
        )
    )
    if modelo is None:
        db.add(
            ModeloDesplegado(
                repositorio_hf=repo,
                revision_sha=revision,
                huella_pesos_sha256=settings.hf_sha256.strip().lower(),
                es_vigente=True,
            )
        )
    else:
        modelo.es_vigente = True

    # Primer administrador (RF-U07 CA 6): entra con la temporal y la cambia a la fuerza (RF-U02)
    correo = settings.admin_correo.strip().lower()
    admin_creado = False
    if db.scalar(select(Usuario.id).where(Usuario.correo == correo)) is None:
        rol_admin = db.scalar(select(Rol.id).where(Rol.codigo == CodigoRol.ADMINISTRADOR))
        db.add(
            Usuario(
                nombre="Administrador",
                apellido="Inicial",
                correo=correo,
                rol_id=rol_admin,
                hash_contrasena=hashear_contrasena(settings.admin_temporal.get_secret_value()),
                contrasena_temporal=True,
                temporal_expira_en=datetime.now(UTC) + VIGENCIA_TEMPORAL,
            )
        )
        admin_creado = True
    db.flush()
    return {"admin_creado": admin_creado}


def main() -> None:
    settings = get_settings()
    try:
        with SessionLocal.begin() as db:
            resultado = sembrar(db, settings)
    except ErrorSemilla as error:
        raise SystemExit(f"No se hizo la carga inicial: {error}") from None
    print("Carga inicial lista: roles, características, configuración y modelo vigente.")
    if resultado["admin_creado"]:
        print("Primer administrador creado; entra con ADMIN_TEMPORAL (vence en 72 h).")
    else:
        print("El administrador inicial ya existía; no se tocó.")


if __name__ == "__main__":
    main()
