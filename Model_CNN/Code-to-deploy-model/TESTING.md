# Pruebas locales del servicio Gastro-AI

Esta guía describe una prueba técnica local del servicio de inferencia. No equivale a una evaluación clínica ni a un reporte RM-06. La carpeta `imagenes_reales-20261112T211804Z-1-001/imagenes_reales/` contiene 50 imágenes para comprobaciones de entrada y salida.

## Preparar e iniciar

Se requiere Python 3.11 y las dependencias de `requirements.txt`. Define una clave sintética para el test local y una revisión SHA de 40 caracteres. El valor de revisión de ejemplo es solo local; nunca lo uses como la revisión publicada en Hugging Face.

```bash
cd Model_CNN/Code-to-deploy-model
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export GASTROAI_API_KEY=clave-sintetica-local
export GASTROAI_REVISION_SHA=0123456789abcdef0123456789abcdef01234567
export HF_SHA256=d4b264bf0a954cad5b2c26f834ec8a02eb07eeac41eed14b6e65e4f46b41fc76
uvicorn app:app --host 127.0.0.1 --port 7860
```

La app falla al iniciar si falta `GASTROAI_API_KEY`, si la revisión no contiene 40 caracteres hexadecimales o si los pesos no están presentes o no coinciden con su SHA-256. En Hugging Face usa el `SPACE_COMMIT_HASH` real (o define `GASTROAI_REVISION_SHA`) y configura el mismo SHA como `HF_REVISION` en el backend.

## Pruebas de API

`GET /` debe responder `status=ready` y un `revision_sha` hexadecimal de 40 caracteres. `POST /clasificar` requiere `Authorization: Bearer <GASTROAI_API_KEY>` y un archivo `imagen`.

```bash
curl http://127.0.0.1:7860/
curl -X POST http://127.0.0.1:7860/clasificar \
  -H "Authorization: Bearer $GASTROAI_API_KEY" \
  -F "imagen=@imagenes_reales-20261112T211804Z-1-001/imagenes_reales/sample_001.bmp"
```

Una respuesta correcta tiene `revision_sha`, `latencia_ms` y `caracteristicas` con códigos `GASTRITIS`, `ATROFIA` y `HPYLORI`. Cada característica contiene una probabilidad entre 0 y 1 y `regiones`; sus coordenadas son fracciones entre 0 y 1 y `mapa_calor_base64` debe decodificar a PNG. Una solicitud sin bearer debe responder 401 y una imagen inválida, 400.

## Alcance de las 50 imágenes

El índice conserva el nombre neutro, el dataset de origen, las etiquetas disponibles y `clases_con_anotacion_verificable`. Las celdas vacías significan **sin etiqueta verificable**, no clase negativa. Para el subconjunto EGID solo se marca la clase cuyo directorio fuente aporta etiqueta: `HPYLORI` o `ATROFIA`. Las imágenes de GastroHUN e HyperKvasir de esta carpeta no aportan etiquetas de las patologías que predice este modelo.

No calcules sensibilidad, especificidad, F1, AUC, Brier o ECE con este conjunto. Es una selección local y no acredita una partición de prueba independiente por paciente. Para RM-06 se necesita un reporte reproducible sobre el cohort de prueba acordado, con la revisión real de HF y métricas válidas por clase. Las atribuciones y licencias están en `imagenes_reales-20261112T211804Z-1-001/imagenes_reales/CREDITOS.md`.

Las imágenes no se copian a la imagen Docker del Space (`.dockerignore`); se usan únicamente en validación local.
