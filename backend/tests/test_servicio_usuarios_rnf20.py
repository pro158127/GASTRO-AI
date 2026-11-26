"""RF-U05..U09/U11/U12, RF-A06: servicio real y colaboradores simulados."""
import socket
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import UUID

import pytest

from app.core.errores import ErrorApi
from app.models import AccionBitacora as A, CodigoRol as R, EstadoUsuario as E
from app.models import MotivoCredencial as M, TipoTraslado as T, Rol, Usuario
from app.services.usuarios import CambiosCuenta, ServicioUsuarios

AHORA = datetime(2026, 1, 1, tzinfo=UTC)
IP = "127.0.0.1"


def persona(numero=1, rol=R.DOCTOR, estado=E.ACTIVO):
    return Usuario(id=UUID(int=numero), nombre="QA", apellido="Sintetico",
                   correo=f"qa{numero}@example.invalid", telefono="0000000000",
                   rol=Rol(codigo=rol, nombre=rol.value), estado=estado,
                   activado_en=AHORA, hash_contrasena="hash-sintetico",
                   contrasena_temporal=True, temporal_expira_en=AHORA,
                   totp_secreto_cifrado=b"cifrado-sintetico", totp_vinculado_en=AHORA,
                   totp_ultimo_paso=12, intentos_fallidos=5, bloqueado_hasta=AHORA)


@pytest.fixture
def e(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Conexion externa prohibida")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)
    ctx = SimpleNamespace(usuarios=Mock(), sesiones=Mock(), traslados=Mock(), envios=Mock(),
                          credenciales=Mock(), publicador=Mock(), unidad=Mock(),
                          usuario=persona(), actor=persona(9, R.ADMINISTRADOR), destino=persona(2))
    ctx.usuarios.por_id.side_effect = lambda ident: {ctx.usuario.id: ctx.usuario, ctx.destino.id: ctx.destino}.get(ident)
    ctx.usuarios.correo_en_uso.return_value = False
    ctx.usuarios.rol.side_effect = lambda rol: Rol(codigo=rol, nombre=rol.value)
    ctx.usuarios.casos_activos.return_value = 0
    ctx.usuarios.otros_administradores_activos.return_value = 1
    ctx.traslados.casos_activos.return_value = []
    ctx.s = ServicioUsuarios(ctx.usuarios, ctx.sesiones, ctx.traslados, ctx.envios,
                            ctx.credenciales, ctx.publicador, ctx.unidad, lambda: AHORA)
    yield ctx
    # Ninguna accion auditada por este servicio debe filtrar valores sensibles.
    for llamada in ctx.publicador.publicar.call_args_list:
        evento = llamada.args[0]
        assert evento.actor_id == ctx.actor.id
        assert evento.entidad == "Usuario" and evento.ip == IP
        texto = repr(evento.detalle)
        for secreto in ["@example.invalid", "hash-sintetico", "cifrado-sintetico"]:
            assert secreto not in texto
        def valores(dato):
            if isinstance(dato, dict):
                for valor in dato.values(): yield from valores(valor)
            elif isinstance(dato, (list, tuple)):
                for valor in dato: yield from valores(valor)
            else: yield dato
        assert "0000000000" not in list(valores(evento.detalle))


def error(e, codigo, accion, estado):
    with pytest.raises(ErrorApi) as obtenido:
        accion()
    assert (obtenido.value.estado, obtenido.value.codigo) == (estado, codigo)
    e.unidad.confirmar.assert_not_called()


def test_listar_delega_filtro_y_devuelve_total(e):
    filtro = object()
    e.usuarios.listar.return_value = ([e.usuario], 1)
    assert e.s.listar(filtro) == ([e.usuario], 1)
    e.usuarios.listar.assert_called_once_with(filtro)


def test_detalle_incluye_casos_y_envios(e):
    e.usuarios.casos_activos.return_value = 2
    e.envios.recientes.return_value = ["envio-sintetico"]
    d = e.s.detalle(e.usuario.id)
    assert d.usuario is e.usuario and d.casos_activos == 2 and d.envios == ["envio-sintetico"]
    e.envios.recientes.assert_called_once_with(e.usuario.id)


def test_detalle_ausente(e):
    error(e, "NO_ENCONTRADO", lambda: e.s.detalle(UUID(int=99)), 404)


def crear(e):
    return e.s.crear("QA", "Sintetico", "  NUEVO@EXAMPLE.INVALID ", None, R.DOCTOR, e.actor, IP)


def test_crear_normaliza_pendiente_emite_y_confirma(e):
    u, envio = crear(e)
    assert u.correo == "nuevo@example.invalid" and u.estado == E.PENDIENTE
    assert u.creado_por == e.actor.id and u.rol.codigo == R.DOCTOR
    e.usuarios.agregar.assert_called_once_with(u)
    e.credenciales.emitir.assert_called_once_with(u, M.CREACION, e.actor, IP)
    assert envio is e.credenciales.emitir.return_value
    assert e.publicador.publicar.call_args.args[0].accion == A.CUENTA_CREADA
    e.unidad.confirmar.assert_called_once_with()


@pytest.mark.parametrize("caso,codigo,estado", [("duplicado", "CORREO_YA_REGISTRADO", 409), ("rol", "DATOS_INVALIDOS", 422)])
def test_crear_rechaza_antes_de_agregar(e, caso, codigo, estado):
    if caso == "duplicado": e.usuarios.correo_en_uso.return_value = True
    else: e.usuarios.rol.side_effect = None; e.usuarios.rol.return_value = None
    error(e, codigo, lambda: crear(e), estado)
    e.usuarios.agregar.assert_not_called()
    e.credenciales.emitir.assert_not_called()


@pytest.mark.parametrize("borrar", [False, True])
def test_editar_campos_y_telefono(e, borrar):
    u, envio = e.s.editar(e.usuario.id, CambiosCuenta(nombre="Nuevo", apellido="Otro", telefono="1111111111", borrar_telefono=borrar), e.actor, IP)
    assert u.nombre == "Nuevo" and u.apellido == "Otro"
    assert u.telefono == (None if borrar else "1111111111") and envio is None
    assert e.publicador.publicar.call_args.args[0].detalle == {"campos": ["nombre", "apellido", "telefono"]}
    e.sesiones.cerrar_todas.assert_not_called()
    e.unidad.confirmar.assert_called_once()


def test_editar_sin_cambios_no_audita_ni_emite(e):
    e.s.editar(e.usuario.id, CambiosCuenta(nombre=e.usuario.nombre, correo=" QA1@EXAMPLE.INVALID "), e.actor, IP)
    e.publicador.publicar.assert_not_called()
    e.credenciales.emitir.assert_not_called()


def test_cambio_correo_revoca_y_emite(e):
    u, envio = e.s.editar(e.usuario.id, CambiosCuenta(correo=" NUEVO@EXAMPLE.INVALID "), e.actor, IP)
    assert u.correo == "nuevo@example.invalid" and envio is e.credenciales.emitir.return_value
    e.usuarios.correo_en_uso.assert_called_once_with("nuevo@example.invalid", excepto=u.id)
    e.sesiones.cerrar_todas.assert_called_once_with(u.id, AHORA)
    e.credenciales.emitir.assert_called_once_with(u, M.CAMBIO_CORREO, e.actor, IP)
    assert [c.args[0].accion for c in e.publicador.publicar.call_args_list] == [A.CORREO_CAMBIADO, A.CUENTA_EDITADA]
    e.unidad.confirmar.assert_called_once()


def test_correo_duplicado_no_revoca(e):
    e.usuarios.correo_en_uso.return_value = True
    error(e, "CORREO_YA_REGISTRADO", lambda: e.s.editar(e.usuario.id, CambiosCuenta(correo="otro@example.invalid"), e.actor, IP), 409)
    assert e.usuario.correo == "qa1@example.invalid"
    e.sesiones.cerrar_todas.assert_not_called()


@pytest.mark.parametrize("accion", ["editar", "cambiar_rol", "activar", "desactivar", "eliminar", "restablecer_contrasena", "reenviar_credencial", "desbloquear", "reasignar_casos"])
def test_cuenta_eliminada_no_admite_cambios(e, accion):
    e.usuario.estado = E.ELIMINADO
    extras = {"editar": [CambiosCuenta()], "cambiar_rol": [R.ADMINISTRADOR],
              "desactivar": [None], "eliminar": [None], "reasignar_casos": [e.destino.id, None]}
    error(e, "NO_ENCONTRADO", lambda: getattr(e.s, accion)(e.usuario.id, *extras.get(accion, []), e.actor, IP), 404)
    e.publicador.publicar.assert_not_called()
    e.sesiones.cerrar_todas.assert_not_called()


@pytest.mark.parametrize("accion", ["desactivar", "eliminar", "cambiar_rol"])
def test_ultimo_administrador_protegido(e, accion):
    e.usuario.rol.codigo = R.ADMINISTRADOR
    e.usuarios.otros_administradores_activos.return_value = 0
    argumento = R.DOCTOR if accion == "cambiar_rol" else None
    error(e, "ULTIMO_ADMINISTRADOR", lambda: getattr(e.s, accion)(e.usuario.id, argumento, e.actor, IP), 409)
    e.usuarios.tomar_candado_administradores.assert_called_once()
    e.sesiones.cerrar_todas.assert_not_called()
    assert e.usuario.estado == E.ACTIVO and e.usuario.rol.codigo == R.ADMINISTRADOR


def test_cambio_rol_valido_y_mismo_rol(e):
    assert e.s.cambiar_rol(e.usuario.id, R.DOCTOR, e.actor, IP) is e.usuario
    e.unidad.confirmar.assert_not_called()
    u = e.s.cambiar_rol(e.usuario.id, R.ADMINISTRADOR, e.actor, IP)
    assert u.rol.codigo == R.ADMINISTRADOR
    assert e.publicador.publicar.call_args.args[0].detalle == {"de": "DOCTOR", "a": "ADMINISTRADOR"}
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("caso,codigo,estado", [("casos", "CASOS_SIN_REASIGNAR", 409), ("rol", "DATOS_INVALIDOS", 422)])
def test_cambio_rol_rechazado(e, caso, codigo, estado):
    if caso == "casos": e.usuarios.casos_activos.return_value = 1
    else: e.usuarios.rol.side_effect = None; e.usuarios.rol.return_value = None
    error(e, codigo, lambda: e.s.cambiar_rol(e.usuario.id, R.ADMINISTRADOR, e.actor, IP), estado)


@pytest.mark.parametrize("anterior,esperado", [(None, E.PENDIENTE), (AHORA, E.ACTIVO)])
def test_activar_inactiva_respeta_primer_ingreso(e, anterior, esperado):
    e.usuario.estado = E.INACTIVO; e.usuario.activado_en = anterior
    assert e.s.activar(e.usuario.id, e.actor, IP).estado == esperado
    e.unidad.confirmar.assert_called_once()
    assert e.publicador.publicar.call_args.args[0].accion == A.CUENTA_ACTIVADA


@pytest.mark.parametrize("accion,estado", [("activar", E.ACTIVO), ("desactivar", E.INACTIVO), ("restablecer_contrasena", E.INACTIVO), ("reenviar_credencial", E.ACTIVO)])
def test_transicion_invalida_no_confirma(e, accion, estado):
    e.usuario.estado = estado
    extras = [None] if accion == "desactivar" else []
    error(e, "TRANSICION_INVALIDA", lambda: getattr(e.s, accion)(e.usuario.id, *extras, e.actor, IP), 409)
    e.publicador.publicar.assert_not_called()


@pytest.mark.parametrize("rol", [R.DOCTOR, R.ADMINISTRADOR])
def test_desactivar_sin_casos_revoca(e, rol):
    e.usuario.rol.codigo = rol
    u, traslado = e.s.desactivar(e.usuario.id, None, e.actor, IP)
    assert u.estado == E.INACTIVO and traslado is None
    e.sesiones.cerrar_todas.assert_called_once_with(u.id, AHORA)
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("accion,tipo", [("desactivar", T.DESACTIVACION), ("eliminar", T.ELIMINACION)])
def test_baja_con_casos_exige_destino_y_traslada(e, accion, tipo):
    casos = [UUID(int=20)]
    e.traslados.casos_activos.return_value = casos
    error(e, "DESTINO_REQUERIDO", lambda: getattr(e.s, accion)(e.usuario.id, None, e.actor, IP), 409)
    e.traslados.trasladar.assert_not_called()
    u, resultado = getattr(e.s, accion)(e.usuario.id, e.destino.id, e.actor, IP)
    assert resultado.casos_trasladados == 1
    e.traslados.trasladar.assert_called_once_with(tipo, u.id, e.destino.id, e.actor.id, casos)
    e.sesiones.cerrar_todas.assert_called_once_with(u.id, AHORA)
    e.unidad.confirmar.assert_called_once()


def test_eliminar_limpia_credenciales_conserva_identidad(e):
    u, _ = e.s.eliminar(e.usuario.id, None, e.actor, IP)
    assert u.estado == E.ELIMINADO and u.eliminado_en == AHORA
    for campo in ["correo", "telefono", "hash_contrasena", "temporal_expira_en", "totp_secreto_cifrado", "totp_vinculado_en", "totp_ultimo_paso"]:
        assert getattr(u, campo) is None
    assert u.contrasena_temporal is False and u.nombre == "QA"
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("caso", ["ausente", "propio", "administrador", "inactivo"])
def test_reasignacion_rechaza_destino_invalido(e, caso):
    e.traslados.casos_activos.return_value = [UUID(int=20)]
    destino = e.destino.id
    if caso == "ausente": destino = UUID(int=90)
    elif caso == "propio": destino = e.usuario.id
    elif caso == "administrador": e.destino.rol.codigo = R.ADMINISTRADOR
    else: e.destino.estado = E.INACTIVO
    error(e, "DESTINO_INVALIDO", lambda: e.s.reasignar_casos(e.usuario.id, destino, None, e.actor, IP), 422)
    e.traslados.trasladar.assert_not_called()


@pytest.mark.parametrize("caso,codigo,estado", [("admin", "TRANSICION_INVALIDA", 409), ("seleccion", "CASOS_INVALIDOS", 422), ("vacio", "SIN_CASOS_ACTIVOS", 409)])
def test_reasignacion_rechaza_origen_o_casos(e, caso, codigo, estado):
    if caso == "admin": e.usuario.rol.codigo = R.ADMINISTRADOR
    ids = [UUID(int=20)] if caso == "seleccion" else None
    error(e, codigo, lambda: e.s.reasignar_casos(e.usuario.id, e.destino.id, ids, e.actor, IP), estado)
    e.traslados.trasladar.assert_not_called()


def test_reasignacion_valida_audita_y_confirma(e):
    casos = [UUID(int=20), UUID(int=21)];e.traslados.casos_activos.return_value = casos
    resultado = e.s.reasignar_casos(e.usuario.id, e.destino.id, casos, e.actor, IP)
    assert resultado.casos_trasladados == 2 and resultado.traslado is e.traslados.trasladar.return_value
    e.traslados.trasladar.assert_called_once_with(T.REASIGNACION, e.usuario.id, e.destino.id, e.actor.id, casos)
    evento = e.publicador.publicar.call_args.args[0]
    assert evento.accion == A.CASOS_REASIGNADOS and evento.detalle["casos"] == 2
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("estado", [E.ACTIVO, E.PENDIENTE])
def test_restablecer_revoca_limpia_y_delega(e, estado):
    e.usuario.estado = estado
    u, envio = e.s.restablecer_contrasena(e.usuario.id, e.actor, IP)
    assert u.estado == estado and u.intentos_fallidos == 0
    for campo in ["totp_secreto_cifrado", "totp_vinculado_en", "totp_ultimo_paso", "bloqueado_hasta"]: assert getattr(u, campo) is None
    e.sesiones.cerrar_todas.assert_called_once_with(u.id, AHORA)
    e.credenciales.emitir.assert_called_once_with(u, M.RESTABLECIMIENTO, e.actor, IP)
    assert envio is e.credenciales.emitir.return_value
    e.unidad.confirmar.assert_called_once()


def test_reenviar_pendiente_revoca_y_emite(e):
    e.usuario.estado = E.PENDIENTE
    u, _ = e.s.reenviar_credencial(e.usuario.id, e.actor, IP)
    e.sesiones.cerrar_todas.assert_called_once_with(u.id, AHORA)
    e.credenciales.emitir.assert_called_once_with(u, M.CREACION, e.actor, IP)
    e.unidad.confirmar.assert_called_once()


def test_desbloquear_limpia_y_audita(e):
    u = e.s.desbloquear(e.usuario.id, e.actor, IP)
    assert u.intentos_fallidos == 0 and u.bloqueado_hasta is None
    assert e.publicador.publicar.call_args.args[0].accion == A.CUENTA_DESBLOQUEADA
    e.unidad.confirmar.assert_called_once()


@pytest.mark.parametrize("colaborador", ["repositorio", "credenciales", "auditoria"])
def test_error_colaborador_no_confirma(e, colaborador):
    fallo = RuntimeError("fallo-sintetico")
    if colaborador == "repositorio": e.usuarios.agregar.side_effect = fallo
    elif colaborador == "credenciales": e.credenciales.emitir.side_effect = fallo
    else: e.publicador.publicar.side_effect = fallo
    with pytest.raises(RuntimeError) as obtenido: crear(e)
    assert obtenido.value is fallo
    e.unidad.confirmar.assert_not_called()
