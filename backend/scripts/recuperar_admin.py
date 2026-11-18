"""Recupera el acceso del único administrador (RF-U09 CA 10). Se corre en el servidor.

Uso (producción, desde la raíz del repositorio):
    docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api \
        python -m scripts.recuperar_admin --correo admin@hospital.co [--mostrar]

La contraseña temporal llega por correo, como un restablecimiento normal. Con `--mostrar`
(solo si el correo no funciona) se imprime UNA vez en esta terminal y no se manda correo.
Al entrar con ella, el sistema pide cambiarla y volver a vincular la app autenticadora.

Se niega si hay otro administrador activo: en ese caso se hace desde la aplicación.
"""

import argparse
import sys
from datetime import UTC, datetime

from app.adapters.correo import crear_enviador
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.repositories.bitacora_repository import RepositorioBitacora
from app.repositories.credenciales_repository import RepositorioCredenciales
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import RepositorioUsuarios
from app.services.auditoria import PublicadorEventos, SuscriptorBitacora
from app.services.credenciales import ServicioCredenciales
from app.services.recuperacion_admin import (
    ErrorRecuperacion,
    Recuperacion,
    ServicioRecuperacionAdmin,
)


def _ahora() -> datetime:
    return datetime.now(UTC)


def servicio(db) -> ServicioRecuperacionAdmin:
    """Arma el servicio con las mismas piezas que usa la API (deps.get_servicio_usuarios)."""
    publicador = PublicadorEventos([SuscriptorBitacora(RepositorioBitacora(db))])
    credenciales = ServicioCredenciales(
        RepositorioCredenciales(db), crear_enviador(get_settings()), publicador, _ahora
    )
    return ServicioRecuperacionAdmin(
        usuarios=RepositorioUsuarios(db),
        sesiones=RepositorioSesiones(db),
        credenciales=credenciales,
        publicador=publicador,
        unidad=UnidadTrabajo(db),
        reloj=_ahora,
    )


def informe(r: Recuperacion) -> list[str]:
    """Lo que se imprime al terminar. La temporal solo aparece con --mostrar."""
    lineas = [
        f"Acceso restablecido para {r.correo}.",
        "Se desvinculó la app autenticadora, se quitó el bloqueo y se cerraron sus sesiones.",
    ]
    vence = f"{r.vence:%Y-%m-%d %H:%M} UTC"
    if r.temporal is not None:
        lineas.append(
            f"Contraseña temporal (vence el {vence}, no se vuelve a mostrar): {r.temporal}"
        )
    elif r.correo_enviado:
        lineas.append(f"La contraseña temporal se envió por correo; vence el {vence}.")
    else:
        lineas.append(
            "OJO: el correo NO salió. La temporal anterior ya no sirve: vuelve a correr el "
            "script con --mostrar."
        )
    lineas.append("Al entrar, el sistema pide cambiarla y vincular otra vez la app autenticadora.")
    return lineas


def main(argumentos: list[str] | None = None) -> int:
    lector = argparse.ArgumentParser(
        description="Recupera el acceso del único administrador (RF-U09 CA 10)."
    )
    lector.add_argument("--correo", required=True, help="correo de la cuenta del administrador")
    lector.add_argument(
        "--mostrar",
        action="store_true",
        help="imprime la temporal en esta terminal en vez de mandarla por correo",
    )
    a = lector.parse_args(argumentos)
    try:
        with SessionLocal() as db:
            r = servicio(db).recuperar(a.correo, mostrar_en_pantalla=a.mostrar)
    except ErrorRecuperacion as error:
        print(f"No se recuperó la cuenta: {error}", file=sys.stderr)
        return 1
    print("\n".join(informe(r)))
    return 0 if r.temporal is not None or r.correo_enviado else 2


if __name__ == "__main__":
    raise SystemExit(main())
