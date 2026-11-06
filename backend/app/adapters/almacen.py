"""Almacén de archivos en MinIO por la API S3 (imágenes, mapas de calor y PDF).

Dos clientes, misma llave:
- `_interno` habla con MinIO por la red de Docker (minio:9000): subir, leer, ping.
- `_publico` solo FIRMA URL con el host que sí alcanza el navegador (localhost:9000 o el
  dominio de verdad). Firmar no hace ninguna llamada de red, así que no importa que ese
  host no exista dentro del contenedor.
La firma S3v4 incluye el host: por eso no sirve firmar con uno y reescribir la URL después.
"""

from typing import Protocol

import boto3
from botocore.client import BaseClient, Config
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import Settings

# Región fija: MinIO no la usa, pero sin ella boto3 se pone a averiguarla por la red
REGION = "us-east-1"


class ErrorAlmacen(Exception):
    """MinIO no respondió o rechazó la operación. Mensaje genérico a propósito (CWE-209)."""


class Almacen(Protocol):
    """Lo único que el resto del sistema sabe del almacén. En pruebas va uno en memoria."""

    def subir(self, clave: str, datos: bytes, tipo_contenido: str) -> None: ...

    def leer(self, clave: str) -> bytes: ...

    def url_firmada(self, clave: str) -> str: ...


def _cliente(endpoint: str, settings: Settings) -> BaseClient:
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=REGION,
        # path-style: MinIO no tiene DNS por bucket (bucket.minio:9000 no existe)
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


class AlmacenS3:
    def __init__(self, interno: BaseClient, publico: BaseClient, bucket: str, segundos: int):
        self._interno = interno
        self._publico = publico
        self._bucket = bucket
        self._segundos = segundos

    def subir(self, clave: str, datos: bytes, tipo_contenido: str) -> None:
        try:
            self._interno.put_object(
                Bucket=self._bucket, Key=clave, Body=datos, ContentType=tipo_contenido
            )
        except (BotoCoreError, ClientError) as error:
            raise ErrorAlmacen("No se pudo guardar el archivo.") from error

    def leer(self, clave: str) -> bytes:
        try:
            respuesta = self._interno.get_object(Bucket=self._bucket, Key=clave)
            return respuesta["Body"].read()
        except (BotoCoreError, ClientError) as error:
            raise ErrorAlmacen("No se pudo leer el archivo.") from error

    def url_firmada(self, clave: str) -> str:
        """URL de solo lectura que vence en S3_URL_FIRMADA_SEGUNDOS. Nunca una URL pública fija."""
        return self._publico.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": clave},
            ExpiresIn=self._segundos,
        )

    def disponible(self) -> bool:
        """Pa el panel de salud (RF-A04): ¿responde MinIO y existe el bucket?"""
        try:
            self._interno.head_bucket(Bucket=self._bucket)
            return True
        except (BotoCoreError, ClientError):
            return False

    def asegurar_bucket(self) -> bool:
        """Crea el bucket si falta. Devuelve True si lo tuvo que crear."""
        try:
            self._interno.head_bucket(Bucket=self._bucket)
            return False
        except ClientError:
            self._interno.create_bucket(Bucket=self._bucket)
            return True


def crear_almacen(settings: Settings) -> AlmacenS3:
    interno = _cliente(settings.s3_endpoint_url, settings)
    publico_url = settings.s3_public_endpoint_url or settings.s3_endpoint_url
    publico = (
        interno if publico_url == settings.s3_endpoint_url else _cliente(publico_url, settings)
    )
    return AlmacenS3(interno, publico, settings.s3_bucket, settings.s3_url_firmada_segundos)
