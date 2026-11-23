"""El enchufe con el Space privado de Hugging Face (patrón Adaptador, RF-M01, RNF-29, RNF-30).

Contrato con el Space Fold 2 (lo implementa el equipo de ML):

    POST {HF_SPACE_URL}/clasificar
    Authorization: Bearer {HF_TOKEN}
    X-API-Key: {GASTROAI_API_KEY}
    multipart/form-data, campo «imagen» (JPEG o PNG ya sin metadatos)

    200 {"revision_sha": "d58d56d…", "checkpoint_sha256": "9e68072…",
         "predicciones": {"ATROFIA": {"probabilidad": 0.8734, "umbral": 0.5,
             "detectado": true, "region_roi": {"x": 74, "y": 52, "ancho": 43,
             "alto": 48, "area_pct": 14.2}, "mapa_calor_png_b64": "iVBORw0KGgo…"}, …}}

La caja viene en píxeles de la entrada de 240 × 240 y aquí se pasa a fracciones de 0 a 1.
`checkpoint_sha256` debe ser HF_SHA256 y `revision_sha` el del modelo vigente (RNF-29).

Todo lo que es del proveedor (httpx, Base64, nombres de campos) se queda aquí. El resto del
sistema recibe una `SalidaModelo` ya validada, con Decimal y los PNG en bytes.
Sin HTTPS no se llama (RNF-30): el token jamás viaja en claro.
"""

import base64
import binascii
import hashlib
import io
import warnings
from dataclasses import dataclass
from decimal import Decimal
from typing import Annotated, Protocol

import cv2
import httpx
import numpy as np
from PIL import Image
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.core.config import Settings
from app.models import FormatoImagen

FIRMA_PNG = b"\x89PNG\r\n\x1a\n"
MAPA_MAXIMO_BYTES = 5 * 1024 * 1024  # un Grad-CAM de 224 px pesa KB; 5 MB ya es sospechoso
MAPA_LADO_MAXIMO = 2048  # el Space los manda de 240 px; más de esto no es un mapa de calor
LADO_ENTRADA_SPACE = 240  # el Space Fold 2 redimensiona a 240 × 240 y da la caja en píxeles


class ErrorInferencia(Exception):
    """El Space no respondió, tardó más de 30 s o contestó algo que no cuadra.

    `codigo` va al LogInferencia (nunca al doctor): TIEMPO_AGOTADO, SIN_CONFIGURAR,
    NO_DISPONIBLE, RESPUESTA_INVALIDA, REVISION_DISTINTA o HUELLA_DISTINTA.
    """

    def __init__(self, codigo: str) -> None:
        super().__init__(codigo)
        self.codigo = codigo

    @property
    def tiempo_agotado(self) -> bool:
        return self.codigo == "TIEMPO_AGOTADO"


@dataclass(frozen=True)
class RegionDetectada:
    x: Decimal
    y: Decimal
    ancho: Decimal
    alto: Decimal
    area_pct: Decimal
    mapa_png: bytes


@dataclass(frozen=True)
class CaracteristicaDetectada:
    codigo: str
    probabilidad: Decimal
    regiones: list[RegionDetectada]


@dataclass(frozen=True)
class SalidaModelo:
    revision_sha: str
    latencia_ms: int | None
    caracteristicas: list[CaracteristicaDetectada]


class ServicioInferencia(Protocol):
    """Lo único que el worker sabe del modelo. En pruebas y en desarrollo va uno falso."""

    def clasificar(self, imagen: bytes, formato: FormatoImagen) -> SalidaModelo: ...


# --------------------------------------------------- lo que manda el Space, validado

Fraccion = Annotated[float, Field(ge=0, le=1)]


class _Region(BaseModel):
    x: Fraccion
    y: Fraccion
    ancho: Fraccion
    alto: Fraccion
    area_pct: Annotated[float, Field(ge=0, le=100)]
    mapa_calor_base64: str = Field(max_length=MAPA_MAXIMO_BYTES * 4 // 3 + 4)

    @model_validator(mode="after")
    def _cabe_en_la_imagen(self) -> "_Region":
        # Una caja que se sale de la imagen no es una región válida (margen por redondeo)
        if self.x + self.ancho > 1 + 1e-9 or self.y + self.alto > 1 + 1e-9:
            raise ValueError("la región se sale de la imagen")
        return self


class _Caracteristica(BaseModel):
    codigo: str = Field(min_length=1, max_length=40)
    probabilidad: Fraccion
    regiones: list[_Region] = Field(default=[], max_length=10)


class _Respuesta(BaseModel):
    revision_sha: str = Field(pattern=r"^[0-9a-fA-F]{40}$")
    latencia_ms: int | None = Field(default=None, ge=0)
    caracteristicas: list[_Caracteristica] = Field(min_length=1, max_length=20)


def _decimal(valor: float, decimales: str) -> Decimal:
    # Por texto pa no arrastrar la basura binaria del float (0.1 → 0.1000000000000000055…)
    return Decimal(str(valor)).quantize(Decimal(decimales))


def _mapa(texto: str) -> bytes:
    """Base64 → bytes de un PNG que de verdad se puede abrir.

    No basta con la firma: un PNG cortado o dañado la trae igual y terminaría guardado en
    MinIO como un mapa de calor vacío (defecto D-002, issue #240). Se revisan los bloques
    (verify) y se decodifican los píxeles (load); el tamaño queda acotado pa que un mapa
    inflado no se coma la memoria del worker.
    """
    try:
        datos = base64.b64decode(texto, validate=True)
    except (binascii.Error, ValueError):
        raise ErrorInferencia("RESPUESTA_INVALIDA") from None
    if not datos.startswith(FIRMA_PNG):
        raise ErrorInferencia("RESPUESTA_INVALIDA")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(datos)) as imagen:
                if imagen.format != "PNG" or max(imagen.size) > MAPA_LADO_MAXIMO:
                    raise ErrorInferencia("RESPUESTA_INVALIDA")
                imagen.verify()  # bloques y CRC
            with Image.open(io.BytesIO(datos)) as imagen:
                imagen.load()  # píxeles completos: un archivo truncado falla aquí
    except ErrorInferencia:
        raise
    except Exception:  # OSError, SyntaxError, bomba de descompresión…: todo es un mapa inválido
        raise ErrorInferencia("RESPUESTA_INVALIDA") from None
    return datos


def _desde_fold2(datos: dict) -> dict:
    """Formato del Space Fold 2 (`predicciones`) → formato interno (`caracteristicas`).

    El Space redimensiona la imagen a 240 × 240 sin recortar, así que dividir la caja en
    píxeles por 240 da la fracción de la imagen original. Cuando el Grad-CAM no marca nada
    manda una caja de 0 × 0: eso no es una región y no se guarda (si no, el doctor vería
    «Región 1» con 0 % de área). Su `umbral` y `detectado` se ignoran: el umbral que vale
    es el de RF-A01, que aplica el backend (ServicioClasificacion guarda la región solo si
    la característica lo supera).
    """
    predicciones = datos.get("predicciones")
    if not isinstance(predicciones, dict):
        raise ErrorInferencia("RESPUESTA_INVALIDA")
    caracteristicas = []
    for codigo, prediccion in predicciones.items():
        if not isinstance(prediccion, dict) or not isinstance(prediccion.get("region_roi"), dict):
            raise ErrorInferencia("RESPUESTA_INVALIDA")
        roi = prediccion["region_roi"]
        try:
            caja = {k: roi[k] / LADO_ENTRADA_SPACE for k in ("x", "y", "ancho", "alto")}
            regiones = []
            if caja["ancho"] > 0 and caja["alto"] > 0:
                regiones.append(
                    {
                        **caja,
                        "area_pct": roi["area_pct"],
                        "mapa_calor_base64": prediccion["mapa_calor_png_b64"],
                    }
                )
            caracteristicas.append(
                {"codigo": codigo, "probabilidad": prediccion["probabilidad"], "regiones": regiones}
            )
        except (KeyError, TypeError):
            raise ErrorInferencia("RESPUESTA_INVALIDA") from None
    return {
        "revision_sha": datos.get("revision_sha"),
        "latencia_ms": None,
        "caracteristicas": caracteristicas,
    }


def traducir(datos: object) -> SalidaModelo:
    """JSON del Space → SalidaModelo. Cualquier cosa fuera del contrato: RESPUESTA_INVALIDA.

    Acepta el formato del Space Fold 2 (`predicciones`) y el formato interno
    (`caracteristicas`), que usan el Space simulado y las pruebas.
    """
    if isinstance(datos, dict) and "predicciones" in datos:
        datos = _desde_fold2(datos)
    try:
        respuesta = _Respuesta.model_validate(datos)
    except ValidationError:
        raise ErrorInferencia("RESPUESTA_INVALIDA") from None
    codigos = [c.codigo for c in respuesta.caracteristicas]
    if len(set(codigos)) != len(codigos):
        raise ErrorInferencia("RESPUESTA_INVALIDA")
    return SalidaModelo(
        revision_sha=respuesta.revision_sha.lower(),
        latencia_ms=respuesta.latencia_ms,
        caracteristicas=[
            CaracteristicaDetectada(
                codigo=c.codigo,
                probabilidad=_decimal(c.probabilidad, "0.0001"),
                regiones=[
                    RegionDetectada(
                        x=_decimal(r.x, "0.0001"),
                        y=_decimal(r.y, "0.0001"),
                        ancho=_decimal(r.ancho, "0.0001"),
                        alto=_decimal(r.alto, "0.0001"),
                        area_pct=_decimal(r.area_pct, "0.01"),
                        mapa_png=_mapa(r.mapa_calor_base64),
                    )
                    for r in c.regiones
                ],
            )
            for c in respuesta.caracteristicas
        ],
    )


class AdaptadorHuggingFace:
    def __init__(
        self,
        url: str,
        token: str,
        timeout: float = 30.0,
        transporte: httpx.BaseTransport | None = None,  # pa las pruebas (MockTransport)
        api_key: str = "",
        sha256_esperado: str = "",
    ) -> None:
        self._url = url.rstrip("/")
        self._token = token
        self._timeout = timeout
        self._transporte = transporte
        self._api_key = api_key  # X-API-Key: la clave compartida con el Space
        self._sha256_esperado = sha256_esperado.lower()

    def clasificar(self, imagen: bytes, formato: FormatoImagen) -> SalidaModelo:
        if not self._url.startswith("https://") or not self._token or not self._api_key:
            raise ErrorInferencia("SIN_CONFIGURAR")  # RNF-30: sin HTTPS y token, ni lo intentamos
        nombre, tipo = (
            ("imagen.png", "image/png")
            if formato is FormatoImagen.PNG
            else ("imagen.jpg", "image/jpeg")
        )
        try:
            # follow_redirects=False: una redirección rara se llevaría el token a otro lado
            with httpx.Client(
                timeout=self._timeout, follow_redirects=False, transport=self._transporte
            ) as cliente:
                respuesta = cliente.post(
                    f"{self._url}/clasificar",
                    headers={"Authorization": f"Bearer {self._token}", "X-API-Key": self._api_key},
                    files={"imagen": (nombre, imagen, tipo)},
                )
        except httpx.TimeoutException:
            raise ErrorInferencia("TIEMPO_AGOTADO") from None
        except httpx.HTTPError:
            raise ErrorInferencia("NO_DISPONIBLE") from None
        if respuesta.status_code != 200:
            raise ErrorInferencia("NO_DISPONIBLE")
        try:
            datos = respuesta.json()
        except ValueError:
            raise ErrorInferencia("RESPUESTA_INVALIDA") from None
        if self._sha256_esperado:
            # RNF-29: los pesos cargados en el Space deben ser los del modelo aprobado
            huella = datos.get("checkpoint_sha256") if isinstance(datos, dict) else None
            if not isinstance(huella, str) or huella.lower() != self._sha256_esperado:
                raise ErrorInferencia("HUELLA_DISTINTA")
        return traducir(datos)

    def salud(self, timeout: float = 3.0) -> str | None:
        """Pa el panel de supervisión (RF-A04): GET a la raíz del Space, con el token.

        Si contesta 200 está vivo. Devuelve la revisión que informe el Space (`revision_sha`)
        o None si no la manda. No responde → ErrorInferencia, igual que `clasificar`.
        """
        if not self._url.startswith("https://") or not self._token:
            raise ErrorInferencia("SIN_CONFIGURAR")
        try:
            with httpx.Client(
                timeout=timeout, follow_redirects=False, transport=self._transporte
            ) as cliente:
                respuesta = cliente.get(
                    f"{self._url}/", headers={"Authorization": f"Bearer {self._token}"}
                )
        except httpx.TimeoutException:
            raise ErrorInferencia("TIEMPO_AGOTADO") from None
        except httpx.HTTPError:
            raise ErrorInferencia("NO_DISPONIBLE") from None
        if respuesta.status_code != 200:
            raise ErrorInferencia("NO_DISPONIBLE")
        try:
            datos = respuesta.json()
        except ValueError:
            return None
        revision = datos.get("revision_sha") if isinstance(datos, dict) else None
        return revision.lower() if isinstance(revision, str) and revision else None


class InferenciaSimulada:
    """Un Space de cartón SOLO pa desarrollo, mientras ML publica el de verdad.

    Saca probabilidades fijas a partir del SHA-256 de la imagen (la misma imagen siempre da
    lo mismo) y pinta un mapa de calor de mentiras. Contesta con la revisión configurada
    pa pasar el chequeo de RNF-29. Nunca arranca fuera de ENVIRONMENT=development.
    """

    def __init__(self, revision: str, codigos: tuple[str, ...]) -> None:
        self._revision = revision.lower()
        self._codigos = codigos

    def clasificar(self, imagen: bytes, formato: FormatoImagen) -> SalidaModelo:
        caracteristicas = []
        for codigo in self._codigos:
            # Una huella por característica: misma imagen, mismo resultado, sin límite de códigos
            huella = hashlib.sha256(imagen + codigo.encode()).digest()
            probabilidad = Decimal(huella[0] * 9999 // 255).scaleb(-4)  # 0.0000 a 0.9999
            regiones = []
            if probabilidad >= Decimal("0.3"):
                x = Decimal(huella[1] % 50).scaleb(-2)  # 0.00–0.49
                y = Decimal(huella[2] % 50).scaleb(-2)
                ancho = Decimal(20 + huella[3] % 30).scaleb(-2)  # 0.20–0.49
                alto = Decimal(20 + huella[4] % 30).scaleb(-2)
                regiones.append(
                    RegionDetectada(
                        x,
                        y,
                        ancho,
                        alto,
                        (ancho * alto * 100).quantize(Decimal("0.01")),
                        _mapa_falso(float(x + ancho / 2), float(y + alto / 2)),
                    )
                )
            caracteristicas.append(CaracteristicaDetectada(codigo, probabilidad, regiones))
        return SalidaModelo(self._revision, 0, caracteristicas)

    def salud(self, timeout: float = 3.0) -> str | None:
        return self._revision  # el de cartón siempre está vivo


def _mapa_falso(cx: float, cy: float, lado: int = 224) -> bytes:
    """Mancha gaussiana con la paleta JET, como se ve un Grad-CAM de verdad."""
    yy, xx = np.mgrid[0:lado, 0:lado] / lado
    intensidad = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / 0.02)
    color = cv2.applyColorMap((intensidad * 255).astype(np.uint8), cv2.COLORMAP_JET)
    salida = io.BytesIO()
    Image.fromarray(cv2.cvtColor(color, cv2.COLOR_BGR2RGB)).save(salida, format="PNG")
    return salida.getvalue()


def crear_inferencia(settings: Settings, codigos: tuple[str, ...]) -> ServicioInferencia:
    """El de verdad, o el simulado si HF_SIMULADO=true y estamos en desarrollo."""
    if settings.hf_simulado:
        if settings.environment != "development":
            raise RuntimeError("HF_SIMULADO solo se permite con ENVIRONMENT=development")
        return InferenciaSimulada(settings.hf_revision, codigos)
    return AdaptadorHuggingFace(
        settings.hf_space_url,
        settings.hf_token.get_secret_value(),
        settings.http_timeout_seconds,
        api_key=settings.gastroai_api_key.get_secret_value(),
        sha256_esperado=settings.hf_sha256,
    )
