# Regresión D-001 — cierre verificado a nivel unitario

Issue #70; RF-U01 #84; RNF-20 #139. Responsable QA: Felipe Sarmiento.

## Alcance y versiones

Se verificó el commit 9e8bddb7f0f34bf2e843932ceea541a1ba2c3441 en una copia independiente, sin modificar el código ni Docker. Se utilizaron los siete archivos originales, los mismos 77 casos y 81 versiones de dependencias de la ejecución anterior. pip check correcto.

El caso test_T70_S02_codigo_malformado_se_rechaza[digitos-unicode] aprobó: la función verificar_codigo_totp devuelve None ante los seis dígitos Unicode, sin TypeError. No se ejecutaron nuevas pruebas para redactar este informe.

| Versión / ejecución | Pruebas | Aprobadas | Fallidas | Errores | Omitidas | Cobertura global |
|---|---:|---:|---:|---:|---:|---:|
|8b22250, suite anterior|77|76|1|0|0|45,22 %|
|9e8bddb, caso Unicode|1|1|0|0|0|14,41 %|
|9e8bddb, suite completa|77|77|0|0|0|45,22 %|

Los dos comandos de regresión terminaron con código 1 exclusivamente por el umbral de cobertura global de pytest (70 %). No hubo pruebas fallidas ni errores de preparación. RNF-20 sigue pendiente: exige cobertura suficiente en módulos críticos y verificación mediante CI. Esta ejecución local no acredita CI ni pruebas funcionales.

## Fechas verificables y registro TSP

JUnit registra el inicio del caso Unicode el 11/11/2026 a las 17:14:14.767658 y el de la suite a las 17:14:19.974709, UTC−5. Estas marcas corresponden a ejecuciones automáticas, no a horarios de trabajo humano ni al momento de corrección del código.

D-001 se actualizó a Estado Verificado (valor permitido por la plantilla), con cierre limitado al nivel unitario y fase de eliminación Codificación, según instrucción del responsable QA. Se conserva la fecha inicial de detección 09/11/2026. El tiempo de corrección queda vacío: no está comprobado. No se inventa una fecha ni hora de corrección.

## Límites y pendientes

Docker conserva el backend anterior 8b22250 y la integración a6838af; no se actualizó ni se consultó su estado de ejecución en esta tarea. La corrección NO está validada funcionalmente en Docker. El commit también cambia la validación del teléfono; esta regresión no demuestra cobertura específica de ese cambio. El Time Log y los informes históricos se conservan intactos; este documento complementa el informe de QA 6225ab6 y actualiza el estado del defecto.

## Evidencias de entrega

Las referencias siguientes son relativas y funcionan al publicar la carpeta completa bajo `Informes de validaciones/issue-70/`. Los originales permanecen intactos en la copia de regresión. Los XML de entrega omiten hostname y parámetros sintéticos para no publicar contraseñas de prueba; los registros TXT omiten rutas locales. Se mantienen conteos, estados, orden y fechas. La variante digitos-unicode conserva su identificador. No se ejecutaron pruebas al preparar este paquete.

El [Defect Log oficial](registros-tsp/TSP_Defect_Log_Gastro-AI.xlsx) contiene el cierre unitario de D-001. Se actualiza el archivo oficial existente; no se incluye una segunda copia del Excel en la carpeta de regresión.

[Procedencia y hashes de originales/copias](regresion-D001-9e8bddb/PROCEDENCIA.json). [Manifiesto de entrega](regresion-D001-9e8bddb/MANIFIESTO-SHA256.json). Los hashes de abajo corresponden a las COPIAS DE ENTREGA, no a los XML sin redactar.

| Archivo | SHA-256 de entrega |
|---|---|
|[unicode.xml](regresion-D001-9e8bddb/unicode.xml)|`d8216bf6d487393f79d331962751eb50700a9ad475df03719f6ca74f3042c44e`|
|[unicode.txt](regresion-D001-9e8bddb/unicode.txt)|`84324400ccd9cca7297c2ce95a35a617d7e575e636069ad9cbf70dc7efb742d7`|
|[unicode-exit.txt](regresion-D001-9e8bddb/unicode-exit.txt)|`f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04`|
|[cobertura-unicode.json](regresion-D001-9e8bddb/cobertura-unicode.json)|`eeb1f936a722578e0097458d929164b3cbb40e0d2b22f15dafc7a5a150d03a15`|
|[suite-77.xml](regresion-D001-9e8bddb/suite-77.xml)|`8f9281ab18483e8e80de122ecc05681fc9e7932332013614108600f4be7ee75b`|
|[suite-77.txt](regresion-D001-9e8bddb/suite-77.txt)|`40aa986e263b8f0a2e0f6a814b08f6821ade6d561309a68905a84ab1b5d6ce32`|
|[suite-exit.txt](regresion-D001-9e8bddb/suite-exit.txt)|`f1b2f662800122bed0ff255693df89c4487fbdcf453d3524a42d4ec20c3d9c04`|
|[cobertura-suite.json](regresion-D001-9e8bddb/cobertura-suite.json)|`58c98863ef9adc242545de127abfe230a07145b366ed9e53dad2f3ed179d68cf`|
|[contexto.json](regresion-D001-9e8bddb/contexto.json)|`b4ea59d65f5df2c0fe78d3128cde835ce6daca7237e1615c37360f20394b0862`|
|[pip-check.txt](regresion-D001-9e8bddb/pip-check.txt)|`672aec65a45bed50e70229c70934a7eebf0462595c459b83023027645d57cccf`|
|[dependencias.txt](regresion-D001-9e8bddb/dependencias.txt)|`be40d7464adabea4475a7de44cac46e27972f772fe294c69c62debd0b8ae27af`|
|[comparacion-8b22250/resultados-70-8b22250.xml](regresion-D001-9e8bddb/comparacion-8b22250/resultados-70-8b22250.xml)|`8267b632e2a0915ccbcdb66277fda94291665dc172eccf69e695c3a3d52d869c`|
|[comparacion-8b22250/cobertura-70-8b22250.json](regresion-D001-9e8bddb/comparacion-8b22250/cobertura-70-8b22250.json)|`09f6e14a006f16828968a593f63b2e8425c4b2967f2c5c0292bd69eab3bab2c5`|
|[registros-tsp/TSP_Defect_Log_Gastro-AI.xlsx](registros-tsp/TSP_Defect_Log_Gastro-AI.xlsx)|`1413dbb52952e76bc9cc05572e7b906f58c0c880ad374248fe372acf51f34246`|

La comparación contra 8b22250 queda respaldada por el XML y JSON en comparacion-8b22250. Se excluyen caches binarios de cobertura y registro de instalación por no ser necesarios para revisar estos resultados. El listado de dependencias y pip check están incluidos.

## Alcance de esta entrega documental

Esta entrega parte de la rama oficial `testing/qa-branch`, commit `eceb235`. Las evidencias corresponden a la copia independiente probada en `9e8bddb`, no a una ejecución sobre el código de esta rama documental. No se incorporan commits ni cambios de desarrollo del backend o frontend.
