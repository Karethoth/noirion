export function loadSavedMapView(storageKey = 'mapView') {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const view = JSON.parse(raw);
    if (!view?.center || typeof view?.zoom !== 'number') return null;

    const { center } = view;
    if (typeof center.lat !== 'number' || typeof center.lng !== 'number') return null;

    return view;
  } catch {
    return null;
  }
}

export function saveMapView(view, storageKey = 'mapView') {
  try {
    if (!view || typeof view !== 'object') return;
    localStorage.setItem(storageKey, JSON.stringify(view));
  } catch {
    // ignore
  }
}
