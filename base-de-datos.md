# base de datos

PostgreSQL 16 con **20 tablas** organizadas en **5 módulos** y **18 tipos enumerados**. Ninguna tabla tiene columnas con el documento ni el nombre del paciente: solo el seudónimo HMAC y la versión de la clave con que se calculó.

## Tablas por módulo

| Módulo                           | Tablas                                                                                                             | Qué guarda                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · Usuarios y acceso**        | `Rol`, `Usuario`, `Sesion`, `EnvioCredencial`                                                                      | Cuentas, estado, bloqueo, segundo factor cifrado, sesiones (solo el hash del token) y envíos de contraseñas temporales                                                              |
| **2 · Casos y análisis**         | `CasoPaciente`, `Analisis`, `ResultadoCaracteristica`, `RegionInteres`, `ExplicacionLlm`, `ObservacionProfesional` | Caso seudonimizado, cada análisis con su imagen y calidad, resultados por característica con el umbral aplicado, regiones del mapa de calor, explicación y observaciones del doctor |
| **3 · Modelo y configuración**   | `Caracteristica`, `ModeloDesplegado`, `MetricaModelo`, `ConfiguracionInferencia`                                   | Qué clasifica el modelo, qué versión está vigente, sus métricas y los umbrales                                                                                                      |
| **4 · Reportes**                 | `Reporte`, `ReporteAnalisis`                                                                                       | Reportes PDF generados y qué análisis incluye cada uno                                                                                                                              |
| **5 · Auditoría y trazabilidad** | `Bitacora`, `LogInferencia`, `Traslado`, `TrasladoCaso`                                                            | Bitácora inmutable, log técnico de cada inferencia y traslados de casos entre doctores                                                                                              |

## Migraciones (Alembic)

| Migración               | Contenido                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_inicial`          | Las 20 tablas y los tipos enumerados                                                                                                                                                            |
| `0002_restricciones`    | Reglas en la base: rangos (`CHECK`), un solo modelo vigente, bitácora de solo inserción y lectura, seudónimo y caso de un análisis inmutables (triggers) y la secuencia del código del análisis |
| `0003_ajustes_contrato` | Ajustes pedidos por el frontend: etapa del análisis, orden de las regiones, recorrido de bienvenida visto, tipo de traslado `REASIGNACION` e índice único de métricas globales                  |

```bash
alembic upgrade head      # aplicar todas
alembic downgrade base    # deshacer todas (solo en desarrollo)
```

El esquema se crea **solo con Alembic**, nunca con `create_all`.

## Reglas que garantiza la propia base

* **Bitácora inmutable:** solo se puede insertar y consultar; un `UPDATE` o `DELETE` falla (RNF-05).
* **Seudónimo y caso fijos:** un trigger impide cambiar el seudónimo de un caso o el caso de un análisis (RF-D01 CA 13).
* **Un solo modelo vigente** a la vez.
* **Rangos válidos:** probabilidades de 0 a 1, umbrales de 0,10 a 0,90, cajas de regiones de 0 a 1.
* **Código único del análisis** `A-AAAA-NNNNNN`, tomado de una secuencia que nunca se repite (RNF-24).

## Carga inicial

`python -m app.seed` crea los roles, las tres características (atrofia gástrica, gastritis e infección por _H. pylori_), la configuración con umbral global del 50 %, el modelo vigente con la revisión configurada y el primer administrador. Se puede ejecutar varias veces sin duplicar datos.

## Archivos (MinIO)

Los archivos no van en la base de datos; la base guarda solo su clave.

| Prefijo     | Contenido                                         | Duración                                  |
| ----------- | ------------------------------------------------- | ----------------------------------------- |
| `tmp/`      | Imagen recién cargada, antes de crear el análisis | 30 min (MinIO limpia lo que quede al día) |
| `analisis/` | Imagen limpia de cada análisis                    | Permanente                                |
| `mapas/`    | Mapas de calor Grad-CAM de cada región            | Permanente                                |

El navegador nunca recibe una dirección fija: recibe **URL firmadas que vencen a los 5 minutos**.
