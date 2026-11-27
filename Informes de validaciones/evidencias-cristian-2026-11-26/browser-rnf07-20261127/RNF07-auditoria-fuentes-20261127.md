# RNF-07 — auditoría de interfaz en español

Fecha: 2026-11-27
Rama auditada: `testing/qa-branch`
SHA integrado: `6442125527457a5879c7e08d5a2cbd704e8db01c`

## Alcance y método

Se revisaron textos estáticos de `frontend/src/**/*.{ts,tsx}`: contenido JSX, atributos accesibles (título, texto alternativo, etiqueta, placeholder) y literales que alimentan los componentes. Un barrido de términos ingleses produjo 121 coincidencias candidatas; la revisión las clasificó como rutas/nombres internos (`/dashboard`, `/logs-tecnicos`), tipos HTML y atributos ARIA (`password`, `status`, `search`), teclas (`Home`), identificadores de componentes/roles, o palabras españolas como «doctor» y «activo». Ninguna coincidencia restante es una etiqueta visible en inglés.

La revisión detectó y corrigió los textos visibles «Dashboard», «Logs técnicos» y «model card» en menús, páginas y recorrido guiado. En el código de manejo de errores, los mensajes que se presentan al usuario están redactados en español; ante fallos inesperados se muestra el aviso genérico localizado y no el detalle interno del servidor.

## Cambios integrados

- PR #324, merge SHA `6805c740c796fad3f410e3c34c564c5971382f70`: etiquetas «Panel de control», «Panel técnico», «Registros técnicos» y «ficha del modelo».
- PR #325, merge SHA `6442125527457a5879c7e08d5a2cbd704e8db01c`: títulos y descripciones del recorrido del doctor y administrador traducidos.

## Verificación

- `pnpm build` (TypeScript y Vite): aprobado.
- `node --test test_aviso_experimental.cjs`: 6/6 aprobadas.
- `git diff --check`: limpio.
- Actions PR #325, ejecución `46012693519`: backend, frontend y umbral de cobertura global, todos verdes.

## Resultado y límite

El criterio de RNF-07 sobre textos estáticos de la interfaz se cumple en el código de la rama auditada. No se hizo una sesión E2E autenticada en navegador en esta ejecución: Docker no estaba disponible (socket `/home/willian/.docker/desktop/docker.sock` ausente). El chequeo de idioma se realizó sobre las fuentes y los mensajes de error, y la compilación de producción confirmó que el código auditado compila.
