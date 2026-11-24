"""Respaldo y restauración de la aplicación (RNF-26).

Qué se respalda y cómo (lo orquestan backend/scripts/respaldar.sh y restaurar.sh):

- **Base de datos:** `pg_dump` desde el contenedor de Postgres. Trae cuentas, análisis,
  bitácora, logs de inferencia, métricas y la configuración del modelo desplegado.
- **Archivos de MinIO:** imágenes y mapas de calor en un .tar (`exportar_archivos`), con
  el tipo, los metadatos y la huella SHA-256 de cada uno en `indice.json`. Lo de `tmp/`
  no va: son cargas sin analizar que vencen solas a los 30 minutos.
- **Pesos del modelo** (opcional): se bajan de Hugging Face con la revisión fija y se
  comprueba que la huella sea `HF_SHA256` antes de guardarlos.
- **Manifiesto:** conteos por tabla, una huella de la bitácora entera y el modelo vigente.
  Al restaurar se vuelve a calcular y se compara: así se demuestra que no se perdió nada y
  que la bitácora quedó igual, entrada por entrada (RNF-05).

Nada de esto pasa por la API ni por un endpoint: corre a mano o por cron en el servidor.
"""

import hashlib
import io
import json
import tarfile
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import BinaryIO, Protocol

from app.adapters.almacen import PREFIJO_TEMPORAL, ArchivoCompleto, ObjetoGuardado
from app.models import Bitacora
from app.repositories.respaldo_repository import RepositorioRespaldo

FORMATO = 1
INDICE = "indice.json"
# En el .tar el tipo y los metadatos de cada objeto van como cabeceras PAX propias
PAX_TIPO = "GASTROAI.tipo"
PAX_META = "GASTROAI.metadatos"


class ErrorRespaldo(Exception):
    pass


class AlmacenRespaldable(Protocol):
    def listar(self) -> Iterator[ObjetoGuardado]: ...

    def descargar(self, clave: str) -> ArchivoCompleto: ...

    def subir(
        self, clave: str, datos: bytes, tipo_contenido: str, metadatos: dict[str, str] | None
    ) -> None: ...

    def asegurar_bucket(self) -> bool: ...


# ------------------------------------------------------------------ base de datos


def _renglon(b: Bitacora) -> str:
    """Una entrada de la bitácora en texto canónico: mismo dato → mismo texto, siempre."""
    return json.dumps(
        [
            b.id,
            str(b.actor_id) if b.actor_id else None,
            b.accion.value,
            b.resultado.value,
            b.entidad,
            b.entidad_id,
            b.detalle,
            b.ip,
            b.ocurrido_en.astimezone(UTC).isoformat(),
        ],
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def estado_base(repo: RepositorioRespaldo) -> dict:
    """Conteos, huella de la bitácora y modelo vigente: lo que debe quedar igual al restaurar."""
    huella, filas, ultimo = hashlib.sha256(), 0, None
    for entrada in repo.bitacora():
        huella.update(_renglon(entrada).encode("utf-8") + b"\n")
        filas, ultimo = filas + 1, entrada.id
    modelo = repo.modelo_vigente()
    return {
        "conteos": repo.conteos(),
        "bitacora": {"filas": filas, "ultimo_id": ultimo, "huella_sha256": huella.hexdigest()},
        "modelo_vigente": {
            "repositorio_hf": modelo.repositorio_hf,
            "revision_sha": modelo.revision_sha,
            "huella_pesos_sha256": modelo.huella_pesos_sha256,
        }
        if modelo
        else None,
    }


# ------------------------------------------------------------------ archivos


def _respaldables(almacen: AlmacenRespaldable) -> Iterator[ObjetoGuardado]:
    return (o for o in almacen.listar() if not o.clave.startswith(PREFIJO_TEMPORAL))


def _resumen(archivos: list[dict]) -> dict:
    huella = hashlib.sha256()
    for a in sorted(archivos, key=lambda a: a["clave"]):
        huella.update(f"{a['clave']}\0{a['sha256']}\n".encode())
    return {
        "cantidad": len(archivos),
        "bytes": sum(a["bytes"] for a in archivos),
        "huella_sha256": huella.hexdigest(),
    }


def exportar_archivos(almacen: AlmacenRespaldable, salida: BinaryIO) -> dict:
    """Escribe el .tar de los archivos en `salida` (un stream: sirve con stdout). Resumen."""
    archivos = []
    with tarfile.open(fileobj=salida, mode="w|", format=tarfile.PAX_FORMAT) as tar:
        for obj in _respaldables(almacen):
            archivo = almacen.descargar(obj.clave)
            info = tarfile.TarInfo(obj.clave)
            info.size = len(archivo.datos)
            info.mtime = 0  # el mismo contenido da el mismo .tar
            info.pax_headers = {
                PAX_TIPO: archivo.tipo_contenido,
                PAX_META: json.dumps(archivo.metadatos, sort_keys=True),
            }
            tar.addfile(info, io.BytesIO(archivo.datos))
            archivos.append(
                {
                    "clave": obj.clave,
                    "bytes": len(archivo.datos),
                    "sha256": hashlib.sha256(archivo.datos).hexdigest(),
                }
            )
        resumen = _resumen(archivos)
        indice = json.dumps({"formato": FORMATO, "resumen": resumen, "archivos": archivos})
        info = tarfile.TarInfo(INDICE)
        info.size = len(indice.encode("utf-8"))
        tar.addfile(info, io.BytesIO(indice.encode("utf-8")))
    return resumen


def importar_archivos(almacen: AlmacenRespaldable, entrada: BinaryIO) -> dict:
    """Sube a MinIO lo de un .tar de `exportar_archivos` y comprueba cada huella."""
    almacen.asegurar_bucket()
    vistos: dict[str, str] = {}
    indice = None
    with tarfile.open(fileobj=entrada, mode="r|") as tar:
        for info in tar:
            if not info.isfile():
                continue
            datos = tar.extractfile(info).read()
            if info.name == INDICE:
                indice = json.loads(datos)
                continue
            almacen.subir(
                info.name,
                datos,
                info.pax_headers.get(PAX_TIPO, "application/octet-stream"),
                json.loads(info.pax_headers.get(PAX_META, "{}")),
            )
            vistos[info.name] = hashlib.sha256(datos).hexdigest()
    if indice is None:
        raise ErrorRespaldo(f"El archivo no trae {INDICE}: no es un respaldo de Gastro-AI.")
    esperados = {a["clave"]: a["sha256"] for a in indice["archivos"]}
    if vistos != esperados:
        raise ErrorRespaldo("Los archivos no coinciden con el índice del respaldo.")
    return indice["resumen"]


def estado_archivos(almacen: AlmacenRespaldable) -> dict:
    """El mismo resumen del índice, pero calculado sobre lo que hay hoy en MinIO."""
    archivos = []
    for obj in _respaldables(almacen):
        datos = almacen.descargar(obj.clave).datos
        archivos.append(
            {"clave": obj.clave, "bytes": len(datos), "sha256": hashlib.sha256(datos).hexdigest()}
        )
    return _resumen(archivos)


# ------------------------------------------------------------------ manifiesto


def manifiesto(
    repo: RepositorioRespaldo, reloj: Callable[[], datetime] = lambda: datetime.now(UTC)
) -> dict:
    return {"formato": FORMATO, "creado_en": reloj().isoformat(), "base": estado_base(repo)}


@dataclass(frozen=True)
class Diferencia:
    que: str
    respaldo: object
    ahora: object


def _comparar(prefijo: str, antes: dict, ahora: dict) -> Iterable[Diferencia]:
    for clave in sorted(set(antes) | set(ahora)):
        a, b = antes.get(clave), ahora.get(clave)
        if isinstance(a, dict) and isinstance(b, dict):
            yield from _comparar(f"{prefijo}{clave}.", a, b)
        elif a != b:
            yield Diferencia(f"{prefijo}{clave}", a, b)


def verificar(guardado: dict, base_ahora: dict, archivos_ahora: dict | None) -> list[Diferencia]:
    """Lo que no cuadra entre el respaldo y lo restaurado. Vacía = restauración completa."""
    if guardado.get("formato") != FORMATO:
        raise ErrorRespaldo("El manifiesto es de otro formato.")
    diferencias = list(_comparar("base.", guardado["base"], base_ahora))
    if "archivos" in guardado and archivos_ahora is not None:
        diferencias += _comparar("archivos.", guardado["archivos"], archivos_ahora)
    return diferencias


# ------------------------------------------------------------------ pesos del modelo


def url_pesos(repo_hf: str, revision: str, archivo: str) -> str:
    """URL de descarga con la revisión FIJA (nunca «main», RNF-29)."""
    return f"https://huggingface.co/{repo_hf.strip('/')}/resolve/{revision}/{archivo.lstrip('/')}"


def guardar_pesos(trozos: Iterable[bytes], salida: BinaryIO, huella_esperada: str) -> int:
    """Copia los pesos a `salida` y falla si la huella no es la del modelo desplegado."""
    huella, total = hashlib.sha256(), 0
    for trozo in trozos:
        huella.update(trozo)
        salida.write(trozo)
        total += len(trozo)
    if huella.hexdigest() != huella_esperada.strip().lower():
        raise ErrorRespaldo("La huella de los pesos descargados no coincide con HF_SHA256.")
    return total
