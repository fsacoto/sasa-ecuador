/**
 * Formato de nombres de persona / cliente (Nombre + Apellido).
 */

/** Capitaliza cada palabra: "juan salazar" → "Juan Salazar". */
export function titleCaseWords(input: string): string {
  const trimmed = String(input || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!trimmed) return '';

  return trimmed
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => {
          if (!part) return part;
          const first = part.charAt(0).toLocaleUpperCase('es-ES');
          const rest = part.slice(1).toLocaleLowerCase('es-ES');
          return `${first}${rest}`;
        })
        .join('-')
    )
    .join(' ');
}

/** Igual que titleCaseWords, pero conserva espacios finales mientras se escribe. */
export function titleCaseWordsInput(input: string): string {
  const value = String(input || '');
  const trailing = value.match(/\s+$/)?.[0] ?? '';
  const core = trailing ? value.slice(0, -trailing.length) : value;
  if (!core.trim()) return trailing;
  return titleCaseWords(core) + trailing;
}

/** Primera palabra = nombre; el resto = apellido(s). */
export function splitClientName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = String(fullName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function joinClientName(firstName: string, lastName: string): string {
  return titleCaseWords([firstName, lastName].filter(Boolean).join(' '));
}

/** Normaliza el nombre completo guardado en el cliente. */
export function normalizeClientDisplayName(name: string): string {
  return titleCaseWords(name);
}
