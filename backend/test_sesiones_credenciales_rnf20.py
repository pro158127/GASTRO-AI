"""RNF-20 #139/#208: repositorios simulados, sin persistencia SQL ni SMTP real.

Complementa los 277 casos existentes: consultas de repositorio, emisión y errores.
Las consultas se compilan para PostgreSQL; no se ejecutan en una base de datos.
"""
import socket
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, call
from uuid import UUID

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.adapters.correo import ErrorCorreo
from app.core.errores import ErrorApi
from app.core.seguridad import hash_token
from app.models import (EstadoEnvio, EstadoUsuario, EtapaSesion, MotivoCredencial,
                        ResultadoAccion, Sesion, Usuario)
from app.repositories.credenciales_repository import RepositorioCredenciales
from app.repositories.sesiones_repository import RepositorioSesiones
from app.services import credenciales as mod
from app.services.autenticacion import ReglasSesion, ServicioAutenticacion

AHORA = datetime(2026, 1, 1, 12, tzinfo=timezone.utc)
USUARIO_ID = UUID(int=1)


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("No se permiten servicios externos")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


def compilada(consulta):
    return consulta.compile(dialect=postgresql.dialect())


@pytest.mark.parametrize("etapa", list(EtapaSesion))
def test_crear_sesion_conserva_hash_propietario_y_etapa(etapa):
    db = Mock(spec=Session)
    digest = hash_token("token-sintetico-no-utilizable")
    sesion = RepositorioSesiones(db).crear(USUARIO_ID, etapa, digest, "192.0.2.1")
    assert (sesion.usuario_id, sesion.etapa, sesion.token_hash, sesion.ip) == (
        USUARIO_ID, etapa, digest, "192.0.2.1")
    assert db.mock_calls == [call.add(sesion), call.flush()]
    db.commit.assert_not_called()


@pytest.mark.parametrize("filas,esperado", [(3, 3), (0, 0), (None, 0)])
def test_revocacion_filtra_usuario_y_solo_sesiones_abiertas(filas, esperado):
    db = Mock(spec=Session)
    db.execute.return_value.rowcount = filas
    assert RepositorioSesiones(db).cerrar_todas(USUARIO_ID, AHORA) == esperado
    consulta = compilada(db.execute.call_args.args[0])
    sql = str(consulta)
    assert '"Sesion".usuario_id =' in sql
    assert '"Sesion".cerrada_en IS NULL' in sql
    assert consulta.params == {"cerrada_en": AHORA, "usuario_id_1": USUARIO_ID}
    db.commit.assert_not_called()


@pytest.mark.parametrize("cerrada", [False, True])
def test_busqueda_por_hash_trae_usuario_rol_y_no_oculta_sesion_revocada(cerrada):
    db = Mock(spec=Session)
    sesion = Sesion(token_hash="hash-sintetico", cerrada_en=AHORA if cerrada else None)
    db.scalar.return_value = sesion
    assert RepositorioSesiones(db).por_token_hash("hash-sintetico") is sesion
    consulta = compilada(db.scalar.call_args.args[0])
    sql = str(consulta)
    assert 'LEFT OUTER JOIN "Usuario"' in sql and 'LEFT OUTER JOIN "Rol"' in sql
    assert '"Sesion".token_hash =' in sql
    assert consulta.params == {"token_hash_1": "hash-sintetico"}
    assert 'cerrada_en IS NULL' not in sql  # el servicio decide si está cerrada


def test_hash_inexistente_devuelve_none():
    db = Mock(spec=Session)
    db.scalar.return_value = None
    assert RepositorioSesiones(db).por_token_hash("hash-inexistente") is None


@pytest.mark.parametrize("operacion", ["crear", "cerrar", "buscar"])
def test_error_repositorio_sesiones_no_se_convierte_en_exito(operacion):
    db = Mock(spec=Session)
    error = SQLAlchemyError("fallo simulado")
    repo = RepositorioSesiones(db)
    db.flush.side_effect = db.execute.side_effect = db.scalar.side_effect = error
    with pytest.raises(SQLAlchemyError) as obtenido:
        if operacion == "crear":
            repo.crear(USUARIO_ID, EtapaSesion.ACTIVA, "hash", None)
        elif operacion == "cerrar":
            repo.cerrar_todas(USUARIO_ID, AHORA)
        else:
            repo.por_token_hash("hash")
    assert obtenido.value is error


@pytest.mark.parametrize("estado,codigo", [(EstadoEnvio.ENVIADO, None), (EstadoEnvio.FALLIDO, "CORREO_NO_ENVIADO")])
def test_registro_envio_preserva_estado_y_refresca_fecha(estado, codigo):
    db = Mock(spec=Session)
    def refrescar(envio, campos):
        assert campos == ["intentado_en"]
        envio.intentado_en = AHORA
    db.refresh.side_effect = refrescar
    envio = RepositorioCredenciales(db).registrar(USUARIO_ID, MotivoCredencial.CREACION, estado, codigo)
    assert (envio.usuario_id, envio.motivo, envio.estado, envio.codigo_error, envio.intentado_en) == (
        USUARIO_ID, MotivoCredencial.CREACION, estado, codigo, AHORA)
    assert db.mock_calls == [call.add(envio), call.flush(), call.refresh(envio, ["intentado_en"])]


@pytest.mark.parametrize("cantidad", [None, 0, 1, 5])
def test_historial_filtra_usuario_ordena_y_limita(cantidad):
    db = Mock(spec=Session)
    elementos = [object()] if cantidad != 0 else []
    db.scalars.return_value = iter(elementos)
    repo = RepositorioCredenciales(db)
    obtenido = repo.recientes(USUARIO_ID) if cantidad is None else repo.recientes(USUARIO_ID, cantidad)
    assert obtenido == elementos
    consulta = compilada(db.scalars.call_args.args[0])
    assert '"EnvioCredencial".usuario_id =' in str(consulta)
    assert 'ORDER BY "EnvioCredencial".intentado_en DESC, "EnvioCredencial".id DESC' in str(consulta)
    assert consulta.params == {"usuario_id_1": USUARIO_ID, "param_1": 5 if cantidad is None else cantidad}


@pytest.mark.parametrize("operacion", ["flush", "refresh", "lectura"])
def test_error_historial_se_propaga(operacion):
    db = Mock(spec=Session)
    error = SQLAlchemyError("fallo simulado")
    getattr(db, "scalars" if operacion == "lectura" else operacion).side_effect = error
    repo = RepositorioCredenciales(db)
    with pytest.raises(SQLAlchemyError) as obtenido:
        if operacion == "lectura":
            repo.recientes(USUARIO_ID)
        else:
            repo.registrar(USUARIO_ID, MotivoCredencial.CREACION, EstadoEnvio.ENVIADO, None)
    assert obtenido.value is error


@pytest.fixture
def emision(monkeypatch):
    generador = Mock(return_value="temporal-sintetica-no-real")
    hasher = Mock(return_value="hash-sintetico-nuevo")
    monkeypatch.setattr(mod, "generar_contrasena_temporal", generador)
    monkeypatch.setattr(mod, "hashear_contrasena", hasher)
    usuario = Usuario(id=USUARIO_ID, nombre="Prueba", correo="prueba@example.invalid",
        hash_contrasena="hash-anterior", contrasena_temporal=False,
        temporal_expira_en=AHORA-timedelta(days=1), estado=EstadoUsuario.PENDIENTE)
    repo, correo, eventos = Mock(), Mock(), Mock()
    servicio = mod.ServicioCredenciales(repo, correo, eventos, lambda: AHORA)
    return SimpleNamespace(usuario=usuario, actor=Usuario(id=UUID(int=2)), repo=repo,
        correo=correo, eventos=eventos, servicio=servicio, generador=generador, hasher=hasher)


@pytest.mark.parametrize("motivo", list(MotivoCredencial))
def test_emision_reemplaza_temporal_vence_72h_y_audita_sin_secreto(emision, motivo, caplog):
    e = emision
    obtenido = e.servicio.emitir(e.usuario, motivo, e.actor, "192.0.2.2")
    assert obtenido is e.repo.registrar.return_value
    assert (e.usuario.hash_contrasena, e.usuario.contrasena_temporal, e.usuario.temporal_expira_en) == (
        "hash-sintetico-nuevo", True, AHORA+timedelta(hours=72))
    e.hasher.assert_called_once_with(e.generador.return_value)
    destino, asunto, texto = e.correo.enviar.call_args.args
    assert destino == "prueba@example.invalid" and asunto == mod.ASUNTOS[motivo]
    assert e.generador.return_value in texto and "2026-01-04 12:00 (UTC)" in texto
    e.repo.registrar.assert_called_once_with(USUARIO_ID, motivo, EstadoEnvio.ENVIADO, None)
    evento = e.eventos.publicar.call_args.args[0]
    assert evento.resultado == ResultadoAccion.EXITO
    assert evento.detalle == {"motivo": motivo.value}
    assert (evento.actor_id, evento.entidad_id, evento.ip) == (e.actor.id, str(USUARIO_ID), "192.0.2.2")
    assert e.generador.return_value not in repr(evento) + caplog.text


def test_fallo_correo_registra_fallo_sin_cambiar_estado_cuenta(emision, caplog):
    e = emision
    e.correo.enviar.side_effect = ErrorCorreo("fallo sintético")
    e.servicio.emitir(e.usuario, MotivoCredencial.CREACION, e.actor, None)
    e.repo.registrar.assert_called_once_with(USUARIO_ID, MotivoCredencial.CREACION, EstadoEnvio.FALLIDO, "CORREO_NO_ENVIADO")
    assert e.eventos.publicar.call_args.args[0].resultado == ResultadoAccion.FALLO
    assert e.usuario.estado == EstadoUsuario.PENDIENTE
    assert e.usuario.hash_contrasena == "hash-sintetico-nuevo"
    assert e.generador.return_value not in caplog.text


def test_error_hash_no_envia_ni_registra_credencial(emision):
    e = emision
    e.hasher.side_effect = RuntimeError("hash no disponible")
    with pytest.raises(RuntimeError, match="hash no disponible"):
        e.servicio.emitir(e.usuario, MotivoCredencial.CREACION, e.actor, None)
    assert e.usuario.hash_contrasena == "hash-anterior"
    e.correo.enviar.assert_not_called()
    e.repo.registrar.assert_not_called()
    e.eventos.publicar.assert_not_called()


def test_error_registro_no_publica_exito(emision):
    e = emision
    e.repo.registrar.side_effect = SQLAlchemyError("registro no disponible")
    with pytest.raises(SQLAlchemyError):
        e.servicio.emitir(e.usuario, MotivoCredencial.CREACION, e.actor, None)
    e.eventos.publicar.assert_not_called()


def test_hash_debe_flushearse_antes_de_enviar_segun_contrato(emision):
    """El docstring de credenciales.py promete flush antes del correo, no después."""
    e = emision
    db = Mock(spec=Session)
    servicio = mod.ServicioCredenciales(RepositorioCredenciales(db), e.correo, e.eventos, lambda: AHORA)
    flush_antes_del_correo = []
    e.correo.enviar.side_effect = lambda *args: flush_antes_del_correo.append(db.flush.called)
    servicio.emitir(e.usuario, MotivoCredencial.CREACION, e.actor, None)
    assert flush_antes_del_correo == [True]


@pytest.mark.parametrize("microsegundos,expirada", [(-1, False), (0, False), (1, True)])
def test_limite_inactividad_con_repositorio_real_y_db_simulada(microsegundos, expirada):
    db = Mock(spec=Session)
    usuario = Usuario(id=USUARIO_ID, estado=EstadoUsuario.ACTIVO, bloqueado_hasta=None)
    sesion = Sesion(usuario=usuario, etapa=EtapaSesion.ACTIVA, cerrada_en=None,
        ultima_actividad_en=AHORA-timedelta(minutes=10, microseconds=microsegundos), ip=None)
    db.scalar.return_value = sesion
    unidad, eventos = Mock(), Mock()
    servicio = ServicioAutenticacion(Mock(), RepositorioSesiones(db), eventos, unidad,
        Mock(), Mock(), reglas=ReglasSesion(), reloj=lambda: AHORA)
    if expirada:
        with pytest.raises(ErrorApi) as error:
            servicio.validar_sesion("token-sintetico", (EtapaSesion.ACTIVA,), True)
        assert (error.value.estado, error.value.codigo, error.value.extra) == (401, "SESION_EXPIRADA", {"motivo": "INACTIVIDAD"})
        assert sesion.cerrada_en == AHORA
        unidad.confirmar.assert_called_once()
    else:
        assert servicio.validar_sesion("token-sintetico", (EtapaSesion.ACTIVA,), True) is sesion
        unidad.confirmar.assert_not_called()
    assert compilada(db.scalar.call_args.args[0]).params == {"token_hash_1": hash_token("token-sintetico")}
