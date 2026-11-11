# Reporte de Evaluación y Calibración del Modelo — Gastro-AI

**Requisitos cubiertos:** RM-06 (Reporte de evaluación y calibración),
RNF-14 (Métricas de desempeño documentadas), RNF-15 (Calibración de la
confianza).

**Fecha:** 2026-11-11 · **Backbone:** EfficientNet-B1 · **Pesos:**
`best_gastroai_masked_loss.pth` (Pérdida Enmascarada, Época 07).

---

## 1. Resumen del entrenamiento

| Métrica | Valor |
|---|---|
| Imágenes de validación | 4,811 |
| Tiempo por época | 2,673.2 s (~44 min 33 s) |
| Train Loss (masked) | 0.0727 |
| Val Loss (masked) | 0.0314 |
| ROC-AUC enmascarado | 0.9992 |
| F1 enmascarado | 0.9774 |

---

## 2. Calibración de umbrales

Los umbrales de decisión por clase se calibraron maximizando el **F1-score**
sobre la curva precisión-recall (`precision_recall_curve`), evaluada
exclusivamente sobre las muestras con anotación real (máscara de evaluación =
1). Esto excluye los ceros imputados de EGID, evitando falsos positivos
ficticios.

| Clase | Umbral óptimo |
|---|---|
| Mucosa Normal | 0.335 |
| Gastritis Eritematosa | 0.499 |
| Atrofia Gástrica | 0.946 |
| Signos H. Pylori | 0.982 |

---

## 3. Matrices de confusión y métricas por clase

### 3.1 Mucosa Normal — Umbral 0.335 (Muestras evaluadas: 4,811)

| | Predicho Ausente | Predicho Presente |
|---|---|---|
| **Real Ausente** | 2,521 (VN) | 48 (FP) |
| **Real Presente** | 4 (FN) | 2,238 (VP) |

| ROC-AUC | Sensibilidad | Precisión | F1 |
|---|---|---|---|
| 0.9996 | 0.9982 | 0.9790 | 0.9885 |

### 3.2 Gastritis Eritematosa — Umbral 0.499 (Muestras evaluadas: 3,596)

| | Predicho Ausente | Predicho Presente |
|---|---|---|
| **Real Ausente** | 2,244 (VN) | 8 (FP) |
| **Real Presente** | 41 (FN) | 1,303 (VP) |

| ROC-AUC | Sensibilidad | Precisión | F1 |
|---|---|---|---|
| 0.9992 | 0.9695 | 0.9939 | 0.9815 |

### 3.3 Atrofia Gástrica — Umbral 0.946 (Muestras evaluadas: 3,596)

| | Predicho Ausente | Predicho Presente |
|---|---|---|
| **Real Ausente** | 2,371 (VN) | 0 (FP) |
| **Real Presente** | 10 (FN) | 1,215 (VP) |

| ROC-AUC | Sensibilidad | Precisión | F1 |
|---|---|---|---|
| 0.9998 | 0.9918 | 1.0000 | 0.9959 |

### 3.4 Signos H. Pylori — Umbral 0.982 (Muestras evaluadas: 3,596)

| | Predicho Ausente | Predicho Presente |
|---|---|---|
| **Real Ausente** | 2,381 (VN) | 0 (FP) |
| **Real Presente** | 0 (FN) | 1,215 (VP) |

| ROC-AUC | Sensibilidad | Precisión | F1 |
|---|---|---|---|
| 1.0000 | 1.0000 | 1.0000 | 1.0000 |

---

## 4. Explicabilidad (Grad-CAM)

Se ejecutó `explain_endoscopic_sample` sobre muestras de validación (ej.
`009(10).bmp`), generando overlays de mapas de activación (Grad-CAM) para
validar visualmente que el modelo enfoca las regiones tisulares correctas de
cada patología. Evidencia disponible en
`reports/gradcam_errores/` (20 imágenes de error) y `reports/metricas/`.

---

## 5. Notas metodológicas

- **Pérdida enmascarada:** las clases no anotadas en cada carpeta de EGID se
  enmascaran (peso 0) durante el cálculo de pérdida, evitando que los ceros
  imputados penalicen al modelo.
- **Muestras evaluadas por clase:** la clase "Mucosa Normal" se evalúa sobre
  las 4,811 imágenes; las tres clases patológicas sobre 3,596 (1,215 muestras
  de EGID sin anotación de atrofia/H. pylori se excluyen).
- **Criterio de decisión:** `prob >= umbral_óptimo` por clase.
