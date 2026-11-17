// El QR de vinculación llega como PNG en Base64 sin el prefijo `data:`. Antes de armar la URL se
// valida que de verdad sea Base64 y un PNG: así nada que no sea una imagen llega a un <img>.
const FIRMA_PNG_BASE64 = "iVBORw0KGgo"; // los 8 primeros bytes de un PNG, en Base64

/** `data:image/png;base64,…` si el texto es un PNG en Base64 válido; `null` si no. */
export function urlDeQrPng(base64: string): string | null {
  const esBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length % 4 === 0;
  if (!esBase64 || !base64.startsWith(FIRMA_PNG_BASE64)) return null;
  return `data:image/png;base64,${base64}`;
}
