const fs = require("node:fs");

const files = {
  dialog: fs.readFileSync("frontend/src/components/DialogoConfirmacion.tsx", "utf8"),
  cuenta: fs.readFileSync("frontend/src/pages/DetalleCuenta.tsx", "utf8"),
  reasignar: fs.readFileSync("frontend/src/pages/ReasignarCasos.tsx", "utf8"),
  parametros: fs.readFileSync("frontend/src/pages/ParametrosInferencia.tsx", "utf8"),
  pendientes: fs.readFileSync("frontend/src/pages/CuentasPendientes.tsx", "utf8"),
};

const checks = [
  ["El botón cancelar ejecuta únicamente onCancelar", /onClick=\{onCancelar\}/.test(files.dialog)],
  ["Restablecimiento de contraseña tiene diálogo y cancelación sin mutación", /dialogo === "contrasena"/.test(files.cuenta) && /onCancelar=\{\(\) => setDialogo\(null\)\}/.test(files.cuenta) && /onConfirmar=\{confirmarContrasena\}/.test(files.cuenta)],
  ["Desactivación tiene diálogo y cancelación sin mutación", /dialogo === "desactivar"/.test(files.cuenta) && /onConfirmar=\{\(\) => void ejecutarBaja\("DESACTIVACION"\)\}/.test(files.cuenta) && /onCancelar=\{\(\) => setDialogo\(null\)\}/.test(files.cuenta)],
  ["Eliminación tiene diálogo y cancelación sin mutación", /dialogo === "eliminar"/.test(files.cuenta) && /onConfirmar=\{\(\) => void ejecutarBaja\("ELIMINACION"\)\}/.test(files.cuenta) && /onCancelar=\{\(\) => setDialogo\(null\)\}/.test(files.cuenta)],
  ["Reasignación tiene diálogo con acciones separadas", /onConfirmar=\{\(\) => void confirmarReasignacion\(origen, casos\)\}/.test(files.reasignar) && /onCancelar=\{\(\) => setConfirmando\(false\)\}/.test(files.reasignar)],
  ["Cambio de parámetros tiene diálogo y cancelación sin guardar", /onConfirmar=\{\(\) => void guardar\(\)\}/.test(files.parametros) && /onCancelar=\{\(\) => setConfirmacion\(false\)\}/.test(files.parametros)],
  ["Reenvío de credencial temporal tiene diálogo", /DialogoConfirmacion/.test(files.pendientes) && /onConfirmar=\{\(\) => void confirmarReenvio\(confirmando\)\}/.test(files.pendientes)],
  ["No hay window.confirm nativo en pantallas", !["frontend/src/pages/DetalleCuenta.tsx", "frontend/src/pages/ReasignarCasos.tsx", "frontend/src/pages/CuentasPendientes.tsx"].some((file) => /window\.confirm/.test(fs.readFileSync(file, "utf8")))],
];

for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
console.log(`RESULT ${checks.filter(([, passed]) => passed).length}/${checks.length}`);
if (checks.some(([, passed]) => !passed)) process.exit(1);
