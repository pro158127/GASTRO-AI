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

# Gastro-AI: Inferencia y Explicabilidad Grad-CAM

Modelo de clasificación multi-etiqueta de imágenes endoscópicas del tracto
gastrointestinal superior, con explicabilidad visual Grad-CAM.

## Propósito

Detección y localización de hallazgos endoscópicos sobre la cascada de Pelayo
Correa (progresión gástrica), prediciendo **cuatro clases simultáneas**
(multi-etiqueta, no excluyentes):

| Índice | Clase técnica | Etiqueta clínica |
|---|---|---|
| 0 | `normal_mucosa` | Mucosa Normal |
| 1 | `erythematous_gastritis` | Gastritis Eritematosa |
| 2 | `gastric_atrophy` | Atrofia Gástrica |
| 3 | `h_pylori_signs` | Signos H. Pylori |

> **Carácter experimental.** Este modelo se ofrece exclusivamente con fines de
> investigación y docencia. **No constituye un dispositivo médico** y no debe
> usarse para tomar decisiones clínicas. Todo resultado debe ser revisado por
> un profesional de la salud.

## Arquitectura

- Backbone: **EfficientNet-B1** (pre-entrenado en ImageNet).
- Cabecera: `Dropout(0.3)` + capa lineal de 4 salidas (logits).
- Entrenamiento: **BCEWithLogitsLoss con pérdida enmascarada (Masked Loss)**,
  optimizador AdamW (`lr=1e-3`, `weight_decay=1e-4`) y
  `ReduceLROnPlateau`.
- Entrada: imagen RGB redimensionada a **240×240** con normalización
  ImageNet (`mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`).
- Tamaño de los pesos: ~30 MB. Inferencia en CPU: 150–300 ms por imagen
  (incluyendo los 4 mapas Grad-CAM).

## Datos de origen

Entrenado sobre tres datasets públicos de imágenes endoscópicas. Cada dataset
mantiene sus propios términos de uso; ver las fuentes originales antes de
redistribuir sus imágenes:

- **EGID** (Endoscopic Gastric Image Dataset) — anotaciones de H. pylori y
  atrofia gástrica.
- **GastroHUN** — imágenes de mucosa gástrica.
- **HyperKvasir** (tracto GI superior) — hallazgos anatómicos y patológicos.

Partición **aislada por paciente** (`GroupKFold`, 5 pliegues) para garantizar
cero fuga de datos. Conjunto de validación: 4,811 imágenes.

## Métricas de desempeño

Evaluación clínica con umbrales óptimos calibrados (maximización de F1) sobre
muestras reales anotadas (excluyendo ceros imputados de EGID).

| Clase | Umbral | ROC-AUC | Sensibilidad | Precisión | F1 |
|---|---|---|---|---|---|
| Mucosa Normal | 0.335 | 0.9996 | 0.9982 | 0.9790 | 0.9885 |
| Gastritis Eritematosa | 0.499 | 0.9992 | 0.9695 | 0.9939 | 0.9815 |
| Atrofia Gástrica | 0.946 | 0.9998 | 0.9918 | 1.0000 | 0.9959 |
| Signos H. Pylori | 0.982 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

Entrenamiento (Masked Loss): Train Loss `0.0727`, Val Loss `0.0314`,
ROC-AUC enmascarado `0.9992`, F1 enmascarado `0.9774`.

> **Umbrales en producción (RF-A01):** los umbrales quedan acotados al rango
> 10%–90%. Atrofia y H. Pylori se despliegan en `0.900` (no `0.946`/`0.982`),
> lo que prioriza sensibilidad sobre precisión respecto a la calibración F1.

> Ver el reporte completo de evaluación y calibración en
> `Documentacion/Data-documentation/reports/Reporte_Metricas_Calibracion_GastroAI.md`.

## Limitaciones y sesgos

- El modelo opera sobre la **imagen completa redimensionada a 240×240**, sin
  etapa de detección/recorte de ROI; los mapas Grad-CAM ayudan a interpretar
  dónde enfoca el modelo.
- Los conjuntos de entrenamiento provienen de cohortes específicas (EGID,
  GastroHUN, HyperKvasir); el desempeño puede variar en otras poblaciones,
  dispositivos de captura o condiciones de iluminación.
- Clases con anotación incompleta en EGID se trataron con pérdida enmascarada;
  no deben interpretarse como ausencia de patología en dichas clases.
- No es un producto validado clínicamente. Requiere supervisión profesional.

## Uso de la API

Endpoints expuestos en el Space (puerto 7860):

- `GET /` → estado del servicio (incluye `revision_sha`).
- `POST /clasificar` → recibe una imagen (`multipart/form-data`, campo
  `imagen`) y devuelve `revision_sha`, `latencia_ms` y tres `caracteristicas`
  con `codigo`, `probabilidad` y `regiones`. Cada región incluye coordenadas
  normalizadas del ROI, `area_pct` y el mapa de calor Grad-CAM en PNG Base64.
  La respuesta no incluye el umbral ni un indicador booleano de detección.

El endpoint requiere `Authorization: Bearer <token>`. Configura
`GASTROAI_API_KEY` como secreto del Space y `HF_TOKEN` con el mismo valor en
el backend. El backend envía esta cabecera.

`GASTROAI_REVISION_SHA` debe ser el SHA hexadecimal de 40 caracteres del
commit del Space desplegado. Hugging Face proporciona `SPACE_COMMIT_HASH`; la
app lo usa si no se define explícitamente `GASTROAI_REVISION_SHA`. Configura
el mismo SHA en `HF_REVISION` del backend. Para CORS, el Space no permite
orígenes por defecto; si se necesita acceso desde navegador, define
`GASTROAI_ALLOWED_ORIGINS` con una lista separada por comas de orígenes
exactos.

Respuesta (3 patologías, `normal_mucosa` no se reporta):

```json
{
  "revision_sha": "<40-character commit SHA>",
  "latencia_ms": 1840,
  "caracteristicas": [
    {"codigo": "GASTRITIS", "probabilidad": 0.8123, "regiones": [
      {"x": 0.0417, "y": 0.0833, "ancho": 0.4167, "alto": 0.5,
       "area_pct": 20.83, "mapa_calor_base64": "<PNG base64>"}
    ]}
  ]
}
```

```bash
curl -X POST "https://<tu-usuario>-gastroai-space.hf.space/clasificar" \
     -H "Authorization: Bearer $GASTROAI_API_KEY" \
     -F "imagen=@imagen_endoscopia.bmp"
```

## Licencia

Código y pesos bajo **CC BY-NC 4.0** (uso no comercial). Las imágenes de
origen mantienen las licencias de sus autores; las atribuciones de los
subconjuntos EGID y GastroHUN incluidos en las imágenes de verificación están
en `imagenes_reales-20261112T211804Z-1-001/imagenes_reales/CREDITOS.md`.

## Reproducibilidad

- Split fijo por paciente (`patient_splits_5fold.csv`, `random_state=42`).
- Semillas fijas en entrenamiento (`torch.manual_seed(42)`,
  `np.random.seed(42)`, `random.seed(42)`).
- Nota: el modelo publicado queda fijado a un commit SHA inmutable (RNF-29);
  un nuevo modelo es un nuevo despliegue.
