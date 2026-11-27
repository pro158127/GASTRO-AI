"""RNF-20: orquestación del wrapper Celery, sin broker, Space ni Gemini reales."""

from types import SimpleNamespace as NS
from unittest.mock import MagicMock, Mock, call
from uuid import UUID

import pytest

from app.adapters.cola import TAREA_EXPLICAR_ANALISIS, TAREA_PROCESAR_ANALISIS
from app.workers import tareas

ID = UUID("12345678-1234-5678-9abc-123456789abc")


@pytest.fixture
def piezas(monkeypatch):
    settings = NS(redis_url="redis://redis:6379/0")
    db = object()
    context = MagicMock()
    context.__enter__.return_value = db
    session = Mock(return_value=context)
    storage = object()
    inference = object()
    analyses = object()
    catalogue = Mock()
    catalogue.caracteristicas_activas.return_value = [NS(codigo="ATROFIA")]
    unit = object()
    classifier = object()
    processor = Mock()
    explanation = Mock()
    deliveries = Mock()
    deliveries.sumar.return_value = 1
    delivery_factory = Mock()
    delivery_factory.desde_url.return_value = deliveries
    mocks = {
        "settings": Mock(return_value=settings),
        "session": session,
        "storage": Mock(return_value=storage),
        "inference": Mock(return_value=inference),
        "analyses": Mock(return_value=analyses),
        "catalogue": Mock(return_value=catalogue),
        "unit": Mock(return_value=unit),
        "classifier": Mock(return_value=classifier),
        "processor": Mock(return_value=processor),
        "explanation": Mock(return_value=explanation),
        "delivery_factory": delivery_factory,
    }
    for name, target in (
        ("get_settings", "settings"), ("SessionLocal", "session"),
        ("ContadorEntregasRedis", "delivery_factory"),
        ("crear_almacen", "storage"), ("crear_inferencia", "inference"),
        ("RepositorioAnalisis", "analyses"), ("RepositorioCatalogo", "catalogue"),
        ("UnidadTrabajo", "unit"), ("ServicioClasificacion", "classifier"),
        ("ServicioProcesamiento", "processor"), ("_explicaciones", "explanation"),
    ):
        monkeypatch.setattr(tareas, name, mocks[target])
    return NS(**mocks, db=db, context=context, settings_value=settings,
              deliveries=deliveries,
              storage_value=storage, inference_value=inference,
              analyses_value=analyses, catalogue_value=catalogue, unit_value=unit,
              classifier_value=classifier, processor_value=processor,
              explanation_value=explanation)


def test_registro_de_tareas_y_reconocimiento_tardio():
    assert tareas.procesar_analisis.name == TAREA_PROCESAR_ANALISIS
    assert tareas.explicar_analisis.name == TAREA_EXPLICAR_ANALISIS
    assert tareas.procesar_analisis.acks_late is True
    assert tareas.explicar_analisis.acks_late is True


def test_procesamiento_usa_uuid_y_explicacion_despues_del_resultado(piezas):
    orden = Mock()
    orden.attach_mock(piezas.processor_value.procesar, "procesar")
    orden.attach_mock(piezas.explanation_value.generar, "explicar")
    tareas.procesar_analisis.run(str(ID))
    piezas.session.assert_called_once_with()
    piezas.storage.assert_called_once_with(piezas.settings_value)
    piezas.catalogue_value.caracteristicas_activas.assert_called_once_with()
    piezas.inference.assert_called_once_with(piezas.settings_value, ("ATROFIA",))
    piezas.classifier.assert_called_once_with(
        piezas.inference_value, piezas.storage_value, piezas.analyses_value,
        piezas.catalogue_value, piezas.unit_value,
    )
    piezas.processor.assert_called_once_with(
        piezas.analyses_value, piezas.storage_value, piezas.unit_value,
        piezas.classifier_value,
    )
    piezas.delivery_factory.desde_url.assert_called_once_with(piezas.settings_value.redis_url)
    piezas.deliveries.sumar.assert_called_once_with(ID)
    piezas.processor_value.procesar.assert_called_once_with(ID, 1)
    piezas.explanation.assert_called_once_with(piezas.db)
    piezas.explanation_value.generar.assert_called_once_with(ID)
    piezas.deliveries.olvidar.assert_called_once_with(ID)
    assert orden.mock_calls == [call.procesar(ID, 1), call.explicar(ID)]
    piezas.context.__exit__.assert_called_once_with(None, None, None)


def test_fallo_de_procesamiento_no_inicia_explicacion_y_cierra_sesion(piezas):
    failure = RuntimeError("fallo sintetico del procesamiento")
    piezas.processor_value.procesar.side_effect = failure
    with pytest.raises(RuntimeError) as raised:
        tareas.procesar_analisis.run(str(ID))
    assert raised.value is failure
    piezas.explanation.assert_not_called()
    piezas.deliveries.olvidar.assert_not_called()
    args = piezas.context.__exit__.call_args.args
    assert args[0] is RuntimeError and args[1] is failure


def test_tarea_de_explicacion_independiente_cierra_sesion(piezas):
    tareas.explicar_analisis.run(str(ID))
    piezas.explanation.assert_called_once_with(piezas.db)
    piezas.explanation_value.generar.assert_called_once_with(ID)
    piezas.context.__exit__.assert_called_once_with(None, None, None)
    piezas.processor.assert_not_called()


def test_fabrica_explicacion_usa_modelo_y_dependencias_locales(monkeypatch):
    db = object()
    settings = NS(llm_modelo="modelo-sintetico")
    analyses, llm, unit, service = (object() for _ in range(4))
    get_settings = Mock(return_value=settings)
    repo = Mock(return_value=analyses)
    adapter = Mock(return_value=llm)
    work = Mock(return_value=unit)
    factory = Mock(return_value=service)
    for name, mock in (
        ("get_settings", get_settings), ("RepositorioAnalisis", repo),
        ("crear_adaptador_llm", adapter), ("UnidadTrabajo", work),
        ("ServicioExplicaciones", factory),
    ):
        monkeypatch.setattr(tareas, name, mock)
    assert tareas._explicaciones(db) is service
    repo.assert_called_once_with(db)
    adapter.assert_called_once_with(settings)
    work.assert_called_once_with(db)
    factory.assert_called_once_with(analyses, llm, unit, "modelo-sintetico")
