"""Aquí se registran las tablas: 20 tablas y 18 enums repartidos en 5 módulos.

Modelo nuevo que no importes aquí = Alembic no lo ve y la migración sale vacía. Luego no
digas que nadie te avisó.
"""

from app.models.analisis import (
    Analisis,
    CasoPaciente,
    CausaCalidad,
    EstadoAnalisis,
    EstadoCaso,
    EstadoExplicacion,
    EtapaProceso,
    ExplicacionLlm,
    FormatoImagen,
    ObservacionProfesional,
    RegionInteres,
    ResultadoCaracteristica,
    Valoracion,
)
from app.models.auditoria import (
    AccionBitacora,
    Bitacora,
    EstadoInferencia,
    LogInferencia,
    ResultadoAccion,
    TipoTraslado,
    Traslado,
    TrasladoCaso,
)
from app.models.base import Base
from app.models.modelo import (
    Caracteristica,
    ConfiguracionInferencia,
    MetricaModelo,
    ModeloDesplegado,
    NombreMetrica,
)
from app.models.reportes import FormatoReporte, Reporte, ReporteAnalisis
from app.models.usuarios import (
    CodigoRol,
    EnvioCredencial,
    EstadoEnvio,
    EstadoUsuario,
    EtapaSesion,
    MotivoCredencial,
    Rol,
    Sesion,
    Usuario,
)

__all__ = [
    "AccionBitacora",
    "Analisis",
    "Base",
    "Bitacora",
    "Caracteristica",
    "CasoPaciente",
    "CausaCalidad",
    "CodigoRol",
    "ConfiguracionInferencia",
    "EnvioCredencial",
    "EstadoAnalisis",
    "EstadoCaso",
    "EstadoEnvio",
    "EstadoExplicacion",
    "EstadoInferencia",
    "EstadoUsuario",
    "EtapaProceso",
    "EtapaSesion",
    "ExplicacionLlm",
    "FormatoImagen",
    "FormatoReporte",
    "LogInferencia",
    "MetricaModelo",
    "ModeloDesplegado",
    "MotivoCredencial",
    "NombreMetrica",
    "ObservacionProfesional",
    "RegionInteres",
    "Reporte",
    "ReporteAnalisis",
    "ResultadoAccion",
    "ResultadoCaracteristica",
    "Rol",
    "Sesion",
    "TipoTraslado",
    "Traslado",
    "TrasladoCaso",
    "Usuario",
    "Valoracion",
]
