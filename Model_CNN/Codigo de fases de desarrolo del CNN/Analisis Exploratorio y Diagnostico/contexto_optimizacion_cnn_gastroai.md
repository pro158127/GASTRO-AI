# Contexto de Optimización del CNN — Diagnóstico de la Causa Raíz (Gastro-AI)

Documento de diagnóstico técnico que identifica la causa raíz del **97.2% de
los errores** del modelo y justifica la adopción de la **Pérdida Enmascarada
(Masked BCEWithLogitsLoss)**.

## Problema observado

Durante las primeras versiones del entrenamiento se detectaron **falsos
positivos ficticios** en las matrices de confusión, concentrados en las clases
patológicas (`erythematous_gastritis`, `gastric_atrophy`, `h_pylori_signs`).

## Causa raíz

El dataset **EGID** organiza sus anotaciones en carpetas mutuamente
excluyentes:

- `1.H_pylori_infection_status/` → solo anota **H. pylori** (y gastritis
  asociada).
- `2.presence_of_atrophy/` → solo anota **atrofia gástrica**.

Al unificar los tres datasets en un único vector de 4 clases, las clases **no
anotadas** en cada carpeta de EGID se rellenaron con `0` (ausencia), cuando en
realidad eran **datos faltantes**. Esto convirtió "no anotado" en "negativo",
enseñando al modelo a predecir ausencia en clases donde simplemente no había
evidencia, generando falsos positivos ficticios (~97.2% de los errores).

## Solución adoptada: Pérdida Enmascarada

1. **Máscara de etiquetas** (`generate_label_masks`): por cada muestra, un
   vector `[m0, m1, m2, m3]` donde `1.0` = clase anotada y `0.0` = clase sin
   anotación en EGID.
   - Carpeta H. pylori → `mask[2] = 0` (atrofia no anotada).
   - Carpeta atrofia → `mask[1] = 0`, `mask[3] = 0` (gastritis/H. pylori no anotados).
2. **`MaskedBCEWithLogitsLoss`**: la pérdida element-wise se multiplica por la
   máscara y se normaliza solo sobre los elementos supervisados:

   ```python
   loss = (BCEWithLogitsLoss(reduction='none')(logits, targets) * masks).sum()
           / masks.sum().clamp(min=1.0)
   ```

3. **Evaluación con máscara**: las métricas (ROC-AUC, F1, matrices de
   confusión) se calculan únicamente sobre muestras con `mask == 1`, eliminando
   los falsos positivos ficticios.

## Impacto

- Eliminación de los falsos positivos ficticios de EGID.
- Métricas finales realistas y reproducibles (ver
  `Reporte_Metricas_Calibracion_GastroAI.md`):
  ROC-AUC enmascarado 0.9992 y F1 enmascarado 0.9774 en validación.

## Trazabilidad

- Notebook de diagnóstico: `GastroAI_Diagnostico_Estructura_Dataset_v3.ipynb`.
- Evidencia de errores corregidos: `reports/gradcam_errores/` y
  `reports/registro_errores_diagnostico.csv`.
