# Taxonomía Endoscópica Gastro-AI (Cascada de Pelayo Correa)

Especificación formal de la unificación de las **4 clases objetivo
multi-etiqueta** sobre las que opera el modelo. La taxonomía se basa en la
**Cascada de Pelayo Correa** (progresión: gastritis → atrofia → metaplasia →
displasia → carcinoma) adaptada a los hallazgos disponibles en los datasets
públicos.

## Clases objetivo

| Índice | Clase técnica | Etiqueta clínica | Descripción |
|---|---|---|---|
| 0 | `normal_mucosa` | Mucosa Normal | Mucosa gástrica sin hallazgos patológicos. |
| 1 | `erythematous_gastritis` | Gastritis Eritematosa | Inflamación eritematosa de la mucosa (gastritis). |
| 2 | `gastric_atrophy` | Atrofia Gástrica | Pérdida de glándulas (atrofia) en el cuerpo/antro gástrico. |
| 3 | `h_pylori_signs` | Signos H. Pylori | Hallazgos endoscópicos asociados a infección por H. pylori. |

El esquema es **multi-etiqueta** (una imagen puede tener varias clases
activas, ej. gastritis + H. pylori). La clase `normal_mucosa` es mutuamente
excluyente: si existe cualquier hallazgo patológico, `normal_mucosa = 0`.

## Reglas de mapeo por dataset

### EGID (Endoscopic Gastric Image Dataset)

| Carpeta origen | normal | gastritis | atrofia | h_pylori |
|---|---|---|---|---|
| `1.H_pylori_infection_status/1.positive` | 0 | 1 | 0 | 1 |
| `1.H_pylori_infection_status/2.negative` | 1 | 0 | 0 | 0 |
| `2.presence_of_atrophy` / `3.distribution` | 0 | 0 | 1 | 0 |

> Nota: en EGID, la gastritis se infiere como acompañante de la infección por
> H. pylori; la atrofia no está anotada en la carpeta de H. pylori (y
> viceversa), por lo que se trata con **pérdida enmascarada**.

### GastroHUN

| Condición | Clase |
|---|---|
| Todas las imágenes | `normal_mucosa = 1` (mucosa normal) |

### HyperKvasir (solo tracto GI superior)

| Subcarpeta | Clase |
|---|---|
| `pylorus`, `retroflex-stomach`, `z-line` | `normal_mucosa` |
| `esophagitis-*` | `erythematous_gastritis` |
| `barretts*` | `gastric_atrophy` |

> Las carpetas del tracto GI inferior (`lower-gi-tract`, `colon`, `polyps`,
> `cecum`) se **excluyen** del pipeline.

## Exclusión mutua (regla global)

```text
si (gastritis == 1 o atrofia == 1 o h_pylori == 1):
    normal_mucosa = 0
sino:
    normal_mucosa = 1
```

## Verificación

La verificación del mapeo se realiza en
`GastroAI_Verificacion_Taxonomia_v3.ipynb`, que audita la distribución de
clases y pacientes por dataset y valida que los contadores coincidan con la
estructura física de las carpetas.
