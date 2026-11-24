"""Pruebas QA de configuracion de inferencia, RF-A01 y RNF-20."""

from decimal import Decimal
from types import SimpleNamespace as NS
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.core.errores import ErrorApi
from app.models import AccionBitacora
from app.services.configuracion_inferencia import (
    CambioUmbral,
    NuevaConfiguracion,
    ServicioConfiguracionInferencia,
)


@pytest.fixture
def escenario():
    caracteristicas = [
        NS(id=1, codigo="GASTRITIS", umbral=Decimal("0.40")),
        NS(id=2, codigo="ATROFIA", umbral=Decimal("0.60")),
    ]

    config = NS(
        usar_umbral_por_caracteristica=False,
        umbral_global=Decimal("0.50"),
        actualizador=None,
    )

    catalogo = Mock()
    catalogo.configuracion.return_value = config
    catalogo.caracteristicas_activas.return_value = caracteristicas

    publicador = Mock()
    unidad = Mock()

    servicio = ServicioConfiguracionInferencia(
        catalogo, publicador, unidad
    )

    return NS(
        servicio=servicio,
        catalogo=catalogo,
        publicador=publicador,
        unidad=unidad,
        config=config,
        caracteristicas=caracteristicas,
        actor=NS(id=UUID(int=7)),
    )


def nueva(global_="0.50", por_caracteristica=False, cambios=None):
    return NuevaConfiguracion(
        usar_umbral_por_caracteristica=por_caracteristica,
        umbral_global=Decimal(global_),
        umbrales=cambios or [],
    )


def test_consulta_configuracion(escenario):
    vista = escenario.servicio.ver()
    assert vista.configuracion is escenario.config
    assert len(vista.caracteristicas) == 2


def test_politica_global(escenario):
    politica = escenario.servicio.politica()
    assert politica.umbral_para("GASTRITIS") == Decimal("0.50")
    assert politica.umbral_para("ATROFIA") == Decimal("0.50")


def test_politica_por_caracteristica_y_respaldo(escenario):
    escenario.config.usar_umbral_por_caracteristica = True
    escenario.caracteristicas[1].umbral = None

    politica = escenario.servicio.politica()

    assert politica.umbral_para("GASTRITIS") == Decimal("0.40")
    assert politica.umbral_para("ATROFIA") == Decimal("0.50")


def test_consulta_sin_configuracion(escenario):
    escenario.catalogo.configuracion.return_value = None

    with pytest.raises(RuntimeError, match="ConfiguracionInferencia"):
        escenario.servicio.ver()


def test_actualizacion_sin_configuracion(escenario):
    escenario.catalogo.configuracion.return_value = None

    with pytest.raises(RuntimeError, match="ConfiguracionInferencia"):
        escenario.servicio.actualizar(
            nueva(), escenario.actor, None
        )

    escenario.unidad.confirmar.assert_not_called()


@pytest.mark.parametrize(
    "caso,campo",
    [
        ("global_bajo", "umbral_global"),
        ("global_alto", "umbral_global"),
        ("caracteristica", "umbrales[0].umbral"),
        ("identificador", "umbrales[0].caracteristica_id"),
    ],
)
def test_rechaza_umbrales_invalidos(escenario, caso, campo):
    cambios = []
    global_ = "0.50"

    if caso == "global_bajo":
        global_ = "0.09"
    if caso == "global_alto":
        global_ = "0.91"
    if caso == "caracteristica":
        cambios = [CambioUmbral(1, Decimal("0.95"))]
    if caso == "identificador":
        cambios = [CambioUmbral(99, Decimal("0.50"))]

    with pytest.raises(ErrorApi) as error:
        escenario.servicio.actualizar(
            nueva(global_, cambios=cambios),
            escenario.actor,
            None,
        )

    assert error.value.estado == 422
    assert error.value.codigo == "UMBRAL_FUERA_DE_RANGO"
    assert campo in {
        item["campo"] for item in error.value.campos
    }

    escenario.unidad.confirmar.assert_not_called()
    escenario.publicador.publicar.assert_not_called()


def test_rechaza_umbrales_incompletos(escenario):
    with pytest.raises(ErrorApi) as error:
        escenario.servicio.actualizar(
            nueva(
                por_caracteristica=True,
                cambios=[CambioUmbral(1, Decimal("0.40"))],
            ),
            escenario.actor,
            None,
        )

    assert error.value.estado == 422
    assert error.value.codigo == "UMBRALES_INCOMPLETOS"
    escenario.unidad.confirmar.assert_not_called()


def test_actualizacion_valida_registra_auditoria(escenario):
    resultado = escenario.servicio.actualizar(
        nueva(
            "0.50555",
            por_caracteristica=True,
            cambios=[
                CambioUmbral(1, Decimal("0.21555")),
                CambioUmbral(2, Decimal("0.82")),
            ],
        ),
        escenario.actor,
        "127.0.0.1",
    )

    assert resultado.configuracion is escenario.config
    assert escenario.config.umbral_global == Decimal("0.5056")
    assert escenario.config.usar_umbral_por_caracteristica
    assert escenario.caracteristicas[0].umbral == Decimal("0.2156")
    assert escenario.caracteristicas[1].umbral == Decimal("0.8200")
    assert escenario.config.actualizador is escenario.actor

    escenario.publicador.publicar.assert_called_once()
    evento = escenario.publicador.publicar.call_args.args[0]

    assert evento.accion == AccionBitacora.CONFIGURACION_INFERENCIA_CAMBIADA
    assert evento.actor_id == escenario.actor.id
    assert evento.detalle["antes"]["umbral_global"] == "0.50"
    assert evento.detalle["despues"]["umbral_global"] == "0.5056"

    escenario.unidad.confirmar.assert_called_once()


def test_modo_global_acepta_umbral_individual_nulo(escenario):
    escenario.servicio.actualizar(
        nueva(cambios=[CambioUmbral(1, None)]),
        escenario.actor,
        None,
    )

    assert escenario.caracteristicas[0].umbral is None
    assert escenario.config.umbral_global == Decimal("0.5000")
    escenario.unidad.confirmar.assert_called_once()