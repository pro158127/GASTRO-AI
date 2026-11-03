import io
from datetime import timedelta

from minio import Minio

from app.config import settings


class MinioAdapter:
    """Wrapper around the MinIO S3-compatible client."""

    def __init__(self) -> None:
        self.client = self._build_client(settings.minio_endpoint)
        self.public_client = (
            self._build_client(settings.minio_public_endpoint)
            if settings.minio_public_endpoint
            else self.client
        )

    def _build_client(self, endpoint: str) -> Minio:
        return Minio(
            endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
            region="us-east-1",
        )

    def ping(self) -> bool:
        try:
            return self.client.bucket_exists(settings.minio_bucket)
        except Exception:
            return False

    def ensure_bucket(self) -> None:
        if not self.client.bucket_exists(settings.minio_bucket):
            self.client.make_bucket(settings.minio_bucket)

    def put_bytes(self, object_name: str, data: bytes, content_type: str) -> str:
        self.client.put_object(
            settings.minio_bucket,
            object_name,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return object_name

    def presigned_get(self, object_name: str, expires_seconds: int = 300) -> str:
        return self.public_client.presigned_get_object(
            settings.minio_bucket,
            object_name,
            expires=timedelta(seconds=expires_seconds),
        )


minio_adapter = MinioAdapter()
