# RNF-08 — verificación de confirmaciones antes de acciones críticas

Fecha: 2026-11-27
Rama: `testing/qa-branch`
SHA: `6442125527457a5879c7e08d5a2cbd704e8db01c`

## Casos revisados

- Restablecer contraseña y reenviar credencial temporal.
- Desactivar o eliminar una cuenta.
- Reasignar los casos activos de una cuenta.
- Guardar cambios de parámetros de inferencia.
- Componente compartido de diálogo de confirmación.

## Evidencia

El verificador estructural `check_rnf08_confirmations.cjs` comprueba que las acciones anteriores estén ligadas al callback de confirmación y que cancelar solo cierre/limpie el diálogo. Comprueba también que no se use `window.confirm` nativo en las pantallas críticas.

Resultado: **8/8 comprobaciones aprobadas**. SHA-256 del verificador: `3f42f03dfcf5394b2783792b90710d75ef436f7ee2da9907c5fa72a7de3750ed`.

`pnpm --dir frontend build`: TypeScript y Vite aprobaron.

## Límite

No se ejecutó E2E autenticado en navegador porque el daemon Docker no estaba disponible. La aceptación de este caso se verificó por inspección ejecutable de los callbacks y compilación; el verificador no simula clics ni comprueba efectos en un backend vivo.
