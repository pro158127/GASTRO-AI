"""Respuesta de GET /admin/dashboard (RF-DB02, contrato §7.1). Solo conteos, nada clínico."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.monitoreo import AlertaEstado


class Usuarios(BaseModel):
    por_estado: dict[str, int]  # PENDIENTE, ACTIVO, INACTIVO (las eliminadas no cuentan)
    por_rol: dict[str, int]  # DOCTOR, ADMINISTRADOR
    pendientes_expiradas: int  # PENDIENTE con la contraseña temporal vencida (CA 1)


class Seguridad(BaseModel):
    accesos_fallidos_24h: int  # contraseña o TOTP incorrectos (CA 4)
    cuentas_bloqueadas: int  # bloqueo temporal en curso (RF-U12)


class ResumenAnalisis(BaseModel):
    hoy: int
    ultimos_7_dias: int
    con_error_7_dias: int  # fallidos por error técnico
    calidad_insuficiente_7_dias: int  # fallidos porque la imagen no sirvió


class Latencia(BaseModel):
    vision_p95_ms: int | None
    llm_p95_ms: int | None
    inferencias: int
    errores: int


class ServicioResumen(BaseModel):
    codigo: str
    nombre: str
    estado: str


class ModeloVigenteResumen(BaseModel):
    repositorio_hf: str
    revision_corta: str  # los primeros 7 caracteres del SHA
    desplegado_en: datetime
    coincide_con_configuracion: bool


class RespuestaDashboardTecnico(BaseModel):
    usuarios: Usuarios
    seguridad: Seguridad
    analisis: ResumenAnalisis
    latencia_7d: Latencia
    servicios: list[ServicioResumen]
    alerta: AlertaEstado | None
    modelo_vigente: ModeloVigenteResumen | None
    envios_credencial_fallidos: int
    verificado_en: datetime  # cuándo se midieron los servicios
