# README

**Gastro-AI** es una aplicación web que ayuda al gastroenterólogo a revisar imágenes endoscópicas gástricas. Un modelo de inteligencia artificial (EfficientNet con Grad-CAM) entrega la probabilidad de cada característica evaluada —atrofia gástrica, gastritis e infección por _H. pylori_— junto con un mapa de calor de la región que más influyó, y un modelo de lenguaje (Gemini) redacta una explicación en español claro.

{% hint style="warning" %}
**Resultado experimental.** Gastro-AI entrega una valoración preventiva probabilística experimental. No sustituye el juicio profesional ni constituye un diagnóstico clínico.
{% endhint %}

Esta sección documenta el **backend**: la API REST, el procesamiento en segundo plano, la base de datos y la integración con los servicios de inteligencia artificial.

## Qué hace el backend

* **Acceso seguro:** inicio de sesión con contraseña y segundo factor (aplicación autenticadora), contraseña temporal de primer ingreso, bloqueo por intentos fallidos y cierre de sesión por inactividad.
* **Administración:** gestión de cuentas de doctores y administradores, traslado de casos entre doctores y configuración de los umbrales del modelo.
* **Protección del paciente:** el número de documento nunca se guarda; se convierte en un seudónimo irreversible. A las imágenes se les quitan los metadatos.
* **Análisis de imágenes:** validación de la imagen, control de calidad, clasificación y mapa de calor con el modelo, resultado con umbrales y explicación en lenguaje natural.

## Contenido

| Página                                  | Qué encuentra                                                 |
| --------------------------------------- | ------------------------------------------------------------- |
| [Arquitectura](arquitectura.md)         | Tipo de arquitectura, capas, componentes y patrones de diseño |
| [Tecnologías](tecnologias.md)           | Herramientas y librerías usadas                               |
| [Puesta en marcha](puesta-en-marcha.md) | Cómo levantar el backend y variables de entorno               |
| [Base de datos](base-de-datos.md)       | Tablas, migraciones y carga inicial                           |
| [Seguridad y privacidad](seguridad.md)  | Autenticación, sesión, roles y protección de datos            |
| [API REST](api.md)                      | Convenciones, errores y lista de endpoints                    |
| [Flujo del análisis](flujo-analisis.md) | De la imagen al resultado: etapas, modelo y explicación       |
| [Pruebas](pruebas.md)                   | Pruebas automatizadas y cobertura                             |
| [Estado y pendientes](./)               | Qué está hecho y qué falta                                    |

## Datos del proyecto

|                             |                                              |
| --------------------------- | -------------------------------------------- |
| Proyecto                    | ONCO-AI · Gastro-AI                          |
| Equipo                      | Ragnar Tech · Universidad Santiago de Cali   |
| Repositorio                 | `pro158127/GASTRO-AI` (carpeta `backend/`)   |
| Rama del backend            | `feature/63-backend-base` (PR #234)          |
| Referencia técnica completa | `ARCHITECTURE.md` en la raíz del repositorio |
