export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidDocumento(documento: string): boolean {
  return /^[0-9]{5,20}$/.test(documento);
}
