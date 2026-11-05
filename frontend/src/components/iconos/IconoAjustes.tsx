// Ícono/ajustes (Figma 12:601).
import type { PropiedadesIcono } from "./PropiedadesIcono";

export default function IconoAjustes({ className }: PropiedadesIcono) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3.33333 5H10.8333M14.1667 5H16.6667M3.33333 10H5.83333M9.16667 10H16.6667M3.33333 15H12.5M15.8333 15H16.6667" />
      <path d="M14.1667 5C14.1667 5.92047 13.4205 6.66667 12.5 6.66667C11.5795 6.66667 10.8333 5.92047 10.8333 5C10.8333 4.07953 11.5795 3.33333 12.5 3.33333C13.4205 3.33333 14.1667 4.07953 14.1667 5Z" />
      <path d="M9.16667 10C9.16667 10.9205 8.42047 11.6667 7.5 11.6667C6.57953 11.6667 5.83333 10.9205 5.83333 10C5.83333 9.07953 6.57953 8.33333 7.5 8.33333C8.42047 8.33333 9.16667 9.07953 9.16667 10Z" />
      <path d="M15.8333 15C15.8333 15.9205 15.0871 16.6667 14.1667 16.6667C13.2462 16.6667 12.5 15.9205 12.5 15C12.5 14.0795 13.2462 13.3333 14.1667 13.3333C15.0871 13.3333 15.8333 14.0795 15.8333 15Z" />
    </svg>
  );
}
