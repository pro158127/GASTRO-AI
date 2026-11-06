"""Crea el bucket de imágenes en MinIO si todavía no existe.

Uso: python -m scripts.init_storage
Se puede correr las veces que quieras; si el bucket ya está, solo avisa y ya. Existe
porque MinIO ya no publica el cliente mc, así que lo hacemos a mano con boto3.
"""

from app.adapters.almacen import crear_almacen
from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    if crear_almacen(settings).asegurar_bucket():
        print(f"Bucket '{settings.s3_bucket}' creado")
    else:
        print(f"El bucket '{settings.s3_bucket}' ya existe")


if __name__ == "__main__":
    main()
