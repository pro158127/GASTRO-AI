# pruebas

El backend cuenta con **298 pruebas automatizadas** y una **cobertura del 98 %** (el mínimo exigido es 70 %, RNF-20). Se escribieron junto con el código y se entregaron al equipo de calidad como punto de partida.

## Herramientas

| Para qué             | Herramienta                                                                |
| -------------------- | -------------------------------------------------------------------------- |
| Ejecutar las pruebas | pytest                                                                     |
| Medir la cobertura   | pytest-cov                                                                 |
| Probar los endpoints | TestClient de FastAPI, sin levantar el servidor                            |
| Base de datos        | PostgreSQL real en una base aparte (`gastroia_prueba`) migrada con Alembic |
| Servicios externos   | Dobles de prueba de Gemini, Hugging Face, MinIO, la cola y el correo       |
| Estilo               | Ruff                                                                       |

## Tipos de prueba

* **Unitarias:** reglas sin base de datos, como los verificadores de imagen, la calidad, el seudónimo, la política de contraseñas, el validador de la explicación y los adaptadores.
* **De integración:** endpoints completos contra PostgreSQL real, como el inicio de sesión por etapas, la gestión de cuentas, la creación de un análisis y el acceso a análisis ajenos.
* **De extremo a extremo (manuales):** recorridos completos por nginx con Docker, MinIO, Redis, Celery y Gemini reales.

La base de prueba se crea al empezar y se borra al terminar; cada prueba corre en una transacción que se deshace, así **nunca se toca la base de desarrollo** y cada prueba arranca limpia. Ninguna prueba llama a servicios de internet.

## Qué cubren

| Área           | Ejemplos de lo que se comprueba                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Acceso         | Mismo error para todo fallo de credenciales, bloqueo tras 5 fallos, inactividad, consultas pasivas |
| Cuentas        | Creación con temporal solo por correo, traslado de casos, no quedarse sin administrador            |
| Privacidad     | El documento no aparece en la base ni en las respuestas; la imagen queda sin metadatos             |
| Acceso a datos | Análisis ajeno responde 404; el administrador recibe 403 en datos clínicos                         |
| Imagen         | Formato por contenido, 10 MB, 224 px, archivos dañados y bombas de descompresión                   |
| Modelo         | Revisión distinta, respuesta fuera del contrato, tiempo agotado, umbral copiado                    |
| Explicación    | Gemini nunca recibe la imagen, validador del texto, 3 reintentos                                   |
| Errores        | Formato único y sin trazas                                                                         |

## Cómo ejecutarlas

```bash
cd backend
docker compose up -d postgres
pytest                      # todas, con cobertura
pytest tests/test_auth.py   # un archivo
```

## Pendiente (a cargo de calidad)

* Integración continua con GitHub Actions en cada pull request.
* Pruebas de carga y de tiempos de respuesta.
* Pruebas de extremo a extremo automatizadas con el frontend.
