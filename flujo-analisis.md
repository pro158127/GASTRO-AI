# flujo analisis

## Vista general

```
Doctor                  API                         Worker (Celery)
  │  POST /imagenes      │                              │
  │─────────────────────►│ valida, limpia, guarda tmp/  │
  │  POST /analisis      │                              │
  │─────────────────────►│ seudónimo, caso, análisis    │
  │◄──── 202 + código ───│ encola ─────────────────────►│ 1. ANONIMIZAR
  │                      │                              │ 2. CALIDAD
  │  GET …/estado (1–2 s)│                              │ 3. CLASIFICAR  (Hugging Face)
  │─────────────────────►│◄──── avance en la base ──────│ 4. GRAD_CAM    (mapas a MinIO)
  │                      │                              │ → COMPLETADO
  │  GET …/explicacion   │                              │ 5. Explicación (Gemini)
  │─────────────────────►│                              │
```

{% stepper %}
{% step %}
## Carga de la imagen (`POST /imagenes`)

La imagen pasa por una **cadena de verificadores**, del más barato al más costoso:

| Paso         | Regla                                                       | Error                                |
| ------------ | ----------------------------------------------------------- | ------------------------------------ |
| Peso         | Hasta 10 MB                                                 | `413 IMAGEN_DEMASIADO_PESADA`        |
| Formato real | JPEG o PNG, detectado por el contenido (DICOM no se acepta) | `415 IMAGEN_FORMATO_NO_PERMITIDO`    |
| Lectura      | Archivo íntegro y sin dimensiones desmesuradas              | `422 IMAGEN_ILEGIBLE`                |
| Resolución   | Al menos 224 × 224 píxeles                                  | `422 IMAGEN_RESOLUCION_INSUFICIENTE` |

Después se gira según su orientación y se **vuelve a guardar sin metadatos** (EXIF, perfil de color, textos). Queda en el área temporal durante 30 minutos. El nombre del archivo solo se devuelve en la respuesta; no se guarda, porque puede contener el nombre del paciente.
{% endstep %}

{% step %}
## Creación del análisis (`POST /analisis`)

`ServicioAnalisis` (patrón Fachada) hace todo en una sola operación:

1. Normaliza el documento y calcula el seudónimo.
2. Toma un candado por paciente para que dos peticiones simultáneas no creen dos casos.
3. Recupera la imagen temporal (vencida o ya usada: `410 IMAGEN_EXPIRADA`).
4. Busca el caso del doctor con ese paciente o lo crea. Si es un paciente nuevo para el doctor, exige escribir el número dos veces (`422 DOCUMENTO_NO_COINCIDE`).
5. Asigna el código `A-AAAA-NNNNNN`, mueve la imagen a su lugar definitivo y guarda el análisis.
6. Lo envía a la cola y responde `202`. Si la cola no responde, el análisis queda `FALLIDO` (`ERR-1003`) y la API responde `503`.
{% endstep %}

{% step %}
## Procesamiento en el worker

| Etapa          | Qué hace                                                                                                                               | Si falla                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **ANONIMIZAR** | Comprueba que la imagen guardada siga sin metadatos                                                                                    | —                                                                                  |
| **CALIDAD**    | Nitidez (varianza del Laplaciano ≥ 85), brillo (50 a 180) y reflejos (< 5 % de píxeles saturados)                                      | `FALLIDO`, `ERR-1001`, con las causas: `BORROSA`, `OSCURA`, `MUY_CLARA_O_REFLEJOS` |
| **CLASIFICAR** | Envía la imagen al Space de Hugging Face (30 s); comprueba la revisión del modelo y que vengan exactamente las características activas | `FALLIDO`, `ERR-1002`                                                              |
| **GRAD\_CAM**  | Sube los mapas de calor a MinIO, aplica el umbral y lo copia en cada resultado                                                         | `FALLIDO`, `ERR-1004`                                                              |

Cada etapa se guarda apenas empieza, así el frontend muestra el avance real. Cada inferencia deja un registro técnico (estado, tiempos y motivo del fallo), sin datos clínicos (RF-M03). Un análisis fallido por el servicio se puede **reintentar** con el mismo código; uno fallido por calidad no, porque la misma imagen fallaría igual.

### Contrato con el Space de Hugging Face

```
POST {HF_SPACE_URL}/clasificar
Authorization: Bearer {HF_TOKEN}
multipart/form-data, campo «imagen»

200 {"revision_sha": "<commit de 40 caracteres>", "latencia_ms": 1840,
     "caracteristicas": [{"codigo": "ATROFIA", "probabilidad": 0.8734,
       "regiones": [{"x": 0.31, "y": 0.22, "ancho": 0.18, "alto": 0.20,
                     "area_pct": 14.2, "mapa_calor_base64": "<PNG en Base64>"}]}]}
```

Sin HTTPS o sin token, el backend no hace la llamada (RNF-30). Si `revision_sha` no coincide con la revisión configurada, el resultado se descarta (RNF-29).
{% endstep %}

{% step %}
## Resultado (`GET /analisis/{id}`)

Incluye las características ordenadas por probabilidad con el **umbral que se aplicó ese día**, si lo supera, las regiones con su mapa de calor (URL firmadas de 5 minutos), quién realizó el análisis, si el caso llegó por traslado, la explicación, las observaciones y el **aviso experimental**, que acompaña todo resultado.
{% endstep %}

{% step %}
## Explicación con Gemini

* Se pide **después** de guardar el resultado. Si Gemini falla, el análisis sigue disponible.
* Gemini recibe solo el nombre de cada característica, su probabilidad y umbral en %, si lo supera, y cada región descrita en palabras («zona superior izquierda») con su % del área.
* Instrucciones: usar los porcentajes exactos, hablar de probabilidad y nunca de diagnóstico, no inventar hallazgos ni sugerir tratamientos, un párrafo de máximo 120 palabras y cerrar con el aviso experimental.
* **Validador:** el texto se descarta si trae porcentajes que no están en los datos o términos como cáncer, tratamiento o biopsia.

| Estado                   | Significado                                    |
| ------------------------ | ---------------------------------------------- |
| `PENDIENTE`              | En proceso; el frontend consulta hasta 15 s    |
| `GENERADA`               | Texto listo                                    |
| `FALLIDA` (`ERR-3001`)   | Gemini no respondió o tardó más de 15 s        |
| `RECHAZADA` (`ERR-3002`) | El texto no pasó la validación y no se muestra |

En `FALLIDA` y `RECHAZADA` se muestra «Explicación no disponible. El resultado, la confianza y el mapa de calor siguen siendo válidos.» y se puede reintentar hasta completar 3 intentos.
{% endstep %}
{% endstepper %}
