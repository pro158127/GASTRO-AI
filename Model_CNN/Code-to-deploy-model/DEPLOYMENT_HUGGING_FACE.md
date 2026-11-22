# Publicar la API CNN en Hugging Face Spaces

Guía de despliegue del checkpoint Fold 2 como Docker Space privado. La imagen Docker local ya fue construida y validada: `/health` respondió 200, una petición sin clave respondió 401 y una clasificación autenticada respondió 200 con las tres clases.

## 1. Crear el Space desde el formulario

En la pantalla de creación:

| Campo | Valor recomendado |
|---|---|
| Owner | `cris158127` (ya aparece seleccionado en la captura) |
| Space name | `gastroai-inferencia-fold2` |
| Short description | `API experimental de inferencia CNN Gastro-AI (Fold 2)` |
| License | `cc-by-nc-4.0`, igual a la licencia declarada por el proyecto |
| SDK | Docker (ya aparece seleccionado) |
| Docker template | Blank / en blanco |
| Visibility | Private |

Luego pulsa **Create Space**. No elijas Gradio ni Static: el servicio es FastAPI dentro de un Dockerfile.

## 2. Crear y guardar la clave de la API

Desde una terminal local crea una clave aleatoria:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Guárdala temporalmente en un gestor seguro. No la pegues en `app.py`, en el README, en GitHub ni en el frontend.

En el Space abre **Settings → Variables and secrets → New secret** y añade:

- Name: `GASTROAI_API_KEY`
- Value: la clave que acabas de generar

## 3. Clonar el repositorio del Space y copiar los artefactos

Reemplaza `cris158127` y `gastroai-inferencia-fold2` solo si elegiste otros valores en el formulario.

```bash
git lfs install
git clone https://huggingface.co/spaces/cris158127/gastroai-inferencia-fold2 gastroai-space
cd gastroai-space

cp "/home/willian/Escritorio/gastroAi/GASTRO-AI/Model_CNN/Code-to-deploy-model/README.md" .
cp "/home/willian/Escritorio/gastroAi/GASTRO-AI/Model_CNN/Code-to-deploy-model/Dockerfile" .
cp "/home/willian/Escritorio/gastroAi/GASTRO-AI/Model_CNN/Code-to-deploy-model/app.py" .
cp "/home/willian/Escritorio/gastroAi/GASTRO-AI/Model_CNN/Code-to-deploy-model/requirements.txt" .
cp "/home/willian/Escritorio/gastroAi/GASTRO-AI/Model_CNN/Code-to-deploy-model/best_gastroai_efficientnet_b1_3cat_fold2_v8.pth" .

git lfs track "*.pth"
git add .gitattributes README.md Dockerfile app.py requirements.txt best_gastroai_efficientnet_b1_3cat_fold2_v8.pth
git commit -m "Deploy GastroAI Fold 2 inference API"
git rev-parse HEAD
```

Antes de hacer `git push`, copia el SHA que imprime `git rev-parse HEAD`. En **Settings → Variables and secrets → New variable** añade:

- Name: `GASTROAI_REVISION_SHA`
- Value: el SHA completo de 40 caracteres recién copiado

Añade también esta variable:

- Name: `HF_SHA256`
- Value: `9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4`

Ahora publica los archivos:

```bash
git push
```

Si Git solicita autenticación, usa tu usuario de Hugging Face y un token personal con permiso de escritura para el Space. No pongas el token en el URL del remoto ni lo guardes en el repositorio.

## 4. Esperar el build y revisar el estado

En la pestaña **Logs** del Space espera el build y el inicio de Uvicorn. El README declara `app_port: 7860` y el Dockerfile expone ese mismo puerto. El Space debe quedar en estado **Running**.

El endpoint público del Space tiene esta forma:

```text
https://cris158127-gastroai-inferencia-fold2.hf.space
```

Prueba el estado desde la terminal, sustituyendo la URL si Hugging Face muestra un dominio distinto:

```bash
export HF_TOKEN="hf_token_de_lectura_con_acceso_al_space"
export GASTROAI_API_KEY="la_misma_clave_configurada_como_secret"

curl -i "https://cris158127-gastroai-inferencia-fold2.hf.space/health" \
  -H "Authorization: Bearer $HF_TOKEN"
```

Prueba una imagen de validación autorizada:

```bash
curl -sS -X POST "https://cris158127-gastroai-inferencia-fold2.hf.space/clasificar" \
  -H "Authorization: Bearer $HF_TOKEN" \
  -H "X-API-Key: $GASTROAI_API_KEY" \
  -F "imagen=@/ruta/a/imagen.jpg"
```

La respuesta debe incluir `revision_sha`, `checkpoint_sha256` y las predicciones `GASTRITIS`, `ATROFIA` y `HPYLORI`. No publicar ni subir imágenes clínicas o datos personales sin autorización.

Al terminar:

```bash
unset HF_TOKEN GASTROAI_API_KEY
```

## 5. Entrega al backend y QA

- El backend consumidor guarda `HF_TOKEN` y `GASTROAI_API_KEY` como secretos propios; el token debe tener acceso de lectura al Space privado.
- El backend llama la API por HTTPS y envía ambos encabezados: `Authorization: Bearer $HF_TOKEN` y `X-API-Key: $GASTROAI_API_KEY`.
- No incluir ninguna de esas credenciales en variables compiladas del frontend.
- QA verifica salud, autenticación, imagen válida, formato no admitido, respuesta con las tres etiquetas y presentación de probabilidades/ROI/mapas en frontend. Registrar evidencia sin incluir tokens, claves ni datos sensibles.

## Estado de publicación

La validación local está aprobada. La publicación en Hugging Face y la validación remota quedan pendientes hasta completar los pasos de esta guía.
