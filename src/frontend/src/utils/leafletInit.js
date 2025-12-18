import L from 'leaflet';
import { LEAFLET_DEFAULT_MARKER_ICON_URLS } from './externalUrls';

let didInit = false;

export function initLeafletDefaultMarkerIcons() {
  if (didInit) return;
  didInit = true;

  // Fix for default markers in react-leaflet
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions(LEAFLET_DEFAULT_MARKER_ICON_URLS);
}
