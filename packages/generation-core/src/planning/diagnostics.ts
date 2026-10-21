/** Error codes cross Plugin API/VM/Proxy realms. Do not leak arbitrary exception
 * text or file contents into a structured code field. */
export function generationErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown };
    for (const code of [value.code,value.message]) if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,95}$/.test(code)) return code;
  }
  return fallback;
}
