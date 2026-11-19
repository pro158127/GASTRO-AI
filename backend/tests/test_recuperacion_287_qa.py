"""Recuperación en memoria y CLI interceptada: nunca DB/SMTP/administración reales."""
import socket
from contextlib import nullcontext
from datetime import UTC,datetime,timedelta
from types import SimpleNamespace as N
from unittest.mock import Mock
from uuid import UUID

import pytest
from app.adapters.correo import ErrorCorreo
from app.core.errores import ErrorApi
from app.core.seguridad import verificar_contrasena,hashear_contrasena
from app.models import CodigoRol,EstadoUsuario,EstadoEnvio,EtapaSesion,AccionBitacora
from app.services.credenciales import ServicioCredenciales
from app.services.recuperacion_admin import ServicioRecuperacionAdmin,ErrorRecuperacion,Recuperacion
from app.services.autenticacion import ServicioAutenticacion
from app.services.auditoria import verificar_detalle
from scripts import recuperar_admin as cli

NOW=datetime(2026,11,18,12,tzinfo=UTC)

@pytest.fixture(autouse=True)
def no_red(monkeypatch):
 def fail(*a,**kw):raise AssertionError('Conexión externa prohibida')
 monkeypatch.setattr(socket.socket,'connect',fail);monkeypatch.setattr(socket.socket,'connect_ex',fail);monkeypatch.setattr(socket,'create_connection',fail)

@pytest.fixture
def ctx():
 admin=N(id=UUID(int=42),correo='qa-admin@example.invalid',nombre='QA',apellido='Sintético',rol=N(codigo=CodigoRol.ADMINISTRADOR),
  estado=EstadoUsuario.ACTIVO,hash_contrasena=hashear_contrasena('Anterior-solo-para-prueba-9!'),contrasena_temporal=False,
  temporal_expira_en=None,totp_secreto_cifrado=b'sintetico-no-real',totp_vinculado_en=NOW,totp_ultimo_paso=1,
  intentos_fallidos=5,bloqueado_hasta=NOW+timedelta(minutes=15))
 usuarios=Mock();usuarios.por_correo.return_value=admin;usuarios.otros_administradores_activos.return_value=0
 sesiones=Mock();events=Mock();unit=Mock();repo=Mock();mail=Mock()
 repo.registrar.side_effect=lambda uid,motivo,estado,codigo:N(estado=estado)
 cred=ServicioCredenciales(repo,mail,events,lambda:NOW)
 service=ServicioRecuperacionAdmin(usuarios,sesiones,cred,events,unit,lambda:NOW)
 return N(admin=admin,usuarios=usuarios,sesiones=sesiones,events=events,unit=unit,repo=repo,mail=mail,cred=cred,service=service)

@pytest.mark.parametrize('mostrar',[False,True])
def test_recuperacion_temporal_bloqueo_totp_sesiones(ctx,mostrar,caplog):
 previous=ctx.admin.hash_contrasena;r=ctx.service.recuperar(' QA-ADMIN@EXAMPLE.INVALID ',mostrar)
 assert r.vence==NOW+timedelta(hours=72) and ctx.admin.contrasena_temporal
 assert ctx.admin.hash_contrasena!=previous
 assert not verificar_contrasena('Anterior-solo-para-prueba-9!',ctx.admin.hash_contrasena)
 assert ctx.admin.bloqueado_hasta is None and ctx.admin.intentos_fallidos==0
 assert (ctx.admin.totp_secreto_cifrado,ctx.admin.totp_vinculado_en,ctx.admin.totp_ultimo_paso)==(None,None,None)
 ctx.sesiones.cerrar_todas.assert_called_once_with(ctx.admin.id,NOW);ctx.unit.confirmar.assert_called_once()
 ctx.usuarios.por_correo.assert_called_once_with('qa-admin@example.invalid')
 ctx.usuarios.tomar_candado_administradores.assert_called_once()
 if mostrar:
  assert r.temporal is not None and verificar_contrasena(r.temporal,ctx.admin.hash_contrasena)
  ctx.mail.enviar.assert_not_called();ctx.repo.registrar.assert_not_called()
 else:
  assert r.temporal is None and r.correo_enviado
  assert ctx.mail.enviar.call_args.args[0]=='qa-admin@example.invalid'
  ctx.repo.guardar_hash.assert_called_once()
 for call in ctx.events.publicar.call_args_list:verificar_detalle(call.args[0].detalle)
 recovery=ctx.events.publicar.call_args_list[0].args[0]
 assert recovery.accion==AccionBitacora.CONTRASENA_RESTABLECIDA
 assert recovery.detalle=={'origen':'SERVIDOR','entrega':'PANTALLA' if mostrar else 'CORREO'}
 if mostrar:assert bool(r.temporal not in caplog.text and r.temporal not in str(ctx.events.mock_calls))

@pytest.mark.parametrize('modo',['otro_admin','inactivo','eliminado','doctor','inexistente'])
def test_rechazo_sin_efectos(ctx,modo):
 if modo=='otro_admin':ctx.usuarios.otros_administradores_activos.return_value=1
 if modo=='inactivo':ctx.admin.estado=EstadoUsuario.INACTIVO
 if modo=='eliminado':ctx.admin.estado=EstadoUsuario.ELIMINADO
 if modo=='doctor':ctx.admin.rol.codigo=CodigoRol.DOCTOR
 if modo=='inexistente':ctx.usuarios.por_correo.return_value=None
 before=vars(ctx.admin).copy()
 with pytest.raises(ErrorRecuperacion):ctx.service.recuperar(ctx.admin.correo)
 assert vars(ctx.admin)==before
 ctx.sesiones.cerrar_todas.assert_not_called();ctx.mail.enviar.assert_not_called();ctx.events.publicar.assert_not_called();ctx.unit.confirmar.assert_not_called()

def test_pendiente_admitido_según_contrato(ctx):
 ctx.admin.estado=EstadoUsuario.PENDIENTE;ctx.service.recuperar(ctx.admin.correo,True)
 assert ctx.admin.estado==EstadoUsuario.PENDIENTE

def test_correo_falla_confirma_cambio_y_registra_fallo(ctx,caplog):
 ctx.mail.enviar.side_effect=ErrorCorreo('fallo sintético');r=ctx.service.recuperar(ctx.admin.correo)
 assert not r.correo_enviado and r.temporal is None
 assert ctx.repo.registrar.call_args.args[2:]==(EstadoEnvio.FALLIDO,'CORREO_NO_ENVIADO')
 ctx.unit.confirmar.assert_called_once();ctx.sesiones.cerrar_todas.assert_called_once()
 assert 'temporal anterior ya no sirve' in ' '.join(cli.informe(r))

@pytest.mark.parametrize('vencido',[False,True])
def test_acceso_real_al_servicio_tras_recuperacion(ctx,vencido):
 r=ctx.service.recuperar(ctx.admin.correo,True)
 reloj=lambda:NOW+timedelta(hours=73) if vencido else NOW
 auth=ServicioAutenticacion(ctx.usuarios,ctx.sesiones,ctx.events,ctx.unit,Mock(),Mock(),reloj=reloj)
 if vencido:
  with pytest.raises(ErrorApi) as e:auth.iniciar_sesion(ctx.admin.correo,r.temporal,None)
  assert (e.value.estado,e.value.codigo)==(403,'AUTH_TEMPORAL_EXPIRADA')
 else:
  result=auth.iniciar_sesion(ctx.admin.correo,r.temporal,None)
  assert result.etapa==EtapaSesion.CAMBIO_CONTRASENA
  assert ctx.sesiones.crear.call_args.args[1]==EtapaSesion.CAMBIO_CONTRASENA

@pytest.mark.parametrize('mostrar,fallo,exitcode',[(False,False,0),(False,True,2),(True,False,0)])
def test_cli_real_servicio_sin_conexion(ctx,monkeypatch,capsys,caplog,mostrar,fallo,exitcode):
 monkeypatch.setattr(cli,'SessionLocal',lambda:nullcontext(object()))
 monkeypatch.setattr(cli,'servicio',lambda db:ctx.service)
 if fallo:ctx.mail.enviar.side_effect=ErrorCorreo('fallo sintético')
 # Capturar resultado en memoria para comprobar exclusión del secreto en logs y auditoría.
 results=[];original=ctx.service.recuperar
 def track(*a,**kw):
  r=original(*a,**kw);results.append(r);return r
 monkeypatch.setattr(ctx.service,'recuperar',track)
 code=cli.main(['--correo',ctx.admin.correo]+(['--mostrar'] if mostrar else []))
 captured=capsys.readouterr();assert code==exitcode and not captured.err
 if mostrar:
  secret=results[0].temporal
  assert bool(captured.out.count(secret)==1)
  assert bool(secret not in caplog.text and secret not in str(ctx.events.mock_calls))
  # Se elimina del texto antes de cualquier evidencia persistida; no se imprime aquí.
  captured_text=captured.out.replace(secret,'[REDACTADO]');assert '[REDACTADO]' in captured_text
 else:
  assert results[0].temporal is None and 'Contraseña temporal (vence' not in captured.out
 if fallo:assert 'OJO: el correo NO salió' in captured.out

def test_cli_rechazo_codigo_1(ctx,monkeypatch,capsys):
 ctx.usuarios.otros_administradores_activos.return_value=1
 monkeypatch.setattr(cli,'SessionLocal',lambda:nullcontext(object()));monkeypatch.setattr(cli,'servicio',lambda db:ctx.service)
 assert cli.main(['--correo',ctx.admin.correo])==1
 c=capsys.readouterr();assert 'No se recuperó la cuenta' in c.err and not c.out

def test_cli_sin_argumentos_no_abre_db(monkeypatch,capsys):
 db=Mock();monkeypatch.setattr(cli,'SessionLocal',db)
 with pytest.raises(SystemExit) as e:cli.main([])
 assert e.value.code==2;db.assert_not_called();capsys.readouterr()

def test_cli_ensamblado_solo_adaptadores_falsos(monkeypatch):
 db=Mock();mail=Mock();monkeypatch.setattr(cli,'crear_enviador',lambda s:mail)
 s=cli.servicio(db)
 assert isinstance(s,ServicioRecuperacionAdmin) and s._credenciales._enviador is mail
 assert s._usuarios.db is db and s._sesiones.db is db
 assert cli._ahora().tzinfo is not None

def test_temporales_distintas_sin_registro(ctx,caplog):
 first=ctx.service.recuperar(ctx.admin.correo,True);second=ctx.service.recuperar(ctx.admin.correo,True)
 assert bool(first.temporal!=second.temporal)
 assert not verificar_contrasena(first.temporal,ctx.admin.hash_contrasena)
 assert verificar_contrasena(second.temporal,ctx.admin.hash_contrasena)
 assert bool(first.temporal not in caplog.text and second.temporal not in caplog.text)
