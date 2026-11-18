"""Las pruebas unitarias no pueden abrir conexiones con servicios externos."""
import socket

import pytest


@pytest.fixture(autouse=True)
def bloquear_red(monkeypatch):
    def rechazar(*args, **kwargs):
        raise AssertionError("Una prueba unitaria intentó abrir una conexión de red")

    monkeypatch.setattr(socket.socket, "connect", rechazar)
    monkeypatch.setattr(socket.socket, "connect_ex", rechazar)
    monkeypatch.setattr(socket, "create_connection", rechazar)
