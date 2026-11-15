"""Consultas de usuarios. El rol siempre viene cargado: se lee de la base en cada petición."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import case, func, or_, select, text, update
from sqlalchemy.orm import Session, joinedload

from app.models import CasoPaciente, CodigoRol, EstadoCaso, EstadoUsuario, Rol, Usuario

# Llave del candado de Postgres pa la regla del último administrador (cualquier número fijo)
CANDADO_ADMINISTRADORES = 726_301


@dataclass(frozen=True)
class FiltroUsuarios:
    texto: str | None = None
    rol: CodigoRol | None = None
    estado: EstadoUsuario | None = None
    excluir: UUID | None = None
    pagina: int = 1
    por_pagina: int = 20
    orden: str = "nombre"  # nombre | correo | rol | estado; con «-» delante, descendente


def _criterio_orden(orden: str):
    """La columna por la que ordena W-09 (U-15). Siempre se desempata después."""
    campo = orden.removeprefix("-")
    if campo == "correo":
        return Usuario.correo
    if campo == "rol":
        # Por el nombre visible del rol, que es lo que se ve en la columna
        return select(Rol.nombre).where(Rol.id == Usuario.rol_id).scalar_subquery()
    if campo == "estado":
        # La misma prioridad de la insignia única (U-9):
        # Bloqueada > Pendiente/Expirada > Inactiva > Activa > Eliminada
        return case(
            (
                (Usuario.estado != EstadoUsuario.ELIMINADO)
                & (Usuario.bloqueado_hasta > func.now()),
                0,
            ),
            (Usuario.estado == EstadoUsuario.PENDIENTE, 1),
            (Usuario.estado == EstadoUsuario.INACTIVO, 2),
            (Usuario.estado == EstadoUsuario.ACTIVO, 3),
            else_=4,
        )
    return None  # nombre: apellido y nombre, que ya son el desempate


def _orden(orden: str) -> list:
    """ORDER BY completo: el criterio pedido y luego apellido, nombre e id.

    El id al final hace el orden total: con LIMIT/OFFSET ninguna cuenta se repite ni
    se pierde entre páginas aunque haya varias con el mismo nombre (U-14).
    """
    descendente = orden.startswith("-")
    criterio = _criterio_orden(orden)
    if criterio is None:
        if descendente:
            return [Usuario.apellido.desc(), Usuario.nombre.desc(), Usuario.id]
        return [Usuario.apellido, Usuario.nombre, Usuario.id]
    principal = criterio.desc() if descendente else criterio.asc()
    return [principal.nulls_last(), Usuario.apellido, Usuario.nombre, Usuario.id]


class RepositorioUsuarios:
    def __init__(self, db: Session) -> None:
        self.db = db

    def por_correo(self, correo: str) -> Usuario | None:
        return self.db.scalar(
            select(Usuario).options(joinedload(Usuario.rol)).where(Usuario.correo == correo)
        )

    def por_id(self, usuario_id: UUID) -> Usuario | None:
        return self.db.scalar(
            select(Usuario).options(joinedload(Usuario.rol)).where(Usuario.id == usuario_id)
        )

    def rol(self, codigo: CodigoRol) -> Rol | None:
        return self.db.scalar(select(Rol).where(Rol.codigo == codigo))

    def correo_en_uso(self, correo: str, excepto: UUID | None = None) -> bool:
        consulta = select(Usuario.id).where(Usuario.correo == correo)
        if excepto is not None:
            consulta = consulta.where(Usuario.id != excepto)
        return self.db.scalar(consulta) is not None

    def agregar(self, usuario: Usuario) -> None:
        """Lo deja en la sesión; el INSERT sale en el próximo flush (con el hash ya puesto)."""
        self.db.add(usuario)

    def listar(self, filtro: FiltroUsuarios) -> tuple[list[Usuario], int]:
        """Página de usuarios con filtros. Las eliminadas solo salen si se piden."""
        condiciones = []
        if filtro.estado is not None:
            condiciones.append(Usuario.estado == filtro.estado)
        else:
            condiciones.append(Usuario.estado != EstadoUsuario.ELIMINADO)
        if filtro.rol is not None:
            condiciones.append(Usuario.rol.has(Rol.codigo == filtro.rol))
        if filtro.excluir is not None:
            condiciones.append(Usuario.id != filtro.excluir)
        if filtro.texto:
            patron = f"%{filtro.texto}%"
            condiciones.append(
                or_(
                    Usuario.nombre.ilike(patron),
                    Usuario.apellido.ilike(patron),
                    Usuario.correo.ilike(patron),
                )
            )
        total = self.db.scalar(select(func.count()).select_from(Usuario).where(*condiciones))
        filas = self.db.scalars(
            select(Usuario)
            .options(joinedload(Usuario.rol))
            .where(*condiciones)
            .order_by(*_orden(filtro.orden))
            .offset((filtro.pagina - 1) * filtro.por_pagina)
            .limit(filtro.por_pagina)
        ).all()
        return list(filas), int(total or 0)

    def casos_activos(self, doctor_id: UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count())
                .select_from(CasoPaciente)
                .where(
                    CasoPaciente.doctor_asignado_id == doctor_id,
                    CasoPaciente.estado == EstadoCaso.ACTIVO,
                )
            )
            or 0
        )

    def tomar_candado_administradores(self) -> None:
        """Serializa los cambios que pueden dejar el sistema sin administrador.

        Sin esto, dos admins se desactivan entre sí al mismo tiempo y ambos ven «queda
        otro». El candado se suelta solo al terminar la transacción (RF-U07 CA 6).
        """
        self.db.execute(
            text("SELECT pg_advisory_xact_lock(:llave)"), {"llave": CANDADO_ADMINISTRADORES}
        )

    def otros_administradores_activos(self, excepto: UUID) -> int:
        return int(
            self.db.scalar(
                select(func.count())
                .select_from(Usuario)
                .where(
                    Usuario.id != excepto,
                    Usuario.estado == EstadoUsuario.ACTIVO,
                    Usuario.rol.has(Rol.codigo == CodigoRol.ADMINISTRADOR),
                )
            )
            or 0
        )

    def sumar_intento_fallido(self, usuario_id: UUID) -> int:
        """+1 al contador de un tirón en la base (UPDATE … RETURNING).

        Atómico a propósito: dos intentos al mismo tiempo no se pisan el conteo, que es
        justo lo que haría un ataque de fuerza bruta en paralelo.
        """
        intentos = self.db.scalar(
            update(Usuario)
            .where(Usuario.id == usuario_id)
            .values(intentos_fallidos=Usuario.intentos_fallidos + 1)
            .returning(Usuario.intentos_fallidos)
        )
        return int(intentos or 0)

    def bloquear(self, usuario_id: UUID, hasta: datetime) -> None:
        self.db.execute(
            update(Usuario)
            .where(Usuario.id == usuario_id)
            .values(intentos_fallidos=0, bloqueado_hasta=hasta)
        )
