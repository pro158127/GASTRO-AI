# Seguimiento de archivos bajo 70 % de cobertura

**Requisito:** RNF-20 / issue #139  
**Responsable de los ocho planes:** Cristian David Sánchez (líder)  
**Línea base oficial:** `testing/qa-branch` SHA `2c4054d011425ab7b40daed15303d3abe7180744`, Actions run [46024187628](https://github.com/pro158127/GASTRO-AI/actions/runs/46024187628)  
**Aprobación de responsable y política:** 2026-11-27

El artefacto oficial contiene 4.886/6.122 líneas cubiertas (79,810519 %); los seis grupos aprobados superan el 70 %. Estos ocho archivos quedan como acciones de mejora individuales. La política aprobada bloquea CI por cobertura global o de grupo; no establece el 70 % como bloqueo por archivo. Ningún archivo de este conjunto tuvo 0 % en la línea base.

Los porcentajes son línea base del artefacto citado. Los planes siguientes aún no se han ejecutado ni son evidencia de cobertura nueva. Cada cambio de pruebas debe verificar los casos enumerados y volver a correr la suite completa; el grupo relacionado debe permanecer en o por encima del 70 %.

| Archivo | Línea base | Plan de mejora asignado a Cristian David Sánchez |
|---|---:|---|
| `app/adapters/almacen.py` | 39/109 (35,78 %) | Añadir pruebas unitarias con clientes S3 simulados para subida/lectura/descarga, metadatos, copia, borrado y URL firmada; probar error de objeto inexistente frente a error inesperado; cubrir disponibilidad, listado, creación de bucket y limpieza temporal. Verificar que no se filtren claves/URLs privadas en errores. |
| `app/api/routers/admin_usuarios.py` | 55/80 (68,75 %) | Cubrir conversión de resumen/credencial/traslado y ramas de endpoints administrativos: paginación y filtros, permisos por rol, crear/editar/cambiar rol, activar/desactivar/eliminar, reasignar casos, restablecer o reenviar credencial y desbloquear. Incluir errores 404/409 y validar que usuario doctor no pueda invocar acciones administrativas. |
| `app/api/routers/analisis.py` | 51/84 (60,71 %) | Añadir pruebas de contrato para solicitar/listar/observar análisis, serializar historial y calidad, detalle, reintentar análisis y reintentar explicación. Cubrir sesión no autorizada, análisis ajeno/no encontrado, payload inválido, campos opcionales/nulos y mapeo de excepciones a HTTP. |
| `app/repositories/analisis_repository.py` | 23/48 (47,92 %) | Probar contra la sesión de base de datos de pruebas el modelo vigente, bloqueo de fila/paciente, alcance por doctor y seudónimos, consulta de historial, consecutivo, alta/consulta por ID, traslado recibido, reapertura limitada de explicación, latencia LLM y deduplicación de observación. Afirmar aislamiento entre doctores y resultado de cada rama. |
| `app/repositories/historial_repository.py` | 29/55 (52,73 %) | Ejercitar filtros por fecha, estado y origen, búsqueda por seudónimos, paginación/orden y total; cubrir entradas vacías y combinación de filtros. Comprobar además la consulta de casos de paciente y que solo incluya análisis del doctor solicitante. |
| `app/repositories/pacientes_repository.py` | 17/26 (65,38 %) | Probar expresiones de pertenencia por doctor/seudónimos, historial con uno o varios seudónimos, múltiples análisis por caso y ausencia de resultados. Confirmar conteos e IDs distintos sin mezclar pacientes ni doctores. |
| `app/repositories/reportes_repository.py` | 18/27 (66,67 %) | Cubrir selección de análisis propios frente a ajenos, caso propio/no propio, análisis de caso vacío, creación de reporte con IDs permitidos, consulta del reporte por doctor y búsqueda de su primer código. Incluir lista vacía, IDs inexistentes y combinación de propietarios. |
| `app/repositories/usuarios_repository.py` | 33/84 (39,29 %) | Cubrir normalización y unicidad de correo (incluido `excepto`), búsqueda por correo/ID/rol, filtros y órdenes admitidos/no admitidos, paginación y total, casos activos, candado de administradores, otros administradores activos, suma de intentos y bloqueo por usuario. Verificar límites, orden estable y aislamiento entre usuarios. |

## Criterios de cierre del plan

- Cada grupo de pruebas añadido debe verificar comportamiento observable y ramas enumeradas, sin mocks que sustituyan la lógica que se pretende medir.
- Ejecutar la suite backend completa con Python 3.12 y comparar la nueva cobertura por archivo y grupo con la línea base.
- Registrar SHA, salida JUnit y `cobertura.json`; reportar el resultado real aunque un archivo siga bajo 70 %.
- Revisar que no se reduzca la cobertura global ni la de un grupo bajo su mínimo aprobado de 70 %.
- Mantener la política aprobada de no exigir un porcentaje mínimo individual como condición de merge; los archivos bajos siguen visibles en este registro hasta completar los planes.
