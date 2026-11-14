"""Segunda tanda #70: reglas de autenticación, sin base de datos ni red.

Los identificadores T70-Axx vinculan casos parametrizados con la matriz del chat.
El verificador bcrypt se sustituye solo en login; su implementación real se prueba
en test_seguridad.py. Reloj fijo, AES-GCM y TOTP reales con datos sintéticos.
"""
import base64
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import Mock

import pyotp
import pytest
from starlette.requests import Request

from app.api.deps import requiere_rol, sesion_en
from app.core.errores import ErrorApi
from app.core.seguridad import CifradorTotp, hash_token, hashear_contrasena, verificar_contrasena
from app.models import AccionBitacora, CodigoRol, EstadoUsuario, EtapaSesion, ResultadoAccion
from app.repositories.sesiones_repository import RepositorioSesiones
from app.repositories.unidad_trabajo import UnidadTrabajo
from app.repositories.usuarios_repository import RepositorioUsuarios
from app.services import autenticacion
from app.services.auditoria import PublicadorEventos

SECRETO = "JBSWY3DPEHPK3PXP"  # Solo prueba; nunca usar en una cuenta.


@pytest.fixture
def escenario():
    ahora = datetime(2026, 1, 1, 12, tzinfo=UTC)
    cifrador = CifradorTotp(base64.b64encode(bytes(range(32))).decode())
    usuario = SimpleNamespace(
        id="usuario-sintetico", correo="tester@example.invalid",
        estado=EstadoUsuario.ACTIVO, hash_contrasena="hash-simulado",
        bloqueado_hasta=None, intentos_fallidos=0, contrasena_temporal=False,
        temporal_expira_en=ahora + timedelta(hours=72), totp_vinculado_en=ahora,
        totp_ultimo_paso=None, activado_en=None,
        rol=SimpleNamespace(codigo=CodigoRol.DOCTOR),
        totp_secreto_cifrado=cifrador.cifrar(SECRETO, "usuario-sintetico"),
    )
    sesion = SimpleNamespace(usuario=usuario, etapa=EtapaSesion.PENDIENTE_2FA,
                             cerrada_en=None, ultima_actividad_en=ahora, ip=None)
    usuarios = Mock(spec=RepositorioUsuarios)
    usuarios.por_correo.return_value = usuario
    usuarios.sumar_intento_fallido.return_value = 1
    sesiones = Mock(spec=RepositorioSesiones)
    sesiones.por_token_hash.return_value = sesion
    unidad = Mock(spec=UnidadTrabajo)
    publicador = Mock(spec=PublicadorEventos)
    servicio = autenticacion.ServicioAutenticacion(
        usuarios, sesiones, publicador, unidad, lambda: cifrador,
        Mock(esta_filtrada=Mock(return_value=False)), reloj=lambda: ahora,
    )
    return SimpleNamespace(ahora=ahora, usuario=usuario, sesion=sesion,
                           usuarios=usuarios, sesiones=sesiones, unidad=unidad,
                           publicador=publicador, servicio=servicio, cifrador=cifrador)


@pytest.mark.parametrize("temporal,vinculado,etapa", [
    (True, False, EtapaSesion.CAMBIO_CONTRASENA),
    (False, False, EtapaSesion.VINCULAR_TOTP),
    (False, True, EtapaSesion.PENDIENTE_2FA),
], ids=["temporal", "sin-totp", "con-totp"])
def test_T70_A01_login_selecciona_etapa_y_guarda_hash(escenario, monkeypatch, temporal, vinculado, etapa):
    e = escenario
    e.usuario.contrasena_temporal = temporal
    e.usuario.totp_vinculado_en = e.ahora if vinculado else None
    verificador = Mock(return_value=True)
    monkeypatch.setattr(autenticacion, "verificar_contrasena", verificador)
    resultado = e.servicio.iniciar_sesion(" TESTER@EXAMPLE.INVALID ", "clave-ficticia", None)
    assert resultado.etapa == etapa
    e.usuarios.por_correo.assert_called_once_with("tester@example.invalid")
    verificador.assert_called_once_with("clave-ficticia", "hash-simulado")
    assert len(resultado.token) >= 43
    e.sesiones.crear.assert_called_once_with(e.usuario.id, etapa, hash_token(resultado.token), None)
    e.unidad.confirmar.assert_called_once_with()
    evento = e.publicador.publicar.call_args.args[0]
    assert evento.accion == AccionBitacora.INICIO_SESION
    assert evento.resultado == ResultadoAccion.EXITO


@pytest.mark.parametrize("caso", ["inexistente", "inactivo", "eliminado", "bloqueado", "clave-incorrecta"])
def test_T70_A02_login_no_revela_estado_de_cuenta(escenario, monkeypatch, caso):
    e = escenario
    if caso == "inexistente":
        e.usuarios.por_correo.return_value = None
    elif caso == "inactivo":
        e.usuario.estado = EstadoUsuario.INACTIVO
    elif caso == "eliminado":
        e.usuario.estado = EstadoUsuario.ELIMINADO
    elif caso == "bloqueado":
        e.usuario.bloqueado_hasta = e.ahora + timedelta(minutes=15)
    verificador = Mock(return_value=caso != "clave-incorrecta")
    monkeypatch.setattr(autenticacion, "verificar_contrasena", verificador)
    with pytest.raises(ErrorApi) as error:
        e.servicio.iniciar_sesion(e.usuario.correo, "clave-ficticia", None)
    assert (error.value.estado, error.value.codigo, error.value.mensaje) == (
        401, "AUTH_CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos.")
    verificador.assert_called_once_with("clave-ficticia", None if caso == "inexistente" else "hash-simulado")
    e.sesiones.crear.assert_not_called()
    e.unidad.confirmar.assert_called_once_with()
    assert e.publicador.publicar.call_args.args[0].resultado == ResultadoAccion.FALLO


def test_T70_A03_quinto_fallo_bloquea_quince_minutos(escenario, monkeypatch):
    e = escenario
    monkeypatch.setattr(autenticacion, "verificar_contrasena", Mock(return_value=False))
    e.usuarios.sumar_intento_fallido.side_effect = [1, 2, 3, 4, 5]
    for intento in range(1, 6):
        with pytest.raises(ErrorApi) as error:
            e.servicio.iniciar_sesion(e.usuario.correo, "incorrecta", None)
        assert error.value.codigo == "AUTH_CREDENCIALES_INVALIDAS"
        assert e.unidad.confirmar.call_count == intento
        if intento < 5:
            e.usuarios.bloquear.assert_not_called()
    e.usuarios.bloquear.assert_called_once_with(e.usuario.id, e.ahora + timedelta(minutes=15))
    assert e.usuarios.sumar_intento_fallido.call_count == 5
    assert sum(c.args[0].accion == AccionBitacora.CUENTA_BLOQUEADA
               for c in e.publicador.publicar.call_args_list) == 1
    e.sesiones.crear.assert_not_called()


@pytest.mark.parametrize("vencimiento", ["vencida", "sin-fecha"])
def test_T70_A04_temporal_vencida_no_crea_sesion(escenario, monkeypatch, vencimiento):
    e = escenario
    e.usuario.contrasena_temporal = True
    e.usuario.temporal_expira_en = e.ahora - timedelta(seconds=1) if vencimiento == "vencida" else None
    monkeypatch.setattr(autenticacion, "verificar_contrasena", Mock(return_value=True))
    with pytest.raises(ErrorApi) as error:
        e.servicio.iniciar_sesion(e.usuario.correo, "temporal-ficticia", None)
    assert (error.value.estado, error.value.codigo) == (403, "AUTH_TEMPORAL_EXPIRADA")
    e.sesiones.crear.assert_not_called()
    e.unidad.confirmar.assert_called_once_with()


@pytest.mark.parametrize("caso", ["sin-token", "desconocida", "cerrada", "inactivo", "eliminado", "bloqueado"])
def test_T70_A05_sesiones_no_autorizadas(escenario, caso):
    e = escenario
    token = None if caso == "sin-token" else "token-sintetico"
    if caso == "desconocida":
        e.sesiones.por_token_hash.return_value = None
    elif caso == "cerrada":
        e.sesion.cerrada_en = e.ahora - timedelta(seconds=1)
    elif caso in ("inactivo", "eliminado"):
        e.usuario.estado = EstadoUsuario.INACTIVO if caso == "inactivo" else EstadoUsuario.ELIMINADO
    elif caso == "bloqueado":
        e.usuario.bloqueado_hasta = e.ahora + timedelta(minutes=15)
    with pytest.raises(ErrorApi) as error:
        e.servicio.validar_sesion(token, (EtapaSesion.PENDIENTE_2FA,), False)
    assert (error.value.estado, error.value.codigo) == (401, "SESION_EXPIRADA")
    if caso in ("inactivo", "eliminado", "bloqueado"):
        assert e.sesion.cerrada_en == e.ahora
        e.unidad.confirmar.assert_called_once_with()
    else:
        e.unidad.confirmar.assert_not_called()
    if caso == "sin-token":
        e.sesiones.por_token_hash.assert_not_called()
    if caso == "bloqueado":
        assert error.value.extra["motivo"] == "DEMASIADOS_INTENTOS"


def test_T70_A06_totp_valido_activa_y_reinicio_de_contador(escenario):
    e = escenario
    e.usuario.intentos_fallidos = 4
    e.usuario.bloqueado_hasta = e.ahora - timedelta(seconds=1)
    codigo = pyotp.TOTP(SECRETO).at(e.ahora)
    assert e.servicio.verificar_segundo_factor(e.sesion, codigo, None) is e.usuario
    assert e.sesion.etapa == EtapaSesion.ACTIVA
    assert e.usuario.totp_ultimo_paso == int(e.ahora.timestamp() // 30)
    assert e.usuario.intentos_fallidos == 0
    assert e.usuario.bloqueado_hasta is None
    e.unidad.confirmar.assert_called_once_with()
    e.usuarios.sumar_intento_fallido.assert_not_called()
    # La segunda presentación del mismo código se rechaza y registra un fallo.
    with pytest.raises(ErrorApi) as error:
        e.servicio.verificar_segundo_factor(e.sesion, codigo, None)
    assert error.value.codigo == "TOTP_CODIGO_INVALIDO"
    e.usuarios.sumar_intento_fallido.assert_called_once_with(e.usuario.id)


@pytest.mark.parametrize("intentos", [1, 5])
def test_T70_A07_totp_invalido_cuenta_y_bloquea(escenario, intentos):
    e = escenario
    e.usuarios.sumar_intento_fallido.return_value = intentos
    with pytest.raises(ErrorApi) as error:
        e.servicio.verificar_segundo_factor(e.sesion, "no-valido", None)
    assert error.value.estado == 401
    e.unidad.confirmar.assert_called_once_with()
    e.usuarios.sumar_intento_fallido.assert_called_once_with(e.usuario.id)
    if intentos == 5:
        assert error.value.codigo == "SESION_EXPIRADA"
        assert error.value.extra["motivo"] == "DEMASIADOS_INTENTOS"
        assert e.sesion.cerrada_en == e.ahora
        e.usuarios.bloquear.assert_called_once_with(e.usuario.id, e.ahora + timedelta(minutes=15))
    else:
        assert error.value.codigo == "TOTP_CODIGO_INVALIDO"
        assert e.sesion.cerrada_en is None
        e.usuarios.bloquear.assert_not_called()


def test_T70_A08_vinculacion_cifra_secreto_y_confirma_cuenta(escenario):
    e = escenario
    e.usuario.estado = EstadoUsuario.PENDIENTE
    e.sesion.etapa = EtapaSesion.VINCULAR_TOTP
    resultado = e.servicio.generar_vinculacion(e.sesion)
    secreto = resultado["secreto_manual"].replace(" ", "")
    assert e.cifrador.descifrar(e.usuario.totp_secreto_cifrado, e.usuario.id) == secreto
    assert secreto.encode() not in e.usuario.totp_secreto_cifrado
    assert e.usuario.totp_vinculado_en is None
    assert e.usuario.totp_ultimo_paso is None
    assert base64.b64decode(resultado["qr_png_base64"]).startswith(b"\x89PNG\r\n\x1a\n")
    totp = pyotp.parse_uri(resultado["otpauth_uri"])
    assert totp.secret == secreto
    assert totp.name == e.usuario.correo
    assert e.servicio.confirmar_vinculacion(e.sesion, totp.at(e.ahora), None) is e.usuario
    assert e.usuario.estado == EstadoUsuario.ACTIVO
    assert e.usuario.activado_en == e.ahora
    assert e.usuario.totp_vinculado_en == e.ahora
    assert e.sesion.etapa == EtapaSesion.ACTIVA
    assert e.unidad.confirmar.call_count == 2


@pytest.mark.parametrize("caso", ["sin-secreto", "codigo-invalido", "quinto-fallo"])
def test_T70_A09_vinculacion_rechaza_fallos(escenario, caso):
    e = escenario
    e.sesion.etapa = EtapaSesion.VINCULAR_TOTP
    if caso == "sin-secreto":
        e.usuario.totp_secreto_cifrado = None
    if caso == "quinto-fallo":
        e.usuarios.sumar_intento_fallido.return_value = 5
    with pytest.raises(ErrorApi) as error:
        e.servicio.confirmar_vinculacion(e.sesion, "invalido", None)
    esperado = {"sin-secreto": (409, "TOTP_NO_INICIADO"),
                "codigo-invalido": (422, "TOTP_CODIGO_INVALIDO"),
                "quinto-fallo": (401, "SESION_EXPIRADA")}
    assert (error.value.estado, error.value.codigo) == esperado[caso]
    assert e.sesion.etapa == EtapaSesion.VINCULAR_TOTP
    if caso == "sin-secreto":
        e.unidad.confirmar.assert_not_called()
    else:
        e.unidad.confirmar.assert_called_once_with()
    if caso == "quinto-fallo":
        assert e.sesion.cerrada_en == e.ahora
        e.usuarios.bloquear.assert_called_once_with(e.usuario.id, e.ahora + timedelta(minutes=15))


@pytest.mark.parametrize("vinculado", [False, True])
def test_T70_A10_cambiar_temporal_actualiza_hash_y_etapa(escenario, vinculado):
    e = escenario
    e.usuario.hash_contrasena = hashear_contrasena("temporal ficticia inicial")
    e.usuario.contrasena_temporal = True
    e.usuario.totp_vinculado_en = e.ahora if vinculado else None
    nueva = "bosque de cometas azules"
    etapa = e.servicio.cambiar_temporal(e.sesion, nueva, nueva, None)
    assert etapa == (EtapaSesion.PENDIENTE_2FA if vinculado else EtapaSesion.VINCULAR_TOTP)
    assert e.sesion.etapa == etapa
    assert verificar_contrasena(nueva, e.usuario.hash_contrasena)
    assert not verificar_contrasena("temporal ficticia inicial", e.usuario.hash_contrasena)
    assert e.usuario.contrasena_temporal is False
    assert e.usuario.temporal_expira_en is None
    e.unidad.confirmar.assert_called_once_with()


@pytest.mark.parametrize("inactividad", [False, True])
def test_T70_A11_cierre_impide_reutilizar_sesion(escenario, inactividad):
    e = escenario
    e.servicio.cerrar_sesion(e.sesion, inactividad, None)
    assert e.sesion.cerrada_en == e.ahora
    e.unidad.confirmar.assert_called_once_with()
    accion = AccionBitacora.CIERRE_SESION_INACTIVIDAD if inactividad else AccionBitacora.CIERRE_SESION
    assert e.publicador.publicar.call_args.args[0].accion == accion
    with pytest.raises(ErrorApi) as error:
        e.servicio.validar_sesion("token-sintetico", (EtapaSesion.PENDIENTE_2FA,), False)
    assert error.value.codigo == "SESION_EXPIRADA"


@pytest.mark.parametrize("cabecera,pasiva", [(None, False), ("1", True), ("0", False)])
def test_T70_A12_dependencia_transmite_cookie_etapa_y_actividad(cabecera, pasiva):
    headers = [(b"cookie", b"gastro_sesion=token-sintetico")]
    if cabecera is not None:
        headers.append((b"x-actividad-pasiva", cabecera.encode()))
    request = Request({"type": "http", "headers": headers})
    servicio = Mock(spec=autenticacion.ServicioAutenticacion)
    resultado = sesion_en(EtapaSesion.ACTIVA)(request, servicio)
    servicio.validar_sesion.assert_called_once_with("token-sintetico", (EtapaSesion.ACTIVA,), pasiva)
    assert resultado is servicio.validar_sesion.return_value


def test_T70_A13_cambio_de_rol_revoca_permiso(escenario):
    e = escenario
    e.usuario.rol.codigo = CodigoRol.ADMINISTRADOR
    control = requiere_rol(CodigoRol.ADMINISTRADOR)
    assert control(e.sesion) is e.sesion
    e.usuario.rol.codigo = CodigoRol.DOCTOR
    with pytest.raises(ErrorApi) as error:
        control(e.sesion)
    assert (error.value.estado, error.value.codigo) == (403, "PERMISO_DENEGADO")


def test_T70_A14_aviso_antes_del_cierre(escenario):
    e = escenario
    assert e.servicio.inactividad(e.sesion) == {
        "aviso_en_s": 540, "cierre_en_s": 600, "ultima_actividad_en": e.sesion.ultima_actividad_en,
    }
