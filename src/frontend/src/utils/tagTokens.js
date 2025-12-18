export function parseTagTokens(raw) {
  return (raw || '')
    .split(/[\s,]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toLowerCase());
}

export function normalizeToken(token) {
  return String(token || '').trim();
}

export function addTagTokenToInput(current, tag) {
  const t = normalizeToken(tag);
  if (!t) return current || '';
  const cur = (current || '').trim();
  if (!cur) return t;
  const hasTrailingSep = /[\s,]$/.test(cur);
  return hasTrailingSep ? `${cur}${t}` : `${cur}, ${t}`;
}

export function formatTagDisplay(tag) {
  if (!tag) return '';
  const t = String(tag);
  return t.startsWith('general:') ? t.slice(8) : t;
}
