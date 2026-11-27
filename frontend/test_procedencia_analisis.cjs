// Tarjeta «Procedencia de este análisis» (W-17b, sin maqueta en Figma). Solo el componente
// real, sin servicios.
//   node --test test_procedencia_analisis.cjs
// QA_FRONTEND_PACKAGE puede apuntar al package.json de una instalación existente.
//
// Por qué se prueba aquí y no a mano: de las cuatro combinaciones de `es_propio` × `trasladado`
// solo dos se pueden producir desde la API. `services/analisis.py` consulta el traslado únicamente
// cuando el ejecutor no es quien consulta, así que `es_propio: true` con traslado no se puede
// pedir al servidor; y `es_propio: false` sin traslado tampoco aparece con los datos actuales.
// El tipo declara las dos condiciones independientes y el componente las implementa así: esta
// prueba es el único sitio donde eso se comprueba.
//
// SSR no demuestra la apariencia en el navegador; comprueba el texto y la estructura.
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

// `react-router` solo aporta `Link` a la cadena de imports (TablaCasosRecibidos), y ninguna
// prueba lo renderiza: se sustituye para no depender del formato del módulo publicado.
const SUSTITUTOS = { 'react-router': { Link: 'a', Navigate: 'div' } };
const cargados = new Map();

/** Carga un módulo .ts/.tsx del proyecto transpilándolo, con sus imports relativos. */
function cargar(archivo) {
  if (cargados.has(archivo)) return cargados.get(archivo);
  const codigo = ts.transpileModule(fs.readFileSync(archivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const modulo = { exports: {} };
  cargados.set(archivo, modulo.exports);
  vm.runInNewContext(codigo, {
    module: modulo, exports: modulo.exports,
    require(nombre) {
      // Los CSS Modules devuelven el nombre de la clase pedida: basta para comprobar estructura.
      if (nombre.endsWith('.module.css')) return new Proxy({}, { get: (_, clave) => String(clave) });
      if (nombre in SUSTITUTOS) return SUSTITUTOS[nombre];
      if (nombre === 'react' || nombre === 'react/jsx-runtime') return dependencias(nombre);
      if (nombre.startsWith('.')) {
        const base = path.resolve(path.dirname(archivo), nombre);
        for (const extension of ['.tsx', '.ts']) {
          if (fs.existsSync(base + extension)) return cargar(base + extension);
        }
      }
      throw new Error(`Importación no autorizada: ${nombre}`);
    },
  }, { filename: archivo });
  cargados.set(archivo, modulo.exports);
  return modulo.exports;
}

const ProcedenciaAnalisis = cargar(path.join(__dirname, 'src/pages/ProcedenciaAnalisis.tsx')).default;

const MARCELA = { nombre: 'Marcela', apellido: 'Díaz' };
const ANA = { nombre: 'Ana', apellido: 'Pérez' };
const FECHA = '2026-10-19T15:42:00Z';

function pintar(realizadoPor, trasladado) {
  return renderToStaticMarkup(React.createElement(ProcedenciaAnalisis, { realizadoPor, trasladado }));
}

function texto(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const ejecutor = (persona, propio, eliminada = false) => ({ ...persona, es_propio: propio, cuenta_eliminada: eliminada });
const traslado = (persona, eliminada = false, fecha = FECHA) => ({ desde: persona, cuenta_eliminada: eliminada, fecha });

// --------------------------------------------- las cuatro combinaciones de la tabla

test('propio y sin traslado: no se pinta nada, ni sección ni título ni contenedor vacío', () => {
  const html = pintar(ejecutor(MARCELA, true), null);
  assert.equal(html, '', `HTML obtenido: ${html}`);
  assert.equal(ProcedenciaAnalisis({ realizadoPor: ejecutor(MARCELA, true), trasladado: null }), null);
});

test('ajeno y con traslado: los dos datos, cada uno con su nombre y sin mezclarlos', () => {
  const contenido = texto(pintar(ejecutor(MARCELA, false), traslado(ANA)));
  assert.match(contenido, /Realizado por Marcela Díaz/);
  assert.match(contenido, /Recibido de Ana Pérez/);
  // El día y la hora son los de la zona del navegador, a propósito (ver `utils/fechas.ts`), así
  // que la prueba comprueba el formato y no un valor que dependa de dónde se ejecute.
  assert.match(contenido, /Trasladado el \d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
  // Trampa 3: ninguna frase atribuye el traslado al ejecutor ni la ejecución a quien trasladó.
  assert.ok(!/Marcela Díaz\s*(,|que|y)?\s*(se lo|le)?\s*traslad/i.test(contenido), contenido);
  assert.ok(!/Trasladado por Marcela/i.test(contenido), contenido);
  assert.ok(!/Recibido de Marcela/i.test(contenido), contenido);
  assert.ok(!/Realizado por Ana/i.test(contenido), contenido);
  // Cada nombre aparece una sola vez: no hay una segunda redacción que los junte.
  assert.equal(contenido.match(/Marcela/g).length, 1, contenido);
  assert.equal(contenido.match(/Ana/g).length, 1, contenido);
});

test('ajeno y sin traslado: solo quién lo realizó (no lo emite la API hoy; el tipo lo permite)', () => {
  const contenido = texto(pintar(ejecutor(MARCELA, false), null));
  assert.match(contenido, /Realizado por Marcela Díaz/);
  assert.ok(!/Recibido de/.test(contenido), contenido);
  assert.ok(!/Trasladado el/.test(contenido), contenido);
});

test('propio y con traslado: solo el traslado (lo impide el servicio hoy; se implementa igual)', () => {
  const contenido = texto(pintar(ejecutor(MARCELA, true), traslado(ANA)));
  assert.ok(!/Realizado por/.test(contenido), contenido);
  assert.ok(!/Marcela/.test(contenido), contenido);
  assert.match(contenido, /Recibido de Ana Pérez/);
  assert.match(contenido, /Trasladado el \d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
});

// --------------------------------------------- reglas que sostienen esas combinaciones

test('las dos banderas de cuenta eliminada son independientes', () => {
  const contenido = texto(pintar(ejecutor(MARCELA, false, true), traslado(ANA, false)));
  assert.match(contenido, /Realizado por Marcela Díaz \(cuenta eliminada\)/);
  assert.match(contenido, /Recibido de Ana Pérez(?! \(cuenta)/);

  const alRevés = texto(pintar(ejecutor(MARCELA, false, false), traslado(ANA, true)));
  assert.match(alRevés, /Realizado por Marcela Díaz(?! \(cuenta)/);
  assert.match(alRevés, /Recibido de Ana Pérez \(cuenta eliminada\)/);
});

test('una fecha inválida no deja un «Trasladado el» colgando', () => {
  const contenido = texto(pintar(ejecutor(MARCELA, false), traslado(ANA, false, 'no es una fecha')));
  assert.match(contenido, /Recibido de Ana Pérez/);
  assert.ok(!/Trasladado el/.test(contenido), contenido);
});

test('la tarjeta es una sección con su propio h2, sin saltarse niveles', () => {
  const html = pintar(ejecutor(MARCELA, false), traslado(ANA));
  assert.match(html, /<section[^>]*aria-labelledby="titulo-procedencia"/);
  assert.match(html, /<h2 id="titulo-procedencia"[^>]*>Procedencia de este análisis<\/h2>/);
  assert.ok(!/<h1|<h3/.test(html), html);
});
