"""Consulta previa al análisis: ¿este doctor ya tiene historial de ese paciente? (RF-D01).

El documento entra, se normaliza, se convierte en seudónimos y se olvida: no se guarda,
no va al log y no sale en la respuesta (RNF-04). La consulta solo cuenta los casos del
doctor que pregunta, así que no confirma si el paciente existe con otros (RF-H01 CA 5).
nginx le pone límite por IP pa que nadie la use pa adivinar documentos.
"""

from app.core.errores import ErrorApi
from app.core.seudonimo import DocumentoInvalido, Seudonimizador, normalizar
from app.models import Usuario
from app.repositories.pacientes_repository import HistorialPaciente, RepositorioPacientes


class ServicioPacientes:
    def __init__(self, pacientes: RepositorioPacientes, seudonimizador: Seudonimizador) -> None:
        self._pacientes = pacientes
        self._seudonimizador = seudonimizador

    def consultar(self, doctor: Usuario, tipo: str, numero: str) -> HistorialPaciente:
        try:
            valor = normalizar(tipo, numero)
        except DocumentoInvalido as error:
            raise ErrorApi(
                422,
                "DOCUMENTO_INVALIDO",
                str(error),
                [{"campo": error.campo, "mensaje": str(error)}],
            ) from None  # sin encadenar: la excepción no debe arrastrar el número
        return self._pacientes.historial(doctor.id, self._seudonimizador.todos(valor))
