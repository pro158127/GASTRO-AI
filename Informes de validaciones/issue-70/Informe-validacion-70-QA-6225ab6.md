# Informe de validación unitaria — Issue #70

Identificador: INF-70-QA-6225AB6-01. Estado: ejecución completada con una prueba fallida; requisito RNF-20 pendiente. Copia documental preparada para revisión y publicación posterior. Defect Log con D-001 abierto; Time Log parcial, sin tiempos confirmados. Esta entrega NO acredita pruebas sobre testing/qa-branch.

## Objetivo y trazabilidad

Evaluar los comportamientos existentes de autenticación, bloqueo, sesiones, TOTP, permisos, política de contraseñas y seudonimización con las 77 pruebas existentes. Responsable: Felipe Sarmiento.

- [Issue #70: Matriz de pruebas unitarias](https://github.com/pro158127/GASTRO-AI/issues/70): EDT 1.3.3.4; predecesora #63; hito 008.
- [RNF-20 #139](https://github.com/pro158127/GASTRO-AI/issues/139): cobertura ≥70 % en módulos críticos y checks de CI antes de fusionar PR a ramas protegidas.
- [RF-U01 #84](https://github.com/pro158127/GASTRO-AI/issues/84): autenticación multifactor, bloqueo y acceso por etapa. Defecto relacionado con el tratamiento de códigos TOTP.
- Código objeto de validación: backend del PR #234 y frontend del PR #235. El frontend no fue probado funcionalmente en esta ejecución.
- Instrucción de Cristian comunicada por Felipe: centralizar posteriormente en testing/qa-branch, guardar informes en Informes de validaciones/ y diligenciar registros TSP. No se ha publicado esta entrega. Se adjuntan copias del Defect Log diligenciado y del Time Log parcial; no reemplazan automáticamente las plantillas compartidas.

## Versiones, entorno y método

- Rama: `test/70-preparacion-qa`; integración: `6225ab680cb5cbadfcb02561b7ffba1314590e0d`.
- Backend: `8b222500f41fcaff96893666179f44d71d1cf04c`; frontend incorporado: `428b7fbdac9dde25a40c9796adae1a35eb91b59d`.
- Windows, Python 3.12.10, entorno independiente backend/.venv, pytest 9.2.0, pytest-cov 7.1.0 y coverage 7.17.2.
- 81 dependencias coincidentes con la ejecución anterior; pip check: sin incompatibilidades. Lista exacta en E04.
- Siete archivos de pruebas conservados por SHA-256. Se compararon los identificadores de los 77 casos con el XML anterior. No se añadieron ni modificaron pruebas.
- Repositorios simulados y datos sintéticos; conftest bloquea conexiones de red. Sin Docker, base de datos real ni credenciales reales.
- Inicio registrado por JUnit: `2026-11-10T13:11:49.630672-05:00`; tiempo del suite: `15.265` segundos. Es tiempo automatizado, no tiempo de trabajo para el TSP Time Log.

Comando ejecutado desde backend (las rutas de salida apuntaron a la carpeta de esta ejecución):

```text
python -m pytest tests -v -p no:cacheprovider --junitxml=resultados-6225ab6.xml --cov-report=json:cobertura-6225ab6.json
```

Configuración adicional de pyproject.toml: `--cov=app --cov-report=term-missing --cov-fail-under=70`. COVERAGE_FILE apuntó al archivo E07. La caché de pytest fue desactivada.

## Resultados

| Ejecutadas | Aprobadas | Fallidas | Errores de preparación | Omitidas | Cobertura global |
|---:|---:|---:|---:|---:|---:|
|77|76|1|0|0|45,22 %|

Salida de pytest: 1. Se distinguen dos condiciones: una prueba fallida por TypeError y cobertura inferior al umbral global configurado. El mensaje ERROR de cobertura no equivale a un error de preparación del suite.

Comparación histórica (misma tanda de 77 casos):

| Integración | Backend | Aprobadas / fallidas | Cobertura |
|---|---|---|---|
|fbf043f|254ef5a|76 / 1|45,94 %|
|a6838af|8b22250|76 / 1|45,22 %|
|6225ab6, ejecución actual|8b22250|76 / 1|45,22 %|

Se adjuntan las evidencias históricas mínimas en [backend anterior](historico/backend-254ef5a/resultados-70-tanda2.xml), [cobertura anterior](historico/backend-254ef5a/cobertura-70-tanda2.json), [backend actualizado](historico/backend-8b22250/resultados-70-8b22250.xml) y [cobertura actualizada](historico/backend-8b22250/cobertura-70-8b22250.json). La primera tanda consta en [XML de 29 casos](historico/backend-254ef5a/resultados-70.xml). Los originales locales permanecen intactos.

## Cobertura y RNF-20

Cobertura de líneas: 1531 de 3386 sentencias, 45,215593620791495 %. No se midió cobertura de ramas. El 70 % global configurado en pytest no sustituye la evaluación de los módulos críticos exigida por RNF-20.

| Módulo observado | Cobertura de líneas |
|---|---:|
|`app\adapters\inferencia.py`|0.00 %|
|`app\api\deps.py`|80.00 %|
|`app\core\seguridad.py`|98.63 %|
|`app\core\seudonimo.py`|100.00 %|
|`app\services\autenticacion.py`|98.96 %|
|`app\services\clasificacion.py`|0.00 %|
|`app\services\configuracion_inferencia.py`|39.73 %|
|`app\services\explicacion.py`|32.74 %|
|`app\services\imagenes.py`|53.12 %|
|`app\services\politica_contrasena.py`|97.44 %|
|`app\services\procesamiento.py`|0.00 %|

RNF-20 no está cumplido: hay módulos críticos sin cobertura suficiente y esta ejecución local no acredita checks de CI ni validación de todos los PR. No se encontró directorio .github/workflows en esta copia; no se auditó la configuración remota de protección de ramas.

## Defecto confirmado y registro D-001

Identificador registrado: D-001. Estado: Abierto. No corregido. Copia en [Defect Log](registros-tsp/TSP_Defect_Log_Gastro-AI.xlsx).

- Módulo y función: backend/app/core/seguridad.py, verificar_codigo_totp; excepción en línea 113.
- Caso: test_T70_S02_codigo_malformado_se_rechaza[digitos-unicode], tests/test_totp_tanda2.py:27.
- Entrada relevante: seis dígitos Unicode `１２３４５６`, con datos auxiliares sintéticos definidos en la prueba (no reproducidos aquí).
- Esperado: devolver None para código inválido. Obtenido: TypeError: comparing strings with non-ASCII characters is not supported.
- Causa observada: isdigit() acepta esos dígitos; hmac.compare_digest con cadenas no ASCII lanza la excepción. El esquema de entrada admite la entrada. Es un defecto del tratamiento de la entrada, no una expectativa artificial de la prueba.
- Reproducción: en un entorno con las versiones de E04, ejecutar el caso existente indicado usando pytest. El caso configura sus datos y llama a verificar_codigo_totp. No se ejecutó nuevamente al redactar este informe.
- Gravedad propuesta: media, pendiente de clasificación del equipo. Impacto demostrado: excepción no controlada ante entrada inválida. Posible respuesta HTTP 500 pendiente de prueba de integración; no se ha demostrado acceso indebido ni fuga de información.
- Fecha de detección: 09/11/2026, confirmada por Felipe y registrada en el Defect Log. Reproducción actual: fecha y hora del JUnit E01.
- Integrante: Felipe Sarmiento. Requisito/issue: RF-U01 #84; seguimiento #70 / RNF-20 #139.
- Tipo propuesto: Lógica. Fase de inyección propuesta: Codificación, a confirmar. Fase de eliminación y minutos de corrección: en blanco, porque no se corrigió.
- Evidencia: E01 y E03; referencia en matriz M071. Observaciones: persiste en backend 8b22250 y QA 6225ab6.

Revisión de duplicados antes de registrar: solo existía la fila de ejemplo; no se encontró un registro real duplicado. D-001 quedó registrado en la fila 7. Esta revisión local no cubre cambios posteriores en copias compartidas.

## Datos pendientes para Time Log

El [Time Log parcial](registros-tsp/TSP_Time_Log_Gastro-AI.xlsx) contiene cuatro ejecuciones con fechas respaldadas por sus XML: tres del 09/11/2026 y una del 10/11/2026. Inicio, fin, interrupciones y estimaciones permanecen vacíos; las fórmulas se conservan. Tiempo efectivo pendiente: no hay registro completo de las sesiones y hubo pausas largas. No se declara completo ni se inventan tiempos.

Minutos netos, horas reales y desviación son campos calculados de la plantilla: no sustituirlos por cifras inventadas. Si no hay estimación original, dejarla pendiente. La duración de pytest no es la duración total del trabajo del tester.

## Limitaciones y trabajo pendiente

- Corregir el defecto por el responsable autorizado y repetir regresión; este informe no autoriza ni realiza la corrección.
- Ampliar casos reales en carga de imágenes, procesamiento, inferencia/modelo, resultados y aviso experimental. La cobertura alta de una función no demuestra todos sus criterios de aceptación.
- Frontend: [compilación histórica aprobada](historico/frontend-428b7fb/build.txt), respaldada por [contexto](historico/frontend-428b7fb/resultados-frontend-428b7fb.json); sin pruebas unitarias configuradas ni validación funcional aprobada en esta ejecución.
- Integración real: login, cambio de contraseña, TOTP, roles, sesiones y logout con servicios aún pendientes. No extrapolar mocks a integración funcional.
- Preparar/verificar CI para RNF-20 y revisar los checks de los PR antes de fusionar.
- Time Log: confirmar tiempos efectivos si se logra recuperar un registro fiable. Defect Log: D-001 abierto; gravedad e inyección propuestas, no corregido.
- Coordinar con Cristian la revisión y publicación posterior en testing/qa-branch. Issue #70 permanece incompleto; no usar este resultado para declarar cerrado RNF-20.

## Índice de evidencias y conservación

Los identificadores E01–E09 se conservan. E01 y E03 son copias redactadas para publicación: se omiten parámetros sintéticos que contienen contraseñas, clave TOTP de prueba y datos de rutas locales. No se cambian resultados ni número de casos. E09 es el manifiesto ORIGINAL y autentica los archivos originales, no las copias redactadas. Las correspondencias y ambos hashes se incluyen en [procedencia](PROCEDENCIA.json). Los hashes de esta tabla corresponden a los archivos de ENTREGA; el inventario completo está en [manifiesto de entrega](MANIFIESTO-ENTREGA-SHA256.json).

| ID | Archivo original | SHA-256 |
|---|---|---|
|E01|[resultados-6225ab6.xml](qa-6225ab6/ejecucion-01/resultados-6225ab6.xml)|`BFD57F2D80D75E203278F6F764E45463149B69DE52D6799101EE843CE115321B`|
|E02|[cobertura-6225ab6.json](qa-6225ab6/ejecucion-01/cobertura-6225ab6.json)|`72593AB6A33C0E54EDC1736674160D9BE7BB8F6D832574388D155FF40CF5ADE9`|
|E03|[ejecucion-6225ab6.txt](qa-6225ab6/ejecucion-01/ejecucion-6225ab6.txt)|`5E53A70121EC8D7D2124A702BD9B973C496A7DCB6FF6A945CBC9CB05A06EA683`|
|E04|[dependencias-6225ab6.txt](qa-6225ab6/ejecucion-01/dependencias-6225ab6.txt)|`BE40D7464ADABEA4475A7DE44CAC46E27972F772FE294C69C62DEBD0B8AE27AF`|
|E05|[pip-check.txt](qa-6225ab6/ejecucion-01/pip-check.txt)|`672AEC65A45BED50E70229C70934A7EEBF0462595C459B83023027645D57CCCF`|
|E06|[contexto-6225ab6.json](qa-6225ab6/ejecucion-01/contexto-6225ab6.json)|`26C31891F034663EE3F29D23640E55D81C977B44804906AFAD16D0CD82C53DF7`|
|E07|[.coverage-6225ab6](qa-6225ab6/ejecucion-01/.coverage-6225ab6)|`6EBC68D7AA415F205E42C795006D68CE93BFD5B18CB65856583436AF4322C9CC`|
|E08|[resumen-6225ab6.json](qa-6225ab6/ejecucion-01/resumen-6225ab6.json)|`05ED82B1B663BB5F7536957D442F3E3DC79F54F39871AB4A222C6AC2272DEC30`|
|E09|[manifiesto-sha256.json](qa-6225ab6/ejecucion-01/manifiesto-sha256.json)|`FDB94144C669EE2CF4A06F7BF36EEB535821C4134AC5C0FA81C432F6890801F8`|

## Matriz de casos realmente ejecutados

Identificadores M001–M077 documentales, no casos nuevos. Cada fila corresponde al caso en esa posición (desde 1) del XML E01. Se conserva módulo y función; se omiten los valores de parametrización para no reproducir contraseñas sintéticas ni secretos de prueba. En E01 se conserva el orden y la variante digitos-unicode; otros parámetros se sustituyen por identificadores ordinales para no divulgar datos sintéticos sensibles. Los identificadores completos permanecen solo en los originales locales. Todos se relacionan con #70 / RNF-20 #139; las asociaciones funcionales adicionales requieren validar el criterio específico, sin declarar cobertura completa de requisitos.

| ID | Módulo | Función existente | Resultado | Evidencia |
|---|---|---|---|---|
|M001|`tests.test_acceso_sesion`|`test_solo_administrador_supera_control_de_rol`|APROBADA|E01, caso 1; E03|
|M002|`tests.test_acceso_sesion`|`test_solo_administrador_supera_control_de_rol`|APROBADA|E01, caso 2; E03|
|M003|`tests.test_acceso_sesion`|`test_actividad_pasiva_no_renueva_sesion`|APROBADA|E01, caso 3; E03|
|M004|`tests.test_acceso_sesion`|`test_actividad_pasiva_no_renueva_sesion`|APROBADA|E01, caso 4; E03|
|M005|`tests.test_acceso_sesion`|`test_sesion_expira_por_inactividad`|APROBADA|E01, caso 5; E03|
|M006|`tests.test_acceso_sesion`|`test_segundo_factor_pendiente_no_accede_a_sesion_activa`|APROBADA|E01, caso 6; E03|
|M007|`tests.test_autenticacion_tanda2`|`test_T70_A01_login_selecciona_etapa_y_guarda_hash`|APROBADA|E01, caso 7; E03|
|M008|`tests.test_autenticacion_tanda2`|`test_T70_A01_login_selecciona_etapa_y_guarda_hash`|APROBADA|E01, caso 8; E03|
|M009|`tests.test_autenticacion_tanda2`|`test_T70_A01_login_selecciona_etapa_y_guarda_hash`|APROBADA|E01, caso 9; E03|
|M010|`tests.test_autenticacion_tanda2`|`test_T70_A02_login_no_revela_estado_de_cuenta`|APROBADA|E01, caso 10; E03|
|M011|`tests.test_autenticacion_tanda2`|`test_T70_A02_login_no_revela_estado_de_cuenta`|APROBADA|E01, caso 11; E03|
|M012|`tests.test_autenticacion_tanda2`|`test_T70_A02_login_no_revela_estado_de_cuenta`|APROBADA|E01, caso 12; E03|
|M013|`tests.test_autenticacion_tanda2`|`test_T70_A02_login_no_revela_estado_de_cuenta`|APROBADA|E01, caso 13; E03|
|M014|`tests.test_autenticacion_tanda2`|`test_T70_A02_login_no_revela_estado_de_cuenta`|APROBADA|E01, caso 14; E03|
|M015|`tests.test_autenticacion_tanda2`|`test_T70_A03_quinto_fallo_bloquea_quince_minutos`|APROBADA|E01, caso 15; E03|
|M016|`tests.test_autenticacion_tanda2`|`test_T70_A04_temporal_vencida_no_crea_sesion`|APROBADA|E01, caso 16; E03|
|M017|`tests.test_autenticacion_tanda2`|`test_T70_A04_temporal_vencida_no_crea_sesion`|APROBADA|E01, caso 17; E03|
|M018|`tests.test_autenticacion_tanda2`|`test_T70_A05_sesiones_no_autorizadas`|APROBADA|E01, caso 18; E03|
|M019|`tests.test_autenticacion_tanda2`|`test_T70_A05_sesiones_no_autorizadas`|APROBADA|E01, caso 19; E03|
|M020|`tests.test_autenticacion_tanda2`|`test_T70_A05_sesiones_no_autorizadas`|APROBADA|E01, caso 20; E03|
|M021|`tests.test_autenticacion_tanda2`|`test_T70_A05_sesiones_no_autorizadas`|APROBADA|E01, caso 21; E03|
|M022|`tests.test_autenticacion_tanda2`|`test_T70_A05_sesiones_no_autorizadas`|APROBADA|E01, caso 22; E03|
|M023|`tests.test_autenticacion_tanda2`|`test_T70_A05_sesiones_no_autorizadas`|APROBADA|E01, caso 23; E03|
|M024|`tests.test_autenticacion_tanda2`|`test_T70_A06_totp_valido_activa_y_reinicio_de_contador`|APROBADA|E01, caso 24; E03|
|M025|`tests.test_autenticacion_tanda2`|`test_T70_A07_totp_invalido_cuenta_y_bloquea`|APROBADA|E01, caso 25; E03|
|M026|`tests.test_autenticacion_tanda2`|`test_T70_A07_totp_invalido_cuenta_y_bloquea`|APROBADA|E01, caso 26; E03|
|M027|`tests.test_autenticacion_tanda2`|`test_T70_A08_vinculacion_cifra_secreto_y_confirma_cuenta`|APROBADA|E01, caso 27; E03|
|M028|`tests.test_autenticacion_tanda2`|`test_T70_A09_vinculacion_rechaza_fallos`|APROBADA|E01, caso 28; E03|
|M029|`tests.test_autenticacion_tanda2`|`test_T70_A09_vinculacion_rechaza_fallos`|APROBADA|E01, caso 29; E03|
|M030|`tests.test_autenticacion_tanda2`|`test_T70_A09_vinculacion_rechaza_fallos`|APROBADA|E01, caso 30; E03|
|M031|`tests.test_autenticacion_tanda2`|`test_T70_A10_cambiar_temporal_actualiza_hash_y_etapa`|APROBADA|E01, caso 31; E03|
|M032|`tests.test_autenticacion_tanda2`|`test_T70_A10_cambiar_temporal_actualiza_hash_y_etapa`|APROBADA|E01, caso 32; E03|
|M033|`tests.test_autenticacion_tanda2`|`test_T70_A11_cierre_impide_reutilizar_sesion`|APROBADA|E01, caso 33; E03|
|M034|`tests.test_autenticacion_tanda2`|`test_T70_A11_cierre_impide_reutilizar_sesion`|APROBADA|E01, caso 34; E03|
|M035|`tests.test_autenticacion_tanda2`|`test_T70_A12_dependencia_transmite_cookie_etapa_y_actividad`|APROBADA|E01, caso 35; E03|
|M036|`tests.test_autenticacion_tanda2`|`test_T70_A12_dependencia_transmite_cookie_etapa_y_actividad`|APROBADA|E01, caso 36; E03|
|M037|`tests.test_autenticacion_tanda2`|`test_T70_A12_dependencia_transmite_cookie_etapa_y_actividad`|APROBADA|E01, caso 37; E03|
|M038|`tests.test_autenticacion_tanda2`|`test_T70_A13_cambio_de_rol_revoca_permiso`|APROBADA|E01, caso 38; E03|
|M039|`tests.test_autenticacion_tanda2`|`test_T70_A14_aviso_antes_del_cierre`|APROBADA|E01, caso 39; E03|
|M040|`tests.test_politica_contrasena`|`test_limites_de_longitud`|APROBADA|E01, caso 40; E03|
|M041|`tests.test_politica_contrasena`|`test_limites_de_longitud`|APROBADA|E01, caso 41; E03|
|M042|`tests.test_politica_contrasena`|`test_limites_de_longitud`|APROBADA|E01, caso 42; E03|
|M043|`tests.test_politica_contrasena`|`test_limites_de_longitud`|APROBADA|E01, caso 43; E03|
|M044|`tests.test_politica_contrasena`|`test_rechazo_de_claves_inseguras`|APROBADA|E01, caso 44; E03|
|M045|`tests.test_politica_contrasena`|`test_rechazo_de_claves_inseguras`|APROBADA|E01, caso 45; E03|
|M046|`tests.test_politica_contrasena`|`test_rechazo_de_claves_inseguras`|APROBADA|E01, caso 46; E03|
|M047|`tests.test_politica_contrasena`|`test_rechazo_de_claves_inseguras`|APROBADA|E01, caso 47; E03|
|M048|`tests.test_politica_contrasena`|`test_confirmacion_y_reutilizacion_de_temporal`|APROBADA|E01, caso 48; E03|
|M049|`tests.test_politica_contrasena`|`test_longitud_unicode_normalizada`|APROBADA|E01, caso 49; E03|
|M050|`tests.test_seguridad`|`test_bcrypt_unicode_sin_truncamiento`|APROBADA|E01, caso 50; E03|
|M051|`tests.test_seguridad`|`test_hash_ausente_o_corrupto_rechaza_acceso`|APROBADA|E01, caso 51; E03|
|M052|`tests.test_seguridad`|`test_hash_ausente_o_corrupto_rechaza_acceso`|APROBADA|E01, caso 52; E03|
|M053|`tests.test_seguridad`|`test_totp_valido_no_se_puede_reutilizar`|APROBADA|E01, caso 53; E03|
|M054|`tests.test_seudonimo`|`test_normaliza_tipo_y_separadores`|APROBADA|E01, caso 54; E03|
|M055|`tests.test_seudonimo`|`test_rechaza_documento_invalido_sin_revelarlo`|APROBADA|E01, caso 55; E03|
|M056|`tests.test_seudonimo`|`test_rechaza_documento_invalido_sin_revelarlo`|APROBADA|E01, caso 56; E03|
|M057|`tests.test_seudonimo`|`test_rechaza_documento_invalido_sin_revelarlo`|APROBADA|E01, caso 57; E03|
|M058|`tests.test_seudonimo`|`test_rechaza_documento_invalido_sin_revelarlo`|APROBADA|E01, caso 58; E03|
|M059|`tests.test_seudonimo`|`test_hmac_y_rotacion_conservan_busqueda_anterior`|APROBADA|E01, caso 59; E03|
|M060|`tests.test_seudonimo`|`test_rechaza_configuracion_hmac_invalida`|APROBADA|E01, caso 60; E03|
|M061|`tests.test_seudonimo`|`test_rechaza_configuracion_hmac_invalida`|APROBADA|E01, caso 61; E03|
|M062|`tests.test_seudonimo`|`test_rechaza_configuracion_hmac_invalida`|APROBADA|E01, caso 62; E03|
|M063|`tests.test_totp_tanda2`|`test_T70_S01_ventana_totp`|APROBADA|E01, caso 63; E03|
|M064|`tests.test_totp_tanda2`|`test_T70_S01_ventana_totp`|APROBADA|E01, caso 64; E03|
|M065|`tests.test_totp_tanda2`|`test_T70_S01_ventana_totp`|APROBADA|E01, caso 65; E03|
|M066|`tests.test_totp_tanda2`|`test_T70_S01_ventana_totp`|APROBADA|E01, caso 66; E03|
|M067|`tests.test_totp_tanda2`|`test_T70_S01_ventana_totp`|APROBADA|E01, caso 67; E03|
|M068|`tests.test_totp_tanda2`|`test_T70_S02_codigo_malformado_se_rechaza`|APROBADA|E01, caso 68; E03|
|M069|`tests.test_totp_tanda2`|`test_T70_S02_codigo_malformado_se_rechaza`|APROBADA|E01, caso 69; E03|
|M070|`tests.test_totp_tanda2`|`test_T70_S02_codigo_malformado_se_rechaza`|APROBADA|E01, caso 70; E03|
|M071|`tests.test_totp_tanda2`|`test_T70_S02_codigo_malformado_se_rechaza`|FALLIDA|E01, caso 71; E03|
|M072|`tests.test_totp_tanda2`|`test_T70_S03_cifrado_asociado_a_usuario`|APROBADA|E01, caso 72; E03|
|M073|`tests.test_totp_tanda2`|`test_T70_S03_cifrado_asociado_a_usuario`|APROBADA|E01, caso 73; E03|
|M074|`tests.test_totp_tanda2`|`test_T70_S03_cifrado_asociado_a_usuario`|APROBADA|E01, caso 74; E03|
|M075|`tests.test_totp_tanda2`|`test_T70_S03_cifrado_asociado_a_usuario`|APROBADA|E01, caso 75; E03|
|M076|`tests.test_totp_tanda2`|`test_T70_S04_clave_de_cifrado_invalida`|APROBADA|E01, caso 76; E03|
|M077|`tests.test_totp_tanda2`|`test_T70_S04_clave_de_cifrado_invalida`|APROBADA|E01, caso 77; E03|

## Registros TSP adjuntos

- [Defect Log: D-001 abierto](registros-tsp/TSP_Defect_Log_Gastro-AI.xlsx).
- [Time Log PARCIAL: tiempos pendientes](registros-tsp/TSP_Time_Log_Gastro-AI.xlsx).

Son copias exactas de los Excel locales actualizados. No se cargan sobre las plantillas oficiales para evitar sobrescribir registros de otros integrantes.

## Alcance de esta publicación documental

El commit 6225ab6 y la rama test/70-preparacion-qa son LOCALES. No se presupone que GitHub pueda resolver ese commit. Los commits de desarrollo 8b22250 y 428b7fb identifican el código probado, pero esta entrega no los incorpora a testing/qa-branch. No contiene código ni los siete archivos de pruebas. Sirve para revisión de resultados históricos; reproducirlos exige obtener el código y las pruebas en una entrega posterior autorizada. No constituye CI aprobado, integración funcional aprobada ni cierre de #70/#139.
