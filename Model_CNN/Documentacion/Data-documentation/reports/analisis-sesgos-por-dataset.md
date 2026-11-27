# Análisis de sesgos potenciales por dataset

**Trazabilidad:** RNF-16 / issue [#135](https://github.com/pro158127/GASTRO-AI/issues/135)  
**Revisión del código:** rama `testing/qa-branch`, SHA `2c4054d011425ab7b40daed15303d3abe7180744`  
**Fecha:** 2026-11-27

## Alcance y límites

Este documento identifica riesgos plausibles derivados de la población, el centro, la modalidad, el protocolo de captura y la construcción de etiquetas de cada fuente que el pipeline declara integrar. Es una revisión documental del artículo de descripción de cada dataset y del código de integración; **no** es una evaluación estadística de equidad, no estima el rendimiento por subgrupos y no demuestra que el modelo discrimine a pacientes. No se infieren edad, sexo, etnia ni otras características demográficas cuando las fuentes consultadas no las proporcionan.

El pipeline analizado es `Model_CNN/Codigo de fases de desarrolo del CNN/Preprocesamiento y Partición (Pipeline de Datos)/gastroai_pipeline.py`. La documentación de entrenamiento informa métricas agregadas; no publica métricas estratificadas por fuente, centro, dispositivo, población ni subgrupo clínico. Por tanto, los riesgos siguientes requieren validación antes de atribuirles un efecto medido.

## Matriz de análisis

| Dataset | Población, origen y modalidad descritos | Riesgos potenciales para el modelo | Evidencia en el pipeline | Qué falta para evaluar el riesgo |
|---|---|---|---|---|
| **EGID** | Imágenes endoscópicas de luz blanca recopiladas retrospectivamente en Renji Hospital, Shanghái; el artículo describe 5.883 imágenes de 229 pacientes, tomadas con Olympus CV-290 entre marzo y noviembre de 2024. Algunas etiquetas clínicas se basan en ureasa rápida; otras, en lectura de dos endoscopistas con consenso de un senior. | Un solo centro y dispositivo limitan la diversidad geográfica y técnica observada. La composición de pacientes y el periodo de recolección pueden no representar otros hospitales o poblaciones. Las etiquetas basadas en distintas fuentes diagnósticas pueden tener distinta incertidumbre. La selección retrospectiva también puede sesgar qué casos e imágenes se incluyen. | El cargador deriva H. pylori, atrofia, gastritis y mucosa normal a partir de nombres de carpetas y metadatos disponibles; las clases no presentes en las anotaciones quedan sujetas a la lógica de máscara del entrenamiento. La calidad de la conversión de rutas/metadatos debe cotejarse con el manifiesto original. | Confirmar versiones/manifiestos, cobertura de campos demográficos y clínicos permitidos, proceso de inclusión, concordancia entre evaluadores y distribución de etiquetas; medir resultados por centro, dispositivo y subgrupo cuando exista tamaño y autorización adecuados. Mantener una partición independiente por paciente y evitar que imágenes del mismo paciente aparezcan en entrenamiento y evaluación. |
| **GastroHUN** | Artículo de descripción: 8.834 imágenes correspondientes a 387 pacientes y 4.729 secuencias, recogidas en Hospital Universitario Nacional de Bogotá; anotadas por cuatro expertos. Incluye landmarks anatómicos e imágenes no calificadas/insatisfactorias; no es, por diseño, un conjunto de etiquetas diagnósticas equivalentes a las cuatro clases objetivo de Gastro-AI. | Desplazamiento de dominio entre esta fuente y las otras fuentes clínicas; las landmarks, calidad de imagen y anatomía pueden dominar las señales visuales. Tratarla como población sana o como negativos diagnósticos puede introducir etiquetas proxy incorrectas. Un centro y una modalidad/protocolo particulares limitan la generalización. | En el cargador actual, cada imagen GastroHUN recibe `normal_mucosa=1` y ceros en las tres clases patológicas. El `patient_id` se construye con el primer componente de la ruta relativa. Esa regla no demuestra que el grupo sea un identificador real de paciente ni que el rótulo “normal” esté respaldado por evaluación histológica o diagnóstico. | Validar los rótulos imagen por imagen contra anotaciones originales y una definición clínica aprobada; separar etiquetas anatómicas/calidad de diagnóstico; verificar que el identificador agrupe realmente todas las imágenes de una persona. Hasta entonces, tratar la asignación automática de normalidad como riesgo de validez de constructo, no como verdad clínica. |
| **HyperKvasir** | Dataset de imágenes y videos endoscópicos de exámenes rutinarios realizados en un único hospital noruego entre 2008 y 2016; el artículo reporta 110.079 imágenes y 374 videos, con 10.662 imágenes etiquetadas. Incluye modalidades anatómicas/upper y lower GI y categorías clínicas. El artículo señala que la variación entre observadores puede afectar etiquetas visuales sutiles. | Centro, periodo, equipos/protocolos y distribución de clases específicos pueden producir cambios de dominio al desplegar en otros hospitales. Las categorías anatómicas no equivalen necesariamente a mucosa normal; el esófago de Barrett no equivale a atrofia gástrica, ni esofagitis a gastritis. La variación interobservador puede añadir ruido de etiqueta. | El pipeline declara usar solo upper GI y asigna `pylorus`, `retroflex` y `z-line` a normal; `esophagitis` a gastritis; `barrett` a atrofia. Estas son correspondencias de clases construidas por el proyecto, no equivalencias clínicas establecidas por el artículo del dataset. El identificador de grupo usa los primeros ocho caracteres del nombre de archivo; no se verificó contra el identificador oficial de paciente. | Confirmar que el filtrado upper GI excluya lower GI; hacer revisión clínica de cada correspondencia y reportar incertidumbre; verificar IDs de paciente contra metadatos originales; documentar dispositivos/protocolos y medir rendimiento externo por centro/dispositivo y clases pertinentes. |

## Hallazgos transversales

1. **Cambio de dominio:** las fuentes proceden de centros, países, periodos y protocolos diferentes. La cobertura de una fuente no prueba generalización a otra.
2. **Validez de etiquetas:** el pipeline traduce categorías de datasets con objetivos distintos a cuatro etiquetas diagnósticas comunes. En especial, las asignaciones de GastroHUN a “normal” y de Barrett/esofagitis a atrofia/gastritis necesitan aval clínico y validación con las anotaciones originales.
3. **Independencia por paciente:** los grupos `patient_id` dependen de metadatos o heurísticas de ruta/nombre. Debe verificarse su correspondencia con IDs fuente antes de considerar que una partición evita fuga entre imágenes de la misma persona.
4. **Métricas agregadas insuficientes:** ROC-AUC/F1 globales o por clase no describen rendimiento por centro, dispositivo, fuente o subgrupo demográfico. No se afirma que tal análisis exista.
5. **Datos demográficos y representatividad:** los artículos citados no bastan para determinar la representatividad demográfica de la mezcla de entrenamiento. Este informe no rellena esa ausencia con suposiciones.

## Acciones de seguimiento recomendadas

- Solicitar revisión por gastroenterología de las correspondencias de etiquetas y documentar decisiones, desacuerdos y referencias a los esquemas de anotación originales.
- Conservar para cada imagen la fuente, centro, dispositivo/modalidad y el ID de paciente fuente cuando el acuerdo de uso lo permita; no reemplazar IDs por heurísticas sin validación.
- Mantener particiones por paciente y añadir evaluación externa por dataset/centro, además de las métricas agregadas. Publicar denominadores e intervalos de confianza y suprimir celdas demasiado pequeñas.
- Obtener y documentar los atributos demográficos autorizados para analizar representatividad. No intentar reidentificación ni inferir atributos sensibles desde imágenes.
- Registrar las limitaciones en el producto y evitar interpretar la salida del modelo como diagnóstico autónomo.

## Fuentes primarias

- [HyperKvasir: a comprehensive multi-class image and video dataset for gastrointestinal endoscopy (Scientific Data, 2020)](https://www.nature.com/articles/s41597-020-00622-y)
- [GastroHUN: a high-quality gastrointestinal endoscopy image dataset (Scientific Data, 2025)](https://www.nature.com/articles/s41597-025-04401-5)
- [EGID dataset description (Scientific Data, 2026)](https://www.nature.com/articles/s41597-026-07666-6)

## Estado de evidencia

La existencia de este análisis documental satisface el criterio literal de RNF-16 de contar con un análisis potencial por dataset. No acredita que las acciones de validación estén ejecutadas ni reemplaza aprobación clínica, revisión de particiones o métricas estratificadas. El caso de prueba asociado debe conservar ese alcance y no marcar como demostrada una ausencia de sesgo.
