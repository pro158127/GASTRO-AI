"""Dashboard técnico: la pantalla inicial del administrador (RF-DB02, W-19).

Junta en una sola respuesta lo que el administrador necesita ver al entrar:

- Cuentas por estado y por rol, pendientes con la temporal vencida (CA 1).
- Modelo desplegado y estado de los servicios (CA 2 y 3), reutilizando la medición de
  `ServicioEstadoOperativo` (la misma memoria de 30 s, así no se mide dos veces).
- Accesos fallidos de las últimas 24 h y cuentas bloqueadas (CA 4).
- Latencia p95 de visión y de LLM de los últimos 7 días (CA 6).

Las métricas del modelo (CA 5 y 9) no van aquí: el front las pide a `/admin/modelo/metricas`,
que ya maneja el estado vacío. Nada clínico (CA 8): solo conteos.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.repositories.dashboard_tecnico_repository import (
    ConteoAnalisis,
    ConteoCuentas,
    Latencias,
    RepositorioDashboardTecnico,
)
from app.services.analisis import ZONA_COLOMBIA
from app.services.estado_operativo import EstadoOperativo, ServicioEstadoOperativo

VENTANA_ACCESOS = timedelta(hours=24)
VENTANA_SEMANA = timedelta(days=7)


@dataclass(frozen=True)
class DatosDashboardTecnico:
    cuentas: ConteoCuentas
    accesos_fallidos_24h: int
    envios_credencial_fallidos: int
    analisis: ConteoAnalisis
    latencia_7d: Latencias
    estado: EstadoOperativo


def inicio_del_dia(ahora: datetime) -> datetime:
    """Hoy a las 00:00 en Colombia (el «hoy» del administrador, no el de UTC)."""
    return ahora.astimezone(ZONA_COLOMBIA).replace(hour=0, minute=0, second=0, microsecond=0)


class ServicioDashboardTecnico:
    def __init__(
        self,
        repositorio: RepositorioDashboardTecnico,
        estado_operativo: ServicioEstadoOperativo,
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repo = repositorio
        self._estado = estado_operativo
        self._reloj = reloj

    def resumen(self) -> DatosDashboardTecnico:
        ahora = self._reloj()
        hace_7_dias = ahora - VENTANA_SEMANA
        return DatosDashboardTecnico(
            cuentas=self._repo.cuentas(ahora),
            accesos_fallidos_24h=self._repo.accesos_fallidos(ahora - VENTANA_ACCESOS),
            envios_credencial_fallidos=self._repo.envios_fallidos(),
            analisis=self._repo.analisis(inicio_del_dia(ahora), hace_7_dias),
            latencia_7d=self._repo.latencias(hace_7_dias),
            # Sin forzar: si hay una medición de menos de 30 s, se reutiliza
            estado=self._estado.consultar(),
        )
