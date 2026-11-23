# Pipeline reproducible de preparación de datos

Entregable EDT 1.3.3.5 (issue #67), para preparar las muestras del modelo Gastro-AI. El [repositorio oficial del proyecto](https://github.com/pro158127/GASTRO-AI) constituye la evidencia pública del entregable EDT 1.3.3.2 (issue #63).

## Artefactos fuente

- [Notebook de preparación y partición](../../../../Model_CNN/Codigo%20de%20fases%20de%20desarrolo%20del%20CNN/Preprocesamiento%20y%20Partici%C3%B3n%20(Pipeline%20de%20Datos)/GastroAI_Pipeline_Preprocesamiento_v8%20(1).ipynb)
- [Implementación reutilizable en Python](../../../../Model_CNN/Codigo%20de%20fases%20de%20desarrolo%20del%20CNN/Preprocesamiento%20y%20Partici%C3%B3n%20(Pipeline%20de%20Datos)/gastroai_pipeline.py)
- [Notas del pipeline](../../../../Model_CNN/Codigo%20de%20fases%20de%20desarrolo%20del%20CNN/Preprocesamiento%20y%20Partici%C3%B3n%20(Pipeline%20de%20Datos)/Readme.txt)

## Ejecución

El notebook está preparado para Google Colab. Configure el acceso al Drive del equipo y disponga el dataset en `MyDrive/GastroAI/dataset`; luego ejecute las celdas en orden. El notebook crea las carpetas `splits` y `reports` dentro de `MyDrive/GastroAI`.

La implementación Python contiene las funciones para unificar anotaciones, crear particiones, calcular pesos de clase y preparar transformaciones y `DataLoader`. Requiere Python con PyTorch, torchvision, pandas, NumPy, Pillow y scikit-learn. No expone un comando CLI por sí sola.

## Reproducibilidad y límites

El proceso unifica cuatro etiquetas objetivo, normaliza imágenes a 240 × 240, aplica aumentación para entrenamiento y ofrece una partición por grupos de paciente. La configuración usada y sus salidas deben conservarse junto a cada ejecución si se necesita reproducir exactamente una corrida. Los datasets no se incluyen en este repositorio; se deben respetar sus licencias y permisos de acceso.
