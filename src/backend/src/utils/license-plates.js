const COUNTRY_PREFIXES = ['FIN', 'SF', 'SWE', 'EST', 'EU'];

export function normalizeLicensePlate(input) {
  if (typeof input !== 'string') return null;
  let cleaned = input.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  for (const prefix of COUNTRY_PREFIXES) {
    if (cleaned.startsWith(prefix)) {
      const rest = cleaned.slice(prefix.length);
      const looksLikePlate = /[0-9]/.test(rest) && /[A-Z]/.test(rest) && rest.length >= 4;
      if (looksLikePlate) cleaned = rest;
    }
  }
  return cleaned || null;
}
