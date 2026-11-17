# Informe de pruebas funcionales manuales — Gastro-AI

Estado: informe revisado con el responsable QA; entrega documental para revisión mediante Pull Request.

Responsable de las observaciones: Felipe Sarmiento, Tester. Fechas de las sesiones: 10 y 11 de noviembre de 2026, según declaración del responsable. No se dispone de la asignación de cada escenario a un día, horarios, duración efectiva ni registro completo de pausas.

## Objetivo y alcance

Documentar las observaciones manuales de autenticación, segundo factor, control de acceso y sesiones de la integración local del backend y frontend. Este informe se redactó a partir de los resultados comunicados por Felipe; no se ejecutaron ni repitieron pruebas para prepararlo.

Se buscó un borrador funcional en las carpetas locales del proyecto y de las entregas. No se encontró uno reutilizable. Este es el único informe nuevo de esta actividad; no sustituye los informes unitarios ni modifica los registros TSP.

## Entorno y versiones observadas

| Elemento | Versión o alcance |
|---|---|
| Entorno funcional declarado | Docker local, carpeta `GASTRO-AI-validacion-8b22250` |
| Integración local | `a6838af50ae74db755270164529630b9866d27ca` |
| Backend | `8b222500f41fcaff96893666179f44d71d1cf04c` |
| Frontend | `428b7fbdac9dde25a40c9796adae1a35eb91b59d` |
| Acceso utilizado | Navegador local; sesión de Administrador comunicada por el Tester |
| Identificación técnica de cada sesión | Navegador, versión, contenedores e imágenes de cada fecha: pendientes de evidencia |

La revisión de Git confirma los commits del worktree. No se inspeccionó Docker en esta tarea ni se reconstruyó retrospectivamente qué imágenes estaban ejecutándose. La atribución de las pruebas manuales a esas versiones proviene de la identificación del entorno comunicada por el Tester y es coherente con el worktree.

**Estas pruebas NO validan funcionalmente la corrección D-001 del commit `9e8bddb`.** La regresión de ese commit se verificó por separado a nivel unitario. No deben trasladarse sus resultados a Docker ni atribuirse estas observaciones al código de la rama documental.

## Fuentes y criterio de clasificación

- **E-M01 — declaración del Tester:** relación de resultados manuales comunicada en el chat al solicitar este informe, atribuida al 10 y 11 de noviembre de 2026. No existe una captura o exportación de esa declaración adjunta al paquete.
- **E-M02 — observación previa del Tester:** al abrir `http://localhost/nuevo-analisis` con Administrador, el frontend redirigió al dashboard. La confirmación posterior del responsable QA aporta el resultado de la comprobación del backend, registrado en E-M03.
- **E-M03 — confirmación posterior del responsable QA en el chat:** Felipe confirmó el resultado del botón Atrás, método y ruta de las solicitudes protegidas, estados HTTP y códigos de error, comportamiento tras aproximadamente 11 minutos de inactividad y texto de las pantallas pendientes. Son observaciones reportadas; no hay evidencias HTTP ni capturas adjuntas.
- **E-T01 — revisión local de Git:** integración y últimos commits de backend/frontend del worktree indicados arriba. Es evidencia de versiones del código local, no evidencia de ejecución funcional.

No se localizaron capturas funcionales o archivos HAR en la búsqueda local realizada. Las imágenes encontradas correspondían a vistas de los registros TSP, no a estas pruebas. No se identificaron logs HTTP asociados a los escenarios. No se inventan nombres de capturas, cuerpos de respuestas, códigos HTTP ni mensajes literales.

**Exitosa reportada** significa que el Tester comunicó el comportamiento esperado como observado; no implica reproducción independiente ni evidencia técnica adjunta. **Observación** registra un comportamiento sin afirmar el cumplimiento completo de un requisito. **Pendiente** significa que el alcance concreto no está comprobado con la información disponible. Los identificadores siguientes organizan el informe; no son nombres de tests automatizados ni un conteo de ejecuciones.

## Matriz de resultados manuales

| ID | Escenario | Resultado comunicado | Clasificación | Fuente y límites de evidencia |
|---|---|---|---|---|
| FM-01 | Primer ingreso | Se exigió cambiar la contraseña temporal y configurar inicialmente el autenticador TOTP. | Exitosa reportada | E-M01. Faltan secuencia de pantallas, evidencia del bloqueo hasta completar cada etapa y fecha específica. |
| FM-02 | Segundo ingreso | Se ingresó con contraseña definitiva y código TOTP. | Exitosa reportada | E-M01. Faltan captura sin secretos o registro técnico del acceso completado. |
| FM-03 | Contraseña incorrecta | El intento fue rechazado. | Exitosa reportada | E-M01. No se dispone del mensaje literal, respuesta HTTP ni número de intentos. No acredita el bloqueo por intentos fallidos. |
| FM-04 | Contraseña temporal anterior | Fue rechazada después del cambio de contraseña. | Exitosa reportada | E-M01. Falta evidencia específica del intento posterior al cambio. No registrar las contraseñas utilizadas. |
| FM-05 | TOTP incorrecto | El código fue rechazado. | Exitosa reportada | E-M01. No se conserva código, respuesta HTTP ni mensaje literal. |
| FM-06 | TOTP reutilizado | La reutilización fue rechazada. | Exitosa reportada | E-M01. Falta documentar la secuencia del primer uso y segundo intento, sin revelar el código ni la semilla. |
| FM-07 | TOTP vencido | El código vencido fue rechazado. | Exitosa reportada | E-M01. No se registraron intervalo, reloj ni ventana de tolerancia; no se acredita un límite temporal exacto. |
| FM-08 | Dashboard sin completar el segundo factor | El acceso quedó protegido. | Exitosa reportada | E-M01. Falta identificar la pantalla o redirección exacta y el estado previo de la sesión. |
| FM-09 | API sin completar el segundo factor | GET a `/api/v1/analisis/00000000-0000-0000-0000-000000000000/estado` devolvió HTTP 403, código `ETAPA_INVALIDA`. | Exitosa reportada por QA | E-M03. No hay evidencia HTTP ni captura adjunta; no se reproduce el cuerpo completo de la respuesta. |
| FM-10 | Administrador frente a ruta de médico en frontend | Al abrir `/nuevo-analisis`, el Administrador fue redirigido al dashboard. | Exitosa reportada para esa ruta del frontend | E-M02 y E-M03. Sin captura adjunta. No acredita todas las rutas médicas. |
| FM-11 | Administrador frente a endpoint exclusivo de médico en backend | Con sesión de Administrador autenticada, GET a `/api/v1/analisis/00000000-0000-0000-0000-000000000000/estado` devolvió HTTP 403, código `PERMISO_DENEGADO`. | Exitosa reportada por QA | E-M03. No hay evidencia HTTP ni captura adjunta. Se documenta el rechazo para este endpoint; no un acceso exitoso con rol médico ni todas las reglas de autorización. |
| FM-12 | Cierre de sesión y rechazo de solicitudes posteriores | Después del logout, GET a `/api/v1/analisis/00000000-0000-0000-0000-000000000000/estado` devolvió HTTP 401, código `SESION_EXPIRADA`. | Exitosa reportada por QA | E-M03. No hay evidencia HTTP ni captura adjunta. No se incluyen cookies ni tokens. |
| FM-13 | Navegación hacia atrás tras cerrar sesión | El botón Atrás del navegador no permitió recuperar el dashboard protegido. | Exitosa reportada por QA | E-M03. Sin captura adjunta. No se atribuye una redirección o mensaje concreto no comunicado. |
| FM-14 | Sesión tras un periodo de inactividad | Tras aproximadamente 11 minutos, el frontend aún permitía navegar por algunas pantallas, pero GET a `/api/v1/analisis/00000000-0000-0000-0000-000000000000/estado` devolvió HTTP 401, `SESION_EXPIRADA`. Al actualizar con F5, se redirigió al inicio de sesión. | Observación reportada por QA; rechazo de la solicitud protegida confirmado por el responsable | E-M03. Los 11 minutos son aproximados, no una medición del tiempo exacto de expiración. No se observó ni se acredita redirección automática. No hay evidencia HTTP ni captura adjunta. |
| FM-15 | Pantallas con funcionalidades pendientes | Varios menús administrativos y «Mi perfil» mostraban: «Esta pantalla se construirá en una tarea posterior». | Observación reportada: funcionalidades pendientes de implementación | E-M03. No se clasifican automáticamente como defectos ni como flujos aprobados. No hay capturas adjuntas; no se dispone del listado individual de los menús administrativos ni de sus rutas. |

No se calcula una tasa de aprobación ni un total de ejecuciones: no existe un registro completo de repeticiones, variantes y fechas por caso. Tampoco se asignan fallos adicionales a partir de ausencia de evidencia.

## Trazabilidad y relación con otros informes

La autenticación, contraseña y TOTP se relacionan con RF-U01; el control de acceso por rol se relaciona con RF-U03 y RNF-01 según la solicitud previa del Tester. Esta relación temática no constituye certificación de todos sus criterios de aceptación. Queda pendiente contrastar cada escenario con la versión oficial de los requisitos, especialmente los límites de sesión y las rutas protegidas.

El contexto de entrega incluye los PR de backend #234 y frontend #235. El informe funcional complementa el trabajo QA relacionado con el issue #70, cuyo alcance documentado es unitario; no se redefine ese issue ni se da por terminado mediante estas observaciones.

- [Informe histórico unitario de QA 6225ab6](issue-70/Informe-validacion-70-QA-6225ab6.md): sus resultados corresponden a pruebas unitarias, no a estas sesiones manuales.
- [Regresión unitaria D-001 en 9e8bddb](issue-70/Informe-regresion-D001-9e8bddb.md): 77 aprobadas y cobertura 45,22 %. El cierre de D-001 se limita al nivel unitario; no hay validación funcional de esa corrección en este informe.

**RNF-20 sigue pendiente.** Estas observaciones manuales no elevan la cobertura automatizada ni acreditan checks de CI. La fusión documental del PR #237 comunicada por el Tester tampoco equivale a desplegar la corrección en el entorno Docker.

## Información pendiente y límites para la revisión

Las confirmaciones E-M03 completan los resultados antes pendientes sobre el botón Atrás y las respuestas de API. No queda información indispensable sin confirmar para presentar este documento como informe de observaciones manuales reportadas por el responsable QA, con los límites aquí indicados.

No hay evidencias HTTP ni capturas adjuntas. Los resultados comunicados no equivalen a una reproducción independiente ni a una auditoría técnica respaldada por esos archivos. No se deben reconstruir evidencias históricas ni atribuir a estas sesiones una ejecución futura.

Como detalles complementarios no indispensables para este alcance, siguen sin registrarse el listado individual y rutas de los menús administrativos pendientes, el navegador y su versión, el día de cada escenario, horarios y duración efectiva de las sesiones. Los aproximadamente 11 minutos no fijan el instante de expiración ni demuestran el cumplimiento de un umbral exacto. Se mantienen sin afirmar los comportamientos no comprobados, como acceso exitoso de un médico, cobertura de todas las rutas, bloqueo por número de intentos y redirección automática por inactividad.

La conformidad completa con cada requisito requiere contrastar sus criterios de aceptación; este informe no la declara. Las comprobaciones siguen atribuidas exclusivamente al Docker con backend `8b22250` y frontend `428b7fb`, no a la corrección D-001 de `9e8bddb`.

No se incluyen credenciales, códigos TOTP, semillas, cookies ni datos de pacientes. No se ejecutaron pruebas ni se modificaron servicios, código, informes anteriores o registros TSP para preparar esta entrega. La publicación de este informe es documental y no constituye una nueva ejecución de pruebas.
