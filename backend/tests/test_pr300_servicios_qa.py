"""Contratos unitarios de los servicios de métricas, estado y recuperación administrativa."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.adapters.salud import INFERENCIA_VISION, Chequeo
from app.models import CodigoRol, EstadoEnvio, EstadoUsuario, NombreMetrica
from app.schemas.reporte_evaluacion import ReporteEvaluacion
from app.services import carga_metricas as carga_metricas_mod
from app.services import estado_operativo as estado_mod
from app.services import recuperacion_admin as recuperacion_mod
from app.services.carga_metricas import ErrorCargaMetricas, ServicioCargaMetricas, _hoy
from app.services.estado_operativo import (
    Alerta,
    EstadoServicio,
    MemoriaEstado,
    ServicioEstadoOperativo,
)
from app.services.monitoreo import ServicioMonitoreo
from app.services.recuperacion_admin import ErrorRecuperacion, ServicioRecuperacionAdmin


def test_cargar_metricas_validas_y_avisa_modelo_no_vigente():
    repo = Mock()
    repo.modelo.return_value = NS(id=7, es_vigente=False)
    repo.caracteristicas.return_value = {"ATROFIA": 4, "HPYLORI": 5}
    repo.reemplazar.return_value = 2
    reporte = ReporteEvaluacion(
        repositorio_hf=" org/modelo ",
        revision_sha="A" * 40,
        fecha_reporte=date(2026, 11, 20),
        conjunto_prueba=" set-test ",
        macro={"F1": 0.81234},
        por_caracteristica={"atrofia": {"SENSIBILIDAD": 0.9}},
    )
    servicio = ServicioCargaMetricas(repo, hoy=lambda: date(2026, 11, 20))

    salida = servicio.cargar(reporte)

    assert salida.metricas == 2 and salida.reemplazadas == 2
    assert salida.avisos and "no es el vigente" in salida.avisos[0]
    repo.reemplazar.assert_called_once()
    modelo_id, conjunto, fecha, filas = repo.reemplazar.call_args.args
    assert (modelo_id, conjunto, fecha) == (7, "set-test", date(2026, 11, 20))
    assert filas == [(None, NombreMetrica.F1, 0.8123), (4, NombreMetrica.SENSIBILIDAD, 0.9)]


@pytest.mark.parametrize(
    ("instante_utc", "fecha_colombia"),
    [
        (datetime(2026, 11, 25, 4, 59, tzinfo=UTC), date(2026, 11, 24)),
        (datetime(2026, 11, 25, 5, 0, tzinfo=UTC), date(2026, 11, 25)),
    ],
)
def test_hoy_usa_fecha_de_colombia(monkeypatch, instante_utc, fecha_colombia):
    class FechaHoraControlada(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz is UTC
            return instante_utc

    monkeypatch.setattr(carga_metricas_mod, "datetime", FechaHoraControlada)
    assert _hoy() == fecha_colombia


@pytest.mark.parametrize(
    "modelo,caracteristicas,fecha,esperados",
    [
        (None, {"ATROFIA": 4}, date(2026, 11, 20), ("No hay un modelo registrado",)),
        (NS(id=7, es_vigente=True), {}, date(2026, 11, 20), ("no están en el catálogo",)),
        (NS(id=7, es_vigente=True), {"ATROFIA": 4}, date(2026, 11, 21), ("no puede ser futura",)),
    ],
)
def test_cargar_metricas_rechaza_todo_antes_de_guardar(modelo, caracteristicas, fecha, esperados):
    repo = Mock()
    repo.modelo.return_value = modelo
    repo.caracteristicas.return_value = caracteristicas
    reporte = ReporteEvaluacion(
        repositorio_hf="org/modelo",
        revision_sha="a" * 40,
        fecha_reporte=fecha,
        conjunto_prueba="test",
        macro={"F1": 0.8},
        por_caracteristica={"ATROFIA": {"F1": 0.8}},
    )
    servicio = ServicioCargaMetricas(repo, hoy=lambda: date(2026, 11, 20))

    with pytest.raises(ErrorCargaMetricas) as exc:
        servicio.cargar(reporte)

    assert all(any(texto in error for error in exc.value.errores) for texto in esperados)
    repo.reemplazar.assert_not_called()


def test_monitoreo_sin_modelo_o_sin_reporte():
    repo = Mock()
    repo.modelo_vigente.return_value = None
    servicio = ServicioMonitoreo(repo)
    assert servicio.metricas().disponible is False
    modelo = NS(id=3)
    repo.modelo_vigente.return_value = modelo
    repo.metricas.return_value = []
    salida = servicio.metricas()
    assert salida.modelo is modelo and not salida.disponible


def test_monitoreo_separa_reporte_actual_y_conserva_caracteristicas_sin_fila():
    repo = Mock()
    modelo = NS(id=3)
    fecha = date(2026, 11, 20)
    repo.modelo_vigente.return_value = modelo
    repo.caracteristicas_activas.return_value = [
        NS(id=2, nombre="Atrofia"),
        NS(id=3, nombre="Gastritis"),
    ]
    repo.metricas.return_value = [
        NS(
            fecha_reporte=fecha,
            conjunto_prueba="v8-test",
            caracteristica_id=None,
            metrica=NombreMetrica.F1,
            valor=Decimal("0.87"),
            caracteristica=None,
        ),
        NS(
            fecha_reporte=fecha,
            conjunto_prueba="v8-test",
            caracteristica_id=2,
            metrica=NombreMetrica.ECE,
            valor=Decimal("0.04"),
            caracteristica=None,
        ),
        NS(
            fecha_reporte=date(2026, 11, 19),
            conjunto_prueba="old",
            caracteristica_id=None,
            metrica=NombreMetrica.F1,
            valor=Decimal("0.1"),
            caracteristica=None,
        ),
        NS(
            fecha_reporte=fecha,
            conjunto_prueba="v8-test",
            caracteristica_id=9,
            metrica=NombreMetrica.F1,
            valor=Decimal("0.7"),
            caracteristica=NS(nombre="Nueva"),
        ),
    ]

    salida = ServicioMonitoreo(repo).metricas()

    assert salida.disponible and salida.modelo is modelo
    assert salida.conjunto_prueba == "v8-test" and salida.fecha_reporte == fecha
    assert salida.macro.valores[NombreMetrica.F1] == 0.87
    assert len(salida.por_caracteristica) == 3
    assert salida.por_caracteristica[0].metricas.valores[NombreMetrica.ECE] == 0.04
    assert salida.por_caracteristica[1].nombre == "Gastritis"
    assert salida.por_caracteristica[2].nombre == "Nueva"


def test_monitoreo_delega_logs():
    repo = Mock()
    filtro = object()
    repo.logs.return_value = (["fila"], 1)
    assert ServicioMonitoreo(repo).logs(filtro) == (["fila"], 1)
    repo.logs.assert_called_once_with(filtro)


def _servicio_estado(chequeos, repo=None, memoria=None, reloj=None):
    repo = repo or Mock()
    memoria = memoria or MemoriaEstado()
    reloj = reloj or (lambda: datetime(2026, 11, 20, tzinfo=UTC))
    return ServicioEstadoOperativo(chequeos, repo, memoria, "a" * 40, reloj), repo, memoria


def test_estado_operativo_cachea_lectura_y_forzar_respeta_espera_minima():
    ahora = [datetime(2026, 11, 20, tzinfo=UTC)]
    chequeo = Chequeo("APP_WEB", "Web", Mock(return_value=None))
    servicio, repo, memoria = _servicio_estado([chequeo], reloj=lambda: ahora[0])
    repo.modelo_vigente.return_value = None

    primero = servicio.consultar()
    ahora[0] += timedelta(seconds=2)
    assert servicio.consultar() is not primero
    assert chequeo.probar.call_count == 1
    servicio.consultar(forzar=True)
    assert chequeo.probar.call_count == 1
    ahora[0] += timedelta(seconds=11)
    servicio.consultar(forzar=True)
    assert chequeo.probar.call_count == 2
    assert memoria.ultima[0] == ahora[0]


def test_estado_operativo_retorna_sin_alerta_si_modelo_y_servicios_estan_bien():
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    repo = Mock()
    repo.modelo_vigente.return_value = NS(
        repositorio_hf="org/modelo",
        revision_sha="a" * 40,
        huella_pesos_sha256="b" * 64,
        desplegado_en=ahora,
        model_card_url=None,
    )
    servicio, _, _ = _servicio_estado([Chequeo("APP_WEB", "Web", lambda: None)], repo=repo)
    assert servicio.consultar().alerta is None


def test_estado_operativo_clasifica_chequeo_que_excede_su_timeout(monkeypatch):
    class FuturoAgotado:
        def result(self, timeout):
            raise estado_mod.TiempoAgotado()

    class Executor:
        def __init__(self, max_workers):
            self.max_workers = max_workers

        def submit(self, fn, chequeo):
            return FuturoAgotado()

        def shutdown(self, **kwargs):
            self.shutdown_args = kwargs

    monkeypatch.setattr(estado_mod, "ThreadPoolExecutor", Executor)
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    servicio, _, _ = _servicio_estado(
        [Chequeo("COLGADO", "Servicio colgado", lambda: None)], reloj=lambda: ahora
    )
    resultado = servicio._medir()[0]
    assert resultado.estado is EstadoServicio.SIN_RESPUESTA
    assert resultado.tiempo_respuesta_ms is None and resultado.dato is None


def test_estado_operativo_modelo_alertas_error_lentitud_y_revision_space(monkeypatch):
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    repo = Mock()
    repo.modelo_vigente.return_value = NS(
        repositorio_hf="org/modelo",
        revision_sha="b" * 40,
        huella_pesos_sha256="c" * 64,
        desplegado_en=ahora,
        model_card_url=None,
    )
    chequeos = [
        Chequeo(INFERENCIA_VISION, "Vision", lambda: "d" * 40),
        Chequeo("CORREO", "Correo", lambda: None),
        Chequeo("CAIDO", "Caído", lambda: (_ for _ in ()).throw(ValueError("secreto"))),
    ]
    servicio, _, _ = _servicio_estado(chequeos, repo=repo, reloj=lambda: ahora)
    salida = servicio.consultar()
    assert salida.modelo_desplegado.revision_space == "d" * 40
    assert not salida.modelo_desplegado.coincide_con_configuracion
    assert salida.alerta.nivel == "ERROR"
    assert "Caído" in salida.alerta.mensaje and "ValueError" not in salida.alerta.mensaje

    repo.modelo_vigente.return_value.revision_sha = "a" * 40
    repo.modelo_vigente.return_value.model_card_url = "https://example.invalid/model-card"
    ticks = iter([10.0, 12.01])
    monkeypatch.setattr("app.services.estado_operativo.time.perf_counter", lambda: next(ticks))
    lenta = Chequeo("LENTO", "Lento", lambda: None)
    servicio, _, _ = _servicio_estado([lenta], repo=repo, reloj=lambda: ahora)
    # El resultado del chequeo lento se mide con reloj real y genera advertencia.
    salida = servicio.consultar()
    assert salida.servicios[0].estado is EstadoServicio.LENTO
    assert salida.alerta == Alerta("ADVERTENCIA", "Responden con lentitud: Lento.")


def _admin(estado=EstadoUsuario.ACTIVO, rol=CodigoRol.ADMINISTRADOR):
    return NS(
        id=UUID(int=9),
        rol=NS(codigo=rol),
        estado=estado,
        correo="admin@example.invalid",
        totp_secreto_cifrado=b"secreto",
        totp_vinculado_en=1,
        totp_ultimo_paso=2,
        intentos_fallidos=5,
        bloqueado_hasta=3,
        temporal_expira_en=None,
        hash_contrasena="anterior",
        contrasena_temporal=False,
    )


def _recuperacion(admin, credenciales=None, otros=0):
    usuarios, sesiones, publicador, unidad = Mock(), Mock(), Mock(), Mock()
    usuarios.por_correo.return_value = admin
    usuarios.otros_administradores_activos.return_value = otros
    credenciales = credenciales or Mock()
    credenciales.emitir.return_value = NS(estado=EstadoEnvio.ENVIADO)
    ahora = datetime(2026, 11, 20, tzinfo=UTC)
    servicio = ServicioRecuperacionAdmin(
        usuarios, sesiones, credenciales, publicador, unidad, lambda: ahora
    )
    return servicio, usuarios, sesiones, credenciales, publicador, unidad, ahora


def test_recuperar_admin_envia_correo_normaliza_correo_y_limpia_segundo_factor():
    admin = _admin()
    servicio, usuarios, sesiones, credenciales, publicador, unidad, ahora = _recuperacion(admin)
    salida = servicio.recuperar("  ADMIN@EXAMPLE.INVALID ")
    assert salida.correo == "admin@example.invalid" and salida.correo_enviado
    assert salida.temporal is None and admin.estado is EstadoUsuario.ACTIVO
    assert admin.totp_secreto_cifrado is None and admin.totp_vinculado_en is None
    assert admin.totp_ultimo_paso is None and admin.intentos_fallidos == 0
    assert admin.bloqueado_hasta is None
    sesiones.cerrar_todas.assert_called_once_with(admin.id, ahora)
    credenciales.emitir.assert_called_once()
    unidad.confirmar.assert_called_once()
    assert publicador.publicar.call_args.args[0].detalle == {
        "origen": "SERVIDOR",
        "entrega": "CORREO",
    }


def test_recuperar_admin_muestra_temporal_sin_correo(monkeypatch):
    admin = _admin()
    monkeypatch.setattr(
        recuperacion_mod, "generar_contrasena_temporal", lambda: "Temporal-Sintetica"
    )
    monkeypatch.setattr(recuperacion_mod, "hashear_contrasena", lambda value: "hash:" + value)
    servicio, _, sesiones, credenciales, publicador, unidad, ahora = _recuperacion(admin)
    salida = servicio.recuperar("admin@example.invalid", mostrar_en_pantalla=True)
    assert salida.temporal == "Temporal-Sintetica" and not salida.correo_enviado
    assert admin.hash_contrasena == "hash:Temporal-Sintetica" and admin.contrasena_temporal
    assert admin.temporal_expira_en > ahora
    credenciales.emitir.assert_not_called()
    sesiones.cerrar_todas.assert_called_once()
    assert publicador.publicar.call_args.args[0].detalle["entrega"] == "PANTALLA"
    unidad.confirmar.assert_called_once()


@pytest.mark.parametrize(
    "admin,otros,fragmento",
    [
        (None, 0, "No hay un administrador"),
        (_admin(rol=CodigoRol.DOCTOR), 0, "No hay un administrador"),
        (_admin(estado=EstadoUsuario.INACTIVO), 0, "no se puede recuperar"),
        (_admin(), 1, "Hay otro administrador activo"),
    ],
)
def test_recuperar_admin_rechaza_casos_no_permitidos(admin, otros, fragmento):
    servicio, usuarios, sesiones, credenciales, publicador, unidad, _ = _recuperacion(
        admin, otros=otros
    )
    with pytest.raises(ErrorRecuperacion, match=fragmento):
        servicio.recuperar("ADMIN@example.invalid")
    unidad.confirmar.assert_not_called()
    publicador.publicar.assert_not_called()
    if (
        admin is not None
        and admin.rol.codigo is CodigoRol.ADMINISTRADOR
        and admin.estado is EstadoUsuario.ACTIVO
    ):
        usuarios.tomar_candado_administradores.assert_called_once()
    sesiones.cerrar_todas.assert_not_called()
    credenciales.emitir.assert_not_called()
