"""Conteos del dashboard técnico del administrador (RF-DB02, W-19).

Solo lectura y solo agregados: ninguna consulta devuelve filas de casos, pacientes ni
resultados (RF-DB02 CA 8). Del log de inferencia solo salen percentiles y conteos.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import (
    AccionBitacora,
    Analisis,
    Bitacora,
    CodigoRol,
    EnvioCredencial,
    EstadoAnalisis,
    EstadoEnvio,
    EstadoInferencia,
    EstadoUsuario,
    LogInferencia,
    ResultadoAccion,
    Rol,
    Usuario,
)

# Los intentos de acceso que cuentan como fallidos (RF-DB02 CA 4): contraseña y segundo factor
ACCIONES_DE_ACCESO = (AccionBitacora.INICIO_SESION, AccionBitacora.VERIFICACION_2FA)


@dataclass(frozen=True)
class ConteoCuentas:
    por_estado: dict[EstadoUsuario, int]  # sin las ELIMINADAS
    por_rol: dict[CodigoRol, int]  # cuentas no eliminadas de cada rol
    pendientes_expiradas: int  # PENDIENTE con la contraseña temporal vencida
    bloqueadas: int  # bloqueo temporal en curso (RF-U12)


@dataclass(frozen=True)
class ConteoAnalisis:
    hoy: int
    ultimos_7_dias: int
    con_error_7_dias: int  # FALLIDO por error técnico (no por calidad de imagen)
    calidad_insuficiente_7_dias: int


@dataclass(frozen=True)
class Latencias:
    vision_p95_ms: int | None
    llm_p95_ms: int | None
    inferencias: int
    errores: int  # ERROR o TIEMPO_AGOTADO


class RepositorioDashboardTecnico:
    def __init__(self, db: Session) -> None:
        self.db = db

    def cuentas(self, ahora: datetime) -> ConteoCuentas:
        vigente = Usuario.estado != EstadoUsuario.ELIMINADO
        por_estado = dict(
            self.db.execute(
                select(Usuario.estado, func.count()).where(vigente).group_by(Usuario.estado)
            ).all()
        )
        por_rol = dict(
            self.db.execute(
                select(Rol.codigo, func.count(Usuario.id))
                .join(Usuario, Usuario.rol_id == Rol.id)
                .where(vigente)
                .group_by(Rol.codigo)
            ).all()
        )
        expiradas, bloqueadas = self.db.execute(
            select(
                func.count(
                    case(
                        (
                            (Usuario.estado == EstadoUsuario.PENDIENTE)
                            & Usuario.temporal_expira_en.is_not(None)
                            & (Usuario.temporal_expira_en < ahora),
                            1,
                        )
                    )
                ),
                func.count(
                    case(
                        (
                            Usuario.bloqueado_hasta.is_not(None)
                            & (Usuario.bloqueado_hasta > ahora),
                            1,
                        )
                    )
                ),
            ).where(vigente)
        ).one()
        return ConteoCuentas(
            por_estado={
                e: int(por_estado.get(e, 0)) for e in EstadoUsuario if e != EstadoUsuario.ELIMINADO
            },
            por_rol={r: int(por_rol.get(r, 0)) for r in CodigoRol},
            pendientes_expiradas=int(expiradas),
            bloqueadas=int(bloqueadas),
        )

    def accesos_fallidos(self, desde: datetime) -> int:
        """Inicios de sesión y verificaciones TOTP fallidas desde `desde` (según la bitácora)."""
        return int(
            self.db.scalar(
                select(func.count()).where(
                    Bitacora.accion.in_(ACCIONES_DE_ACCESO),
                    Bitacora.resultado == ResultadoAccion.FALLO,
                    Bitacora.ocurrido_en >= desde,
                )
            )
            or 0
        )

    def envios_fallidos(self) -> int:
        """Cuentas vigentes cuyo último envío de credencial falló (W-20: «Correo no enviado»)."""
        numerados = (
            select(
                EnvioCredencial.usuario_id,
                EnvioCredencial.estado,
                func.row_number()
                .over(
                    partition_by=EnvioCredencial.usuario_id,
                    order_by=(EnvioCredencial.intentado_en.desc(), EnvioCredencial.id.desc()),
                )
                .label("n"),
            )
        ).subquery()
        return int(
            self.db.scalar(
                select(func.count())
                .select_from(numerados)
                .join(Usuario, Usuario.id == numerados.c.usuario_id)
                .where(
                    numerados.c.n == 1,
                    numerados.c.estado == EstadoEnvio.FALLIDO,
                    Usuario.estado != EstadoUsuario.ELIMINADO,
                )
            )
            or 0
        )

    def analisis(self, inicio_hoy: datetime, hace_7_dias: datetime) -> ConteoAnalisis:
        fallido = Analisis.estado == EstadoAnalisis.FALLIDO
        por_calidad = Analisis.calidad_suficiente.is_(False)
        en_7_dias = Analisis.solicitado_en >= hace_7_dias
        fila = self.db.execute(
            select(
                func.count(case((Analisis.solicitado_en >= inicio_hoy, 1))),
                func.count(case((en_7_dias, 1))),
                func.count(case((en_7_dias & fallido & ~por_calidad, 1))),
                func.count(case((en_7_dias & fallido & por_calidad, 1))),
            ).where(Analisis.solicitado_en >= min(inicio_hoy, hace_7_dias))
        ).one()
        return ConteoAnalisis(*(int(n) for n in fila))

    def latencias(self, desde: datetime) -> Latencias:
        """Percentil 95 de cada modelo, calculado en PostgreSQL (RF-DB02 CA 6).

        `percentile_cont` ignora los null, así que el p95 del LLM sale solo de las
        inferencias que sí lo llamaron.
        """
        vision, llm, total, errores = self.db.execute(
            select(
                func.percentile_cont(0.95).within_group(LogInferencia.latencia_vision_ms),
                func.percentile_cont(0.95).within_group(LogInferencia.latencia_llm_ms),
                func.count(),
                func.count(case((LogInferencia.estado != EstadoInferencia.EXITO, 1))),
            ).where(LogInferencia.ocurrido_en >= desde)
        ).one()
        return Latencias(
            vision_p95_ms=round(vision) if vision is not None else None,
            llm_p95_ms=round(llm) if llm is not None else None,
            inferencias=int(total),
            errores=int(errores),
        )
