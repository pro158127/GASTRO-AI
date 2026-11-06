"""Bitácora de auditoría con patrón Observador (RF-A02, RNF-05).

Los servicios no saben dónde ni cómo se guarda la auditoría: solo publican un
EventoAuditoria y los suscriptores hacen lo suyo (hoy, guardarlo en la tabla Bitacora).
Si mañana piden mandar alertas por correo, se suscribe otro y nadie más se entera.

Regla de oro (diseño de la API, lib/bitacora): en «detalle» NUNCA va un documento, un
seudónimo, un resultado clínico ni un secreto. verificar_detalle lo hace cumplir.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from app.models import AccionBitacora, ResultadoAccion

# Si alguno de estos aparece en el detalle (a cualquier profundidad), se rechaza el evento
CLAVES_PROHIBIDAS = frozenset(
    {
        # datos del paciente (RF-D01, RNF-04)
        "documento",
        "numero_documento",
        "cedula",
        "seudonimo",
        # resultados clínicos: la bitácora es técnica, no clínica (RF-A02, RF-M03)
        "probabilidad",
        "probabilidades",
        "explicacion",
        "imagen",
        # secretos: ni hasheados, que pa eso no sirve la bitácora
        "contrasena",
        "contrasena_temporal",
        "hash_contrasena",
        "token",
        "totp",
        "secreto",
        "codigo_totp",
    }
)


class DetalleProhibido(ValueError):
    """Alguien intentó meter un dato sensible en la bitácora. Es un bug, no un error del usuario."""


def verificar_detalle(dato: Any, ruta: str = "detalle") -> None:
    if isinstance(dato, Mapping):
        for clave, valor in dato.items():
            if str(clave).lower() in CLAVES_PROHIBIDAS:
                raise DetalleProhibido(f"{ruta}.{clave} no puede ir en la bitácora")
            verificar_detalle(valor, f"{ruta}.{clave}")
    elif isinstance(dato, (list, tuple)):
        for i, valor in enumerate(dato):
            verificar_detalle(valor, f"{ruta}[{i}]")
    elif isinstance(dato, (bytes, bytearray)):
        raise DetalleProhibido(f"{ruta} trae datos binarios")


@dataclass(frozen=True)
class EventoAuditoria:
    accion: AccionBitacora
    actor_id: UUID | None = None  # None cuando no hay sesión (p. ej. login con correo inexistente)
    resultado: ResultadoAccion = ResultadoAccion.EXITO
    entidad: str | None = None  # p. ej. "Usuario"
    entidad_id: str | None = None
    detalle: Mapping[str, Any] | None = field(default=None)
    ip: str | None = None

    def __post_init__(self) -> None:
        # Se revisa al crear el evento, antes de que llegue a cualquier suscriptor
        if self.detalle is not None:
            verificar_detalle(self.detalle)


class Suscriptor(Protocol):
    def notificar(self, evento: EventoAuditoria) -> None: ...


class PublicadorEventos:
    def __init__(self, suscriptores: list[Suscriptor] | None = None) -> None:
        self._suscriptores: list[Suscriptor] = list(suscriptores or [])

    def suscribir(self, suscriptor: Suscriptor) -> None:
        self._suscriptores.append(suscriptor)

    def publicar(self, evento: EventoAuditoria) -> None:
        for suscriptor in self._suscriptores:
            suscriptor.notificar(evento)


class AlmacenBitacora(Protocol):
    def insertar(self, evento: EventoAuditoria) -> None: ...


class SuscriptorBitacora:
    """Guarda cada evento en la tabla Bitacora, que solo acepta INSERT y SELECT (RNF-05)."""

    def __init__(self, almacen: AlmacenBitacora) -> None:
        self._almacen = almacen

    def notificar(self, evento: EventoAuditoria) -> None:
        self._almacen.insertar(evento)
