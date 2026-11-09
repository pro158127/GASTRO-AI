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


def documento_normalizado(tipo: str, numero: str, campo_numero: str = "numero_documento") -> str:
    """«CC:1234567890» o 422 DOCUMENTO_INVALIDO con el campo que falló (W-06e).

    `campo_numero` cambia cuando lo que se valida es la confirmación del número.
    """
    try:
        return normalizar(tipo, numero)
    except DocumentoInvalido as error:
        campo = campo_numero if error.campo == "numero_documento" else error.campo
        raise ErrorApi(
            422,
            "DOCUMENTO_INVALIDO",
            str(error),
            [{"campo": campo, "mensaje": str(error)}],
        ) from None  # sin encadenar: la excepción no debe arrastrar el número


class ServicioPacientes:
    def __init__(self, pacientes: RepositorioPacientes, seudonimizador: Seudonimizador) -> None:
        self._pacientes = pacientes
        self._seudonimizador = seudonimizador

    def consultar(self, doctor: Usuario, tipo: str, numero: str) -> HistorialPaciente:
        valor = documento_normalizado(tipo, numero)
        return self._pacientes.historial(doctor.id, self._seudonimizador.todos(valor))
