"""RF-H02 #111: autorización, transacción y recuperación del PDF con dobles sintéticos."""

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock, call
from uuid import UUID

import pytest

from app.adapters.almacen import ErrorAlmacen
from app.core.errores import ErrorApi
from app.models import EstadoAnalisis
from app.services import reportes as modulo

DOCTOR_ID = UUID(int=41)
CASO_ID = UUID(int=42)
ANALISIS_ID = UUID(int=43)
REPORTE_ID = UUID(int=44)
AHORA = datetime(2026, 11, 24, 12, tzinfo=UTC)


@pytest.fixture
def entorno():
    repo, almacen, unidad = Mock(), Mock(), Mock()
    servicio = modulo.ServicioReportes(repo, almacen, unidad, reloj=lambda: AHORA)
    doctor = SimpleNamespace(id=DOCTOR_ID, nombre="Doctora", apellido="Sintética")
    return SimpleNamespace(repo=repo, almacen=almacen, unidad=unidad,
                           servicio=servicio, doctor=doctor)


def test_reporte_de_caso_ajeno_responde_404_sin_leer_ni_crear(entorno):
    entorno.repo.caso_es_mio.return_value = False

    with pytest.raises(ErrorApi) as error:
        entorno.servicio.generar(entorno.doctor, None, CASO_ID)

    assert (error.value.estado, error.value.codigo) == (404, "NO_ENCONTRADO")
    entorno.repo.caso_es_mio.assert_called_once_with(DOCTOR_ID, CASO_ID)
    entorno.repo.analisis_del_caso.assert_not_called()
    entorno.repo.crear.assert_not_called()
    entorno.almacen.subir.assert_not_called()


def test_analisis_ajeno_en_seleccion_responde_404_sin_crear(entorno):
    entorno.repo.analisis.return_value = []

    with pytest.raises(ErrorApi) as error:
        entorno.servicio.generar(entorno.doctor, [ANALISIS_ID], None)

    assert (error.value.estado, error.value.codigo) == (404, "NO_ENCONTRADO")
    entorno.repo.analisis.assert_called_once_with(DOCTOR_ID, [ANALISIS_ID])
    entorno.repo.crear.assert_not_called()
    entorno.almacen.subir.assert_not_called()


@pytest.mark.parametrize("estado", [EstadoAnalisis.PROCESANDO, EstadoAnalisis.FALLIDO])
def test_no_genera_reporte_de_analisis_sin_resultado(entorno, estado):
    entorno.repo.analisis.return_value = [SimpleNamespace(id=ANALISIS_ID, estado=estado)]

    with pytest.raises(ErrorApi) as error:
        entorno.servicio.generar(entorno.doctor, [ANALISIS_ID], None)

    assert (error.value.estado, error.value.codigo) == (422, "ANALISIS_SIN_RESULTADO")
    entorno.repo.crear.assert_not_called()
    entorno.almacen.subir.assert_not_called()


def _preparar_generacion(entorno, monkeypatch):
    analisis = SimpleNamespace(id=ANALISIS_ID, estado=EstadoAnalisis.COMPLETADO)
    entorno.repo.analisis.return_value = [analisis]
    reporte = SimpleNamespace(id=REPORTE_ID, generado_en=AHORA, archivo_clave_objeto=None)
    entorno.repo.crear.return_value = reporte

    class ConstructorSintetico:
        def encabezado(self, *_args, **_kwargs):
            return self

        def analisis(self, _datos):
            return self

        def construir(self):
            return b"%PDF-sintetico"

    monkeypatch.setattr(modulo, "ConstructorReporte", ConstructorSintetico)
    monkeypatch.setattr(modulo, "datos_de", lambda *_args: object())
    return reporte


def test_duplicado_se_genera_una_vez_y_confirma_tras_almacenar(entorno, monkeypatch):
    reporte = _preparar_generacion(entorno, monkeypatch)
    operaciones = Mock()
    entorno.almacen.subir.side_effect = lambda *_: operaciones.subir()
    entorno.unidad.confirmar.side_effect = lambda: operaciones.confirmar()

    generado = entorno.servicio.generar(entorno.doctor, [ANALISIS_ID, ANALISIS_ID], None)

    entorno.repo.analisis.assert_called_once_with(DOCTOR_ID, [ANALISIS_ID])
    entorno.repo.crear.assert_called_once_with(DOCTOR_ID, [ANALISIS_ID])
    entorno.almacen.subir.assert_called_once_with(
        f"reportes/{REPORTE_ID}.pdf", b"%PDF-sintetico", "application/pdf"
    )
    assert operaciones.mock_calls == [call.subir(), call.confirmar()]
    assert reporte.archivo_clave_objeto == f"reportes/{REPORTE_ID}.pdf"
    assert generado.reporte is reporte and generado.analisis == 1
    entorno.unidad.descartar.assert_not_called()


def test_fallo_de_almacen_descarta_y_no_confirma(entorno, monkeypatch):
    reporte = _preparar_generacion(entorno, monkeypatch)
    entorno.almacen.subir.side_effect = ErrorAlmacen("fallo sintético")

    with pytest.raises(ErrorApi) as error:
        entorno.servicio.generar(entorno.doctor, [ANALISIS_ID], None)

    assert (error.value.estado, error.value.codigo) == (503, "SERVICIO_NO_DISPONIBLE")
    assert "fallo sintético" not in error.value.mensaje
    assert reporte.archivo_clave_objeto is None
    entorno.unidad.descartar.assert_called_once_with()
    entorno.unidad.confirmar.assert_not_called()


@pytest.mark.parametrize("reporte", [None, SimpleNamespace(archivo_clave_objeto=None)])
def test_descarga_ajena_o_sin_archivo_responde_404(entorno, reporte):
    entorno.repo.del_doctor.return_value = reporte

    with pytest.raises(ErrorApi) as error:
        entorno.servicio.descargar(DOCTOR_ID, REPORTE_ID)

    assert (error.value.estado, error.value.codigo) == (404, "NO_ENCONTRADO")
    entorno.repo.del_doctor.assert_called_once_with(REPORTE_ID, DOCTOR_ID)
    entorno.almacen.leer.assert_not_called()


def test_descarga_almacen_fallido_no_expone_detalle(entorno):
    entorno.repo.del_doctor.return_value = SimpleNamespace(
        id=REPORTE_ID, archivo_clave_objeto=f"reportes/{REPORTE_ID}.pdf"
    )
    entorno.almacen.leer.side_effect = ErrorAlmacen("ruta interna sintética")

    with pytest.raises(ErrorApi) as error:
        entorno.servicio.descargar(DOCTOR_ID, REPORTE_ID)

    assert (error.value.estado, error.value.codigo) == (503, "SERVICIO_NO_DISPONIBLE")
    assert "ruta interna sintética" not in error.value.mensaje
    entorno.repo.primer_codigo.assert_not_called()


def test_descarga_autorizada_devuelve_pdf_y_nombre(entorno):
    clave = f"reportes/{REPORTE_ID}.pdf"
    entorno.repo.del_doctor.return_value = SimpleNamespace(id=REPORTE_ID,
                                                             archivo_clave_objeto=clave)
    entorno.almacen.leer.return_value = b"%PDF-sintetico"
    entorno.repo.primer_codigo.return_value = "A-2026-0043"

    pdf, nombre = entorno.servicio.descargar(DOCTOR_ID, REPORTE_ID)

    assert pdf == b"%PDF-sintetico" and nombre == "Reporte_GastroAI_A-2026-0043.pdf"
    entorno.almacen.leer.assert_called_once_with(clave)


def test_datos_del_reporte_ordenan_resultados_y_toleran_imagen_ausente(entorno):
    region = SimpleNamespace(orden=1, area_porcentaje=0.12,
                             mapa_calor_clave_objeto="mapa-sintetico")
    menor = SimpleNamespace(probabilidad=0.30, umbral_aplicado=0.70,
                            supera_umbral=False, caracteristica=SimpleNamespace(nombre="Menor"),
                            regiones=[])
    mayor = SimpleNamespace(probabilidad=0.82, umbral_aplicado=0.70,
                            supera_umbral=True, caracteristica=SimpleNamespace(nombre="Mayor"),
                            regiones=[region])
    otro_doctor = UUID(int=45)
    analisis = SimpleNamespace(
        codigo="A-2026-0043", solicitado_en=AHORA,
        doctor_ejecutor=SimpleNamespace(nombre="Otra", apellido="Doctora"),
        doctor_ejecutor_id=otro_doctor,
        modelo=SimpleNamespace(repositorio_hf="modelo-sintetico", revision_sha="abc1234567"),
        resultados=[menor, mayor], explicacion=None, observaciones=[],
        imagen_clave_objeto="imagen-sintetica",
    )

    def leer(clave):
        if clave == "imagen-sintetica":
            raise ErrorAlmacen("imagen ausente")
        assert clave == "mapa-sintetico"
        return b"mapa-sintetico"

    entorno.almacen.leer.side_effect = leer
    datos = modulo.datos_de(analisis, entorno.almacen, DOCTOR_ID)

    assert [fila.nombre for fila in datos.caracteristicas] == ["Mayor", "Menor"]
    assert datos.mapa_calor == b"mapa-sintetico" and datos.imagen is None
    assert datos.trasladado_de == "Otra Doctora"
    assert "paciente" not in vars(datos) and "documento" not in vars(datos)
    assert entorno.almacen.leer.mock_calls == [call("imagen-sintetica"), call("mapa-sintetico")]
