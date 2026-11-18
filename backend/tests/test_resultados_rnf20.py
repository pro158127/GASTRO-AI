"""RNF-20/#208: reglas de análisis y umbrales con dependencias simuladas."""
import socket
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.adapters.almacen import ErrorAlmacen
from app.adapters.cola import ErrorCola
from app.core.errores import ErrorApi
from app.models import Analisis, CasoPaciente, EstadoAnalisis, EtapaProceso, FormatoImagen
from app.models import ModeloDesplegado, Usuario
from app.services.analisis import CodigoFalla, ServicioAnalisis, SolicitudAnalisis, etapas_de
from app.services.politica_umbral import UmbralGlobal, UmbralPorCaracteristica, politica_desde, supera


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("No se permiten conexiones externas")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


@pytest.fixture
def escenario():
    doctor = Usuario(id=UUID(int=1))
    caso = CasoPaciente(id=UUID(int=2), doctor_asignado=doctor)
    a = Analisis(id=UUID(int=3), caso_id=caso.id, doctor_ejecutor_id=doctor.id,
        estado=EstadoAnalisis.FALLIDO, etapa_proceso=EtapaProceso.CLASIFICAR,
        codigo_error=CodigoFalla.SERVICIO_NO_DISPONIBLE.value,
        imagen_clave_objeto="analisis/sintetica.png", codigo="A-2026-000001")
    repo, imagenes, almacen, seudo, cola, unidad = [Mock() for _ in range(6)]
    repo.del_doctor.side_effect = lambda aid, did: a if aid == a.id and did == doctor.id else None
    repo.caso_del_doctor.return_value = caso
    repo.modelo_vigente.return_value = ModeloDesplegado(id=UUID(int=4))
    repo.siguiente_numero.return_value = 7
    seudo.actual.return_value = SimpleNamespace(valor="seudonimo-sintetico", version_clave=1)
    seudo.todos.return_value = ["seudonimo-sintetico"]
    imagenes.tomar.return_value = SimpleNamespace(clave="tmp/sintetica", formato=FormatoImagen.PNG,
        sha256="a" * 64, ancho=224, alto=224, peso_bytes=100)
    reloj = datetime(2026, 1, 1, 2, tzinfo=timezone.utc)
    servicio = ServicioAnalisis(repo, imagenes, almacen, seudo, cola, unidad, lambda: reloj)
    return SimpleNamespace(doctor=doctor, a=a, repo=repo, imagenes=imagenes, almacen=almacen,
        cola=cola, unidad=unidad, servicio=servicio, reloj=reloj,
        solicitud=SolicitudAnalisis("tmp_sintetica", "CC", "12345678", "12345678"))


def test_obtener_propio_usa_filtro_del_doctor(escenario):
    e = escenario
    detalle = e.servicio.obtener(e.doctor.id, e.a.id)
    assert detalle.analisis is e.a
    assert detalle.traslado is None
    e.repo.del_doctor.assert_called_once_with(e.a.id, e.doctor.id)
    e.repo.traslado_recibido.assert_not_called()


@pytest.mark.parametrize("operacion", ["obtener", "reintentar", "explicacion"])
@pytest.mark.parametrize("ajeno", [True, False], ids=["otro-medico", "inexistente"])
def test_acceso_no_autorizado_o_inexistente(escenario, operacion, ajeno):
    e = escenario
    doctor_id = UUID(int=99) if ajeno else e.doctor.id
    analisis_id = e.a.id if ajeno else UUID(int=99)
    with pytest.raises(ErrorApi) as error:
        getattr(e.servicio, operacion)(doctor_id, analisis_id)
    assert (error.value.estado, error.value.codigo) == (404, "NO_ENCONTRADO")
    e.repo.del_doctor.assert_called_once_with(analisis_id, doctor_id)
    e.unidad.confirmar.assert_not_called()
    e.cola.encolar_analisis.assert_not_called()


def test_obtener_caso_recibido_incluye_traslado(escenario):
    e = escenario
    e.a.doctor_ejecutor_id = UUID(int=10)
    traslado = object()
    e.repo.traslado_recibido.return_value = traslado
    assert e.servicio.obtener(e.doctor.id, e.a.id).traslado is traslado
    e.repo.traslado_recibido.assert_called_once_with(e.a.caso_id, e.doctor.id)


@pytest.mark.parametrize("estado,etapa,esperados", [
    (EstadoAnalisis.COMPLETADO, None, ["LISTO"] * 4),
    (EstadoAnalisis.PROCESANDO, None, ["PENDIENTE"] * 4),
    (EstadoAnalisis.FALLIDO, None, ["ERROR", "PENDIENTE", "PENDIENTE", "PENDIENTE"]),
] + [(estado, etapa, ["LISTO"] * i + [marca] + ["PENDIENTE"] * (3-i))
     for estado, marca in [(EstadoAnalisis.PROCESANDO, "EN_CURSO"), (EstadoAnalisis.FALLIDO, "ERROR")]
     for i, etapa in enumerate(EtapaProceso)])
def test_estados_visibles_de_las_etapas(estado, etapa, esperados):
    salida = etapas_de(SimpleNamespace(estado=estado, etapa_proceso=etapa))
    assert [codigo for codigo, _ in salida] == ["ANONIMIZAR", "CALIDAD", "CLASIFICAR", "GRAD_CAM"]
    assert [estado for _, estado in salida] == esperados


@pytest.mark.parametrize("valor", ["0.10", "0.50", "0.90"])
@pytest.mark.parametrize("por_caracteristica", [False, True])
def test_umbrales_validos_y_limites(valor, por_caracteristica):
    politica = politica_desde(por_caracteristica, Decimal(valor), {"A": Decimal(valor)})
    assert politica.umbral_para("A") == Decimal(valor)


@pytest.mark.parametrize("valor", ["0.0999", "0.9001"])
@pytest.mark.parametrize("modo", ["global", "especifico", "respaldo"])
def test_rechaza_umbrales_fuera_de_rango(valor, modo):
    with pytest.raises(ValueError):
        if modo == "global":
            UmbralGlobal(Decimal(valor))
        elif modo == "especifico":
            UmbralPorCaracteristica({"A": Decimal(valor)}, Decimal("0.5"))
        else:
            UmbralPorCaracteristica({"A": Decimal("0.5")}, Decimal(valor))


def test_umbral_especifico_respaldo_y_copia_de_configuracion():
    valores = {"A": Decimal("0.7"), "B": None}
    politica = politica_desde(True, Decimal("0.5"), valores)
    valores["A"] = Decimal("0.2")
    assert politica.umbral_para("A") == Decimal("0.7")
    assert politica.umbral_para("B") == politica.umbral_para("NO_CONFIGURADA") == Decimal("0.5")
    assert politica_desde(False, Decimal("0.5"), valores).umbral_para("A") == Decimal("0.5")


@pytest.mark.parametrize("probabilidad,resultado", [("0.4999", False), ("0.5", True), ("0.5001", True)])
def test_probabilidad_igual_o_cercana_al_umbral(probabilidad, resultado):
    assert supera(Decimal(probabilidad), Decimal("0.5")) is resultado


@pytest.mark.parametrize("codigo", [CodigoFalla.SERVICIO_NO_DISPONIBLE,
    CodigoFalla.COLA_NO_DISPONIBLE, CodigoFalla.ERROR_INTERNO])
def test_reintento_permitido_conserva_imagen_y_codigo(escenario, codigo):
    e = escenario
    e.a.codigo_error = codigo.value
    resultado = e.servicio.reintentar(e.doctor.id, e.a.id)
    assert resultado is e.a
    assert (e.a.estado, e.a.etapa_proceso, e.a.codigo_error) == (EstadoAnalisis.PROCESANDO, None, None)
    assert (e.a.codigo, e.a.imagen_clave_objeto) == ("A-2026-000001", "analisis/sintetica.png")
    e.cola.encolar_analisis.assert_called_once_with(e.a.id)
    e.unidad.confirmar.assert_called_once()
    e.almacen.copiar.assert_not_called()


@pytest.mark.parametrize("estado,codigo", [(EstadoAnalisis.PROCESANDO, None),
    (EstadoAnalisis.COMPLETADO, None), (EstadoAnalisis.FALLIDO, CodigoFalla.CALIDAD_INSUFICIENTE.value)])
def test_reintento_rechazado_no_muta(escenario, estado, codigo):
    e = escenario
    e.a.estado, e.a.codigo_error = estado, codigo
    with pytest.raises(ErrorApi) as error:
        e.servicio.reintentar(e.doctor.id, e.a.id)
    assert (error.value.estado, error.value.codigo) == (409, "NO_REINTENTABLE")
    assert (e.a.estado, e.a.codigo_error) == (estado, codigo)
    e.unidad.confirmar.assert_not_called()
    e.cola.encolar_analisis.assert_not_called()


def test_reintento_con_cola_caida_persiste_fallo(escenario):
    e = escenario
    e.cola.encolar_analisis.side_effect = ErrorCola("simulado")
    with pytest.raises(ErrorApi) as error:
        e.servicio.reintentar(e.doctor.id, e.a.id)
    assert (error.value.estado, error.value.codigo) == (503, "SERVICIO_NO_DISPONIBLE")
    assert (e.a.estado, e.a.etapa_proceso, e.a.codigo_error) == (
        EstadoAnalisis.FALLIDO, EtapaProceso.ANONIMIZAR, CodigoFalla.COLA_NO_DISPONIBLE.value)
    assert e.unidad.confirmar.call_count == 2


@pytest.mark.parametrize("formato,extension", [(FormatoImagen.PNG, "png"), (FormatoImagen.JPEG, "jpg")])
def test_solicitud_guarda_y_encola_analisis(escenario, formato, extension):
    e = escenario
    e.imagenes.tomar.return_value.formato = formato
    resultado = e.servicio.solicitar(e.doctor, e.solicitud)
    assert resultado.estado == EstadoAnalisis.PROCESANDO
    assert resultado.codigo == "A-2025-000007"  # 02:00 UTC aún es 31 de diciembre en Colombia.
    assert resultado.imagen_clave_objeto.endswith("." + extension)
    e.almacen.copiar.assert_called_once_with("tmp/sintetica", resultado.imagen_clave_objeto)
    e.almacen.borrar.assert_called_once_with("tmp/sintetica")
    e.unidad.confirmar.assert_called_once()
    e.cola.encolar_analisis.assert_called_once_with(resultado.id)


def test_modelo_no_disponible_no_almacena_ni_encola(escenario):
    e = escenario
    e.repo.modelo_vigente.return_value = None
    with pytest.raises(ErrorApi) as error:
        e.servicio.solicitar(e.doctor, e.solicitud)
    assert (error.value.estado, error.value.codigo) == (503, "SERVICIO_NO_DISPONIBLE")
    e.almacen.copiar.assert_not_called()
    e.repo.agregar.assert_not_called()
    e.unidad.confirmar.assert_not_called()
    e.cola.encolar_analisis.assert_not_called()


def test_error_copia_se_propaga_sin_guardar_analisis(escenario):
    e = escenario
    e.almacen.copiar.side_effect = ErrorAlmacen("simulado")
    with pytest.raises(ErrorAlmacen):
        e.servicio.solicitar(e.doctor, e.solicitud)
    e.repo.agregar.assert_not_called()
    e.unidad.confirmar.assert_not_called()
    e.cola.encolar_analisis.assert_not_called()


def test_error_borrado_temporal_permite_continuar(escenario):
    e = escenario
    e.almacen.borrar.side_effect = ErrorAlmacen("simulado")
    resultado = e.servicio.solicitar(e.doctor, e.solicitud)
    assert resultado.estado == EstadoAnalisis.PROCESANDO
    e.cola.encolar_analisis.assert_called_once_with(resultado.id)


def test_solicitud_con_cola_caida_conserva_analisis_fallido(escenario):
    e = escenario
    e.cola.encolar_analisis.side_effect = ErrorCola("simulado")
    with pytest.raises(ErrorApi) as error:
        e.servicio.solicitar(e.doctor, e.solicitud)
    assert error.value.estado == 503
    guardado = e.repo.agregar.call_args.args[0]
    assert guardado.estado == EstadoAnalisis.FALLIDO
    assert guardado.codigo_error == CodigoFalla.COLA_NO_DISPONIBLE.value
    assert e.unidad.confirmar.call_count == 2


@pytest.mark.parametrize("confirmacion", [None, "87654321", "12345678"])
def test_nuevo_caso_exige_confirmacion(escenario, confirmacion):
    e = escenario
    e.repo.caso_del_doctor.return_value = None
    solicitud = SolicitudAnalisis("tmp_sintetica", "CC", "12345678", confirmacion)
    if confirmacion == "12345678":
        resultado = e.servicio.solicitar(e.doctor, solicitud)
        assert resultado.caso.seudonimo == "seudonimo-sintetico"
        assert resultado.caso.doctor_asignado is e.doctor
    else:
        with pytest.raises(ErrorApi) as error:
            e.servicio.solicitar(e.doctor, solicitud)
        assert (error.value.estado, error.value.codigo) == (422, "DOCUMENTO_NO_COINCIDE")
        e.almacen.copiar.assert_not_called()
