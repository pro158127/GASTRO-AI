// Campo de «Código de 6 dígitos» del segundo factor (Figma 13:705, variante del campo de texto):
// un solo campo que admite pegar. Solo deja dígitos (quita espacios y cualquier otro carácter) y
// corta a 6. No usa `maxLength`: truncaría «123 456» antes de poder quitar el espacio.
import CampoTexto from "./CampoTexto";
import type { PropiedadesCampoTexto } from "./CampoTexto";

export const LONGITUD_CODIGO = 6;

export function normalizarCodigo(texto: string): string {
  return texto.replace(/\D/g, "").slice(0, LONGITUD_CODIGO);
}

interface PropiedadesCampoCodigo
  extends Omit<PropiedadesCampoTexto, "type" | "value" | "onChange" | "inputMode" | "autoComplete"> {
  value: string;
  /** Recibe el código ya normalizado. */
  onChange: (codigo: string) => void;
}

export default function CampoCodigo({ value, onChange, ...resto }: PropiedadesCampoCodigo) {
  return (
    <CampoTexto
      {...resto}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoCapitalize="none"
      spellCheck={false}
      value={value}
      onChange={(evento) => onChange(normalizarCodigo(evento.target.value))}
    />
  );
}
