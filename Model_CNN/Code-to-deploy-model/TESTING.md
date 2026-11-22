# Validación local de la API Gastro-AI antes de publicar en Hugging Face

Este procedimiento comprueba el contenedor y la respuesta HTTP local. No sube
archivos ni configura el Space remoto.

## 1. Configurar y levantar el servicio

La API exige una clave incluso en local. No se debe subir la clave a Git.

```bash
cd Model_CNN/Code-to-deploy-model
export GASTROAI_API_KEY="<clave-local-aleatoria>"
docker build -t gastroai-hf .
docker run --rm -p 7860:7860 \
  -e GASTROAI_API_KEY="$GASTROAI_API_KEY" \
  -e HF_SHA256="9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4" \
  gastroai-hf
```

En local se puede dejar `GASTROAI_REVISION_SHA` sin configurar; el endpoint
de estado devolverá `null`. En el Space de Hugging Face sí es obligatoria y
debe ser el SHA Git real de 40 caracteres del commit publicado. El servicio
falla al iniciar si no coinciden los pesos con su SHA-256 esperado.

## 2. Verificar el estado

```bash
curl http://localhost:7860/health
```

La respuesta indica `status`, `revision_sha`, `checkpoint_sha256` y las tres
clases expuestas. Se espera el SHA-256 `9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4`.

## 3. Clasificar una imagen

El endpoint es `POST /clasificar`; usa `multipart/form-data`, campo `imagen`,
y header `X-API-Key`. Formatos admitidos: JPEG, PNG y BMP, máximo 20 MiB.
DICOM no está soportado.

```bash
curl -X POST http://localhost:7860/clasificar \
  -H "X-API-Key: $GASTROAI_API_KEY" \
  -F "imagen=@imagenes_reales-20261112T211804Z-1-001/imagenes_reales/egid_val_04_009(21).bmp"
```

Se espera HTTP 401 para clave ausente/incorrecta, HTTP 400 para una imagen
ilegible, HTTP 413 si excede el tamaño máximo y HTTP 415 para formato no
admitido.

## 4. Campos de respuesta

```json
{
  "revision_sha": "<commit SHA de 40 caracteres; null solo en local sin configurar>",
  "checkpoint_sha256": "9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4",
  "predicciones": {
    "GASTRITIS": {
      "probabilidad": 0.0,
      "umbral": 0.5,
      "detectado": false,
      "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0},
      "mapa_calor_png_b64": "<PNG Base64 generado por Grad-CAM>"
    },
    "ATROFIA": {
      "probabilidad": 0.0,
      "umbral": 0.5,
      "detectado": false,
      "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0},
      "mapa_calor_png_b64": "<PNG Base64 generado por Grad-CAM>"
    },
    "HPYLORI": {
      "probabilidad": 0.0,
      "umbral": 0.5,
      "detectado": false,
      "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0},
      "mapa_calor_png_b64": "<PNG Base64 generado por Grad-CAM>"
    }
  }
}
```

Los valores son placeholders para documentar el contrato; no representan una
inferencia real. El PNG Base64 es completo en la respuesta HTTP. Este checkpoint
contiene tres salidas en el orden GASTRITIS, ATROFIA, HPYLORI.

## 5. Imágenes locales de validación

La carpeta `imagenes_reales-20261112T211804Z-1-001/imagenes_reales/`
contiene 50 imágenes (23 `.bmp` de EGID, 27 `.jpg` de GastroHUN/HyperKvasir)
y un `index_imagenes_reales.csv` con ground truth por imagen.

Columnas del CSV:

| Columna | Significado |
|---|---|
| `nombre_archivo_test` | Archivo de imagen. |
| `patient_id` | Identificador seudónimo del paciente. |
| `mucosa_normal` | 1 = mucosa normal. |
| `gastritis_eritematosa` | 1 = gastritis eritematosa. |
| `astrofia_gastrica` | 1 = atrofia gástrica (el nombre contiene un typo en el CSV original). |
| `h_pylori` | 1 = signos de *H. pylori*. |
| `ruta_original` | Ruta de origen en el dataset. |

### Anotaciones enmascaradas de EGID

- En `1.H_pylori_infection_status`, el estado de H. pylori proviene del
  subdirectorio (`1.positive` o `2.negative`); atrofia no está anotada.
- En `2.Presence_of_atrophy`, el estado de atrofia proviene del subdirectorio
  (`1.atrophic` o `2.non-atrophic`); gastritis y H. pylori no están anotados.
- La columna correspondiente del CSV puede contener etiquetas imputadas; para
  evaluar una clase, deriva el ground truth de `ruta_original` y aplica la
  máscara de anotación correcta.

Esta muestra sirve para una comprobación de integración; no reemplaza la
evaluación OOF ni una prueba externa del modelo.
