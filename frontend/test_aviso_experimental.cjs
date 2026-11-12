// RF-R04 (#108/#177), RNF-22 (#141/#210). Solo componente real, sin servicios.
// node --test test_aviso_experimental.cjs
// QA_FRONTEND_PACKAGE puede apuntar al package.json de una instalación existente.
// SSR no demuestra visibilidad en navegador ni cobertura de pantallas/PDF pendientes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const dependencias = createRequire(process.env.QA_FRONTEND_PACKAGE || path.join(__dirname, 'package.json'));
const ts = dependencias('typescript');
const React = dependencias('react');
const { renderToStaticMarkup } = dependencias('react-dom/server');
const archivo = path.join(__dirname, 'src/components/AvisoExperimental.tsx');
const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const modulo = { exports: {} };
vm.runInNewContext(codigo, {
  module: modulo, exports: modulo.exports,
  require(nombre) {
    if (nombre === './AvisoExperimental.module.css') return { aviso: 'aviso' };
    if (nombre === 'react/jsx-runtime') return dependencias(nombre);
    throw new Error(`Importación no autorizada: ${nombre}`);
  },
}, { filename: archivo });
const AvisoExperimental = modulo.exports.default;
const html = renderToStaticMarkup(React.createElement(AvisoExperimental));
const texto = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

test('RF-R04: incluye la etiqueta obligatoria Análisis experimental', () => {
  assert.ok(texto.includes('Análisis experimental'), `Texto obtenido: ${texto}`);
});

test('RF-R04: incluye el aviso extendido obligatorio', () => {
  assert.ok(texto.includes('Valoración preventiva probabilística experimental. No sustituye el juicio profesional'),
    `Texto obtenido: ${texto}`);
});

test('RNF-22: declara carácter académico y experimental', () => {
  assert.match(texto, /académica y experimental/);
});

test('RNF-22: no se presenta como dispositivo médico ni emisor de diagnósticos', () => {
  assert.match(texto, /No es un dispositivo médico, no emite diagnósticos/);
});

test('RF-R04: el componente no ofrece controles ni manejadores para ocultar el aviso', () => {
  function revisar(elemento) {
    if (!React.isValidElement(elemento)) return;
    assert.equal(typeof elemento.type, 'string', 'Revisar cualquier nuevo componente hijo');
    assert.ok(!['button', 'input', 'select', 'a', 'details'].includes(elemento.type));
    assert.ok(!elemento.props.hidden);
    assert.ok(!elemento.props['aria-hidden']);
    for (const clave of Object.keys(elemento.props)) assert.ok(!/^on[A-Z]/.test(clave));
    React.Children.forEach(elemento.props.children, revisar);
  }
  revisar(AvisoExperimental());
  assert.ok(texto.length > 0);
});

test('RF-R04: la hoja del componente no contiene reglas explícitas para ocultarlo', () => {
  const css = fs.readFileSync(path.join(__dirname, 'src/components/AvisoExperimental.module.css'), 'utf8');
  assert.doesNotMatch(css, /display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\s|;|})/i);
});
