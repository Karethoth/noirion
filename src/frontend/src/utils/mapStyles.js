export const MAP_STYLES = {
  day: {
    name: 'Day',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  },
  night: {
    name: 'Night',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri'
  }
};

export function ensureMapStyle(style) {
  const s = String(style || '');
  return MAP_STYLES[s] ? s : 'day';
}

export function loadSavedMapStyle(storageKey = 'mapStyle') {
  try {
    const raw = localStorage.getItem(storageKey) || 'day';
    return ensureMapStyle(raw);
  } catch {
    return 'day';
  }
}

export function saveMapStyle(style, storageKey = 'mapStyle') {
  try {
    const s = ensureMapStyle(style);
    localStorage.setItem(storageKey, s);
    return s;
  } catch {
    return ensureMapStyle(style);
  }
}
