---
title: GastroAI Inferencia API
emoji: 🩺
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: cc-by-nc-4.0
---

# Gastro-AI: API experimental de inferencia

API FastAPI para clasificar imágenes endoscópicas del tracto gastrointestinal superior y generar mapas Grad-CAM. Es un prototipo académico experimental; no es un dispositivo médico y no debe usarse para tomar decisiones clínicas.

## Modelo que carga esta API

- Arquitectura: EfficientNet-B1 con tres salidas sigmoid, en este orden: gastritis (índice 0), atrofia (1) y signos de *H. pylori* (2).
- Checkpoint incluido: `best_gastroai_efficientnet_b1_3cat_fold2_v8.pth`, fold 2 del entrenamiento v8.
- SHA-256 esperado del checkpoint: `9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4`.
- El checkpoint contiene metadatos y los pesos bajo `model_state_dict`; al cargarlo se valida `class_order` y `fold=2`.
- Entrada: imagen convertida a RGB, redimensionada a 240 × 240 y normalizada con estadísticas ImageNet.
- Formatos admitidos: JPEG, PNG y BMP, hasta 20 MiB. DICOM no está soportado.
- Umbral inicial de integración: 0.50 para las tres clases, coherente con la evaluación OOF reportada. No representa un umbral clínico validado.

El informe OOF v8.1 resume cinco checkpoints de tres clases. El fold 2 obtuvo macro F1 de 0.8656 en sus pacientes OOF; esa partición se usó en la selección de checkpoint y no es una cohorte externa. No atribuir al fold 2 el promedio agregado de los cinco folds. El resultado es experimental y no está validado para decisiones clínicas.

## Preparar el Space

Crear un Space privado con SDK Docker y subir al directorio raíz `README.md`, `Dockerfile`, `app.py`, `requirements.txt` y `best_gastroai_efficientnet_b1_3cat_fold2_v8.pth`. El README declara `app_port: 7860`, que coincide con Uvicorn.

En Settings → Variables and secrets, configurar:

| Nombre | Tipo | Valor |
|---|---|---|
| `GASTROAI_API_KEY` | Secret | Clave aleatoria para autenticar a la API cliente. Obligatoria. |
| `GASTROAI_REVISION_SHA` | Variable | SHA Git de 40 caracteres del commit publicado en este Space. Obligatoria en el Space. |
| `HF_SHA256` | Variable | SHA-256 esperado de los pesos. Puede omitirse porque el código verifica el hash del fold 2 incluido en esta versión. |
| `GASTROAI_CORS_ORIGINS` | Variable | Orígenes exactos separados por coma, solo si un navegador llamará directamente a la API. Para llamadas backend-a-backend puede dejarse vacía. |

El Space falla al iniciar si se despliega sin API key o sin SHA de revisión, o si la huella del checkpoint no coincide. No guardar secretos en Git ni en el frontend. La llamada debe realizarse desde el backend usando HTTPS y el header `X-API-Key`.

Al ser privado, Hugging Face exige además que el backend consumidor se autentique ante el Hub con un token de lectura que tenga acceso al Space. El backend debe guardar ese token como secreto propio (`HF_TOKEN`) y enviar `Authorization: Bearer $HF_TOKEN` junto con `X-API-Key: $GASTROAI_API_KEY`. `HF_TOKEN` no se configura dentro del contenedor del Space.

## Endpoints

- `GET /` o `GET /health`: estado, commit configurado, huella del checkpoint y clases publicadas.
- `POST /clasificar`: recibe `multipart/form-data` con el campo `imagen`; requiere header `X-API-Key`.

Ejemplo de estructura (los valores de predicción son placeholders; los mapas se acortan en este documento):

```json
{
  "revision_sha": "<SHA de 40 caracteres del commit del Space>",
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

El placeholder del `revision_sha` debe sustituirse por la variable real del Space; los placeholders de los mapas representan cadenas PNG Base64 completas en la respuesta HTTP. El ejemplo de probabilidades no se debe usar como evidencia de métricas ni de una predicción del checkpoint desplegado.

Llamada de ejemplo:

```bash
curl -X POST "https://<usuario>-<space>.hf.space/clasificar" \
  -H "Authorization: Bearer $HF_TOKEN" \
  -H "X-API-Key: $GASTROAI_API_KEY" \
  -F "imagen=@imagen_endoscopia.jpg"
```

## Verificación local

```bash
export GASTROAI_API_KEY="<clave-local>"
export GASTROAI_REVISION_SHA="<sha-git-real-de-40-caracteres>"
export HF_SHA256="9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4"
uvicorn app:app --host 0.0.0.0 --port 7860
```

La API devuelve errores HTTP claros para credenciales ausentes/incorrectas, imágenes inválidas, formatos no admitidos y cargas mayores a 20 MiB. No escribe nombres de archivo, imágenes ni predicciones en logs propios de la aplicación.

## Licencia y limitaciones

El código y los pesos se publican bajo CC BY-NC 4.0. Los datasets mantienen sus licencias originales. La salida Grad-CAM muestra activaciones del modelo, no demuestra una lesión ni constituye segmentación clínica. Los resultados requieren revisión profesional y no están validados para uso clínico.
