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


# Área temporal de POST /imagenes: lo que no se usa en un día lo barre MinIO solito
PREFIJO_TEMPORAL = "tmp/"
DIAS_TEMPORAL = 1  # S3 cuenta el ciclo de vida en días; el vencimiento fino lo revisa la API


class Almacen(Protocol):
    """Lo único que el resto del sistema sabe del almacén. En pruebas va uno en memoria."""

    def subir(
        self,
        clave: str,
        datos: bytes,
        tipo_contenido: str,
        metadatos: dict[str, str] | None = None,
    ) -> None: ...

    def leer(self, clave: str) -> bytes: ...

    def metadatos(self, clave: str) -> dict[str, str] | None: ...

    def copiar(self, origen: str, destino: str) -> None: ...

    def borrar(self, clave: str) -> None: ...

    def url_firmada(self, clave: str) -> str: ...


def _codigo(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


def _no_existe(error: ClientError) -> bool:
    """El objeto no existe (head_object / get_object)."""
    return _codigo(error) in {"404", "NoSuchKey", "NotFound"}


def _bucket_no_existe(error: ClientError) -> bool:
    """El bucket no existe. Solo estos códigos autorizan crearlo; NoSuchKey es de objetos."""
    return _codigo(error) in {"404", "NoSuchBucket", "NotFound"}


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

    def subir(
        self,
        clave: str,
        datos: bytes,
        tipo_contenido: str,
        metadatos: dict[str, str] | None = None,
    ) -> None:
        """Sube el objeto. Los metadatos van como x-amz-meta-* (solo ASCII, ojo)."""
        try:
            self._interno.put_object(
                Bucket=self._bucket,
                Key=clave,
                Body=datos,
                ContentType=tipo_contenido,
                Metadata=metadatos or {},
            )
        except (BotoCoreError, ClientError) as error:
            raise ErrorAlmacen("No se pudo guardar el archivo.") from error

    def metadatos(self, clave: str) -> dict[str, str] | None:
        """Los x-amz-meta-* del objeto, o None si no existe (ya venció o nunca estuvo)."""
        try:
            respuesta = self._interno.head_object(Bucket=self._bucket, Key=clave)
        except ClientError as error:
            if _no_existe(error):
                return None
            raise ErrorAlmacen("No se pudo leer el archivo.") from error
        except BotoCoreError as error:
            raise ErrorAlmacen("No se pudo leer el archivo.") from error
        return dict(respuesta.get("Metadata", {}))

    def copiar(self, origen: str, destino: str) -> None:
        """Copia dentro del mismo bucket, sin bajar el archivo a la API."""
        try:
            self._interno.copy_object(
                Bucket=self._bucket,
                Key=destino,
                CopySource={"Bucket": self._bucket, "Key": origen},
                MetadataDirective="REPLACE",  # el destino no hereda los metadatos de tmp/
                ContentType="image/png" if destino.endswith(".png") else "image/jpeg",
            )
        except (BotoCoreError, ClientError) as error:
            raise ErrorAlmacen("No se pudo guardar el archivo.") from error

    def borrar(self, clave: str) -> None:
        """Borra el objeto. Si ya no estaba, S3 no se queja y nosotros tampoco."""
        try:
            self._interno.delete_object(Bucket=self._bucket, Key=clave)
        except (BotoCoreError, ClientError) as error:
            raise ErrorAlmacen("No se pudo borrar el archivo.") from error

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
        """Crea el bucket si falta. Devuelve True si lo tuvo que crear.

        Solo se crea cuando S3 confirma que no existe (404). Un acceso denegado (403), un
        error del servidor o una falla de conexión no prueban que falte: se lanza
        ErrorAlmacen sin intentar crearlo, pa no esconder un problema de permisos.
        """
        try:
            self._interno.head_bucket(Bucket=self._bucket)
            return False
        except ClientError as error:
            if not _bucket_no_existe(error):
                raise ErrorAlmacen("No se pudo consultar el bucket.") from error
        except BotoCoreError as error:
            raise ErrorAlmacen("No se pudo consultar el bucket.") from error
        try:
            self._interno.create_bucket(Bucket=self._bucket)
        except (BotoCoreError, ClientError) as error:
            raise ErrorAlmacen("No se pudo crear el bucket.") from error
        return True

    def asegurar_limpieza_temporal(self) -> None:
        """Regla de ciclo de vida: lo de tmp/ se borra solo a los DIAS_TEMPORAL días.

        Es la red de seguridad pa las imágenes que el doctor cargó y nunca analizó; el
        vencimiento de verdad (IMAGEN_TEMPORAL_MINUTOS) lo revisa la API al usarlas.
        """
        self._interno.put_bucket_lifecycle_configuration(
            Bucket=self._bucket,
            LifecycleConfiguration={
                "Rules": [
                    {
                        "ID": "borrar-temporales",
                        "Status": "Enabled",
                        "Filter": {"Prefix": PREFIJO_TEMPORAL},
                        "Expiration": {"Days": DIAS_TEMPORAL},
                    }
                ]
            },
        )


def crear_almacen(settings: Settings) -> AlmacenS3:
    interno = _cliente(settings.s3_endpoint_url, settings)
    publico_url = settings.s3_public_endpoint_url or settings.s3_endpoint_url
    publico = (
        interno if publico_url == settings.s3_endpoint_url else _cliente(publico_url, settings)
    )
    return AlmacenS3(interno, publico, settings.s3_bucket, settings.s3_url_firmada_segundos)
