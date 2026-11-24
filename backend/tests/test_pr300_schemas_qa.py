"""Validación de los contratos JSON administrativos y del reporte RM-06."""

from datetime import UTC, date, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.models import EstadoInferencia, NombreMetrica
from app.schemas.bitacora import (
    AccionFiltro,
    EntradaBitacora,
    FiltrosBitacora,
    PaginaBitacora,
    PersonaBitacora,
    UsuarioFiltro,
)
from app.schemas.dashboard import (
    AnalisisReciente,
    AvisoTraslado,
    Barra,
    CasosRecibidosResumen,
    ConcordanciaSalida,
    DashboardDoctor,
    Frecuencia,
    OrigenTraslado,
    ResumenDoctor,
)
from app.schemas.dashboard_tecnico import (
    Latencia,
    ModeloVigenteResumen,
    RespuestaDashboardTecnico,
    ResumenAnalisis,
    Seguridad,
    ServicioResumen,
    Usuarios,
)
from app.schemas.monitoreo import (
    AlertaEstado,
    CaracteristicaMetrica,
    LogTecnico,
    Metricas,
    MetricasCaracteristica,
    ModeloDesplegadoInfo,
    ModeloMetricas,
    PaginaLogs,
    RespuestaEstadoOperativo,
    RespuestaMetricas,
    ServicioEstado,
)
from app.schemas.paginacion import Paginacion
from app.schemas.reporte_evaluacion import ReporteEvaluacion
from app.services.estado_operativo import EstadoServicio


def test_reporte_evaluacion_normaliza_y_redondea_metricas():
    reporte = ReporteEvaluacion(
        repositorio_hf=" org/gastro ",
        revision_sha="A" * 40,
        fecha_reporte="2026-11-20",
        conjunto_prueba=" GastroHUN test ",
        macro={"F1": 0.812345, "ECE": 0.05215},
        por_caracteristica={" atrofia ": {"SENSIBILIDAD": 0.9}},
    )
    assert reporte.repositorio_hf == "org/gastro"
    assert reporte.revision_sha == "a" * 40
    assert reporte.conjunto_prueba == "GastroHUN test"
    assert reporte.macro[NombreMetrica.F1] == 0.8123
    assert reporte.macro[NombreMetrica.ECE] == 0.0522
    assert reporte.por_caracteristica == {"ATROFIA": {NombreMetrica.SENSIBILIDAD: 0.9}}


@pytest.mark.parametrize(
    "cambio",
    [
        {"revision_sha": "branch"},
        {"macro": {"F1": 1.01}},
        {"macro": {"F1": -0.01}},
        {"macro": {}},
        {"por_caracteristica": {" atrofia ": {}}},
        {"por_caracteristica": {"atrofia": {"F1": 1.01}}},
        {"campo_extra": "no se ignora"},
        {"repositorio_hf": "  "},
        {"conjunto_prueba": "  "},
    ],
)
def test_reporte_evaluacion_rechaza_datos_fuera_de_contrato(cambio):
    datos = {
        "repositorio_hf": "org/modelo",
        "revision_sha": "a" * 40,
        "fecha_reporte": "2026-11-20",
        "conjunto_prueba": "test",
        "macro": {"F1": 0.8},
        "por_caracteristica": {},
    }
    datos.update(cambio)
    with pytest.raises(ValidationError):
        ReporteEvaluacion.model_validate(datos)


def test_dashboard_clinico_anida_conteos_y_no_expone_campos_extra():
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    aviso = AvisoTraslado(
        traslado_id=UUID(int=2),
        tipo="DESACTIVACION",
        cantidad_casos=2,
        origen=OrigenTraslado(nombre="Ana", apellido="QA", cuenta_eliminada=False),
        ejecutado_en=ahora,
    )
    dashboard = DashboardDoctor(
        primer_uso=False,
        resumen=ResumenDoctor(total_analisis=9, analisis_mes=3, ultimos_7_dias=2, sin_valoracion=1),
        analisis_recientes=[
            AnalisisReciente(
                id=UUID(int=3),
                codigo="A-1",
                solicitado_en=ahora,
                estado="COMPLETADO",
                caracteristica_principal="ATROFIA",
                caracteristicas_que_superan=["ATROFIA", "HPYLORI"],
            )
        ],
        frecuencia=Frecuencia(
            rotulo="Conteo",
            barras=[
                Barra(
                    caracteristica_id=1,
                    codigo="ATROFIA",
                    nombre="Atrofia",
                    analisis=2,
                )
            ],
        ),
        concordancia=ConcordanciaSalida(
            porcentaje=81.2, coincide=7, no_coincide=1, no_concluyente=1
        ),
        pacientes_con_seguimiento=4,
        avisos_traslado=[aviso],
        casos_recibidos=CasosRecibidosResumen(traslados_nuevos=1, casos=2),
    )
    data = dashboard.model_dump(mode="json")
    assert data["analisis_recientes"][0]["caracteristicas_que_superan"] == ["ATROFIA", "HPYLORI"]
    assert data["avisos_traslado"][0]["origen"]["cuenta_eliminada"] is False
    assert data["concordancia"]["porcentaje"] == 81.2
    assert dashboard.aviso.etiqueta


def test_dashboard_tecnico_admite_nulos_de_modelo_y_latencias():
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    salida = RespuestaDashboardTecnico(
        usuarios=Usuarios(por_estado={"ACTIVO": 4}, por_rol={"DOCTOR": 3}, pendientes_expiradas=0),
        seguridad=Seguridad(accesos_fallidos_24h=2, cuentas_bloqueadas=1),
        analisis=ResumenAnalisis(
            hoy=3, ultimos_7_dias=10, con_error_7_dias=1, calidad_insuficiente_7_dias=2
        ),
        latencia_7d=Latencia(vision_p95_ms=None, llm_p95_ms=600, inferencias=9, errores=1),
        servicios=[
            ServicioResumen(codigo="INFERENCIA_VISION", nombre="Vision", estado="OPERATIVO")
        ],
        alerta=None,
        modelo_vigente=ModeloVigenteResumen(
            repositorio_hf="org/modelo",
            revision_corta="abcdef0",
            desplegado_en=ahora,
            coincide_con_configuracion=True,
        ),
        envios_credencial_fallidos=1,
        verificado_en=ahora,
    )
    assert salida.latencia_7d.vision_p95_ms is None
    assert salida.modelo_vigente.revision_corta == "abcdef0"


def test_respuestas_de_monitoreo_serializan_estado_modelo_metricas_y_logs():
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    modelo = ModeloDesplegadoInfo(
        repositorio_hf="org/modelo",
        revision_sha="a" * 40,
        huella_pesos_sha256="b" * 64,
        desplegado_en=ahora,
        model_card_url=None,
        coincide_con_configuracion=True,
        revision_space="a" * 40,
    )
    servicio = ServicioEstado(
        codigo="INFERENCIA_VISION",
        nombre="Vision",
        estado=EstadoServicio.OPERATIVO,
        tiempo_respuesta_ms=20,
        ultima_verificacion=ahora,
    )
    estado = RespuestaEstadoOperativo(
        verificado_en=ahora,
        alerta=AlertaEstado(nivel="ADVERTENCIA", mensaje="Lento"),
        servicios=[servicio],
        modelo_desplegado=modelo,
    )
    assert estado.model_dump(mode="json")["servicios"][0]["estado"] == "OPERATIVO"
    metricas = Metricas(
        SENSIBILIDAD=0.8,
        ESPECIFICIDAD=0.9,
        F1=0.85,
        ROC_AUC=0.91,
        PR_AUC=0.8,
        BRIER=0.1,
        ECE=0.04,
    )
    salida = RespuestaMetricas(
        disponible=True,
        modelo=ModeloMetricas(repositorio_hf="org/modelo", revision_sha="a" * 40),
        rotulo="Conjunto de prueba",
        conjunto_prueba="test",
        fecha_reporte=date(2026, 11, 20),
        contiene_datos_clinicos=False,
        model_card_url=None,
        macro=metricas,
        por_caracteristica=[
            MetricasCaracteristica(
                caracteristica=CaracteristicaMetrica(id=1, nombre="Atrofia"),
                **metricas.model_dump(),
            )
        ],
    )
    assert salida.por_caracteristica[0].caracteristica.nombre == "Atrofia"
    log = LogTecnico(
        id="L-1",
        ocurrido_en=ahora,
        revision_modelo="abcdef0",
        latencia_vision_ms=12,
        latencia_llm_ms=None,
        estado=EstadoInferencia.ERROR,
        codigo_error="NO_DISPONIBLE",
    )
    pagina = PaginaLogs(items=[log], paginacion=Paginacion(pagina=1, por_pagina=25, total=1))
    assert "analisis_id" not in pagina.items[0].model_dump()


def test_contratos_bitacora_admiten_actor_anonimo_y_filtros():
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    persona = PersonaBitacora(id=UUID(int=1), nombre="Ana", apellido="QA", cuenta_eliminada=False)
    entrada = EntradaBitacora(
        id="9007199254740993",
        ocurrido_en=ahora,
        actor=None,
        accion="LOGIN",
        accion_texto="Inicio de sesión",
        resultado="FALLO",
        objetivo=persona,
        detalle="Rechazo simulado",
        ip=None,
    )
    pagina = PaginaBitacora(
        items=[entrada],
        paginacion=Paginacion(pagina=1, por_pagina=50, total=1),
    )
    filtros = FiltrosBitacora(
        acciones=[AccionFiltro(codigo="LOGIN", texto="Inicio")],
        usuarios=[UsuarioFiltro(id=persona.id, nombre="Ana QA", cuenta_eliminada=False)],
    )
    assert pagina.items[0].actor is None and pagina.items[0].id == "9007199254740993"
    assert filtros.acciones[0].codigo == "LOGIN"
