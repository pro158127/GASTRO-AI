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

Entrenado sobre tres datasets públicos de imágenes endoscópicas, todos
licenciados (CC BY 4.0 / uso académico):

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
  `imagen`) y devuelve, por patología, la probabilidad, el umbral, si fue
  detectada, el bounding-box de ROI y el mapa de calor Grad-CAM aislado en
  PNG Base64.

El endpoint requiere la cabecera `X-API-Key` (valor configurado en la
variable de entorno `GASTROAI_API_KEY` del Space).

Respuesta (3 patologías, `normal_mucosa` no se reporta):

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
    "ATROFIA":  {"probabilidad": 0.1000, "detectado": false, "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0}, "mapa_calor_png_b64": "<PNG base64>"},
    "HPYLORI":  {"probabilidad": 0.0500, "detectado": false, "region_roi": {"x": 0, "y": 0, "ancho": 0, "alto": 0, "area_pct": 0.0}, "mapa_calor_png_b64": "<PNG base64>"}
  }
}
```

```bash
curl -X POST "https://<tu-usuario>-gastroai-space.hf.space/clasificar" \
     -H "X-API-Key: $GASTROAI_API_KEY" \
     -F "imagen=@imagen_endoscopia.bmp"
```

## Licencia

Código y pesos bajo **CC BY-NC 4.0** (uso no comercial). Los datasets de
origen mantienen sus propias licencias (CC BY 4.0 / académica). Ver `LICENSE`.

## Reproducibilidad

- Split fijo por paciente (`patient_splits_5fold.csv`, `random_state=42`).
- Semillas fijas en entrenamiento (`torch.manual_seed(42)`,
  `np.random.seed(42)`, `random.seed(42)`).
- Nota: el modelo publicado queda fijado a un commit SHA inmutable (RNF-29);
  un nuevo modelo es un nuevo despliegue.
