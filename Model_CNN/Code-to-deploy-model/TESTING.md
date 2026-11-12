# Pruebas locales del servicio Gastro-AI (antes de publicar en Hugging Face)

Este documento describe cómo levantar el servicio de inferencia en local y
probarlo con el conjunto de imágenes reales incluido en
`imagenes_reales-20261112T211804Z-1-001/imagenes_reales/`.

> **Importante:** las imágenes de prueba y este documento **no** se incluyen en
> la imagen Docker del Space (ver `.dockerignore`). Solo sirven para validar
> localmente antes de publicar.

## 1. Levantar el servicio en local

### Opción A — Docker

```bash
cd Model_CNN/Code-to-deploy-model
docker build -t gastroai-hf .
docker run --rm -p 7860:7860 gastroai-hf
```

### Opción B — uvicorn directo

```bash
cd Model_CNN/Code-to-deploy-model
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 7860
```

El servicio falla al arrancar (fail-fast) si los pesos
`best_gastroai_masked_loss.pth` no existen o su SHA-256 no coincide con el
esperado. Si arranca, el chequeo de integridad ha pasado.

## 2. Verificar el estado

```bash
curl http://localhost:7860/
# {"status": "ready", "revision_sha": "v1.0.0-masked-loss-ep07"}
```

## 3. Clasificar una imagen

Endpoint `POST /clasificar`, `multipart/form-data`, campo `imagen`.

```bash
curl -X POST http://localhost:7860/clasificar \
     -F "imagen=@imagenes_reales-20261112T211804Z-1-001/imagenes_reales/egid_val_04_009(21).bmp"
```

No se requiere cabecera `X-API-Key` si la variable de entorno
`GASTROAI_API_KEY` está vacía.

## 4. Respuesta esperada

```json
{
  "revision_sha": "v1.0.0-masked-loss-ep07",
  "predicciones": {
    "GASTRITIS": {
      "probabilidad": 0.8123,
      "detectado": true,
      "region_roi": {"x": 10, "y": 20, "ancho": 100, "alto": 120, "area_pct": 20.83},
      "mapa_calor_png_b64": "<PNG base64>"
    },
    "ATROFIA": {
      "probabilidad": 0.1000,
      "detectado": false,
      "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0},
      "mapa_calor_png_b64": "<PNG base64>"
    },
    "HPYLORI": {
      "probabilidad": 0.0500,
      "detectado": false,
      "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0},
      "mapa_calor_png_b64": "<PNG base64>"
    }
  }
}
```

## 5. Conjunto de imágenes reales

La carpeta `imagenes_reales-20261112T211804Z-1-001/imagenes_reales/` contiene
50 imágenes (23 `.bmp` de EGID, 27 `.jpg` de GastroHUN/HyperKvasir) y un
`index_imagenes_reales.csv` con el ground-truth por imagen.

Columnas del CSV:

| Columna | Significado |
|---|---|
| `nombre_archivo_test` | Nombre del archivo en la carpeta |
| `patient_id` | Identificador de paciente |
| `mucosa_normal` | 1 = mucosa normal |
| `gastritis_eritematosa` | 1 = gastritis eritematosa |
| `astrofia_gastrica` *(typo)* | 1 = atrofia gástrica |
| `h_pylori` | 1 = signos de H. pylori |
| `ruta_original` | Ruta de origen en el dataset |

### Matiz masked-loss (importante al validar)

El modelo usa pérdida enmascarada porque algunos datasets no anotan todas las
clases. En EGID:

- Carpeta `1.H_pylori_infection_status`: el label real de H. pylori está en el
  subdirectorio (`1.positive`=1, `2.negative`=0); la columna `h_pylori` del CSV
  marca `1` para toda la carpeta. La atrofia **no** está anotada aquí.
- Carpeta `2.Presence_of_atrophy`: el label real de atrofia está en el
  subdirectorio (`1.atrophic`=1, `2.non-atrophic`=0); la columna
  `astrofia_gastrica` marca `1` para toda la carpeta. Gastritis y H. pylori
  **no** están anotados aquí.

Para validar con precisión, deriva el ground-truth de `ruta_original`
(subdirectorios `1.positive`/`2.negative` y `1.atrophic`/`2.non-atrophic`) y
aplica la máscara de evaluación por clase.

## 6. Subir las 50 imágenes en lote

```bash
cd "Model_CNN/Code-to-deploy-model/imagenes_reales-20261112T211804Z-1-001/imagenes_reales"
mkdir -p ../../respuestas_endpoint
for f in *.bmp *.jpg; do
  curl -s -X POST http://localhost:7860/clasificar \
       -F "imagen=@$f" -o "../../respuestas_endpoint/${f%.*}.json"
done
```
