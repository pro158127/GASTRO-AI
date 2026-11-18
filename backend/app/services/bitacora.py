"""Consulta y exportación de la bitácora (RF-A02, RNF-05, RF-DB02 CA 7 y 10, contrato §7.3).

Solo lectura: no hay forma de editar ni borrar entradas, ni desde aquí ni desde la base (los
triggers de 0002 lo impiden). El `detalle` que ve el administrador es un texto armado aquí a
partir del JSON guardado, que al insertarse ya se validó sin datos del paciente ni secretos.
La exportación también queda en la bitácora (AUDITORIA_EXPORTADA).
"""

import csv
import io
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.core.errores import ErrorApi
from app.models import AccionBitacora, Bitacora, ResultadoAccion, Usuario
from app.repositories.bitacora_repository import FiltroBitacora, RepositorioBitacora
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.services.auditoria import EventoAuditoria, PublicadorEventos
from app.services.historial import limites_de_fechas

TEXTO_ACCION: dict[AccionBitacora, str] = {
    AccionBitacora.INICIO_SESION: "Inicio de sesión",
    AccionBitacora.VERIFICACION_2FA: "Verificación del segundo factor",
    AccionBitacora.CIERRE_SESION: "Cierre de sesión",
    AccionBitacora.CIERRE_SESION_INACTIVIDAD: "Cierre de sesión por inactividad",
    AccionBitacora.CAMBIO_CONTRASENA_TEMPORAL: "Cambio de la contraseña temporal",
    AccionBitacora.VINCULACION_TOTP: "Vinculación de la app autenticadora",
    AccionBitacora.CUENTA_CREADA: "Creación de cuenta",
    AccionBitacora.CUENTA_EDITADA: "Edición de cuenta",
    AccionBitacora.CORREO_CAMBIADO: "Cambio de correo",
    AccionBitacora.CUENTA_ACTIVADA: "Activación de cuenta",
    AccionBitacora.CUENTA_DESACTIVADA: "Desactivación de cuenta",
    AccionBitacora.CUENTA_ELIMINADA: "Eliminación de cuenta",
    AccionBitacora.CONTRASENA_RESTABLECIDA: "Restablecimiento de contraseña",
    AccionBitacora.ROL_CAMBIADO: "Cambio de rol",
    AccionBitacora.CUENTA_BLOQUEADA: "Bloqueo temporal de cuenta",
    AccionBitacora.CUENTA_DESBLOQUEADA: "Desbloqueo de cuenta",
    AccionBitacora.ENVIO_CREDENCIAL: "Envío de contraseña temporal",
    AccionBitacora.CASOS_REASIGNADOS: "Reasignación de casos",
    AccionBitacora.CONFIGURACION_INFERENCIA_CAMBIADA: "Cambio de configuración de inferencia",
    AccionBitacora.AUDITORIA_EXPORTADA: "Exportación de la auditoría",
}

# RF-DB02 CA 7: la auditoría exportable = creación de cuentas y verificaciones en dos pasos
ACCIONES_EXPORTABLES = [
    AccionBitacora.CUENTA_CREADA,
    AccionBitacora.ENVIO_CREDENCIAL,
    AccionBitacora.VINCULACION_TOTP,
    AccionBitacora.VERIFICACION_2FA,
]
PERIODO_MAXIMO_DIAS = 366
COLUMNAS_CSV = ["fecha_hora", "usuario", "evento", "resultado", "ip"]  # RF-DB02 CA 10

_ETAPAS = {
    "CAMBIO_CONTRASENA": "cambiar la contraseña temporal",
    "VINCULAR_TOTP": "vincular la app autenticadora",
    "PENDIENTE_2FA": "código del segundo factor",
    "ACTIVA": "sesión activa",
}
_MOTIVOS_LOGIN = {
    "contrasena": "contraseña incorrecta",
    "cuenta": "correo inexistente o cuenta no disponible",
    "bloqueo": "cuenta bloqueada",
    "temporal_expirada": "contraseña temporal vencida",
}
_MOTIVOS_CREDENCIAL = {
    "CREACION": "cuenta nueva",
    "RESTABLECIMIENTO": "restablecimiento",
    "CAMBIO_CORREO": "cambio de correo",
}
_ROLES = {"DOCTOR": "Doctor", "ADMINISTRADOR": "Administrador"}
_TIPOS_TRASLADO = {
    "DESACTIVACION": "por desactivación",
    "ELIMINACION": "por eliminación",
    "REASIGNACION": "reasignación manual",
}
_CAMPOS = {"nombre": "nombre", "apellido": "apellido", "telefono": "teléfono", "correo": "correo"}


@dataclass(frozen=True)
class PaginaBitacora:
    entradas: list[Bitacora]
    total: int
    usuarios: dict[str, Usuario]  # cuentas mencionadas (objetivo y destinos), por id


def _nombre(u: Usuario | None) -> str | None:
    return f"{u.nombre} {u.apellido}" if u else None


def _umbral(valor: Any) -> str:
    return "global" if valor is None else str(valor)


def _cambios_configuracion(antes: dict, despues: dict) -> str | None:
    partes = []
    if antes.get("usar_umbral_por_caracteristica") != despues.get("usar_umbral_por_caracteristica"):
        modo = "por característica" if despues.get("usar_umbral_por_caracteristica") else "global"
        partes.append(f"modo {modo}")
    if antes.get("umbral_global") != despues.get("umbral_global"):
        partes.append(
            f"umbral global {antes.get('umbral_global')} → {despues.get('umbral_global')}"
        )
    viejos, nuevos = antes.get("umbrales") or {}, despues.get("umbrales") or {}
    for codigo in sorted(set(viejos) | set(nuevos)):
        if viejos.get(codigo) != nuevos.get(codigo):
            partes.append(f"{codigo} {_umbral(viejos.get(codigo))} → {_umbral(nuevos.get(codigo))}")
    if not partes:
        return "Sin cambios en los valores"
    texto = "; ".join(partes)
    return texto[0].upper() + texto[1:]  # solo la primera letra: los códigos van en mayúscula


def detalle_legible(entrada: Bitacora, usuarios: dict[str, Usuario]) -> str | None:
    """El JSON de `detalle` como una frase para W-21. Nunca agrega datos que no estén ahí."""
    d = entrada.detalle or {}
    if not isinstance(d, dict) or not d:
        return None
    accion = entrada.accion
    if accion is AccionBitacora.INICIO_SESION:
        if "motivo" in d:
            return f"Rechazado: {_MOTIVOS_LOGIN.get(d['motivo'], d['motivo'])}"
        if "etapa" in d:
            return f"Siguiente paso: {_ETAPAS.get(d['etapa'], d['etapa'])}"
    if accion is AccionBitacora.CUENTA_CREADA and "rol" in d:
        return f"Rol: {_ROLES.get(d['rol'], d['rol'])}"
    if accion is AccionBitacora.CUENTA_EDITADA and "campos" in d:
        campos = ", ".join(_CAMPOS.get(c, c) for c in d["campos"]) or "ninguno"
        return f"Campos: {campos}" + (" (desde su perfil)" if d.get("propio") else "")
    if accion is AccionBitacora.ROL_CAMBIADO and {"de", "a"} <= d.keys():
        return f"De {_ROLES.get(d['de'], d['de'])} a {_ROLES.get(d['a'], d['a'])}"
    if accion is AccionBitacora.ENVIO_CREDENCIAL and "motivo" in d:
        return f"Motivo: {_MOTIVOS_CREDENCIAL.get(d['motivo'], d['motivo'])}"
    if accion is AccionBitacora.CASOS_REASIGNADOS and "casos" in d:
        destino = _nombre(usuarios.get(str(d.get("destino_id"))))
        tipo = _TIPOS_TRASLADO.get(d.get("tipo", ""), d.get("tipo", ""))
        texto = f"{d['casos']} caso{'s' if d['casos'] != 1 else ''}, {tipo}"
        return texto + (f", a {destino}" if destino else "")
    if (
        accion is AccionBitacora.CONFIGURACION_INFERENCIA_CAMBIADA
        and {"antes", "despues"} <= d.keys()
    ):
        return _cambios_configuracion(d["antes"], d["despues"])
    if accion is AccionBitacora.AUDITORIA_EXPORTADA and {"desde", "hasta"} <= d.keys():
        return f"Período {d['desde']} a {d['hasta']}, {d.get('filas', 0)} filas"
    # Cualquier otro: los valores simples tal cual (ya se validaron al guardarse)
    simples = [f"{k}: {v}" for k, v in d.items() if isinstance(v, str | int | float | bool)]
    return ", ".join(simples) or None


def _celda(valor: str) -> str:
    """Evita la inyección de fórmulas al abrir el CSV en Excel (CWE-1236)."""
    return "'" + valor if valor[:1] in ("=", "+", "-", "@", "\t", "\r") else valor


class ServicioBitacora:
    def __init__(
        self,
        repositorio: RepositorioBitacora,
        publicador: PublicadorEventos,
        unidad: UnidadTrabajo,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._publicador = publicador
        self._unidad = unidad
        self._reloj = reloj

    def consultar(self, filtro: FiltroBitacora) -> PaginaBitacora:
        entradas, total = self._repo.listar(filtro)
        ids = {e.entidad_id for e in entradas if e.entidad == "Usuario" and e.entidad_id}
        ids |= {
            str(e.detalle["destino_id"])
            for e in entradas
            if isinstance(e.detalle, dict) and e.detalle.get("destino_id")
        }
        return PaginaBitacora(entradas, total, self._repo.usuarios(ids))

    def actores(self) -> list[Usuario]:
        return self._repo.actores()

    def exportar(
        self, actor: Usuario, ip: str | None, desde: date | None, hasta: date | None
    ) -> tuple[str, bytes]:
        """CSV de la auditoría de cuentas y segundo factor (RF-DB02 CA 7 y 10). Devuelve
        (nombre de archivo, contenido). El período es obligatorio y de máximo 366 días."""
        if desde is None or hasta is None:
            raise _periodo_invalido("Indica la fecha inicial y la final.")
        if (hasta - desde) > timedelta(days=PERIODO_MAXIMO_DIAS - 1):
            raise _periodo_invalido(f"El período no puede superar {PERIODO_MAXIMO_DIAS} días.")
        inicio, fin = limites_de_fechas(desde, hasta)  # 422 si desde > hasta
        filas = self._repo.para_exportar(ACCIONES_EXPORTABLES, inicio, fin)

        salida = io.StringIO()
        escritor = csv.writer(salida, lineterminator="\r\n")
        escritor.writerow(COLUMNAS_CSV)
        for e in filas:
            escritor.writerow(
                [
                    e.ocurrido_en.astimezone(UTC).isoformat(),
                    _celda(_nombre(e.actor) or ""),
                    e.accion.value,
                    e.resultado.value,
                    _celda(e.ip or ""),
                ]
            )
        self._publicador.publicar(
            EventoAuditoria(
                accion=AccionBitacora.AUDITORIA_EXPORTADA,
                actor_id=actor.id,
                ip=ip,
                resultado=ResultadoAccion.EXITO,
                detalle={
                    "desde": desde.isoformat(),
                    "hasta": hasta.isoformat(),
                    "filas": len(filas),
                },
            )
        )
        self._unidad.confirmar()
        # Con BOM: Excel en español abre bien las tildes sin pasos extra
        contenido = ("﻿" + salida.getvalue()).encode("utf-8")
        return f"auditoria_{desde.isoformat()}_{hasta.isoformat()}.csv", contenido


def _periodo_invalido(mensaje: str) -> ErrorApi:
    return ErrorApi(422, "PERIODO_INVALIDO", mensaje, extra={"max_dias": PERIODO_MAXIMO_DIAS})
