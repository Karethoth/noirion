export function buildAssetUrl(filePath) {
  if (!filePath) return null;

  const base = String(import.meta.env.VITE_API_URL || '');
  if (!base) return String(filePath);

  const p = String(filePath);
  if (base.endsWith('/') && p.startsWith('/')) return `${base.slice(0, -1)}${p}`;
  if (!base.endsWith('/') && !p.startsWith('/')) return `${base}/${p}`;
  return `${base}${p}`;
}
