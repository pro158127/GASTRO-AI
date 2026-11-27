# RNF-20: cobertura global y por grupos críticos

El workflow `QA pruebas y cobertura global` conserva el umbral global del 70 % y añade un gate de 70 % para cada uno de los seis grupos de `coverage-critical-groups.json`. El mapa sigue la propuesta de 41 rutas del documento de aprobación de RNF-20; algunas rutas pertenecen a más de un grupo porque participan en distintos flujos.

El gate falla si la cobertura global o un grupo queda debajo del 70 %, si falta una ruta del mapa en el artefacto o si una ruta no tiene líneas ejecutables medibles. Los porcentajes se comparan con conteos enteros, sin redondearlos.

Una ruta individual debajo del 70 % se reporta como aviso; no bloquea mientras su grupo cumpla. Esta regla sigue el criterio de cobertura por módulo descrito en RNF-20. Los archivos bajo el umbral requieren seguimiento y plan de mejora, aunque el gate de grupo pase. Si una ruta tiene 0 %, el resultado individual se informa como aviso y el grupo sigue sujeto al umbral; no se afirma que un 0 % individual ya esté presente en la evidencia evaluada.

## Reproducción sobre la evidencia oficial

El artefacto `cobertura.json` del run [46024187628](https://github.com/pro158127/GASTRO-AI/actions/runs/46024187628), SHA `2c4054d011425ab7b40daed15303d3abe7180744`, produjo:

| Grupo | Cobertura |
|---|---:|
| Autenticación y control de acceso | 87,063267 % |
| Carga y seudonimización de imágenes | 72,527473 % |
| Pipeline de procesamiento | 86,403509 % |
| Ejecución del modelo | 99,731903 % |
| Resultados, historial y PDF | 85,436893 % |
| Aviso experimental backend | 91,001451 % |

La cobertura global fue 4.886/6.122 = 79,810519 %. Ocho archivos del mapa quedaron bajo 70 % individual y ninguno en 0 %. Se enumeran como avisos en la salida del job.

El job de cobertura conserva el nombre de check `Backend cobertura global >=70%`, que ya es requerido por la protección estricta de `testing/qa-branch`; así el gate de grupo queda incluido en el mismo check obligatorio.

El 2026-11-27, Cristian David Sánchez aprobó el mapa propuesto de seis grupos/41 rutas y el criterio de tratar las coberturas individuales bajo 70% (incluido 0%) como hallazgos con plan de mejora, mientras el bloqueo CI se aplica al global y a cada grupo. El mismo responsable quedó asignado a los ocho archivos bajo 70% del artefacto de referencia. Los planes verificables por archivo, con líneas base y casos a cubrir, están en [`COVERAGE_FILE_REMEDIATION.md`](COVERAGE_FILE_REMEDIATION.md). La aprobación del mapa no significa que los ocho planes ya se hayan ejecutado.
