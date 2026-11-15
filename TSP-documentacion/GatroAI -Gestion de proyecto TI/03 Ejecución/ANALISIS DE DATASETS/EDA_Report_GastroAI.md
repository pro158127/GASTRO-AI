# Reporte de Análisis Exploratorio de Datos (EDA) - Datasets Gastro-AI
**Paquete de Trabajo EDT 1.3.1.2** | Universidad Santiago de Cali

## 1. Cobertura de Datasets e Imágenes Etiquetadas
- Datasets auditados: HyperKvasir, EGID, GastroHUN (Catálogo 1 Labeled Images).
- Descarga inteligente: Implementada (Evita descargas duplicadas en re-ejecuciones).
- Licencias: CC BY 4.0 / Académica Abierta (Verificadas).

## 2. Recomendaciones de Preprocesamiento Derivadas del EDA
1. **Redimensión (Resizing)**: Estandarizar todas las imágenes a 240 x 240 px.
2. **Tratamiento del Desbalance**: Usar BCEWithLogitsLoss con pos_weight debido al desbalance observado.
3. **Estrategia de Partición**: Implementar GroupKFold por patient_id para garantizar cero fuga de datos.
