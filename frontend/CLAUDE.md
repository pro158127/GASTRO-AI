# Instrucciones para Claude Code · Frontend de Gastro-AI

@../AGENTS.md

Proyecto académico ONCO-AI_USC 2026B, módulo Gastro-AI (equipo Ragnar Tech, Universidad
Santiago de Cali). Este equipo es responsable **solo del frontend**. El backend, la
infraestructura y el modelo son de otros integrantes.

Contrato de la API y estructura del frontend: `../ARCHITECTURE.md`, secciones 3.5 y 4.
Léelas antes de tocar `src/services/` o `src/types/`.

## 1. Alcance: qué se puede modificar

- Solo se crean o modifican archivos dentro de `frontend/`.
- Nunca se modifican: `../backend/`, `../docker-compose.yml`, `../nginx.conf`, `../.env*`,
  `../AGENTS.md` ni `../ARCHITECTURE.md`.
- Si un cambio fuera de `frontend/` parece necesario, no lo hagas: explica el problema y
  redacta la propuesta para que el usuario la lleve al equipo del backend.
- No ejecutes `docker compose down -v` (borra la base de datos y las imágenes).
- No hagas `git push`, ni abras pull requests, ni hagas merge sin que el usuario lo pida.

## 2. Idioma

- Todo lo propio va en español: textos de la interfaz, nombres de componentes, funciones,
  variables, tipos, clases y variables CSS, comentarios y mensajes de commit.
- Se conservan en su idioma original los identificadores externos: APIs de React y del
  navegador, atributos HTML y ARIA, nombres de librerías y los campos JSON que define el
  backend (por ejemplo `access_token`, `tipo_documento`).
- Se mantienen los nombres de carpeta que ya existen (`pages`, `services`, `types`,
  `utils`, `components`) porque son convención del equipo; lo nuevo dentro de ellas va en
  español.

## 3. Fuente del diseño: Figma

- Archivo: `https://www.figma.com/design/sjaYoAS0aItWKV5uHKNViV/` (file key
  `sjaYoAS0aItWKV5uHKNViV`). Se accede con el conector «claude.ai Figma».
- Cada pantalla tiene un código (W-01, W-06a, D-03, M-06…) que **no se renumera**. Usa ese
  código en el nombre del archivo o en un comentario de cabecera: `// Pantalla W-06a`.
- Antes de construir una pantalla: carga la guía `figma-design-to-code`, lee el frame con
  `get_design_context` y adapta el resultado a este proyecto. El código que devuelve Figma
  es una referencia, no código final.
- Cada pantalla tiene una nota debajo con sus requisitos (RF, RNF) y decisiones. Léela.
- No construyas nada que no esté en Figma. Si el diseño y el código o la API se
  contradicen, detente y pregunta.
- Todos los estados dibujados (carga, vacío, error, sin permisos, diálogos) se
  implementan; no se inventan estados que no estén dibujados.
- **Presupuesto de Figma:** el plan permite 200 llamadas por día y 10 por minuto. Haz las
  llamadas una por una, nunca en paralelo, y no repitas lecturas de un frame ya leído en
  la misma tarea.

## 4. Sistema visual

- Los tokens de Figma se pasan a variables CSS con el mismo nombre que tienen en Figma
  (por ejemplo `var(--color-texto-primario)`). No escribas colores, espacios ni radios
  sueltos en los componentes.
- Fuente Inter. Solo modo claro.
- Tamaños de referencia: escritorio 1440 px, tableta 768 px, celular 390 px. A 320 px no
  debe haber desplazamiento horizontal (WCAG 1.4.10).

## 5. Accesibilidad (WCAG 2.2 AA)

- Toda entrada tiene etiqueta visible; el placeholder no la reemplaza.
- Los errores llevan ícono y texto que dice cómo corregir, y no borran lo escrito.
- El color nunca es la única señal (por ejemplo, el umbral se indica también con texto).
- Foco siempre visible: anillo azul de 2 px con separación; en la barra lateral, blanco.
- Objetivos táctiles de al menos 24 × 24 px; en celular, 44 px.
- Diálogos con `role="dialog"`, foco atrapado, Esc para cerrar y foco devuelto al cerrar.
- Mensajes de estado con `role="status"` o `aria-live`. La mascota es decorativa: `alt=""`.
- El aviso experimental es fijo y no se puede cerrar.
- Respeta `prefers-reduced-motion`.

## 6. Seguridad

- No uses `dangerouslySetInnerHTML` ni construyas HTML con cadenas.
- El número de documento del paciente nunca va en la URL, en `localStorage`, en
  `sessionStorage`, en la consola ni en registros. Solo vive en memoria del estado.
- No escribas `console.log` con datos de pacientes, tokens o respuestas de la API.
- Campos de contraseña: se permite pegar, gestores de contraseñas y botón «Mostrar».
- El error de inicio de sesión es genérico: no dice si falló el correo o la contraseña.
- La validación del cliente es solo ayuda; la autoridad es el servidor.
- **Única excepción de almacenamiento en el navegador:** la marca booleana de «cierre de
  sesión pendiente» (`gastroai_cierre_pendiente` en `sessionStorage`, ver
  `src/sesion/cierrePendiente.ts`). Con la cookie HttpOnly solo el servidor borra la
  sesión; si `POST /auth/logout` falla, la marca hace que al cargar la aplicación se
  reintente el cierre antes de consultar `GET /auth/sesion`, y se borra solo cuando el
  servidor responde 204. No contiene ningún dato personal. No se guarda nada más en
  `localStorage` ni en `sessionStorage`.
- El token hoy se guarda en `localStorage` (código existente). No amplíes ese uso; la
  migración a cookie HttpOnly es una decisión pendiente con el backend.
- **No agregues dependencias** (ni `pnpm add`) sin aprobación explícita del usuario. Si
  hace falta una, explica para qué y qué alternativa sin dependencia existe.
- Las únicas dependencias aprobadas son `react-router` (en modo declarativo o de datos,
  nunca en modo framework ni SSR) y `@fontsource-variable/inter`. Se instalan con versión
  exacta (`--save-exact`).
- Toda dependencia nueva se audita con `pnpm audit --prod` antes del commit.

## 7. API

- Solo existen los endpoints de `../ARCHITECTURE.md` § 3.5 y el WebSocket de § 3.9.
- No inventes endpoints ni formatos de respuesta. Si una pantalla necesita datos que la API
  todavía no entrega, detente y pregunta antes de continuar.
- Todas las llamadas pasan por `src/services/`; los componentes no llaman a `fetch`.

### Datos simulados

Excepción a la regla anterior: las pantallas cuyo endpoint todavía no existe se construyen
con datos simulados, con estas reglas:

- Van aislados en `src/services/simulados/`. Cada función simulada tiene la misma firma que
  tendrá la real, de modo que pasar a la API se hace cambiando el import en `src/services/`
  sin tocar las pantallas.
- Cada función simulada lleva un comentario que dice qué endpoint falta:
  `// SIMULADO: falta endpoint POST /api/...`.
- Los datos son ficticios y coherentes con los ejemplos de Figma. Nunca son datos reales.
- Cada formato de datos que se proponga se documenta en `CONTRATOS_API.md` (en esta
  carpeta) para entregárselo al equipo del backend. Mientras el backend no lo confirme,
  es una propuesta, no un endpoint existente.

## 8. Forma de trabajar

- Una pantalla o un grupo pequeño de estados por tarea.
- Empieza en modo plan: lee, propone y espera aprobación antes de editar.
- Antes de dar una tarea por terminada, `pnpm build` debe pasar sin errores (ejecuta
  `tsc --noEmit` y `vite build`).
- Commits pequeños, en español, con el formato del repositorio:
  `feat(frontend): pantalla W-01 inicio de sesión`.
- Al terminar, resume qué archivos cambiaste y cómo probarlo en el navegador.
