# Reporte de Diagnóstico Estructural de Datasets - GastroAI

**Ruta Base Evaluada**: `/content/drive/MyDrive/GastroAI/dataset`

## 1. Inventario de Archivos Comprimidos y Tablas de Metadatos

| Ruta Relativa | Tamaño (MB) | Tipo |
| :--- | :--- | :--- |
| `annotations.csv` | 3.55 MB | .CSV |
| `hyperkvasir/labeled-images/image-labels.csv` | 0.85 MB | .CSV |
| `egid/metadata.xlsx` | 0.00 MB | .XLSX |
| `egid/egid_hpylori.rar` | 5597.03 MB | .RAR |
| `gastrohun/gastrohun_cat1.zip` | 2689.86 MB | .ZIP |


## 2. Inspección Detallada de Tablas de Metadatos

### Archivo: `annotations.csv`

- **Total de registros (filas)**: 19496
- **Columnas detectadas**: `['image_id', 'image_path', 'patient_id', 'normal_mucosa', 'erythematous_gastritis', 'gastric_atrophy', 'h_pylori_signs']`

**Vista previa (Primeras 3 filas):**

| image_id                                 | image_path                                                                                                                                                              | patient_id   |   normal_mucosa |   erythematous_gastritis |   gastric_atrophy |   h_pylori_signs |
|:-----------------------------------------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:-------------|----------------:|-------------------------:|------------------:|-----------------:|
| 0efc2d9e-f46d-40d9-afdc-8189c29336e9.jpg | /content/drive/MyDrive/GastroAI/dataset/hyperkvasir/labeled-images/upper-gi-tract/pathological-findings/barretts-short-segment/0efc2d9e-f46d-40d9-afdc-8189c29336e9.jpg | PAT_UNKNOWN  |               0 |                        0 |                 0 |                0 |
| 0bc45252-73c2-4eca-9ed8-6a0e77427fe0.jpg | /content/drive/MyDrive/GastroAI/dataset/hyperkvasir/labeled-images/upper-gi-tract/pathological-findings/barretts-short-segment/0bc45252-73c2-4eca-9ed8-6a0e77427fe0.jpg | PAT_UNKNOWN  |               0 |                        0 |                 0 |                0 |
| 03b9c09d-9018-4104-a249-2ec9c471dbf0.jpg | /content/drive/MyDrive/GastroAI/dataset/hyperkvasir/labeled-images/upper-gi-tract/pathological-findings/barretts-short-segment/03b9c09d-9018-4104-a249-2ec9c471dbf0.jpg | PAT_UNKNOWN  |               0 |                        0 |                 0 |                0 |


### Archivo: `hyperkvasir/labeled-images/image-labels.csv`

- **Total de registros (filas)**: 10662
- **Columnas detectadas**: `['Video file', 'Organ', 'Finding', 'Classification']`

**Vista previa (Primeras 3 filas):**

| Video file                           | Organ    | Finding   | Classification       |
|:-------------------------------------|:---------|:----------|:---------------------|
| 000e3fee-7f5c-4819-9f9c-4c983b68888a | Lower GI | cecum     | anatomical-landmarks |
| 001a41c2-2a5d-40b1-8fd5-b5f2f292277b | Lower GI | cecum     | anatomical-landmarks |
| 006af0aa-2044-4477-964d-10d9e043fb78 | Lower GI | cecum     | anatomical-landmarks |


### Archivo: `egid/metadata.xlsx`

❌ *Error al leer el archivo*: Excel file format cannot be determined, you must specify an engine manually.

## 3. Estructura de Rutas Internas de Archivos `.ZIP`

### Archivo Comprimido: `gastrohun/gastrohun_cat1.zip`

- **Total de elementos contenidos**: 9221
- **Primeras 10 rutas internas**:
  - `387/`
  - `387/028fb699-15b7-42da-84cc-a115149d9ba0.jpg`
  - `387/053d5905-bd33-4ab1-a999-0424e57abd74.jpg`
  - `387/0b32bc0e-590f-4e9a-9d36-658aa14556b0.jpg`
  - `387/18521296-d601-4ea5-9cf9-43e3411789d3.jpg`
  - `387/39e613d5-3141-4772-abe1-9aa1764d0bfc.jpg`
  - `387/403ab42a-b5af-495d-a3cd-79cd6004d447.jpg`
  - `387/41261962-e51d-4a89-a368-58d935b91058.jpg`
  - `387/4a111bba-6c4c-43b2-b17f-5732e7c27412.jpg`
  - `387/4aa40992-c5db-440f-a1e3-cff771720cf6.jpg`

