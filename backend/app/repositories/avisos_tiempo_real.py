"""Qué cambio de la base genera un aviso en tiempo real, y cuándo se manda (Observador).

En vez de llamar al publicador desde cada servicio, se escuchan los eventos de la Session
de SQLAlchemy:

1. `after_flush`: se mira qué objetos cambiaron y se anotan los avisos en `session.info`.
2. `after_commit`: recién ahí se publican. Así un aviso nunca anuncia algo que después se
   deshizo, y el front, al volver a pedir el dato, siempre lo encuentra.
3. `after_rollback`: se descartan los anotados.

Sirve igual en la API y en el worker de Celery, porque los dos usan la misma Session.
Los avisos llevan solo IDs (docs/sse_tiempo_real.md §2):

| Cambio | Aviso | A quién |
|---|---|---|
| `Analisis` nuevo o con otro `estado`/`etapa_proceso` | `analisis.estado` | doctor que lo pidió |
| `ExplicacionLlm` que pasa a GENERADA, FALLIDA o RECHAZADA | `analisis.explicacion` | ídem |
| `Traslado` nuevo | `traslado.nuevo` | doctor destino |
| `Usuario` con otro `rol_id` | `cuenta.rol_cambiado` | esa cuenta |
| `Sesion` que se cierra | `sesion.cerrada` | dueño de la sesión |
"""

from sqlalchemy import event, select
from sqlalchemy.orm import Session, attributes

from app.adapters.tiempo_real import PublicadorTiempoReal
from app.models import Analisis, EstadoExplicacion, ExplicacionLlm, Sesion, Traslado, Usuario

CLAVE = "avisos_tiempo_real"
EXPLICACION_TERMINADA = (
    EstadoExplicacion.GENERADA,
    EstadoExplicacion.FALLIDA,
    EstadoExplicacion.RECHAZADA,
)

# (usuario_id, tipo, ((campo, id), ...)): una tupla pa que se repitan sin duplicarse
Aviso = tuple[str, str, tuple[tuple[str, str], ...]]

_publicador: PublicadorTiempoReal | None = None


def instalar(publicador: PublicadorTiempoReal | None) -> None:
    """Activa (o con None, apaga) los avisos. Lo llaman la API y el worker al arrancar."""
    global _publicador
    _publicador = publicador
    if not event.contains(Session, "after_flush", _anotar):
        event.listen(Session, "after_flush", _anotar)
        event.listen(Session, "after_commit", _enviar)
        event.listen(Session, "after_rollback", _descartar)


def _cambio(objeto: object, campo: str) -> bool:
    return attributes.get_history(objeto, campo).has_changes()


def _avisos_de(session: Session) -> set[Aviso]:
    avisos: set[Aviso] = set()
    for objeto in session.new:
        if isinstance(objeto, Analisis):
            avisos.add(_de_analisis(objeto))
        elif isinstance(objeto, Traslado):
            avisos.add(
                (str(objeto.destino_id), "traslado.nuevo", (("traslado_id", str(objeto.id)),))
            )
    for objeto in session.dirty:
        if isinstance(objeto, Analisis) and (
            _cambio(objeto, "estado") or _cambio(objeto, "etapa_proceso")
        ):
            avisos.add(_de_analisis(objeto))
        elif isinstance(objeto, ExplicacionLlm) and _cambio(objeto, "estado"):
            if objeto.estado in EXPLICACION_TERMINADA:
                # Sin cargar la relación (no se puede en medio del flush): una consulta corta
                doctor = session.connection().scalar(
                    select(Analisis.doctor_ejecutor_id).where(Analisis.id == objeto.analisis_id)
                )
                ids = (("analisis_id", str(objeto.analisis_id)),)
                avisos.add((str(doctor), "analisis.explicacion", ids))
        elif isinstance(objeto, Usuario) and _cambio(objeto, "rol_id"):
            avisos.add((str(objeto.id), "cuenta.rol_cambiado", ()))
        elif isinstance(objeto, Sesion) and _cambio(objeto, "cerrada_en"):
            if objeto.cerrada_en is not None:
                avisos.add((str(objeto.usuario_id), "sesion.cerrada", ()))
    return avisos


def _de_analisis(analisis: Analisis) -> Aviso:
    return (
        str(analisis.doctor_ejecutor_id),
        "analisis.estado",
        (("analisis_id", str(analisis.id)),),
    )


def _anotar(session: Session, _contexto) -> None:
    if _publicador is not None:
        session.info.setdefault(CLAVE, set()).update(_avisos_de(session))


def _enviar(session: Session) -> None:
    avisos = session.info.pop(CLAVE, None)
    if not avisos or _publicador is None:
        return
    for usuario_id, tipo, ids in sorted(avisos):
        _publicador.publicar(usuario_id, tipo, dict(ids))


def _descartar(session: Session) -> None:
    session.info.pop(CLAVE, None)
