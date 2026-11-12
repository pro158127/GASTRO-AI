"""Controlador de /admin/usuarios: gestión de cuentas (solo ADMINISTRADOR, RF-U03 CA 1).

Cada acción crítica la confirma un diálogo del front (RNF-08); aquí ya llega confirmada.
Todas dejan bitácora y devuelven la cuenta actualizada.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import IpCliente, ServicioCuentas, ServicioDeResumenCuentas, SesionAdmin
from app.models import CodigoRol, EnvioCredencial, EstadoUsuario, Usuario
from app.repositories.usuarios_repository import FiltroUsuarios
from app.schemas.errores import RespuestaError
from app.schemas.paginacion import POR_PAGINA_MAXIMO, Paginacion
from app.schemas.usuarios import (
    AnalisisCasoActivo,
    Baja,
    CambioRol,
    CasoActivoDoctor,
    CasosActivosDoctor,
    ConteosUsuarios,
    Credencial,
    EdicionUsuario,
    NuevoUsuario,
    PaginaUsuarios,
    PersonaCuenta,
    Reasignacion,
    RespuestaBaja,
    RespuestaCredencial,
    RespuestaEdicion,
    RespuestaTraslado,
    RespuestaUsuario,
    TrasladoResumen,
    UltimoTrasladoCuenta,
    UsuarioDetalle,
    UsuarioResumen,
)
from app.services.usuarios import ResultadoTraslado

router = APIRouter(prefix="/admin/usuarios", tags=["administración de usuarios"])

ERRORES = {code: {"model": RespuestaError} for code in (401, 403, 404, 409, 422)}


# ------------------------------------------------------------------ presentación


def resumen(usuario: Usuario, ultimo_envio: EnvioCredencial | None = None) -> UsuarioResumen:
    ahora = datetime.now(UTC)
    pendiente = usuario.estado == EstadoUsuario.PENDIENTE
    vencida = bool(usuario.temporal_expira_en and usuario.temporal_expira_en < ahora)
    return UsuarioResumen(
        id=usuario.id,
        nombre=usuario.nombre,
        apellido=usuario.apellido,
        correo=usuario.correo,
        telefono=usuario.telefono,
        rol=usuario.rol.codigo,
        rol_nombre=usuario.rol.nombre,
        estado=usuario.estado,
        bloqueado=bool(usuario.bloqueado_hasta and usuario.bloqueado_hasta > ahora),
        creado_en=usuario.creado_en,
        activado_en=usuario.activado_en,
        estado_activacion=("EXPIRADA" if vencida else "PENDIENTE") if pendiente else None,
        temporal_expira_en=usuario.temporal_expira_en if pendiente else None,
        ultimo_envio=credencial(ultimo_envio) if ultimo_envio else None,
    )


def credencial(envio: EnvioCredencial) -> Credencial:
    return Credencial(
        motivo=envio.motivo,
        estado=envio.estado,
        intentado_en=envio.intentado_en,
        codigo_error=envio.codigo_error,
    )


def traslado(resultado: ResultadoTraslado | None) -> TrasladoResumen | None:
    if resultado is None:
        return None
    return TrasladoResumen(
        id=resultado.traslado.id,
        tipo=resultado.traslado.tipo,
        casos_trasladados=resultado.casos_trasladados,
    )


# ------------------------------------------------------------------------ rutas


# U-15: las columnas ordenables de W-09
OrdenUsuarios = Literal[
    "nombre", "-nombre", "correo", "-correo", "rol", "-rol", "estado", "-estado"
]


@router.get("", response_model=PaginaUsuarios, responses=ERRORES)
def listar(
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    extras: ServicioDeResumenCuentas,
    q: Annotated[str | None, Query(max_length=100)] = None,
    rol: CodigoRol | None = None,
    estado: EstadoUsuario | None = None,
    excluir: UUID | None = None,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=POR_PAGINA_MAXIMO)] = 20,
    orden: OrdenUsuarios = "nombre",
):
    """Cuentas con filtros. `estado=PENDIENTE` = pendientes de activación (RF-U06).

    `orden`: `nombre` (apellido y nombre), `correo`, `rol` o `estado` (la prioridad de la
    insignia: bloqueada, pendiente, inactiva, activa); con `-` delante, descendente.

    Las eliminadas no salen salvo `estado=ELIMINADO`. Pa elegir el doctor de destino de
    un traslado: `?rol=DOCTOR&estado=ACTIVO&excluir={id}`.
    """
    filtro = FiltroUsuarios(
        texto=q.strip() if q and q.strip() else None,
        rol=rol,
        estado=estado,
        excluir=excluir,
        pagina=pagina,
        por_pagina=por_pagina,
        orden=orden,
    )
    filas, total = servicio.listar(filtro)
    envios = extras.ultimos_envios(filas)
    c = extras.conteos()
    return PaginaUsuarios(
        items=[resumen(u, envios.get(u.id)) for u in filas],
        paginacion=Paginacion(pagina=pagina, por_pagina=por_pagina, total=total),
        conteos=ConteosUsuarios(
            activos=c.activos,
            pendientes=c.pendientes,
            expiradas=c.expiradas,
            inactivos=c.inactivos,
            bloqueadas=c.bloqueadas,
            eliminadas=c.eliminadas,
        ),
    )


@router.post(
    "", status_code=status.HTTP_201_CREATED, response_model=RespuestaCredencial, responses=ERRORES
)
def crear(entrada: NuevoUsuario, sesion: SesionAdmin, servicio: ServicioCuentas, ip: IpCliente):
    """Crea la cuenta PENDIENTE y manda la temporal por correo (RF-U05).

    La temporal nunca viaja en la respuesta (CA 5). Si el correo falla, la cuenta queda
    igual y `credencial.estado` = FALLIDO: la UI ofrece reenviar (CA 9).
    """
    usuario, envio = servicio.crear(
        entrada.nombre,
        entrada.apellido,
        entrada.correo,
        entrada.telefono,
        entrada.rol,
        sesion.usuario,
        ip,
    )
    return RespuestaCredencial(usuario=resumen(usuario), credencial=credencial(envio))


@router.get("/{usuario_id}", response_model=UsuarioDetalle, responses=ERRORES)
def detalle(
    usuario_id: UUID,
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    extras: ServicioDeResumenCuentas,
):
    """La cuenta con sus casos activos, el estado del TOTP, el bloqueo y los últimos envíos.

    También cuándo se bloqueó o se desactivó y su último traslado (W-11b, W-11c). La IP del
    bloqueo no viene aquí: está en la bitácora (W-21), filtrando por este usuario.
    """
    datos = servicio.detalle(usuario_id)
    u = datos.usuario
    x = extras.extras(u)
    t = x.ultimo_traslado
    return UsuarioDetalle(
        **resumen(u, datos.envios[0] if datos.envios else None).model_dump(),
        bloqueado_en=x.bloqueado_en,
        desactivado_en=x.desactivado_en,
        ultimo_traslado=UltimoTrasladoCuenta(
            tipo=t.traslado.tipo.value,
            cantidad_casos=t.casos,
            ejecutado_en=t.traslado.ejecutado_en,
            destino=PersonaCuenta(
                nombre=t.traslado.destino.nombre,
                apellido=t.traslado.destino.apellido,
                cuenta_eliminada=t.traslado.destino.estado is EstadoUsuario.ELIMINADO,
            ),
        )
        if t
        else None,
        casos_activos=datos.casos_activos,
        totp_vinculado=u.totp_vinculado_en is not None,
        intentos_fallidos=u.intentos_fallidos,
        bloqueado_hasta=u.bloqueado_hasta,
        envios_credencial=[credencial(e) for e in datos.envios],
    )


@router.get("/{usuario_id}/casos-activos", response_model=CasosActivosDoctor, responses=ERRORES)
def casos_activos(usuario_id: UUID, sesion: SesionAdmin, extras: ServicioDeResumenCuentas):
    """Casos activos de un doctor para elegir qué reasignar (W-25, RF-A06 CA 2).

    De cada análisis solo el código y la fecha: sin imágenes, resultados ni datos del paciente.
    Para reasignarlos todos, `reasignar-casos` sin `caso_ids`.
    """
    casos = extras.casos_activos(usuario_id)
    return CasosActivosDoctor(
        total_casos=len(casos),
        total_analisis=sum(len(c.analisis) for c in casos),
        casos=[
            CasoActivoDoctor(
                caso_id=c.caso_id,
                analisis=[
                    AnalisisCasoActivo(id=a.id, codigo=a.codigo, solicitado_en=a.solicitado_en)
                    for a in c.analisis
                ],
            )
            for c in casos
        ],
    )


@router.patch("/{usuario_id}", response_model=RespuestaEdicion, responses=ERRORES)
def editar(
    usuario_id: UUID,
    entrada: EdicionUsuario,
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    ip: IpCliente,
):
    """Nombre, apellido, teléfono y correo. Cambiar el correo manda una temporal nueva al
    correo nuevo y cierra las sesiones abiertas (RF-U07 CA 7)."""
    usuario, envio = servicio.editar(
        usuario_id, entrada.a_cambios(entrada.correo), sesion.usuario, ip
    )
    return RespuestaEdicion(
        usuario=resumen(usuario), credencial=credencial(envio) if envio else None
    )


@router.post("/{usuario_id}/rol", response_model=RespuestaUsuario, responses=ERRORES)
def cambiar_rol(
    usuario_id: UUID,
    entrada: CambioRol,
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    ip: IpCliente,
):
    """Un solo rol por cuenta; aplica de inmediato (RF-U08). 409 ULTIMO_ADMINISTRADOR o
    CASOS_SIN_REASIGNAR."""
    return RespuestaUsuario(
        usuario=resumen(servicio.cambiar_rol(usuario_id, entrada.rol, sesion.usuario, ip))
    )


@router.post("/{usuario_id}/activar", response_model=RespuestaUsuario, responses=ERRORES)
def activar(usuario_id: UUID, sesion: SesionAdmin, servicio: ServicioCuentas, ip: IpCliente):
    """Reactiva una cuenta INACTIVO (RF-U07 CA 1). Un solo clic, sin diálogo (RNF-08)."""
    return RespuestaUsuario(usuario=resumen(servicio.activar(usuario_id, sesion.usuario, ip)))


@router.post("/{usuario_id}/desactivar", response_model=RespuestaBaja, responses=ERRORES)
def desactivar(
    usuario_id: UUID,
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    ip: IpCliente,
    entrada: Baja | None = None,
):
    """Desactiva y cierra sus sesiones (RF-U07 CA 2 y 3). Si el doctor tiene casos activos
    hace falta `destino_id` (409 DESTINO_REQUERIDO) y se trasladan aquí mismo."""
    usuario, resultado = servicio.desactivar(
        usuario_id, entrada.destino_id if entrada else None, sesion.usuario, ip
    )
    return RespuestaBaja(usuario=resumen(usuario), traslado=traslado(resultado))


@router.post("/{usuario_id}/eliminar", response_model=RespuestaBaja, responses=ERRORES)
def eliminar(
    usuario_id: UUID,
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    ip: IpCliente,
    entrada: Baja | None = None,
):
    """Eliminación lógica (RF-U11): correo y contraseña quedan en null; se conservan el
    nombre y los registros. Con casos activos exige `destino_id`, igual que desactivar."""
    usuario, resultado = servicio.eliminar(
        usuario_id, entrada.destino_id if entrada else None, sesion.usuario, ip
    )
    return RespuestaBaja(usuario=resumen(usuario), traslado=traslado(resultado))


@router.post("/{usuario_id}/reasignar-casos", response_model=RespuestaTraslado, responses=ERRORES)
def reasignar_casos(
    usuario_id: UUID,
    entrada: Reasignacion,
    sesion: SesionAdmin,
    servicio: ServicioCuentas,
    ip: IpCliente,
):
    """Pasa casos activos a otro doctor sin desactivar a nadie (RF-A06). caso_ids null = todos."""
    resultado = servicio.reasignar_casos(
        usuario_id, entrada.destino_id, entrada.caso_ids, sesion.usuario, ip
    )
    return RespuestaTraslado(traslado=traslado(resultado))


@router.post(
    "/{usuario_id}/restablecer-contrasena", response_model=RespuestaCredencial, responses=ERRORES
)
def restablecer_contrasena(
    usuario_id: UUID, sesion: SesionAdmin, servicio: ServicioCuentas, ip: IpCliente
):
    """Temporal nueva por correo, app desvinculada y sesiones cerradas (RF-U09)."""
    usuario, envio = servicio.restablecer_contrasena(usuario_id, sesion.usuario, ip)
    return RespuestaCredencial(usuario=resumen(usuario), credencial=credencial(envio))


@router.post(
    "/{usuario_id}/reenviar-credencial", response_model=RespuestaCredencial, responses=ERRORES
)
def reenviar_credencial(
    usuario_id: UUID, sesion: SesionAdmin, servicio: ServicioCuentas, ip: IpCliente
):
    """Cuenta PENDIENTE con el correo fallido o la temporal vencida: temporal nueva (RF-U06)."""
    usuario, envio = servicio.reenviar_credencial(usuario_id, sesion.usuario, ip)
    return RespuestaCredencial(usuario=resumen(usuario), credencial=credencial(envio))


@router.post("/{usuario_id}/desbloquear", response_model=RespuestaUsuario, responses=ERRORES)
def desbloquear(usuario_id: UUID, sesion: SesionAdmin, servicio: ServicioCuentas, ip: IpCliente):
    """Levanta el bloqueo por intentos antes de los 15 min (RF-U12 CA 3)."""
    return RespuestaUsuario(usuario=resumen(servicio.desbloquear(usuario_id, sesion.usuario, ip)))
