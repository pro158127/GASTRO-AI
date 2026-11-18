"""RNF-20/#208: carga y limpieza reales con imágenes sintéticas, sin servicios."""
import hashlib
import io
import socket
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from PIL import Image, PngImagePlugin

from app.core.errores import ErrorApi
from app.services.imagenes import ServicioImagenes
from app.services.verificadores_imagen import ImagenCandidata, construir_cadena, limpiar


@pytest.fixture(autouse=True)
def sin_red(monkeypatch):
    def prohibida(*args, **kwargs):
        raise AssertionError("Las pruebas de imágenes no pueden acceder a la red")
    monkeypatch.setattr(socket.socket, "connect", prohibida)
    monkeypatch.setattr(socket.socket, "connect_ex", prohibida)
    monkeypatch.setattr(socket, "create_connection", prohibida)


def imagen(formato="PNG", dimensiones=(224, 224), metadatos=False):
    salida = io.BytesIO()
    opciones = {}
    if metadatos:
        exif = Image.Exif()
        exif[270] = "MARCADOR_SINTETICO_QA"
        opciones.update(exif=exif, icc_profile=b"PERFIL_SINTETICO_QA")
        if formato == "PNG":
            texto = PngImagePlugin.PngInfo()
            texto.add_text("Comentario", "MARCADOR_SINTETICO_QA")
            opciones["pnginfo"] = texto
    Image.new("RGB", dimensiones, (40, 100, 160)).save(salida, formato, **opciones)
    return salida.getvalue()


def verificar_error(contenido, estado, codigo):
    with pytest.raises(ErrorApi) as capturado:
        construir_cadena().verificar(ImagenCandidata(contenido))
    assert (capturado.value.estado, capturado.value.codigo) == (estado, codigo)


@pytest.mark.parametrize("formato", ["JPEG", "PNG"])
@pytest.mark.parametrize("dimensiones", [(224, 224), (225, 300)])
def test_acepta_formatos_y_resolucion_minima(formato, dimensiones):
    candidata = ImagenCandidata(imagen(formato, dimensiones))
    construir_cadena().verificar(candidata)
    assert candidata.formato.value == formato
    assert candidata.imagen.size == dimensiones


@pytest.mark.parametrize("formato", ["GIF", "BMP", "TIFF"])
def test_rechaza_formato_real_aunque_nombre_sea_jpeg(formato):
    # BytesIO representa una carga con nombre engañoso; el servicio recibe solo bytes.
    archivo = io.BytesIO(imagen(formato))
    archivo.name = "imagen-sintetica.jpg"
    verificar_error(archivo.read(), 415, "IMAGEN_FORMATO_NO_PERMITIDO")


@pytest.mark.parametrize("extra", [0, 1], ids=["limite-10-MiB", "supera-10-MiB"])
def test_limite_de_peso(extra):
    original = imagen("JPEG")
    contenido = original + b"\0" * (10 * 1024 * 1024 + extra - len(original))
    if extra:
        verificar_error(contenido, 413, "IMAGEN_DEMASIADO_PESADA")
    else:
        candidata = ImagenCandidata(contenido)
        construir_cadena().verificar(candidata)
        assert candidata.imagen.size == (224, 224)


@pytest.mark.parametrize("dimensiones", [(223, 224), (224, 223), (223, 223)])
def test_rechaza_dimensiones_inferiores(dimensiones):
    verificar_error(imagen(dimensiones=dimensiones), 422, "IMAGEN_RESOLUCION_INSUFICIENTE")


@pytest.mark.parametrize("formato", ["JPEG", "PNG"])
def test_rechaza_imagen_truncada(formato):
    contenido = imagen(formato)
    # Conserva cabecera reconocible y corta datos del final, no simula el decodificador.
    verificar_error(contenido[:-100], 422, "IMAGEN_ILEGIBLE")


def test_rechaza_archivo_no_decodificable():
    verificar_error(b"NO_ES_UNA_IMAGEN", 415, "IMAGEN_FORMATO_NO_PERMITIDO")


@pytest.mark.parametrize("formato", ["JPEG", "PNG"])
def test_limpieza_elimina_metadatos_sin_destruir_imagen(formato):
    contenido = imagen(formato, metadatos=True)
    with Image.open(io.BytesIO(contenido)) as original:
        assert original.getexif()[270] == "MARCADOR_SINTETICO_QA"
        assert original.info["icc_profile"] == b"PERFIL_SINTETICO_QA"
        if formato == "PNG":
            assert original.info["Comentario"] == "MARCADOR_SINTETICO_QA"
    candidata = ImagenCandidata(contenido)
    construir_cadena().verificar(candidata)
    limpia = limpiar(candidata)
    with Image.open(io.BytesIO(limpia)) as resultado:
        resultado.load()
        assert resultado.size == (224, 224)
        assert resultado.format == formato
        assert not resultado.getexif()
        assert not any(k in resultado.info for k in ("icc_profile", "Comentario", "exif"))
    assert b"MARCADOR_SINTETICO_QA" not in limpia
    assert b"PERFIL_SINTETICO_QA" not in limpia


class AlmacenMemoria:
    def __init__(self):
        self.objetos = {}
        self.consultas = []

    def subir(self, clave, contenido, tipo, metadatos):
        self.objetos[clave] = (contenido, tipo, dict(metadatos))

    def metadatos(self, clave):
        self.consultas.append(clave)
        objeto = self.objetos.get(clave)
        return None if objeto is None else dict(objeto[2])


@pytest.fixture
def entorno():
    ahora = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
    almacen = AlmacenMemoria()
    servicio = ServicioImagenes(construir_cadena(), almacen, timedelta(minutes=15), lambda: ahora[0])
    return servicio, almacen, ahora, UUID(int=1)


@pytest.mark.parametrize("formato,tipo", [("JPEG", "image/jpeg"), ("PNG", "image/png")])
def test_carga_temporal_propietario_vigencia_y_contenido(entorno, formato, tipo):
    servicio, almacen, ahora, doctor = entorno
    temporal = servicio.cargar(doctor, imagen(formato, metadatos=True))
    assert temporal.propietario_id == doctor
    assert temporal.expira_en == ahora[0] + timedelta(minutes=15)
    assert (temporal.ancho, temporal.alto) == (224, 224)
    assert temporal.clave.startswith("tmp/")
    guardada, mime, datos = almacen.objetos[temporal.clave]
    assert mime == tipo
    assert datos["propietario"] == str(doctor)
    assert datetime.fromisoformat(datos["expira"]) == temporal.expira_en
    assert temporal.sha256 == hashlib.sha256(guardada).hexdigest()
    assert temporal.peso_bytes == len(guardada)
    assert b"MARCADOR_SINTETICO_QA" not in guardada
    assert servicio.tomar(doctor, temporal.imagen_id) == temporal


def test_carga_rechazada_no_almacena(entorno):
    servicio, almacen, _, doctor = entorno
    with pytest.raises(ErrorApi) as capturado:
        servicio.cargar(doctor, imagen("GIF"))
    assert capturado.value.codigo == "IMAGEN_FORMATO_NO_PERMITIDO"
    assert almacen.objetos == {}


def test_otro_doctor_no_accede(entorno):
    servicio, _, _, doctor = entorno
    temporal = servicio.cargar(doctor, imagen())
    with pytest.raises(ErrorApi) as capturado:
        servicio.tomar(UUID(int=2), temporal.imagen_id)
    assert (capturado.value.estado, capturado.value.codigo) == (404, "NO_ENCONTRADO")


@pytest.mark.parametrize("identificador", ["", "../objeto", "tmp_" + "0" * 25, "tmp_" + "0" * 26 + "/otro"])
def test_identificador_invalido_no_consulta_almacen(entorno, identificador):
    servicio, almacen, _, doctor = entorno
    with pytest.raises(ErrorApi) as capturado:
        servicio.tomar(doctor, identificador)
    assert (capturado.value.estado, capturado.value.codigo) == (410, "IMAGEN_EXPIRADA")
    assert almacen.consultas == []


@pytest.mark.parametrize("segundos", [-1, 0, 1], ids=["vigente", "limite", "vencida"])
def test_caducidad_temporal(entorno, segundos):
    servicio, _, ahora, doctor = entorno
    temporal = servicio.cargar(doctor, imagen())
    ahora[0] = temporal.expira_en + timedelta(seconds=segundos)
    if segundos < 0:
        assert servicio.tomar(doctor, temporal.imagen_id) == temporal
    else:
        with pytest.raises(ErrorApi) as capturado:
            servicio.tomar(doctor, temporal.imagen_id)
        assert (capturado.value.estado, capturado.value.codigo) == (410, "IMAGEN_EXPIRADA")


def test_imagen_inexistente(entorno):
    servicio, _, _, doctor = entorno
    with pytest.raises(ErrorApi) as capturado:
        servicio.tomar(doctor, "tmp_" + "0" * 26)
    assert (capturado.value.estado, capturado.value.codigo) == (410, "IMAGEN_EXPIRADA")


@pytest.mark.parametrize("campo,valor", [("peso", "no-numero"), ("expira", None)])
def test_metadatos_incompletos_o_invalidos(entorno, campo, valor):
    servicio, almacen, _, doctor = entorno
    temporal = servicio.cargar(doctor, imagen())
    datos = almacen.objetos[temporal.clave][2]
    if valor is None:
        del datos[campo]
    else:
        datos[campo] = valor
    with pytest.raises(ErrorApi) as capturado:
        servicio.tomar(doctor, temporal.imagen_id)
    assert (capturado.value.estado, capturado.value.codigo) == (410, "IMAGEN_EXPIRADA")
