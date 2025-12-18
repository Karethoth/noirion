export function normalizePlate(plate) {
  if (typeof plate !== 'string') return null;
  let cleaned = plate.toUpperCase().replace(/[^A-Z0-9-]/g, '');

  for (const prefix of ['FIN', 'SF', 'SWE', 'EST', 'EU']) {
    if (cleaned.startsWith(prefix)) {
      const rest = cleaned.slice(prefix.length);
      const looksLikePlate = /[0-9]/.test(rest) && /[A-Z]/.test(rest) && rest.length >= 4;
      if (looksLikePlate) cleaned = rest;
    }
  }

  return cleaned || null;
}
