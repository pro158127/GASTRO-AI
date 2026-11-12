# Reporte de Auditoría de Datasets Descomprimidos - GastroAI

**Ruta Evaluada**: `/content/drive/MyDrive/GastroAI/dataset`

## Dataset: `egid`

**Ruta**: `/content/drive/MyDrive/GastroAI/dataset/egid`

### 1. Archivos de Metadatos Encontrados

- **Archivo**: `metadata.xlsx`
  - ❌ *Error al leer*: Excel file format cannot be determined, you must specify an engine manually.

### 2. Análisis de Imágenes (5883 imágenes totales)

**Propiedades Físicas de las Imágenes (Mapeo de Muestra):**
- **Dimensiones de Ancho (px)**: Mínimo = `1120px`, Promedio = `1145px`, Máximo = `1173px`
- **Dimensiones de Alto (px)**: Mínimo = `976px`, Promedio = `993px`, Máximo = `1038px`
- **Modo de Color Predominante**: `RGB`


**Estructura de Subcarpetas / Distribución en Disco:**

| Subcarpeta / Ruta Relativa | Conteo de Imágenes |
| :--- | :--- |
| `1.H_pylori_infection_status/1.positive/001` | 45 |
| `1.H_pylori_infection_status/1.positive/002` | 20 |
| `1.H_pylori_infection_status/1.positive/003` | 31 |
| `1.H_pylori_infection_status/1.positive/009` | 25 |
| `1.H_pylori_infection_status/1.positive/011` | 38 |
| `1.H_pylori_infection_status/1.positive/016` | 34 |
| `1.H_pylori_infection_status/1.positive/020` | 27 |
| `1.H_pylori_infection_status/1.positive/021` | 40 |
| `1.H_pylori_infection_status/1.positive/022` | 32 |
| `1.H_pylori_infection_status/1.positive/025` | 30 |
| `1.H_pylori_infection_status/1.positive/026` | 29 |
| `1.H_pylori_infection_status/1.positive/027` | 36 |
| `1.H_pylori_infection_status/1.positive/031` | 8 |
| `1.H_pylori_infection_status/1.positive/032` | 24 |
| `1.H_pylori_infection_status/1.positive/036` | 15 |


---

## Dataset: `gastrohun`

**Ruta**: `/content/drive/MyDrive/GastroAI/dataset/gastrohun`

### 1. Archivos de Metadatos Encontrados

*No contiene tablas explícitas de metadatos (.csv / .xlsx).*

### 2. Análisis de Imágenes (8834 imágenes totales)

**Propiedades Físicas de las Imágenes (Mapeo de Muestra):**
- **Dimensiones de Ancho (px)**: Mínimo = `900px`, Promedio = `1251px`, Máximo = `1350px`
- **Dimensiones de Alto (px)**: Mínimo = `720px`, Promedio = `1000px`, Máximo = `1080px`
- **Modo de Color Predominante**: `RGB`


**Estructura de Subcarpetas / Distribución en Disco:**

| Subcarpeta / Ruta Relativa | Conteo de Imágenes |
| :--- | :--- |
| `176` | 23 |
| `184` | 29 |
| `182` | 22 |
| `181` | 23 |
| `185` | 24 |
| `180` | 24 |
| `183` | 22 |
| `178` | 22 |
| `179` | 22 |
| `186` | 19 |
| `177` | 22 |
| `192` | 26 |
| `203` | 23 |
| `187` | 22 |
| `194` | 25 |


---

## Dataset: `hyperkvasir`

**Ruta**: `/content/drive/MyDrive/GastroAI/dataset/hyperkvasir`

### 1. Archivos de Metadatos Encontrados

- **Archivo**: `labeled-images/image-labels.csv`
  - **Registros (filas)**: 10662
  - **Columnas (4)**: `['Video file', 'Organ', 'Finding', 'Classification']`
  - **Muestra (3 filas)**:

| Video file                           | Organ    | Finding   | Classification       |
|:-------------------------------------|:---------|:----------|:---------------------|
| 000e3fee-7f5c-4819-9f9c-4c983b68888a | Lower GI | cecum     | anatomical-landmarks |
| 001a41c2-2a5d-40b1-8fd5-b5f2f292277b | Lower GI | cecum     | anatomical-landmarks |
| 006af0aa-2044-4477-964d-10d9e043fb78 | Lower GI | cecum     | anatomical-landmarks |


### 2. Análisis de Imágenes (10662 imágenes totales)

**Propiedades Físicas de las Imágenes (Mapeo de Muestra):**
- **Dimensiones de Ancho (px)**: Mínimo = `613px`, Promedio = `1172px`, Máximo = `1349px`
- **Dimensiones de Alto (px)**: Mínimo = `524px`, Promedio = `965px`, Máximo = `1071px`
- **Modo de Color Predominante**: `RGB`


**Estructura de Subcarpetas / Distribución en Disco:**

| Subcarpeta / Ruta Relativa | Conteo de Imágenes |
| :--- | :--- |
| `labeled-images/upper-gi-tract/pathological-findings/barretts-short-segment` | 53 |
| `labeled-images/upper-gi-tract/pathological-findings/barretts` | 41 |
| `labeled-images/upper-gi-tract/pathological-findings/esophagitis-b-d` | 260 |
| `labeled-images/upper-gi-tract/pathological-findings/esophagitis-a` | 403 |
| `labeled-images/upper-gi-tract/anatomical-landmarks/pylorus` | 999 |
| `labeled-images/upper-gi-tract/anatomical-landmarks/retroflex-stomach` | 764 |
| `labeled-images/upper-gi-tract/anatomical-landmarks/z-line` | 932 |
| `labeled-images/lower-gi-tract/pathological-findings/hemorrhoids` | 6 |
| `labeled-images/lower-gi-tract/pathological-findings/ulcerative-colitis-grade-2-3` | 28 |
| `labeled-images/lower-gi-tract/pathological-findings/ulcerative-colitis-grade-3` | 133 |
| `labeled-images/lower-gi-tract/pathological-findings/ulcerative-colitis-grade-2` | 443 |
| `labeled-images/lower-gi-tract/pathological-findings/polyps` | 1028 |
| `labeled-images/lower-gi-tract/pathological-findings/ulcerative-colitis-grade-1-2` | 11 |
| `labeled-images/lower-gi-tract/pathological-findings/ulcerative-colitis-grade-0-1` | 35 |
| `labeled-images/lower-gi-tract/pathological-findings/ulcerative-colitis-grade-1` | 201 |


---
