"""Adaptador del correo saliente (SMTP con TLS). Lo usa el envío de contraseñas temporales.

El resto del sistema solo ve `EnviadorCorreo.enviar`. Si el SMTP se cae o se demora,
sale ErrorCorreo y quien llama decide (RF-U05 CA 9: la cuenta queda creada y se reintenta).
OJO: el cuerpo lleva la contraseña temporal, así que jamás se registra en el log.

En desarrollo el compose trae Mailpit: atrapa todo y lo muestra en http://localhost:8025.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger("gastroia")


class ErrorCorreo(Exception):
    """El correo no salió. Mensaje genérico; la causa queda en __cause__ (no en el log)."""


class EnviadorCorreo(Protocol):
    def enviar(self, destino: str, asunto: str, texto: str) -> None: ...


class EnviadorSmtp:
    def __init__(
        self,
        host: str,
        puerto: int,
        usuario: str,
        contrasena: str,
        remitente: str,
        starttls: bool,
        timeout: float,
    ) -> None:
        self._host, self._puerto = host, puerto
        self._usuario, self._contrasena = usuario, contrasena
        self._remitente, self._starttls, self._timeout = remitente, starttls, timeout

    def enviar(self, destino: str, asunto: str, texto: str) -> None:
        mensaje = EmailMessage()
        mensaje["From"] = self._remitente
        mensaje["To"] = destino
        mensaje["Subject"] = asunto
        mensaje.set_content(texto)
        try:
            with smtplib.SMTP(self._host, self._puerto, timeout=self._timeout) as smtp:
                if self._starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if self._usuario:
                    smtp.login(self._usuario, self._contrasena)
                smtp.send_message(mensaje)
        except (OSError, smtplib.SMTPException) as error:
            # Solo el tipo de error: el destinatario y el cuerpo no van al log
            logger.warning("No salió un correo: %s", type(error).__name__)
            raise ErrorCorreo("No se pudo enviar el correo.") from error

    def salud(self, timeout: float = 3.0) -> None:
        """Pa el panel de supervisión (RF-A04): conecta, saluda y entra, sin mandar nada."""
        try:
            with smtplib.SMTP(self._host, self._puerto, timeout=timeout) as smtp:
                if self._starttls:
                    smtp.starttls(context=ssl.create_default_context())
                if self._usuario:
                    smtp.login(self._usuario, self._contrasena)
                smtp.noop()
        except (OSError, smtplib.SMTPException) as error:
            raise ErrorCorreo("El servidor de correo no responde.") from error


def crear_enviador(settings: Settings) -> EnviadorSmtp:
    return EnviadorSmtp(
        host=settings.smtp_host,
        puerto=settings.smtp_port,
        usuario=settings.smtp_usuario,
        contrasena=settings.smtp_contrasena.get_secret_value(),
        remitente=settings.smtp_remitente,
        starttls=settings.smtp_starttls,
        timeout=settings.smtp_timeout_seconds,
    )
