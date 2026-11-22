# Integración backend–Space CNN Fold 2: paquete para QA

**Destino de esta entrega:** `testing/qa-branch` mediante revisión de Felipe.

**Space:** privado, `cris158127/gastroai-inferencia-fold2`.

**Revisión publicada:** `d58d56d7fd24a3760779e15d98413d276cb77ad0`.

**Huella del checkpoint:** `9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4`.

## Evidencia disponible

- La imagen Docker local se construyó con Podman y arrancó tras corregir el import de `Image.DecompressionBombError`.
- Smoke local del servicio: `GET /health` respondió 200; `POST /clasificar` sin clave respondió 401; clasificación de una imagen BMP autorizada respondió 200 con `GASTRITIS`, `ATROFIA` y `HPYLORI`.
- La captura de Hugging Face compartida el 22-11-2026 muestra el Space **Private / Running** y `/health` con `status=ready`, la revisión publicada y la huella del checkpoint esperada.
- Esta evidencia acredita el Space y la API local. **Todavía no acredita una petición completa desde Celery/backend ni la presentación final en el frontend.**

## Cambios incluidos para revisar

1. `backend/app/adapters/inferencia.py` autentica la llamada con `Authorization: Bearer HF_TOKEN` y `X-API-Key: GASTROAI_API_KEY`.
2. El adaptador traduce el JSON del Space (`predicciones`, ROI en píxeles de 240×240 y mapas PNG Base64) al contrato interno `SalidaModelo`; normaliza las cajas a 0–1 y valida mapas.
3. La huella `checkpoint_sha256` de la respuesta se compara con `HF_SHA256`; el servicio existente comprueba `revision_sha` contra la revisión fijada en el modelo activo.
4. `.env.example` declara la URL, el repo, la revisión y el hash desplegados. Los valores secretos `HF_TOKEN` y `GASTROAI_API_KEY` quedan vacíos y deben configurarse en el entorno backend.
5. `ARCHITECTURE.md` y `DEPLOYMENT_HUGGING_FACE.md` describen el contrato y la operación; el checkpoint se rastrea con Git LFS.

El backend persiste los mapas en MinIO y continúa calculando `detectado` con sus umbrales de RF-A01. Los campos `umbral` y `detectado` recibidos del Space no sustituyen la configuración de backend.

## Configuración que QA necesita fuera de Git

En el `.env` del backend/worker (o en el gestor de secretos del entorno QA):

```dotenv
HF_SPACE_URL=https://cris158127-gastroai-inferencia-fold2.hf.space
HF_TOKEN=<token de lectura con acceso al Space privado>
GASTROAI_API_KEY=<la misma clave almacenada como secret del Space>
HF_REPO=cris158127/gastroai-inferencia-fold2
HF_REVISION=d58d56d7fd24a3760779e15d98413d276cb77ad0
HF_SHA256=9e680720f6feb7f81aa66fdc89a28471bb3e1a6e8772598d5b0890cc817f42c4
HTTP_TIMEOUT_SECONDS=30
HF_SIMULADO=false
```

No enviar secretos por PR/chat ni compilarlos en el frontend. El Space privado exige ambos encabezados; el backend valida una revisión y una huella fijadas.

## Lista de validación de Felipe

- Confirmar que `preparar`, `api` y `worker` cargan la misma configuración segura y que el worker no arranca en modo simulado en QA.
- Ejecutar la suite backend y los checks del PR; informar resultado, conteo y fallos con enlace a GitHub Actions.
- Ejecutar un análisis QA JPEG y uno PNG; confirmar estado final y tres códigos del catálogo (`ATROFIA`, `GASTRITIS`, `HPYLORI`) con probabilidades válidas.
- Comprobar tres mapas Grad-CAM, ROI normalizadas, persistencia y URLs firmadas de MinIO; verificar que el hash y la revisión coinciden con los valores fijados.
- Probar credencial/token inválido, Space no disponible, timeout, formato rechazado y respuesta con revisión/hash distintos. El análisis debe fallar sin mostrar secretos ni datos de imagen en errores/logs.
- Confirmar con Jordan que la UI representa por separado las tres probabilidades y sus mapas, y presenta el aviso experimental. La UI actual aún renderiza el JSON general; requiere validación/adaptación frontend.
- Adjuntar evidencias sin imágenes identificables, tokens, claves ni datos personales.

## Trazabilidad de requisitos e issues

**Candidatos a cierre solo después de que QA verifique los criterios y adjunte evidencia:**

| Requisito | Issue | Caso asociado | Qué falta probar |
|---|---:|---:|---|
| RF-M01 — inferencia CNN | [#103](https://github.com/pro158127/GASTRO-AI/issues/103) | [#172](https://github.com/pro158127/GASTRO-AI/issues/172) | Flujo backend real, etiquetas/probabilidades y pesos de solo lectura. |
| RM-08 — publicación Space | [#152](https://github.com/pro158127/GASTRO-AI/issues/152) | [#221](https://github.com/pro158127/GASTRO-AI/issues/221) | Revisar model card/licencia y fijación de revisión; ejecutar prueba QA remota. |
| RNF-29 — revisión inmutable | [#136](https://github.com/pro158127/GASTRO-AI/issues/136) | [#205](https://github.com/pro158127/GASTRO-AI/issues/205) | Confirmar revisión en BD, respuesta y pantalla de estado; probar mismatch. |
| RNF-30 — protección de imágenes | [#126](https://github.com/pro158127/GASTRO-AI/issues/126) | [#195](https://github.com/pro158127/GASTRO-AI/issues/195) | Confirmar HTTPS, ambos auth, rechazo sin credenciales y revisión de logs/plataforma. |

**Relacionados, pero no se deben cerrar con este PR todavía:**

- RF-R01/#105 + CP #174, RF-R02/#106 + CP #175 y RF-R03/#107 + CP #176: requieren comprobar/adaptar la representación visual completa del frontend.
- RNF-22/#141 + CP #210: requiere verificar la etiqueta/aviso experimental en interfaz, PDF y exportaciones.
- RNF-14/#133 + CP #202 y RNF-15/#134 + CP #203: requieren trazar el informe final y confirmar el alcance/validación de sus métricas.

Este PR de desarrollo los **referencia**; no incluye palabras `Closes` y no los cierra automáticamente. Según el flujo acordado, Felipe/QA los cerrará en la PR de integración/promoción después de revisar resultados y evidencias. RNF-20 (#139/#208) no se acredita con esta integración del CNN.
