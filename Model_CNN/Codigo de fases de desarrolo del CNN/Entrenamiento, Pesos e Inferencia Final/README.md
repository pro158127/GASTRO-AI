# Entrenamiento externo del CNN

El repositorio de la aplicación conserva solo código de inferencia e integración. El notebook de entrenamiento con optimizador, retropropagación y escritura de checkpoints se mantiene fuera de este repositorio en la carpeta compartida de [GastroAI en Google Drive](https://drive.google.com/drive/folders/18DlhYTOohdmL_faL2BehFgr5LF8OUmgi).

## Artefactos actuales de tres categorías

- [Manifiesto EGID y auditoría de splits por paciente v8](https://drive.google.com/file/d/1vEHrUdgxFzxPUqYSeYbytnBl6FJ2vvZm/view): genera los cinco folds agrupados por paciente, fija la semilla y comprueba unicidad, asignación y soporte. El documento identifica el procedimiento como validación cruzada, no como un test independiente.
- [Entrenamiento EGID v8](https://drive.google.com/file/d/1QkW5whc_QpMRCIRZ4YX7EVp-B8OZExmR/view): notebook Colab de EfficientNet-B1 con tres salidas y cinco checkpoints por fold.
- [Evaluación y calibración OOF v8.1](https://drive.google.com/file/d/1bbXqj7K1fQCJczQMYOxxObeNuP8b2_O-/view): genera métricas de sensibilidad, especificidad, F1, ROC-AUC, PR-AUC, Brier y ECE. Advierte que son resultados OOF internos, no una prueba externa independiente.
- [Reporte JSON RM-06/RNF-14/RNF-15 OOF v8.1](https://drive.google.com/file/d/1vrFQZW9H1WLoN5VKHI5fMKcjY9sAYgEk/view) y [tabla CSV por clase](https://drive.google.com/file/d/1HBar3nDCFeA_5WEer574uUfCtUnGqWkq/view).

El checkpoint Fold 2 del reporte tiene SHA-256 `9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4`, que corresponde a los pesos usados por el Space privado de inferencia. El reporte sigue siendo una evaluación OOF y no debe presentarse como validación externa independiente.

## Límite entre entrenamiento e inferencia

La aplicación no contiene código de ajuste de pesos ni optimizadores. La inferencia usa el modelo desplegado externamente en Hugging Face; los notebooks externos sirven para reproducir el entrenamiento y su evaluación. Los artefactos Drive requieren los permisos de la carpeta compartida.
